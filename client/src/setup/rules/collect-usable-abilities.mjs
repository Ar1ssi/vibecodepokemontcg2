// Pure helpers: scan active + bench for once-per-turn abilities the player can
// use interactively (same gate as runAbilitySteps / ability-picker).

import { isAbilityCard, classifyAbility } from './ability-effects.mjs';
import { parseAbility } from './abilities.mjs';
import { planAbilitySteps, actionableAbilityPlan } from './ability-step-plan.mjs';

/**
 * True when a card has an ability with at least one interactive step and is not
 * already marked used this turn.
 */
export function isUsableAbilityCard(
  card,
  { rulesEnabled = true, used = false } = {}
) {
  if (!card || !isAbilityCard(card)) return false;
  if (rulesEnabled && used) return false;

  const abilityText =
    card.ability?.text ?? card.abilityText ?? card.text ?? '';
  const steps = parseAbility(abilityText);
  const plan = planAbilitySteps(steps, { mode: 'interactive' });
  const actionable = actionableAbilityPlan(plan, { mode: 'interactive' });
  return actionable.length > 0;
}

/** Build scan candidates from active + bench (bench Pokémon only). */
export function collectUsableAbilityCandidates(activeCard, benchCards = []) {
  const candidates = [];
  if (activeCard) {
    candidates.push({ card: activeCard, zone: 'active', index: 0 });
  }
  benchCards.forEach((card, index) => {
    if (card?.type === 'Pokémon') {
      candidates.push({ card, zone: 'bench', index });
    }
  });
  return candidates;
}

/**
 * Filter enriched candidates to usable abilities.
 * @param {Array<{ card, zone, index }>} candidates
 * @param {{ rulesEnabled?: boolean, isUsed?: (card) => boolean }} opts
 */
export function filterUsableAbilities(
  candidates = [],
  { rulesEnabled = true, isUsed = () => false } = {}
) {
  const usable = [];
  for (const entry of candidates) {
    const { card, zone, index } = entry;
    if (
      !isUsableAbilityCard(card, {
        rulesEnabled,
        used: isUsed(card),
      })
    ) {
      continue;
    }
    usable.push({
      card,
      zone,
      index,
      family: classifyAbility(card),
      abilityName: card.ability?.name || 'Ability',
    });
  }
  return usable;
}
