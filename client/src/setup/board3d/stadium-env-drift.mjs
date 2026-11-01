// Design 083: ambient drift, the life in the air over a Stadium board. Leaves and petals tumbling
// down, snow, dust motes, fireflies, embers, glints, confetti, seed fluff, ash and steam: one
// GPU-driven point shader, one material per drift a board lists in BOARD_DRIFT (its kind, count and
// colours). A particle lives a few seconds and is born again somewhere new: over the whole scene, or
// from a board's emitters (a crown's leaves, a vent's steam). Every frame is a function of uTime, so
// reduced motion freezes it. It never shows over a card: it fades as the ground point it covers on
// screen (the eye's ray through it, met with the cloth) nears a card (D232, the user's "never over
// cards").
import { FOOTPRINTS, NOISE, OUTPUT, REVEAL, TABLE_UNIFORMS } from './stadium-environment-glsl.mjs';
import { paint } from './stadium-kit.mjs';
import { visibleArea } from './stadium-env-spots.mjs';

/** The most emitters a drift can spawn from (vec4 uniforms). */
export const MAX_EMITTERS = 12;

const SHAPES = Object.freeze({ leaf: 0, petal: 1, dot: 2, glow: 3, star: 4, fleck: 5, fluff: 6, puff: 7 });

/**
 * Each kind: its `shape` and `blend`; `size` [min, max] px; `life` [min, max] s; `z` [min, max] px
 * (the heights it is born between, without emitters); `fall` px/s (negative rises); `sway` px (a
 * slow side-to-side swing); `spin` rad/s; `wander` px (a slow random drift); `twinkle` 0..1 (how much
 * a glowing kind breathes).
 */
export const DRIFT_KINDS = Object.freeze({
  leaf: { shape: 'leaf', blend: 'normal', size: [5, 8], life: [7, 11], z: [60, 200], fall: 18, sway: 16, spin: 1.2, wander: 4, twinkle: 0 },
  petal: { shape: 'petal', blend: 'normal', size: [3.5, 5.5], life: [8, 13], z: [40, 170], fall: 12, sway: 20, spin: 1.6, wander: 6, twinkle: 0 },
  snow: { shape: 'dot', blend: 'normal', size: [2.8, 5], life: [9, 14], z: [40, 240], fall: 16, sway: 9, spin: 0, wander: 6, twinkle: 0 },
  mote: { shape: 'glow', blend: 'additive', size: [2, 3.4], life: [6, 10], z: [10, 120], fall: -3, sway: 6, spin: 0, wander: 12, twinkle: 0.5 },
  firefly: { shape: 'glow', blend: 'additive', size: [2.8, 4.4], life: [6, 10], z: [8, 70], fall: -2, sway: 5, spin: 0, wander: 28, twinkle: 1 },
  ember: { shape: 'glow', blend: 'additive', size: [1.8, 3.2], life: [3, 6], z: [4, 40], fall: -30, sway: 8, spin: 0, wander: 6, twinkle: 0.6 },
  glint: { shape: 'star', blend: 'additive', size: [3.5, 6.5], life: [4, 7], z: [10, 140], fall: -5, sway: 5, spin: 0.4, wander: 8, twinkle: 1 },
  confetti: { shape: 'fleck', blend: 'normal', size: [3.5, 5.5], life: [6, 9], z: [60, 230], fall: 24, sway: 14, spin: 3, wander: 4, twinkle: 0 },
  fluff: { shape: 'fluff', blend: 'normal', size: [3, 5], life: [10, 15], z: [20, 120], fall: 2, sway: 12, spin: 0.3, wander: 16, twinkle: 0 },
  ash: { shape: 'dot', blend: 'normal', size: [1.8, 3.2], life: [8, 12], z: [30, 200], fall: 7, sway: 10, spin: 0, wander: 6, twinkle: 0 },
  steam: { shape: 'puff', blend: 'normal', size: [10, 20], life: [3, 5], z: [0, 20], fall: -16, sway: 6, spin: 0, wander: 5, twinkle: 0 },
});

/**
 * What drifts over each board: { kind, count, colours: ≤4 '#rrggbb' as they show on screen,
 * wind?: [x, y] px/s, emitters?: true (the board's spots give `driftEmitters`) }.
 */
