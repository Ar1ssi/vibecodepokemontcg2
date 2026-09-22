// Design 024 slice 1: the sound palette, as pure data.
//
// The repo ships no audio assets and none can be licensed here, so every sound
// is SYNTHESIZED from a handful of voices (design 024 O1). A voice is a small
// spec the driver (fx-audio.js) turns into one oscillator or noise burst:
//
//   { type, wave, freq, freqTo?, dur, gain, delay?, filter? }
//     type   'tone' (oscillator) | 'noise' (filtered white noise)
//     wave   oscillator type: 'sine' | 'triangle' | 'square' | 'sawtooth'
//     freq   start frequency in Hz; `freqTo` ramps to it over `dur`
//     dur    seconds; gain is the peak of a short attack/decay envelope
//     delay  seconds to wait before this voice starts (layering/arpeggios)
//     filter { type, freq, q } biquad, mainly to shape noise into a thud/hiss
//
// Keeping this DOM-free means the whole palette — including how a hit's pitch
// tracks its damage — is unit-testable without an AudioContext.

export const MAX_GAIN = 0.8;

const EMPTY = Object.freeze([]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Voice gains are clamped so no layered sound can clip the master bus. */
export const clampGain = (gain) =>
  typeof gain === 'number' && Number.isFinite(gain) ? clamp(gain, 0, MAX_GAIN) : 0;

// Voices are frozen: the palette is shared across every sound in the session,
// so handing out a mutable reference would let one caller corrupt it for all
// later ones. Freezing costs nothing per sound (the driver only reads).
const tone = (freq, dur, gain, over = {}) =>
  Object.freeze({ type: 'tone', wave: 'triangle', freq, dur, gain, ...over });

const noise = (dur, gain, filter, over = {}) =>
  Object.freeze({ type: 'noise', dur, gain, filter: Object.freeze(filter), ...over });

/** Notes of a rising/falling run, each delayed one step behind the last. */
const arpeggio = (freqs, { step = 0.07, dur = 0.16, gain = 0.2, wave = 'triangle' } = {}) =>
  Object.freeze(freqs.map((freq, i) => tone(freq, dur, gain, { wave, delay: i * step })));

// ── Static palette: effects whose sound never varies with the plan ──────────
const STATIC_VOICES = Object.freeze({
  'attack-banner': [
    tone(220, 0.13, 0.16, { wave: 'sawtooth', freqTo: 440 }),
    tone(660, 0.22, 0.12, { wave: 'triangle', delay: 0.1 }),
  ],
  attack: [
    noise(0.26, 0.3, { type: 'bandpass', freq: 900, q: 1.1 }),
    tone(140, 0.18, 0.14, { wave: 'sawtooth', freqTo: 70 }),
  ],
  knockout: [
    noise(0.5, 0.42, { type: 'lowpass', freq: 700, q: 0.8 }),
    tone(120, 0.42, 0.3, { wave: 'square', freqTo: 40 }),
    tone(300, 0.3, 0.12, { wave: 'sawtooth', freqTo: 90, delay: 0.06 }),
  ],
  'prize-claim': arpeggio([784, 988, 1319], { step: 0.08, dur: 0.24, gain: 0.17, wave: 'sine' }),
  evolve: arpeggio([440, 587, 784, 1047], { step: 0.06, dur: 0.2, gain: 0.16 }),
  devolve: arpeggio([1047, 784, 587, 440], { step: 0.06, dur: 0.2, gain: 0.16 }),
  attach: [
    tone(880, 0.1, 0.18, { wave: 'sine', freqTo: 1320 }),
    noise(0.07, 0.12, { type: 'highpass', freq: 2600, q: 0.7 }),
  ],
  'tool-attach': [tone(520, 0.09, 0.12, { wave: 'sine', freqTo: 660 })],
  retreat: [noise(0.2, 0.18, { type: 'bandpass', freq: 520, q: 0.9 })],
  promote: [tone(392, 0.2, 0.17, { wave: 'triangle', freqTo: 784 })],
  'trainer-play': [
    noise(0.16, 0.16, { type: 'highpass', freq: 1800, q: 0.7 }),
    ...arpeggio([523, 659], { step: 0.09, dur: 0.24, gain: 0.13, wave: 'sine' }),
  ],
  'stadium-play': [
    noise(0.2, 0.18, { type: 'lowpass', freq: 1400, q: 0.8 }),
    ...arpeggio([330, 440], { step: 0.1, dur: 0.3, gain: 0.14, wave: 'triangle' }),
  ],
  'ability-banner': arpeggio([659, 880, 1175], { step: 0.05, dur: 0.26, gain: 0.13, wave: 'sine' }),
  'turn-banner': [
    tone(523, 0.45, 0.16, { wave: 'sine' }),
    tone(784, 0.4, 0.1, { wave: 'sine', delay: 0.05 }),
  ],
  'status-clear': arpeggio([622, 831, 1109], { step: 0.05, dur: 0.16, gain: 0.12, wave: 'sine' }),
  discard: [noise(0.12, 0.14, { type: 'lowpass', freq: 1100, q: 0.7 })],
});

// ── Per-condition status motifs ────────────────────────────────────────────
const STATUS_VOICES = Object.freeze({
  Poisoned: [tone(180, 0.28, 0.16, { wave: 'sine', freqTo: 120 })],
  Burned: [noise(0.34, 0.2, { type: 'bandpass', freq: 1700, q: 0.6 })],
  Asleep: [tone(392, 0.44, 0.14, { wave: 'sine', freqTo: 196 })],
  Paralyzed: [
    tone(90, 0.24, 0.16, { wave: 'square' }),
    noise(0.16, 0.12, { type: 'highpass', freq: 2200, q: 0.8, delay: 0.04 }),
  ],
  Confused: [
    tone(330, 0.34, 0.13, { wave: 'sine', freqTo: 415 }),
    tone(336, 0.34, 0.13, { wave: 'sine', freqTo: 408 }),
  ],
});

const DEFAULT_STATUS_VOICES = Object.freeze([tone(300, 0.2, 0.13, { wave: 'triangle' })]);

/**
 * A hit reads heavier the harder it lands: the thud's pitch falls and its gain
 * rises with `amount`, over the same 0–200 damage span the screen shake uses.
 */
function damageVoices(plan) {
  const amount = Number.isFinite(plan?.dealt) ? plan.dealt : 0;
  const healed = Number.isFinite(plan?.healed) ? plan.healed : 0;
  if (healed > 0 || amount < 0) {
    return arpeggio([523, 698, 880], { step: 0.06, dur: 0.22, gain: 0.14, wave: 'sine' });
  }
  if (amount <= 0) return EMPTY;

  const weight = clamp(amount / 200, 0, 1);
  const body = [
    noise(0.16 + 0.12 * weight, 0.16 + 0.2 * weight, {
      type: 'lowpass',
      freq: 900 - 500 * weight,
      q: 0.8,
    }),
    tone(260 - 140 * weight, 0.16 + 0.14 * weight, 0.14 + 0.14 * weight, {
      wave: 'square',
      freqTo: 90 - 40 * weight,
    }),
  ];
  // Weakness is the ×2 moment; a bright overtone makes it audibly different.
  if (plan?.weakness) {
    body.push(tone(1568, 0.18, 0.13, { wave: 'sine', freqTo: 2093, delay: 0.03 }));
  }
  return Object.freeze(body);
}

function coinVoices(plan) {
  const high = plan?.face === 'heads';
  return Object.freeze([
    tone(high ? 1319 : 880, 0.12, 0.15, { wave: 'sine' }),
    tone(high ? 1760 : 659, 0.2, 0.11, { wave: 'sine', delay: 0.09 }),
  ]);
}

function gameOverVoices(plan) {
  if (plan?.user === 'self') {
    return arpeggio([523, 659, 784, 1047], { step: 0.14, dur: 0.5, gain: 0.2, wave: 'triangle' });
  }
  if (plan?.user === 'opp') {
    return arpeggio([440, 370, 294, 220], { step: 0.18, dur: 0.6, gain: 0.16, wave: 'sine' });
  }
  return EMPTY;
}

/**
 * Voices for one fx plan. Unknown effects are silent rather than a fallback
 * beep: a wrong sound is worse than none.
 * @returns {object[]}
 */
export function voicesFor(effect, plan = {}) {
  if (effect === 'damage') return damageVoices(plan);
  if (effect === 'coin-flip') return coinVoices(plan);
  if (effect === 'game-over') return gameOverVoices(plan);
  if (effect === 'status') {
    return Object.freeze(
      Object.hasOwn(STATUS_VOICES, plan.condition)
        ? STATUS_VOICES[plan.condition]
        : DEFAULT_STATUS_VOICES
    );
  }
  return Object.hasOwn(STATIC_VOICES, effect) ? Object.freeze(STATIC_VOICES[effect]) : EMPTY;
}
