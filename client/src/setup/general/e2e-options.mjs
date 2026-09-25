// Design 004 slice 2: legal-move enumeration for the playtest bot.
//
// Pure and Node-importable on purpose — `e2e-api.js` reaches state.js/DOM and can
// never be unit-tested, so all the rule reasoning lives here and the bridge only
// hands it live zone arrays. Every gate below delegates to the same rules module
// the real UI path calls (canPerformAction, canEvolve, canRetreat, …) rather than
// re-deriving legality: a bot that enumerates by its own copy of the rules drifts
// silently from what the client will actually accept.
//
// Safe to import from Node: rules-state.mjs, cards.mjs, evolution.mjs,
// attack-engine.mjs, retreat.mjs, status.mjs, energy-effects.mjs and
// collect-usable-abilities.mjs reach neither state.js nor the DOM.

import {
  rulesState,
  canPerformAction,
  abilityUsed,
  ensureCardData,
} from '../../../../shared/engine/rules/rules-state.mjs';
import { isPokemon, isEnergy, isTrainer, isBasicPokemon } from '../../../../shared/engine/cards.mjs';
import { canEvolve, normalizeStage } from '../../../../shared/engine/rules/evolution.mjs';
import { canPayAttackCost } from '../../../../shared/engine/rules/attack-engine.mjs';
import { canRetreat } from '../../../../shared/engine/rules/retreat.mjs';
import { canAct, statusAllowsRetreat } from '../../../../shared/engine/rules/status.mjs';
import { serverEnergyDescriptor } from '../../../../shared/engine/rules/server-energy.mjs';
import {
  collectUsableAbilityCandidates,
  filterUsableAbilities,
} from '../../../../shared/engine/rules/collect-usable-abilities.mjs';
import { BENCH_LIMIT } from '../../../../shared/engine/rules/ko-flow.mjs';
import { stage2EvolvesFromBasic } from '../../../../shared/engine/rules/evolved-pokemon.mjs';
import {
  isSupporterTrainer,
  isToolTrainer,
  trainerPlayBlockReason,
} from '../../../../shared/engine/rules/trainer-play-conditions.mjs';

// Same key the client uses for statusState lookups (chat-buttons.js attack path):
// the DOM card id when the card is rendered, its name otherwise. Read as a plain
// property chain — no DOM API is called, so this stays Node-safe.
export function defaultStatusKey(card) {
  return card?.image?.dataset?.cardId || card?.name || '';
}

function subtypeSet(card) {
  const subtypes = Array.isArray(card?.subtypes) ? card.subtypes : [];
  return new Set([
    String(card?.type || '').toLowerCase(),
    ...subtypes.map((s) => String(s).toLowerCase()),
  ]);
}

function isSupporterCard(card) {
  return subtypeSet(card).has('supporter') || isSupporterTrainer(card);
}

function isItemCard(card) {
  return subtypeSet(card).has('item');
}

// Attack/retreat cost checks take { type, family } descriptors (see
// expandEnergyEntries in attack-engine.mjs), so a Double Colorless counts twice.
// Read the way the authoritative server reads them, so an offered attack is never rejected.
function energyDescriptors(attachedCards) {
  return (Array.isArray(attachedCards) ? attachedCards : []).filter(isEnergy).map(serverEnergyDescriptor);
}

// Where a Pokémon's attached energy lives depends on the render path: the
// authoritative view hangs it off `card.attachedCards`, while legacy zone
// arrays keep it flat in the same zone, linked by `image.relative`
// (energiesAttachedToPokemon). The caller knows which; this is only the default.
function defaultAttachedCards(card) {
  return Array.isArray(card?.attachedCards) ? card.attachedCards : [];
}

// Mirrors trainerTargetCounts (evolved-pokemon.mjs) for the client's card shapes: an
// evolution shows up either as the card itself (legacy) or under attachedCards (authoritative).
function trainerTargetCountsOf(handCards, targets, attachedCardsOf, deckList) {
  const attachedOf = (card) => attachedCardsOf(card) || [];
  const isTool = (card) => isTrainer(card) && isToolTrainer(card);
  // A Basic put into play this turn cannot be Rare-Candy'd into a Stage 2
  // (`rareCandyOptions` on the server and canEvolve both exclude it); offering
  // it here glowed/offered a play the engine rejects.
  const currentTurn = rulesState.turnNumber;
  const basics = targets
    .map(({ card }) => card)
    .filter(
      (card) =>
        isBasicPokemon(card) &&
        !attachedOf(card).some(isPokemon) &&
        card.enteredPlayTurn !== currentTurn
    );
  const knownCards = [...deckList, ...handCards, ...targets.flatMap(({ card }) => [card, ...attachedOf(card)])];
  return {
    rareCandyOptionCount: handCards.filter(
      (c) =>
        isPokemon(c) &&
        normalizeStage(c?.stage) === 'Stage 2' &&
        basics.some((basic) => stage2EvolvesFromBasic(c, basic, knownCards))
    ).length,
    toolTargetCount: targets.filter(({ card }) => !attachedOf(card).some(isTool)).length,
  };
}

