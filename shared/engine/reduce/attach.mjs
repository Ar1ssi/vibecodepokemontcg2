/**
 * @file The attachCard command (Energy/Tool attach and Evolution) with its Energy attach-plan
 * record and the Energy-attach and opponent-evolve triggers. Split out of reduce.mjs (design 073 B,
 * I250); reduce.mjs stays the public entry.
 */

import { findCard, attachmentHostId } from '../state.mjs';
import { isEnergy, isPokemon } from '../cards.mjs';
import { isPokemonToolCard } from '../rules/tool-combat.mjs';
import {
  stadiumOnAttachTriggers, stadiumOnEvolveTriggers, stadiumEvolveSearchEnergy,
} from '../rules/stadium-triggers.mjs';
import { applyStadiumTriggerEffect } from '../effects/stadium-trigger-apply.mjs';
import {
  inPlayEntries, parseOnOpponentEvolveAbilities, parseOnEnergyAttachAbilities,
  parseAlphaGrowthAttach,
} from '../rules/ability-triggers.mjs';
import { createPendingChoice, attachToRoot } from '../effects/executor.mjs';
import { isSpecialEnergyCard } from '../rules/special-energy-parse.mjs';
import { runSpecialEnergyTriggers } from '../effects/special-energy.mjs';
import { applyAutomaticEvolveAbility } from '../effects/ability.mjs';
import {
  isStadiumEnergyAttachHeal, isStadiumStatusPersistsOnEvolve,
} from '../rules/stadium-effects.mjs';
import { abilityEnergyAttachCounters, healBlockedByAbility } from '../rules/ability-combat.mjs';
import { isBasicEnergy } from '../rules/card-classify.mjs';
import { topPokemonCard } from '../rules/evolved-pokemon.mjs';
import { requiresTurnEndOnEvolve } from '../rules/evolution.mjs';
import { shuffleInPlace } from '../rng.mjs';
import { removeCondition, clearConditions, listConditions } from '../rules/special-conditions.mjs';
import { inPlayView, cardEffectiveHp, isGameConcluded, abilitySideContext } from './shared.mjs';
import { handleKnockout } from './knockout.mjs';
import { resolveCheckup, advanceTurn } from './turn.mjs';
import { chaosGymBlocks } from './trainer.mjs';

const energyOfType = (card, type) =>
  [card?.energyType, card?.name, ...(Array.isArray(card?.types) ? card.types : [])].some((value) =>
    String(value || '').toLowerCase().includes(type)
  );

/**
 * Blaine gym2-17's attachment plan (trainer-steps energyAttachPlan) as it applies to attaching
 * `energy` from hand to `targetInstanceId`: `{ plan, hostId }` when the Energy is a basic one of
 * the plan's type and the target is the player's Pokémon with the plan's name, else null.
 */
export function energyAttachPlanMatch(state, player, energy, targetInstanceId) {
  const plan = player?.flags?.energyAttachPlan;
  if (!plan || !isBasicEnergy(energy) || !energyOfType(energy, plan.energyType)) return null;
  const hostId = attachmentHostId(state, targetInstanceId);
  const hostRef = findCard(state, hostId);
  if (!hostRef || hostRef.playerId !== player.playerId || !['active', 'bench'].includes(hostRef.zoneId)) return null;
  const name = String(inPlayView(state, hostRef.card)?.name || '').toLowerCase();
  return name.includes(plan.nameTag) ? { plan, hostId } : null;
}

/**
 * "Instead of attaching your free Energy card, you may instead attach 2 Fire Energy cards to 1 of
 * your Pokémon with Blaine in its name": the turn's first attach, when it fits the plan, picks the
 * host; each later fitting attach to that host uses up the plan's remaining count.
 */
function recordEnergyAttachPlan(draft, player, energy, hostId) {
  const match = energyAttachPlanMatch(draft, player, energy, hostId);
  if (!match) return;
  if (!player.flags.energyAttached) {
    match.plan.hostId = match.hostId;
    match.plan.attached = 1;
  } else if (match.plan.hostId === match.hostId) {
    match.plan.attached += 1;
  }
}

/**
 * "Whenever your opponent plays a Pokémon from their hand to evolve 1 of their
 * Pokémon, put N damage counters on that Pokémon" (Team Rocket's Ampharos Darkest
 * Impulse). Fires after the evolve lands, before any turn-end check.
 */
