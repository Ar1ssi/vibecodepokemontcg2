// Card motion animations — TCG Live style, inside the playmat iframes.
    // Subtle slide+fade keyed to the ORIGIN zone (deck->hand rises, hand->board
    // drops in), applied to the single moved card image. No board shake; no
    // layout properties touched, so zones never disappear.
    (function playmatAnimations() {
      if (window.__playmatAnimActive) return;
      window.__playmatAnimActive = true;
    
      // origin class by destination
      const ANIM_BY_ZONE = {
        hand: 'tcgl-from-deck',      // drawn cards rise from the deck
        active: 'tcgl-from-hand',    // played cards drop in from the hand
        bench: 'tcgl-from-hand',
        board: 'tcgl-from-hand',
        stadium: 'tcgl-from-hand',
        prizes: 'tcgl-from-hand',
        discard: 'tcgl-to-discard',
        lostZone: 'tcgl-to-discard',
      };
    
      const animate = (img, cls) => {
        if (!img || !cls) return;
        img.classList.remove('tcgl-from-deck', 'tcgl-from-hand', 'tcgl-to-discard');
        // skip if the sim is mid-reposition (inline styles churn during moves)
        void img.offsetWidth;
        img.classList.add('tcgl-anim', cls);
        img.addEventListener('animationend', () => {
          img.classList.remove('tcgl-anim', cls);
        }, { once: true });
      };
    
      const watchZone = (zoneId) => {
        const zone = document.getElementById(zoneId);
        if (!zone) return;
        const cls = ANIM_BY_ZONE[zoneId];
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.nodeType !== 1) continue;
              const img = node.tagName === 'IMG' ? node : node.querySelector?.('img');
              if (img) animate(img, cls);
            }
          }
        });
        observer.observe(zone, { childList: true, subtree: true });
      };
    
      Object.keys(ANIM_BY_ZONE).forEach(watchZone);
    
      // shuffle: gentle single wobble on the always-visible label plate
      const wobble = (el) => {
        if (!el) return;
        el.classList.remove('tcgl-shuffle');
        void el.offsetWidth;
        el.classList.add('tcgl-shuffle');
        el.addEventListener('animationend', () => el.classList.remove('tcgl-shuffle'), { once: true });
      };
      document.addEventListener('click', (e) => {
        const btn = e.target.closest?.('#shuffleDeckButton, #shuffleDiscardButton');
        if (!btn) return;
        wobble(document.getElementById('deckText')?.parentElement || document.getElementById('deck'));
      }, true);
    
      // deck count drop = a card left the deck: tiny label settle
      const deckLabel = document.getElementById('deckText')?.parentElement;
      const count = document.getElementById('deckCount');
      if (deckLabel && count) {
        let last = count.textContent;
        const obs = new MutationObserver(() => {
          if (count.textContent !== last) {
            last = count.textContent;
          }
        });
        obs.observe(count, { childList: true, characterData: true, subtree: true });
      }
    })();
    