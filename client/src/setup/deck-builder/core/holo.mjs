// Holofoil effect engine — faithful port of poke-holo.simey.me.
// Card structure (simey's exact DOM):
//   .card > .card__translater > .card__rotator
//     > [ <img>, .card__shine, .card__glitter, .card__glare ]
// `card__translater`/`card__rotator` are load-bearing (perspective + tilt).
// We keep ONE inner <img> for hit-testing / card.image identity.
// The animation drives simey's variables on the .card element:
// --pointer-x/y, --background-x/y, --pointer-from-center/left/top,
// --rotate-x/y.

// Rarity (TCGdex) → simey data-rarity value (per the Bulbapedia rarity guide).
// Returns null → no holo (plain <img>).
const RARITY_EFFECTS = {
  'Holo Rare': 'rare holo',
  'Holo rare': 'rare holo',
  'Double rare': 'double rare',
  'Amazing Rare': 'special illustration rare',
  'Amazing rare': 'special illustration rare',
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
  'Shiny Rare': 'hyper rare',
  'Radiant Rare': 'radiant rare',
  'Reverse Holo': 'reverse holo',
};

export function resolveHoloEffect(card = {}) {
  const rarity = String(card.rarity || card?.data?.rarity || '').trim();
  if (!rarity) return null;
  if (RARITY_EFFECTS[rarity]) return RARITY_EFFECTS[rarity];
  const lower = rarity.toLowerCase();
  // Order matters: check the most specific substrings first.
  if (lower.includes('reverse holo')) return 'reverse holo';
  if (lower.includes('radiant rare')) return 'radiant rare';
  if (lower.includes('special illustration rare')) return 'special illustration rare';
  if (lower.includes('illustration rare')) return 'illustration rare';
  if (lower.includes('double rare')) return 'double rare';
  if (lower.includes('ultra rare')) return 'ultra rare';
  if (lower.includes('hyper rare')) return 'hyper rare';
  if (lower.includes('rainbow')) return 'rare rainbow alt';
  if (lower.includes('holo')) return 'rare holo';
  if (lower.includes('gold') || lower.includes('secret') || lower.includes('shiny')) {
    return 'hyper rare';
  }
  return null;
}

// Build the holo card: simey's DOM with a single <img> + shine/glitter/glare.
export function buildHoloCard(imageUrl, rarityValue) {
  const card = document.createElement('div');
  card.className = 'card';
  if (rarityValue) card.dataset.rarity = rarityValue;

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

  rotator.append(img, shine, glitter, glare);
  translater.appendChild(rotator);
  card.appendChild(translater);

  return card;
}

// ── mouse-tracked interaction (simey's model) ────────────────────────
// The effect follows the cursor: pointer position over the card drives
// --pointer-x/y, the gradients pan (his adjust() range), and the card
// tilts with his rotate math. Values ease on svelte-style springs and
// settle back to center when the mouse leaves the card.
const activeAnimations = new WeakMap();

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// simey's adjust(): map 0..1 into a narrower sub-range (37%..63%)
const adjustRange = (v, lo, hi) => lo + v * (hi - lo);

// Auto-sweep: emulates a pointer being dragged left-to-right (and back)
// across the card, on a continuous loop. Used for cards sitting in the
// hand / on the mat, where there's no real cursor to track (or where a
// native HTML5 drag suppresses pointermove and the effect would otherwise
// just freeze in place).
const AUTO_SWEEP_PERIOD_MS = 3200; // one full left→right→left cycle

