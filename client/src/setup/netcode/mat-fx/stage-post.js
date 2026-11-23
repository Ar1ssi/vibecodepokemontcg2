// The post pass of a canvas stage (canvas-stage.js), on an offscreen WebGL canvas. The stage draws
// its frame in Canvas2D; this pass takes that frame and adds what a 2D canvas cannot: a bloom
// built from its bright parts only (bright pass, then a three-level blur), added with a roll-off
// that keeps the light's hue instead of clipping it to white, an optional chromatic fringe for
// the burst frames, and a dither that keeps the wide soft glows from banding. The result is
// premultiplied, so a glow over the board lights it rather than greying it.
// Null where WebGL is missing; `render` returns false once the context is lost, and the stage then
// shows its 2D frame as it is.

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Four bilinear taps a texel out (a 4×4 tent): the downsample, and the bright pass with it.
const BRIGHT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec4 c = 0.25 * (texture2D(uTex, vUv + uTexel * vec2(-1.0, -1.0)) + texture2D(uTex, vUv + uTexel * vec2(1.0, -1.0))
    + texture2D(uTex, vUv + uTexel * vec2(-1.0, 1.0)) + texture2D(uTex, vUv + uTexel * vec2(1.0, 1.0)));
  float lum = max(c.r, max(c.g, c.b));
  gl_FragColor = c * smoothstep(uThreshold, uThreshold + uKnee, lum);
}`;

// A 9-tap Gaussian in five bilinear fetches along uDir (one texel, in uv).
const BLUR = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec4 s = texture2D(uTex, vUv) * 0.2270270270;
  s += (texture2D(uTex, vUv + uDir * 1.3846153846) + texture2D(uTex, vUv - uDir * 1.3846153846)) * 0.3162162162;
  s += (texture2D(uTex, vUv + uDir * 3.2307692308) + texture2D(uTex, vUv - uDir * 3.2307692308)) * 0.0702702703;
  gl_FragColor = s;
}`;

// highp where the GPU has it: the dither's hash degenerates into a pattern at mediump.
const COMPOSITE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform sampler2D uBloom3;
uniform float uBloom;
uniform float uFringe;
float maxOf(vec3 c) { return max(c.r, max(c.g, c.b)); }
void main() {
  vec4 base = texture2D(uScene, vUv);
  if (uFringe > 0.0) {
    vec2 away = (vUv - 0.5) * uFringe;
    vec4 red = texture2D(uScene, vUv + away);
    vec4 blue = texture2D(uScene, vUv - away);
    base = vec4(red.r, base.g, blue.b, max(base.a, max(red.a, blue.a)));
  }
  vec3 bloom = (texture2D(uBloom1, vUv).rgb * 0.55 + texture2D(uBloom2, vUv).rgb * 0.45
    + texture2D(uBloom3, vUv).rgb * 0.4) * uBloom;
  // The bloom fills the headroom the frame leaves and never more: the frame keeps its look, the
  // light its hue, and nothing clips to white.
  float room = max(1.0 - maxOf(base.rgb), 0.0);
  float add = maxOf(bloom);
  vec3 glow = add > 0.0 ? bloom * (room * (1.0 - exp(-add / max(room, 0.001))) / add) : vec3(0.0);
  vec3 colour = base.rgb + glow;
  float alpha = max(base.a, maxOf(colour));
  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(colour + dither * step(0.004, alpha), 0.0, alpha), alpha);
}`;

const LEVELS = 3;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function program(gl, fragment) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const { name } = gl.getActiveUniform(prog, i);
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, uniforms };
}

function texture(gl, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (width > 0) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return tex;
}

function target(gl, width, height) {
  const tex = texture(gl, width, height);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, width, height };
}

/**
 * A post pass for frames of `width` × `height` device pixels, or null where WebGL is missing.
 * `render(source, { bloom, threshold, knee, fringe })` draws the 2D canvas `source` through it and
 * returns the WebGL canvas to copy onto the stage, or null once the context is gone.
 */
export function createStagePost(width, height) {
  if (typeof document === 'undefined' || !(width > 0) || !(height > 0)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const passes = { bright: program(gl, BRIGHT), blur: program(gl, BLUR), composite: program(gl, COMPOSITE) };
  if (!passes.bright || !passes.blur || !passes.composite) return null;
  let lost = false;
  canvas.addEventListener('webglcontextlost', () => {
    lost = true;
  });

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND);

  const scene = texture(gl, 0, 0);
  const levels = [];
  for (let i = 0, w = width, h = height; i < LEVELS; i += 1) {
    w = Math.max(1, Math.round(w / 2));
    h = Math.max(1, Math.round(h / 2));
    levels.push({ main: target(gl, w, h), swap: target(gl, w, h) });
  }

  const draw = (pass, into, inputs, set) => {
    gl.useProgram(pass.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, into ? into.fbo : null);
    gl.viewport(0, 0, into ? into.width : width, into ? into.height : height);
    inputs.forEach(([name, tex], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(pass.uniforms[name], unit);
    });
    set(pass.uniforms);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const blur = (level) => {
    const { main, swap } = level;
    draw(passes.blur, swap, [['uTex', main.tex]], (u) => gl.uniform2f(u.uDir, 1 / main.width, 0));
    draw(passes.blur, main, [['uTex', swap.tex]], (u) => gl.uniform2f(u.uDir, 0, 1 / main.height));
  };

  return {
    render(source, { bloom = 0.9, threshold = 0.55, knee = 0.3, fringe = 0 } = {}) {
      if (lost || gl.isContextLost()) return null;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      let from = { tex: scene, width, height };
      levels.forEach((level, i) => {
        draw(passes.bright, level.main, [['uTex', from.tex]], (u) => {
          gl.uniform2f(u.uTexel, 1 / from.width, 1 / from.height);
          gl.uniform1f(u.uThreshold, i === 0 ? threshold : 0);
          gl.uniform1f(u.uKnee, i === 0 ? knee : 0.001);
        });
        blur(level);
        from = level.main;
      });
      draw(
        passes.composite,
        null,
        [['uScene', scene], ...levels.map((level, i) => [`uBloom${i + 1}`, level.main.tex])],
        (u) => {
          gl.uniform1f(u.uBloom, bloom);
          gl.uniform1f(u.uFringe, fringe);
        }
      );
      return canvas;
    },
    dispose() {
      lost = true;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
