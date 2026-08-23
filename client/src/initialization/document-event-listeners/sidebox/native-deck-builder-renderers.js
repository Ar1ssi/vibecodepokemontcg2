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
    
          return `
            <button class="native-deck-builder-result" data-result-index="${index}"${previewImage ? ` data-preview-image="${escapeHtml(previewImage)}"` : ''} title="${escapeHtml(card.name)} · ${setName}">
              <img src="${escapeHtml(thumbImage)}" alt="${escapeHtml(card.name)}" class="native-deck-builder-result-image" />
              ${qty > 0 ? `<span class="native-deck-builder-result-qty">${qty}</span>` : ''}
              <span class="native-deck-builder-result-text">
                <strong>${escapeHtml(card.name)}</strong>
                <span>${setName}</span>
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
          const safeImageUrl = escapeHtml(imageUrl);
          const safeCssUrl = escapeHtml(escapeCssUrl(imageUrl));
    
          return `
            <div class="native-deck-builder-deck-row" data-deck-row-index="${index}"${safeImageUrl ? ` data-preview-image="${safeImageUrl}"` : ''}>
              <span class="native-deck-builder-deck-row-qty">${card.count}</span>
              ${safeImageUrl ? `<img class="native-deck-builder-deck-row-thumb" src="${safeCssUrl}" alt="" loading="lazy" />` : '<span class="native-deck-builder-deck-row-thumb"></span>'}
              <div class="native-deck-builder-deck-row-name">${safeName}<span class="native-deck-builder-deck-type">${safeSupertype}</span></div>
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
     * Renders the segmented Pokémon / Trainers / Energy counts bar in the style
     * of Pokémon TCG Live's deck sidebar.
     */
    export const renderDeckSummary = ({ summaryEl, counts }) => {
      if (!summaryEl) return;
    
      const segments = [
        { label: 'POKÉMON', value: counts.pokemon },
        { label: 'TRAINERS', value: counts.trainer },
        { label: 'ENERGY', value: counts.energy },
      ];
    
      summaryEl.innerHTML = segments
        .map((segment) => {
          return `<div class="native-deck-builder-summary-segment">${escapeHtml(segment.label)}<strong>${segment.value}</strong></div>`;
        })
        .join('');
    };
    