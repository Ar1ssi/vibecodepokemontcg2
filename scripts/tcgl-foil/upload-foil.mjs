#!/usr/bin/env node
// Design 069: uploads the imported TCG Live foil textures (client/src/assets/tcgl-foil/{cards,tex}, gitignored)
// to the object storage the site streams them from (Cloudflare R2), byte for byte — no re-encoding.
//
//   pnpm foil:upload -- --remote r2:ptcg-foil [--dry-run]
//
// Needs rclone (`winget install Rclone.Rclone`) with an S3 remote for the R2 bucket (`rclone config`: provider
// Cloudflare, the bucket's access key, endpoint https://<account id>.r2.cloudflarestorage.com). The credentials
// stay in rclone's config, never in this repo. --remote defaults to $FOIL_R2_REMOTE. Unchanged files are skipped
// (MD5 compare), so a rerun after `pnpm foil:import` uploads only what changed. The bucket also needs the CORS
// rule in r2-cors.json (WebGL textures are cross-origin reads) and a public URL, which becomes FOIL_TEXTURE_URL.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ASSET_DIR = path.join(SCRIPT_DIR, '..', '..', 'client', 'src', 'assets', 'tcgl-foil');

// Texture names are not content-hashed, so a re-import can change a file in place: a week, not forever.
export const TEXTURE_CACHE_CONTROL = 'public, max-age=604800';

const REMOTE_PATTERN = /^[\w.-]+:[\w.-]+(\/[\w.-]+)*\/?$/;

/** @returns {{remote: string|null, dryRun: boolean}} */
export function parseUploadArgs(argv, env = {}) {
  const args = { remote: env.FOIL_R2_REMOTE || null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--remote') args.remote = argv[(index += 1)] ?? null;
    else if (flag === '--dry-run') args.dryRun = true;
  }
  return args;
}

/** `remote:bucket[/prefix]` with no `..` segment; anything else is refused before rclone sees it. */
export const isValidRemote = (remote) =>
  typeof remote === 'string' && REMOTE_PATTERN.test(remote) && !remote.split(/[:/]/).includes('..');

/** rclone arguments copying cards/** and tex/** under `assetDir` to `remote`, keeping the folder layout. */
export function rcloneArgs({ assetDir, remote, dryRun = false }) {
  if (!isValidRemote(remote)) throw new Error(`invalid rclone remote: ${remote}`);
  return [
    'copy',
    assetDir,
    remote,
    '--include',
    '/cards/**',
    '--include',
    '/tex/**',
    '--checksum',
    '--transfers',
    '32',
    '--checkers',
    '64',
    '--s3-no-check-bucket',
    '--header-upload',
    'Content-Type: image/webp',
    '--header-upload',
    `Cache-Control: ${TEXTURE_CACHE_CONTROL}`,
    '--stats-one-line',
    '--stats',
    '15s',
    ...(dryRun ? ['--dry-run'] : []),
  ];
}

function main() {
  const args = parseUploadArgs(process.argv.slice(2), process.env);
  if (!args.remote) throw new Error('usage: upload-foil.mjs --remote <rclone remote:bucket> [--dry-run]');
  if (!fs.existsSync(path.join(ASSET_DIR, 'tex')) || !fs.existsSync(path.join(ASSET_DIR, 'cards'))) {
    throw new Error(`no imported textures under ${ASSET_DIR}: run pnpm foil:import first`);
  }
  const result = spawnSync('rclone', rcloneArgs({ assetDir: ASSET_DIR, remote: args.remote, dryRun: args.dryRun }), {
    stdio: 'inherit',
  });
  if (result.error?.code === 'ENOENT') throw new Error('rclone not found on PATH: winget install Rclone.Rclone');
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`rclone exited with status ${result.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