export const BOARD_DRIFT = Object.freeze({
  'forest-of-vitality': [
    { kind: 'leaf', count: 26, colours: ['#7cc443', '#a8d84a', '#4f9e3a', '#d8d04a'], wind: [6, -2], emitters: true },
    { kind: 'leaf', count: 30, colours: ['#7cc443', '#a8d84a', '#d8d04a'], wind: [6, -2] },
  ],
  'grand-tree': [
    { kind: 'leaf', count: 28, colours: ['#6fbf45', '#9fd24a', '#e0b040', '#4b9a3c'], wind: [7, -3], emitters: true },
    { kind: 'leaf', count: 30, colours: ['#6fbf45', '#e0b040', '#9fd24a'], wind: [7, -3] },
  ],
  'perilous-jungle': [{ kind: 'firefly', count: 40, colours: ['#d8ff6a', '#8cffb0'] }],
  'fairy-garden': [{ kind: 'petal', count: 64, colours: ['#ffd0e6', '#ffffff', '#f6a8cf'], wind: [5, -2] }],
  'mystery-garden': [{ kind: 'petal', count: 50, colours: ['#e6c8ff', '#ffffff', '#c8a8f0'], wind: [4, -2] }],
  'old-cemetery': [
    { kind: 'firefly', count: 30, colours: ['#9ff6e6', '#c8fff0'] },
    { kind: 'leaf', count: 26, colours: ['#a87c46', '#8a6a3c', '#c49a5a'], wind: [8, -2] },
  ],
  'surfing-beach': [],
  'brooklet-hill': [{ kind: 'leaf', count: 32, colours: ['#7cc443', '#a8d84a', '#d8d04a'], wind: [6, -2] }],
  'dimension-valley': [{ kind: 'glint', count: 46, colours: ['#ffe680', '#a0f0ff', '#ffa8e0', '#b8ff9a'] }],
  'stormy-mountains': [{ kind: 'snow', count: 140, colours: ['#ffffff', '#e8f2ff'], wind: [10, -3] }],
  'mountain-ring': [{ kind: 'mote', count: 50, colours: ['#e8d4a8', '#f4e6c4'], wind: [16, -4] }],
  'crystal-cave': [{ kind: 'glint', count: 44, colours: ['#ffd0f0', '#b8ecff', '#d8c8ff', '#c8ffe0'] }],
  'magnetic-storm': [{ kind: 'mote', count: 46, colours: ['#8ff0ff', '#ffb0f0'] }],
  'scorched-earth': [{ kind: 'ash', count: 70, colours: ['#8a8480', '#b0a8a0', '#5e5854'], wind: [9, 2] }],
  'magma-basin': [],
  'lumiose-city': [{ kind: 'leaf', count: 30, colours: ['#7cc443', '#a8d84a', '#e0b040'], wind: [6, -2], emitters: true }],
  'community-center': [{ kind: 'fluff', count: 40, colours: ['#ffffff', '#f4f0e0'], wind: [9, -3] }],
  levincia: [{ kind: 'confetti', count: 90, colours: ['#ffd23c', '#4cc8ff', '#ff6fb0', '#ffffff'], wind: [5, -2] }],
  'dark-city': [{ kind: 'steam', count: 16, colours: ['#c8cce0', '#a8acc4'], wind: [6, 2], emitters: true }],
  'pokemon-center': [{ kind: 'mote', count: 48, colours: ['#fff0c8', '#ffe2b0'] }],
  'shopping-center': [{ kind: 'confetti', count: 40, colours: ['#ff8fc0', '#ffd860', '#8fd8ff', '#c8a8ff'], wind: [3, -1] }],
  'full-metal-lab': [{ kind: 'steam', count: 18, colours: ['#e8eef4', '#c8d4e0'], wind: [4, 1], emitters: true }],
  'fighting-stadium': [{ kind: 'confetti', count: 90, colours: ['#ffd23c', '#ff5050', '#50a0ff', '#ffffff'], wind: [4, -2] }],
  'neutralization-zone': [{ kind: 'mote', count: 50, colours: ['#a0f0ff', '#d0f8ff'] }],
  'steel-shelter': [{ kind: 'mote', count: 44, colours: ['#e0ecff', '#ffffff'] }],
});

const vec4Of = (three, values) => new three.Vector4(...values);

