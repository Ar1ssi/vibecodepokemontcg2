import {
      filterSleevesByName,
      getSleeves,
    } from '../../../setup/deck-builder/core/sleeves.mjs';
    import { DEFAULT_CARD_BACK_PATH } from '../../../setup/deck-constructor/default-card-back.mjs';
    
    const escapeHtml = (value = '') => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    
    /**
     * Card sleeve picker for the native deck builder. Renders a horizontally
     * scrollable gallery of Mega Evolution sleeves with image previews; clicking
     * a sleeve selects it for the current deck. The selection is communicated to
     * the deck library through the onChange callback.
     *
     * @param {object} options
     * @param {HTMLElement} options.panelEl - container element
     * @param {function} options.onChange - called with the selected sleeve (or null)
     * @returns {object|null} controller, or null when the panel is missing
     */
    export const initializeDeckBuilderSleevePicker = ({
      panelEl,
      onChange,
    }) => {
      if (!panelEl) return null;
    
      const sleeves = getSleeves();
    
      let selectedId = null;
      let filterTerm = '';
    
      panelEl.innerHTML = [
        '<div class="native-deck-builder-section-title-row">',
        '  <div class="native-deck-builder-section-title-wrap">',
        '    <div class="native-deck-builder-section-title">Card Sleeve</div>',
        '    <span class="native-deck-builder-set-browser-series-tag">Mega Evolution</span>',
        '  </div>',
        '  <input class="native-deck-builder-sleeve-filter" type="text"',
        '    placeholder="Filter sleeves..." aria-label="Filter sleeves by name" />',
        '</div>',
        '<div class="native-deck-builder-sleeve-preview" aria-live="polite"></div>',
        '<div class="native-deck-builder-sleeve-gallery"></div>',
      ].join('');
    
      const previewEl = panelEl.querySelector('.native-deck-builder-sleeve-preview');
      const galleryEl = panelEl.querySelector('.native-deck-builder-sleeve-gallery');
      const filterInput = panelEl.querySelector('.native-deck-builder-sleeve-filter');
    
      const renderPreview = () => {
        const sleeve = sleeves.find((s) => s.id === selectedId) || null;
        if (!sleeve) {
          previewEl.innerHTML = [
            `<img class="native-deck-builder-sleeve-preview-image" src="${DEFAULT_CARD_BACK_PATH}" alt="Classic Pokémon card back" />`,
            `<div class="native-deck-builder-sleeve-preview-text">`,
            `  <strong>Classic Pokémon card back</strong>`,
            `  <span>Default sleeve — used when no custom sleeve is selected</span>`,
            `</div>`,
          ].join('');
          return;
        }
        previewEl.innerHTML = [
          `<img class="native-deck-builder-sleeve-preview-image" src="${escapeHtml(sleeve.image)}" alt="${escapeHtml(sleeve.name)}" />`,
          `<div class="native-deck-builder-sleeve-preview-text">`,
          `  <strong>${escapeHtml(sleeve.name)}</strong>`,
          sleeve.category ? `<span>${escapeHtml(sleeve.category)}${sleeve.releaseDate ? ' · ' + escapeHtml(sleeve.releaseDate) : ''}</span>` : '',
          `</div>`,
        ].join('');
      };
    
      const renderGallery = () => {
        const visible = filterSleevesByName(sleeves, filterTerm);
        const defaultSelected = !selectedId;
        const defaultThumb = [
          `<button class="native-deck-builder-sleeve-thumb${defaultSelected ? ' selected' : ''}" data-sleeve-id="" title="Classic Pokémon card back" aria-pressed="${defaultSelected ? 'true' : 'false'}">`,
          `  <img src="${DEFAULT_CARD_BACK_PATH}" alt="Classic Pokémon card back" />`,
          `</button>`,
        ].join('');

        const catalogHtml = visible.length === 0
          ? '<div class="native-deck-builder-sleeve-empty">No sleeves match your filter.</div>'
          : visible
            .map((sleeve) => {
              const isSelected = sleeve.id === selectedId;
              return [
                `<button class="native-deck-builder-sleeve-thumb${isSelected ? ' selected' : ''}" data-sleeve-id="${escapeHtml(sleeve.id)}" title="${escapeHtml(sleeve.name || 'Sleeve')}" aria-pressed="${isSelected ? 'true' : 'false'}">`,
                `  <img src="${escapeHtml(sleeve.image)}" alt="${escapeHtml(sleeve.name)}" loading="lazy" />`,
                `</button>`,
              ].join('');
            })
            .join('');

        galleryEl.innerHTML = defaultThumb + catalogHtml;
    
        galleryEl.querySelectorAll('[data-sleeve-id]').forEach((button) => {
          button.addEventListener('click', () => {
            const id = button.dataset.sleeveId || null;
            selectedId = id && selectedId === id ? null : id;
            renderPreview();
            renderGallery();
            const sleeve = sleeves.find((s) => s.id === selectedId) || null;
            onChange?.(sleeve);
          });
        });
      };
    
      filterInput.addEventListener('input', () => {
        filterTerm = filterInput.value;
        renderGallery();
      });
    
      renderPreview();
      renderGallery();
    
      return {
        setSelected: (id) => {
          selectedId = id || null;
          renderPreview();
          renderGallery();
        },
        getSelected: () => sleeves.find((s) => s.id === selectedId) || null,
      };
    };
    