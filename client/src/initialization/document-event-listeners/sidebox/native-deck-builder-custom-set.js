// Custom Set tab (Deck Builder): the panel that lists the player's own set, saves it in this browser,
// and exports or imports it as a JSON file. Pure rules live in core/custom-set.mjs.
import {
  addCardToCustomSet,
  customSetFileName,
  customSetHasCard,
  createEmptyCustomSet,
  loadCustomSetFromStorage,
  mergeCardsIntoCustomSet,
  parseCustomSetFile,
  removeCardFromCustomSet,
  renameCustomSet,
  saveCustomSetToStorage,
  serializeCustomSet,
} from '../../../setup/deck-builder/core/custom-set.mjs';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const tileHtml = (card, index) => {
  const image = card.images?.small || card.image || '';
  const setName = card.set?.name || '';
  return `
          <div class="db-custom-set-tile" data-custom-set-index="${index}" title="Click to add to the deck. Double-click to remove from the set.">
            <button type="button" class="db-custom-set-add" data-custom-set-add="${index}" title="Add ${escapeHtml(card.name)} to the deck">
              ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(card.name)}" loading="lazy" />` : `<span class="db-custom-set-noimage">${escapeHtml(card.name)}</span>`}
            </button>
            <span class="db-custom-set-caption">${escapeHtml(card.name)}${setName ? ` · ${escapeHtml(setName)}` : ''}</span>
            <button type="button" class="db-custom-set-remove" data-custom-set-remove="${index}" aria-label="Remove ${escapeHtml(card.name)} from the set">×</button>
          </div>`;
};

const panelHtml = (customSet) => `
      <div class="db-custom-set-head">
        <label class="db-custom-set-name-label">
          <span>Set name</span>
          <input type="text" class="db-custom-set-name" maxlength="60" value="${escapeHtml(customSet.name)}" />
        </label>
        <span class="db-custom-set-count">${customSet.cards.length} card${customSet.cards.length === 1 ? '' : 's'}</span>
        <div class="db-custom-set-actions">
          <button type="button" data-custom-set-import>Import Set</button>
          <button type="button" data-custom-set-export ${customSet.cards.length === 0 ? 'disabled' : ''}>Export Set</button>
          <button type="button" data-custom-set-new>New Set</button>
          <input type="file" accept=".json,application/json" data-custom-set-file hidden />
        </div>
      </div>
      <p class="db-custom-set-status" data-custom-set-status role="status"></p>
      <p class="db-custom-set-hint">Click a card in the search results below to add it here. Click a card above to add it to your deck.</p>
      <div class="db-custom-set-grid">
        ${customSet.cards.length === 0 ? '<p class="db-custom-set-empty">This set is empty. Search for cards below and click them to add.</p>' : customSet.cards.map(tileHtml).join('')}
      </div>`;

// The browser's double-click interval is around 500 ms; a shorter wait would still add on a slow double-click.
const DOUBLE_CLICK_WINDOW_MS = 300;

const downloadJson = (text, fileName) => {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

/**
 * @param {object} options
 * @param {HTMLElement} options.panelEl
 * @param {Storage} options.storage where the set is saved (localStorage in the builder tab)
 * @param {(card: object) => void} options.onAddToDeck adds a card from the set to the open deck
 */
export const initializeNativeDeckBuilderCustomSet = ({ panelEl, storage, onAddToDeck }) => {
  let customSet = loadCustomSetFromStorage(storage);
  let statusMessage = '';
  let statusIsError = false;

  const setStatus = (message, isError = false) => {
    statusMessage = message;
    statusIsError = isError;
    const statusEl = panelEl.querySelector('[data-custom-set-status]');
    if (!statusEl) return;
    statusEl.textContent = statusMessage;
    statusEl.classList.toggle('is-error', statusIsError);
  };

  const render = () => {
    panelEl.innerHTML = panelHtml(customSet);
    setStatus(statusMessage, statusIsError);
  };

  // A failed write (quota, storage off) keeps the set in memory for this visit; the export is the backup.
  const commit = (nextSet) => {
    customSet = nextSet;
    const saved = saveCustomSetToStorage(storage, customSet);
    render();
    if (!saved) setStatus('Could not save this set in the browser. Export it to keep it.', true);
  };

  const addFromSearch = (card) => {
    if (customSetHasCard(customSet, card?.id)) {
      setStatus(`${card.name} is already in this set.`);
      return;
    }
    commit(addCardToCustomSet(customSet, card));
  };

  const importFile = async (file) => {
    let parsed;
    try {
      parsed = parseCustomSetFile(await file.text());
    } catch {
      setStatus('Could not read that file.', true);
      return;
    }
    if (!parsed.ok) {
      setStatus(parsed.error, true);
      return;
    }
    const base = customSet.cards.length === 0 ? { ...customSet, name: parsed.name } : customSet;
    const { customSet: merged, addedCount } = mergeCardsIntoCustomSet(base, parsed.cards);
    commit(merged);
    const skipped = parsed.skippedCount ? ` ${parsed.skippedCount} unreadable card(s) skipped.` : '';
    setStatus(`Imported ${addedCount} new card(s) from “${parsed.name}”.${skipped}`);
  };

  // A single click adds to the deck only after the double-click window, so a double-click removes the
  // card from the set without also adding a copy to the deck.
  let pendingAddTimer = null;
  const cancelPendingAdd = () => {
    clearTimeout(pendingAddTimer);
    pendingAddTimer = null;
  };

  panelEl.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-custom-set-add]');
    if (addButton) {
      const card = customSet.cards[Number(addButton.dataset.customSetAdd)];
      cancelPendingAdd();
      pendingAddTimer = setTimeout(() => {
        pendingAddTimer = null;
        onAddToDeck(card);
      }, DOUBLE_CLICK_WINDOW_MS);
      return;
    }
    const removeButton = event.target.closest('[data-custom-set-remove]');
    if (removeButton) {
      // The second click of a double-click lands on the next card's × after the first click re-rendered.
      if (event.detail > 1) return;
      const card = customSet.cards[Number(removeButton.dataset.customSetRemove)];
      if (card) commit(removeCardFromCustomSet(customSet, card.id));
      return;
    }
    if (event.target.closest('[data-custom-set-export]')) {
      if (customSet.cards.length === 0) return;
      downloadJson(serializeCustomSet(customSet), customSetFileName(customSet.name));
      setStatus(`Exported “${customSet.name}”.`);
      return;
    }
    if (event.target.closest('[data-custom-set-import]')) {
      panelEl.querySelector('[data-custom-set-file]')?.click();
      return;
    }
    if (event.target.closest('[data-custom-set-new]')) {
      if (customSet.cards.length > 0 && !window.confirm('Start a new set? The current set is discarded unless you exported it.')) return;
      commit(createEmptyCustomSet());
    }
  });

  panelEl.addEventListener('dblclick', (event) => {
    const tile = event.target.closest('[data-custom-set-index]');
    // The × already removed the card on its first click.
    if (!tile || event.target.closest('[data-custom-set-remove]')) return;
    cancelPendingAdd();
    const card = customSet.cards[Number(tile.dataset.customSetIndex)];
    if (card) commit(removeCardFromCustomSet(customSet, card.id));
  });

  panelEl.addEventListener('change', (event) => {
    if (event.target.matches('[data-custom-set-file]')) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) importFile(file);
      return;
    }
    if (event.target.matches('.db-custom-set-name')) {
      commit(renameCustomSet(customSet, event.target.value));
    }
  });

  render();

  return { addFromSearch };
};