function applyOnOpponentEvolve(draft, { evolvedCard, evolvingPlayerId, events }) {
  const entries = inPlayEntries(draft).filter(
    (entry) => entry.playerId !== evolvingPlayerId
  );
  const ctx = abilitySideContext(draft, evolvingPlayerId);
  const effects = parseOnOpponentEvolveAbilities(entries, ctx);
  if (effects.length === 0) return;
  for (const effect of effects) {
    const damage = effect.count * 10;
    evolvedCard.damage = (evolvedCard.damage || 0) + damage;
    events.push({
      type: 'damageUpdated',
      instanceId: evolvedCard.instanceId,
      damage: evolvedCard.damage,
      dealt: damage,
      reason: 'onOpponentEvolve',
      source: effect.source,
    });
  }
  const hp = cardEffectiveHp(draft, evolvedCard, evolvingPlayerId);
  if (hp > 0 && (evolvedCard.damage || 0) >= hp) {
    handleKnockout(draft, {
      victimPlayerId: evolvingPlayerId,
      attackerPlayerId: Object.keys(draft.players || {}).find(
        (id) => id !== evolvingPlayerId
      ),
      victim: evolvedCard,
      events,
    });
  }
}

export const GROWTH_ATTACH_EFFECT = 'alphaGrowth';
export const STADIUM_EVOLVE_SEARCH_EFFECT = 'stadiumEvolveSearch';

/**
 * Gengar ex Gnawing Curse: an Energy the opponent attaches from hand puts damage counters on the
 * receiving Pokémon (one counter is 10 damage). The Stadium's version is stadium-triggers
 * (Old Cemetery). A Knock Out from the counters resolves in the command tail
 * (resolveDamageCounterKnockouts).
 */
function applyGnawingCurseCounters(draft, { host, playerId, events }) {
  for (const [ownerId, owner] of Object.entries(draft.players || {})) {
    if (ownerId === playerId) continue;
    const ctx = abilitySideContext(draft, ownerId);
    for (const holder of [...(owner.zones?.active || []), ...(owner.zones?.bench || [])]) {
      if (holder.attachedTo) continue;
      const counters = abilityEnergyAttachCounters(inPlayView(draft, holder), ctx);
      if (counters <= 0) continue;
      host.damage = (host.damage || 0) + counters * 10;
      events.push({
        type: 'damageUpdated',
        instanceId: host.instanceId,
        damage: host.damage,
        dealt: counters * 10,
        source: holder.name,
      });
      // Lethal counters become a Knock Out via the reducer's post-command sweep.
      events.push({
        type: 'damageCountersPlaced',
        instanceId: host.instanceId,
        victimPlayerId: playerId,
        attackerPlayerId: null,
        damage: host.damage,
      });
    }
  }
}

/** Runs the Ability triggers of an Energy attached from the hand (`parseOnEnergyAttachAbilities`). */
function applyEnergyAttachTriggers(draft, { host, hostTop, energy, playerId, events }) {
  const effects = parseOnEnergyAttachAbilities(host, energy, abilitySideContext(draft, playerId));
  for (const { target, recover, heal, source } of effects) {
    if (recover) {
      for (const condition of listConditions(target)) {
        removeCondition(target, condition);
        events.push({ type: 'statusCleared', condition, instanceId: target.instanceId, playerId, source });
      }
    }
    const before = target.damage || 0;
    if (heal > 0 && before > 0 && !healBlockedByAbility(draft, target)) {
      target.damage = Math.max(0, before - heal);
      events.push({
        type: 'damageUpdated',
        instanceId: target.instanceId,
        damage: target.damage,
        healed: before - target.damage,
        source,
      });
    }
  }

  // Ancient Trait α Growth (Primal Kyogre-EX, PRC 149): after the normal hand attach the
  // player may attach up to 2 more Energy cards from hand to this Pokémon. Only the manual
  // attach command reaches this hook — Trainer/Ability/attack attaches never do — which is
  // exactly the printed "(except with an attack, Ability, or Trainer card)" clause.
  const growth = parseAlphaGrowthAttach(hostTop || host);
  if (!growth) return;
  const player = draft.players[playerId];
  const handEnergy = (player?.zones?.hand || []).filter((c) => isEnergy(c));
  if (handEnergy.length === 0) return;
  const count = Math.min(growth.count, handEnergy.length);
  const name = hostTop?.name || host?.name || 'α Growth';
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    prompt: `${name}: attach up to ${count} Energy card${count > 1 ? 's' : ''} from your hand?`,
    source: name,
    options: handEnergy,
    min: 0,
    max: count,
    cancellable: true,
    stateVersion: draft.stateVersion,
    resumeToken: {
      effectType: GROWTH_ATTACH_EFFECT,
      initiatorPlayerId: playerId,
      hostInstanceId: host.instanceId,
    },
  });
}

