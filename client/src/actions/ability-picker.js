// Ability Picker — popup menu that lets the player choose which Pokémon's
// ability to use when multiple usable abilities are available.
//
// Triggers ONLY when more than one actionable ability is usable.
// If exactly 1 is usable, it executes directly (no popup).
// If 0 are usable, it shows a "no usable abilities" message.
//
// The 5 actionable families (the only ones with executors):
//   heal, switch, attach, search, energy-redirect

import { getZone } from '../setup/zones/get-zone.js';
import { classifyAbility, isAbilityCard } from '../setup/rules/ability-effects.mjs';
import { rulesState, abilityUsed, ensureCardData } from '../setup/rules/rules-state.mjs';
import { appendMessage } from '../setup/chatbox/append-message.js';
import { selfContainer, oppContainer } from '../front-end.js';
import {
  healAbility,
  switchAbility,
  attachAbility,
  searchAbility,
  energyRedirectAbility,
} from './chat-buttons/chat-buttons.js';

// Map family → executor function
const FAMILY_EXECUTORS = {
  heal: healAbility,
  switch: switchAbility,
  attach: attachAbility,
  search: searchAbility,
  'energy-redirect': energyRedirectAbility,
};

// Human-readable labels for each family
const FAMILY_LABELS = {
  heal: '💖 Heal',
  switch: '🔁 Switch',
  attach: '⚡ Attach',
  search: '🔍 Search',
  'energy-redirect': '🔀 Redirect',
};

/**
 * Scan active + bench for usable abilities.
 * Returns an array of { card, family, zone, index } for each usable ability.
 */
async function collectUsableAbilities(user) {
  const usable = [];
  const activeCard = getZone(user, 'active').array[0];
  const benchCards = getZone(user, 'bench').array;

  const candidates = [];
  if (activeCard) candidates.push({ card: activeCard, zone: 'active', index: 0 });
  benchCards.forEach((card, index) => {
    if (card.type === 'Pokémon') {
      candidates.push({ card, zone: 'bench', index });
    }
  });

  for (const { card, zone, index } of candidates) {
    if (!isAbilityCard(card)) continue;

    // Ensure card data is loaded before classifying
    await ensureCardData(card);

    const family = classifyAbility(card);
    if (!FAMILY_EXECUTORS[family]) continue;

    // Check once-per-turn usage
    if (rulesState.enabled && abilityUsed(user, card)) continue;

    usable.push({ card, family, zone, index });
  }

  return usable;
}

/**
 * Show the ability picker popup.
 * @param {string} user - 'self' or 'opp'
 */
export async function abilityPicker(user) {
  // Turn check
  if (rulesState.enabled && rulesState.turnPlayer !== user) {
    appendMessage(user, `⛔ It's not your turn.`, 'announcement', false);
    return;
  }

  const usable = await collectUsableAbilities(user);

  // 0 usable abilities
  if (usable.length === 0) {
    appendMessage(
      user,
      `⚠️ No usable abilities found. Make sure your Pokémon have actionable abilities (heal, switch, attach, search, or redirect).`,
      'announcement',
      false
    );
    return;
  }

  // Exactly 1 usable → execute directly
  if (usable.length === 1) {
    const { card, family } = usable[0];
    const executor = FAMILY_EXECUTORS[family];
    await executor(user, true, card);
    return;
  }

  // >1 usable → show popup
  showAbilityPopup(user, usable);
}

/**
 * Render the ability picker popup with one row per usable ability.
 */
function showAbilityPopup(user, usable) {
  // Close any existing popups first
  const existing = document.querySelector('.ability-picker-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'custom-popup ability-picker-popup';

  const title = document.createElement('div');
  title.className = 'ability-picker-title';
  title.textContent = 'Choose an ability to use:';
  popup.appendChild(title);

  const list = document.createElement('div');
  list.className = 'ability-picker-list';

  for (const { card, family, zone, index } of usable) {
    const row = document.createElement('div');
    row.className = 'ability-picker-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'ability-picker-name';
    const zoneLabel = zone === 'active' ? ' (Active)' : ` (Bench ${index + 1})`;
    nameSpan.textContent = `${card.name || 'Pokémon'}${zoneLabel}`;
    row.appendChild(nameSpan);

    const familySpan = document.createElement('span');
    familySpan.className = 'ability-picker-family';
    familySpan.textContent = FAMILY_LABELS[family] || family;
    row.appendChild(familySpan);

    const useBtn = document.createElement('button');
    useBtn.className = 'ability-picker-use-btn';
    useBtn.textContent = 'Use';
    useBtn.addEventListener('click', async () => {
      closePopup(popup);
      const executor = FAMILY_EXECUTORS[family];
      await executor(user, true, card);
    });
    row.appendChild(useBtn);

    list.appendChild(row);
  }

  popup.appendChild(list);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'popup-button ability-picker-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    closePopup(popup);
  });
  popup.appendChild(cancelBtn);

  document.body.appendChild(popup);
  selfContainer.style.zIndex = -1;
  oppContainer.style.zIndex = -1;
}

function closePopup(popup) {
  if (popup && popup.parentNode) {
    popup.parentNode.removeChild(popup);
  }
  selfContainer.style.zIndex = 0;
  oppContainer.style.zIndex = 0;
}
