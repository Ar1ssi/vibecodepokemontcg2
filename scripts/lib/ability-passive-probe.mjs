// Passive "behave" probes (design 034 slice 7b). A passive ability has nothing for useAbility to
// run, so the behaviour gate cannot watch the board change. Instead it asks the engine's own
// passive readers — the ones reduce.mjs and the effect modules consult at their rule sites — the
// same questions twice on one board: once with the ability printed on the holder, once with it
// stripped. Any answer that differs is a reader consuming the text. The probe is a lower bound:
// a condition the probe board does not meet (a named Stadium, a Pokémon ex Active) reads as
// unconsumed, never the other way round.
import { createCard } from '../../shared/engine/cards.mjs';
import { addCondition } from '../../shared/engine/rules/special-conditions.mjs';
import {
  abilityDamageBonus,
  abilityDamageReduction,
  abilityDamagePrevention,
  abilityLegacyDamageModifiers,
  abilityPreventsAttackEffects,
  abilityPreventsCardEffects,
  abilityPreventsCardEffectsOnPlayer,
  abilityHandDiscardProtector,
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
  parseOnDamageStatus,
  parseOnEnergyAttachAbilities,
  parseOnKoAbilities,
} from '../../shared/engine/rules/ability-triggers.mjs';
import {
  parseToolCap,
  parseUnlimitedHandEnergyAcceleration,
  costDiscountRead,
  teamNoRetreatCostForActive,
  parseAttackInheritance,
} from '../../shared/engine/rules/ability-executors.mjs';
import { parseAttackBorrowAbility } from '../../shared/engine/rules/attack-copy.mjs';
import { combinedToolRetreatCost, evaluateToolKoPrevention } from '../../shared/engine/rules/tool-combat.mjs';
import { evolvedView } from '../../shared/engine/rules/evolved-pokemon.mjs';
import { buildState, mon } from './oracle-harness.mjs';

// One of each basic Energy, attached from the hand to the holder (energy-attach triggers).
const BASIC_ENERGY_NAMES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'].map(
  (type) => `${type} Energy`
);
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

// `root` fixes the position; the reader may be handed the evolved view of it.
const at = (ctx, root) => {
  const isActive = ctx.sideActive.includes(root);
  return { ...ctx, isActive, zone: isActive ? 'active' : 'bench' };
};

// The engine hands readers the evolved view (reduce.mjs inPlayView) of the Pokémon it asks
// about; on a flat board that is the root itself.
const viewOf = (zoneCards, root) => evolvedView(zoneCards, root);

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
function probeBoard(holder, zone, { bare, partners, stacked }) {
  const state = buildState(holder, zone);
  const z = state.players.p1.zones;
  const holderCard = [...z.active, ...z.bench].find(
    (c) => !c.attachedTo && c.name !== 'p1Active' && !/^p1Bench/.test(c.name)
  );
  // A `stacked` holder is an Evolution on top of an ability-less Basic of the same name, as in
  // play: the root keeps the position and damage, the top card carries the printed Ability.
  // Readers that look at the root instead of its evolved view lose the text here (evolved
  // Serperior ex Regal Cheer from the Bench, an evolved Gothitelle's Item lock).
  if (stacked && holderCard) {
    const top = createCard({
      ...holderCard,
      instanceId: 9100,
      stage: 'Stage 1',
      subtypes: ['Stage 1'],
      evolvesFrom: holderCard.name,
      attachedTo: holderCard.instanceId,
    });
    holderCard.abilities = [];
    z[zone].push(top);
  }
  const others = z.bench.filter((c) => !c.attachedTo && c !== holderCard);
  partners.forEach((name, i) => {
    if (others[i]) others[i].name = name;
  });
  // An opponent worth reacting to: a V (Rapid Strike), a VMAX and a GX on the Bench, and two
  // Prizes taken, so "if your opponent has any Pokémon V …" / "for each …" clauses can hold.
  const oppBench = state.players.p2.zones.bench.filter((c) => !c.attachedTo);
  const oppKinds = [['Basic', 'V', 'Rapid Strike'], ['VMAX'], ['Basic', 'GX']];
  oppBench.forEach((c, i) => {
    if (oppKinds[i]) c.subtypes = oppKinds[i];
  });
  state.players.p2.zones.prizes.splice(0, 2);
  if (bare && holderCard) {
    holderCard.damage = 0;
    for (const zoneName of ['active', 'bench']) {
      z[zoneName] = z[zoneName].filter((c) => c.attachedTo !== holderCard.instanceId);
    }
  }
  return { state, holderCard };
}

