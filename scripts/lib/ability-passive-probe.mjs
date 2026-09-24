// Passive "behave" probes (design 034 slice 7b). A passive ability has nothing for useAbility to
// run, so the behaviour gate cannot watch the board change. Instead it asks the engine's own
// passive readers — the ones reduce.mjs and the effect modules consult at their rule sites — the
// same questions twice on one board: once with the ability printed on the holder, once with it
// stripped. Any answer that differs is a reader consuming the text. The probe is a lower bound:
// a condition the probe board does not meet (a named Stadium, a Pokémon ex Active) reads as
// unconsumed, never the other way round.
import { createCard } from '../../shared/engine/cards.mjs';
import {
  abilityDamageBonus,
  abilityDamageReduction,
  abilityDamagePrevention,
  abilityWeaknessOverride,
  abilityHpBonus,
  abilityPrizeModify,
  abilityRetreatCost,
  abilityAttackCostDiscount,
  abilityIgnoresDefenderEffects,
  abilityExtraTypes,
  abilityEnergyMultiplier,
  isAbilitySuppressed,
  abilityPlayLocks,
  abilityEvolveLock,
  abilityRetreatLock,
  abilityCounterMoveLock,
  abilitySupporterLimit,
  abilityTurnNotEnd,
  abilityForcesOpponentTails,
  abilityAttackFlipGate,
  abilityVictoryStar,
  abilitySetupActive,
  abilityPrizeToBench,
  abilityStatusImmune,
  abilityEvolvePermission,
  abilitySummonRestricted,
  abilityFirstTurnAttack,
  abilityExtraAttack,
} from '../../shared/engine/rules/ability-combat.mjs';
import {
  inPlayEntries,
  parseCheckupAbilities,
  parseOnOpponentEvolveAbilities,
  parseEndOfTurnAbilities,
  parseOnDamageAbilities,
  parseOnKoAbilities,
} from '../../shared/engine/rules/ability-triggers.mjs';
import {
  parseToolCap,
  parseUnlimitedHandEnergyAcceleration,
  passiveCostDiscount,
  teamNoRetreatCostForActive,
  parseAttackInheritance,
} from '../../shared/engine/rules/ability-executors.mjs';
import { parseAttackBorrowAbility } from '../../shared/engine/rules/attack-copy.mjs';
import { combinedToolRetreatCost, evaluateToolKoPrevention } from '../../shared/engine/rules/tool-combat.mjs';
import { buildState, mon } from './oracle-harness.mjs';

const CONDITIONS = ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'];

const roots = (cards) => (cards || []).filter((c) => !c.attachedTo);

/** The reduce.mjs `abilitySideContext` shape for `pid`, plus the target's position. */
function sideContext(state, pid) {
  const own = state.players[pid].zones;
  const other = state.players[pid === 'p1' ? 'p2' : 'p1'].zones;
  return {
    sideCards: [...own.active, ...own.bench],
    opponentSideCards: [...other.active, ...other.bench],
    sideActive: own.active,
    sideBench: own.bench,
    opponentActive: other.active,
    opponentBench: other.bench,
    turnNumber: state.turn.number,
  };
}

const at = (ctx, card) => {
  const isActive = ctx.sideActive.includes(card);
  return { ...ctx, isActive, zone: isActive ? 'active' : 'bench' };
};

// Cards a play or evolve lock can name. Fixed ids above the harness's so both boards match.
function playedCards() {
  const card = (instanceId, props) => createCard({ instanceId, ...props });
  const trainerCard = (instanceId, name, subtypes) =>
    card(instanceId, { name, supertype: 'Trainer', subtypes, type: subtypes[subtypes.length - 1] });
  return [
    trainerCard(9001, 'Probe Item', ['Item']),
    trainerCard(9002, 'Probe Supporter', ['Supporter']),
    trainerCard(9003, 'Probe Stadium', ['Stadium']),
    trainerCard(9004, 'Probe Tool', ['Pokémon Tool']),
    trainerCard(9005, 'Probe ACE', ['Item', 'ACE SPEC']),
    card(9006, { name: 'Probe Special Energy', supertype: 'Energy', subtypes: ['Special'], type: 'Energy' }),
    mon('Probe Basic', { instanceId: 9007 }),
    mon('Probe Ability Mon', {
      instanceId: 9008,
      abilities: [{ name: 'Probe Power', type: 'Ability', text: 'Once during your turn, you may draw a card.' }],
    }),
    mon('Probe Evolution', { instanceId: 9009, stage: 'Stage 1', subtypes: ['Stage 1'], evolvesFrom: 'p2Active' }),
  ];
}

// Stable text for a reader's answer: cards collapse to their instance id, so an answer that
// merely echoes the holder (which differs only by its printed ability) is not a read.
function answerKey(value) {
  return JSON.stringify(value ?? null, (_, v) =>
    v && typeof v === 'object' && 'instanceId' in v && 'supertype' in v ? `#${v.instanceId}` : v
  );
}

