import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVOLVE_PALETTE,
  EVOLVE_REVEAL_AT,
  EVOLVE_SCENE_MS,
  buildEvolveScene,
  cardClock,
  EVOLVE_STAGE,
  drawEvolveBack,
  drawEvolveFront,
  evolveScenePose,
  newCardPose,
  oldCardPose,
  stageDimPose,
  turnOfMatrix,
} from '../evolve-scene.mjs';
import { HOLD_MS } from '../fx-holds.mjs';

/**
 * A 2D-context stand-in that records every call, every colour used, and every
 * radial gradient's outer radius with its colour stops.
 */
const recordingContext = () => {
  const calls = [];
  const colours = [];
  const radials = [];
  const gradient = (stops) => ({
    addColorStop: (_at, colour) => {
      colours.push(colour);
      stops.push(colour);
    },
  });
  const ctx = new Proxy(
    { globalAlpha: 1 },
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'createLinearGradient') return () => gradient([]);
        if (key === 'createRadialGradient') {
          return (...args) => {
            const radial = { radius: args[5], stops: [] };
            radials.push(radial);
            return gradient(radial.stops);
          };
        }
        return (...args) => calls.push([key, args]);
      },
      set(target, key, value) {
        if (typeof value === 'string' && /Style$|Color$/.test(key)) colours.push(value);
        target[key] = value;
        return true;
      },
    }
  );
  return { ctx, calls, colours, radials };
};

