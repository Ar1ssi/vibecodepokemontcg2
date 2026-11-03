// Design 082: the Stadium kit's one look, after Brilliant Diamond / Shining Pearl's overworld (design
// 081 built the kit; 082 relit it). Every kit asset (stadium-kit-assets.mjs) is drawn by two meshes
// that share the builder's output (stadium-env-props.mjs createPropBuilder): its contact shadows
// (soft cool ellipses multiplied into the ground, drawn after the ground and before any prop) and the
// solid (KIT_LIGHT: a soft key wrapping round each form with no hard terminator, a sky fill from
// above and the ground's bounce from below, a broad sheen and a tighter gloss on glossy parts; no ink
// outline). Foliage is covered in shingled leaves (KIT_LEAVES), the BDSP leaf clump. A board's mood
// (MOODS) sets the light's colours; its sun is the board's own uSun.
// Colours are authored as they show on screen: paint('#hex') inverts sRGB and Neutral tone mapping.
// Pure: three comes in through createKitProps' arguments.
import { NOISE, OUTPUT, REVEAL, TERRAIN_GROUND, TERRAIN_UNIFORMS } from './stadium-environment-glsl.mjs';
import { GLOW } from './stadium-env-ground.mjs';

/**
 * The light's colours per mood: the key (the sun's colour and strength), the fill from the sky
 * above and the bounce from the ground below, sheen [broad, gloss] strengths, and the contact
 * shadow's colour with its strength in w.
 */
