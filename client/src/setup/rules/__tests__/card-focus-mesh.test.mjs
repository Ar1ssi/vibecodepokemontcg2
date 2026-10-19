import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FLIGHT_EASE, focusRect } from '../card-focus-geometry.mjs';
import {
  FOCUS_LIFT_FRAC,
  cubicBezierEase,
  easeFromCss,
  flightEase,
  focusMeshId,
  focusMeshPose,
  reversed,
  sceneTiltDeg,
} from '../card-focus-mesh.mjs';

const sceneWith = ({ tiltDeg = 12, placed = [5], camera = true } = {}) => ({
  inspect: () => ({
    cameraDesc: camera ? { tiltDeg } : null,
    cards: { placed: (id) => placed.includes(id) },
  }),
});
const imgOf = (instanceId) => ({ dataset: { instanceId } });

describe('cubic-bezier ease', () => {
  it('runs from 0 to 1, monotonically', () => {
    const ease = easeFromCss(FLIGHT_EASE);
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
    let last = 0;
    for (let t = 0.05; t < 1; t += 0.05) {
      const value = ease(t);
      assert.ok(value >= last, `t ${t}`);
      last = value;
    }
  });

  it("FLIGHT_EASE is InCubic: slow start, fast finish (0.32, 0, 0.67, 0)", () => {
    assert.ok(flightEase(0.25) < 0.1, `${flightEase(0.25)}`);
    assert.ok(flightEase(0.5) < 0.5);
    assert.ok(flightEase(0.9) > 0.6);
  });

  it('a linear bezier is the identity', () => {
    const linear = cubicBezierEase(0, 0, 1, 1);
    for (const t of [0.1, 0.4, 0.8]) assert.ok(Math.abs(linear(t) - t) < 1e-4);
  });

  it('easeFromCss reads only cubic-bezier text', () => {
    assert.equal(easeFromCss('ease-in'), null);
    assert.equal(easeFromCss('cubic-bezier(a, b, c, d)'), null);
    assert.equal(typeof easeFromCss(' cubic-bezier(0.1, 0.2, 0.3, 0.4) '), 'function');
  });

  it('reversed mirrors the curve the way Animation.reverse() plays it', () => {
    const back = reversed(flightEase);
    assert.equal(back(0), 0);
    assert.equal(back(1), 1);
    assert.ok(Math.abs(back(0.25) - (1 - flightEase(0.75))) < 1e-12);
    assert.ok(back(0.25) > flightEase(0.25), 'fast start on the way back');
  });

  it('reversed from part-way keeps the walk on the same curve and still ends at the start', () => {
    const back = reversed(flightEase, 0.6);
    assert.equal(back(0), 0);
    assert.ok(Math.abs(back(1) - 1) < 1e-12);
    // Half the remaining time: the card is at flightEase(0.3) of its way out, so 1 - that/flightEase(0.6) back.
    assert.ok(Math.abs(back(0.5) - (1 - flightEase(0.3) / flightEase(0.6))) < 1e-12);
    assert.equal(reversed(flightEase, 0)(0.5), 1, 'nothing flown: already home');
  });
});

describe('focusMeshPose', () => {
  const rect = focusRect({ width: 1920, height: 1080 });

  it('covers the focus rect, square-on to the table tilt, lifted a share of its height', () => {
    const pose = focusMeshPose(rect, sceneWith({ tiltDeg: 12 }));
    assert.deepEqual(pose.rect, rect);
    assert.equal(pose.tiltXDeg, -12);
    assert.equal(pose.lift, FOCUS_LIFT_FRAC * rect.height);
  });

  it('lifts clear of the board: the low edge of the leaned card stays well above the cloth', () => {
    // A card square-on to a table tilted t leans back t about its centre: its low edge is at
    // lift - (height / 2) * sin(t). Cards on the board stand a few px off the cloth.
    const { lift } = focusMeshPose(rect, sceneWith({ tiltDeg: 12 }));
    const lowEdge = lift - (rect.height / 2) * Math.sin((12 * Math.PI) / 180);
    assert.ok(lowEdge > 60, `low edge ${lowEdge}`);
  });

  it('follows the scene camera (TCG Live camera is straight down: no lean)', () => {
    assert.equal(focusMeshPose(rect, sceneWith({ tiltDeg: 0 })).tiltXDeg, 0);
    assert.equal(sceneTiltDeg(sceneWith({ tiltDeg: 12 })), 12);
  });

  it('falls back to the default table tilt with no scene or camera', () => {
    assert.equal(sceneTiltDeg(null), 12);
    assert.equal(sceneTiltDeg(sceneWith({ camera: false })), 12);
  });

  it('does not alias the rect it was given', () => {
    const pose = focusMeshPose(rect, null);
    assert.notEqual(pose.rect, rect);
  });
});

describe('focusMeshId', () => {
  it('names the mesh of a card the scene draws', () => {
    assert.equal(focusMeshId(sceneWith(), imgOf('5')), 5);
  });

  it('is null with no scene, no camera, no id or a card the scene has no pose for', () => {
    assert.equal(focusMeshId(null, imgOf('5')), null);
    assert.equal(focusMeshId(sceneWith({ camera: false }), imgOf('5')), null);
    assert.equal(focusMeshId(sceneWith(), imgOf(undefined)), null);
    assert.equal(focusMeshId(sceneWith(), imgOf('')), null);
    assert.equal(focusMeshId(sceneWith(), imgOf('abc')), null);
    assert.equal(focusMeshId(sceneWith(), imgOf('6')), null);
    assert.equal(focusMeshId(sceneWith(), {}), null);
    assert.equal(focusMeshId(sceneWith(), null), null);
  });
});
