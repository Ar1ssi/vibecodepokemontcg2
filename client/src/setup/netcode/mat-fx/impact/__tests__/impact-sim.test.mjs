import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { GAME_CLEANUP_S, STEP_S, createEffect } from '../impact-sim.mjs';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'assets', 'fx', 'attack');
const TYPES = ['colorless', 'darkness', 'dragon', 'fairy', 'fighting', 'fire', 'grass', 'lightning', 'metal', 'psychic', 'water'];

const system = (overrides = {}) => ({
  dur: 1,
  delay: 0,
  world: false,
  scaling: 0,
  max: 100,
  life: 1,
  speed: 0,
  size: 1,
  rot: 0,
  flipRot: 0,
  color: [1, 1, 1, 1],
  gravity: 0,
  em: { rate: 0, dist: 0, bursts: [{ t: 0, n: 5, cycles: 1, interval: 0.01, p: 1 }] },
  ...overrides,
});
const node = (name, ps, extra = {}) => ({ n: name, p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1], ps, ...extra });
const play = (prefab, seconds, options) => {
  const effect = createEffect(prefab, options);
  effect.advanceTo(seconds);
  return effect;
};
const alive = (effect, index = 0) => effect.systems[index].particles;

test('a burst lives for its lifetime, then is gone', () => {
  const prefab = node('Burst', system());
  assert.equal(alive(play(prefab, 0)).length, 0);
  assert.equal(alive(play(prefab, STEP_S)).length, 5);
  assert.equal(alive(play(prefab, 0.5)).length, 5);
  assert.ok(Math.abs(alive(play(prefab, 0.5))[0].age - 0.5) < STEP_S);
  assert.equal(alive(play(prefab, 1.01)).length, 0);
});

test('time moves in whole steps, so a seek back equals a fresh run (edge 7)', () => {
  const prefab = node('Seek', system({ speed: [1, 4], life: [0.5, 2], gravity: 1, shape: undefined, em: { rate: 30, dist: 0, bursts: [] } }));
  const snapshot = (effect) => alive(effect).map((p) => [p.id, ...p.pos, p.age]);
  const fresh = play(prefab, 0.5, { seed: 7 });
  const sought = play(prefab, 1, { seed: 7 });
  sought.advanceTo(0.5);
  assert.deepEqual(snapshot(sought), snapshot(fresh));
  assert.ok(snapshot(fresh).length > 5);
  const stepped = createEffect(prefab, { seed: 7 });
  for (let t = 0; t <= 0.5 + 1e-9; t += 0.013) stepped.advanceTo(t);
  stepped.advanceTo(0.5);
  assert.deepEqual(snapshot(stepped), snapshot(fresh));
  assert.notDeepEqual(snapshot(play(prefab, 0.5, { seed: 8 })), snapshot(fresh));
  assert.equal(fresh.time, Math.floor(0.5 / STEP_S + 1e-6) * STEP_S);
});

test('rate over time, the particle cap and the start delay', () => {
  const steady = node('Rate', system({ life: 10, em: { rate: 20, dist: 0, bursts: [] } }));
  assert.equal(alive(play(steady, 0.5)).length, 10);
  assert.equal(alive(play(steady, 3)).length, 20, 'emission stops with the duration');
  const capped = node('Cap', system({ life: 10, max: 7, em: { rate: 20, dist: 0, bursts: [] } }));
  assert.equal(alive(play(capped, 1)).length, 7);
  const late = node('Late', system({ delay: 0.5 }));
  assert.equal(alive(play(late, 0.49)).length, 0);
  assert.equal(alive(play(late, 0.6)).length, 5);
  const empty = node('Empty', system({ em: { rate: 0, dist: 0, bursts: [{ t: 0, n: 0, cycles: 1, interval: 0.01, p: 1 }] } }));
  assert.equal(alive(play(empty, 0.5)).length, 0);
  const never = node('Never', system({ em: { rate: 0, dist: 0, bursts: [{ t: 0, n: 5, cycles: 1, interval: 0.01, p: 0 }] } }));
  assert.equal(alive(play(never, 0.5)).length, 0);
  const repeat = node('Repeat', system({ life: 10, em: { rate: 0, dist: 0, bursts: [{ t: 0.1, n: 2, cycles: 3, interval: 0.2, p: 1 }] } }));
  assert.deepEqual([0.05, 0.2, 0.4, 0.9].map((t) => alive(play(repeat, t)).length), [0, 2, 4, 6]);
});