// "If you have Volbeat in play" / "If you have Simisage, Simisear, and Simipour in play": the
// Pokémon a condition names, so the probe board can have them on the Bench.
export function namedPartners(text) {
  const list = String(text).match(/[Ii]f you have ((?:[A-Z][\w'’.-]*(?: [A-Z][\w'’.-]*)*(?:, | and |, and )?)+) in play/)?.[1];
  return list ? list.split(/, and |, | and /).map((n) => n.trim()).filter(Boolean) : [];
}

/**
 * The probe board: `holder()` is p1's Active or first Benched Pokémon; named partners replace
 * p1's other Benched Pokémon; a `bare` holder has nothing attached and no damage (for "if this
 * Pokémon has no Energy attached" / "has full HP" conditions).
 */
function probeBoard(holder, zone, { bare, partners }) {
  const state = buildState(holder, zone);
  const z = state.players.p1.zones;
  const holderCard = [...z.active, ...z.bench].find(
    (c) => !c.attachedTo && c.name !== 'p1Active' && !/^p1Bench/.test(c.name)
  );
  const others = z.bench.filter((c) => !c.attachedTo && c !== holderCard);
  partners.forEach((name, i) => {
    if (others[i]) others[i].name = name;
  });
  if (bare && holderCard) {
    holderCard.damage = 0;
    for (const zoneName of ['active', 'bench']) {
      z[zoneName] = z[zoneName].filter((c) => c.attachedTo !== holderCard.instanceId);
    }
  }
  return { state, holderCard };
}

/**
 * Every probe question, answered on each probe board (see `probeBoard`). Returns
 * `{ '<board>:<reader>:<case>': answerKey | 'THROW' }`.
 */
