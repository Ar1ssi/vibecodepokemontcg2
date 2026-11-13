// Bundles the page's JavaScript and CSS into content-hashed files under client/dist/ (design 088).
// Unbundled, the page fetches ~720 modules and ~50 stylesheets on every load; bundled, it fetches a
// handful of files the browser may keep for a year, because a changed file gets a new name.
//
//   pnpm build                      build client/dist/
//   node scripts/build-client.mjs --if-deploy
//                                   build only on a deploy host (the root `postinstall` hook)
//
// The server serves the bundle only when it is asked to (server/client-bundle.mjs), so a stale
// client/dist/ on a development machine is never served by accident.
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BUNDLE_MANIFEST_FILE,
  BUNDLE_URL_PREFIX,
  bundleManifestFromMetafile,
  isDeployHost,
} from '../server/client-bundle.mjs';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The roots the server exposes: URL prefix → directory (server.js `express.static` mounts). */
const servedRoots = (rootDir) => [
  { prefix: '/shared/', dir: path.join(rootDir, 'shared') },
  { prefix: '/', dir: path.join(rootDir, 'client') },
];

const toPosix = (filePath) => filePath.split(path.sep).join('/');

/** @returns {string|null} the URL the unbundled server serves this file at, or null when it serves none. */
export function servedUrlFor(filePath, rootDir = repoDir) {
  for (const { prefix, dir } of servedRoots(rootDir)) {
    const relative = path.relative(dir, filePath);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return prefix + toPosix(relative);
    }
  }
  return null;
}

/** @returns {string|null} the file a root-absolute import (`/shared/…`, `/src/…`) names, or null. */
export function fileForServedUrl(url, rootDir = repoDir) {
  if (url.startsWith('/shared/')) return path.join(rootDir, 'shared', url.slice('/shared/'.length));
  if (url.startsWith('/src/')) return path.join(rootDir, 'client', url.slice(1));
  return null;
}

const IMPORT_META_URL = /\bimport\.meta\.url\b/g;
const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * Keeps the source working from a different URL than it was written for:
 * - root-absolute imports (`/shared/engine/…`) resolve to the directory the server mounts there;
 * - `three` resolves to the vendored build the page's import map names;
 * - `import.meta.url` becomes the module's unbundled URL, so `new URL('../x', import.meta.url)`
 *   still points at the same asset;
 * - `url(...)` in CSS becomes the asset's root-absolute URL, and the asset is not copied.
 */
export function servedPathsPlugin(rootDir = repoDir) {
  const threeEntry = path.join(rootDir, 'client', 'src', 'vendor', 'three', 'three.module.min.js');
  return {
    name: 'served-paths',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^three$/ }, () => ({ path: threeEntry }));
      pluginBuild.onResolve({ filter: /^\/(?:shared|src)\// }, (args) => {
        // The entry point is a file path; a checkout under /src/… must not be read as an import.
        if (args.kind === 'entry-point') return null;
        if (args.kind === 'url-token') return { path: args.path, external: true };
        const file = fileForServedUrl(args.path, rootDir);
        return file ? { path: file } : null;
      });
      pluginBuild.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind !== 'url-token' || EXTERNAL_URL.test(args.path)) return null;
        const [, pathname, suffix] = /^([^?#]*)(.*)$/.exec(args.path);
        const served = servedUrlFor(path.resolve(args.resolveDir, pathname), rootDir);
        if (!served) {
          return { errors: [{ text: `url(${args.path}) points outside the served folders` }] };
        }
        return { path: served + suffix, external: true };
      });
      pluginBuild.onLoad({ filter: /\.m?js$/ }, async (args) => {
        const source = await fs.readFile(args.path, 'utf8');
        if (!source.includes('import.meta.url')) return null;
        const served = servedUrlFor(args.path, rootDir);
        if (!served) return null;
        const replacement = `new URL(${JSON.stringify(served)}, location.href).href`;
        return { contents: source.replace(IMPORT_META_URL, replacement), loader: 'js' };
      });
    },
  };
}

