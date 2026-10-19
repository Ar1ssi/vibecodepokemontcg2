/**
 * @file Attack damage placement: bench damage and Thorns, attack target clauses and options, flat
 * and Active-target damage, retaliation, applyAttackTargets. Split out of reduce.mjs (design 073 B,
 * I250); reduce.mjs stays the public entry.
 */

import { findCard } from '../state.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';
import {
  attackTargetClause, ownTargetClause, opponentCounterClause,
} from '../rules/damage-parser.mjs';
import { attachedTrainerDamageReduction } from '../rules/legacy-attached-trainer.mjs';
import { applyLegacyDamageModifiers } from '../rules/legacy-power-wording.mjs';
import { countUnit, normalizeUnit } from '../rules/scaling-count.mjs';
import { buildServerAttackContext } from '../rules/attack-damage-context.mjs';
import { evaluateToolKoPrevention, isExCard, isTeraCard } from '../rules/tool-combat.mjs';
import { cardAbilityText } from '../rules/ability-executors.mjs';
import {
  abilityDamageBonus, abilityDamageReduction, abilityDamagePrevention, abilityLegacyDamageModifiers,
  abilityPreventsAttackEffects, sideContextFor, powersOffActive, abilityWeaknessOverride,
  abilityIgnoresDefenderEffects, abilityExtraTypes, isAbilitySuppressed,
} from '../rules/ability-combat.mjs';
import { parseOnDamageAbilities } from '../rules/ability-triggers.mjs';
import {
  attackerMatchesFilter, liveAttackMarkers, markersPreventEffects, parseDamageImmunity,
} from '../rules/attack-markers.mjs';
import {
  hasSpecialEnergyEffectShield, blocksSpecialEnergyBenchDamage,
} from '../rules/special-energy-parse.mjs';
import { isGxCard, isUltraBeastCard } from '../rules/card-classify.mjs';
import {
  discardCardFromPlayerZone, activeAttackMarkers, inPlayView, cardEffectiveHp, abilitySideContext,
  rootsIn,
} from './shared.mjs';
import { handleKnockout } from './knockout.mjs';

const SELF_BENCH_SHIELD =
  /as long as this pok[eé]mon is on your bench, prevent all damage done to this pok[eé]mon by attacks/;

/**
 * Applies damage to one benched Pokémon: counters, event, and KO through handleKnockout
 * (so the prize entitlement stays server-granted, D43).
 */
