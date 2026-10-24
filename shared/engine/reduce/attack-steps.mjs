/**
 * @file Attack-time prompts and executor step runs: search choices, discard/mill scaling, spread
 * attaches, optional costs, the attack resume context, planAttackSteps/runAttackSteps. Split out of
 * reduce.mjs (design 073 B, I250); reduce.mjs stays the public entry.
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { isEnergy, isPokemon } from '../cards.mjs';
import { discardCurrentStadium } from '../effects/trainer.mjs';
import { createPendingChoice, attachToRoot, executeSteps } from '../effects/executor.mjs';
import { resolveAttackEnergyDiscard } from '../effects/special-energy.mjs';
import { parseAttackSteps, resolveCoinGates } from '../rules/attack-steps.mjs';
import { isBasicEnergy } from '../rules/card-classify.mjs';
import { isAncientCard, isFutureCard } from '../rules/paradox-tags.mjs';
import { serverEnergyDescriptor } from '../rules/server-energy.mjs';
import { clearConditions } from '../rules/special-conditions.mjs';
import { parseNextTurnLock } from '../rules/attack-effects.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { inPlayView, setGameEnded, isGameConcluded, shuffleDeckWithRng } from './shared.mjs';
import { attackViewFor } from './attack.mjs';
import { resolveDamageCounterKnockouts } from './knockout.mjs';
import { applyAttackTargets } from './attack-damage.mjs';

/**
 * Builds the attack deck-search PendingChoice for the first stage (at or after
 * `fromIndex`) that has at least one legal card in the deck. A staged
 * `searchDeckSequence` is walked one stage per choice so each stage keeps its
 * own filter; collapsing the stages into one list previously left `what`
 * undefined and offered the entire deck. Returns null when no stage matches.
 *
 * @param {object} draft
 * @param {{ playerId: string, oppId: string, attackerId?: number, stages: object[], fromIndex?: number }} params
 * @returns {object|null}
 */
export function buildAttackSearchChoice(
  draft,
  { playerId, oppId, attackerId, stages, fromIndex = 0, reveal = false }
) {
  const player = draft.players[playerId];
  const deck = player?.zones?.deck || [];
  for (let i = fromIndex; i < stages.length; i++) {
    const stage = stages[i] || {};
    const what = stage.what || 'card';
    const dest = stage.destination || 'hand';
    const matches = deck.filter((c) => matchesSearch(c, what));
    if (matches.length === 0) continue;

    let maxCount = stage.count || 1;
    if (dest === 'bench') {
      const benchCount = (player.zones.bench || []).filter(
        (c) => !c.attachedTo
      ).length;
      maxCount = Math.min(maxCount, Math.max(0, 5 - benchCount));
    }
    if (maxCount <= 0) continue;

    return createPendingChoice({
      player: playerId,
      source: 'attack',
      prompt: `Search your deck for up to ${Math.min(maxCount, matches.length)} ${what}.`,
      // src is required for the client's card picker: apply-view's
      // openChoiceInCardPicker only uses the carousel when every option carries
      // art, otherwise it falls back to the face-down grid modal.
      options: matches.map((c) => ({
        instanceId: c.instanceId,
        name: c.name,
        src: c.src || '',
        type: c.type || '',
      })),
      min: 0,
      max: Math.min(maxCount, matches.length),
      resumeToken: {
        effectType: 'attack',
        initiatorPlayerId: playerId,
        oppId,
        attackerId,
        searchStages: stages,
        searchStageIndex: i,
        // Design 059: the attack's text reveals what it searches into the hand.
        reveal,
      },
    });
  }
  return null;
}

/**
 * Pure and total command reducer.
 *
 * @param {object} state GameState
 * @param {object} command Command envelope { type, payload, playerId, clientSeq }
 * @param {object} [rng] Optional seeded PRNG
 * @returns {{
 *   state: object,
 *   events: object[],
 *   pendingChoice: object|null,
 *   error?: string|null,
 *   reason?: string
 * }}
 */
/**
 * Candidate groups for a discard-to-scale attack: one per printed "… or …" group
 * (Dragon Burst: all basic {R} or all basic {L}), else the single clause. Only groups
 * with Energy to discard are returned; `max` is capped at the group's card count.
 *
 * @returns {{ cards: object[], max: number, all: boolean, energyType: string|null }[]}
 */
