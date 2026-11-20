// The Tera entry, pure half: the timeline of a Pokémon terastallizing on the board. Light gathers
// into the card as it lifts; crystal points grow in jumps out from under its edge; the cluster
// strains, holds for a beat, and breaks into shards that arc, land and thin out while the Tera
// jewel stands over the card and it drops back wearing its crystal coat. Modelled on TCG Live's
// `Card_Evolution_Tera` prefab (its bokeh, sign, facets and prismatic streaks) with real crystals
// where the prefab lays a facet sheet on the card; the prefab's ray fans are left out.
// DOM- and GL-free: entry.js draws these poses in the three.js board's FX layer.
//
// Lengths are card heights (h); positions are from the card's centre in the stage frame (x right,
// y down the screen, z up off the cloth); angles are degrees; times are ms of the scene.
import { tossHeight, tossReach } from './entry-toss.mjs';
import { seededRandom } from './flow-pose.mjs';

export const TERA_ENTRY_MS = 2500;
/** The cluster breaks here: the evolve sample's measured peak (sfx manifest) is aligned to it. */
export const TERA_BURST_MS = 1300;
/** Everything holds its pose this long at the burst before the shards leave. */
export const TERA_HIT_STOP_MS = 70;
/** The crystal coat starts to form on the card's face when the first points break the cloth. */
export const TERA_COAT_AT_MS = 420;
/** The queue moves on once the shards are in the air; the rest is dissipation. */
export const TERA_HOLD_MS = TERA_BURST_MS + 500;

const GATHER_MS = 420;
const GROW_FROM_MS = 380;
const GROW_SPREAD_MS = 520;
const GROW_MS = 320;
const STRAIN_FROM_MS = 1040;
const RELEASE_MS = TERA_BURST_MS + TERA_HIT_STOP_MS;
const DROP_MS = 130;
const CARD_ASPECT = 0.716;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const span = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeOutBack = (t) => (t <= 0 ? 0 : 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2);
/** Up over [0, peak], down over [peak, 1]. */
const pulse = (t, peak) => (t <= 0 || t >= 1 ? 0 : t <= peak ? t / peak : 1 - (t - peak) / (1 - peak));
/** A damped swing from 1 to 0: one and a half swings, decaying by e⁻³. */
const spring = (t) => Math.cos(Math.PI * 1.5 * t) * Math.exp(-3 * t);

/** Growth in three lurches with a rest after each, as crystal grows: 0 → 1 over u in [0, 1]. */
export function lurch(u) {
  const c = clamp01(u);
  if (c >= 1) return 1;
  const step = Math.floor(c * 3);
  return (step + easeOutCubic(span(c * 3 - step, 0, 0.4))) / 3;
}

/** How hard the cluster strains before it breaks: 0 until the strain begins, 1 at the burst. */
export const teraStrain = (ms) => easeInCubic(span(ms, STRAIN_FROM_MS, TERA_BURST_MS));

const MAIN_POINTS = 10;
const SMALL_POINTS = 7;
const SHARD_SPLITS = Object.freeze({ main: [0.16, 0.5, 0.86], small: [0.3, 0.8] });

function buildPoint(rand, index, count, tier) {
  const main = tier === 'main';
  const angle = ((index + 0.15 + 0.7 * rand()) / count) * TAU + (main ? 0 : Math.PI / count);
  // Where the ray from a card's centre toward `angle` (radians, y down) leaves its outline, in h.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reach = Math.min(CARD_ASPECT / 2 / Math.max(Math.abs(cos), 1e-6), 0.5 / Math.max(Math.abs(sin), 1e-6));
  const edge = { x: cos * reach, y: sin * reach };
  // The root sits a little inside the outline, so the card hides where the point leaves the cloth.
  const inset = main ? 0.9 : 0.84;
  const length = main ? 0.36 + 0.26 * rand() : 0.17 + 0.13 * rand();
  const point = {
    tier,
    seed: 1 + Math.floor(rand() * 997),
    root: { x: edge.x * inset, y: edge.y * inset },
    headingDeg: angle / DEG + (rand() - 0.5) * (main ? 34 : 50),
    elevationDeg: main ? 16 + 24 * rand() : 34 + 22 * rand(),
    rollDeg: rand() * 60,
    length,
    width: main ? 0.12 + 0.07 * rand() : 0.07 + 0.04 * rand(),
    shoulder: 0.52 + 0.26 * rand(),
    // Main points break the cloth first, the small ones fill the gaps after them.
    start: main ? 0.62 * rand() : 0.45 + 0.55 * rand(),
  };
  point.shards = SHARD_SPLITS[tier].map((along) => ({
    along,
    seed: 1 + Math.floor(rand() * 997),
    turnDeg: (rand() - 0.5) * 70,
    speed: (0.55 + 1.25 * along) * (0.7 + 0.6 * rand()),
    up: 0.9 + 1.3 * rand(),
    spinDeg: (rand() - 0.5) * 900,
    tumbleDeg: (rand() - 0.5) * 700,
    size: 0.3 + 0.14 * rand(),
    fadeLag: rand(),
  }));
  return point;
}

