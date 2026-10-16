// Design 074 D3 "Overlays in scene" / O6: where each in-card overlay plane sits.
// Card units: the card spans u ∈ [-0.5, 0.5] across its width and v ∈ [-0.5, 0.5] up its
// height (v up). Every anchor is the overlay's CENTRE. Sizes are in card WIDTHS, because
// apply-view.js sizes overlays from the card's px width; `aspect` (height / width) converts
// a width-based length into v. The px math reproduced is apply-view.js positionOverlay /
// reconcileDamageOverlay / reconcileSpecialConditionOverlay / reconcileAbilityOverlay.

import { listConditions, ROTATION_CONDITIONS } from '../../../../shared/engine/rules/special-conditions.mjs';
import { getDamageCounterTier } from '../counters/damage-counter-style.mjs';
import {
  ENERGY_TOKEN_BOTTOM,
  planEnergyTokenRow,
} from '../../actions/move-card-bundle/energy-token-row.mjs';

// TCG Live card mesh, design 074 O5: 6.397 × 8.9.
export const CARD_ASPECT = 8.9 / 6.397;

// Counters and markers are a third of the card width, their top a quarter down the card.
const OVERLAY_SIZE = 1 / 3;
const OVERLAY_TOP = 0.25;
const COUNTER_LEFT = 1 / 1.5;
const ABILITY_TAB_HEIGHT = 1 / 5;

const aspectOf = (aspect) => (Number.isFinite(aspect) && aspect > 0 ? aspect : CARD_ASPECT);

/** Centre of a square overlay whose top-left sits `left` widths right of and `top` heights below the top-left corner. */
function squareCentre(left, top, size, aspect) {
  return [-0.5 + left + size / 2, 0.5 - top - size / aspect / 2];
}

const damageOf = (card) => {
  const damage = Number.parseInt(String(card?.damage ?? 0), 10);
  return Number.isFinite(damage) && damage > 0 ? damage : 0;
};

const conditionsOf = (card) => (Array.isArray(card?.conditions) ? card.conditions : listConditions(card));

/**
 * The damage counter on a card's upper right.
 * @param {object} card a Placement or a view card (reads `damage`, `face`)
 * @param {{ aspect?: number }} [options]
 * @returns {{ tier:string, digits:string, anchor:[number, number], size:number }|null}
 */
export function counterPlan(card, { aspect } = {}) {
  if (card?.face === 'back') return null;
  const damage = damageOf(card);
  if (damage === 0) return null;
  return {
    tier: getDamageCounterTier(damage),
    digits: String(damage),
    anchor: squareCentre(COUNTER_LEFT, OVERLAY_TOP, OVERLAY_SIZE, aspectOf(aspect)),
    size: OVERLAY_SIZE,
  };
}

/**
 * Condition markers down the card's left edge (rotation condition, then Poison, then Burn,
 * one marker height apart) and the ability-used tab across the card's middle.
 * @param {object} card a Placement (`conditions`, `abilityUsed`) or a view card
 * @param {{ aspect?: number }} [options]
 * @returns {{ poison:[number, number]|null, burn:[number, number]|null,
 *   conditionLabel:{ text:string, anchor:[number, number] }|null, abilityTab:[number, number]|null,
 *   markerSize:number, abilityTabSize:[number, number] }}
 */
export function markerPlan(card, { aspect } = {}) {
  const ratio = aspectOf(aspect);
  const plan = {
    poison: null,
    burn: null,
    conditionLabel: null,
    abilityTab: null,
    markerSize: OVERLAY_SIZE,
    abilityTabSize: [1, ABILITY_TAB_HEIGHT],
  };
  if (card?.face === 'back') return plan;

  const held = conditionsOf(card);
  const ordered = [
    ...held.filter((c) => ROTATION_CONDITIONS.includes(c)),
    ...held.filter((c) => !ROTATION_CONDITIONS.includes(c)),
  ];
  ordered.forEach((condition, position) => {
    const top = OVERLAY_TOP + (position * OVERLAY_SIZE) / ratio;
    const anchor = squareCentre(0, top, OVERLAY_SIZE, ratio);
    if (condition === 'Poisoned') plan.poison = anchor;
    else if (condition === 'Burned') plan.burn = anchor;
    else plan.conditionLabel = { text: condition, anchor };
  });

  if (card?.abilityUsed) plan.abilityTab = [0, -ABILITY_TAB_HEIGHT / ratio / 2];
  return plan;
}

export const COUNT_LABEL_ZONES = ['deck', 'discard', 'lostZone', 'prizes'];
// Legacy `#deckText` sits centred just above its pile (self-containers.css).
const COUNT_LABEL_GAP = 0.08;

/**
 * The "(N)" count beside a pile, centred just above it in the pile card's units.
 * @param {'deck'|'discard'|'lostZone'|'prizes'} zone
 * @param {number} count
 * @returns {{ text:string, anchor:[number, number] }|null} null for a zone with no label
 */
export function countLabelPlan(zone, count) {
  if (!COUNT_LABEL_ZONES.includes(zone)) return null;
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return { text: `(${n})`, anchor: [0, 0.5 + COUNT_LABEL_GAP] };
}

/**
 * The attached-Energy token row along the visible card's bottom edge (planEnergyTokenRow).
 * @param {(string|{ src?: string })[]} tokens one per token in attach order; equal keys = same type
 * @param {number} cardW the card's width in the caller's units (px in the scene)
 * @param {{ aspect?: number }} [options]
 * @returns {{ tokenSize:number, tokens:{ anchor:[number, number], zIndex:number }[],
 *   badges:{ anchor:[number, number], label:string, fontSize:number, zIndex:number }[] }}
 *   `tokenSize`/`fontSize` in card widths; a badge anchor is its left-bottom corner.
 */
export function energyRowPlan(tokens, cardW, { aspect } = {}) {
  const ratio = aspectOf(aspect);
  const width = Number.isFinite(cardW) && cardW > 0 ? cardW : 0;
  const keys = (Array.isArray(tokens) ? tokens : []).map((token) =>
    typeof token === 'string' ? token : String(token?.src ?? '')
  );
  if (width === 0 || keys.length === 0) return { tokenSize: 0, tokens: [], badges: [] };

  const plan = planEnergyTokenRow(keys, width);
  const size = plan.tokenSize / width;
  const bottom = -0.5 + ENERGY_TOKEN_BOTTOM;
  return {
    tokenSize: size,
    tokens: plan.tokens.map((token) => ({
      anchor: [-0.5 + token.left / width + size / 2, bottom + size / ratio / 2],
      zIndex: token.zIndex,
    })),
    badges: plan.badges.map((badge) => ({
      anchor: [-0.5 + badge.left / width, bottom],
      label: badge.label,
      fontSize: badge.fontSize / width,
      zIndex: badge.zIndex,
    })),
  };
}