export function discardScalingGroups(draft, { playerId, attacker, scaling }) {
  const specs = Array.isArray(scaling.groups) ? scaling.groups : [scaling];
  return specs
    .map((spec) => {
      const cards = discardScalingCandidates(draft, {
        playerId,
        attacker,
        scaling: { ...scaling, ...spec },
      });
      return {
        cards,
        max: Math.min(spec.max, cards.length),
        all: Boolean(spec.all),
        energyType: spec.energyType || null,
      };
    })
    .filter((group) => group.cards.length > 0);
}

// Resume-token form of a discard group: ids and a finite cap (tokens must stay serialisable).
export const discardGroupToken = (group) => ({
  ids: group.cards.map((c) => c.instanceId),
  max: group.max,
});

/**
 * Narrows a discard-to-scale selection to ONE printed group ("… or …" forms): the
 * picked group for Dragon Burst's type choice, else the group of the first chosen card,
 * capped at that group's max. Tokens without groups pass the selection through.
 */
export function discardScaleSelection(token, selection) {
  const groups = Array.isArray(token.groups) ? token.groups : null;
  if (!groups) return { selection, allowedIds: token.allowedIds || [] };
  if (token.pickGroup) {
    const group = groups[Number((selection || [])[0]) - 1];
    return { selection: group?.ids || [], allowedIds: group?.ids || [] };
  }
  const chosen = selection || [];
  const firstId = chosen.find((id) => groups.some((g) => g.ids.includes(id)));
  const group = groups.find((g) => g.ids.includes(firstId));
  if (!group) return { selection: [], allowedIds: [] };
  const inGroup = [...new Set(chosen)].filter((id) => group.ids.includes(id));
  return { selection: inGroup.slice(0, group.max), allowedIds: group.ids };
}

/**
 * Energy a discard-to-scale attack may discard (Inferno X, Garland Ray,
 * Gholdengo ex): the attached Energy on the Pokémon the printed text names, or
 * the Energy cards in hand, filtered by printed type ({R}) and "basic".
 *
 * @param {object} draft
 * @param {{ playerId: string, attacker: object|null, scaling: object }} params
 * @returns {object[]} Attached Energy cards, in board order
 */
function discardScalingCandidates(draft, { playerId, attacker, scaling }) {
  const player = draft.players[playerId];
  if (!player || !attacker) return [];
  const stadiumCard = draft.stadium?.card || draft.stadium || null;
  const matchesFilter = (card, hostPokemon) => {
    if (!isEnergy(card)) return false;
    if (
      scaling.name &&
      !String(card.name || '').toLowerCase().includes(scaling.name.toLowerCase())
    ) {
      return false;
    }
    if (scaling.basicOnly && !isBasicEnergy(card)) return false;
    if (!scaling.energyType) return true;
    const provided = serverEnergyDescriptor(card, { stadiumCard, hostPokemon });
    return (
      provided.type === scaling.energyType ||
      provided.dualType === scaling.energyType
    );
  };
  if (scaling.source === 'hand') {
    return (player.zones?.hand || []).filter((c) => matchesFilter(c, null));
  }
  const zoneIds =
    scaling.source === 'self'
      ? ['active']
      : scaling.source === 'bench'
        ? ['bench']
        : ['active', 'bench'];
  const candidates = [];
  for (const zoneId of zoneIds) {
    const zone = player.zones?.[zoneId] || [];
    for (const host of zone.filter((c) => !c.attachedTo && isPokemon(c))) {
      if (scaling.source === 'self' && host.instanceId !== attacker.instanceId) {
        continue;
      }
      const hostView = inPlayView(draft, host);
      for (const card of zone) {
        if (card.attachedTo !== host.instanceId) continue;
        if (matchesFilter(card, hostView)) candidates.push(card);
      }
    }
  }
  return candidates;
}

/**
 * Discards the chosen attached Energy for a discard-to-scale attack and returns
 * how many were actually discarded (ids outside `allowedIds` are ignored).
 */
