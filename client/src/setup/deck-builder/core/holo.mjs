// Holofoil effect engine — DOM + CSS ported from poke-holo.simey.me, lit by a
// fixed virtual light (TCG Live style) instead of the cursor.
// Card structure (simey's exact DOM):
//   .card > .card__translater > .card__rotator
//     > [ <img>, .card__shine, .card__glitter, .card__glare ]
// `card__translater`/`card__rotator` are load-bearing (perspective + tilt).
// We keep ONE inner <img> for hit-testing / card.image identity.
// The animation drives simey's variables on the .card element. The names are
// kept so the variant CSS keeps working, but --pointer-x/y is the LIGHT's
// highlight position (a function of the card angle), never the cursor:
// --pointer-x/y, --background-x/y, --pointer-from-center/left/top,
// --rotate-x/y, --tilt-amount.

// Rarity (TCGdex) → simey data-rarity value (per the Bulbapedia rarity guide).
// Returns null → no holo (plain <img>).
const RARITY_EFFECTS = {
  'Holo Rare': 'rare holo',
  'Holo rare': 'rare holo',
  'Double rare': 'double rare',
  'Amazing Rare': 'amazing rare',
  'Amazing rare': 'amazing rare',
  'Illustration rare': 'illustration rare',
  'Special Illustration rare': 'special illustration rare',
  'Ultra Rare': 'ultra rare',
  'Hyper Rare': 'hyper rare',
  'Mega Hyper Rare': 'hyper rare',
  'Rainbow Rare': 'rare rainbow alt',
  'Rainbow rare': 'rare rainbow alt',
  // Gold-bordered cards get the same treatment as literal "Hyper Rare" — verified against
  // the reference implementation (pokemon-cards-151, simeydotme's poke-holo): "rare holo vmax"
  // is a DIFFERENT, narrower class that only renders when data-trainer-gallery="true"
  // (rainbow-alt.css), an attribute this app never sets. Mapping gold cards to it left them
  // with zero holo effect — this was the root cause of several rounds of "no pillars"/
  // "grainy"/"horizontal" reports that looked like CSS bugs but were actually a wrong mapping.
  'Gold Rare': 'hyper rare',
  'Secret Rare': 'hyper rare',
  Crown: 'hyper rare',
  // Shiny cards are a silver glitter foil, not gold.
  'Shiny Rare': 'shiny rare',
  'Shiny rare': 'shiny rare',
  'Shiny rare V': 'shiny rare',
  'Shiny rare VMAX': 'shiny rare',
  'Shiny Ultra Rare': 'shiny rare',
  'Radiant Rare': 'radiant rare',
  'Reverse Holo': 'reverse holo',
  LEGEND: 'legend rare',
  'Rare PRIME': 'prime rare',
  'Rare Holo LV.X': 'lvx rare',
  'Rare BREAK': 'break rare',
  'Rare Holo Star': 'gold star',
  'Full Art Trainer': 'ultra rare',
  'ACE SPEC Rare': 'ace spec rare',
  'Classic Collection': 'rare holo',
};

// Rule-box Pokémon (EX, GX, V, VMAX, VSTAR, ex) printed as plain holo rares
// foil the whole card with a light texture rather than only the art window.
const RULE_BOX_NAME = /(?:^|[\s-])(?:ex|gx|v|vmax|vstar)$/i;
// Gold Star cards print a star after the name ("Pikachu ★").
const GOLD_STAR_NAME = /\u2605/;

// Energy cards have no art window, so reverse-holo energy gets its own value.
// It still ends in "reverse holo", so the shared [data-rarity$="reverse holo"]
// rules apply and reverse-holo.css only overrides the clip and strength.
const isEnergyCard = (card) => {
  const kinds = [
    card.supertype,
    card.category,
    card.type,
    card?.data?.supertype,
    card?.data?.category,
  ];
  if (kinds.some((kind) => /energy/i.test(String(kind || '')))) return true;
  return /\benergy$/i.test(String(card.name || card?.data?.name || '').trim());
};

export function resolveHoloEffect(card = {}) {
  const effect = resolveRarityEffect(card);
  if (effect === 'reverse holo' && isEnergyCard(card))
    return 'energy reverse holo';
  const name = String(card.name || card?.data?.name || '').trim();
  if (effect === 'rare holo' && GOLD_STAR_NAME.test(name)) return 'gold star';
  // VMAX foil is rainbow glitter over the whole card, not the V texture.
  if (effect === 'rare holo' && /(?:^|\s)vmax$/i.test(name)) return 'vmax rare';
  if (effect === 'rare holo' && RULE_BOX_NAME.test(name)) return 'double rare';
  return effect;
}