// I219 card-effect shields: each own Pokémon, plus a probe Benched Basic Pokémon V of the
// {W}/{Y}/{P} types with a {P} Energy attached (the team shields name Benched Basic, Benched V,
// {W}, {Y} and {P}-Energy Pokémon), asked with the opponent at 2 Prizes (Thievul).
const CARD_EFFECT_SOURCES = ['Item', 'Supporter', 'Ability', 'Stadium'];

function cardShieldAnswers(ask, p1) {
  const defender = mon('Probe Shielded V', {
    instanceId: 9200,
    subtypes: ['Basic', 'V'],
    types: ['Water', 'Fairy', 'Psychic'],
  });
  const energy = createCard({
    instanceId: 9201,
    name: 'Basic Psychic Energy',
    supertype: 'Energy',
    subtypes: ['Basic'],
    types: ['Psychic'],
    attachedTo: 9200,
  });
  const ctx = {
    ...p1,
    sideCards: [...p1.sideCards, defender, energy],
    sideBench: [...p1.sideBench, defender, energy],
    opponentPrizesLeft: 2,
  };
  for (const source of CARD_EFFECT_SOURCES) {
    ask(`cardEffectShield:${source}:probeDefender`, () => abilityPreventsCardEffects(defender, source, ctx));
    ask(`playerShield:${source}`, () => abilityPreventsCardEffectsOnPlayer(source, ctx));
  }
}

/**
 * Every probe question, answered on each probe board (see `probeBoard`). Returns
 * `{ '<board>:<reader>:<case>': answerKey | 'THROW' }`.
 */
