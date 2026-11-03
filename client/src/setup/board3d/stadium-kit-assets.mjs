// Design 082: the Stadium kit's assets in Brilliant Diamond / Shining Pearl's overworld style (design
// 081 built the kit): toy shapes, rounded and a little squat, lit softly with no ink outline.
// Broadleaf trees are a stout flared trunk under a crown of leafy lumps; pines are stacked scalloped
// tiers with a lime tip; bushes are leafy domes; every foliage part is covered in shingled leaves
// (stadium-kit.mjs KIT_LEAVES); rocks are lumpy clusters lighter on top, dark in their creases;
// built things are boxes with rounded edges (roundBox). Each asset is modelled about its own foot
// (x right, y far, z up, px) and placed with placeAsset; sizes are px of the table frame, so a board
// scales them by its world unit (a card's width / 100). Pure: no three.js.
import { SUN_DIRECTION } from './stadium-environment-glsl.mjs';
import { LOOK } from './stadium-env-props.mjs';
import { KEY_GAIN, paint } from './stadium-kit.mjs';

/** How far a shadow slides from under its caster per px of the caster's height, along the sun. */
export const SHADOW_SLIDE = 0.3;

/** The kit's colours, authored as they show on screen; every asset takes its own `colors` over these. */
export const PALETTE = Object.freeze({
  leaf: '#4caa3c',
  leafLight: '#6fc244',
  leafDark: '#2e7d36',
  bark: '#8a5a36',
  barkDark: '#5e3d26',
  pine: '#2f8a45',
  pineLight: '#57b247',
  pineTip: '#9de04e',
  pineDark: '#1d5c33',
  snow: '#f4f8ff',
  frond: '#4cae3e',
  frondLight: '#86cf4e',
  palmTrunk: '#b98a52',
  palmTrunkDark: '#8c6438',
  coconut: '#6e4a2c',
  grass: '#3e9a3c',
  grassTip: '#86c94e',
  stem: '#3f9a3c',
  rock: '#a5a3a6',
  rockLight: '#d2cfcb',
  rockDark: '#6f6c74',
  crystal: '#6fcdf0',
  crystalTip: '#d9f7ff',
  cap: '#e4483c',
  spot: '#fff6e9',
  gill: '#e9d9bd',
  mushStem: '#f1e6cf',
  wood: '#b8834e',
  woodLight: '#d9a96c',
  woodDark: '#83592f',
  iron: '#30343f',
  glow: '#fff2b8',
  glass: '#dcefff',
  stone: '#c9c6c2',
  stoneDark: '#8f8c90',
  slab: '#c79a6a',
  slabLight: '#e2bb86',
  moss: '#6c9b4c',
  cloud: '#ffffff',
  red: '#e8463c',
  white: '#f7f5ef',
  black: '#2a2a33',
  soil: '#5b4033',
  planter: '#dcd8d0',
  reed: '#5f9a3e',
  cattail: '#7b4f33',
  lily: '#55a84a',
  lilyLight: '#8fd067',
  petal: '#f7a1c4',
  sand: '#ecd3a0',
  starfish: '#f08a4b',
  shell: '#f6d8c8',
  metal: '#b8c2cc',
  metalDark: '#7b8694',
});

const painted = new Map();
const colour = (value) => {
  if (Array.isArray(value)) return value;
  if (!painted.has(value)) painted.set(value, paint(value));
  return painted.get(value);
};

/** The asset's colours: PALETTE's names over `defaults` (names or #hex), then the caller's `colors`. */
const coloursOf = (defaults, colors = {}) => {
  const out = {};
  for (const [name, value] of Object.entries({ ...defaults, ...colors })) out[name] = colour(PALETTE[value] ?? value);
  return out;
};

/** `a` toward `b` by t (colours: w rides along from a). */
const blend = (a, b, t) => a.map((v, k) => (k < 3 ? v + (b[k] - v) * t : v));

