import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPP_PLAY_HOLD_MS,
  OPP_PLAY_MS,
  matCenter,
  normalizeTurn,
  oppPlayTrack,
  oppPreviewRect,
  playsOppPreview,
} from '../opp-play.mjs';

const close = (actual, expected, msg, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${msg}: ${actual} vs ${expected}`);
const at = (ms) => ms / OPP_PLAY_MS;

// Preview 200×280 centred at (500, 400); opponent hand card at the top, board
// slot lower right. Both of the opponent's cards read turned 180°.
const preview = { left: 400, top: 260, width: 200, height: 280 };
const hand = { left: 480, top: 20, width: 40, height: 56 };
const slot = { left: 640, top: 300, width: 60, height: 84 };
const track = () => oppPlayTrack({ from: hand, preview, to: slot, fromTurn: 180, toTurn: 180 });

test('oppPlayTrack: starts on the hand card, turned like its board, sleeve side up', () => {
  const p = track()(0);
  close(p.x, 0, 'x');
  close(p.y, 48 - 400, 'y');
  close(p.scale, 40 / 200, 'scale');
  close(p.rotate, 180, 'rotate');
  close(p.flip, 180, 'flip');
  close(p.opacity, 1, 'opacity');
});

test('oppPlayTrack: face up and upright by the end of the drop, on the mat short of the preview', () => {
  const p = track()(at(260));
  close(p.flip, 0, 'flip');
  close(p.rotate, 0, 'rotate');
  assert.ok(p.y < 0 && p.y > 48 - 400, `between the hand and the preview: ${p.y}`);
  const mid = track()(at(130));
  assert.ok(mid.flip > 0 && mid.flip < 180, `mid-flip ${mid.flip}`);
});

test('oppPlayTrack: grows to the centred preview and holds it for the doubled hold', () => {
  assert.equal(OPP_PLAY_HOLD_MS, 1200);
  const pose = track();
  const grown = pose(at(520));
  close(grown.x, 0, 'x');
  close(grown.y, 0, 'y');
  assert.ok(grown.scale > 1, `overshoots: ${grown.scale}`);
  for (const ms of [620, 1000, 1700]) {
    const p = pose(at(ms));
    close(p.x, 0, `x at ${ms}`);
    close(p.y, 0, `y at ${ms}`);
    close(p.scale, 1, `scale at ${ms}`);
    close(p.rotate, 0, `rotate at ${ms}`);
    close(p.tiltX, 0, `tilt at ${ms}`);
  }
});

test('oppPlayTrack: lands exactly on its board slot at the board turn, still opaque', () => {
  const p = track()(1);
  close(p.x, 670 - 500, 'x');
  close(p.y, 342 - 400, 'y');
  close(p.scale, 60 / 200, 'scale');
  close(p.rotate, 180, 'rotate');
  close(p.opacity, 1, 'opacity');
});

test('oppPlayTrack: no hand rect starts above the preview; no slot shrinks away in the middle', () => {
  const pose = oppPlayTrack({ from: null, preview, to: null, fromTurn: 180, toTurn: 180 });
  const first = pose(0);
  close(first.x, 0, 'x');
  close(first.y, -280 * 0.9, 'y');
  close(first.rotate, 0, 'no board to be turned like');
  close(first.flip, 180, 'still face down');
  const last = pose(1);
  close(last.x, 0, 'x');
  close(last.y, 0, 'y');
  close(last.scale, 0.3, 'scale');
  close(last.rotate, 0, 'rotate');
  close(last.opacity, 0, 'faded');
});

test('oppPlayTrack: toFade fades it onto the discard pile; zero-size rects count as missing', () => {
  const pile = { left: 800, top: 100, width: 50, height: 70 };
  const onPile = oppPlayTrack({ from: hand, preview, to: pile, toFade: true })(1);
  close(onPile.x, 825 - 500, 'x');
  close(onPile.opacity, 0, 'faded');
  const collapsed = oppPlayTrack({ from: { left: 1, top: 1, width: 0, height: 0 }, preview, to: slot })(0);
  close(collapsed.scale, 0.3, 'fallback start');
});

test('normalizeTurn folds into (-180, 180]', () => {
  assert.equal(normalizeTurn(180), 180);
  assert.equal(normalizeTurn(-180), 180);
  assert.equal(normalizeTurn(270), -90);
  assert.equal(normalizeTurn(360), 0);
  assert.equal(normalizeTurn(undefined), 0);
});

test('matCenter: centre of the two board rects; viewport centre without them', () => {
  const opp = { left: 100, top: 0, width: 800, height: 300 };
  const self = { left: 100, top: 300, width: 800, height: 400 };
  assert.deepEqual(matCenter([opp, self], { width: 1280, height: 720 }), { x: 500, y: 350 });
  assert.deepEqual(matCenter([opp, { left: 0, top: 0, width: 0, height: 0 }], {}), { x: 500, y: 150 });
  assert.deepEqual(matCenter([], { width: 1280, height: 720 }), { x: 640, y: 360 });
  assert.deepEqual(matCenter(null, null), { x: 0, y: 0 });
});

test('oppPreviewRect: 42% of the viewport height, capped at 380, centred', () => {
  const r = oppPreviewRect({ x: 500, y: 350 }, { width: 1280, height: 720 });
  close(r.height, 302.4, 'height');
  close(r.width, 302.4 * 0.716, 'width');
  close(r.left + r.width / 2, 500, 'cx');
  close(r.top + r.height / 2, 350, 'cy');
  close(oppPreviewRect({ x: 0, y: 0 }, { height: 2000 }).height, 380, 'capped');
});

test('playsOppPreview: only the opponent side', () => {
  assert.equal(playsOppPreview({ user: 'opp' }), true);
  assert.equal(playsOppPreview({ user: 'self' }), false);
  assert.equal(playsOppPreview({ user: null }), false);
  assert.equal(playsOppPreview(null), false);
});
