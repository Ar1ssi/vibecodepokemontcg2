export * from './state.js';

import { initializeDOMEventListeners } from './initialization/document-event-listeners/initialize-document-event-listeners.js';
import { loadImportData } from './initialization/load-import-data/load-import-data.js';
import { initializeMutationObservers } from './initialization/mutation-observers/initialize-mutation-observers.js';
import { initializeSocketEventListeners } from './initialization/socket-event-listeners/socket-event-listeners.js';
import { initializeMatLayout } from './setup/sizing/apply-mat-layout.js';
import { initSyncLogger } from './setup/general/sync-logger-bridge.js';
import { installE2eApi } from './setup/general/e2e-api.js';

initSyncLogger();
initializeSocketEventListeners();
initializeDOMEventListeners();
initializeMutationObservers();
initializeMatLayout();
loadImportData();
installE2eApi();
