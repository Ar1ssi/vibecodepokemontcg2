// WotC Pokémon Power wording (design 062, D202). Leaf module: the ability parser and the passive
// readers' text accessor (ability-executors.mjs cardAbilityText) both read Powers through here.
// Every pattern runs on lowercased text with straight quotes and is anchored on WotC-only
// phrasing, so modern wordings pass through unchanged.

// Rain Dance omits "from your hand" (only the attachment-rule reminder implies it), and Energy
// Trans-likes say "take … attached to … and attach it to …" instead of "move … from … to …".
const LEGACY_ATTACH_REMINDER = "this doesn't use up your 1 energy card attachment for the turn";
const LEGACY_TAKE_ENERGY =
  /you may take ((?:up to )?\d+) ((?:\{[a-z]\} )?energy) cards? attached to (1 of your pokémon|1 of your other pokémon|your other pokémon|1 of your [^.]+?) and attach (?:it|them) to ([^.]+?)\./;

function legacyMoveDestination(destination) {
  if (destination === 'a different one') return 'another of your pokémon';
  const differentGroup = destination.match(/^a different (1 of your .+)$/);
  if (differentGroup) return differentGroup[1];
  return 'this pokémon';
}

const counters = (n) => `${n} damage counter${n === '1' ? '' : 's'}`;

// Passive Powers whose modern Ability wording the passive readers already enforce.
const LEGACY_PASSIVE_REWRITES = [
  // Dark Vileplume Hay Fever [Team Rocket 13/30]: a Trainer lock on both players.
  [/(^|\. )no trainer cards can be played\./, "$1each player can't play any trainer cards from his or her hand."],
  // Dodrio Retreat Aid [Jungle 34]: Zoroark Nighttime Byway [30th Celebration 096] wording.
  [
    /(^|\. )as long as [^,.]+? is benched, pay ((?:\{c\})+) less to retreat your active pokémon\./,
    "$1as long as this pokémon is on your bench, your active pokémon's retreat cost is $2 less.",
  ],
  // Machamp Strikes Back [Base Set 8]: 10 damage, no Weakness/Resistance, to the attacker is
  // 1 damage counter (Hop's Pincurchin ex Counterattack Quills wording, without its Active clause).
  [
    /(^|\. )whenever your opponent's attack damages ([^(.]+?) \(even if \2 is knocked out\), this power does (\d+)0 damage to the attacking pokémon\. \(don't apply weakness and resistance\.\)/,
    (_m, lead, _name, tens) =>
      `${lead}if this pokémon is damaged by an attack from your opponent's pokémon (even if this pokémon is knocked out), put ${counters(tens)} on the attacking pokémon.`,
  ],
];

export function rewriteLegacyPowerWording(lower) {
  if (!lower) return '';
  let rewritten = lower;
  if (rewritten.includes(LEGACY_ATTACH_REMINDER)) {
    rewritten = rewritten.replace(
      /\byou may attach (\d+ (?:\{[a-z]\} )?energy cards?) to /,
      'you may attach $1 from your hand to '
    );
  }
  rewritten = rewritten.replace(
    LEGACY_TAKE_ENERGY,
    (_match, count, energy, source, destination) =>
      `you may move ${count} ${energy} from ${source} to ${legacyMoveDestination(destination)}.`
  );
  for (const [pattern, replacement] of LEGACY_PASSIVE_REWRITES) {
    rewritten = rewritten.replace(pattern, replacement);
  }
  return rewritten;
}

// "This power stops working while <name> is Asleep, Confused, or Paralyzed" / "… is affected by a
// Special Condition", "This power can't be used if <name> is (already) …", "This power doesn't work
// if …", "You can't use this power if …". 'rotation' = Asleep/Confused/Paralyzed, 'any' = any
// Special Condition, null = the Power prints no such clause.
const STOP_CLAUSE =
  /\b(?:(?:this|the) power (?:stops working|can't be used|doesn't work)|can't use this power)\b[^.]*?\b(asleep, confused, or paralyzed|affected by a special condition)/;

export function legacyPowerStopCondition(lower) {
  const match = String(lower || '').match(STOP_CLAUSE);
  if (!match) return null;
  return match[1].startsWith('asleep') ? 'rotation' : 'any';
}