function probeAnswers(holder, { turnTrainerName, partners }) {
  const answers = {};
  const boards = [
    ['active', false, false],
    ['bench', false, false],
    ['active', true, false],
    ['bench', true, false],
    ['active', false, true],
    ['bench', false, true],
  ];
  for (const [zone, bare, stacked] of boards) {
    const board = `${stacked ? 'stack-' : ''}${zone}${bare ? '-bare' : ''}`;
    const { state, holderCard: holderRoot } = probeBoard(holder, zone, { bare, partners, stacked });
    const p1 = sideContext(state, 'p1');
    const p2 = sideContext(state, 'p2');
    const own = roots(p1.sideCards);
    const opp = roots(p2.sideCards);
    const [p1Active] = roots(p1.sideActive);
    const [p2Active] = roots(p2.sideActive);
    const holderCard = holderRoot && viewOf(p1.sideCards, holderRoot);
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

    cardShieldAnswers(ask, p1);
    for (const root of own) {
      const ctx = at(p1, root);
      const card = viewOf(p1.sideCards, root);
      ask(`damageBonus:${card.name}`, () => abilityDamageBonus(card, p2Active, ctx));
      ask(`damageReduction:${card.name}`, () => abilityDamageReduction(card, p2Active, ctx));
      ask(`damagePrevention:${card.name}`, () => abilityDamagePrevention(card, p2Active, ctx));
      // WotC after-W/R modifiers; Unown D/M/N name the attacker's type.
      for (const type of [null, 'Darkness', 'Metal', 'Colorless']) {
        const attacker = type ? { ...p2Active, types: [type] } : p2Active;
        ask(`legacyDamage:${type || 'any'}:${card.name}`, () => abilityLegacyDamageModifiers(card, attacker, ctx));
      }
      ask(`effectPrevention:${card.name}`, () => abilityPreventsAttackEffects(card, p2Active, ctx));
      for (const source of CARD_EFFECT_SOURCES) {
        ask(`cardEffectShield:${source}:${card.name}`, () => abilityPreventsCardEffects(card, source, ctx));
      }
      ask(`handDiscardProtector:${card.name}`, () => abilityHandDiscardProtector(card, ctx));
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
          // Coin KO-prevention only applies on heads (design 038 I146); a heads flip shows the read.
          flipCoin: () => 'heads',
        })
      );
    }
    for (const root of opp) {
      const ctx = at(p2, root);
      const card = viewOf(p2.sideCards, root);
      ask(`opp:damageBonus:${card.name}`, () => abilityDamageBonus(card, p1Active, ctx));
      ask(`opp:damageReduction:${card.name}`, () => abilityDamageReduction(card, p1Active, ctx));
      ask(`opp:damagePrevention:${card.name}`, () => abilityDamagePrevention(card, p1Active, ctx));
      ask(`opp:weakness:${card.name}`, () => abilityWeaknessOverride(card, ctx));
      ask(`opp:hp:${card.name}`, () => abilityHpBonus(card, ctx));
      ask(`opp:prize:${card.name}`, () => abilityPrizeModify(card, ctx));
      ask(`opp:retreat:${card.name}`, () => abilityRetreatCost(card, ctx));
      ask(`opp:suppressed:${card.name}`, () => isAbilitySuppressed(card, ctx));
      // Toxic Gas ignores only Pokémon Powers, which the probe Ability above is not.
      const powerHolder = { ...card, abilities: [{ name: 'Probe Power', type: 'Pokémon Power', text: 'Once during your turn, you may draw a card.' }] };
      ask(`opp:suppressedPower:${card.name}`, () => isAbilitySuppressed(powerHolder, ctx));
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
      // As reduce.mjs retreat cost passes it: evolved views, and the Active's zone for its Energy.
      ask(`noRetreatForActive:${side}`, () =>
        teamNoRetreatCostForActive(
          viewOf(ctx.sideActive, roots(ctx.sideActive)[0]),
          roots(ctx.sideBench).map((root) => viewOf(ctx.sideBench, root)),
          ctx.sideActive
        )
      );
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
    ask('onDamageStatus', () => parseOnDamageStatus(holderCard, ctx));
    ask('onEnergyAttach', () =>
      BASIC_ENERGY_NAMES.map((name) =>
        parseOnEnergyAttachAbilities(holderCard, createCard({ name, supertype: 'Energy', subtypes: ['Basic'] }), p1)
      )
    );
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
    ask('passiveCostDiscount', () =>
      costDiscountRead(holderCard, {
        attacker: holderCard,
        ownHandCount: state.players.p1.zones.hand.length,
        ownPrizesLeft: state.players.p1.zones.prizes.length,
        opponentPrizesLeft: state.players.p2.zones.prizes.length,
        ownSideCards: p1.sideCards,
        opponentSideCards: p2.sideCards,
        opponentActive: p2.sideActive,
        ownDiscard: state.players.p1.zones.discard,
      })
    );
    ask('attackInheritance', () => parseAttackInheritance(holderCard));
    // Last on this board: condition-targeted Checkup damage needs Poisoned/Burned/Asleep targets.
    for (const card of [...own, ...opp]) for (const c of ['Poisoned', 'Burned', 'Asleep']) addCondition(card, c);
    ask('checkup:conditioned', () => parseCheckupAbilities(inPlayEntries(state), p1));
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

// Wordings whose answer depends on the holder's stage ("your Basic Pokémon's attacks", "it can
// evolve during your first turn"): the stacked holder is a Stage 1, so its read may differ for real.
const STAGE_WORDING = /\bbasic\b(?! energy)|\bcan evolve\b/i;

/**
 * Reads the flat board sees but the evolved-stack board loses: `['stack-<zone>:<reader>:<case>']`
 * for every `<zone>:<reader>:<case>` read whose stacked twin is not read. An Ability printed on
 * an Evolution that works only when the card sits in play as a Basic. Pass the ability `text` to
 * skip stage-dependent wordings (`STAGE_WORDING`).
 */
export function stackDrops(reads, text = '') {
  if (STAGE_WORDING.test(String(text))) return [];
  const have = new Set(reads);
  return reads
    .filter((label) => /^(active|bench):/.test(label))
    .map((label) => `stack-${label}`)
    .filter((label) => !have.has(label));
}