/**
 * Everything random about one entry, fixed by `seed`: the crystal points round the card, the
 * bokeh and glitter that gather into it, the sparks of the burst.
 * @returns {{ points: object[], bokeh: object[], motes: object[], sparks: object[] }}
 */
export function buildTeraCluster(seed = 1) {
  const rand = seededRandom(seed);
  const count = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  return {
    points: [
      ...count(MAIN_POINTS, (i) => buildPoint(rand, i, MAIN_POINTS, 'main')),
      ...count(SMALL_POINTS, (i) => buildPoint(rand, i, SMALL_POINTS, 'small')),
    ],
    bokeh: count(7, (i) => ({
      angle: (i / 7) * TAU + rand() * 0.6,
      from: 0.95 + 0.55 * rand(),
      height: 0.35 + 0.45 * rand(),
      size: 0.16 + 0.16 * rand(),
      frame: Math.floor(rand() * 2),
      lag: i * 34 + rand() * 30,
      turnDeg: rand() * 360,
    })),
    motes: count(18, (i) => ({
      angle: rand() * TAU,
      from: 0.7 + 0.75 * rand(),
      height: 0.2 + 0.7 * rand(),
      swirl: (rand() < 0.5 ? -1 : 1) * (0.6 + 0.8 * rand()),
      size: 0.07 + 0.07 * rand(),
      frame: 1 + Math.floor(rand() * 3),
      lag: 60 + i * 26 + rand() * 30,
    })),
    sparks: count(22, () => ({
      angle: rand() * TAU,
      reach: 0.55 + 0.75 * rand(),
      up: 0.5 + 0.9 * rand(),
      size: 0.08 + 0.1 * rand(),
      frame: Math.floor(rand() * 4),
      life: 0.55 + 0.45 * rand(),
      phase: rand() * TAU,
    })),
  };
}

/**
 * The card's own motion: it lifts as the light gathers, rises and trembles as the cluster
 * strains, holds at the burst, drops and settles on a damped spring.
 * @returns {{ lift: number, scale: number, yawDeg: number }} lift in h
 */
export function teraCardPose(ms) {
  const strain = teraStrain(ms);
  if (ms < RELEASE_MS) {
    const hold = Math.min(ms, TERA_BURST_MS);
    return {
      lift: 0.11 * easeOutCubic(span(hold, 0, GATHER_MS)) + 0.06 * span(hold, GATHER_MS, TERA_BURST_MS),
      scale: 1 + 0.035 * easeOutCubic(span(hold, 0, GATHER_MS)) + 0.02 * strain,
      yawDeg: ms < TERA_BURST_MS ? Math.sin(ms * 0.085) * 1.4 * strain : 0,
    };
  }
  const drop = span(ms, RELEASE_MS, RELEASE_MS + DROP_MS);
  const settle = span(ms, RELEASE_MS + DROP_MS, RELEASE_MS + DROP_MS + 460);
  return {
    lift: 0.17 * (1 - easeInCubic(drop)),
    scale: drop < 1 ? lerp(1.055, 0.95, drop) : 1 - 0.05 * spring(settle),
    yawDeg: 0,
  };
}