export function startHoloAnimation(card, { auto = false, phaseOffset = 0 } = {}) {
  if (!card) return () => {};
  stopHoloAnimation(card);

  // spring state (position + velocity), svelte spring-ish feel
  const state = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
  let targetX = 0.5;
  let targetY = 0.5;
  // simey's springGlare.o: the whole shine/glare/glitter stack is invisible (0) until the
  // pointer is actually over THIS card, fading to fully visible (1) while hovering, back to 0
  // on pointer-leave. Without this every card showed its glare "spotlight" sitting there at
  // rest — base.css's --card-opacity:1 fallback (needed so the calc()s in every rarity file
  // don't go invalid, see base.css) is a global default; this per-instance value overrides it
  // whenever real pointer tracking is active. Auto-sweep mode (no live cursor to hover with)
  // intentionally stays at 1 — that's the ambient shimmer for hand/mat cards, unchanged.
  let opacityState = auto ? 1 : 0;
  let targetOpacity = auto ? 1 : 0;
  let rafId = null;
  let running = true;
  const startTime = auto
    ? performance.now() - phaseOffset * AUTO_SWEEP_PERIOD_MS
    : 0;

  // snappier than svelte's default spring: the preview is large and the
  // light should feel immediately attached to the cursor
  const STIFFNESS = 0.18;
  const DAMPING = 0.42;

  // simey binds this straight to the card element (`on:mousemove={interact}`), so it only
  // ever fires while the pointer is actually over the card — no manual bounds-checking.
  const onPointerMove = (event) => {
    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    targetOpacity = 1;
    targetX = clamp01((event.clientX - rect.left) / rect.width);
    targetY = clamp01((event.clientY - rect.top) / rect.height);
  };

  const onPointerEnter = onPointerMove;

  const onPointerLeave = () => {
    targetX = 0.5;
    targetY = 0.5;
    targetOpacity = 0;
  };

  const applyVars = () => {
    const px = state.x;
    const py = state.y;
    card.style.setProperty('--pointer-x', (px * 100).toFixed(2) + '%');
    card.style.setProperty('--pointer-y', (py * 100).toFixed(2) + '%');
    // gradients pan in simey's narrowed ranges (adjust 0..100 -> 37..63)
    card.style.setProperty('--background-x', (adjustRange(px, 0.37, 0.63) * 100).toFixed(2) + '%');
    card.style.setProperty('--background-y', (adjustRange(py, 0.33, 0.67) * 100).toFixed(2) + '%');
    card.style.setProperty('--pointer-from-center', (1 - Math.abs(px - 0.5) * 2).toFixed(3));
    card.style.setProperty('--pointer-from-left', px.toFixed(3));
    card.style.setProperty('--pointer-from-top', py.toFixed(3));
    // simey's rotate math, exact divisors from Card.svelte's interact():
    // rotate.x = -(center.x / 3.5), rotate.y = center.y / 2 — center is in
    // percent units (-50..50), not the 0..1 fraction we track state in.
    const centerXPercent = (px - 0.5) * 100;
    const centerYPercent = (py - 0.5) * 100;
    card.style.setProperty('--rotate-x', (-(centerXPercent / 3.5)).toFixed(2) + 'deg');
    card.style.setProperty('--rotate-y', (centerYPercent / 2).toFixed(2) + 'deg');
    card.style.setProperty('--card-opacity', opacityState.toFixed(3));
  };

  const tick = (now) => {
    if (!running) return;
    if (auto) {
      // sweep target left→right→left; a light ease-in/out via sine so it
      // reads as a hand-driven pass rather than a mechanical bounce
      const phase = ((now - startTime) % AUTO_SWEEP_PERIOD_MS) / AUTO_SWEEP_PERIOD_MS;
      targetX = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
      targetY = 0.5;
    }
    // spring integration toward the target
    state.vx += (targetX - state.x) * STIFFNESS;
    state.vy += (targetY - state.y) * STIFFNESS;
    state.vx *= DAMPING;
    state.vy *= DAMPING;
    state.x += state.vx;
    state.y += state.vy;
    opacityState += (targetOpacity - opacityState) * STIFFNESS;
    applyVars();
    rafId = requestAnimationFrame(tick);
  };

  // `.mat-holo` (used by mat cards AND floating previews alike) sets pointer-events:none on
  // the wrapper/rotator/shine/glitter/glare, leaving only the inner <img> as the real hit
  // target (base.css). pointerenter/pointerleave don't bubble, so listening on `card` itself
  // would silently never fire in that case — bind to the <img> instead, which is always the
  // actual hit-testable element whether or not `.mat-holo` is present.
  const hitTarget = card.querySelector('img') || card;
  if (!auto) {
    hitTarget.addEventListener('pointerenter', onPointerEnter, { passive: true });
    hitTarget.addEventListener('pointermove', onPointerMove, { passive: true });
    hitTarget.addEventListener('pointerleave', onPointerLeave, { passive: true });
  }
  rafId = requestAnimationFrame(tick);

  const stop = () => {
    running = false;
    if (rafId != null) cancelAnimationFrame(rafId);
    if (!auto) {
      hitTarget.removeEventListener('pointerenter', onPointerEnter);
      hitTarget.removeEventListener('pointermove', onPointerMove);
      hitTarget.removeEventListener('pointerleave', onPointerLeave);
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