/** Resumes the α Growth offer: attach the chosen hand Energy cards to the host. */
export function resumeGrowthAttach(draft, { selection, resumeToken, events }) {
  draft.pendingChoice = null;
  const token = resumeToken || {};
  const player = draft.players[token.initiatorPlayerId];
  const host = token.hostInstanceId != null ? findCard(draft, token.hostInstanceId)?.card : null;
  if (!player || !host) return;
  const wanted = new Set(selection || []);
  const chosen = (player.zones.hand || []).filter(
    (c) => wanted.has(c.instanceId) && isEnergy(c)
  );
  for (const card of chosen) attachToRoot(player, card, host, events);
}

/** Gen 6 Mega Evolution / Primal Reversion: ends the evolving player's turn with a full checkup. */
function endTurnAfterMegaEvolve(draft, { playerId, instanceId, activeRng, events }) {
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  events.push({ type: 'turnEndedByMegaEvolve', playerId, instanceId });
  // Ending the turn runs the full between-turns sequence, as every other turn-ending path does.
  // Skipping Pokémon Checkup left Poison/Burn damage, status recovery and end-of-turn effects unapplied.
  if (isGameConcluded(draft)) return;
  resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: playerId });
  if (!isGameConcluded(draft)) advanceTurn(draft, { nextPlayerId: oppId, events });
}

/**
 * Forest of Vitality: the evolving player may search their deck for a matching Basic Energy and
 * attach it to the Pokémon that evolved. Shuffles only when a search happened. A Mega Evolution's
 * turn end waits for the answer (`endTurnInstanceId` in the token).
 */
function offerStadiumEvolveSearch(draft, { stadium, hostRef, playerId, evolvingInstanceId, endTurnInstanceId, events }) {
  const energyType = stadiumEvolveSearchEnergy(stadium, { hostTop: inPlayView(draft, hostRef.card) });
  if (!energyType) return false;
  const options = (draft.players[hostRef.playerId]?.zones?.deck || []).filter(
    (c) => isBasicEnergy(c) && energyOfType(c, energyType)
  );
  if (options.length === 0) return false;
  const name = stadium?.name || 'Stadium';
  draft.pendingChoice = createPendingChoice({
    player: hostRef.playerId,
    prompt: `${name}: search your deck for a Basic ${energyType[0].toUpperCase()}${energyType.slice(1)} Energy card to attach to ${inPlayView(draft, hostRef.card)?.name || 'that Pokémon'}?`,
    source: name,
    options,
    min: 0,
    max: 1,
    cancellable: true,
    stateVersion: draft.stateVersion,
    resumeToken: {
      effectType: STADIUM_EVOLVE_SEARCH_EFFECT,
      initiatorPlayerId: hostRef.playerId,
      hostInstanceId: hostRef.card.instanceId,
      energyType,
      evolvingInstanceId,
      endTurnInstanceId: endTurnInstanceId ?? null,
    },
  });
  return true;
}

/** Resumes the Forest of Vitality offer: attach the chosen Energy, shuffle, then end a Mega Evolution's turn. */
export function resumeStadiumEvolveSearch(draft, { selection, resumeToken, activeRng: rng, events }) {
  draft.pendingChoice = null;
  const token = resumeToken || {};
  const player = draft.players[token.initiatorPlayerId];
  const host = token.hostInstanceId != null ? findCard(draft, token.hostInstanceId)?.card : null;
  if (player && host) {
    const deck = player.zones.deck || [];
    const picked = deck.find(
      (c) =>
        (selection || []).includes(c.instanceId) &&
        isBasicEnergy(c) &&
        energyOfType(c, token.energyType)
    );
    if (picked) {
      attachToRoot(player, picked, host, events);
      if (rng) shuffleInPlace(rng, deck);
      events.push({ type: 'deckShuffled', playerId: token.initiatorPlayerId });
    }
  }
  if (token.endTurnInstanceId != null) {
    endTurnAfterMegaEvolve(draft, {
      playerId: token.initiatorPlayerId,
      instanceId: token.endTurnInstanceId,
      activeRng: rng,
      events,
    });
  }
}

