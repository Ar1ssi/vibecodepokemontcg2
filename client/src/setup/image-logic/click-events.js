import {
  closeFullView,
  closePopups,
  deselectCard,
} from '../../actions/general/close-popups.js';
import { moveCardBundle } from '../../actions/move-card-bundle/move-card-bundle.js';
import {
  mouseClick,
  oppContainer,
  oppContainerDocument,
  selfContainer,
  selfContainerDocument,
  systemState,
} from '../../state.js';
import { determineUsername } from '../general/determine-username.js';
import { getZone } from '../zones/get-zone.js';
import { isBlockedByReplay } from '../../setup/general/replay-block.js';
import { fullViewHost } from '../deck-constructor/hydrate-holo.js';
import { findZoneCardIndex } from './zone-card-lookup.js';
import { readCardInstanceId } from '../netcode/authoritative-dispatch.js';
import { closeCardPreview, openCardPreview } from './full-view.js';
import { openDiscardPileViewer } from './discard-pile-viewer.js';
import { openCarouselViewer } from './card-picker.js';
import { attachedSlidesOf, openAttachedCardsCarousel } from './attached-carousel.js';
import { rulesState, stadiumUsed } from '/shared/engine/rules/rules-state.mjs';
import { isHandActivatedAbility } from '/shared/engine/rules/ability-executors.mjs';
import {
  openCardInspector,
  closeCardInspector,
  stadiumContextFor,
} from '../rules/card-inspector.mjs';
import {
  openCardFocus,
  closeCardFocus,
  isCardFocusOpen,
} from '../rules/card-focus.mjs';
import { shouldOpenCardFocus } from '../rules/card-focus-routing.mjs';
import {
  attack,
  retreat,
  stadiumEffect,
} from '../../actions/chat-buttons/chat-buttons.js';
import { uiCue } from '../netcode/mat-fx/ui-cue.mjs';
import { resolvePreviewCard } from './preview-card.mjs';
import { isDoubleClickZoomZone } from './double-click-zoom.mjs';
import { visualRectOf } from './iframe-rect.mjs';
import { board3dActive, getBoardScene } from '../board3d/board3d.js';
import { selectServerCard, takeServerAttach } from '../netcode/server-card-select.js';

// An iframe document's cards sit under its <body>; a board-mirror shadow root (design 074 D4)
// holds them directly.
const containerContains = (containerDocument, node) =>
  Boolean((containerDocument.body ?? containerDocument).contains(node));

/**
 * Fills `mouseClick` with the card a node stands for: its owner, server instance id, zone and
 * legacy index. Shared by every DOM card event (`identifyCard`) and the 3D board's drag, which
 * names the card's board-mirror <img> without an event (design 074 D5).
 */
export const identifyCardElement = (target) => {
  mouseClick.cardUser = target.user === 'self' ? 'self' : 'opp';
  // Design 003 slice 1: capture the authoritative renderer's identity stamp alongside
  // the legacy index. Null for a legacy-rendered card, which keeps the gate fail-open.
  mouseClick.cardInstanceId = readCardInstanceId(target);
  //closest() handles plain cards, play-container cards, and holo-wrapper cards
  mouseClick.zoneId = target.closest(
    '#deck, #hand, #active, #bench, #prizes, #discard, #lostZone, #attachedCards, #viewCards, #stadium, #board, #deckCover, #discardCover, #lostZoneCover'
  )?.id;
  if (mouseClick.zoneId === 'deckCover') {
    mouseClick.cardIndex = 0;
  } else if (['lostZoneCover', 'discardCover'].includes(mouseClick.zoneId)) {
    mouseClick.cardIndex =
      getZone(mouseClick.cardUser, mouseClick.zoneId).getCount() - 1;
  } else {
    mouseClick.cardIndex = findZoneCardIndex(
      getZone(mouseClick.cardUser, mouseClick.zoneId),
      target
    );
  }
};

export const identifyCard = (event) => identifyCardElement(event.target);

