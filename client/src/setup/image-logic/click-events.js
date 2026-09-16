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
import { appendMessage } from '../chatbox/append-message.js';
import { determineUsername } from '../general/determine-username.js';
import { getZone } from '../zones/get-zone.js';
import { isBlockedByReplay } from '../../setup/general/replay-block.js';
import {
  fullViewHost,
} from '../deck-constructor/hydrate-holo.js';
import { findZoneCardIndex } from './zone-card-lookup.js';
import { readCardInstanceId } from '../netcode/authoritative-dispatch.js';
import {
  closeCardPreview,
  openCardPreview,
} from './full-view.js';
import { openDiscardPileViewer } from './discard-pile-viewer.js';
import { openCarouselViewer } from './card-picker.js';
import { rulesState, canPerformAction } from '/shared/engine/rules/rules-state.mjs';
import { benchCardHasAbility } from '/shared/engine/rules/collect-usable-abilities.mjs';
import { shouldOpenAttackPreview } from '../rules/attack-preview-gate.js';
import { openAttackPreview } from '../rules/attack-preview.js';
import { resolvePreviewCard } from './preview-card.mjs';

export const identifyCard = (event) => {
  mouseClick.cardUser = event.target.user === 'self' ? 'self' : 'opp';
  // Design 003 slice 1: capture the authoritative renderer's identity stamp alongside
  // the legacy index. Null for a legacy-rendered card, which keeps the gate fail-open.
  mouseClick.cardInstanceId = readCardInstanceId(event.target);
  //closest() handles plain cards, play-container cards, and holo-wrapper cards
  mouseClick.zoneId = event.target.closest(
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
      event.target
    );
  }
};

export const coverClick = (event) => {
  if (event.target.id === 'discardCover') {
    event.stopPropagation();
    const user = event.target.user === 'self' ? 'self' : 'opp';
    const zone = getZone(user, 'discard');
    if (zone.getCount() === 0) return;
    openDiscardPileViewer(user, zone.getCount() - 1);
    return;
  }

  const notSpectator = !(
    document.getElementById('spectatorModeCheckbox').checked &&
    systemState.isTwoPlayer
  );

  // Pregame / rules-off: no privacy to protect yet, so show the deck with
  // the same carousel viewer used for the discard pile instead of the raw
  // stacked-image zone (that legacy display is still used mid-game below).
  if (event.target.id === 'deckCover') {
    const preGameOrRulesOff = !rulesState.enabled || rulesState.phase === 'setup';
    if (preGameOrRulesOff) {
      event.stopPropagation();
      const user = event.target.user === 'self' ? 'self' : 'opp';
      const zone = getZone(user, 'deck');
      if (zone.getCount() === 0) return;
      openCarouselViewer({
        title: determineUsername(user) + "'s Deck",
        candidates: zone.array,
      });
      if (notSpectator) {
        appendMessage(
          systemState.initiator,
          determineUsername(systemState.initiator) +
            ' is looking through ' +
            determineUsername(event.target.user) +
            "'s deck",
          'player'
        );
      }
      return;
    }
  }

  const selectedZone = getZone(event.target.user, event.target.id);
  if (selectedZone.elementCover) {
    selectedZone.element.style.display = 'block';
  }

  if (event.target.id === 'deckCover' && notSpectator) {
    appendMessage(
      systemState.initiator,
      determineUsername(systemState.initiator) +
        ' is looking through ' +
        determineUsername(event.target.user) +
        "'s deck",
      'player'
    );
  }
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

  const selfView =
    (selfContainerDocument.body.contains(event.target) &&
      selfContainer.classList.contains('self')) ||
    (!selfContainerDocument.body.contains(event.target) &&
      !selfContainer.classList.contains('self'));
  const oppView =
    (!selfContainerDocument.body.contains(event.target) &&
      selfContainer.classList.contains('self')) ||
    (selfContainerDocument.body.contains(event.target) &&
      !selfContainer.classList.contains('self'));

  const buttonConditions = {
    abilityCounterButton: [
      [true, 'active'],
      [true, 'bench'],
      [true, 'stadium'],
      [true, 'discard'],
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
  cardContextMenu.style.display =
    atLeastOneButtonVisible &&
    !(
      document.getElementById('spectatorModeCheckbox').checked &&
      systemState.isTwoPlayer
    )
      ? 'block'
      : 'none';

  // get the position of the context menu
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
    } else if (event.target.parentElement.id === 'hand') {
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

export const imageClick = (event) => {
  event.stopPropagation();
  identifyCard(event);

  if (mouseClick.zoneId === 'discard') {
    openDiscardPileViewer(mouseClick.cardUser, mouseClick.cardIndex);
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
    // Design 008 (D1/D6): a plain click on your own active or an
    // ability-bearing benched Pokémon opens the TCG Live-style attack/ability
    // preview instead of the usual select-to-move highlight. Gated here,
    // after the selectHighlight branch above, so attaching Energy or
    // promoting from bench (R1) is untouched.
    if (rulesState.enabled) {
      const decision = shouldOpenAttackPreview({
        zoneId: mouseClick.zoneId,
        cardUser: mouseClick.cardUser,
        hasSelectHighlight: false,
        hasAbility:
          mouseClick.zoneId === 'bench' ? benchCardHasAbility(mouseClick.card) : false,
        gate: canPerformAction({ user: mouseClick.cardUser, action: 'attack' }),
      });
      if (decision === 'attack' && mouseClick.card?.image) {
        openAttackPreview(mouseClick.card, mouseClick.card.image, { zone: 'active' });
        return;
      }
      if (decision === 'ability' && mouseClick.card?.image) {
        openAttackPreview(mouseClick.card, mouseClick.card.image, { zone: 'bench' });
        return;
      }
    }

    closePopups(event); //need both because of highlights condition in the if block above
    // Select-to-move resolves the card through the legacy zone arrays, which a
    // server-authoritative game never populates — nothing to select there.
    if (!mouseClick.card?.image) return;
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
  const targetImage = card.image;
  targetImage.classList.remove('highlight');
  if (['active', 'bench', 'hand'].includes(mouseClick.zoneId)) {
    closeCardPreview(null, true);
    const host = fullViewHost(targetImage);
    if (!host?.classList.contains('full-view')) {
      // Card carries energies/tools: same zoom, but the attached cards ride
      // along as further carousel slides (PTCG Live-style, like the discard
      // pile viewer) — scroll/swipe right to see them, left to return to
      // the main card. Read-only: dragging one out means closing first.
      if (card.attachedCards?.length) {
        // Attached Energy is rendered on the mat as a small round token
        // (attach-card.js swaps image.src to the icon and stashes the full
        // card art in dataset.energyCardSrc) — show the real card art in the
        // carousel slide, then revert automatically since we never touch the
        // board's own <img>, just a read-only stand-in object here.
        // Carousel slide N sits to the right of slide N+1 (higher index =
        // further left, see computeSlideLayout's `virtualIndex - slideIndex`),
        // so the attached cards go BEFORE the main card in the array to land
        // on its right, with initialIndex pointing at the main card's slot.
        const attachedSlides = card.attachedCards.map((attached) => {
          const fullArtSrc = attached.image?.dataset?.energyCardSrc;
          return fullArtSrc
            ? { ...attached, image: { src: fullArtSrc } }
            : attached;
        });
        const carouselCards = [...attachedSlides, card];
        openCarouselViewer({
          title: card.name || 'Attached Cards',
          candidates: carouselCards,
          initialIndex: attachedSlides.length,
        });
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
