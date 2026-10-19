/**
 * Copy the Build & Battle run flow's UI sprites out of the TCG Live extract's web export (design 071).
 * Run: node scripts/build-battle/vendor-run-ui.mjs <extract>/WebApp/assets/ui
 * The sprites are already webp, so nothing is converted; the file list lives in run-ui-assets.mjs.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN_UI_ASSETS, RUN_UI_ASSET_DIR } from './run-ui-assets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('usage: node scripts/build-battle/vendor-run-ui.mjs <extract>/WebApp/assets/ui');
  process.exit(1);
}

const outDir = join(ROOT, RUN_UI_ASSET_DIR);
mkdirSync(outDir, { recursive: true });
const missing = [];
for (const asset of RUN_UI_ASSETS) {
  const from = join(sourceDir, asset.source);
  if (!existsSync(from)) {
    missing.push(from);
    continue;
  }
  copyFileSync(from, join(outDir, asset.name));
  console.log(`${asset.name} <- ${asset.source}`);
}
if (missing.length) {
  console.error(`missing in the extract:\n${missing.join('\n')}`);
  process.exit(1);
}
