// Design 075 § GPU canvas material: the GLSL ES 3.00 the recorder's draws run through. The vertex
// shader lifts stage px into the board's world; the fragment shader reads the vertex's paint row
// (gpu-canvas.mjs layout), evaluates the paint as Canvas2D would, applies the coverage (feather,
// stroke edge, dash) and the style, and writes premultiplied colour. The output may exceed 1.0:
// the FX target is HalfFloat, and only what passes 1.0 feeds the bloom.
import { MAX_IMAGES } from './gpu-canvas.mjs';

export const GPU_CANVAS_VERTEX = `
precision highp float;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 uStageToWorld;
in vec3 position;
in vec4 fxEdge;
in vec2 fxPaint;
out vec2 vStage;
out vec4 vEdge;
out float vAlong;
flat out int vPaint;
void main() {
  vStage = position.xy;
  vEdge = fxEdge;
  vAlong = fxPaint.x;
  vPaint = int(fxPaint.y + 0.5);
  gl_Position = projectionMatrix * viewMatrix * uStageToWorld * vec4(position, 1.0);
}
`;

const imageSamplers = Array.from({ length: MAX_IMAGES }, (_, i) => `uniform sampler2D uImage${i};`).join('\n');
// An sRGB texture decodes to linear on sample; the FX target holds sRGB-space values (Canvas2D's).
const imageBranches = Array.from(
  { length: MAX_IMAGES },
  (_, i) => `  if (slot == ${i}) {
    vec4 c = texture(uImage${i}, vec2(uv.x, uImageFlip[${i}] > 0.5 ? 1.0 - uv.y : uv.y));
    return uImageSrgb[${i}] > 0.5 ? vec4(linearToSrgb(c.rgb), c.a) : c;
  }`
).join('\n');

