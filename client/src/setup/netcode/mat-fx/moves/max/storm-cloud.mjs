// Design 092 (electric-poison-fighting): the storm cloud Max Lightning, G-Max Volt Crash and
// G-Max Stun Shock gather over their target before the strike (the Sword/Shield clips: a dark
// cumulus mass rolls in over the target, flickers with the strike's light, then thins). Matter:
// the `stormCloud` drawer (move-drawers.js) paints each lobe as a soft-edged lit volume,
// source-over. Pure and seeded, so both clients draw the same cloud; lengths in px from `h` (the
// card height).
import { seededRandom } from '../../flow-pose.mjs';

const TAU = Math.PI * 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** Storm greys: the shadowed underside, the body, the lit tops. */
export const STORM_GREYS = Object.freeze({
  shadow: Object.freeze([24, 23, 36]),
  body: Object.freeze([72, 70, 92]),
  lit: Object.freeze([162, 160, 184]),
});

// When the cloud has rolled in (beat fraction), when it starts to thin, how far the lobes drift in
// from (× their place) and how much it spreads as it thins (smoke expands, it never shrinks).
const GATHER_UNTIL = 0.35;
const THIN_FROM = 0.72;
const DRIFT_IN = 0.4;
const SPREAD_OUT = 0.25;
const FLASH_SPAN = 0.07;

/**
 * One billow of the mass: a main lobe with a smaller one riding on top and another sagging under
 * it, at `u` (0 … 1) across the cloud; offsets and radii in cloud half-widths. Higher lobes are lit
 * (`shade` → 1), the sagging ones are the underside (`shade` → 0).
 */
function billow(u, rand) {
  const dome = 1 - (2 * u - 1) ** 2;
  const x = (u - 0.5) * 1.6 + (rand() - 0.5) * 0.12;
  const y = 0.06 - 0.16 * dome + (rand() - 0.5) * 0.06;
  const r = 0.34 + 0.12 * rand();
  const shadeAt = (ly) => clamp01(0.55 - ly * 1.3);
  const top = { x: x + (rand() - 0.5) * 0.3, y: y - r * (0.55 + 0.25 * rand()), r: r * (0.55 + 0.2 * rand()) };
  const under = { x: x + (rand() - 0.5) * 0.4, y: y + r * 0.35, r: r * (0.8 + 0.15 * rand()) };
  return [under, { x, y, r }, top].map((lobe) => ({ ...lobe, shade: shadeAt(lobe.y) }));
}

/**
 * The cloud at `s` of its beat: its alpha envelope, its lobes (offsets from the anchor, radius,
 * `shade` 0 underside … 1 lit top; underside first, lit tops last) and the flash lighting it from
 * inside, if one is on. `r` is the cloud's half-width in card heights, `puffs` how many billows it
 * has (three lobes each), `flashes` how many times the strike's light flickers inside it.
 * @returns {{ alpha: number, width: number, lobes: {x:number, y:number, r:number, shade:number}[],
 *   flash: {x:number, y:number, r:number, alpha:number} | null }}
 */
export function stormCloudPose(s, h, seed, { r = 0.75, puffs = 7, flashes = 3 } = {}) {
  const c = clamp01(s);
  const rand = seededRandom((Math.trunc(Number(seed) || 0) >>> 0) + 92);
  const R = r * h;
  const gather = easeOutCubic(clamp01(c / GATHER_UNTIL));
  const thin = clamp01((c - THIN_FROM) / (1 - THIN_FROM));
  const alpha = clamp01(c / 0.18) * (1 - thin * thin);
  const spread = (1 + DRIFT_IN * (1 - gather)) * (1 + SPREAD_OUT * thin);
  const swell = (0.55 + 0.45 * gather) * (1 + 0.2 * thin);
  const n = Math.max(1, Math.trunc(puffs));
  const lobes = [];
  for (let i = 0; i < n; i += 1) {
    const churn = 0.035 * Math.sin(TAU * (1.2 * c + rand()));
    for (const lobe of billow(n > 1 ? i / (n - 1) : 0.5, rand)) {
      lobes.push({
        x: (lobe.x + churn) * R * spread,
        y: (lobe.y - churn * 0.6) * R * spread,
        r: lobe.r * R * swell,
        shade: lobe.shade,
      });
    }
  }
  lobes.sort((a, b) => a.shade - b.shade);

  let flash = null;
  const count = Math.max(0, Math.trunc(flashes));
  for (let k = 0; k < count; k += 1) {
    const at = 0.25 + (0.55 * (k + rand())) / count;
    const lobe = lobes[Math.floor(rand() * lobes.length)];
    const local = (c - at) / FLASH_SPAN;
    // On at once, dying fast: lightning does not fade in.
    if (local >= 0 && local < 1) flash = { x: lobe.x, y: lobe.y, r: lobe.r * 1.8, alpha: (1 - local) ** 2 };
  }
  return { alpha, width: R * spread, lobes, flash };
}
