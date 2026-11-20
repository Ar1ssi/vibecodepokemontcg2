// The Mega entry, pure half: the timeline of a Pokémon Mega Evolving on the board. The card lifts
// and braces as its rim lights and energy streaks into it; comets of orange and blue spiral in and
// close a turning shell of energy round it; the shell spins up, light cracks spread over it and it
// strains; it holds for a beat and bursts into pieces that arc and fall while the card slams back
// down and settles. Modelled on TCG Live's `CardVFX_OnEntry_ME01` prefab (its card glow, bubble,
// sparkles and their colours); the prefab's 4.4-card-high glow flash and its shockwave are left out.
// DOM- and GL-free: mega-entry.js draws these poses in the three.js board's FX layer.
//
// Lengths are card heights (h); positions are from the card's centre in the stage frame (x right,
// y down the screen, z up off the cloth); angles are radians unless named Deg; times are ms.
import { tossHeight, tossReach } from './entry-toss.mjs';
import { seededRandom } from './flow-pose.mjs';

export const MEGA_ENTRY_MS = 2550;
/** The shell bursts here: the evolve sample's measured peak (sfx manifest) is aligned to it. */
export const MEGA_BURST_MS = 1350;
/** Everything holds its pose this long at the burst before the pieces leave. */
export const MEGA_HIT_STOP_MS = 70;
/** The queue moves on once the pieces are in the air; the rest is dissipation. */
export const MEGA_HOLD_MS = MEGA_BURST_MS + 520;

/** The prefab's colours (its Dissolve_A material), 0–255: the shell's two tones, its veins, its rim. */
export const MEGA_PALETTE = Object.freeze({
  deep: [96, 22, 178],
  body: [236, 34, 150],
  hot: [255, 150, 40],
  rim: [70, 150, 255],
});

/** The shell's radius: it clears the card's corners (0.62 h from its centre) with room to spare. */
export const MEGA_SHELL_RADIUS = 0.8;
/** How high the shell's centre rides over the cloth. */
const SHELL_Z = 0.22;
const IGNITE_MS = 420;
const SHELL_FROM_MS = 360;
const SHELL_GROWN_MS = 860;
const CRACK_FROM_MS = 980;
const RELEASE_MS = MEGA_BURST_MS + MEGA_HIT_STOP_MS;
const DROP_MS = 120;
const TAU = Math.PI * 2;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const span = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const pulse = (t, peak) => (t <= 0 || t >= 1 ? 0 : t <= peak ? t / peak : 1 - (t - peak) / (1 - peak));
const spring = (t) => Math.cos(Math.PI * 1.5 * t) * Math.exp(-3 * t);

/** How hard the shell strains before it bursts: 0 until the cracks start, 1 at the burst. */
export const megaStrain = (ms) => easeInCubic(span(ms, CRACK_FROM_MS, MEGA_BURST_MS));

/**
 * Everything random about one entry, fixed by `seed`: the motes that streak in, the comets that
 * close the shell, the pieces it breaks into, the sparkles and wisps of the burst.
 */
