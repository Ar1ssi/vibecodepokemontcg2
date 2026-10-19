import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTURE_CACHE_CONTROL, isValidRemote, parseUploadArgs, rcloneArgs } from '../upload-foil.mjs';

describe('parseUploadArgs', () => {
  it('reads --remote and --dry-run, defaulting the remote to FOIL_R2_REMOTE', () => {
    assert.deepEqual(parseUploadArgs(['--remote', 'r2:ptcg-foil', '--dry-run']), { remote: 'r2:ptcg-foil', dryRun: true });
    assert.deepEqual(parseUploadArgs([], { FOIL_R2_REMOTE: 'r2:from-env' }), { remote: 'r2:from-env', dryRun: false });
    assert.deepEqual(parseUploadArgs(['--remote']), { remote: null, dryRun: false });
  });
});

describe('isValidRemote', () => {
  it('accepts remote:bucket with an optional prefix', () => {
    for (const ok of ['r2:ptcg-foil', 'r2:ptcg-foil/', 'my_r2:bucket.name/v1/foil']) assert.ok(isValidRemote(ok), ok);
  });
  it('refuses local paths, flags and traversal', () => {
    for (const bad of [null, '', 'ptcg-foil', 'C:\\foil', '--delete-after', 'r2:', 'r2:b/../x', 'r2:b x', 'r2:b;rm']) {
      assert.equal(isValidRemote(bad), false, String(bad));
    }
  });
});

describe('rcloneArgs', () => {
  it('copies only cards/ and tex/ as webp with a cache header, skipping unchanged files', () => {
    const args = rcloneArgs({ assetDir: '/repo/assets', remote: 'r2:ptcg-foil' });
    assert.deepEqual(args.slice(0, 3), ['copy', '/repo/assets', 'r2:ptcg-foil']);
    assert.ok(args.includes('/cards/**') && args.includes('/tex/**'));
    assert.ok(args.includes('--checksum'));
    assert.ok(args.includes('Content-Type: image/webp'));
    assert.ok(args.includes(`Cache-Control: ${TEXTURE_CACHE_CONTROL}`));
    assert.ok(!args.includes('--dry-run'));
    assert.ok(!args.includes('sync'), 'copy never deletes remote files');
  });
  it('passes --dry-run through and refuses a bad remote', () => {
    assert.equal(rcloneArgs({ assetDir: '/a', remote: 'r2:b', dryRun: true }).at(-1), '--dry-run');
    assert.throws(() => rcloneArgs({ assetDir: '/a', remote: '/tmp/x' }), /invalid rclone remote/);
  });
});
