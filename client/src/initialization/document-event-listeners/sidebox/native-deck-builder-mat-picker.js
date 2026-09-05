import {
  listMats,
  searchMats,
} from '../../../setup/deck-builder/core/mats.mjs';

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/**
 * Playmat picker for the Customize tab. Renders a lazy-loaded grid of ~320px
 * mat thumbnails (the full-size PNGs are far too heavy for a 169-tile grid)
 * plus a "No mat" tile that clears the selection.
 *
 * The local image directories are gitignored, so every tile falls back to the
 * scrape's remote CDN original if its thumbnail is missing.
 *
 * @param {object} options
 * @param {HTMLElement} options.panelEl - container element
 * @param {function} options.onChange - called with the selected mat (or null)
 * @returns {object|null} controller, or null when the panel is missing
 */
export const initializeDeckBuilderMatPicker = ({ panelEl, onChange }) => {
  if (!panelEl) return null;

  const mats = listMats();

  let selectedId = null;
  let filterTerm = '';

  panelEl.innerHTML = [
    '<div class="native-deck-builder-section-title-row">',
    '  <div class="native-deck-builder-section-title-wrap">',
    '    <div class="native-deck-builder-section-title">Mat</div>',
    `    <span class="native-deck-builder-set-browser-series-tag">Playmats · ${mats.length}</span>`,
    '  </div>',
    '  <input class="native-deck-builder-mat-filter" type="text"',
    '    placeholder="Filter mats..." aria-label="Filter mats by name" />',
    '</div>',
    '<div class="native-deck-builder-mat-preview" aria-live="polite"></div>',
    '<div class="native-deck-builder-mat-gallery"></div>',
  ].join('');

  const previewEl = panelEl.querySelector('.native-deck-builder-mat-preview');
  const galleryEl = panelEl.querySelector('.native-deck-builder-mat-gallery');
  const filterInput = panelEl.querySelector('.native-deck-builder-mat-filter');

  const matImageSrc = (mat) => mat.thumb || mat.imageUrl || mat.image || '';
  const matImageFallback = (mat) => {
    if (mat.thumb && mat.imageUrl) return mat.imageUrl;
    if (mat.imageUrl && mat.image) return mat.image;
    return '';
  };

  const imgTag = (mat, className = '') => {
    const src = matImageSrc(mat);
    const fallback = matImageFallback(mat);
    return [
      `<img class="${className}" src="${escapeHtml(src)}"`,
      ' referrerpolicy="no-referrer"',
      fallback ? ` data-fallback="${escapeHtml(fallback)}"` : '',
      ` alt="${escapeHtml(mat.title)}" />`,
    ].join('');
  };

  const layoutLabel = (mat) =>
    mat.layout === 'two-player' ? 'Full size · both players' : 'One-player mat';

  const findMat = (id) => mats.find((mat) => mat.id === id) || null;

  // The thumbnails live in a gitignored directory, so a checkout without the
  // scrape outputs would otherwise render broken tiles.
  const wireImageFallbacks = (root) => {
    root.querySelectorAll('img[data-fallback]').forEach((img) => {
      img.addEventListener('error', () => {
        const fallback = img.dataset.fallback;
        if (!fallback || img.src === fallback) return;
        delete img.dataset.fallback;
        img.src = fallback;
      });
    });
  };

  const renderPreview = () => {
    const mat = findMat(selectedId);
    if (!mat) {
      previewEl.innerHTML =
        '<span class="native-deck-builder-mat-preview-none">No mat selected — the board uses the simulator playmat.</span>';
      return;
    }
    previewEl.innerHTML = [
      imgTag(mat, 'native-deck-builder-mat-preview-image'),
      '<div class="native-deck-builder-mat-preview-text">',
      `  <strong>${escapeHtml(mat.title)}</strong>`,
      `  <span>${escapeHtml(layoutLabel(mat))}</span>`,
      '</div>',
    ].join('');
    wireImageFallbacks(previewEl);
  };

  const renderGallery = () => {
    const visible = searchMats(filterTerm);

    const noMatTile = [
      `<button class="native-deck-builder-mat-cell native-deck-builder-mat-cell-none${
        selectedId ? '' : ' selected'
      }" data-mat-id="" title="No mat" aria-pressed="${selectedId ? 'false' : 'true'}">`,
      '  <span class="native-deck-builder-mat-cell-blank">No mat</span>',
      '  <span class="native-deck-builder-mat-cell-name">Simulator board</span>',
      '</button>',
    ].join('');

    galleryEl.innerHTML =
      noMatTile +
      (visible.length === 0
        ? '<div class="native-deck-builder-mat-empty">No mats match your filter.</div>'
        : '') +
      visible
        .map((mat) => {
          const isSelected = mat.id === selectedId;
          return [
            `<button class="native-deck-builder-mat-cell${isSelected ? ' selected' : ''}" data-mat-id="${escapeHtml(mat.id)}" title="${escapeHtml(mat.title)}" aria-pressed="${isSelected ? 'true' : 'false'}">`,
            `  <img src="${escapeHtml(matImageSrc(mat))}" referrerpolicy="no-referrer"${
              matImageFallback(mat)
                ? ` data-fallback="${escapeHtml(matImageFallback(mat))}"`
                : ''
            } alt="${escapeHtml(mat.title)}" loading="lazy" />`,
            `  <span class="native-deck-builder-mat-cell-name">${escapeHtml(mat.title)}</span>`,
            mat.layout === 'two-player'
              ? '  <span class="native-deck-builder-mat-cell-badge">Full size</span>'
              : '',
            '</button>',
          ].join('');
        })
        .join('');

    wireImageFallbacks(galleryEl);

    galleryEl.querySelectorAll('[data-mat-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.matId || null;
        // clicking the active mat clears it, same as the coin and sleeve grids
        selectedId = !id || selectedId === id ? null : id;
        renderPreview();
        renderGallery();
        onChange?.(findMat(selectedId));
      });
    });
  };

  const applyFilter = (term) => {
    filterTerm = term || '';
    if (filterInput.value !== filterTerm) filterInput.value = filterTerm;
    renderGallery();
  };

  filterInput.addEventListener('input', () => applyFilter(filterInput.value));

  renderPreview();
  renderGallery();

  return {
    setSelected: (id) => {
      selectedId = id || null;
      renderPreview();
      renderGallery();
    },
    getSelected: () => findMat(selectedId),
    filter: (term) => applyFilter(term),
  };
};
