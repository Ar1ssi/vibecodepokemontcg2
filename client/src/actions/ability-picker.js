// Ability Picker — popup menu that lets the player choose which Pokémon's
// ability to use when multiple usable abilities are available.
//
// Triggers ONLY when more than one actionable ability is usable.
// If exactly 1 is usable, it executes directly (no popup).
// If 0 are usable, it shows a "no usable abilities" message.

import { getZone } from '../setup/zones/get-zone.js';
import { rulesState, abilityUsed, ensureCardData } from '../setup/rules/rules-state.mjs';
import { appendMessage } from '../setup/chatbox/append-message.js';
import { selfContainer, oppContainer } from '../state.js';
import { runAbilitySteps } from '../setup/rules/rules-bridge.js';
import {
  collectUsableAbilityCandidates,
  filterUsableAbilities,
} from '../setup/rules/collect-usable-abilities.mjs';

// Human-readable labels for each family
const FAMILY_LABELS = {
  heal: '💖 Heal',
  switch: '🔁 Switch',
  attach: '⚡ Attach',
  search: '🔍 Search',
  'energy-redirect': '🔀 Redirect',
  draw: '🃏 Draw',
  status: '💫 Status',
  'move-damage': '💥 Damage',
  'look-at-top': '👁️ Look',
  recursion: '♻️ Recursion',
  evolve: '🧬 Evolve',
  'when-played': '🎭 When played',
  'opponent-disrupt': '🚫 Disrupt',
};

/**
 * Scan active + bench for usable abilities.
 * Returns an array of { card, family, zone, index, abilityName }.
 */
export async function collectUsableAbilities(user) {
  const activeCard = getZone(user, 'active').array[0];
  const benchCards = getZone(user, 'bench').array;
  const candidates = collectUsableAbilityCandidates(activeCard, benchCards);

  for (const { card } of candidates) {
    try {
      await ensureCardData(card);
    } catch {
      /* card data may not be ready yet */
    }
  }

  return filterUsableAbilities(candidates, {
    rulesEnabled: rulesState.enabled,
    isUsed: (card) => abilityUsed(user, card),
  });
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
      `⚠️ No usable abilities found. Make sure your Pokémon have actionable abilities (heal, switch, attach, search, redirect, draw, status, damage, look, recursion, or evolve).`,
      'announcement',
      false
    );
    return;
  }

  // Exactly 1 usable → execute via compound step orchestrator
  if (usable.length === 1) {
    const { card } = usable[0];
    await runAbilitySteps(user, card);
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

  for (const { card, family, zone, index, abilityName } of usable) {
    const row = document.createElement('div');
    row.className = 'ability-picker-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'ability-picker-name';
    const zoneLabel = zone === 'active' ? ' (Active)' : ` (Bench ${index + 1})`;
    nameSpan.textContent = `${card.name || 'Pokémon'}${zoneLabel} — ${abilityName}`;
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
      await runAbilitySteps(user, card);
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
