import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Vector2,
  Vector3,
  Vector4,
} from 'three';

/**
 * Clear plastic film for the tabletop (design 073 Options 4): shrink-wrap on the box and the
 * cellophane on the deck. A film is two layers on one mesh:
 * - gloss: black, smooth, additive — only its reflections reach the screen, so it adds glints
 *   and the bright env without dimming what is under it (what clear film looks like);
 * - haze: a faint milky layer carrying the crinkle normal map and the heat-seal seams.
 * Both share uniforms that tear a ragged hole where the film was grabbed and ball it up as it
 * comes off (`tear`, `loosen`, `crumple`), sampled in object space so the hole stays on the film.
 */

const NOISE_GLSL = /* glsl */ `
float ttHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float ttNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ttHash(i + vec3(0, 0, 0)), ttHash(i + vec3(1, 0, 0)), f.x),
                 mix(ttHash(i + vec3(0, 1, 0)), ttHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(ttHash(i + vec3(0, 0, 1)), ttHash(i + vec3(1, 0, 1)), f.x),
                 mix(ttHash(i + vec3(0, 1, 1)), ttHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

const VERTEX_HEAD = /* glsl */ `
uniform float uLoosen;
uniform float uCrumple;
uniform vec3 uBallCenter;
uniform float uBallRadius;
uniform vec3 uDrift;
varying vec3 vFilmPos;
${NOISE_GLSL}
`;

const VERTEX_BODY = /* glsl */ `
vFilmPos = transformed;
{
  vec3 p = transformed;
  // The film lets go of the box: it bellies out a little, unevenly.
  p += objectNormal * uLoosen * (1.5 + 5.0 * ttNoise(p * 0.045));
  // Then it balls up: every point heads for a lumpy sphere, wrinkling hard on the way.
  vec3 toward = p - uBallCenter;
  float lump = 0.62 + 0.38 * ttNoise(p * 0.11 + 3.7);
  vec3 ball = uBallCenter + normalize(toward + vec3(1e-4)) * uBallRadius * lump;
  float k = smoothstep(0.0, 1.0, uCrumple);
  p = mix(p, ball, k);
  p += (vec3(ttNoise(p * 0.21), ttNoise(p * 0.23 + 9.1), ttNoise(p * 0.19 + 4.3)) - 0.5)
    * 9.0 * k * (1.0 - k) * 2.0;
  p += uDrift * k;
  transformed = p;
}
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform vec4 uTear;
uniform float uFade;
varying vec3 vFilmPos;
${NOISE_GLSL}
`;

// Ragged hole around the grab point; the stretched rim of a tear goes white.
const FRAGMENT_CLIP = /* glsl */ `
float ttRim = 0.0;
if (uTear.w > 0.0) {
  float ragged = (ttNoise(vFilmPos * 0.16) - 0.5) * uTear.w * 0.55
    + (ttNoise(vFilmPos * 0.9) - 0.5) * 2.2;
  float edge = distance(vFilmPos, uTear.xyz) - (uTear.w + ragged);
  if (edge < 0.0) discard;
  ttRim = 1.0 - smoothstep(0.0, 2.6, edge);
}
`;

const makeUniforms = () => ({
  uLoosen: { value: 0 },
  uCrumple: { value: 0 },
  uBallCenter: { value: new Vector3() },
  uBallRadius: { value: 14 },
  uDrift: { value: new Vector3() },
  uTear: { value: new Vector4(0, 0, 0, 0) },
  uFade: { value: 1 },
});

function inject(material, uniforms, { rimColor }) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAGMENT_CLIP}`)
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight += vec3(${rimColor}) * ttRim;\n#include <opaque_fragment>\ngl_FragColor.a *= uFade;`
      );
  };
  // One program per film kind: the uniforms object differs per mesh, the code does not.
  material.customProgramCacheKey = () => `tt-film-${rimColor}`;
}

/**
 * @param {{envMap: object, crinkle: object|null, seams?: object|null, envIntensity?: number,
 *   haze?: number}} options
 * @returns {{gloss: MeshPhysicalMaterial, haze: MeshStandardMaterial, uniforms: object,
 *   dispose: () => void}}
 */
export function createFilmMaterials({ envMap, crinkle, seams = null, envIntensity = 1.35, haze = 0.07 }) {
  const uniforms = makeUniforms();
  const normalScale = new Vector2(0.55, 0.55);
  const gloss = new MeshPhysicalMaterial({
    color: new Color(0x000000),
    roughness: 0.07,
    metalness: 0,
    envMap,
    envMapIntensity: envIntensity,
    normalMap: crinkle,
    normalScale,
    specularIntensity: 1,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  inject(gloss, uniforms, { rimColor: '0.55' });
  const hazeMaterial = new MeshStandardMaterial({
    color: new Color(0xf4f7fb),
    roughness: 0.35,
    metalness: 0,
    envMap,
    envMapIntensity: 0.4,
    normalMap: crinkle,
    normalScale,
    alphaMap: seams,
    transparent: true,
    opacity: haze,
    blending: NormalBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  inject(hazeMaterial, uniforms, { rimColor: '0.9' });
  return {
    gloss,
    haze: hazeMaterial,
    uniforms,
    dispose: () => {
      gloss.dispose();
      hazeMaterial.dispose();
    },
  };
}

/** Resets a film's shader state (a fresh, intact film). */
export function resetFilm(uniforms) {
  uniforms.uLoosen.value = 0;
  uniforms.uCrumple.value = 0;
  uniforms.uDrift.value.set(0, 0, 0);
  uniforms.uTear.value.set(0, 0, 0, 0);
  uniforms.uFade.value = 1;
}