// `destination: 'deck'` (Rocket Splash) shuffles the chosen Energy into the deck instead.
export function discardScalingEnergy(draft, { playerId, selection, allowedIds, destination, activeRng, events }) {
  const player = draft.players[playerId];
  let discarded = 0;
  for (const id of new Set(selection || [])) {
    if (!allowedIds.includes(id)) continue;
    const ref = findCard(draft, id);
    if (!ref || ref.playerId !== playerId) continue;
    const zone = player.zones[ref.zoneId];
    const idx = zone.findIndex((c) => c.instanceId === id);
    if (idx < 0) continue;
    const resolution = destination === 'deck' ? null : resolveAttackEnergyDiscard(draft, zone[idx]);
    if (resolution === 'reattach') {
      discarded++;
      continue;
    }
    const [card] = zone.splice(idx, 1);
    card.attachedTo = null;
    let to = 'deck';
    if (destination === 'deck') player.zones.deck.push(card);
    else if (resolution === 'hand') {
      player.zones.hand.push(card);
      to = 'hand';
    } else to = discardCardToPlayerZone(player, card);
    events.push({
      type: 'cardMoved',
      instanceId: id,
      from: ref.zoneId,
      to,
      playerId,
      reason: destination === 'deck' ? 'attack-energy-shuffle' : 'attack-energy-discard',
    });
    discarded++;
  }
  if (destination === 'deck' && discarded > 0) {
    shuffleDeckWithRng(player, activeRng);
    events.push({ type: 'deckShuffled', playerId });
  }
  return discarded;
}

/**
 * Reveals the top `reveal.count` cards of the attacker's deck, counts the printed kind,
 * discards the counted cards when the attack says so (Destructo-Press), and shuffles the
 * deck. Returns the count (0 for an empty deck).
 */
export function revealDeckTopForAttack(draft, { playerId, reveal, activeRng, events }) {
  const player = draft.players[playerId];
  const revealed = (player?.zones?.deck || []).slice(0, reveal.count);
  if (revealed.length === 0) return 0;
  events.push({
    type: 'cardsRevealed',
    playerId,
    cards: revealed.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  const matched = revealed.filter((c) => millFilterMatches(c, reveal.filter));
  if (reveal.discardMatched && matched.length > 0) {
    for (const card of matched) {
      player.zones.deck.splice(player.zones.deck.indexOf(card), 1);
      discardCardToPlayerZone(player, card);
    }
    events.push({
      type: 'cardsDiscarded',
      playerId,
      cards: matched.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
  }
  const matches = matched.length;
  shuffleDeckWithRng(player, activeRng);
  events.push({ type: 'deckShuffled', playerId });
  return matches;
}

/** True when a discarded deck card is the kind a deck-mill attack counts. */
export function millFilterMatches(card, filter) {
  if (!card) return false;
  switch (filter.kind) {
    case 'any':
      return true;
    case 'energy': {
      if (!isEnergy(card)) return false;
      if (filter.basicOnly && !isBasicEnergy(card)) return false;
      if (!filter.energyType) return true;
      const provided = serverEnergyDescriptor(card);
      return (
        provided.type === filter.energyType ||
        provided.dualType === filter.energyType
      );
    }
    case 'pokemon':
      return isPokemon(card);
    case 'supporter':
      return /supporter/i.test(
        `${card.trainerType || ''} ${[].concat(card.subtypes || []).join(' ')}`
      );
    case 'ancient':
      return isAncientCard(card);
    case 'future':
      return isFutureCard(card);
    default:
      return String(card.name || '')
        .toLowerCase()
        .includes(String(filter.name || '').toLowerCase());
  }
}

/**
 * Discards from the top of the deck(s) a deck-mill attack names and returns
 * the instanceIds of the discarded cards that match its counted kind.
 */
export function millDecksForAttack(draft, { playerId, oppId, mill, count, events }) {
  const playerIds = mill.players === 'each' ? [playerId, oppId] : [playerId];
  const matchedIds = [];
  for (const id of playerIds) {
    const player = draft.players[id];
    const deck = player?.zones?.deck;
    if (!Array.isArray(deck)) continue;
    const toMill =
      mill.keep !== null
        ? Math.max(0, deck.length - mill.keep)
        : Math.min(Math.max(0, count), deck.length);
    for (const card of deck.splice(0, toMill)) {
      if (millFilterMatches(card, mill.filter)) matchedIds.push(card.instanceId);
      const to = discardCardToPlayerZone(player, card);
      events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: 'deck',
        to,
        playerId: id,
        reason: 'attack-mill',
      });
    }
  }
  return matchedIds;
}

/** Moves milled cards still in the discard pile onto `root` (Raikou). */
/**
 * Raises the next "which Benched Pokémon gets an Energy" pick for a spread attach
 * (Aura Jab). Returns false — no choice raised — when nothing is left to attach or
 * no Benched Pokémon exists.
 */
export function raiseSpreadAttachChoice(draft, { playerId, attackName, spread, remaining, token }) {
  const player = draft.players[playerId];
  const hasEnergy = (player?.zones?.discard || []).some((c) => matchesSearch(c, spread.search));
  const benched = (player?.zones?.bench || []).filter((c) => !c.attachedTo && isPokemon(c));
  if (remaining <= 0 || !hasEnergy || benched.length === 0) return false;
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: 'attack',
    prompt: `${attackName}: choose a Benched Pokémon for a ${spread.search} card (${remaining} left, none to stop)`,
    options: benched,
    min: 0,
    max: 1,
    resumeToken: { ...token, remaining, spread },
  });
  return true;
}