export function buildMegaScene(seed = 1) {
  const rand = seededRandom(seed);
  const count = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  return {
    seed: 1 + Math.floor(rand() * 97),
    motes: count(16, (i) => ({
      angle: rand() * TAU,
      from: 0.9 + 0.8 * rand(),
      height: 0.15 + 0.5 * rand(),
      lag: i * 22 + rand() * 30,
      size: 0.07 + 0.06 * rand(),
      warm: rand() < 0.5,
    })),
    comets: count(3, (i) => ({
      phase: (i / 3) * TAU + rand() * 0.5,
      // Shallow: at the ring's low side it still clears the cloth.
      tilt: (0.12 + 0.09 * rand()) * (i % 2 ? -1 : 1),
      turn: rand() * Math.PI,
      spin: i % 2 ? -1 : 1,
      warm: i % 2 === 0,
    })),
    pieces: count(16, () => {
      const around = rand() * TAU;
      const lift = 0.15 + 0.75 * rand();
      return {
        around,
        lift,
        seed: 1 + Math.floor(rand() * 997),
        speed: 0.9 + 1.5 * rand(),
        up: 0.7 + 1.5 * rand(),
        size: 0.045 + 0.05 * rand(),
        stretch: 1.4 + 1.4 * rand(),
        spin: (rand() - 0.5) * 16,
        fadeLag: rand(),
        deep: rand() < 0.4,
      };
    }),
    sparkles: count(30, () => ({
      angle: rand() * TAU,
      from: 0.5 + 0.5 * rand(),
      reach: 0.4 + 0.9 * rand(),
      up: 0.3 + 0.9 * rand(),
      size: 0.11 + 0.13 * rand(),
      frame: 1 + Math.floor(rand() * 3),
      life: 0.55 + 0.45 * rand(),
      phase: rand() * TAU,
      warm: rand() < 0.5,
    })),
    wisps: count(6, (i) => ({
      angle: (i / 6) * TAU + rand() * 0.6,
      reach: 0.5 + 0.4 * rand(),
      size: 0.3 + 0.2 * rand(),
      seed: 1 + Math.floor(rand() * 97),
    })),
  };
}

/**
 * The card's own motion: it lifts and braces, swells and trembles inside the shell, holds at the
 * burst, slams down and settles on a damped spring. `rim` is its edge light (0–1).
 * @returns {{ lift: number, scale: number, yawDeg: number, x: number, y: number, rim: number }} lift, x, y in h
 */
export function megaCardPose(ms) {
  const strain = megaStrain(ms);
  if (ms < RELEASE_MS) {
    const hold = Math.min(ms, MEGA_BURST_MS);
    // It trembles only until the burst: the hit stop holds it still.
    const shake = ms < MEGA_BURST_MS ? strain : 0;
    // A brace: it dips as it lifts, then swells with the shell.
    const brace = pulse(span(hold, 0, IGNITE_MS), 0.45);
    return {
      lift: 0.1 * easeOutCubic(span(hold, 0, IGNITE_MS)) + 0.12 * easeInCubic(span(hold, SHELL_FROM_MS, MEGA_BURST_MS)),
      scale: 1 - 0.045 * brace + 0.07 * span(hold, SHELL_FROM_MS, MEGA_BURST_MS),
      yawDeg: shake > 0 ? Math.sin(ms * 0.07) * 1.8 * shake : 0,
      x: shake > 0 ? Math.sin(ms * 0.19) * 0.012 * shake : 0,
      y: shake > 0 ? Math.cos(ms * 0.23) * 0.012 * shake : 0,
      rim: span(hold, 60, IGNITE_MS) * (0.55 + 0.45 * strain),
    };
  }
  const drop = span(ms, RELEASE_MS, RELEASE_MS + DROP_MS);
  const settle = span(ms, RELEASE_MS + DROP_MS, RELEASE_MS + DROP_MS + 480);
  return {
    lift: 0.22 * (1 - easeInCubic(drop)),
    scale: drop < 1 ? lerp(1.07, 0.94, drop) : 1 - 0.06 * spring(settle),
    yawDeg: 0,
    x: 0,
    y: 0,
    rim: 1 - easeOutCubic(span(ms, RELEASE_MS, RELEASE_MS + 700)),
  };
}

/**
 * The shell: null before it closes and once it has burst away. `radius` and `z` (its centre) in
 * h; `turn` radians it has spun; `crack`, `heat`, `thickness`, `dissolve` 0–1.
 * @returns {{ radius: number, z: number, alpha: number, turn: number, crack: number, heat: number,
 *   thickness: number, dissolve: number, x: number, y: number } | null}
 */