function probeAnswers(holder, { turnTrainerName, partners }) {
  const answers = {};
  const boards = [
    ['active', false],
    ['bench', false],
    ['active', true],
    ['bench', true],
  ];
  for (const [zone, bare] of boards) {
    const board = `${zone}${bare ? '-bare' : ''}`;
    const { state, holderCard } = probeBoard(holder, zone, { bare, partners });
    const p1 = sideContext(state, 'p1');
    const p2 = sideContext(state, 'p2');
    const own = roots(p1.sideCards);
    const opp = roots(p2.sideCards);
    const [p1Active] = roots(p1.sideActive);
    const [p2Active] = roots(p2.sideActive);
    // Suppression is only visible on a card that has an Ability of its own.
    p2Active.abilities = [{ name: 'Probe Power', type: 'Ability', text: 'Once during your turn, you may draw a card.' }];
    const played = playedCards();
    const ask = (label, fn) => {
      try {
        answers[`${board}:${label}`] = answerKey(fn());
      } catch {
        answers[`${board}:${label}`] = 'THROW';
      }
    };

    for (const card of own) {
      const ctx = at(p1, card);
      ask(`damageBonus:${card.name}`, () => abilityDamageBonus(card, p2Active, ctx));
      ask(`damageReduction:${card.name}`, () => abilityDamageReduction(card, p2Active, ctx));
      ask(`damagePrevention:${card.name}`, () => abilityDamagePrevention(card, p2Active, ctx));
      ask(`weakness:${card.name}`, () => abilityWeaknessOverride(card, ctx));
      ask(`hp:${card.name}`, () => abilityHpBonus(card, ctx));
      ask(`prize:${card.name}`, () => abilityPrizeModify(card, ctx));
      ask(`retreat:${card.name}`, () => abilityRetreatCost(card, ctx));
      ask(`costDiscount:${card.name}`, () => abilityAttackCostDiscount(card, ctx));
      ask(`extraTypes:${card.name}`, () => abilityExtraTypes(card, ctx));
      ask(`suppressed:${card.name}`, () => isAbilitySuppressed(card, ctx));
      const zoneCards = ctx.isActive ? p1.sideActive : p1.sideBench;
      ask(`ownRetreat:${card.name}`, () => combinedToolRetreatCost(2, card, zoneCards));
      ask(`koPrevention:${card.name}`, () =>
        evaluateToolKoPrevention(card, zoneCards, {
          currentDamage: card.damage || 0,
          incomingDamage: 1000,
          baseHp: card.hp,
          inHp: true,
        })
      );
    }
    for (const card of opp) {
      const ctx = at(p2, card);
      ask(`opp:damageBonus:${card.name}`, () => abilityDamageBonus(card, p1Active, ctx));
      ask(`opp:damageReduction:${card.name}`, () => abilityDamageReduction(card, p1Active, ctx));
      ask(`opp:damagePrevention:${card.name}`, () => abilityDamagePrevention(card, p1Active, ctx));
      ask(`opp:weakness:${card.name}`, () => abilityWeaknessOverride(card, ctx));
      ask(`opp:hp:${card.name}`, () => abilityHpBonus(card, ctx));
      ask(`opp:prize:${card.name}`, () => abilityPrizeModify(card, ctx));
      ask(`opp:retreat:${card.name}`, () => abilityRetreatCost(card, ctx));
      ask(`opp:suppressed:${card.name}`, () => isAbilitySuppressed(card, ctx));
    }
    for (const [side, ctx] of [['p1', p1], ['p2', p2]]) {
      for (const card of played) ask(`playLock:${side}:${card.name}`, () => abilityPlayLocks(card, ctx));
      ask(`evolveLock:${side}`, () => abilityEvolveLock(played[8], ctx));
      ask(`retreatLock:${side}`, () => abilityRetreatLock(roots(ctx.sideActive)[0], at(ctx, roots(ctx.sideActive)[0])));
      ask(`attackFlipGate:${side}`, () => abilityAttackFlipGate(roots(ctx.opponentActive)[0], ctx));
      ask(`forcesTails:${side}`, () => abilityForcesOpponentTails(ctx));
      ask(`victoryStar:${side}`, () => abilityVictoryStar(ctx));
      ask(`supporterLimit:${side}`, () => abilitySupporterLimit(ctx));
      ask(`turnNotEnd:${side}`, () => abilityTurnNotEnd({ name: turnTrainerName || 'Probe Supporter' }, ctx));
      ask(`noRetreatForActive:${side}`, () => teamNoRetreatCostForActive(roots(ctx.sideActive)[0], roots(ctx.sideBench)));
    }
    ask('counterMoveLock', () => abilityCounterMoveLock(p1));
    ask('energyMultiplier', () => abilityEnergyMultiplier(p1.sideCards));
    ask('checkup', () => parseCheckupAbilities(inPlayEntries(state), p1));
    ask('onOpponentEvolve', () => parseOnOpponentEvolveAbilities(inPlayEntries(state), p1));
    ask('endOfTurn', () => parseEndOfTurnAbilities(inPlayEntries(state), p1));
    ask('onKo', () => parseOnKoAbilities(inPlayEntries(state), p1));

    if (!holderCard) continue;
    const ctx = at(p1, holderCard);
    ask('onDamage', () => parseOnDamageAbilities(holderCard, ctx));
    ask('ignoresDefenderEffects', () => abilityIgnoresDefenderEffects(holderCard));
    ask('setupActive', () => [abilitySetupActive(holderCard), abilitySetupActive(holderCard, { goingSecond: true })]);
    ask('prizeToBench', () => abilityPrizeToBench(holderCard));
    ask('statusImmune', () => CONDITIONS.map((c) => abilityStatusImmune(holderCard, c)));
    ask('evolvePermission', () => [1, 2].map((turnNumber) => abilityEvolvePermission(holderCard, { ...ctx, turnNumber })));
    ask('summonRestricted', () => abilitySummonRestricted(holderCard));
    ask('firstTurnAttack', () => abilityFirstTurnAttack(holderCard, { ...ctx, turnNumber: 1 }));
    ask('extraAttack', () => abilityExtraAttack(holderCard));
    ask('toolCap', () => parseToolCap(holderCard));
    ask('handEnergyAcceleration', () => parseUnlimitedHandEnergyAcceleration(holderCard));
    ask('passiveCostDiscount', () => passiveCostDiscount(holderCard));
    ask('attackInheritance', () => parseAttackInheritance(holderCard));
  }
  return answers;
}

/**
 * The passive readers that consume `text` printed on a Pokémon named `name`: the probe labels
 * (`<zone>:<reader>:<case>`) whose answer changes when the ability is stripped. Empty when no
 * reader reads it. A question that throws on either board is left out (reported by the caller
 * via `probeErrors`).
 */
export function passiveReads(text, { name = 'Probe Holder', abilityName = 'Probe', abilityType = 'Ability' } = {}) {
  const opts = {
    turnTrainerName: String(text).match(/when you use ([^,.]+)/i)?.[1],
    partners: namedPartners(text),
  };
  const withAbility = probeAnswers(
    () => mon(name, { hp: 200, abilities: [{ name: abilityName, type: abilityType, text }] }),
    opts
  );
  const stripped = probeAnswers(() => mon(name, { hp: 200, abilities: [] }), opts);
  const reads = [];
  for (const [label, answer] of Object.entries(withAbility)) {
    if (answer === 'THROW' || stripped[label] === 'THROW') continue;
    if (answer !== stripped[label]) reads.push(label);
  }
  // Attack borrowing is read straight off the text (reduce.mjs attackViewFor).
  if (parseAttackBorrowAbility(text)) reads.push('attackBorrow');
  return reads.sort();
}