export function attachMilledCards(player, cardIds, root, events) {
  for (const id of cardIds) {
    const card = (player.zones.discard || []).find((c) => c.instanceId === id);
    if (card) attachToRoot(player, card, root, events);
  }
}

/**
 * Energy cards attached to `attacker` that satisfy the printed return-energy
 * type (Mega Greninja ex — Ninja Spinner). A null type matches any Energy.
 */
export function attachedEnergyCardsFor(draft, playerId, attacker, energyType) {
  if (!attacker) return [];
  const player = draft.players[playerId];
  const attached = [
    ...(player?.zones?.active || []),
    ...(player?.zones?.bench || []),
  ].filter((c) => c.attachedTo === attacker.instanceId && isEnergy(c));
  if (!energyType) return attached;
  return attached.filter((c) => matchesSearch(c, `${energyType} Energy`));
}

/**
 * Moves one attached Energy card (of `energyType`, or any when null) from the
 * attacker to its owner's hand. Returns true when a card moved. Used by the
 * optional return-energy-for-damage attack (Mega Greninja ex — Ninja Spinner).
 */
export function moveAttachedEnergyToHand(draft, { playerId, attacker, energyType, events }) {
  const player = draft.players[playerId];
  if (!player?.zones || !attacker) return false;
  for (const zoneKey of ['active', 'bench']) {
    const zone = player.zones[zoneKey];
    if (!Array.isArray(zone)) continue;
    const idx = zone.findIndex(
      (c) =>
        c.attachedTo === attacker.instanceId &&
        isEnergy(c) &&
        (!energyType || matchesSearch(c, `${energyType} Energy`))
    );
    if (idx === -1) continue;
    const [card] = zone.splice(idx, 1);
    card.attachedTo = null;
    player.zones.hand.push(card);
    events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: zoneKey,
      to: 'hand',
      playerId,
      reason: 'attack-return-energy',
    });
    return true;
  }
  return false;
}

const YES_NO_OPTIONS = (bonusLabel) => [
  // Numeric sentinels: the choice validator only accepts integer instanceIds.
  { instanceId: 1, name: `Yes — ${bonusLabel}`, type: 'option' },
  { instanceId: 2, name: 'No', type: 'option' },
];

const energyCardOptions = (cards) =>
  cards.map((c) => ({ instanceId: c.instanceId, name: c.name, src: c.src || '', type: c.type || 'Energy' }));

/**
 * The prompt for an optional "You may <cost>. If you do, …" bonus, or null when the cost cannot
 * be paid (the attack then deals its printed damage without asking). A cost with a card choice
 * lists the cards (picking none declines); a cost without one is a yes/no.
 */