export function damageBenchedPokemon(
  draft,
  {
    victim,
    victimPlayerId,
    attackerPlayerId,
    attackName,
    dealt,
    auto,
    ownAttack = false,
    countersPlaced = false,
    ignoreDefenderEffects = false,
    activeRng = null,
    events,
  }
) {
  if (dealt <= 0) return;

  // Transparent Walls gym2-125: "prevent all damage from attacks done to your Benched Pokémon"
  // until the end of the opponent's next turn (counters an attack places are not damage).
  const wallsUntil = draft.players[victimPlayerId]?.benchAttackShieldUntilTurn || 0;
  if (!countersPlaced && wallsUntil >= (draft.turn?.number || 1)) {
    events.push({ type: 'damagePrevented', instanceId: victim.instanceId, attackName, reason: 'trainer-bench-shield' });
    return;
  }

  // Check Tera bench damage immunity ("Tera: As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon by attacks")
  // The Tera rule is printed on the top card: an evolved Tera Pokémon ex's Basic is not Tera.
  if (isTeraCard(inPlayView(draft, victim) || victim)) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'tera-bench',
    });
    return;
  }

  // The same clause printed as the victim's own Ability (Antique Plume Fossil WHT 079
  // Plume Protection).
  const victimView = inPlayView(draft, victim);
  if (
    !ownAttack &&
    SELF_BENCH_SHIELD.test(cardAbilityText(victimView)) &&
    !isAbilitySuppressed(victimView, abilitySideContext(draft, victimPlayerId))
  ) {
    events.push({ type: 'damagePrevented', instanceId: victim.instanceId, attackName, reason: 'bench-self-shield' });
    return;
  }

  // Check team bench protection abilities (e.g. Manaphy Wave Veil)
  const victimBench = draft.players[victimPlayerId]?.zones?.bench || [];
  const victimActive = draft.players[victimPlayerId]?.zones?.active || [];
  const allVictimCards = [...victimActive, ...victimBench];
  // Shadowy Darkness Energy (audit SE5): its benched {D} host takes no attack damage.
  if (!ownAttack && blocksSpecialEnergyBenchDamage(inPlayView(draft, victim), 'bench', victimBench)) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'special-energy-bench',
    });
    return;
  }
  if (countersPlaced && !ownAttack && counterEffectShielded(draft, victim, victimBench)) {
    events.push({ type: 'damagePrevented', instanceId: victim.instanceId, attackName, reason: 'special-energy-effect' });
    return;
  }
  // Bench shields stop the opponent's attacks, not the attacker's own recoil.
  const benchProtected = !ownAttack && allVictimCards.some((c) => {
    if (c.attachedTo) return false;
    const t = String(
      c?.ability?.text ?? c?.abilityText ?? c?.text ?? c?.effect ?? ''
    ).toLowerCase();
    return (
      t.includes('prevent all damage done to your benched pokémon') ||
      t.includes('prevent all damage done to your benched pokemon')
    );
  });
  if (benchProtected) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'bench-shield',
    });
    return;
  }
  if (
    !ownAttack &&
    (sideMarkerPrevents(draft, victimPlayerId, attackerPlayerId) ||
      benchMarkerPrevents(draft, victim, victimBench, attackerPlayerId))
  ) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'attack-marker',
    });
    return;
  }

  // Defender (base1-80) on a Benched Pokémon: "Damage done to that Pokémon by attacks is reduced
  // by 20". Counters placed are not damage. Damage "isn't affected by … Pokémon Powers, or any
  // other effects on the Defending Pokémon" (Feint Attack) skips Defender and the WotC Powers.
  const legacyApplies = !countersPlaced && !ignoreDefenderEffects;
  const attachedReduction = legacyApplies ? attachedTrainerDamageReduction(victimBench, victim) : 0;
  if (attachedReduction > 0) {
    dealt = Math.max(0, dealt - attachedReduction);
    if (dealt === 0) {
      events.push({ type: 'damagePrevented', instanceId: victim.instanceId, attackName, reason: 'attached-trainer' });
      return;
    }
  }
  if (legacyApplies) {
    dealt = legacyModifiedDamage(draft, { victim, victimPlayerId, amount: dealt });
    if (dealt <= 0) {
      events.push({ type: 'damagePrevented', instanceId: victim.instanceId, attackName, reason: 'ability' });
      return;
    }
  }

  // Read before the damage lands: the holder may be Knocked Out by it.
  const strikesBack =
    !ownAttack && !countersPlaced ? benchedThornsCounters(draft, victimView, victimPlayerId) : 0;
  const prevDamage = victim.damage || 0;
  const koHp = cardEffectiveHp(draft, victim, victimPlayerId);
  const wouldKo = koHp > 0 && prevDamage + dealt >= koHp;

  if (wouldKo) {
    const koEval = evaluateToolKoPrevention(victim, victimBench, {
      currentDamage: prevDamage,
      incomingDamage: dealt,
      baseHp: koHp,
      stadium: draft.stadium,
      inHp: true,
      // Without an RNG (non-attack callers) Focus Band cannot flip, so it never prevents.
      ...(activeRng && { flipCoin: () => (activeRng.next() < 0.5 ? 'heads' : 'tails') }),
    });
    if (koEval.coinFace) {
      events.push({ type: 'coinFlipped', playerId: victimPlayerId, face: koEval.coinFace });
    }
    if (koEval.prevented) {
      victim.damage = koEval.totalDamage;
      events.push({
        type: 'damageUpdated',
        instanceId: victim.instanceId,
        damage: victim.damage,
        dealt,
      });
      events.push({
        type: 'koPrevented',
        instanceId: victim.instanceId,
        tool: koEval.tool,
        surviveHp: koEval.surviveHp,
      });
      if (koEval.discardOnUse && koEval.toolCard) {
        discardCardFromPlayerZone(
          draft,
          koEval.toolCard.instanceId,
          victimPlayerId
        );
      }
      thornsOnBenchDamage(draft, { counters: strikesBack, victimPlayerId, attackerPlayerId, activeRng, events });
      return;
    }
  }

  victim.damage = prevDamage + dealt;
  events.push({
    type: 'damageUpdated',
    instanceId: victim.instanceId,
    damage: victim.damage,
    dealt,
  });
  events.push({
    type: 'benchDamaged',
    instanceId: victim.instanceId,
    playerId: victimPlayerId,
    attackerPlayerId,
    attackName,
    dealt,
    auto: Boolean(auto),
  });

  if (koHp > 0 && victim.damage >= koHp) {
    handleKnockout(draft, {
      victimPlayerId,
      attackerPlayerId,
      victim,
      events,
      byAttack: true,
      byDamage: !countersPlaced,
    });
  }
  thornsOnBenchDamage(draft, { counters: strikesBack, victimPlayerId, attackerPlayerId, activeRng, events });
}