export const GPU_CANVAS_FRAGMENT = `
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uPaints;
uniform sampler2D uPattern;
${imageSamplers}
uniform float uImageFlip[${MAX_IMAGES}];
uniform float uImageSrgb[${MAX_IMAGES}];
uniform float uTime;
in vec2 vStage;
in vec4 vEdge;
in float vAlong;
flat in int vPaint;
out vec4 outColor;

vec4 texel(int i) { return texelFetch(uPaints, ivec2(i, vPaint), 0); }

// ---- noise for the styles -------------------------------------------------------------
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}
float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * noise3(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.875;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

// ---- paints ---------------------------------------------------------------------------
vec4 ramp(float t, int count) {
  vec4 o0 = texel(7);
  vec4 o1 = texel(8);
  float offsets[8] = float[8](o0.x, o0.y, o0.z, o0.w, o1.x, o1.y, o1.z, o1.w);
  vec4 previous = texel(9);
  if (count <= 1 || t <= offsets[0]) return previous;
  for (int i = 1; i < 8; i++) {
    if (i >= count) break;
    vec4 colour = texel(9 + i);
    if (t <= offsets[i]) {
      float span = offsets[i] - offsets[i - 1];
      return mix(previous, colour, span > 0.0 ? (t - offsets[i - 1]) / span : 1.0);
    }
    previous = colour;
  }
  return previous;
}

vec4 sampleImage(int slot, vec2 uv) {
${imageBranches}
  return vec4(0.0);
}

// Canvas2D's two-circle radial gradient: the largest t whose circle passes through p with r(t) >= 0.
bool radialT(vec2 p, vec3 c0, vec3 c1, out float t) {
  vec2 cd = c1.xy - c0.xy;
  vec2 pd = p - c0.xy;
  float dr = c1.z - c0.z;
  float a = dot(cd, cd) - dr * dr;
  float b = dot(pd, cd) + c0.z * dr;
  float c = dot(pd, pd) - c0.z * c0.z;
  if (abs(a) < 1e-6) {
    if (abs(b) < 1e-6) return false;
    t = c / (2.0 * b);
    return c0.z + t * dr >= 0.0;
  }
  float disc = b * b - a * c;
  if (disc < 0.0) return false;
  float root = sqrt(disc);
  t = (b + root) / a;
  if (c0.z + t * dr >= 0.0) return true;
  t = (b - root) / a;
  return c0.z + t * dr >= 0.0;
}

void main() {
  vec4 head = texel(0);
  int kind = int(head.x + 0.5);
  int count = int(head.y + 0.5);
  int style = int(head.z + 0.5);
  float seed = head.w;
  vec4 geomA = texel(1);
  vec4 geomB = texel(2);
  vec4 inv0 = texel(3);
  vec4 inv1 = texel(4);
  vec4 params = texel(5);
  vec4 dash = texel(6);
  vec2 q = vec2(dot(inv0.xyz, vec3(vStage, 1.0)), dot(inv1.xyz, vec3(vStage, 1.0)));

  vec4 paint = vec4(0.0);
  float t = 0.0;
  if (kind == 0) {
    paint = texel(9);
  } else if (kind == 1) {
    vec2 d = geomA.zw - geomA.xy;
    float len2 = dot(d, d);
    if (len2 <= 0.0) discard;
    t = clamp(dot(q - geomA.xy, d) / len2, 0.0, 1.0);
    paint = ramp(t, count);
  } else if (kind == 2) {
    if (!radialT(q, geomA.xyz, geomB.xyz, t)) discard;
    t = clamp(t, 0.0, 1.0);
    paint = ramp(t, count);
  } else if (kind == 3) {
    vec4 tile = texture(uPattern, q / max(geomA.x, 1.0));
    paint = vec4(tile.rgb, tile.a * texel(9).a);
  } else {
    vec2 uv = clamp((q - geomA.xy) / geomA.zw, 0.0, 1.0);
    vec4 art = sampleImage(int(geomB.x + 0.5), uv);
    paint = vec4(art.rgb, art.a * texel(9).a);
  }

  float coverage = vEdge.z < 0.0
    ? smoothstep(0.0, 1.0, vEdge.x)
    : clamp((vEdge.z + vEdge.w - abs(vEdge.y)) / max(vEdge.w, 1e-3), 0.0, 1.0);
  if (dash.w > 0.5) {
    float period = max(dash.x + dash.y, 1e-3);
    float m = mod(vAlong + dash.z, period);
    coverage *= m < dash.x ? clamp(min(m, dash.x - m) + 0.5, 0.0, 1.0) : 0.0;
  }

  vec3 rgb = paint.rgb;
  float alpha = paint.a * coverage;
  vec2 uv = vStage / max(params.w, 1.0);
  if (style == 1) {
    float n = fbm(vec3(uv.x * 6.0, uv.y * 6.0 - uTime * params.y, seed));
    alpha *= smoothstep(params.x - 0.2, params.x + 0.2, paint.a + 0.5 * (n - 0.5));
    rgb *= 1.0 + params.z * smoothstep(0.75, 1.0, luma(paint.rgb));
  } else if (style == 2) {
    if (kind == 2) {
      float boil = fbm(vec3(uv * 5.0 + vec2(uTime * 0.7, 0.0), seed));
      rgb *= (1.0 - params.y * t * t) + params.x * (boil - 0.5);
      if (t < 0.3) rgb *= 1.0 + params.z * (1.0 - t / 0.3);
    }
  } else if (style == 3) {
    if (vEdge.z < 0.0 && vEdge.x < 0.5) rgb += params.x * (1.0 - vEdge.x * 2.0);
  } else if (style == 4) {
    rgb *= 1.0 + params.x * sin(vAlong * 0.2 - uTime * params.y * 6.0);
    rgb *= 1.0 + params.z * smoothstep(0.8, 1.0, luma(paint.rgb));
  } else if (style == 5) {
    float angle = atan(q.y - geomA.y, q.x - geomA.x);
    rgb += params.y * pow(abs(sin(angle * params.x * 0.5 + seed)), 8.0);
  } else if (style == 6) {
    alpha *= clamp(mix(1.0, fbm(vec3(uv * 4.0, uTime * 0.3 + seed)) * 2.0, params.x), 0.0, 1.0);
  } else if (style == 7) {
    rgb *= 1.0 - params.x * fbm(vec3(uv * 3.0, uTime * 0.2 + seed));
  }
  rgb = max(rgb, vec3(0.0));
  outColor = vec4(rgb * alpha, alpha);
}
`;
