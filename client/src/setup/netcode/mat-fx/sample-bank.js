// Design 064: the sampled-audio bank. Fetches the importer's manifest, decodes cues, and plays
// them through per-bus gain nodes under the existing master gain.
//
// Best-effort like the rest of the audio layer: a missing manifest (fresh clone, files not
// imported), a 404, or a decode failure leaves the bank empty or the cue dead, and every
// entry point returns false/null so the caller falls back to the synthesized palette.
// Nothing here throws.
import { REACTION_COOLDOWN_MS, REACTION_FADE_SECONDS } from './crowd.mjs';
import { CUES, pickVariant } from './sfx-cues.mjs';

export const MANIFEST_URL = '/src/assets/sfx/manifest.json';
export const BASE_URL = '/src/assets/sfx/';
export const MANIFEST_VERSION = 1;
export const MAX_CONCURRENT = 2;
export const STREAM_SECONDS = 20;
export const LOOP_FADE_SECONDS = 0.05;
export const BUS_GAIN = Object.freeze({ sfx: 1, ui: 1, status: 1, crowd: 0.5 });

const finiteGain = (gain) => (typeof gain === 'number' && Number.isFinite(gain) ? Math.max(0, gain) : 1);

/**
 * When a one-shot starts (ms from now) and where in the buffer (ms). With `alignMs` and a measured
 * `peakMs` (design 064 Addendum A) the peak lands `alignMs` after the request: a late peak delays
 * the start, an early-enough one skips the lead-in. Otherwise the plain `delayMs` start.
 */
export function startTiming(delayMs, alignMs, peakMs) {
  if (Number.isFinite(alignMs) && Number.isFinite(peakMs)) {
    const lead = alignMs - peakMs;
    return { startMs: Math.max(0, lead), offsetMs: Math.max(0, -lead) };
  }
  return { startMs: Math.max(0, Number.isFinite(delayMs) ? delayMs : 0), offsetMs: 0 };
}

/**
 * Builds a bank bound to one AudioContext. Exported for tests (fake context/fetch); the module
 * singleton below is what the game uses.
 * @param {{fetch?: Function, MediaCtor?: Function, rng?: () => number, log?: (m: string) => void}} deps
 */