export function optionalCostOffer(draft, { playerId, attacker, attack, clause }) {
  const { cost, bonus, perEach } = clause;
  const bonusLabel = perEach ? 'more damage' : `+${bonus} damage`;
  const yesNo = (what) => ({
    prompt: `${attack.name}: ${what} for ${perEach ? 'more' : `${bonus} more`} damage?`,
    options: YES_NO_OPTIONS(bonusLabel),
    min: 1,
    max: 1,
    allowedIds: [],
  });
  const energy = costEnergyCards(draft, { playerId, attacker, cost });
  const typeLabel = cost.energyType ? `${[].concat(cost.energyType).join(' or ')} Energy` : 'Energy';
  switch (cost.kind) {
    case 'discardEnergy':
      if (cost.all) return energy.length > 0 ? yesNo(`discard all ${typeLabel} from this Pokémon`) : null;
      if (energy.length < cost.count) return null;
      return {
        prompt: clause.mandatory
          ? `${attack.name}: choose ${cost.count} ${typeLabel} to discard.`
          : `${attack.name}: choose ${cost.count} ${typeLabel} to discard for ${bonus} more damage (pick none to decline).`,
        options: energyCardOptions(energy),
        min: clause.mandatory ? cost.count : 0,
        max: cost.count,
        allowedIds: energy.map((c) => c.instanceId),
      };
    case 'returnEnergy':
      if (energy.length === 0) return null;
      if (cost.all) return yesNo(`return all ${typeLabel} to your hand`);
      return {
        prompt: `${attack.name}: choose ${typeLabel} to return to your hand for ${bonus} more damage (pick none to decline).`,
        options: energyCardOptions(energy),
        min: 0,
        max: 1,
        allowedIds: energy.map((c) => c.instanceId),
      };
    case 'discardStadium':
      return draft.stadium ? yesNo('discard the Stadium in play') : null;
    case 'showHand':
      return yesNo('show your hand to your opponent');
    case 'drawback':
      return yesNo(`do ${bonus} more damage (${cost.text.replace(/\.$/, '')})`);
    case 'selfCounters':
      return {
        prompt: `${attack.name}: how many damage counters to put on this Pokémon?`,
        options: Array.from({ length: cost.upTo + 1 }, (_, k) => ({
          instanceId: k + 1,
          name: k === 0 ? "Don't" : `${k} damage counter${k === 1 ? '' : 's'}`,
          type: 'option',
        })),
        min: 1,
        max: 1,
        allowedIds: [],
      };
    default:
      return null;
  }
}

/** The attacker's Energy a cost may use: of the printed type(s), basic only when printed. */
function costEnergyCards(draft, { playerId, attacker, cost }) {
  const types = [].concat(cost.energyType || []);
  const cards = attachedEnergyCardsFor(draft, playerId, attacker, null).filter(
    (c) => !cost.basicOnly || isBasicEnergy(c)
  );
  if (types.length === 0) return cards;
  return cards.filter((c) => types.some((type) => matchesSearch(c, `${type} Energy`)));
}

/** Moves attached cards (by id) off the attacker to their owner's discard pile or hand. */
function moveAttachedCards(draft, { playerId, ids, to, reason, events }) {
  const player = draft.players[playerId];
  let moved = 0;
  for (const id of ids) {
    for (const zoneKey of ['active', 'bench']) {
      const zone = player?.zones?.[zoneKey] || [];
      const idx = zone.findIndex((c) => c.instanceId === id && c.attachedTo != null);
      if (idx < 0) continue;
      const resolution = to === 'discard' ? resolveAttackEnergyDiscard(draft, zone[idx]) : null;
      if (resolution === 'reattach') {
        draft.attackDiscardedForDamage = [...(draft.attackDiscardedForDamage || []), id];
        moved++;
        break;
      }
      const [card] = zone.splice(idx, 1);
      card.attachedTo = null;
      let destination = 'hand';
      if (to === 'discard' && resolution !== 'hand') {
        destination = discardCardToPlayerZone(player, card);
        // Flareon Burn Booster / Magcargo Crushing Lava read what the cost discarded.
        draft.attackDiscardedForDamage = [...(draft.attackDiscardedForDamage || []), id];
      } else {
        player.zones.hand.push(card);
      }
      events.push({ type: 'cardMoved', instanceId: id, from: zoneKey, to: destination, playerId, reason });
      moved++;
      break;
    }
  }
  return moved;
}

