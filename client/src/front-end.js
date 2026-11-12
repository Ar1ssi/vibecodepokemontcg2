export * from './state.js';

import { initializeDOMEventListeners } from './initialization/document-event-listeners/initialize-document-event-listeners.js';
import { loadImportData } from './initialization/load-import-data/load-import-data.js';
import { initializeMutationObservers } from './initialization/mutation-observers/initialize-mutation-observers.js';
import { initializeSocketEventListeners } from './initialization/socket-event-listeners/socket-event-listeners.js';
import { initializeMatLayout } from './setup/sizing/apply-mat-layout.js';
import { installE2eApi } from './setup/general/e2e-api.js';
import { initializeRoomFormatPanel } from './setup/general/room-format-panel.js';
import { applyFxSettings, watchFxSettingTargets } from './setup/image-logic/fx-settings.js';
import { initializeHoverPreview } from './setup/image-logic/hover-preview.js';
import { loadFoilManifest } from './setup/foil/tcgl-foil-store.js';
import { installDeckBoxes } from './setup/netcode/mat-fx/deck-box.js';

applyFxSettings();
loadFoilManifest();
watchFxSettingTargets();
initializeSocketEventListeners();
initializeRoomFormatPanel();
initializeDOMEventListeners();
initializeMutationObservers();
initializeMatLayout();
// Design 074: the three.js board loads through import() so the page still boots if it fails.
import('./setup/board3d/board3d.js')
  .then((board3d) => board3d.initializeBoard3d())
  .catch((error) => console.error('board3d failed to start', error));
initializeHoverPreview();
installDeckBoxes();
loadImportData();
installE2eApi();
