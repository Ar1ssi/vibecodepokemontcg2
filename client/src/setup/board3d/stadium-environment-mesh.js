// Design 077 (prototype): a Stadium's place drawn under the real board. Builds the shown board's
// meshes (one builder per environment key, made the first time that key shows), bakes its ground
// once per layout, animates it, and hands the table a cutout (table-mesh.js setCutout) so the mat
// disappears where the environment shows. Cards, piles, labels and the zone-outline overlay stay the
// board's own, where and as large as they always are.
import * as glsl from './stadium-environment-glsl.mjs';
import * as forest from './stadium-env-forest.mjs';
import { MAX_BOG_LOBES, MAX_BOGS, MAX_CARD_RECTS, MAX_TREES, jungleLeaves, jungleSpots } from './stadium-env-forest-layout.mjs';
import * as highland from './stadium-env-highland.mjs';
import { fightingStadiumBoard } from './stadium-env-arena.mjs';
import { darkCityBoard } from './stadium-env-city.mjs';
import { fullMetalLabBoard } from './stadium-env-lab.mjs';
import { magmaBasinBoard } from './stadium-env-magma.mjs';
import { mountainRingBoard } from './stadium-env-ring.mjs';
import { steelShelterBoard } from './stadium-env-shelter.mjs';
import * as volcanic from './stadium-env-volcanic.mjs';
import {
  ENVIRONMENT_KEYS,
  craterBowl,
  craterEmblem,
  environmentFootprints,
  mountainPeaks,
  sceneBounds,
  volcanoSpot,
} from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

export const INTRO_MS = 1600;
/** Render layer of the environment: board-scene.js draws it in a pass of its own, under the board. */
export const STADIUM_ENV_LAYER = 3;
export const AMBIENT_FPS = 30;
const EMBER_COUNT = 220;
const SMOKE_COUNT = 14;
const SPORE_COUNT = 150;
/** Lightning slots: each strikes about once per cycle (s), at a random moment, some cycles not at all. */
const BOLT_CYCLES_S = [4.6, 6.9];
const STRIKE_S = 0.6;
const STRIKE_CHANCE = 0.8;
/**
 * Storm clouds a lightning arc runs between, over the cloud sea in a corner of the table (the scene
 * runs on past the table, but not every camera sees that far): `from` + up to `span` px past the
 * crater's rim, inside the table by `inset`, and low (`z` + up to 40 px) so the arc's height doesn't
 * lean it off the screen.
 */
const STORM_PX = { from: 100, span: 60, inset: 24, z: 96 };
/** Least turn round the mountain an arc spans (rad). */
const STORM_MIN_TURN = 0.08;
const STORM_ATTEMPTS = 6;

const BAKE_OPTIONS = { depthTest: false, depthWrite: false, toneMapped: false };

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** The scene an object is in (its root). */
const sceneOf = (object) => {
  let root = object;
  while (root.parent) root = root.parent;
  return root;
};

