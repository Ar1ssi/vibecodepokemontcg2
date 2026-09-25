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
import { applyFxSettings, watchFxSettingTargets } from './setup/image-logic/fx-settings.js';

applyFxSettings();
watchFxSettingTargets();
initSyncLogger();
initDecisionLogger();
initializeSocketEventListeners();
initializeDOMEventListeners();
initializeMutationObservers();
initializeMatLayout();
initializeTableTilt();
loadImportData();
installE2eApi();
