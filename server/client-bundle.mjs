// The bundled client (design 088): which files `scripts/build-client.mjs` wrote, and whether this
// server should serve them instead of the ~770 source files.
//
// The bundle is opt-in by environment, never by "the folder exists": a developer who ran
// `pnpm build` once and then edited the source must keep seeing the source.
import fs from 'node:fs';
import path from 'node:path';

export const BUNDLE_DIR_NAME = 'dist';
export const BUNDLE_URL_PREFIX = `/${BUNDLE_DIR_NAME}/`;
export const BUNDLE_MANIFEST_FILE = 'manifest.json';

const isOn = (value) => /^(1|true|on|yes)$/i.test(String(value ?? '').trim());
const isOff = (value) => /^(0|false|off|no)$/i.test(String(value ?? '').trim());

/** True on a host that deploys the site: Render sets `RENDER`; anything else sets NODE_ENV. */
export function isDeployHost(env = {}) {
  return isOn(env.RENDER) || env.NODE_ENV === 'production';
}

/** `CLIENT_BUNDLE=1|0` decides; unset, a deploy host serves the bundle and a dev machine does not. */
export function wantsClientBundle(env = {}) {
  if (isOn(env.CLIENT_BUNDLE)) return true;
  if (isOff(env.CLIENT_BUNDLE)) return false;
  return isDeployHost(env);
}

const isBundleUrl = (value) =>
  typeof value === 'string' && value.startsWith(BUNDLE_URL_PREFIX) && !value.includes('..');

/** @returns {{script: string, style: string}|null} the manifest, or null when malformed. */
export function validateBundleManifest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { script, style } = raw;
  if (!isBundleUrl(script) || !isBundleUrl(style)) return null;
  return { script, style };
}

/**
 * esbuild metafile outputs → the manifest the page template reads: the one script and the one
 * stylesheet the build wrote, by URL.
 * @param {{outputs: Record<string, {entryPoint?: string}>, toUrl: (outputPath: string) => string}} input
 */
export function bundleManifestFromMetafile({ outputs, toUrl }) {
  const entries = Object.keys(outputs ?? {}).filter((file) => outputs[file]?.entryPoint);
  const script = entries.find((file) => file.endsWith('.js'));
  const style = entries.find((file) => file.endsWith('.css'));
  if (!script || !style) {
    throw new Error('client bundle: the build produced no entry script or no entry stylesheet');
  }
  return { script: toUrl(script), style: toUrl(style) };
}

/**
 * The bundle this server should serve, or null to serve the source files.
 * A missing, unreadable or incomplete bundle is reported and falls back to the source: the site
 * stays up, only slower.
 * @param {{clientDir: string, env?: object, warn?: (message: string) => void}} options
 */
export function loadClientBundle({ clientDir, env = {}, warn = () => {} }) {
  if (!wantsClientBundle(env)) return null;
  const distDir = path.join(clientDir, BUNDLE_DIR_NAME);
  const manifestPath = path.join(distDir, BUNDLE_MANIFEST_FILE);
  let manifest;
  try {
    manifest = validateBundleManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
  } catch (error) {
    warn(`client bundle: ${manifestPath} unreadable (${error.code ?? error.message}); run \`pnpm build\`. Serving source files.`);
    return null;
  }
  if (!manifest) {
    warn(`client bundle: ${manifestPath} is malformed; run \`pnpm build\`. Serving source files.`);
    return null;
  }
  const missing = [manifest.script, manifest.style].find(
    (url) => !fs.existsSync(path.join(distDir, url.slice(BUNDLE_URL_PREFIX.length)))
  );
  if (missing) {
    warn(`client bundle: ${missing} is missing; run \`pnpm build\`. Serving source files.`);
    return null;
  }
  return manifest;
}
