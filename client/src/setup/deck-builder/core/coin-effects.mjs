// Coin material/finish resolver + fixed-light coin effects.
//
// Mirrors the holo engine (core/holo.mjs): a fixed virtual light whose
// highlight position is a function of the coin's angle, never the cursor, so
// the reflection behaves like light on a physical disc. Materials and surface
// finishes only change CSS variables (see css/coin/*.css); this module decides
// which material/finish a catalog coin has and drives the --coin-light-* vars
// that every decorative layer reads.

import { COIN_MATERIALS } from './coins.mjs';
import { clamp, round, driftTilt } from './holo.mjs';

const DEFAULT_MATERIAL = 'enamel';

// Bulbapedia descriptions name the surface finish. The catalog has no `finish`
// field, and inventing one would violate the no-mock-data rule, so the finish
// is derived from text that is already in the catalog.
const MIRROR_RE = /mirror\s+holo/i;
const HOLOFOIL_RE = /holofoil|holo\s*foil/i;

/** Resolve a coin to a known material and a surface finish. Never throws. */
export function resolveCoinEffect(coin = {}) {
  const raw = String(coin?.material ?? '')
    .trim()
    .toLowerCase();
  const material = COIN_MATERIALS.includes(raw) ? raw : DEFAULT_MATERIAL;

  const description = String(coin?.description ?? '').trim();
  let finish = 'standard';
  if (description) {
    if (MIRROR_RE.test(description)) finish = 'mirror';
    else if (HOLOFOIL_RE.test(description)) finish = 'holofoil';
  }
  return { material, finish };
}

// Characters that could break out of a CSS `url("...")` token.
const isUnsafeInCssUrl = (src) =>
  [...src].some((ch) => {
    const code = ch.charCodeAt(0);
    return (
      ch === '"' || ch === '\\' || /\s/.test(ch) || code < 0x20 || code === 0x7f
    );
  });

/**
 * The coin's own art doubles as a luminance mask for the specular layer, so
 * highlights only land on bright (raised) metal. Returns an absolute URL for
 * same-origin art, a data:/blob: string unchanged, else null. Cross-origin
 * masks render transparent when CORS blocks them (see holo.mjs), so they are
 * rejected rather than allowed to blank a layer.
 */
export function coinMaskUrl(src, pageOrigin = globalThis.location?.origin) {
  if (typeof src !== 'string' || !src) return null;
  if (isUnsafeInCssUrl(src)) return null;
  let url;
  try {
    url = new URL(src, pageOrigin || undefined);
  } catch {
    return null;
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:') return src;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!pageOrigin) return null;
  return url.origin === pageOrigin ? url.href : null;
}

/** Markup for the four decorative layers, in paint order. */
export const coinEffectLayerMarkup = (tag = 'span') =>
  [
    `<${tag} class="coin__env"></${tag}>`,
    `<${tag} class="coin__spec"></${tag}>`,
    `<${tag} class="coin__holo"></${tag}>`,
    `<${tag} class="coin__grain"></${tag}>`,
  ].join('');

/**
 * Stamp the material class/attributes and relief-mask variable onto a coin
 * element. Replaces any prior material class so a reused element cannot keep
 * a stale one.
 */
export function applyCoinEffect(el, coin = {}, pageOrigin = undefined) {
  if (!el) return null;
  const { material, finish } = resolveCoinEffect(coin);
  el.dataset.coinMaterial = material;
  el.dataset.coinFinish = finish;
  el.classList.remove(...COIN_MATERIALS.map((m) => `coin-mat-${m}`));
  el.classList.add(`coin-mat-${material}`);

  const mask = coinMaskUrl(coin?.thumb || coin?.url, pageOrigin);
  if (mask) {
    el.dataset.coinRelief = 'true';
    el.style.setProperty('--coin-relief', `url("${mask}")`);
  } else {
    delete el.dataset.coinRelief;
    el.style.removeProperty('--coin-relief');
  }
  return { material, finish };
}

// ── fixed light ───────────────────────────────────────────────────────
// A coin is smaller than a card, so the light sweeps further across it than
// holo's card-tuned gains. The highlight slides AWAY from the side tilted
// toward the viewer, like a real fixed-light reflection.
export const COIN_LIGHT = Object.freeze({
  originX: 36,
  originY: 30,
  gainX: 52,
  gainY: 48,
});

const unitTilt = (value) => (Number.isFinite(value) ? clamp(value, -1, 1) : 0);

export function computeCoinLight({ tiltX = 0, tiltY = 0 } = {}) {
  const tx = unitTilt(tiltX);
  const ty = unitTilt(tiltY);
  return {
    x: clamp(round(COIN_LIGHT.originX - tx * COIN_LIGHT.gainX)),
    y: clamp(round(COIN_LIGHT.originY - ty * COIN_LIGHT.gainY)),
    tiltAmount: clamp(round(Math.hypot(tx, ty) / Math.SQRT2), 0, 1),
  };
}

const applyCoinLight = (el, light) => {
  el.style.setProperty('--coin-light-x', `${light.x}%`);
  el.style.setProperty('--coin-light-y', `${light.y}%`);
  el.style.setProperty('--coin-tilt', light.tiltAmount.toFixed(3));
};

// ── interactive pointer light (picker) ────────────────────────────────
// Event-driven (no rAF): a gallery can hold dozens of cells and each one only
// reacts while the pointer is over it. Returns a teardown function.
export function wireCoinPointerLight(el) {
  if (!el) return () => {};

  const onMove = (event) => {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ty = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    applyCoinLight(el, computeCoinLight({ tiltX: tx, tiltY: ty }));
    el.style.setProperty('--coin-rx', (ty * -7).toFixed(2) + 'deg');
    el.style.setProperty('--coin-ry', (tx * 9).toFixed(2) + 'deg');
  };
  const onLeave = () => {
    applyCoinLight(el, computeCoinLight({ tiltX: 0, tiltY: 0 }));
    el.style.setProperty('--coin-rx', '0deg');
    el.style.setProperty('--coin-ry', '0deg');
  };

  el.addEventListener('pointermove', onMove, { passive: true });
  el.addEventListener('pointerleave', onLeave, { passive: true });
  return () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerleave', onLeave);
  };
}

// ── auto drift (mat token) ────────────────────────────────────────────
// Only the two board tokens run a loop, so an rAF per token is cheap. The
// drift keeps the foil alive with no visible rotation, like holo's board cards.
const activeDrifts = new WeakMap();

export function startCoinDrift(el, { phaseOffset = 0 } = {}) {
  if (!el) return () => {};
  stopCoinDrift(el);

  const offsetMs = phaseOffset * 13000;
  let rafId = null;
  let running = true;

  const tick = (now) => {
    if (!running) return;
    const tilt = driftTilt(now + offsetMs);
    applyCoinLight(
      el,
      computeCoinLight({ tiltX: tilt.tiltX, tiltY: tilt.tiltY })
    );
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const stop = () => {
    running = false;
    if (rafId != null) cancelAnimationFrame(rafId);
    activeDrifts.delete(el);
  };
  activeDrifts.set(el, stop);
  return stop;
}

export function stopCoinDrift(el) {
  const stop = activeDrifts.get(el);
  if (stop) stop();
}
