// Strings the Suggest tab shows (design 069). Pure, so the wording is tested without a DOM.
import { goalLabel } from './goals.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatPercent(fraction) {
  if (!Number.isFinite(fraction) || fraction <= 0) return '0%';
  if (fraction < 0.01) return '<1%';
  return `${Math.round(fraction * 100)}%`;
}

export function formatUsd(value) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : '';
}

/** "Apr 2026 – Oct 2026" from the dataset window. */
export function windowLabel(dataset) {
  const label = (date) => {
    const match = /^(\d{4})-(\d{2})/.exec(date || '');
    return match ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : '';
  };
  const from = label(dataset?.window?.from);
  const to = label(dataset?.window?.to);
  if (!from || !to) return from || to;
  return from === to ? from : `${from} – ${to}`;
}

/** The grey line under a suggestion's name; `bucket` is the section it sits in. */
export function evidenceLine(item, bucket) {
  const usually = item.typicalCount > 0 ? ` · usually ${item.typicalCount}` : '';
  switch (bucket) {
    case 'countTweaks':
      return `You play ${item.yourCount} · similar lists usually play ${item.typicalCount} (${formatPercent(item.inclusion)} play it)`;
    case 'cuts':
      return item.idx === null
        ? 'Not in any tournament list in the data'
        : `In ${formatPercent(item.inclusion)} of similar lists`;
    case 'budget':
      return `${formatUsd(item.price)} · in ${formatPercent(item.inclusion)} of similar lists${usually}`;
    case 'goal':
      return item.inclusion > 0
        ? `In ${formatPercent(item.inclusion)} of similar lists${usually} · ${formatPercent(item.metaInclusion)} of all lists`
        : `Rare in lists like yours · ${formatPercent(item.metaInclusion)} of all lists`;
    default:
      return `In ${formatPercent(item.inclusion)} of similar lists${usually}`;
  }
}

/** Badges for a row: the goals this card serves, minus the section's own goal. */
export function tagBadges(item, ownGoal = null) {
  return (item.tags || []).filter((tag) => tag !== ownGoal).map(goalLabel);
}

/** "TCGdex image base" → the small render the row shows; null when the dataset has none. */
export function thumbnailUrl(image) {
  return image ? `${image}/low.webp` : null;
}

export function previewUrl(image) {
  return image ? `${image}/high.webp` : null;
}

/** Header sentence for a suggestion result. */
export function headerText(result) {
  const lists = `${result.neighbors} similar list${result.neighbors === 1 ? '' : 's'}`;
  if (!result.archetype) return lists;
  return `Looks like ${result.archetype.name} (${formatPercent(result.archetype.share)}) · ${lists}`;
}

export function lowConfidenceText(result) {
  return `Nothing in the data is very close to this deck — the best lists share ${formatPercent(
    result.bestSimilarity
  )} of it. Treat these as loose ideas.`;
}

export function datasetFooter(dataset) {
  const lists = dataset.lists.length.toLocaleString('en-US');
  const updated = String(dataset.generatedAt || '').slice(0, 10);
  const events = dataset.events.length;
  return `Tournament data: Limitless TCG · ${lists} Masters lists from ${events} Standard event${events === 1 ? '' : 's'} · updated ${updated}`;
}