const count = (calls, name) => calls.filter(([n]) => n === name).length;
const geometry = (scene = buildEvolveScene(7)) => ({
  cx: 350,
  cy: 350,
  unit: 110,
  card: { width: 79, height: 110 },
  scene,
  time: 1.2,
});
const draw = (fn, t, g = geometry()) => {
  const rec = recordingContext();
  fn(rec.ctx, t, g);
  return rec;
};
const alphaOf = (colour) => Number(/rgba\([^)]*,\s*([-\d.e]+)\)$/.exec(colour)?.[1]);
const rgbOf = (colour) => /^rgba\((\d+), (\d+), (\d+),/.exec(colour)?.slice(1, 4).map(Number) ?? null;

// Scene fraction at `ms` into the scene.
const at = (ms) => ms / EVOLVE_SCENE_MS;
// The glow hold: the span of the scene where the card clock stands still.
const holdSpan = () => {
  const still = [];
  for (let ms = 1; ms < EVOLVE_SCENE_MS; ms += 1) if (cardClock(at(ms)) === cardClock(at(ms - 1))) still.push(ms);
  return { from: still[0] - 1, to: still.at(-1) };
};

const STRENGTHS = ['nebula', 'stars', 'halo', 'beads', 'bokeh', 'glitter'];

/** The first t (in 1/400 steps) at which a beat reaches full strength. */
const peakAt = (key) => {
  for (let i = 0; i <= 400; i += 1) if (evolveScenePose(i / 400)[key] > 0.999) return i / 400;
  return NaN;
};

test('evolveScenePose: every strength is in [0, 1], hidden at both ends; t is clamped', () => {
  for (let i = 0; i <= 400; i += 1) {
    const pose = evolveScenePose(i / 400);
    for (const [key, value] of Object.entries(pose)) {
      assert.ok(Number.isFinite(value), `${key} finite at ${i / 400}`);
      assert.ok(value >= 0 && value <= 1, `${key}=${value} at ${i / 400}`);
    }
  }
  for (const key of STRENGTHS) {
    assert.equal(evolveScenePose(0)[key], 0, `${key} at 0`);
    assert.equal(evolveScenePose(1)[key], 0, `${key} at 1`);
  }
  assert.deepEqual(evolveScenePose(-3), evolveScenePose(0));
  assert.deepEqual(evolveScenePose(9), evolveScenePose(1));
  assert.deepEqual(evolveScenePose(Number.NaN), evolveScenePose(0));
});

test('evolveScenePose: the beats play in the clip order — awaken, gather, surge, reveal', () => {
  assert.ok(peakAt('nebula') < peakAt('beads'));
  assert.ok(peakAt('beads') < peakAt('bokeh'));
  assert.ok(peakAt('bokeh') < peakAt('glitter'));
});

test('evolveScenePose: the reveal stays inside the nebula — no whiteout, no new backdrop', () => {
  const keys = Object.keys(evolveScenePose(0.5));
  for (const gone of ['whiteout', 'sky', 'rays', 'core', 'spikes', 'speedLines']) assert.ok(!keys.includes(gone), `${gone} is not a beat`);
  assert.equal(evolveScenePose(EVOLVE_REVEAL_AT).nebula, 1);
  assert.ok(evolveScenePose(0.86).nebula > 0.5, 'the nebula outlasts the white draining off the new card');
  assert.ok(evolveScenePose(0.86).halo > 0.5);
  assert.ok(stageDimPose(0.86) > 0.5, 'the board stays dimmed under the nebula');
});

test('card swap: the pearl old card hands over to the pearl new card at the surge peak, no jump', () => {
  const before = oldCardPose(EVOLVE_REVEAL_AT - 0.0001);
  const after = newCardPose(EVOLVE_REVEAL_AT);
  assert.equal(before.opacity, 1);
  assert.equal(oldCardPose(EVOLVE_REVEAL_AT).opacity, 0);
  assert.equal(newCardPose(EVOLVE_REVEAL_AT - 0.001).opacity, 0);
  assert.equal(after.opacity, 1);
  assert.equal(before.white, 1);
  assert.equal(after.white, 1, 'the new card appears white');
  assert.ok(Math.abs(after.scale - before.scale) < 0.002, `scale ${before.scale} -> ${after.scale}`);
  assert.ok(Math.abs(after.y - before.y) < 0.002, `lift ${before.y} -> ${after.y}`);
  assert.ok(Math.abs(after.tiltX - before.tiltX) < 0.05, `lean ${before.tiltX} -> ${after.tiltX}`);
  const facing = (deg) => Math.cos((deg * Math.PI) / 180);
  assert.ok(Math.abs(facing(after.tiltY) - facing(before.tiltY)) < 0.01, `turn ${before.tiltY} -> ${after.tiltY}`);
});

test('card depth: the card turns in 3D, flips through the white swap, faces front once its art shows', () => {
  assert.ok(Math.abs(oldCardPose(0.3).tiltY) > 3, 'rocks while it glows');
  assert.ok(oldCardPose(0.5).tiltX > 10, 'leans back when lifted');
  for (let i = 0; i <= 100; i += 1) {
    const t = i / 100;
    for (const pose of [oldCardPose(t), newCardPose(t)]) {
      const turnedAway = Math.cos((pose.tiltY * Math.PI) / 180) < 0.2;
      if (pose.opacity > 0 && pose.white < 0.99) assert.ok(!turnedAway, `art shown turned away at ${t}`);
      assert.ok(pose.shade >= 0 && pose.shade <= 1 && pose.sheen >= 0 && pose.sheen <= 1);
    }
  }
  assert.equal(newCardPose(1).tiltX, 0);
  assert.ok(Math.abs(newCardPose(0.9).tiltY) < 2, 'settles facing front');
  assert.ok(oldCardPose(0.216).sheen > 0.9 && newCardPose(0.896).sheen > 0.9, 'light sweeps both faces');
});

test('oldCardPose: shows its art, goes pearl white, never smaller than the card it hides', () => {
  assert.equal(oldCardPose(0).white, 0);
  assert.equal(oldCardPose(0.3).white, 1);
  for (let i = 0; i <= 100; i += 1) {
    const pose = oldCardPose(i / 100);
    assert.ok(pose.scale >= 1, `scale ${pose.scale} at ${i / 100}`);
    assert.ok(pose.white >= 0 && pose.white <= 1);
  }
  assert.ok(oldCardPose(0.5).y < 0, 'lifts');
});

test('oldCardPose: no art — pearl white within the first frames', () => {
  assert.ok(oldCardPose(0.05, { hasArt: false }).white > 0.99);
  assert.equal(oldCardPose(0, { hasArt: false }).white, 0);
});

test('newCardPose: holds its size through the flip, clears to a blue glow, and eases gently down as it dissolves into the real card', () => {
  // One drop only: size and lift stay put from the hand-over until the settle.
  const hold = holdSpan();
  for (let ms = Math.ceil(EVOLVE_REVEAL_AT * EVOLVE_SCENE_MS); ms <= hold.to; ms += 10) {
    const pose = newCardPose(at(ms));
    assert.ok(Math.abs(pose.scale - newCardPose(EVOLVE_REVEAL_AT).scale) < 1e-9, `size changes at ${ms} ms`);
    assert.ok(Math.abs(pose.y - newCardPose(EVOLVE_REVEAL_AT).y) < 1e-9, `lift changes at ${ms} ms`);
  }
  assert.ok(newCardPose(0.56).white > 0.5, 'still white while the flare dies down');
  for (let i = 90; i <= 100; i += 1) {
    const pose = newCardPose(i / 100);
    assert.ok(pose.white >= 0.4 && pose.white <= 0.5, `glow stays over the art at ${i / 100}`);
  }
  assert.equal(newCardPose(at(2900)).opacity, 1);
  assert.ok(newCardPose(0.9).y < 0, 'still lifted once its art shows');
  // Gentle: after the hold, no quarter-percent of the scene jumps the drop or shrink.
  for (let i = 320; i < 400; i += 1) {
    const [a, b] = [newCardPose(i / 400), newCardPose((i + 1) / 400)];
    if (a.opacity === 0) continue;
    assert.ok(Math.abs(b.y - a.y) < 0.0015, `drop step ${b.y - a.y} at ${i / 400}`);
    assert.ok(Math.abs(b.scale - a.scale) < 0.0035, `shrink step ${b.scale - a.scale} at ${i / 400}`);
  }
  assert.equal(newCardPose(1).scale, 1);
  assert.equal(newCardPose(1).opacity, 0);
});

test('stageDimPose: bounded and quiet at both ends', () => {
  for (let i = 0; i <= 100; i += 1) {
    const t = i / 100;
    assert.ok(stageDimPose(t) >= 0 && stageDimPose(t) <= 1);
  }
  assert.equal(stageDimPose(0), 0);
  assert.equal(stageDimPose(1), 0);
});

test('turnOfMatrix: the opponent frame turns 180°, identity and mirrors do not turn', () => {
  assert.equal(turnOfMatrix({ a: 1, b: 0, c: 0, d: 1 }), 0);
  assert.equal(turnOfMatrix({ a: -1, b: 0, c: 0, d: -1 }), 180);
  assert.equal(turnOfMatrix({ a: 0, b: 1, c: -1, d: 0 }), 90);
  assert.equal(turnOfMatrix({ a: -1, b: 0, c: 0, d: 1 }), 0, 'a mirror is not a turn');
  assert.equal(turnOfMatrix(null), 0);
  assert.equal(turnOfMatrix({ a: Number.NaN }), 0);
});

test('buildEvolveScene: deterministic per seed, varied across seeds', () => {
  assert.deepEqual(buildEvolveScene(11), buildEvolveScene(11));
  assert.notDeepEqual(buildEvolveScene(11), buildEvolveScene(12));
  const scene = buildEvolveScene(3);
  assert.ok(scene.beads.some((b) => b.front) && scene.beads.some((b) => !b.front), 'beads on both sides');
});

test('drawEvolveBack/Front: bad input draws nothing', () => {
  for (const fn of [drawEvolveBack, drawEvolveFront]) {
    for (const g of [null, { ...geometry(), unit: 0 }, { ...geometry(), scene: null }, { ...geometry(), cx: Number.NaN }]) {
      assert.equal(draw(fn, 0.4, g).calls.length, 0);
    }
    assert.doesNotThrow(() => fn(null, 0.4, geometry()));
  }
});

test('drawEvolveBack/Front: every beat draws, and save/restore stay balanced', () => {
  for (let i = 1; i < 40; i += 1) {
    const t = i / 40;
    for (const fn of [drawEvolveBack, drawEvolveFront]) {
      const { calls } = draw(fn, t);
      assert.equal(count(calls, 'save'), count(calls, 'restore'), `${fn.name} at ${t}`);
    }
  }
  assert.ok(count(draw(drawEvolveBack, 0.2).calls, 'fill') > 20, 'nebula and stars');
  assert.ok(count(draw(drawEvolveBack, 0.8).calls, 'fill') > 20, 'nebula through the reveal');
  assert.ok(count(draw(drawEvolveFront, 0.5).calls, 'fill') > 10, 'beads and bokeh');
  assert.ok(count(draw(drawEvolveFront, 0.8).calls, 'fill') > 5, 'glitter');
});

test('drawEvolveBack/Front: no orbiting ribbons, horizon arc or whiteout ring — nothing is stroked', () => {
  // Bokeh rims (about 1.3–2.75 s in) are the scene's only strokes.
  for (const t of [200, 600, 1000, 1200, 2800, 3000, 3200, 3400].map(at)) {
    for (const fn of [drawEvolveBack, drawEvolveFront]) {
      assert.equal(count(draw(fn, t).calls, 'stroke'), 0, `${fn.name} strokes at ${t}`);
    }
  }
});

test('drawEvolveBack/Front: every white is the blue-tinted white, never pure white', () => {
  for (let i = 0; i <= 50; i += 1) {
    for (const fn of [drawEvolveBack, drawEvolveFront]) {
      for (const colour of draw(fn, i / 50).colours) {
        const rgb = rgbOf(colour);
        if (!rgb || Math.min(...rgb) < 200) continue;
        const [r, g, b] = rgb;
        assert.ok(b > g && g > r, `${fn.name} ${colour} at ${i / 50} is not blue-tinted`);
      }
    }
  }
  for (const key of ['frost', 'pearl', 'white']) {
    const [r, , b] = EVOLVE_PALETTE[key];
    assert.ok(b - r >= 15, `${key} leans blue`);
  }
});

test('drawEvolveBack: the violet nebula backs both the awakening and the reveal', () => {
  const indigo = `rgba(${EVOLVE_PALETTE.indigo.join(', ')}`;
  for (const t of [0.2, 0.5, EVOLVE_REVEAL_AT, 0.8]) {
    assert.ok(draw(drawEvolveBack, t).colours.join(' ').includes(indigo), `nebula at ${t}`);
  }
});

test('drawEvolveFront: the flare stays round the card — no wide, strong bloom over the board', () => {
  // A whiteout is a glow both wider than ~1.5 card heights and more than half opaque.
  const g = geometry();
  for (let i = 0; i <= 100; i += 1) {
    for (const { radius, stops } of draw(drawEvolveFront, i / 100, g).radials) {
      if (radius <= g.unit * 1.5) continue;
      const peak = Math.max(...stops.map(alphaOf));
      assert.ok(peak <= 0.5, `glow r=${(radius / g.unit).toFixed(2)} cards, alpha ${peak} at ${i / 100}`);
    }
  }
});

test('drawEvolveBack/Front: every colour is a valid rgba with alpha in [0, 1]', () => {
  // A NaN alpha is an invalid colour the canvas silently ignores, keeping the last one.
  for (let i = 0; i <= 50; i += 1) {
    for (const fn of [drawEvolveBack, drawEvolveFront]) {
      for (const colour of draw(fn, i / 50).colours) {
        if (!colour.startsWith('rgba(')) continue;
        const alpha = alphaOf(colour);
        assert.ok(Number.isFinite(alpha) && alpha >= 0 && alpha <= 1, `${fn.name} ${colour} at ${i / 50}`);
      }
    }
  }
});

test('the evolve-scene hold lands the next effect as the evolved Pokémon emerges, inside the queue budget', () => {
  const hold = HOLD_MS['evolve-scene'];
  assert.ok(hold <= EVOLVE_SCENE_MS * EVOLVE_REVEAL_AT, 'not after the reveal');
  assert.ok(hold >= EVOLVE_SCENE_MS * EVOLVE_REVEAL_AT - 300, 'not inside the surge');
  assert.ok(hold < 2500, 'under the fx-queue budget');
});

test('buildEvolveScene: beads, bokeh and glitter stay close round the card', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { beads, bokeh, glitter } = buildEvolveScene(seed);
    for (const bead of beads) assert.ok(Math.abs(bead.x) <= 0.8 && bead.y - bead.rise >= -0.8, 'bead reach');
    for (const disc of bokeh) assert.ok(0.25 + disc.distance <= 1.2, 'bokeh reach');
    for (const bit of glitter) assert.ok(Math.abs(bit.x) <= 0.75 && Math.abs(bit.y) <= 0.65, 'glitter reach');
  }
  assert.ok(EVOLVE_STAGE <= 4.2, 'the canvas stage is no bigger than the effect needs');
});

test('glow hold: the evolved card stays white and lifted for a beat before it drops back', () => {
  const hold = holdSpan();
  assert.ok(hold.to - hold.from >= 200 && hold.to - hold.from <= 350, `hovers ${hold.to - hold.from} ms`);
  const holdStart = newCardPose(at(hold.from));
  const holdEnd = newCardPose(at(hold.to));
  for (const pose of [holdStart, holdEnd]) {
    assert.equal(pose.white, 1, 'still glowing white');
    assert.ok(pose.y < 0, 'still lifted');
    assert.equal(pose.opacity, 1);
  }
  assert.equal(evolveScenePose(at(hold.to)).halo, 1, 'the halo holds with it');
  assert.ok(newCardPose(0.9).white < 0.5, 'then drains');
  assert.equal(cardClock(0), 0);
  assert.equal(cardClock(1), 1);
  assert.ok(Math.abs(EVOLVE_SCENE_MS * EVOLVE_REVEAL_AT - 2048) < 1, 'the flare still peaks with the score');
});
