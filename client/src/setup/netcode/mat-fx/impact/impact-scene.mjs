// Design 075 § Impacts in the scene: where a TCG Live impact prefab sits in the three.js board,
// seen through the board's own camera. A prefab is authored world-aligned to its card (design
// 068): X right, Y toward the camera, Z up the screen for the owner, 180° about Y for the far
// seat. Here that frame is the table's (x, normal, y), scaled from game units to board px.
// Pure (no three import): the board camera arrives as plain matrices and axes.
import { DEG, dot, mat4Mul, normalize, quatLook, sub } from './impact-math.mjs';

/**
 * The game's Active card height in prefab units: its mesh (`Card.obj`, 8.9 units, design 067)
 * times the Active slot mover's world scale (level6 `board_active_player/Active`, 1.615).
 */
export const GAME_ACTIVE_CARD_UNITS = 8.9 * 1.615;
/** The game's Bench card against its Active card (design 068 S5): a `_C` prefab is sized for it. */
export const GAME_BENCH_CARD_SCALE = 0.7;

/** Board px per prefab unit for a card `heightPx` tall. */
export const unitPxFor = (heightPx, bench = false) => heightPx / (GAME_ACTIVE_CARD_UNITS * (bench ? GAME_BENCH_CARD_SCALE : 1));

/**
 * The prefab's axes in the world: X along the table's x, Y along its normal (toward the camera),
 * Z up the table; the far seat turns X and Z round.
 * @param {{ x: number[], y: number[], z: number[] }} table the table frame's unit axes in the world
 */
export function prefabAxes(table, far = false) {
  const turn = far ? -1 : 1;
  return {
    X: table.x.map((v) => v * turn),
    Y: [...table.z],
    Z: table.y.map((v) => v * turn),
  };
}

/** A world point or direction in prefab coordinates (the axes are orthonormal). */
const toPrefab = (axes, v) => [dot(v, axes.X), dot(v, axes.Y), dot(v, axes.Z)];

/**
 * The view-projection and camera an impact on one card draws with.
 * @param {{ viewProjection: ArrayLike<number>, camera: { position: number[], right: number[],
 *   up: number[], forward: number[], fovDeg: number }, centre: number[],
 *   table: { x: number[], y: number[], z: number[] }, heightPx: number, bench?: boolean, far?: boolean }} frame
 *   `viewProjection` is the board camera's projection × view (column-major, view offset and shake
 *   included); `centre` the card face's centre in the world.
 * @returns {{ viewProjection: Float32Array, camera: object, unitPx: number }}
 */
export function sceneEffectFrame({ viewProjection, camera, centre, table, heightPx, bench = false, far = false }) {
  const unitPx = unitPxFor(heightPx, bench);
  const axes = prefabAxes(table, far);
  // prettier-ignore
  const model = new Float32Array([
    axes.X[0] * unitPx, axes.X[1] * unitPx, axes.X[2] * unitPx, 0,
    axes.Y[0] * unitPx, axes.Y[1] * unitPx, axes.Y[2] * unitPx, 0,
    axes.Z[0] * unitPx, axes.Z[1] * unitPx, axes.Z[2] * unitPx, 0,
    centre[0], centre[1], centre[2], 1,
  ]);
  const position = toPrefab(axes, sub(camera.position, centre)).map((v) => v / unitPx);
  const right = normalize(toPrefab(axes, camera.right), [1, 0, 0]);
  const up = normalize(toPrefab(axes, camera.up), [0, 0, 1]);
  const forward = normalize(toPrefab(axes, camera.forward), [0, -1, 0]);
  const span = 2 * Math.tan(((camera.fovDeg ?? 20) * DEG) / 2);
  return {
    viewProjection: mat4Mul(Float32Array.from(viewProjection), model),
    unitPx,
    camera: {
      position,
      right,
      up,
      forward,
      rotation: quatLook(forward, up),
      viewHeightAt: (distance) => span * Math.max(0, distance),
      depthOf: (p) => dot(sub(p, position), forward),
    },
  };
}
