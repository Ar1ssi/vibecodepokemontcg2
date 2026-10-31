// Design 081: the Stadium kit's one look. Every kit asset (stadium-kit-assets.mjs) is drawn by
// three meshes that share one geometry (stadium-env-props.mjs createPropBuilder): its contact
// shadows (soft ellipses multiplied into the ground, drawn after the ground and before any prop),
// the solid (KIT_LIGHT: a two-tone toon ramp with a cool, saturated shade, a little sky, a rim on
// the lit side, a hard glint on glossy parts) and its outline (the back faces of a hull pushed out
// along aHull by uKitOutline.w plate px, painted a dark shade of the part's own colour). A board's
// mood (MOODS) sets the light's colours; its sun is the board's own uSun.
// Colours are authored as they show on screen: paint('#hex') inverts sRGB and Neutral tone mapping.
// Pure: three comes in through createKitProps' arguments.
import { NOISE, OUTPUT, REVEAL, TERRAIN_GROUND, TERRAIN_UNIFORMS } from './stadium-environment-glsl.mjs';

/** The light's colours per mood. rim, outline and shadow carry a strength / width in px / strength in w. */
export const MOODS = Object.freeze({
  day: Object.freeze({
    key: [1.0, 0.97, 0.9],
    shade: [0.5, 0.56, 0.78],
    sky: [0.55, 0.68, 0.95],
    rim: [1.0, 0.97, 0.86, 0.2],
    outline: [0.36, 0.33, 0.42, 1.15],
    shadow: [0.46, 0.5, 0.66, 0.6],
  }),
  dusk: Object.freeze({
    key: [1.0, 0.86, 0.7],
    shade: [0.42, 0.42, 0.7],
    sky: [0.6, 0.5, 0.8],
    rim: [1.0, 0.75, 0.55, 0.3],
    outline: [0.32, 0.26, 0.38, 1.15],
    shadow: [0.42, 0.4, 0.62, 0.6],
  }),
  night: Object.freeze({
    key: [0.62, 0.7, 1.0],
    shade: [0.28, 0.3, 0.55],
    sky: [0.3, 0.36, 0.7],
    rim: [0.6, 0.75, 1.0, 0.35],
    outline: [0.28, 0.26, 0.4, 1.15],
    shadow: [0.36, 0.36, 0.56, 0.6],
  }),
  indoor: Object.freeze({
    key: [1.0, 0.98, 0.94],
    shade: [0.62, 0.64, 0.76],
    sky: [0.75, 0.78, 0.86],
    rim: [1.0, 1.0, 1.0, 0.16],
    outline: [0.38, 0.36, 0.44, 1.1],
    shadow: [0.55, 0.57, 0.68, 0.5],
  }),
  cave: Object.freeze({
    key: [0.95, 0.88, 0.85],
    shade: [0.36, 0.34, 0.56],
    sky: [0.45, 0.4, 0.62],
    rim: [0.75, 0.85, 1.0, 0.3],
    outline: [0.3, 0.27, 0.36, 1.15],
    shadow: [0.38, 0.36, 0.52, 0.6],
  }),
});

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** three's NeutralToneMapping (Khronos PBR Neutral) at exposure 1, on a linear colour. */
export function neutralToneMap([r, g, b]) {
  const start = 0.8 - 0.04;
  const x = Math.min(r, g, b);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let c = [r - offset, g - offset, b - offset];
  const peak = Math.max(...c);
  if (peak < start) return c;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  c = c.map((v) => (v * newPeak) / peak);
  const fade = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return c.map((v) => v + (newPeak - v) * fade);
}

/** The linear colour that Neutral tone mapping shows as `target` (linear), to within ~1e-4; capped at 4. */
export function neutralInverse(target) {
  let c = [...target];
  for (let i = 0; i < 60; i += 1) {
    const shown = neutralToneMap(c);
    c = c.map((v, k) => Math.min(4, Math.max(0, v + (target[k] - shown[k]))));
  }
  return c;
}

/**
 * A colour authored as it shows on screen ('#rrggbb') as a GLSL vec3 for an unlit surface (water,
 * a painted floor, a glow): sRGB and Neutral tone mapping inverted, nothing divided out.
 */
export function glslColour(hex) {
  const [r, g, b] = paint(hex, 2);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
}

/** How much brighter than its albedo a part facing the sun shows (key + sky): paint divides it out. */
const KEY_GAIN = 1.12;