export const MOODS = Object.freeze({
  day: Object.freeze({
    key: [1.0, 0.96, 0.88],
    sky: [0.34, 0.38, 0.46],
    bounce: [0.2, 0.22, 0.16],
    sheen: [0.35, 0.6],
    shadow: [0.42, 0.47, 0.62, 0.62],
  }),
  dusk: Object.freeze({
    key: [1.0, 0.8, 0.6],
    sky: [0.34, 0.3, 0.48],
    bounce: [0.22, 0.16, 0.14],
    sheen: [0.35, 0.6],
    shadow: [0.4, 0.36, 0.56, 0.62],
  }),
  night: Object.freeze({
    key: [0.5, 0.58, 0.92],
    sky: [0.2, 0.24, 0.42],
    bounce: [0.08, 0.08, 0.14],
    sheen: [0.3, 0.55],
    shadow: [0.32, 0.34, 0.52, 0.62],
  }),
  indoor: Object.freeze({
    key: [1.0, 0.98, 0.94],
    sky: [0.42, 0.42, 0.46],
    bounce: [0.3, 0.29, 0.28],
    sheen: [0.4, 0.7],
    shadow: [0.5, 0.52, 0.62, 0.5],
  }),
  cave: Object.freeze({
    key: [0.95, 0.86, 0.8],
    sky: [0.26, 0.24, 0.38],
    bounce: [0.16, 0.13, 0.12],
    sheen: [0.35, 0.6],
    shadow: [0.34, 0.32, 0.48, 0.62],
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

/**
 * How much brighter than its albedo an up-facing part in full sun shows under the day mood (the
 * wrapped key at the default sun's height, plus the sky's fill): paint divides it out.
 */
export const KEY_GAIN = 1.25;

/**
 * A colour authored as it shows on screen ('#rrggbb', an up-facing part in full sun) as the linear
 * albedo the kit's shaders take; `w` rides along as aColor.w (0 matte, 0..1 metal, 2 and up a light
 * at w - 1: a light is painted at its own colour, not divided by the key).
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
uniform vec3 uKitSky;
uniform vec3 uKitBounce;
uniform vec2 uKitSheen;
uniform vec4 uKitShadow;
uniform float uKitGround;
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
// foot stays put. Design 083: the phase follows the asset's foot, so a crown sways as one piece and
// its neighbours out of step with it; a little of it follows the vertex, so its parts stay alive.
vec3 kitPosition(vec3 p, vec4 look) {
  vec3 q = vec3(p.xy, (p.z + kitGround(aFoot)) * terrainGrowth(p.xy));
  if (look.y > 0.0) {
    float phase = dot(aFoot.xy, vec2(0.043, 0.029)) + dot(p.xy, vec2(0.006, 0.004));
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
varying vec2 vFoot;
void main() {
  vec3 p = kitPosition(position, aLook);
  vColor = aColor;
  vLook = aLook;
  vNormal = normal;
  vWorld = p;
  // Height over the ground the part stands on (its foot's, before the ground's own rise).
  vRise = position.z;
  vFoot = aFoot.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

/**
 * The kit's light (LOOK kinds: 0 plain, 1 foliage, 2 gloss, 3 crystal, 4 cloud, 5 chrome, 6 matte; 7 blink, a glowing part only):
 * a soft key wrapping round the form, the sky's fill from above and the ground's bounce from below,
 * a broad sheen (`metal`, aColor.w 0..1, strengthens it) and on gloss and crystal a tighter gloss.
 * Foliage lit by the sun goes warmer and yellower; a crystal and a cloud fill with their own light;
 * on chrome `metal` is how much of the mirror shows (the floor's dark under a bright horizon, the
 * sky above, a white highlight overhead). A matte part takes no sheen.
 */
export const KIT_LIGHT = /* glsl */ `
vec3 kitLight(vec3 albedo, vec3 n, vec3 world, vec4 look, float metal) {
  vec3 sun = normalize(uSun);
  vec3 view = normalize(uEye - world);
  float kind = look.x;
  bool leafy = kind > 0.5 && kind < 1.5;
  bool glossy = kind > 1.5 && kind < 2.5;
  bool crystal = kind > 2.5 && kind < 3.5;
  bool cloud = kind > 3.5 && kind < 4.5;
  bool chrome = kind > 4.5 && kind < 5.5;
  bool matte = kind > 5.5;
  float wrap = cloud ? 0.6 : 0.35;
  float key = clamp((dot(n, sun) + wrap) / (1.0 + wrap), 0.0, 1.0);
  key = key * key * (3.0 - 2.0 * key);
  vec3 fill = mix(uKitBounce, uKitSky, 0.5 + 0.5 * n.z);
  if (crystal) fill = mix(fill, albedo * 1.4 + 0.2, 0.45);
  if (cloud) fill = mix(fill, vec3(0.9), 0.35);
  vec3 col = albedo * (uKitKey * key + fill);
  // Sun through the leaves: the lit tops of foliage go warmer and yellower.
  if (leafy) col *= mix(vec3(1.0), vec3(1.14, 1.12, 0.78), key * key);
  if (!matte) {
    vec3 h = normalize(sun + view);
    float nh = max(dot(n, h), 0.0);
    float sheen = pow(nh, 14.0) * uKitSheen.x * (0.4 + metal);
    float gloss = glossy || crystal ? smoothstep(0.93, 0.975, nh) * uKitSheen.y : 0.0;
    col += uKitKey * (sheen + gloss) * key;
  }
  if (chrome) {
    vec3 r = reflect(-view, n);
    vec3 mirror = mix(uKitBounce * 0.6, uKitSky * 1.6, smoothstep(-0.14, -0.03, r.z));
    mirror = mix(mirror, vec3(1.3), smoothstep(-0.03, -0.01, r.z) * (1.0 - smoothstep(0.05, 0.09, r.z)));
    mirror = mix(mirror, vec3(1.35), smoothstep(0.86, 0.9, r.z));
    col = mix(col, mirror * mix(vec3(1.0), albedo * 1.4, 0.5), clamp(metal, 0.0, 1.0) * 0.85);
  }
  return col * look.z;
}
`;

/**
 * BDSP's leaf clump: leaves about `size` px long shingled over a foliage part, splatted from the 3D
 * cells round p. Each is an egg pointing down the part's slope (on a flat top, out from the asset's
 * foot: `outward`), and of the leaves over p the one whose middle lies furthest uphill is on top, as
 * a leaf hangs over the one below it. x: how far along that leaf p lies, 0 at its foot (under the
 * leaf above) to 1 at its tip, or -1 in a gap between leaves; y: the leaf's own tone 0..1.
 */
export const KIT_LEAVES = /* glsl */ `
vec3 kitHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
vec2 kitLeaves(vec3 p, vec3 n, vec2 outward, float size) {
  vec3 down = vec3(0.0, 0.0, -1.0) + n * n.z;
  float steep = length(down);
  vec3 out3 = vec3(outward, 0.0) - n * dot(vec3(outward, 0.0), n);
  vec3 way = normalize(mix(out3 + 1e-4, down / max(steep, 1e-4), smoothstep(0.25, 0.65, steep)));
  vec3 side = cross(n, way);
  vec3 q = p / size;
  vec3 cell = floor(q);
  float best = -1e9;
  vec2 leaf = vec2(-1.0, 0.0);
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = cell + vec3(float(x), float(y), float(z));
        vec3 h = kitHash33(g);
        vec3 o = q - (g + 0.15 + 0.7 * h);
        // Only leaves lying on this surface: one layer, not every cell the surface passes near.
        if (abs(dot(o, n)) > 0.55) continue;
        float u = dot(o, way);
        float v = dot(o, side);
        float e = length(vec2(u / (u > 0.0 ? 1.0 : 0.6), v / (0.68 - 0.3 * max(u, 0.0))));
        float priority = -dot(g + h, way);
        if (e < 1.0 && priority > best) {
          best = priority;
          leaf = vec2(clamp(0.5 + 0.5 * u, 0.0, 1.0), fract(h.x * 7.13 + h.y));
        }
      }
    }
  }
  return leaf;
}
`;

/**
 * The solid's fragment shader; `reveal` colours the reveal's front (a GLSL vec3). `glow` is GLSL
 * (uniforms and functions) defining `vec3 kitGlow(vec3 albedo, vec3 n, vec3 world)`: a board's own
 * local light (lanterns, a glowing pool) added over the kit's light on every lit part. A foliage part
 * with a leaf size (aLook.w px) is covered in leaves, faded to their mean where they fall under ~3 px
 * on screen so they never shimmer. Design 084: every lit part also takes the board's contact glows
 * (GLOW, the shared uGlows), most on its upper faces, so a prop beside a lamp or a crystal is lit by it.
 */
export const kitFragment = (reveal = 'vec3(1.0, 0.95, 0.8)', glow = '') => /* glsl */ `
${TERRAIN_UNIFORMS}
${KIT_UNIFORMS}
${NOISE}
${REVEAL}
${GLOW}
varying vec4 vColor;
varying vec4 vLook;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vRise;
varying vec2 vFoot;
${KIT_LIGHT}
${KIT_LEAVES}
${glow}
void main() {
  // Derivatives first: after the discard below, control flow is no longer uniform.
  float footprint = length(fwidth(vWorld));
  if (revealBurned(vWorld.xy) * exitKeep(vWorld.xy) < 0.5) discard;
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  vec3 albedo = vColor.rgb;
  if (vLook.x > 0.5 && vLook.x < 1.5 && vLook.w > 0.0) {
    vec2 leaf = kitLeaves(vWorld, n, normalize(vWorld.xy - vFoot + 1e-3), vLook.w);
    float shade = leaf.x < 0.0 ? 0.4 : mix(0.5, 1.1, smoothstep(0.12, 0.8, leaf.x)) * (0.9 + 0.2 * leaf.y);
    albedo *= mix(shade, 0.86, smoothstep(0.25, 0.5, footprint / vLook.w));
  }
  // A lit part darkens a little at its foot, where it meets the ground (its contact shadow does the rest).
  vec3 col = vColor.w >= 1.5
    ? vColor.rgb * (vColor.w - 1.0)
    : kitLight(albedo, n, vWorld, vLook, vColor.w) * mix(0.75, 1.0, smoothstep(0.0, 12.0, vRise));
  // Design 083: a blinking light (LOOK.blink: aLook.z its phase, aLook.w its rate per second).
  if (vColor.w >= 1.5 && vLook.x > 6.5 && vLook.x < 7.5) {
    col *= mix(0.18, 1.0, smoothstep(-0.2, 0.2, sin(6.2831853 * (uTime * vLook.w + vLook.z))));
  }
  ${glow ? 'if (vColor.w < 1.5) col += kitGlow(vColor.rgb, n, vWorld);' : ''}
  if (vColor.w < 1.5 && uGlowCount > 0) col += albedo * glowLight(vWorld.xy) * (0.55 + 0.45 * max(n.z, 0.0));
  col += (${reveal}) * revealGlow(vWorld.xy, 0.035);
  gl_FragColor = vec4(col, 1.0);
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

/** A contact shadow: dense under its middle, fading softly all the way to its rim, multiplied into what is drawn under it. */
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
  float body = pow(1.0 - d * d, 2.2);
  float a = body * vShadow.z * uKitShadow.w * revealBurned(vPos) * exitKeep(vPos);
  gl_FragColor = vec4(mix(vec3(1.0), uKitShadow.rgb, a), 1.0);
}
`;

const vector = (three, values, size) => {
  if (size === 4) return new three.Vector4(...values.slice(0, 4));
  if (size === 2) return new three.Vector2(...values.slice(0, 2));
  return new three.Vector3(...values.slice(0, 3));
};

/**
 * The kit's uniforms for a mood (MOODS key or object; missing colours come from the day); `ground`
 * stands every asset on the board's baked ground (uField's red: height px) under its foot.
 */
export function kitUniforms(three, mood = 'day', { ground = false } = {}) {
  const chosen = { ...MOODS.day, ...(typeof mood === 'string' ? MOODS[mood] : mood) };
  return {
    uKitGround: { value: ground ? 1 : 0 },
    uKitKey: { value: vector(three, chosen.key, 3) },
    uKitSky: { value: vector(three, chosen.sky, 3) },
    uKitBounce: { value: vector(three, chosen.bounce, 3) },
    uKitSheen: { value: vector(three, chosen.sheen, 2) },
    uKitShadow: { value: vector(three, chosen.shadow, 4) },
  };
}

/**
 * A board's kit meshes. `material` is the board kit's (createStadiumEnvironment), `own` the board's
 * own uniforms (its sun among them), shared with the kit's materials. `ground` stands each asset on
 * the board's baked ground (kitUniforms); `glow` adds the board's own local light (kitFragment).
 * `set(builder | null)` swaps in a builder's geometry and its contact shadows.
 * @param {{ three: typeof import('three'), material: Function, own?: object, mood?: string|object,
 *   reveal?: string, ground?: boolean, glow?: string }} deps
 */
export function createKitProps({ three, material, own = {}, mood = 'day', reveal, ground = false, glow = '' }) {
  const uniforms = { ...own, ...kitUniforms(three, mood, { ground }) };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, uniforms);
  const solid = make(KIT_VERTEX, kitFragment(reveal, glow), { side: three.DoubleSide });
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
  const shadows = new three.Mesh(new three.BufferGeometry(), shade);
  props.name = 'stadium-kit-props';
  shadows.name = 'stadium-kit-shadows';
  // The shadows go down on the ground before any prop stands on it (they test no depth). Neither is
  // transparent, so both draw before a board's transparent layers, whatever their order.
  shadows.renderOrder = 1;
  props.renderOrder = 2;
  return {
    objects: [shadows, props],
    materials: [solid, shade],
    uniforms,
    set(builder) {
      props.geometry.dispose();
      shadows.geometry.dispose();
      props.geometry = builder ? builder.build(three) : new three.BufferGeometry();
      shadows.geometry = builder ? builder.buildShadows(three) : new three.BufferGeometry();
      props.visible = Boolean(builder?.vertexCount());
      shadows.visible = Boolean(builder?.shadowCount());
    },
  };
}
