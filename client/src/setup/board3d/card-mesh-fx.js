// Design 076 row 5: the materials of a card mesh's shader effect (card-mesh.js `cardFx`). A card
// with a running effect gets its own uniforms; a burning one also its own cut copies of its front,
// back, edge walls and shadow depth (the shared materials stay untouched, so a card at rest looks
// exactly as before), and every effect gets a glow twin: the card's geometry again, drawing the
// ember line and the rim additively. A burn's twin is on the FX layer, in HDR, so the layer's bloom
// takes the ember line; a rim's is in the board's own pass, where nothing blooms it (the FX layer
// blooms a texel's whole colour once it clears the threshold, so a rim over the move's own light
// washed the whole card face gold).
// `three` is the namespace from `import('three')`; this module never imports it statically.
import {
  CARD_FX_FRAGMENT,
  CARD_FX_VERTEX,
  CARD_GLOW_FRAGMENT,
  CARD_GLOW_VERTEX,
  DISSOLVE,
  RIM,
  unitRgb,
} from './card-mesh-fx.mjs';
import { FX_LAYER } from './fx/fx-layers.mjs';

/** Gold ember: the KO scene's stars and pile catch are gold, so its burn is too (one palette). */
export const DEFAULT_EDGE_RGB = Object.freeze([255, 170, 70]);
const DEFAULT_RIM_RGB = Object.freeze([255, 245, 176]);

/**
 * One card's effect uniforms, shared by its cut materials and its glow twin.
 * @param {typeof import('three')} three
 */
export function createCardFxUniforms(three) {
  return {
    uCardDissolve: { value: 0 },
    uCardDissolveWidth: { value: DISSOLVE.width },
    uCardDissolveScale: { value: DISSOLVE.scale },
    uCardDissolveGain: { value: DISSOLVE.gain },
    uCardEdge: { value: new three.Vector3(...unitRgb(DEFAULT_EDGE_RGB)) },
    uCardHalf: { value: new three.Vector2(1, 1) },
    uCardRadius: { value: 0 },
    uCardRim: { value: 0 },
    uCardRimBand: { value: RIM.band },
    uCardRimGain: { value: RIM.gain },
    uCardRimColor: { value: new three.Vector3(...unitRgb(DEFAULT_RIM_RGB)) },
  };
}

/** Writes the card's size and the effect's colours (0–255 RGB) into its uniforms. */
export function setCardFxShape(uniforms, { w, h, radius, edgeRgb, rimRgb }) {
  uniforms.uCardHalf.value.set(w / 2, h / 2);
  uniforms.uCardRadius.value = radius;
  if (edgeRgb) uniforms.uCardEdge.value.set(...unitRgb(edgeRgb, DEFAULT_EDGE_RGB));
  if (rimRgb) uniforms.uCardRimColor.value.set(...unitRgb(rimRgb, DEFAULT_RIM_RGB));
}

/**
 * Makes `material` (a built-in: card art, MeshStandard, MeshDepth) burn by `uniforms`, chaining
 * any `onBeforeCompile` it already has (the card art's LOD bias). With uCardDissolve 0 it draws
 * as before.
 */
export function injectCardBurn(material, uniforms) {
  const before = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey?.() ?? '';
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = CARD_FX_VERTEX.head + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n${CARD_FX_VERTEX.body}`
    );
    shader.fragmentShader = CARD_FX_FRAGMENT.head + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${CARD_FX_FRAGMENT.cut}`)
      .replace('#include <opaque_fragment>', `${CARD_FX_FRAGMENT.tint}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${baseKey}+card-burn`;
  material.needsUpdate = true;
  return material;
}

/**
 * The burning copy of one of a card's materials: same look, own program, `uniforms` wired in.
 * A copy keeps the base's texture (shared, never disposed here).
 * @param {typeof import('three')} three
 * @param {import('three').Material} base
 * @param {(three: typeof import('three'), o: { map?: object }) => import('three').Material} createArt
 */
export function burningCopyOf(three, base, uniforms, createArt) {
  const copy = base.isMeshBasicMaterial ? createArt(three, { map: base.map ?? null }) : base.clone();
  copy.transparent = false;
  copy.opacity = 1;
  return injectCardBurn(copy, uniforms);
}

/** The shadow-depth material of a burning card, so its shadow burns with it. */
export function createBurningDepthMaterial(three, uniforms) {
  return injectCardBurn(new three.MeshDepthMaterial(), uniforms);
}

/**
 * The glow twin of a card mesh: its geometry again, additive light (alpha kept), depth-tested
 * against the cards but never writing depth. `bloom`: on the FX layer only (into its HDR target),
 * else in the board pass (layer 0, which the FX passes never draw).
 * @param {typeof import('three')} three
 * @param {import('three').BufferGeometry} geometry
 */
export function createCardGlowTwin(three, geometry, uniforms, { bloom = true } = {}) {
  const material = new three.ShaderMaterial({
    name: 'board3d-card-glow',
    uniforms,
    vertexShader: CARD_GLOW_VERTEX,
    fragmentShader: CARD_GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: three.CustomBlending,
    blendEquation: three.AddEquation,
    blendSrc: three.OneFactor,
    blendDst: three.OneFactor,
    blendSrcAlpha: three.ZeroFactor,
    blendDstAlpha: three.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    toneMapped: false,
  });
  const twin = new three.Mesh(geometry, material);
  twin.name = 'board3d-card-glow';
  twin.layers.set(bloom ? FX_LAYER : 0);
  twin.castShadow = false;
  twin.receiveShadow = false;
  twin.frustumCulled = false;
  return twin;
}
