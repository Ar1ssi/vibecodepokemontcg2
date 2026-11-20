import { initializeHeaderButtons } from './header-buttons.js';
import { initializeImport } from './import-deck.js';
import { initializeNativeDeckBuilder } from './native-deck-builder.js';
import { initializeP1BottomButtons } from './p1/bottom-buttons.js';
import { initializeChangelog } from './p1/changelog.js';
import { initializeP1ChatButtons } from './p1/chat-buttons.js';
import { initializeDonationsLink } from './p1/donations-link.js';
import { initializeTutorialButton } from './p1/tutorial.js';
import { initializeP2ChatButtons } from './p2/chat-buttons.js';
import { initializeP2BottomButtons } from './p2/bottom-buttons.js';
import { initializeRoomButtons } from './p2/room-buttons.js';
import { initializePublicRoomList } from '../../../setup/lobby/public-room-list.js';
import { initializeSettings } from './settings.js';
import { initializeSideMenuToggle } from './side-menu-toggle.js';
import { initializeRulesEngine, buildRulesToggle } from '../../../setup/rules/rules-bridge.js';
import { buildDebugMenu } from '../../../setup/rules/debug-menu.js';
import {
  resolveBuildBattleFlow,
  resolveBuilderMode,
  resolveBuilderRole,
} from '../../../setup/deck-builder/core/builder-window.mjs';
import { reportMatchResult } from '../../../setup/deck-builder/core/build-battle-run/run-reporter.mjs';
import { deckFormatOf } from '../../../setup/deck-constructor/deck-format-args.mjs';
import { systemState } from '../../../state.js';
import { browserStorage } from './native-deck-builder-bb-shared.js';

export const initializeSidebox = () => {
  const role = resolveBuilderRole(window.location.pathname);
  initializeHeaderButtons();
  initializeP1BottomButtons();
  initializeChangelog();
  initializeP1ChatButtons();
  initializeDonationsLink();
  initializeTutorialButton();
  initializeP2ChatButtons();
  initializeP2BottomButtons();
  initializeRoomButtons();
  initializePublicRoomList();
  initializeSettings();
  initializeImport();
  initializeNativeDeckBuilder({
    role,
    mode: resolveBuilderMode(window.location.pathname),
    flow: resolveBuildBattleFlow(window.location.pathname),
  });
  // A finished game on the game tab fills the Build & Battle run's next node (design 071).
  if (role === 'host') {
    const storage = browserStorage();
    document.addEventListener('rules-game-ended', (event) => {
      reportMatchResult(storage, event.detail, { deckFormat: deckFormatOf(systemState, 'self') });
    });
  }
  initializeSideMenuToggle();
  initializeRulesEngine();
  buildRulesToggle();
  buildDebugMenu();
};