/**
 * Pays the optional cost the player accepted. Returns `{ paid, count }`: `paid` drives the
 * "if you do" bonus, `count` any "for each … you returned / put" scaling.
 */
export function payOptionalCost(draft, { playerId, attacker, token, selection, activeRng, events }) {
  const cost = token.cost || {};
  const picked = (selection || []).map(Number).filter((id) => (token.allowedIds || []).includes(id));
  const yes = Number((selection || [])[0]) === 1;
  const declined = { paid: false, count: 0 };
  const energy = () => costEnergyCards(draft, { playerId, attacker, cost }).map((c) => c.instanceId);
  switch (cost.kind) {
    case 'discardEnergy': {
      if (cost.all) {
        if (!yes) return declined;
        const n = moveAttachedCards(draft, { playerId, ids: energy(), to: 'discard', reason: 'attack-energy-discard', events });
        return { paid: n > 0, count: n };
      }
      if (new Set(picked).size !== cost.count) return declined;
      const n = moveAttachedCards(draft, { playerId, ids: [...new Set(picked)], to: 'discard', reason: 'attack-energy-discard', events });
      return { paid: n === cost.count, count: n };
    }
    case 'returnEnergy': {
      const ids = cost.all ? (yes ? energy() : []) : picked.slice(0, 1);
      if (ids.length === 0) return declined;
      const n = moveAttachedCards(draft, { playerId, ids, to: 'hand', reason: 'attack-return-energy', events });
      return { paid: n > 0, count: n };
    }
    case 'discardStadium':
      if (!yes || !draft.stadium) return declined;
      discardCurrentStadium(draft, events, playerId);
      return { paid: true, count: 1 };
    case 'showHand': {
      if (!yes) return declined;
      const hand = draft.players[playerId]?.zones?.hand || [];
      events.push({
        type: 'cardsRevealed',
        playerId,
        cards: hand.map((c) => ({ instanceId: c.instanceId, name: c.name })),
      });
      return { paid: true, count: 0 };
    }
    case 'drawback': {
      if (!yes) return declined;
      const steps = parseAttackSteps(cost.text).after;
      // M Ampharos-EX Exavolt: the accepted offer also leaves the opponent's Active Paralyzed.
      if (cost.condition) steps.push({ type: 'atkApplyCondition', condition: cost.condition });
      if (steps.length > 0) {
        const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
        runAttackSteps(draft, { steps, attackerId: attacker?.instanceId, playerId, oppId, activeRng, events });
      }
      // Nasal Lariat / Strong-Arm Lariat: "If you do, during your next turn, this Pokémon can't
      // attack." The attack's own lock pass skips "If you do" sentences, so acceptance sets it here.
      const lock = parseNextTurnLock({ text: cost.text });
      if (lock?.selfCannotAttack && attacker) attacker.cannotAttackUntilTurn = (draft.turn?.number || 1) + 2;
      return { paid: true, count: 0 };
    }
    case 'selfCounters': {
      const k = Math.max(0, Math.min(cost.upTo, Number((selection || [])[0]) - 1 || 0));
      if (k === 0 || !attacker) return declined;
      attacker.damage = (attacker.damage || 0) + k * 10;
      events.push({ type: 'damageCountersPlaced', instanceId: attacker.instanceId, count: k, playerId });
      events.push({ type: 'damageUpdated', instanceId: attacker.instanceId, damage: attacker.damage });
      return { paid: true, count: k };
    }
    default:
      return declined;
  }
}

/** Moves the chosen cards from a player's hand to their discard pile; returns how many moved. */
export function discardHandCards(draft, { playerId, instanceIds, events }) {
  const player = draft.players[playerId];
  const hand = player?.zones?.hand || [];
  const moved = [];
  for (const id of instanceIds) {
    const index = hand.findIndex((c) => c.instanceId === id);
    if (index < 0) continue;
    const [card] = hand.splice(index, 1);
    discardCardToPlayerZone(player, card);
    moved.push({ instanceId: card.instanceId, name: card.name });
  }
  if (moved.length > 0) events.push({ type: 'cardsDiscarded', playerId, cards: moved });
  return moved.length;
}

