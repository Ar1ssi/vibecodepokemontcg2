// Pure decision logic for whether a single click on a card should open the
// TCG Live-style attack/ability preview (design 008, Component 4). No DOM
// access — click-events.js is the thin caller that applies the decision.
//
// Kept out of attack-preview.js so it can be unit-tested without pulling in
// that module's DOM-heavy imports (full-view.js, chat-buttons.js) — R9.

/**
 * @param {object} args
 * @param {string} args.zoneId - `mouseClick.zoneId` of the clicked card.
 * @param {string} args.cardUser - `mouseClick.cardUser` of the clicked card ('self' | 'opp').
 * @param {boolean} args.hasSelectHighlight - true when the click target carries the
 *   `selectHighlight` class (R1) — the move-to-active flow owns that click, not this preview.
 * @param {boolean} args.hasAbility - whether the (benched) card has an ability (D6).
 * @param {{ allowed: boolean }} args.gate - result of
 *   `canPerformAction({ user: cardUser, action: 'attack' })` (R2) — turn/phase legality,
 *   not attack payability, which the overlay itself renders per-zone (D4).
 * @returns {'attack' | 'ability' | null}
 */
export function shouldOpenAttackPreview({
  zoneId,
  cardUser,
  hasSelectHighlight,
  hasAbility,
  gate,
}) {
  if (hasSelectHighlight) return null;
  if (cardUser !== 'self') return null;

  if (zoneId === 'active') {
    return gate?.allowed ? 'attack' : null;
  }

  if (zoneId === 'bench') {
    return hasAbility ? 'ability' : null;
  }

  return null;
}
