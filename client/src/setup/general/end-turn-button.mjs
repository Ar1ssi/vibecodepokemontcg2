/**
 * The board's End Turn button. It clicks the Pass button rather than calling pass()
 * directly: rules mode ends the turn from a capture-phase hook on that button
 * (hookTurnButton in rules-bridge.js), and server authority dispatches from its
 * bubble handler — the same route as the Alt+T shortcut (keybinds.js).
 *
 * @param {Document} doc
 * @returns {boolean} whether the button was wired
 */
export function wireEndTurnButton(doc = document) {
  const endTurnButton = doc.getElementById('endTurnButton');
  const passButton = doc.getElementById('p2PassButton');
  if (!endTurnButton || !passButton) return false;
  if (endTurnButton.dataset.endTurnWired) return true;
  endTurnButton.dataset.endTurnWired = '1';
  endTurnButton.addEventListener('click', () => passButton.click());
  return true;
}