/**
 * A colour authored as it shows on screen ('#rrggbb', lit straight on, before the toon light's
 * shade) as the linear albedo the kit's shaders take; `w` rides along as aColor.w (0 matte, 0..1
 * metal, 2 and up a light at w - 1: a light is painted at its own colour, not divided by the key).
 */
export function paint(hex, w = 0) {
  const value = /^#?([0-9a-f]{6})$/i.exec(String(hex))?.[1];
  if (!value) throw new Error(`paint: not a #rrggbb colour: ${hex}`);
  const srgb = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255);
  const linear = neutralInverse(srgb.map(srgbToLinear));
  return [...(w >= 2 ? linear : linear.map((v) => v / KEY_GAIN)), w];
}

/** The kit light's uniforms (kitUniforms), for a board's own mesh lit by KIT_LIGHT. */
export const KIT_UNIFORMS = /* glsl */ `
uniform vec3 uKitKey;
uniform vec3 uKitShade;
uniform vec3 uKitSky;
uniform vec4 uKitRim;
uniform vec4 uKitOutline;
uniform vec4 uKitShadow;
uniform float uKitGround;
uniform float uFocal;
`;

const KIT_POSITION = /* glsl */ `
attribute vec4 aColor;
attribute vec4 aLook;
attribute vec3 aFoot;
// The baked ground's height under a foot, on a board whose kit stands on its ground (uKitGround).
float kitGround(vec3 foot) {
  if (uKitGround < 0.5 || foot.z < 0.5) return 0.0;
  return groundAt(clamp((foot.xy - uMin) / uSize, 0.0, 1.0));
}
// The vertex as the board draws it: stood on the ground under its foot, risen behind the reveal, and
// swaying (aLook.y px) when its part sways, the more the higher it stands, so a blade's or a frond's
// foot stays put.
vec3 kitPosition(vec3 p, vec4 look) {
  vec3 q = vec3(p.xy, (p.z + kitGround(aFoot)) * terrainGrowth(p.xy));
  if (look.y > 0.0) {
    float phase = dot(p.xy, vec2(0.043, 0.029));
    vec2 sway = vec2(sin(uTime * 1.6 + phase), sin(uTime * 1.25 + phase * 1.6 + 1.7));
    q.xy += sway * look.y * clamp(p.z / 16.0, 0.0, 1.0);
  }
  return q;
}
`;

