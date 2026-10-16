import { Color, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Vector4 } from 'three';
import { CARD } from '../../../../setup/deck-builder/core/build-battle/tabletop/physical.mjs';
import { cardSlab } from './tt-geometry.js';

/**
 * Cards on the tabletop (design 073 Options 3): a 63 × 88 × 0.31 mm slab with 3 mm corners, the
 * printed face, the card back, and the white edge with its dark core. Foil is part of the face's
 * physical material: where the card is foiled (art box on a holo, everything else on a reverse,
 * the whole card on a hit) the surface turns metallic and smooth, so it mirrors the room tinted
 * by the ink; a thin-film rainbow rides the reflection and the era's pattern (sheen lines,
 * starlight and glitter twinkles, cosmos blots, etched relief) breaks it up. Dark ink keeps the
 * foil down, as on a real print.
 */

const FOIL_MODE = Object.freeze({ none: 0, holo: 1, reverse: 2, full: 3, gold: 4, rainbow: 5 });
// Per foil: [metalness, roughness, relief]. An art-box holo is a near mirror; a textured hit is
// printed art with a satin shimmer, never chrome. An etched foil's relief is the print's own
// light and dark (the illustration embossed in the foil), so its number scales luminance.
const FOIL_SURFACE_BY_MODE = Object.freeze({
  1: [0.62, 0.18, 0.12],
  2: [0.5, 0.2, 0.1],
  3: [0.3, 0.27, 0.5],
  4: [0.6, 0.24, 0.9],
  5: [0.45, 0.2, 0.15],
});
const PATTERN = Object.freeze({ none: 0, sheen: 1, starlight: 2, cosmos: 3, etched: 4, glitter: 5, swirl: 6 });

const FOIL_HEAD = /* glsl */ `
uniform int uFoilMode;
uniform int uFoilPattern;
uniform vec4 uFoilWindow;
uniform float uFoilStrength;
uniform float uFoilMetal;
uniform float uFoilRough;
uniform float uFoilRelief;
varying vec2 vCardUv;
float ttCardHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float ttCardNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ttCardHash(i), ttCardHash(i + vec2(1.0, 0.0)), f.x),
             mix(ttCardHash(i + vec2(0.0, 1.0)), ttCardHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Relief height of the foil pattern at a card uv (0..1 across the face, y up), in millimetre
// space. Starlight and glitter are smooth here: their points of light are the sparkle term's.
float ttFoilHeight(vec2 uv) {
  vec2 p = uv * vec2(63.0, 88.0);
  if (uFoilPattern == 1) return 0.5 + 0.5 * sin((p.x * 0.8 + p.y * 0.6) * 5.0);
  if (uFoilPattern == 3) return ttCardNoise(p * 0.35) * 0.6 + ttCardNoise(p * 0.9) * 0.4;
  if (uFoilPattern == 4) return ttCardNoise(p * 1.2);
  if (uFoilPattern == 6) {
    vec2 q = p - vec2(31.5, 44.0);
    float n = ttCardNoise(p * 0.3);
    return 0.5 + 0.5 * sin(atan(q.y, q.x) * 6.0 + length(q) * 0.9 + n * 4.0);
  }
  return ttCardNoise(p * (uFoilPattern == 5 ? 1.25 : 0.5));
}
// The pattern's smallest feature in mm: relief finer than a couple of pixels only aliases into
// speckle, so it fades out as the card gets smaller on screen.
float ttFoilFeature() {
  if (uFoilPattern == 1) return 1.26;
  if (uFoilPattern == 2) return 2.0;
  if (uFoilPattern == 3) return 1.1;
  if (uFoilPattern == 4) return 0.83;
  if (uFoilPattern == 5) return 0.8;
  return 3.0;
}
`;

const FOIL_VERTEX_HEAD = 'varying vec2 vCardUv;';
const FOIL_VERTEX_BODY = 'vCardUv = uv;';