/** A drift's own uniforms, from its kind and spec. */
function driftUniforms(three, kindName, spec) {
  const kind = DRIFT_KINDS[kindName];
  if (!kind) throw new Error(`unknown Stadium drift kind: ${kindName}`);
  const colours = (spec.colours?.length ? spec.colours : ['#ffffff']).slice(0, 4).map((hex) => paint(hex, 2).slice(0, 3));
  while (colours.length < 4) colours.push(colours[colours.length - 1]);
  const wind = Array.isArray(spec.wind) && spec.wind.every(Number.isFinite) ? spec.wind : [0, 0];
  return {
    uDriftA: { value: vec4Of(three, [kind.fall, kind.sway, kind.spin, kind.wander]) },
    uDriftB: { value: vec4Of(three, [kind.size[0], kind.size[1], kind.life[0], kind.life[1]]) },
    uDriftC: { value: vec4Of(three, [kind.z[0], kind.z[1], kind.twinkle, SHAPES[kind.shape]]) },
    uWind: { value: new three.Vector2(wind[0], wind[1]) },
    uDriftColours: { value: colours.map((c) => new three.Vector3(...c)) },
    uDriftColourCount: { value: Math.min(4, Math.max(1, spec.colours?.length ?? 1)) },
    uEmitters: { value: Array.from({ length: MAX_EMITTERS }, () => new three.Vector4()) },
    uEmitterCount: { value: 0 },
    uDriftArea: { value: new three.Vector4(0, 0, 0, 0) },
    uDriftAvoid: { value: new three.Vector4(0, 0, 0, 0) },
  };
}