const describeMessage = ({ text, location }) =>
  location ? `${location.file}:${location.line}:${location.column}: ${text}` : text;

/**
 * Builds the bundle and writes its manifest.
 * @param {{rootDir?: string, outDir?: string, minify?: boolean}} [options]
 * @returns {Promise<{manifest: object, outDir: string, warnings: string[], files: {file: string, bytes: number}[]}>}
 *   `warnings` are esbuild's (a CSS rule it could not parse, say): the build still succeeds.
 */
export async function buildClient({ rootDir = repoDir, outDir, minify = true } = {}) {
  // Imported here, not at the top: the `postinstall` hook must be a no-op that cannot fail on a
  // development machine.
  const { build } = await import('esbuild');
  const clientDir = path.join(rootDir, 'client');
  const target = outDir ?? path.join(clientDir, 'dist');
  const shared = {
    // Paths in comments and source maps are relative to the repo, wherever the build is started.
    absWorkingDir: rootDir,
    bundle: true,
    outdir: target,
    entryNames: '[name]-[hash]',
    metafile: true,
    sourcemap: true,
    logLevel: 'silent',
    // Code that also runs under node guards these at run time (catalog-loader.mjs).
    external: ['node:*'],
    plugins: [servedPathsPlugin(rootDir)],
  };
  // Both builds finish before a failure is raised, so nothing is still writing when the caller
  // reacts; and the old bundle is only removed once the new one is whole (a server keeps serving it).
  const [scriptBuild, styleBuild] = await Promise.allSettled([
    build({
      ...shared,
      entryPoints: { app: path.join(clientDir, 'src', 'front-end.js') },
      format: 'esm',
      minify,
      // Names are read at run time (error messages, class names in logs).
      keepNames: true,
    }),
    build({
      ...shared,
      entryPoints: { app: path.join(clientDir, 'src', 'css', 'index.css') },
      // Whitespace only: the sheets lean on new CSS the minifier's rewrites were never checked against.
      minifyWhitespace: minify,
    }),
  ]);
  const failed = [scriptBuild, styleBuild].find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  const script = scriptBuild.value;
  const style = styleBuild.value;
  const manifest = bundleManifestFromMetafile({
    outputs: { ...script.metafile.outputs, ...style.metafile.outputs },
    toUrl: (outputPath) =>
      BUNDLE_URL_PREFIX + toPosix(path.relative(target, path.resolve(rootDir, outputPath))),
  });
  await fs.writeFile(path.join(target, BUNDLE_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  const written = new Set([
    BUNDLE_MANIFEST_FILE,
    ...Object.keys({ ...script.metafile.outputs, ...style.metafile.outputs }).map((file) => path.basename(file)),
  ]);
  const stale = (await fs.readdir(target)).filter((name) => !written.has(name));
  await Promise.all(stale.map((name) => fs.rm(path.join(target, name), { recursive: true, force: true })));
  const names = [...written].filter((name) => !name.endsWith('.map'));
  const files = await Promise.all(
    names.map(async (file) => ({ file, bytes: (await fs.stat(path.join(target, file))).size }))
  );
  const warnings = [...script.warnings, ...style.warnings].map(describeMessage);
  return { manifest, outDir: target, warnings, files };
}

async function main(argv) {
  if (argv.includes('--if-deploy') && !isDeployHost(process.env)) return;
  const started = Date.now();
  const { files, outDir, warnings } = await buildClient();
  for (const warning of warnings) console.warn(`client bundle warning: ${warning}`);
  const size = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
  for (const { file, bytes } of files) console.log(`  ${file}  ${size(bytes)}`);
  console.log(`client bundle: ${path.relative(repoDir, outDir)} in ${Date.now() - started} ms`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    const details = (error?.errors ?? []).map(describeMessage);
    console.error(['client bundle failed:', ...(details.length ? details : [error?.message ?? error])].join('\n  '));
    process.exit(1);
  });
}