function inPlayTargets(active, bench) {
  const targets = [];
  if (active) targets.push({ card: active, targetZone: 'active', targetIndex: 0 });
  bench.forEach((card, index) => {
    if (card) targets.push({ card, targetZone: 'bench', targetIndex: index });
  });
  return targets;
}

/**
 * Enumerate every action `user` may legally take right now, as a flat array of
 * tagged options (design 004 § slice 2). Async because evolution legality is
 * async (canEvolve awaits card-data enrichment).
 *
 * @param {object} board
 * @param {'self'|'opp'} board.user
 * @param {Array} board.hand        live hand cards
 * @param {object|null} board.active live active Pokémon card
 * @param {Array} board.bench       live bench Pokémon cards
 * @param {Array} board.activeZoneCards  the whole active zone array (retreat-cost modifiers)
 * @param {(card) => boolean} [board.isAbilityUsed]
 * @param {(card) => string} [board.statusKey]
 * @param {(card) => Array} [board.attachedCardsOf]
 * @param {Array} [board.deckList] every card of the player's own 60 (traces Rare Candy lines)
 * @returns {Promise<Array<object>>}
 */
export async function enumerateOptions({
  user = 'self',
  hand = [],
  active = null,
  bench = [],
  activeZoneCards = [],
  isAbilityUsed = (card) => abilityUsed(user, card),
  statusKey = defaultStatusKey,
  attachedCardsOf = defaultAttachedCards,
  prizeCounts = null,
  stadiumName = null,
  deckList = [],
} = {}) {
  const options = [];
  // Server card identity, when the authoritative view is what we are reading. Under that
  // netcode an option's handIndex/targetIndex address the SERVER view array, while
  // moveCardBundle's legacy fallback indexes the local DOM zone array — different arrays,
  // no guaranteed agreement. Carrying the instanceId lets act() address the card itself
  // (authoritative-dispatch.js's { moving, target } bundle) instead of a position. Null in
  // legacy mode, where the index is the identity and the field is ignored.
  const idOf = (card) => (card && card.instanceId != null ? card.instanceId : null);
  const handCards = Array.isArray(hand) ? hand : [];
  const benchCards = (Array.isArray(bench) ? bench : []).filter(Boolean);

  // Outside your own turn (and during setup//after the game ends) nothing is
  // legal — not even passing. Return an empty list rather than a bare 'pass':
  // the runner reads "no options" as "not my move", and a pass emitted on the
  // opponent's turn earns a cmdRejected.
  const turnGate = canPerformAction({ user, action: 'pass' });
  if (!turnGate.allowed || rulesState.turnPlayer !== user) return options;

  const canMove = canPerformAction({
    user,
    action: 'moveCard',
    initiator: user,
  }).allowed;

  // ── play a Basic from hand ────────────────────────────────────────────
  if (canMove) {
    for (let handIndex = 0; handIndex < handCards.length; handIndex += 1) {
      const card = handCards[handIndex];
      if (!isPokemon(card)) continue;
      // isBasicPokemon() defaults an unresolved card.stage to 'Basic' (so a freshly
      // drawn/unenriched card doesn't block legal-move enumeration) — that default is
      // wrong for a Stage 1/2 card whose TCGdex data just hasn't arrived yet, and
      // offering it as playBasic here only for the real move to then reject it once
      // its true stage is known. Enrich before classifying so the two agree.
      // eslint-disable-next-line no-await-in-loop -- legality is per hand card
      await ensureCardData(card);
      // TCGdex's own search endpoint is flakier than the card-detail endpoint (seen
      // 503s under normal load, unrelated to request volume) — enrichment can still
      // fail after a genuine attempt. Don't fall back to isBasicPokemon()'s permissive
      // "assume Basic" default here: skip the card instead of misoffering it, since
      // every real Pokémon card resolves an hp once actually enriched.
      if (!card.hp) continue;
      if (!isBasicPokemon(card)) continue;
      if (!active) {
        options.push({
          kind: 'playBasic',
          handIndex,
          targetZone: 'active',
          instanceId: idOf(card),
        });
      } else if (benchCards.length < BENCH_LIMIT) {
        options.push({
          kind: 'playBasic',
          handIndex,
          targetZone: 'bench',
          instanceId: idOf(card),
        });
      }
    }
  }

  const targets = inPlayTargets(active, benchCards);

  // ── evolve ────────────────────────────────────────────────────────────
  if (canPerformAction({ user, action: 'evolve' }).allowed) {
    for (let handIndex = 0; handIndex < handCards.length; handIndex += 1) {
      const card = handCards[handIndex];
      if (!isPokemon(card)) continue;
      const stage = normalizeStage(card?.stage);
      if (stage !== 'Stage 1' && stage !== 'Stage 2') continue;
      for (const target of targets) {
        const wasPlayedThisTurn =
          target.card?.enteredPlayTurn === rulesState.turnNumber;
        // eslint-disable-next-line no-await-in-loop -- legality is per (hand card, target) pair
        const check = await canEvolve(user, target.card, card, wasPlayedThisTurn);
        if (!check.allowed) continue;
        options.push({
          kind: 'evolve',
          handIndex,
          targetZone: target.targetZone,
          targetIndex: target.targetIndex,
          instanceId: idOf(card),
          targetInstanceId: idOf(target.card),
        });
      }
    }
  }

  // ── attach energy (once per turn) ─────────────────────────────────────
  handCards.forEach((card, handIndex) => {
    if (!isEnergy(card)) return;
    for (const target of targets) {
      // Target-aware: a defender-Active attach lock must not suppress a Bench
      // attach (the printed text restricts only the Defending Pokémon).
      if (
        !canPerformAction({
          user,
          action: 'attachEnergy',
          targetZoneId: target.targetZone,
        }).allowed
      ) {
        continue;
      }
      options.push({
        kind: 'attach',
        handIndex,
        targetZone: target.targetZone,
        targetIndex: target.targetIndex,
        instanceId: idOf(card),
        targetInstanceId: idOf(target.card),
      });
    }
  });

  // ── play a Trainer ────────────────────────────────────────────────────
  handCards.forEach((card, handIndex) => {
    if (!isTrainer(card) || isEnergy(card) || isPokemon(card)) return;
    const action = isSupporterCard(card)
      ? 'playSupporter'
      : isItemCard(card)
        ? 'playItem'
        : 'moveCard';
    if (!canPerformAction({ user, action, initiator: user }).allowed) return;
    // The server also enforces card-printed conditions; offering a blocked card earns a
    // cmdRejected. Skipped only when the caller has no prize counts to judge them by.
    const blocked =
      prizeCounts &&
      trainerPlayBlockReason({
        card,
        turnNumber: rulesState.turnNumber,
        myPrizes: prizeCounts.self,
        opponentPrizes: prizeCounts.opponent,
        stadiumName,
        // The client marks a played Stadium `stadiumPlayed`; the server's flag
        // (merged into rulesState.flags under authoritative netcode) is
        // `stadiumPlayedThisTurn`. Either one blocks a second Stadium.
        stadiumPlayedThisTurn: !!(
          rulesState.flags?.[user]?.stadiumPlayed ||
          rulesState.flags?.[user]?.stadiumPlayedThisTurn
        ),
        handCount: handCards.length,
        handNames: handCards.map((c) => c?.name || ''),
        benchCount: benchCards.length,
        ...trainerTargetCountsOf(handCards, inPlayTargets(active, benchCards), attachedCardsOf, deckList),
      });
    if (blocked) return;
    options.push({ kind: 'playTrainer', handIndex, instanceId: idOf(card) });
  });

  // ── abilities (once per turn, interactive steps only) ─────────────────
  if (canMove) {
    const usable = filterUsableAbilities(
      collectUsableAbilityCandidates(active, benchCards, handCards),
      { rulesEnabled: rulesState.enabled, isUsed: isAbilityUsed }
    );
    for (const entry of usable) {
      options.push({
        kind: 'ability',
        zone: entry.zone,
        index: entry.index,
        abilityIndex: 0,
        // The authoritative dispatch addresses the card by instanceId (the legacy
        // index is empty under server rendering); without it a hand-activated
        // ability (Luxray, Charjabug) could not resolve.
        instanceId: idOf(entry.card),
      });
    }
  }

  // ── attack ────────────────────────────────────────────────────────────
  if (active && canPerformAction({ user, action: 'attack' }).allowed) {
    // Asleep/Paralyzed/Confused all block the attack button; asleep and
    // confused resolve through a coin flip the bot can't pre-decide, so an
    // attack is only offered when the Pokémon can act outright.
    if (canAct(user, statusKey(active)).can) {
      const attached = energyDescriptors(attachedCardsOf(active));
      const attacks = Array.isArray(active.attacks) ? active.attacks : [];
      attacks.forEach((attack, attackIndex) => {
        const cost = Array.isArray(attack?.cost) ? attack.cost : [];
        if (cost.length && !canPayAttackCost(attached, cost)) return;
        options.push({ kind: 'attack', attackIndex });
      });
    }
  }

  // ── retreat ───────────────────────────────────────────────────────────
  if (active && benchCards.length) {
    const zoneCards = Array.isArray(activeZoneCards) ? activeZoneCards : [];
    const retreatCheck = canRetreat(
      user,
      active,
      energyDescriptors(attachedCardsOf(active)),
      zoneCards,
      benchCards
    );
    if (retreatCheck.allowed && statusAllowsRetreat(user, statusKey(active)).can) {
      benchCards.forEach((_card, benchIndex) => {
        options.push({ kind: 'retreat', benchIndex });
      });
    }
  }

  options.push({ kind: 'pass' });
  return options;
}