/** A seeded 0..1 stream (mulberry32): the same seed builds the same asset. */
export function seededRandom(seed = 0) {
  let state = (Math.floor(Math.abs(Number(seed) || 0) * 7919 + 0.5) ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const unit3 = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/** The lean that stands a part's z axis along the unit direction `n` (frameOf's [about x, about y]). */
const leanAlong = (n) => {
  const tilt = Math.acos(Math.max(-1, Math.min(1, n[2])));
  const heading = Math.atan2(n[1], n[0]);
  return [-Math.sin(heading) * tilt, Math.cos(heading) * tilt];
};

/** A rock's colour by which way its surface faces: light on top, dark underneath, its body between. */
const rockTint = (c) => (d) => (d[2] > 0.55 ? c.light : d[2] < -0.25 ? c.dark : c.body);

/**
 * One BDSP flower at (x, y): five rounded petals (`tint`) round a gold eye, `h` px up, on a rosette of
 * three leaves on the ground; `head` is the flower's width. Reaches head * 1.0 from (x, y); stands
 * h + head * 0.18 high.
 */
function flowerHead(props, { x, y, head, h, tint, eye, leaf, turn }) {
  props.look({ kind: LOOK.foliage, sway: 0.5 }, () => {
    for (let k = 0; k < 3; k += 1) {
      const yaw = turn + (k / 3) * 2 * Math.PI + 0.5;
      props.at({ x: x + Math.cos(yaw) * head * 0.45, y: y + Math.sin(yaw) * head * 0.45, yaw }, () =>
        props.blob({ z: 1, rx: head * 0.55, ry: head * 0.26, rz: head * 0.12, color: leaf, sides: 10, rings: 5 })
      );
    }
    for (let p = 0; p < 5; p += 1) {
      const yaw = turn + (p / 5) * 2 * Math.PI;
      props.at({ x: x + Math.cos(yaw) * head * 0.28, y: y + Math.sin(yaw) * head * 0.28, z: h, yaw, lean: [0, -0.25] }, () =>
        props.blob({ rx: head * 0.3, ry: head * 0.23, rz: head * 0.08, color: tint, sides: 10, rings: 5 })
      );
    }
  });
  props.look({ kind: LOOK.gloss, sway: 0.5 }, () => props.blob({ x, y, z: h + head * 0.05, rx: head * 0.19, rz: head * 0.12, color: eye, sides: 10, rings: 6 }));
}

/**
 * Design 084: the umbrella broadleaf's crown (Forest of Vitality's card): where its flat crown sits
 * on a trunk of height H, and how high its lighter top lumps reach. The crown never sinks below a
 * third of the trunk, so a short tall-crowned tree still shows its trunk.
 */
const umbrellaShape = (R, H) => {
  const base = Math.max(H - 0.55 * R, 0.35 * H);
  return { base, top: base + 0.52 * R };
};

/** Each asset: dims(options) → { reach (px from its foot, seen from above), height }, draw(props, options, dims, ctx). */
const ASSETS = {
  /**
   * A broadleaf, BDSP's: a stout trunk flaring into its roots under a crown of leafy lumps (a broad
   * middle, a ring round it, a few lighter ones on top leaning sunward), dark in the creases between.
   * Design 084: `crown: 'umbrella'` is the Forest of Vitality card's broadleaf instead: a tall visible
   * trunk forking into limbs under a wide flat crown, its lit top a band of lighter lumps.
   */
  treeRound: {
    dims: ({ size = 60, height, crown }) => {
      if (crown === 'umbrella') {
        const H = height ?? size * 2.3;
        return { reach: size * 1.18, height: Math.max(H, umbrellaShape(size, H).top) };
      }
      return { reach: size * 1.12, height: (height ?? size * 2.1) + size * 0.06 };
    },
    draw(props, options, dims, ctx) {
      if (options.crown === 'umbrella') return drawUmbrella(props, options, ctx);
      const { size: R = 60, height, colors } = options;
      const { rand, shift, sunward } = ctx;
      const H = height ?? R * 2.1;
      const c = coloursOf({ leaf: 'leaf', leafLight: 'leafLight', bark: 'bark', barkDark: 'barkDark' }, colors);
      const crown = H - 0.6 * R;
      props.lathe(
        [
          [0.34 * R, 0],
          [0.24 * R, 0.035 * H],
          [0.17 * R, 0.1 * H],
          [0.15 * R, 0.3 * H],
          [0.14 * R, crown - 0.2 * R],
          [0, crown],
        ],
        { color: (i) => (i < 1 ? c.barkDark : c.bark), sides: 14 }
      );
      const top = blend(c.leaf, c.leafLight, 0.6);
      const lumps = [{ z: crown, rx: 0.8 * R, rz: 0.6 * R, color: c.leaf }];
      const rim = 5 + Math.floor(rand() * 2);
      const turn = rand() * 6.28;
      for (let k = 0; k < rim; k += 1) {
        const angle = turn + (k / rim) * 2 * Math.PI + (rand() - 0.5) * 0.4;
        const r = (0.42 + 0.08 * rand()) * R;
        lumps.push({ x: Math.cos(angle) * 0.58 * R, y: Math.sin(angle) * 0.58 * R, z: crown - 0.12 * R + rand() * 0.08 * R, rx: r, rz: r * 0.82, color: c.leaf });
      }
      const tops = 2 + Math.floor(rand() * 2);
      for (let k = 0; k < tops; k += 1) {
        const angle = turn + 0.5 + (k / tops) * 2 * Math.PI;
        const r = (0.38 + 0.06 * rand()) * R;
        lumps.push({
          x: Math.cos(angle) * 0.24 * R + sunward[0] * 0.12 * R,
          y: Math.sin(angle) * 0.24 * R + sunward[1] * 0.12 * R,
          z: crown + 0.3 * R,
          rx: r,
          rz: r * 0.8,
          color: top,
        });
      }
      props.look({ kind: LOOK.foliage, leaf: 0.17 * R, sway: 1.0 }, () => props.lumps(lumps));
      props.shadow({ x: shift[0] * crown, y: shift[1] * crown, rx: 1.02 * R, strength: 0.75 });
      props.shadow({ rx: 0.4 * R, strength: 0.6 });
    },
  },

  /**
   * A conifer, BDSP's Sinnoh pine: tiers of leafy skirts stacked up a stub of trunk, each narrower,
   * its hem scalloped and drooping, the band under each hem in shade so from above they read as
   * stacked rosettes, a bright lime tip on top; `snow` lays white over each tier's upper half.
   */
  pine: {
    dims: ({ size = 34, height }) => ({ reach: size * 1.1, height: height ?? size * 3.2 }),
    draw(props, { size: R = 34, tiers = 4, snow = false, colors }, { height: H }, { rand, shift }) {
      const c = coloursOf({ pine: 'pine', pineLight: 'pineLight', pineDark: 'pineDark', tip: 'pineTip', bark: 'bark', snow: 'snow' }, colors);
      props.lathe(
        [
          [0.24 * R, 0],
          [0.16 * R, 0.03 * H],
          [0.12 * R, 0.1 * H],
          [0.11 * R, 0.2 * H],
          [0, 0.22 * H],
        ],
        { color: c.bark, sides: 12 }
      );
      const around = 56;
      const rows = 8;
      const scallops = 7 + Math.floor(rand() * 2);
      const shape = [];
      for (let i = 0; i < tiers; i += 1) {
        const s = tiers > 1 ? i / (tiers - 1) : 1;
        const z0 = H * (0.15 + 0.55 * s);
        shape.push({ r: R * (1 - 0.62 * s), z0, z1: z0 + H * (0.3 - 0.07 * s), turn: rand() * 6.28 });
      }
      // How far up a tier the next tier's hem hangs over it (0..1 of its rows).
      const hemOver = (i, t) => {
        const next = shape[i + 1];
        if (!next) return 0;
        const { z0, z1 } = shape[i];
        return Math.min(1, Math.max(0, (z0 + (z1 - z0) * t ** 1.25 - next.z0) / (0.08 * H)));
      };
      props.look({ kind: LOOK.foliage, leaf: 0.24 * R, sway: 0.7 }, () => {
        shape.forEach(({ r, z0, z1, turn }, i) => {
          const grid = [];
          for (let j = 0; j <= rows; j += 1) {
            const t = j / rows;
            const row = [];
            for (let k = 0; k < around; k += 1) {
              const angle = (k / around) * 2 * Math.PI;
              const bump = (0.5 + 0.5 * Math.cos(scallops * angle + turn)) ** 1.5;
              const hem = (1 - t) ** 2;
              const radius = r * (1 - 0.86 * t ** 0.85) * (1 + 0.18 * (bump - 0.5) * hem);
              row.push([Math.cos(angle) * radius, Math.sin(angle) * radius, z0 + (z1 - z0) * t ** 1.25 - 0.05 * H * hem * bump]);
            }
            grid.push(row);
          }
          const tint = (j) => {
            const t = j / rows;
            const covered = hemOver(i, t);
            const body = snow && t > 0.45 && covered < 1 ? c.snow : t > 0.55 ? c.pineLight : c.pine;
            return blend(body, [0, 0, 0, 0], 0.45 * covered);
          };
          props.surface(grid, { color: (j) => tint(j), wrap: true });
          // Its underside: the hem tucks in under itself to the trunk.
          const under = [grid[0].map(([x, y, z]) => [x * 0.12, y * 0.12, z + 0.05 * H]), grid[0].map(([x, y, z]) => [x * 0.55, y * 0.55, z + 0.03 * H]), grid[0]];
          props.surface(under, { color: c.pineDark, wrap: true });
        });
      });
      const top = shape[tiers - 1].z1;
      props.look({ kind: LOOK.foliage }, () =>
        props.lathe(
          [
            [0.13 * R, top - 0.06 * H],
            [0.08 * R, top + 0.02 * H],
            [0, top + 0.07 * H],
          ],
          { color: snow ? c.snow : c.tip, sides: 12 }
        )
      );
      props.shadow({ x: shift[0] * H * 0.45, y: shift[1] * H * 0.45, rx: R * 0.95, strength: 0.7 });
      props.shadow({ rx: R * 0.5, strength: 0.5 });
    },
  },

  /** A palm: a ringed, curving trunk leaning `lean` rad toward `leanYaw`, a crown of arched fronds cut into leaflets, coconuts. */
  palm: {
    // The crown stands cos(lean) of the height up; the trunk's top ring, tipped with the trunk, and a
    // frond rising before it droops stand at most 0.045 of the height over it.
    dims: ({ height = 150, lean = 0.22 }) => ({ reach: Math.sin(lean) * height + height * 0.62, height: height * (Math.cos(lean) + 0.045) }),
    draw(props, { height: H = 150, lean = 0.22, leanYaw = 0, fronds = 7, colors }, dims, { rand, shift }) {
      const c = coloursOf({ frond: 'frond', frondLight: 'frondLight', trunk: 'palmTrunk', trunkDark: 'palmTrunkDark', coconut: 'coconut' }, colors);
      const head = [Math.cos(leanYaw) * Math.sin(lean) * H, Math.sin(leanYaw) * Math.sin(lean) * H, Math.cos(lean) * H];
      const bend = [head[0] * 0.15, head[1] * 0.15, H * 0.55];
      const points = [];
      const radii = [];
      for (let i = 0; i <= 12; i += 1) {
        const s = i / 12;
        points.push([0, 1, 2].map((k) => 2 * (1 - s) * s * bend[k] + s * s * head[k]));
        radii.push(H * (0.066 - 0.024 * s));
      }
      props.tube(points, radii, c.trunk, { sides: 12, colorAt: (i) => (i % 2 ? c.trunkDark : c.trunk) });
      props.look({ kind: LOOK.gloss }, () => {
        for (let k = 0; k < 3; k += 1) {
          const angle = (k / 3) * 2 * Math.PI + 0.5;
          props.blob({ x: head[0] + Math.cos(angle) * H * 0.04, y: head[1] + Math.sin(angle) * H * 0.04, z: head[2] - H * 0.035, rx: H * 0.034, color: c.coconut, sides: 10, rings: 7 });
        }
      });
      props.look({ kind: LOOK.foliage, sway: 0.8 }, () => {
        const steps = 14;
        for (let f = 0; f < fronds; f += 1) {
          const yaw = (f / fronds) * 2 * Math.PI + (rand() - 0.5) * 0.4;
          const length = H * (0.5 + 0.12 * rand());
          const along = [Math.cos(yaw), Math.sin(yaw)];
          const side = [-along[1], along[0]];
          const tint = f % 2 ? c.frond : c.frondLight;
          const rib = [];
          for (let i = 0; i <= steps; i += 1) {
            const s = i / steps;
            // Leaflets: the blade's edge cut in and out along it, as a palm frond's.
            const cut = i % 2 ? 0.62 : 1;
            const width = 0.17 * length * Math.sin(Math.PI * Math.min(1, s * 1.08)) ** 0.8 * cut;
            const mid = [head[0] + along[0] * length * s, head[1] + along[1] * length * s, head[2] + length * (0.26 * s - 0.6 * s * s)];
            rib.push({
              mid,
              left: [mid[0] + side[0] * width, mid[1] + side[1] * width, mid[2] - width * 0.4],
              right: [mid[0] - side[0] * width, mid[1] - side[1] * width, mid[2] - width * 0.4],
            });
          }
          for (let i = 0; i < steps; i += 1) {
            const a = rib[i];
            const b = rib[i + 1];
            props.quad(a.mid, b.mid, b.left, a.left, tint);
            props.quad(a.right, b.right, b.mid, a.mid, tint);
          }
        }
      });
      props.shadow({ x: head[0] + shift[0] * H, y: head[1] + shift[1] * H, rx: H * 0.42, strength: 0.6 });
      props.shadow({ rx: H * 0.08, strength: 0.55 });
    },
  },

  /** A bush, BDSP's: a leafy dome of lumps, lighter on top; berries or blossoms dotted over it when `berries` names a colour. */
  bush: {
    dims: ({ size = 26 }) => ({ reach: size * 1.18, height: size * 1.28 }),
    draw(props, { size: R = 26, berries = null, colors }, dims, { rand, shift, sunward }) {
      const c = coloursOf({ leaf: 'leaf', leafLight: 'leafLight', berry: berries ?? 'red' }, colors);
      const zc = 0.55 * R;
      const lumps = [{ z: zc, rx: 0.9 * R, rz: 0.68 * R, color: c.leaf }];
      const rim = 4 + Math.floor(rand() * 3);
      const turn = rand() * 6.28;
      for (let k = 0; k < rim; k += 1) {
        const angle = turn + (k / rim) * 2 * Math.PI;
        const r = (0.46 + 0.1 * rand()) * R;
        lumps.push({ x: Math.cos(angle) * 0.55 * R, y: Math.sin(angle) * 0.55 * R, z: 0.4 * R, rx: r, rz: r * 0.84, color: c.leaf });
      }
      lumps.push({ x: sunward[0] * 0.2 * R, y: sunward[1] * 0.2 * R, z: 0.84 * R, rx: 0.4 * R, rz: 0.32 * R, color: blend(c.leaf, c.leafLight, 0.6) });
      props.look({ kind: LOOK.foliage, leaf: 0.3 * R, sway: 0.6 }, () => props.lumps(lumps));
      if (berries) {
        props.look({ kind: LOOK.gloss, sway: 0.6 }, () => {
          const count = 5 + Math.floor(rand() * 4);
          for (let k = 0; k < count; k += 1) {
            const angle = rand() * 6.28;
            const d = unit3([Math.cos(angle), Math.sin(angle), 0.45 + 0.6 * rand()]);
            props.blob({ x: d[0] * 0.9 * R, y: d[1] * 0.9 * R, z: zc + d[2] * 0.68 * R, rx: 0.09 * R, color: c.berry, sides: 8, rings: 6 });
          }
        });
      }
      props.shadow({ x: shift[0] * zc, y: shift[1] * zc, rx: 1.12 * R, strength: 0.65 });
    },
  },

  /** A clipped hedge, BDSP's: a leafy block with rounded edges, `length` px long along its own x, `size` px through. */
  hedge: {
    dims: ({ size = 18, length = 80 }) => ({ reach: length / 2 + size, height: size * 1.5 }),
    draw(props, { size: R = 18, length: L = 80, colors }, dims, { shift }) {
      const c = coloursOf({ leaf: 'leaf', leafLight: 'leafLight' }, colors);
      props.look({ kind: LOOK.foliage, leaf: 0.36 * R, sway: 0.3 }, () =>
        props.roundBox({ x: 0, y: 0, z0: 0, z1: 1.3 * R, hw: L / 2, hh: 0.6 * R, r: 0.32 * R, color: c.leaf, topColor: blend(c.leaf, c.leafLight, 0.5) })
      );
      props.shadow({ x: shift[0] * R * 0.6, y: shift[1] * R * 0.6, rx: L / 2 + R * 0.6, ry: R * 1.15, strength: 0.6 });
    },
  },

  /** A fern or big-leaved plant: broad fronds arching out of one crown, folded along the rib, swaying. */
  fern: {
    dims: ({ size = 30 }) => ({ reach: size * 1.02, height: size * 0.62 }),
    draw(props, { size: L = 30, fronds = 6, colors }, dims, { rand }) {
      const c = coloursOf({ leaf: 'leaf', leafLight: 'leafLight', heart: 'leafDark' }, colors);
      props.look({ kind: LOOK.foliage, sway: 0.7 }, () => {
        const turn = rand() * 6.28;
        for (let f = 0; f < fronds; f += 1) {
          const yaw = turn + (f / fronds) * 2 * Math.PI + (rand() - 0.5) * 0.4;
          const length = L * (0.8 + 0.2 * rand());
          const along = [Math.cos(yaw), Math.sin(yaw)];
          const side = [-along[1], along[0]];
          const rib = [];
          for (let i = 0; i <= 6; i += 1) {
            const s = i / 6;
            const width = 0.2 * length * Math.sin(Math.PI * Math.min(1, s * 1.05)) ** 0.7;
            const mid = [along[0] * length * s, along[1] * length * s, length * (0.85 * s - 0.75 * s * s) + 1];
            rib.push({
              mid,
              left: [mid[0] + side[0] * width, mid[1] + side[1] * width, mid[2] - width * 0.35],
              right: [mid[0] - side[0] * width, mid[1] - side[1] * width, mid[2] - width * 0.35],
            });
          }
          const tint = f % 2 ? c.leaf : c.leafLight;
          for (let i = 0; i < 6; i += 1) {
            const a = rib[i];
            const b = rib[i + 1];
            props.quad(a.mid, b.mid, b.left, a.left, tint);
            props.quad(a.right, b.right, b.mid, a.mid, tint);
          }
        }
        props.blob({ z: 1.5, rx: L * 0.12, rz: L * 0.08, color: c.heart, sides: 10, rings: 6 });
      });
      props.shadow({ rx: L * 0.85, strength: 0.45 });
    },
  },

  /** A patch of tall grass, Pokémon's own: tufts of bent blades, darker at the foot, swaying. */
  tallGrass: {
    // Tufts reach 1.05 of the size out; a blade leans out up to 0.55 of its height (1.15 × blade), its foot ~3 px wide.
    dims: ({ size = 30, blade = 16 }) => ({ reach: size * 1.05 + blade * 0.64 + 3, height: blade * 1.15 }),
    draw(props, { size: R = 30, blade = 16, colors }, dims, { rand }) {
      const c = coloursOf({ grass: 'grass', tip: 'grassTip' }, colors);
      const step = 5.5;
      props.look({ kind: LOOK.foliage, sway: 1.1 }, () => {
        for (let gx = -R; gx <= R; gx += step) {
          for (let gy = -R; gy <= R; gy += step) {
            const x = gx + (rand() - 0.5) * step;
            const y = gy + (rand() - 0.5) * step;
            if (Math.hypot(x, y) > R * (0.8 + 0.25 * rand())) continue;
            const blades = 4 + Math.floor(rand() * 3);
            for (let b = 0; b < blades; b += 1) {
              const yaw = rand() * 6.28;
              const dir = [Math.cos(yaw), Math.sin(yaw)];
              const side = [-dir[1], dir[0]];
              const h = blade * (0.75 + 0.4 * rand());
              const leanBy = h * (0.25 + 0.3 * rand());
              const foot = [x + dir[0] * 1.2, y + dir[1] * 1.2];
              const at = (s, w, z) => [foot[0] + dir[0] * leanBy * s * s + side[0] * w, foot[1] + dir[1] * leanBy * s * s + side[1] * w, z];
              const bl = at(0, -1.8, 0);
              const br = at(0, 1.8, 0);
              const ml = at(0.55, -1.2, h * 0.55);
              const mr = at(0.55, 1.2, h * 0.55);
              const tip = at(1, 0, h);
              props.quad(bl, br, mr, ml, c.grass);
              props.triangle(ml, mr, tip, c.tip);
            }
          }
        }
      });
      props.shadow({ rx: R * 1.02, strength: 0.4 });
    },
  },

  /** A clump of BDSP flowers: five rounded petals round a gold eye on a rosette of leaves, `petals` colours in turn. */
  flowers: {
    dims: ({ size = 16, head = 6 }) => ({ reach: size + head * 1.1, height: 10 + head }),
    draw(props, { size: R = 16, count = 8, head = 6, petals = ['#f05a4e', '#ffd84a', '#fff7ec'], colors }, dims, { rand }) {
      const c = coloursOf({ leaf: 'stem', eye: '#ffc93a' }, colors);
      const tints = petals.map(colour);
      const spots = [];
      for (let k = 0; k < count * 12 && spots.length < count; k += 1) {
        const angle = rand() * 6.28;
        const out = Math.sqrt(rand()) * R;
        const x = Math.cos(angle) * out;
        const y = Math.sin(angle) * out;
        if (spots.every((s) => Math.hypot(s.x - x, s.y - y) > head * 1.6)) spots.push({ x, y });
      }
      spots.forEach((spot, i) => {
        flowerHead(props, { x: spot.x, y: spot.y, head, h: head * 0.5 + 2 + rand() * 2, tint: tints[i % tints.length], eye: c.eye, leaf: c.leaf, turn: rand() * 6.28 });
      });
      props.shadow({ rx: R * 1.05, strength: 0.32 });
    },
  },

  /** A bed of BDSP flowers in rows, an oval `size` px across its long way, `depth` of that across. */
  flowerBed: {
    dims: ({ size = 30, head = 6 }) => ({ reach: size + head * 1.05, height: head * 0.88 + 4.5 }),
    draw(props, { size: R = 30, depth: wide = 0.6, head = 6, petals = ['#f7a1c4'], colors }, dims, { rand }) {
      const c = coloursOf({ leaf: 'stem', eye: '#ffd84a' }, colors);
      const tints = petals.map(colour);
      const depth = Math.min(1, Math.max(0.05, wide));
      const step = head * 1.45;
      let i = 0;
      for (let gy = -R * depth; gy <= R * depth; gy += step * 0.87) {
        const row = Math.round(gy / (step * 0.87));
        for (let gx = -R + (row % 2 ? step / 2 : 0); gx <= R; gx += step) {
          const x = gx + (rand() - 0.5) * head * 0.35;
          const y = gy + (rand() - 0.5) * head * 0.35;
          if ((x / R) ** 2 + (y / (R * depth)) ** 2 > 1) continue;
          flowerHead(props, { x, y, head, h: head * 0.5 + 2 + rand() * 2, tint: tints[i % tints.length], eye: c.eye, leaf: c.leaf, turn: rand() * 6.28 });
          i += 1;
        }
      }
      // A bed too small for a row still holds one flower, in its middle.
      if (i === 0) flowerHead(props, { x: 0, y: 0, head, h: head * 0.5 + 2, tint: tints[0], eye: c.eye, leaf: c.leaf, turn: rand() * 6.28 });
      props.shadow({ rx: R * 1.02, ry: R * depth * 1.1, strength: 0.3 });
    },
  },

  /** A boulder, BDSP's: a lumpy clay rock, a broad middle with smaller lumps round and on it, lighter on top, dark in its creases. */
  boulder: {
    dims: ({ size = 24, height }) => ({ reach: size * 1.12, height: height ?? size * 0.78 }),
    draw(props, { size: R = 24, depth = 0.86, colors }, { height: H }, { rand, shift }) {
      const c = coloursOf({ body: 'rock', light: 'rockLight', dark: 'rockDark' }, colors);
      const tint = rockTint(c);
      const lumps = [{ z: 0.3 * H, rx: 0.72 * R, ry: 0.72 * R * depth, rz: 0.62 * H, color: tint }];
      const round = 3 + Math.floor(rand() * 2);
      const turn = rand() * 6.28;
      for (let k = 0; k < round; k += 1) {
        const angle = turn + (k / round) * 2 * Math.PI + (rand() - 0.5) * 0.5;
        const r = R * (0.42 + 0.12 * rand());
        lumps.push({ x: Math.cos(angle) * 0.42 * R, y: Math.sin(angle) * 0.42 * R * depth, z: 0.2 * H, rx: r, ry: r * depth, rz: 0.46 * H, color: tint });
      }
      const angle = rand() * 6.28;
      lumps.push({ x: Math.cos(angle) * 0.15 * R, y: Math.sin(angle) * 0.15 * R * depth, z: 0.62 * H, rx: 0.38 * R, ry: 0.38 * R * depth, rz: 0.36 * H, color: tint });
      props.lumps(lumps, { crease: 0.55 });
      props.shadow({ x: shift[0] * H * 0.5, y: shift[1] * H * 0.5, rx: R * 1.1, ry: R * depth * 1.15, strength: 0.7 });
    },
  },

  /** A handful of small stones round one another. */
  pebbles: {
    // Stones lie out to 0.9 of the size, each a boulder of up to 0.44 of it (reach 1.12 × its own).
    dims: ({ size = 14 }) => ({ reach: size * 1.4, height: size * 0.45 }),
    draw(props, { size: R = 14, count = 4, colors }, dims, { rand }) {
      for (let k = 0; k < count; k += 1) {
        const angle = (k / count) * 6.28 + rand();
        const out = k === 0 ? 0 : R * (0.55 + 0.35 * rand());
        const r = R * (k === 0 ? 0.55 : 0.28 + 0.16 * rand());
        props.at({ x: Math.cos(angle) * out, y: Math.sin(angle) * out, yaw: rand() * 6.28 }, () =>
          ASSETS.boulder.draw(props, { size: r, colors }, { height: r * 0.7 }, { rand, shift: [0, 0], sunward: [0, 0] })
        );
      }
    },
  },

  /** A standing stone, BDSP's: rounded lumps stacked into a pillar, each a little smaller, set a little off the one under it. */
  spire: {
    dims: ({ size = 26, height }) => ({ reach: size * 1.15, height: height ?? size * 3.2 }),
    draw(props, { size: R = 26, colors }, { height: H }, { rand, shift }) {
      const c = coloursOf({ body: 'rock', light: 'rockLight', dark: 'rockDark' }, colors);
      const lumps = [];
      for (let i = 0; i < 4; i += 1) {
        const angle = rand() * 6.28;
        const r = R * (0.95 - 0.17 * i);
        lumps.push({ x: Math.cos(angle) * 0.1 * R, y: Math.sin(angle) * 0.1 * R, z: H * (0.1 + 0.24 * i), rx: r, ry: r * (0.85 + 0.1 * rand()), rz: 0.15 * H, color: rockTint(c) });
      }
      props.lumps(lumps, { crease: 0.5 });
      props.shadow({ x: shift[0] * H * 0.3, y: shift[1] * H * 0.3, rx: R * 1.1 + H * 0.12, ry: R * 1.05, yaw: Math.atan2(shift[1], shift[0]), strength: 0.7 });
    },
  },

  /** A ledge rock, BDSP's cave and shore outcrop: two to four flat slabs stacked, each smaller and turned, lighter on top. */
  ledgeRock: {
    // Slabs 0.3, 0.27, 0.24 and 0.21 of the size thick, each sunk 8% into the one under it.
    dims: ({ size = 30 }) => ({ reach: size * 1.2, height: size * 0.96 }),
    draw(props, { size: S = 30, slabs = 3, colors }, dims, { rand, shift }) {
      const c = coloursOf({ body: 'slab', top: 'slabLight' }, colors);
      let z = 0;
      const count = Math.max(1, Math.min(4, slabs));
      for (let k = 0; k < count; k += 1) {
        const scale = 1 - 0.24 * k;
        const thick = S * (0.3 - 0.03 * k);
        const angle = rand() * 6.28;
        const off = k === 0 ? 0 : S * 0.12 * rand();
        props.roundBox({
          x: Math.cos(angle) * off,
          y: Math.sin(angle) * off,
          z0: z,
          z1: z + thick,
          hw: 0.8 * S * scale,
          hh: 0.55 * S * scale,
          r: thick * 0.4,
          yaw: rand() * 6.28,
          color: c.body,
          topColor: c.top,
        });
        z += thick * 0.92;
      }
      props.shadow({ x: shift[0] * z * 0.5, y: shift[1] * z * 0.5, rx: S * 1.05, ry: S * 0.85, strength: 0.65 });
    },
  },

  /** A cluster of crystals: one tall hexagonal shaft and smaller ones leaning out round it, bright at the tips. */
  crystals: {
    // A side shaft stands out to 0.38 of the size and leans out up to 0.7 rad over its ~0.96 of it.
    dims: ({ size = 40 }) => ({ reach: size * 1.02, height: size * 1.4 }),
    draw(props, { size: S = 40, count = 5, colors }, dims, { rand, shift }) {
      const c = coloursOf({ base: 'crystal', tip: 'crystalTip' }, colors);
      const shaft = (r, h, tipH, turn) => {
        const points = [];
        for (let k = 0; k < 6; k += 1) points.push([Math.cos(turn + (k * Math.PI) / 3) * r * 0.86, Math.sin(turn + (k * Math.PI) / 3) * r * 0.86, -0.08 * h]);
        for (let k = 0; k < 6; k += 1) points.push([Math.cos(turn + (k * Math.PI) / 3) * r, Math.sin(turn + (k * Math.PI) / 3) * r, h]);
        points.push([0, 0, h + tipH]);
        const faces = [];
        for (let k = 0; k < 6; k += 1) {
          const n = (k + 1) % 6;
          faces.push([k, n, 6 + n], [k, 6 + n, 6 + k], [6 + k, 6 + n, 12]);
        }
        props.facets(points, faces, (centre) => blend(c.base, c.tip, Math.min(1, Math.max(0, centre[2] / (h + tipH)) ** 1.4 * 0.85 + (centre[2] > h ? 0.15 : 0))));
      };
      props.look({ kind: LOOK.crystal }, () => {
        props.at({ lean: [(rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2] }, () => shaft(0.22 * S, 0.95 * S, 0.36 * S, rand()));
        for (let k = 1; k < count; k += 1) {
          const angle = (k / (count - 1)) * 2 * Math.PI + rand() * 0.6;
          const out = S * (0.24 + 0.14 * rand());
          const tilt = 0.35 + 0.35 * rand();
          const lean = [-Math.sin(angle) * tilt, Math.cos(angle) * tilt];
          const r = S * (0.1 + 0.07 * rand());
          const h = S * (0.32 + 0.38 * rand());
          props.at({ x: Math.cos(angle) * out, y: Math.sin(angle) * out, lean }, () => shaft(r, h, r * 1.5, rand()));
        }
      });
      props.shadow({ x: shift[0] * S * 0.4, y: shift[1] * S * 0.4, rx: S * 0.62, strength: 0.55 });
    },
  },

  /** A toadstool: a pale stem under a domed cap with white spots. */
  mushroom: {
    dims: ({ size = 9 }) => ({ reach: size * 1.05, height: size * 1.36 }),
    draw(props, { size: R = 9, colors }, dims, { rand, shift }) {
      const c = coloursOf({ cap: 'cap', spot: 'spot', stem: 'mushStem', gill: 'gill' }, colors);
      const z = 0.62 * R;
      props.lathe(
        [
          [0.34 * R, 0],
          [0.3 * R, 0.08 * R],
          [0.25 * R, 0.4 * R],
          [0.27 * R, z],
          [0, z + 0.02 * R],
        ],
        { color: c.stem, sides: 10 }
      );
      props.look({ kind: LOOK.gloss }, () => props.blob({ z, rx: R, rz: 0.72 * R, from: 0, to: 0.5, color: c.cap, sides: 16, rings: 8 }));
      props.lathe(
        [
          [R, z],
          [0.7 * R, z - 0.07 * R],
          [0.28 * R, z - 0.03 * R],
          [0, z],
        ],
        { color: c.gill, sides: 16 }
      );
      const count = 4 + Math.floor(rand() * 3);
      for (let k = 0; k < count; k += 1) {
        const angle = rand() * 6.28;
        const d = unit3([Math.cos(angle) * 0.75, Math.sin(angle) * 0.75, 0.55 + 0.45 * rand()]);
        const n = unit3([d[0] / R, d[1] / R, d[2] / (0.72 * R)]);
        props.at({ x: d[0] * R, y: d[1] * R, z: z + d[2] * 0.72 * R, lean: leanAlong(n) }, () => props.blob({ rx: 0.16 * R, rz: 0.05 * R, color: c.spot, sides: 8, rings: 4 }));
      }
      props.shadow({ x: shift[0] * z, y: shift[1] * z, rx: R * 0.95, strength: 0.6 });
    },
  },

  /** A tree stump: a flared foot, a pale cut top with a darker ring. */
  stump: {
    dims: ({ size = 14, height }) => ({ reach: size * 1.35, height: (height ?? size * 0.8) + size * 0.05 }),
    draw(props, { size: r = 14, height, colors }, dims, { shift }) {
      const h = height ?? r * 0.8;
      const c = coloursOf({ bark: 'bark', top: 'woodLight', ring: 'wood' }, colors);
      props.lathe(
        [
          [1.3 * r, 0],
          [1.08 * r, 0.1 * h],
          [r, 0.35 * h],
          [r, h],
          [0.94 * r, h + 0.02 * r],
          [0.62 * r, h + 0.03 * r],
          [0.56 * r, h + 0.03 * r],
          [0, h + 0.04 * r],
        ],
        { color: (i) => (i < 4 ? c.bark : i === 5 || i === 6 ? c.ring : c.top), sides: 16 }
      );
      props.shadow({ x: shift[0] * h * 0.5, y: shift[1] * h * 0.5, rx: 1.3 * r, strength: 0.6 });
    },
  },

  /** A bare tree: a crooked trunk, a few rising branches, each forked once. */
  deadTree: {
    dims: ({ height = 90 }) => ({ reach: height * 0.52, height }),
    draw(props, { height: H = 90, colors }, dims, { rand, shift }) {
      const c = coloursOf({ bark: '#6d6070' }, colors);
      const trunk = [];
      for (let i = 0; i <= 5; i += 1) {
        const s = i / 5;
        trunk.push([(rand() - 0.5) * 0.08 * H * s, (rand() - 0.5) * 0.08 * H * s, s * 0.78 * H]);
      }
      props.tube(trunk, trunk.map((p, i) => H * (0.075 - 0.011 * i)), c.bark, { sides: 8 });
      const count = 4 + Math.floor(rand() * 2);
      for (let k = 0; k < count; k += 1) {
        const from = trunk[2 + Math.floor(rand() * 3)];
        const yaw = (k / count) * 6.28 + rand() * 0.8;
        const reach = H * (0.24 + 0.14 * rand());
        const end = [from[0] + Math.cos(yaw) * reach, from[1] + Math.sin(yaw) * reach, from[2] + H * (0.12 + 0.16 * rand())];
        const mid = [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2, (from[2] + end[2]) / 2 + H * 0.04];
        props.tube([from, mid, end], [H * 0.03, H * 0.022, H * 0.01], c.bark, { sides: 6 });
        const twig = [end[0] + Math.cos(yaw + 0.8) * H * 0.1, end[1] + Math.sin(yaw + 0.8) * H * 0.1, end[2] + H * 0.09];
        props.tube([mid, twig], [H * 0.016, H * 0.007], c.bark, { sides: 5 });
      }
      props.shadow({ rx: H * 0.1, strength: 0.6 });
      props.shadow({ x: shift[0] * H * 0.6, y: shift[1] * H * 0.6, rx: H * 0.34, strength: 0.25 });
    },
  },

  /** A puffed cloud: soft white balls, flat underneath; no shadow unless asked. */
  cloud: {
    dims: ({ size = 50 }) => ({ reach: size * 1.2, height: size * 0.75 }),
    draw(props, { size: R = 50, shadow = false, colors }, dims, { rand }) {
      const c = coloursOf({ cloud: 'cloud' }, colors);
      props.look({ kind: LOOK.cloud }, () => {
        props.blob({ rx: R * 0.8, ry: R * 0.62, rz: R * 0.45, color: c.cloud });
        const count = 5 + Math.floor(rand() * 3);
        for (let k = 0; k < count; k += 1) {
          const angle = (k / count) * 6.28 + rand() * 0.5;
          const r = R * (0.36 + 0.2 * rand());
          props.blob({ x: Math.cos(angle) * R * 0.62, y: Math.sin(angle) * R * 0.48, z: (rand() - 0.6) * R * 0.15, rx: r, rz: r * 0.8, color: c.cloud });
        }
        props.blob({ x: -R * 0.12, y: R * 0.08, z: R * 0.28, rx: R * 0.45, rz: R * 0.38, color: c.cloud });
      });
      if (shadow) props.shadow({ rx: R * 1.1, ry: R * 0.85, strength: 0.4 });
    },
  },

  /** A Poké Ball, its band and button turned a little toward the near side. */
  pokeBall: {
    dims: ({ size = 10 }) => ({ reach: size * 1.05, height: size * 2 }),
    draw(props, { size: r = 10, colors }, dims, { shift }) {
      const c = coloursOf({ top: 'red', bottom: 'white', band: 'black', button: 'white' }, colors);
      props.at({ z: r, lean: [-0.42, 0] }, () => {
        props.look({ kind: LOOK.gloss }, () => {
          props.blob({ rx: r, color: (d) => (d[2] > 0.075 ? c.top : d[2] < -0.075 ? c.bottom : c.band), sides: 28, rings: 18 });
          props.at({ y: -r * 0.97, lean: [Math.PI / 2, 0] }, () => {
            props.blob({ rx: r * 0.34, rz: r * 0.08, color: c.band, sides: 14, rings: 5 });
            props.blob({ z: r * 0.05, rx: r * 0.22, rz: r * 0.07, color: c.button, sides: 14, rings: 5 });
          });
        });
      });
      props.shadow({ x: shift[0] * r, y: shift[1] * r, rx: r * 0.95, strength: 0.7 });
    },
  },

  /** A beach ball: six coloured gores, white caps. */
  beachBall: {
    dims: ({ size = 9 }) => ({ reach: size, height: size * 2 }),
    draw(props, { size: r = 9, gores = ['#e6443b', '#f6f4ee', '#3b82e6', '#f6f4ee', '#ffd23f', '#f6f4ee'] }, dims, { shift }) {
      const tints = gores.map(colour);
      props.at({ z: r * 0.94, lean: [0.5, 0.3] }, () =>
        props.look({ kind: LOOK.gloss }, () =>
          props.blob({
            rx: r,
            sides: 24,
            rings: 14,
            color: (d) => (Math.abs(d[2]) > 0.93 ? tints[1] : tints[Math.floor(((Math.atan2(d[1], d[0]) + Math.PI) / (2 * Math.PI)) * tints.length) % tints.length]),
          })
        )
      );
      props.shadow({ x: shift[0] * r, y: shift[1] * r, rx: r * 0.95, strength: 0.65 });
    },
  },

  /** A starfish lying flat: five fat points, ridged along each. */
  starfish: {
    dims: ({ size = 8 }) => ({ reach: size, height: size * 0.3 }),
    draw(props, { size: R = 8, colors }, dims, { rand }) {
      const c = coloursOf({ body: 'starfish' }, colors);
      const turn = rand() * 6.28;
      const centre = [0, 0, R * 0.28];
      const rim = [];
      for (let k = 0; k < 10; k += 1) {
        const angle = turn + (k / 10) * 2 * Math.PI;
        const r = k % 2 ? R * 0.42 : R;
        rim.push([Math.cos(angle) * r, Math.sin(angle) * r, k % 2 ? R * 0.06 : R * 0.04]);
      }
      for (let k = 0; k < 10; k += 1) props.triangle(centre, rim[k], rim[(k + 1) % 10], c.body);
      props.shadow({ rx: R * 0.9, strength: 0.4 });
    },
  },

  /** A shell: a ribbed half-dome. */
  shell: {
    dims: ({ size = 6 }) => ({ reach: size, height: size * 0.5 }),
    draw(props, { size: R = 6, colors }, dims, { rand }) {
      const c = coloursOf({ body: 'shell', rib: '#e9b9a4' }, colors);
      props.at({ yaw: rand() * 6.28 }, () =>
        props.blob({ rx: R, ry: R * 0.8, rz: R * 0.5, from: 0, to: 0.5, sides: 14, rings: 5, color: (d) => (Math.floor((Math.atan2(d[1], d[0]) + Math.PI) * 2.2) % 2 ? c.body : c.rib) })
      );
      props.shadow({ rx: R * 0.9, strength: 0.35 });
    },
  },

  /** A beach towel: a thin striped mat laid on the sand. */
  towel: {
    dims: ({ size = 40 }) => ({ reach: size * 0.58, height: 1 }),
    draw(props, { size: L = 40, stripes = ['#ff7a8a', '#fff4e8', '#ff7a8a', '#fff4e8', '#ff7a8a'] }) {
      const tints = stripes.map(colour);
      const w = L * 0.28;
      tints.forEach((tint, k) => {
        const x = -L / 2 + (L * (k + 0.5)) / tints.length;
        props.box({ x, y: 0, z0: 0, z1: 0.8, hw: L / tints.length / 2, hh: w, color: tint });
      });
    },
  },

  /** A surfboard lying on the sand, a stripe down its middle. */
  surfboard: {
    dims: ({ size = 60 }) => ({ reach: size * 0.52, height: size * 0.06 }),
    draw(props, { size: L = 60, colors }, dims, { shift }) {
      const c = coloursOf({ body: '#4fc3e8', stripe: '#fff4e8' }, colors);
      props.look({ kind: LOOK.gloss }, () =>
        props.blob({ z: L * 0.03, rx: L * 0.5, ry: L * 0.14, rz: L * 0.028, color: (d) => (Math.abs(d[1]) < 0.18 ? c.stripe : c.body), sides: 24, rings: 8 })
      );
      props.shadow({ x: shift[0] * 2, y: shift[1] * 2, rx: L * 0.52, ry: L * 0.16, strength: 0.5 });
    },
  },

  /**
   * A street lamp on a moulded iron foot: `style` 'lantern' is BDSP's town lamp (a four-paned glass
   * lantern lit from inside under a pointed cap and finial), 'globe' a glowing ball.
   */
  lamp: {
    dims: ({ height = 70, style = 'globe' }) => ({ reach: height * 0.12, height: height * (style === 'lantern' ? 1.03 : 1) }),
    draw(props, { height: H = 70, style = 'globe', glow = 2.2, colors }, dims, { shift }) {
      const c = coloursOf({ post: 'iron', light: style === 'lantern' ? 'glass' : 'glow' }, colors);
      // A lamp's glass is a light (w 2 and up), drawn at its own colour: paint divided out the kit's
      // key gain, so it is multiplied back and a lit lamp reads lit in daylight too.
      const light = [...c.light.slice(0, 3).map((v) => v * KEY_GAIN), 1 + glow];
      props.look({ kind: LOOK.gloss }, () =>
        props.lathe(
          [
            [0.11 * H, 0],
            [0.1 * H, 0.04 * H],
            [0.055 * H, 0.07 * H],
            [0.034 * H, 0.12 * H],
            [0.026 * H, 0.78 * H],
            [0.05 * H, 0.8 * H],
            [0, 0.81 * H],
          ],
          { color: c.post, sides: 12 }
        )
      );
      if (style === 'lantern') {
        props.box({ x: 0, y: 0, z0: 0.8 * H, z1: 0.94 * H, hw: 0.05 * H, hh: 0.05 * H, color: light });
        props.look({ kind: LOOK.gloss }, () => {
          for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) props.box({ x: x * 0.052 * H, y: y * 0.052 * H, z0: 0.8 * H, z1: 0.94 * H, hw: 0.008 * H, hh: 0.008 * H, color: c.post });
          props.lathe(
            [
              [0.085 * H, 0.94 * H],
              [0.03 * H, 0.99 * H],
              [0.012 * H, 1.0 * H],
              [0, 1.03 * H],
            ],
            { color: c.post, sides: 4, turn: Math.PI / 4 }
          );
        });
      } else {
        props.blob({ z: 0.88 * H, rx: 0.075 * H, color: light, sides: 14, rings: 10 });
        props.look({ kind: LOOK.gloss }, () =>
          props.lathe(
            [
              [0.06 * H, 0.94 * H],
              [0.045 * H, 0.97 * H],
              [0, 1.0 * H],
            ],
            { color: c.post, sides: 12 }
          )
        );
      }
      props.shadow({ x: shift[0] * 6, y: shift[1] * 6, rx: 0.13 * H, strength: 0.6 });
    },
  },

  /** A park bench `size` px long: iron feet, three rounded seat slats and a back of two. */
  bench: {
    dims: ({ size = 40 }) => ({ reach: size * 0.55, height: size * 0.5 }),
    draw(props, { size: L = 40, colors }, dims, { shift }) {
      const c = coloursOf({ wood: 'wood', woodDark: 'woodDark', iron: 'iron' }, colors);
      for (const x of [-0.38 * L, 0.38 * L]) {
        props.roundBox({ x, y: 0, z0: 0, z1: 0.24 * L, hw: 0.035 * L, hh: 0.16 * L, r: 0.012 * L, color: c.iron });
        props.roundBox({ x, y: 0.15 * L, z0: 0.22 * L, z1: 0.5 * L, hw: 0.03 * L, hh: 0.03 * L, r: 0.012 * L, color: c.iron });
      }
      for (const y of [-0.12 * L, 0, 0.12 * L]) props.roundBox({ x: 0, y, z0: 0.21 * L, z1: 0.26 * L, hw: 0.5 * L, hh: 0.05 * L, r: 0.02 * L, color: c.wood, topColor: c.wood });
      for (const z of [0.32 * L, 0.42 * L]) props.roundBox({ x: 0, y: 0.16 * L, z0: z, z1: z + 0.07 * L, hw: 0.5 * L, hh: 0.025 * L, r: 0.012 * L, color: c.woodDark });
      props.shadow({ x: shift[0] * 8, y: shift[1] * 8, rx: 0.58 * L, ry: 0.26 * L, strength: 0.55 });
    },
  },

  /** A café parasol over a little round table: striped canopy (`stripes`), a pole; `table` false for the beach. */
  parasol: {
    dims: ({ size = 30, height }) => ({ reach: size * 1.02, height: (height ?? size * 1.5) + size * 0.06 }),
    draw(props, { size: R = 30, height, stripes = ['#f05a4e', '#fff7ec'], table = true, colors }, dims, { shift }) {
      const H = height ?? R * 1.5;
      const c = coloursOf({ pole: 'white', table: 'white', chair: 'iron' }, colors);
      const tints = stripes.map(colour);
      const sectors = 8;
      props.lathe(
        [
          [0.035 * R, 0],
          [0.03 * R, H],
          [0, H + 0.05 * R],
        ],
        { color: c.pole, sides: 8 }
      );
      if (table) {
        props.cylinder({ x: 0, y: 0, z0: 0.4 * R, z1: 0.46 * R, r: 0.38 * R, color: c.table, sides: 18 });
        for (const angle of [0.6, 0.6 + Math.PI]) {
          props.roundBox({ x: Math.cos(angle) * 0.62 * R, y: Math.sin(angle) * 0.62 * R, z0: 0, z1: 0.3 * R, hw: 0.13 * R, hh: 0.13 * R, r: 0.04 * R, yaw: angle, color: c.chair });
        }
      }
      const apex = [0, 0, H + 0.04 * R];
      for (let k = 0; k < sectors; k += 1) {
        const a0 = (k / sectors) * 2 * Math.PI;
        const a1 = ((k + 1) / sectors) * 2 * Math.PI;
        const rim0 = [Math.cos(a0) * R, Math.sin(a0) * R, H - 0.3 * R];
        const rim1 = [Math.cos(a1) * R, Math.sin(a1) * R, H - 0.3 * R];
        props.triangle(rim0, rim1, apex, tints[k % tints.length]);
      }
      props.shadow({ x: shift[0] * H * 0.8, y: shift[1] * H * 0.8, rx: R * 0.98, strength: 0.6 });
    },
  },

  /** A planter box with rounded edges (`size` its half width) with a `plant`: 'bush', 'tree', 'flowers' or 'topiary' (BDSP's glossy ball). */
  planter: {
    // The rim's corner (1.08 W out each way), or the plant standing on the soil, whichever reaches further.
    dims: ({ size: W = 18, plant = 'bush' }) => {
      const grown = planterPlant(W, plant);
      const dims = ASSETS[grown.name].dims(grown.options);
      return { reach: Math.max(W * 1.08 * Math.SQRT2, dims.reach), height: PLANTER_SOIL * W + dims.height };
    },
    draw(props, { size: W = 18, plant = 'bush', seed = 0, colors }, dims, ctx) {
      const c = coloursOf({ box: 'planter', rim: 'white', soil: 'soil' }, colors);
      const top = 0.7 * W;
      props.roundBox({ x: 0, y: 0, z0: 0, z1: top, hw: W, hh: W, r: 0.12 * W, color: c.box });
      props.roundBox({ x: 0, y: 0, z0: top - 0.12 * W, z1: top + 0.06 * W, hw: W * 1.08, hh: W * 1.08, r: 0.06 * W, color: c.rim });
      props.box({ x: 0, y: 0, z0: top, z1: top + 0.08 * W, hw: W * 0.9, hh: W * 0.9, color: c.soil });
      const grown = planterPlant(W, plant, colors?.plant);
      const asset = ASSETS[grown.name];
      props.at({ z: PLANTER_SOIL * W }, () => asset.draw(props, grown.options, asset.dims(grown.options), { ...ctx, rand: seededRandom(seed + grown.salt) }));
      props.shadow({ rx: W * 1.45, strength: 0.6 });
    },
  },

  /** A clipped ball of box hedge on a short stem, glossy as BDSP's planter shrubs, in a pot unless `pot` is false. */
  topiary: {
    dims: ({ size = 16 }) => ({ reach: size * 1.1, height: size * 3.6 }),
    draw(props, { size: R = 16, pot = true, colors }, dims, { shift }) {
      const c = coloursOf({ leaf: 'leaf', leafLight: 'leafLight', pot: '#c8734e', stem: 'bark' }, colors);
      const base = pot ? 0.8 * R : 0;
      if (pot) {
        props.lathe(
          [
            [0.55 * R, 0],
            [0.7 * R, 0.6 * R],
            [0.78 * R, 0.66 * R],
            [0.76 * R, base],
            [0, base],
          ],
          { color: c.pot, sides: 14 }
        );
      }
      props.lathe(
        [
          [0.09 * R, base],
          [0.08 * R, base + 0.9 * R],
          [0, base + 1.0 * R],
        ],
        { color: c.stem, sides: 8 }
      );
      props.look({ kind: LOOK.gloss, sway: 0.4 }, () => props.blob({ z: base + 1.75 * R, rx: R, rz: 0.92 * R, color: (d) => (d[2] > 0.55 ? c.leafLight : c.leaf), sides: 22, rings: 14 }));
      props.shadow({ x: shift[0] * (base + 1.7 * R), y: shift[1] * (base + 1.7 * R), rx: R, strength: 0.6 });
    },
  },

  /** A run of picket fence along `path` ([x, y] points in the asset's frame), rounded posts every `spacing` px. */
  fence: {
    dims: ({ path = [[0, 0], [60, 0]], height = 16 }) => ({
      reach: Math.max(...path.map(([x, y]) => Math.hypot(x, y))) + 3,
      height,
    }),
    draw(props, { path = [[0, 0], [60, 0]], height: h = 16, spacing = 14, colors }) {
      const c = coloursOf({ wood: 'white', rail: 'white' }, colors);
      for (let i = 0; i < path.length - 1; i += 1) {
        const [x0, y0] = path[i];
        const [x1, y1] = path[i + 1];
        const length = Math.hypot(x1 - x0, y1 - y0);
        if (!(length > 0)) continue;
        const yaw = Math.atan2(y1 - y0, x1 - x0);
        const posts = Math.max(1, Math.round(length / spacing));
        for (let k = i === 0 ? 0 : 1; k <= posts; k += 1) {
          const s = k / posts;
          props.roundBox({ x: x0 + (x1 - x0) * s, y: y0 + (y1 - y0) * s, z0: 0, z1: h, hw: 1.3, hh: 1.3, r: 0.6, yaw, color: c.wood });
        }
        for (const z of [0.38 * h, 0.76 * h]) {
          props.roundBox({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z0: z, z1: z + 1.6, hw: length / 2, hh: 0.7, r: 0.35, yaw, color: c.rail });
        }
        props.shadow({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, rx: length / 2 + 2, ry: 3.2, yaw, strength: 0.35 });
      }
    },
  },

  /** A route sign, BDSP's: a white board in a grey stone frame on a low plinth. */
  signpost: {
    dims: ({ size = 24 }) => ({ reach: size * 0.6, height: size * 0.95 }),
    draw(props, { size: W = 24, colors }, dims, { shift }) {
      const c = coloursOf({ frame: 'stoneDark', board: 'white', foot: 'stone' }, colors);
      props.roundBox({ x: 0, y: 0, z0: 0, z1: 0.14 * W, hw: 0.42 * W, hh: 0.14 * W, r: 0.04 * W, color: c.foot });
      props.roundBox({ x: 0, y: 0, z0: 0.12 * W, z1: 0.92 * W, hw: 0.5 * W, hh: 0.08 * W, r: 0.05 * W, color: c.frame });
      props.box({ x: 0, y: -0.081 * W, z0: 0.24 * W, z1: 0.82 * W, hw: 0.4 * W, hh: 0.002 * W, color: c.board });
      props.shadow({ x: shift[0] * 10, y: shift[1] * 10, rx: 0.6 * W, ry: 0.22 * W, strength: 0.5 });
    },
  },

  /** A gravestone: a round-topped slab on a plinth (`style` 'slab' squares the top), every edge rounded. */
  gravestone: {
    dims: ({ size = 16 }) => ({ reach: size * 0.78, height: size * 1.25 }),
    draw(props, { size: W = 16, style = 'round', colors }, dims, { shift }) {
      const c = coloursOf({ stone: 'stone', dark: 'stoneDark' }, colors);
      const t = 0.16 * W;
      props.roundBox({ x: 0, y: 0, z0: 0, z1: 0.12 * W, hw: 0.64 * W, hh: 0.34 * W, r: 0.04 * W, color: c.dark });
      const shoulder = style === 'round' ? 0.75 * W : 1.05 * W;
      props.roundBox({ x: 0, y: 0, z0: 0.12 * W, z1: shoulder, hw: 0.5 * W, hh: t, r: style === 'round' ? 0.03 * W : 0.08 * W, color: c.stone });
      if (style === 'round') props.at({ z: shoulder, lean: [Math.PI / 2, 0] }, () => props.cylinder({ x: 0, y: 0, z0: -t, z1: t, r: 0.5 * W, color: c.stone, sides: 22 }));
      props.shadow({ x: shift[0] * W * 0.6, y: shift[1] * W * 0.6, rx: 0.7 * W, ry: 0.42 * W, strength: 0.55 });
    },
  },

  /** A short rounded post with a domed cap (a bollard, a mooring post): `size` its radius. */
  bollard: {
    dims: ({ size = 6, height = 16 }) => ({ reach: size * 1.08, height }),
    draw(props, { size: r = 6, height: H = 16, colors }, dims, { shift }) {
      const c = coloursOf({ body: '#4f7fd8', cap: '#3b67bd' }, colors);
      props.look({ kind: LOOK.gloss }, () =>
        props.lathe(
          [
            [1.08 * r, 0],
            [1.0 * r, 0.12 * H],
            [0.92 * r, 0.7 * H],
            [1.0 * r, 0.76 * H],
            [0.95 * r, 0.86 * H],
            [0.6 * r, 0.97 * H],
            [0, H],
          ],
          { color: (i) => (i >= 3 ? c.cap : c.body), sides: 16 }
        )
      );
      props.shadow({ x: shift[0] * H * 0.4, y: shift[1] * H * 0.4, rx: r * 1.4, strength: 0.6 });
    },
  },

  /** Reeds: thin stems, some with a brown cattail, leaning a little each its own way. */
  reeds: {
    // A stem leans out 0.12 of its height, its cattail 1.5 px round; its leaning end ring sits a hair over it.
    dims: ({ size = 10, height = 28 }) => ({ reach: size + height * 0.12 + 1.5, height: height + 0.5 }),
    draw(props, { size: R = 10, height: H = 28, count = 7, colors }, dims, { rand }) {
      const c = coloursOf({ reed: 'reed', cattail: 'cattail' }, colors);
      for (let k = 0; k < count; k += 1) {
        const angle = rand() * 6.28;
        const out = Math.sqrt(rand()) * R;
        const foot = [Math.cos(angle) * out, Math.sin(angle) * out, 0];
        const h = H * (0.6 + 0.4 * rand());
        const tip = [foot[0] + Math.cos(angle) * h * 0.12, foot[1] + Math.sin(angle) * h * 0.12, h];
        props.look({ kind: LOOK.foliage, sway: 0.9 }, () => {
          props.tube([foot, tip], [0.7, 0.4], c.reed, { sides: 5 });
          if (k % 2 === 0) props.blob({ x: foot[0] + (tip[0] - foot[0]) * 0.78, y: foot[1] + (tip[1] - foot[1]) * 0.78, z: h * 0.78, rx: 1.5, rz: h * 0.11, color: c.cattail, sides: 8, rings: 6 });
        });
      }
      props.shadow({ rx: R * 1.1, strength: 0.35 });
    },
  },

  /** A lily pad, notched, a pink bloom on some (`bloom`). */
  lilyPad: {
    dims: ({ size = 12, bloom = false }) => ({ reach: size, height: bloom ? size * 0.42 : Math.max(size * 0.4, 0.9) }),
    draw(props, { size: R = 12, bloom = false, colors }, dims, { rand }) {
      const c = coloursOf({ pad: 'lily', rim: 'lilyLight', petal: 'petal', eye: '#ffd84a' }, colors);
      const notch = rand() * 6.28;
      const sides = 16;
      const centre = [0, 0, 0.9];
      props.look({ kind: LOOK.foliage }, () => {
        for (let k = 0; k < sides; k += 1) {
          const a0 = notch + 0.35 + (k / sides) * (2 * Math.PI - 0.7);
          const a1 = notch + 0.35 + ((k + 1) / sides) * (2 * Math.PI - 0.7);
          props.triangle(centre, [Math.cos(a0) * R, Math.sin(a0) * R, 0.2], [Math.cos(a1) * R, Math.sin(a1) * R, 0.2], k % 4 === 0 ? c.rim : c.pad);
        }
      });
      if (bloom) {
        props.look({ kind: LOOK.foliage }, () => {
          for (let p = 0; p < 6; p += 1) {
            const a = (p / 6) * 2 * Math.PI;
            const tip = [Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45, R * 0.42];
            const left = [Math.cos(a - 0.45) * R * 0.18, Math.sin(a - 0.45) * R * 0.18, 1.2];
            const right = [Math.cos(a + 0.45) * R * 0.18, Math.sin(a + 0.45) * R * 0.18, 1.2];
            props.triangle(left, right, tip, c.petal);
          }
          props.blob({ z: R * 0.16, rx: R * 0.12, color: c.eye, sides: 8, rings: 5 });
        });
      }
    },
  },
};

/**
 * The umbrella broadleaf (treeRound `crown: 'umbrella'`): a trunk flaring at its foot, three limbs
 * forking out under the crown, a wide flat crown of leafy lumps (a broad flat middle, a ring of lumps
 * round its rim) with a band of lighter lumps on top leaning sunward. Every lump lies within 1.14 R
 * of the trunk and under umbrellaShape's top.
 */
function drawUmbrella(props, { size: R = 60, height, colors }, { rand, shift, sunward }) {
  const H = height ?? R * 2.3;
  const { base } = umbrellaShape(R, H);
  const c = coloursOf({ leaf: 'leaf', leafLight: 'leafLight', bark: 'bark', barkDark: 'barkDark' }, colors);
  props.lathe(
    [
      [0.3 * R, 0],
      [0.2 * R, 0.04 * H],
      [0.13 * R, 0.12 * H],
      [0.11 * R, 0.5 * base],
      [0.09 * R, base - 0.04 * R],
      [0, base + 0.02 * R],
    ],
    { color: (i) => (i < 1 ? c.barkDark : c.bark), sides: 14 }
  );
  const turn = rand() * 6.28;
  for (let k = 0; k < 3; k += 1) {
    const angle = turn + (k / 3) * 2 * Math.PI + (rand() - 0.5) * 0.5;
    const out = (0.38 + 0.1 * rand()) * R;
    const from = [0, 0, 0.55 * base];
    const to = [Math.cos(angle) * out, Math.sin(angle) * out, base + 0.02 * R];
    const via = [to[0] * 0.35, to[1] * 0.35, (from[2] + to[2]) / 2 + 0.06 * R];
    props.tube([from, via, to], [0.075 * R, 0.055 * R, 0.035 * R], c.bark, { sides: 8 });
  }
  const top = blend(c.leaf, c.leafLight, 0.65);
  const lumps = [{ z: base + 0.12 * R, rx: 0.95 * R, rz: 0.3 * R, color: c.leaf }];
  const rim = 7 + Math.floor(rand() * 2);
  for (let k = 0; k < rim; k += 1) {
    const angle = turn + (k / rim) * 2 * Math.PI + (rand() - 0.5) * 0.35;
    const r = (0.38 + 0.08 * rand()) * R;
    lumps.push({ x: Math.cos(angle) * 0.68 * R, y: Math.sin(angle) * 0.68 * R, z: base + 0.04 * R + rand() * 0.04 * R, rx: r, rz: r * 0.6, color: c.leaf });
  }
  const tops = 3 + Math.floor(rand() * 2);
  for (let k = 0; k < tops; k += 1) {
    const angle = turn + 0.6 + (k / tops) * 2 * Math.PI;
    const r = (0.34 + 0.05 * rand()) * R;
    lumps.push({
      x: Math.cos(angle) * 0.34 * R + sunward[0] * 0.14 * R,
      y: Math.sin(angle) * 0.34 * R + sunward[1] * 0.14 * R,
      z: base + 0.3 * R,
      rx: r,
      rz: r * 0.55,
      color: top,
    });
  }
  props.look({ kind: LOOK.foliage, leaf: 0.15 * R, sway: 0.9 }, () => props.lumps(lumps));
  props.shadow({ x: shift[0] * base, y: shift[1] * base, rx: 1.08 * R, strength: 0.6 });
  props.shadow({ rx: 0.36 * R, strength: 0.55 });
}

/** How high in a planter (× its half width) the plant stands: on the soil, a little under the rim's top. */
const PLANTER_SOIL = 0.75;

/**
 * What a planter of half width W grows (`plant`: 'tree', 'flowers', 'topiary', else a bush): the
 * asset, its options, and the salt its own random stream takes from the planter's seed.
 */
function planterPlant(W, plant, colors = {}) {
  if (plant === 'tree') return { name: 'treeRound', options: { size: 1.6 * W, height: 3.6 * W, colors }, salt: 1 };
  if (plant === 'flowers') return { name: 'flowers', options: { size: 0.75 * W, count: 6, head: 0.3 * W, petals: colors.petals }, salt: 2 };
  if (plant === 'topiary') return { name: 'topiary', options: { size: 0.85 * W, colors, pot: false }, salt: 3 };
  return { name: 'bush', options: { size: 0.95 * W, colors }, salt: 4 };
}

/**
 * Design 083: an instance's own shade of its palette, so a row of one asset never repeats: from its
 * seed, lighter or darker by up to 7% and warmer or cooler by up to 4%, times `vary` (0: none).
 * @returns {number[]} [r, g, b] factors
 */
export function instanceTint(seed = 0, vary = 1) {
  const amount = Number.isFinite(vary) ? Math.max(0, vary) : 1;
  const rand = seededRandom(seed * 3.7 + 11);
  const value = (rand() - 0.5) * 0.14 * amount;
  const warmth = (rand() - 0.5) * 0.08 * amount;
  return [1 + value + warmth, 1 + value, 1 + value - warmth];
}

/** Every asset's name. */
export const ASSET_NAMES = Object.freeze(Object.keys(ASSETS));

/** An asset's reach (px from its foot, seen from above) and height, for the given options. */
export function measureAsset(name, options = {}) {
  const asset = ASSETS[name];
  if (!asset) throw new Error(`unknown Stadium kit asset: ${name}`);
  return asset.dims(options);
}

/**
 * Builds asset `name` into `props` (createPropBuilder) standing at (x, y, z) turned by `yaw`, with
 * its own options (`size`, `height`, `colors`, `seed`, ...). `sun` (toward it, the board's own)
 * lays its shadows (`shadows: false`: none, the board's ground shades under it); on a board whose
 * kit stands on its ground, `ground: false` keeps the asset at z (a rock out in the sea). A seed
 * also tints its colours (instanceTint; `vary` 0..1, default 1, how far); without one it keeps its
 * palette. Returns measureAsset's dims.
 */
export function placeAsset(props, name, options = {}) {
  const dims = measureAsset(name, options);
  const { x = 0, y = 0, z = 0, yaw = 0, seed = 0 } = options;
  const sun = unit3(options.sun ?? SUN_DIRECTION);
  const lift = Math.max(sun[2], 0.25);
  const world = [(-sun[0] / lift) * SHADOW_SLIDE, (-sun[1] / lift) * SHADOW_SLIDE];
  const c = Math.cos(-yaw);
  const s = Math.sin(-yaw);
  const ctx = {
    rand: seededRandom(seed),
    shift: [world[0] * c - world[1] * s, world[0] * s + world[1] * c],
    sunward: [sun[0] * c - sun[1] * s, sun[0] * s + sun[1] * c],
  };
  const build = () => ASSETS[name].draw(props, options, dims, ctx);
  // An asset placed without a seed keeps its palette (a towel, a bench): only seeded ones vary.
  const draw = () => (options.seed === undefined ? build() : props.tint(instanceTint(seed, options.vary ?? 1), build));
  // Design 084: `lean` ([about x, about y], frameOf's) tips the whole asset about its foot.
  const lean = Array.isArray(options.lean) ? options.lean : [0, 0];
  props.at({ x, y, z, yaw, lean, ground: options.ground !== false }, () => (options.shadows === false ? props.withoutShadows(draw) : draw()));
  return dims;
}
