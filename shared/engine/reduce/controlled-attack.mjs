// Giratina ex Alpha Rage (customhb): "Choose 1 of your opponent's Pokémon. That Pokémon attacks 1 of
// your opponent's other Pokémon." The chosen Pokémon is the Attacking Pokémon for the damage: its
// printed damage text (coins, "for each" counts read from its own side), its Tools, Special Energy,
// Abilities and attack markers all apply, and the target's Weakness and Resistance (Active only),
// Tools, Energy, Abilities, markers, Bench shields and Knock Out prevention apply to the hit. A
// Knock Out gives Prize cards to the player who used Alpha Rage. The chosen attack's other printed
// effects do not run (ISSUES I297).
import { findCard } from '../state.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';
import { buildServerAttackContext } from '../rules/attack-damage-context.mjs';
import { parseDamageImmunity } from '../rules/attack-markers.mjs';
import { hasCondition } from '../rules/special-conditions.mjs';
import { evaluateToolKoPrevention } from '../rules/tool-combat.mjs';
import {
  activeAttackMarkers, inPlayView, cardEffectiveHp, discardCardFromPlayerZone, onlyPokemonInPlay,
} from './shared.mjs';
import { flipAttackCoins, coinCountReader } from './attack.mjs';
import {
  attackAbilityReads,
  applyFlatDamageToTarget,
  damageBenchedPokemon,
  energyAttackerShieldPrevents,
  infiltratorPreventsDamage,
  prizeFlags,
  trainerIgnoresDefenderEffects,
} from './attack-damage.mjs';

const inPlayCards = (player) => [...(player?.zones?.active || []), ...(player?.zones?.bench || [])];

/** The chosen attack's printed damage after its own coins and board counts, as its user reads them. */
function printedDamageFor(draft, { attack, user, userView, ownerId, target, targetView, controllerId, activeRng, events }) {
  const countOf = coinCountReader(draft, { playerId: ownerId, attacker: user, attackerView: userView, targetInstanceId: target.instanceId });
  const { coin, headsCount, flips } = flipAttackCoins(attack, activeRng, countOf);
  if (flips.length > 0) {
    events.push({ type: 'attackCoinFlipped', playerId: controllerId, attackName: attack.name, coin, headsCount, flips });
  }
  const parsed = parseAttackDamage(
    attack,
    userView,
    targetView,
    buildServerAttackContext(draft, {
      attackerPlayerId: ownerId,
      defenderPlayerId: ownerId,
      attacker: user,
      defender: target,
      attackerView: userView,
      attack,
      defenderView: targetView,
      coin,
      headsCount,
    })
  );
  return parsed.total;
}

/**
 * Applies one controlled attack: `userId` (owned by `ownerId`) uses `attack` on `targetId`, another
 * of `ownerId`'s Pokémon, for `controllerId`. Returns the damage dealt.
 */
