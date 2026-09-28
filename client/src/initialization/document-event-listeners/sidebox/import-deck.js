import { systemState } from '../../../state.js';
import { openBuildBattleWindow, openDeckBuilderWindow } from './deck-builder-window.js';

/**
 * Opens (or focuses) the deck builder tab from the Deck tab (design 050) and
 * says so when the browser's pop-up blocker refused it.
 */
export const openDeckBuilderFromDeckTab = () => showIfBlocked(openDeckBuilderWindow());

/** The same for the Build & Battle tab (design 051); both buttons share the blocked message. */
export const openBuildBattleFromDeckTab = () => showIfBlocked(openBuildBattleWindow());

function showIfBlocked(openedTab) {
  const blockedText = document.getElementById('deckBuilderBlockedText');
  if (blockedText) blockedText.hidden = Boolean(openedTab);
}

export const initializeImport = () => {
  const changeCardBackButton = document.getElementById('changeCardBackButton');
  const mainImportHeaderButton = document.getElementById('mainImportHeaderButton');
  const altImportHeaderButton = document.getElementById('altImportHeaderButton');

  const switchToMain = () => {
    if (mainImportHeaderButton.classList.contains('main-select')) return;
    mainImportHeaderButton.classList.toggle('main-select');
    altImportHeaderButton.classList.toggle('alt-select');
    changeCardBackButton.classList.toggle('self-color');
    changeCardBackButton.classList.toggle('opp-color');
  };

  const switchToAlt = () => {
    if (altImportHeaderButton.classList.contains('alt-select')) return;
    mainImportHeaderButton.classList.toggle('main-select');
    altImportHeaderButton.classList.toggle('alt-select');
    changeCardBackButton.classList.toggle('self-color');
    changeCardBackButton.classList.toggle('opp-color');
  };

  mainImportHeaderButton.addEventListener('click', () => {
    switchToMain();
    document.dispatchEvent(new CustomEvent('deck-target-changed', { detail: { target: 'self' } }));
  });

  altImportHeaderButton.addEventListener('click', () => {
    if (systemState.isTwoPlayer) return;
    switchToAlt();
    document.dispatchEvent(new CustomEvent('deck-target-changed', { detail: { target: 'opp' } }));
  });

  document.addEventListener('deck-target-changed', (event) => {
    const target = event.detail?.target;
    if (target === 'self') switchToMain();
    else if (target === 'opp' && !systemState.isTwoPlayer) switchToAlt();
  });

  const updateAltButtonState = () => {
    altImportHeaderButton.style.cursor = systemState.isTwoPlayer ? 'default' : 'pointer';
    altImportHeaderButton.style.opacity = systemState.isTwoPlayer ? '0.5' : '';
    // P2 is Solo-only: a room joined while P2 was picked falls back to P1.
    if (systemState.isTwoPlayer && altImportHeaderButton.classList.contains('alt-select')) {
      switchToMain();
      document.dispatchEvent(new CustomEvent('deck-target-changed', { detail: { target: 'self' } }));
    }
  };
  updateAltButtonState();
  const deckImportButton = document.getElementById('deckImportButton');
  if (deckImportButton) deckImportButton.addEventListener('click', updateAltButtonState);

  document
    .getElementById('openDeckBuilderButton')
    ?.addEventListener('click', openDeckBuilderFromDeckTab);
  document
    .getElementById('openBuildBattleButton')
    ?.addEventListener('click', openBuildBattleFromDeckTab);
};
