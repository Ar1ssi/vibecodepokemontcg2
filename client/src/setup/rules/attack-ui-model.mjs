/**
 * @file TCG Live attack UI (design 074) — the pure half.
 *
 * Ports of the game's own decisions, each named after the decompiled method it follows
 * (E:/TCGLive_Extract/Code/TPCI.RainierClient): which energy icons a cost lights, what the damage tab
 * reads and how it is tinted, which effects the HUD's Buff / Debuff buttons list, and where a tap
 * on an in-play Pokémon goes. No DOM, no state: the renderers in card-inspector.mjs, card-focus.mjs,
 * stack-view.mjs and status-popup.mjs read these.
 */

import { normalizeEnergyType } from '../../actions/move-card-bundle/energy-token-assets.mjs';
import { isInspectablePokemon } from './card-inspector-model.mjs';
import { expandEnergyEntries } from '../../../../shared/engine/rules/attack-engine.mjs';
import { liveAttackMarkers } from '../../../../shared/engine/rules/attack-markers.mjs';
import { listConditions } from '../../../../shared/engine/rules/special-conditions.mjs';
import { isPokemonToolCard } from '../../../../shared/engine/rules/ability-executors.mjs';

// AttackOption.weaknessColor / resistanceColor (AttackActionOption_L prefab).
export const WEAKNESS_INK = '#0e800e';
export const RESISTANCE_INK = '#e61717';

const TYPED = [
  'grass',
  'fire',
  'water',
  'lightning',
  'psychic',
  'fighting',
  'darkness',
  'metal',
  'fairy',
  'dragon',
];

const typeKey = (raw) => {
  const key = normalizeEnergyType(raw);
  if (key === 'steel') return 'metal';
  return key === 'colorless' || TYPED.includes(key) ? key : null;
};

/**
 * The attached Energy as TCG Live's `GetAttachedEnergyList` sees it: one list per Energy card unit,
 * holding every type that unit can pay. A Prism/Stellar wildcard can pay any type; a Holon Research
 * Tower dual unit ("A|B") either of two.
 *
 * @param {Array<string|{type,family,provides?}>} energyTypes the inspector context's attached entries
 * @returns {string[][]}
 */
export function attachedEnergyUnits(energyTypes = []) {
  return expandEnergyEntries(energyTypes)
    .map((token) => {
      if (token === 'Wildcard') return [...TYPED];
      return String(token)
        .split('|')
        .map(typeKey)
        .filter(Boolean);
    })
    .filter((unit) => unit.length > 0);
}

/**
 * EnergyFulfillmentHelper.CalculateSatisfiedEnergy_Greedy. The cost is grouped by type in order of
 * first appearance (ConvertCostStringToList builds a Dictionary), typed slots fill from single-type
 * units first, then from multi-type units, and whatever is left (surplus typed Energy, unmatched
 * types, unused multi-type units) pays Colorless. An empty cost is one filled `empty` icon
 * (EnergyCostDisplay.Setup).
 *
 * @param {string[]} cost printed cost symbols ('Fire', 'Colorless', …)
 * @param {string[][]} attached `attachedEnergyUnits` output
 * @returns {{ type: string, filled: boolean }[]}
 */
export function costFulfillment(cost = [], attached = []) {
  const groups = [];
  for (const symbol of cost) {
    const type = typeKey(symbol) ?? 'colorless';
    const group = groups.find((g) => g.type === type);
    if (group) group.needed += 1;
    else groups.push({ type, needed: 1, filled: 0 });
  }
  if (groups.length === 0) return [{ type: 'empty', filled: true }];

  const singles = new Map();
  const multis = [];
  for (const unit of attached) {
    if (unit.length === 1) singles.set(unit[0], (singles.get(unit[0]) ?? 0) + 1);
    else multis.push(unit);
  }

  let spare = singles.get('colorless') ?? 0;
  const costed = new Set(['colorless']);
  for (const group of groups) {
    if (group.type === 'colorless') continue;
    costed.add(group.type);
    const have = singles.get(group.type) ?? 0;
    group.filled = Math.min(group.needed, have);
    if (have > group.needed) spare += have - group.needed;
  }
  for (const [type, count] of singles) if (!costed.has(type)) spare += count;

  for (const group of groups) {
    if (group.type === 'colorless') continue;
    while (group.filled < group.needed) {
      const index = multis.findIndex((unit) => unit.includes(group.type));
      if (index < 0) break;
      group.filled += 1;
      multis.splice(index, 1);
    }
  }
  spare += multis.length;

  const colorless = groups.find((g) => g.type === 'colorless');
  if (colorless && spare > 0) colorless.filled = Math.min(spare, colorless.needed);

  return groups.flatMap((group) =>
    Array.from({ length: group.needed }, (_, i) => ({ type: group.type, filled: i < group.filled }))
  );
}