/**
 * Rebuilds the attack context an attack-phase PendingChoice suspended, from its
 * resumeToken. Returns null when the attacker or attack is no longer in play.
 */
export function attackResumeContext(draft, token, { activeRng, events }) {
  const playerId = token.initiatorPlayerId;
  const attackerPlayer = draft.players[playerId];
  const attacker = attackerPlayer?.zones?.active?.find(
    (c) => !c.attachedTo && c.instanceId === token.attackerId
  );
  if (!attacker) return null;
  const attackerView = attackViewFor(draft, attacker);
  const attack =
    token.copiedAttack || attackerView?.attacks?.find((a) => a?.name === token.attackName);
  if (!attack) return null;
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  let defender = null;
  let defenderPlayerId = oppId;
  if (token.targetInstanceId != null) {
    const targetRef = findCard(draft, token.targetInstanceId);
    defender = targetRef?.card || null;
    if (targetRef?.playerId) defenderPlayerId = targetRef.playerId;
  }
  const { coin = null, headsCount, flips = [] } = token.coinResult || {};
  return {
    playerId,
    activeRng,
    events,
    attacker,
    defender,
    defenderPlayerId,
    oppId,
    attack,
    attackerPlayer,
    attackerView,
    coin,
    headsCount,
    flips,
    milledMatches: token.milledMatches,
    revealedMatches: token.revealedMatches,
    copiedAttack: token.copiedAttack || null,
    conditionChecked: token.conditionChecked === true,
    statusConditionsMet: token.statusConditionsMet,
  };
}

/**
 * "Put this Pokémon and all attached cards into your hand." (Meowth ex / Tuck
 * Tail). Runs after damage; the emptied Active is refilled by the command-tail
 * promotion, and a player left with no Pokémon in play loses.
 */
export function returnAttackerToHand(draft, { playerId, attacker, oppId, events }) {
  const player = draft.players[playerId];
  const active = player?.zones?.active || [];
  if (!attacker || !active.some((c) => c.instanceId === attacker.instanceId)) {
    return;
  }
  for (let i = active.length - 1; i >= 0; i--) {
    const card = active[i];
    if (card.instanceId !== attacker.instanceId && card.attachedTo !== attacker.instanceId) {
      continue;
    }
    active.splice(i, 1);
    card.attachedTo = null;
    card.damage = 0;
    clearConditions(card);
    player.zones.hand.push(card);
  }
  events.push({
    type: 'cardMoved',
    instanceId: attacker.instanceId,
    from: 'active',
    to: 'hand',
    playerId,
    reason: 'attack-return-self',
  });
  const benchRoots = (player.zones.bench || []).filter(
    (c) => !c.attachedTo && isPokemon(c)
  );
  if (benchRoots.length > 0) {
    player.promotionPending = true;
  } else {
    setGameEnded(draft, { winner: oppId, reason: 'no Pokémon in play', events });
  }
}

// Step kinds that own an attack's heal sentence; the generic self-heal stands down for them.
export const HEAL_STEP_TYPES = ['atkHealEach', 'atkHealCounted', 'atkMirrorHeal'];

/**
 * The attack's printed clauses that run as executor steps (design 030), with the attack's
 * own coin result applied: "If heads/tails" steps are dropped on the other face and
 * "For each heads" steps scale their count by the heads flipped.
 */
export function planAttackSteps(attack, attacker, { coin, headsCount, flips = [] }) {
  const parsed = parseAttackSteps(attack?.text, { selfName: attacker?.name });
  const resolve = (steps) =>
    resolveCoinGates(steps, { coin, headsCount, flips }).map((step) => ({
      ...step,
      attackName: attack?.name || 'Attack',
    }));
  return {
    before: resolve(parsed.before),
    after: resolve(parsed.after),
    handlesSearch: parsed.handlesSearch,
    // Printed step kinds before the coin gates, so a helper can stand down for a clause
    // the steps own even when the coin dropped it.
    printed: new Set([...parsed.before, ...parsed.after].map((step) => step.type)),
  };
}