export function megaShellPose(ms) {
  if (ms < SHELL_FROM_MS) return null;
  const hold = Math.min(ms, MEGA_BURST_MS);
  const grown = span(hold, SHELL_FROM_MS, SHELL_GROWN_MS);
  const strain = megaStrain(ms);
  const shake = ms < MEGA_BURST_MS ? strain : 0;
  // After the hit stop it swells a little and is eaten away within a few frames.
  const gone = span(ms, RELEASE_MS, RELEASE_MS + 170);
  if (gone >= 1) return null;
  const seconds = (hold - SHELL_FROM_MS) / 1000;
  return {
    radius: MEGA_SHELL_RADIUS * (0.25 + 0.75 * (grown <= 0 ? 0 : 1 + 2.70158 * (grown - 1) ** 3 + 1.70158 * (grown - 1) ** 2)) * (1 + 0.05 * strain + 0.16 * easeOutCubic(gone)),
    z: SHELL_Z,
    alpha: span(hold, SHELL_FROM_MS, SHELL_FROM_MS + 110),
    // It spins up: a slow turn that quickens into the burst.
    turn: 1.6 * seconds + 5.5 * seconds * seconds,
    crack: span(hold, CRACK_FROM_MS, MEGA_BURST_MS - 30),
    heat: 0.25 + 0.75 * strain,
    thickness: 0.55 + 0.45 * grown,
    dissolve: gone,
    x: shake > 0 ? Math.sin(ms * 0.21) * 0.014 * shake : 0,
    y: shake > 0 ? Math.cos(ms * 0.17) * 0.014 * shake : 0,
  };
}

/** The halo on the cloth round the card: it builds with the shell, flares at the burst and dies. */
export function megaPoolPose(ms) {
  const after = span(ms, MEGA_BURST_MS, MEGA_BURST_MS + 650);
  return {
    alpha: ms < MEGA_BURST_MS ? span(ms, 0, 300) * (0.45 + 0.45 * megaStrain(ms)) : 1 - easeOutCubic(after),
    scale: 1 + 0.06 * megaStrain(ms) + 0.14 * easeOutCubic(after),
  };
}

/**
 * One mote of the ignition: a streak of energy drawn into the card.
 * @returns {{ x: number, y: number, z: number, size: number, alpha: number, headingDeg: number } | null}
 */
export function megaMotePose(mote, ms) {
  const u = span(ms, mote.lag, mote.lag + 360);
  if (u <= 0 || u >= 1) return null;
  const radius = lerp(mote.from, 0.12, easeInCubic(u));
  return {
    x: Math.cos(mote.angle) * radius,
    y: Math.sin(mote.angle) * radius,
    z: lerp(mote.height, 0.14, u),
    size: mote.size * (1 + 1.4 * u),
    alpha: pulse(u, 0.4),
    headingDeg: (mote.angle * 180) / Math.PI,
  };
}

/** Points along one comet's tail, head first, and the arc (radians) between two of them. */
export const MEGA_COMET_TAIL = 22;
const COMET_ARC_STEP = 0.045;

/**
 * One point of a comet: it spirals in from wide of the card, closes onto a tilted ring just
 * outside the shell and circles it faster and faster; at the burst it is flung outward. Its tail
 * lies back along the ring a fixed arc behind the head, however fast it turns, so it stays one
 * streak. `k` = 0 the head … MEGA_COMET_TAIL − 1 the tail's end.
 * @returns {{ x: number, y: number, z: number, size: number, alpha: number } | null}
 */
export function megaCometPose(comet, k, ms) {
  const t = ms - 120;
  if (!(t > 0)) return null;
  const flung = span(ms, RELEASE_MS, RELEASE_MS + 380);
  if (flung >= 1) return null;
  const seconds = Math.min(t, MEGA_BURST_MS - 120) / 1000;
  const closing = easeOutCubic(span(t, 0, 620));
  const spread = 1 + 1.5 * easeOutCubic(flung);
  const radius = lerp(2.1, MEGA_SHELL_RADIUS * 1.1, closing) * spread;
  // The tail is a fixed length of path, not of angle: wide of the card or flung off, it covers
  // a smaller arc, so its points stay as close as they are on the ring.
  const angle = comet.phase + comet.spin * (2.6 * seconds + 5.2 * seconds * seconds - (k * COMET_ARC_STEP * MEGA_SHELL_RADIUS * 1.1) / radius);
  // A ring tilted about a line in the cloth: one side dips, the other rises. The rise is the
  // ring's own (the shell's), so a comet still wide of the card does not dive under the cloth.
  const px = Math.cos(angle) * radius;
  const py = Math.sin(angle) * radius;
  const flat = py * Math.cos(comet.tilt);
  const rise = Math.sin(angle) * Math.min(radius, MEGA_SHELL_RADIUS * 1.1) * Math.sin(comet.tilt);
  const cosTurn = Math.cos(comet.turn);
  const sinTurn = Math.sin(comet.turn);
  const along = (1 - k / MEGA_COMET_TAIL) ** 2;
  return {
    x: px * cosTurn - flat * sinTurn,
    y: px * sinTurn + flat * cosTurn,
    z: SHELL_Z + rise,
    size: (0.035 + 0.1 * along) * (1 - 0.5 * flung),
    alpha: span(t, 0, 160) * along * (1 - flung),
  };
}

