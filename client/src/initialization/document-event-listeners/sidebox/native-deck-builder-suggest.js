// Suggest tab (design 069): tournament-backed card suggestions for the deck being built, steered by
// the player per deck (Add / Dismiss / Keep / lock) and by goals ("Faster setup", "Budget", …).
// DOM only — the maths lives in core/deck-suggest/.
import { addCard, createEmptyDeck } from '../../../setup/deck-builder/core/deck-state.mjs';
import { importDeckEntries } from '../../../setup/deck-builder/core/deck-text-import.mjs';
import { loadMetaDataset } from '../../../setup/deck-builder/core/deck-suggest/dataset.mjs';
import { BUDGET_GOAL, GOALS, goalLabel } from '../../../setup/deck-builder/core/deck-suggest/goals.mjs';
import {
  EMPTY_PREFS,
  acceptKey,
  dismissKey,
  lockKey,
  normalizeSuggestPrefs,
  prunePrefs,
  restoreKey,
  samePrefs,
  steeringCounts,
  toggleGoal,
  unlockKey,
} from '../../../setup/deck-builder/core/deck-suggest/prefs.mjs';
import {
  listToEntries,
  resolveDatasetCard,
  resolveListEntry,
} from '../../../setup/deck-builder/core/deck-suggest/resolve.mjs';
import {
  describeList,
  findDeckCardForKey,
  metaOverview,
  prefKeyOf,
  resolveDeckCard,
  suggestCards,
} from '../../../setup/deck-builder/core/deck-suggest/suggest.mjs';
import {
  datasetFooter,
  evidenceLine,
  formatPercent,
  formatUsd,
  headerText,
  lowConfidenceText,
  previewUrl,
  tagBadges,
  thumbnailUrl,
  windowLabel,
} from '../../../setup/deck-builder/core/deck-suggest/view.mjs';

const RECOMPUTE_DELAY_MS = 150;

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const SECTIONS = [
  { bucket: 'missingCore', title: 'Missing staples', blurb: 'Almost every list like yours plays these.' },
  { bucket: 'countTweaks', title: 'Count tweaks', blurb: 'You play these at an unusual count.' },
  { bucket: 'techs', title: 'Tech options', blurb: 'Some lists like yours play these.' },
  { bucket: 'cuts', title: 'Unusual picks', blurb: 'Lists like yours rarely play these. Cut or keep.' },
];

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * @param {object} options
 * @param {HTMLElement} options.panelEl - the Suggest tab's panel
 * @param {() => object} options.getDeck - the editor's deck
 * @param {() => object} options.getPrefs - this deck's steering
 * @param {(prefs: object) => void} options.setPrefs - persist steering for this deck
 * @param {(card: object) => void} options.onAddCard
 * @param {(card: object) => void} options.onRemoveCard
 * @param {(deck: object) => void} options.onReplaceDeck - "Start from this list"
 * @param {(imageUrl: string, card: object|null, sourceEl: Element) => void} options.onPreviewCard
 * @param {{ fetchCardDetail: Function, searchByName: Function }} options.deps - card lookups
 * @returns {{ show: Function, hide: Function, refresh: Function } | null}
 */