/**
 * The game's per-attack outcome (`actionOutcomes`) built from the shared engine's
 * `computeAttackDamage` breakdown. A bonus or reduction is whatever moved the final number off
 * `base × Weakness + flat − Resistance`.
 *
 * @param {object} breakdown computeAttackDamage result
 * @param {{ unmodifiedBase: number }} options the attack's own damage (text scaling applied)
 */
export function damageOutcome(breakdown, { unmodifiedBase }) {
  if (!breakdown) return null;
  const multiplier = Number(breakdown.multiplier) || 1;
  const flat = Number(breakdown.flat) || 0;
  const resistance = Number(breakdown.resistance) || 0;
  const total = Math.max(0, Number(breakdown.total) || 0);
  const expected = Math.max(0, unmodifiedBase * multiplier + flat - resistance);
  const blocked = Boolean(breakdown.prevented);
  return {
    finalMin: total,
    finalMax: total,
    unmodifiedBase,
    hitWeakness: multiplier > 1 || flat > 0,
    weaknessAmount: multiplier,
    hitResistance: resistance > 0,
    resistanceAmount: resistance,
    reduced: !blocked && total < expected,
    reducedAmount: Math.max(0, expected - total),
    bonus: total > expected,
    boostedAmount: Math.max(0, total - expected),
    blocked,
    flipUntil: false,
  };
}

/**
 * AttackOption.SetAttackDamageValue. `outcome` null is the game's "not finished" path: the printed
 * label as is, untinted. An attack with no printed damage hides its damage tab.
 *
 * @param {string|number|null} printed the attack's printed damage ('30', '30+', '20×', '')
 * @param {object|null} outcome `damageOutcome` result
 * @returns {{ text: string, tone: 'weakness'|'resistance'|'plain', mod: 'buff'|'debuff'|null, showTab: boolean }}
 */
export function damageReadout(printed, outcome) {
  const label = printed == null ? '' : String(printed);
  if (!label) return { text: '', tone: 'plain', mod: null, showTab: false };
  const plain = { text: label, tone: 'plain', mod: null, showTab: true };
  if (!outcome) return plain;

  const leading = Number(/\d+/.exec(label)?.[0] ?? 0);
  const digits = Number(label.replace(/\D/g, '') || 0);
  const times = /[×x]/.test(label);
  const plus = label.includes('+');
  const minus = label.includes('-');
  const weakness = outcome.hitWeakness ? outcome.weaknessAmount || 1 : 1;
  const boosted = outcome.bonus ? outcome.boostedAmount : 0;
  const reducedBy = outcome.reduced ? outcome.reducedAmount : 0;
  const resisted = outcome.hitResistance ? outcome.resistanceAmount : 0;

  let text;
  if (outcome.flipUntil) {
    if (outcome.blocked) text = '0';
    else if (times) text = `${digits * weakness}×`;
    else if (plus) text = `${(digits + boosted) * weakness - reducedBy - resisted}+`;
    else if (minus) text = `${(digits + boosted) * weakness - reducedBy - resisted}-`;
    else text = String(outcome.finalMin);
  } else if (outcome.finalMin !== outcome.finalMax) {
    text = `${outcome.finalMin}-${outcome.finalMax}`;
  } else {
    text = String(outcome.finalMin);
  }

  const tone = outcome.hitWeakness ? 'weakness' : outcome.hitResistance ? 'resistance' : 'plain';
  let mod = null;
  if ((times && outcome.reduced) || (!times && (outcome.unmodifiedBase < leading || outcome.reduced))) {
    mod = 'debuff';
  } else if ((times && outcome.bonus) || (!times && (outcome.unmodifiedBase > leading || outcome.bonus))) {
    mod = 'buff';
  }
  return { text, tone, mod, showTab: true };
}

