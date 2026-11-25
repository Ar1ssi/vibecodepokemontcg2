/**
 * TCG Live's "View Board": a menu button that hides the menu so the player can
 * look at the board, then brings it back. Only the overlay's look changes
 * (`.is-viewing-board` in index.css) — the menu stays mounted with its state.
 * Clicks pass through to the board, but only to inspect (`viewBoardTapRoute`):
 * piles open their viewers, Pokémon their stack view; drags, select-to-move and
 * the action menu stay off, so viewing never turns into a stray board action.
 *
 * @param {Document} doc
 * @param {HTMLElement} overlay the menu's full-screen overlay
 * @returns {HTMLButtonElement}
 */
export function createViewBoardButton(doc, overlay) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'view-board-button';

  const render = () => {
    const viewing = overlay.classList.contains('is-viewing-board');
    button.textContent = viewing ? 'Back' : 'View Board';
    button.setAttribute('aria-pressed', String(viewing));
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    overlay.classList.toggle('is-viewing-board');
    render();
  });
  render();
  return button;
}

/** @returns {boolean} true while a menu is turned see-through by View Board. */
export function isViewingBoard(doc = globalThis.document) {
  return Boolean(doc?.querySelector?.('.is-viewing-board'));
}

const IN_PLAY_ZONES = new Set(['active', 'bench']);

/**
 * What a board click does while viewing: only looks, never acts.
 * @param {{ zoneId?: string }} click
 * @returns {'pile'|'stack'|'preview'|'none'} the discard viewer, the read-only stack view, the
 *   floating card zoom, or nothing (hand, deck, Prizes: hidden or private cards)
 */
export function viewBoardTapRoute({ zoneId } = {}) {
  if (zoneId === 'discard') return 'pile';
  if (IN_PLAY_ZONES.has(zoneId)) return 'stack';
  if (['stadium', 'attachedCards', 'board', 'lostZone'].includes(zoneId)) return 'preview';
  return 'none';
}
