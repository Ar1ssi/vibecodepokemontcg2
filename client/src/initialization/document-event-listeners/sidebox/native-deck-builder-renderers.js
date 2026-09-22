const escapeHtml = (value = '') => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    
    const escapeCssUrl = (url = '') => String(url)
      .replaceAll("'", '%27')
      .replaceAll(')', '%29')
      .replaceAll('\\', '%5C');
    
    export const renderSearchResults = ({ searchResultsEl, results, onSelect, quantities = {} }) => {
      if (!searchResultsEl) return;
    
      if (!results || results.length === 0) {
        searchResultsEl.innerHTML = '';
        return;
      }
    
      searchResultsEl.innerHTML = results
        .map((card, index) => {
          const previewImage = card.images?.large || card.images?.small || card.image || '';
          const thumbImage = card.images?.small || card.image || '';
          const setName = escapeHtml(card.set?.name || 'Unknown Set');
          const qty = quantities[card.id] || 0;
    
          // Image-first, as in Pokémon TCG Live: the card scan IS the tile.
          // The name/set caption stays in the DOM for screen readers and for
          // the light theme, but reads as a hover-in footer over the art.
          return `
            <button class="native-deck-builder-result" data-card-id="${escapeHtml(card.id)}" data-result-index="${index}"${qty > 0 ? ` data-in-deck="${qty}"` : ''}${previewImage ? ` data-preview-image="${escapeHtml(previewImage)}"` : ''} title="${escapeHtml(card.name)} · ${setName}">
              <span class="native-deck-builder-result-frame">
                <img src="${escapeHtml(thumbImage)}" alt="${escapeHtml(card.name)}" class="native-deck-builder-result-image" loading="lazy" />
                ${qty > 0 ? `<span class="native-deck-builder-result-qty" aria-label="${qty} in deck">${qty}</span>` : ''}
                <span class="native-deck-builder-result-text">
                  <strong>${escapeHtml(card.name)}</strong>
                  <span>${setName}</span>
                </span>
              </span>
            </button>
          `;
        })
        .join('');
    
      searchResultsEl.querySelectorAll('[data-result-index]').forEach((button) => {
        button.addEventListener('click', () => {
          const card = results[Number(button.dataset.resultIndex)];
          onSelect(card);
        });
      });
    };
    
    export const renderDeckCards = ({ cardsEl, sortedCards, onAdd, onRemove }) => {
      if (!cardsEl) return;
    
      if (!sortedCards || sortedCards.length === 0) {
        cardsEl.innerHTML = '<div class="native-deck-builder-set-browser-empty">No cards added yet.</div>';
        return;
      }
    
      cardsEl.innerHTML = sortedCards
        .map((card, index) => {
          // thumbnail stays low-res (fast), but the PREVIEW must use the
          // full-resolution scan (600x825) so right-click previews are crisp
          const imageUrl = card.images?.large || card.images?.small || card.image || '';
          const safeName = escapeHtml(card.name || 'Unknown Card');
          const safeSupertype = escapeHtml(card.supertype || 'Unknown');
          const safeTypeLabel = card.rarity === 'Reverse Holo'
            ? `${safeSupertype} · Reverse Holo`
            : safeSupertype;
          const safeImageUrl = escapeHtml(imageUrl);
          const safeCssUrl = escapeHtml(escapeCssUrl(imageUrl));
    
          return `
            <div class="native-deck-builder-deck-row" data-deck-row-index="${index}"${safeImageUrl ? ` data-preview-image="${safeImageUrl}"` : ''}>
              <span class="native-deck-builder-deck-row-qty">${card.count}</span>
              ${safeImageUrl ? `<img class="native-deck-builder-deck-row-thumb" src="${safeCssUrl}" alt="" loading="lazy" />` : '<span class="native-deck-builder-deck-row-thumb"></span>'}
              <div class="native-deck-builder-deck-row-name">${safeName}<span class="native-deck-builder-deck-type">${safeTypeLabel}</span></div>
              <div class="native-deck-builder-deck-row-controls">
                <button class="native-deck-builder-deck-plus" data-add-index="${index}" aria-label="Add one ${safeName}" title="Add one ${safeName}">+</button>
                <button class="native-deck-builder-deck-minus" data-remove-index="${index}" aria-label="Remove one ${safeName}" title="Remove one ${safeName}">&minus;</button>
              </div>
            </div>`;
        })
        .join('');
    
      cardsEl.querySelectorAll('[data-add-index]').forEach((button) => {
        button.addEventListener('click', () => {
          const card = sortedCards[Number(button.dataset.addIndex)];
          onAdd(card);
        });
      });
    
      cardsEl.querySelectorAll('[data-remove-index]').forEach((button) => {
        button.addEventListener('click', () => {
          const card = sortedCards[Number(button.dataset.removeIndex)];
          onRemove(card);
        });
      });
    };

    /**
     * Renders Pokémon TCG Live's prominent "x / 60" deck counter: a big card
     * count, a fill bar that only turns green on a legal deck, and a one-line
     * detail saying what is still missing. Takes the model from
     * `deck-counter.mjs` — this function does presentation only.
     */
    export const renderDeckCounter = ({ counterEl, model }) => {
      if (!counterEl || !model) return;

      counterEl.dataset.state = model.state;
      counterEl.dataset.legal = String(Boolean(model.isLegal));
      counterEl.innerHTML = `
        <div class="native-deck-builder-counter-top">
          <span class="native-deck-builder-counter-count">${escapeHtml(String(model.total))}</span>
          <span class="native-deck-builder-counter-required">/ ${escapeHtml(String(model.required))}</span>
          <span class="native-deck-builder-counter-detail">${escapeHtml(model.detail)}</span>
        </div>
        <div class="native-deck-builder-counter-track">
          <div class="native-deck-builder-counter-fill" style="width: ${model.percent}%"></div>
        </div>`;
    };

    /**
     * Renders the segmented Pokémon / Trainers / Energy counts bar in the style
     * of Pokémon TCG Live's deck sidebar. Each segment is a toggle button:
     * clicking one filters the deck list below to just that supertype;
     * clicking the active one again (or passing the same `activeFilter`
     * back) clears the filter. `onFilterClick` receives the segment's key
     * ('pokemon' | 'trainer' | 'energy') — the caller owns the toggle state.
     */
    export const renderDeckSummary = ({ summaryEl, counts, activeFilter = null, onFilterClick }) => {
      if (!summaryEl) return;

      const segments = [
        { key: 'pokemon', label: 'POKÉMON', value: counts.pokemon },
        { key: 'trainer', label: 'TRAINERS', value: counts.trainer },
        { key: 'energy', label: 'ENERGY', value: counts.energy },
      ];

      summaryEl.innerHTML = segments
        .map((segment) => {
          const isActive = activeFilter === segment.key;
          return `<button type="button" class="native-deck-builder-summary-segment${isActive ? ' active' : ''}" data-filter-type="${segment.key}" aria-pressed="${isActive}" title="Filter deck list to ${segment.label.toLowerCase()}">${escapeHtml(segment.label)}<strong>${segment.value}</strong></button>`;
        })
        .join('');

      summaryEl.querySelectorAll('[data-filter-type]').forEach((button) => {
        button.addEventListener('click', () => {
          onFilterClick?.(button.dataset.filterType);
        });
      });
    };
    