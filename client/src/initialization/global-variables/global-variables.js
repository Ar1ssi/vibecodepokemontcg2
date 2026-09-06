/* eslint-disable no-undef */
import { resolveDefaultCardBackSrc } from '../../setup/deck-constructor/default-card-back.mjs';
import { preloadImage } from '../../setup/general/preload-image.js';
import { getZone } from '../../setup/zones/get-zone.js';
export {
  selfContainer,
  oppContainer,
  selfContainerDocument,
  oppContainerDocument,
} from './containers.js';

const defaultCardBackSrc = resolveDefaultCardBackSrc();

export const version = '1.5.1';

// exports a WebSocket connection using the Socket.IO library, loaded via CDN in index.ejs
const socketUrl = window.location.hostname === 'ptcgsim.online'
  ? 'https://ptcgsim.online'
  : window.location.origin || 'https://ptcgsim.online';
export const socket = io(socketUrl);
// export const socket = io('http://localhost:4000/');

// create globally accessible variable systemState, which holds information relevant to the state of the user's game
export const systemState = {
  coachingMode: false,
  isUndoInProgress: false,
  selfCounter: 0,
  selfActionData: [],
  oppActionData: [],
  spectatorCounter: 0,
  exportActionData: [],
  spectatorId: '',
  oppCounter: 0,
  isTwoPlayer: false,
  isReplay: false, // should be treated as false no matter what if isTwoPlayer is true
  isCatchingUp: false, // true while replaying opponent actions from catch-up/resync
  selfReady: false, // true once the self player has pressed Set Up (ready check)
  oppReady: false, // true once the opp player has pressed Set Up (ready check)
  replayActionData: [],
  turn: 0,
  get initiator() {
    return selfContainer.classList.contains('self') ? 'self' : 'opp';
    //refers to the user on the bottom half of the screen, e.g., initiator === 'self' means that the bottom half is the 'self' user
  },
  roomId: '',
  opponentSocketId: '', // multiplayer peer socket.id for synced turn-order coin caller
  p1Username: (user) => {
    return user === 'self' ? 'Blue' : 'Red';
  },
  p2SelfUsername: '',
  p2OppUsername: '',
  spectatorUsername: '',
  selfDeckData: '',
  p1OppDeckData: '', // refers to the opponent's data in 1 player mode, i.e., the "alt" deck data
  p2OppDeckData: '', // refers to the opponent's data in 2 player mode, i.e., the other player's deck data
  cardBackSrc: defaultCardBackSrc,
  p1OppCardBackSrc: defaultCardBackSrc,
  p2OppCardBackSrc: defaultCardBackSrc,
};

// preload image
preloadImage(defaultCardBackSrc);

document.body.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.75)), url('https://wallpapercave.com/wp/wp10484598.jpg')`;
document.body.style.backgroundPosition = '-200px 0';

// create global variable that holds the information of a selected card, i.e., the card that has been clicked and highlighted and can trigger keybinds
export const mouseClick = {
  cardIndex: '',
  zoneId: '',
  cardUser: '',
  playContainer: '',
  playContainerParent: '',
  selectingCard: false,
  isActiveZone: '',
  get card() {
    if (this.zoneId) {
      return getZone(this.cardUser, this.zoneId).array[this.cardIndex];
    }
    return null;
  },
};