export function attachCardCommand({ draft, payload, playerId, activeRng, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  const targetRef = findCard(draft, payload.targetInstanceId);
  // Attachment and evolve both land on the stack ROOT (D40): the client addresses the
  // card the player sees, which for a stacked Pokémon is the top Evolution, while every
  // `attachedTo === <root>` lookup and `topPokemonCard` read the Basic. Evolution
  // turn metadata and Special Conditions are per-Pokémon, and conditions live on the
  // root, so they follow the host too. Events keep the payload id the client sent.
  const hostRef =
    findCard(draft, attachmentHostId(draft, payload.targetInstanceId)) ||
    targetRef;

  if (
    cardRef &&
    targetRef &&
    cardRef.playerId === playerId &&
    cardRef.zoneId === 'hand' &&
    isPokemonToolCard(cardRef.card) &&
    chaosGymBlocks(draft, { card: cardRef.card, playerId, activeRng, events })
  ) {
    return;
  }
  if (cardRef && targetRef) {
    // Splice card out of its origin zone
    const srcZone = draft.players[playerId].zones[cardRef.zoneId];
    const idx = srcZone.findIndex(
      (c) => c.instanceId === payload.instanceId
    );
    if (idx >= 0) {
      srcZone.splice(idx, 1);
    }

    // A Shedinja once attached as a Tool (asTool) that came back to the hand evolves as itself.
    delete cardRef.card.asTool;
    // Set attachment pointer
    cardRef.card.attachedTo = hostRef.card.instanceId;

    // Add to the HOST's zone, not the actor's: a Team Flare Hyper Gear is
    // played by you but attaches to the opponent's Pokémon-EX (App. 24).
    const destZone = draft.players[hostRef.playerId].zones[hostRef.zoneId];
    destZone.push(cardRef.card);

    // Update turn energy attachment flag if energy
    if (isEnergy(cardRef.card)) {
      if (!draft.players[playerId].flags) {
        draft.players[playerId].flags = {};
      }
      if (cardRef.zoneId === 'hand') {
        recordEnergyAttachPlan(draft, draft.players[playerId], cardRef.card, hostRef.card.instanceId);
      }
      draft.players[playerId].flags.energyAttached = true;
      // "If you attach a {F} Energy card from your hand to this Pokémon during this turn"
      // (Flygon Sand Sonic): the turn-scoped record the attack condition reads.
      if (cardRef.zoneId === 'hand') {
        draft.players[playerId].flags.handEnergyAttachedThisTurn = [
          ...(draft.players[playerId].flags.handEnergyAttachedThisTurn || []),
          { hostId: hostRef.card.instanceId, energyId: cardRef.card.instanceId },
        ];
      }

      // Pokémon Park: attaching an Energy from hand to a Benched Pokémon
      // removes 1 damage counter (once per player per turn).
      const parkStadium = draft.stadium?.card || draft.stadium;
      const attachedToBench =
        hostRef.zoneId === 'bench' ||
        (draft.players[hostRef.playerId]?.zones?.bench || []).includes(
          hostRef.card
        );
      if (
        cardRef.zoneId === 'hand' &&
        attachedToBench &&
        isStadiumEnergyAttachHeal(parkStadium) &&
        !draft.players[playerId].flags.pokemonParkHealedThisTurn
      ) {
        draft.players[playerId].flags.pokemonParkHealedThisTurn = true;
        const before = hostRef.card.damage || 0;
        if (before > 0 && !healBlockedByAbility(draft, hostRef.card)) {
          hostRef.card.damage = Math.max(0, before - 10);
          events.push({
            type: 'damageUpdated',
            instanceId: hostRef.card.instanceId,
            damage: hostRef.card.damage,
            healed: before - hostRef.card.damage,
          });
        }
        events.push({
          type: 'stadiumTriggered',
          name: 'Pokémon Park',
          instanceId: parkStadium?.instanceId,
          playerId,
        });
      }

      // Energy-attach Ability triggers (Blissey V, Vaporeon, Magearna, …; design 034 I162).
      if (cardRef.zoneId === 'hand' && hostRef.playerId === playerId) {
        applyEnergyAttachTriggers(draft, {
          host: hostRef.card,
          hostTop: inPlayView(draft, hostRef.card),
          energy: cardRef.card,
          playerId,
          events,
        });
        applyGnawingCurseCounters(draft, { host: hostRef.card, playerId, events });
      }
    } else if (isPokemon(cardRef.card)) {
      if (!draft.players[playerId].flags) {
        draft.players[playerId].flags = {};
      }
      if (!draft.players[playerId].flags.evolved) {
        draft.players[playerId].flags.evolved = {};
      }
      draft.players[playerId].flags.evolved[payload.targetInstanceId] =
        true;
      cardRef.card.enteredPlayTurn = draft.turn.number;
      hostRef.card.lastEvolvedTurn = draft.turn.number;
      // Sea of Nothingness: Special Conditions survive evolving.
      if (
        !isStadiumStatusPersistsOnEvolve(
          draft.stadium?.card || draft.stadium
        )
      ) {
        clearConditions(hostRef.card);
      }
      events.push({
        type: 'pokemonEvolved',
        playerId,
        instanceId: payload.instanceId,
        targetInstanceId: payload.targetInstanceId,
      });

      // Special-energy on-evolve triggers (e.g. Regenerative Energy heal). The
      // planner gates on the Pokémon as it was before this card (audit SE11b).
      const evolveZone = draft.players[hostRef.playerId]?.zones?.[hostRef.zoneId] || [];
      runSpecialEnergyTriggers(draft, {
        trigger: 'evolve',
        host: hostRef.card,
        evolvedFrom: topPokemonCard(
          evolveZone.filter((c) => c !== cardRef.card),
          hostRef.card
        ),
        hostPlayerId: hostRef.playerId,
        hostZoneId: hostRef.zoneId,
        events,
      });

      // Evolve-played Ability with no "you may" (e.g. a turn damage boost) runs as the evolve lands.
      applyAutomaticEvolveAbility(draft, { evolvedCard: cardRef.card, playerId, events });

      // Stadium on-evolve triggers (Po Town, Galactic HQ, Wyndon, Battle Tower).
      const evolveStadium = draft.stadium?.card || draft.stadium;
      for (const effect of stadiumOnEvolveTriggers(evolveStadium, {
        evolvedCard: cardRef.card,
        hostTop: inPlayView(draft, hostRef.card),
      })) {
        applyStadiumTriggerEffect(draft, effect, {
          host: hostRef.card,
          hostPlayerId: hostRef.playerId,
          events,
        });
      }

      // Forest of Vitality: search-and-attach offer. Set before the Mega turn end so it resolves first.
      const forestOffered = offerStadiumEvolveSearch(draft, {
        stadium: evolveStadium,
        hostRef,
        playerId,
        evolvingInstanceId: payload.instanceId,
        endTurnInstanceId: null,
        events,
      });

      // Opponent-evolves ability trigger (design 034 slice 4).
      applyOnOpponentEvolve(draft, {
        evolvedCard: hostRef.card,
        evolvingPlayerId: hostRef.playerId,
        events,
      });

      // Gen 6 Mega Evolution / Primal Reversion: the evolve ends the turn
      // immediately unless the matching Spirit Link is already attached
      // (rulebook 30c 1.4). The reducer is the authority; the client only
      // mirrored this before.
      const attachedCards = destZone.filter(
        (c) => c.attachedTo === hostRef.card.instanceId
      );
      if (
        requiresTurnEndOnEvolve(cardRef.card, {
          ...hostRef.card,
          attachedCards,
        })
      ) {
        if (forestOffered && draft.pendingChoice?.resumeToken?.effectType === STADIUM_EVOLVE_SEARCH_EFFECT) {
          draft.pendingChoice.resumeToken.endTurnInstanceId = payload.instanceId;
        } else {
          endTurnAfterMegaEvolve(draft, {
            playerId,
            instanceId: payload.instanceId,
            activeRng,
            events,
          });
        }
      }
    }

    // A Pokémon attach is an evolution and is announced by `pokemonEvolved`;
    // emitting `cardAttached` too would double-narrate it (design 021).
    if (!isPokemon(cardRef.card)) {
      events.push({
        type: 'cardAttached',
        instanceId: payload.instanceId,
        targetInstanceId: payload.targetInstanceId,
        playerId,
      });
    }

    // Special-energy on-attach triggers (draw/search/heal/damage/switch/
    // devolve/return-basic-energy). A search or switch may suspend the
    // command on a PendingChoice, resumed via resolveChoice.
    if (isEnergy(cardRef.card) && isSpecialEnergyCard(cardRef.card)) {
      runSpecialEnergyTriggers(draft, {
        rng: activeRng,
        trigger: 'attach',
        host: hostRef.card,
        hostTop: inPlayView(draft, hostRef.card),
        hostPlayerId: hostRef.playerId,
        hostZoneId: hostRef.zoneId,
        energy: cardRef.card,
        fromZone: cardRef.zoneId,
        events,
      });
    }

    // Stadium on-attach triggers (Calamitous Snowy Mountain, Frozen City,
    // Old Cemetery, Dawn Stadium, Island Cave) — any Energy from hand.
    if (isEnergy(cardRef.card) && cardRef.zoneId === 'hand') {
      const attachStadium = draft.stadium?.card || draft.stadium;
      for (const effect of stadiumOnAttachTriggers(attachStadium, {
        hostTop: inPlayView(draft, hostRef.card),
        fromZone: cardRef.zoneId,
      })) {
        applyStadiumTriggerEffect(draft, effect, {
          host: hostRef.card,
          hostPlayerId: hostRef.playerId,
          events,
        });
      }
    }
  }
}
