import { systemState } from '../../state.js';
import { resetImage } from '../../setup/image-logic/reset-image.js';
import {
  originRectForHandFlight,
  playDrawToHand,
} from '../../setup/image-logic/draw-flight.js';
import { shouldAnimateMirror } from '../../setup/image-logic/draw-flight-predicate.mjs';
import { getZone } from '../../setup/zones/get-zone.js';
import { closePopups, deselectCard } from '../general/close-popups.js';
import { updateCount } from '../general/count.js';
import { hideCard, revealCard } from '../general/reveal-and-hide.js';
import { sort } from '../zones/general.js';
import { attachCard } from './attach-card.js';
import {
  cardNode,
  hydrateHolo,
  imageAnchor,
  unhydrateHolo,
} from '../../setup/deck-constructor/hydrate-holo.js';
import { legacyDomSuppressed } from '../../setup/netcode/server-rendered-zones.mjs';
import { autoMoveActiveBenchCard } from './auto-move-active-bench-card.js';
import { decreaseCardLayer } from './decrease-card-layer.js';
import { evolveCard } from './evolve-card.js';
import { initializeActiveBenchCard } from './initialize-active-bench-card.js';
import { relocateAttachedCards } from './relocate-attached-cards.js';
import { updateAttachedCardsPosition } from './update-attached-cards-position.js';
import { updateCounters } from './update-counters.js';
import { updateDestinationCover, updateOriginCover } from './update-cover.js';
import {
  discardStadiumCardFromField,
  updateStadiumCard,
} from './update-stadium-card.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import {
  rulesState,
  markSupporterPlayed,
  supporterPlayGate,
  markStadiumPlayed,
  ensureCardData,
  getStadium,
  canPerformAction,
  openPlayedToBenchWindow,
  clearPlayedToBenchWindow,
} from '/shared/engine/rules/rules-state.mjs';
import {
  canEvolve,
  canPlayPokemonFromHand,
  markEvolvedThisTurn,
  requiresTurnEndOnEvolve,
} from '/shared/engine/rules/evolution.mjs';
import {
  clearUntilLeavesActive,
  clearActiveSpotPendingEffects,
} from '/shared/engine/rules/attack-pending-effects.mjs';
import {
  clearStatuses,
  getStatus,
  applyStatus,
} from '/shared/engine/rules/status.mjs';
import { isEnergy, isPokemon } from '/shared/engine/cards.mjs';
import { isPokemonToolCard } from '/shared/engine/rules/ability-executors.mjs';
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
} from '/shared/engine/rules/stadium-effects.mjs';
import { canAddToBench } from '/shared/engine/rules/ko-flow.mjs';
import {
  countBenchPokemon,
  isBoardPokemon,
} from '/shared/engine/zones/active-pokemon.mjs';
import { pokemonHasLockedEnergy } from '/shared/engine/rules/energy-effects.mjs';
import { blocksItemPlay } from '/shared/engine/rules/ability-executors.mjs';
import { planSpecialEnergyTriggers } from '/shared/engine/rules/special-energy-parse.mjs';
import { draw } from '../zones/deck-actions.js';
import { addDamageCounter } from '../counters/damage-counter.js';
import {
  clearHandStackPositioning,
  reconcileHandStacks,
} from '../../setup/zones/hand-stack-dom.js';

const pokemonInPlay = (user) =>
  [...getZone(user, 'active').array, ...getZone(user, 'bench').array].filter(
    isBoardPokemon
  );

const benchLimitFor = (user, extraPokemon = null) => {
  let inPlay = pokemonInPlay(user);
  if (
    extraPokemon &&
    extraPokemon.type === 'Pokémon' &&
    !inPlay.includes(extraPokemon)
  ) {
    inPlay = [...inPlay, extraPokemon];
  }
  return getEffectiveBenchLimit(playerHasTeraInPlay(inPlay));
};

