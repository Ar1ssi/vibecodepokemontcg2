import { cardSpriteFor } from '../../../setup/deck-builder/core/card-sprites.mjs';

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
    
    const HP_SLIDER = { min: 0, max: 400, step: 10 };

    const isOptionOn = (group, option, filters) => {
      if (group.kind === 'single') return filters?.[group.key] === option.value;
      if (group.kind === 'toggles') return filters?.[option.value] === true;
      return (filters?.[group.key] || []).includes(option.value);
    };

    const groupActiveCount = (group, filters) => {
      if (group.kind === 'range') return filters?.hpMin != null || filters?.hpMax != null ? 1 : 0;
      return group.options.filter((option) => isOptionOn(group, option, filters)).length;
    };

    const renderFilterControl = (group, option, filters) => {
      const isOn = isOptionOn(group, option, filters);
      const label = escapeHtml(option.label);
      // Toggles flip a boolean named by the option itself, not by the group.
      const dataGroup = escapeHtml(group.kind === 'toggles' ? option.value : group.key);
      const data = `data-filter-group="${dataGroup}" data-filter-value="${escapeHtml(option.value)}"`;

      if (group.kind === 'toggles') {
        return `<button type="button" role="switch" aria-checked="${isOn}" class="native-deck-builder-ftoggle${isOn ? ' on' : ''}" ${data}>
            <span class="native-deck-builder-ftoggle-label">${label}</span>
            <span class="native-deck-builder-ftoggle-track" aria-hidden="true"><span class="native-deck-builder-ftoggle-dot"></span></span>
          </button>`;
      }
      if (group.kind === 'icons') {
        return `<button type="button" class="native-deck-builder-ficon${isOn ? ' on' : ''}" ${data} aria-pressed="${isOn}" title="${label}" aria-label="${label}">
            <img src="${escapeHtml(option.icon)}" alt="" />
          </button>`;
      }
      if (group.kind === 'pips') {
        return `<button type="button" class="native-deck-builder-fpip${isOn ? ' on' : ''}" ${data} aria-pressed="${isOn}" title="Retreat ${label}">${label}</button>`;
      }
      return `<button type="button" class="native-deck-builder-fpill${isOn ? ' on' : ''}" ${data} aria-pressed="${isOn}">${label}</button>`;
    };

    const renderHpRange = (filters) => {
      const low = filters?.hpMin ?? HP_SLIDER.min;
      const high = filters?.hpMax ?? HP_SLIDER.max;
      const range = `min="${HP_SLIDER.min}" max="${HP_SLIDER.max}" step="${HP_SLIDER.step}"`;
      return `<div class="native-deck-builder-frange">
          <input type="range" ${range} value="${low}" data-hp-bound="min" aria-label="Minimum HP" />
          <input type="range" ${range} value="${high}" data-hp-bound="max" aria-label="Maximum HP" />
        </div>
        <div class="native-deck-builder-frange-readout"><span data-hp-readout="min">${low}</span><span data-hp-readout="max">${high}</span></div>`;
    };

    /**
     * Renders the TCG Live filter drawer (design 050) from card-filters.mjs's
     * BUILDER_FILTER_GROUPS. `filters` is the draft being edited; this function
     * draws and reports intent only — all filter logic lives in that module.
     * `setOptions` fills the Expansion group, whose options come from results.
     */
    export const renderFilterDrawer = ({
      drawerEl,
      groups,
      filters,
      setOptions = [],
      onToggle,
      onHpChange,
      onReset,
      onApply,
      onClose,
    }) => {
      if (!drawerEl) return;

      const sections = groups
        .map((group) => {
          const options = group.dynamic === 'sets' ? setOptions : group.options;
          const count = groupActiveCount({ ...group, options }, filters);
          let body;
          if (group.kind === 'range') {
            body = renderHpRange(filters);
          } else if (!options.length) {
            body = '<span class="native-deck-builder-fsec-empty">Search first — the expansions in your results appear here.</span>';
          } else {
            body = options.map((option) => renderFilterControl(group, option, filters)).join('');
          }
          return `
            <section class="native-deck-builder-fsec${group.span === 2 ? ' span2' : ''}" data-fsec="${escapeHtml(group.key)}">
              <h4>${escapeHtml(group.label)}${count ? ` <em>${count}</em>` : ''}</h4>
              <div class="native-deck-builder-fsec-body native-deck-builder-fsec-${escapeHtml(group.kind)}">${body}</div>
            </section>`;
        })
        .join('');

      drawerEl.innerHTML = `
        <div class="native-deck-builder-fdrawer-head">
          <span class="native-deck-builder-fdrawer-title">Filters</span>
          <button type="button" class="native-deck-builder-fdrawer-close" data-fdrawer-close aria-label="Close filters" title="Close">&#10005;</button>
        </div>
        <div class="native-deck-builder-fdrawer-body">${sections}</div>
        <div class="native-deck-builder-fdrawer-foot">
          <button type="button" class="native-deck-builder-fdrawer-reset" data-fdrawer-reset>Reset</button>
          <button type="button" class="native-deck-builder-fdrawer-apply" data-fdrawer-apply>Apply filters</button>
        </div>`;

      drawerEl.querySelectorAll('[data-filter-value]').forEach((control) => {
        control.addEventListener('click', () => {
          onToggle?.(control.dataset.filterGroup, control.dataset.filterValue);
        });
      });

      // The readout follows the thumb while dragging; the draft only changes
      // on release, so a re-render never interrupts a drag.
      const bounds = drawerEl.querySelectorAll('[data-hp-bound]');
      bounds.forEach((input) => {
        input.addEventListener('input', () => {
          const readout = drawerEl.querySelector(`[data-hp-readout="${input.dataset.hpBound}"]`);
          if (readout) readout.textContent = input.value;
        });
        input.addEventListener('change', () => {
          const [low, high] = [...bounds].map((entry) => Number(entry.value));
          onHpChange?.(low, high);
        });
      });

      drawerEl.querySelector('[data-fdrawer-close]')?.addEventListener('click', () => onClose?.());
      drawerEl.querySelector('[data-fdrawer-reset]')?.addEventListener('click', () => onReset?.());
      drawerEl.querySelector('[data-fdrawer-apply]')?.addEventListener('click', () => onApply?.());
    };

    /**
     * Renders the active-filter chip strip under the search row: a result
     * count, one removable chip per filter (from describeActiveFilters) and a
     * Reset all link. Hidden when nothing is active and nothing was searched.
     */
    export const renderFilterChips = ({ chipsEl, chips = [], resultLabel = '', onRemove, onReset }) => {
      if (!chipsEl) return;

      chipsEl.hidden = chips.length === 0 && !resultLabel;
      const chipHtml = chips
        .map(
          (chip, index) => `<span class="native-deck-builder-fchip">${escapeHtml(chip.label)}<button type="button" data-chip-index="${index}" aria-label="Remove filter ${escapeHtml(chip.label)}" title="Remove">&#10005;</button></span>`
        )
        .join('');

      chipsEl.innerHTML = `
        ${resultLabel ? `<span class="native-deck-builder-fchips-count">${escapeHtml(resultLabel)}</span>` : ''}
        ${chipHtml}
        ${chips.length ? '<button type="button" class="native-deck-builder-fchips-reset" data-chips-reset>Reset all</button>' : ''}`;

      chipsEl.querySelectorAll('[data-chip-index]').forEach((button) => {
        button.addEventListener('click', () => onRemove?.(chips[Number(button.dataset.chipIndex)]));
      });
      chipsEl.querySelector('[data-chips-reset]')?.addEventListener('click', () => onReset?.());
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
          const sprite = cardSpriteFor(card);
          // Rows without a sprite keep an empty slot so every name lines up.
          const spriteHtml = sprite
            ? `<img class="native-deck-builder-deck-row-sprite ${sprite.kind}" src="${escapeHtml(sprite.url)}" alt="" title="${escapeHtml(sprite.label)}" loading="lazy" onerror="this.remove()" />`
            : '';
    
          return `
            <div class="native-deck-builder-deck-row" data-deck-row-index="${index}"${safeImageUrl ? ` data-preview-image="${safeImageUrl}"` : ''}>
              <span class="native-deck-builder-deck-row-qty">${card.count}</span>
              <span class="native-deck-builder-deck-row-sprite-slot">${spriteHtml}</span>
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
    
    /**
     * Renders a deck's Pokémon sprite strip — the up-to-three mons pinned
     * beside a deck's name (design 024). Used both in the editor header
     * (editable: clicking opens the picker) and on the My Decks chips
     * (read-only). Presentation only; the slots come from `deck-sprites.mjs`.
     *
     * @param {object} options
     * @param {HTMLElement} options.stripEl
     * @param {{slug: string, shiny: boolean}[]} options.sprites - already normalized
     * @param {function} options.spriteUrl - (sprite) => string
     * @param {function} options.spriteLabel - (sprite) => string
     * @param {boolean} [options.editable] - draw the add/clear affordance
     * @param {number} [options.max]
     */
    export const renderDeckSprites = ({
      stripEl,
      sprites = [],
      spriteUrl,
      spriteLabel,
      editable = false,
      max = 2,
    }) => {
      if (!stripEl) return;

      const tiles = sprites
        .map((sprite) => {
          const url = spriteUrl(sprite);
          if (!url) return '';
          const label = escapeHtml(spriteLabel(sprite));
          // A sprite file that fails to load must not leave a broken-image
          // glyph sitting next to the deck name, so it removes itself.
          return `<img class="native-deck-builder-deck-sprite${sprite.shiny ? ' shiny' : ''}${sprite.auto ? ' auto' : ''}" src="${escapeHtml(url)}" alt="${label}" title="${label}" loading="lazy" onerror="this.remove()" />`;
        })
        .join('');

      const canAdd = editable && sprites.length < max;
      const addButton = editable
        ? `<button type="button" class="native-deck-builder-deck-sprite-add" data-sprite-picker-open="true" title="${sprites.length ? 'Change this deck’s Pokémon' : 'Pin Pokémon to this deck'}" aria-label="${sprites.length ? 'Change this deck’s Pokémon' : 'Pin Pokémon to this deck'}">${canAdd ? '+' : '✎'}</button>`
        : '';

      stripEl.innerHTML = `${tiles}${addButton}`;
      stripEl.classList.toggle('is-empty', sprites.length === 0);
    };

    /**
     * Renders the Pokémon sprite picker popover: the deck's current slots
     * (each with a shiny toggle and a remove button) above a searchable grid
     * of every vendored Pokémon. Reports intent through the callbacks; all
     * slot arithmetic lives in `deck-sprites.mjs`.
     */
    export const renderSpritePicker = ({
      pickerEl,
      sprites = [],
      results = [],
      query = '',
      max = 2,
      spriteUrl,
      spriteLabel,
      canShiny = () => true,
    }) => {
      if (!pickerEl) return;

      const slots = sprites
        .map((sprite, index) => {
          const label = escapeHtml(spriteLabel(sprite));
          return `
            <span class="native-deck-builder-sprite-slot">
              <img src="${escapeHtml(spriteUrl(sprite))}" alt="${label}" onerror="this.remove()" />
              ${canShiny(sprite) ? `<button type="button" data-sprite-shiny="${index}" class="${sprite.shiny ? 'active' : ''}" title="${sprite.shiny ? `Use the regular ${label}` : `Use the shiny ${label}`}" aria-pressed="${Boolean(sprite.shiny)}">&#10022;</button>` : ''}
              <button type="button" data-sprite-remove="${index}" title="Remove ${label}" aria-label="Remove ${label}">&#10005;</button>
            </span>`;
        })
        .join('');

      const isFull = sprites.length >= max;
      const grid = results
        .map((entry) => {
          const name = escapeHtml(entry.name);
          const chosen = sprites.some((sprite) => sprite.slug === entry.slug);
          return `<button type="button" class="native-deck-builder-sprite-option${chosen ? ' chosen' : ''}" data-sprite-add="${escapeHtml(entry.slug)}"${chosen || isFull ? ' disabled' : ''} title="${name}">
            <img src="${escapeHtml(spriteUrl({ slug: entry.slug }))}" alt="${name}" loading="lazy" onerror="this.remove()" />
            <span>${name}</span>
          </button>`;
        })
        .join('');

      pickerEl.innerHTML = `
        <div class="native-deck-builder-sprite-picker-head">
          <span class="native-deck-builder-sprite-picker-title">Deck Pokémon <em>${sprites.length} / ${max}</em></span>
          <button type="button" data-sprite-picker-close="true" class="native-deck-builder-sprite-picker-close" aria-label="Close">&#10005;</button>
        </div>
        <div class="native-deck-builder-sprite-slots">${slots || '<span class="native-deck-builder-sprite-empty">No Pokémon pinned yet.</span>'}</div>
        <input type="search" id="nativeDeckBuilderSpriteSearch" class="native-deck-builder-sprite-search" placeholder="Search Pokémon..." aria-label="Search Pokémon" value="${escapeHtml(query)}" />
        <div class="native-deck-builder-sprite-grid">${grid || '<span class="native-deck-builder-sprite-empty">No Pokémon match that name.</span>'}</div>
        ${isFull ? '<span class="native-deck-builder-sprite-hint">Strip is full — remove one to swap it out.</span>' : ''}`;
    };
