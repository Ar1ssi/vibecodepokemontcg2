// Holofoil effect engine — faithful port of poke-holo.simey.me.
    // Stage structure: [img] + .holo-shine (with :before/:after pseudo-layers)
    // + .holo-glare. The animation drives simey's variables:
    // --pointer-x/y, --background-x/y, --pointer-from-center/left/top.
    
    // Rarity (TCGdex) → holo effect, per the Bulbapedia rarity guide.
    const RARITY_EFFECTS = {
      'Holo Rare': 'holo',
      'Holo rare': 'holo',
      'Double rare': 'sheen',
      'Amazing Rare': 'galaxy',
      'Amazing rare': 'galaxy',
      'Illustration rare': 'galaxy',
      'Special Illustration rare': 'galaxy',
      'Ultra Rare': 'sparkle',
      'Hyper Rare': 'sparkle',
      'Mega Hyper Rare': 'gold',
      'Rainbow Rare': 'sparkle',
      'Rainbow rare': 'sparkle',
      'Gold Rare': 'gold',
      'Secret Rare': 'gold',
      'Shiny Rare': 'sparkle',
    };
    
    export function resolveHoloEffect(card = {}) {
      const rarity = String(card.rarity || card?.data?.rarity || '').trim();
      if (!rarity) return null;
      if (RARITY_EFFECTS[rarity]) return RARITY_EFFECTS[rarity];
      const lower = rarity.toLowerCase();
      if (lower.includes('hyper rare') && lower.includes('mega')) return 'gold';
      if (lower.includes('hyper rare')) return 'sparkle';
      if (lower.includes('illustration rare')) return 'galaxy';
      if (lower.includes('double rare')) return 'sheen';
      if (lower.includes('holo')) return 'holo';
      if (lower.includes('gold') || lower.includes('secret')) return 'gold';
      if (lower.includes('rainbow')) return 'sparkle';
      if (lower.includes('radiant')) return 'galaxy';
      return null;
    }
    
    // Build the holo stage: image + shine (with pseudo-layers) + glare.
    export function buildHoloStage(imageUrl, effect) {
      const stage = document.createElement('div');
      stage.className = 'holo-stage';
      stage.dataset.holo = effect;
    
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = '';
      stage.appendChild(img);
    
      const shine = document.createElement('div');
      shine.className = 'holo-shine';
      stage.appendChild(shine);
    
      const glare = document.createElement('div');
      glare.className = 'holo-glare';
      stage.appendChild(glare);
    
      return stage;
    }
    
    // ── mouse-tracked interaction (simey's model) ────────────────────────
    // The effect follows the cursor: pointer position over the card drives
    // --pointer-x/y, the gradients pan (his adjust() range), and the card
    // tilts with his rotate math. Values ease on svelte-style springs and
    // settle back to center when the mouse leaves the window.
    const activeAnimations = new WeakMap();
    
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    // simey's adjust(): map 0..1 into a narrower sub-range (37%..63%)
    const adjustRange = (v, lo, hi) => lo + v * (hi - lo);
    
    export function startHoloAnimation(stage) {
      if (!stage) return () => {};
      stopHoloAnimation(stage);
    
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
        const rect = stage.getBoundingClientRect();
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
        stage.style.setProperty('--pointer-x', (px * 100).toFixed(2) + '%');
        stage.style.setProperty('--pointer-y', (py * 100).toFixed(2) + '%');
        // gradients pan in simey's narrowed ranges (adjust 0..100 -> 37..63)
        stage.style.setProperty('--background-x', (adjustRange(px, 0.37, 0.63) * 100).toFixed(2) + '%');
        stage.style.setProperty('--background-y', (adjustRange(py, 0.33, 0.67) * 100).toFixed(2) + '%');
        stage.style.setProperty('--pointer-from-center', (1 - Math.abs(px - 0.5) * 2).toFixed(3));
        stage.style.setProperty('--pointer-from-left', px.toFixed(3));
        stage.style.setProperty('--pointer-from-top', py.toFixed(3));
        // simey's rotate math: rotate = -(center / 3.5)
        const centerX = px - 0.5;
        const centerY = py - 0.5;
        stage.style.setProperty('--rotate-x', (-(centerX / 3.5) * 100 * 0.35).toFixed(2) + 'deg');
        stage.style.setProperty('--rotate-y', ((centerY / 3.5) * 100 * 0.35).toFixed(2) + 'deg');
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
        activeAnimations.delete(stage);
      };
      activeAnimations.set(stage, stop);
      return stop;
    }
    
    export function stopHoloAnimation(stage) {
      const stop = activeAnimations.get(stage);
      if (stop) stop();
    }
    