function resolveRarityEffect(card) {
  const rarity = String(card.rarity || card?.data?.rarity || '').trim();
  if (!rarity) return null;
  if (RARITY_EFFECTS[rarity]) return RARITY_EFFECTS[rarity];
  const lower = rarity.toLowerCase();
  // Order matters: check the most specific substrings first.
  if (lower.includes('reverse holo')) return 'reverse holo';
  if (lower.includes('shiny') || lower.includes('shining'))
    return 'shiny rare';
  if (lower.includes('ace spec')) return 'ace spec rare';
  if (lower.includes('amazing')) return 'amazing rare';
  if (lower.includes('break')) return 'break rare';
  if (lower.includes('legend')) return 'legend rare';
  if (lower.includes('prime')) return 'prime rare';
  if (lower.includes('lv.x')) return 'lvx rare';
  if (lower.includes('holo star')) return 'gold star';
  if (lower.includes('rare ultra')) return 'ultra rare';
  if (lower.includes('radiant rare')) return 'radiant rare';
  if (lower.includes('special illustration rare'))
    return 'special illustration rare';
  if (lower.includes('illustration rare')) return 'illustration rare';
  if (lower.includes('double rare')) return 'double rare';
  if (lower.includes('ultra rare')) return 'ultra rare';
  if (lower.includes('hyper rare')) return 'hyper rare';
  if (lower.includes('rainbow')) return 'rare rainbow alt';
  if (lower.includes('holo')) return 'rare holo';
  if (lower.includes('gold') || lower.includes('secret')) {
    return 'hyper rare';
  }
  return null;
}

// ── ink mask ─────────────────────────────────────────────────────────
// The card image doubles as a luminance mask for the foil layers, so dark ink
// (text, HP, attack costs) stays black and foil only lives on bright areas.
// A CSS mask image that fails to load (e.g. blocked by CORS) renders as
// transparent black and hides the whole layer, so only hosts verified to send
// CORS headers (checked 2026-09-15) get the mask.
const INK_MASK_CORS_HOSTS = new Set([
  'assets.tcgdex.net',
  'images.pokemontcg.io',
  'limitlesstcg.nyc3.digitaloceanspaces.com',
  'limitlesstcg.nyc3.cdn.digitaloceanspaces.com',
  'ptcgsim.online',
]);

// Characters that could break out of a CSS `url("...")` token.
const isUnsafeInCssUrl = (src) =>
  [...src].some((ch) => {
    const code = ch.charCodeAt(0);
    return (
      ch === '"' || ch === '\\' || /\s/.test(ch) || code < 0x20 || code === 0x7f
    );
  });

export function foilMaskUrl(src, pageOrigin = globalThis.location?.origin) {
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
  if (pageOrigin && url.origin === pageOrigin) return url.href;
  return INK_MASK_CORS_HOSTS.has(url.hostname) ? url.href : null;
}

// ── card era ─────────────────────────────────────────────────────────
// The art window sits at a different place per card layout generation, and
// reverse holo keeps foil out of it. The era comes from the image URL's
// series/set segment (tcgdex: /<lang>/<series>/<set>/..., pokemontcg.io:
// /<set>/...). Unknown hosts or sets return null and use the default window.
// Keyed by the code's leading letters ("swsh12pt5" -> "swsh", "base1" -> "base").
const ERA_BY_SERIES = {
  sv: 'sv',
  svp: 'sv',
  sve: 'sv',
  me: 'sv',
  mep: 'sv',
  swsh: 'swsh',
  swshp: 'swsh',
  sm: 'sm',
  smp: 'sm',
  sma: 'sm',
  xy: 'xy',
  xyp: 'xy',
  bw: 'xy',
  bwp: 'xy',
  base: 'classic',
  gym: 'classic',
  neo: 'classic',
  lc: 'classic',
  ecard: 'classic',
  ex: 'classic',
  pop: 'classic',
  dp: 'classic',
  dpp: 'classic',
  pl: 'classic',
  hgss: 'classic',
  hsp: 'classic',
  col: 'classic',
};

const eraFromCode = (code) => {
  const series = /^[a-z]+/.exec(String(code || '').toLowerCase())?.[0];
  return series && Object.hasOwn(ERA_BY_SERIES, series)
    ? ERA_BY_SERIES[series]
    : null;
};

