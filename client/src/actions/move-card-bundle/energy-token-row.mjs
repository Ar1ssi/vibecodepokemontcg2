/* The row of attached-Energy tokens along a Pokémon's bottom edge, shared by the
   legacy attach path (attach-card.js) and the authoritative renderer (apply-view.js).
   Up to ENERGY_TOKEN_ROW_MAX tokens sit side by side; past that the row would run
   off the card, so tokens of one type pile onto a single spot with an "Nx" count
   badge after it, and the next type's token follows the badge. */

// Token geometry, as fractions of the card the tokens sit on.
export const ENERGY_TOKEN_SIZE = 0.24;
export const ENERGY_TOKEN_SPACING = 1.15;
export const ENERGY_TOKEN_BOTTOM = 0.03;
export const ENERGY_TOKEN_ROW_MAX = 4;

// Badge geometry, as fractions of the token size.
const BADGE_FONT = 0.5;
const BADGE_GAP_BEFORE = 0.06;
const BADGE_GAP_AFTER = 0.15;
// Rough advance of one bold digit/"x" and the pill's side padding, in em
// (energy-token.css): only places the next token, so a near guess is enough.
const BADGE_CHAR_EM = 0.62;
const BADGE_PADDING_EM = 0.5;

export const ENERGY_COUNT_BADGE_CLASS = 'energy-token-count';

/**
 * Where each token and count badge goes, in px from the card's left edge.
 * Tokens keep their attach order in `zIndex`, so the newest token of a pile is
 * the one on top (and the one a drag picks up). A row wider than the card is
 * squeezed to fit rather than left hanging off its edge.
 *
 * @param {string[]} keys one per token in attach order; equal keys are the same type
 * @param {number} cardWidth px
 * @returns {{ tokenSize: number, tokens: { left: number, zIndex: number }[],
 *   badges: { left: number, label: string, fontSize: number, zIndex: number }[] }}
 */
export function planEnergyTokenRow(keys, cardWidth) {
  const width = Number.isFinite(cardWidth) && cardWidth > 0 ? cardWidth : 0;
  const tokenSize = width * ENERGY_TOKEN_SIZE;
  const pitch = tokenSize * ENERGY_TOKEN_SPACING;
  const list = Array.isArray(keys) ? keys : [];
  const tokens = list.map((_, i) => ({ left: i * pitch, zIndex: 100 + i + 1 }));
  const badges = [];
  if (list.length <= ENERGY_TOKEN_ROW_MAX) {
    return fitToCard({ tokenSize, tokens, badges }, rowEnd(tokens, badges, tokenSize), width);
  }

  const fontSize = tokenSize * BADGE_FONT;
  let cursor = 0;
  for (const members of groupIndices(list)) {
    for (const index of members) tokens[index].left = cursor;
    if (members.length === 1) {
      cursor += pitch;
      continue;
    }
    const label = `${members.length}x`;
    const badgeLeft = cursor + tokenSize * (1 + BADGE_GAP_BEFORE);
    badges.push({ left: badgeLeft, label, fontSize, zIndex: 100 + list.length + 1 });
    cursor = badgeLeft + badgeWidth(label, fontSize) + tokenSize * BADGE_GAP_AFTER;
  }
  return fitToCard({ tokenSize, tokens, badges }, rowEnd(tokens, badges, tokenSize), width);
}

