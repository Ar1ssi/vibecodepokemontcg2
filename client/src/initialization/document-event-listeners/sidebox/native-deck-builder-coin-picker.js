import {
      filterCoinsByName,
      getCoins,
    } from '../../../setup/deck-builder/core/coins.mjs';
    
    const escapeHtml = (value = '') => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    
    /**
     * Coin picker for the Customize tab. Renders a circular gallery of all
     * Gen IX coins with material-adapted metallic effects (gold/silver get
     * hard specular sweeps; enamel gets a soft sheen). Coins flip on click
     * to show the TM back; double-click (or the Select button in preview)
     * selects the coin for the deck. Mouse tracking drives the specular
     * highlight like the holofoil cards.
     */
    export const initializeDeckBuilderCoinPicker = ({
      panelEl,
      onChange,
    }) => {
      if (!panelEl) return null;
    
      const coins = getCoins();
      let selectedId = null;
      let filterTerm = '';
      let materialFilter = 'all';
    
      panelEl.innerHTML = [
        '<div class="native-deck-builder-section-title-row">',
        '  <div class="native-deck-builder-section-title-wrap">',
        '    <div class="native-deck-builder-section-title">Coin</div>',
        '    <span class="native-deck-builder-set-browser-series-tag">Generation IX · 200</span>',
        '  </div>',
        '  <div class="coin-material-filter">',
        '    <button data-mat="all" class="active">All</button>',
        '    <button data-mat="gold">Gold</button>',
        '    <button data-mat="silver">Silver</button>',
        '    <button data-mat="enamel">Color</button>',
        '  </div>',
        '  <input class="native-deck-builder-coin-filter" type="text"',
        '    placeholder="Filter coins..." aria-label="Filter coins by name" />',
        '</div>',
        '<div class="native-deck-builder-coin-preview"></div>',
        '<div class="native-deck-builder-coin-gallery"></div>',
      ].join('');
    
      const previewEl = panelEl.querySelector('.native-deck-builder-coin-preview');
      const galleryEl = panelEl.querySelector('.native-deck-builder-coin-gallery');
      const filterInput = panelEl.querySelector('.native-deck-builder-coin-filter');
    
      const renderPreview = () => {
        const coin = coins.find((c) => c.id === selectedId) || null;
        if (!coin) {
          previewEl.innerHTML = '<span class="native-deck-builder-coin-preview-none">No coin selected — flips will use the default.</span>';
          return;
        }
        previewEl.innerHTML = [
          `<span class="coin-toss-wrap" data-coin-toss>`,
      `<div class="coin-3d coin-mat-${coin.material}" data-coin-preview>`,
          `  <div class="coin-face coin-front"><img src="${escapeHtml(coin.thumb)}" alt="${escapeHtml(coin.name)}" /></div>`,
          `  <div class="coin-face coin-backc"><img src="/src/assets/coins/coin-back.png" alt="back" /></div>`,
          `</div>`,
          `</span>`,
          `<div class="native-deck-builder-coin-preview-text">`,
          `  <strong>${escapeHtml(coin.name)}</strong>`,
          `  <span>${coin.material === 'enamel' ? 'Colored enamel' : coin.material.charAt(0).toUpperCase() + coin.material.slice(1) + ' finish'} · click coin to toss</span>`,
          `</div>`,
        ].join('');
        wirePreviewCoin();
      };
    
      const wirePreviewCoin = () => {
        const el = panelEl.querySelector('[data-coin-preview]');
        if (!el) return;
        const wrap = el.closest('[data-coin-toss]');
        let tosses = 0;
        el.addEventListener('click', () => {
          tosses += 1;
          el.style.setProperty('--coin-flip', (tosses * 1620) + 'deg');
          if (wrap) {
            wrap.classList.remove('tossing');
            void wrap.offsetWidth; // restart the arc
            wrap.classList.add('tossing');
          }
        });
        wrap?.addEventListener('animationend', () => wrap.classList.remove('tossing'));
        // mouse-tracked specular: reuse the pointer var model
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * 100;
          const py = ((e.clientY - r.top) / r.height) * 100;
          el.style.setProperty('--coin-x', px.toFixed(1) + '%');
          el.style.setProperty('--coin-y', py.toFixed(1) + '%');
          el.style.setProperty('--coin-rx', ((py - 50) * -0.14).toFixed(2) + 'deg');
          el.style.setProperty('--coin-ry', ((px - 50) * 0.16).toFixed(2) + 'deg');
        });
        el.addEventListener('pointerleave', () => {
          el.style.setProperty('--coin-x', '50%');
          el.style.setProperty('--coin-y', '50%');
          el.style.setProperty('--coin-rx', '0deg');
          el.style.setProperty('--coin-ry', '0deg');
        });
      };
    
      const renderGallery = () => {
        let visible = filterCoinsByName(coins, filterTerm);
        if (materialFilter !== 'all') {
          visible = visible.filter((c) => c.material === materialFilter);
        }
        if (visible.length === 0) {
          galleryEl.innerHTML = '<div class="native-deck-builder-coin-empty">No coins match.</div>';
          return;
        }
    
        galleryEl.innerHTML = visible
          .map((coin) => {
            const isSelected = coin.id === selectedId;
            return [
              `<button class="coin-cell${isSelected ? ' selected' : ''}" data-coin-id="${escapeHtml(coin.id)}" title="${escapeHtml(coin.name)}">`,
              `  <span class="coin-3d coin-sm coin-mat-${coin.material}">`,
              `    <span class="coin-face coin-front"><img src="${escapeHtml(coin.thumb)}" alt="${escapeHtml(coin.name)}" loading="lazy" /></span>`,
              `    <span class="coin-face coin-backc"><img src="/src/assets/coins/coin-back.png" alt="" loading="lazy" /></span>`,
              `  </span>`,
              `  <span class="coin-cell-name">${escapeHtml(coin.name)}</span>`,
              `</button>`,
            ].join('');
          })
          .join('');
    
        galleryEl.querySelectorAll('[data-coin-id]').forEach((button) => {
          const id = button.dataset.coinId;
          const coinEl = button.querySelector('.coin-3d');
          // click anywhere on the cell = select; the big preview coin is where
          // you flip to inspect the back
          button.addEventListener('click', () => {
            selectedId = selectedId === id ? null : id;
            renderPreview();
            renderGallery();
            const coin = coins.find((c) => c.id === selectedId) || null;
            onChange?.(coin);
          });
          // hover specular
          coinEl.addEventListener('pointermove', (e) => {
            const r = coinEl.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * 100;
            const py = ((e.clientY - r.top) / r.height) * 100;
            coinEl.style.setProperty('--coin-x', px.toFixed(1) + '%');
            coinEl.style.setProperty('--coin-y', py.toFixed(1) + '%');
          });
          coinEl.addEventListener('pointerleave', () => {
            coinEl.style.setProperty('--coin-x', '50%');
            coinEl.style.setProperty('--coin-y', '50%');
          });
        });
      };
    
      filterInput.addEventListener('input', () => {
        filterTerm = filterInput.value;
        renderGallery();
      });
    
      panelEl.querySelectorAll('.coin-material-filter button').forEach((btn) => {
        btn.addEventListener('click', () => {
          materialFilter = btn.dataset.mat;
          panelEl.querySelectorAll('.coin-material-filter button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderGallery();
        });
      });
    
      renderPreview();
      renderGallery();
    
      return {
        setSelected: (id) => {
          selectedId = id || null;
          renderPreview();
          renderGallery();
        },
        getSelected: () => coins.find((c) => c.id === selectedId) || null,
      };
    };
    