/** A deterministic 0..1 from two integers, so a strike looks the same in every frame it spans. */
const unitHash = (a, b) => {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** A strike's power `age` s after it begins: a bright first stroke, then two fainter return strokes. */
export function strikePower(age) {
  if (!(age >= 0) || age > STRIKE_S) return 0;
  const stroke = (start, peak, decay) => (age >= start ? peak * Math.exp(-(age - start) / decay) : 0);
  return Math.min(1, Math.max(stroke(0, 1, 0.07), stroke(0.13, 0.6, 0.06), stroke(0.27, 0.85, 0.1)));
}

/** The table grid the terrain displaces. */
const terrainGrid = (three, bounds) => {
  const columns = Math.max(1, Math.round(bounds.w / glsl.TERRAIN_SPACING_PX));
  const rows = Math.max(1, Math.round(bounds.h / glsl.TERRAIN_SPACING_PX));
  return new three.PlaneGeometry(bounds.w, bounds.h, columns, rows).translate(
    bounds.x + bounds.w / 2,
    bounds.y + bounds.h / 2,
    0
  );
};

const replaceGeometry = (mesh, geometry) => {
  mesh.geometry.dispose();
  mesh.geometry = geometry;
};

/** Scorched Earth: terrain with its lava, the river's sheet, embers and crater smoke. */
function scorchedEarthBoard({ three, material, seeded }) {
  const own = { uRiverY: { value: 0 }, uVolcano: { value: new three.Vector4() } };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(volcanic.TERRAIN_VERTEX, volcanic.TERRAIN_FRAGMENT),
    // Pushed back a hair so ground lying right at the river's level wins the depth test, not flickers.
    lava: make(volcanic.LAVA_VERTEX, volcanic.LAVA_FRAGMENT, {
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    }),
    embers: make(volcanic.EMBER_VERTEX, volcanic.EMBER_FRAGMENT, {
      transparent: true,
      depthWrite: false,
      blending: three.AdditiveBlending,
    }),
    smoke: make(volcanic.SMOKE_VERTEX, volcanic.SMOKE_FRAGMENT, { transparent: true, depthWrite: false }),
    bakeField: make(glsl.FULLSCREEN_VERTEX, volcanic.BAKE_FIELD_FRAGMENT, BAKE_OPTIONS),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const lava = new three.Mesh(new three.BufferGeometry(), materials.lava);
  const embers = new three.Points(seeded(EMBER_COUNT), materials.embers);
  const smoke = new three.Points(seeded(SMOKE_COUNT), materials.smoke);
  smoke.renderOrder = 1;
  embers.renderOrder = 2;
  return {
    objects: [terrain, lava, embers, smoke],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    spots: (layout) => ({ volcano: volcanoSpot(layout, environmentFootprints(layout)), riverY: layout.depth }),
    apply({ volcano, riverY }, bounds) {
      own.uVolcano.value.set(volcano?.x ?? 0, volcano?.y ?? 0, volcano?.r ?? 0, 0);
      own.uRiverY.value = riverY;
      replaceGeometry(terrain, terrainGrid(three, bounds));
      replaceGeometry(
        lava,
        new three.PlaneGeometry(bounds.w, bounds.h).translate(
          bounds.x + bounds.w / 2,
          bounds.y + bounds.h / 2,
          volcanic.LAVA_LEVEL
        )
      );
    },
  };
}

/** One lightning ribbon: a stroke and its fork, each a strip of quads along 0..1, two sides. */
const boltGeometry = (three) => {
  const along = [];
  const side = [];
  const fork = [];
  const index = [];
  let first = 0;
  for (const [isFork, segments] of [
    [0, highland.BOLT_SEGMENTS.stroke],
    [1, highland.BOLT_SEGMENTS.fork],
  ]) {
    for (let i = 0; i <= segments; i += 1) {
      for (const s of [-1, 1]) {
        along.push(i / segments);
        side.push(s);
        fork.push(isFork);
      }
    }
    for (let i = 0; i < segments; i += 1) {
      const a = first + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    first += (segments + 1) * 2;
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(new Float32Array(along.length * 3), 3));
  geometry.setAttribute('aAlong', new three.Float32BufferAttribute(along, 1));
  geometry.setAttribute('aSide', new three.Float32BufferAttribute(side, 1));
  geometry.setAttribute('aFork', new three.Float32BufferAttribute(fork, 1));
  geometry.setIndex(index);
  return geometry;
};

/**
 * The turns (rad, 0 along the table's width, pi/2 along its length) at which a point `radius` from
 * the mountain's centre, toward any corner, lies inside `bounds` by STORM_PX.inset; null when none.
 */
const cornerWindow = (bowl, bounds, radius) => {
  const across = Math.min(bowl.x - bounds.x, bounds.x + bounds.w - bowl.x) - STORM_PX.inset;
  const along = Math.min(bowl.y - bounds.y, bounds.y + bounds.h - bowl.y) - STORM_PX.inset;
  if (!(across > 0 && along > 0 && radius > 0)) return null;
  const from = Math.acos(Math.min(1, across / radius));
  const to = Math.asin(Math.min(1, along / radius));
  return to - from >= STORM_MIN_TURN ? { from, to } : null;
};

/**
 * Where strike `index` of lightning slot `slot` runs: two times in three from the storm down onto a
 * peak's summit, falling from over the crater's side of it (a stroke from out past a peak at the
 * table's edge leans off the screen), else from one storm cloud to another, low over the cloud sea
 * in a corner of `bounds` (the table). Null without a mountain, or when neither fits.
 */
export function strikePath(index, slot, { bowl, peaks }, bounds) {
  if (!bowl) return null;
  const roll = (salt) => unitHash(index, slot * 31 + salt);
  const seed = (index * 7 + slot * 3) % 997;
  const summits = [peaks.left, peaks.right].filter(Boolean);
  if (summits.length && roll(1) < 0.65) {
    const peak = summits[Math.floor(roll(2) * summits.length)];
    const inward = Math.atan2(bowl.y - peak.y, bowl.x - peak.x) + (roll(4) - 0.5) * 1.4;
    const reach = peak.r * (1.2 + roll(3));
    const from = {
      x: peak.x + Math.cos(inward) * reach,
      y: peak.y + Math.sin(inward) * reach,
      z: peak.h + 100 + 80 * roll(5),
    };
    return { from, to: { x: peak.x, y: peak.y, z: peak.h }, seed };
  }
  if (!bounds) return null;
  for (let attempt = 0; attempt < STORM_ATTEMPTS; attempt += 1) {
    const salt = 10 + attempt * 8;
    const radii = [3, 4].map((k) => bowl.rim + STORM_PX.from + STORM_PX.span * roll(salt + k));
    const windows = radii.map((radius) => cornerWindow(bowl, bounds, radius));
    if (!windows[0] || !windows[1]) continue;
    const from = Math.max(windows[0].from, windows[1].from);
    const to = Math.min(windows[0].to, windows[1].to);
    if (to - from < STORM_MIN_TURN) continue;
    // From near one end of the corner's window to near the other.
    const turns = [from + (to - from) * 0.3 * roll(salt + 1), to - (to - from) * 0.3 * roll(salt + 2)];
    const corner = Math.floor(roll(salt) * 4);
    const signX = corner % 2 === 0 ? -1 : 1;
    const signY = corner < 2 ? -1 : 1;
    const [start, end] = [0, 1].map((k) => ({
      x: bowl.x + signX * radii[k] * Math.cos(turns[k]),
      y: bowl.y + signY * radii[k] * Math.sin(turns[k]),
      z: STORM_PX.z + 40 * roll(salt + 5 + k),
    }));
    return { from: start, to: end, seed };
  }
  return null;
}

/**
 * Stormy Mountains: the mountain and its crater, the cloud sea round it, and two lightning ribbons
 * whose strikes the board schedules itself, lighting the ground and clouds as they fall.
 */
function stormyMountainsBoard({ three, material }) {
  const own = {
    uBowl: { value: new three.Vector4() },
    uFoot: { value: 0 },
    uPeakLeft: { value: new three.Vector4() },
    uPeakRight: { value: new three.Vector4() },
    uRidgeLeft: { value: new three.Vector2() },
    uRidgeRight: { value: new three.Vector2() },
    uEmblem: { value: new three.Vector3() },
    uFlash: { value: new three.Vector4() },
  };
  const make = (vertex, fragment, extra, uniforms = own) => material(vertex, fragment, extra, uniforms);
  const materials = {
    terrain: make(highland.TERRAIN_VERTEX, highland.TERRAIN_FRAGMENT),
    clouds: make(highland.CLOUD_VERTEX, highland.CLOUD_FRAGMENT, { transparent: true, depthWrite: false }),
    bakePre: make(glsl.FULLSCREEN_VERTEX, highland.BAKE_MOUNTAIN_FRAGMENT, BAKE_OPTIONS),
    bakeField: make(glsl.FULLSCREEN_VERTEX, highland.BAKE_FIELD_FRAGMENT, BAKE_OPTIONS),
    // Mountain faces are steep: occlusion follows the slope, or every face would bake dark.
    bakeLight: make(glsl.FULLSCREEN_VERTEX, glsl.bakeLightFragment({ aoFollowsSlope: true }), BAKE_OPTIONS),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const clouds = new three.Mesh(new three.BufferGeometry(), materials.clouds);
  clouds.renderOrder = 1;
  const bolts = BOLT_CYCLES_S.map(() => {
    const uniforms = {
      uBoltFrom: { value: new three.Vector3() },
      uBoltTo: { value: new three.Vector3() },
      uBoltSeed: { value: 0 },
      uBoltPower: { value: 0 },
      uBoltGrow: { value: 0 },
    };
    const boltMaterial = make(
      highland.BOLT_VERTEX,
      highland.BOLT_FRAGMENT,
      // Double-sided: which way the ribbon winds on screen turns with the stroke.
      { transparent: true, depthWrite: false, blending: three.AdditiveBlending, side: three.DoubleSide },
      uniforms
    );
    const mesh = new three.Mesh(boltGeometry(three), boltMaterial);
    mesh.renderOrder = 2;
    mesh.visible = false;
    return { mesh, uniforms, material: boltMaterial };
  });
  let spots = null;
  let bounds = null;

  const hideStorm = () => {
    for (const bolt of bolts) bolt.mesh.visible = false;
    own.uFlash.value.w = 0;
  };

  return {
    objects: [terrain, clouds, ...bolts.map((bolt) => bolt.mesh)],
    materials: [...Object.values(materials), ...bolts.map((bolt) => bolt.material)],
    bakePre: materials.bakePre,
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots(layout) {
      const bowl = craterBowl(layout);
      return {
        bowl,
        peaks: mountainPeaks(layout, bowl),
        emblem: craterEmblem(layout, bowl),
        table: tableBounds(layout),
      };
    },
    apply(next, nextBounds) {
      spots = next;
      bounds = nextBounds;
      const { bowl, peaks, emblem } = next;
      own.uBowl.value.set(bowl?.x ?? 0, bowl?.y ?? 0, bowl?.floor ?? 0, bowl?.rim ?? 0);
      own.uFoot.value = bowl?.foot ?? 0;
      for (const [side, peak] of [
        ['Left', peaks.left],
        ['Right', peaks.right],
      ]) {
        own[`uPeak${side}`].value.set(peak?.x ?? 0, peak?.y ?? 0, peak?.r ?? 0, peak?.h ?? 0);
        own[`uRidge${side}`].value.set(peak?.ridge.x ?? 0, peak?.ridge.y ?? 0);
      }
      own.uEmblem.value.set(emblem?.x ?? 0, emblem?.y ?? 0, emblem?.r ?? 0);
      replaceGeometry(terrain, terrainGrid(three, bounds));
      clouds.visible = Boolean(bowl);
      replaceGeometry(
        clouds,
        new three.PlaneGeometry(
          bounds.w,
          bounds.h,
          Math.max(1, Math.round(bounds.w / highland.CLOUD_SPACING_PX)),
          Math.max(1, Math.round(bounds.h / highland.CLOUD_SPACING_PX))
        ).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, 0)
      );
      hideStorm();
    },
    /** Lightning at `seconds` (null: frozen, none). */
    tick(seconds) {
      hideStorm();
      if (seconds === null || !spots || !bounds) return;
      let brightest = null;
      bolts.forEach((bolt, slot) => {
        const cycle = BOLT_CYCLES_S[slot];
        const index = Math.floor(seconds / cycle);
        if (unitHash(index, slot * 31 + 90) > STRIKE_CHANCE) return;
        const age = seconds - (index * cycle + unitHash(index, slot * 31 + 91) * (cycle - STRIKE_S));
        const power = strikePower(age);
        const path = power > 0 ? strikePath(index, slot, spots, spots.table) : null;
        if (!path) return;
        bolt.mesh.visible = true;
        bolt.uniforms.uBoltFrom.value.set(path.from.x, path.from.y, path.from.z);
        bolt.uniforms.uBoltTo.value.set(path.to.x, path.to.y, path.to.z);
        bolt.uniforms.uBoltSeed.value = path.seed;
        bolt.uniforms.uBoltPower.value = power;
        bolt.uniforms.uBoltGrow.value = Math.min(1, age / 0.06);
        if (!brightest || power > brightest.power) brightest = { power, at: path.to };
      });
      if (brightest) own.uFlash.value.set(brightest.at.x, brightest.at.y, brightest.at.z, brightest.power);
    },
  };
}

/**
 * Every leaf as one instanced strip: LEAF_SEGMENTS along, three columns across (the midrib between
 * the halves); position.xy is (across -1..1, along 0..1), the leaf's own data per instance.
 */
const leafGeometry = (three, leaves) => {
  const positions = [];
  const index = [];
  for (let i = 0; i <= forest.LEAF_SEGMENTS; i += 1) {
    for (const across of [-1, 0, 1]) positions.push(across, i / forest.LEAF_SEGMENTS, 0);
  }
  for (let i = 0; i < forest.LEAF_SEGMENTS; i += 1) {
    for (let column = 0; column < 2; column += 1) {
      const a = i * 3 + column;
      index.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
    }
  }
  const root = new Float32Array(leaves.length * 4);
  const shape = new Float32Array(leaves.length * 4);
  const bend = new Float32Array(leaves.length * 4);
  leaves.forEach((leaf, i) => {
    root.set([leaf.x, leaf.y, leaf.yaw, leaf.follow], i * 4);
    shape.set([leaf.length, leaf.width, leaf.kind, leaf.tint], i * 4);
    bend.set([leaf.lift, leaf.droop, leaf.fold, leaf.seed], i * 4);
  });
  const geometry = new three.InstancedBufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.setAttribute('aRoot', new three.InstancedBufferAttribute(root, 4));
  geometry.setAttribute('aShape', new three.InstancedBufferAttribute(shape, 4));
  geometry.setAttribute('aBend', new three.InstancedBufferAttribute(bend, 4));
  geometry.instanceCount = leaves.length;
  return geometry;
};

/** Indices of a ring-by-ring lathe `around` vertices wide, starting at vertex `first`. */
const latheIndex = (index, first, rings, around) => {
  for (let ring = 0; ring < rings; ring += 1) {
    for (let k = 0; k < around; k += 1) {
      const a0 = first + ring * around + k;
      const a1 = first + ring * around + ((k + 1) % around);
      index.push(a0, a0 + around, a1, a1, a0 + around, a1 + around);
    }
  }
};

/** An instanced geometry: `parts` per vertex (attribute `name`, `size` wide), `index`, and per-instance attributes. */
const instancedGeometry = (three, { name, size, parts, index }, instances) => {
  const geometry = new three.InstancedBufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(new Float32Array((parts.length / size) * 3), 3));
  geometry.setAttribute(name, new three.Float32BufferAttribute(parts, size));
  geometry.setIndex(index);
  for (const [attribute, width, values] of instances) {
    geometry.setAttribute(attribute, new three.InstancedBufferAttribute(Float32Array.from(values), width));
  }
  geometry.instanceCount = instances[0][2].length / instances[0][1];
  return geometry;
};

/** The bell flowers: per vertex aPart (stem ribbon, then the bell's lathe), per instance root and size. */
const bellGeometry = (three, bells) => {
  const { rings, around, stem } = forest.BELL_SEGMENTS;
  const parts = [];
  const index = [];
  for (let i = 0; i <= stem; i += 1) parts.push(0, i / stem, -1, 0, i / stem, 1);
  for (let i = 0; i < stem; i += 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const first = (stem + 1) * 2;
  for (let ring = 0; ring <= rings; ring += 1) {
    for (let k = 0; k < around; k += 1) parts.push(1, ring / rings, (k / around) * 2 * Math.PI);
  }
  latheIndex(index, first, rings, around);
  return instancedGeometry(three, { name: 'aPart', size: 3, parts, index }, [
    ['aRoot', 4, bells.flatMap((bell) => [bell.x, bell.y, bell.yaw, bell.seed])],
    ['aSize', 3, bells.flatMap((bell) => [bell.height, bell.reach, bell.radius])],
  ]);
};

/** The flower spikes: per vertex aCone (up and round the lathe), per instance root and size. */
const spikeGeometry = (three, spikes) => {
  const { rings, around } = forest.SPIKE_SEGMENTS;
  const parts = [];
  const index = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    for (let k = 0; k < around; k += 1) parts.push(ring / rings, (k / around) * 2 * Math.PI);
  }
  latheIndex(index, 0, rings, around);
  return instancedGeometry(three, { name: 'aCone', size: 2, parts, index }, [
    ['aRoot', 4, spikes.flatMap((spike) => [spike.x, spike.y, spike.leanYaw, spike.seed])],
    ['aSize', 3, spikes.flatMap((spike) => [spike.height, spike.radius, spike.lean])],
  ]);
};

/** Every limb of the trees: per vertex aLathe (along, round), its rings bunched toward the foot. */
const limbGeometry = (three, trees) => {
  const { rings, around } = forest.LIMB_SEGMENTS;
  const parts = [];
  const index = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    // The trunk's buttress roots flare at its foot: more rings there.
    const s = (ring / rings) ** 1.6;
    for (let k = 0; k <= around; k += 1) parts.push(s, (k / around) * 2 * Math.PI);
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let k = 0; k < around; k += 1) {
      const a = ring * (around + 1) + k;
      const b = a + around + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const limbs = trees.flatMap((tree) => tree.limbs.map((limb) => ({ tree, limb })));
  return instancedGeometry(three, { name: 'aLathe', size: 2, parts, index }, [
    ['aRoot', 4, limbs.flatMap(({ tree, limb }) => [tree.x, tree.y, tree.seed, limb.flare])],
    ['aFrom', 4, limbs.flatMap(({ limb }) => [...limb.from, limb.r0])],
    ['aVia', 4, limbs.flatMap(({ limb }) => [...limb.via, 0])],
    ['aTo', 4, limbs.flatMap(({ limb }) => [...limb.to, limb.r1])],
  ]);
};

/** Every clump of the crowns' foliage: per vertex the unit sphere, per instance the clump. */
const crownGeometry = (three, trees) => {
  const { rings, around } = forest.PUFF_SEGMENTS;
  const parts = [];
  const index = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const latitude = -Math.PI / 2 + (Math.PI * ring) / rings;
    for (let k = 0; k < around; k += 1) {
      const longitude = (k / around) * 2 * Math.PI;
      parts.push(Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude));
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let k = 0; k < around; k += 1) {
      const a0 = ring * around + k;
      const a1 = ring * around + ((k + 1) % around);
      index.push(a0, a1, a0 + around, a1, a1 + around, a0 + around);
    }
  }
  const puffs = trees.flatMap((tree) => tree.puffs.map((puff) => ({ tree, puff })));
  return instancedGeometry(three, { name: 'aSphere', size: 3, parts, index }, [
    ['aRoot', 4, puffs.flatMap(({ tree, puff }) => [tree.x, tree.y, tree.seed + puff.r * 0.013, tree.palette])],
    ['aPuff', 4, puffs.flatMap(({ puff }) => [puff.x, puff.y, puff.z, puff.r])],
    ['aShade', 1, puffs.map(({ puff }) => puff.shade)],
  ]);
};