// Machamp Strikes Back [Base Set 8], read as "If this Pokémon is damaged by an attack from your
// opponent's Pokémon (even if this Pokémon is Knocked Out), put N damage counters on the Attacking
// Pokémon." (legacy-power-wording.mjs): no position clause, so a Benched holder hit by an attack
// strikes back too. Only that exact sentence: other thorns wordings name the Active Spot.
const UNPOSITIONED_THORNS =
  /^if this pokémon is damaged by an attack from your opponent's pokémon \(even if this pokémon is knocked out\), put (\d+) damage counters? on the attacking pokémon\.(?: |$)/;

function benchedThornsCounters(draft, victimView, victimPlayerId) {
  if (!UNPOSITIONED_THORNS.test(cardAbilityText(victimView))) return 0;
  const thorns = parseOnDamageAbilities(victimView, { ...abilitySideContext(draft, victimPlayerId), isActive: false });
  return thorns?.count > 0 ? thorns.count : 0;
}

function thornsOnBenchDamage(draft, { counters, victimPlayerId, attackerPlayerId, activeRng, events }) {
  if (!(counters > 0)) return;
  const attacker = rootsIn(draft.players[attackerPlayerId]?.zones?.active)[0];
  if (!attacker) return;
  attacker.damage = (attacker.damage || 0) + counters * 10;
  events.push({
    type: 'damageUpdated',
    instanceId: attacker.instanceId,
    damage: attacker.damage,
    dealt: counters * 10,
    reason: 'thorns',
  });
  const koHp = cardEffectiveHp(draft, attacker, attackerPlayerId);
  if (koHp > 0 && attacker.damage >= koHp) {
    handleKnockout(draft, {
      victimPlayerId: attackerPlayerId,
      attackerPlayerId: victimPlayerId,
      victim: attacker,
      events,
      byAttack: true,
      activeRng,
    });
  }
}

// Mist / Rocky / Wash / Wonder Energy: damage counters an opponent's attack places are an
// effect of that attack, not damage, so the effect shield stops them (review of audit SE5).
// An `effectPrevent` marker (Jirachi-GX Star Shield-GX) stops them too.
function counterEffectShielded(draft, victim, zoneCards) {
  if (hasSpecialEnergyEffectShield(inPlayView(draft, victim), zoneCards)) return true;
  const ref = findCard(draft, victim.instanceId);
  const attacker = rootsIn(draft.players[draft.turn?.player]?.zones?.active)[0];
  const attackerView = attacker ? inPlayView(draft, attacker) : null;
  const markers = ref ? activeAttackMarkers(draft, ref.playerId, victim) : [];
  return markersPreventEffects(markers, attackerView) || abilityEffectShield(draft, ref, attackerView);
}

// An Ability on the defending side ("prevent all effects of attacks used by your opponent's
// Pokémon done to this Pokémon") shielding the Pokémon at `ref`.
export function abilityEffectShield(draft, ref, attackerView) {
  if (!ref) return false;
  return abilityPreventsAttackEffects(inPlayView(draft, ref.card), attackerView, sideContextFor(draft, ref.playerId));
}