export const coverClick = (event) => {
  if (event.target.id === 'discardCover') {
    event.stopPropagation();
    const user = event.target.user === 'self' ? 'self' : 'opp';
    // I57: no legacy count gate — under server authority that array is empty. The viewer
    // reads the live pile itself and returns when there is nothing to show.
    openDiscardPileViewer(user);
    return;
  }

  // Deck cover click no longer opens the deck viewer — players can no
  // longer inspect their deck contents by clicking it. Right-click actions
  // (view top/bottom, shuffle, draw) still work via the card context menu.
  if (event.target.id === 'deckCover') {
    return;
  }

  const selectedZone = getZone(event.target.user, event.target.id);
  if (selectedZone.elementCover) {
    selectedZone.element.style.display = 'block';
  }
};

/**
 * Where the card menu anchors on the 3D board: a mirror card's rect is already on-screen px
 * (board-mirror.js sync, no iframe offset); the Stadium's twin is the page's `#stadium img`,
 * hidden while the scene draws the slot, so it anchors on the scene's Stadium footprint.
 */
const board3dMenuAnchorRect = (target) => {
  const stadium = target?.closest?.('#stadium') ? getBoardScene()?.rects?.().stadium : null;
  return stadium ?? visualRectOf(target);
};

export const openCardContextMenu = (event) => {
  const cardContextMenu = document.getElementById('cardContextMenu');

  closeFullView(event);
  closeCardPreview(event);
  deselectCard();
  cardContextMenu.style.cssText = '';

  event.preventDefault();
  event.stopPropagation();

  identifyCard(event);

  const inSelfContainer = containerContains(selfContainerDocument, event.target);
  const selfView =
    (inSelfContainer && selfContainer.classList.contains('self')) ||
    (!inSelfContainer && !selfContainer.classList.contains('self'));
  const oppView =
    (!inSelfContainer && selfContainer.classList.contains('self')) ||
    (inSelfContainer && !selfContainer.classList.contains('self'));

  const buttonConditions = {
    abilityCounterButton: [
      [true, 'active'],
      [true, 'bench'],
      [true, 'stadium'],
      [true, 'discard'],
      // Luxray Swelling Flash / Charjabug Battery are activated from the hand (I155).
      [isHandActivatedAbility(mouseClick.card), 'hand'],
    ],
    damageCounterButton: [
      [true, 'active'],
      [true, 'bench'],
    ],
    specialConditionButton: [[true, 'active']],
    shufflePrizesButton: [[selfView, 'prizes']],
    lookPrizesButton: [[true, 'prizes']],
    revealHidePrizesButton: [[true, 'prizes']],
    shufflePrizesToDeckBottomButton: [[selfView, 'prizes']],
    lookHandButton: [[oppView, 'hand']],
    randomHandButton: [[oppView, 'hand']],
    shuffleDeckButton: [[true, 'deckCover']],
    drawButton: [[selfView, 'deckCover']],
    viewTopButton: [[true, 'deckCover']],
    viewBottomButton: [[true, 'deckCover']],
    discardHandButton: [[selfView, 'hand']],
    shuffleHandButton: [[selfView, 'hand']],
    shuffleHandBottomButton: [[selfView, 'hand']],
    prizesHeader: [[true, 'prizes']],
    handHeader: [[true, 'hand']],
    deckHeader: [[true, 'deckCover']],
    boardHeader: [[true, 'board']],
    discardBoardButton: [[true, 'board']],
    handBoardButton: [[true, 'board']],
    shuffleBoardButton: [[true, 'board']],
    lostZoneBoardButton: [[true, 'board']],
    changeButton: [
      [true, 'active'],
      [true, 'bench'],
    ],
    viewAttachedCardsButton: [
      [true, 'active'],
      [true, 'bench'],
    ],
    attachedCardsButton: [
      [true, 'active'],
      [true, 'bench'],
    ],
  };

  for (const [buttonId, conditionsArray] of Object.entries(buttonConditions)) {
    const button = document.getElementById(buttonId);

    // Check each condition array
    const shouldDisplay = conditionsArray.some((conditions) => {
      const [userCondition, containerCondition] = conditions;
      return (
        userCondition &&
        !isBlockedByReplay('contextMenu', buttonId) &&
        containerCondition === mouseClick.zoneId
      );
    });
    button.style.display = shouldDisplay ? 'block' : 'none';
  }
  document.getElementById('moveButton').style.display = !isBlockedByReplay(
    'contextMenu',
    'moveButton'
  )
    ? 'block'
    : 'none';

  const atLeastOneButtonVisible = Array.from(cardContextMenu.children).some(
    (button) => button.style.display !== 'none'
  );

  // Set the display property based on the visibility of buttons
  const menuShown =
    atLeastOneButtonVisible &&
    !(
      document.getElementById('spectatorModeCheckbox').checked &&
      systemState.isTwoPlayer
    );
  cardContextMenu.style.display = menuShown ? 'block' : 'none';
  if (menuShown) uiCue('card-to-board');

  // get the position of the context menu
  if (board3dActive()) {
    const rect = board3dMenuAnchorRect(event.target);
    const fitsRight =
      rect.left + rect.width + cardContextMenu.offsetWidth <= window.innerWidth;
    const left = fitsRight
      ? rect.left + rect.width
      : rect.left - cardContextMenu.offsetWidth;
    const top = Math.min(rect.top, window.innerHeight - cardContextMenu.offsetHeight);
    cardContextMenu.style.left = `${Math.max(0, left)}px`;
    cardContextMenu.style.top = `${Math.max(0, top)}px`;
    return;
  }
  const targetRect = event.target.getBoundingClientRect();
  const offsetHeight =
    window.innerHeight -
    (event.target.user === 'self'
      ? selfContainer.offsetHeight
      : oppContainer.offsetHeight);
  if (document.body.contains(event.target)) {
    cardContextMenu.style.left = `${targetRect.left + event.target.clientWidth}px`;
    cardContextMenu.style.top = `${targetRect.top}px`;
  } else if (selfView) {
    if (
      event.target.parentElement.id === 'deckCover' ||
      event.target.parentElement.id === 'discardCover'
    ) {
      cardContextMenu.style.left = `${targetRect.left - cardContextMenu.clientWidth}px`;
      cardContextMenu.style.top = `${targetRect.top + offsetHeight}px`;
    } else if (event.target.closest('#hand')) {
      cardContextMenu.style.left = `${targetRect.left}px`;
      cardContextMenu.style.top = `${targetRect.top + offsetHeight - cardContextMenu.offsetHeight}px`;
    } else if (event.target.parentElement.id === 'prizes') {
      cardContextMenu.style.left = `${targetRect.left}px`;
      cardContextMenu.style.top = `${targetRect.top + offsetHeight - cardContextMenu.offsetHeight}px`;
    } else {
      cardContextMenu.style.left = `${targetRect.left + event.target.clientWidth}px`;
      cardContextMenu.style.top = `${targetRect.top + offsetHeight}px`;
    }
  } else if (oppView) {
    const adjustment = document.body.offsetWidth - oppContainer.offsetWidth;
    if (
      event.target.parentElement.id === 'deckCover' ||
      event.target.parentElement.id === 'discardCover'
    ) {
      cardContextMenu.style.right = `${targetRect.left + adjustment - cardContextMenu.clientWidth}px`;
      cardContextMenu.style.bottom = `${targetRect.top + offsetHeight - cardContextMenu.offsetHeight + event.target.offsetHeight}px`;
    } else if (
      event.target.parentElement.id === 'prizes' ||
      event.target.parentElement.id === 'lostZoneCover'
    ) {
      cardContextMenu.style.right = `${targetRect.left + adjustment + event.target.clientWidth}px`;
      cardContextMenu.style.bottom = `${targetRect.top + offsetHeight - cardContextMenu.offsetHeight + event.target.offsetHeight}px`;
    } else {
      cardContextMenu.style.right = `${targetRect.left + adjustment - cardContextMenu.clientWidth + event.target.clientWidth}px`;
      cardContextMenu.style.bottom = `${targetRect.top + offsetHeight - cardContextMenu.offsetHeight}px`;
    }
  }
};