/**
 * One piece of the shell after the burst: thrown out from where it sat on the ball, it tumbles,
 * falls back toward the cloth and dissolves as it lands.
 * @returns {{ x: number, y: number, z: number, size: number, spin: number, headingDeg: number,
 *   dissolve: number } | null}
 */
export function megaPiecePose(piece, ms) {
  const t = (ms - RELEASE_MS) / 1000;
  if (!(t >= 0)) return null;
  // The last piece is gone before the scene ends.
  const fadeFrom = 0.4 + 0.3 * piece.fadeLag;
  const dissolve = span(t, fadeFrom, fadeFrom + 0.4);
  if (dissolve >= 1) return null;
  const ring = Math.sqrt(1 - piece.lift ** 2) * MEGA_SHELL_RADIUS;
  const { z, flight, hop } = tossHeight(t, SHELL_Z + piece.lift * MEGA_SHELL_RADIUS * 0.5, piece.up);
  const out = ring + tossReach(t, piece.speed, flight + hop);
  return {
    x: Math.cos(piece.around) * out,
    y: Math.sin(piece.around) * out,
    z: z + 0.02,
    size: piece.size * (1 - 0.3 * dissolve),
    spin: piece.spin * Math.min(t, flight + hop * 0.5),
    headingDeg: (piece.around * 180) / Math.PI,
    dissolve,
  };
}

/**
 * One sparkle of the burst: thrown out and up from the shell's surface, it arcs back, twinkling.
 * @returns {{ x: number, y: number, z: number, size: number, alpha: number } | null}
 */
export function megaSparklePose(sparkle, ms) {
  const u = span(ms, RELEASE_MS, RELEASE_MS + 850 * sparkle.life);
  if (u <= 0 || u >= 1) return null;
  const out = sparkle.from * MEGA_SHELL_RADIUS + sparkle.reach * easeOutCubic(u);
  return {
    x: Math.cos(sparkle.angle) * out,
    y: Math.sin(sparkle.angle) * out,
    z: SHELL_Z + sparkle.up * 4 * u * (1 - u),
    size: sparkle.size * (1 - 0.5 * u),
    alpha: (1 - easeInCubic(u)) * (0.6 + 0.4 * Math.sin(ms * 0.05 + sparkle.phase)),
  };
}

/**
 * One wisp of spent energy after the burst: it drifts out from the shell, swells and thins.
 * @returns {{ x: number, y: number, z: number, radius: number, alpha: number, dissolve: number } | null}
 */
export function megaWispPose(wisp, ms) {
  const u = span(ms, RELEASE_MS, RELEASE_MS + 800);
  if (u <= 0 || u >= 1) return null;
  const out = MEGA_SHELL_RADIUS * 0.7 + wisp.reach * easeOutCubic(u);
  return {
    x: Math.cos(wisp.angle) * out,
    y: Math.sin(wisp.angle) * out,
    z: SHELL_Z + 0.12 * u,
    radius: wisp.size * (0.6 + 0.6 * easeOutCubic(u)),
    alpha: pulse(u, 0.15) * 0.75,
    dissolve: easeInCubic(u) * 0.9,
  };
}
