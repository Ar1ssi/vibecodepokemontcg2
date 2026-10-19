import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { matSpecFor } from '../mat-spec.mjs';
import { getMatById } from '../../deck-builder/core/mats.mjs';

const OVERLAY = '/src/assets/playmats/playmat_zones_overlay.svg';

describe('matSpecFor', () => {
  it('no mat: both halves show the zone overlay in the edge-to-edge box, no art', () => {
    const spec = matSpecFor({ self: null, opp: null });
    assert.equal(spec.mode, 'one-player');
    assert.equal(spec.src, null);
    assert.equal(spec.farSrc, null);
    assert.equal(spec.overlaySrc, OVERLAY);
    assert.equal(spec.farOverlaySrc, OVERLAY);
    assert.equal(spec.fit, 'cover');
    assert.equal(spec.boxAspect, 1.9394);
    assert.equal(spec.profile.id, 'edge-to-edge');
    assert.equal(spec.scale, 1);
  });

  it('one-player printed mat (catalog 2404-playmat): contain, box sized to the loaded art', () => {
    const mat = getMatById('2404-playmat');
    const spec = matSpecFor({ self: mat, opp: null }, { artAspect: { self: 1.7, opp: null }, scale: 1.2 });
    assert.equal(spec.mode, 'one-player');
    assert.equal(spec.src, `/${mat.board}`);
    assert.equal(spec.overlaySrc, null);
    assert.equal(spec.fit, 'contain');
    assert.equal(spec.boxAspect, 1.7);
    assert.equal(spec.imageAspect, 1.7);
    assert.equal(spec.farOverlaySrc, OVERLAY);
    assert.equal(spec.far.fit, 'cover');
    assert.equal(spec.scale, 1.2);
  });

  it('a full-size mat on the far side covers the whole table, turned to face that player', () => {
    const mat = getMatById('2143-official-playmat-green-1');
    const spec = matSpecFor({ self: null, opp: mat }, { artAspect: { self: null, opp: 1.9 } });
    assert.equal(spec.mode, 'two-player');
    assert.equal(spec.flip, true);
    assert.equal(spec.src, `/${mat.board}`);
    assert.equal(spec.farSrc, null);
    assert.equal(spec.imageAspect, 1.9);
    assert.equal(spec.profile.matMode, 'two-player');
  });
});
