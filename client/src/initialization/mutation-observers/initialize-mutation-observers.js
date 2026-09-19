import { initializeBoardObserver } from './board-observer.js';
import { initializeHandObserver } from './hand-observer.js';
import { initializeLostZonePanel } from './lost-zone-panel.js';
import { initializePrizesObserver } from './prizes-observer.js';
import { initializeStadiumObserver } from './stadium-observer.js';

export const initializeMutationObservers = () => {
  initializeBoardObserver();
  initializeHandObserver();
  initializePrizesObserver();
  initializeStadiumObserver();
  initializeLostZonePanel();
};
