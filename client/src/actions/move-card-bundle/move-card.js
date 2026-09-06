import { systemState } from '../../state.js';
import { resetImage } from '../../setup/image-logic/reset-image.js';
import {
  originRectForHandFlight,
  playDrawToHand,
} from '../../setup/image-logic/draw-flight.js';
import { shouldAnimateDrawFlight } from '../../setup/general/sync-replay.mjs';
import { getZone } from '../../setup/zones/get-zone.js';
import { closePopups, deselectCard } from '../general/close-popups.js';
import { updateCount } from '../general/count.js';
import { hideCard, revealCard } from '../general/reveal-and-hide.js';
import { sort } from '../zones/general.js';
import { attachCard } from './attach-card.js';
import { hydrateHolo } from '../../setup/deck-constructor/hydrate-holo.js';
import { autoMoveActiveBenchCard } from './auto-move-active-bench-card.js';
import { decreaseCardLayer } from './decrease-card-layer.js';
import { evolveCard } from './evolve-card.js';
import { initializeActiveBenchCard } from './initialize-active-bench-card.js';
import { relocateAttachedCards } from './relocate-attached-cards.js';
import { updateAttachedCardsPosition } from './update-attached-cards-position.js';
import { updateCounters } from './update-counters.js';
import { updateDestinationCover, updateOriginCover } from './update-cover.js';
import { discardStadiumCardFromField, updateStadiumCard } from './update-stadium-card.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { rulesState, markSupporterPlayed, supporterPlayGate, markStadiumPlayed, ensureCardData, getStadium, canPerformAction } from '../../setup/rules/rules-state.mjs';
import { canEvolve, canPlayPokemonFromHand, markEvolvedThisTurn } from '../../setup/rules/evolution.mjs';
import { clearUntilLeavesActive, clearActiveSpotPendingEffects } from '../../setup/rules/attack-pending-effects.mjs';
import { clearStatuses, getStatus, applyStatus } from '../../setup/rules/status.mjs';
import {
  describeStadiumEffect,
  isStadiumCard,
  classifyStadiumEffect,
  parseStadiumSetupDraw,
  stadiumBenchDamageApplies,
  isStadiumConfusedPersist,
  getEffectiveBenchLimit,
  playerHasTeraInPlay,
  isTeraCard,
  parseStadiumBenchLimit,
  stadiumBlocksStatusApplication,
} from '../../setup/rules/stadium-effects.mjs';
import { canAddToBench } from '../../setup/rules/ko-flow.mjs';
import { pokemonHasLockedEnergy } from '../../setup/rules/energy-effects.mjs';
import { blocksItemPlay } from '../../setup/rules/ability-executors.mjs';
import { shouldNitroReturnToHand } from '../../setup/rules/special-energy-effects.mjs';
import { draw } from '../zones/deck-actions.js';
import { addDamageCounter } from '../counters/damage-counter.js';

const pokemonInPlay = (user) =>
  [...getZone(user, 'active').array, ...getZone(user, 'bench').array].filter(
    (c) => c.type === 'Pokémon'
  );

const benchLimitFor = (user, extraPokemon = null) => {
  let inPlay = pokemonInPlay(user);
  if (extraPokemon && extraPokemon.type === 'Pokémon' && !inPlay.includes(extraPokemon)) {
    inPlay = [...inPlay, extraPokemon];
  }
  return getEffectiveBenchLimit(playerHasTeraInPlay(inPlay));
};

const enforceBenchLimit = async (user) => {
  if (!rulesState.enabled) return;
  const bench = getZone(user, 'bench');
  const limit = benchLimitFor(user);
  const { moveCardBundle } = await import('./move-card-bundle.js');
  while (bench.getCount() > limit) {
    const idx = bench.getCount() - 1;
    const name = bench.array[idx]?.name || 'a Pokémon';
    await moveCardBundle(user, user, 'bench', 'discard', idx, false, 'move');
    appendMessage(
      user,
      `🏟️ Bench trimmed to ${limit} — ${name} discarded.`,
      'announcement',
      false
    );
  }
};

