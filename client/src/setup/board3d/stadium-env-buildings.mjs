// Design 077 (prototype): the pieces the building boards (Pokemon Center, Community Center, Lumiose
// City, Shopping Center) put on a prop builder (stadium-env-props.mjs). Pure.

/**
 * A run of window panes on a wall seen from outside: the wall runs `a` to `b` ([x, y] px, its
 * outward side on the right of a to b), from `z0` up to `z1`. A frame fills it, the panes lie a
 * little proud of it with the frame showing between them as mullions and transoms.
 * @param {ReturnType<typeof import('./stadium-env-props.mjs').createPropBuilder>} props
 * @param {{ a: number[], b: number[], z0: number, z1: number, panes: number, rows?: number,
 *   glass: number[], frame: number[], frameW?: number, lift?: number }} spec
 */
export function windowRun(props, { a, b, z0, z1, panes, rows = 1, glass, frame, frameW = 2.4, lift = 0.5 }) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const out = [along[1], -along[0]];
  const at = (s, z, push) => [a[0] + along[0] * s + out[0] * push, a[1] + along[1] * s + out[1] * push, z];
  props.quad(at(0, z0, lift), at(length, z0, lift), at(length, z1, lift), at(0, z1, lift), frame);
  const paneW = length / panes;
  const rowH = (z1 - z0) / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let pane = 0; pane < panes; pane += 1) {
      const s0 = pane * paneW + frameW / 2;
      const s1 = (pane + 1) * paneW - frameW / 2;
      const h0 = z0 + row * rowH + frameW / 2;
      const h1 = z0 + (row + 1) * rowH - frameW / 2;
      props.quad(at(s0, h0, lift + 0.4), at(s1, h0, lift + 0.4), at(s1, h1, lift + 0.4), at(s0, h1, lift + 0.4), glass);
    }
  }
}

/**
 * A wall band as a box that overhangs: from corner `a` to corner `b` of the footprint's face (the
 * building's face runs a to b with its outer side on the right), `depth` px deep into the building,
 * `over` px proud of the face. Returns nothing; the box takes its colours from `color`/`topColor`.
 */
export function wallBand(props, { a, b, depth, z0, z1, over = 0, color, topColor = color }) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const out = [along[1], -along[0]];
  const mid = [(a[0] + b[0]) / 2 + out[0] * (over - depth) / 2, (a[1] + b[1]) / 2 + out[1] * (over - depth) / 2];
  props.box({ x: mid[0], y: mid[1], z0, z1, hw: length / 2, hh: (depth + over) / 2, yaw: Math.atan2(along[1], along[0]), color, topColor, frontColor: color });
}