/**
 * Ends the game when an attack's effect (not a Knock Out) left a side with no Pokémon in play
 * — GG End-GX / Big Throw-GX discard Pokémon outright. Prize-based wins keep their own tail
 * settlement, so this only reads the board (design 048).
 */
function settleWipedSides(draft, { events }) {
  const playerIds = Object.keys(draft.players || {});
  if (playerIds.length !== 2 || isGameConcluded(draft)) return;
  const [a, b] = playerIds;
  const wiped = (pid) =>
    ![...(draft.players[pid].zones?.active || []), ...(draft.players[pid].zones?.bench || [])].some(
      (c) => !c.attachedTo && isPokemon(c)
    );
  const aWins = wiped(b);
  const bWins = wiped(a);
  if (!aWins && !bWins) return;
  if (aWins && bWins) {
    setGameEnded(draft, {
      simultaneous: [a, b],
      ways: { [a]: ['no Pokémon in play'], [b]: ['no Pokémon in play'] },
      events,
    });
    return;
  }
  setGameEnded(draft, { winner: aWins ? a : b, reason: 'no Pokémon in play', events });
}

/**
 * A step that took the attacker out of play (shuffle into the deck) leaves its Active Spot
 * empty: promote from the Bench, or lose with no Pokémon left in play.
 */
export function settleVacatedActive(draft, { playerId, oppId, events }) {
  const player = draft.players[playerId];
  if (!player || (player.zones.active || []).some((c) => !c.attachedTo && isPokemon(c))) return;
  const benchRoots = (player.zones.bench || []).filter((c) => !c.attachedTo && isPokemon(c));
  if (benchRoots.length > 0) {
    player.promotionPending = true;
  } else if (!isGameConcluded(draft)) {
    setGameEnded(draft, { winner: oppId, reason: 'no Pokémon in play', events });
  }
}

/**
 * Runs (or resumes) attack steps through the shared executor. Knock Outs the steps caused
 * are resolved immediately so they count before the turn ends. Returns false while a
 * choice is pending — the `attackSteps` resume continues from the token.
 */
/**
 * Applies the `attackDamageRequest` events steps queue (Dragapult Dragon Launcher) as attack damage
 * through the same path as a chosen-target clause, so damage prevention, Knock Out hooks and
 * Prize entitlements all run. A step handler cannot call them itself: knockout.mjs imports it.
 */
function applyAttackDamageRequests(draft, { events, playerId, activeRng }) {
  const requests = events.filter((e) => e.type === 'attackDamageRequest');
  if (requests.length === 0) return;
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === 'attackDamageRequest') events.splice(i, 1);
  for (const request of requests) {
    if (isGameConcluded(draft)) return;
    applyAttackTargets(draft, {
      selection: [request.instanceId],
      clause: { kind: 'damage', amount: request.amount, activeWR: true, immunity: request.immunity || {} },
      defenderPlayerId: request.victimPlayerId,
      attackerPlayerId: playerId,
      attackName: request.attackName,
      activeRng,
      events,
    });
  }
}

export function runAttackSteps(
  draft,
  { steps, fromStepIndex = 0, attackerId, playerId, oppId, activeRng, events, selection = null, context, budget }
) {
  const attacker = attackerId != null ? findCard(draft, attackerId)?.card : null;
  const result = executeSteps(draft, {
    steps,
    fromStepIndex,
    effectType: 'attackSteps',
    sourceCard: attacker || (attackerId != null ? { instanceId: attackerId } : null),
    playerId,
    activeRng,
    events,
    selection,
    context,
    budget,
  });
  applyAttackDamageRequests(draft, { events, playerId, activeRng });
  resolveDamageCounterKnockouts(draft, { events });
  // A discard effect (GG End-GX / Big Throw-GX) can wipe a side without any Knock Out event;
  // prize entitlements keep their own tail settlement, so this only reads the board for an
  // emptied side (design 048).
  settleWipedSides(draft, { events });
  settleVacatedActive(draft, { playerId, oppId, events });
  if (result.pendingChoice && !isGameConcluded(draft)) {
    draft.pendingChoice = result.pendingChoice;
    return false;
  }
  return true;
}