export const moveCard = async (
  user,
  initiator,
  oZoneId,
  dZoneId,
  index,
  targetIndex,
  options = {}
) => {
  const { forceEvolution = false, syncReplay = false } = options;
  oZoneId = oZoneId.replace('Cover', '');
  dZoneId = dZoneId.replace('Cover', '');

  deselectCard(); //remove highlight from all images before moving cards

  // convert the string into the actual arrays/html elements
  const oZone = getZone(user, oZoneId);
  let destZoneId = dZoneId;
  let dZone = getZone(user, destZoneId);

  // define the card that's being targeted, i.e., the pokemon that is being attached to, if a target index is defined
  let targetCard;
  if (typeof targetIndex === 'number') {
    targetCard = dZone.array[targetIndex];
  }
  // define the card that's being moved
  const movingCard = oZone.array[index];

  if (!movingCard) return { destZoneId, ok: false };

  // Stadium Trainers belong on the dedicated left-side field, not the play board.
  if (oZoneId === 'hand' && dZoneId === 'board') {
    await ensureCardData(movingCard);
    if (isStadiumCard(movingCard)) {
      dZoneId = 'stadium';
      destZoneId = 'stadium';
      dZone = getZone(user, 'stadium');
    }
  }

  // ── rules: Item play blocked by opponent Active (effect-prevent family) ─
  if (rulesState.enabled && !syncReplay && oZoneId === 'hand' && dZoneId === 'board') {
    await ensureCardData(movingCard);
    const subtypes = (movingCard.subtypes || []).map((s) => String(s).toLowerCase());
    const isItem =
      String(movingCard.type || '').toLowerCase() === 'item' ||
      subtypes.includes('item');
    if (isItem) {
      const itemGate = canPerformAction({ user, action: 'playItem' });
      if (!itemGate.allowed) {
        appendMessage(user, `⛔ ${itemGate.reason}`, 'announcement', false);
        return;
      }
      const oppPlayer = user === 'self' ? 'opp' : 'self';
      const oppActive = getZone(oppPlayer, 'active').array[0];
      if (oppActive) {
        await ensureCardData(oppActive);
        if (blocksItemPlay(oppActive)) {
          appendMessage(
            user,
            `🚫 ${oppActive.name}: Items can't be played while this Pokémon is Active!`,
            'announcement',
            false
          );
          return { destZoneId, ok: false };
        }
      }
    }
  }

  // ── rules: one Supporter per turn (taxonomy A2) ──────────────────
  // Playing a Trainer = hand → board. Supporters are limited to one per
  // turn; Items/Stadiums/Tools/Special Supporters bypass the limit. The
  // gate runs before the zone splice so blocked moves never mutate state.
  if (
    rulesState.enabled &&
    !syncReplay &&
    rulesState.turnPlayer === user &&
    oZoneId === 'hand' &&
    dZoneId === 'board'
  ) {
    const subtypes = (movingCard.subtypes || []).map((s) => String(s).toLowerCase());
    const isSupporter =
      String(movingCard.type || '').toLowerCase() === 'supporter' ||
      subtypes.includes('supporter');
    if (isSupporter) {
      const supporterGate = canPerformAction({ user, action: 'playSupporter' });
      if (!supporterGate.allowed) {
        appendMessage(user, `⛔ ${supporterGate.reason}`, 'announcement', false);
        return;
      }
    }
    const gate = supporterPlayGate({
      cardType: movingCard.type,
      subtypes: movingCard.subtypes || [],
      supporterPlayed: rulesState.flags[user]?.supporterPlayed,
    });
    if (!gate.allowed) {
      appendMessage(user, `⛔ ${movingCard.name}: ${gate.reason}`, 'announcement', false);
      return { destZoneId, ok: false };
    }
    markSupporterPlayed(user, movingCard.name);
  }

  // ── rules: record a Stadium placed on the field (taxonomy E) ─────────
  // hand → stadium is the play path (board drops are redirected above).
  // discardStadiumCardFromField() clears the displaced card before the
  // splice; updateStadiumCard() (below) is a safety net + orients the slot.
  if (rulesState.enabled && !syncReplay && oZoneId === 'hand' && dZoneId === 'stadium') {
    await ensureCardData(movingCard);
    if (isStadiumCard(movingCard)) {
      const displaced = markStadiumPlayed(user, movingCard);
      if (displaced?.card) {
        appendMessage(
          user,
          `${movingCard.name} is placed on the field; ${displaced.card.name} goes to discard.`,
          'announcement',
          false
        );
        await discardStadiumCardFromField(displaced.user, displaced.card, initiator);
        if (parseStadiumBenchLimit(displaced.card)) {
          await enforceBenchLimit(user);
          await enforceBenchLimit(user === 'self' ? 'opp' : 'self');
        }
      }
      appendMessage(user, describeStadiumEffect(movingCard), 'announcement', false);
      const drawN = parseStadiumSetupDraw(movingCard);
      if (drawN && classifyStadiumEffect(movingCard) === 'setup-once') {
        draw(user, user, drawN, true);
        appendMessage(
          user,
          `◈ ${movingCard.name}: Drew ${drawN} card(s) (when-you-play effect).`,
          'announcement',
          false
        );
      }
    }
  }

  // ── rules: bench limit (Area Zero Underdepths + default 5) ───────────
  if (
    rulesState.enabled &&
    !syncReplay &&
    movingCard.type === 'Pokémon' &&
    dZoneId === 'bench' &&
    oZoneId !== 'bench' &&
    !targetCard
  ) {
    const bench = getZone(user, 'bench');
    const limit = benchLimitFor(user, movingCard);
    const gate = canAddToBench(bench.getCount(), limit);
    if (!gate.allowed) {
      appendMessage(user, `⛔ ${gate.reason}`, 'announcement', false);
      return { destZoneId, ok: false };
    }
  }

  // ── rules: only Basic Pokémon may be played from hand ──────────────
  // Stage 1/2 must evolve onto a Pokémon already in play (gate below).
  // Must run BEFORE the splice so blocked moves never mutate zone arrays.
  const activeOrBenchZones = ['active', 'bench'];
  if (
    rulesState.enabled &&
    !syncReplay &&
    !forceEvolution &&
    movingCard.type === 'Pokémon' &&
    oZoneId === 'hand' &&
    activeOrBenchZones.includes(dZoneId) &&
    !targetCard
  ) {
    const playCheck = await canPlayPokemonFromHand(movingCard);
    if (!playCheck.allowed) {
      appendMessage(user, `⛔ ${playCheck.reason}`, 'announcement', false);
      return { destZoneId, ok: false };
    }
  }

  // ── rules: evolution legality gate (taxonomy B) ──────────────────────
  // Must run BEFORE the splice so blocked moves never mutate zone arrays.
  if (
    rulesState.enabled &&
    !syncReplay &&
    !forceEvolution &&
    movingCard.type === 'Pokémon' &&
    !activeOrBenchZones.includes(oZoneId) &&
    activeOrBenchZones.includes(dZoneId) &&
    targetCard
  ) {
    const evolveGate = canPerformAction({ user, action: 'evolve' });
    if (!evolveGate.allowed) {
      appendMessage(user, `⛔ ${evolveGate.reason}`, 'announcement', false);
      return;
    }
    const evoCheck = await canEvolve(user, targetCard, movingCard, false);
    if (!evoCheck.allowed) {
      appendMessage(user, `⛔ ${evoCheck.reason}`, 'announcement', false);
      return { destZoneId, ok: false };
    }
  }

  // ── rules: attach Energy from hand (once per turn + pending attack locks) ─
  if (
    rulesState.enabled &&
    !syncReplay &&
    movingCard.type === 'Energy' &&
    oZoneId === 'hand' &&
    (dZoneId === 'active' || dZoneId === 'bench')
  ) {
    const attachGate = canPerformAction({ user, action: 'attachEnergy' });
    if (!attachGate.allowed) {
      appendMessage(user, `⛔ ${attachGate.reason}`, 'announcement', false);
      return;
    }
  }

  // ── rules: Lock Energy (taxonomy §F, family 2) ──────────────────────
  // Energy attached to a Pokémon that also has a Lock Energy attached
  // cannot be removed by card effects. Only moves *into removal zones*
  // (discard/lostZone/hand/deck) are blocked — zone-to-zone reattachment
  // (active↔bench, →attachedCards via relocateAttachedCards) is allowed.
  // `movingCard.image.relative` is the Pokémon's image element; the shim
  // lets the pure helper compare against each energy's image.relative.
  if (
    rulesState.enabled &&
    !syncReplay &&
    movingCard.type === 'Energy' &&
    ['active', 'bench', 'attachedCards'].includes(oZoneId) &&
    ['discard', 'lostZone', 'hand', 'deck'].includes(dZoneId) &&
    movingCard.image?.relative &&
    pokemonHasLockedEnergy({ image: movingCard.image.relative }, oZone.array)
  ) {
    appendMessage(
      user,
      `⛔ ${movingCard.name}: cannot be removed — a Lock Energy is attached to ${movingCard.image.relative.name || 'this Pokémon'}.`,
      'announcement',
      false
    );
    return { destZoneId, ok: false };
  }

  // ── rules: Nitro Fire Energy — return to hand when discarded by own attack ─
  // Skip on mirror replay: the originator rewrites destZoneId and relays the
  // actual destination so both clients land the energy in the same zone.
  if (
    rulesState.enabled &&
    !syncReplay &&
    rulesState.attackExecuting &&
    movingCard.type === 'Energy' &&
    destZoneId === 'discard' &&
    ['active', 'bench'].includes(oZoneId) &&
    movingCard.image?.relative
  ) {
    const hostPokemon = oZone.array.find(
      (c) => c.type === 'Pokémon' && c.image === movingCard.image.relative,
    );
    if (shouldNitroReturnToHand(movingCard, hostPokemon, true)) {
      destZoneId = 'hand';
      dZone = getZone(user, destZoneId);
      appendMessage(
        user,
        `🔥 ${movingCard.name} returns to your hand (Nitro Fire Energy).`,
        'announcement',
        false,
      );
    }
  }

  // move card from origin array to destination array
  dZone.array.push(...oZone.array.splice(index, 1));

  if (
    rulesState.enabled &&
    !syncReplay &&
    oZoneId === 'active' &&
    dZoneId !== 'active' &&
    movingCard.type === 'Pokémon'
  ) {
    clearActiveSpotPendingEffects(rulesState, user);
  }

  // update the cover of deck/discard/lostzone, if necessary
  updateOriginCover(user, oZoneId, index);

  // update the zIndex and positioning of any attached cards if they have shifted, i.e., shifting energies to the left if the movingcard an energy attached to a pokemon
  updateAttachedCardsPosition(oZone, movingCard);

  // if the image was attached to another image, decrease the level of layering on the base image, i.e., the count of how many attached cards there are
  //this is relevant for determining the location/adjustment for the future attached images
  if (movingCard.image.target === 'on') {
    decreaseCardLayer(movingCard);
  }

  //redraw trick. for some reason, sometimes images disappear, so we will use this trick to make sure they properly load in the DOM
  // const nonRedrawElements = ['active', 'bench', 'attachedCards'];
  // if (!nonRedrawElements.includes(dZoneId)){
  //     hideCard(user, movingCard);
  //     revealCard(user, movingCard);
  // };

  // determine whether to hide/reveal card
  const isP1HideZone =
    ['prizes'].includes(dZoneId) ||
    (document.getElementById('hideHandCheckbox').checked &&
      ['hand'].includes(dZoneId) &&
      systemState.initiator !== user);
  const isP2HideZone =
    ['hand'].includes(dZoneId) &&
    systemState.isTwoPlayer &&
    systemState.initiator !== user;
  const isFaceDownCard =
    movingCard.image.faceDown && ['active', 'bench', 'board', 'stadium'].includes(dZoneId);
  const mirrorPlayVisible =
    syncReplay && ['active', 'bench', 'board', 'stadium'].includes(dZoneId);

  if (mirrorPlayVisible) {
    revealCard(user, movingCard);
    movingCard.image.faceDown = false;
  } else if (isP1HideZone || isP2HideZone || isFaceDownCard) {
    hideCard(user, movingCard);
    if (isP1HideZone || isP2HideZone) {
      movingCard.image.faceDown = false;
    }
  } else {
    revealCard(user, movingCard);
    movingCard.image.faceDown = false;
  }
  if (dZoneId !== oZoneId) {
    movingCard.image.public = false; //if the revealed card moves to another location, it no longer has the public status,
    //i.e., whether the card is faceup/facedown and how it's recorded in the battle log is dependent on dZone
  }

  // first, check if image is being attached to another card
  const activeOrBenchZone = ['active', 'bench'];
  const isTargetCardValid =
    targetCard &&
    activeOrBenchZone.includes(dZoneId) &&
    !targetCard.image.attached;
  const isAttachAllowed =
    !activeOrBenchZone.includes(oZoneId) || movingCard.image.attached;

  if (isTargetCardValid && isAttachAllowed) {
    if (movingCard.type === 'Pokémon' && !activeOrBenchZone.includes(oZoneId)) {
      evolveCard(user, initiator, movingCard, targetCard, dZoneId, dZone);
      if (!syncReplay) {
        markEvolvedThisTurn(user, targetCard.name);
        const evoKey = targetCard.image?.dataset?.cardId || targetCard.name;
        const wasConfused = getStatus(user, evoKey)?.confused;
        clearStatuses(user, evoKey);
        if (
          wasConfused &&
          getStadium()?.card &&
          isStadiumConfusedPersist(getStadium().card)
        ) {
          applyStatus(user, evoKey, 'confused');
        }
        appendMessage(user, `${movingCard.name} evolved onto ${targetCard.name}!`, 'announcement', false);
        document.dispatchEvent(
          new CustomEvent('rules-opponent-evolved', {
            detail: { user, evolvedCard: movingCard, zoneId: dZoneId },
          })
        );
      }
    } else {
      attachCard(user, initiator, movingCard, targetCard, dZoneId, dZone);
      if (rulesState.enabled && !syncReplay && movingCard.type === 'Energy') {
        document.dispatchEvent(
          new CustomEvent('rules-energy-attached', {
            detail: {
              user,
              energy: movingCard,
              pokemon: targetCard,
              fromZone: oZoneId,
              toZone: dZoneId,
            },
          }),
        );
      }
    }
    // if image is not being attached to another card, proceed with normal card move
  } else {
    resetImage(movingCard.image, dZoneId);

    //special initialization is needed for cards in the active and bench since pokemon has its own container with its attached cards
    if (activeOrBenchZone.includes(dZoneId)) {
      initializeActiveBenchCard(user, movingCard, dZoneId, dZone);
      // give the card its holofoil wrapper now that initializeActiveBenchCard
      // has settled the <img> into its .play-container (clientWidth/Height are
      // valid). No-op for common/non-holo cards.
      hydrateHolo(movingCard);
    } else {
      const handFlight =
        dZoneId === 'hand' && (oZoneId === 'deck' || oZoneId === 'prizes');
      const flightOrigin = handFlight
        ? originRectForHandFlight(user, oZoneId, movingCard)
        : null;
      dZone.element.appendChild(movingCard.image);
      if (['hand', 'prizes', 'discard', 'lostZone'].includes(dZoneId)) hydrateHolo(movingCard);
      if (
        handFlight &&
        shouldAnimateDrawFlight({
          syncReplay,
          syncReplaying: !!systemState.syncReplaying,
        })
      ) {
        playDrawToHand(user, movingCard, { fromRect: flightOrigin });
      }
    }
    //update the cover of the deck/lostzone/discard if applicable
    updateDestinationCover(user, movingCard, dZoneId);
    //automatically move cards from the active to the bench and vice versa, if applicable
    autoMoveActiveBenchCard(
      user,
      initiator,
      movingCard,
      targetCard,
      oZoneId,
      oZone,
      dZoneId,
      dZone,
      targetIndex,
      { syncReplay }
    );
    //automatically bump any existing stadiums and make sure it's facing right-side-up for the user
    updateStadiumCard(user, initiator, dZoneId, dZone);
  }

  const zonesWithAttachedCards = ['active', 'bench', 'attachedCards'];
  // deal with any attached cards
  if (zonesWithAttachedCards.includes(oZoneId) && !movingCard.image.attached) {
    relocateAttachedCards(
      user,
      initiator,
      movingCard,
      oZoneId,
      oZone,
      dZoneId,
      dZone
    );
  }
  //update the ability, special condtion, and damage counters on all applicable cards
  updateCounters(user, movingCard, oZoneId, oZone, dZoneId, dZone);

  // Risky Ruins-style: damage when playing a Basic onto the Bench from hand.
  if (
    rulesState.enabled &&
    !syncReplay &&
    movingCard.type === 'Pokémon' &&
    oZoneId === 'hand' &&
    dZoneId === 'bench' &&
    !targetCard
  ) {
    await ensureCardData(movingCard);
    const stadium = getStadium()?.card;
    if (stadium) {
      const benchDmg = stadiumBenchDamageApplies(movingCard, stadium);
      if (benchDmg) {
        const benchIdx = dZone.array.indexOf(movingCard);
        if (benchIdx >= 0) {
          addDamageCounter(user, 'bench', benchIdx, benchDmg * 10, true);
          appendMessage(
            user,
            `🏟️ ${stadium.name}: ${movingCard.name} takes ${benchDmg} damage counter(s) from entering the Bench.`,
            'announcement',
            false
          );
        }
      }
    }
  }

  //reset type classification of the card if the card is no longer in play
  if (
    !['active', 'board', 'bench', 'stadium', 'attachedCards'].includes(dZoneId) &&
    movingCard.type2
  ) {
    movingCard.type = movingCard.type2;
  }
  //update counter texts
  updateCount();

  //hide any empty arrays, such as attachedCards or viewCards if there's no more cards left
  closePopups();

  //sort the array, if applicable
  if (['deck', 'lostZone', 'discard', 'hand'].includes(dZoneId)) {
    sort(user, dZoneId);
  }

  // ── rules: notify the rules-bridge a card just landed on the board ───
  // moveCard() is the single choke point every zone transition passes
  // through (drag/drop, bundle actions, multiplayer sync all funnel
  // here), so this is the one place that can announce "board" arrivals
  // instantly. rules-bridge.js listens for this to react the same turn
  // it fires, instead of waiting on its polling fallback to notice.
  if (!syncReplay) {
    if (dZoneId === 'board') {
      document.dispatchEvent(
        new CustomEvent('rules-card-on-board', {
          detail: { user, card: movingCard, localPlay: true },
        })
      );
    }
    if (
      (dZoneId === 'active' || dZoneId === 'bench') &&
      movingCard.type === 'Pokémon' &&
      !movingCard.image.attached
    ) {
      document.dispatchEvent(
        new CustomEvent('rules-pokemon-in-play', {
          detail: {
            user,
            card: movingCard,
            zoneId: dZoneId,
            fromZone: oZoneId,
            localPlay: true,
          },
        })
      );
    }
  }

  // Festival Grounds: attaching Energy clears Special Conditions.
  if (
    rulesState.enabled &&
    !syncReplay &&
    movingCard.type === 'Energy' &&
    ['active', 'bench'].includes(dZoneId) &&
    targetCard?.type === 'Pokémon'
  ) {
    const hostZone = getZone(user, dZoneId);
    if (stadiumBlocksStatusApplication(targetCard, hostZone.array)) {
      const key = targetCard.image?.dataset?.cardId || targetCard.name;
      clearStatuses(user, key);
      appendMessage(
        user,
        `🏟️ ${getStadium()?.card?.name || 'Stadium'} — ${targetCard.name} recovered from Special Conditions.`,
        'announcement',
        false
      );
    }
  }

  if (!syncReplay && rulesState.enabled && parseStadiumBenchLimit(getStadium()?.card)) {
    await enforceBenchLimit(user);
    await enforceBenchLimit(user === 'self' ? 'opp' : 'self');
  }

  return { destZoneId, ok: true };
};
