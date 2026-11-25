import {
  closeDisplay,
  discardAll,
  handAll,
  leaveAll,
  lostZoneAll,
  shuffleAll,
  shuffleBottom,
  sort,
} from '../../../actions/zones/general.js';
import {
  oppContainerDocument,
  selfContainerDocument,
  systemState,
} from '../../../state.js';

const confirmShuffleDiscardIntoDeck = (user) => {
  if (confirm('Are you sure you want to shuffle all cards into the deck?')) {
    shuffleAll(user, systemState.initiator, 'discard');
  }
};

// [element id, DOM event, action(user)] for the zone controls that exist once in each player's mat.
const ZONE_CONTROLS = [
  [
    'shuffleDeckButton',
    'click',
    (user) => shuffleAll(user, systemState.initiator, 'deck'),
  ],
  ['shuffleDiscardButton', 'click', confirmShuffleDiscardIntoDeck],
  [
    'discardAttachedCardsButton',
    'click',
    (user) => discardAll(user, systemState.initiator, 'attachedCards'),
  ],
  [
    'shuffleAttachedCardsButton',
    'click',
    (user) => shuffleAll(user, systemState.initiator, 'attachedCards'),
  ],
  [
    'lostZoneAttachedCardsButton',
    'click',
    (user) => lostZoneAll(user, systemState.initiator, 'attachedCards'),
  ],
  [
    'handAttachedCardsButton',
    'click',
    (user) => handAll(user, systemState.initiator, 'attachedCards'),
  ],
  [
    'leaveAttachedCardsButton',
    'click',
    (user) => leaveAll(user, systemState.initiator, 'attachedCards'),
  ],
  [
    'discardViewCardsButton',
    'click',
    (user) => discardAll(user, systemState.initiator, 'viewCards'),
  ],
  [
    'shuffleViewCardsButton',
    'click',
    (user) => shuffleAll(user, systemState.initiator, 'viewCards'),
  ],
  [
    'shuffleBottomViewCardsButton',
    'click',
    (user) => shuffleBottom(user, systemState.initiator, 'viewCards'),
  ],
  [
    'lostZoneViewCardsButton',
    'click',
    (user) => lostZoneAll(user, systemState.initiator, 'viewCards'),
  ],
  [
    'handViewCardsButton',
    'click',
    (user) => handAll(user, systemState.initiator, 'viewCards'),
  ],
  ['closeDeckButton', 'click', (user) => closeDisplay(user, 'deck')],
  ['closeDiscardButton', 'click', (user) => closeDisplay(user, 'discard')],
  ['closeLostZoneButton', 'click', (user) => closeDisplay(user, 'lostZone')],
  ['sortHandCheckbox', 'change', (user) => sort(user, 'hand')],
  ['sortDeckCheckbox', 'change', (user) => sort(user, 'deck')],
  ['sortDiscardCheckbox', 'change', (user) => sort(user, 'discard')],
  ['sortLostZoneCheckbox', 'change', (user) => sort(user, 'lostZone')],
];

export const initializeZoneButtons = () => {
  [
    ['self', selfContainerDocument],
    ['opp', oppContainerDocument],
  ].forEach(([user, containerDocument]) => {
    ZONE_CONTROLS.forEach(([id, eventName, action]) => {
      containerDocument
        .getElementById(id)
        .addEventListener(eventName, () => action(user));
    });
  });
};
