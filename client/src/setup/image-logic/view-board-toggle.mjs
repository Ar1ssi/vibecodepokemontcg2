/**
 * TCG Live's "View Board": a menu button that hides the menu so the player can
 * look at the board, then brings it back. Only the overlay's look changes
 * (`.is-viewing-board` in index.css) — the menu stays mounted with its state, and
 * it keeps blocking the board, so viewing never turns into a stray board action.
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