/**
 * One crystal point at `ms`: null before it breaks the cloth and once the cluster has burst.
 * `glow` (0–1) is how hard it shines under the strain.
 * @returns {{ length: number, width: number, headingDeg: number, glow: number } | null}
 */
export function teraPointPose(point, ms) {
  if (ms >= RELEASE_MS) return null;
  const start = GROW_FROM_MS + point.start * GROW_SPREAD_MS;
  const grown = lurch(span(Math.min(ms, TERA_BURST_MS), start, start + GROW_MS));
  if (!(grown > 0)) return null;
  const strain = teraStrain(ms);
  const shiver = ms < TERA_BURST_MS ? Math.sin(ms * 0.11 + point.seed) * 2.2 * strain : 0;
  return {
    length: point.length * grown * (1 + 0.07 * strain),
    // A bud is nearly as thick as the grown point: it swells out, then reaches.
    width: point.width * (0.5 + 0.5 * grown),
    headingDeg: point.headingDeg + shiver,
    glow: strain,
  };
}

/**
 * One shard of a point after the burst: thrown out along its point and up, it falls under gravity,
 * takes one low bounce, comes to rest lying on the cloth and dissolves. Null before the release
 * and once it is gone. Positions from the card's centre, in h.
 * @returns {{ x: number, y: number, z: number, headingDeg: number, elevationDeg: number,
 *   rollDeg: number, length: number, width: number, dissolve: number } | null}
 */
export function teraShardPose(point, shard, ms) {
  const t = (ms - RELEASE_MS) / 1000;
  if (!(t >= 0)) return null;
  // The last shard is gone before the scene ends.
  const fadeFrom = 0.45 + 0.25 * shard.fadeLag;
  const dissolve = span(t, fadeFrom, fadeFrom + 0.4);
  if (dissolve >= 1) return null;
  const heading = point.headingDeg * DEG;
  const elevation = point.elevationDeg * DEG;
  const reach = point.length * shard.along;
  const x0 = point.root.x + Math.cos(heading) * Math.cos(elevation) * reach;
  const y0 = point.root.y + Math.sin(heading) * Math.cos(elevation) * reach;
  const z0 = Math.sin(elevation) * reach + 0.02;
  const { z, flight, hop, airborne } = tossHeight(t, z0, shard.up);
  const out = tossReach(t, shard.speed, flight + hop);
  const throwAngle = heading + shard.turnDeg * DEG;
  const spun = Math.min(t, flight + hop * 0.5);
  const settle = easeOutCubic(span(t, flight, flight + hop + 0.12));
  return {
    x: x0 + Math.cos(throwAngle) * out,
    y: y0 + Math.sin(throwAngle) * out,
    z: z + 0.012,
    headingDeg: point.headingDeg + shard.spinDeg * spun,
    elevationDeg: lerp(point.elevationDeg + (airborne ? shard.tumbleDeg * spun : 0), 3, settle),
    rollDeg: point.rollDeg + shard.spinDeg * 0.7 * spun,
    length: point.length * shard.size * (1 - 0.3 * dissolve),
    width: point.width * 0.72 * (1 - 0.3 * dissolve),
    dissolve,
  };
}

/**
 * The light of the scene: `pool` is the halo on the cloth round the card (it swells and dies with
 * the burst; no ring is drawn on the cloth), `sign` the Tera jewel over the card (`rise` in h off
 * the cloth, `heat` the first moment its cut lines burn).
 */
export function teraLightPose(ms) {
  const strain = teraStrain(ms);
  const after = span(ms, TERA_BURST_MS, TERA_BURST_MS + 620);
  return {
    pool: {
      alpha: ms < TERA_BURST_MS ? span(ms, 0, 320) * (0.5 + 0.4 * strain) : 0.95 * (1 - easeOutCubic(after)),
      scale: 1 + 0.05 * strain + 0.1 * easeOutCubic(after),
    },
    sign: {
      scale: lerp(0.5, 1, easeOutBack(span(ms, TERA_BURST_MS, TERA_BURST_MS + 220))) * (1 - 0.12 * easeInCubic(span(ms, TERA_BURST_MS + 480, TERA_BURST_MS + 900))),
      alpha: span(ms, TERA_BURST_MS, TERA_BURST_MS + 50) * (1 - easeInCubic(span(ms, TERA_BURST_MS + 430, TERA_BURST_MS + 900))),
      rise: 0.3 + 0.22 * easeOutCubic(span(ms, TERA_BURST_MS, TERA_BURST_MS + 900)),
      heat: 1 - span(ms, TERA_BURST_MS, TERA_BURST_MS + 200),
    },
  };
}

