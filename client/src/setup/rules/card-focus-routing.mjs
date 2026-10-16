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
