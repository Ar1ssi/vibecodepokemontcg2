const COUNTER_SELECTOR = '.self-circle, .opp-circle, .self-tab, .opp-tab';

/**
 * Takes down the legacy counter overlays (damage, special condition, ability)
 * on one player's mat when that side resets.
 *
 * Under the server the same classes are also drawn by apply-view.js, and those
 * elements carry no `handleRemove`: the renderer owns them and removes them with
 * the next view. Calling it anyway threw, which stopped Reset before it reached
 * the server and left this client in setup while the server game carried on.
 *
 * @param {Document|null|undefined} containerDocument One player's mat document
 */
export function clearBoardCounters(containerDocument) {
  if (typeof containerDocument?.querySelectorAll !== 'function') return;
  containerDocument.querySelectorAll(COUNTER_SELECTOR).forEach((element) => {
    if (typeof element.handleRemove !== 'function') return;
    element.textContent = '0';
    element.handleRemove(false);
  });
}
