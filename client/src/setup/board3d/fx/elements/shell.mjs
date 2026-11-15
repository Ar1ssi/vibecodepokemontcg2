// The shell element's pure half: a ball of energy closed round something (the bubble of a Mega
// Evolution). One instance is a sphere by its centre and radius; the fragment draws it as a lit,
// turning shell you can see through at its heart.
//
// Row (SHELL_FLOATS), six vec4: x y z radius · body rgb alpha · deep rgb seed · hot rgb crack ·
// rim rgb dissolve · turn bend heat thickness.
import { finite, positive, rgb, stagePoint, unit } from './element-params.mjs';

export const SHELL_FLOATS = 24;
export const SHELL_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD', 'iE', 'iF']);
const DEFAULTS = Object.freeze({
  colour: [0.91, 0.12, 0.59],
  deep: [0.34, 0.08, 0.66],
  hot: [1, 0.59, 0.16],
  rim: [0.27, 0.59, 1],
});

/**
 * @param {{ at: object, radius: number, alpha?: number, seed?: number, colour?: number[],
 *   deep?: number[], hot?: number[], rim?: number[], crack?: number, dissolve?: number,
 *   turn?: number, bend?: number, heat?: number, thickness?: number }} params `at` the ball's
 *   centre (stage px, z up) and `radius` px; `colour` / `deep` the shell's two tones, `hot` its
 *   veins and cracks, `rim` its edge light (rgb 0–1); `crack` 0–1 how far light has split it;
 *   `turn` radians it has turned about its upright axis; `bend` how hard it bends the board
 *   behind (0–1); `heat` 0–1 the glow at its heart; `thickness` 0–1 how much shell there is.
 * @returns {object|null} null when it cannot draw
 */
export function normalizeShell(params) {
  if (!params) return null;
  const at = stagePoint(params.at);
  const radius = positive(params.radius);
  const alpha = unit(params.alpha, 1);
  if (!at || !radius || !(alpha > 0)) return null;
  return {
    at,
    radius,
    alpha,
    seed: finite(params.seed) ? params.seed : 0,
    colour: rgb(params.colour, DEFAULTS.colour),
    deep: rgb(params.deep, DEFAULTS.deep),
    hot: rgb(params.hot, DEFAULTS.hot),
    rim: rgb(params.rim, DEFAULTS.rim),
    crack: unit(params.crack, 0),
    dissolve: unit(params.dissolve, 0),
    turn: finite(params.turn) ? params.turn : 0,
    bend: unit(params.bend, 0.35),
    heat: unit(params.heat, 0),
    thickness: unit(params.thickness, 1),
  };
}

export function packShell(row, out, index) {
  out.set(
    [
      row.at.x, row.at.y, row.at.z, row.radius,
      ...row.colour, row.alpha,
      ...row.deep, row.seed,
      ...row.hot, row.crack,
      ...row.rim, row.dissolve,
      row.turn, row.bend, row.heat, row.thickness,
    ],
    index * SHELL_FLOATS
  );
}

/** Emits for scripts/fx/check-element-shaders.mjs: a whole shell, a cracked one, one breaking up. */
export const shellSamples = () => [
  { at: { x: -110, y: 0, z: 60 }, radius: 70, seed: 1, turn: 0.4 },
  { at: { x: 40, y: 10, z: 60 }, radius: 80, seed: 2, turn: 1.9, crack: 0.8, heat: 0.7 },
  { at: { x: 150, y: 60, z: 60 }, radius: 50, seed: 3, dissolve: 0.5, thickness: 0.6, colour: [0.2, 0.7, 1], deep: [0.05, 0.2, 0.6] },
];