export function createSampleBank(deps = {}) {
  const fetchFn = deps.fetch ?? (typeof fetch === 'function' ? fetch : null);
  const rng = deps.rng ?? Math.random;
  const log = deps.log ?? ((message) => console.info(message));
  const MediaCtor = deps.MediaCtor ?? (typeof Audio === 'function' ? Audio : null);

  let ctx = null;
  let master = null;
  let cues = {};
  let ready = false;
  const buses = new Map();
  const files = new Map(); // key -> [{ url, buffer }]
  const loading = new Map(); // key -> Promise
  const dead = new Set();
  const lastPick = new Map();
  const active = new Map(); // key -> running one-shot count
  const loops = new Set();

  const busNode = (bus) => {
    const name = bus in BUS_GAIN ? bus : 'sfx';
    if (!buses.has(name)) {
      const node = ctx.createGain();
      node.gain.value = BUS_GAIN[name];
      node.connect(master);
      buses.set(name, node);
    }
    return buses.get(name);
  };

  const isStreamed = (key) => (cues[key]?.dur ?? 0) > STREAM_SECONDS;

  const fetchBuffer = async (url) => {
    const response = await fetchFn(url);
    if (!response?.ok) throw new Error(`HTTP ${response?.status}`);
    return ctx.decodeAudioData(await response.arrayBuffer());
  };

  // A failed file drops out of its cue; a cue with no decodable file is dead for the session.
  const loadCue = (key) => {
    if (dead.has(key) || !cues[key] || isStreamed(key)) return Promise.resolve();
    if (loading.has(key)) return loading.get(key);
    const peaks = Array.isArray(cues[key].peaks) ? cues[key].peaks : [];
    const entries = cues[key].files.map((name, i) => ({ url: BASE_URL + name, buffer: null, peakMs: peaks[i] }));
    const job = Promise.all(
      entries.map(async (entry) => {
        try {
          entry.buffer = await fetchBuffer(entry.url);
        } catch {
          entry.buffer = null;
        }
      }),
    ).then(() => {
      const decoded = entries.filter((entry) => entry.buffer);
      if (decoded.length === 0) dead.add(key);
      else files.set(key, decoded);
    });
    loading.set(key, job);
    return job;
  };

  const preload = () => Promise.all(Object.keys(cues).filter((key) => CUES[key]?.preload).map(loadCue));

  const readManifest = async () => {
    try {
      const response = await fetchFn(MANIFEST_URL);
      if (!response?.ok) throw new Error(`HTTP ${response?.status}`);
      const manifest = await response.json();
      const valid = manifest?.version === MANIFEST_VERSION && manifest.cues && typeof manifest.cues === 'object';
      if (!valid) throw new Error('unsupported manifest');
      return Object.fromEntries(
        Object.entries(manifest.cues).filter(([, cue]) => Array.isArray(cue?.files) && cue.files.length > 0),
      );
    } catch (err) {
      log(`[sfx] no sampled audio (${err.message}); using synthesized sounds`);
      return {};
    }
  };

  /**
   * Fetch the manifest and start preloading. Resolves when preload settles; never rejects.
   * Preload waits for the context to be running, i.e. for the first user gesture.
   */
  const init = async (audioContext, masterGain) => {
    if (ctx || !audioContext || !masterGain || !fetchFn) return;
    ctx = audioContext;
    master = masterGain;
    cues = await readManifest();
    ready = true;
    if (ctx.state === 'running') return preload();
    return new Promise((resolve) => {
      const onState = () => {
        if (ctx.state !== 'running') return;
        ctx.removeEventListener?.('statechange', onState);
        resolve(preload());
      };
      ctx.addEventListener?.('statechange', onState);
    });
  };

  const hasSample = (key) => ready && !dead.has(key) && files.has(key);

  /** @returns {boolean} false = not played (not ready / dead / unknown): the caller falls back */
  const playSample = (key, { gain = 1, delayMs = 0, alignMs, bus = 'sfx' } = {}) => {
    if (!ready || dead.has(key) || !cues[key]) return false;
    const variants = files.get(key);
    if (!variants) {
      loadCue(key); // arrives later; this request falls back to the synth rather than playing late
      return false;
    }
    // A scheduled play belongs to a multi-cue sequence and is never dropped by the cap.
    if (delayMs === 0 && (active.get(key) ?? 0) >= MAX_CONCURRENT) return true; // dropped on purpose: already sounding
    return startOneShot(key, variants, { gain, delayMs, alignMs, bus }) !== null;
  };

  // One buffer source -> gain -> bus. Returns the running pieces, or null when the graph refused.
  const startOneShot = (key, variants, { gain, delayMs, alignMs, bus }) => {
    try {
      const index = pickVariant(variants.length, lastPick.get(key) ?? -1, rng);
      lastPick.set(key, index);
      const variant = variants[index];
      const source = ctx.createBufferSource();
      source.buffer = variant.buffer;
      const level = ctx.createGain();
      level.gain.value = finiteGain(gain);
      source.connect(level);
      level.connect(busNode(bus));
      active.set(key, (active.get(key) ?? 0) + 1);
      source.onended = () => {
        active.set(key, Math.max(0, (active.get(key) ?? 1) - 1));
        try {
          source.disconnect();
          level.disconnect();
        } catch {
          /* already torn down */
        }
      };
      const { startMs, offsetMs } = startTiming(delayMs, alignMs, variant.peakMs);
      source.start(ctx.currentTime + startMs / 1000, offsetMs / 1000);
      return { source, level };
    } catch {
      return null;
    }
  };

  const fadeOneShot = ({ source, level }, seconds) => {
    try {
      const now = ctx.currentTime;
      level.gain.setValueAtTime(level.gain.value, now);
      level.gain.linearRampToValueAtTime(0, now + seconds);
      source.stop(now + seconds);
    } catch {
      /* already ended */
    }
  };

  let reaction = null; // the crowd's one reaction slot: { source, level, startedAt }

  /**
   * Play a crowd reaction in the single reaction slot (design O7): reactions never stack. A request
   * inside the cooldown of the running one is dropped; after it, the newest replaces the old one,
   * which fades out. A cue not decoded yet starts loading and this request is dropped (no synth
   * stand-in for a crowd).
   * @returns {boolean} false = not played because the cue is unavailable
   */
  const playReaction = (key, { gain = 1 } = {}) => {
    if (!ready || dead.has(key) || !cues[key]) return false;
    const variants = files.get(key);
    if (!variants) {
      loadCue(key);
      return false;
    }
    const now = ctx.currentTime;
    if (reaction && now - reaction.startedAt < REACTION_COOLDOWN_MS / 1000) return true;
    const previous = reaction;
    const started = startOneShot(key, variants, { gain, delayMs: 0, bus: 'crowd' });
    reaction = started && { ...started, startedAt: now };
    if (previous) fadeOneShot(previous, REACTION_FADE_SECONDS);
    return started !== null;
  };

  /** Start a lazy load if the cue is neither loaded nor dead. Never throws. */
  const warmSample = (key) => {
    if (!ready || dead.has(key) || !cues[key] || files.has(key)) return;
    loadCue(key);
  };

  /**
   * Play a multi-cue sequence all-or-nothing: a half-sampled sequence would be worse than the
   * synth, so if any key is not decoded nothing plays and the missing ones start loading.
   * @param {ReadonlyArray<{key: string, gain: number, delayMs: number}>} sequence
   * @returns {boolean} true when every cue was played
   */
  const playSequence = (sequence) => {
    const missing = sequence.filter((cue) => !hasSample(cue.key));
    if (missing.length > 0) {
      for (const cue of missing) warmSample(cue.key);
      return false;
    }
    for (const cue of sequence) {
      playSample(cue.key, { gain: cue.gain, delayMs: cue.delayMs, alignMs: cue.alignMs, bus: CUES[cue.key]?.bus });
    }
    return true;
  };

  const stopLoopNow = (loop, fadeSeconds = LOOP_FADE_SECONDS) => {
    loops.delete(loop);
    try {
      const now = ctx.currentTime;
      loop.level.gain.setValueAtTime(loop.level.gain.value, now);
      loop.level.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      loop.stop(now + fadeSeconds);
    } catch {
      /* already stopped */
    }
  };

  // Clips over STREAM_SECONDS are never decoded whole: an <audio> element feeds the graph.
  const streamLoop = (key, gain, bus) => {
    if (!MediaCtor || typeof ctx.createMediaElementSource !== 'function') return null;
    const element = new MediaCtor(BASE_URL + cues[key].files[0]);
    element.loop = true;
    const level = ctx.createGain();
    level.gain.value = finiteGain(gain);
    ctx.createMediaElementSource(element).connect(level);
    level.connect(busNode(bus));
    element.play?.()?.catch?.(() => {});
    // The element keeps playing under the fade and is paused once it has run.
    return {
      level,
      stop: (when) => setTimeout(() => element.pause?.(), Math.max(0, (when - ctx.currentTime) * 1000)),
    };
  };

  const bufferLoop = (key, gain, bus) => {
    const variants = files.get(key);
    if (!variants) {
      loadCue(key);
      return null;
    }
    const source = ctx.createBufferSource();
    source.buffer = variants[0].buffer;
    source.loop = true;
    const level = ctx.createGain();
    level.gain.value = finiteGain(gain);
    source.connect(level);
    level.connect(busNode(bus));
    source.start();
    return { level, stop: (when) => source.stop(when) };
  };

  /** @returns {{stop: (opts?: {outroKey?: string}) => void} | null} null = not startable now */
  const startLoop = (key, { gain = 1, bus = 'sfx' } = {}) => {
    if (!ready || dead.has(key) || !cues[key]) return null;
    try {
      const loop = isStreamed(key) ? streamLoop(key, gain, bus) : bufferLoop(key, gain, bus);
      if (!loop) return null;
      loops.add(loop);
      return {
        stop: ({ outroKey, fadeSeconds } = {}) => {
          if (!loops.has(loop)) return;
          stopLoopNow(loop, fadeSeconds > 0 ? fadeSeconds : LOOP_FADE_SECONDS);
          if (outroKey) playSample(outroKey, { gain, bus });
        },
      };
    } catch {
      return null;
    }
  };

  const stopAllLoops = () => {
    if (!ctx) return;
    for (const loop of [...loops]) stopLoopNow(loop);
  };

  return { init, hasSample, warmSample, playSample, playReaction, playSequence, startLoop, stopAllLoops };
}

const bank = createSampleBank();

/** Start the singleton bank. Safe to call more than once; never throws. */
export const initSampleBank = (ctx, master) => {
  try {
    bank.init(ctx, master).catch(() => {});
  } catch {
    /* best-effort */
  }
};
export const hasSample = bank.hasSample;
export const warmSample = bank.warmSample;
export const playSample = bank.playSample;
export const playReaction = bank.playReaction;
export const playSequence = bank.playSequence;
export const startLoop = bank.startLoop;
export const stopAllLoops = bank.stopAllLoops;