// Chosen-target damage/counters for attacks that let the player pick one or more
// of the opponent's Pokémon (design 017 / D19). Returns a clause, or null.
//   { kind: 'damage'|'counters', amount, count, scope: 'bench'|'any'|'active' }
// 'active' scope is a fixed Active target and is applied without a choice.
export function resolveAttackTargetClause(text, parsed, spread) {
  if (spread > 0) return null;
  const t = String(text || '');
  const counters = opponentCounterClause(t);
  if (counters) {
    if (counters.mode === 'active') {
      return { kind: 'counters', amount: counters.count * 10, count: 1, scope: 'active' };
    }
    // "put N damage counters on your opponent's Pokémon in any way you like":
    // place them one click at a time, each counter 10 damage, all N must land.
    if (/in any way/i.test(t)) {
      return {
        kind: 'counters',
        amount: 10,
        count: 1,
        scope: counters.scope || 'any',
        distributable: true,
        remaining: counters.count,
      };
    }
    return {
      kind: 'counters',
      amount: counters.count * 10,
      count: counters.mode === 'multi' ? counters.targets : 1,
      scope: counters.scope || 'any',
    };
  }
  const damage = attackTargetClause(t);
  if (damage) {
    // Raichu ex Power Short: "If that Pokémon has Poké-Powers, this attack does 30 damage plus
    // 20 more damage" — a bonus read on each chosen target.
    const targetBonus =
      /if that pok[ée]mon has (poké-powers|poké-bodies|an ability), this attack does \d+ damage plus (\d+) more damage/i.exec(
        t.replace(/[‘’]/g, "'")
      );
    return {
      kind: 'damage',
      amount: damage.amount,
      ...(targetBonus
        ? {
            targetBonus: {
              abilityKind: /power/i.test(targetBonus[1]) ? 'power' : /bod/i.test(targetBonus[1]) ? 'body' : 'ability',
              amount: Number(targetBonus[2]),
            },
          }
        : {}),
      count: damage.count,
      scope: damage.scope,
      ...(damage.filter ? { filter: damage.filter } : {}),
      ...(damage.distributable ? { distributable: true, remaining: damage.remaining } : {}),
      ...(damage.countFromEnergy ? { countFromEnergy: damage.countFromEnergy } : {}),
      ...(damage.upTo ? { upTo: true } : {}),
      ...(damage.chooser ? { chooser: damage.chooser } : {}),
      ...(damage.amountPerEnergy ? { amountPerEnergy: true } : {}),
      ...(damage.remainingFromDiscard ? { remainingFromDiscard: true } : {}),
      // Attack damage to the Active applies Weakness/Resistance unless the text
      // waives it for every target ("... for Benched Pokémon" waives only those;
      // Arboliva ex: "This damage isn't affected by Weakness or Resistance").
      activeWR:
        !/don't apply weakness and resistance(?! for benched)/i.test(t) &&
        !/this damage isn't affected by weakness or resistance/i.test(t.replace(/[‘’]/g, "'")),
      immunity: parseDamageImmunity(t),
    };
  }
  if (parsed?.bench > 0) {
    return { kind: 'damage', amount: parsed.bench, count: 1, scope: 'bench' };
  }
  return ownTargetClause(t);
}

// Candidate filters a printed target description names (damage-parser.mjs attackTargetClause).
const TARGET_FILTERS = {
  damaged: (view) => (view?.damage || 0) > 0,
  gxOrEx: (view) => isGxCard(view) || /-EX$/.test(String(view?.name || '')),
  lvx: (view) => /\bLV\.X\b/i.test(String(view?.name || '')),
};

/** In-play roots a chosen-target clause may pick: the opponent's, or the attacker's own. */
export function attackTargetOptions(draft, defenderPlayerId, scope, filter = null) {
  const player = draft.players[defenderPlayerId];
  const active = (player?.zones?.active || []).filter((c) => !c.attachedTo);
  const bench = (player?.zones?.bench || []).filter((c) => !c.attachedTo);
  const roots = scope === 'bench' ? bench : scope === 'active' ? active : [...active, ...bench];
  const keep = TARGET_FILTERS[filter];
  return keep ? roots.filter((root) => keep(inPlayView(draft, root))) : roots;
}

