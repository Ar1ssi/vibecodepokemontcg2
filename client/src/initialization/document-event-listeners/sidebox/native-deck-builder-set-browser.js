import {
      fetchLegalStandardSets,
      fetchGenerationSets,
      fetchSetCards,
      filterCardsByName,
      filterCardsBySupertype,
      sortCardsWithinGroup,
      GENERATIONS,
      OTHER_151_SET_ID,
      BLACK_BOLT_WHITE_FLARE_SET_ID,
      GEN_1_2_SET_ID,
    } from '../../../setup/deck-builder/core/set-browser.mjs';
    import { hasActiveFilters } from '../../../setup/deck-builder/core/card-filters.mjs';
    import {
      fetchCardDetail,
      fetchCardSummaries,
    } from '../../../setup/deck-builder/core/card-search.mjs';
    import {
      filtersCoverEverySet,
      findSetFilterMatches,
      scopeFilterSets,
    } from '../../../setup/deck-builder/core/set-browser-filters.mjs';
    import { ownedBadgeHtml } from './native-deck-builder-renderers.js';

    const escapeHtml = (value = '') => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    const KEEP_FETCH_ORDER_SET_IDS = new Set([OTHER_151_SET_ID, BLACK_BOLT_WHITE_FLARE_SET_ID, GEN_1_2_SET_ID]);

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
     * @param {function} [options.getQuantities] - card id -> copies in the deck
     * @param {function} [options.getOwned] - card id -> copies the ETB collection holds (design 057)
     * @returns {object|null} controller, or null when the panel is missing
     */
    export const initializeNativeDeckBuilderSetBrowser = ({
      panelEl,
      onAddCard,
      onPreviewCard,
      getQuantities,
      getOwned,
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
      // Driven externally by the deck builder's Pokémon/Trainers/Energy
      // summary-bar buttons (setSupertypeFilter) — null/'pokemon'/'trainer'/'energy'.
      let supertypeFilter = null;
      let expandedSetId = null;
      let activeCategory = 'standard';
      const cardsBySet = new Map(); // setId -> Card[] (loaded lazily)
      const pendingBySet = new Map(); // setId -> Promise<Card[]>
      // The deck builder's shared TCG Live filters (design 050). filterMatches
      // is null while no filter is active; otherwise setId -> Set of card ids
      // that pass (a set without an entry was not scanned and shows nothing).
      let cardFilters = null;
      let filterMatches = null;
      let filterPassId = 0;

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
        '  <div class="native-deck-builder-set-browser-controls">',
        '    <input class="native-deck-builder-set-browser-filter" type="text"',
        '      placeholder="Filter by card name..." aria-label="Filter cards by name" />',
        '    <button id="nativeDeckBuilderBrowseFiltersButton" class="native-deck-builder-filters-button" type="button" aria-controls="nativeDeckBuilderFilterDrawer" aria-expanded="false">Filters <span class="native-deck-builder-filters-count" data-filters-count hidden>0</span></button>',
        '  </div>',
        '</div>',
        '<div id="nativeDeckBuilderBrowseFilterChips" class="native-deck-builder-fchips" aria-label="Active filters" hidden></div>',
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

      const renderCardsGrid = (cards, quantities = {}, owned = {}) => {
        return cards
          .map((card) => {
            const thumb = card.images?.small || card.image || '';
            const preview = card.images?.large || card.image || '';
            const safeName = escapeHtml(card.name);
            const safeThumb = escapeHtml(thumb);
            const safePreview = escapeHtml(preview);
            const displayTitle = card.rarity === 'Reverse Holo'
              ? `${safeName} (Reverse Holo)`
              : safeName;
            const inDeck = quantities[card.id] || 0;
            // Same tile shape as the search grid (see renderSearchResults):
            // the frame is what scales and clips on hover.
            return [
              `<button class="native-deck-builder-result" data-card-id="${escapeHtml(card.id)}"${inDeck > 0 ? ` data-in-deck="${inDeck}"` : ''}${preview ? ` data-preview-image="${safePreview}"` : ''} title="${displayTitle}">`,
              '  <span class="native-deck-builder-result-frame">',
              `    <img src="${safeThumb}" alt="${safeName}" class="native-deck-builder-result-image" loading="lazy" />`,
              inDeck > 0 ? `    <span class="native-deck-builder-result-qty" aria-label="${inDeck} in deck">${inDeck}</span>` : '',
              ownedBadgeHtml(owned[card.id]),
              '    <span class="native-deck-builder-result-text">',
              `      <strong>${safeName}</strong>`,
              `      <span>#${escapeHtml(card.localId)}</span>`,
              '    </span>',
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

      // The sets the active pill shows: 'standard' and 'other' split one payload.
      const activeGroup = () => {
        const state = categoryState.get(activeCategory);
        if (!state?.loaded) return { label: '', sets: [] };
        if (activeCategory === 'standard' || activeCategory === 'other') {
          const isOther = activeCategory === 'other';
          return {
            label: isOther ? 'other' : 'Standard 2026-27',
            sets: state.sets.filter((set) => ((set.category || 'standard') === 'other') === isOther),
          };
        }
        return { label: '', sets: state.sets };
      };

      const showCategoryStatus = () => {
        const state = categoryState.get(activeCategory);
        if (!state?.loaded) return;
        const total = state.sets.reduce((sum, s) => sum + s.cardCount, 0);
        showStatus(`${state.sets.length} sets, ${total} cards. Click a set to expand it.`);
      };

      // One filter pass over the active pill's sets (design 050). A newer
      // pass (filters, pill or opened set changed) makes an older one moot.
      const refreshFilterMatches = async () => {
        const passId = ++filterPassId;
        if (!cardFilters || !hasActiveFilters(cardFilters)) {
          filterMatches = null;
          showCategoryStatus();
          render();
          return;
        }
        const state = categoryState.get(activeCategory);
        if (!state?.loaded) return;

        const setIds = activeGroup().sets.map((set) => set.setId);
        const scope = scopeFilterSets({ filters: cardFilters, setIds, expandedSetId });
        if (!scope.length) {
          filterMatches = new Map();
          showStatus(
            'Open a set to apply these filters, or add a Card type, Pokémon type, Stage, HP, Rarity, Format or Regulation mark filter to filter every set.'
          );
          render();
          return;
        }

        showStatus(`Filtering ${scope.length} set(s)...`);
        try {
          const result = await findSetFilterMatches({
            setIds: scope,
            filters: cardFilters,
            fetchSummaries: (params) => fetchCardSummaries({ params }),
            loadSetCards: getCardsForSet,
            fetchDetail: fetchCardDetail,
          });
          // Tiles need each matching set's own listing cards.
          const matchedSets = [...result.matches].filter(([, ids]) => ids.size > 0);
          await Promise.all(matchedSets.map(([setId]) => getCardsForSet(setId)));
          if (passId !== filterPassId) return;

          filterMatches = result.matches;
          const matchCount = matchedSets.reduce((sum, [, ids]) => sum + ids.size, 0);
          const where = filtersCoverEverySet(cardFilters)
            ? `in ${matchedSets.length} set(s)`
            : 'in the open set';
          const capNote = result.truncated
            ? ` Checked the first ${result.checkedCount} of ${result.candidateCount} candidates; add filters to narrow it down.`
            : '';
          showStatus(`${matchCount} card(s) ${where} match your filters.${capNote}`);
        } catch (error) {
          if (passId !== filterPassId) return;
          filterMatches = new Map();
          showStatus(`Filtering failed: ${error.message}`);
        }
        render();
      };

      // Filters that only cover the opened set need a new pass when it changes.
      const scopeFollowsOpenSet = () =>
        Boolean(cardFilters) && hasActiveFilters(cardFilters) && !filtersCoverEverySet(cardFilters);

      const render = () => {
        const state = categoryState.get(activeCategory);
        if (!state?.loaded) {
          tabsEl.innerHTML = '';
          resultsEl.innerHTML = '';
          return;
        }

        const hasNameFilter = String(filterTerm || '').trim() !== '';
        const isFiltering = hasNameFilter || Boolean(supertypeFilter) || filterMatches !== null;
        const quantities = getQuantities ? getQuantities() : {};
        const owned = getOwned ? getOwned() : {};
        const passesCardFilters = (setId, card) => {
          if (filterMatches === null) return true;
          if (!filterMatches.get(setId)?.has(card.id)) return false;
          return !cardFilters?.inDeck || quantities[card.id] > 0;
        };
        const dropdownSections = [];

        const buildTabsFor = (groupSets) => {
          const tabsHtml = [];
          for (const set of groupSets) {
            let expanded = set.setId === expandedSetId;

            if (expanded || isFiltering) {
              const cards = cardsBySet.get(set.setId);
              if (cards) {
                const filtered = filterCardsBySupertype(
                  filterCardsByName(cards, filterTerm),
                  supertypeFilter
                ).filter((card) => passesCardFilters(set.setId, card));
                if (isFiltering) {
                  expanded = filtered.length > 0;
                }
                if (expanded) {
                  const cardsHtml = filtered.length
                    ? renderCardsGrid(
                        // These Other-tab sets arrive in their own order; number order would undo it.
                        KEEP_FETCH_ORDER_SET_IDS.has(set.setId) ? filtered : sortCardsWithinGroup(filtered, { sortBy: 'number', sortDirection: 'asc' }),
                        quantities,
                        owned
                      )
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

        const { label: groupLabel, sets: groupSets } = activeGroup();

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
              if (scopeFollowsOpenSet()) refreshFilterMatches();
              else render();
              return;
            }
            expandedSetId = setId;
            if (scopeFollowsOpenSet()) {
              refreshFilterMatches();
              return;
            }
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
            // Also shows the plain set/card count when no filter is active.
            refreshFilterMatches();
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
        // An already-loaded pill filters now; a new one filters once loaded.
        if (categoryState.get(category)?.loaded) refreshFilterMatches();
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
        event.stopPropagation();
        const cardId = target.closest('[data-card-id]')?.dataset.cardId;
        const card = cardId ? findCardById(cardId) : null;
        onPreviewCard?.(target.dataset.previewImage, card, target);
      });

      // Opens one set of the Standard pill, as a click on its tab would (the Elite Trainer Box
      // guide, design 057). A set the pill does not list stays closed.
      const openSet = async (setId) => {
        if (activeCategory !== 'standard') setCategory('standard');
        expandedSetId = setId;
        await loadCategory('standard');
        if (expandedSetId !== setId) return;
        if (scopeFollowsOpenSet()) {
          refreshFilterMatches();
          return;
        }
        render();
        try {
          await getCardsForSet(setId);
        } catch (error) {
          showStatus(`Could not load cards for this set: ${error.message}`);
          return;
        }
        if (expandedSetId === setId) render();
      };

      return {
        load,
        render,
        openSet,
        refresh: () => {
          categoryState.clear();
          cardsBySet.clear();
          load();
        },
        // Called by the deck builder when a summary-bar segment is
        // clicked/toggled — null clears the filter.
        setSupertypeFilter: (supertype) => {
          if (supertypeFilter === supertype) return;
          supertypeFilter = supertype;
          render();
        },
        // The active pill's sets, as the filter drawer's Expansion options.
        getSetOptions: () =>
          activeGroup().sets.map((set) => ({ value: set.setId, label: set.name })),
        // The deck builder's applied TCG Live filters (design 050).
        setCardFilters: (filters) => {
          cardFilters = filters;
          refreshFilterMatches();
        },
      };
    };
