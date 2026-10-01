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
  // Feraligatr Berserk [Neo Genesis 4] (a Stage 2, so it is played to evolve): Feraligatr
  // Rowdy [Fusion Strike 057] wording. The coin is not optional in either printing.
  [
    /^when you play [^,.]+? from your hand, flip a coin\. if heads, discard the top (\d+) cards from your opponent's deck\. if tails, discard the top \1 cards from your deck\./,
    "when you play this pokémon from your hand to evolve 1 of your pokémon during your turn, you must flip a coin. if heads, discard the top $1 cards of your opponent's deck. if tails, discard the top $1 cards of your deck.",
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

// WotC Powers that change attack damage after Weakness and Resistance, with no modern wording to
// rewrite to. `subject` is the printed holder name the reader checks against the holder.
const AFTER_WR = '\\(after applying weakness and resistance\\)';
const NAME = "([a-z0-9é' .-]+?)";
const LEGACY_DAMAGE_MODIFIERS = [
  // Mr. Mime Invisible Wall [Jungle 6]
  {
    pattern: new RegExp(`^whenever an attack \\(including your own\\) does (\\d+) or more damage to ${NAME} ${AFTER_WR}, prevent that damage\\.`),
    read: (m) => ({ kind: 'preventAtLeast', min: Number(m[1]), subject: m[2], scope: 'self' }),
  },
  // Kabuto Kabuto Armor [Fossil 50], [Legendary Collection 48] ("does only half")
  {
    pattern: new RegExp(`^whenever an attack \\(even your own\\) does damage to ${NAME} ${AFTER_WR}, that attack does (?:only )?half the damage to \\1 \\(rounded (down|up) to the nearest 10\\)\\.`),
    read: (m) => ({ kind: 'halve', round: m[2], subject: m[1], scope: 'self' }),
  },
  // Shuckle Hard Shell [Neo Revelation 51]
  {
    pattern: new RegExp(`^whenever an attack \\(including your own\\) does (\\d+) or less damage to ${NAME} ${AFTER_WR}, reduce that damage to (\\d+)\\.`),
    read: (m) => ({ kind: 'reduceTo', max: Number(m[1]), to: Number(m[3]), subject: m[2], scope: 'self' }),
  },
  // Erika's Dratini Strange Barrier [Gym Heroes 42]
  {
    pattern: new RegExp(`^whenever an attack by a basic pokémon \\(including your own\\) does (\\d+) or more damage to ${NAME} ${AFTER_WR}, reduce that damage to (\\d+)\\.`),
    read: (m) => ({ kind: 'reduceTo', min: Number(m[1]), to: Number(m[3]), attackerBasic: true, subject: m[2], scope: 'self' }),
  },
  // Erika's Ivysaur Relaxing Scent [Gym Challenge 41]: every Pokémon in play, both sides.
  {
    pattern: new RegExp(`^as long as ${NAME} is your active pokémon, whenever an attack \\(even your own\\) does damage to any pokémon ${AFTER_WR}, that attack only does half the damage to that pokémon \\(rounded (up|down) to the nearest 10\\)\\.`),
    read: (m) => ({ kind: 'halve', round: m[2], subject: m[1], scope: 'any', holderActive: true }),
  },
  // Unown D [Darkness] / M [Metal] / N [Normal] [Neo Discovery 47/49/50]: the holder's side.
  {
    pattern: new RegExp(`^whenever a \\{([a-z])\\} pokémon damages 1 of your pokémon, reduce that damage by (\\d+) ${AFTER_WR}\\. this power stops working if you have more than 1 ${NAME} in play\\.`),
    read: (m) => ({ kind: 'reduceBy', amount: Number(m[2]), attackerType: m[1], subject: m[3], scope: 'team', unique: true }),
  },
];

export function parseLegacyDamageModifier(lower) {
  const text = String(lower || '');
  for (const { pattern, read } of LEGACY_DAMAGE_MODIFIERS) {
    const match = text.match(pattern);
    if (match) return read(match);
  }
  return null;
}

const roundToTen = (value, round) => (round === 'up' ? Math.ceil(value / 10) : Math.floor(value / 10)) * 10;

/** `damage` after one parsed modifier; 0 stays 0 (an attack that does no damage is untouched). */
export function applyLegacyDamageModifier(damage, spec) {
  if (!(damage > 0) || !spec) return damage;
  switch (spec.kind) {
    case 'preventAtLeast':
      return damage >= spec.min ? 0 : damage;
    case 'halve':
      return roundToTen(damage / 2, spec.round);
    case 'reduceTo': {
      const inRange = spec.max != null ? damage <= spec.max : damage >= spec.min;
      return inRange ? Math.min(damage, spec.to) : damage;
    }
    case 'reduceBy':
      return Math.max(0, damage - spec.amount);
    default:
      return damage;
  }
}

export function applyLegacyDamageModifiers(damage, specs = []) {
  return specs.reduce((dealt, spec) => applyLegacyDamageModifier(dealt, spec), damage);
}

// "This power stops working while <name> is Asleep, Confused, or Paralyzed" / "… is affected by a
// Special Condition", "This power can't be used if <name> is (already) …", "This power doesn't work
// if …", "You can't use this power if …". 'rotation' = Asleep/Confused/Paralyzed, 'any' = any
// Special Condition, null = the Power prints no such clause.
// The clause stays in its sentence; the abbreviation dots of "Mr. Mime" / "Lt. Surge's" are no end.
const STOP_CLAUSE =
  /\b(?:(?:this|the) power (?:stops working|can't be used|doesn't work)|can't use this power)\b(?:[^.]|\b(?:mr|lt)\.)*?\b(asleep, confused, or paralyzed|affected by a special condition)/;

export function legacyPowerStopCondition(lower) {
  const match = String(lower || '').match(STOP_CLAUSE);
  if (!match) return null;
  return match[1].startsWith('asleep') ? 'rotation' : 'any';
}