export const KIT_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${KIT_UNIFORMS}
${KIT_POSITION}
varying vec4 vColor;
varying vec4 vLook;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vRise;
void main() {
  vec3 p = kitPosition(position, aLook);
  vColor = aColor;
  vLook = aLook;
  vNormal = normal;
  vWorld = p;
  // Height over the ground the part stands on (its foot's, before the ground's own rise).
  vRise = position.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

/**
 * The kit's light (LOOK kinds: 0 plain, 1 foliage, 2 gloss, 3 crystal, 4 cloud, 5 chrome, 6 matte). `metal`
 * (aColor.w, 0..1) adds the glint to a plain part; on a chrome part it is how much of the toon
 * mirror shows (the floor's dark under a sharp bright horizon, the room's pale above, a white
 * highlight overhead), so a part of a chrome prop with no metal shows no mirror. A matte part takes
 * no rim or glint.
 */
export const KIT_LIGHT = /* glsl */ `
vec3 kitLight(vec3 albedo, vec3 n, vec3 world, vec4 look, float metal) {
  vec3 sun = normalize(uSun);
  vec3 view = normalize(uEye - world);
  float kind = look.x;
  bool kitCloud = kind > 3.5 && kind < 4.5;
  bool kitChrome = kind > 4.5 && kind < 5.5;
  bool kitMatte = kind > 5.5;
  bool soft = (kind > 0.5 && kind < 1.5) || kitCloud;
  float width = soft ? 0.3 : 0.07;
  float ndl = dot(n, sun);
  float lit = smoothstep(-width, width, ndl - 0.04);
  vec3 shade = albedo * uKitShade;
  float grey = dot(shade, vec3(0.299, 0.587, 0.114));
  shade = max(mix(vec3(grey), shade, 1.25), 0.0);
  if (kitCloud) shade = mix(shade, albedo, 0.35);
  // Light passes into a crystal: its shaded faces stay bright with its own colour.
  if (kind > 2.5 && kind < 3.5) shade = mix(shade, albedo * 0.95, 0.45);
  vec3 col = mix(shade, albedo * uKitKey, lit);
  col += albedo * uKitSky * (0.06 + 0.06 * n.z);
  if (!kitMatte) {
    float edge = 1.0 - max(dot(n, view), 0.0);
    col += uKitRim.rgb * uKitRim.w * smoothstep(0.55, 0.9, edge) * mix(0.25, 1.0, lit);
    float glint = smoothstep(0.88, 0.93, dot(reflect(-sun, n), view));
    float shine = kind > 1.5 && kind < 3.5 ? 0.55 : metal * 0.6;
    col += uKitKey * glint * shine;
  }
  if (kitChrome) {
    vec3 r = reflect(-view, n);
    vec3 mirror = mix(uKitShade * 0.3, uKitSky * 0.95, smoothstep(-0.14, -0.03, r.z));
    mirror = mix(mirror, vec3(1.3), smoothstep(-0.03, -0.01, r.z) * (1.0 - smoothstep(0.05, 0.09, r.z)));
    mirror = mix(mirror, vec3(1.35), smoothstep(0.86, 0.9, r.z));
    col = mix(col, mirror * mix(vec3(1.0), albedo * 1.4, 0.5), clamp(metal, 0.0, 1.0) * 0.85);
  }
  return col * look.z;
}
`;

/**
 * The solid's fragment shader; `reveal` colours the reveal's front (a GLSL vec3). `glow` is GLSL
 * (uniforms and functions) defining `vec3 kitGlow(vec3 albedo, vec3 n, vec3 world)`: a board's own
 * local light (lanterns, a glowing pool) added over the kit's light on every lit part.
 */
export const kitFragment = (reveal = 'vec3(1.0, 0.95, 0.8)', glow = '') => /* glsl */ `
${TERRAIN_UNIFORMS}
${KIT_UNIFORMS}
${NOISE}
${REVEAL}
varying vec4 vColor;
varying vec4 vLook;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vRise;
${KIT_LIGHT}
${glow}
void main() {
  if (revealBurned(vWorld.xy) * exitKeep(vWorld.xy) < 0.5) discard;
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  // A lit part darkens a little at its foot, where it meets the ground (its contact shadow does the rest).
  vec3 col = vColor.w >= 1.5
    ? vColor.rgb * (vColor.w - 1.0)
    : kitLight(vColor.rgb, n, vWorld, vLook, vColor.w) * mix(0.8, 1.0, smoothstep(0.0, 10.0, vRise));
  ${glow ? 'if (vColor.w < 1.5) col += kitGlow(vColor.rgb, n, vWorld);' : ''}
  col += (${reveal}) * revealGlow(vWorld.xy, 0.035);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** The outline: the hull's back faces, pushed out uKitOutline.w plate px along aHull; parts without an outline fold away. */
export const KIT_OUTLINE_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${KIT_UNIFORMS}
${KIT_POSITION}
attribute vec3 aHull;
varying vec4 vColor;
varying vec3 vWorld;
void main() {
  vColor = aColor;
  vWorld = position;
  if (aLook.w <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec3 p = kitPosition(position, aLook);
  vWorld = p;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xyz += normalize(normalMatrix * aHull) * uKitOutline.w * aLook.w * -mv.z / max(uFocal, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const KIT_OUTLINE_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${KIT_UNIFORMS}
${NOISE}
${REVEAL}
varying vec4 vColor;
varying vec3 vWorld;
void main() {
  if (revealBurned(vWorld.xy) * exitKeep(vWorld.xy) < 0.5) discard;
  vec3 base = vColor.w >= 1.5 ? vColor.rgb * clamp(vColor.w - 1.0, 0.0, 1.0) : vColor.rgb;
  gl_FragColor = vec4(base * uKitOutline.rgb, 1.0);
${OUTPUT}
}
`;

export const KIT_SHADOW_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
uniform float uKitGround;
attribute vec4 aShadow;
varying vec3 vShadow;
varying vec2 vPos;
void main() {
  float growth = terrainGrowth(position.xy);
  float ground = uKitGround > 0.5 && aShadow.w > 0.5 ? groundAt(clamp((position.xy - uMin) / uSize, 0.0, 1.0)) : 0.0;
  vShadow = vec3(aShadow.xy, aShadow.z * growth);
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, (position.z + ground) * growth, 1.0);
}
`;

/** A contact shadow: dense under its middle, soft to its rim, multiplied into what is drawn under it. */
export const KIT_SHADOW_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${KIT_UNIFORMS}
${NOISE}
${REVEAL}
varying vec3 vShadow;
varying vec2 vPos;
void main() {
  float d = length(vShadow.xy);
  if (d >= 1.0) discard;
  float body = pow(1.0 - d * d, 1.6);
  float a = body * vShadow.z * uKitShadow.w * revealBurned(vPos) * exitKeep(vPos);
  gl_FragColor = vec4(mix(vec3(1.0), uKitShadow.rgb, a), 1.0);
}
`;