const enforceBenchLimit = async (user) => {
  if (!rulesState.enabled) return;
  const bench = getZone(user, 'bench');
  const limit = benchLimitFor(user);
  const { moveCardBundle } = await import('./move-card-bundle.js');
  while (countBenchPokemon(bench) > limit) {
    let idx = -1;
    for (let i = bench.array.length - 1; i >= 0; i--) {
      if (isBoardPokemon(bench.array[i])) {
        idx = i;
        break;
      }
    }
    if (idx < 0) break;
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
  const {
    forceEvolution = false,
    syncReplay = false,
    isRareCandy = false,
    bypassJustEvolvedGate = false,
  } = options;
  oZoneId = oZoneId.replace('Cover', '');
  dZoneId = dZoneId.replace('Cover', '');

  deselectCard(); //remove highlight from all images before moving cards

  // convert the string into the actual arrays/html elements
  const oZone = getZone(user, oZoneId);
  let destZoneId = dZoneId;
  let dZone = getZone(user, destZoneId);

  // define the card that's being targeted
  let targetCard;
  let targetIdx = targetIndex;
  if (typeof targetIdx === 'object' && targetIdx !== null) {
    targetCard = targetIdx;
    targetIdx = dZone.array.indexOf(targetCard);
  } else if (typeof targetIdx === 'string' && isNaN(Number(targetIdx))) {
    targetIdx = dZone.array.findIndex(
      (c) => c.cardId === targetIdx || String(c.syncInstance) === targetIdx
    );
    if (targetIdx >= 0) targetCard = dZone.array[targetIdx];
  } else if (typeof targetIdx === 'number' && targetIdx >= 0) {
    targetCard = dZone.array[targetIdx];
  }

  // define the card that's being moved
  let moveIdx = index;
  let movingCard;
  if (typeof moveIdx === 'object' && moveIdx !== null) {
    movingCard = moveIdx;
    moveIdx = oZone.array.indexOf(movingCard);
  } else if (typeof moveIdx === 'string' && isNaN(Number(moveIdx))) {
    moveIdx = oZone.array.findIndex(
      (c) => c.cardId === moveIdx || String(c.syncInstance) === moveIdx
    );
    if (moveIdx >= 0) movingCard = oZone.array[moveIdx];
  } else if (typeof moveIdx === 'number' && moveIdx >= 0) {
    movingCard = oZone.array[moveIdx];
  }
  index = moveIdx;
  targetIndex = targetIdx;

  if (!movingCard) return { destZoneId, ok: false };

  // ── structural: only Pokémon occupy Active/Bench slots ──
  // Items, Supporters and Stadiums are played, never placed on or attached to a
  // Pokémon; Tools and Energy attach to a host Pokémon and never occupy a slot
  // of their own. Anything that is neither Pokémon, Energy, nor Tool dropped on
  // Active/Bench is refused here (the server rejects it too — this is the UI
  // guard so the drag never emits an illegal command).
  const activeOrBenchDest = dZoneId === 'active' || dZoneId === 'bench';
  if (activeOrBenchDest) {
    await ensureCardData(movingCard);
    const isPokemonCard = isPokemon(movingCard);
    const isEnergyCard = isEnergy(movingCard);
    const isToolCard = isPokemonToolCard(movingCard);
    if (!targetCard && !isPokemonCard) {
      const reason = isEnergyCard
        ? 'Energy cards must be attached to a Pokémon, not placed on an empty slot.'
        : isToolCard
          ? 'Pokémon Tools must be attached to a Pokémon.'
          : "Item and Supporter cards can't be placed on the Bench.";
      appendMessage(user, `⛔ ${movingCard.name}: ${reason}`, 'announcement', false);
      return { destZoneId, ok: false };
    }
    if (targetCard && !isPokemonCard && !isEnergyCard && !isToolCard) {
      appendMessage(
        user,
        `⛔ ${movingCard.name}: Item and Supporter cards can't be attached to a Pokémon.`,
        'announcement',
        false
      );
      return { destZoneId, ok: false };
    }
  }

  // Stadium Trainers belong on the dedicated left-side field, not the play board.
  if (oZoneId === 'hand' && dZoneId === 'board') {
    await ensureCardData(movingCard);
    if (isStadiumCard(movingCard)) {
      dZoneId = 'stadium';
      destZoneId = 'stadium';
      dZone = getZone(user, 'stadium');
    }
  }

  // Non-Stadium cards dropped onto stadium: redirect hand plays to board, or block
  if (dZoneId === 'stadium') {
    await ensureCardData(movingCard);
    if (!isStadiumCard(movingCard)) {
      if (oZoneId === 'hand') {
        dZoneId = 'board';
        destZoneId = 'board';
        dZone = getZone(user, 'board');
      } else {
        appendMessage(
          user,
          `⛔ ${movingCard.name || 'Card'} is not a Stadium card.`,
          'announcement',
          false
        );
        return { destZoneId, ok: false };
      }
    }
  }

  // ── rules: Item play blocked by opponent Active (effect-prevent family) ─
  if (
    rulesState.enabled &&
    !syncReplay &&
    oZoneId === 'hand' &&
    dZoneId === 'board'
  ) {
    await ensureCardData(movingCard);
    const subtypes = (movingCard.subtypes || []).map((s) =>
      String(s).toLowerCase()
    );
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
    const subtypes = (movingCard.subtypes || []).map((s) =>
      String(s).toLowerCase()
    );
    const isSupporter =
      String(movingCard.type || '').toLowerCase() === 'supporter' ||
      subtypes.includes('supporter');
    if (isSupporter) {
      const supporterGate = canPerformAction({ user, action: 'playSupporter' });
      if (!supporterGate.allowed) {
        appendMessage(
          user,
          `⛔ ${supporterGate.reason}`,
          'announcement',
          false
        );
        return;
      }
    }
    const gate = supporterPlayGate({
      cardType: movingCard.type,
      subtypes: movingCard.subtypes || [],
      supporterPlayed: rulesState.flags[user]?.supporterPlayed,
    });
    if (!gate.allowed) {
      appendMessage(
        user,
        `⛔ ${movingCard.name}: ${gate.reason}`,
        'announcement',
        false
      );
      return { destZoneId, ok: false };
    }
    if (isSupporter) markSupporterPlayed(user, movingCard.name);
  }

  // ── rules: record a Stadium placed on the field (taxonomy E) ─────────
  // hand → stadium is the play path (board drops are redirected above).
  // discardStadiumCardFromField() clears the displaced card before the
  // splice; updateStadiumCard() (below) is a safety net + orients the slot.
  if (rulesState.enabled && oZoneId === 'hand' && dZoneId === 'stadium') {
    await ensureCardData(movingCard);
    if (isStadiumCard(movingCard)) {
      const displaced = markStadiumPlayed(user, movingCard);
      if (!syncReplay) {
        if (displaced?.card) {
          appendMessage(
            user,
            `${movingCard.name} is placed on the field; ${displaced.card.name} goes to discard.`,
            'announcement',
            false
          );
          await discardStadiumCardFromField(
            displaced.user,
            displaced.card,
            initiator
          );
          if (parseStadiumBenchLimit(displaced.card)) {
            await enforceBenchLimit(user);
            await enforceBenchLimit(user === 'self' ? 'opp' : 'self');
          }
        }
        appendMessage(
          user,
          describeStadiumEffect(movingCard),
          'announcement',
          false
        );
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
    const gate = canAddToBench(countBenchPokemon(bench), limit);
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
    const wasPlayedThisTurn =
      targetCard.enteredPlayTurn === rulesState.turnNumber;
    const evoCheck = await canEvolve(
      user,
      targetCard,
      movingCard,
      wasPlayedThisTurn,
      {
        isRareCandy,
        bypassJustEvolvedGate,
      }
    );
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

  // ── rules: special-energy on-discard triggers ───────────────────────────
  // Energy effects that replace the discard: Recycle Energy ("put it into your
  // hand instead"), Nitro Fire Energy (return on an attack discard), Boomerang /
  // Burning Energy (reattach to the host after attacking). Plans come from the
  // shared parser; skip on mirror replay because the originator rewrites
  // destZoneId and relays the actual destination so both clients land the
  // energy in the same zone.
  if (
    rulesState.enabled &&
    !syncReplay &&
    movingCard.type === 'Energy' &&
    destZoneId === 'discard' &&
    ['active', 'bench'].includes(oZoneId) &&
    movingCard.image?.relative
  ) {
    const hostPokemon = oZone.array.find(
      (c) => c.type === 'Pokémon' && c.image === movingCard.image.relative
    );
    const discardPlans = planSpecialEnergyTriggers(movingCard, {
      trigger: 'discard',
      host: hostPokemon,
      zoneArray: oZone.array,
      attackExecuting: !!rulesState.attackExecuting,
    });
    if (discardPlans.some((p) => p.action === 'returnToHand')) {
      destZoneId = 'hand';
      dZone = getZone(user, destZoneId);
      appendMessage(
        user,
        `♻️ ${movingCard.name} returns to your hand.`,
        'announcement',
        false
      );
    } else if (discardPlans.some((p) => p.action === 'reattach') && hostPokemon) {
      // "attach this card from your discard pile to that Pokémon after
      // attacking" — net effect is the energy stays attached to its host.
      destZoneId = oZoneId;
      dZone = oZone;
      appendMessage(
        user,
        `🔥 ${movingCard.name} stays attached to ${hostPokemon.name || 'its Pokémon'} (its attack discard returns it).`,
        'announcement',
        false
      );
    }
  }

  // The awaits above yield, and a caller that did not await this move (a
  // search effect shuffling the deck right after) can reorder the origin zone
  // meanwhile — so the index read on entry may name a different card by now.
  index = oZone.array.indexOf(movingCard);
  if (index < 0) return { destZoneId, ok: false };

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
    movingCard.image.faceDown &&
    ['active', 'bench', 'board', 'stadium'].includes(dZoneId);
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
      // Must read attachedCards (Spirit Link check) BEFORE evolveCard() moves
      // them from targetCard onto movingCard.
      const forcesTurnEnd = requiresTurnEndOnEvolve(movingCard, targetCard);
      evolveCard(user, initiator, movingCard, targetCard, dZoneId, dZone);
      movingCard.enteredPlayTurn = rulesState.turnNumber;
      if (!syncReplay) {
        markEvolvedThisTurn(user, targetCard);
        markEvolvedThisTurn(user, movingCard);
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
        appendMessage(
          user,
          `${movingCard.name} evolved onto ${targetCard.name}!`,
          'announcement',
          false
        );
        document.dispatchEvent(
          new CustomEvent('rules-opponent-evolved', {
            detail: { user, evolvedCard: movingCard, zoneId: dZoneId },
          })
        );
        if (rulesState.enabled && forcesTurnEnd) {
          appendMessage(
            '',
            `⚡ ${movingCard.name} evolved without a matching Spirit Link attached — turn ends immediately.`,
            'announcement',
            false
          );
          document.dispatchEvent(
            new CustomEvent('rules-mega-evolution-forces-turn-end', {
              detail: { user },
            })
          );
        }
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
          })
        );
      }
    }
    // if image is not being attached to another card, proceed with normal card move
  } else {
    resetImage(movingCard.image, dZoneId);

    //special initialization is needed for cards in the active and bench since pokemon has its own container with its attached cards
    if (activeOrBenchZone.includes(dZoneId)) {
      // A card out of a duplicate hand stack still carries that stack's inline
      // positioning, which outranks `.play-container img` / `.play-container .mat-holo`
      // and would leave it not drawing where its slot is (see hand-stack-dom.js).
      clearHandStackPositioning(cardNode(movingCard));
      clearHandStackPositioning(movingCard.image);
      initializeActiveBenchCard(user, movingCard, dZoneId, dZone);
      if (
        movingCard.type === 'Pokémon' &&
        !activeOrBenchZone.includes(oZoneId)
      ) {
        // Moving active<->bench (swap, promotion after knockout) isn't a
        // fresh play — the Pokémon was already in play, so it stays
        // evolve-eligible instead of re-triggering the just-played gate.
        movingCard.enteredPlayTurn = rulesState.turnNumber;
        // "When you play this Pokémon from your hand to your Bench" triggers
        // (e.g. Meowth's Last Ditch Catch) only open a window on a genuine
        // hand → Bench play, never on hand → Active.
        if (rulesState.enabled && oZoneId === 'hand' && dZoneId === 'bench') {
          openPlayedToBenchWindow(user, movingCard);
        }
      }
      // give the card its holofoil wrapper now that initializeActiveBenchCard
      // has settled the <img> into its .play-container (clientWidth/Height are
      // valid). No-op for common/non-holo cards.
      hydrateHolo(movingCard);
    } else if (legacyDomSuppressed(dZoneId, systemState)) {
      // The authoritative renderer draws this zone (I48): keep the legacy card
      // out of the DOM, or the zone shows every card twice. Its zone-array
      // bookkeeping above still ran, which is all the rules gates read.
      imageAnchor(movingCard.image).remove();
    } else {
      const handFlight =
        dZoneId === 'hand' && (oZoneId === 'deck' || oZoneId === 'prizes');
      const flightOrigin = handFlight
        ? originRectForHandFlight(user, oZoneId, movingCard)
        : null;
      if (dZoneId === 'stadium') unhydrateHolo(movingCard);
      dZone.element.appendChild(movingCard.image);
      if (['hand', 'prizes', 'discard', 'lostZone', 'board'].includes(dZoneId))
        hydrateHolo(movingCard);
      if (
        handFlight &&
        // The mirror of the opponent's live draw sets syncReplay too
        // (isMirrorReplay above), so gate on catch-up flags instead.
        shouldAnimateMirror({
          syncReplaying: !!systemState.syncReplaying,
          isCatchingUp: !!systemState.isCatchingUp,
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
    !['active', 'board', 'bench', 'stadium', 'attachedCards'].includes(
      dZoneId
    ) &&
    movingCard.type2
  ) {
    movingCard.type = movingCard.type2;
  }

  // A Pokémon returning to hand re-arms any "when you play onto your Bench"
  // trigger window — the next play from hand is a fresh play. Also clear the
  // per-image one-shot flags rules-bridge sets on the original play so they
  // fire again too.
  if (dZoneId === 'hand' && movingCard.type === 'Pokémon') {
    if (rulesState.enabled) clearPlayedToBenchWindow(user, movingCard);
    if (movingCard.image) {
      movingCard.image.__rulesWhenPlayedFired = false;
      movingCard.image.__rulesPokemonInPlay = false;
    }
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

  if (
    !syncReplay &&
    rulesState.enabled &&
    parseStadiumBenchLimit(getStadium()?.card)
  ) {
    await enforceBenchLimit(user);
    await enforceBenchLimit(user === 'self' ? 'opp' : 'self');
  }

  if (oZoneId === 'hand' || dZoneId === 'hand') {
    reconcileHandStacks(user);
  }

  return { destZoneId, ok: true };
};