test('a bad number in the emission ends nothing and hangs nothing', () => {
  const burst = (t, interval) => ({ t, n: 2, cycles: 0, interval, p: 1 });
  const broken = node('Broken', system({ life: 10, em: { rate: Infinity, dist: 0, bursts: [burst(NaN, 0.1), burst(0, NaN), burst(0.1, 0.1)] } }));
  // A burst whose time or interval is not a number never fires; the one every 0.1 s keeps going
  // (at 0.1, 0.2 and 0.3 s), and the endless rate emits nothing.
  assert.equal(alive(play(broken, 0.35)).length, 3 * 2);
});

test('a sub-emitter may feed its own system', () => {
  const self = node('Self', system({ life: 0.2, max: 50, em: { rate: 0, dist: 0, bursts: [{ t: 0, n: 1, cycles: 1, interval: 0.01, p: 1 }] }, sub: [{ id: 's', type: 0, props: 0, p: 1 }] }), { subId: 's' });
  const root = { n: 'Root', p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1], c: [node('Seed', system({ life: 0.2, sub: [{ id: 's', type: 0, props: 0, p: 1 }], em: { rate: 0, dist: 0, bursts: [{ t: 0, n: 1, cycles: 1, interval: 0.01, p: 1 }] } })), self] };
  const effect = play(root, 0.1);
  // Each birth in the fed system starts another emitter there; none is dropped mid-step.
  assert.ok(alive(effect, 1).length >= 3, `${alive(effect, 1).length} particles`);
  assert.ok(alive(effect, 1).length <= 50);
});

test('speed, gravity and the node transform move a particle as Unity would', () => {
  const forward = node('Forward', system({ speed: 2 }));
  const [moved] = alive(play(forward, 0.5));
  assert.ok(Math.abs(moved.pos[2] - 1) < 0.02 && Math.abs(moved.pos[0]) < 1e-9);
  // Hierarchy scaling: a parent's scale stretches positions, speeds and sizes.
  const scaled = { n: 'Root', p: [0, 0, 0], q: [0, 0, 0, 1], s: [3, 3, 3], c: [node('Child', system({ speed: 2, size: 2 }), { p: [1, 0, 0] })] };
  const [child] = alive(play(scaled, 0.5));
  assert.ok(Math.abs(child.pos[0] - 3) < 1e-6 && Math.abs(child.pos[2] - 3) < 0.06);
  assert.deepEqual(child.size, [6, 6, 6]);
  // Local scaling ignores the parent's scale but keeps where the parent put the node.
  const local = { ...scaled, c: [node('Child', system({ speed: 2, size: 2, scaling: 1 }), { p: [1, 0, 0] })] };
  const [own] = alive(play(local, 0.5));
  assert.ok(Math.abs(own.pos[0] - 3) < 1e-6 && Math.abs(own.pos[2] - 1) < 0.02);
  assert.deepEqual(own.size, [2, 2, 2]);
  const falling = node('Fall', system({ gravity: 1 }));
  const [fell] = alive(play(falling, 0.5));
  assert.ok(Math.abs(fell.pos[1] + 0.5 * 9.81 * 0.25) < 0.05, `fell to ${fell.pos[1]}`);
});

test('over-lifetime modules shape size, colour, spin, frame and custom data', () => {
  const ramp = { k: [[0, 0], [1, 1]], s: 1 };
  const prefab = node(
    'Shaped',
    system({
      size: { x: 2, y: 4, z: 1 },
      sizeOL: { x: ramp },
      col: { g: { color: [[0, [1, 1, 1]]], alpha: [[0, 1], [1, 0]] } },
      color: [1, 0.5, 0.25, 1],
      rotOL: { z: 2 },
      uv: { tx: 2, ty: 2, time: 0, frame: ramp, start: 0, cycles: 1, fps: 30, range: [0, 1] },
      custom: [ramp, 0.5, 0, 0],
    })
  );
  const [p] = alive(play(prefab, 0.5));
  const near = (actual, expected, tolerance = 0.02) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
  near(p.size[0], 1);
  near(p.size[1], 2);
  near(p.color[3], 0.5);
  near(p.color[1], 0.5);
  near(p.rot[2], 1);
  assert.equal(p.frame, 2);
  near(p.custom[0], 0.5);
  assert.equal(p.custom[1], 0.5);
  assert.equal(alive(play(prefab, 0.9))[0].frame, 3);
});

