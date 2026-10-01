/**
 * @file WotC Trainers that attach to a Pokémon without being Pokémon Tools (I224): PlusPower,
 * Defender, Charity, Magnifier, Sabrina's ESP, Brock's Protection, Koga's Ninja Trick.
 *
 * TCGdex gives them no trainerType, so their attach target, discard timing and effect are read
 * from the printed wording here, once, and every reader asks this module. They are not Tools:
 * they never count toward the 1-Tool limit, Tool-removal effects ignore them, and several can sit
 * on one Pokémon. Pure: no state beyond the cards passed in.
 */

import { isTrainer, normalizedText } from './legacy-trainer-type.mjs';

// "Attach PlusPower to your Active Pokémon." / "… to 1 of your Pokémon with Sabrina in its name."
// The Tool wording ("… that doesn't have a Pokémon Tool attached to it") never reaches the period.
const ATTACH = /^Attach .+? to (?:1 of your|your) (Active )?Pokémon(?: with (\S+) in its name)?\. /i;

const DISCARD_TIMINGS = [
  [/\bAt the end of your opponent's next turn, discard \S/i, 'endOfOpponentsNextTurn'],
  [/\bAt the end of your turn, discard \S/i, 'endOfYourTurn'],
  [/\breturn .+? to your hand at the end of your turn\./i, 'returnAtEndOfYourTurn'],
  [/\bIf this Pokémon goes to your Bench, discard this card\./i, 'whenBenched'],
];

const EFFECTS = [
  // base1-84 PlusPower
  [
    /does damage to the Defending Pokémon \(after applying Weakness and Resistance\), the attack does (\d+) more damage to the Defending Pokémon\./i,
    (m) => ({ kind: 'damageBonusAfterWR', amount: Number(m[1]) }),
  ],
  // base1-80 Defender
  [
    /Damage done to that Pokémon by attacks is reduced by (\d+) \(after applying Weakness and Resistance\)\./i,
    (m) => ({ kind: 'damageReductionAfterWR', amount: Number(m[1]) }),
  ],
  // gym1-99 Charity
  [
    /If that Pokémon attacks and does damage to the Defending Pokémon, you may reduce that damage by any amount/i,
    () => ({ kind: 'optionalDamageReduction' }),
  ],
  // gym1-117 Sabrina's ESP ("uses and attack" is the printed typo)
  [/attack that involves flipping coins, .+? lets you re-flip those coins once/i, () => ({ kind: 'reflipAttackCoins' })],
  // gym2-101 Brock's Protection
  [
    /Energy cards attached to that Pokémon can't be removed by your opponent's attacks or Trainer cards\./i,
    () => ({ kind: 'energyRemovalGuard' }),
  ],
  // gym2-115 Koga's Ninja Trick
  [
    /When your opponent attacks, you may switch this Pokémon with 1 of your Benched Pokémon \(before damage or other effects of attacks\)\./i,
    () => ({ kind: 'switchWhenAttacked' }),
  ],
  // neo4-101 Magnifier
  [/attached to attacks, don't apply Resistance for that attack\./i, () => ({ kind: 'ignoreResistance' })],
];

const kindText = (card) =>
  [card.type, card.trainerType, ...(Array.isArray(card.subtypes) ? card.subtypes : [card.subtypes])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/**
 * The attach-Trainer spec of a WotC card, or null when the card is not one.
 * @param {object} card
 * @returns {{ activeOnly: boolean, nameIncludes: string|null, discard: string|null,
 *   effect: { kind: string, amount?: number } }|null}
 */
export function legacyAttachedTrainer(card) {
  if (!card || !isTrainer(card) || /tool|stadium|supporter/.test(kindText(card))) return null;
  const text = normalizedText(card);
  const attach = ATTACH.exec(`${text} `);
  if (!attach) return null;
  const effectRow = EFFECTS.map(([re, build]) => [re.exec(text), build]).find(([m]) => m);
  if (!effectRow) return null;
  const timing = DISCARD_TIMINGS.find(([re]) => re.test(text));
  return {
    activeOnly: Boolean(attach[1]),
    nameIncludes: attach[2] || null,
    discard: timing ? timing[1] : null,
    effect: effectRow[1](effectRow[0]),
  };
}

const straightName = (name) => String(name || '').replace(/[‘’]/g, "'");

/**
 * Whether the printed target allows `top` (the Pokémon's top card) in the given spot.
 * "with Sabrina in its name" matches the word in the Pokémon's name (Sabrina's Abra).
 */
export function attachTargetAllowed(spec, { top, isActive }) {
  if (!spec || !top) return false;
  if (spec.activeOnly && !isActive) return false;
  if (!spec.nameIncludes) return true;
  const word = spec.nameIncludes.replace(/[^\p{L}\p{N}]/gu, '');
  return new RegExp(`(^|[^\\p{L}])${word}(?=$|[^\\p{L}])`, 'iu').test(straightName(top.name));
}

/** Attach-Trainers on the Pokémon whose root is `root`, each with its spec. */
export function attachedLegacyTrainers(zoneCards, root) {
  if (!root) return [];
  return (zoneCards || [])
    .filter((c) => c && c !== root && c.attachedTo === root.instanceId)
    .map((card) => ({ card, spec: legacyAttachedTrainer(card) }))
    .filter((entry) => entry.spec);
}

export function hasAttachedTrainerEffect(zoneCards, root, kind) {
  return attachedLegacyTrainers(zoneCards, root).some((entry) => entry.spec.effect.kind === kind);
}

/**
 * The damage modifiers of attached attach-Trainers in the attack-marker shape
 * (attack-markers.mjs) that computeAttackDamage reads, for a Pokémon in the Active Spot.
 */
export function attachedTrainerMarkers(zoneCards, root) {
  return attachedLegacyTrainers(zoneCards, root).flatMap(({ card, spec }) => {
    const { kind, amount } = spec.effect;
    const source = card.name || '';
    if (kind === 'damageBonusAfterWR') return [{ kind: 'outgoingBonus', amount, afterWR: true, source }];
    if (kind === 'damageReductionAfterWR') {
      return [{ kind: 'incomingReduce', amount, afterWR: true, filter: null, source }];
    }
    if (kind === 'ignoreResistance') return [{ kind: 'ignoreResistance', source }];
    return [];
  });
}

/** Total "damage done to that Pokémon by attacks is reduced by N" (Defender) on `root`. */
export function attachedTrainerDamageReduction(zoneCards, root) {
  return attachedLegacyTrainers(zoneCards, root)
    .filter((entry) => entry.spec.effect.kind === 'damageReductionAfterWR')
    .reduce((sum, entry) => sum + (entry.spec.effect.amount || 0), 0);
}

/**
 * Brock's Protection: true when `energy` is attached to a Pokémon (in `zoneCards`, its owner's
 * Active and Bench) guarded from the opponent's attacks and Trainer cards removing its Energy.
 */
export function energyRemovalGuarded(zoneCards, energy) {
  if (!energy || energy.attachedTo == null) return false;
  const root = (zoneCards || []).find((c) => c.instanceId === energy.attachedTo);
  return Boolean(root) && hasAttachedTrainerEffect(zoneCards, root, 'energyRemovalGuard');
}

/**
 * What the end of turn `turnNumber` does to an attached attach-Trainer: 'discard', 'return'
 * (to its owner's hand) or null. `attachedTurn` is stamped when it was attached.
 */
export function attachedTrainerTurnEnd(card, turnNumber) {
  const spec = legacyAttachedTrainer(card);
  if (!spec || card.attachedTurn == null) return null;
  if (spec.discard === 'endOfYourTurn' && turnNumber >= card.attachedTurn) return 'discard';
  if (spec.discard === 'endOfOpponentsNextTurn' && turnNumber >= card.attachedTurn + 1) return 'discard';
  if (spec.discard === 'returnAtEndOfYourTurn' && turnNumber >= card.attachedTurn) return 'return';
  return null;
}
