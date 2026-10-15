// The Suggest tab's engine (design 069): find the tournament lists that contain the most of your deck
// (weighted by your steering), then report what those lists play that you don't, and the reverse.
// Pure: takes the builder's deck shape and an index from dataset.mjs `indexDataset`.
import { nameKey } from './dataset.mjs';
import { BUDGET_GOAL, BUDGET_MAX_USD } from './goals.mjs';
import { normalizeSuggestPrefs } from './prefs.mjs';

export const CORE_INCLUSION = 0.75;
export const TECH_INCLUSION = 0.2;
export const CUT_INCLUSION = 0.1;
export const GOAL_LIMIT = 12;
const DISMISS_PENALTY = 0.6;
const LOCKED_ALPHA = 2;
// A handful of copies (one Ultra Ball, a stack of Basic Energy) matches half the meta; "high"
// confidence needs at least this many non-Energy copies the data knows.
export const MIN_CORE_COPIES = 6;
const ACCEPTED_ALPHA = 1.5;
const MIN_GLOBAL_FOR_GOAL = 0.005;
// Pokémon belong to archetypes: one your similar lists never play only counts as a goal pick when
// it is a widely played support Pokémon (Fezandipiti ex-style), not another deck's attacker line.
const MIN_GLOBAL_FOR_OFF_ARCHETYPE_POKEMON = 0.1;
const BUDGET_MIN_INCLUSION = 0.1;

const sameNames = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  const left = [...a].map(nameKey).sort();
  const right = [...b].map(nameKey).sort();
  return left.every((name, i) => name === right[i]);
};

/** A deck card record → dataset card index, or null (design 069 Option 4). */
export function resolveDeckCard(data, index) {
  const byPrint = index.dataset.printIndex[data?.id];
  if (Number.isInteger(byPrint)) return byPrint;
  const candidates = index.byName.get(nameKey(data?.name)) || [];
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const abilities = Array.isArray(data?.abilities) ? data.abilities : [];
  const sameAbilities = candidates.filter((idx) => sameNames(index.dataset.cards[idx].abilities || [], abilities));
  const pool = sameAbilities.length ? sameAbilities : candidates;
  return pool.reduce((best, idx) => (index.globalInclusion[idx] > index.globalInclusion[best] ? idx : best));
}

/** Steering key for a deck-count key: the dataset card's key, or the `x:` key itself. */
export function prefKeyOf(countKey, index) {
  return typeof countKey === 'number' ? index.dataset.cards[countKey].key : countKey;
}

/**
 * Builder deck → counts per dataset card (number keys) or `x:<name>` for cards the dataset lacks.
 * `labels` maps every key to a display name; `unresolved` lists the `x:` names.
 */
export function deckToCounts(deck, index) {
  const counts = new Map();
  const labels = new Map();
  for (const group of Object.values(deck || {})) {
    for (const variant of group?.cards || []) {
      const count = Number(variant?.count) || 0;
      if (count < 1) continue;
      const idx = resolveDeckCard(variant.data, index);
      const key = idx === null ? `x:${nameKey(variant.data?.name)}` : idx;
      counts.set(key, (counts.get(key) || 0) + count);
      if (!labels.has(key)) labels.set(key, idx === null ? variant.data?.name || '?' : index.dataset.cards[idx].name);
    }
  }
  const unresolved = [...labels.entries()].filter(([key]) => typeof key === 'string').map(([, name]) => name);
  return { counts, labels, unresolved };
}

/**
 * Lists most like the deck. Similarity = weighted containment (how much of your deck, by copies, the
 * list also plays; locked ×2, accepted ×1.5). Weight = similarity² × placement × recency × 0.6 per
 * dismissed card the list plays.
 */
