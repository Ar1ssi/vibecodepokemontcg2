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
  vec4 dissolve = texel(17);
  vec4 distort = texel(19);
  vec4 detail = texel(20);
  float unit = max(params.w, 1.0);
  // The scene clock in seconds, wrapped so the noise lattice keeps its float precision.
  float clock = mod(uTime, 512.0);
  // distort (VFX Essential's UV distortion): flowing noise moves where the paint is read, never
  // the shape's own outline, so a gradient or card art wavers inside a steady silhouette.
  vec2 stage = vStage;
  if (distort.x > 0.0) {
    vec2 flow = vec2(cos(distort.w), sin(distort.w)) * clock * distort.y;
    vec3 p = vec3(vStage / unit * distort.z - flow, 0.29);
    vec2 warp = vec2(fbm(p), fbm(p + vec3(5.2, 1.3, 0.0))) - 0.5;
    stage += warp * 2.0 * distort.x * unit;
  }
  vec2 q = vec2(dot(inv0.xyz, vec3(stage, 1.0)), dot(inv1.xyz, vec3(stage, 1.0)));

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
  vec2 uv = vStage / unit;
  if (style == 1) {
    // flame: noise flowing base → tip erodes the tongue into licks; cooling edges deepen, the
    // hottest filament gains past 1.0 so it alone blooms.
    float heat;
    if (kind == 1) {
      vec2 axis = geomA.zw - geomA.xy;
      float span = max(length(axis), 1.0);
      vec2 dir = axis / span;
      vec2 local = (q - geomA.xy) / span;
      float along = dot(local, dir);
      float across = dot(local, vec2(-dir.y, dir.x));
      vec3 offset = vec3(dir * 2.9 + geomA.xy / max(params.w, 1.0) * 0.4, 0.0);
      float sway = noise3(vec3(across * 3.0, along * 1.6 - clock * params.y * 1.0, clock * 0.4) + offset * 1.3);
      vec3 p = vec3((across + 0.14 * (sway - 0.5)) * 6.5, along * 3.2 - clock * params.y * 2.4, clock * 0.5);
      float n = fbm(p + offset);
      heat = 2.0 * (n - 0.5) + 1.0 - 0.75 * along * along - 0.7 * abs(across);
      // Roots fade: a fan of tongues meets under its own body, which draws the centre; stacked
      // there they would only add up to a flat white disc.
      alpha *= smoothstep(0.04, 0.38, along);
    } else {
      float n = fbm(vec3(uv.x * 6.0, uv.y * 6.0 - clock * params.y, seed));
      heat = paint.a + 0.5 * (n - 0.5);
    }
    alpha *= smoothstep(params.x - 0.08, params.x + 0.08, heat);
    float glow = smoothstep(params.x, params.x + 0.45, heat);
    // A cooling lick deepens toward its strongest channel (any palette); the heart keeps its colour.
    rgb = pow(max(rgb, vec3(0.0)), vec3(1.0 + 1.4 * (1.0 - glow)));
    rgb *= 1.0 + params.z * glow * glow * smoothstep(0.7, 1.0, luma(paint.rgb));
  } else if (style == 2) {
    // orb: a boiling mantle (turbulence warps where the ramp is read), limb darkening, and a
    // small nucleus that alone passes 1.0. t^0.75 pulls the outer colours inward so the white
    // stays a core instead of filling the disc.
    if (kind == 2) {
      vec2 local = (q - geomB.xy) / max(geomB.z, 1.0);
      vec3 p = vec3(local * 2.6 + geomB.xy / max(params.w, 1.0) * 0.5, clock * 0.9);
      float warp = fbm(p + vec3(5.2, 1.3, 0.0));
      float n = fbm(p * 1.4 + vec3(warp * 1.6, -warp * 1.2, clock * 0.6));
      float mantle = smoothstep(0.04, 0.3, t);
      float boiled = clamp(pow(t, 0.75) + params.x * 2.0 * (n - 0.5) * mantle, 0.0, 1.0);
      vec4 boiledPaint = ramp(boiled, count);
      // Granulation darkens only the orange outer mantle: a darkened white core reads as smoke.
      float cells = mix(1.0, 0.55 + 0.7 * n, smoothstep(0.35, 0.8, boiled));
      rgb = boiledPaint.rgb * (1.0 - params.y * boiled * boiled) * cells;
      alpha = boiledPaint.a * coverage;
      rgb *= 1.0 + params.z * (1.0 - smoothstep(0.0, 0.14, boiled));
    }
  } else if (style == 3) {
    // liquid (water, venom): a sheet (an axis gradient, base → tip) runs with caustic streaks
    // flowing toward its tip, gloss riding their crests; a drop (radial) is clear in the middle
    // by its clarity, glossy at its rim, its specular kept, with a slow caustic shimmer.
    if (kind == 1) {
      vec2 axis = geomA.zw - geomA.xy;
      float span = max(length(axis), 1.0);
      vec2 dir = axis / span;
      vec2 local = (q - geomA.xy) / span;
      float along = dot(local, dir);
      float across = dot(local, vec2(-dir.y, dir.x));
      vec3 offset = vec3(geomA.xy / max(params.w, 1.0) * 0.7, seed * 0.13);
      float n = fbm(vec3(across * 11.0, along * 2.4 - clock * params.y * 2.2, clock * 0.25) + offset);
      float crest = smoothstep(0.56, 0.74, n);
      alpha *= mix(1.0, 0.45 + 0.75 * n, params.z);
      rgb = rgb * (0.82 + 0.3 * n) + params.x * 0.9 * crest;
    } else if (kind == 2) {
      float d = length(q - geomB.xy) / max(geomB.z, 1.0);
      vec2 local = (q - geomB.xy) / max(geomB.z, 1.0);
      float n = fbm(vec3(local * 2.6 + geomB.xy / max(params.w, 1.0) * 0.5, clock * params.y * 0.5 + seed * 0.1));
      float clear = mix(1.0, 0.25 + 0.75 * smoothstep(0.25, 0.92, d), params.z * smoothstep(0.08, 0.3, t));
      float rim = smoothstep(0.76, 0.94, d) * (1.0 - smoothstep(0.94, 1.0, d));
      alpha *= clear;
      rgb = rgb * (0.85 + 0.3 * n) + params.x * rim;
    } else if (vEdge.z < 0.0 && vEdge.x < 0.5) {
      rgb += params.x * (1.0 - vEdge.x * 2.0);
    }
  } else if (style == 4) {
    // energy: current that crawls. A stroke carries bright packets running along it over a
    // stepped flicker, hottest on its centre line; a fill crackles with thin ridged-noise
    // filaments. Only a packet's or filament's hot centre passes 1.0, so stacked passes bloom in
    // threads, never as a slab.
    float hot = smoothstep(0.6, 1.0, luma(paint.rgb));
    if (vEdge.z >= 0.0) {
      float along = vAlong / max(params.w, 1.0);
      float across = clamp(abs(vEdge.y) / max(vEdge.z, 1e-3), 0.0, 1.0);
      float packet = pow(0.5 + 0.5 * sin(along * 9.0 - clock * params.y * 6.0 + seed * 6.28), 6.0);
      float flicker = noise3(vec3(along * 4.0, floor(clock * 22.0) * 0.37, seed));
      rgb *= 1.0 - 0.5 * params.x + params.x * (flicker + 1.5 * packet);
      rgb *= 1.0 + params.z * packet * (1.0 - across * across) * hot;
    } else {
      float n = fbm(vec3(uv * 5.0, clock * params.y * 0.35 + seed));
      float filament = pow(1.0 - abs(2.0 * n - 1.0), 5.0);
      rgb *= 1.0 - 0.4 * params.x + 1.6 * params.x * filament;
      rgb *= 1.0 + params.z * filament * hot;
    }
  } else if (style == 5) {
    // crystal (ice, gem): a crystal (an axis gradient, base → tip) is cut into flat facets
    // across its width, each its own shade, and a glint sweeps base → tip; a radial heart (a
    // flake's centre) twinkles on its points; a stroke (a spoke, an edge, a ring) carries short
    // glints running along it. Glints stay thin so only they reach the bloom.
    if (kind == 1) {
      vec2 axis = geomA.zw - geomA.xy;
      float span = max(length(axis), 1.0);
      vec2 dir = axis / span;
      vec2 local = (q - geomA.xy) / span;
      float along = dot(local, dir);
      float across = dot(local, vec2(-dir.y, dir.x));
      float band = floor(across * params.x * 2.4 + 0.5);
      float shade = 0.7 + 0.55 * hash3(vec3(band, seed, 3.7));
      float sweep = fract(clock * params.z * 0.6 + seed * 0.37);
      float glint = exp(-pow((along - (sweep * 1.6 - 0.3)) * 9.0, 2.0));
      rgb = rgb * shade + params.y * glint * shade;
    } else if (kind == 2) {
      vec2 d = q - geomB.xy;
      float angle = atan(d.y, d.x);
      float star = pow(abs(cos(angle * params.x * 0.5 + seed)), 14.0) * (1.0 - smoothstep(0.0, 0.75, t));
      rgb += params.y * star * (0.65 + 0.35 * sin(clock * params.z * 4.0 + seed * 5.0));
    } else if (vEdge.z >= 0.0) {
      float run = sin(vAlong * 0.09 - clock * params.z * 7.0 + seed * 3.0);
      rgb += params.y * 1.4 * smoothstep(0.82, 1.0, run);
    }
  } else if (style == 6 || style == 7) {
    // Noise in the paint's own frame (a puff's radius, a tongue's length) so it scales with the
    // shape; edge runs 0 at the heart (a radial's centre, a tongue's root) to 1 at its rim / tip.
    vec2 local = uv;
    float edge = 0.5;
    if (kind == 2) {
      local = (q - geomB.xy) / max(geomB.z, 1.0);
      edge = t;
    } else if (kind == 1) {
      vec2 axis = geomA.zw - geomA.xy;
      float span = max(length(axis), 1.0);
      vec2 dir = axis / span;
      vec2 rel = (q - geomA.xy) / span;
      local = vec2(dot(rel, vec2(-dir.y, dir.x)) * 2.0, dot(rel, dir));
      edge = clamp(local.y, 0.0, 1.0);
    }
    vec3 offset = vec3(seed * 1.7, seed * 0.9, 0.0);
    if (style == 6) {
      // smoke (dust, mud, soot, gusts): billows that roll and drift, frayed at the rim, their
      // folds shaded darker so a puff has volume instead of a flat gradient.
      vec3 p = vec3(local * 2.2, clock * 0.25) + offset;
      p.y += clock * params.y * 0.3;
      float warp = fbm(p + vec3(3.1, 7.7, 0.0));
      float n = fbm(p * 1.6 + vec3(warp * 1.4, -warp, clock * 0.15));
      float body = smoothstep(0.25, 0.7, n + 0.4 * (1.0 - edge));
      alpha *= mix(1.0, body, params.x);
      rgb *= mix(1.0, 0.65 + 0.6 * n, params.z);
    } else {
      // shadow (dark, ghost): ink that frays into tendrils curling off its rim / tip while the
      // heart stays solid, rolling darker bands through the body; the paint's own light colour
      // survives only where the ink thins, so a dark move reads as smoke-black, not grey.
      vec3 p = vec3(local * vec2(3.0, 2.2), clock * 0.35) + offset;
      p.y -= clock * params.y * 0.7;
      float warp = fbm(p + vec3(1.7, 4.2, 0.0));
      float n = fbm(p * 1.3 + vec3(warp * 2.0, warp, 0.0));
      float fray = smoothstep(params.z - 0.15, params.z + 0.15, n + 0.55 * (1.0 - edge) - 0.25);
      alpha *= mix(1.0, fray, smoothstep(0.15, 0.6, edge));
      rgb *= 1.0 - params.x * smoothstep(0.35, 0.8, n);
    }
  }
  // volume: the paint lit as a solid so it stops reading as a sticker. A radial is a sphere, a
  // stroke a tube, an axis gradient a tube of radius units round its axis, anything else a
  // bumped sheet (normal from the noise slope). Lambert + a white specular glint past 1.0 (it
  // blooms) + a Fresnel rim in the paint's own colour; light comes from the light angle on screen.
  vec4 volume = texel(21);
  if (volume.x > 0.0) {
    vec4 shape = texel(22);
    vec3 normal = vec3(0.0, 0.0, 1.0);
    if (kind == 2) {
      vec2 local = (q - geomB.xy) / max(geomB.z, 1.0);
      normal = vec3(local, sqrt(max(1.0 - dot(local, local), 0.0)));
    } else if (vEdge.z >= 0.0) {
      float a = clamp(vEdge.y / max(vEdge.z + vEdge.w, 1e-3), -1.0, 1.0);
      normal = vec3(0.0, a, sqrt(max(1.0 - a * a, 0.0)));
    } else if (kind == 1) {
      vec2 axis = geomA.zw - geomA.xy;
      vec2 dir = axis / max(length(axis), 1.0);
      vec2 across2 = vec2(-dir.y, dir.x);
      float a = clamp(dot(q - geomA.xy, across2) / max(shape.z * unit, 1.0), -1.0, 1.0);
      normal = vec3(across2 * a, sqrt(max(1.0 - a * a, 0.0)));
    }
    if (shape.x > 0.0) {
      vec3 bp = vec3(q / unit * shape.y, 11.0);
      float e = 0.08;
      float h0 = fbm(bp);
      vec2 slope = vec2(fbm(bp + vec3(e, 0.0, 0.0)) - h0, fbm(bp + vec3(0.0, e, 0.0)) - h0) / e;
      normal = normalize(normal + vec3(-slope * shape.x * 0.35, 0.0));
    }
    normal = normalize(normal);
    // Stage y runs down the screen, so a light "up" on screen has a negative y.
    vec3 lightDir = normalize(vec3(cos(volume.w), -sin(volume.w), 0.9));
    float diffuse = max(dot(normal, lightDir), 0.0);
    float glint = pow(max(dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
    float fresnel = pow(1.0 - normal.z, 2.5);
    vec3 lit = rgb * (shape.w + (1.0 - shape.w) * diffuse) + volume.y * 1.6 * glint + volume.z * 1.4 * fresnel * paint.rgb;
    rgb = mix(rgb, lit, volume.x);
  }
  // Modifier noise is keyed to position only, never the paint's row seed: a beat whose paint
  // count changes between frames would otherwise see its holes and grain jump.
  // detail (VFX Essential's second texture layer): scrolling noise multiplied over the result.
  if (detail.x > 0.0) {
    vec2 scroll = vec2(cos(detail.w), sin(detail.w)) * clock * detail.y;
    float n = fbm(vec3(q / unit * detail.z - scroll, 2.0));
    rgb *= mix(1.0, 0.35 + 1.3 * n, detail.x);
  }
  // dissolve: noise eats the paint from amount 0 (whole) to 1 (gone); the surviving rim of
  // each hole burns in the edge colour, HDR-boosted so it alone blooms.
  if (dissolve.x > 0.0) {
    float n = clamp((fbm(vec3(q / unit * dissolve.w, 7.0)) - 0.5) * 1.8 + 0.5, 0.0, 1.0);
    float width = max(dissolve.y, 1e-3);
    float k = n - mix(-width, 1.0, dissolve.x);
    alpha *= smoothstep(-0.015, 0.015, k);
    vec4 edgeTexel = texel(18);
    vec3 edgeRgb = edgeTexel.w > 0.5 ? edgeTexel.rgb : paint.rgb;
    rgb = mix(rgb, edgeRgb * (1.0 + dissolve.z), 1.0 - smoothstep(0.0, width, k));
  }
  rgb = max(rgb, vec3(0.0));
  outColor = vec4(rgb * alpha, alpha);
}
`;