const vector = (three, values, size) =>
  size === 4 ? new three.Vector4(...values.slice(0, 4)) : new three.Vector3(...values.slice(0, 3));

/**
 * The kit's uniforms for a mood (MOODS key or object; missing colours come from the day); `ground`
 * stands every asset on the board's baked ground (uField's red: height px) under its foot.
 */
export function kitUniforms(three, mood = 'day', { ground = false } = {}) {
  const chosen = { ...MOODS.day, ...(typeof mood === 'string' ? MOODS[mood] : mood) };
  return {
    uKitGround: { value: ground ? 1 : 0 },
    uKitKey: { value: vector(three, chosen.key, 3) },
    uKitShade: { value: vector(three, chosen.shade, 3) },
    uKitSky: { value: vector(three, chosen.sky, 3) },
    uKitRim: { value: vector(three, chosen.rim, 4) },
    uKitOutline: { value: vector(three, chosen.outline, 4) },
    uKitShadow: { value: vector(three, chosen.shadow, 4) },
  };
}

/**
 * A board's kit meshes. `material` is the board kit's (createStadiumEnvironment), `own` the board's
 * own uniforms (its sun among them), shared with the kit's materials. `ground` stands each asset on
 * the board's baked ground (kitUniforms); `glow` adds the board's own local light (kitFragment).
 * `set(builder | null)` swaps in a builder's geometry (props and outline share it) and its contact
 * shadows.
 * @param {{ three: typeof import('three'), material: Function, own?: object, mood?: string|object,
 *   reveal?: string, ground?: boolean, glow?: string }} deps
 */
export function createKitProps({ three, material, own = {}, mood = 'day', reveal, ground = false, glow = '' }) {
  const uniforms = { ...own, ...kitUniforms(three, mood, { ground }) };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, uniforms);
  const solid = make(KIT_VERTEX, kitFragment(reveal, glow), { side: three.DoubleSide });
  const hull = make(KIT_OUTLINE_VERTEX, KIT_OUTLINE_FRAGMENT, { side: three.BackSide });
  const shade = make(KIT_SHADOW_VERTEX, KIT_SHADOW_FRAGMENT, {
    depthTest: false,
    depthWrite: false,
    blending: three.CustomBlending,
    blendEquation: three.AddEquation,
    blendSrc: three.DstColorFactor,
    blendDst: three.ZeroFactor,
    blendSrcAlpha: three.ZeroFactor,
    blendDstAlpha: three.OneFactor,
  });
  const props = new three.Mesh(new three.BufferGeometry(), solid);
  const outline = new three.Mesh(props.geometry, hull);
  const shadows = new three.Mesh(new three.BufferGeometry(), shade);
  props.name = 'stadium-kit-props';
  outline.name = 'stadium-kit-outline';
  shadows.name = 'stadium-kit-shadows';
  // The shadows go down on the ground before any prop stands on it (they test no depth). None of
  // the three is transparent, so all draw before a board's transparent layers, whatever their order.
  shadows.renderOrder = 1;
  props.renderOrder = 2;
  outline.renderOrder = 2;
  return {
    objects: [shadows, props, outline],
    materials: [solid, hull, shade],
    uniforms,
    set(builder) {
      props.geometry.dispose();
      shadows.geometry.dispose();
      const geometry = builder ? builder.build(three) : new three.BufferGeometry();
      props.geometry = geometry;
      outline.geometry = geometry;
      shadows.geometry = builder ? builder.buildShadows(three) : new three.BufferGeometry();
      props.visible = Boolean(builder?.vertexCount());
      outline.visible = props.visible;
      shadows.visible = Boolean(builder?.shadowCount());
    },
  };
}
