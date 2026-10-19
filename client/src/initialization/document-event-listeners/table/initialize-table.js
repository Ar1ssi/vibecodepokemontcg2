import { initializeBoardButtons } from './board-buttons.js';
import { initializeDocuments } from './documents.js';
import { initializeZoneButtons } from './zone-buttons.js';
import { initializeZones } from './zones.js';

export const initializeTable = () => {
  initializeBoardButtons();
  initializeDocuments();
  initializeZoneButtons();
  initializeZones();
};