export function findNeighbors(
  counts,
  index,
  { prefs, k = 50, minSimilarity = 0.5, minNeighbors = 10, minCoreCopies = MIN_CORE_COPIES } = {}
) {
  const steering = normalizeSuggestPrefs(prefs);
  const locked = new Set(steering.locked);
  const accepted = new Set(steering.accepted);
  // A dismissed card you play anyway is not a reason to distrust the lists that play it.
  const dismissedIdx = steering.dismissed
    .map((key) => index.keyIndex.get(key))
    .filter((idx) => idx !== undefined && !counts.has(idx));

  let denominator = 0;
  let coreCopies = 0;
  const yours = [];
  for (const [countKey, count] of counts) {
    const prefKey = prefKeyOf(countKey, index);
    const alpha = locked.has(prefKey) ? LOCKED_ALPHA : accepted.has(prefKey) ? ACCEPTED_ALPHA : 1;
    denominator += alpha * count;
    if (typeof countKey === 'number') {
      yours.push([countKey, count, alpha]);
      if (index.dataset.cards[countKey].kind !== 'energy') coreCopies += count;
    }
  }
  if (denominator === 0) return { neighbors: [], confidence: 'none', reason: 'empty' };

  const scored = [];
  index.listCounts.forEach((listCounts, listIdx) => {
    let shared = 0;
    for (const [idx, count, alpha] of yours) {
      const theirs = listCounts.get(idx);
      if (theirs) shared += alpha * Math.min(count, theirs);
    }
    if (shared > 0) scored.push({ listIdx, similarity: shared / denominator });
  });
  if (!scored.length) return { neighbors: [], confidence: 'none', reason: 'no-match' };

  scored.sort((a, b) => b.similarity - a.similarity || index.listWeights[b.listIdx] - index.listWeights[a.listIdx]);
  const eligible = scored.filter((entry) => entry.similarity >= minSimilarity);
  const confident = eligible.length >= minNeighbors && coreCopies >= minCoreCopies;
  const chosen = confident
    ? eligible.slice(0, k)
    : eligible.length >= minNeighbors
      ? eligible.slice(0, k)
      : scored.slice(0, minNeighbors);

  const neighbors = chosen.map(({ listIdx, similarity }) => {
    const listCounts = index.listCounts[listIdx];
    const dismissedPlayed = dismissedIdx.filter((idx) => listCounts.has(idx)).length;
    const weight = similarity ** 2 * index.listWeights[listIdx] * DISMISS_PENALTY ** dismissedPlayed;
    return { listIdx, similarity, weight };
  });
  return { neighbors, confidence: confident ? 'high' : 'low', reason: null };
}

/** Weighted median of [count, weight] samples; an exact 50/50 split takes the higher count. */
export function weightedMedian(samples) {
  const sorted = [...samples].sort((a, b) => a[0] - b[0]);
  const half = sorted.reduce((sum, [, weight]) => sum + weight, 0) / 2;
  let running = 0;
  for (const [count, weight] of sorted) {
    running += weight;
    if (running > half + 1e-9) return count;
  }
  return sorted.at(-1)?.[0] ?? 0;
}

const byInclusionThenName = (a, b) => b.inclusion - a.inclusion || a.name.localeCompare(b.name);

/**
 * Everything the Suggest tab shows for one deck.
 * Item = { key, idx, name, print, kind, inclusion, typicalCount, yourCount, price, tags, locked }.
 */
