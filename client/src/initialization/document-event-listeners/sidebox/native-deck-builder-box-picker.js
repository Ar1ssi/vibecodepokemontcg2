import {
  boxById,
  boxThumbUrl,
  defaultBox,
  filterBoxes,
  loadBoxCatalog,
} from '../../../setup/deck-builder/core/customize-stage/boxes.mjs';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/**
 * Deck box picker for the Customize tab (design 071): a gallery of TCG Live's deck boxes by their
 * thumbnails. The default box is stored as null. Wears the sleeve gallery's classes, so it shares its
 * layout; the 3D preview is the customize stage's, not a picture here.
 *
 * @param {object} options
 * @param {HTMLElement} options.panelEl
 * @param {(box: object|null) => void} options.onChange - the picked box, or null for the default
 * @returns {{ setSelected: (id: string|null) => void, getSelected: () => object|null, catalog: () => object|null } | null}
 */
export const initializeDeckBuilderBoxPicker = ({ panelEl, onChange }) => {
  if (!panelEl) return null;

  let catalog = null;
  let selectedId = null;
  let filterTerm = '';

  panelEl.innerHTML = [
    '<div class="native-deck-builder-section-title-row">',
    '  <input class="native-deck-builder-box-filter" type="text"',
    '    placeholder="Filter deck boxes..." aria-label="Filter deck boxes by name" />',
    '</div>',
    '<div class="native-deck-builder-sleeve-gallery"><div class="native-deck-builder-sleeve-empty">Loading deck boxes...</div></div>',
  ].join('');
  const galleryEl = panelEl.querySelector('.native-deck-builder-sleeve-gallery');
  const filterInput = panelEl.querySelector('.native-deck-builder-box-filter');

  const thumbHtml = (box, { id, selected }) => [
    `<button class="native-deck-builder-sleeve-thumb${selected ? ' selected' : ''}" data-box-id="${escapeHtml(id)}" title="${escapeHtml(box.name)}" aria-pressed="${selected ? 'true' : 'false'}">`,
    `  <img src="${escapeHtml(boxThumbUrl(box))}" alt="${escapeHtml(box.name)}" loading="lazy" />`,
    '</button>',
  ].join('');

  const render = () => {
    if (!catalog) return;
    const fallback = defaultBox(catalog);
    const visible = filterBoxes(catalog.boxes.filter((box) => box.id !== fallback.id), filterTerm);
    const showDefault = filterBoxes([fallback], filterTerm).length > 0 || filterTerm.trim() === '';
    const items = [
      showDefault ? thumbHtml(fallback, { id: '', selected: !selectedId }) : '',
      ...visible.map((box) => thumbHtml(box, { id: box.id, selected: box.id === selectedId })),
    ].filter(Boolean);
    galleryEl.innerHTML = items.length
      ? items.join('')
      : '<div class="native-deck-builder-sleeve-empty">No deck boxes match your filter.</div>';
    galleryEl.querySelectorAll('[data-box-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.boxId || null;
        selectedId = id && selectedId === id ? null : id;
        render();
        onChange?.(selectedId ? boxById(catalog, selectedId) : null);
      });
    });
  };

  filterInput.addEventListener('input', () => {
    filterTerm = filterInput.value;
    render();
  });

  loadBoxCatalog()
    .then((loaded) => {
      catalog = loaded;
      render();
    })
    .catch((error) => {
      galleryEl.innerHTML = '<div class="native-deck-builder-sleeve-empty">Deck boxes are unavailable.</div>';
      console.warn('[deck box picker] catalog unavailable.', error);
    });

  return {
    setSelected: (id) => {
      selectedId = id || null;
      render();
    },
    getSelected: () => (catalog && selectedId ? boxById(catalog, selectedId) : null),
    catalog: () => catalog,
  };
};
