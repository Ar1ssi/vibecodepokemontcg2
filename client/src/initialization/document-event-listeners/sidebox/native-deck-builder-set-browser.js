import {
      fetchLegalStandardSets,
      fetchGenerationSets,
      fetchSetCards,
      filterCardsByName,
      sortCardsWithinGroup,
      GENERATIONS,
    } from '../../../setup/deck-builder/core/set-browser.mjs';

    const escapeHtml = (value = '') => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    const GENERATION_CATEGORY_PREFIX = 'gen';
    const generationCategoryId = (gen) => `${GENERATION_CATEGORY_PREFIX}${gen}`;

    /**
     * "Browse Sets" panel for the native deck builder. Pills switch between the
     * current Standard-legal sets, an "other" bucket, and one pill per Pokémon
     * generation (9 down to 1) that loads every set from that TCG era via
     * TCGdex's series grouping. Cards are fetched lazily the first time a set is
     * expanded, then cached. Clicking a card adds it to the currently edited deck.
     *
     * @param {object} options
     * @param {HTMLElement} options.panelEl - container for this panel
     * @param {function} options.onAddCard - called with the clicked card
     * @param {function} options.onPreviewCard - called with the card image url
     * @returns {object|null} controller, or null when the panel is missing
     */
    export const initializeNativeDeckBuilderSetBrowser = ({
      panelEl,
      onAddCard,
      onPreviewCard,
      getQuantities,
    }) => {
      if (!panelEl) return null;

      // ── internal state ──────────────────────────────────────────────────
      // categoryState: categoryId -> { sets: Card[], loaded: bool, loading: bool }
      // 'standard' and 'other' both read from the one fetchLegalStandardSets()
      // payload (split client-side by category, as before); each 'gen<N>' entry
      // is its own independent fetch/cache.
      const categoryState = new Map();
      const getOrCreateState = (categoryId) => {
        if (!categoryState.has(categoryId)) {
          categoryState.set(categoryId, { sets: [], loaded: false, loading: false });
        }
        return categoryState.get(categoryId);
      };

      let filterTerm = '';
      let expandedSetId = null;
      let activeCategory = 'standard';
      const cardsBySet = new Map(); // setId -> Card[] (loaded lazily)
      const pendingBySet = new Map(); // setId -> Promise<Card[]>

      // ── DOM scaffold (injected once) ────────────────────────────────────
      const generationPillsHtml = GENERATIONS.map(
        (gen) =>
          `<button class="native-deck-builder-set-browser-series-tag native-deck-builder-set-browser-series-tag--generation" data-category="${generationCategoryId(gen)}" type="button">Generation ${gen}</button>`
      ).join('');

      panelEl.innerHTML = [
        '<div class="native-deck-builder-section-title-row">',
        '  <div class="native-deck-builder-section-title-wrap">',
        '    <div class="native-deck-builder-section-title">Browse Sets</div>',
        '    <button class="native-deck-builder-set-browser-series-tag active" data-category="standard" type="button">Standard 2026-27</button>',
        '    <button class="native-deck-builder-set-browser-series-tag native-deck-builder-set-browser-series-tag--other" data-category="other" type="button">other</button>',
        generationPillsHtml,
        '  </div>',
        '  <input class="native-deck-builder-set-browser-filter" type="text"',
        '    placeholder="Filter by card name..." aria-label="Filter cards by name" />',
        '</div>',
        '<div class="native-deck-builder-set-browser-status" aria-live="polite"></div>',
        '<div class="native-deck-builder-set-browser-tabs"></div>',
        '<div class="native-deck-builder-set-browser-results"></div>',
      ].join('');

      const statusEl = panelEl.querySelector('.native-deck-builder-set-browser-status');
      const tabsEl = panelEl.querySelector('.native-deck-builder-set-browser-tabs');
      const resultsEl = panelEl.querySelector('.native-deck-builder-set-browser-results');
      const filterInput = panelEl.querySelector('.native-deck-builder-set-browser-filter');

      const showStatus = (message) => {
        statusEl.textContent = message;
      };

      const getCardsForSet = (setId) => {
        if (cardsBySet.has(setId)) return Promise.resolve(cardsBySet.get(setId));
        if (pendingBySet.has(setId)) return pendingBySet.get(setId);

        const promise = fetchSetCards(setId)
          .then((cards) => {
            cardsBySet.set(setId, cards);
            pendingBySet.delete(setId);
            return cards;
          })
          .catch((error) => {
            pendingBySet.delete(setId);
            throw error;
          });
        pendingBySet.set(setId, promise);
        return promise;
      };

      const renderCardsGrid = (cards, quantities = {}) => {
        return cards
          .map((card) => {
            const thumb = card.images?.small || card.image || '';
            const preview = card.images?.large || card.image || '';
            const safeName = escapeHtml(card.name);
            const safeThumb = escapeHtml(thumb);
            const safePreview = escapeHtml(preview);
            return [
              `<button class="native-deck-builder-result" data-card-id="${escapeHtml(card.id)}"${preview ? ` data-preview-image="${safePreview}"` : ''} title="${safeName}">`,
              `  <img src="${safeThumb}" alt="${safeName}" class="native-deck-builder-result-image" loading="lazy" />`,
              quantities[card.id] > 0 ? `  <span class="native-deck-builder-result-qty">${quantities[card.id]}</span>` : '',
              '  <span class="native-deck-builder-result-text">',
              `    <strong>${safeName}</strong>`,
              `    <span>#${escapeHtml(card.localId)}</span>`,
              '  </span>',
              '</button>',
            ].join('');
          })
          .join('');
      };

      const renderSetTab = (set, { expanded }) => {
        const safeSetName = escapeHtml(set.name);
        return [
          `<button class="native-deck-builder-set-browser-tab${expanded ? ' expanded' : ''}" data-toggle-set="${escapeHtml(set.setId)}" aria-expanded="${expanded ? 'true' : 'false'}" title="${safeSetName}">`,
          set.logo ? `<img class="native-deck-builder-set-browser-tab-logo" src="${escapeHtml(set.logo)}" alt="" loading="lazy" />` : `<span class="native-deck-builder-set-browser-tab-name">${safeSetName}</span>`,
          `  <span class="native-deck-builder-set-browser-tab-count">${set.cardCount}</span>`,
          '</button>',
        ].join('');
      };

      const renderDropdownSection = (set, { cardsHtml = '', loadingCards = false, showLabel = false }) => {
        const safeSetName = escapeHtml(set.name);
        const label = showLabel ? `<div class="native-deck-builder-set-browser-dropdown-label">${safeSetName}</div>` : '';
        const body = loadingCards
          ? '<div class="native-deck-builder-set-browser-empty">Loading cards...</div>'
          : `<div class="native-deck-builder-set-browser-group-cards">${cardsHtml}</div>`;
        return `<div class="native-deck-builder-set-browser-dropdown-section" data-set-id="${escapeHtml(set.setId)}">${label}${body}</div>`;
      };

      const render = () => {
        const state = categoryState.get(activeCategory);
        if (!state?.loaded) {
          tabsEl.innerHTML = '';
          resultsEl.innerHTML = '';
          return;
        }

        const isFiltering = String(filterTerm || '').trim() !== '';
        const dropdownSections = [];

        const buildTabsFor = (groupSets) => {
          const tabsHtml = [];
          for (const set of groupSets) {
            let expanded = set.setId === expandedSetId;

            if (expanded || isFiltering) {
              const cards = cardsBySet.get(set.setId);
              if (cards) {
                const filtered = filterCardsByName(cards, filterTerm);
                if (isFiltering) {
                  expanded = filtered.length > 0;
                }
                if (expanded) {
                  const cardsHtml = filtered.length
                    ? renderCardsGrid(sortCardsWithinGroup(filtered, { sortBy: 'number', sortDirection: 'asc' }), getQuantities ? getQuantities() : {})
                    : '<div class="native-deck-builder-set-browser-empty">No cards match your filter.</div>';
                  dropdownSections.push(renderDropdownSection(set, { cardsHtml, showLabel: isFiltering }));
                }
              } else if (expanded && !isFiltering) {
                // clicked but not loaded yet — show a loading placeholder
                dropdownSections.push(renderDropdownSection(set, { loadingCards: true }));
              } else if (isFiltering) {
                expanded = false;
              }
            }

            tabsHtml.push(renderSetTab(set, { expanded }));
          }
          return tabsHtml;
        };

        const renderGroup = (label, groupSets) => {
          if (groupSets.length === 0) return '';
          const tabsHtml = buildTabsFor(groupSets);
          const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'generation';
          return [
            `<div class="native-deck-builder-set-browser-group" data-category="${escapeHtml(key)}">`,
            label ? `  <div class="native-deck-builder-set-browser-group-label">${escapeHtml(label)}</div>` : '',
            `  <div class="native-deck-builder-set-browser-group-tabs">${tabsHtml.join('')}</div>`,
            '</div>',
          ].join('');
        };

        let groupLabel;
        let groupSets;
        if (activeCategory === 'standard' || activeCategory === 'other') {
          const standardSets = state.sets.filter((set) => (set.category || 'standard') !== 'other');
          const otherSets = state.sets.filter((set) => (set.category || 'standard') === 'other');
          groupLabel = activeCategory === 'other' ? 'other' : 'Standard 2026-27';
          groupSets = activeCategory === 'other' ? otherSets : standardSets;
        } else {
          groupLabel = '';
          groupSets = state.sets;
        }

        if (groupSets.length === 0) {
          tabsEl.innerHTML = '';
          resultsEl.innerHTML = '<div class="native-deck-builder-set-browser-empty">No sets available.</div>';
          return;
        }

        tabsEl.innerHTML = renderGroup(groupLabel, groupSets);
        resultsEl.innerHTML = dropdownSections.length
          ? dropdownSections.join('')
          : '<div class="native-deck-builder-set-browser-dropdown-empty">Select a set above to browse its cards.</div>';
        wireEvents();
      };

      const wireEvents = () => {
        tabsEl.querySelectorAll('[data-toggle-set]').forEach((button) => {
          button.addEventListener('click', async () => {
            const setId = button.dataset.toggleSet;
            if (expandedSetId === setId) {
              expandedSetId = null;
              render();
              return;
            }
            expandedSetId = setId;
            // render collapsed skeleton first, then fetch cards if needed
            if (!cardsBySet.has(setId)) {
              render();
              try {
                await getCardsForSet(setId);
              } catch (error) {
                showStatus(`Could not load cards for this set: ${error.message}`);
              }
            }
            render();
          });
        });

        resultsEl.querySelectorAll('[data-card-id]').forEach((button) => {
          button.addEventListener('click', () => {
            for (const cards of cardsBySet.values()) {
              const card = cards.find((c) => c.id === button.dataset.cardId);
              if (card) {
                onAddCard?.(card);
                return;
              }
            }
          });
        });
      };

      // ── data loading ────────────────────────────────────────────────────
      const loadCategory = async (categoryId) => {
        const state = getOrCreateState(categoryId);
        if (state.loaded || state.loading) {
          if (categoryId === activeCategory) render();
          return;
        }
        state.loading = true;
        if (categoryId === activeCategory) {
          showStatus(
            categoryId.startsWith(GENERATION_CATEGORY_PREFIX)
              ? 'Loading sets from TCGdex...'
              : 'Loading Standard-format sets from TCGdex...'
          );
        }

        try {
          if (categoryId === 'standard' || categoryId === 'other') {
            const sets = await fetchLegalStandardSets();
            // Both pills share one payload — seed the other's cache too so
            // switching between them never refetches.
            const standardState = getOrCreateState('standard');
            const otherState = getOrCreateState('other');
            standardState.sets = sets;
            standardState.loaded = true;
            standardState.loading = false;
            otherState.sets = sets;
            otherState.loaded = true;
            otherState.loading = false;
          } else {
            const generation = Number(categoryId.slice(GENERATION_CATEGORY_PREFIX.length));
            const sets = await fetchGenerationSets(generation);
            state.sets = sets;
            state.loaded = true;
            state.loading = false;
          }

          if (categoryId === activeCategory) {
            const active = categoryState.get(activeCategory);
            const total = active.sets.reduce((sum, s) => sum + s.cardCount, 0);
            showStatus(`${active.sets.length} sets, ${total} cards. Click a set to expand it.`);
            render();
          }
        } catch (error) {
          state.loading = false;
          if (categoryId === activeCategory) {
            showStatus(`Could not load sets: ${error.message}`);
            tabsEl.innerHTML = '';
            resultsEl.innerHTML = '';
          }
        }
      };

      // Default entry point: eagerly loads the Standard pill (today's behavior).
      const load = () => loadCategory('standard');

      // ── events ──────────────────────────────────────────────────────────
      filterInput.addEventListener('input', () => {
        filterTerm = filterInput.value;
        render();
      });

      const categoryPills = panelEl.querySelectorAll('.native-deck-builder-set-browser-series-tag[data-category]');
      const setCategory = (category) => {
        activeCategory = category;
        expandedSetId = null;
        categoryPills.forEach((pill) => {
          pill.classList.toggle('active', pill.dataset.category === category);
        });
        loadCategory(category);
        render();
      };
      categoryPills.forEach((pill) => {
        pill.addEventListener('click', () => {
          if (pill.dataset.category !== activeCategory) setCategory(pill.dataset.category);
        });
      });

      const findCardById = (cardId) => {
        for (const cards of cardsBySet.values()) {
          const card = cards.find((c) => c.id === cardId);
          if (card) return card;
        }
        return null;
      };

      resultsEl.addEventListener('contextmenu', (event) => {
        const target = event.target.closest('[data-preview-image]');
        if (!target) return;
        event.preventDefault();
        const cardId = target.closest('[data-card-id]')?.dataset.cardId;
        const card = cardId ? findCardById(cardId) : null;
        onPreviewCard?.(target.dataset.previewImage, card, target);
      });

      return {
        load,
        render,
        refresh: () => {
          categoryState.clear();
          cardsBySet.clear();
          load();
        },
      };
    };
