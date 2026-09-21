// Solo debug panel. Lives in the Settings sidebox and lets a lone tester on
// localhost force the game into a playable state and spawn arbitrary cards into
// either player's zones — for testing a card's behavior in isolation without
// dealing a whole game out by hand.
//
// Scope: SOLO ONLY. Every spawn mutates local zone arrays / DOM directly (via
// the same Card factory and moveCardBundle path the live UI uses); under a
// server-authoritative 2P game those local mutations never reach the server, so
// the panel refuses to act when systemState.isTwoPlayer is true and says why.

import { systemState } from '../../initialization/global-variables/global-variables.js';
import { appendMessage } from '../chatbox/append-message.js';
import { getZone } from '../zones/get-zone.js';
import { Card } from '../deck-constructor/card.js';
import { reconcileHandStacks } from '../zones/hand-stack-dom.js';
import { ensureCardData, rulesState } from '/shared/engine/rules/rules-state.mjs';
import { queryCardsByName } from '../deck-builder/core/card-search.mjs';
import { forceRulesActiveTurn } from './rules-bridge.js';
import { debugCosts } from '/shared/engine/rules/attack-engine.mjs';
import {
  resultToRow,
  shouldAutoAttach,
  firstPokemonIndex,
  pickLegacyEnergy,
  LEGACY_ENERGY_NAME,
} from './debug-spawn-row.mjs';

const SPAWN_ZONES = ['active', 'bench', 'hand', 'discard'];
let debugSyncInstance = 900000; // high offset: never collides with deck-built ids

const isSolo = () => !systemState.isTwoPlayer;

// Create a live Card, enrich it (hp/attacks/stage so it is actually testable),
// drop it into the owner's hand, then relocate to the target zone through the
// same move path the UI uses. Returns { ok, error }.
export async function spawnCard(owner, zoneId, row, { autoAttach = false } = {}) {
  if (!isSolo()) {
    return { ok: false, error: 'Debug spawn is solo-only (2P is server-authoritative).' };
  }
  if (!SPAWN_ZONES.includes(zoneId)) {
    return { ok: false, error: `Unknown zone: ${zoneId}` };
  }
  const [name, type, imageURL, number, set, tcgId] = row;
  let hand;
  try {
    hand = getZone(owner, 'hand');
  } catch {
    return { ok: false, error: `No hand zone for ${owner}` };
  }
  if (!hand?.element) return { ok: false, error: `No hand element for ${owner}` };

  const card = new Card(owner, name, type, imageURL, number, set, tcgId);
  card.cardId = `dbg_${Date.now()}_${debugSyncInstance}`;
  card.syncInstance = debugSyncInstance++;
  if (card.image) {
    card.image.cardId = card.cardId;
    card.image.syncInstance = card.syncInstance;
    card.image.dataset.cardId = card.cardId;
  }
  try {
    await ensureCardData(card);
  } catch {
    // Best-effort enrichment: a card with no hp/attacks still spawns and renders;
    // the tester just cannot attack with it until data resolves.
  }

  hand.array.push(card);
  hand.element.appendChild(card.image);
  reconcileHandStacks(owner);

  const handIndex = hand.array.length - 1;

  if (autoAttach && shouldAutoAttach(card)) {
    const targetIndex = firstPokemonIndex(getZone(owner, 'active').array);
    if (targetIndex < 0) {
      appendMessage('', `Debug: no Active Pokémon for ${owner}; ${name} left in hand.`, 'announcement', false);
      return { ok: false, error: `No Active Pokémon for ${owner} to attach to.` };
    }
    const res = await relocateCard(owner, 'active', handIndex, targetIndex);
    if (res.ok) appendMessage('', `Debug: attached ${name} to ${owner} Active.`, 'announcement', false);
    return res;
  }

  if (zoneId === 'hand') {
    appendMessage('', `Debug: spawned ${name} into ${owner} hand.`, 'announcement', false);
    return { ok: true };
  }

  const res = await relocateCard(owner, zoneId, handIndex, false);
  if (res.ok) appendMessage('', `Debug: spawned ${name} into ${owner} ${zoneId}.`, 'announcement', false);
  return res;
}

// Move a card out of the owner's hand through the UI's own move path. `targetIndex` is the
// Pokémon to attach to, or false for a plain placement. Rules are forced off for the move only:
// a debug spawn must land regardless of whose turn it is or whether the destination is legal.
async function relocateCard(owner, zoneId, handIndex, targetIndex) {
  const { moveCardBundle } = await import('../../actions/move-card-bundle/move-card-bundle.js');
  const prevEnabled = rulesState.enabled;
  rulesState.enabled = false;
  try {
    await moveCardBundle(owner, owner, 'hand', zoneId, handIndex, targetIndex, 'move', false);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    rulesState.enabled = prevEnabled;
  }
}