// Splits a known card image URL into its series, set and card number.
// Returns null for other hosts or unparseable input.
const cardImageParts = (src) => {
  if (typeof src !== 'string' || !src) return null;
  let url;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'assets.tcgdex.net')
    return { series: parts[1], set: parts[2], number: parts[3] };
  if (url.hostname === 'images.pokemontcg.io')
    return { series: parts[0], set: parts[0], number: parts[1] };
  return null;
};

export function cardEraFromImageUrl(src) {
  return eraFromCode(cardImageParts(src)?.series);
}

// The leading letters of the series code ("hgss", "dp", "base"), for foil
// patterns that changed within one layout era. Null when the series is unknown.
export function cardSeriesFromImageUrl(src) {
  const series = /^[a-z]+/.exec(
    String(cardImageParts(src)?.series || '').toLowerCase()
  )?.[0];
  return series && Object.hasOwn(ERA_BY_SERIES, series) ? series : null;
}

// The lowercase set code ("base1", "ex5"), for foil patterns used by only one
// set. Null for other hosts or a set code with unexpected characters.
export function cardSetFromImageUrl(src) {
  const set = String(cardImageParts(src)?.set || '').toLowerCase();
  return /^[a-z0-9.]+$/.test(set) ? set : null;
}

// Trainer Gallery and Galarian Gallery cards: their own subset ("swsh9tg") or
// a TG/GG card number. TCGdex has no rarity for them, so the URL is the only signal.
export function isTrainerGalleryImageUrl(src) {
  const parts = cardImageParts(src);
  if (!parts) return false;
  return (
    /(?:tg|gg)$/i.test(String(parts.set || '')) ||
    /^(?:tg|gg)\d/i.test(String(parts.number || ''))
  );
}

// Build the holo card: simey's DOM with a single <img> + shine/glitter/glare/glare2.
export function buildHoloCard(imageUrl, rarityValue) {
  const card = document.createElement('div');
  card.className = 'card';
  if (rarityValue) card.dataset.rarity = rarityValue;

  const inkMask = foilMaskUrl(imageUrl);
  if (inkMask) {
    card.dataset.inkMask = 'true';
    card.style.setProperty('--card-ink-mask', `url("${inkMask}")`);
  }
  const era = cardEraFromImageUrl(imageUrl);
  if (era) card.dataset.cardEra = era;
  const series = cardSeriesFromImageUrl(imageUrl);
  if (series) card.dataset.cardSeries = series;
  const set = cardSetFromImageUrl(imageUrl);
  if (set) card.dataset.cardSet = set;
  if (isTrainerGalleryImageUrl(imageUrl)) card.dataset.trainerGallery = 'true';

  const translater = document.createElement('div');
  translater.className = 'card__translater';

  const rotator = document.createElement('div');
  rotator.className = 'card__rotator';

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = '';

  const shine = document.createElement('div');
  shine.className = 'card__shine';

  const glitter = document.createElement('div');
  glitter.className = 'card__glitter';

  const glare = document.createElement('div');
  glare.className = 'card__glare';

  const glare2 = document.createElement('div');
  glare2.className = 'card__glare2';

  rotator.append(img, shine, glitter, glare, glare2);
  translater.appendChild(rotator);
  card.appendChild(translater);

  return card;
}

// ── math helpers (matching simeydotme/pokemon-cards-151 Math.js) ──────
export const round = (value, precision = 3) =>
  parseFloat(value.toFixed(precision));

export const clamp = (value, min = 0, max = 100) =>
  Math.min(Math.max(value, min), max);

export const computePointerFromCenter = (glareX, glareY) => {
  const dx = glareX - 50;
  const dy = glareY - 50;
  return clamp(round(Math.sqrt(dx * dx + dy * dy) / 50, 3), 0, 1);
};

// Svelte-style Spring class matching simey's springInteractSettings
export class Spring {
  constructor(
    initial,
    { stiffness = 0.066, damping = 0.25, precision = 0.001 } = {}
  ) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.precision = precision;
    this.current = { ...initial };
    this.target = { ...initial };
    this.velocity = {};
    for (const key of Object.keys(initial)) {
      this.velocity[key] = 0;
    }
  }

  set(target, { hard = false } = {}) {
    this.target = { ...target };
    if (hard) {
      this.current = { ...target };
      for (const key of Object.keys(this.velocity)) {
        this.velocity[key] = 0;
      }
    }
  }

  tick() {
    let settled = true;
    for (const key of Object.keys(this.target)) {
      const delta = this.target[key] - this.current[key];
      const springForce = this.stiffness * delta;
      const dampingForce = this.damping * this.velocity[key];
      const acceleration = springForce - dampingForce;
      this.velocity[key] += acceleration;
      this.current[key] += this.velocity[key];

      if (
        Math.abs(delta) > this.precision ||
        Math.abs(this.velocity[key]) > this.precision
      ) {
        settled = false;
      } else {
        this.current[key] = this.target[key];
        this.velocity[key] = 0;
      }
    }
    return settled;
  }
}

