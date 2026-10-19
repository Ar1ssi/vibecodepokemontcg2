import { initializeHeaderButtons } from './header-buttons.js';
import { initializeImport } from './import-deck.js';
import { initializeNativeDeckBuilder } from './native-deck-builder.js';
import { initializeP1Page } from './p1/initialize-p1-page.js';
import { initializeP2Page } from './p2/initialize-p2-page.js';
import { initializeSettings } from './settings.js';
import { initializeSideMenuToggle } from './side-menu-toggle.js';
import { initializeRulesEngine, buildRulesToggle } from '../../../setup/rules/rules-bridge.js';
import { buildDebugMenu } from '../../../setup/rules/debug-menu.js';
import {
  resolveBuildBattleFlow,
  resolveBuilderMode,
  resolveBuilderRole,
} from '../../../setup/deck-builder/core/builder-window.mjs';
import { installRunReporter } from './bnb-run-reporter.js';

export const initializeSidebox = () => {
  const role = resolveBuilderRole(window.location.pathname);
  initializeHeaderButtons();
  initializeP1Page();
  initializeP2Page();
  initializeSettings();
  initializeImport();
  initializeNativeDeckBuilder({
    role,
    mode: resolveBuilderMode(window.location.pathname),
    flow: resolveBuildBattleFlow(window.location.pathname),
  });
  // A finished game on the game tab fills the Build & Battle run's next node (design 071).
  if (role === 'host') installRunReporter();
  initializeSideMenuToggle();
  initializeRulesEngine();
  buildRulesToggle();
  buildDebugMenu();
};
