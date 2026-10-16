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
// How far a tear of size w reaches from where it started, toward d. Film tears in straight runs,
// so the hole is a ragged star: nine runs of random length with straight edges between their points.
float ttTearReach(vec3 d, float w) {
  // (The nudge keeps atan defined at the tear's very start.)
  float turn = atan(d.y, d.x + 1e-5) / 6.28318 + 0.5;
  float sector = floor(turn * 9.0);
  float f = fract(turn * 9.0);
  float tip = 0.2 + 0.6 * ttHash(vec3(sector, 1.7, 3.1));
  float reach = 0.6 + 0.4 * ttHash(vec3(sector, 5.3, 0.4));
  float run = f < tip ? f / tip : (1.0 - f) / (1.0 - tip);
  return w * (0.5 + (reach - 0.5) * run);
}
`;

const VERTEX_HEAD = /* glsl */ `
uniform float uLoosen;
uniform float uCrumple;
uniform vec4 uTear;
uniform float uFlapLift;
uniform vec3 uOrigin;
uniform vec3 uBallCenter;
uniform float uBallRadius;
uniform vec3 uDrift;
varying vec3 vFilmPos;
${NOISE_GLSL}
`;

// A crumpled film's facets face every which way: its normals turn from the box faces' toward the
// wad's surface, broken up per vertex so each facet catches the light on its own.
const VERTEX_NORMAL = /* glsl */ `
// Round a tear the film lets go of the board in flaps that rise toward the hole's edge, so their
// faces tip away from the hole and catch the light.
float ttFlap = 0.0;
if (uTear.w > 0.0 && uFlapLift > 0.0) {
  vec3 away = position - uTear.xyz;
  float beyond = length(away) - ttTearReach(away, uTear.w);
  ttFlap = smoothstep(12.0, 0.0, beyond) * step(-3.0, beyond);
  vec3 outward = normalize(away - normal * dot(away, normal) + vec3(1e-4));
  float slope = uFlapLift / 12.0 * 6.0 * ttFlap * (1.0 - ttFlap);
  objectNormal = normalize(objectNormal + outward * slope);
}
{
  float k = smoothstep(0.0, 1.0, uCrumple);
  if (k > 0.0) {
    vec3 outward = normalize(position - uOrigin + vec3(1e-4));
    vec3 jag = vec3(ttNoise(position * 0.37), ttNoise(position * 0.41 + 7.3), ttNoise(position * 0.39 + 2.9)) - 0.5;
    objectNormal = normalize(mix(objectNormal, normalize(outward + jag * 2.6), k));
  }
}
`;

const VERTEX_BODY = /* glsl */ `
vFilmPos = transformed;
{
  vec3 p = transformed;
  p += normal * ttFlap * uFlapLift * (0.6 + 0.8 * ttNoise(position * 0.2));
  // The film lets go of the box: it bellies out a little, unevenly.
  p += objectNormal * uLoosen * (1.5 + 5.0 * ttNoise(p * 0.045));
  // Then it balls up: each point keeps its bearing from the film's own centre and heads for that
  // spot on a lumpy sphere, wrinkling hard on the way.
  vec3 bearing = normalize(position - uOrigin + vec3(1e-4));
  float lump = 0.62 + 0.38 * ttNoise(p * 0.11 + 3.7);
  vec3 ball = uBallCenter + bearing * uBallRadius * lump;
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
uniform float uCrumple;
varying vec3 vFilmPos;
${NOISE_GLSL}
`;

// Ragged hole around the grab point: straight runs with small teeth (gentle enough never to cut
// islands of film loose), and the stretched lip of a tear goes faintly white.
const FRAGMENT_CLIP = /* glsl */ `
float ttRim = 0.0;
float ttStress = 0.0;
if (uTear.w > 0.0) {
  vec3 ttFromTear = vFilmPos - uTear.xyz;
  float edge = length(ttFromTear) - ttTearReach(ttFromTear, uTear.w) - (ttNoise(vFilmPos * 1.3) - 0.5) * 0.35;
  if (edge < 0.0) discard;
  ttRim = 1.0 - smoothstep(0.0, 1.3, edge);
  // Film that stretched before it gave way goes milky for a few millimetres back from the tear.
  ttStress = (1.0 - smoothstep(0.0, 5.0, edge)) * (0.55 + 0.45 * ttNoise(vFilmPos * 0.7));
}
`;

const makeUniforms = () => ({
  uLoosen: { value: 0 },
  uCrumple: { value: 0 },
  // The film's centre at rest, in its mesh's space: where a point's bearing on the ball is taken from.
  uOrigin: { value: new Vector3() },
  uBallCenter: { value: new Vector3() },
  uBallRadius: { value: 14 },
  uDrift: { value: new Vector3() },
  uTear: { value: new Vector4(0, 0, 0, 0) },
  // How far (mm) the film round a tear lifts off what it wraps; 0 keeps it flat.
  uFlapLift: { value: 0 },
  uFade: { value: 1 },
});

function inject(material, uniforms, { rimColor, crumpleBoost = 0, stressAlpha = 0 }) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${VERTEX_NORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAGMENT_CLIP}`)
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight += vec3(${rimColor}) * max(ttRim, ttStress * 0.35);\n#include <opaque_fragment>\n` +
          `gl_FragColor.a = max(gl_FragColor.a, ttStress * ${stressAlpha.toFixed(2)}) * uFade * (1.0 + uCrumple * ${crumpleBoost.toFixed(1)});`
      );
  };
  // One program per film kind: the uniforms object differs per mesh, the code does not.
  material.customProgramCacheKey = () => `tt-film-${rimColor}-${crumpleBoost}-${stressAlpha}`;
}

/**
 * @param {{envMap: object, crinkle: object|null, seams?: object|null, envIntensity?: number,
 *   haze?: number}} options
 * @returns {{gloss: MeshPhysicalMaterial, haze: MeshStandardMaterial, uniforms: object,
 *   dispose: () => void}}
 */
export function createFilmMaterials({ envMap, crinkle, seams = null, envIntensity = 0.85, haze = 0.07 }) {
  const uniforms = makeUniforms();
  // A tight film is nearly flat; the crinkle only breaks up its reflections.
  const normalScale = new Vector2(0.22, 0.22);
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
  inject(gloss, uniforms, { rimColor: '0.22' });
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
  // Balled-up film scatters light: the crumpled wad reads milky white.
  inject(hazeMaterial, uniforms, { rimColor: '0.55', crumpleBoost: 5, stressAlpha: 0.3 });
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
