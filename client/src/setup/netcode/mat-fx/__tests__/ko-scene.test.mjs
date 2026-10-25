import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT_MS } from '../card-flight.mjs';
import { HOLD_MS } from '../fx-holds.mjs';
import {
  KO_BURN_FROM_MS,
  KO_BURN_TO_MS,
  KO_FAN_MAX,
  KO_FLIGHT_AT_MS,
  KO_REDUCED_BURN_MS,
  KO_REDUCED_HOLD_MS,
  KO_REFORM_MS,
  KO_SCENE_MS,
  koDissolveAt,
  koFanPose,
  koFlightStartMs,
  koHeroPose,
  koReducedDissolveAt,
  koTrack,
} from '../ko-scene.mjs';

const at = (ms) => ms / KO_SCENE_MS;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const card = { left: 400, top: 100, width: 100, height: 140 };
const pile = { left: 900, top: 20, width: 60, height: 84 };

test('KO scene: every attachment shown lands before the scene ends', () => {
  assert.ok(koFlightStartMs(KO_FAN_MAX) + FLIGHT_MS <= KO_SCENE_MS);
});

test('koHeroPose: thrown back away from the attacker, then swings forward before flying', () => {
  const H = 140;
  const oppBack = koHeroPose(at(500), { dir: -1, H });
  const selfBack = koHeroPose(at(500), { dir: 1, H });
  assert.ok(near(oppBack.y, -0.9 * H), 'opponent card flies up the screen');
  assert.ok(near(selfBack.y, 0.9 * H), 'your card flies down the screen');
  assert.ok(oppBack.tiltX < -50, 'tips over');
  const swung = koHeroPose(at(KO_FLIGHT_AT_MS), { dir: -1, H });
  assert.ok(Math.abs(swung.y) < Math.abs(oppBack.y));
  assert.ok(Math.abs(swung.tiltX) < 20);
  assert.ok(koHeroPose(at(70), { dir: -1, H }).scale > 1.04, 'jolts on the hit');
});

test('koFanPose: hidden behind the card until the swing, then fanned to its side', () => {
  const opts = { dir: -1, turn: 0, W: 100, H: 140 };
  assert.equal(koFanPose(at(300), 1, opts).opacity, 0);
  const one = koFanPose(at(KO_FLIGHT_AT_MS), 1, opts);
  const two = koFanPose(at(KO_FLIGHT_AT_MS), 2, opts);
  const hero = koHeroPose(at(KO_FLIGHT_AT_MS), opts);
  assert.equal(one.opacity, 1);
  assert.ok(two.x > one.x && one.x > hero.x + 10, 'spread outward');
  // On the opponent's board (turned 180°) the fan mirrors on screen.
  const turned = koFanPose(at(KO_FLIGHT_AT_MS), 1, { ...opts, turn: 180 });
  assert.ok(turned.x < hero.x - 10);
});

test('koTrack: continuous at the hand-over and lands on the pile, turned with it', () => {
  for (const index of [0, 1, 3]) {
    const track = koTrack({ index, dir: -1, turn: 180, pileTurn: 180, cardRect: card, pileRect: pile, seed: 5 });
    const start = koFlightStartMs(index);
    const before = track.pose(at(start - 0.5));
    const after = track.pose(at(start + 0.5));
    assert.ok(Math.abs(before.x - after.x) < 2 && Math.abs(before.y - after.y) < 2, `index ${index} jumps`);
    assert.ok(Math.abs(before.rotate - after.rotate) < 1);
    const landed = track.pose(at(track.landsAtMs));
    assert.ok(near(landed.x, 480) && near(landed.y, -108));
    assert.ok(near(landed.rotate, 180));
    assert.ok(near(landed.scale, 0.6));
    assert.equal(landed.opacity, 0);
  }
});

test('koTrack: the streak shows only while the card flies; a missing pile lands in place', () => {
  const track = koTrack({ index: 0, dir: 1, cardRect: card, pileRect: pile });
  assert.equal(track.trail(at(300)).opacity, 0);
  assert.ok(track.trail(at(koFlightStartMs(0) + FLIGHT_MS / 2)).opacity > 0.5);
  const lost = koTrack({ index: 0, dir: 1, cardRect: card, pileRect: null });
  const landed = lost.pose(at(lost.landsAtMs));
  assert.ok(near(landed.x, 0) && near(landed.y, 0) && near(landed.scale, 1));
});

test('koDissolveAt: whole at the hit, burnt away before the flight, re-formed in the pile before the end', () => {
  const landsAt = koFlightStartMs(0) + FLIGHT_MS;
  assert.equal(koDissolveAt(0), 0);
  assert.equal(koDissolveAt(KO_BURN_FROM_MS), 0, 'the knock lands on a whole card');
  let last = 0;
  for (let ms = KO_BURN_FROM_MS; ms <= KO_BURN_TO_MS; ms += 20) {
    const now = koDissolveAt(ms);
    assert.ok(now >= last, `burns steadily at ${ms}`);
    last = now;
  }
  assert.equal(koDissolveAt(KO_BURN_TO_MS), 1);
  assert.ok(KO_BURN_FROM_MS >= KO_FLIGHT_AT_MS - 220, 'burns once swung back to face the camera');
  assert.ok(KO_BURN_TO_MS <= landsAt - 200, 'gone well before the pile');
  assert.equal(koDissolveAt(landsAt - 100), 1, 'only the streak arrives');
  assert.equal(koDissolveAt(landsAt), 1);
  assert.ok(koDissolveAt(landsAt + KO_REFORM_MS / 2) < 1);
  assert.equal(koDissolveAt(landsAt + KO_REFORM_MS), 0, 'the pile shows the card again');
  assert.ok(landsAt + KO_REFORM_MS <= KO_SCENE_MS);
  assert.equal(koDissolveAt(KO_SCENE_MS), 0, 'rest after the scene');
});

test('koReducedDissolveAt: whole at the start, gone by the end of the still hold and after it', () => {
  assert.equal(koReducedDissolveAt(0), 0);
  assert.ok(koReducedDissolveAt(KO_REDUCED_HOLD_MS / 2) > 0);
  assert.equal(koReducedDissolveAt(KO_REDUCED_HOLD_MS), 1);
  assert.equal(koReducedDissolveAt(KO_REDUCED_BURN_MS - 1), 1, 'no whole card flashes where it stood');
  assert.ok(KO_REDUCED_BURN_MS > KO_REDUCED_HOLD_MS);
  assert.ok(KO_REDUCED_BURN_MS <= HOLD_MS.knockout, 'inside the knockout hold');
});
