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
  'Gold Rare': 'rare holo vmax',
  'Secret Rare': 'rare holo vmax',
  'Shiny Rare': 'rare holo vmax',
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
    return 'rare holo vmax';
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

export function startHoloAnimation(card) {
  if (!card) return () => {};
  stopHoloAnimation(card);

  // spring state (position + velocity), svelte spring-ish feel
  const state = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
  let targetX = 0.5;
  let targetY = 0.5;
  let rafId = null;
  let running = true;

  // snappier than svelte's default spring: the preview is large and the
  // light should feel immediately attached to the cursor
  const STIFFNESS = 0.18;
  const DAMPING = 0.42;

  const onPointerMove = (event) => {
    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    targetX = clamp01((event.clientX - rect.left) / rect.width);
    targetY = clamp01((event.clientY - rect.top) / rect.height);
  };

  const onPointerLeave = () => {
    targetX = 0.5;
    targetY = 0.5;
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
    // simey's rotate math: rotate = -(center / 3.5)
    const centerX = px - 0.5;
    const centerY = py - 0.5;
    card.style.setProperty('--rotate-x', (-(centerX / 3.5) * 100 * 0.35).toFixed(2) + 'deg');
    card.style.setProperty('--rotate-y', ((centerY / 3.5) * 100 * 0.35).toFixed(2) + 'deg');
  };

  const tick = () => {
    if (!running) return;
    // spring integration toward the target
    state.vx += (targetX - state.x) * STIFFNESS;
    state.vy += (targetY - state.y) * STIFFNESS;
    state.vx *= DAMPING;
    state.vy *= DAMPING;
    state.x += state.vx;
    state.y += state.vy;
    applyVars();
    rafId = requestAnimationFrame(tick);
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave);
  rafId = requestAnimationFrame(tick);

  const stop = () => {
    running = false;
    if (rafId != null) cancelAnimationFrame(rafId);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerleave', onPointerLeave);
    activeAnimations.delete(card);
  };
  activeAnimations.set(card, stop);
  return stop;
}

export function stopHoloAnimation(card) {
  const stop = activeAnimations.get(card);
  if (stop) stop();
}