export const DRIFT_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
uniform vec3 uEye;
${NOISE}
${FOOTPRINTS}
${REVEAL}
uniform vec4 uDriftA;
uniform vec4 uDriftB;
uniform vec4 uDriftC;
uniform vec2 uWind;
uniform float uDriftColourCount;
uniform vec4 uEmitters[${MAX_EMITTERS}];
uniform int uEmitterCount;
// Where a particle is born without emitters (x, y, w, h): the part of the scene the camera sees; zero
// width falls back to the whole scene.
uniform vec4 uDriftArea;
// A box no particle shows over (x0, y0, x1, y1: the opponent's fanned hand); zero size: none.
uniform vec4 uDriftAvoid;
attribute vec4 aSeed;
varying float vAlpha;
varying float vSpin;
varying float vColour;
varying float vGlow;
float avoidGap(vec2 p) {
  if (uDriftAvoid.z <= uDriftAvoid.x) return 100000.0;
  return length(max(max(uDriftAvoid.xy - p, p - uDriftAvoid.zw), 0.0));
}
void main() {
  float life = mix(uDriftB.z, uDriftB.w, aSeed.w);
  float clock = uTime + aSeed.z * life * 7.0;
  float t = fract(clock / life);
  float cycle = floor(clock / life);
  vec2 h = hash22(aSeed.xy * 91.0 + cycle * 1.7);
  vec2 areaMin = uDriftArea.z > 0.0 ? uDriftArea.xy : uMin;
  vec2 areaSize = uDriftArea.z > 0.0 ? uDriftArea.zw : uSize;
  vec2 start = areaMin + h * areaSize;
  // Born off the cards: the first of a few tries that clears them, so the life is in the margins.
  for (int k = 1; k < 6; k++) {
    if (fieldCalm(start, 140.0) < 0.01 && avoidGap(start) > 80.0) break;
    start = areaMin + hash22(aSeed.xy * 91.0 + cycle * 1.7 + float(k) * 17.3) * areaSize;
  }
  float z0 = mix(uDriftC.x, uDriftC.y, fract(h.x * 5.3 + h.y * 2.1));
  if (uEmitterCount > 0) {
    float pick = floor(fract(h.x * 13.7 + aSeed.y) * float(uEmitterCount));
    vec4 emitter = uEmitters[0];
    for (int i = 0; i < ${MAX_EMITTERS}; i++) {
      if (i >= uEmitterCount) break;
      if (float(i) == pick) emitter = uEmitters[i];
    }
    float angle = h.y * 6.2831853;
    start = emitter.xy + vec2(cos(angle), sin(angle)) * sqrt(fract(h.x * 7.1)) * emitter.z;
    z0 = emitter.w * mix(0.75, 1.1, fract(h.y * 3.1));
  }
  float age = t * life;
  float phase = aSeed.x * 6.2831853;
  vec2 pos = start + uWind * age;
  pos += uDriftA.y * vec2(sin(age * 1.3 + phase), sin(age * 0.9 + phase * 1.7)) * smoothstep(0.0, 1.5, age);
  pos += uDriftA.w * 2.0 * (vec2(gnoise(vec2(age * 0.25, aSeed.y * 40.0)), gnoise(vec2(aSeed.x * 40.0, age * 0.25))) - 0.5);
  float z = max(z0 - uDriftA.x * age, 0.0);
  vec3 world = vec3(pos, z);
  // The ground point it covers on screen: the eye's ray through it, met with the cloth.
  vec2 covered = world.xy;
  if (uEye.z > 1.0) covered = uEye.xy + (world.xy - uEye.xy) * (uEye.z / max(uEye.z - world.z, 1.0));
  float clear = (1.0 - smoothstep(0.02, 0.3, fieldCalm(covered, 110.0))) * smoothstep(20.0, 70.0, avoidGap(covered));
  vec2 inner = min(pos - uMin, uMin + uSize - pos);
  float inside = smoothstep(0.0, 30.0, min(inner.x, inner.y));
  float fade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.82, 1.0, t));
  // A falling kind vanishes as it lands; a rising one fades as it climbs past its height.
  float landed = uDriftA.x > 0.0 ? smoothstep(0.0, 6.0, z) : 1.0 - smoothstep(0.75, 1.0, (z - z0) / max(-uDriftA.x * life, 1.0));
  vAlpha = fade * clear * inside * landed * revealBurned(pos) * exitKeep(pos);
  vSpin = phase + age * uDriftA.z * (aSeed.z > 0.5 ? 1.0 : -1.0);
  vColour = floor(fract(aSeed.w * 7.3 + aSeed.x) * uDriftColourCount);
  vGlow = mix(1.0, 0.55 + 0.45 * sin(uTime * (2.0 + 3.0 * aSeed.z) + phase * 3.0), uDriftC.z);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizePx = mix(uDriftB.x, uDriftB.y, aSeed.y);
  gl_PointSize = vAlpha > 0.003 ? max(sizePx * uFocal / -mv.z, 1.5) * 2.0 : 0.0;
}
`;

export const DRIFT_FRAGMENT = /* glsl */ `
uniform vec4 uDriftC;
uniform vec3 uDriftColours[4];
varying float vAlpha;
varying float vSpin;
varying float vColour;
varying float vGlow;
void main() {
  // The sprite is twice the particle's size; its shape fills most of it (radius 1 here).
  vec2 q = (gl_PointCoord * 2.0 - 1.0) * 1.15;
  float c = cos(vSpin);
  float s = sin(vSpin);
  vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec3 colour = uDriftColours[0];
  if (vColour > 0.5) colour = uDriftColours[1];
  if (vColour > 1.5) colour = uDriftColours[2];
  if (vColour > 2.5) colour = uDriftColours[3];
  float shape = uDriftC.w;
  float alpha = 0.0;
  vec3 tone = colour;
  float tumble = abs(cos(vSpin * 0.7));
  if (shape < 0.5) {
    // A leaf: an almond, tumbling, a darker midrib.
    vec2 l = vec2(r.x, r.y / max(0.42 * (0.35 + 0.65 * tumble), 0.08));
    float d = length(vec2(l.x, l.y * (1.0 + 0.35 * l.x)));
    alpha = 1.0 - smoothstep(0.85, 1.0, d);
    tone = colour * (0.82 + 0.28 * tumble) * (1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.12, abs(r.y))) * step(abs(r.x), 0.9));
  } else if (shape < 1.5) {
    // A petal: a rounded oval with a notch at its tip.
    vec2 p = vec2(r.x * 0.85, r.y / max(0.6 * (0.4 + 0.6 * tumble), 0.1));
    float notch = (1.0 - smoothstep(0.0, 0.25, abs(r.y))) * smoothstep(0.55, 0.9, r.x);
    alpha = (1.0 - smoothstep(0.8, 1.0, length(p))) * (1.0 - notch);
    tone = colour * (0.85 + 0.2 * tumble);
  } else if (shape < 2.5) {
    alpha = 1.0 - smoothstep(0.55, 1.0, length(q));
  } else if (shape < 3.5) {
    float d = length(q);
    alpha = clamp((1.0 - smoothstep(0.25, 0.5, d)) + exp(-d * d * 2.5) * 0.55, 0.0, 1.0) * vGlow;
  } else if (shape < 4.5) {
    float core = 1.0 - smoothstep(0.15, 0.4, length(q));
    float rays = exp(-abs(r.x) * 9.0) * exp(-abs(r.y) * 1.6) + exp(-abs(r.y) * 9.0) * exp(-abs(r.x) * 1.6);
    alpha = clamp(core + rays * 0.8, 0.0, 1.0) * vGlow;
  } else if (shape < 5.5) {
    // Confetti: a little card tumbling, lit on its flat.
    vec2 b = abs(vec2(r.x, r.y / max(tumble, 0.12)));
    alpha = (1.0 - smoothstep(0.75, 0.85, b.x)) * (1.0 - smoothstep(0.42, 0.52, b.y));
    tone = colour * (0.7 + 0.4 * tumble);
  } else if (shape < 6.5) {
    // Seed fluff: a soft puff round a bright core.
    float d = length(q);
    alpha = (1.0 - smoothstep(0.15, 0.3, d)) * 0.9 + (1.0 - smoothstep(0.3, 1.0, d)) * 0.45;
  } else {
    // Steam: a soft puff, thinning as it climbs (vAlpha carries the fade).
    float d = length(q);
    alpha = (1.0 - smoothstep(0.2, 1.0, d)) * 0.45;
  }
  alpha *= vAlpha;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(tone, alpha);
