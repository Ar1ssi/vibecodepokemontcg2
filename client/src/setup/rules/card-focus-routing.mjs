import { isInspectablePokemon } from './card-inspector-model.mjs';

/**
 * PlayerCardOwner.OnCardClicked for a tap on an in-play Pokémon. Your Active always opens the
 * AttackOverlay (ActiveController.CanShowActionSelection is true); a Benched Pokémon of yours only
 * when it has something usable (BenchController.CanShowActionSelection), otherwise the stack view
 * (its deep inspection). The opponent's Pokémon never get action selection, so they open the stack
 * view (OpponentActiveController / BenchController for a card that is not yours).
 *
 * @param {{ zoneId?: string, cardUser?: string, card?: object|null, hasUsableAction?: boolean }} tap
 * @returns {'overlay'|'stack'|null}
 */
export function tapRoute({ zoneId, cardUser, card, hasUsableAction = false } = {}) {
  if (zoneId !== 'active' && zoneId !== 'bench') return null;
  if (!card?.image || !isInspectablePokemon(card)) return null;
  if (cardUser !== 'self') return 'stack';
  if (zoneId === 'active') return 'overlay';
  return hasUsableAction ? 'overlay' : 'stack';
}

/**
 * Who an AttackOverlay attack acts for. In a two-player room the overlay only shows the viewer's
 * own Active, so it attacks as that owner. Attacking as the turn player instead would, on the
 * opponent's turn, ask the opponent's client to attack (a Rock Tumble tap made the other player's
 * Landorus attack). Off-turn there is no attacker. One-player and solo rooms play both sides, so
 * the turn player attacks.
 *
 * @param {{ owner?: string, turnPlayer?: string|null, isTwoPlayer?: boolean, solo?: boolean }} ctx
 * @returns {string|null} 'self' | 'opp', or null when the owner may not attack now
 */
export function overlayAttacker({ owner, turnPlayer, isTwoPlayer = false, solo = false } = {}) {
  if (!turnPlayer) return owner ?? null;
  if (!isTwoPlayer || solo) return turnPlayer;
  return owner === turnPlayer ? owner : null;
}