// Which side of the Buff / Debuff split a timed attack effect (design 031 attack marker) sits on,
// from the point of view of the Pokémon carrying it.
const POSITIVE_MARKERS = new Set([
  'noWeakness',
  'incomingPrevent',
  'effectPrevent',
  'incomingHalve',
  'incomingReduce',
  'nextTurnBonus',
  'nextTurnBaseDamage',
  'outgoingBonus',
  'damageBonus',
  'freeRetreat',
  'statusImmunity',
  'prizeBonus',
  'retaliate',
  'surviveKnockOutCoin',
  'reflipAttackCoins',
  'resistanceOverride',
]);

const amountText = (marker) => (marker.amount != null ? String(marker.amount) : '');

const MARKER_TEXT = {
  noWeakness: () => 'This Pokémon has no Weakness.',
  incomingPrevent: () => 'Prevent all damage done to this Pokémon by attacks.',
  effectPrevent: () => 'Prevent all effects of attacks done to this Pokémon.',
  incomingHalve: () => 'This Pokémon takes half damage from attacks.',
  incomingReduce: (m) => `This Pokémon takes ${amountText(m)} less damage from attacks.`,
  incomingBonus: (m) => `This Pokémon takes ${amountText(m)} more damage from attacks.`,
  nextTurnBonus: (m) =>
    `${m.attackName ? `${titleCase(m.attackName)} does` : 'Attacks do'} ${amountText(m)} more damage.`,
  nextTurnBaseDamage: (m) =>
    `${m.attackName ? titleCase(m.attackName) : 'Its attack'}'s base damage is ${
      m.doubled ? 'doubled' : amountText(m)
    }.`,
  outgoingBonus: (m) => `This Pokémon's attacks do ${amountText(m)} more damage.`,
  outgoingReduce: (m) => `This Pokémon's attacks do ${amountText(m)} less damage.`,
  freeRetreat: () => 'This Pokémon has no Retreat Cost.',
  retreatDelta: (m) => `This Pokémon's Retreat Cost is changed by ${m.amount ?? m.count ?? ''}.`,
  statusImmunity: () => "This Pokémon can't be affected by Special Conditions.",
  healLock: () => "This Pokémon can't be healed.",
  abilityLock: () => 'This Pokémon has no Abilities.',
  attackLock: (m) => (m.attackName ? `This Pokémon can't use ${m.attackName}.` : "This Pokémon can't attack."),
  cantAttack: () => "This Pokémon can't attack.",
  cantRetreat: () => "This Pokémon can't retreat.",
  attachLock: () => "Energy can't be attached to this Pokémon.",
  evolveLock: () => "This Pokémon can't evolve.",
  attackCostIncrease: (m) => `This Pokémon's attacks cost ${m.count ?? 1} more Energy.`,
  attackFlipOrFail: () => 'Flip a coin before attacking. If tails, the attack does nothing.',
  weaknessOverride: (m) => `This Pokémon's Weakness is ${titleCase(m.type ?? '')}.`,
  deferredCounters: (m) => `Put ${m.count ?? ''} damage counters on this Pokémon at the end of the turn.`,
  deferredKnockOut: () => 'This Pokémon is Knocked Out at the end of the turn.',
  surviveKnockOutCoin: () => 'If this Pokémon would be Knocked Out, flip a coin. If heads, it is not.',
  prizeBonus: (m) => `Take ${m.count ?? 1} more Prize card${m.count === 1 ? '' : 's'}.`,
  retaliate: () => 'Damage counters go back on the attacking Pokémon.',
};

