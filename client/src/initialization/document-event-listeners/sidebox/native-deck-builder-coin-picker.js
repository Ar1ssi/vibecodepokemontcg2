    import {
      filterCoins,
      getCoins,
      getCoinStats,
      groupCoinsByRelease,
      isPlaceholderCoin,
    } from '../../../setup/deck-builder/core/coins.mjs';
    import {
      applyCoinEffect,
      coinEffectLayerMarkup,
      wireCoinPointerLight,
    } from '../../../setup/deck-builder/core/coin-effects.mjs';
    
    const escapeHtml = (value = '') => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    
    /**
     * Coin picker for the Customize tab. Renders a circular gallery of the
     * whole catalog (Gens I-IX) with material-adapted effects under a fixed
     * virtual light (gold/silver/metal = specular metal, enamel = satin
     * paint, cardboard = matte; holofoil/mirror descriptions add a foil
     * layer). Filterable by name, material, region, and image availability.
     * Coins flip on click to show the back; clicking a cell selects it.
     */
    export const initializeDeckBuilderCoinPicker = ({
      panelEl,
      onChange,
    }) => {
      if (!panelEl) return null;
    
      const coins = getCoins();
      const stats = getCoinStats(coins);
      const releaseVariantCounts = new Map(
        groupCoinsByRelease(coins).map((group) => [group.release, group.count])
      );
      let selectedId = null;
      let filterTerm = '';
      let materialFilter = 'all';
      let regionFilter = 'all';
      let hasImageOnly = false;

      const MATERIAL_LABELS = {
        all: 'All',
        gold: 'Gold',
        silver: 'Silver',
        metal: 'Metal',
        enamel: 'Color',
        cardboard: 'Cardboard',
      };
      const materialButtons = ['all', 'gold', 'silver', 'metal', 'enamel', 'cardboard']
        .map((mat) => {
          const count = mat === 'all' ? stats.total : (stats.byMaterial[mat] ?? 0);
          const active = mat === 'all' ? ' class="active"' : '';
          return `    <button data-mat="${mat}"${active}>${MATERIAL_LABELS[mat]} (${count})</button>`;
        })
        .join('');

      const regions = Object.keys(stats.byRegion)
        .filter((region) => region !== 'unknown')
        .sort((a, b) => a.localeCompare(b));
      const regionOptions = [
        '    <option value="all">All regions</option>',
        ...regions.map(
          (region) =>
            `    <option value="${escapeHtml(region)}">${escapeHtml(region)} (${stats.byRegion[region]})</option>`
        ),
      ].join('');

      panelEl.innerHTML = [
        '<div class="native-deck-builder-section-title-row">',
        '  <div class="native-deck-builder-section-title-wrap">',
        '    <div class="native-deck-builder-section-title">Coin</div>',
        `    <span class="native-deck-builder-set-browser-series-tag">All generations · ${stats.total}</span>`,
        '  </div>',
        '  <div class="coin-material-filter">',
        materialButtons,
        '  </div>',
        '  <input class="native-deck-builder-coin-filter" type="text"',
        '    placeholder="Filter coins..." aria-label="Filter coins by name" />',
        '  <select class="coin-region-filter" aria-label="Filter coins by region">',
        regionOptions,
        '  </select>',
        '  <label class="coin-image-toggle"><input type="checkbox" class="coin-image-only" /> Only with images</label>',
        '</div>',
        '<div class="native-deck-builder-coin-preview"></div>',
        '<div class="native-deck-builder-coin-gallery"></div>',
      ].join('');
    
      const previewEl = panelEl.querySelector('.native-deck-builder-coin-preview');
      const galleryEl = panelEl.querySelector('.native-deck-builder-coin-gallery');
      const filterInput = panelEl.querySelector('.native-deck-builder-coin-filter');
      const regionSelect = panelEl.querySelector('.coin-region-filter');
      const imageOnlyInput = panelEl.querySelector('.coin-image-only');
    
      const renderPreview = () => {
        const coin = coins.find((c) => c.id === selectedId) || null;
        if (!coin) {
          previewEl.innerHTML = '<span class="native-deck-builder-coin-preview-none">No coin selected — flips will use the default.</span>';
          return;
        }
        const variantCount = releaseVariantCounts.get(coin.release) || 0;
        const finishLabel =
          coin.material === 'enamel'
            ? 'Colored enamel'
            : coin.material.charAt(0).toUpperCase() + coin.material.slice(1) + ' finish';
        const metaLines = [`  <span>${finishLabel} · click coin to toss</span>`];
        if (coin.release) {
          metaLines.push(
            `  <span>${escapeHtml(coin.release)}${variantCount > 1 ? ` · ${variantCount} variants` : ''}</span>`
          );
        }
        const regionDate = [coin.region, coin.releaseDate].filter(Boolean).join(' · ');
        if (regionDate) metaLines.push(`  <span>${escapeHtml(regionDate)}</span>`);
        if (isPlaceholderCoin(coin)) {
          metaLines.push(
            '  <span class="native-deck-builder-coin-preview-missing">No scan available yet</span>'
          );
        }

        const layers = coinEffectLayerMarkup('span');
        previewEl.innerHTML = [
          `<span class="coin-toss-wrap" data-coin-toss>`,
      `<div class="coin-3d" data-coin-preview>`,
          `  <div class="coin-face coin-front"><img src="${escapeHtml(coin.thumb)}" alt="${escapeHtml(coin.name)}" />${layers}</div>`,
          `  <div class="coin-face coin-backc"><img src="/src/assets/coins/coin-back.png" alt="back" />${layers}</div>`,
          `</div>`,
          `</span>`,
          `<div class="native-deck-builder-coin-preview-text">`,
          `  <strong>${escapeHtml(coin.name)}</strong>`,
          ...metaLines,
          `</div>`,
        ].join('');
        wirePreviewCoin(coin);
      };
    
      const wirePreviewCoin = (coin) => {
        const el = panelEl.querySelector('[data-coin-preview]');
        if (!el) return;
        applyCoinEffect(el, coin);
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
        // fixed virtual light: the highlight follows the coin's angle, not the cursor
        wireCoinPointerLight(el);
      };
    
      const renderGallery = () => {
        const visible = filterCoins(coins, {
          term: filterTerm,
          material: materialFilter,
          region: regionFilter,
          hasImage: hasImageOnly,
        });
        if (visible.length === 0) {
          galleryEl.innerHTML = '<div class="native-deck-builder-coin-empty">No coins match.</div>';
          return;
        }
    
        const layers = coinEffectLayerMarkup('span');
        galleryEl.innerHTML = visible
          .map((coin) => {
            const isSelected = coin.id === selectedId;
            return [
              `<button class="coin-cell${isSelected ? ' selected' : ''}" data-coin-id="${escapeHtml(coin.id)}" title="${escapeHtml(coin.name)}">`,
              `  <span class="coin-3d coin-sm">`,
              `    <span class="coin-face coin-front"><img src="${escapeHtml(coin.thumb)}" alt="${escapeHtml(coin.name)}" loading="lazy" />${layers}</span>`,
              `    <span class="coin-face coin-backc"><img src="/src/assets/coins/coin-back.png" alt="" loading="lazy" />${layers}</span>`,
              `  </span>`,
              `  <span class="coin-cell-name">${escapeHtml(coin.name)}</span>`,
              coin.region || coin.releaseDate
                ? `  <span class="coin-cell-meta">${escapeHtml([coin.region, coin.releaseDate].filter(Boolean).join(' · '))}</span>`
                : '',
              `</button>`,
            ].join('');
          })
          .join('');
    
        galleryEl.querySelectorAll('[data-coin-id]').forEach((button) => {
          const id = button.dataset.coinId;
          const coinEl = button.querySelector('.coin-3d');
          applyCoinEffect(coinEl, coins.find((c) => c.id === id));
          // click anywhere on the cell = select; the big preview coin is where
          // you flip to inspect the back
          button.addEventListener('click', () => {
            selectedId = selectedId === id ? null : id;
            renderPreview();
            renderGallery();
            const coin = coins.find((c) => c.id === selectedId) || null;
            onChange?.(coin);
          });
          // fixed virtual light: the highlight follows the coin's angle
          wireCoinPointerLight(coinEl);
        });
      };
    
      filterInput.addEventListener('input', () => {
        filterTerm = filterInput.value;
        renderGallery();
      });
    
      regionSelect.addEventListener('change', () => {
        regionFilter = regionSelect.value;
        renderGallery();
      });
    
      imageOnlyInput.addEventListener('change', () => {
        hasImageOnly = imageOnlyInput.checked;
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
    