// Design 067: your own Active opens the TCG Live focus view. The attached cards the old inspector
// carried as carousel slides sit behind the HUD's Stack button. An attack or retreat closes the
// focus at once, because it fires at the slot the card would otherwise be flying back to.
const openOwnActiveFocus = (card) => {
  const attachedSlides = attachedSlidesOf(card);
  return openCardFocus({
    card,
    zone: 'active',
    attachedCount: attachedSlides.length,
    onAttack: (index) => {
      closeCardFocus({ immediate: true });
      attack(rulesState.turnPlayer, true, index);
    },
    onRetreat: () => {
      closeCardFocus({ immediate: true });
      retreat(systemState.initiator);
    },
    onOpenStack: () => openAttachedCardsCarousel(card),
  });
};

export const imageClick = (event) => {
  event.stopPropagation();
  // Attach mode on a server-drawn card (keybinds `e`/`q`): this click names the target.
  const serverAttach = takeServerAttach(event.target);
  identifyCard(event);
  if (serverAttach) {
    closePopups(event);
    const { from, targetId } = serverAttach;
    moveCardBundle(
      from.user,
      systemState.initiator,
      from.zoneId,
      mouseClick.zoneId,
      from.index,
      mouseClick.cardIndex,
      'move',
      true,
      null,
      { moving: from.instanceId, target: targetId }
    );
    return;
  }

  if (mouseClick.zoneId === 'discard') {
    // I57: `cardIndex` is a legacy zone index and is meaningless for a server-drawn card,
    // so the clicked card is identified by the renderer's instanceId stamp when it has one.
    openDiscardPileViewer(
      mouseClick.cardUser,
      mouseClick.cardIndex,
      mouseClick.cardInstanceId
    );
    return;
  }

  if (event.target.classList.contains('selectHighlight')) {
    closePopups(event);
    const dZoneId = event.target.parentElement.parentElement.id;
    const targetIndex = findZoneCardIndex(
      getZone(event.target.user, dZoneId),
      event.target
    );
    moveCardBundle(
      mouseClick.cardUser,
      systemState.initiator,
      mouseClick.zoneId,
      dZoneId,
      mouseClick.cardIndex,
      targetIndex,
      'move'
    );
  } else {
    // D50 (design 013): single-click is select-to-move again. Design 008 had it open the attack
    // preview, which collided with `dblclick` on these same nodes — a double-click fired two
    // clicks first, popping, re-popping and then tearing down the overlay before the carousel
    // replaced it. Selection of your own active is also what 008 made unreachable (its R3).
    closePopups(event); //need both because of highlights condition in the if block above
    // D50/D53 superseded for your own Active (design 067): a single click opens the focus view.
    // Select-to-move for the Active is drag or the right-click menu.
    const focusCard = resolvePreviewCard(mouseClick.card, event.target);
    if (
      shouldOpenCardFocus({
        zoneId: mouseClick.zoneId,
        cardUser: mouseClick.cardUser,
        card: focusCard,
      }) &&
      (isCardFocusOpen() || openOwnActiveFocus(focusCard))
    ) {
      return;
    }
    // Select-to-move resolves a legacy card through its zone array; a server-drawn card
    // (never in those arrays) is selected through the authoritative registry.
    if (!mouseClick.card?.image) {
      selectServerCard();
      return;
    }
    mouseClick.card.image.classList.add('highlight');
    mouseClick.selectingCard = true;
  }
};