export function suggestCards(deck, index, { prefs, ...neighborOptions } = {}) {
  const steering = normalizeSuggestPrefs(prefs);
  const dismissed = new Set(steering.dismissed);
  const locked = new Set(steering.locked);
  const { counts, labels, unresolved } = deckToCounts(deck, index);
  const { neighbors, confidence, reason } = findNeighbors(counts, index, { ...neighborOptions, prefs: steering });
  const cards = index.dataset.cards;

  const inclusionWeight = new Map();
  const samples = new Map();
  let totalWeight = 0;
  for (const { listIdx, weight } of neighbors) {
    totalWeight += weight;
    for (const [idx, count] of index.listCounts[listIdx]) {
      inclusionWeight.set(idx, (inclusionWeight.get(idx) || 0) + weight);
      if (!samples.has(idx)) samples.set(idx, []);
      samples.get(idx).push([count, weight]);
    }
  }
  const inclusionOf = (idx) => (totalWeight > 0 ? (inclusionWeight.get(idx) || 0) / totalWeight : 0);

  const itemFor = (countKey) => {
    const isCard = typeof countKey === 'number';
    const card = isCard ? cards[countKey] : null;
    const key = prefKeyOf(countKey, index);
    return {
      key,
      idx: isCard ? countKey : null,
      name: card ? card.name : labels.get(countKey),
      print: card ? card.print : null,
      kind: card ? card.kind : null,
      inclusion: isCard ? inclusionOf(countKey) : 0,
      typicalCount: isCard && samples.has(countKey) ? weightedMedian(samples.get(countKey)) : 0,
      yourCount: counts.get(countKey) || 0,
      price: card && Number.isFinite(card.price) ? card.price : null,
      tags: card?.tags || [],
      locked: locked.has(key),
    };
  };

  const candidates = new Set([...inclusionWeight.keys(), ...counts.keys()]);
  const items = [...candidates].map(itemFor);
  const missingCore = [];
  const countTweaks = [];
  const techs = [];
  const cuts = [];
  for (const item of items) {
    const isDismissed = dismissed.has(item.key);
    if (item.yourCount === 0) {
      if (isDismissed) continue;
      if (item.inclusion >= CORE_INCLUSION) missingCore.push(item);
      else if (item.inclusion >= TECH_INCLUSION) techs.push(item);
    } else if (item.inclusion >= CORE_INCLUSION) {
      // A locked card means "keep my count": no tweak offered.
      if (Math.abs(item.typicalCount - item.yourCount) >= 1 && !item.locked) {
        countTweaks.push({ ...item, direction: item.typicalCount > item.yourCount ? 'up' : 'down' });
      }
    } else if (item.inclusion < CUT_INCLUSION && !item.locked && neighbors.length) {
      cuts.push(item);
    }
  }

  const goals = {};
  for (const goal of steering.goals) goals[goal] = goalPicks(goal, items, index, counts, dismissed);

  const archetypeWeight = new Map();
  for (const { listIdx, weight } of neighbors) {
    const archetype = index.dataset.lists[listIdx].a;
    if (archetype >= 0) archetypeWeight.set(archetype, (archetypeWeight.get(archetype) || 0) + weight);
  }
  const [topArchetype] = [...archetypeWeight.entries()].sort((a, b) => b[1] - a[1]);

  let deckPrice = null;
  for (const [countKey, count] of counts) {
    const price = typeof countKey === 'number' ? cards[countKey].price : null;
    if (Number.isFinite(price)) deckPrice = (deckPrice || 0) + price * count;
  }

  return {
    confidence,
    reason,
    archetype: topArchetype
      ? { name: index.dataset.archetypes[topArchetype[0]].name, share: topArchetype[1] / totalWeight }
      : null,
    neighbors: neighbors.length,
    bestSimilarity: neighbors.reduce((best, entry) => Math.max(best, entry.similarity), 0),
    missingCore: missingCore.sort(byInclusionThenName),
    countTweaks: countTweaks.sort(byInclusionThenName),
    techs: techs.sort(byInclusionThenName),
    cuts: cuts.sort((a, b) => a.inclusion - b.inclusion || a.name.localeCompare(b.name)),
    goals,
    deckPrice: deckPrice === null ? null : Math.round(deckPrice * 100) / 100,
    deckKeys: [...counts.keys()].map((countKey) => ({
      key: prefKeyOf(countKey, index),
      name: labels.get(countKey),
      count: counts.get(countKey),
      locked: locked.has(prefKeyOf(countKey, index)),
    })),
    unresolved,
  };
}

/**
 * Picks for one goal. Tag goals: cards tagged with it that you don't play, scored
 * 0.7 × inclusion in your similar lists + 0.3 × meta-wide inclusion. Budget: cards at most
 * BUDGET_MAX_USD that ≥ 10% of your similar lists play.
 */