const CONDITION_TEXT = {
  Asleep: "Asleep: this Pokémon can't attack or retreat. Flip a coin between turns; heads, it wakes up.",
  Burned: 'Burned: put 2 damage counters on it between turns, then flip a coin; heads, it recovers.',
  Confused: 'Confused: flip a coin to attack; tails, the attack fails and it takes 3 damage counters.',
  Paralyzed: "Paralyzed: this Pokémon can't attack or retreat during its owner's next turn.",
  Poisoned: 'Poisoned: put a damage counter on it between turns.',
};

function titleCase(text) {
  return String(text).replace(/\b\w/g, (c) => c.toUpperCase());
}

const humanize = (kind) =>
  String(kind)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

const markerEntry = (marker) => ({
  // EffectDescriptionGenerator titles an entry with the source card / attack name; the marker only
  // knows the attack, which is what the game shows for an attack-applied effect.
  title: marker.sourceAttack ? titleCase(marker.sourceAttack) : humanize(marker.kind),
  text: (MARKER_TEXT[marker.kind] ?? (() => `${humanize(marker.kind)}.`))(marker),
  kind: marker.kind,
});

/**
 * The card's `posStatusEffects` / `negsStatusEffects`. Timed attack effects count only while the
 * Pokémon is Active (attack-markers.mjs), so a benched card passes no turn window and gets none.
 * Special Conditions are negative; an attached Pokémon Tool is positive and carries its own text.
 * Entries that share a source attack are merged into one, as GetEntriesForEffects does.
 *
 * @param {object} card the root in-play card (`attackMarkers`, `attachedCards`, conditions)
 * @param {{ turnNumber?: number|null, zoneCards?: object[], sourceZoneCards?: object[], active?: boolean }} ctx
 * @returns {{ positive: {title,text,kind}[], negative: {title,text,kind}[] }}
 */
export function statusEffectsFor(card, ctx = {}) {
  const positive = [];
  const negative = [];
  if (!card) return { positive, negative };
  const { turnNumber = null, zoneCards = [], sourceZoneCards = [], active = true } = ctx;

  const markers =
    active && Number.isFinite(turnNumber)
      ? liveAttackMarkers(card, { turnNumber, zoneCards, sourceZoneCards })
      : [];
  for (const marker of markers) {
    const target = POSITIVE_MARKERS.has(marker.kind) ? positive : negative;
    const entry = markerEntry(marker);
    const same = target.find((e) => e.title === entry.title && e.kind !== 'condition');
    if (same && marker.sourceAttack) same.text += `\n${entry.text}`;
    else target.push(entry);
  }

  for (const condition of listConditions(card)) {
    negative.push({ title: condition, text: CONDITION_TEXT[condition] ?? `${condition}.`, kind: 'condition' });
  }

  for (const attached of card.attachedCards || []) {
    if (!isPokemonToolCard(attached)) continue;
    positive.push({
      title: String(attached.name ?? 'Pokémon Tool'),
      text: String(attached.text ?? attached.effect ?? attached.rules?.[0] ?? ''),
      kind: 'tool',
    });
  }
  return { positive, negative };
}

/**
 * PlayerCardOwner.OnCardClicked for a tap on an in-play Pokémon. Your Active always opens the
 * AttackOverlay (ActiveController.CanShowActionSelection is true); a Benched Pokémon of yours only
 * when it has something usable (BenchController.CanShowActionSelection), otherwise the stack view
 * (its deep inspection). The opponent's Pokémon never get action selection, so they open the stack
 * view (OpponentActiveController / BenchController for a card that is not yours).
 *
 * @param {{ zoneId?: string, cardUser?: string, card?: object|null, hasUsableAction?: boolean }} tap
 * @returns {'overlay'|'stack'|null}
 */
export function tapRoute({ zoneId, cardUser, card, hasUsableAction = false } = {}) {
  if (zoneId !== 'active' && zoneId !== 'bench') return null;
  if (!card?.image || !isInspectablePokemon(card)) return null;
  if (cardUser !== 'self') return 'stack';
  if (zoneId === 'active') return 'overlay';
  return hasUsableAction ? 'overlay' : 'stack';
}