export const initializeNativeDeckBuilderSuggest = ({
  panelEl,
  getDeck,
  getPrefs,
  setPrefs,
  onAddCard,
  onRemoveCard,
  onReplaceDeck,
  onPreviewCard,
  deps,
}) => {
  if (!panelEl) return null;

  let index = null;
  let loadError = '';
  let loading = false;
  let visible = false;
  let timer = null;
  let status = '';
  let busy = false;
  // Bumped whenever the editor switches to another deck or replaces its cards wholesale, so an
  // Add or list import that was waiting on the network never lands in the wrong deck.
  let generation = 0;
  // <details> folds the player opened; re-renders keep them open.
  const openFolds = new Set();

  const prefsNow = () => normalizeSuggestPrefs(getPrefs?.() ?? EMPTY_PREFS);

  const ensureLoaded = async () => {
    if (index || loading) return;
    loading = true;
    loadError = '';
    renderNow();
    const result = await loadMetaDataset(fetchJson);
    loading = false;
    if (result.ok) index = result.index;
    else loadError = result.reason;
    renderNow();
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(renderNow, RECOMPUTE_DELAY_MS);
  };

  const setStatus = (text) => {
    status = text;
    const el = panelEl.querySelector('[data-suggest-status]');
    if (el) el.textContent = text;
  };

  // ── markup ─────────────────────────────────────────────────────────────
  const thumbHtml = (idx) => {
    const card = idx === null ? null : index.dataset.cards[idx];
    const src = thumbnailUrl(card?.image);
    if (!src) return '<span class="db-suggest-thumb db-suggest-thumb-empty" aria-hidden="true"></span>';
    return `<button type="button" class="db-suggest-thumb" data-action="preview" data-idx="${idx}" aria-label="Preview ${escapeHtml(card.name)}"><img src="${escapeHtml(src)}" alt="" loading="lazy"></button>`;
  };

  const rowHtml = (item, bucket, { showPrice, ownGoal = null } = {}) => {
    const badges = tagBadges(item, ownGoal)
      .map((label) => `<span class="db-suggest-badge">${escapeHtml(label)}</span>`)
      .join('');
    const price = showPrice && item.price !== null && bucket !== 'budget'
      ? `<span class="db-suggest-price">${escapeHtml(formatUsd(item.price))}</span>`
      : '';
    const key = escapeHtml(item.key);
    const cutButton = `<button type="button" class="db-suggest-btn" data-action="cut" data-key="${key}">Cut 1</button>`;
    const addButton = `<button type="button" class="db-suggest-btn db-suggest-btn-primary" data-action="add" data-idx="${item.idx}" data-key="${key}">Add 1</button>`;
    const keepButton = (label) =>
      `<button type="button" class="db-suggest-btn db-suggest-btn-quiet" data-action="lock" data-key="${key}">${label}</button>`;
    let actions;
    if (bucket === 'cuts') actions = cutButton + keepButton('Keep');
    // A count tweak is a card you already play: move toward the usual count, or keep yours.
    else if (bucket === 'countTweaks') actions = (item.direction === 'down' ? cutButton : addButton) + keepButton('Keep count');
    else {
      actions = `${addButton}
           <button type="button" class="db-suggest-btn db-suggest-btn-quiet" data-action="dismiss" data-key="${key}">Dismiss</button>`;
    }
    const lockedMark = item.locked ? '<span class="db-suggest-badge db-suggest-badge-lock">Kept</span>' : '';
    return `<li class="db-suggest-row">
      ${thumbHtml(item.idx)}
      <div class="db-suggest-info">
        <div class="db-suggest-name">${escapeHtml(item.name)} ${price}${lockedMark}${badges}</div>
        <div class="db-suggest-evidence">${escapeHtml(evidenceLine(item, bucket))}</div>
      </div>
      <div class="db-suggest-actions">${actions}</div>
    </li>`;
  };

  const sectionHtml = (title, blurb, rows) => `<section class="db-suggest-section">
      <h3 class="db-suggest-section-title">${escapeHtml(title)} <span class="db-suggest-count">${rows.length}</span></h3>
      <p class="db-suggest-blurb">${escapeHtml(blurb)}</p>
      <ul class="db-suggest-list">${rows.join('')}</ul>
    </section>`;

  const goalsHtml = (prefs) => `<div class="db-suggest-goals" role="group" aria-label="What does this deck need?">
      <span class="db-suggest-goals-label">This deck needs:</span>
      ${GOALS.map((goal) => {
        const on = prefs.goals.includes(goal.id);
        return `<button type="button" class="db-suggest-goal${on ? ' active' : ''}" data-action="goal" data-goal="${goal.id}" aria-pressed="${on}" title="${escapeHtml(goal.blurb)}">${escapeHtml(goal.label)}</button>`;
      }).join('')}
    </div>`;

  const metaHtml = (intro) => {
    const rows = metaOverview(index).map(
      (row) => `<li class="db-suggest-row db-suggest-meta-row">
        <div class="db-suggest-info">
          <div class="db-suggest-name">${escapeHtml(row.archetype)}</div>
          <div class="db-suggest-share"><span style="width:${Math.max(2, Math.round(row.share * 100))}%"></span></div>
          <div class="db-suggest-evidence">${escapeHtml(formatPercent(row.share))} of the meta · ${row.lists} lists · best: ${escapeHtml(describeList(index, row.bestListIdx))}</div>
        </div>
        <div class="db-suggest-actions">
          <button type="button" class="db-suggest-btn db-suggest-btn-primary" data-action="start-list" data-list="${row.bestListIdx}"${busy ? ' disabled' : ''}>Start from this list</button>
        </div>
      </li>`
    );
    return `<section class="db-suggest-section">
        <h3 class="db-suggest-section-title">The meta · ${escapeHtml(windowLabel(index.dataset))}</h3>
        <p class="db-suggest-blurb">${escapeHtml(intro)}</p>
        <ul class="db-suggest-list">${rows.join('')}</ul>
      </section>`;
  };

  const steeringHtml = (result, prefs) => {
    const counts = steeringCounts(prefs);
    const core = result.deckKeys
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (entry) => `<li><button type="button" class="db-suggest-lock${entry.locked ? ' active' : ''}" data-action="${entry.locked ? 'unlock' : 'lock'}" data-key="${escapeHtml(entry.key)}" aria-pressed="${entry.locked}">${entry.locked ? '🔒' : '🔓'} ${escapeHtml(entry.name)} ×${entry.count}</button></li>`
      )
      .join('');
    const dismissed = prefs.dismissed
      .map((key) => {
        const idx = index.keyIndex.get(key);
        const name = idx === undefined ? key.replace(/^x:/, '') : index.dataset.cards[idx].name;
        return `<li><span>${escapeHtml(name)}</span> <button type="button" class="db-suggest-btn db-suggest-btn-quiet" data-action="restore" data-key="${escapeHtml(key)}">Restore</button></li>`;
      })
      .join('');
    const open = (fold) => (openFolds.has(fold) ? ' open' : '');
    return `<details class="db-suggest-fold" data-fold="core"${open('core')}>
        <summary>Your core — lock the cards you're keeping (${counts.locked} locked)</summary>
        <ul class="db-suggest-core">${core}</ul>
      </details>
      <details class="db-suggest-fold" data-fold="dismissed"${open('dismissed')}${counts.dismissed ? '' : ' hidden'}>
        <summary>Dismissed (${counts.dismissed})</summary>
        <ul class="db-suggest-dismissed">${dismissed}</ul>
      </details>
      <div class="db-suggest-steering">
        Steering: ${counts.locked} locked · ${counts.accepted} accepted · ${counts.dismissed} dismissed
        <button type="button" class="db-suggest-btn db-suggest-btn-quiet" data-action="reset"${counts.locked + counts.accepted + counts.dismissed ? '' : ' disabled'}>Reset</button>
      </div>`;
  };

  const resultHtml = (result, prefs) => {
    const showPrice = prefs.goals.includes(BUDGET_GOAL);
    const parts = [`<p class="db-suggest-head">${escapeHtml(headerText(result))} · ${escapeHtml(windowLabel(index.dataset))}</p>`];
    if (result.confidence === 'low') parts.push(`<p class="db-suggest-banner">${escapeHtml(lowConfidenceText(result))}</p>`);
    if (showPrice && result.deckPrice !== null) {
      parts.push(`<p class="db-suggest-head">Your deck ≈ ${escapeHtml(formatUsd(result.deckPrice))} (cards with known prices)</p>`);
    }

    for (const goal of prefs.goals) {
      const picks = result.goals[goal] || [];
      const bucket = goal === BUDGET_GOAL ? 'budget' : 'goal';
      const rows = picks.map((item) => rowHtml(item, bucket, { showPrice, ownGoal: goal }));
      parts.push(
        rows.length
          ? sectionHtml(`For ${goalLabel(goal)}`, GOALS.find((g) => g.id === goal)?.blurb || '', rows)
          : sectionHtml(`For ${goalLabel(goal)}`, `No picks for ${goalLabel(goal)} in lists like yours.`, [])
      );
    }

    let shown = 0;
    for (const { bucket, title, blurb } of SECTIONS) {
      const items = result[bucket];
      if (!items.length) continue;
      shown += items.length;
      parts.push(sectionHtml(title, blurb, items.map((item) => rowHtml(item, bucket, { showPrice }))));
    }
    const goalRows = prefs.goals.reduce((sum, goal) => sum + (result.goals[goal]?.length || 0), 0);
    if (!shown && !goalRows) {
      parts.push(
        prefs.dismissed.length
          ? '<p class="db-suggest-empty">Nothing left to suggest — restore dismissed cards or reset steering.</p>'
          : '<p class="db-suggest-empty">Your deck already matches what similar lists play.</p>'
      );
    }
    parts.push(steeringHtml(result, prefs));
    return parts.join('');
  };

  // ── render ─────────────────────────────────────────────────────────────
  function renderNow() {
    clearTimeout(timer);
    if (!visible) return;
    if (loading) {
      panelEl.innerHTML = '<p class="db-suggest-empty">Loading tournament data…</p>';
      return;
    }
    if (loadError) {
      panelEl.innerHTML = `<p class="db-suggest-empty">Suggestions unavailable: ${escapeHtml(loadError)}</p>
        <button type="button" class="db-suggest-btn" data-action="retry">Try again</button>`;
      return;
    }
    if (!index) return;

    let prefs = prefsNow();
    const deck = getDeck();
    let result = suggestCards(deck, index, { prefs });
    if (result.deckKeys.length) {
      const pruned = prunePrefs(prefs, new Set(result.deckKeys.map((entry) => entry.key)));
      if (!samePrefs(pruned, prefs)) {
        setPrefs(pruned);
        prefs = pruned;
        result = suggestCards(deck, index, { prefs });
      }
    }

    let body;
    if (result.confidence === 'none') {
      const intro =
        result.reason === 'empty'
          ? 'Start from a top list, or add a few cards and suggestions appear here.'
          : 'No tournament list shares a card with this deck yet. Here is what is winning.';
      body = metaHtml(intro);
    } else {
      body = resultHtml(result, prefs);
    }
    panelEl.innerHTML = `<div class="db-suggest">
        ${goalsHtml(prefs)}
        <p class="db-suggest-status" data-suggest-status aria-live="polite">${escapeHtml(status)}</p>
        ${body}
        <p class="db-suggest-footer">${escapeHtml(datasetFooter(index.dataset))}</p>
      </div>`;
  }

  // ── actions ────────────────────────────────────────────────────────────
  const updatePrefs = (transition) => {
    setPrefs(transition(prefsNow()));
    renderNow();
  };

  const addSuggested = async (idx) => {
    const datasetCard = index.dataset.cards[idx];
    if (!datasetCard) return;
    const startedIn = generation;
    setStatus(`Adding ${datasetCard.name}…`);
    const { card, error } = await resolveDatasetCard(datasetCard, deps);
    if (startedIn !== generation) {
      setStatus(`The deck changed before ${datasetCard.name} arrived — nothing was added.`);
      return;
    }
    if (!card) {
      setStatus(`Couldn't add ${datasetCard.name}: ${error}`);
      return;
    }
    setStatus(`Added ${datasetCard.name}.`);
    // Accept the card that actually landed: a name-search fallback can pick a sibling print.
    const landedIdx = resolveDeckCard(card, index);
    setPrefs(acceptKey(prefsNow(), landedIdx === null ? datasetCard.key : prefKeyOf(landedIdx, index)));
    onAddCard(card);
  };

  const cutOne = (key) => {
    const card = findDeckCardForKey(getDeck(), index, key);
    if (!card) return;
    setStatus(`Cut 1 ${card.name}.`);
    onRemoveCard(card);
  };

  const startFromList = async (listIdx) => {
    const deck = getDeck();
    if (Object.keys(deck || {}).length && !window.confirm('Replace the cards in this deck with the tournament list?')) {
      return;
    }
    busy = true;
    const startedIn = generation;
    setStatus(`Building ${describeList(index, listIdx)}…`);
    renderNow();
    try {
      const result = await importDeckEntries(listToEntries(index, listIdx), {
        deck: createEmptyDeck(),
        addCard,
        deps,
        resolve: resolveListEntry,
        onProgress: (done, total) => setStatus(`Building the list… ${done}/${total}`),
      });
      if (startedIn !== generation) {
        setStatus('The deck changed while the list was building — nothing was replaced.');
        return;
      }
      const failed = result.failed.map((entry) => `${entry.line} (${entry.reason})`);
      setPrefs({ ...EMPTY_PREFS, goals: prefsNow().goals });
      setStatus(
        failed.length
          ? `Imported ${result.imported} cards. Could not find: ${failed.join(', ')}`
          : `Imported ${result.imported} cards.`
      );
      onReplaceDeck(result.deck);
    } finally {
      busy = false;
      renderNow();
    }
  };

  const preview = (idx, sourceEl) => {
    const card = index.dataset.cards[idx];
    const url = previewUrl(card?.image);
    if (url) onPreviewCard?.(url, null, sourceEl);
  };

  panelEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || !panelEl.contains(button) || button.disabled) return;
    const { action, key, goal } = button.dataset;
    const idx = Number(button.dataset.idx);
    if (action === 'retry') {
      ensureLoaded();
      return;
    }
    if (!index) return;
    switch (action) {
      case 'goal':
        updatePrefs((prefs) => toggleGoal(prefs, goal));
        break;
      case 'add':
        if (Number.isInteger(idx)) addSuggested(idx);
        break;
      case 'dismiss':
        updatePrefs((prefs) => dismissKey(prefs, key));
        break;
      case 'lock':
        updatePrefs((prefs) => lockKey(prefs, key));
        break;
      case 'unlock':
        updatePrefs((prefs) => unlockKey(prefs, key));
        break;
      case 'restore':
        updatePrefs((prefs) => restoreKey(prefs, key));
        break;
      case 'reset':
        updatePrefs((prefs) => ({ ...EMPTY_PREFS, goals: prefs.goals }));
        break;
      case 'cut':
        cutOne(key);
        break;
      case 'start-list':
        if (!busy) startFromList(Number(button.dataset.list));
        break;
      case 'preview':
        if (Number.isInteger(idx)) preview(idx, button);
        break;
      default:
        break;
    }
  });

  panelEl.addEventListener(
    'toggle',
    (event) => {
      const fold = event.target?.dataset?.fold;
      if (!fold) return;
      if (event.target.open) openFolds.add(fold);
      else openFolds.delete(fold);
    },
    true
  );

  return {
    /** The editor moved to another deck or replaced its cards: in-flight results are stale. */
    invalidate: () => {
      generation += 1;
    },
    show: () => {
      visible = true;
      panelEl.hidden = false;
      if (index) renderNow();
      else ensureLoaded();
    },
    hide: () => {
      visible = false;
      panelEl.hidden = true;
      clearTimeout(timer);
    },
    /** The deck or the loaded deck changed: recompute (debounced) when the tab is showing. */
    refresh: () => {
      if (visible && index) schedule();
    },
  };
};
