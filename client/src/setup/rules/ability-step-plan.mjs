// Pure planning for compound Pokémon ability steps (DOM-free, node:test friendly).
// Maps parseAbility() step types to orchestration actions for auto vs interactive paths.

/** Step types handled by passive hooks — skip in step orchestration. */
export const PASSIVE_ABILITY_STEP_TYPES = new Set([
  'passiveAbility',
  'damageReductionAbility',
  'damageBonusAbility',
  'damagePreventAbility',
  'retreatCostAbility',
  'costDiscountAbility',
  'hpBonusAbility',
  'weaknessAbility',
  'setupAbility',
  'toolCapAbility',
  'prizeModifyAbility',
  'effectPreventAbility',
  'energyMultiplierAbility',
  'thornsAbility',
  'koPreventionAbility',
  'attackInheritanceAbility',
  'firstTurnAttackAbility',
  'checkupAbility',
  'onOpponentEvolveAbility',
  'onPromotionAbility',
  'endOfTurnAbility',
  'recursionAbility',
  'statusAbility',
]);

/** chat-buttons.js executor keys for actionable once-per-turn steps. */
export const EXECUTOR_BY_STEP = {
  healAbility: 'heal',
  switchAbility: 'switch',
  attachAbility: 'attach',
  moveEnergyAbility: 'energy-redirect',
  moveDamageAbility: 'move-damage',
  statusAbility: 'status',
  lookAtTopAbility: 'look-at-top',
  evolveAbility: 'evolve',
  recursionFromDiscardAbility: 'recursion-discard',
};

/**
 * Plan ordered orchestration for ability steps.
 *
 * @param {Array} steps - output of parseAbility()
 * @param {{ mode?: 'auto' | 'interactive' }} opts
 *   - auto: board-on-play — only deterministic self-draw executes; opponentDraw announces
 *   - interactive: ability button / attack window — full step chain with pickers/executors
 * @returns {Array<{ action: string, step: object, executor?: string, stepIndex: number }>}
 */
export function planAbilitySteps(steps = [], { mode = 'auto' } = {}) {
  const planned = [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    const base = { step, stepIndex };

    if (PASSIVE_ABILITY_STEP_TYPES.has(step.type)) {
      planned.push({ ...base, action: 'skip', reason: 'passive' });
      continue;
    }

    switch (step.type) {
      case 'drawAbility':
        planned.push({ ...base, action: 'draw' });
        break;
      case 'opponentDraw':
        planned.push({
          ...base,
          action: mode === 'auto' ? 'announce' : 'opponent-draw',
        });
        break;
      case 'searchAbility':
        planned.push({ ...base, action: 'search' });
        break;
      case 'lookAtTopAbility':
        planned.push({
          ...base,
          action: mode === 'auto' ? 'announce' : 'look-at-top',
        });
        break;
      case 'whenPlayedAbility':
        planned.push({ ...base, action: 'when-played' });
        break;
      case 'recursionFromDiscardAbility':
        planned.push({
          ...base,
          action: mode === 'auto' ? 'announce' : 'executor',
          executor: 'recursion-discard',
        });
        break;
      case 'opponentDisruptAbility':
        planned.push({
          ...base,
          action: mode === 'auto' ? 'announce' : 'opponent-disrupt',
        });
        break;
      default:
        if (EXECUTOR_BY_STEP[step.type]) {
          planned.push({
            ...base,
            action: mode === 'auto' ? 'announce' : 'executor',
            executor: EXECUTOR_BY_STEP[step.type],
          });
        } else {
          planned.push({ ...base, action: 'announce' });
        }
        break;
    }
  }

  return planned;
}

/** Actionable steps (not skip/passive-only announce on auto board path). */
export function actionableAbilityPlan(plan = [], { mode = 'auto' } = {}) {
  return plan.filter((item) => {
    if (item.action === 'skip') return false;
    if (mode === 'auto') {
      return item.action === 'draw' || item.action === 'when-played';
    }
    return item.action !== 'announce';
  });
}

/** True when both when-played and search steps are present (any order). */
export function hasWhenPlayedSearchChain(steps = []) {
  const hasWhen = steps.some((s) => s.type === 'whenPlayedAbility');
  const hasSearch = steps.some((s) => s.type === 'searchAbility');
  return hasWhen && hasSearch;
}
