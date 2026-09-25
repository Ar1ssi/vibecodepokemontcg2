// Design 024 slice 1: the sound palette, as pure data.
//
// The repo ships no audio assets and none can be licensed here, so every sound
// is SYNTHESIZED from a handful of voices (design 024 O1). A voice is a small
// spec the driver (fx-audio.js) turns into one oscillator or noise burst:
//
//   { type, wave, freq, freqTo?, dur, gain, delay?, attack?, filter? }
//     type   'tone' (oscillator) | 'noise' (filtered white noise)
//     wave   oscillator type: 'sine' | 'triangle' | 'square' | 'sawtooth'
//     freq   start frequency in Hz; `freqTo` ramps to it over `dur`
//     dur    seconds; gain is the peak of a short attack/decay envelope
//     delay  seconds to wait before this voice starts (layering/arpeggios)
//     attack seconds to reach the peak (default: a click-free few ms); a long
//            attack makes a swell
//     filter { type, freq, q, freqTo? } biquad, mainly to shape noise into a
//            thud/hiss; `freqTo` sweeps its cutoff over `dur` (a riser)
//
// Keeping this DOM-free means the whole palette — including how a hit's pitch
// tracks its damage — is unit-testable without an AudioContext.
import { classifyHitOnce } from './damage-hit.mjs';

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
const arpeggio = (freqs, { step = 0.07, dur = 0.16, gain = 0.2, wave = 'triangle', at = 0 } = {}) =>
  Object.freeze(freqs.map((freq, i) => tone(freq, dur, gain, { wave, delay: at + i * step })));

// Design 041: the evolution scene's score, timed to its 3.5 s picture
// (evolve-scene.mjs): a twinkling intro over a swelling pad, a riser and a
// quickening run into the flare (~2.0 s), a bright chord and a boom at its
// peak, then a short fanfare and sparkles as the evolved Pokémon appears.
const FLARE_S = 2.0;
const EVOLVE_SCORE = Object.freeze([
  ...arpeggio([1047, 1319, 1568, 2093, 1568, 2093, 2637], { step: 0.11, dur: 0.34, gain: 0.05, wave: 'sine' }),
  tone(196, 1.95, 0.1, { wave: 'sine', attack: 1.55 }),
  tone(294, 1.95, 0.09, { wave: 'sine', attack: 1.6 }),
  tone(392, 1.9, 0.05, { wave: 'triangle', attack: 1.7, delay: 0.05 }),
  noise(1.4, 0.11, { type: 'bandpass', freq: 500, freqTo: 5200, q: 1.4 }, { attack: 1.25, delay: 0.6 }),
  tone(220, 1.4, 0.06, { wave: 'triangle', freqTo: 880, attack: 1.2, delay: 0.6 }),
  ...[523, 659, 784, 1047, 1319, 1568, 2093].map((freq, i) =>
    tone(freq, 0.24, 0.07, { wave: 'sine', delay: [1.0, 1.2, 1.36, 1.5, 1.62, 1.72, 1.8][i] })
  ),
  ...[262, 523, 659, 784, 1047].map((freq, i) =>
    tone(freq, 1.2 - i * 0.08, [0.08, 0.08, 0.06, 0.06, 0.04][i], {
      wave: i === 0 ? 'triangle' : 'sine',
      delay: FLARE_S,
    })
  ),
  noise(0.9, 0.08, { type: 'highpass', freq: 3000, q: 0.7 }, { delay: FLARE_S }),
  tone(110, 0.45, 0.18, { wave: 'sine', freqTo: 45, delay: FLARE_S }),
  ...arpeggio([784, 1047, 1319], { step: 0.12, dur: 0.16, gain: 0.09, at: 2.22 }),
  tone(1568, 0.6, 0.09, { wave: 'triangle', delay: 2.58 }),
  ...arpeggio([2637, 3136, 2349, 3520, 2794], { step: 0.12, dur: 0.25, gain: 0.035, wave: 'sine', at: 2.45 }),
]);

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
  // `evolve` sounds under a Mega/Tera signature entry; any other evolution
  // plays `evolve-scene` (index.js picks which before the dispatcher sounds).
  evolve: arpeggio([440, 587, 784, 1047], { step: 0.06, dur: 0.2, gain: 0.16 }),
  'evolve-scene': EVOLVE_SCORE,
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
  // Design 043: a swoosh as the opponent's card drops off their hand, the
  // trainer chime as it grows into the preview (opp-play.mjs, ~0.26 s).
  'opp-trainer-play': [
    noise(0.24, 0.14, { type: 'bandpass', freq: 1200, q: 0.6 }),
    ...arpeggio([523, 659, 784], { step: 0.08, dur: 0.26, gain: 0.13, wave: 'sine', at: 0.26 }),
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
 *
 * The hit is read through `classifyHitOnce`, the SAME classification the visual
 * uses — including its fallback to the delta against the last total seen. Most
 * engine emitters (checkup Poison/Burn, Tool pings, special energy) send only
 * a cumulative `damage`, and reading `plan.dealt` alone left every one of those
 * hits silent while still drawing the number and shaking the table.
 */
function damageVoices(plan) {
  const hit = classifyHitOnce(plan);
  if (!hit) return EMPTY;
  if (hit.kind === 'heal') {
    return arpeggio([523, 698, 880], { step: 0.06, dur: 0.22, gain: 0.14, wave: 'sine' });
  }

  const amount = hit.amount;
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
  if (hit.weakness) {
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
