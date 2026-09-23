// Pure helpers: scan active + bench for once-per-turn abilities the player can
// use interactively (same gate as runAbilitySteps / ability-picker).

import { isAbilityCard, classifyAbility } from './ability-effects.mjs';
import { parseAbility } from './abilities.mjs';
import { planAbilitySteps, actionableAbilityPlan } from './ability-step-plan.mjs';
import { cardAbilityText } from './ability-executors.mjs';
import { abilityActivationBlockReason } from './ability-combat.mjs';

/**
 * True when a card has an ability with at least one interactive step and is not
 * already marked used this turn, and every position/turn gate passes.
 *
 * The gates come from `abilityActivationBlockReason`, the same reader the
 * server's validateLegality calls, so the picker greys out exactly what the
 * server would reject (design 034 slice 3). Callers with board context
 * (sideCards/opponentSideCards/sideActive/…) get suppression parity too;
 * callers without it only lose the checks that need that context.
 *
 * `zone` defaults to 'active' (no position gate) and `koedLastOppTurn` defaults
 * to true (no KO-turn gate) so callers without that context keep today's
 * behavior; the glow/affordance path threads the real values.
 */
export function isUsableAbilityCard(card, opts = {}) {
  const {
    rulesEnabled = true,
    used = false,
    zone = 'active',
    koedLastOppTurn = true,
    ...ctx
  } = opts;
  if (!card || !isAbilityCard(card)) return false;
  const blocked = abilityActivationBlockReason(card, {
    ...ctx,
    rulesEnabled,
    used,
    zone,
    koedLastOppTurn,
  });
  if (blocked) return false;

  const steps = parseAbility(cardAbilityText(card));
  const plan = planAbilitySteps(steps, { mode: 'interactive' });
  const actionable = actionableAbilityPlan(plan, { mode: 'interactive' }).filter(
    (item) => item.action !== 'promotion'
  );
  return actionable.length > 0;
}

/**
 * True when a card carries an ability with at least one interactive step,
 * independent of whether it's already been used this turn (design 008 D6 —
 * the bench-overlay-opens gate cares only about presence, not usability; the
 * overlay itself renders an already-used ability plain-but-visible per D4).
 */
export function benchCardHasAbility(card) {
  return isUsableAbilityCard(card, { rulesEnabled: false });
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
 * @param {{ rulesEnabled?: boolean, isUsed?: (card) => boolean,
 *           koedLastOppTurn?: boolean }} opts
 *   Extra keys (sideCards/opponentSideCards/sideActive/…) pass through to
 *   `abilityActivationBlockReason` so callers with board context get
 *   suppression parity with the server.
 */
export function filterUsableAbilities(
  candidates = [],
  { rulesEnabled = true, isUsed = () => false, koedLastOppTurn = true, ...ctx } = {}
) {
  const usable = [];
  for (const entry of candidates) {
    const { card, zone, index } = entry;
    if (
      !isUsableAbilityCard(card, {
        ...ctx,
        rulesEnabled,
        used: isUsed(card),
        zone,
        koedLastOppTurn,
      })
    ) {
      continue;
    }
    const firstAbility =
      Array.isArray(card.abilities) && card.abilities.length > 0 ? card.abilities[0] : null;
    const abilityName =
      (typeof firstAbility === 'object' ? firstAbility?.name : null) ||
      card.ability?.name ||
      'Ability';
    usable.push({
      card,
      zone,
      index,
      family: classifyAbility(card),
      abilityName,
    });
  }
  return usable;
}
