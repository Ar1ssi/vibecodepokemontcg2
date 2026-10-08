// Design 024 slice 1: the Web Audio driver for the fx-audio.mjs palette.
//
// Everything here is best-effort: a browser with no Web Audio, a blocked
// context, or a device failure must leave the game fully playable and silent.
// So every entry point is try/caught and the module never throws upward.
//
// Autoplay policy: a context created before any user gesture starts suspended
// and stays that way until `resume()` is called from inside a gesture. We
// create lazily and attach one-shot gesture listeners that resume it, rather
// than spamming resume() on every sound.
import { ambienceDisabled, crowdDisabled, fxVolume, soundDisabled } from '../../image-logic/mat-fx.mjs';
import { onFxSettingsChanged } from '../../image-logic/fx-settings.js';
import { clampGain, voicesFor } from './fx-audio.mjs';
import { CUES, UI_CUES, cuesFor } from './sfx-cues.mjs';
import { initSampleBank, playReaction, playSample, playSequence, startLoop, stopAllLoops } from './sample-bank.js';
import { createCrowdBed, crowdReactionFor } from './crowd.mjs';
import { createStatusAmbience } from './status-ambience.mjs';

// Design 064 O6: one loop per held condition, behind its own toggle.
const statusAmbience = createStatusAmbience({
  startLoop,
  enabled: () => !soundDisabled() && !ambienceDisabled(),
});

// Design 064 O7: the crowd beds, behind the Crowd toggle (own bus, no synthesized stand-in).
const crowdBed = createCrowdBed({
  startLoop,
  playSample,
  enabled: () => !soundDisabled() && !crowdDisabled(),
});

const NOISE_SECONDS = 1;
const ATTACK_SECONDS = 0.008;

let context = null;
let master = null;
let noiseBuffer = null;
let gestureBound = false;

const AudioContextCtor = () =>
  typeof globalThis !== 'undefined'
    ? globalThis.AudioContext || globalThis.webkitAudioContext || null
    : null;

/** One second of white noise, reused by every noise voice. */
const buildNoiseBuffer = (ctx) => {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
};

const resumeContext = () => {
  try {
    if (context?.state === 'suspended') context.resume();
  } catch {
    /* a refused resume just means we stay silent until the next gesture */
  }
};

// Bound once, on the first context creation. `pointerdown`/`keydown` are the
// gestures a browser accepts as unlocking audio; `once` is not used because a
// context can be re-suspended (tab hidden, OS audio change) and needs resuming
// again — the listeners are cheap and idempotent.
const bindGestureUnlock = () => {
  if (gestureBound || typeof document === 'undefined') return;
  gestureBound = true;
  for (const type of ['pointerdown', 'keydown']) {
    document.addEventListener(type, resumeContext, { passive: true });
  }
  // Loops must not run under a hidden tab; they resume when it is visible and conditions still hold.
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    if (hidden) stopAllLoops();
    statusAmbience.setHidden(hidden);
    crowdBed.setHidden(hidden);
  });
};

const ensureContext = () => {
  if (context) return context;
  const Ctor = AudioContextCtor();
  if (!Ctor) return null;
  try {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = clampGain(fxVolume());
    master.connect(context.destination);
    noiseBuffer = buildNoiseBuffer(context);
    bindGestureUnlock();
    resumeContext();
    initSampleBank(context, master);
    return context;
  } catch {
    // A partially built context still holds audio hardware; close it and drop
    // every derived handle, or the next attempt reuses a stale noise buffer.
    try {
      context?.close?.();
    } catch {
      /* nothing more we can do */
    }
    context = null;
    master = null;
    noiseBuffer = null;
    return null;
  }
};

const buildFilter = (ctx, spec, start, duration) => {
  if (!spec?.type) return null;
  const filter = ctx.createBiquadFilter();
  filter.type = spec.type;
  filter.frequency.setValueAtTime(spec.freq ?? 1000, start);
  // Cutoffs are positive, so the sweep can be exponential — it sounds even.
  if (spec.freqTo > 0 && spec.freq > 0) {
    filter.frequency.exponentialRampToValueAtTime(spec.freqTo, start + duration);
  }
  filter.Q.value = spec.q ?? 1;
  return filter;
};

// A swell must still leave some decay, or the voice would stop at its peak.
const attackFor = (voice, duration) =>
  Number.isFinite(voice.attack) && voice.attack > 0
    ? Math.min(voice.attack, duration * 0.9)
    : ATTACK_SECONDS;

/**
 * One voice: source -> [filter] -> envelope gain -> master. The envelope is a
 * linear attack (fast unless the voice asks for a swell) and an exponential
 * decay to (near) zero — exponential ramps cannot reach 0, hence the floor.
 */