export function buildDebugMenu() {
  const settings = document.getElementById('settings');
  if (!settings || document.getElementById('debugMenuPanel')) return;

  const panel = document.createElement('div');
  panel.id = 'debugMenuPanel';
  panel.className = 'settings-row debug-menu';
  panel.innerHTML = `
    <button id="debugMenuToggle" type="button" class="neutral-color" style="width:100%;text-align:left;">
      🐛 Debug tools
    </button>
    <div id="debugMenuBody" hidden style="margin-top:8px;display:flex;flex-direction:column;gap:8px;">
      <button id="debugForceActiveBtn" type="button" class="neutral-color">Set game to active (main phase)</button>
      <button id="debugFreeCostsBtn" type="button" class="neutral-color" aria-pressed="false">Energy costs: ON (click to disable)</button>
      <div id="debugSpawnControls" style="display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;gap:6px;align-items:center;">
          <label style="display:flex;gap:4px;align-items:center;">Owner
            <select id="debugSpawnOwner">
              <option value="self">self</option>
              <option value="opp">opp</option>
            </select>
          </label>
          <label style="display:flex;gap:4px;align-items:center;">Zone
            <select id="debugSpawnZone">
              <option value="active">active</option>
              <option value="bench">bench</option>
              <option value="hand">hand</option>
              <option value="discard">discard</option>
            </select>
          </label>
        </div>
        <button id="debugAttachLegacyBtn" type="button" class="neutral-color">Attach Legacy Energy to Active</button>
        <div style="display:flex;gap:6px;">
          <input id="debugSpawnSearch" type="text" placeholder="card name…" style="flex:1;" />
          <button id="debugSpawnSearchBtn" type="button" class="neutral-color">Search</button>
        </div>
        <div id="debugSpawnStatus" style="font-size:12px;opacity:0.8;"></div>
        <div id="debugSpawnResults" style="display:flex;flex-wrap:wrap;gap:6px;max-height:220px;overflow:auto;"></div>
      </div>
      <div id="debugMenuNote" style="font-size:12px;opacity:0.7;">Solo only — disabled in 2P games.</div>
    </div>`;
  settings.appendChild(panel);

  const body = panel.querySelector('#debugMenuBody');
  panel.querySelector('#debugMenuToggle').addEventListener('click', () => {
    body.hidden = !body.hidden;
  });

  panel.querySelector('#debugForceActiveBtn').addEventListener('click', () => {
    if (!isSolo()) {
      appendMessage('', 'Debug tools are solo-only.', 'announcement', false);
      return;
    }
    forceRulesActiveTurn('self');
  });

  const freeCostsBtn = panel.querySelector('#debugFreeCostsBtn');
  freeCostsBtn.addEventListener('click', () => {
    if (!isSolo()) {
      appendMessage('', 'Debug tools are solo-only.', 'announcement', false);
      return;
    }
    debugCosts.free = !debugCosts.free;
    freeCostsBtn.setAttribute('aria-pressed', String(debugCosts.free));
    freeCostsBtn.textContent = debugCosts.free
      ? 'Energy costs: OFF (click to enable)'
      : 'Energy costs: ON (click to disable)';
  });

  const searchInput = panel.querySelector('#debugSpawnSearch');
  const searchBtn = panel.querySelector('#debugSpawnSearchBtn');
  const statusEl = panel.querySelector('#debugSpawnStatus');
  const resultsEl = panel.querySelector('#debugSpawnResults');
  const ownerSel = panel.querySelector('#debugSpawnOwner');
  const zoneSel = panel.querySelector('#debugSpawnZone');
  const attachLegacyBtn = panel.querySelector('#debugAttachLegacyBtn');
  attachLegacyBtn.addEventListener('click', async () => {
    if (!isSolo()) {
      statusEl.textContent = 'Solo only — disabled in 2P games.';
      return;
    }
    attachLegacyBtn.disabled = true;
    statusEl.textContent = `Fetching ${LEGACY_ENERGY_NAME}…`;
    try {
      const { results } = await queryCardsByName(LEGACY_ENERGY_NAME);
      const legacy = pickLegacyEnergy(results);
      if (!legacy) {
        statusEl.textContent = `${LEGACY_ENERGY_NAME} not found.`;
        return;
      }
      const res = await spawnCard(ownerSel.value, 'active', resultToRow(legacy), {
        autoAttach: true,
      });
      statusEl.textContent = res.ok ? '' : `Attach failed: ${res.error}`;
    } catch (err) {
      statusEl.textContent = `Attach error: ${String(err?.message || err)}`;
    } finally {
      attachLegacyBtn.disabled = false;
    }
  });

  const runSearch = async () => {
    const term = searchInput.value.trim();
    if (!term) return;
    if (!isSolo()) {
      statusEl.textContent = 'Solo only — disabled in 2P games.';
      return;
    }
    searchBtn.disabled = true;
    statusEl.textContent = `Searching “${term}”…`;
    resultsEl.innerHTML = '';
    try {
      const { results, isHugeResultSet } = await queryCardsByName(term);
      if (isHugeResultSet) {
        statusEl.textContent = 'Too many results — refine the term.';
        return;
      }
      if (!results.length) {
        statusEl.textContent = 'No results.';
        return;
      }
      statusEl.textContent = `${results.length} result(s) — click to spawn.`;
      for (const result of results) {
        const thumb = document.createElement('img');
        thumb.src = result.image || result.images?.small || '';
        thumb.alt = result.name;
        thumb.title = `${result.name} (${result.set?.id || '?'} ${result.number || ''})`;
        thumb.style.cssText = 'width:60px;height:auto;cursor:pointer;border-radius:4px;';
        thumb.addEventListener('click', async () => {
          thumb.style.opacity = '0.4';
          const res = await spawnCard(ownerSel.value, zoneSel.value, resultToRow(result));
          thumb.style.opacity = '1';
          if (!res.ok) statusEl.textContent = `Spawn failed: ${res.error}`;
        });
        resultsEl.appendChild(thumb);
      }
    } catch (err) {
      statusEl.textContent = `Search error: ${String(err?.message || err)}`;
    } finally {
      searchBtn.disabled = false;
    }
  };

  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });
}