function goalPicks(goal, items, index, counts, dismissed) {
  const seen = new Set(items.filter((item) => item.idx !== null).map((item) => item.idx));
  const pool = [...items];
  if (goal !== BUDGET_GOAL) {
    index.dataset.cards.forEach((card, idx) => {
      if (!seen.has(idx) && (card.tags || []).includes(goal)) {
        pool.push({
          key: card.key,
          idx,
          name: card.name,
          print: card.print,
          kind: card.kind,
          inclusion: 0,
          typicalCount: 0,
          yourCount: counts.get(idx) || 0,
          price: Number.isFinite(card.price) ? card.price : null,
          tags: card.tags || [],
          locked: false,
        });
      }
    });
  }
  const open = pool.filter((item) => item.idx !== null && item.yourCount === 0 && !dismissed.has(item.key));
  if (goal === BUDGET_GOAL) {
    return open
      .filter((item) => item.price !== null && item.price <= BUDGET_MAX_USD && item.inclusion >= BUDGET_MIN_INCLUSION)
      .sort(byInclusionThenName)
      .slice(0, GOAL_LIMIT);
  }
  return open
    .filter((item) => item.tags.includes(goal))
    .map((item) => ({ ...item, metaInclusion: index.globalInclusion[item.idx], score: 0 }))
    .filter((item) => {
      if (item.inclusion > 0) return true;
      const floor = item.kind === 'pokemon' ? MIN_GLOBAL_FOR_OFF_ARCHETYPE_POKEMON : MIN_GLOBAL_FOR_GOAL;
      return item.metaInclusion >= floor;
    })
    .map((item) => ({ ...item, score: 0.7 * item.inclusion + 0.3 * item.metaInclusion }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, GOAL_LIMIT);
}

/** Meta overview for an empty deck: archetypes by weighted share, each with its best list. */
export function metaOverview(index, limit = 12) {
  const byArchetype = new Map();
  let total = 0;
  index.dataset.lists.forEach((list, listIdx) => {
    const weight = index.listWeights[listIdx];
    total += weight;
    if (list.a < 0) return;
    if (!byArchetype.has(list.a)) byArchetype.set(list.a, { weight: 0, lists: 0, bestListIdx: listIdx });
    const entry = byArchetype.get(list.a);
    entry.weight += weight;
    entry.lists += 1;
    const best = index.dataset.lists[entry.bestListIdx];
    const bestWeight = index.listWeights[entry.bestListIdx];
    if (weight > bestWeight || (weight === bestWeight && list.p < best.p)) entry.bestListIdx = listIdx;
  });
  return [...byArchetype.entries()]
    .map(([archetype, entry]) => ({
      archetype: index.dataset.archetypes[archetype].name,
      share: total > 0 ? entry.weight / total : 0,
      lists: entry.lists,
      bestListIdx: entry.bestListIdx,
    }))
    .sort((a, b) => b.share - a.share || a.archetype.localeCompare(b.archetype))
    .slice(0, limit);
}

/** One-line description of a list for the meta view: "1st · Regional Louisville, KY · 2026-10-10". */
export function describeList(index, listIdx) {
  const list = index.dataset.lists[listIdx];
  const event = index.dataset.events[list.e];
  const suffix = [11, 12, 13].includes(list.p % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][list.p % 10] || 'th';
  return `${list.p}${suffix} · ${event.name} · ${event.date}`;
}

/** The deck card (its `data`) that a steering key stands for, for Cut buttons; null when absent. */
export function findDeckCardForKey(deck, index, key) {
  for (const group of Object.values(deck || {})) {
    for (const variant of group?.cards || []) {
      if (!(Number(variant?.count) > 0)) continue;
      const idx = resolveDeckCard(variant.data, index);
      const variantKey = idx === null ? `x:${nameKey(variant.data?.name)}` : index.dataset.cards[idx].key;
      if (variantKey === key) return variant.data;
    }
  }
  return null;
}
