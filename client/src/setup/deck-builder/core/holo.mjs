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

// Build the holo card: simey's DOM with a single <img> + shine/glitter/glare/glare2.
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

  const glare2 = document.createElement('div');
  glare2.className = 'card__glare2';

  rotator.append(img, shine, glitter, glare, glare2);
  translater.appendChild(rotator);
  card.appendChild(translater);

  return card;
}

// ── math helpers (matching simeydotme/pokemon-cards-151 Math.js) ──────
export const round = (value, precision = 3) => parseFloat(value.toFixed(precision));

export const clamp = (value, min = 0, max = 100) =>
  Math.min(Math.max(value, min), max);

export const adjust = (value, fromMin, fromMax, toMin, toMax) =>
  round(toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin));

export const computePointerFromCenter = (glareX, glareY) => {
  const dx = glareX - 50;
  const dy = glareY - 50;
  return clamp(round(Math.sqrt(dx * dx + dy * dy) / 50, 3), 0, 1);
};

// Svelte-style Spring class matching simey's springInteractSettings
export class Spring {
  constructor(initial, { stiffness = 0.066, damping = 0.25, precision = 0.001 } = {}) {
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

// ── mouse-tracked interaction (simey's model) ────────────────────────
// The effect follows the cursor: pointer position over the card drives
// --pointer-x/y, the gradients pan (his adjust() range), and the card
// tilts with his rotate math. Values ease on decoupled svelte springs and
// settle back to center when the mouse leaves the card.
const activeAnimations = new WeakMap();

const SPRING_INTERACT_SETTINGS = { stiffness: 0.066, damping: 0.25 };
const SNAP_SETTINGS = { stiffness: 0.01, damping: 0.06 };
const AUTO_SWEEP_PERIOD_MS = 3200; // one full left→right→left cycle

export function startHoloAnimation(card, { auto = false, phaseOffset = 0 } = {}) {
  if (!card) return () => {};
  stopHoloAnimation(card);

  const springRotate = new Spring({ x: 0, y: 0 }, SPRING_INTERACT_SETTINGS);
  const springGlare = new Spring(
    { x: 50, y: 50, o: auto ? 1 : 0 },
    SPRING_INTERACT_SETTINGS
  );
  const springBackground = new Spring({ x: 50, y: 50 }, SPRING_INTERACT_SETTINGS);

  let rafId = null;
  let running = true;
  let interactEndTimer = null;
  const startTime = auto
    ? performance.now() - phaseOffset * AUTO_SWEEP_PERIOD_MS
    : 0;

  const updateSprings = (background, rotate, glare) => {
    springBackground.stiffness = SPRING_INTERACT_SETTINGS.stiffness;
    springBackground.damping = SPRING_INTERACT_SETTINGS.damping;
    springRotate.stiffness = SPRING_INTERACT_SETTINGS.stiffness;
    springRotate.damping = SPRING_INTERACT_SETTINGS.damping;
    springGlare.stiffness = SPRING_INTERACT_SETTINGS.stiffness;
    springGlare.damping = SPRING_INTERACT_SETTINGS.damping;

    springBackground.set(background);
    springRotate.set(rotate);
    springGlare.set(glare);
  };

  const interact = (event) => {
    if (interactEndTimer) {
      clearTimeout(interactEndTimer);
      interactEndTimer = null;
    }
    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const absolute = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const percent = {
      x: clamp(round((100 / rect.width) * absolute.x)),
      y: clamp(round((100 / rect.height) * absolute.y)),
    };
    const center = {
      x: percent.x - 50,
      y: percent.y - 50,
    };

    updateSprings(
      {
        x: adjust(percent.x, 0, 100, 37, 63),
        y: adjust(percent.y, 0, 100, 33, 67),
      },
      {
        x: round(-(center.x / 3.5)),
        y: round(center.y / 2),
      },
      {
        x: round(percent.x),
        y: round(percent.y),
        o: 1,
      }
    );
  };

  const interactEnd = (delay = 500) => {
    if (interactEndTimer) clearTimeout(interactEndTimer);
    interactEndTimer = setTimeout(() => {
      springRotate.stiffness = SNAP_SETTINGS.stiffness;
      springRotate.damping = SNAP_SETTINGS.damping;
      springRotate.set({ x: 0, y: 0 });

      springGlare.stiffness = SNAP_SETTINGS.stiffness;
      springGlare.damping = SNAP_SETTINGS.damping;
      springGlare.set({ x: 50, y: 50, o: 0 });

      springBackground.stiffness = SNAP_SETTINGS.stiffness;
      springBackground.damping = SNAP_SETTINGS.damping;
      springBackground.set({ x: 50, y: 50 });
      interactEndTimer = null;
    }, delay);
  };

  const applyVars = () => {
    const gx = clamp(springGlare.current.x);
    const gy = clamp(springGlare.current.y);
    const go = Math.max(0, Math.min(1, springGlare.current.o));
    const bx = clamp(springBackground.current.x);
    const by = clamp(springBackground.current.y);
    const rx = round(springRotate.current.x);
    const ry = round(springRotate.current.y);
    const pointerFromCenter = computePointerFromCenter(gx, gy);

    card.style.setProperty('--pointer-x', `${gx.toFixed(2)}%`);
    card.style.setProperty('--pointer-y', `${gy.toFixed(2)}%`);
    card.style.setProperty('--pointer-from-center', pointerFromCenter.toFixed(3));
    card.style.setProperty('--pointer-from-top', (gy / 100).toFixed(3));
    card.style.setProperty('--pointer-from-left', (gx / 100).toFixed(3));
    card.style.setProperty('--card-opacity', go.toFixed(3));
    card.style.setProperty('--rotate-x', `${rx.toFixed(2)}deg`);
    card.style.setProperty('--rotate-y', `${ry.toFixed(2)}deg`);
    card.style.setProperty('--background-x', `${bx.toFixed(2)}%`);
    card.style.setProperty('--background-y', `${by.toFixed(2)}%`);
  };

  const tick = (now) => {
    if (!running) return;
    if (auto) {
      const phase = ((now - startTime) % AUTO_SWEEP_PERIOD_MS) / AUTO_SWEEP_PERIOD_MS;
      const autoPercentX = (0.5 - 0.5 * Math.cos(phase * Math.PI * 2)) * 100;
      const autoPercentY = 50;
      const autoCenterX = autoPercentX - 50;
      const autoCenterY = 0;

      springBackground.set({
        x: adjust(autoPercentX, 0, 100, 37, 63),
        y: adjust(autoPercentY, 0, 100, 33, 67),
      });
      springRotate.set({
        x: round(-(autoCenterX / 3.5)),
        y: round(autoCenterY / 2),
      });
      springGlare.set({
        x: round(autoPercentX),
        y: round(autoPercentY),
        o: 1,
      });
    }

    springRotate.tick();
    springGlare.tick();
    springBackground.tick();
    applyVars();
    rafId = requestAnimationFrame(tick);
  };

  const onPointerEnter = (event) => interact(event);
  const onPointerMove = (event) => interact(event);
  const onPointerLeave = () => interactEnd(500);

  const hitTarget = card;
  const innerImg = card.querySelector('img');
  if (!auto) {
    hitTarget.addEventListener('pointerenter', onPointerEnter, { passive: true });
    hitTarget.addEventListener('pointermove', onPointerMove, { passive: true });
    hitTarget.addEventListener('pointerleave', onPointerLeave, { passive: true });
    if (innerImg && innerImg !== hitTarget) {
      innerImg.addEventListener('pointermove', onPointerMove, { passive: true });
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