// ── lighting: fixed virtual light ─────────────────────────────────────
// The light sits above-left of the card. The highlight position and foil pan
// are functions of the card's angle only, expressed as a tilt normalized to
// [-1, 1] per axis (1 = simey's maximum rotation).
export const MAX_ROTATE_X = 50 / 3.5;
export const MAX_ROTATE_Y = 25;

export const LIGHT = Object.freeze({
  originX: 38,
  originY: 28,
  gainX: 30,
  gainY: 30,
  panX: 20,
  panY: 24,
});

// Board/hand cards never tilt visibly, so a slow two-axis drift of the virtual
// angle keeps the foil alive. Unequal periods avoid a repeating straight line.
export const DRIFT = Object.freeze({
  amplitude: 0.8,
  periodXMs: 9000,
  periodYMs: 13000,
});

const unitTilt = (value) => (Number.isFinite(value) ? clamp(value, -1, 1) : 0);

const tiltAmountOf = (tiltX, tiltY) =>
  clamp(round(Math.hypot(unitTilt(tiltX), unitTilt(tiltY)) / Math.SQRT2), 0, 1);

export function computeLightVars({ tiltX = 0, tiltY = 0 } = {}) {
  const tx = unitTilt(tiltX);
  const ty = unitTilt(tiltY);
  // A fixed light's reflection slides AWAY from the side tilted toward the
  // viewer. In previews the cursor sets the tilt, so this also keeps the
  // highlight from chasing the cursor.
  const pointerX = clamp(round(LIGHT.originX + tx * LIGHT.gainX));
  const pointerY = clamp(round(LIGHT.originY - ty * LIGHT.gainY));
  return {
    pointerX,
    pointerY,
    backgroundX: round(50 - tx * LIGHT.panX),
    backgroundY: round(50 + ty * LIGHT.panY),
    fromCenter: computePointerFromCenter(pointerX, pointerY),
    fromLeft: round(pointerX / 100),
    fromTop: round(pointerY / 100),
    tiltAmount: tiltAmountOf(tx, ty),
  };
}

export function driftTilt(nowMs, amplitude = DRIFT.amplitude) {
  const t = Number.isFinite(nowMs) ? nowMs : 0;
  return {
    tiltX: amplitude * Math.sin((2 * Math.PI * t) / DRIFT.periodXMs),
    tiltY: amplitude * Math.sin((2 * Math.PI * t) / DRIFT.periodYMs + 1.3),
  };
}

// ── animation loop ───────────────────────────────────────────────────
// Interactive (previews, picker): the cursor tilts the card on simey's rotate
// spring; the light then follows the card's rotation, and the idle drift below
// keeps the foil moving whenever the cursor is not holding it. Auto (board,
// hand): the virtual angle drifts; the card only rotates visibly when `tilt` is
// set.
const activeAnimations = new WeakMap();

const SPRING_INTERACT_SETTINGS = { stiffness: 0.066, damping: 0.25 };
const SNAP_SETTINGS = { stiffness: 0.01, damping: 0.06 };

