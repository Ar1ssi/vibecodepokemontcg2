    import {
      filterCoins,
      getCoins,
      getCoinStats,
      getTcglCoins,
      groupCoinsByRelease,
      isPlaceholderCoin,
      coinCatalogLoaded,
      loadCoinCatalog,
      ownedFirst,
    } from '../../../setup/deck-builder/core/coins.mjs';
    import { deferredPicker } from '../../../setup/deck-builder/core/catalog-loader.mjs';
    import {
      applyCoinEffect,
      coinArtUrl,
      coinEffectLayerMarkup,
      wireCoinPointerLight,
    } from '../../../setup/deck-builder/core/coin-effects.mjs';
    import { coinTiltFromPointer } from '../../../setup/netcode/mat-fx/coin-stage-math.mjs';

    const SOURCE_PHYSICAL = 'physical';
    const SOURCE_TCGL = 'tcgl';
    let previewStageFailureLogged = false;

    /**
     * A live TCG Live coin in `host` (design 069): the coin stage draws it with its own shaders, and the
     * side under the pointer leans away. Resolves to a teardown. A stage that cannot start (no WebGL2,
     * assets missing) leaves the thumbnail already in `host`, logged once per page.
     */
    const mountTcglPreview = async (host, coin, isCurrent) => {
      let stage = null;
      try {
        const { createCoinStage } = await import('../../../setup/netcode/mat-fx/coin-stage.js');
        if (!isCurrent()) return () => {};
        stage = await createCoinStage({ host, onLost: () => host.classList.remove('is-live') });
        await stage.setCoin({ id: coin.id });
      } catch (error) {
        stage?.dispose();
        if (!previewStageFailureLogged) {
          previewStageFailureLogged = true;
          console.warn('[coin picker] TCG Live coin preview unavailable; showing its thumbnail.', error);
        }
        return () => {};
      }
      if (!isCurrent()) {
        stage.dispose();
        return () => {};
      }
      const startedAt = performance.now();
      let pose = coinTiltFromPointer(0, 0);
      let frame = null;
      const render = () => {
        frame = null;
        stage.draw(pose, performance.now() - startedAt);
      };
      const schedule = () => {
        if (frame === null) frame = requestAnimationFrame(render);
      };
      const onMove = (event) => {
        const rect = host.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        pose = coinTiltFromPointer(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
        schedule();
      };
      const onLeave = () => {
        pose = coinTiltFromPointer(0, 0);
        schedule();
      };
      host.addEventListener('pointermove', onMove, { passive: true });
      host.addEventListener('pointerleave', onLeave, { passive: true });
      stage.resize();
      render();
      host.classList.add('is-live');
      return () => {
        if (frame !== null) cancelAnimationFrame(frame);
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerleave', onLeave);
        host.classList.remove('is-live');
        stage.dispose();
      };
    };

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
     * `getOwnedIds` names the coins the player's Elite Trainer Boxes gave them (design 057): they
     * are listed first with an "Owned" tag.
     * A second source, TCG Live (design 069), lists the game's own coins by their thumbnails; the
     * selected one previews live in 3D with its own holofoil and tilts with the pointer.
     * The catalog is JSON loaded on demand (design 073): until it is in, the panel stays empty and
     * the controller keeps the selection it is given.
     */
    export const initializeDeckBuilderCoinPicker = (options) => {
      if (!options.panelEl) return null;
      if (coinCatalogLoaded()) return buildCoinPicker(options);
      return deferredPicker({
        panelEl: options.panelEl,
        load: loadCoinCatalog,
        build: () => buildCoinPicker(options),
        label: 'coin picker',
        failureText: 'Coins could not be loaded.',
        noteClass: 'native-deck-builder-coin-empty',
      });
    };

    const buildCoinPicker = ({
      panelEl,
      onChange,
      getOwnedIds = () => [],
    }) => {
      const coins = getCoins();
      const tcglCoins = getTcglCoins();
      const tcglIds = new Set(tcglCoins.map((coin) => coin.id));
      const coinById = (id) => coins.find((c) => c.id === id) || tcglCoins.find((c) => c.id === id) || null;
      const stats = getCoinStats(coins);
      const releaseVariantCounts = new Map(
        groupCoinsByRelease(coins).map((group) => [group.release, group.count])
      );
      let source = SOURCE_PHYSICAL;
      let selectedId = null;
      let previewTeardown = () => {};
      let previewToken = 0;
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
        `    <span class="native-deck-builder-set-browser-series-tag" data-coin-source-tag>All generations · ${stats.total}</span>`,
        '  </div>',
        '  <div class="coin-source-switch" role="group" aria-label="Coin source">',
        `    <button data-source="${SOURCE_PHYSICAL}" class="active">Physical (${stats.total})</button>`,
        `    <button data-source="${SOURCE_TCGL}">TCG Live (${tcglCoins.length})</button>`,
        '  </div>',
        '  <div class="coin-material-filter" data-physical-only>',
        materialButtons,
        '  </div>',
        '  <input class="native-deck-builder-coin-filter" type="text"',
        '    placeholder="Filter coins..." aria-label="Filter coins by name" />',
        '  <select class="coin-region-filter" aria-label="Filter coins by region" data-physical-only>',
        regionOptions,
        '  </select>',
        '  <label class="coin-image-toggle" data-physical-only><input type="checkbox" class="coin-image-only" /> Only with images</label>',
        '</div>',
        '<div class="native-deck-builder-coin-preview"></div>',
        '<div class="native-deck-builder-coin-gallery"></div>',
      ].join('');
    
      const previewEl = panelEl.querySelector('.native-deck-builder-coin-preview');
      const galleryEl = panelEl.querySelector('.native-deck-builder-coin-gallery');
      const filterInput = panelEl.querySelector('.native-deck-builder-coin-filter');
      const regionSelect = panelEl.querySelector('.coin-region-filter');
      const imageOnlyInput = panelEl.querySelector('.coin-image-only');
    
      const renderTcglPreview = (coin) => {
        previewEl.innerHTML = [
          `<span class="coin-stage-preview" data-coin-stage-preview>`,
          `  <img src="${escapeHtml(coinArtUrl(coin.thumb))}" alt="${escapeHtml(coin.name)}" />`,
          `</span>`,
          `<div class="native-deck-builder-coin-preview-text">`,
          `  <strong>${escapeHtml(coin.name)}</strong>`,
          `  <span>TCG Live · ${escapeHtml(coin.family === 'Metal' ? 'Metal' : `${coin.family} holofoil`)}</span>`,
          `  <span>Move the pointer over the coin to tilt it</span>`,
          `</div>`,
        ].join('');
        const host = previewEl.querySelector('[data-coin-stage-preview]');
        const token = previewToken;
        mountTcglPreview(host, coin, () => token === previewToken).then((teardown) => {
          if (token === previewToken) previewTeardown = teardown;
          else teardown();
        });
      };

      const renderPreview = () => {
        previewToken += 1;
        previewTeardown();
        previewTeardown = () => {};
        const coin = coinById(selectedId);
        if (coin && tcglIds.has(coin.id)) {
          renderTcglPreview(coin);
          return;
        }
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
    
      const selectCoin = (id) => {
        selectedId = selectedId === id ? null : id;
        renderPreview();
        renderGallery();
        onChange?.(coinById(selectedId));
      };

      const renderTcglGallery = (visible) => {
        galleryEl.innerHTML = visible
          .map((coin) =>
            [
              `<button class="coin-cell coin-cell-tcgl${coin.id === selectedId ? ' selected' : ''}" data-coin-id="${escapeHtml(coin.id)}" title="${escapeHtml(coin.name)}">`,
              `  <img class="coin-cell-thumb" src="${escapeHtml(coinArtUrl(coin.thumb))}" alt="${escapeHtml(coin.name)}" loading="lazy" />`,
              `  <span class="coin-cell-name">${escapeHtml(coin.name)}</span>`,
              `  <span class="coin-cell-meta">${escapeHtml(coin.family)}</span>`,
              `</button>`,
            ].join('')
          )
          .join('');
        galleryEl.querySelectorAll('[data-coin-id]').forEach((button) => {
          button.addEventListener('click', () => selectCoin(button.dataset.coinId));
        });
      };

      const renderGallery = () => {
        if (source === SOURCE_TCGL) {
          const visible = filterCoins(tcglCoins, { term: filterTerm });
          if (visible.length === 0) galleryEl.innerHTML = '<div class="native-deck-builder-coin-empty">No coins match.</div>';
          else renderTcglGallery(visible);
          return;
        }
        const ownedIds = new Set(getOwnedIds());
        const visible = ownedFirst(
          filterCoins(coins, {
            term: filterTerm,
            material: materialFilter,
            region: regionFilter,
            hasImage: hasImageOnly,
          }),
          [...ownedIds]
        );
        if (visible.length === 0) {
          galleryEl.innerHTML = '<div class="native-deck-builder-coin-empty">No coins match.</div>';
          return;
        }

        const layers = coinEffectLayerMarkup('span');
        galleryEl.innerHTML = visible
          .map((coin) => {
            const isSelected = coin.id === selectedId;
            const isOwned = ownedIds.has(coin.id);
            return [
              `<button class="coin-cell${isSelected ? ' selected' : ''}${isOwned ? ' is-owned' : ''}" data-coin-id="${escapeHtml(coin.id)}" title="${escapeHtml(coin.name)}${isOwned ? ' · Owned' : ''}">`,
              isOwned ? '  <span class="native-deck-builder-owned-tag">Owned</span>' : '',
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
          button.addEventListener('click', () => selectCoin(id));
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
    
      const sourceTag = panelEl.querySelector('[data-coin-source-tag]');
      const setSource = (next) => {
        source = next;
        panelEl.querySelectorAll('.coin-source-switch button').forEach((button) => {
          button.classList.toggle('active', button.dataset.source === source);
        });
        panelEl.querySelectorAll('[data-physical-only]').forEach((el) => {
          el.hidden = source !== SOURCE_PHYSICAL;
        });
        sourceTag.textContent = source === SOURCE_TCGL ? `TCG Live · ${tcglCoins.length}` : `All generations · ${stats.total}`;
      };

      panelEl.querySelectorAll('.coin-source-switch button').forEach((button) => {
        button.addEventListener('click', () => {
          if (button.dataset.source === source) return;
          setSource(button.dataset.source);
          renderGallery();
        });
      });

      renderPreview();
      renderGallery();

      return {
        setSelected: (id) => {
          selectedId = coinById(id) ? id : null;
          setSource(tcglIds.has(selectedId) ? SOURCE_TCGL : SOURCE_PHYSICAL);
          renderPreview();
          renderGallery();
        },
        getSelected: () => coinById(selectedId),
        // A box opened since the gallery was drawn changes what is owned.
        refreshOwned: () => renderGallery(),
      };
    };
    