export const doubleClick = (event) => {
  if (event) {
    event.stopPropagation();
    identifyCard(event);
  }
  const card = resolvePreviewCard(mouseClick.card, event?.target);
  if (!card?.image) return;
  if (mouseClick.zoneId === 'prizes') {
    // Real fix (was a `return` bandaid): route through the same carousel
    // viewer as the discard pile / deck instead of the legacy raw #fullImage
    // overlay below, which stacks a fresh overlay + listeners on every
    // double-click and is never wired into closePopups() — see investigation.
    const zone = getZone(mouseClick.cardUser, 'prizes');
    if (zone.getCount() === 0) return;
    const initialIndex = Math.max(0, zone.array.indexOf(card));
    openCarouselViewer({
      title: determineUsername(mouseClick.cardUser) + "'s Prizes",
      candidates: zone.array,
      initialIndex,
    });
    return;
  }
  // The second click of a double-click on your own Active: open (or keep) the same focus view.
  if (
    shouldOpenCardFocus({
      zoneId: mouseClick.zoneId,
      cardUser: mouseClick.cardUser,
      card,
    }) &&
    (isCardFocusOpen() || openOwnActiveFocus(card))
  ) {
    return;
  }
  const targetImage = card.image;
  targetImage.classList.remove('highlight');
  // Zones routed to the dismissible zoom path. The raw #fullImage branch below
  // is a trap: it appends the overlay to the top document with no z-index, so
  // the z-index-2 playmat iframes bury the enlarged card and swallow its own
  // click-to-close, and closePopups() never removes it — it sticks over the
  // board. `board` (free-play mat area: played Trainers, manually moved cards)
  // was missing from this list and hit exactly that. Prizes was pulled out to a
  // viewer above for the same reason.
  if (isDoubleClickZoomZone(mouseClick.zoneId, { board3d: board3dActive() })) {
    closeCardPreview(null, true);
    const host = fullViewHost(targetImage);
    if (!host?.classList.contains('full-view')) {
      // Attached Energy is rendered on the mat as a small round token (attach-card.js swaps
      // image.src to the icon and stashes the full card art in dataset.energyCardSrc) — show
      // the real card art in the carousel slide, then revert automatically since we never touch
      // the board's own <img>, just a read-only stand-in object here.
      // Carousel slide N sits to the right of slide N+1 (higher index = further left, see
      // computeSlideLayout's `virtualIndex - slideIndex`), so the attached cards go BEFORE the
      // main card in the array to land on its right, with initialIndex on the main card's slot.
      const attachedSlides = attachedSlidesOf(card);

      // Design 018: the shared in-play Stadium opens the same module — the effect text as a
      // content-sized panel, clicked to run the Stadium effect. It has no cardUser (`#stadium`
      // is neutral), so route on the zone alone; the actor is the local player, exactly the user
      // the sidebox Stadium button passes. `getContext` reads live flags so the panel's Use
      // affordance tracks turn/once-per-turn state.
      if (mouseClick.zoneId === 'stadium') {
        const user = systemState.initiator;
        openCardInspector({
          card,
          attachedSlides,
          zone: 'stadium',
          getContext: () =>
            stadiumContextFor({
              rulesEnabled: Boolean(rulesState.enabled),
              yourTurn: rulesState.turnPlayer === user,
              usedThisTurn: stadiumUsed(user),
              flags: rulesState.flags?.[user] || {},
            }),
          onUse: () => {
            closeCardInspector();
            stadiumEffect(user);
          },
        });
        return;
      }

      // D50 (design 013): your own board Pokémon open the inspector — the enlarged scan with the
      // TCG Live readout over it, attached cards as further slides, a payable attack fired by
      // clicking its panel, and the ability fired by clicking its own. Opponent's Pokémon and
      // hand cards keep the plain scan: payability and actions are not theirs to show. (The
      // shared Stadium is handled above, design 018.)
      if (
        ['active', 'bench'].includes(mouseClick.zoneId) &&
        mouseClick.cardUser === 'self'
      ) {
        openCardInspector({
          card,
          attachedSlides,
          zone: mouseClick.zoneId,
          onAttack: (index) => {
            closeCardInspector();
            attack(rulesState.turnPlayer, true, index);
          },
          onRetreat: () => {
            closeCardInspector();
            retreat(systemState.initiator);
          },
        });
        return;
      }

      // Card carries energies/tools: same zoom, but the attached cards ride along as further
      // carousel slides (PTCG Live-style, like the discard pile viewer) — scroll/swipe right to
      // see them, left to return to the main card. Read-only: dragging one out means closing first.
      if (attachedSlides.length) {
        openAttachedCardsCarousel(card);
      } else {
        openCardPreview(targetImage, card);
      }
    }
  } else {
    let overlay = document.createElement('div');
    overlay.id = 'fullImage';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent

    // Create a new image element
    let display = document.createElement('img');
    display.src = targetImage.src;
    display.alt = targetImage.alt;
    display.style.position = 'absolute';
    display.style.top = '50%';
    display.style.left = '50%';
    display.style.transform = 'translate(-50%, -50%)'; // Center the image
    display.style.maxWidth = '90%'; // Keep the image within the viewport
    display.style.maxHeight = '90%';
    display.style.borderRadius = '1rem';

    // Append the image to the overlay
    overlay.appendChild(display);

    // Append the overlay to the body
    document.body.appendChild(overlay);

    const removeOverlay = () => {
      if (overlay) {
        document.body.removeChild(overlay);
        overlay = null; // Set overlay to null to indicate it's no longer present
      }
    };
    overlay.addEventListener('click', () => removeOverlay());
    // Listen for the escape key press
    const documentArray = [
      selfContainerDocument,
      oppContainerDocument,
      document,
    ];
    documentArray.forEach((document) =>
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' || event.key === 'v') {
          removeOverlay();
        }
      })
    );
  }
};
