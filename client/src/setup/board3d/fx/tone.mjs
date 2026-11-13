// Design 089 § D6: how the FX layer's light meets the screen. The FX render into a half-float
// target where hot cores run far past 1.0, and the composite used to clamp each channel on its own:
// a yellow three times too bright became (1, 1, 0.9) — white. Every strong move ended as a white
// slab over both cards (the user's "impact centres can blow out", and against the standing "no
// whiteouts"). `rollOff` compresses a colour by its brightest channel instead, so it keeps its hue
// as it nears full brightness; only light that is many times over leans toward white, and never
// all the way. The shader in fx-layer.js is built from ROLL_OFF_GLSL below; `rollOff` is the same
// maths for the tests. Pure: no `three`.

/**
 * `knee`: below it light passes unchanged. Past it the brightest channel approaches 1.0 and never
 * reaches it. `whiten`: the most a colour may lean to white; it starts leaning once its brightest
 * channel passes `whitenFrom` and leans in full at `whitenTo`.
 */
export const TONE = Object.freeze({ knee: 0.68, whiten: 0.32, whitenFrom: 1.8, whitenTo: 7 });

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The roll-off of one linear colour `[r, g, b]` (each ≥ 0, any may exceed 1). */
export function rollOff(colour, tone = TONE) {
  const c = colour.map((v) => Math.max(0, Number(v) || 0));
  const peak = Math.max(...c);
  if (peak <= tone.knee) return c;
  const over = (peak - tone.knee) / (1 - tone.knee);
  const mapped = tone.knee + (1 - tone.knee) * (1 - Math.exp(-over));
  const lean = tone.whiten * smoothstep(tone.whitenFrom, tone.whitenTo, peak);
  return c.map((v) => (v / peak) * mapped * (1 - lean) + mapped * lean);
}

/**
 * One premultiplied FX texel as what covers the board and what is light on top of that. A texel
 * that only covers (smoke, water, the board bent by a lens) has no channel above its alpha: all of
 * it is `matter`. Whatever its alpha cannot account for is `light`, in the same hue.
 */
export function splitCover(colour, alpha) {
  const c = colour.map((v) => Math.max(0, Number(v) || 0));
  const cover = Math.min(1, Math.max(0, Number(alpha) || 0));
  const peak = Math.max(...c);
  const share = peak > 0 ? Math.min(1, cover / peak) : 0;
  const matter = c.map((v) => v * share);
  return { matter, light: c.map((v, i) => v - matter[i]), cover };
}

/**
 * What the composite leaves on screen where `board` (0–1 rgb) lies under one FX texel: the matter
 * goes over the board exactly, then the rolled-off light is screened on. Never above 1.
 */
export function compositeOver(board, colour, alpha, tone = TONE) {
  const { matter, light, cover } = splitCover(colour, alpha);
  const lit = rollOff(light, tone);
  return board.map((b, i) => (b * (1 - cover) + matter[i]) * (1 - lit[i]) + lit[i]);
}

const f = (value) => value.toFixed(4);

/** `vec3 fxRollOff(vec3 c)`: the same maths in GLSL. */
export const ROLL_OFF_GLSL = `
vec3 fxRollOff(vec3 colour) {
  vec3 c = max(colour, vec3(0.0));
  float peak = max(max(c.r, c.g), c.b);
  if (peak <= ${f(TONE.knee)}) return c;
  float over = (peak - ${f(TONE.knee)}) / ${f(1 - TONE.knee)};
  float mapped = ${f(TONE.knee)} + ${f(1 - TONE.knee)} * (1.0 - exp(-over));
  float lean = ${f(TONE.whiten)} * smoothstep(${f(TONE.whitenFrom)}, ${f(TONE.whitenTo)}, peak);
  return mix(c / peak * mapped, vec3(mapped), lean);
}
`;

/** `void fxSplit(vec4 fx, out vec3 matter, out vec3 light, out float cover)`: splitCover + rollOff of the light. Needs ROLL_OFF_GLSL. */
export const SPLIT_COVER_GLSL = `
void fxSplit(vec4 fx, out vec3 matter, out vec3 light, out float cover) {
  vec3 c = max(fx.rgb, vec3(0.0));
  cover = clamp(fx.a, 0.0, 1.0);
  float peak = max(max(c.r, c.g), c.b);
  matter = c * (peak > 0.0 ? min(1.0, cover / peak) : 0.0);
  light = fxRollOff(c - matter);
}
`;
