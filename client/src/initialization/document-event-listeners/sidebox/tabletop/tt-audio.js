import { assetUrl } from './tt-textures.js';

/**
 * The tabletop's sound (design 073): physical noises synthesized from shaped noise — film
 * crinkling and tearing, board sliding on board, foil ripping — and TCG Live's own card samples
 * (D203) for cards sliding and landing. Starts on the first gesture; never throws.
 */

const MANIFEST_PATH = 'src/assets/sfx/manifest.json';
const SFX_DIR = 'src/assets/sfx/';
const SAMPLE_KEYS = ['card-swoosh', 'card-place', 'card-flip', 'card-drawn', 'shuffle'];

/**
 * @param {{muted?: () => boolean, volume?: () => number}} options
 */
export function createTabletopAudio({ muted = () => false, volume = () => 0.8 } = {}) {
  let ctx = null;
  let master = null;
  let noise = null;
  let manifest = null;
  const buffers = new Map();
  let closed = false;

  const ensure = () => {
    if (closed) return null;
    try {
      if (!ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
        master = ctx.createGain();
        master.connect(ctx.destination);
        noise = makeNoise(ctx);
        loadSamples();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      master.gain.value = Math.max(0, Math.min(1, Number(volume()) || 0)) * 0.9;
      return ctx;
    } catch {
      return null;
    }
  };

  const loadSamples = async () => {
    try {
      const response = await fetch(assetUrl(MANIFEST_PATH));
      if (!response.ok) return;
      manifest = await response.json();
      await Promise.all(
        SAMPLE_KEYS.map(async (key) => {
          const files = manifest?.cues?.[key]?.files || [];
          const decoded = await Promise.all(
            files.map(async (file) => {
              try {
                const data = await (await fetch(assetUrl(SFX_DIR + file))).arrayBuffer();
                return await ctx.decodeAudioData(data);
              } catch {
                return null;
              }
            })
          );
          const list = decoded.filter(Boolean);
          if (list.length) buffers.set(key, list);
        })
      );
    } catch {
      // No samples: the synthesized voices stand in.
    }
  };

  const playSample = (key, { gain = 1, rate = 1, delay = 0 } = {}) => {
    const list = buffers.get(key);
    if (!list) return false;
    const source = ctx.createBufferSource();
    source.buffer = list[Math.floor(Math.random() * list.length)];
    source.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const level = ctx.createGain();
    level.gain.value = gain;
    source.connect(level).connect(master);
    source.start(ctx.currentTime + delay);
    return true;
  };

  // A burst of filtered noise: the building block of every physical sound here.
  const burst = ({ at = 0, dur = 0.05, gain = 0.3, type = 'bandpass', freq = 3000, q = 1, freqTo = null, attack = 0.003 }) => {
    const start = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const offset = Math.random() * (noise.duration - dur - 0.01);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, start);
    if (freqTo) filter.frequency.exponentialRampToValueAtTime(freqTo, start + dur);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter).connect(env).connect(master);
    source.start(start, offset, dur + 0.02);
  };

  // Crinkling film: many tiny crackles, denser where `density(t)` is high.
  const crinkle = ({ dur, grains, gain, low, high, at = 0, shape = (t) => 1 - t }) => {
    for (let i = 0; i < grains; i += 1) {
      const t = Math.random();
      if (Math.random() > shape(t)) continue;
      burst({
        at: at + t * dur,
        dur: 0.004 + Math.random() * 0.016,
        gain: gain * (0.25 + Math.random() * 0.75),
        type: 'bandpass',
        freq: low + Math.random() * (high - low),
        q: 0.7 + Math.random() * 2.5,
        attack: 0.001,
      });
    }
  };

  const tone = ({ at = 0, freq, freqTo, dur, gain, type = 'sine' }) => {
    const start = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(freqTo, start + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  };

  const VOICES = {
    // Fingers digging into shrink-wrap, the film splitting, then balled up.
    'wrap-tear': () => {
      burst({ dur: 0.09, gain: 0.35, freq: 2600, freqTo: 5200, q: 0.9 });
      crinkle({ dur: 0.9, grains: 140, gain: 0.32, low: 2200, high: 9000, shape: (t) => 1 - 0.6 * t });
    },
    'wrap-crumple': () => crinkle({ dur: 0.7, grains: 110, gain: 0.3, low: 1500, high: 7000, shape: () => 0.9 }),
    'wrap-drop': () => crinkle({ dur: 0.18, grains: 22, gain: 0.18, low: 1500, high: 6000 }),
    // Board sliding on board, then the lid springs free.
    'lid-open': () => {
      burst({ dur: 0.22, gain: 0.16, type: 'bandpass', freq: 700, freqTo: 1300, q: 1.4, attack: 0.03 });
      burst({ at: 0.04, dur: 0.12, gain: 0.08, type: 'highpass', freq: 3500, q: 0.7, attack: 0.02 });
      tone({ at: 0.18, freq: 140, freqTo: 70, dur: 0.09, gain: 0.12 });
    },
    'item-lift': () => burst({ dur: 0.16, gain: 0.07, type: 'bandpass', freq: 1800, freqTo: 900, q: 0.8, attack: 0.04 }),
    'item-land': () => {
      burst({ dur: 0.05, gain: 0.12, type: 'lowpass', freq: 900, q: 0.7 });
      tone({ freq: 180, freqTo: 90, dur: 0.06, gain: 0.07 });
    },
    'pack-land': () => crinkle({ dur: 0.12, grains: 18, gain: 0.16, low: 2500, high: 8000 }),
    'pack-pick': () => crinkle({ dur: 0.35, grains: 45, gain: 0.2, low: 2500, high: 9500, shape: (t) => 1 - t }),
    // Foil ripping across the crimp: a rising tearing noise with crackle, ending in a snap.
    'pack-tear': () => {
      burst({ dur: 0.34, gain: 0.32, type: 'bandpass', freq: 1300, freqTo: 3800, q: 0.8, attack: 0.02 });
      crinkle({ dur: 0.34, grains: 90, gain: 0.3, low: 2500, high: 9000, shape: () => 1 });
      burst({ at: 0.32, dur: 0.05, gain: 0.25, type: 'highpass', freq: 3000, q: 0.7 });
    },
    'pack-peel': () => crinkle({ dur: 0.08, grains: 10, gain: 0.16, low: 2500, high: 8000 }),
    'cards-out': () => {
      if (!playSample('card-drawn', { gain: 0.9 })) burst({ dur: 0.25, gain: 0.1, type: 'lowpass', freq: 2400, attack: 0.05 });
    },
    'card-slide': () => {
      if (!playSample('card-swoosh', { gain: 1.4, rate: 1.1 })) {
        burst({ dur: 0.14, gain: 0.1, type: 'lowpass', freq: 3000, q: 0.6, attack: 0.03 });
      }
    },
    'card-land': () => {
      if (!playSample('card-place', { gain: 0.9 })) burst({ dur: 0.03, gain: 0.08, type: 'lowpass', freq: 1500 });
    },
    'card-flip': () => {
      if (!playSample('card-flip', { gain: 0.5 })) burst({ dur: 0.06, gain: 0.08, type: 'bandpass', freq: 1800 });
    },
    'deck-unwrap': () => {
      burst({ dur: 0.06, gain: 0.2, freq: 3200, freqTo: 6000, q: 1 });
      crinkle({ dur: 0.6, grains: 80, gain: 0.24, low: 3000, high: 10000, shape: (t) => 1 - 0.5 * t });
    },
    'deck-down': () => {
      if (!playSample('shuffle', { gain: 0.35, rate: 1.2 })) burst({ dur: 0.08, gain: 0.08, type: 'lowpass', freq: 1200 });
    },
  };

  return {
    /** Call from a user gesture: browsers start audio only then. */
    unlock: () => {
      if (!muted()) ensure();
    },
    play: (name) => {
      if (muted()) return;
      const context = ensure();
      const voice = VOICES[name];
      if (!context || !voice) return;
      try {
        voice();
      } catch {
        // A voice that cannot be scheduled is skipped.
      }
    },
    dispose: () => {
      closed = true;
      ctx?.close?.().catch(() => {});
      ctx = null;
    },
  };
}

function makeNoise(ctx) {
  const length = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}