/** Token indices grouped by key, groups in order of first appearance. */
function groupIndices(keys) {
  const groups = new Map();
  keys.forEach((key, index) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  return [...groups.values()];
}

function badgeWidth(label, fontSize) {
  return (label.length * BADGE_CHAR_EM + BADGE_PADDING_EM) * fontSize;
}

/** The item that reaches furthest right: its left offset and width. */
function rowEnd(tokens, badges, tokenSize) {
  const items = [
    ...tokens.map((token) => ({ left: token.left, width: tokenSize })),
    ...badges.map((badge) => ({
      left: badge.left,
      width: badgeWidth(badge.label, badge.fontSize),
    })),
  ];
  let end = { left: 0, width: 0 };
  for (const item of items)
    if (item.left + item.width > end.left + end.width) end = item;
  return end;
}

/** Offsets shrink (sizes don't) until that last item ends at the card's edge. */
function fitToCard(plan, end, cardWidth) {
  if (!cardWidth || end.left <= 0 || end.left + end.width <= cardWidth) return plan;
  const scale = Math.max(0, cardWidth - end.width) / end.left;
  for (const token of plan.tokens) token.left *= scale;
  for (const badge of plan.badges) badge.left *= scale;
  return plan;
}

/**
 * Replaces the count badges `owner` drew last time with `badges`, inside
 * `parent` (the Pokémon's `.play-container`). The badges are stored on `owner`
 * so the next layout can find and drop them wherever they ended up.
 *
 * @param {object} owner the Pokémon's <img> (legacy) or registry record (apply-view)
 * @param {object|null} parent element the tokens are positioned in
 * @param {{ left: number, label: string, fontSize: number, zIndex: number }[]} badges
 * @param {number} bottom px, the tokens' bottom offset
 */
export function renderEnergyCountBadges(owner, parent, badges, bottom) {
  if (!owner) return;
  for (const old of owner.energyCountBadges || []) old.parentNode?.removeChild(old);
  owner.energyCountBadges = [];
  const doc = parent?.ownerDocument;
  if (!badges.length || typeof doc?.createElement !== 'function') return;
  for (const badge of badges) {
    const element = doc.createElement('span');
    element.className = ENERGY_COUNT_BADGE_CLASS;
    element.textContent = badge.label;
    element.style.left = `${badge.left}px`;
    element.style.bottom = `${bottom}px`;
    element.style.fontSize = `${badge.fontSize}px`;
    element.style.zIndex = String(badge.zIndex);
    parent.appendChild(element);
    owner.energyCountBadges.push(element);
  }
}

/** Legacy resize (resizer.js adjustCards) scales px offsets in place; badges follow. */
export function scaleEnergyCountBadges(owner, ratio) {
  if (!Number.isFinite(ratio)) return;
  for (const badge of owner?.energyCountBadges || []) {
    for (const key of ['left', 'bottom', 'fontSize']) {
      const value = parseFloat(badge.style[key]);
      if (Number.isFinite(value)) badge.style[key] = `${value * ratio}px`;
    }
  }
}

let attachSequence = 0;

/** Legacy path: records when a token was attached, the row's left-to-right order. */
export function stampEnergyAttachOrder(img) {
  attachSequence += 1;
  img.energyAttachSeq = attachSequence;
}

/**
 * Legacy path: re-lays out every token attached to `targetImage` from the DOM.
 * Tokens are found by their `relative` back-pointer (attach-card.js) and kept
 * in attach order.
 *
 * @param {HTMLImageElement} targetImage the Pokémon the tokens sit on
 * @param {{ exclude?: object }} [options] a token that is leaving right now
 */
export function relayoutLegacyEnergyTokens(targetImage, { exclude = null } = {}) {
  const doc = targetImage?.ownerDocument;
  if (typeof doc?.querySelectorAll !== 'function') return;
  const all = [...doc.querySelectorAll('img.energy-token-3d')];
  const tokens = all
    .filter((img) => img.relative === targetImage && img !== exclude)
    .sort((a, b) => (a.energyAttachSeq || 0) - (b.energyAttachSeq || 0));

  const cardWidth = targetImage.clientWidth;
  const bottom = targetImage.clientHeight * ENERGY_TOKEN_BOTTOM;
  const plan = planEnergyTokenRow(
    tokens.map((img) => img.getAttribute('src')),
    cardWidth
  );
  tokens.forEach((img, i) => {
    img.style.width = `${plan.tokenSize}px`;
    img.style.height = `${plan.tokenSize}px`;
    img.style.left = `${plan.tokens[i].left}px`;
    img.style.bottom = `${bottom}px`;
    img.style.zIndex = String(plan.tokens[i].zIndex);
  });
  renderEnergyCountBadges(targetImage, tokens[0]?.parentNode || null, plan.badges, bottom);
}
