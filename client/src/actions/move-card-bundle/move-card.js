import { systemState } from '../../state.js';
import { resetImage } from '../../setup/image-logic/reset-image.js';
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
import { updateStadiumCard } from './update-stadium-card.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { rulesState, markSupporterPlayed, supporterPlayGate, markStadiumPlayed, ensureCardData, getStadium } from '../../setup/rules/rules-state.mjs';
import { canEvolve, canPlayPokemonFromHand, markEvolvedThisTurn } from '../../setup/rules/evolution.mjs';
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
  while (bench.getCount() > limit) {
    const idx = bench.getCount() - 1;
    const name = bench.array[idx]?.name || 'a Pokémon';
    await moveCard(user, user, 'bench', 'discard', idx);
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

  if (!movingCard) return;

  // ── rules: Item play blocked by opponent Active (effect-prevent family) ─
  if (rulesState.enabled && !syncReplay && oZoneId === 'hand' && dZoneId === 'board') {
    await ensureCardData(movingCard);
    const subtypes = (movingCard.subtypes || []).map((s) => String(s).toLowerCase());
    const isItem =
      String(movingCard.type || '').toLowerCase() === 'item' ||
      subtypes.includes('item');
    if (isItem) {
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
          return;
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
    const gate = supporterPlayGate({
      cardType: movingCard.type,
      subtypes: movingCard.subtypes || [],
      supporterPlayed: rulesState.flags[user]?.supporterPlayed,
    });
    if (!gate.allowed) {
      appendMessage(user, `⛔ ${movingCard.name}: ${gate.reason}`, 'announcement', false);
      return;
    }
    markSupporterPlayed(user, movingCard.name);
  }

  // ── rules: record a Stadium placed on the field (taxonomy E) ─────────
  // hand → board is the play path; updateStadiumCard() (below) handles the
  // UI-side discard of any existing Stadium. Recording state here — before
  // the splice and before updateStadiumCard's recursive moveCard call —
  // avoids that recursion clobbering the record with the discarded card.
  //
  // movingCard.type is always the coarse 'Trainer' bucket assigned at deck
  // import (Stadiums/Supporters/Items/Tools are indistinguishable there),
  // and movingCard.subtypes is only ever populated by ensureCardData()'s
  // async TCGdex fetch — nothing awaited it before this check used to run,
  // so subtypes was always still undefined and no Stadium was ever
  // recorded. Awaiting it here (moveCard is already async) enriches the
  // card first, then the shared isStadiumCard() detector (also used by
  // stadium-effects.mjs, so the two no longer disagree) can see it.
  if (rulesState.enabled && !syncReplay && oZoneId === 'hand' && dZoneId === 'board') {
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
        if (parseStadiumBenchLimit(displaced.card)) {
          await enforceBenchLimit(user);
          await enforceBenchLimit(user === 'self' ? 'opp' : 'self');
        }
      }
      appendMessage(user, describeStadiumEffect(movingCard), 'announcement', false);
      const drawN = parseStadiumSetupDraw(movingCard);
      if (drawN && classifyStadiumEffect(movingCard) === 'setup-once') {
        draw(user, drawN, true);
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
      return;
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
      return;
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
    const evoCheck = await canEvolve(user, targetCard, movingCard, false);
    if (!evoCheck.allowed) {
      appendMessage(user, `⛔ ${evoCheck.reason}`, 'announcement', false);
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
    return;
  }

  // ── rules: Nitro Fire Energy — return to hand when discarded by own attack ─
  if (
    rulesState.enabled &&
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
    movingCard.image.faceDown && ['active', 'bench', 'board'].includes(dZoneId);
  const mirrorPlayVisible =
    syncReplay && ['active', 'bench', 'board'].includes(dZoneId);

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
      dZone.element.appendChild(movingCard.image);
      if (['hand', 'prizes', 'discard', 'lostZone'].includes(dZoneId)) hydrateHolo(movingCard);
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
      targetIndex
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
    !['active', 'board', 'bench', 'attachedCards'].includes(dZoneId) &&
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
        new CustomEvent('rules-card-on-board', { detail: { user, card: movingCard } })
      );
    }
    if (
      (dZoneId === 'active' || dZoneId === 'bench') &&
      movingCard.type === 'Pokémon' &&
      !movingCard.image.attached
    ) {
      document.dispatchEvent(
        new CustomEvent('rules-pokemon-in-play', {
          detail: { user, card: movingCard, zoneId: dZoneId, fromZone: oZoneId },
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
};
