// Live custom sets on an open page: art URLs that change with their set, the manifest revision, and the recheck a
// page runs when its socket comes back (a notice sent while it was down is lost).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customCardIdFromImageUrl,
  customSetsRevision,
  fetchCustomSetManifest,
  noteCustomSetsChanged,
  recheckCustomSets,
  versionedCustomArtUrl,
} from '../custom-sets.mjs';

const ORIGIN = 'http://localhost:4000';
const manifestOf = (revision, ids = ['customhb']) => async () => ({
  ok: true,
  json: async () => ({ revision, sets: ids.map((id) => ({ id, code: id.slice(6).toUpperCase(), name: id, cardCount: 1 })) }),
});

function inPage(run) {
  return async () => {
    const saved = globalThis.location;
    globalThis.location = { origin: ORIGIN };
    try {
      await run();
    } finally {
      if (saved === undefined) delete globalThis.location;
      else globalThis.location = saved;
    }
  };
}

test(
  'art of a set that changed in this page gets a new ?v= on each change; other art is left as given',
  inPage(async () => {
    const art = '/src/assets/custom-sets/customhb/001/high.webp';
    assert.equal(versionedCustomArtUrl(art), art, 'no change yet: the plain URL is current');

    await noteCustomSetsChanged({ version: 4, sets: ['customhb'] }, { fetchImpl: manifestOf('r1') });
    const first = versionedCustomArtUrl(art);
    assert.equal(first, `${art}?v=1`);
    assert.equal(versionedCustomArtUrl(first), first, 'already current');
    assert.equal(customCardIdFromImageUrl(first), 'customhb-001', 'the query does not hide the card');
    assert.equal(versionedCustomArtUrl(`${ORIGIN}${art}`), `${ORIGIN}${art}?v=1`, 'same-origin absolute stays absolute');

    await noteCustomSetsChanged({ version: 5, sets: ['customhb'] }, { fetchImpl: manifestOf('r2') });
    assert.equal(versionedCustomArtUrl(first), `${art}?v=2`, 'a second change moves it again');

    for (const other of [
      '/src/assets/custom-sets/customhbw/001/high.webp',
      'https://assets.tcgdex.net/en/sv/sv01/001/high.webp',
      'https://elsewhere.example/src/assets/custom-sets/customhb/001/high.webp',
      '',
    ]) {
      assert.equal(versionedCustomArtUrl(other), other);
    }
  })
);

test(
  'the manifest revision is read from the server; a manifest without one reads as unknown',
  inPage(async () => {
    await fetchCustomSetManifest({ fetchImpl: manifestOf('abc123'), force: true });
    assert.equal(await customSetsRevision(), 'abc123');
    await fetchCustomSetManifest({ fetchImpl: async () => ({ ok: true, json: async () => ({ sets: [] }) }), force: true });
    assert.equal(await customSetsRevision(), '');
  })
);

test(
  'a recheck reports a change only when the revision moved, naming every set before and after',
  inPage(async () => {
    await fetchCustomSetManifest({ fetchImpl: manifestOf('r1', ['customhb', 'customold']), force: true });
    assert.equal(await recheckCustomSets({ fetchImpl: manifestOf('r1', ['customhb', 'customold']) }), null);
    assert.deepEqual(await recheckCustomSets({ fetchImpl: manifestOf('r2', ['customhb', 'customnew']) }), {
      version: 0,
      sets: ['customhb', 'customnew', 'customold'],
    });
    assert.equal(await recheckCustomSets({ fetchImpl: manifestOf('r2', ['customhb', 'customnew']) }), null, 'now current');

    await fetchCustomSetManifest({ fetchImpl: manifestOf('', ['customhb']), force: true });
    assert.equal(await recheckCustomSets({ fetchImpl: manifestOf('r3') }), null, 'an unknown revision cannot be compared');
  })
);