/** Every vine: per vertex aStrip (across, down), per instance its anchor and size. */
const vineGeometry = (three, trees) => {
  const parts = [];
  const index = [];
  for (let i = 0; i <= forest.VINE_SEGMENTS; i += 1) parts.push(-1, i / forest.VINE_SEGMENTS, 1, i / forest.VINE_SEGMENTS);
  for (let i = 0; i < forest.VINE_SEGMENTS; i += 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const vines = trees.flatMap((tree) => tree.vines.map((vine) => ({ tree, vine })));
  return instancedGeometry(three, { name: 'aStrip', size: 2, parts, index }, [
    ['aRoot', 4, vines.flatMap(({ tree, vine }) => [tree.x, tree.y, vine.seed, vine.width])],
    ['aVine', 4, vines.flatMap(({ vine }) => [vine.x, vine.y, vine.z, vine.length])],
  ]);
};

/**
 * Perilous Jungle: the ground, the poison's sheet, every leaf, the bell flowers and flower spikes,
 * the trees (limbs, foliage, vines) and the spores.
 */
function perilousJungleBoard({ three, material, seeded }) {
  const own = {
    uCards: { value: Array.from({ length: MAX_CARD_RECTS }, () => new three.Vector4()) },
    uCore: { value: new three.Vector4() },
    uTable: { value: new three.Vector4() },
    uBogs: { value: Array.from({ length: MAX_BOGS * MAX_BOG_LOBES }, () => new three.Vector3()) },
    uIslands: { value: Array.from({ length: MAX_BOGS }, () => new three.Vector3()) },
    uCrowns: { value: Array.from({ length: MAX_TREES }, () => new three.Vector4()) },
    uTrunks: { value: Array.from({ length: MAX_TREES }, () => new three.Vector4()) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(forest.TERRAIN_VERTEX, forest.TERRAIN_FRAGMENT),
    // Pushed back a hair so the banks right at the poison's level win the depth test, not flicker.
    poison: make(forest.POISON_VERTEX, forest.POISON_FRAGMENT, {
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    }),
    // Both sides: a leaf curling over shows its underside. Edges by alpha to coverage.
    leaves: make(forest.LEAF_VERTEX, forest.LEAF_FRAGMENT, { side: three.DoubleSide, alphaToCoverage: true }),
    bells: make(forest.BELL_VERTEX, forest.BELL_FRAGMENT, { side: three.DoubleSide }),
    spikes: make(forest.SPIKE_VERTEX, forest.SPIKE_FRAGMENT),
    limbs: make(forest.LIMB_VERTEX, forest.LIMB_FRAGMENT),
    crowns: make(forest.CROWN_VERTEX, forest.CROWN_FRAGMENT),
    // Both sides: a vine turns to face the eye, but its ribbon may still wind either way on screen.
    vines: make(forest.VINE_VERTEX, forest.VINE_FRAGMENT, { side: three.DoubleSide, alphaToCoverage: true }),
    spores: make(forest.SPORE_VERTEX, forest.SPORE_FRAGMENT, {
      transparent: true,
      depthWrite: false,
      blending: three.AdditiveBlending,
    }),
    bakeField: make(glsl.FULLSCREEN_VERTEX, forest.BAKE_FIELD_FRAGMENT, BAKE_OPTIONS),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const poison = new three.Mesh(new three.BufferGeometry(), materials.poison);
  const leaves = new three.Mesh(new three.BufferGeometry(), materials.leaves);
  const bells = new three.Mesh(new three.BufferGeometry(), materials.bells);
  const spikes = new three.Mesh(new three.BufferGeometry(), materials.spikes);
  const limbs = new three.Mesh(new three.BufferGeometry(), materials.limbs);
  const crowns = new three.Mesh(new three.BufferGeometry(), materials.crowns);
  const vines = new three.Mesh(new three.BufferGeometry(), materials.vines);
  const spores = new three.Points(seeded(SPORE_COUNT), materials.spores);
  spores.renderOrder = 2;
  return {
    objects: [terrain, poison, leaves, bells, spikes, limbs, crowns, vines, spores],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    spots: (layout) => jungleSpots(layout),
    apply(spots, bounds) {
      const { cards, core, table, bogs, trees } = spots;
      own.uTable.value.set(table.x, table.y, table.x + table.w, table.y + table.h);
      // Footprints not in use lie far off the table, so no clearing forms round them; lobes, islands
      // and trees not in use have no radius.
      const setRect = (vector, rect) =>
        rect ? vector.set(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h) : vector.set(-1e5, -1e5, -1e5, -1e5);
      own.uCards.value.forEach((vector, i) => setRect(vector, cards[i]));
      setRect(own.uCore.value, core);
      const lobes = bogs.flatMap((bog) => bog.lobes);
      own.uBogs.value.forEach((vector, i) => (lobes[i] ? vector.set(lobes[i].x, lobes[i].y, lobes[i].r) : vector.set(0, 0, 0)));
      own.uIslands.value.forEach((vector, i) => {
        const island = bogs[i]?.island;
        return island ? vector.set(island.x, island.y, island.r) : vector.set(0, 0, 0);
      });
      own.uCrowns.value.forEach((crown, i) =>
        trees[i] ? crown.set(trees[i].cx, trees[i].cy, trees[i].crown, trees[i].cz) : crown.set(-1e5, -1e5, 0, 0)
      );
      own.uTrunks.value.forEach((trunk, i) =>
        trees[i] ? trunk.set(trees[i].x, trees[i].y, trees[i].trunk, trees[i].side) : trunk.set(-1e5, -1e5, 0, 0)
      );
      replaceGeometry(terrain, terrainGrid(three, bounds));
      replaceGeometry(
        poison,
        new three.PlaneGeometry(bounds.w, bounds.h).translate(
          bounds.x + bounds.w / 2,
          bounds.y + bounds.h / 2,
          forest.WATER_LEVEL
        )
      );
      replaceGeometry(leaves, leafGeometry(three, jungleLeaves(spots)));
      replaceGeometry(bells, bellGeometry(three, spots.bells));
      replaceGeometry(spikes, spikeGeometry(three, spots.spikes));
      replaceGeometry(limbs, limbGeometry(three, trees));
      replaceGeometry(crowns, crownGeometry(three, trees));
      replaceGeometry(vines, vineGeometry(three, trees));
    },
  };
}

const BOARDS = {
  'dark-city': darkCityBoard,
  'fighting-stadium': fightingStadiumBoard,
  'full-metal-lab': fullMetalLabBoard,
  'magma-basin': magmaBasinBoard,
  'mountain-ring': mountainRingBoard,
  'perilous-jungle': perilousJungleBoard,
  'scorched-earth': scorchedEarthBoard,
  'steel-shelter': steelShelterBoard,
  'stormy-mountains': stormyMountainsBoard,
};

/**
 * @param {{ three: typeof import('three'), renderer: import('three').WebGLRenderer,
 *   parent: import('three').Object3D, motionReduced?: () => boolean, onNeedsRender?: () => void,
 *   isHidden?: () => boolean, random?: () => number }} deps
 *   `parent` is the table frame (board-scene.js `tableFrame`); `onNeedsRender` asks the scene for a
 *   frame (ambient animation, 30 fps while shown).
 * @returns {{ setLayout: (layout: object) => void, setKey: (key: string|null) => boolean,
 *   update: (now: number, camera?: import('three').PerspectiveCamera) => boolean, active: () => boolean,
 *   cutout: { glsl: string, uniforms: object }, dispose: () => void }}
 *   `setKey` returns true when the shown environment changed; `update` (each frame, before the
 *   scene renders) bakes when needed and returns true while the reveal still runs.
 */
export function createStadiumEnvironment({
  three,
  renderer,
  parent,
  motionReduced = () => false,
  onNeedsRender = () => {},
  isHidden = () => globalThis.document?.hidden === true,
  random = Math.random,
}) {
  const group = new three.Group();
  group.name = 'board3d-stadium-env';
  group.visible = false;
  parent.add(group);

  const uniforms = {
    uMin: { value: new three.Vector2() },
    uSize: { value: new three.Vector2(1, 1) },
    uOrigin: { value: new three.Vector2() },
    uReveal: { value: 0 },
    uExit: { value: 0 },
    uTime: { value: 0 },
    uSun: { value: new three.Vector3(...glsl.SUN_DIRECTION).normalize() },
    uField: { value: null },
    uPre: { value: null },
    uLight: { value: null },
    uTexel: { value: new three.Vector2() },
    uFocal: { value: 1000 },
    uEye: { value: new three.Vector3() },
  };
  const cutout = {
    glsl: glsl.CUTOUT_GLSL,
    uniforms: {
      uMin: uniforms.uMin,
      uSize: uniforms.uSize,
      uOrigin: uniforms.uOrigin,
      uReveal: uniforms.uReveal,
      uExit: uniforms.uExit,
      uCutoutOn: { value: 0 },
      uTableFromWorld: { value: new three.Matrix4() },
    },
  };

  const kit = {
    three,
    /** A board material: the shared uniforms plus the board's own (same uniform objects, shared values). */
    material: (vertexShader, fragmentShader, extra = {}, own = {}) =>
      new three.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...uniforms, ...own }, ...extra }),
    seeded: (count) => {
      const geometry = new three.BufferGeometry();
      geometry.setAttribute('position', new three.BufferAttribute(new Float32Array(count * 3), 3));
      geometry.setAttribute(
        'aSeed',
        new three.BufferAttribute(Float32Array.from({ length: count * 4 }, () => random()), 4)
      );
      return geometry;
    },
    // For boards built in their own modules (stadium-env-<board>.mjs).
    bakeOptions: BAKE_OPTIONS,
    terrainGrid: (bounds) => terrainGrid(three, bounds),
    replaceGeometry,
    instancedGeometry: (spec, instances) => instancedGeometry(three, spec, instances),
    latheIndex,
  };
  const bakeLight = kit.material(glsl.FULLSCREEN_VERTEX, glsl.BAKE_LIGHT_FRAGMENT, BAKE_OPTIONS);
  const bakeCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bakeQuad = new three.Mesh(new three.PlaneGeometry(2, 2), bakeLight);
  bakeQuad.frustumCulled = false;
  const bakeScene = new three.Scene();
  bakeScene.add(bakeQuad);
  const bufferSize = new three.Vector2();

  /** Boards built so far, by key, each in a group of its own. */
  const boards = new Map();
  let key = null;
  let layout = null;
  let dirty = false;
  let bakedFor = '';
  let targets = null;
  let revealStartedAt = null;
  let ambientTimer = null;
  let disposed = false;
  let unsupported = false;

  const boardOf = (wanted) => {
    if (!boards.has(wanted)) {
      const board = BOARDS[wanted](kit);
      board.holder = new three.Group();
      board.holder.name = `board3d-stadium-env-${wanted}`;
      for (const object of board.objects) {
        object.frustumCulled = false;
        object.layers.set(STADIUM_ENV_LAYER);
        board.holder.add(object);
      }
      group.add(board.holder);
      boards.set(wanted, board);
    }
    return boards.get(wanted);
  };

  const stopAmbient = () => {
    if (ambientTimer !== null) clearTimeout(ambientTimer);
    ambientTimer = null;
  };

  const scheduleAmbient = () => {
    if (ambientTimer !== null || motionReduced() || isHidden()) return;
    ambientTimer = setTimeout(() => {
      ambientTimer = null;
      if (key && !disposed) onNeedsRender();
    }, 1000 / AMBIENT_FPS);
  };

  const renderBake = (target, material) => {
    bakeQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(bakeScene, bakeCamera);
  };

  const halfFloatTarget = (width, height) =>
    new three.WebGLRenderTarget(width, height, {
      type: three.HalfFloatType,
      minFilter: three.LinearFilter,
      magFilter: three.LinearFilter,
      depthBuffer: false,
    });

  const disposeTargets = () => {
    targets?.field.dispose();
    targets?.light.dispose();
    targets?.pre?.dispose();
  };

  /**
   * The board's ground field and its light, at ~BAKE_TEXELS_PER_PX texels per px of its scene, fewer
   * when that would pass BAKE_MAX_TEXEL_AREA. A board's first pass (`bakePre`) bakes before its
   * field, which reads it as uPre.
   */
  const bake = (bounds, board) => {
    const texelsPerPx = Math.min(glsl.BAKE_TEXELS_PER_PX, Math.sqrt(glsl.BAKE_MAX_TEXEL_AREA / (bounds.w * bounds.h)));
    const width = Math.max(2, Math.min(glsl.BAKE_MAX_TEXELS, Math.round(bounds.w * texelsPerPx)));
    const height = Math.max(2, Math.round((width * bounds.h) / bounds.w));
    if (!targets || targets.field.width !== width || targets.field.height !== height) {
      disposeTargets();
      targets = {
        pre: null,
        field: halfFloatTarget(width, height),
        light: new three.WebGLRenderTarget(width, height, {
          type: three.UnsignedByteType,
          minFilter: three.LinearMipmapLinearFilter,
          magFilter: three.LinearFilter,
          generateMipmaps: true,
          depthBuffer: false,
        }),
      };
    }
    uniforms.uTexel.value.set(1 / width, 1 / height);
    const previous = renderer.getRenderTarget();
    if (board.bakePre) {
      targets.pre ??= halfFloatTarget(width, height);
      renderBake(targets.pre, board.bakePre);
      uniforms.uPre.value = targets.pre.texture;
    }
    renderBake(targets.field, board.bakeField);
    uniforms.uField.value = targets.field.texture;
    renderBake(targets.light, board.bakeLight ?? bakeLight);
    uniforms.uLight.value = targets.light.texture;
    renderer.setRenderTarget(previous);
  };

  /** The shown board's landmarks from the layout; rebakes only when they or the board changed. */
  const applyLayout = () => {
    const bounds = sceneBounds(layout, key);
    if (!(bounds.w > 0 && bounds.h > 0)) return false;
    const board = boardOf(key);
    const spots = board.spots(layout);
    const stadium = layout.stadium;
    const origin = stadium
      ? { x: stadium.x + stadium.w / 2, y: stadium.y + stadium.h / 2 }
      : { x: bounds.x + bounds.w / 2, y: layout.depth };
    const signature = JSON.stringify([key, bounds, spots, origin]);
    if (signature === bakedFor) return true;
    uniforms.uMin.value.set(bounds.x, bounds.y);
    uniforms.uSize.value.set(bounds.w, bounds.h);
    uniforms.uOrigin.value.set(origin.x, origin.y);
    board.apply(spots, bounds);
    bake(bounds, board);
    bakedFor = signature;
    return true;
  };

  const setLayout = (next) => {
    if (disposed || !next) return;
    layout = next;
    dirty = true;
  };

  const setKey = (next) => {
    if (disposed) return false;
    const wanted = ENVIRONMENT_KEYS.includes(next) && BOARDS[next] ? next : null;
    if (wanted && !unsupported && renderer.extensions?.has?.('EXT_color_buffer_float') === false) {
      console.warn('board3d: stadium environment needs EXT_color_buffer_float; the mat stays');
      unsupported = true;
    }
    const shown = unsupported ? null : wanted;
    if (shown === key) return false;
    key = shown;
    for (const [boardKey, board] of boards) board.holder.visible = boardKey === key;
    if (key) boardOf(key).holder.visible = true;
    group.visible = Boolean(key);
    cutout.uniforms.uCutoutOn.value = key ? 1 : 0;
    uniforms.uReveal.value = 0;
    revealStartedAt = null;
    dirty = true;
    stopAmbient();
    onNeedsRender();
    return true;
  };

  const update = (now, camera) => {
    if (disposed || !key || !layout) return false;
    if (dirty) {
      if (!applyLayout()) return false;
      dirty = false;
    }
    const board = boards.get(key);
    if (camera && !board.compiled) {
      // Every program now, hidden meshes too (the lightning shows only when it strikes), so the first
      // strike doesn't stall a frame compiling its shader. This frame stalls instead: the reveal
      // starts with the next one, or it would run its course while the compile holds the screen.
      renderer.compile?.(board.holder, camera, sceneOf(group));
      board.compiled = true;
      revealStartedAt = null;
      uniforms.uReveal.value = 0;
      return true;
    }
    const reduced = motionReduced();
    if (revealStartedAt === null) revealStartedAt = now;
    const progress = reduced ? 1 : Math.min(1, Math.max(0, (now - revealStartedAt) / INTRO_MS));
    uniforms.uReveal.value = easeOutCubic(progress);
    uniforms.uTime.value = reduced ? 0 : now / 1000;
    board.tick?.(reduced ? null : now / 1000);
    if (camera) {
      renderer.getDrawingBufferSize(bufferSize);
      uniforms.uFocal.value = (camera.projectionMatrix.elements[5] * bufferSize.y) / 2;
    }
    group.updateWorldMatrix(true, false);
    cutout.uniforms.uTableFromWorld.value.copy(group.matrixWorld).invert();
    if (camera) uniforms.uEye.value.copy(camera.position).applyMatrix4(cutout.uniforms.uTableFromWorld.value);
    const revealing = progress < 1;
    if (!revealing) scheduleAmbient();
    return revealing;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopAmbient();
    key = null;
    cutout.uniforms.uCutoutOn.value = 0;
    parent.remove(group);
    for (const board of boards.values()) {
      for (const object of board.objects) object.geometry.dispose();
      for (const material of board.materials) material.dispose();
    }
    boards.clear();
    bakeQuad.geometry.dispose();
    bakeLight.dispose();
    disposeTargets();
    targets = null;
  };

  return { setLayout, setKey, update, active: () => key !== null, cutout, dispose };
}