// After the material's own roughness/metalness: foil makes the surface a smooth metal.
const FOIL_SURFACE = /* glsl */ `
float ttFoil = 0.0;
float ttInk = 1.0;
float ttPattern = 0.0;
if (uFoilMode > 0) {
  vec2 uv = vCardUv;
  float inside = step(uFoilWindow.x, uv.x) * step(uv.x, uFoilWindow.z)
    * step(1.0 - uFoilWindow.w, uv.y) * step(uv.y, 1.0 - uFoilWindow.y);
  float area = uFoilMode == 1 ? inside : (uFoilMode == 2 ? 1.0 - inside : 1.0);
  ttInk = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float inkGate = smoothstep(0.04, 0.5, ttInk);
  ttFoil = area * inkGate * uFoilStrength;
  metalnessFactor = mix(metalnessFactor, uFoilMetal, ttFoil);
  roughnessFactor = mix(roughnessFactor, uFoilRough, ttFoil);
}
`;

// The pattern's relief tips the normal, so light catches on its lines (three's perturbNormalArb).
// Etched foil is embossed by the print itself: its relief follows the art's light and dark, with a
// fine etch over it, so a gold card shows its Pokémon as a raised shape in the gold.
const FOIL_NORMAL = /* glsl */ `
if (ttFoil > 0.0 && uFoilPattern > 0) {
  float mmPerPx = length(fwidth(vCardUv * vec2(63.0, 88.0)));
  float feature = ttFoilFeature();
  ttPattern = ttFoilHeight(vCardUv) * smoothstep(feature * 0.5, feature * 0.2, mmPerPx);
  float h = uFoilPattern == 4
    ? (ttInk * 4.0 + ttPattern * 0.25) * uFoilRelief * ttFoil
    : ttPattern * uFoilRelief * ttFoil;
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 sx = normalize(dFdx(-vViewPosition));
  vec3 sy = normalize(dFdy(-vViewPosition));
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;

// The thin-film rainbow, carried by what the foil reflects; glitter facets twinkle when they
// mirror the key light or a bright part of the room.
const FOIL_LIGHT = /* glsl */ `
if (ttFoil > 0.0) {
  vec3 V = normalize(vViewPosition);
  vec3 R = reflect(-V, normal);
  float reflected = min(dot(totalSpecular, vec3(0.299, 0.587, 0.114)), 1.2);
  float phase = dot(R, vec3(0.62, 0.48, 0.0)) * 1.6 + ttPattern * 0.35
    + (vCardUv.x + vCardUv.y) * 0.6;
  vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (phase + vec3(0.0, 0.33, 0.67)));
  if (uFoilMode == 4) rainbow = mix(vec3(1.0, 0.78, 0.32), rainbow, 0.18);
  float sheenLevel = uFoilMode == 5 ? 0.5 : 0.26;
  vec3 film = rainbow * (reflected * sheenLevel + 0.02) * ttFoil;
  float sparkle = 0.0;
  if (uFoilPattern == 2 || uFoilPattern == 5) {
    vec2 grid = vCardUv * (uFoilPattern == 2 ? vec2(70.0, 98.0) : vec2(150.0, 210.0));
    vec2 cell = floor(grid);
    float seed = ttCardHash(cell);
    vec3 tilt = vec3(ttCardHash(cell + 7.1) - 0.5, ttCardHash(cell + 3.3) - 0.5, 0.0);
    vec3 facetN = normalize(normal + tilt * 1.1);
    float dist = length(fract(grid) - 0.5);
    float lit = 0.0;
    #ifdef USE_ENVMAP
      lit += smoothstep(1.2, 2.6, dot(getIBLRadiance(V, facetN, 0.04), vec3(0.299, 0.587, 0.114)));
    #endif
    #if NUM_DIR_LIGHTS > 0
      lit += pow(max(dot(reflect(-V, facetN), directionalLights[0].direction), 0.0), 600.0) * 4.0;
    #endif
    // A few facets in each patch flash, as pinpoints; the rest of the foil only shimmers.
    sparkle = step(0.86, seed) * smoothstep(0.34, 0.06, dist) * lit;
  }
  outgoingLight += film + sparkle * ttFoil * mix(vec3(1.0), rainbow, 0.5);
}
`;

// Every face runs one program; the foil is all uniforms.
const PROGRAM_KEY = 'tt-card-face';

/**
 * @param {{map: object|null, envMap: object, finish?: object}} options
 * @returns {MeshPhysicalMaterial} the printed face; `material.userData.setFinish(finish)` changes foil.
 */
export function createFaceMaterial({ map, envMap, finish = null }) {
  const uniforms = {
    uFoilMode: { value: 0 },
    uFoilPattern: { value: 0 },
    uFoilWindow: { value: new Vector4(0, 0, 1, 1) },
    uFoilStrength: { value: 0 },
    uFoilMetal: { value: 0 },
    uFoilRough: { value: 0.4 },
    uFoilRelief: { value: 0 },
  };
  const material = new MeshPhysicalMaterial({
    map,
    color: new Color(map ? 0xffffff : 0x1d3f8f),
    // Card stock is satin: a soft sheen, not a mirror coat.
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.32,
    envMap,
    envMapIntensity: 1,
    alphaTest: 0.5,
  });
  const apply = (next) => {
    const mode = FOIL_MODE[next?.foil] || 0;
    const pattern = PATTERN[next?.pattern] || 0;
    const [l, t, r, b] = next?.window || [0, 0, 1, 1];
    uniforms.uFoilMode.value = mode;
    uniforms.uFoilPattern.value = pattern;
    uniforms.uFoilWindow.value.set(l, t, r, b);
    uniforms.uFoilStrength.value = Math.max(0, Math.min(1, Number(next?.strength) || 0));
    const [metal, rough, relief] = FOIL_SURFACE_BY_MODE[mode] || [0, 0.4, 0];
    uniforms.uFoilMetal.value = metal;
    uniforms.uFoilRough.value = rough;
    uniforms.uFoilRelief.value = relief;
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FOIL_VERTEX_HEAD}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n${FOIL_VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FOIL_HEAD}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${FOIL_SURFACE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FOIL_NORMAL}`)
      .replace('#include <opaque_fragment>', `${FOIL_LIGHT}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => PROGRAM_KEY;
  material.userData.setFinish = apply;
  material.userData.foilUniforms = uniforms;
  apply(finish);
  return material;
}

/**
 * Shared pieces for every card: one slab geometry, the back and edge materials.
 * @param {{envMap: object, backTexture: object|null, edgeTexture: object}} options
 */
export function createCardKit({ envMap, backTexture, edgeTexture }) {
  const geometry = cardSlab(CARD.width, CARD.height, CARD.thickness, CARD.cornerRadius, 6);
  const back = new MeshPhysicalMaterial({
    map: backTexture,
    color: new Color(backTexture ? 0xffffff : 0x1d3f8f),
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.32,
    envMap,
    envMapIntensity: 1,
    alphaTest: 0.5,
  });
  const edge = new MeshStandardMaterial({ map: edgeTexture, roughness: 0.85, metalness: 0, envMap, envMapIntensity: 0.4 });

  /** @returns {Mesh} a card whose face shows `map` (null: the back's blue until it loads). */
  const makeCard = ({ map = null, finish = null, name = 'card' } = {}) => {
    const face = createFaceMaterial({ map, envMap, finish });
    const mesh = new Mesh(geometry, [face, back, edge]);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.face = face;
    return mesh;
  };

  /** Swaps a card's printed face (a texture that loaded late, or a different card). */
  const setFace = (mesh, map, finish = null) => {
    const face = mesh.userData.face;
    face.map = map;
    face.color.set(map ? 0xffffff : 0x1d3f8f);
    face.userData.setFinish(finish);
    face.needsUpdate = true;
  };

  return {
    geometry,
    makeCard,
    setFace,
    dispose: () => {
      geometry.dispose();
      back.dispose();
      edge.dispose();
    },
  };
}

/** Disposes a card's own face material (the kit's shared parts stay). */
export function disposeCard(mesh) {
  mesh?.userData?.face?.dispose();
}