export function applyControlledAttack(draft, { userId, ownerId, targetId, attack, controllerId, attackName, activeRng, events }) {
  const userRef = findCard(draft, userId);
  const targetRef = findCard(draft, targetId);
  const inPlay = (ref) => ref && ref.playerId === ownerId && (ref.zoneId === 'active' || ref.zoneId === 'bench');
  if (!inPlay(userRef) || !inPlay(targetRef) || userId === targetId || !attack) return 0;
  const owner = draft.players[ownerId];
  const user = userRef.card;
  const target = targetRef.card;
  const userView = inPlayView(draft, user);
  const targetView = inPlayView(draft, target);
  const targetIsActive = targetRef.zoneId === 'active';

  const amount = printedDamageFor(draft, { attack, user, userView, ownerId, target, targetView, controllerId, activeRng, events });
  events.push({
    type: 'controlledAttackUsed',
    playerId: controllerId,
    attackerId: userId,
    defenderId: targetId,
    attackName: attack.name,
    sourceAttack: attackName,
    damage: amount,
  });
  if (amount <= 0) return 0;

  const immunity = parseDamageImmunity(attack.text) || {};
  const abilityReads = attackAbilityReads(draft, {
    attacker: userView,
    defender: targetView,
    playerId: ownerId,
    defenderPlayerId: ownerId,
  });
  const sideCards = inPlayCards(owner);
  const result = computeAttackDamage(abilityReads.attacker, targetView, { ...attack, damage: amount }, {
    attackerZoneCards: sideCards,
    defenderZoneCards: sideCards,
    defenderInPlayCards: sideCards,
    stadium: draft.stadium,
    defenderIsActive: targetIsActive,
    ...prizeFlags(draft, ownerId, ownerId),
    defenderPoisoned: hasCondition(target, 'Poisoned'),
    baseDamage: amount,
    ...immunity,
    // Benched Pokémon take no Weakness or Resistance.
    ignoreWeakness: Boolean(immunity.ignoreWeakness) || !targetIsActive,
    ignoreResistance: Boolean(immunity.ignoreResistance) || abilityReads.ignoreResistance || !targetIsActive,
    ignoreDefenderEffects:
      immunity.ignoreDefenderEffects ||
      abilityReads.ignoreDefenderEffects ||
      trainerIgnoresDefenderEffects(draft, ownerId, abilityReads.attacker),
    ignoreAttackerBoosts: abilityReads.ignoresAttackerBoosts,
    abilityBonusBeforeWR: abilityReads.abilityBonusBeforeWR,
    abilityReductionBeforeWR: abilityReads.abilityReductionBeforeWR,
    abilityReductionAfterWR: abilityReads.abilityReductionAfterWR,
    abilityPrevention: abilityReads.abilityPrevention,
    weaknessOverride: abilityReads.weaknessOverride,
    defenderMarkers: activeAttackMarkers(draft, ownerId, target),
    attackerMarkers: activeAttackMarkers(draft, ownerId, user),
  });
  let dealt = result.total;
  if (dealt > 0 && !abilityReads.ignoresDefenderAbilities) {
    if (
      infiltratorPreventsDamage(draft, target, ownerId, activeRng, events) ||
      energyAttackerShieldPrevents(draft, target, ownerId, user, ownerId, events)
    ) {
      dealt = 0;
    }
  }
  if (dealt <= 0) {
    events.push({ type: 'damagePrevented', instanceId: targetId, attackName: attack.name, reason: 'controlled-attack' });
    return 0;
  }
  if (!targetIsActive) {
    damageBenchedPokemon(draft, {
      victim: target,
      victimPlayerId: ownerId,
      attackerPlayerId: controllerId,
      attackName: attack.name,
      dealt,
      auto: false,
      activeRng,
      ignoreDefenderEffects: Boolean(immunity.ignoreDefenderEffects),
      events,
    });
    return dealt;
  }
  if (activeKoPrevented(draft, { target, ownerId, dealt, activeRng, events })) return dealt;
  return applyFlatDamageToTarget(draft, {
    ref: targetRef,
    amount: dealt,
    attackerPlayerId: controllerId,
    legacyApplied: true,
    events,
  });
}

// Focus Sash / Survival Brace on the Active target: the same Knock Out prevention an attack meets.
function activeKoPrevented(draft, { target, ownerId, dealt, activeRng, events }) {
  const koHp = cardEffectiveHp(draft, target, ownerId);
  if (!(koHp > 0 && (target.damage || 0) + dealt >= koHp)) return false;
  const zoneCards = draft.players[ownerId]?.zones?.active || [];
  const koEval = evaluateToolKoPrevention(target, zoneCards, {
    currentDamage: target.damage || 0,
    incomingDamage: dealt,
    baseHp: koHp,
    stadium: draft.stadium,
    inHp: true,
    onlyPokemonInPlay: onlyPokemonInPlay(draft, ownerId),
    flipCoin: () => (activeRng.next() < 0.5 ? 'heads' : 'tails'),
  });
  if (koEval.coinFace) events.push({ type: 'coinFlipped', playerId: ownerId, face: koEval.coinFace });
  if (!koEval.prevented) return false;
  target.damage = koEval.totalDamage;
  events.push({ type: 'damageUpdated', instanceId: target.instanceId, damage: target.damage, dealt });
  events.push({ type: 'koPrevented', instanceId: target.instanceId, tool: koEval.tool, surviveHp: koEval.surviveHp });
  if (koEval.discardOnUse && koEval.toolCard) discardCardFromPlayerZone(draft, koEval.toolCard.instanceId, ownerId);
  return true;
}