test('limit velocity, drag and forces act on the speed', () => {
  const free = alive(play(node('Free', system({ speed: 10 })), 0.5))[0];
  const limited = alive(play(node('Limited', system({ speed: 10, limit: { mag: 1, dampen: 0.5, drag: 0, dragSize: false, dragVel: false } })), 0.5))[0];
  const dragged = alive(play(node('Dragged', system({ speed: 10, limit: { mag: 1000, dampen: 0, drag: 4, dragSize: false, dragVel: false } })), 0.5))[0];
  assert.ok(limited.pos[2] < free.pos[2] * 0.5 && limited.pos[2] > 0.5);
  assert.ok(Math.abs(Math.hypot(...dragged.vel) - 8) < 0.1, 'constant drag takes 4 units/s each second');
  const pushed = alive(play(node('Pushed', system({ force: { x: 2, y: 0, z: 0, world: false } })), 0.5))[0];
  assert.ok(Math.abs(pushed.vel[0] - 1) < 0.02 && Math.abs(pushed.pos[0] - 0.25) < 0.02);
  const drifting = alive(play(node('Drift', system({ vel: { x: 0, y: 3, z: 0, ox: 0, oy: 0, oz: 0, cx: 0, cy: 0, cz: 0, radial: 0, mul: 1, world: false } })), 0.5))[0];
  assert.ok(Math.abs(drifting.pos[1] - 1.5) < 0.03);
  assert.deepEqual(drifting.vel, [0, 0, 0], 'velocity over lifetime does not accumulate');
});

test('sub-emitters fire on a particle birth and death', () => {
  const sub = (id, extra = {}) => node(`Sub${id}`, system({ life: 0.5, em: { rate: 0, dist: 0, bursts: [{ t: 0, n: 3, cycles: 1, interval: 0.01, p: 1 }] }, ...extra }), { subId: id });
  const prefab = node('Parent', system({ life: 0.4, speed: 5, em: { rate: 0, dist: 0, bursts: [{ t: 0, n: 2, cycles: 1, interval: 0.01, p: 1 }] }, sub: [{ id: 'b', type: 0, props: 0, p: 1 }, { id: 'd', type: 2, props: 0, p: 1 }] }), {
    c: [sub('b'), sub('d')],
  });
  const early = play(prefab, 0.1);
  assert.equal(alive(early, 1).length, 6, 'birth sub-emitter: 3 per parent');
  assert.equal(alive(early, 2).length, 0);
  const after = play(prefab, 0.45);
  assert.equal(alive(after, 0).length, 0);
  assert.equal(alive(after, 2).length, 6, 'death sub-emitter: 3 per parent');
  assert.ok(alive(after, 2).every((p) => Math.abs(p.pos[2] - 2) < 0.1), 'born where the parent died');
  assert.ok(Math.abs(play(prefab, 0).duration - (1 + 0.4 + 1 + 0.5)) < 1e-9);
});

test('trails follow their particle and forget old points', () => {
  const prefab = node('Trail', system({ speed: 10, trail: { ratio: 1, life: 0.2, minDist: 0.2, world: true, die: true, sizeWidth: true, inherit: false, width: 1, colorLife: [1, 1, 1, 1], colorTrail: [1, 1, 1, 1] } }));
  const [p] = alive(play(prefab, 0.5));
  assert.ok(p.trail.length >= 8 && p.trail.length <= 11, `${p.trail.length} points`);
  assert.ok(p.trail.every((point) => 0.5 - point.time <= 0.2 + STEP_S));
  assert.ok(p.trail[0].pos[2] < p.trail[p.trail.length - 1].pos[2]);
});

test('all 66 committed prefabs simulate through the game’s 4 s without a bad number', () => {
  let prefabs = 0;
  let peak = 0;
  for (const type of TYPES) {
    const file = JSON.parse(fs.readFileSync(path.join(ASSETS, `${type}.json`), 'utf8'));
    for (const [variant, prefab] of Object.entries(file.prefabs)) {
      const effect = createEffect(prefab, { seed: 3 });
      assert.ok(effect.duration > 0.3 && effect.duration <= GAME_CLEANUP_S, `${type} ${variant}: duration ${effect.duration}`);
      let seen = 0;
      for (let t = 0; t <= effect.duration + 0.05; t += 0.1) {
        effect.advanceTo(t);
        let now = 0;
        for (const entry of effect.systems) {
          now += entry.particles.length;
          assert.ok(entry.particles.length <= entry.spec.max, `${type} ${variant} ${entry.name}: over its cap`);
          for (const p of entry.particles) {
            const numbers = [...p.pos, ...p.vel, ...p.size, ...p.color, ...p.rot, p.age, p.frame, ...(p.custom ?? [])];
            assert.ok(numbers.every(Number.isFinite), `${type} ${variant} ${entry.name} at ${t.toFixed(1)} s: ${numbers}`);
          }
        }
        seen = Math.max(seen, now);
      }
      assert.ok(seen >= 5, `${type} ${variant}: only ${seen} particles at once`);
      peak = Math.max(peak, seen);
      prefabs += 1;
    }
  }
  assert.equal(prefabs, 66);
  assert.ok(peak < 3000, `peak ${peak} particles`);
});
