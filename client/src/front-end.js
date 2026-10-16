export * from './state.js';

import { initializeDOMEventListeners } from './initialization/document-event-listeners/initialize-document-event-listeners.js';
import { loadImportData } from './initialization/load-import-data/load-import-data.js';
import { initializeMutationObservers } from './initialization/mutation-observers/initialize-mutation-observers.js';
import { initializeSocketEventListeners } from './initialization/socket-event-listeners/socket-event-listeners.js';
import { initializeMatLayout } from './setup/sizing/apply-mat-layout.js';
import { initializeTableTilt } from './setup/sizing/apply-table-tilt.js';
import { initSyncLogger } from './setup/general/sync-logger-bridge.js';
import { initDecisionLogger } from './setup/general/decision-logger-bridge.js';
import { installE2eApi } from './setup/general/e2e-api.js';
import { initializeRoomFormatPanel } from './setup/general/room-format-panel.js';
import { applyFxSettings, watchFxSettingTargets } from './setup/image-logic/fx-settings.js';
import { initializeHoverPreview } from './setup/image-logic/hover-preview.js';
import { isBoard3dRequested } from './setup/board3d/board-flag.mjs';
import { loadFoilManifest } from './setup/foil/tcgl-foil-store.js';

function readLocalStorage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

applyFxSettings();
loadFoilManifest();
watchFxSettingTargets();
initSyncLogger();
initDecisionLogger();
initializeSocketEventListeners();
initializeRoomFormatPanel();
initializeDOMEventListeners();
initializeMutationObservers();
initializeMatLayout();
// Design 074: the three.js board loads only when asked for, so the iframe board pays nothing.
if (isBoard3dRequested(location.search, readLocalStorage())) {
  import('./setup/board3d/board3d.js')
    .then((board3d) => board3d.initializeBoard3d())
    .catch((error) => console.error('board3d failed to start', error));
}
initializeTableTilt();
initializeHoverPreview();
loadImportData();
installE2eApi();