/**
 * One hex bokeh of the gathering light: it starts wide and high and falls into the card.
 * @returns {{ x: number, y: number, z: number, size: number, alpha: number, rotation: number } | null}
 */
export function teraBokehPose(bokeh, ms) {
  const u = span(ms, bokeh.lag, bokeh.lag + 560);
  if (u <= 0 || u >= 1) return null;
  const radius = lerp(bokeh.from, 0.1, easeInCubic(u));
  return {
    x: Math.cos(bokeh.angle) * radius,
    y: Math.sin(bokeh.angle) * radius,
    z: lerp(bokeh.height, 0.16, u),
    size: bokeh.size * lerp(1, 0.45, u),
    alpha: pulse(u, 0.3) * 0.85,
    rotation: bokeh.turnDeg + 40 * u,
  };
}

/**
 * One glitter mote of the gathering light: it spirals in and down onto the card.
 * @returns {{ x: number, y: number, z: number, size: number, alpha: number } | null}
 */
export function teraMotePose(mote, ms) {
  const u = span(ms, mote.lag, mote.lag + 620);
  if (u <= 0 || u >= 1) return null;
  const radius = lerp(mote.from, 0.14, easeInCubic(u));
  const angle = mote.angle + mote.swirl * easeInCubic(u) * 2.4;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: lerp(mote.height, 0.14, u),
    size: mote.size * lerp(1.2, 0.6, u),
    alpha: pulse(u, 0.35) * (0.7 + 0.3 * Math.sin(ms * 0.03 + mote.angle * 5)),
  };
}

/**
 * One spark of the burst: thrown out and up from the card, it arcs back to the cloth, twinkling.
 * @returns {{ x: number, y: number, z: number, size: number, alpha: number } | null}
 */
export function teraSparkPose(spark, ms) {
  const u = span(ms, RELEASE_MS, RELEASE_MS + 900 * spark.life);
  if (u <= 0 || u >= 1) return null;
  const out = 0.3 + spark.reach * easeOutCubic(u);
  return {
    x: Math.cos(spark.angle) * out,
    y: Math.sin(spark.angle) * out,
    z: 0.12 + spark.up * 4 * u * (1 - u),
    size: spark.size * (1 - 0.5 * u),
    alpha: (1 - easeInCubic(u)) * (0.6 + 0.4 * Math.sin(ms * 0.045 + spark.phase)),
  };
}

/**
 * The prismatic streak that leaves a main point's tip as it breaks: `length` in h along the
 * point's heading, from `at` (0 the tip … 1 a streak length beyond it).
 * @returns {{ length: number, alpha: number, at: number } | null}
 */
export function teraStreakPose(ms) {
  const u = span(ms, TERA_BURST_MS, TERA_BURST_MS + 300);
  if (u <= 0 || u >= 1) return null;
  return { length: lerp(0.3, 0.6, easeOutCubic(u)), alpha: pulse(u, 0.2), at: easeOutCubic(u) * 0.5 };
}

/** Where star glints twinkle on the settled card's rim: card widths / heights from its centre, and a lag (ms). */
export const TERA_RIM_GLINTS = Object.freeze([
  [-0.56, -0.36, 0],
  [0.55, -0.2, 110],
  [0.4, 0.52, 200],
  [-0.5, 0.28, 300],
  [0.02, -0.56, 380],
]);

/**
 * One rim glint after the card has landed: it flares, turns and shrinks away.
 * @returns {{ size: number, alpha: number, rotation: number } | null}
 */
export function teraRimGlintPose(lagMs, ms) {
  const u = span(ms, RELEASE_MS + 180 + lagMs, RELEASE_MS + 180 + lagMs + 520);
  if (u <= 0 || u >= 1) return null;
  const pop = Math.sin(Math.PI * u);
  return { size: 0.3 * pop, alpha: pop, rotation: 45 * u };
}