// Printed units of a chosen-target damage clause: "does 50 damage to 1 of your opponent's Pokémon
// for each of your Beedrill V in play" and "does 40 damage times the number of Beedrill you have in
// play to 1 of your opponent's Pokémon".
const CHOSEN_TARGET_PER_UNIT = [
  /damage to \d+ of your opponent's [^.(]*? for each ([^.(]+)/i,
  /damage times the (?:amount|number) of ([^.(]+?) to \d+ of your opponent's/i,
];

/**
 * The board count a chosen-target damage clause multiplies by. Null when the printed clause has no
 * per-unit count or the unit is unread.
 */
export function chosenTargetPerUnitCount(draft, text, { attackerPlayerId, defenderPlayerId, attacker, defender, attackerView, attack }) {
  const normalized = String(text || '').replace(/[‘’]/g, "'");
  const unit = CHOSEN_TARGET_PER_UNIT.map((re) => re.exec(normalized)?.[1]).find(Boolean);
  if (!unit) return null;
  const ctx = buildServerAttackContext(draft, {
    attackerPlayerId,
    defenderPlayerId,
    attacker,
    defender,
    attackerView,
    attack,
    defenderView: defender ? inPlayView(draft, defender) : null,
  });
  return countUnit(normalizeUnit(unit, attackerView?.name || attacker?.name), ctx);
}

/**
 * A computed counter clause (damage-parser.mjs computedCounterClause) as a counters target:
 * the count read from the board, capped, on the Defending Pokémon or 1 chosen Pokémon.
 * Null when the unit cannot be read or the count is 0.
 */
export function computedCounterTarget(draft, clause, { attackerPlayerId, defenderPlayerId, attacker, defender, attackerView, attack }) {
  const ctx = buildServerAttackContext(draft, {
    attackerPlayerId,
    defenderPlayerId,
    attacker,
    defender,
    attackerView,
    attack,
    defenderView: defender ? inPlayView(draft, defender) : null,
  });
  const counted = countUnit(normalizeUnit(clause.unit, attackerView?.name || attacker?.name), ctx);
  if (!counted) return null;
  let counters = clause.base + clause.per * counted.count;
  if (clause.cap != null) counters = Math.min(counters, clause.cap);
  if (counters <= 0) return null;
  return { kind: 'counters', amount: counters * 10, count: 1, scope: clause.target === 'active' ? 'active' : 'any' };
}

/** Prompt for one pick of a split clause: a damage counter, or one hit of a repeated choice. */
export function distributedPrompt(attackName, clause, left) {
  return clause.kind === 'counters'
    ? `${attackName}: Place a damage counter (${left} left)`
    : `${attackName}: Choose a Pokémon to take ${clause.amount} damage (${left} left)`;
}

/** Whose Pokémon a chosen-target clause hits: the opponent's, or (`side: 'own'`) the attacker's. */
export const targetPlayerOf = (clause, attackerPlayerId, defenderPlayerId) =>
  clause?.side === 'own' ? attackerPlayerId : defenderPlayerId;

// Flat damage to an Active target: no W/R for counter placement, and the printed
// snipe clause is treated as unmodified. Bench targets go through
// damageBenchedPokemon (Tera/bench-shield guards + KO).
// Attack damage that skips computeAttackDamage (fixed-damage targets, Bench damage, recoil) still
// meets the WotC Powers that change damage after Weakness and Resistance (Invisible Wall, Kabuto
// Armor, Relaxing Scent, Unown D, …). The Attacking Pokémon is the turn player's Active.
export function legacyModifiedDamage(draft, { victim, victimPlayerId, amount }) {
  if (!(amount > 0)) return amount;
  const attacker = rootsIn(draft.players[draft.turn?.player]?.zones?.active)[0];
  const specs = abilityLegacyDamageModifiers(
    inPlayView(draft, victim),
    attacker ? inPlayView(draft, attacker) : null,
    abilitySideContext(draft, victimPlayerId)
  );
  return applyLegacyDamageModifiers(amount, specs);
}

// `legacyApplied`: the amount already went through computeAttackDamage, which applies the same
// Powers (or skips them for damage that ignores effects on the Defending Pokémon).
function applyFlatDamageToTarget(
  draft,
  { ref, amount, attackerPlayerId, countersPlaced = false, legacyApplied = false, events }
) {
  const victim = ref.card;
  if (!victim || amount <= 0) return 0;
  const victimZone = ref.player?.zones?.[ref.zoneId] || [];
  if (countersPlaced && ref.playerId !== attackerPlayerId && counterEffectShielded(draft, victim, victimZone)) {
    events.push({ type: 'damagePrevented', instanceId: victim.instanceId, reason: 'special-energy-effect' });
    return 0;
  }
  if (!countersPlaced && !legacyApplied) {
    amount = legacyModifiedDamage(draft, { victim, victimPlayerId: ref.playerId, amount });
    if (amount <= 0) {
      events.push({ type: 'damagePrevented', instanceId: victim.instanceId, reason: 'ability' });
      return 0;
    }
  }
  victim.damage = (victim.damage || 0) + amount;
  events.push({
    type: 'damageUpdated',
    instanceId: victim.instanceId,
    damage: victim.damage,
    dealt: amount,
  });
  const koHp = cardEffectiveHp(draft, victim, ref.playerId);
  if (koHp > 0 && victim.damage >= koHp) {
    handleKnockout(draft, {
      victimPlayerId: ref.playerId,
      attackerPlayerId,
      victim,
      events,
      byAttack: true,
      byDamage: !countersPlaced,
    });
  }
  return amount;
}

// Prize-count inputs computeAttackDamage reads, from the attacking player's side.
export function prizeFlags(draft, attackerPlayerId, defenderPlayerId) {
  const attackerPrizesRemaining = (draft.players[attackerPlayerId]?.zones?.prizes || []).length;
  const defenderPrizesRemaining = (draft.players[defenderPlayerId]?.zones?.prizes || []).length;
  return {
    attackerTrailingPrizes: attackerPrizesRemaining > defenderPrizesRemaining,
    defenderTrailingPrizes: defenderPrizesRemaining > attackerPrizesRemaining,
    attackerPrizesRemaining,
    defenderPrizesRemaining,
    attackerDeckFormat: draft.players[attackerPlayerId]?.deckFormat,
    defenderDeckFormat: draft.players[defenderPlayerId]?.deckFormat,
  };
}

// Ultra Forest Kartenvoy: for the rest of the turn the player's Ultra Beast
// attacks ignore effects on the opponent's Active Pokémon.
export function trainerIgnoresDefenderEffects(draft, playerId, attacker) {
  const flag = draft.players?.[playerId]?.flags?.ignoreDefenderEffectsTurn;
  if (!flag) return false;
  return !flag.ultraBeast || isUltraBeastCard(attacker);
}

// A chosen-target clause's damage to the opponent's Active after Weakness,
// Resistance and the other attack modifiers computeAttackDamage applies.
function activeTargetDamage(draft, { ref, clause, attackerPlayerId, attackName }) {
  const attacker = (draft.players[attackerPlayerId]?.zones?.active || []).find(
    (c) => !c.attachedTo
  );
  // No Attacking Pokémon to compute from: the flat amount, still through the WotC Powers.
  if (!attacker) {
    return clause.immunity?.ignoreDefenderEffects
      ? clause.amount
      : legacyModifiedDamage(draft, { victim: ref.card, victimPlayerId: ref.playerId, amount: clause.amount });
  }
  const defenderPlayer = draft.players[ref.playerId];
  const defenderView = inPlayView(draft, ref.card);
  const abilityReads = attackAbilityReads(draft, {
    attacker: inPlayView(draft, attacker),
    defender: defenderView,
    playerId: attackerPlayerId,
    defenderPlayerId: ref.playerId,
  });
  const result = computeAttackDamage(
    abilityReads.attacker,
    defenderView,
    { name: attackName, damage: clause.amount },
    {
      attackerZoneCards: draft.players[attackerPlayerId]?.zones?.active || [],
      defenderZoneCards: defenderPlayer?.zones?.active || [],
      defenderInPlayCards: [
        ...(defenderPlayer?.zones?.active || []),
        ...(defenderPlayer?.zones?.bench || []),
      ],
      stadium: draft.stadium,
      defenderIsActive: true,
      baseDamage: clause.amount,
      ...prizeFlags(draft, attackerPlayerId, ref.playerId),
      turnDamageBonuses: draft.players[attackerPlayerId]?.flags?.turnDamageBonuses || [],
      ...clause.immunity,
      ignoreDefenderEffects:
        clause.immunity?.ignoreDefenderEffects ||
        abilityReads.ignoreDefenderEffects ||
        trainerIgnoresDefenderEffects(draft, attackerPlayerId, abilityReads.attacker),
      abilityBonusBeforeWR: abilityReads.abilityBonusBeforeWR,
      abilityReductionBeforeWR: abilityReads.abilityReductionBeforeWR,
      abilityReductionAfterWR: abilityReads.abilityReductionAfterWR,
      abilityPrevention: abilityReads.abilityPrevention,
      weaknessOverride: abilityReads.weaknessOverride,
      defenderMarkers: activeAttackMarkers(draft, ref.playerId, ref.card),
      attackerMarkers: activeAttackMarkers(draft, attackerPlayerId, attacker),
    }
  );
  return result.total;
}

/**
 * Ability-side combat reads for one attack (design 034 slice 2): the
 * attacker's bonus and extra types plus the defender's reduction, prevention
 * and Weakness override, in the option shape computeAttackDamage consumes.
 * `attacker`/`defender` are in-play views.
 */
export function attackAbilityReads(
  draft,
  { attacker, defender, playerId, defenderPlayerId, defenderIsActive = true }
) {
  const attackerZones = draft.players[playerId]?.zones || {};
  const defenderZones = draft.players[defenderPlayerId]?.zones || {};
  const attackerSide = [
    ...(attackerZones.active || []),
    ...(attackerZones.bench || []),
  ];
  const defenderSide = [
    ...(defenderZones.active || []),
    ...(defenderZones.bench || []),
  ];
  const attackerCtx = {
    sideCards: attackerSide,
    opponentSideCards: defenderSide,
    sideActive: attackerZones.active || [],
    sideBench: attackerZones.bench || [],
    zone: 'active',
    isActive: true,
    attackerIsActive: true,
    turnNumber: draft.turn?.number,
    opponentHandCount: (defenderZones.hand || []).length,
    ownHandCount: (attackerZones.hand || []).length,
    ownPrizesLeft: (attackerZones.prizes || []).length,
    opponentPrizesLeft: (defenderZones.prizes || []).length,
    powersOff: powersOffActive(draft),
  };
  const defenderCtx = {
    sideCards: defenderSide,
    opponentSideCards: attackerSide,
    sideActive: defenderZones.active || [],
    sideBench: defenderZones.bench || [],
    opponentActive: attackerZones.active || [],
    opponentBench: attackerZones.bench || [],
    zone: 'active',
    isActive: defenderIsActive,
    attackerIsActive: true,
    attackerIsEx: isExCard(attacker),
    turnNumber: draft.turn?.number,
    powersOff: powersOffActive(draft),
  };
  const extraTypes = abilityExtraTypes(attacker, attackerCtx);
  const attackerView = extraTypes.length
    ? { ...attacker, types: [...(attacker.types || []), ...extraTypes] }
    : attacker;
  const reduction = abilityDamageReduction(defender, attackerView, defenderCtx);
  return {
    attacker: attackerView,
    abilityBonusBeforeWR: abilityDamageBonus(
      attackerView,
      defender,
      attackerCtx
    ),
    abilityReductionBeforeWR: reduction.beforeWR,
    abilityReductionAfterWR: reduction.afterWR,
    abilityPrevention: {
      ...abilityDamagePrevention(defender, attackerView, defenderCtx),
      legacyModifiers: abilityLegacyDamageModifiers(defender, attackerView, defenderCtx),
    },
    weaknessOverride: abilityWeaknessOverride(defender, defenderCtx),
    ignoreDefenderEffects: abilityIgnoresDefenderEffects(attackerView),
  };
}

// A side-wide marker on the victim's Active (M Diancie-EX Diamond Force) guards the Bench too.
// Entei Protective Flame: a damage-prevention marker on the Benched Pokémon itself.
function benchMarkerPrevents(draft, victim, victimBench, attackerPlayerId) {
  const markers = liveAttackMarkers(victim, { turnNumber: draft.turn?.number || 1, zoneCards: victimBench });
  if (!markers.some((m) => m.kind === 'incomingPrevent')) return false;
  const attacker = (draft.players[attackerPlayerId]?.zones?.active || []).find((c) => !c.attachedTo);
  const attackerView = attacker ? inPlayView(draft, attacker) : null;
  return markers.some((m) => m.kind === 'incomingPrevent' && attackerMatchesFilter(m.filter, attackerView));
}

function sideMarkerPrevents(draft, victimPlayerId, attackerPlayerId) {
  const guard = (draft.players[victimPlayerId]?.zones?.active || []).find((c) => !c.attachedTo);
  const attacker = (draft.players[attackerPlayerId]?.zones?.active || []).find((c) => !c.attachedTo);
  if (!guard || !attacker) return false;
  const attackerView = inPlayView(draft, attacker);
  return activeAttackMarkers(draft, victimPlayerId, guard).some(
    (m) => m.kind === 'incomingPrevent' && m.scope === 'side' && attackerMatchesFilter(m.filter, attackerView)
  );
}

// Wobbuffet BREAK Right Back at You / Rocket's Moltres Fire Wall (design 031): the damaged
// Pokémon strikes back, even when this attack knocked it out. `strikerView` is its top card
// as it was before the damage landed.
export function applyRetaliation(
  draft,
  { markers, dealt, striker, strikerView, strikerPlayerId, attacker, attackerPlayerId, events }
) {
  for (const marker of markers) {
    const onAttacker = marker.mode === 'counters' || marker.mode === 'fixedCounters';
    const target = onAttacker
      ? attacker
      : (draft.players[attackerPlayerId]?.zones?.active || []).find((c) => !c.attachedTo);
    const ref = target && findCard(draft, target.instanceId);
    if (!ref || (ref.zoneId !== 'active' && ref.zoneId !== 'bench')) continue;
    // Dracozolt VMAX Spark Trap: a printed number of counters, whatever the damage was.
    const amount =
      marker.mode === 'counters'
        ? dealt
        : marker.mode === 'fixedCounters'
          ? (marker.count || 0) * 10
          : retaliationAttackDamage(draft, { marker, striker, strikerView, strikerPlayerId, target, attackerPlayerId });
    if (amount <= 0) continue;
    target.damage = (target.damage || 0) + amount;
    events.push({
      type: 'damageUpdated',
      instanceId: target.instanceId,
      damage: target.damage,
      dealt: amount,
      reason: 'retaliate',
    });
    const koHp = cardEffectiveHp(draft, target, attackerPlayerId);
    if (koHp > 0 && target.damage >= koHp) {
      handleKnockout(draft, {
        victimPlayerId: attackerPlayerId,
        attackerPlayerId: strikerPlayerId,
        victim: target,
        events,
      });
    }
  }
}

// "… attacks your opponent's Active Pokémon for 10 damage. (Apply Weakness and Resistance.)"
function retaliationAttackDamage(draft, { marker, striker, strikerView, strikerPlayerId, target, attackerPlayerId }) {
  const strikerZone = draft.players[strikerPlayerId]?.zones?.active || [];
  const targetPlayer = draft.players[attackerPlayerId];
  const targetView = inPlayView(draft, target);
  const abilityReads = attackAbilityReads(draft, {
    attacker: strikerView,
    defender: targetView,
    playerId: strikerPlayerId,
    defenderPlayerId: attackerPlayerId,
  });
  const result = computeAttackDamage(
    abilityReads.attacker,
    targetView,
    { name: marker.sourceAttack, damage: marker.amount },
    {
      attackerZoneCards: strikerZone.some((c) => c.instanceId === striker.instanceId) ? strikerZone : [],
      defenderZoneCards: targetPlayer?.zones?.active || [],
      defenderInPlayCards: [...(targetPlayer?.zones?.active || []), ...(targetPlayer?.zones?.bench || [])],
      stadium: draft.stadium,
      defenderIsActive: true,
      baseDamage: marker.amount,
      ...prizeFlags(draft, strikerPlayerId, attackerPlayerId),
      ignoreDefenderEffects: abilityReads.ignoreDefenderEffects,
      abilityBonusBeforeWR: abilityReads.abilityBonusBeforeWR,
      abilityReductionBeforeWR: abilityReads.abilityReductionBeforeWR,
      abilityReductionAfterWR: abilityReads.abilityReductionAfterWR,
      abilityPrevention: abilityReads.abilityPrevention,
      weaknessOverride: abilityReads.weaknessOverride,
      defenderMarkers: activeAttackMarkers(draft, attackerPlayerId, target),
    }
  );
  return result.total;
}

/** The clause for one chosen target, with a Power Short ability bonus added when it applies. */
function targetClauseFor(draft, clause, card) {
  const bonus = clause.targetBonus;
  if (!bonus) return clause;
  const abilities = inPlayView(draft, card)?.abilities || [];
  const has = abilities.some((ability) => {
    const type = String(ability?.type || '').toLowerCase();
    const kind = /power/.test(type) ? 'power' : /body/.test(type) ? 'body' : 'ability';
    return kind === bonus.abilityKind;
  });
  return has ? { ...clause, amount: clause.amount + bonus.amount } : clause;
}

// Applies a chosen-target clause to the selected instanceIds. Returns damage dealt.
export function applyAttackTargets(
  draft,
  { selection, clause, defenderPlayerId, attackerPlayerId, attackName, activeRng = null, events }
) {
  let dealt = 0;
  const baseClause = clause;
  for (const id of selection || []) {
    const ref = findCard(draft, id);
    if (!ref || ref.playerId !== defenderPlayerId) continue;
    const clause = targetClauseFor(draft, baseClause, ref.card);
    const ignoreDefenderEffects = Boolean(clause.immunity?.ignoreDefenderEffects);
    if (ref.zoneId === 'bench') {
      dealt += clause.amount;
      damageBenchedPokemon(draft, {
        victim: ref.card,
        victimPlayerId: defenderPlayerId,
        attackerPlayerId,
        attackName,
        dealt: clause.amount,
        auto: false,
        activeRng,
        countersPlaced: clause.kind === 'counters',
        ownAttack: clause.side === 'own',
        ignoreDefenderEffects,
        events,
      });
    } else if (ref.zoneId === 'active') {
      dealt += applyFlatDamageToTarget(draft, {
        ref,
        amount: clause.activeWR
          ? activeTargetDamage(draft, { ref, clause, attackerPlayerId, attackName })
          : clause.amount,
        attackerPlayerId,
        countersPlaced: clause.kind === 'counters',
        legacyApplied: Boolean(clause.activeWR) || ignoreDefenderEffects,
        events,
      });
    }
  }
  return dealt;
}
