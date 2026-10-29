// Design 079: GLSL every element kind shares — value noise, fbm, the blend states, and the
// billboard maths that faces a stage-space point's quad to the board camera. Strings only, so
// kinds compose them and node tests can import the module.

/** Hash, 3-D value noise and 3-octave fbm (the gpu-canvas styles' lattice, so looks match). */
export const NOISE_GLSL = `
float elHash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float elNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(elHash3(i), elHash3(i + vec3(1, 0, 0)), f.x), mix(elHash3(i + vec3(0, 1, 0)), elHash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(elHash3(i + vec3(0, 0, 1)), elHash3(i + vec3(1, 0, 1)), f.x), mix(elHash3(i + vec3(0, 1, 1)), elHash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}
float elFbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * elNoise3(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.9375;
}
`;

/**
 * Vertex-side billboard: a stage point (px, y down, z up) to clip space with a camera-facing
 * corner offset in px (`corner`, already rotated). uStageToWorld is a pure rotation, so px stay px.
 * `lean` px pulls the quad toward the camera: a flat quad standing in a tilted scene would
 * otherwise cut through the cards and the cloth behind it with a hard line (no soft depth here).
 */
export const BILLBOARD_GLSL = `
vec4 elBillboard(vec3 stagePoint, vec2 corner, float lean) {
  vec4 view = viewMatrix * (uStageToWorld * vec4(stagePoint, 1.0));
  view.xy += corner;
  view.xyz += normalize(-view.xyz) * lean;
  return projectionMatrix * view;
}
`;

/**
 * Fragment-side dissolve shared by every kind (design 078's look): noise eats the element from
 * amount 0 (whole) to 1 (gone), the surviving rim burns brighter. Returns alpha scale; `edge` out.
 */
export const DISSOLVE_GLSL = `
float elDissolve(vec2 p, float amount, float seed, out float edge) {
  edge = 0.0;
  if (amount <= 0.0) return 1.0;
  float n = clamp((elFbm(vec3(p * 3.0, seed * 0.37 + 7.0)) - 0.5) * 1.8 + 0.5, 0.0, 1.0);
  float width = 0.12;
  float k = n - mix(-width, 1.0, amount);
  edge = 1.0 - smoothstep(0.0, width, k);
  return smoothstep(-0.015, 0.015, k);
}
`;

/**
 * Fire's colour by temperature t (0 cold … 1 white-hot) in a kit palette: soot below the deep
 * red, then deep → body → hot → core, and past 0.9 a white core boosted by `heat` past 1.0 so it
 * alone blooms. Shared by fireball and flame jet so a jet and its ball burn alike.
 */
export const FIRE_RAMP_GLSL = `
vec3 elFireRamp(float t, vec3 deep, vec3 body, vec3 hot, vec3 core, float heat) {
  vec3 soot = deep * 0.18;
  vec3 c = mix(soot, deep, smoothstep(0.0, 0.22, t));
  c = mix(c, body, smoothstep(0.22, 0.48, t));
  c = mix(c, hot, smoothstep(0.48, 0.7, t));
  c = mix(c, core, smoothstep(0.74, 0.94, t));
  // Only the last few percent pass 1.0: a small white filament blooms, not a white disc.
  return c * (1.0 + 1.4 * heat * smoothstep(0.94, 1.0, t));
}
`;

/**
 * Refraction (design 079 option 4): the board as drawn this frame, `offsetPx` drawing-buffer px
 * from this fragment. Without a copy (`uHasBoard` 0) it returns `fallback`, so a refracting kind
 * degrades to a tint. Needs SHARED_UNIFORMS_GLSL.
 */
export const BOARD_GLSL = `
vec3 elBoardAt(vec2 offsetPx, vec3 fallback) {
  if (uHasBoard < 0.5) return fallback;
  vec2 uv = (gl_FragCoord.xy + offsetPx) / uViewport;
  return texture(uBoard, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
}
`;

/** The shared uniforms' GLSL declarations (element-layer.js owns their values). */
export const SHARED_UNIFORMS_GLSL = `
uniform float uTime;
uniform mat4 uStageToWorld;
uniform sampler2D uBoard;
uniform vec2 uViewport;
uniform float uHasBoard;
`;

/**
 * three blend settings for a kind's material: 'add' adds light and leaves alpha alone (like the
 * gpu-canvas mesh), 'over' covers premultiplied.
 */
export const blendSettings = (three, blend) =>
  blend === 'over'
    ? {
        blending: three.CustomBlending,
        blendEquation: three.AddEquation,
        blendSrc: three.OneFactor,
        blendDst: three.OneMinusSrcAlphaFactor,
        blendSrcAlpha: three.OneFactor,
        blendDstAlpha: three.OneMinusSrcAlphaFactor,
      }
    : {
        blending: three.CustomBlending,
        blendEquation: three.AddEquation,
        blendSrc: three.OneFactor,
        blendDst: three.OneFactor,
        blendSrcAlpha: three.ZeroFactor,
        blendDstAlpha: three.OneFactor,
      };