export function startHoloAnimation(
  card,
  { auto = false, phaseOffset = 0, tilt = !auto } = {}
) {
  if (!card) return () => {};
  stopHoloAnimation(card);

  const springRotate = new Spring({ x: 0, y: 0 }, SPRING_INTERACT_SETTINGS);
  // The OS "reduce motion" preference deliberately does NOT still the foil:
  // zeroing the amplitude left every card frozen on the neutral pose, which
  // reads as a broken effect rather than a calmer one (user decision, D54).
  const driftAmplitude = DRIFT.amplitude;
  const driftOffsetMs = phaseOffset * DRIFT.periodXMs;

  let rafId = null;
  let running = true;
  let interactEndTimer = null;
  // Interactive only: true while the cursor is holding the card (and therefore
  // the light). The idle drift is suspended for exactly that window.
  let hovering = false;

  const setRotateTarget = (target, settings) => {
    springRotate.stiffness = settings.stiffness;
    springRotate.damping = settings.damping;
    springRotate.set(target);
  };

  const interact = (event) => {
    if (interactEndTimer) {
      clearTimeout(interactEndTimer);
      interactEndTimer = null;
    }
    if (!tilt) return;
    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    hovering = true;
    const percentX = clamp(
      round((100 / rect.width) * (event.clientX - rect.left))
    );
    const percentY = clamp(
      round((100 / rect.height) * (event.clientY - rect.top))
    );
    const centerX = percentX - 50;
    const centerY = percentY - 50;
    setRotateTarget(
      { x: round(-(centerX / 3.5)), y: round(centerY / 2) },
      SPRING_INTERACT_SETTINGS
    );
  };

  const interactEnd = (delay = 500) => {
    if (interactEndTimer) clearTimeout(interactEndTimer);
    interactEndTimer = setTimeout(() => {
      setRotateTarget({ x: 0, y: 0 }, SNAP_SETTINGS);
      interactEndTimer = null;
    }, delay);
  };

  const applyVars = (light, rotateX, rotateY, tiltAmount) => {
    const set = (name, value) => card.style.setProperty(name, value);
    set('--pointer-x', `${light.pointerX.toFixed(2)}%`);
    set('--pointer-y', `${light.pointerY.toFixed(2)}%`);
    set('--pointer-from-center', light.fromCenter.toFixed(3));
    set('--pointer-from-left', light.fromLeft.toFixed(3));
    set('--pointer-from-top', light.fromTop.toFixed(3));
    set('--background-x', `${light.backgroundX.toFixed(2)}%`);
    set('--background-y', `${light.backgroundY.toFixed(2)}%`);
    set('--rotate-x', `${round(rotateX).toFixed(2)}deg`);
    set('--rotate-y', `${round(rotateY).toFixed(2)}deg`);
    set('--tilt-amount', tiltAmount.toFixed(3));
  };

  const tick = (now) => {
    if (!running) return;
    let lightTilt = null;
    if (auto) {
      lightTilt = driftTilt(now + driftOffsetMs, driftAmplitude);
      const visibleRotate = tilt
        ? {
            x: lightTilt.tiltX * MAX_ROTATE_X,
            y: lightTilt.tiltY * MAX_ROTATE_Y,
          }
        : { x: 0, y: 0 };
      springRotate.set(visibleRotate);
    }
    springRotate.tick();
    const rotateTilt = {
      tiltX: springRotate.current.x / MAX_ROTATE_X,
      tiltY: springRotate.current.y / MAX_ROTATE_Y,
    };
    // A card the cursor is not holding drifts the light on its own. Interactive
    // mode otherwise derives the light from the rotate spring alone, and a card
    // the cursor never moves over (a preview, a picker slide) holds the neutral
    // pose forever — the foil looks paused on its first frame.
    const flat = springRotate.current.x === 0 && springRotate.current.y === 0;
    if (!auto && !hovering && flat) {
      lightTilt = driftTilt(now + driftOffsetMs, driftAmplitude);
    }
    applyVars(
      computeLightVars(lightTilt ?? rotateTilt),
      springRotate.current.x,
      springRotate.current.y,
      tiltAmountOf(rotateTilt.tiltX, rotateTilt.tiltY)
    );
    rafId = requestAnimationFrame(tick);
  };

  const onPointerEnter = (event) => interact(event);
  const onPointerMove = (event) => interact(event);
  const onPointerLeave = () => {
    hovering = false;
    interactEnd(500);
  };

  const hitTarget = card;
  const innerImg = card.querySelector('img');
  if (!auto) {
    hitTarget.addEventListener('pointerenter', onPointerEnter, {
      passive: true,
    });
    hitTarget.addEventListener('pointermove', onPointerMove, { passive: true });
    hitTarget.addEventListener('pointerleave', onPointerLeave, {
      passive: true,
    });
    if (innerImg && innerImg !== hitTarget) {
      innerImg.addEventListener('pointermove', onPointerMove, {
        passive: true,
      });
    }
  }
  rafId = requestAnimationFrame(tick);

  const stop = () => {
    running = false;
    if (rafId != null) cancelAnimationFrame(rafId);
    if (interactEndTimer) clearTimeout(interactEndTimer);
    if (!auto) {
      hitTarget.removeEventListener('pointerenter', onPointerEnter);
      hitTarget.removeEventListener('pointermove', onPointerMove);
      hitTarget.removeEventListener('pointerleave', onPointerLeave);
      if (innerImg && innerImg !== hitTarget) {
        innerImg.removeEventListener('pointermove', onPointerMove);
      }
    }
    activeAnimations.delete(card);
  };
  activeAnimations.set(card, stop);
  return stop;
}

export function stopHoloAnimation(card) {
  const stop = activeAnimations.get(card);
  if (stop) stop();
}