${OUTPUT}
}
`;

/**
 * The drifts a board lists (BOARD_DRIFT[key]), as three.js points: one material per drift, sharing
 * the board's uniforms (`kit.material`). `setEmitters(list)` gives the drifts that spawn from
 * emitters their discs: { x, y, r, z } (z: the height they are born at), the first MAX_EMITTERS.
 * @param {{ three: typeof import('three'), material: Function, seeded: (count: number) => import('three').BufferGeometry }} kit
 * @param {{ kind: string, count: number, colours?: string[], wind?: number[], emitters?: boolean }[]} specs
 */
export function createDrift({ three, material, seeded }, specs = []) {
  const objects = [];
  const materials = [];
  const emitting = [];
  for (const spec of specs ?? []) {
    const own = driftUniforms(three, spec.kind, spec);
    const additive = DRIFT_KINDS[spec.kind].blend === 'additive';
    const made = material(
      DRIFT_VERTEX,
      DRIFT_FRAGMENT,
      { transparent: true, depthWrite: false, blending: additive ? three.AdditiveBlending : three.NormalBlending },
      own
    );
    const count = Number.isFinite(spec.count) ? Math.max(0, Math.min(200, Math.floor(spec.count))) : 0;
    if (count === 0) continue;
    const points = new three.Points(seeded(count), made);
    points.renderOrder = 3;
    points.name = `stadium-drift-${spec.kind}`;
    objects.push(points);
    materials.push(made);
    if (spec.emitters) emitting.push(own);
  }
  const setEmitters = (list) => {
    const discs = (Array.isArray(list) ? list : []).filter((e) => [e?.x, e?.y, e?.r, e?.z].every(Number.isFinite)).slice(0, MAX_EMITTERS);
    for (const own of emitting) {
      discs.forEach((e, i) => own.uEmitters.value[i].set(e.x, e.y, Math.max(0, e.r), Math.max(0, e.z)));
      own.uEmitterCount.value = discs.length;
    }
  };
  const owns = materials.map((made) => made.uniforms);
  /** The box no particle shows over ({ x, y, w, h }: the opponent's hand; null: none). */
  const setAvoid = (box) => {
    const valid = box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
    for (const own of owns) own.uDriftAvoid.value.set(valid ? box.x : 0, valid ? box.y : 0, valid ? box.x + box.w : 0, valid ? box.y + box.h : 0);
  };
  /** Where particles without emitters are born ({ x, y, w, h }; null: the whole scene). */
  const setArea = (box) => {
    const valid = box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
    for (const own of owns) own.uDriftArea.value.set(valid ? box.x : 0, valid ? box.y : 0, valid ? box.w : 0, valid ? box.h : 0);
  };
  return { objects, materials, setEmitters, setArea, setAvoid };
}

/** Where drift without emitters is born: the scene the camera presets see (visibleArea). */
export const driftArea = (table, scene, grow = 0.12) => visibleArea(table, scene, grow);
