/**
 * Vendor the three.js files the 3D packs (design 055), the board (074) and its attack-FX bloom
 * (075) load from the pinned devDependency into client/src/vendor/three/. The browser has no bundler: it loads these copies
 * through the import map in client/index.ejs.
 * Run: node scripts/vendor-three.mjs          (copies the files)
 *      node scripts/vendor-three.mjs --check  (exit 1 when a vendored file differs from the package)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 0.185.0 is the last release that ships three.core.min.js / three.module.min.js (design 055 § Options 2).
export const THREE_VERSION = '0.185.0';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE_DIR = join(ROOT, 'node_modules/three');
export const VENDOR_DIR = join(ROOT, 'client/src/vendor/three');

/** Vendored file name → its path inside the three package. */
export const VENDORED_FILES = {
  'three.core.min.js': 'build/three.core.min.js',
  'three.module.min.js': 'build/three.module.min.js',
  'RoomEnvironment.js': 'examples/jsm/environments/RoomEnvironment.js',
  // Design 075 O2: the attack-FX bloom. Subpaths keep the addons' own relative imports working.
  'addons/postprocessing/UnrealBloomPass.js': 'examples/jsm/postprocessing/UnrealBloomPass.js',
  'addons/postprocessing/Pass.js': 'examples/jsm/postprocessing/Pass.js',
  'addons/shaders/CopyShader.js': 'examples/jsm/shaders/CopyShader.js',
  'addons/shaders/LuminosityHighPassShader.js': 'examples/jsm/shaders/LuminosityHighPassShader.js',
  LICENSE: 'LICENSE',
};

/** @returns {string|null} why the installed package cannot be vendored, or null when it can. */
export function packageProblem(packageDir = PACKAGE_DIR) {
  const manifest = join(packageDir, 'package.json');
  if (!existsSync(manifest))
    return `three is not installed at ${packageDir} (run pnpm install)`;
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
  if (version !== THREE_VERSION)
    return `three ${version} is installed; ${THREE_VERSION} is pinned`;
  return null;
}

/** @returns {string[]} vendored files missing or differing from the package, by vendored name. */
export function driftedFiles(packageDir = PACKAGE_DIR, vendorDir = VENDOR_DIR) {
  return Object.entries(VENDORED_FILES)
    .filter(([name, source]) => {
      const vendored = join(vendorDir, name);
      if (!existsSync(vendored)) return true;
      return !readFileSync(vendored).equals(
        readFileSync(join(packageDir, source))
      );
    })
    .map(([name]) => name);
}

function main() {
  const problem = packageProblem();
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    const drifted = driftedFiles();
    if (drifted.length > 0) {
      console.error(
        `vendored three differs from ${THREE_VERSION}: ${drifted.join(', ')}`
      );
      process.exit(1);
    }
    return;
  }
  for (const [name, source] of Object.entries(VENDORED_FILES)) {
    const destination = join(VENDOR_DIR, name);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(PACKAGE_DIR, source), destination);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
