import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLIGHT_STAGGER_MS,
  cardShapedRect,
  MAX_FLIGHTS,
  flightDelays,
  flightPose,
  flightSrcOf,
  flightTrail,
  planFlight,
  rectFlightEnds,
} from '../card-flight.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const card = { left: 100, top: 400, width: 100, height: 140 };
const pile = { left: 700, top: 50, width: 60, height: 84 };

test('planFlight: the card starts where it is and lands on the pile, turned and sized like it', () => {
  const flight = planFlight({ ...rectFlightEnds(card, pile, { fromTurn: 0, toTurn: 0 }), seed: 3 });
  const start = flightPose(0, flight);
  const end = flightPose(1, flight);
  assert.ok(near(start.x, 0) && near(start.y, 0));
  assert.ok(near(start.scale, 1) && near(start.rotate, 0));
  assert.ok(near(end.x, 580) && near(end.y, -378));
  assert.ok(near(end.scale, 0.6));
  assert.ok(near(end.rotate, 0) && near(end.tiltX, 0));
  assert.equal(end.opacity, 0);
});

test('planFlight: the arc bows up the screen whichever way the card flies', () => {
  for (const to of [pile, { left: 700, top: 700, width: 60, height: 84 }, { left: -600, top: 400, width: 60, height: 84 }]) {
    const flight = planFlight(rectFlightEnds(card, to));
    const mid = flightPose(0.5, flight);
    const chordY = (flight.sy + flight.ey) / 2;
    assert.ok(mid.y < chordY - 1, `mid ${mid.y} not above chord ${chordY}`);
  }
});

test('planFlight: the card tumbles mid-flight and settles; it leans into the flight', () => {
  const flight = planFlight({ ...rectFlightEnds(card, pile), seed: 9 });
  const mid = flightPose(0.5, flight);
  assert.ok(Math.abs(mid.rotate) >= 12, `spin ${mid.rotate}`);
  assert.ok(mid.tiltX > 20);
  assert.ok(mid.scale > 0.8, 'lift bump keeps it large mid-flight');
});

test('planFlight: the opponent card rotates the short way to its turned pile', () => {
  const flight = planFlight(rectFlightEnds(card, pile, { fromTurn: 180, toTurn: -180 }));
  assert.ok(near(flightPose(1, flight).rotate, 180));
  const handover = planFlight({ start: { rotate: 190, tiltX: -12, scale: 1.1 }, end: { x: 10, y: 10, rotate: 180 } });
  assert.ok(near(flightPose(0, handover).tiltX, -12));
  assert.ok(near(flightPose(0, handover).scale, 1.1));
  assert.ok(near(flightPose(1, handover).rotate, 180));
});

test('planFlight: a zero-length flight stays put without NaN', () => {
  const flight = planFlight({ start: {}, end: { x: 0, y: 0 } });
  for (const u of [0, 0.5, 1]) {
    const p = flightPose(u, flight);
    assert.ok(Object.values(p).every(Number.isFinite));
    assert.ok(near(p.x, 0) && near(p.y, 0));
  }
  const trail = flightTrail(0.5, flight);
  assert.ok(Object.values(trail).every(Number.isFinite));
});

test('flightTrail: follows the card, points along its path, fastest mid-flight, dark at both ends', () => {
  const flight = planFlight(rectFlightEnds(card, pile));
  const mid = flightTrail(0.5, flight);
  const pose = flightPose(0.5, flight);
  assert.ok(near(mid.x, pose.x) && near(mid.y, pose.y));
  // Up and to the right: the angle points right and up (negative y on screen).
  assert.ok(mid.angle < 0 && mid.angle > -90, `angle ${mid.angle}`);
  assert.ok(mid.length > flightTrail(0.1, flight).length);
  assert.ok(near(flightTrail(0, flight).opacity, 0) && near(flightTrail(1, flight).opacity, 0));
});

test('flightDelays: staggers each card and caps how many fly', () => {
  assert.deepEqual(flightDelays(3), [0, FLIGHT_STAGGER_MS, 2 * FLIGHT_STAGGER_MS]);
  assert.equal(flightDelays(50).length, MAX_FLIGHTS);
  assert.deepEqual(flightDelays(0), []);
  assert.deepEqual(flightDelays(undefined), []);
});

test('flightSrcOf: an Energy token flies its card art; anything else its own src', () => {
  assert.equal(flightSrcOf({ src: 'token.png', dataset: { energyCardSrc: 'fire.png' } }), 'fire.png');
  assert.equal(flightSrcOf({ src: 'card.png', dataset: {} }), 'card.png');
  assert.equal(flightSrcOf(null), null);
});

test('cardShapedRect: an Energy token grows into a card-shaped box around it; cards pass through', () => {
  const token = { left: 100, top: 100, width: 20, height: 20 };
  const box = cardShapedRect(token);
  assert.ok(near(box.height, 40) && near(box.width, 40 * 0.716));
  assert.ok(near(box.left + box.width / 2, 110) && near(box.top + box.height / 2, 110), 'centred on the token');
  assert.equal(cardShapedRect(card), card);
  assert.equal(cardShapedRect(null), null);
});
