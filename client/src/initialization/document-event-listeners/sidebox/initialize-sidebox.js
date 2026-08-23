import { initializeHeaderButtons } from './header-buttons.js';
import { initializeImport } from './import-deck.js';
import { initializeNativeDeckBuilder } from './native-deck-builder.js';
import { initializeP1Page } from './p1/initialize-p1-page.js';
import { initializeP2Page } from './p2/initialize-p2-page.js';
import { initializeSettings } from './settings.js';
import { initializeSideMenuToggle } from './side-menu-toggle.js';
import { initializeRulesEngine, buildRulesToggle } from '../../../setup/rules/rules-bridge.js';

export const initializeSidebox = () => {
  initializeHeaderButtons();
  initializeP1Page();
  initializeP2Page();
  initializeSettings();
  initializeImport();
  initializeNativeDeckBuilder();
  initializeSideMenuToggle();
  initializeRulesEngine();
  buildRulesToggle();
};