const playVoice = (ctx, voice) => {
  const start = ctx.currentTime + (voice.delay ?? 0);
  const duration = Math.max(0.01, voice.dur ?? 0.2);
  const peak = clampGain(voice.gain);
  if (peak <= 0) return;

  let source;
  if (voice.type === 'noise') {
    if (!noiseBuffer) return;
    source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
  } else {
    source = ctx.createOscillator();
    source.type = voice.wave ?? 'sine';
    source.frequency.setValueAtTime(voice.freq ?? 440, start);
    if (Number.isFinite(voice.freqTo)) {
      // exponentialRamp cannot cross or reach zero; these are audio frequencies
      // so a linear ramp is both safe and close enough over ~200ms.
      source.frequency.linearRampToValueAtTime(voice.freqTo, start + duration);
    }
  }

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.linearRampToValueAtTime(peak, start + attackFor(voice, duration));
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  const filter = buildFilter(ctx, voice.filter, start, duration);
  if (filter) {
    source.connect(filter);
    filter.connect(envelope);
  } else {
    source.connect(envelope);
  }
  envelope.connect(master);

  source.start(start);
  source.stop(start + duration + 0.02);
  source.onended = () => {
    try {
      source.disconnect();
      envelope.disconnect();
      filter?.disconnect();
    } catch {
      /* already torn down */
    }
  };
};

/**
 * Play the palette entry for one fx plan. Called by the dispatcher, which
 * already checked the kill switch; the mute is re-checked here so a direct
 * caller cannot bypass it.
 */
export function playFxSound(plan) {
  if (!plan?.effect || soundDisabled()) return;
  if (plan.effect === 'game-over') statusAmbience.halt();
  playCrowdReaction(plan);
  const cues = cuesFor(plan.effect, plan);
  const voices = voicesFor(plan.effect, plan);
  if (cues.length === 0 && voices.length === 0) return;
  const ctx = ensureContext();
  if (!ctx) return;
  resumeContext();
  // Design 064: a ready sample replaces the synthesized voices; otherwise they are the fallback.
  if (cues.length > 0 && playSequence(cues)) return;
  for (const voice of voices) {
    try {
      playVoice(ctx, voice);
    } catch {
      /* one bad voice must not silence the rest of the sound */
    }
  }
}

// The crowd answers a moment independently of its sampled cue or synth voice. A game's end is
// answered, then the beds fade out.
function playCrowdReaction(plan) {
  try {
    const pool = crowdDisabled() ? null : crowdReactionFor(plan.effect, plan);
    if (pool && ensureContext()) {
      resumeContext();
      playReaction(pool, { gain: CUES[pool].gain });
    }
    if (plan.effect === 'game-over') crowdBed.finish();
  } catch {
    /* the crowd is best-effort */
  }
}

/**
 * Follow the board's crowd state (see crowd.mjs `bedStateFor`): bed, large bed, crazy loop.
 */
export function syncCrowdBed(state) {
  try {
    if (state?.bed && !ensureContext()) return;
    crowdBed.sync(state);
  } catch {
    /* the crowd is best-effort */
  }
}

/** Room teardown: stop the crowd beds and re-arm after a game-over fade. */
export function resetCrowdBed() {
  crowdBed.reset();
}

/**
 * Play a sampled UI-chrome cue (no plan exists there). Samples only: with no sample the UI stays
 * silent, as it was before design 064.
 */
export function playUiCue(key) {
  if (!UI_CUES.has(key) || soundDisabled()) return;
  const ctx = ensureContext();
  if (!ctx) return;
  resumeContext();
  playSample(key, { gain: CUES[key].gain, delayMs: CUES[key].delayMs, bus: 'ui' });
}

/**
 * Keep the per-condition loops matched to the conditions now held on the board (status keys such
 * as 'poison'). Called on every applied view; a loop whose sample is not decoded yet is retried.
 */
export function syncStatusAmbience(statusKeys) {
  try {
    if (statusKeys?.length > 0 && !ensureContext()) return;
    statusAmbience.sync(statusKeys);
  } catch {
    /* ambience is best-effort */
  }
}

/** New game or room teardown: stop every status loop and re-arm after a game-over halt. */
export function resetStatusAmbience() {
  statusAmbience.reset();
}

// Follow the volume slider without polling; a muted game must not keep looping ambience.
onFxSettingsChanged((settings) => {
  if (master) master.gain.value = clampGain(settings.volume);
  if (settings.sfxOff || settings.fxOff) stopAllLoops();
  statusAmbience.refresh();
  crowdBed.refresh();
});
