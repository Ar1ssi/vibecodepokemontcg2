// The crystal element: real 3-D cut gems (crystal.mjs gemMesh). Each instance is a six-sided
// quartz point, its cross-section made irregular by its seed, rolled about its axis, raised to its
// elevation and turned to its heading. The fragment takes one normal per face from screen-space
// slopes and lights it as glass: the board behind shows through, bent by the face and split a
// little into red and blue; the gem's own colour runs from a deep root to a pale tip; its ridges
// and its rim catch the light; a face turned to the light flashes in part; a thin spectral fire
// rides the grazing faces. Opaque and depth-writing, so a gem hides its far side and the gems
// behind it, and a card hides what grows from under it.
import { BOARD_GLSL, DISSOLVE_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { CRYSTAL_ATTRIBUTES, CRYSTAL_FLOATS, GEM_RINGS, gemMesh, normalizeCrystal, packCrystal } from './crystal.mjs';
import { defineInstancedKind } from './instanced-kind.js';

export const CRYSTAL_CAPACITY = 192;
const SIXTH = (Math.PI / 3).toFixed(7);

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
in vec4 iE;
in vec4 iF;
out vec3 vView;
out vec2 vRing;
out float vAxis;
flat out vec4 vBody;
flat out vec4 vLight;
flat out vec4 vFinish;
flat out vec4 vDeep;
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float seed = iC.w;
  float radius = length(position.yz);
  // Each of the six corners keeps its own reach, so no two gems share a cross-section.
  float corner = radius > 0.01 ? floor(atan(position.z, position.y) / ${SIXTH} + 0.5) : 0.0;
  float reach = 0.8 + 0.4 * h1(seed * 17.3 + corner * 5.1 + 1.7);
  bool shoulder = position.x > 0.4 && position.x < 0.95;
  float along = shoulder ? iE.w : position.x;
  // The prism narrows a little toward its shoulder.
  float taper = shoulder ? 0.78 + 0.16 * h1(seed * 3.3 + 0.4) : 1.0;
  vec3 p = vec3(along * iA.w, position.yz * iD.x * reach * taper);
  float cr = cos(iD.w);
  float sr = sin(iD.w);
  p = vec3(p.x, cr * p.y - sr * p.z, sr * p.y + cr * p.z);
  float ce = cos(iD.z);
  float se = sin(iD.z);
  p = vec3(ce * p.x - se * p.z, p.y, se * p.x + ce * p.z);
  float ch = cos(iD.y);
  float sh = sin(iD.y);
  p = vec3(ch * p.x - sh * p.y, sh * p.x + ch * p.y, p.z);
  vec4 view = viewMatrix * (uStageToWorld * vec4(iA.xyz + p, 1.0));
  gl_Position = projectionMatrix * view;
  vView = view.xyz;
  vRing = position.yz;
  vAxis = position.x;
  vBody = iB;
  vLight = iC;
  vFinish = iE;
  vDeep = iF;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
in vec3 vView;
in vec2 vRing;
in float vAxis;
flat in vec4 vBody;
flat in vec4 vLight;
flat in vec4 vFinish;
flat in vec4 vDeep;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
${BOARD_GLSL}
void main() {
  float seed = vLight.w;
  vec3 normal = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 toCamera = normalize(-vView);
  if (dot(normal, toCamera) < 0.0) normal = -normal;
  float facing = max(dot(normal, toCamera), 0.0);
  // One light for the board's effects: up-left and a little toward the camera, in view space.
  vec3 light = normalize(vec3(-0.5, 0.75, 0.45));
  float lambert = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - facing, 2.5);
  // The six long ridges (the ring's corners) and the line where the point begins.
  float turn = atan(vRing.y, vRing.x + 1e-5) / ${SIXTH};
  float across = fract(turn);
  float ridge = 1.0 - smoothstep(0.0, max(fwidth(turn) * 1.3, 0.03), min(across, 1.0 - across));
  float crease = 1.0 - smoothstep(0.0, fwidth(vAxis) * 1.5 + 0.008, abs(vAxis - ${GEM_RINGS.shoulder.toFixed(2)}));
  vec3 body = mix(vDeep.rgb, vBody.rgb, smoothstep(0.0, 0.55, vAxis));
  body = mix(body, vLight.rgb, 0.35 * smoothstep(0.6, 1.0, vAxis));
  // Through the gem: the board behind, bent by this face; red bends least and blue most.
  vec2 bend = normal.xy * vDeep.w;
  vec3 fallback = body * 0.4;
  vec3 behind = vec3(elBoardAt(bend * 0.8, fallback).r, elBoardAt(bend, fallback).g, elBoardAt(bend * 1.2, fallback).b);
  // Glass is clearest face-on and takes its own colour toward the grazing faces.
  float tint = 0.5 + 0.38 * (1.0 - facing);
  vec3 through = behind * mix(vec3(1.0), body * 1.3, tint) * (0.45 + 0.3 * lambert);
  // Its own colour, scattered inside it: a lit face glows with it and a shadowed one keeps a
  // third, so a gem over dark cloth is coloured glass, not a black one. Less over a bright card.
  vec3 own = body * (0.34 + 0.6 * lambert) * (1.0 - 0.45 * dot(behind, vec3(0.3, 0.5, 0.2)));
  vec3 colour = through + own
    + mix(body, vLight.rgb, 0.6) * rim * 0.45
    + vLight.rgb * (ridge * (0.14 + 0.32 * lambert) + crease * 0.12);
  // A face turned to the light flashes, but only in part: a whole face at full white is a slab.
  vec3 halfway = normalize(light + toCamera);
  float glint = pow(max(dot(normal, halfway), 0.0), 60.0);
  float spark = smoothstep(0.5, 0.85, elNoise3(vec3(vRing * 4.0, vAxis * 8.0 + seed)));
  colour += mix(vLight.rgb, vec3(1.0), 0.55) * glint * (0.35 + 1.7 * spark) * vFinish.y;
  // Fire: a spectral colour by the face's turn, on the grazing faces and the ridges only.
  float hue = dot(normal.xy, vec2(0.9, 1.3)) + seed * 0.13 + vAxis * 0.5 + uTime * 0.06;
  vec3 spectrum = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
  colour += spectrum * (rim * 0.3 + ridge * 0.14) * vFinish.z;
  float edge;
  float keep = elDissolve(vRing * 1.4 + vAxis * 2.0, vFinish.x, seed, edge);
  if (vBody.a * keep < 0.5) discard;
  colour = mix(colour, vLight.rgb * 1.5, edge);
  fragColor = vec4(colour, 1.0);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineCrystal(options) {
  return defineInstancedKind({
    ...options,
    kind: 'crystal',
    floats: CRYSTAL_FLOATS,
    attributes: CRYSTAL_ATTRIBUTES,
    capacity: CRYSTAL_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    renderOrder: 22,
    depthWrite: true,
    needsBoard: true,
    geometry: gemMesh(),
    normalize: normalizeCrystal,
    pack: packCrystal,
  });
}
