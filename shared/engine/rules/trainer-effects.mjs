// Trainer/Supporter effect parser: converts printed card text into
// structured effect steps the rules engine can guide a player through.
// Grounded in the actual text of the Mega Battle starter decks.

// Effect step vocabulary:
//   { type: 'draw', count: N }
//   { type: 'drawUntil', target: N, bonusTarget?: M }
//   { type: 'opponentDraw', count: N }
//   { type: 'shuffleHandThenDraw', count: N, bonusCount: M, bonusWhen: 'prizes==6' }
//   { type: 'discardHandThenDraw', count: N }
//   { type: 'searchDeck', what: 'Item+Tool' | 'Basic Pokemon' | 'Pokemon' | ... , destination: 'hand'|'bench'|'attach', count: N }
//   { type: 'coinFlip', heads: Step, tails: Step }
//   { type: 'putHandOnBottom', count: N }
//   { type: 'opponentShuffleHandDraw', count: N, prizeCondition?: string }
//   { type: 'lookAtTop', count: N, pick: 'Supporter'|'Dark Pokemon', destination: 'hand'|'bench' }
//   { type: 'lookAtBottom', count: N, pick: 'Pokémon'|..., destination: 'hand'|'bench' }
//   { type: 'switchOwn' }
//   { type: 'switchOpponent' }
//   { type: 'discardCost', count: N }
//   { type: 'recursion', what: 'Pokemon|Energy', from: 'discard' }
//   { type: 'heal', target: 'Mega Evolution ex' }
//   { type: 'healAmount', amount: N, target: 'Active Pokémon'|'1 of your Pokémon', cure?: true }
//   { type: 'attachFromDiscard', energy: 'Basic {P} Energy'|'Basic Energy', target: '1 of your Benched …' }
//   { type: 'ionoShuffle' }
//   { type: 'evolveStage2', source: 'hand', skipStage: 1 }
//   { type: 'moveEnergy' }
//   { type: 'devolve', target: '1 of your evolved {P} Pokémon' }
//   { type: 'discardTools', count: N }
//   { type: 'discardFromOpponent', target: '…' }
//   { type: 'switchOpponentOut' }
//   { type: 'variableDraw', source: 'ancientInPlay'|'opponentBench'|'opponentHandPokemon'|'opponentMegaExInPlay', per: 'card' }
//   { type: 'countShuffleDrawPlus' }
//   { type: 'shuffleFromDiscard', what: 'Basic Energy'|'Pokémon'|..., count: N, choices?: [...] }
//   { type: 'applyStatus', target: 'opponentActive'|'bothActiveNonDark', conditions: ['Burned','Confused',...] }
//   { type: 'fossilItem', hp: 60 }
//   { type: 'moveEnergyToActive', count: N }
//   { type: 'returnPokemonToHand', keepAttached?: boolean }
//   { type: 'swapWithDiscard', filter: 'Basic Pokémon'|'Pokémon ex (Ogerpon)'|... }
//   { type: 'massDiscardAttached' }
//   { type: 'discardToolAndSpecialEnergy' }
//   { type: 'reshufflePrizes' }
//   { type: 'revealOpponentDeckBench', count: N }
//   { type: 'attachMultipleFromDiscard', count: N, energy: '…', target: '…' }
//   { type: 'opponentPrizeHandSwap' }
//   { type: 'revealOpponentHandDiscard', what: 'Item', count: N }
//   { type: 'opponentHandBottom', what: 'card'|'Energy', optionalOpponentDraw?: true }
//   { type: 'opponentDiscardUntil', count: N }
//   { type: 'eachPlayerDiscardUntil', count: N, opponentFirst?: true }
//   { type: 'opponentCountShuffleDraw' }
//   { type: 'discardEnergyFromOpponent', energy: 'Special Energy'|'any Energy', count: N, scope: '1 Pokémon'|'each Pokémon', action?: 'returnToHand' }
//   { type: 'damageCounters', count: N, target: '…' }
//   { type: 'millSelf', count: N }
//   { type: 'passive', detail?: '…' }
//   { type: 'searchEvolve', noAbilities?: true }
//   { type: 'prizeBargain', drawCount: N }
//   { type: 'searchAttachEach', count: N, energy: '…', target: '…', poisonActive?: true }
// parseTrainerEffect also returns `playCondition` (see parsePlayCondition; e.g. 'opponentPrizes<=N',
// 'lostZone>=N', 'koedLastTurn:type=p', 'handCount<=N') when the card can only be played under it.

import { WORD_POKEMON_TYPES } from './search-match.mjs';

const POKEMON_TYPE_WORDS = Object.keys(WORD_POKEMON_TYPES).join('|');

// "Search your deck for a Water Pokémon" / "up to 2 Basic Psychic Pokémon" name
// the type in words. Without this, the generic Pokémon fallback drops the
// qualifier and the deck picker shows every Pokémon (Dive Ball).
const TYPED_POKEMON_SEARCH_RE = new RegExp(
  `search your deck for (?:up to\\s+\\d+\\s+)?(?:an?\\s+)?(?:(basic|evolution)\\s+)?(?:${POKEMON_TYPE_WORDS})(?:-type)?\\s+pok[ée]mon`,
);
const TYPED_POKEMON_TYPE_RE = new RegExp(
  `\\b(${POKEMON_TYPE_WORDS})(?:-type)?\\s+pok[ée]mon`,
);

// "Search your deck for a Lightning Energy card" (Thundurus' Charge) names the
// energy type in words, with no {L} symbol and no "Basic". Without this the
// generic fallback leaves `what` as 'card', so the filter lets the whole deck
// through. Mirrors TYPED_POKEMON_SEARCH_RE.
const TYPED_ENERGY_SEARCH_RE = new RegExp(
  `search your deck for (?:up to\\s+\\d+\\s+)?(?:an?\\s+)?(?:basic\\s+)?(${POKEMON_TYPE_WORDS})\\s+energy`,
);

function typedPokemonSearchWhat(lower) {
  const clause = lower.match(TYPED_POKEMON_SEARCH_RE);
  if (!clause) return null;
  const typed = clause[0].match(TYPED_POKEMON_TYPE_RE);
  if (!typed) return null;
  const type = WORD_POKEMON_TYPES[typed[1]];
  if (!type) return null;
  const stage = clause[1] ? `${clause[1][0].toUpperCase()}${clause[1].slice(1)} ` : '';
  return `${stage}${type} Pokémon`;
}

// Normalize printed card text before matching. Real card text (and the
// pkmncards.com dump) uses curly apostrophes (U+2019) and renders energy
// symbols with inner spaces ("{ P }"). Both broke exact substring matches,
// so normalize them once up front:
//   curly quotes  ’ ‘ ‚ ʼ `  →  straight '
//   energy symbol { P } {G}  →  {P} (no inner spaces)
function normalizeText(text) {
  return String(text)
    .replace(/[\u2018\u2019\u201A\u201B\u201A`]/g, "'")
    .replace(/\{\s*([A-Za-z])\s*\}/g, '{$1}')
    .toLowerCase();
}

// A "You can use this card only if you discard…" cost. Two printed wordings
// both resolve to the same cost: the newer "discard N other cards" and the
// older "Discard N cards from your hand. If you do, …" (e.g. Ultra Ball
// sm3.5-68). Match both so the cost is always seen — otherwise the
// discard-cost picker in rules-bridge.js never opens. Applied wherever a
// cost can precede the main effect (search, draw-until, …).
function appendDiscardCost(steps, lower) {
  const costMatch = lower.match(/discard\s+(\d+)\s+(other\s+)?cards/);
  if (costMatch) {
    steps.unshift({ type: 'discardCost', count: Number(costMatch[1]) });
  } else if (lower.includes('discard another card')) {
    steps.unshift({ type: 'discardCost', count: 1 });
  }
}

// Short human description for passive/turn-scoped/conditional effects, chosen
// from the keyword that matched. Falls back to a generic note.
function passiveDetail(lower) {
  if (/draw\s+\d+\s+more cards/.test(lower)) return 'Conditional bonus draw — draw the extra cards when the printed condition is met.';
  if (lower.includes('your turn does not end')) return 'Spirit Link — your turn continues after Mega Evolving the attached Pokémon.';
  if (lower.includes('at any time between turns')) return 'Between-turns trigger — resolve it manually when its condition is met.';
  if (lower.includes('more damage')) return 'Turn-scoped attack damage boost — applies automatically.';
  if (lower.includes('less damage')) return 'Passive damage reduction — applies automatically.';
  if (lower.includes('prevent all damage')) return 'Prevents damage / attack effects — applies automatically.';
  if (/more prize cards?/.test(lower)) return 'Bonus prize cards under a condition — applies when the condition is met.';
  if (/gets \+\d+ hp/.test(lower)) return 'HP boost — applies automatically while attached.';
  if (lower.includes('recovers from all special conditions') || lower.includes("can't be affected by any special condition")) {
    return 'Special Condition immunity/recovery — applies automatically while attached.';
  }
  if (lower.includes('have no abilities') || lower.includes('has no abilities')) return 'Negates Abilities — applies automatically.';
  if (lower.includes('powers stop working')) return 'Turns off Pokémon Powers until the stated turn ends.';
  if (lower.includes('has no weakness')) return 'No Weakness — applies automatically while attached.';
  if (lower.includes('can attack even if')) return 'Attack-while-Asleep/Paralyzed — applies automatically while attached.';
  if (lower.includes('have no effect')) return 'Negates Pokémon Tool effects — applies automatically.';
  if (lower.includes('cost {c} more') || lower.includes('cost {c} less')) return 'Attack cost modifier — applies automatically.';
  if (lower.includes('can evolve into')) return 'Evolution timing modifier — applies automatically.';
  if (lower.includes("don't recover") || lower.includes('do not recover')) return 'Special Condition modifier — applies automatically.';
  if (lower.includes('retreat cost')) return 'Retreat Cost modifier — applies automatically.';
  if (lower.includes("can't retreat") || lower.includes('can’t retreat')) return 'Retreat restriction — Poisoned Pokémon cannot retreat.';
  if (lower.includes('fewer prize card')) return 'Fewer Prize cards on KO — applies when the Pokémon is Knocked Out.';
  if (lower.includes('would be knocked out') && lower.includes('is not knocked out')) return 'KO prevention — applies when the condition is met.';
  if (lower.includes('can use the attack on this card')) return 'Grants an attack — applies while attached.';
  if (lower.includes('costs 1 energy less') || lower.includes('cost 1 energy less')) return 'Attack cost reduction — applies automatically.';
  if (lower.includes('damage counters on the attacking pokémon')) {
    return 'Reactive tool damage — when the attached Pokémon is damaged or Knocked Out, put damage counters on the Attacking Pokémon (applied automatically by tool-combat).';
  }
  if (lower.includes('damaged by an opponent') || lower.includes('knocked out by damage')) {
    return 'Reactive tool effect — triggers when the attached Pokémon is damaged or Knocked Out (applied automatically by tool-combat).';
  }
  return 'Passive / conditional effect — applies automatically or when its condition is met.';
}

// Keywords that mark a card as a passive / turn-scoped / conditional modifier.
// Module scope so the leading-action precedence check and the passive fallback
// share one definition.
const PASSIVE_KEYWORDS = [
  'retreat cost',
  'whenever any player',
  'is damaged by an attack',
  'damaged by an opponent',
  'knocked out by damage',
  'once during each player',
  'once during your turn',
  'once during their turn',
  'more damage',
  'less damage',
  'prevent all damage',
  'prevent all effects',
  'any damage done to the pokémon this card is attached to',
  'is reduced by',
  'is not affected by',
  "isn't affected by",
  'as long as the pokémon this card is attached to',
  'your turn does not end',
  'at any time between turns',
  'more prize cards',
  'more prize card',
  'have no abilities',
  'has no abilities',
  'powers stop working',
  'poké-powers or poké-bodies',
  'has no weakness',
  'can attack even if',
  'this card is attached to is a ',
  'use the attack on this card',
  'can use any attack from',
  'maximum hp is',
  'regardless of the amount or type of energy',
  'is affected by weakness and resistance',
  'apply it as x3',
  'at the end of any turn',
  'at the end of your turn, remove',
  'at the end of your turn, draw a card',
  "an opponent's attack damages it",
  'have no effect',
  'cost {c} more',
  'cost {c} less',
  'can evolve into',
  "don't recover",
  'do not recover',
  "can't retreat",
  'can’t retreat',
  'fewer prize card',
  'would be knocked out',
  'can use the attack on this card',
  'costs 1 energy less',
  'cost 1 energy less',
  'recovers from all special conditions',
  "can't be affected by any special condition",
  // Tool / attached-card modifiers (batch 10). Reached only after every active
  // branch fails, so these broad substrings cannot shadow a playable effect.
  'vstar power',
  'gx attack on this card',
  'use the gx attack',
  'the pokémon this card is attached to',
  'this card is attached to a pokémon',
  'is attached to a pokémon',
  'at the end of each turn',
  'at the end of your turn',
  'discard this card at the end of the turn',
  "don't apply resistance",
  "don't apply weakness",
  'attacking pokémon',
  're-flip',
  'choose heads or tails',
  'energy cards attached to that pokémon',
  'as long as team galactic',
  'with exp.all attached',
  'instead of discarding energy',
  'is then poisoned',
  'even if you just played',
  'instead of attaching your free energy',
  'when your opponent attacks',
  'you may switch this pokémon',
  'you may move an energy card attached',
  'the attack cost of that pokémon',
  'reduce that damage',
  'as often as you like during your turn',
  'pokémon that has an owner',
  'damage porter',
  'devoluter',
];

function isPassiveText(lower) {
  return PASSIVE_KEYWORDS.some((k) => lower.includes(k)) || /gets \+\d+ hp/.test(lower);
}

function parseEnergyType(lower) {
  const m = lower.match(/\{([a-z])\}/);
  return m ? `{${m[1].toUpperCase()}}` : null;
}

// Legacy discard-pile wording ("Search your discard pile for X …") names the
// target loosely; map it to the closest search filter.
function discardSearchWhat(lower) {
  if (lower.includes('pokémon') && lower.includes('energy')) return 'Pokémon or Basic Energy';
  if (lower.includes('supporter')) return 'Supporter';
  if (lower.includes('trainer')) return 'Trainer';
  if (lower.includes('pokémon')) return 'Pokémon';
  if (lower.includes('basic energy')) return 'Basic Energy';
  if (lower.includes('energy')) return 'Energy';
  return 'card';
}

function discardSearchCount(lower) {
  const m = lower.match(/\bfor\s+(?:up to\s+)?(\d+)\b/);
  return m ? Number(m[1]) : 1;
}

// Energy-symbol → type word for the Pokémon half of "any combination" discard
// clauses (matchesSearch filters typed Pokémon by word form, not by symbol).
const SYMBOL_TYPE_WORDS = {
  c: 'Colorless',
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  d: 'Darkness',
  m: 'Metal',
  n: 'Dragon',
  y: 'Fairy',
};

// Look-at-deck cards that bench a card ("…onto your Bench", I132). Grimsley's
// Move picks a {D} Pokémon; the fossil Items name the Pokémon in their own text
// ("reveal an Anorith you find there"). The generic fallback benches any Basic.
function benchLookPick(lower) {
  const named = lower.match(/reveal an? ([a-z0-9 .'-]+?) you find there/);
  if (named) {
    // Restore the printed capitalisation for prompts; matching is case-insensitive.
    const name = named[1]
      .trim()
      .replace(/(^|[\s-])([a-z])/g, (_m, lead, ch) => lead + ch.toUpperCase());
    return `${name} (bench)`;
  }
  const typed = lower.match(/\{([a-z])\} pok[eé]mon you find there/);
  if (typed && SYMBOL_TYPE_WORDS[typed[1]]) {
    return `${SYMBOL_TYPE_WORDS[typed[1]]} Pokémon (bench)`;
  }
  return 'Pokémon (bench)';
}

// "…in any combination of {F} Pokémon and Basic {F} Energy cards…" → a single
// `or`-joined filter the executor's matchesSearch already understands
// ("Fighting Pokémon or Basic {F} Energy"). Keeps the type qualifier on both
// halves so the picker can't offer the whole discard pile.
function combinationDiscardWhat(clause) {
  const parts = clause
    .split(/\s+and\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const converted = parts.map((part) => {
    const sym = part.match(/\{([a-z])\}/);
    if (part.includes('energy')) {
      if (sym) {
        const basic = part.includes('basic') ? 'Basic ' : '';
        return `${basic}{${sym[1].toUpperCase()}} Energy`;
      }
      return part.includes('basic') ? 'Basic Energy' : 'Energy';
    }
    if (part.includes('pokémon') || part.includes('pokemon')) {
      const stage = part.includes('evolution')
        ? 'Evolution '
        : part.includes('basic')
          ? 'Basic '
          : '';
      const word = sym ? SYMBOL_TYPE_WORDS[sym[1]] : null;
      return word ? `${stage}${word} Pokémon` : `${stage}Pokémon`;
    }
    if (part.includes('supporter')) return 'Supporter';
    if (part.includes('trainer')) return 'Trainer';
    return 'card';
  });
  return converted.join(' or ');
}

// Boss's Orders, Lisia's Appeal, etc. — optional stage/type words between "Benched" and "Pokémon".
function matchesSwitchOpponentIn(lower) {
  return (
    (lower.includes("switch in 1 of your opponent's benched") &&
      lower.includes('pokémon') &&
      lower.includes('active spot')) ||
    (lower.includes("switch 1 of your opponent's benched") &&
      lower.includes('pokémon') &&
      (lower.includes('active pokémon') || lower.includes('active spot') || lower.includes('defending pokémon'))) ||
    (lower.includes("choose 1 of your opponent's benched pokémon") && lower.includes('switch'))
  );
}

function appendTrailingDraw(steps, lower) {
  // A trailing draw clause that wasn't consumed by the primary branch.
  // "draw cards until you have N" takes precedence over a bare "draw N".
  const until = lower.match(/draw\s+cards(?:\s+from\s+your\s+deck)?\s+until\s+you have\s+(\d+)\s+cards?/i);
  if (until) {
    steps.push({ type: 'drawUntil', target: { kind: 'fixed', n: Number(until[1]) } });
    return;
  }
  const m = lower.match(/(?:then\s+)?draw\s+(?:a|an|one|(\d+))\s+cards?\.?/i);
  if (m) {
    steps.push({ type: 'draw', count: m[1] ? Number(m[1]) : 1 });
  }
}

// "draw cards until you have N cards" / "…as many cards as your opponent" /
// "…N more card(s) than your opponent" as a target descriptor (design 035 slice 8).
function drawUntilTarget(text) {
  const more = text.match(/until you have\s+(\d+)\s+more cards? (?:in your hand )?than your opponent/);
  if (more) return { kind: 'opponentHandPlus', n: Number(more[1]) };
  if (/until you have (?:the same number of cards|as many cards) in your hand as your opponent/.test(text)) {
    return { kind: 'opponentHand' };
  }
  const fixed = text.match(/until you have\s+(\d+)\s+cards?/);
  return fixed ? { kind: 'fixed', n: Number(fixed[1]) } : null;
}

// The "…N cards in your hand instead / if <condition>" second clause: the target and
// the condition that must hold for it (Lillie, Grusha, Cynthia's Ambition, Ariana).
function drawUntilBonus(text) {
  const all = [...text.matchAll(/until you have\s+(\d+)\s+cards?/g)];
  if (all.length < 2) return null;
  let when = null;
  if (/if it[’']s your first turn/.test(text)) when = 'firstTurn';
  else if (/none of your pokémon have any energy attached/.test(text)) when = 'noEnergyAttached';
  else if (/knocked out during your opponent[’']s last turn/.test(text)) when = 'koedLastTurn';
  else if (/all of your pokémon in play are team rocket[’']s pokémon/.test(text)) when = 'teamRocketInPlay';
  if (!when) return null;
  return {
    target: { kind: 'fixed', n: Number(all[all.length - 1][1]) },
    when,
  };
}

// Shared search-deck target parsing — used by the main search branch, coin-flip
// sub-clauses, and attack search (parseAttackSearchClause in damage-parser.mjs).
export function parseSearchDeckParams(lower) {
  let what = 'card';
  let count = 1;
  let destination = 'hand';
  const reveal = /\breveal\b/.test(lower);
  if (
    lower.includes('onto your bench') ||
    lower.includes('put it onto your bench') ||
    lower.includes('put them onto your bench')
  ) {
    destination = 'bench';
  } else if (
    lower.includes('attach them to') ||
    lower.includes('attach them to 1') ||
    lower.includes('attach it to this pok') ||
    lower.includes('attach it to 1 of your') ||
    (lower.includes('attach') && lower.includes('energy') && lower.includes('to 1 of your'))
  ) {
    destination = 'attach';
  }

  if (lower.includes('item card and a pokémon tool card')) {
    return { what: 'Item + Pokémon Tool', count: 1, destination: 'hand' };
  }
  if (lower.includes('stadium card and an energy card') || lower.includes('stadium card and a energy card')) {
    return { what: 'Stadium + Energy', count: 2, destination: 'hand' };
  }
  if (lower.includes('basic pokémon, a stage 1 pokémon, and a stage 2 pokémon')) {
    return {
      type: 'searchDeckSequence',
      stages: [
        { what: 'Basic Pokémon', count: 1, destination: 'hand' },
        { what: 'Stage 1 Pokémon', count: 1, destination: 'hand' },
        { what: 'Stage 2 Pokémon', count: 1, destination: 'hand' },
      ],
    };
  }
  if (
    /search your deck for up to\s+(\d+)\s+([a-z][\w\s'\-.]+?)\s+and put them onto your bench/.test(
      lower,
    ) &&
    !lower.includes('basic pok')
  ) {
    const namedBenchMulti = lower.match(
      /search your deck for up to\s+(\d+)\s+([a-z][\w\s'\-.]+?)\s+and put them onto your bench/
    );
    return {
      what: namedBenchMulti[2].trim(),
      count: Number(namedBenchMulti[1]),
      destination: 'bench',
      upTo: true,
    };
  }
  if (
    /search your deck for an item card/.test(lower) &&
    !lower.includes('pokémon tool') &&
    lower.includes('into your hand')
  ) {
    return { what: 'Item', count: 1, destination: 'hand' };
  }
  if (/search your deck for a basic energy card/.test(lower) && lower.includes('into your hand')) {
    return { what: 'Basic Energy', count: 1, destination: 'hand' };
  }
  const basicEnergyHand = lower.match(/search your deck for up to\s+(\d+)\s+basic energy cards/);
  if (basicEnergyHand && lower.includes('into your hand')) {
    return { what: 'Basic Energy', count: Number(basicEnergyHand[1]), destination: 'hand', upTo: true };
  }

  // Word-form typed Energy ("a Lightning Energy card"). Checked before the
  // generic fallbacks so `what` keeps the type instead of collapsing to 'card'
  // (which would let every deck card match).
  if (!/\bor\b/.test(lower)) {
    const typedEnergy = lower.match(TYPED_ENERGY_SEARCH_RE);
    if (typedEnergy) {
      const type = WORD_POKEMON_TYPES[typedEnergy[1]];
      if (type) {
        const upToMatch = lower.match(/up to\s+(\d+)/);
        return {
          what: `Basic ${type} Energy`,
          count: upToMatch ? Number(upToMatch[1]) : 1,
          destination,
          ...(upToMatch ? { upTo: true } : {}),
          ...(reveal ? { reveal: true } : {}),
        };
      }
    }

    // Generic Energy with no type word ("an Energy card", "a Basic Energy
    // card", "a {L} Energy card"). Must precede the Pokémon fallback, which
    // otherwise latches onto a trailing "this Pokémon" and searches Pokémon.
    const genericEnergy = lower.match(
      /search your deck for (?:up to\s+(\d+)\s+)?(?:an?\s+)?(?:basic\s+)?(\{[a-z]\})?\s*energy/
    );
    if (genericEnergy) {
      const gSym = genericEnergy[2];
      return {
        what: gSym
          ? `Basic ${gSym.toUpperCase()} Energy`
          : /\bbasic\b/.test(lower)
            ? 'Basic Energy'
            : 'Energy',
        count: genericEnergy[1] ? Number(genericEnergy[1]) : 1,
        destination,
        ...(genericEnergy[1] ? { upTo: true } : {}),
        ...(reveal ? { reveal: true } : {}),
      };
    }
  }

  const typedHpBench = lower.match(
    /search your deck for up to\s+(\d+)\s+\{([a-z])\}\s+pok[ée]mon(?:\s+cards?)?(?:\s+with\s+(\d+)\s+hp\s+or\s+less)?/
  );
  if (typedHpBench && lower.includes('onto your bench')) {
    const sym = typedHpBench[2].toUpperCase();
    const hp = typedHpBench[3];
    return {
      what: hp ? `Basic {${sym}} Pokémon ≤${hp} HP` : `Basic {${sym}} Pokémon`,
      count: Number(typedHpBench[1]),
      destination: 'bench',
      upTo: true,
    };
  }

  const pkmnHpHand = lower.match(
    /search your deck for (?:a|an|up to\s+(\d+))\s+pok[ée]mon(?:\s+cards?)?\s+with\s+(\d+)\s+hp\s+or\s+less/
  );
  if (pkmnHpHand && (lower.includes('into your hand') || lower.includes('put it into your hand') || lower.includes('put them into your hand'))) {
    const cnt = pkmnHpHand[1] ? Number(pkmnHpHand[1]) : 1;
    const hp = pkmnHpHand[2];
    return {
      what: `Pokémon ≤${hp} HP`,
      count: cnt,
      destination: 'hand',
      ...(pkmnHpHand[1] ? { upTo: true } : {}),
      ...(reveal ? { reveal: true } : {}),
    };
  }

  // up to N Basic Pokémon → bench WITH an HP cap (Buddy-Buddy Poffin, etc.)
  const basicHpBench = lower.match(
    /search your deck for (?:up to\s+)?(\d+)\s+basic pok[ée]mon(?:\s+cards?)?\s+with\s+(\d+)\s+hp\s+or\s+less/
  );
  if (basicHpBench && lower.includes('onto your bench')) {
    return {
      what: `Basic Pokémon ≤${basicHpBench[2]} HP`,
      count: Number(basicHpBench[1]),
      destination: 'bench',
      upTo: true,
    };
  }

  if (
    lower.includes('up to 2 basic pokémon') &&
    (lower.includes('70 hp or less') || lower.includes('hp or less'))
  ) {
    return { what: 'Basic Pokémon ≤70 HP', count: 2, destination: 'bench', upTo: true };
  }

  // up to N Basic Pokémon → bench, no HP cap (Call for Family on Pidgey, etc.)
  const basicBenchUpTo = lower.match(
    /search your deck for up to\s+(\d+)\s+basic pok[ée]mon\b/
  );
  if (basicBenchUpTo && lower.includes('onto your bench')) {
    return {
      what: 'Basic Pokémon',
      count: Number(basicBenchUpTo[1]),
      destination: 'bench',
      upTo: true,
    };
  }

  // exactly one Basic Pokémon → bench (Call for Family on many Basics)
  if (/search your deck for a basic pok[ée]mon\b/.test(lower) && lower.includes('onto your bench')) {
    return { what: 'Basic Pokémon', count: 1, destination: 'bench', upTo: false };
  }

  const typedPokemonWhat = typedPokemonSearchWhat(lower);
  if (/search your deck for (?:a|an)\s+pok[ée]mon-gx\b/.test(lower)) {
    what = 'Pokémon-GX';
  } else if (typedPokemonWhat) {
    what = typedPokemonWhat;
    const upToMatch = lower.match(/up to\s+(\d+)/);
    if (upToMatch) count = Number(upToMatch[1]);
  } else if (lower.includes('evolution team rocket')) what = "Evolution Team Rocket's Pokémon";
  else if (lower.includes('basic team rocket')) {
    what = "Basic Team Rocket's Pokémon";
    const m = lower.match(/up to\s+(\d+)/);
    if (m) count = Number(m[1]);
  } else if (lower.includes('up to 3') && lower.includes('basic')) {
    what = 'Basic Pokémon';
    count = 3;
  } else if (lower.includes('mega evolution pokémon ex')) what = 'Mega Evolution Pokémon ex';
  else if (/search your deck for (?:an?|up to\s+(\d+))\s+evolution pok[ée]mon/i.test(lower) && !lower.includes('mega evolution')) {
    const evoMatch = lower.match(/search your deck for (?:an?|up to\s+(\d+))\s+evolution pok[ée]mon/i);
    what = 'Evolution Pokémon';
    if (evoMatch && evoMatch[1]) count = Number(evoMatch[1]);
  } else if (
    /pok[ée]mon (?:that (?:doesn't|does not|don't|do not) have a rule box|without a rule box)/i.test(lower) ||
    (/(?:doesn't|does not|don't|do not) have a rule box|without a rule box/i.test(lower) && /pok[ée]mon/i.test(lower))
  ) {
    const isBasic = /\bbasic\b/i.test(lower);
    what = isBasic ? 'Basic Pokémon without a Rule Box' : 'Pokémon without a Rule Box';
    const m = lower.match(/up to\s+(\d+)/);
    if (m) count = Number(m[1]);
  }
  else if (lower.includes('supporter card')) what = 'Supporter';
  else if (lower.includes('trainer card')) what = 'Trainer';
  // Energy before generic Pokémon fallback (Misty's Vitality, etc.)
  else if (/up to\s+(\d+)\s+basic\s+\{[a-z]\}\s+energy/.test(lower)) {
    const m = lower.match(/up to\s+(\d+)\s+basic\s+(\{[a-z]\})\s+energy/);
    return {
      what: `Basic ${m[2].toUpperCase()} Energy`,
      count: Number(m[1]),
      destination,
      upTo: true,
      ...(reveal ? { reveal: true } : {}),
    };
  } else if (/up to\s+(\d+)\s+basic\s+energy/.test(lower)) {
    const m = lower.match(/up to\s+(\d+)\s+basic\s+energy/);
    return {
      what: 'Basic Energy',
      count: Number(m[1]),
      destination,
      upTo: true,
      ...(reveal ? { reveal: true } : {}),
    };
  } else if (lower.includes('basic') && lower.includes('energy') && !/\bor\b/.test(lower)) {
    const typed = lower.match(/basic\s+(\{[a-z]\})\s+energy/);
    const countMatch = lower.match(/up to\s+(\d+)/);
    if (countMatch) count = Number(countMatch[1]);
    what = typed ? `Basic ${typed[1].toUpperCase()} Energy` : 'Basic Energy';
  } else if (lower.includes('up to 4') && lower.includes('pokémon')) {
    what = 'Pokémon';
    count = 4;
  } else if (lower.includes('energy') && /\bor\b/.test(lower) && lower.includes('pokémon')) {
    what = 'Basic Energy or Basic Pokémon';
  } else if (lower.includes('pokémon')) what = 'Pokémon';

  return {
    what,
    count,
    destination,
    ...(/search your deck for up to\s+\d+/.test(lower) ? { upTo: true } : {}),
    ...(reveal ? { reveal: true } : {}),
  };
}

function parseCoinFlipStep(lower) {
  if (!lower.includes('flip a coin') && !lower.includes('flip 2 coins')) return null;

  // Tickling Machine — heads: the opponent's hand is set aside face down (returned at the
  // end of their next turn); tails: the turn ends immediately.
  if (/your opponent sets aside all the cards in (?:his or her|their) hand face down/.test(lower)) {
    return {
      type: 'coinFlip',
      heads: [{ type: 'opponentHandSetAside' }],
      tails: [{ type: 'turnEnds' }],
    };
  }

  // Minion of Team Rocket — both heads: return an opponent's Benched Pokémon and its
  // attached cards to their hand; otherwise the turn ends immediately.
  if (/flip 2 coins\. if both of them are heads, choose 1 of your opponent's bench/.test(lower)) {
    return {
      type: 'coinFlip',
      count: 2,
      headsAtLeast: 2,
      heads: [{ type: 'returnPokemonToHand', side: 'opponent', keepAttached: true }],
      tails: [{ type: 'turnEnds' }],
    };
  }

  const headsDraw = lower.match(/if heads,?\s+draw\s+(\d+)\s+cards?/);
  const tailsDraw = lower.match(/if tails,?\s+draw\s+(\d+)\s+cards?/);
  if (headsDraw && tailsDraw) {
    return {
      type: 'coinFlip',
      heads: { type: 'draw', count: Number(headsDraw[1]) },
      tails: { type: 'draw', count: Number(tailsDraw[1]) },
    };
  }

  if (lower.includes('search your deck')) {
    const headsMatch = lower.match(/if heads,?\s+(.+?)(?:\.\s*(?:if tails|then, shuffle)|$)/);
    const tailsMatch = lower.match(/if tails,?\s+(.+?)(?:\.\s*(?:then, shuffle)|$)/);
    let heads = null;
    let tails = null;
    if (headsMatch && headsMatch[1].includes('search')) {
      heads = { type: 'searchDeck', ...parseSearchDeckParams(headsMatch[1]) };
    }
    if (tailsMatch && tailsMatch[1].includes('search')) {
      tails = { type: 'searchDeck', ...parseSearchDeckParams(tailsMatch[1]) };
    }
    if (heads || tails) {
      return { type: 'coinFlip', heads, tails };
    }
  }

  // Energy Pickup — heads: attach a basic Energy from the discard pile
  if (/if heads, search your discard pile for a basic energy card and attach it/.test(lower)) {
    return { type: 'coinFlip', heads: [{ type: 'attachFromDiscard', energy: 'Basic Energy', target: '1 of your Pokémon' }], tails: [] };
  }
  // Super Rod — heads Evolution / tails Basic from the discard pile to hand
  if (/if heads, put an evolution card from your discard pile/.test(lower)) {
    return { type: 'coinFlip', heads: [{ type: 'recursion', what: 'Evolution', from: 'discard' }], tails: [{ type: 'recursion', what: 'Basic Pokémon', from: 'discard' }] };
  }
  // Good Rod — heads Pokémon / tails Trainer from discard to top of deck
  if (/if heads, search your discard pile for a pokémon/.test(lower)) {
    return { type: 'coinFlip', heads: [{ type: 'putDiscardOnTop', what: 'Pokémon' }], tails: [{ type: 'putDiscardOnTop', what: 'Trainer' }] };
  }
  // Heal Powder — heads: cure Special Conditions and remove 2 damage counters
  if (/if heads, your active pokémon is no longer asleep/.test(lower)) {
    return { type: 'coinFlip', heads: [{ type: 'clearStatus', target: 'yourActive' }, { type: 'healAmount', amount: 2, target: 'Active Pokémon' }], tails: [] };
  }

  const headsEnergy = lower.match(/if heads,?\s+discard an energy from 1 of your opponent's pokémon/);
  if (headsEnergy) {
    return {
      type: 'coinFlip',
      heads: [{ type: 'discardEnergyFromOpponent', energy: 'any Energy', count: 1, scope: '1 Pokémon' }],
      tails: [],
    };
  }

  const headsDmg = lower.match(/if heads,?\s+put\s+(\d+)\s+damage counters? on 1 of your opponent's pok[ée]mon/);
  const tailsDmg = lower.match(/if tails,?\s+put\s+(\d+)\s+damage counters? on (?:your active pok[ée]mon|1 of your pok[ée]mon)/);
  if (headsDmg && tailsDmg) {
    return {
      type: 'coinFlip',
      heads: [{ type: 'damageCounters', count: Number(headsDmg[1]), target: "1 of your opponent's Pokémon" }],
      tails: [{ type: 'damageCounters', count: Number(tailsDmg[1]), target: 'your Active Pokémon' }],
    };
  }

  // Tropical Tidal Wave — heads/tails discard all Trainer cards in play
  if (/discard all trainer/.test(lower) && /if tails/.test(lower)) {
    const excludeSupporters = /excluding supporter cards\)? you have in play/.test(lower);
    return {
      type: 'coinFlip',
      heads: [{ type: 'discardAllTrainerInPlay', side: 'opponent', excludeSupporters: false }],
      tails: [{ type: 'discardAllTrainerInPlay', side: 'self', excludeSupporters }],
    };
  }

  // Heads-only legacy variants: discard an opponent's Energy, switch the
  // opponent, return one of your Pokémon to hand, or put the opponent's Active
  // to Sleep. (Crushing Hammer, Energy Removal 2, Pokémon Reversal, Super Scoop
  // Up, Sleep!)
  if (/if heads/.test(lower)) {
    // Hooligans Jim & Cas / The Rocket's Trap — random cards from the
    // opponent's hand shuffled into their deck.
    const randHand = lower.match(/choose\s+(\d+)\s+random cards? from your opponent'?s? hand/);
    if (randHand) {
      return { type: 'coinFlip', heads: [{ type: 'opponentHandShuffleDeck', count: Number(randHand[1]), what: 'card' }], tails: [] };
    }
    const upToRandHand = lower.match(/choose up to (\d+) cards? at random from your opponent'?s? hand/);
    if (upToRandHand) {
      return { type: 'coinFlip', heads: [{ type: 'opponentHandShuffleDeck', count: Number(upToRandHand[1]), upTo: true, what: 'card' }], tails: [] };
    }
    // Life Herb — clear Special Conditions and remove N damage counters.
    const lifeHerb = lower.match(/remove all special conditions and (\d+) damage counters/);
    if (lifeHerb) {
      return { type: 'coinFlip', heads: [{ type: 'healAmount', amount: Number(lifeHerb[1]), target: '1 of your pokémon', cure: true }], tails: [] };
    }
    if (/choose 1 energy card attached to 1 of your opponent's pok[ée]mon and discard/.test(lower)) {
      return {
        type: 'coinFlip',
        heads: [{ type: 'discardEnergyFromOpponent', energy: 'any Energy', count: 1, scope: '1 Pokémon' }],
        tails: [],
      };
    }
    if (/discard an energy/.test(lower) && /opponent's pok[ée]mon/.test(lower)) {
      return {
        type: 'coinFlip',
        heads: [{ type: 'discardEnergyFromOpponent', energy: 'any Energy', count: 1, scope: '1 Pokémon' }],
        tails: [],
      };
    }
    if (/your opponent switches 1 of (?:his or her|their) active/.test(lower)) {
      return { type: 'coinFlip', heads: [{ type: 'switchOpponentOut' }], tails: [] };
    }
    if (/switch (?:it|that pok[ée]mon) with (?:your opponent's active|the defending pok[ée]mon)/.test(lower) ||
        (/choose 1 of your opponent's benched pok[ée]mon/.test(lower) && /switch/.test(lower))) {
      return { type: 'coinFlip', heads: [{ type: 'switchOpponent' }], tails: [] };
    }
    if (/put a card (?:in|from) your discard pile on top of your deck/.test(lower)) {
      return { type: 'coinFlip', heads: [{ type: 'putDiscardOnTop', what: 'card' }], tails: [] };
    }
    if (/return 1 of your pok[ée]mon/.test(lower) || /put 1 of your pok[ée]mon/.test(lower)) {
      const keepAttached = /(?:all attached cards|all cards attached)[^.]*?(?:into|to) your hand/.test(lower) ||
        lower.includes('and all attached cards');
      return { type: 'coinFlip', heads: [{ type: 'returnPokemonToHand', keepAttached }], tails: [] };
    }
    if (/defending pok[ée]mon is now asleep/.test(lower) || /opponent's active pok[ée]mon is now asleep/.test(lower)) {
      return {
        type: 'coinFlip',
        heads: [{ type: 'applyStatus', target: 'opponentActive', conditions: ['Asleep'] }],
        tails: [],
      };
    }
  }

  return null;
}

const PLAY_STAGE_WORDS = { basic: 'Basic', 'stage 1': 'Stage 1', 'stage 2': 'Stage 2' };

// Card-printed "only if …" / "you can't play this card if …" restrictions, as one condition
// string evaluated by trainer-play-conditions.mjs. Hand counts include the Trainer itself.
function parsePlayCondition(lower) {
  const oppPrizes = lower.match(/only if your opponent has\s+(\d+)\s+or fewer prize cards remaining/);
  if (oppPrizes) return `opponentPrizes<=${oppPrizes[1]}`;
  const exactPrizes = lower.match(/only if your opponent has exactly\s+(\d+)(?:\s+or\s+(\d+))?\s+prize cards remaining/);
  if (exactPrizes) return `opponentPrizes==${[exactPrizes[1], exactPrizes[2]].filter(Boolean).join('|')}`;
  if (/only if you have more prize cards (?:remaining|left) than your opponent/.test(lower)) {
    return 'morePrizesThanOpponent';
  }
  const lostZone = lower.match(/only if you have\s+(\d+)\s+or more cards in the lost zone/);
  if (lostZone) return `lostZone>=${lostZone[1]}`;
  if (lower.includes('only if there is any stadium card in play')) return 'stadiumInPlay';
  // Cyrus Prism Star: "only if your Active Pokémon is a {W} or {M} Pokémon."
  const ownActiveTypes = lower.match(
    /only if your active pokémon is a (?:\{([a-z])\} or )?\{([a-z])\} pokémon/
  );
  if (ownActiveTypes) {
    const symbols = [ownActiveTypes[1], ownActiveTypes[2]]
      .filter(Boolean)
      .map((s) => s.toUpperCase());
    return `activeType=${[...new Set(symbols)].join('|')}`;
  }
  const oppStage = lower.match(/only if your opponent's active pokémon is a (basic|stage 1|stage 2) pokémon/);
  if (oppStage) return `opponentActiveStage=${PLAY_STAGE_WORDS[oppStage[1]]}`;
  if (lower.includes("only if your opponent's active pokémon is poisoned")) return 'opponentActivePoisoned';
  const koed = lower.match(
    /only if (?:any of your|1 of your) (\{[a-z]\} |team rocket's )?pokémon (?:were|was) knocked out during your opponent's last turn/
  );
  if (koed) {
    const qualifier = (koed[1] || '').trim();
    if (!qualifier) return 'koedLastTurn';
    const symbol = qualifier.match(/^\{([a-z])\}$/);
    return symbol ? `koedLastTurn:type=${symbol[1]}` : `koedLastTurn:name=${qualifier}`;
  }
  if (/only when it is the last card in your hand/.test(lower)) return 'lastCardInHand';
  if (/can't play this card if you have any cards in your hand other than/.test(lower)) return 'onlyCopiesInHand';
  const fewerOthers = lower.match(/only if you have\s+(\d+)\s+or fewer other cards in your hand/);
  if (fewerOthers) return `handCount<=${Number(fewerOthers[1]) + 1}`;
  const tooMany = lower.match(/if you have\s+(\d+)\s+or more cards (?:\(including this one\) )?in your hand(?: \(including this one\))?, you can't play this card/)
    || lower.match(/can't play this card if you have\s+(\d+)\s+or more cards in your hand/);
  if (tooMany) return `handCount<=${Number(tooMany[1]) - 1}`;
  const moreThan = lower.match(/if you have more than\s+(\d+)\s+cards (?:\(including this one\) )?in your hand, you can't play this card/);
  if (moreThan) return `handCount<=${moreThan[1]}`;
  if (
    /if you have no other cards in your hand, you can't (?:use|play) this card/.test(lower) ||
    /if this is the only card in your hand, you can't play this card/.test(lower)
  ) {
    return 'handCount>=2';
  }
  if (/only if you go second, and only (?:during|on) your first turn/.test(lower)) return 'secondPlayerFirstTurn';
  if (/can use this card only during your first turn/.test(lower)) return 'firstTurnOnly';
  if (lower.includes("can't use this card during your first turn")) return 'notFirstTurn';
  return null;
}

/**
 * "… Your turn ends." as the card's closing sentence (Café Master, Kiawe, Rotom Bike, …).
 * Coin-conditional endings ("If tails, your turn ends immediately") are not this.
 */
export function trainerEndsTurn(card) {
  const text = String(card?.text || card?.effect || card?.cardText || '').trim();
  return /(?:^|[.!)]\s+)your turn ends\.$/i.test(text);
}

export function parseTrainerEffect(text = '') {
  const lower = normalizeText(text);
  const playCondition = parsePlayCondition(lower);
  const result = parseTrainerSteps(lower);
  if (/if you go first, you may (?:use|play) this card during your first turn/.test(lower)) {
    result.turnOnePermission = true;
  }
  return playCondition ? { ...result, playCondition } : result;
}

// Printed energy symbol → type word for typed discard costs.
const SYMBOL_ENERGY_WORDS = {
  g: 'grass',
  r: 'fire',
  w: 'water',
  l: 'lightning',
  p: 'psychic',
  f: 'fighting',
  d: 'darkness',
  m: 'metal',
  n: 'dragon',
  y: 'fairy',
  c: 'colorless',
};

// Costs printed in the first sentence are not part of every branch's parse, so
// lift them out in one wrapper:
//   "Discard N [other] cards from your hand."        (Sophocles, Plumeria, …)
//   "Discard N {X} Energy cards from your hand."     (Crasher Wake, Molayne, …)
// Only a leading, non-optional sentence counts — a later "discard" is an effect,
// not a cost, and "you may discard …" is optional (that needs a decline path).
// Branches that already emitted a discardCost win (no duplicates).
function appendLeadingHandDiscardCost(steps, lower) {
  if (steps.some((s) => s.type === 'discardCost')) return;
  const first = (lower.split('.')[0] || '').trim();
  const discardAt = first.indexOf('discard');
  if (discardAt < 0) return;
  if (/\bmay\b/.test(first.slice(0, discardAt))) return;
  const typed = first.match(/discard (\d+) \{([a-z])\} energy cards? from your hand/);
  if (typed) {
    const type = SYMBOL_ENERGY_WORDS[typed[2]];
    steps.unshift({
      type: 'discardCost',
      count: Number(typed[1]),
      energyOnly: true,
      basicOnly: true,
      ...(type ? { energyTypes: [type] } : {}),
    });
    return;
  }
  const plain = first.match(/discard (\d+) (?:other )?cards from your hand/);
  if (plain) steps.unshift({ type: 'discardCost', count: Number(plain[1]) });
}

// Primary switches some branches parse past (Switch Raft parses only its heal;
// Mallow & Lana already emits switchOwn). A "Choose 1:" card must NOT get this:
// its switch is an alternative mode, not a follow-up (Tate & Liza).
function appendMissingOwnSwitch(steps, lower) {
  if (steps.some((s) => s.type === 'switchOwn')) return;
  if (/\bchoose 1\b/.test(lower)) return;
  if (!/switch your active (?:\{[a-z]\} )?pokémon with 1 of your benched pokémon/.test(lower)) return;
  steps.unshift({ type: 'switchOwn' });
}

function parseTrainerSteps(lower) {
  const result = parseTrainerStepsInner(lower);
  if (result?.recognizable && Array.isArray(result.steps) && result.steps.length > 0) {
    appendLeadingHandDiscardCost(result.steps, lower);
    appendMissingOwnSwitch(result.steps, lower);
  }
  return result;
}

function parseTrainerStepsInner(lower) {
  const steps = [];

  // Lt. Surge's Bargain — opponent chooses: each player takes a Prize, or you draw
  if (lower.includes('ask your opponent if each player may take a prize card')) {
    const m = lower.match(/if no, you draw\s+(\d+)\s+cards?/);
    steps.push({ type: 'prizeBargain', drawCount: m ? Number(m[1]) : 4 });
    return { steps, recognizable: true };
  }

  // Salvatore — search for an Evolution that evolves from 1 of your Pokémon and evolve it
  if (lower.includes('evolves from 1 of your pokémon') && lower.includes('put it onto that pokémon')) {
    steps.push({ type: 'searchEvolve', ...(lower.includes('no abilities') ? { noAbilities: true } : {}) });
    return { steps, recognizable: true };
  }

  // Janine's Secret Art — for each chosen Pokémon, search a Basic Energy and attach it
  const eachAttach = lower.match(/choose up to\s+(\d+)\s+of your\s+(\{[a-z]\}\s+)?pokémon\. for each of those pokémon, search your deck for a basic\s+(\{[a-z]\}\s+)?energy/);
  if (eachAttach) {
    const typeSym = (eachAttach[2] || '').trim().toUpperCase();
    const energySym = (eachAttach[3] || '').trim().toUpperCase();
    steps.push({
      type: 'searchAttachEach',
      count: Number(eachAttach[1]),
      energy: energySym ? `Basic ${energySym} Energy` : 'Basic Energy',
      target: typeSym ? `1 of your ${typeSym} Pokémon` : '1 of your Pokémon',
      ...(lower.includes('active pokémon in this way, it is now poisoned') ? { poisonActive: true } : {}),
    });
    return { steps, recognizable: true };
  }

  // discard-hand-then-draw (Professor's Research)
  if (lower.includes('discard your hand and draw')) {
    const m = lower.match(/draw\s+(\d+)\s+cards?/);
    steps.push({ type: 'discardHandThenDraw', count: m ? Number(m[1]) : 7 });
    return { steps, recognizable: true };
  }

  // shuffle hand then draw (Lillie's Determination)
  if (lower.includes('shuffle your hand into your deck')) {
    // "Shuffle your hand into your deck [and/. Then,] flip a coin. If heads, draw X cards. If
    // tails, draw Y cards." (Professor Birch's Observations, Drasna, Gambler): the hand is
    // shuffled once and the coin picks the count. parseCoinFlipStep owns the heads/tails read.
    const flipDraw = parseCoinFlipStep(lower);
    if (flipDraw?.heads?.type === 'draw' && flipDraw?.tails?.type === 'draw') {
      steps.push({
        type: 'coinFlip',
        heads: [{ type: 'shuffleHandThenDraw', count: flipDraw.heads.count }],
        tails: [{ type: 'shuffleHandThenDraw', count: flipDraw.tails.count }],
      });
      return { steps, recognizable: true };
    }
    const m = lower.match(/draw\s+(\d+)\s+cards?/);
    const b = lower.match(/draw\s+(\d+)\s+cards?\s+instead/);
    steps.push({
      type: 'shuffleHandThenDraw',
      count: m ? Number(m[1]) : 6,
      bonusCount: b ? Number(b[1]) : null,
      bonusWhen: 'prizesRemaining==6',
    });
    return { steps, recognizable: true };
  }

  // Heads-only draw flips (Bug Catcher, Kahili-style): "Draw 2 cards. Flip a
  // coin. If heads, draw 2 more cards." The coin gate used to be dropped and
  // the heads draw ran unconditionally (audit S&M, Bug Catcher).
  {
    const headsOnly = lower.match(
      /flip a coin\. if heads,?\s+draw\s+(\d+)\s+(?:more\s+)?cards?/
    );
    if (headsOnly && !/if tails,?\s+draw/.test(lower)) {
      const leading = lower.match(/^\s*draw\s+(\d+)\s+cards?\b/);
      if (leading) steps.push({ type: 'draw', count: Number(leading[1]) });
      steps.push({
        type: 'coinFlip',
        heads: [{ type: 'draw', count: Number(headsOnly[1]) }],
        tails: [],
      });
      return { steps, recognizable: true };
    }
  }

  // coin flip (Picnicker, Poké Ball, Team Rocket's Great Ball) — before search/draw
  const coinFlip = parseCoinFlipStep(lower);
  if (coinFlip) {
    steps.push(coinFlip);
    return { steps, recognizable: true };
  }

  // put hand cards on bottom then draw (Kofu)
  if (lower.includes('from your hand on the bottom of your deck')) {
    const m = lower.match(/put\s+(\d+)\s+cards?\s+from your hand on the bottom/);
    steps.push({ type: 'putHandOnBottom', count: m ? Number(m[1]) : 1 });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Stadium once-per-turn text is not a one-shot trainer. Must beat
  // searchDeck / draw (Grand Tree: "once during each player's turn …
  // search your deck for a Stage 1"; Mesagoza draw-until; Factory draw).
  if (
    /once during (?:each|either) player/.test(lower) ||
    (/once per turn/.test(lower) && /that player may/.test(lower)) ||
    /this stadium stays in play/.test(lower)
  ) {
    return { steps: [{ type: 'passive', detail: passiveDetail(lower) }], recognizable: true };
  }

  // opponent shuffles hand to bottom then draws (Special Red Card)
  if (lower.includes('your opponent shuffles their hand') && lower.includes('bottom of their deck')) {
    const drawM = lower.match(/they draw\s+(\d+)\s+cards?/);
    const prizeM = lower.match(/only if your opponent has\s+(\d+)\s+or fewer prize cards remaining/);
    steps.push({
      type: 'opponentShuffleHandDraw',
      count: drawM ? Number(drawM[1]) : 3,
      prizeCondition: prizeM ? `opponentPrizes<=${prizeM[1]}` : null,
    });
    return { steps, recognizable: true };
  }

  // Red Card / Imposter Professor Oak — opponent shuffles hand into their deck,
  // then draws a fixed number (Reset Stamp's "for each Prize card" is variable
  // and stays unrecognized).
  if (/your opponent shuffles (?:his or her|their) hand into (?:his or her|their) deck/.test(lower)) {
    const drawM = lower.match(/draws?\s+(\d+)\s+cards?/);
    steps.push({ type: 'opponentShuffleHandDraw', count: drawM ? Number(drawM[1]) : 4, prizeCondition: null });
    appendDiscardCost(steps, lower);
    return { steps, recognizable: true };
  }

  // search deck → hand/bench/attach (with optional discard cost)
  if (lower.includes('search your deck for')) {
    const parsed = parseSearchDeckParams(lower);
    steps.push({ type: 'searchDeck', ...parsed });
    appendDiscardCost(steps, lower);
    // Compound effects: search-then-draw is common; append the trailing draw
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Missing Clover — the single mode only LOOKS at the top card; the generic
  // lookAtTop branch let the player take it and shuffled (review finding 7).
  // The 4-cards-at-once Prize mode needs multi-card play and is deferred.
  if (lower.includes('you may play 4 missing clover cards at once')) {
    steps.push({ type: 'peekReturn', count: 1 });
    return { steps, recognizable: true };
  }

  // look at top N (Pokégear, Grimsley's Move, Master Ball's "look at 7 cards
  // from the top")
  if (lower.includes('look at the top') || /look at \d+ cards? from the top/.test(lower)) {
    const m = lower.match(/top\s+(\d+)\s+cards?/) || lower.match(/look at (\d+) cards? from the top/);
    let pick = 'any';
    if (lower.includes('discard any number of them')) pick = 'discard';
    else if (lower.includes('supporter card')) pick = 'Supporter';
    else if (lower.includes('attach a basic energy')) pick = 'Basic Energy (attach)';
    else if (lower.includes('onto your bench')) pick = benchLookPick(lower);
    else if (lower.includes('basic pokémon or evolution card')) pick = 'Pokémon or Evolution';
    steps.push({
      type: 'lookAtTop',
      count: m ? Number(m[1]) : 7,
      pick,
      destination: lower.includes('onto your bench') ? 'bench' : 'hand',
      ...(lower.includes('put them on the bottom of your deck') ? { restToBottom: true } : {}),
    });
    // Compound effects: look-then-draw is common
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // look at bottom N (Dusk Ball, Underground Expedition)
  if (lower.includes('look at the bottom') || /look at (?:the )?\d+ cards? from the bottom/.test(lower)) {
    const m = lower.match(/bottom\s+(\d+)\s+cards?/) || lower.match(/look at (?:the )?(\d+) cards? from the bottom/);
    let pick = 'any';
    if (lower.includes('supporter card')) pick = 'Supporter';
    else if (lower.includes('onto your bench')) pick = benchLookPick(lower);
    else if (lower.includes('pokémon')) pick = 'Pokémon';
    else if (lower.includes('attach a basic energy')) pick = 'Basic Energy (attach)';
    steps.push({
      type: 'lookAtBottom',
      count: m ? Number(m[1]) : 7,
      pick,
      destination: lower.includes('onto your bench') ? 'bench' : 'hand',
    });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // switches (with optional trailing draw)
  if (matchesSwitchOpponentIn(lower)) {
    // Giovanni: switch your own Team Rocket's Pokémon, then the opponent's.
    if (lower.includes('switch your active') && lower.includes('switch in 1 of your opponent')) {
      steps.push({ type: 'switchOwn' });
      steps.push({ type: 'switchOpponent' });
    } else {
      const condition = lower.match(/the new active pokémon is now (burned|confused|poisoned|asleep|paralyzed)/);
      steps.push({
        type: 'switchOpponent',
        ...(lower.includes("opponent's benched basic pokémon") ? { filter: 'Basic' } : {}),
        ...(condition ? { thenCondition: condition[1][0].toUpperCase() + condition[1].slice(1) } : {}),
      });
      // Guzma: "If you do, switch your Active Pokémon with 1 of your Benched Pokémon."
      if (/if you do, switch your active pok[ée]mon with 1 of your benched pok[ée]mon/.test(lower)) {
        steps.push({ type: 'switchOwn' });
      }
    }
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }
  // Warp Point / Double Gust — both Active Pokémon are switched for a Benched
  // one (each player chooses their own replacement)
  if (
    /your opponent switches the defending pokémon with 1 of (?:his or her|their) benched/.test(lower) ||
    (/switches it with his or her active pokémon/.test(lower) && /you switch 1 of them with your active/.test(lower)) ||
    (/switches it with your active pokémon/.test(lower) && /switch it with his or her active pokémon/.test(lower))
  ) {
    steps.push({ type: 'switchOwn' });
    steps.push({ type: 'switchOpponentOut' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Warp Point — your opponent switches their Active out, then you switch yours
  if (/your opponent switches 1 of (?:his or her|their) (?:active|defending) pok[ée]mon/.test(lower) &&
      /you switch 1 of your active pok[ée]mon/.test(lower)) {
    steps.push({ type: 'switchOpponentOut' });
    steps.push({ type: 'switchOwn' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  if ((lower.includes('switch your active pokémon with 1 of your benched pokémon') ||
      lower.includes("switch your active team rocket's pokémon") ||
      lower.includes('switch 1 of your active pokémon with 1 of your benched pokémon') ||
      lower.includes('switch 1 of your own benched pokémon with your active pokémon') ||
      lower.includes('switch 1 of your benched pokémon with your active pokémon')) &&
      !lower.includes('opponent switches') && !lower.includes("opponent's")) {
    steps.push({ type: 'switchOwn' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // your opponent switches their own Active out (Pokémon Circulator, Repel).
  // Coin-flip heads versions are handled earlier.
  if (/your opponent switches (?:1 of )?(?:his or her|their) (?:active|defending) pok[ée]mon/.test(lower)) {
    steps.push({ type: 'switchOpponentOut' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Legacy gust wording — "Switch your opponent's Active Pokémon with 1 of his
  // or her Benched Pokémon." (Pokémon Catcher). Unlike Repel/Circulator the
  // player playing the card chooses, so this is switchOpponent.
  if (/switch your opponent's active pok[ée]mon with (?:1 of )?(?:his or her|their) benched/.test(lower)) {
    steps.push({ type: 'switchOpponent' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Escape Rope: each player switches their own Active with a Benched Pokémon, and
  // the player who played the card switches first. Modelled as two sequential switch
  // steps so each seat gets its own click-the-card choice (server authority) / picker.
  if (
    /each player switches (?:their|his or her) active pok[ée]mon with 1 of (?:their|his or her) benched pok[ée]mon/.test(
      lower
    )
  ) {
    steps.push({ type: 'switchOwn' });
    steps.push({ type: 'switchOpponentOut' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // legacy recursion — "Search your discard pile for X, show it to your
  // opponent, and put it into your hand." (VS Seeker, Junk Arm, Fisherman,
  // Pokémon Rescue). The wording never contains "from your discard pile".
  if (
    lower.includes('search your discard pile for') &&
    /put (?:it|them) into your hand/.test(lower) &&
    !lower.includes('into your deck')
  ) {
    steps.push({ type: 'recursion', what: discardSearchWhat(lower), from: 'discard' });
    appendDiscardCost(steps, lower);
    return { steps, recognizable: true };
  }

  // legacy discard → deck — "Search your discard pile for X … shuffle them
  // into your deck." (Energy Returner, Night Maintenance, Palmer's Contribution)
  if (lower.includes('search your discard pile for') && lower.includes('into your deck')) {
    steps.push({
      type: 'shuffleFromDiscard',
      what: discardSearchWhat(lower).replace(' or Basic Energy', ''),
      count: discardSearchCount(lower),
    });
    return { steps, recognizable: true };
  }

  // recursion from discard (Night Stretcher, Lana's Aid)
  if (lower.includes('from your discard pile into your hand')) {
    // "Put up to 4 in any combination of {F} Pokémon and Basic {F} Energy cards
    // from your discard pile into your hand." (Tarragon) — a count plus a
    // two-clause filter, which the plain branch below drops (it saw `what:
    // 'card'` and a single-card pick).
    const combo = lower.match(
      /put up to (\d+) in any combination of (.+?) cards? from your discard pile into your hand/
    );
    if (combo) {
      steps.push({
        type: 'recursion',
        what: combinationDiscardWhat(combo[2]),
        count: Number(combo[1]),
        from: 'discard',
      });
      appendTrailingDraw(steps, lower);
      return { steps, recognizable: true };
    }
    let what = 'card';
    if (lower.includes('pokémon or a basic energy')) what = 'Pokémon or Basic Energy';
    else if (
      (lower.includes("doesn't have a rule box") || lower.includes("don't have a rule box") || lower.includes('without a rule box')) &&
      lower.includes('basic energy')
    ) {
      what = 'Pokémon without a Rule Box or Basic Energy';
    }
    steps.push({ type: 'recursion', what, from: 'discard' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // heal a fixed amount (Pokémon Center Lady, Jumbo Ice Cream)
  if (/heal\s+(\d+)\s+damage/.test(lower)) {
    const m = lower.match(/heal\s+(\d+)\s+damage/);
    steps.push({
      type: 'healAmount',
      amount: Number(m[1]),
      target: lower.includes('each of your pokémon')
        ? 'each of your Pokémon'
        : lower.includes('active pokémon') ? 'Active Pokémon' : '1 of your Pokémon',
      cure: lower.includes('special condition'),
    });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Max Potion — heal all damage, then discard that Pokémon's Energy. The
  // discard-all clause had no step, so the heal ran but the printed cost did
  // not (audit S&M, §2). healOneDiscardEnergy already had the exact shape.
  if (
    lower.includes('heal all damage') &&
    /discard all energy (?:cards? )?(?:from|attached to) (?:that|this) pokémon/.test(lower)
  ) {
    steps.push({ type: 'healOneDiscardEnergy' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // heal all damage (Wally's Compassion)
  if (lower.includes('heal all damage')) {
    steps.push({ type: 'heal', target: lower.includes('mega evolution') ? 'Mega Evolution Pokémon ex' : 'Pokémon' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // remove a fixed number of damage counters from one Pokémon (Potion,
  // Bertha's Warmth). Anchored at the start of the text so coin-flip /
  // "for each heads" / conditional removals (Moomoo Milk, Life Herb, Hyper
  // Potion) are not mistaken for an unconditional heal.
  const removeCounters = lower.match(/^remove (?:up to )?(\d+) damage counters? from 1 of your pokémon/);
  if (removeCounters) {
    steps.push({
      type: 'healAmount',
      amount: Number(removeCounters[1]),
      target: '1 of your Pokémon',
    });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // attach multiple from discard (Philippe — up to N typed Energy to one Pokémon)
  if (
    /\battach\s+(?:up to\s+)?\d+\b/.test(lower) &&
    lower.includes('energy') &&
    lower.includes('from your discard pile')
  ) {
    const countMatch = lower.match(/attach\s+(?:up to\s+)?(\d+)/);
    const count = countMatch ? Number(countMatch[1]) : 2;
    const type = parseEnergyType(lower);
    const energy = type ? `Basic ${type} Energy` : 'Basic Energy';
    let target = '1 of your Pokémon';
    if (type && lower.includes(`${type.toLowerCase()} pokémon`)) target = `1 of your ${type} Pokémon`;
    else if (lower.includes('stage 2 pokémon')) target = '1 of your Stage 2 Pokémon';
    else if (lower.includes('benched')) target = '1 of your Benched Pokémon';
    steps.push({ type: 'attachMultipleFromDiscard', count, energy, target });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // attach from discard (Wondrous Patch, Glass Trumpet, N's PP Up, Metal
  // Saucer, Aqua Patch — the older wording omits "basic").
  if (lower.includes('attach') && lower.includes('energy') && lower.includes('from your discard pile')) {
    const typedEnergy = lower.match(/attach\s+(?:a\s+)?(?:basic\s+)?(\{[a-z]\})\s+energy/);
    const energy = typedEnergy ? `Basic ${typedEnergy[1].toUpperCase()} Energy` : 'Basic Energy';
    let target;
    if (lower.includes('up to 2') && lower.includes('benched')) target = 'up to 2 of your Benched {C} Pokémon';
    else if (typedEnergy && lower.includes(`${typedEnergy[1]} pokémon`)) target = `1 of your Benched ${typedEnergy[1].toUpperCase()} Pokémon`;
    else if (lower.includes("n's pokémon")) target = "1 of your Benched N's Pokémon";
    else target = '1 of your Benched Pokémon';
    steps.push({ type: 'attachFromDiscard', energy, target });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Judge — each player shuffles their hand into their deck and draws a fixed number
  const eachDraws = lower.match(/each player shuffles their hand into their deck and draws\s+(\d+)\s+cards?/);
  if (eachDraws) {
    steps.push({ type: 'ionoShuffle', drawCount: Number(eachDraws[1]) });
    return { steps, recognizable: true };
  }

  // both players shuffle hands (Iono — matches both the SV wording
  // "each player shuffles their hand" and PAL 185
  // "each player shuffles the cards in their hand into their deck")
  if (lower.includes('each player shuffles') && lower.includes('hand')) {
    const isBottom = lower.includes('bottom of their deck');
    const hasExplicitDraw = Boolean(lower.match(/draw\s+\d+/i) || lower.match(/opponent draws?\s+\d+/i));
    const isPrizeDraw = lower.includes('prize card') || !hasExplicitDraw;
    steps.push({
      type: 'ionoShuffle',
      ...(isBottom ? { bottom: true } : {}),
      ...(isPrizeDraw ? { drawPrizes: true } : {}),
    });
    appendTrailingDraw(steps, lower);
    // Archer: "you draw 5 cards, and your opponent draws 3 cards"
    const oppDraw = lower.match(/your opponent draws?\s+(\d+)\s+cards?/i);
    if (oppDraw) steps.push({ type: 'opponentDraw', count: Number(oppDraw[1]) });
    return { steps, recognizable: true };
  }

  // draw until you have N (standalone — Iris's Fighting Spirit, Ariana,
  // Professor Birch's "draw cards from your deck until you have 6")
  if (/draw\s+cards(?:\s+from\s+your\s+deck)?\s+until\s+you have/.test(lower)) {
    const bonus = drawUntilBonus(lower);
    steps.push({
      type: 'drawUntil',
      target: drawUntilTarget(lower),
      ...(bonus ? { bonusTarget: bonus.target, bonusWhen: bonus.when } : {}),
    });
    appendDiscardCost(steps, lower);
    return { steps, recognizable: true };
  }

  // ── choice-based / guided actions (recognized, not auto-executed) ──────
  // These are discrete player actions. They are matched BEFORE the passive
  // fallback and the bare-draw fallback so they are never swallowed.

  // Rare Candy / Pokémon Breeder — evolve a Basic directly to Stage 2,
  // skipping Stage 1
  if (lower.includes('skipping the stage 1') ||
      (lower.includes('stage 1 or stage 2') && lower.includes('evolves from that pokémon')) ||
      (lower.includes('stage 2 evolution card from your hand') && lower.includes('matching basic')) ||
      (lower.includes('stage 2 card in your hand') && lower.includes('evolve'))) {
    steps.push({ type: 'evolveStage2', source: 'hand', skipStage: 1 });
    return { steps, recognizable: true };
  }

  // Energy Switch — move a Basic Energy between your own Pokémon
  // N's Plan — move Energy from Bench to Active (must precede generic moveEnergy)
  if (lower.includes('move up to') && lower.includes('energy') &&
      lower.includes('benched') && lower.includes('active')) {
    const countMatch = lower.match(/move up to\s+(\d+)/);
    steps.push({
      type: 'moveEnergyToActive',
      count: countMatch ? Number(countMatch[1]) : 2,
    });
    return { steps, recognizable: true };
  }

  if (lower.includes('move a basic energy')) {
    steps.push({ type: 'moveEnergy' });
    return { steps, recognizable: true };
  }

  // move Energy between your own Pokémon — generic wording (Poppy, Tag Switch,
  // Lucian's Assignment, Misty's Water Command). Multi Switch moves Bench →
  // Active and is modelled as moveEnergyToActive.
  if (lower.startsWith('move') && lower.includes('energy') &&
      !lower.includes('opponent') && !lower.includes('damage counter')) {
    if (lower.includes('benched') && lower.includes('active')) {
      const m = lower.match(/move (?:up to\s+)?(\d+)/);
      steps.push({ type: 'moveEnergyToActive', count: m ? Number(m[1]) : 1 });
    } else {
      steps.push({ type: 'moveEnergy' });
    }
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Sabrina — move all Energy between two specific Pokémon (modelled as moveEnergy)
  if (/take all energy cards attached to 1 of your pokémon .*attach them to another/.test(lower)) {
    steps.push({ type: 'moveEnergy' });
    return { steps, recognizable: true };
  }

  // Strange Timepiece — devolve an evolved Pokémon. Matched specifically
  // ("devolve 1 of your …") so a Stadium that merely mentions the word
  // (e.g. Dizzying Valley: "…when they evolve or devolve.") stays passive.
  if (lower.includes('devolve 1 of your') ||
      lower.includes('take the highest stage evolution card from that pokémon') ||
      lower.includes('discard all evolution cards of that stage or higher')) {
    steps.push({ type: 'devolve', target: lower.includes('{p}') ? '1 of your evolved {P} Pokémon' : '1 of your evolved Pokémon' });
    return { steps, recognizable: true };
  }

  // Tool Scrapper / Field Blower — discard up to 2 attached Pokémon Tools
  // (Field Blower's Stadium half is not modelled here)
  if (lower.includes('pokémon tools attached to pokémon') ||
      lower.includes('pokémon tool cards attached to pokémon in play') ||
      lower.includes('combination of pokémon tool cards and stadium cards in play')) {
    steps.push({ type: 'discardTools', count: 2 });
    return { steps, recognizable: true };
  }

  // Startling Megaphone — discard all Tools from each opponent Pokémon
  if (lower.includes('discard all pokémon tool cards attached to each')) {
    steps.push({ type: 'discardTools', count: 8 });
    return { steps, recognizable: true };
  }

  // Blowtorch — discard a Tool/Special Energy from an opponent's Pokémon,
  // or a Stadium in play (opponent-facing, choice-based)
  if (lower.includes('discard a pokémon tool or special energy')) {
    steps.push({ type: 'discardFromOpponent', target: "a Pokémon Tool or Special Energy from 1 of your opponent's Pokémon, or a Stadium in play" });
    return { steps, recognizable: true };
  }

  // Repel — switch OUT the opponent's Active Pokémon (distinct from
  // switchOpponent, which switches an opponent's benched Pokémon IN)
  if (lower.includes("switch out your opponent's active pokémon")) {
    steps.push({ type: 'switchOpponentOut' });
    return { steps, recognizable: true };
  }

  // Fossil items — played as Basic Pokémon in play
  if (lower.includes('play this card as if it were') && lower.includes('basic')) {
    const hpMatch = lower.match(/(\d+)-hp/);
    steps.push({ type: 'fossilItem', hp: hpMatch ? Number(hpMatch[1]) : 60 });
    return { steps, recognizable: true };
  }

  // Scoop Up Cyclone / Professor Turo's Scenario / Cheren's Care / Poké Turn /
  // Penny / Mr. Briney's Compassion / Scoop Up — return one of your Pokémon
  // (optionally of a type) to your hand
  const returnYourPokemon =
    /^(?:put|return) 1 of your (?:basic |\{[a-z]\} )?pokémon/.test(lower) ||
    /return that pokémon(?: and all cards attached to it)? to your hand/.test(lower) ||
    /and return its basic pokémon card to your hand/.test(lower);
  if (returnYourPokemon &&
      (lower.includes('into your hand') || lower.includes('to your hand'))) {
    const keepAttached = /(?:all attached cards|all cards attached)[^.]*?(?:into|to) your hand/.test(lower) ||
      lower.includes('and all attached cards');
    steps.push({ type: 'returnPokemonToHand', keepAttached });
    return { steps, recognizable: true };
  }

  // Revive / Echoing Horn / Target Whistle — put a Basic Pokémon from a discard
  // pile onto a Bench (yours, or the opponent's for the gust tools)
  if (/put (?:a|1) basic pok[ée]mon(?: card)? from (?:your|your opponent's) discard pile onto/.test(lower) ||
      /choose 1 basic pok[ée]mon card from your opponent's discard pile and put it onto/.test(lower)) {
    steps.push({
      type: 'reviveFromDiscard',
      what: 'Basic Pokémon',
      side: lower.includes("opponent's discard pile") ? 'opponent' : 'own',
    });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Move damage counters between Pokémon (Damage Pump, Agatha, Grimsley,
  // Damage Mover)
  {
    const mv = lower.match(
      /move (?:up to )?(\d+) damage counters? from (your active pok[ée]mon|1 of your pok[ée]mon|1 of your opponent's pok[ée]mon) to (your other pok[ée]mon|another of your pok[ée]mon|your opponent's active pok[ée]mon|another of their pok[ée]mon)/
    );
    if (mv) {
      const from = mv[2].includes("opponent's") ? 'opponent'
        : mv[2].includes('active') ? 'ownActive' : 'own';
      const to = mv[3].includes("opponent's active") ? 'opponentActive'
        : mv[3].includes('their') ? 'opponent' : 'own';
      steps.push({ type: 'moveDamageCounters', count: Number(mv[1]), from, to });
      return { steps, recognizable: true };
    }
  }

  // Bare reveal of the opponent's hand (Hand Scope, Alph Lithograph)
  if (/^(?:look at your opponents?['’]?s? hand|your opponent reveals (?:his or her|their) hand)[.!]?$/.test(lower)) {
    steps.push({ type: 'lookAtOpponentHand' });
    return { steps, recognizable: true };
  }

  // Super Potion — discard an own Energy as a cost, then remove damage counters
  // (the Energy cost is not enforced by the executor)
  {
    const potion = lower.match(/in order to remove (?:up to )?(\d+) damage counters/);
    if (potion) {
      steps.push({ type: 'healAmount', amount: Number(potion[1]), target: '1 of your Pokémon' });
      return { steps, recognizable: true };
    }
  }

  // Attach Energy from your hand (Bede, Brock's Training, Flint's Willpower,
  // The Masked Royal, Zinnia, Welder). The typed symbol form ("attach up to 2
  // {R} Energy cards") used to miss this branch entirely (audit S&M, §2).
  {
    const at = lower.match(
      /attach (?:up to )?(\d+|a|an)?\s*(?:\{([a-z])\}\s*)?(basic\s*)?(?:\{([a-z])\}\s*)?energy cards? from your hand/
    );
    if (at) {
      const raw = at[1] || '1';
      const count = raw === 'a' || raw === 'an' ? 1 : Number(raw);
      let target = '1 of your Pokémon';
      if (lower.includes('benched')) target = '1 of your Benched Pokémon';
      else if (lower.includes('stage 2')) target = '1 of your Stage 2 Pokémon';
      const symbol = at[2] || at[4];
      const typeWord = symbol ? SYMBOL_ENERGY_WORDS[symbol] : null;
      const basic = Boolean(at[3] || typeWord);
      // Gardenia's Vigor prints "Draw 2 cards. If you drew any cards in this
      // way, attach …": the draw leads and the attach follows it (review 5).
      const leadingDraw = lower.match(/^\s*draw\s+(\d+)\s+cards?/);
      if (leadingDraw) steps.push({ type: 'draw', count: Number(leadingDraw[1]) });
      steps.push({
        type: 'attachFromHand',
        count,
        energy: basic ? 'Basic Energy' : 'Energy',
        target,
        handCount: count,
        handTarget: target.toLowerCase(),
        handEnergy: typeWord ? { basic: true, types: [typeWord] } : basic ? { basic: true } : {},
      });
      if (!leadingDraw) appendTrailingDraw(steps, lower);
      return { steps, recognizable: true };
    }
  }

  // Cube / Technical Machine items — attach this card to a Pokémon that may
  // then use the attack printed on it
  if (/attach this card to 1 of your .*pok[ée]mon/.test(lower) && lower.includes("this card's attack")) {
    steps.push({
      type: 'attachAttackTool',
      target: '1 of your Pokémon',
      discardAtEndOfTurn: /at the end of your turn/.test(lower),
    });
    return { steps, recognizable: true };
  }

  // Turn Prize cards face up (Town Map, Here Comes Team Rocket!, Alph Lithograph)
  if (/turns? (?:all of )?(?:your|his or her|their) prize cards face up/.test(lower) ||
      /plays with (?:his or her|their) prize cards face up/.test(lower) ||
      /look at all of your face ?down prize cards/.test(lower)) {
    steps.push({ type: 'revealPrizes', scope: lower.includes('each player') ? 'all' : 'own' });
    return { steps, recognizable: true };
  }

  // Take Prize cards into hand (Peonia, Gladion)
  if (/put up to (\d+) prize cards? into your hand/.test(lower)) {
    const m = lower.match(/put up to (\d+) prize cards? into your hand/);
    steps.push({ type: 'prizeToHand', count: Number(m[1]), replace: lower.includes('face down as a prize card') });
    return { steps, recognizable: true };
  }
  if (lower.includes('put 1 of them into your hand') && lower.includes('face-down prize')) {
    steps.push({ type: 'prizeToHand', count: 1, replace: false });
    return { steps, recognizable: true };
  }

  // Full Heal / Double Full Heal — clear Special Conditions (not coin-based)
  if (!lower.includes('flip a coin') && !lower.includes('flip 2 coins') &&
      (/remove all special conditions from (?:your active|each of your active|all of your)/.test(lower) ||
       /(?:is|are) no longer (?:asleep|confused|paralyzed|poisoned|burned)/.test(lower))) {
    steps.push({
      type: 'clearStatus',
      target: /each of your|all of your pokémon|each player/.test(lower) ? 'allYourPokémon' : 'yourActive',
    });
    return { steps, recognizable: true };
  }

  // Discard a Stadium in play (Paint Roller, Delinquent, Bonnie)
  if (/(?:discard|remove) any stadium card in play/.test(lower) || /discard that stadium card/.test(lower)) {
    steps.push({ type: 'discardStadium' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // Alph Lithograph — return a Stadium in play to its owner's hand
  if (/return any stadium card in play to its player'?s? hand/.test(lower)) {
    steps.push({ type: 'returnStadiumToHand' });
    return { steps, recognizable: true };
  }

  // Alph Lithograph — only "SHUFFLE YOUR DECK!"
  if (/^\s*shuffle your deck!?\s*$/.test(lower)) {
    steps.push({ type: 'shuffleDeckOnly' });
    return { steps, recognizable: true };
  }

  // Channeler / Pokémon Ranger — remove all effects of attacks
  if (/remove all effects of attacks on/.test(lower)) {
    steps.push({ type: 'clearAttackEffects', scope: /each player/.test(lower) ? 'all' : 'own' });
    return { steps, recognizable: true };
  }

  // Reveal from the top until you find a card (Random Receiver, Quick Ball, Fast Ball)
  {
    const m = lower.match(/reveal cards from (?:the top of )?your deck until you reveal an? ([a-zé ]+?)(?: card)?[.,]/);
    if (m) {
      steps.push({ type: 'revealUntilCard', what: m[1].trim() });
      appendTrailingDraw(steps, lower);
      return { steps, recognizable: true };
    }
  }

  // Hisuian Heavy Ball / Beast Ball — trade a face-down Prize for a revealed card
  if (/look at your face-down prize cards/.test(lower)) {
    steps.push({
      type: 'lookAtFaceDownPrize',
      what: /ultra beast/.test(lower) ? 'Ultra Beast' : 'Basic',
      replace: /put this .* in its place/.test(lower),
      // Daisy's Help only looks; the Ball cards take a matching card into hand.
      take: /put it into your hand/.test(lower),
    });
    return { steps, recognizable: true };
  }

  // Lt. Surge — put a Basic from hand into play as your Active, old Active to Bench
  if (/put a basic pokémon card from your hand into play as your active pokémon/.test(lower)) {
    steps.push({ type: 'putHandBasicAsActive' });
    return { steps, recognizable: true };
  }

  // Max Revive — put a Pokémon from your discard pile on top of your deck
  if (/put a pokémon from your discard pile on top of your deck/.test(lower)) {
    steps.push({ type: 'putDiscardOnTop', what: 'Pokémon' });
    return { steps, recognizable: true };
  }

  // Energy Reset / Energy Flow — return attached Energy to hand
  if (/put as many energy attached to your pokémon as you like into your hand/.test(lower)) {
    steps.push({ type: 'energyToHand', scope: 'allYour' });
    return { steps, recognizable: true };
  }
  if (/return any number of energy cards attached to it to your hand/.test(lower)) {
    steps.push({ type: 'energyToHand', scope: 'eachYour' });
    return { steps, recognizable: true };
  }

  // Mr. Fuji / Cassius — shuffle one of your Pokémon (and its attachments) into deck
  if (/shuffle 1 of your pokémon and all cards attached to it into your deck/.test(lower) ||
      /shuffle it and any cards attached to it into your deck/.test(lower)) {
    steps.push({
      type: 'shufflePokemonIntoDeck',
      ...(/pokémon on your bench/.test(lower) ? { benchOnly: true } : {}),
    });
    return { steps, recognizable: true };
  }

  // Volo / Giovanni's Exile — discard own Benched Pokémon (and attachments)
  if (/discard 1 of your benched pokémon v and all attached cards/.test(lower)) {
    steps.push({ type: 'discardOwnBenchPokemon', count: 1, filter: 'V' });
    return { steps, recognizable: true };
  }
  {
    const exile = lower.match(/discard up to (\d+) of your benched pokémon that have no damage counters/);
    if (exile) {
      steps.push({ type: 'discardOwnBenchPokemon', count: Number(exile[1]), filter: 'no damage counters' });
      return { steps, recognizable: true };
    }
  }

  // Karen / Lysandre's Trump Card — each player shuffles their discard pile into deck
  {
    const m = lower.match(/each player shuffles all (pokémon|cards) in (?:his or her|their) discard pile into (?:his or her|their) deck/);
    if (m) {
      steps.push({
        type: 'shuffleDiscardIntoDeck',
        scope: 'each',
        what: m[1] === 'pokémon' ? 'Pokémon' : 'all',
      });
      return { steps, recognizable: true };
    }
  }

  // Surprise Box / Return Label — move a card from the opponent's discard pile
  if (/put a card from your opponent's discard pile into their hand/.test(lower)) {
    steps.push({ type: 'opponentDiscardToHand' });
    return { steps, recognizable: true };
  }
  if (/put a card from your opponent's discard pile on the bottom of their deck/.test(lower)) {
    steps.push({ type: 'opponentDiscardToDeckBottom' });
    return { steps, recognizable: true };
  }

  // Ogre's Mask / Transformation Tome — swap in-play Pokémon with discard counterpart
  if (lower.includes('in your discard pile') && lower.includes('switch it with') &&
      lower.includes('in play')) {
    let filter = 'Pokémon';
    if (lower.includes('basic pokémon')) filter = 'Basic Pokémon';
    else if (lower.includes('ogerpon')) filter = 'Pokémon ex (Ogerpon)';
    steps.push({ type: 'swapWithDiscard', filter });
    return { steps, recognizable: true };
  }

  // Megaton Blower — mass discard opponent Tools/Special Energy + Stadium
  if (lower.includes('discard all pokémon tools and special energy') &&
      lower.includes("opponent's pokémon")) {
    steps.push({ type: 'massDiscardAttached' });
    return { steps, recognizable: true };
  }

  // Ruffian — discard one Tool and one Special Energy from opponent's Pokémon
  if (lower.includes('discard a pokémon tool and a special energy') &&
      lower.includes("opponent's pokémon")) {
    steps.push({ type: 'discardToolAndSpecialEnergy' });
    return { steps, recognizable: true };
  }

  // Redeemable Ticket / Rotom Dex — count Prize cards, shuffle into deck, redraw
  if (/count(?:ing)? your prize cards/.test(lower) && /shuffle (?:them|those cards)/.test(lower)) {
    steps.push({ type: 'reshufflePrizes' });
    return { steps, recognizable: true };
  }

  // Accompanying Flute — reveal opponent deck top, bench Basic Pokémon
  if (lower.includes("opponent's deck") && (lower.includes('onto their bench') || lower.includes("onto your opponent's bench"))) {
    const m = lower.match(/top\s+(\d+)\s+cards?/);
    steps.push({
      type: 'revealOpponentDeckBench',
      count: m ? Number(m[1]) : 5,
    });
    return { steps, recognizable: true };
  }

  // Team Rocket's Bother-Bot — face-up Prize + random hand swap
  if (lower.includes('face-down prize') && lower.includes('random card from your opponent')) {
    steps.push({ type: 'opponentPrizeHandSwap' });
    return { steps, recognizable: true };
  }

  // variable draw — one card per counted Pokémon (Awakening Drum, Morty's
  // Conviction, Emma, Jett)
  if (/draw\s+a\s+card\s+for\s+each/.test(lower)) {
    let source;
    if (lower.includes('ancient pokémon in play')) source = 'ancientInPlay';
    else if (lower.includes("opponent's benched basic pokémon")) source = 'opponentBenchBasic';
    else if (lower.includes("opponent's benched pokémon")) source = 'opponentBench';
    else if (lower.includes('opponent reveals their hand') && lower.includes('pokémon you find')) {
      source = 'opponentHandPokemon';
    } else if (lower.includes('opponent reveals their hand') && lower.includes('trainer card you find')) {
      source = 'opponentHandTrainer';
    } else if (lower.includes("opponent's mega evolution pokémon ex in play")) {
      source = 'opponentMegaExInPlay';
    } else if (lower.includes("opponent's pokémon in play")) {
      source = 'opponentPokemonInPlay';
    } else if (lower.includes('for each benched pokémon (both')) {
      source = 'allBench';
    }
    if (source) {
      steps.push({ type: 'variableDraw', source, per: 'card' });
      appendDiscardCost(steps, lower);
      return { steps, recognizable: true };
    }
  }

  // Steven's Advice — draw up to a number equal to the opponent's Pokémon in play
  if (/draw a number of cards up to the number of your opponent's pokémon in play/.test(lower)) {
    steps.push({ type: 'variableDraw', source: 'opponentPokemonInPlay', per: 'card' });
    return { steps, recognizable: true };
  }

  // Brassius — count hand, shuffle in, draw count+1
  if (
    lower.includes('count the cards in your hand') &&
    lower.includes('shuffle those cards into your deck') &&
    lower.includes('draw that many cards plus')
  ) {
    steps.push({ type: 'countShuffleDrawPlus' });
    return { steps, recognizable: true };
  }

  // shuffle from discard into deck (Energy Recycler, Sacred Ash, Great Haul
  // Net, Super Rod — "from your discard pile back into your deck")
  if (lower.includes('from your discard pile') && /(?:back )?into your deck/.test(lower)) {
    const countMatch = lower.match(/shuffle\s+(?:up to\s+)?(\d+)/);
    const count = countMatch ? Number(countMatch[1]) : 5;
    if (lower.includes('choose 1 or both')) {
      const choices = [];
      const pokemonMatch = lower.match(/shuffle\s+up\s+to\s+(\d+)\s+\{[a-z]\}\s+pokémon/);
      const energyMatch = lower.match(/shuffle\s+up\s+to\s+(\d+)\s+basic\s+\{[a-z]\}\s+energy/);
      if (pokemonMatch) {
        choices.push({ what: '{W} Pokémon', count: Number(pokemonMatch[1]) });
      }
      if (energyMatch) {
        choices.push({ what: 'Basic {W} Energy', count: Number(energyMatch[1]) });
      }
      steps.push({ type: 'shuffleFromDiscard', choices });
    } else {
      let what = 'card';
      if (lower.includes('pokémon') && lower.includes('basic energy')) what = 'Pokémon or Basic Energy';
      else if (lower.includes('basic energy')) what = 'Basic Energy';
      else if (lower.includes('pokémon')) what = 'Pokémon';
      steps.push({ type: 'shuffleFromDiscard', what, count });
    }
    return { steps, recognizable: true };
  }

  // apply Special Conditions (Dangerous Laser, Dark Bell, Yell Horn, Imakuni?)
  if ((lower.includes(' is now ') || lower.includes(' are now ')) && !lower.includes('flip a coin')) {
    const conditions = [];
    if (lower.includes('burned')) conditions.push('Burned');
    if (lower.includes('confused')) conditions.push('Confused');
    if (lower.includes('poisoned')) conditions.push('Poisoned');
    if (lower.includes('asleep')) conditions.push('Asleep');
    if (lower.includes('paralyzed')) conditions.push('Paralyzed');
    if (conditions.length) {
      if (lower.includes("opponent's active pokémon is now") || lower.includes("opponent's active pokémon are now")) {
        steps.push({ type: 'applyStatus', target: 'opponentActive', conditions });
        return { steps, recognizable: true };
      }
      if (/both active pokémon are now/.test(lower)) {
        steps.push({ type: 'applyStatus', target: 'bothActiveAll', conditions });
        return { steps, recognizable: true };
      }
      if (lower.includes('both active') && lower.includes('non-{d}') && lower.includes('confused')) {
        steps.push({ type: 'applyStatus', target: 'bothActiveNonDark', conditions: ['Confused'] });
        return { steps, recognizable: true };
      }
      if (/your active pokémon is now/.test(lower)) {
        steps.push({ type: 'applyStatus', target: 'ownActive', conditions });
        return { steps, recognizable: true };
      }
    }
  }

  // Eri — reveal opponent hand, discard Items found there
  if (lower.includes('opponent reveals their hand') && lower.includes('discard') && lower.includes('item')) {
    const m = lower.match(/discard up to (\d+) item cards?/);
    steps.push({
      type: 'revealOpponentHandDiscard',
      what: 'Item',
      count: m ? Number(m[1]) : 2,
      upTo: /discard up to \d+ item/.test(lower),
    });
    return { steps, recognizable: true };
  }

  // Ortega / Energy Swatter — reveal hand, put chosen card on bottom
  if (lower.includes('opponent reveals their hand') && lower.includes('bottom of their deck')) {
    const what = lower.includes('energy card') ? 'Energy' : 'card';
    const step = { type: 'opponentHandBottom', what };
    if (lower.includes('opponent may draw')) step.optionalOpponentDraw = true;
    steps.push(step);
    return { steps, recognizable: true };
  }

  // Peeking Red Card — optional: opponent shuffles their WHOLE hand into their
  // deck, then draws that many. The Morty branch below grabbed it and shuffled
  // 1 card with no draw (audit S&M, §2).
  if (/shuffle those cards into their deck, then draw that many cards/.test(lower)) {
    steps.push({ type: 'opponentHandShuffleDeck', what: 'card', all: true, drawThatMany: true });
    return { steps, recognizable: true };
  }

  // Morty / Team Rocket's Evil Deeds / Rocket's Sneak Attack — look at (or
  // reveal) the opponent's hand, then shuffle chosen card(s) into their deck.
  if (
    /shuffles? (?:that|those) cards? into (?:his or her|their) deck/.test(lower) &&
    /(?:look at your opponent'?s? hand|opponent reveals (?:their|his or her) hand)/.test(lower)
  ) {
    const m = lower.match(/choose\s+(\d+|up to \d+)\s+(?:cards?|of them)/);
    const step = {
      type: 'opponentHandShuffleDeck',
      count: m ? Number(m[1].replace(/[^0-9]/g, '')) : 1,
      what: lower.includes('trainer card') ? 'Trainer' : 'card',
    };
    if (m && /up to/.test(m[1])) step.upTo = true;
    if (lower.includes('opponent may draw')) step.optionalOpponentDraw = true;
    steps.push(step);
    return { steps, recognizable: true };
  }

  // Nita — put an Energy from the opponent's Active Pokémon on top of their deck
  if (/put an energy (?:from|attached to) your opponent'?s? active pokémon on top of (?:their|his or her) deck/.test(lower)) {
    steps.push({ type: 'opponentActiveEnergyToDeck' });
    return { steps, recognizable: true };
  }

  // Meddling Memo — opponent counts/shuffles hand to bottom, then redraws
  if (lower.includes('counts the cards in their hand') && lower.includes('bottom of their deck')) {
    steps.push({ type: 'opponentCountShuffleDraw' });
    return { steps, recognizable: true };
  }

  // Hand Trimmer — each player discards until N (opponent first)
  if (lower.includes('each player discards cards from their hand until they have')) {
    const m = lower.match(/until they have\s+(\d+)\s+cards? in their hand/);
    steps.push({
      type: 'eachPlayerDiscardUntil',
      count: m ? Number(m[1]) : 5,
      opponentFirst: lower.includes('opponent discards first'),
    });
    return { steps, recognizable: true };
  }

  // Xerosic's Machinations — opponent discards until N
  if (lower.includes('your opponent discards cards from their hand until they have')) {
    const m = lower.match(/until they have\s+(\d+)\s+cards? in their hand/);
    steps.push({
      type: 'opponentDiscardUntil',
      count: m ? Number(m[1]) : 3,
    });
    return { steps, recognizable: true };
  }

  // Opponent-hand Basic Pokémon placed onto the opponent's Bench (Erika's
  // Invitation, Captivating Poké Puff, Erika's Perfume)
  if (
    /put (?:a|any number of) basic pokémon you find there onto your opponent'?s? bench/.test(lower) ||
    (/look at your opponent'?s? hand/.test(lower) && /put any number of them onto your opponent'?s? bench/.test(lower))
  ) {
    steps.push({
      type: 'opponentHandToBenchBasic',
      anyNumber: lower.includes('any number'),
      switchActive: /switch in that pokémon/.test(lower),
    });
    return { steps, recognizable: true };
  }

  // Jessie & James — each player discards N from hand (opponent first)
  {
    const m = lower.match(/each player discards\s+(\d+)\s+cards? from (?:his or her|their) hand/);
    if (m) {
      steps.push({ type: 'eachPlayerDiscardFromHand', count: Number(m[1]), opponentFirst: /opponent discards first/.test(lower) });
      return { steps, recognizable: true };
    }
  }

  // Erika — each player draws up to N (you first)
  {
    const m = lower.match(/each player may draw up to\s+(\d+)\s+cards?/);
    if (m) {
      steps.push({ type: 'eachPlayerDraw', count: Number(m[1]) });
      return { steps, recognizable: true };
    }
  }

  // Seeker — each player returns 1 Benched Pokémon (and attachments) to hand
  if (/each player returns 1 of (?:his or her|their) benched pokémon/.test(lower)) {
    steps.push({ type: 'eachPlayerReturnBench' });
    return { steps, recognizable: true };
  }

  // Wicke — each player shuffles hand into deck, then draws that many
  if (/each player counts the cards in (?:his or her|their) hand, shuffles those cards into (?:his or her|their) deck, then draws that many/.test(lower)) {
    steps.push({ type: 'eachPlayerShuffleHandDraw' });
    return { steps, recognizable: true };
  }

  // Hugh — each player normalizes their hand to N by drawing or discarding
  {
    const m = lower.match(/each player either draws or discards? cards? until (?:he or she|they) has? (\d+) cards/);
    if (m) {
      steps.push({ type: 'eachPlayerHandToFive', count: Number(m[1]), opponentFirst: /opponent does this first/.test(lower) });
      return { steps, recognizable: true };
    }
  }

  // Buddy-Buddy Rescue — each player recovers a Pokémon from their discard
  if (/each player puts a pokémon from (?:his or her|their) discard pile into (?:his or her|their) hand/.test(lower)) {
    steps.push({ type: 'eachPlayerRecoverPokemon' });
    return { steps, recognizable: true };
  }

  // Psychic's Third Eye / Secret Mission — discard any number from hand, then draw that many
  if (
    /discard as many (?:other )?cards as you (?:like|want) from your hand and draw that many/.test(lower) ||
    /discard as many cards as you like from your hand\.? then,? draw that many/.test(lower)
  ) {
    if (/look at your opponent'?s? hand|opponent reveals (?:his or her|their) hand/.test(lower)) {
      steps.push({ type: 'lookAtOpponentHand' });
    }
    steps.push({ type: 'discardAnyThenDraw' });
    return { steps, recognizable: true };
  }

  // Ghetsis — opponent shuffles all Item cards from hand into deck; you draw that many
  if (/shuffles all item cards found there into (?:his or her|their) deck/.test(lower)) {
    steps.push({ type: 'opponentHandShuffleItemsDraw' });
    return { steps, recognizable: true };
  }

  // Chill Teaser Toy — return attached Energy to opponent's hand
  if (lower.includes("put an energy attached to 1 of your opponent's pokémon into their hand")) {
    steps.push({
      type: 'discardEnergyFromOpponent',
      energy: 'any Energy',
      count: 1,
      scope: '1 Pokémon',
      action: 'returnToHand',
    });
    return { steps, recognizable: true };
  }

  // Giacomo — discard Special Energy from each opponent Pokémon
  if (lower.includes('discard a special energy from each of your opponent')) {
    steps.push({
      type: 'discardEnergyFromOpponent',
      energy: 'Special Energy',
      count: 1,
      scope: 'each Pokémon',
    });
    return { steps, recognizable: true };
  }

  // Enhanced Hammer — discard Special Energy from 1 opponent Pokémon
  if (lower.includes('discard a special energy from 1 of your opponent')) {
    steps.push({
      type: 'discardEnergyFromOpponent',
      energy: 'Special Energy',
      count: 1,
      scope: '1 Pokémon',
    });
    return { steps, recognizable: true };
  }

  // "Choose 1 Energy card attached to 1 of your opponent's Pokémon and discard
  // it" (Energy Removal, Energy Removal 2)
  if (/choose 1 energy card attached to 1 of your opponent's pokémon and discard/.test(lower)) {
    steps.push({ type: 'discardEnergyFromOpponent', energy: 'any Energy', count: 1, scope: '1 Pokémon' });
    return { steps, recognizable: true };
  }

  // Discard an Energy "attached to" an opponent's Pokémon (Team Flare Grunt,
  // Enhanced Hammer, Plumeria). Optional preceding "discard N cards" cost.
  const oppAttachedEnergy = lower.match(/discard (?:a|an) (special )?energy (?:card )?attached to (?:1 of )?your opponent/);
  if (oppAttachedEnergy) {
    steps.push({
      type: 'discardEnergyFromOpponent',
      energy: oppAttachedEnergy[1] ? 'Special Energy' : 'any Energy',
      count: 1,
      scope: '1 Pokémon',
    });
    appendDiscardCost(steps, lower);
    return { steps, recognizable: true };
  }

  // Super Energy Removal — discard up to N Energy from an opponent's Pokémon
  {
    const removal = lower.match(/choose 1 of your opponent's pokémon and up to (\d+) energy cards attached to it/);
    if (removal) {
      steps.push({ type: 'discardEnergyFromOpponent', energy: 'any Energy', count: Number(removal[1]), scope: '1 Pokémon' });
      return { steps, recognizable: true };
    }
  }

  // Faba — choose an opponent Pokémon's Tool/Special Energy, or any Stadium,
  // and put it in the Lost Zone (the Xerosic branch below discarded instead).
  if (
    /choose a pokémon tool or special energy card attached to 1 of your opponent'?s pokémon, or any stadium card in play, and put it in the lost zone/.test(
      lower
    )
  ) {
    steps.push({ type: 'toolOrStadiumToLostZone', side: 'opponent', includeSpecialEnergy: true });
    return { steps, recognizable: true };
  }

  // Xerosic — choose a Tool or Special Energy on any Pokémon and discard it
  if (lower.includes('choose a pokémon tool or special energy card')) {
    steps.push({ type: 'discardFromOpponent', target: "a Pokémon Tool or Special Energy card attached to a Pokémon in play" });
    appendDiscardCost(steps, lower);
    return { steps, recognizable: true };
  }

  // Rust Syndicate Grunt / generic — discard any Energy from 1 opponent Pokémon
  if (lower.includes('discard an energy from 1 of your opponent')) {
    steps.push({
      type: 'discardEnergyFromOpponent',
      energy: 'any Energy',
      count: 1,
      scope: '1 Pokémon',
    });
    return { steps, recognizable: true };
  }

  // Hole-Digging Shovel — mill top N of your deck
  if (lower.includes('discard the top') && lower.includes('cards of your deck')) {
    const m = lower.match(/discard the top\s+(\d+)\s+cards? of your deck/);
    steps.push({ type: 'millSelf', count: m ? Number(m[1]) : 2 });
    return { steps, recognizable: true };
  }

  // ── legacy mechanisms (batch 11) ────────────────────────────────────────
  // Moomoo Milk / Moo-Moo Milk — choose 1, flip 2 coins, heal per heads
  if (/choose 1 of your pokémon\. flip 2 coins/.test(lower) &&
      /(?:for each heads, remove \d+ damage counters|remove \d+ damage counters times the number of heads)/.test(lower)) {
    const m = lower.match(/for each heads, remove (\d+) damage counters/) ||
      lower.match(/remove (\d+) damage counters times the number of heads/);
    steps.push({ type: 'healPerHeads', coins: 2, perHeads: m ? Number(m[1]) : 3 });
    return { steps, recognizable: true };
  }

  // Tropical Wind — coin: heal each Active, else Sleep each Active
  if (/if heads, remove (\d+) damage counters from each active pokémon/.test(lower) && /if tails/.test(lower)) {
    const m = lower.match(/if heads, remove (\d+) damage counters from each active pokémon/);
    steps.push({
      type: 'coinFlip',
      heads: [{ type: 'healEachActive', amount: Number(m[1]), scope: 'all' }],
      tails: [{ type: 'applyStatus', target: 'bothActiveAll', conditions: ['Asleep'] }],
    });
    return { steps, recognizable: true };
  }

  // Brock / Erika's Kindness — remove N damage counters from each Pokémon
  {
    const m = lower.match(/remove (\d+) damage counters? from each (?:pokémon|of your pokémon)/);
    if (m) {
      steps.push({
        type: 'healEachActive',
        amount: Number(m[1]),
        scope: /yours and your opponent's|each pokémon \(/.test(lower) ? 'all' : 'own',
      });
      return { steps, recognizable: true };
    }
  }

  // Riley / Rival — reveal top N, the opponent picks which to keep
  {
    let m = lower.match(/reveal the top (\d+) cards of your deck and have your opponent choose (\d+)/);
    if (m) {
      steps.push({
        type: 'opponentChoosesFromTop',
        count: Number(m[1]),
        chosen: Number(m[2]),
        chosenTo: /discard the chosen/.test(lower) ? 'discard' : 'hand',
        restTo: /put the remaining cards into your hand/.test(lower) ? 'hand' : 'top',
      });
      return { steps, recognizable: true };
    }
    m = lower.match(/reveal the top (\d+) cards of your deck\. your opponent chooses (\d+)/);
    if (m) {
      steps.push({ type: 'opponentChoosesFromTop', count: Number(m[1]), chosen: Number(m[2]), chosenTo: 'hand', restTo: 'top' });
      return { steps, recognizable: true };
    }
  }

  // Energy Retrieval / Super Energy Retrieval — trade hand cards for basic Energy
  {
    const m = lower.match(/trade\s+(\d+)\s+of the other cards in your hand for (?:up to )?(\d+) basic energy/);
    if (m) {
      steps.push({ type: 'discardCost', count: Number(m[1]) });
      steps.push({ type: 'recursion', what: 'Basic Energy', from: 'discard' });
      return { steps, recognizable: true };
    }
  }

  // Team Rocket's Handiwork — flip 2 coins, mill N per heads
  {
    const m = lower.match(/flip 2 coins\. for each heads, discard (\d+) cards? from the top of your opponent's deck/);
    if (m) {
      steps.push({ type: 'millPerHeads', coins: 2, per: Number(m[1]) });
      return { steps, recognizable: true };
    }
  }

  // Gym Badge — flip until tails, draw a card per heads
  if (/flip a coin until you get tails\. for each heads, draw a card/.test(lower)) {
    steps.push({ type: 'flipUntilTailsDraw' });
    return { steps, recognizable: true };
  }

  // Tool Retriever — return attached Pokémon Tools to hand
  {
    const m = lower.match(/choose up to (\d+) pokémon tool cards attached to your pokémon and put them into your hand/);
    if (m) {
      steps.push({ type: 'toolsToHand', count: Number(m[1]) });
      return { steps, recognizable: true };
    }
  }

  // Switching Cups — swap a card in hand with the top card of your deck
  if (/switch a card from your hand with the top card of your deck/.test(lower)) {
    steps.push({ type: 'switchHandWithTop' });
    return { steps, recognizable: true };
  }

  // Caitlin — put any number from hand on the bottom, draw that many
  if (/put as many cards from your hand as you like on the bottom of your deck/.test(lower)) {
    steps.push({ type: 'putHandBottomThenDraw' });
    return { steps, recognizable: true };
  }

  // Team Skull Grunt / Sidney — opponent reveals hand; discard Energy / any cards
  if (/opponent reveals (?:their|his or her) hand\.? discard (\d+) energy cards? from it/.test(lower)) {
    steps.push({ type: 'revealOpponentHandDiscard', what: 'Energy', count: Number(lower.match(/discard (\d+) energy/)[1]) });
    return { steps, recognizable: true };
  }
  if (/discard up to (\d+) in any combination of/.test(lower)) {
    steps.push({
      type: 'revealOpponentHandDiscard',
      what: 'card',
      count: Number(lower.match(/discard up to (\d+)/)[1]),
      upTo: true,
    });
    return { steps, recognizable: true };
  }

  // Fan of Waves — Special Energy to the bottom of the opponent's deck
  if (/put a special energy attached to 1 of your opponent's pokémon on the bottom of their deck/.test(lower)) {
    steps.push({ type: 'sendEnergyToDeckBottom', energy: 'Special Energy' });
    return { steps, recognizable: true };
  }

  // Eneporter — move a Special Energy between the opponent's Pokémon
  if (/move a special energy from 1 of your opponent's pokémon to another of their pokémon/.test(lower)) {
    steps.push({ type: 'moveEnergyOpponent', energy: 'Special Energy' });
    return { steps, recognizable: true };
  }

  // Hypnotoxic Laser — Poison the opponent's Active, then coin for Asleep
  if (/your opponent's active pokémon is now poisoned\. flip a coin/.test(lower)) {
    steps.push({ type: 'applyStatus', target: 'opponentActive', conditions: ['Poisoned'] });
    if (/if heads/.test(lower)) {
      steps.push({ type: 'coinFlip', heads: [{ type: 'applyStatus', target: 'opponentActive', conditions: ['Asleep'] }], tails: [] });
    }
    return { steps, recognizable: true };
  }

  // Professor Cozmo's Discovery — heads draw the bottom N, tails the top M
  {
    const m = lower.match(/if heads, draw the bottom (\d+) cards/);
    if (m) {
      const t = lower.match(/if tails, draw the top (\d+) cards/);
      steps.push({
        type: 'coinFlip',
        heads: [{ type: 'drawBottom', count: Number(m[1]) }],
        tails: [{ type: 'draw', count: t ? Number(t[1]) : 2 }],
      });
      return { steps, recognizable: true };
    }
  }

  // Maintenance — shuffle N cards from hand into deck, then draw
  {
    const m = lower.match(/shuffle (\d+)(?: of the other)? cards? from your hand into your deck/);
    if (m && /draw a card|draw \d+ cards/.test(lower)) {
      const d = lower.match(/draw (\d+) cards?/);
      steps.push({ type: 'shuffleHandCardsThenDraw', count: Number(m[1]), draw: d ? Number(d[1]) : 1 });
      return { steps, recognizable: true };
    }
  }

  // First Ticket — pre-game coin: you go first
  if (/before you flip a coin to decide who goes first/.test(lower)) {
    steps.push({ type: 'passive', detail: 'Pre-game: you go first (skip the coin flip).' });
    return { steps, recognizable: true };
  }

  // ── legacy mechanisms (batch 12) ────────────────────────────────────────
  // Ether / Gutsy Pickaxe — reveal the top card; attach it if it is Energy
  {
    const m = lower.match(/reveal the top card of your deck\. if that card is an? ([a-zé{}]+(?: [a-zé{}]+)?) energy card, attach it to 1 of your (?:benched )?pokémon/);
    if (m) {
      steps.push({
        type: 'revealTopEnergy',
        energy: m[1].trim(),
        toBench: lower.includes('benched pokémon'),
        // Gutsy Pickaxe puts the non-matching card into hand; Ether leaves it on top.
        restTo: /put it into your hand/.test(lower) ? 'hand' : 'top',
      });
      return { steps, recognizable: true };
    }
  }

  // Lure Ball — flip 3 coins, take an Evolution card per heads
  if (/flip 3 coins\. for each heads, choose an evolution card from your discard pile/.test(lower)) {
    steps.push({ type: 'recursion', what: 'Evolution', from: 'discard', count: 3, perHeads: true });
    return { steps, recognizable: true };
  }

  // Fisherman — take up to 4 basic Energy from the discard pile
  if (/choose 4 basic energy cards from your discard pile/.test(lower)) {
    steps.push({ type: 'recursion', what: 'Basic Energy', from: 'discard', count: 4 });
    return { steps, recognizable: true };
  }

  // Super Energy Removal 2 — double coin: strip all Energy from an Active
  if (/if both are heads, discard all energy cards attached to the defending pokémon/.test(lower)) {
    steps.push({
      type: 'coinFlip',
      heads: [{ type: 'discardAllEnergyFromActive', side: 'opponent' }],
      tails: [{ type: 'discardAllEnergyFromActive', side: 'self' }],
    });
    return { steps, recognizable: true };
  }

  // Fervor — show the top 3, take Energy, discard the rest
  if (/show the top 3 cards of your deck to all players/.test(lower)) {
    steps.push({ type: 'lookAtTop', count: 3, pick: 'Energy', destination: 'hand' });
    return { steps, recognizable: true };
  }

  // Mary's Request — draw 1, plus 2 more without a Stage 2 in play
  if (/^draw a card\.? if you don't have any stage 2/.test(lower)) {
    steps.push({ type: 'draw', count: 1 });
    steps.push({ type: 'passive', detail: 'Draw 2 more cards if you have no Stage 2 Pokémon in play.' });
    return { steps, recognizable: true };
  }

  // Oracle — choose 2 cards from the deck, put them on top
  {
    const m = lower.match(/choose (\d+) cards? from your deck and shuffle the rest of your deck/);
    if (m) {
      steps.push({ type: 'searchToTop', count: Number(m[1]) });
      return { steps, recognizable: true };
    }
  }

  // Pokémon Center — heal all your Pokémon, then discard their attached Energy
  if (/remove all damage counters from all of your own pokémon with damage counters on them, then discard all energy/.test(lower)) {
    steps.push({ type: 'healAllOwnAndDiscardEnergy' });
    return { steps, recognizable: true };
  }

  // Pokémon Nurse — heal 1 Pokémon, then discard its attached Energy
  if (/remove all damage counters from 1 of your pokémon\. then discard all energy cards attached to it/.test(lower)) {
    steps.push({ type: 'healOneDiscardEnergy' });
    return { steps, recognizable: true };
  }

  // Giovanni's Last Resort — heal 1, then discard your hand
  if (/remove all damage counters from 1 of your pokémon with giovanni in its name\. then discard your hand/.test(lower)) {
    steps.push({ type: 'heal', target: 'Giovanni Pokémon' });
    steps.push({ type: 'discardHandThenDraw', count: 0 });
    return { steps, recognizable: true };
  }

  // ── legacy mechanisms (batch 13) ────────────────────────────────────────
  // Erika / Computer Error — you draw up to N, then the opponent draws up to N
  {
    const m = lower.match(/you may draw up to\s+(\d+)\s+cards?,? then your opponent may draw up to\s+(\d+)\s+cards?/);
    if (m) {
      steps.push({ type: 'eachPlayerDraw', count: Number(m[1]) });
      return { steps, recognizable: true };
    }
  }

  // Holon Farmer — discard a card, then recycle basic Energy + Pokémon to the top
  if (/search your discard pile for 3 basic energy cards and any combination of 3 basic pokémon or evolution cards/.test(lower)) {
    steps.push({ type: 'discardCost', count: 1 });
    steps.push({ type: 'shuffleFromDiscard', choices: [{ what: 'Basic Energy', count: 3 }, { what: 'Basic Pokémon', count: 3 }] });
    return { steps, recognizable: true };
  }

  // Holon Lass — discard a card, then dig the top for Energy
  if (/count the total number of prize cards left/.test(lower) && /look at that many cards from the top of your deck, choose as many energy cards/.test(lower)) {
    steps.push({ type: 'discardCost', count: 1 });
    steps.push({ type: 'lookAtTop', count: 6, pick: 'Energy', destination: 'hand' });
    return { steps, recognizable: true };
  }

  // Poké Healer + — play 2: remove 8 damage counters and all Special Conditions
  if (/you may play 2 poké healer \+ at the same time/.test(lower)) {
    steps.push({ type: 'healAmount', amount: 8, target: 'Active Pokémon', cure: true });
    return { steps, recognizable: true };
  }

  // New Pokédex / Pokédex — look at the top and rearrange them
  {
    const m = lower.match(/look at up to\s+(\d+)\s+cards from the top of your deck and rearrange/);
    if (m) {
      steps.push({ type: 'rearrangeTop', count: Number(m[1]) });
      return { steps, recognizable: true };
    }
  }

  // Trash Exchange — shuffle the discard pile in, then mill that many
  if (/count the number of cards in your discard pile and shuffle them into your deck\. then discard that many cards from the top of your deck/.test(lower)) {
    steps.push({ type: 'shuffleDiscardThenMill' });
    return { steps, recognizable: true };
  }

  // Tormenting Spray — discard a random Supporter from the opponent's hand
  if (/choose a random card from your opponent's hand\. your opponent reveals that card\. if it's a supporter card, discard it/.test(lower)) {
    steps.push({ type: 'discardRandomOpponentHandIfSupporter' });
    return { steps, recognizable: true };
  }

  // ── Lost Zone cards (batch 14) ──────────────────────────────────────────
  // Lost Vacuum — hand card to the Lost Zone, then a Tool/Stadium there
  if (/choose a pokémon tool attached to any pokémon, or any stadium in play, and put it in the lost zone/.test(lower)) {
    if (/put another card from your hand in the lost zone/.test(lower)) {
      steps.push({ type: 'lostZoneCost', count: 1 });
    }
    steps.push({ type: 'toolOrStadiumToLostZone' });
    return { steps, recognizable: true };
  }

  // Lost Blender — 2 hand cards to the Lost Zone, then draw a card
  if (/put 2 cards from your hand in the lost zone\. if you do, draw a card/.test(lower)) {
    steps.push({ type: 'lostZoneCost', count: 2 });
    steps.push({ type: 'draw', count: 1 });
    return { steps, recognizable: true };
  }

  // Lost Remover — an opponent's Special Energy to the Lost Zone
  if (/put 1 special energy card attached to 1 of your opponent's pokémon in the lost zone/.test(lower)) {
    steps.push({ type: 'sendEnergyToLostZone', energy: 'Special Energy' });
    return { steps, recognizable: true };
  }

  // Lysandre Prism Star — one opponent discard card to the Lost Zone per {R} Pokémon
  if (/for each of your \{r\} pokémon in play, put a card from your opponent's discard pile in the lost zone/.test(lower)) {
    steps.push({ type: 'opponentDiscardToLostZonePerPokemon', energyType: '{R}' });
    return { steps, recognizable: true };
  }

  // ── passive / turn-scoped / conditional effects ─────────────────────────
  // Recognized (recognizable: true) but not stepped — they are modifiers or
  // conditional effects that apply automatically or over a turn, and must NOT
  // fall through to the bare-draw branch. A short `detail` is attached so the
  // announcement is descriptive instead of a generic "passive".

  // Cyrus Prism Star — the opponent keeps 2 Benched Pokémon; the rest shuffle
  // into their deck (with everything attached to them).
  if (/your opponent chooses 2 benched pokémon and shuffles the others/.test(lower)) {
    steps.push({ type: 'opponentShuffleBenchToDeck' });
    return { steps, recognizable: true };
  }

  // Ultra Forest Kartenvoy — Ultra Beasts ignore defender effects this turn
  if (
    /during this turn, damage from your ultra beasts' attacks isn't affected by any effects on your opponent's active pokémon/.test(
      lower
    )
  ) {
    steps.push({ type: 'ignoreDefenderEffectsTurn', ultraBeast: true });
    return { steps, recognizable: true };
  }

  // Will — choose the first coin flip this turn
  if (lower.includes('choose heads or tails for the first coin flip')) {
    steps.push({ type: 'chooseFirstCoin' });
    return { steps, recognizable: true };
  }

  // Mars — draw 2, then discard a random card from the opponent's hand. Must
  // run before the leading-draw block below, which would return draw-only.
  {
    const mars = lower.match(
      /^draw (\d+) cards?\. if you do, discard a random card from your opponent's hand/
    );
    if (mars) {
      steps.push({ type: 'draw', count: Number(mars[1]) });
      steps.push({
        type: 'discardRandomOpponentHandIfSupporter',
        any: true,
        count: 1,
        // "If you do": the discard follows the draw, it is not unconditional.
        requiresDraw: true,
      });
      return { steps, recognizable: true };
    }
  }

  // A card whose *primary* clause is an unconditional "Draw N cards." must
  // still execute that draw, even when a later clause trips a passive keyword
  // (Aroma Lady, Buck's Training, Professor Kukui, Emcee's Hype). The passive
  // fallback below otherwise swallowed the whole card.
  const leadingDraw = lower.match(/^\s*draw\s+(\d+)\s+cards?\b/);
  if (leadingDraw) {
    const leadingSteps = [{ type: 'draw', count: Number(leadingDraw[1]) }];
    if (isPassiveText(lower)) {
      leadingSteps.push({ type: 'passive', detail: passiveDetail(lower) });
    }
    return { steps: leadingSteps, recognizable: true };
  }

  if (isPassiveText(lower)) {
    return { steps: [{ type: 'passive', detail: passiveDetail(lower) }], recognizable: true };
  }

  // bare draw (standalone, e.g. "Draw 2 cards." / "Then, draw 3 cards.")
  // placed LAST so compound effects are handled by their primary branch,
  // and only truly standalone draws fall through here
  if (/draw\s+(\d+)\s+cards?/.test(lower)) {
    const m = lower.match(/draw\s+(\d+)\s+cards?/);
    steps.push({ type: 'draw', count: Number(m[1]) });
    return { steps, recognizable: true };
  }

  return { steps: [], recognizable: false };
}

// Human-readable guidance for each step — this is what gets announced.
export function describeStep(step) {
  switch (step.type) {
    case 'draw': return `Draw ${step.count} card${step.count > 1 ? 's' : ''}.`;
    case 'drawUntil': {
      const describe = (target) => {
        if (target && typeof target === 'object') {
          if (target.kind === 'opponentHand') return 'as many cards as your opponent';
          if (target.kind === 'opponentHandPlus') return `${target.n} more card${target.n === 1 ? '' : 's'} than your opponent`;
          return String(target.n ?? 5);
        }
        return String(target ?? 5);
      };
      return `Draw cards until you have ${describe(step.target)} cards in your hand${
        step.bonusTarget ? ` (${describe(step.bonusTarget)} instead if the condition is met)` : ''
      }.`;
    }
    case 'opponentDraw': return `Your opponent draws ${step.count} card${step.count > 1 ? 's' : ''}.`;
    case 'discardHandThenDraw': return `Discard your hand, then draw ${step.count} cards.`;
    case 'shuffleHandThenDraw': return `Shuffle your hand into the deck, then draw ${step.count} cards${step.bonusCount ? ` (${step.bonusCount} if 6 prizes left)` : ''}.`;
    case 'searchDeck': {
      const dest =
        step.destination === 'bench' ? 'put on Bench'
        : step.destination === 'attach' ? 'attach to a Pokémon'
        : 'add to hand';
      return `Search your deck for ${step.count > 1 ? step.count + ' ' : ''}${step.what} → ${dest}, then shuffle.`;
    }
    case 'searchDeckSequence':
      return `Search your deck for ${step.stages.map((s) => s.what).join(', ')} (one at a time), reveal them, add to hand, then shuffle.`;
    case 'coinFlip': {
      const fmt = (branch) => {
        if (!branch) return 'nothing';
        const list = Array.isArray(branch) ? branch : [branch];
        if (list.length === 0) return 'nothing';
        return list.map((s) => {
          if (s.type === 'draw') return `draw ${s.count}`;
          if (s.type === 'shuffleHandThenDraw') return `shuffle, then draw ${s.count}`;
          if (s.type === 'searchDeck') return `search for ${s.what}`;
          if (s.type === 'discardEnergyFromOpponent') return 'discard Energy from opponent';
          if (s.type === 'damageCounters') return `put ${s.count} damage on ${s.target}`;
          return s.type;
        }).join('; ');
      };
      return `Flip a coin — heads: ${fmt(step.heads)}; tails: ${fmt(step.tails)}.`;
    }
    case 'putHandOnBottom': return `Put ${step.count} card${step.count > 1 ? 's' : ''} from your hand on the bottom of your deck.`;
    case 'opponentShuffleHandDraw': return `Your opponent shuffles their hand into their deck (on bottom)${step.prizeCondition ? ` (${step.prizeCondition})` : ''}, then draws ${step.count} card${step.count > 1 ? 's' : ''}.`;
    case 'lookAtTop': return `Look at the top ${step.count} cards; take a ${step.pick} to ${step.destination === 'bench' ? 'Bench' : 'hand'}, shuffle the rest.`;
    case 'lookAtBottom': return `Look at the bottom ${step.count} cards; take a ${step.pick} to ${step.destination === 'bench' ? 'Bench' : 'hand'}, shuffle the rest.`;
    case 'switchOpponent': return "Choose 1 of your opponent's Benched Pokémon to switch into the Active Spot.";
    case 'switchOwn': return 'Switch your Active Pokémon with 1 of your Benched Pokémon.';
    case 'discardCost': return `Discard ${step.count} other card${step.count > 1 ? 's' : ''} from your hand (cost).`;
    case 'recursion': return `Put a ${step.what} from your discard pile into your hand.`;
    case 'heal': return `Heal all damage from your ${step.target}.`;
    case 'healAmount': return `Heal ${step.amount} damage from ${step.target}${step.cure ? ', and it recovers from Special Conditions' : ''}.`;
    case 'attachFromDiscard': return `Attach a ${step.energy} from your discard pile to ${step.target}.`;
    case 'attachMultipleFromDiscard': return `Attach up to ${step.count} ${step.energy} cards from your discard pile to ${step.target}.`;
    case 'ionoShuffle':
      return step.drawPrizes
        ? 'Both players shuffle the cards in their hands and put them on the bottom of their decks, then draw cards equal to remaining Prize cards.'
        : 'Both players shuffle the cards in their hands into their decks.';
    case 'evolveStage2': return 'Choose 1 of your Basic Pokémon in play; if you have a Stage 2 that evolves from it in your hand, put it on to evolve, skipping the Stage 1.';
    case 'moveEnergy': return 'Move a Basic Energy from 1 of your Pokémon to another of your Pokémon.';
    case 'moveEnergyToActive': return `Move up to ${step.count} Energy from your Benched Pokémon to your Active Pokémon.`;
    case 'devolve': return `Devolve ${step.target} by putting its Evolution cards into your hand (it can't evolve this turn).`;
    case 'discardTools': return `Choose up to ${step.count} Pokémon Tools attached to Pokémon (yours or your opponent's) and discard them.`;
    case 'discardFromOpponent': return `Discard ${step.target}.`;
    case 'switchOpponentOut': return "Switch out your opponent's Active Pokémon to the Bench (your opponent chooses the new Active).";
    case 'variableDraw': {
      const labels = {
        ancientInPlay: 'each of your Ancient Pokémon in play',
        opponentBench: "each of your opponent's Benched Pokémon",
        opponentHandPokemon: 'each Pokémon in your opponent\'s revealed hand',
        opponentMegaExInPlay: "each of your opponent's Mega Evolution Pokémon ex in play",
        opponentPokemonInPlay: "each of your opponent's Pokémon in play",
        opponentBenchBasic: "each of your opponent's Benched Basic Pokémon",
        opponentHandTrainer: "each Trainer card in your opponent's revealed hand",
        allBench: 'each Benched Pokémon (both players\')',
      };
      return `Draw a card for ${labels[step.source] || 'each matching Pokémon'}.`;
    }
    case 'countShuffleDrawPlus':
      return 'Count the cards in your hand, shuffle them into your deck, then draw that many cards plus 1.';
    case 'shuffleFromDiscard': {
      if (step.choices?.length) {
        const parts = step.choices.map((c) => `up to ${c.count} ${c.what}`);
        return `Choose 1 or both: shuffle ${parts.join(' and/or ')} from your discard pile into your deck.`;
      }
      return `Shuffle up to ${step.count} ${step.what} from your discard pile into your deck.`;
    }
    case 'applyStatus': {
      const cond = step.conditions.join(' and ');
      if (step.target === 'opponentActive') {
        return `Your opponent's Active Pokémon is now ${cond}.`;
      }
      if (step.target === 'bothActiveNonDark') {
        return `Both Active non-{D} Pokémon are now ${cond}.`;
      }
      if (step.target === 'bothActiveAll') {
        return `Both Active Pokémon are now ${cond}.`;
      }
      if (step.target === 'ownActive') {
        return `Your Active Pokémon is now ${cond}.`;
      }
      return `Apply ${cond}.`;
    }
    case 'fossilItem': return `Play this card as if it were a ${step.hp}-HP Basic {C} Pokémon (can't retreat; discard from play any time during your turn).`;
    case 'returnPokemonToHand': return step.keepAttached
      ? 'Put 1 of your Pokémon and all attached cards into your hand.'
      : 'Put 1 of your Pokémon in play into your hand (discard all cards attached to that Pokémon).';
    case 'swapWithDiscard': return `Choose a ${step.filter} in your discard pile and switch it with 1 of your ${step.filter} in play (attached cards, damage, and effects stay on the new Pokémon).`;
    case 'massDiscardAttached': return "Discard all Pokémon Tools and Special Energy from all of your opponent's Pokémon, and discard a Stadium in play.";
    case 'discardToolAndSpecialEnergy': return "Discard a Pokémon Tool and a Special Energy from 1 of your opponent's Pokémon.";
    case 'reshufflePrizes': return 'Count your Prize cards, shuffle them into your deck, then set that many new Prize cards from the top of your deck.';
    case 'revealOpponentDeckBench': return `Reveal the top ${step.count} cards of your opponent's deck; you may put any Basic Pokémon found onto their Bench, then they shuffle the rest.`;
    case 'opponentPrizeHandSwap': return "Turn 1 of your opponent's face-down Prize cards face up, reveal a random card from their hand, and optionally swap those cards (that Prize stays face up).";
    case 'revealOpponentHandDiscard':
      return `Your opponent reveals their hand; discard up to ${step.count} ${step.what} card${step.count > 1 ? 's' : ''} you find there.`;
    case 'opponentHandBottom':
      return `Your opponent reveals their hand; choose a ${step.what} and put it on the bottom of their deck${step.optionalOpponentDraw ? ' (they may draw a card)' : ''}.`;
    case 'opponentHandShuffleDeck':
      if (step.all) {
        return `Your opponent shuffles their whole hand into their deck${
          step.drawThatMany ? ', then draws that many cards' : ''
        }.`;
      }
      return `Look at your opponent's hand; ${step.upTo ? 'shuffle up to' : 'shuffle'} ${step.count} ${step.what === 'Trainer' ? 'Trainer card' : 'card'}${step.count > 1 ? 's' : ''} from it into their deck${step.optionalOpponentDraw ? ' (they may draw a card)' : ''}.`;
    case 'opponentActiveEnergyToDeck':
      return "Put an Energy from your opponent's Active Pokémon on top of their deck.";
    case 'opponentHandToBenchBasic':
      return `Put ${step.anyNumber ? 'any number of' : 'a'} Basic Pokémon from your opponent's hand onto their Bench${step.switchActive ? ', then switch it to the Active Spot' : ''}.`;
    case 'eachPlayerDiscardFromHand':
      return `Each player discards ${step.count} card${step.count > 1 ? 's' : ''} from their hand${step.opponentFirst ? ' (opponent first)' : ''}.`;
    case 'eachPlayerDraw':
      return `Each player draws up to ${step.count} cards (you draw first).`;
    case 'eachPlayerReturnBench':
      return 'Each player returns 1 of their Benched Pokémon and all cards attached to it to their hand.';
    case 'eachPlayerShuffleHandDraw':
      return 'Each player shuffles their hand into their deck, then draws that many cards.';
    case 'eachPlayerHandToFive':
      return `Each player draws or discards until they have ${step.count} cards in their hand${step.opponentFirst ? ' (opponent first)' : ''}.`;
    case 'eachPlayerRecoverPokemon':
      return 'Each player puts a Pokémon from their discard pile into their hand.';
    case 'discardAnyThenDraw':
      return 'Discard any number of cards from your hand, then draw that many.';
    case 'opponentHandShuffleItemsDraw':
      return 'Your opponent shuffles all Item cards from their hand into their deck; you draw that many cards.';
    case 'discardAllTrainerInPlay':
      return `Discard all Trainer cards ${step.side === 'opponent' ? 'your opponent has' : 'you have'} in play${step.excludeSupporters ? ' (excluding Supporter cards)' : ''}.`;
    case 'returnStadiumToHand':
      return "Return any Stadium card in play to its owner's hand.";
    case 'shuffleDeckOnly':
      return 'Shuffle your deck.';
    case 'clearAttackEffects':
      return step.scope === 'all' ? 'Remove all effects of attacks on each player and their Pokémon.' : 'Remove all effects of attacks on you and your Pokémon.';
    case 'revealUntilCard':
      return `Reveal cards from the top of your deck until you reveal a ${step.what} card; put it into your hand and shuffle the rest back.`;
    case 'lookAtFaceDownPrize':
      return `Look at your face-down Prize cards; you may reveal a ${step.what} card, put it into your hand${step.replace ? ', and put this card in its place' : ''}, then shuffle your prizes.`;
    case 'putHandBasicAsActive':
      return 'Put a Basic Pokémon from your hand into play as your Active Pokémon (your old Active moves to the Bench).';
    case 'healPerHeads':
      return `Flip ${step.coins} coins; remove ${step.perHeads} damage counters from a chosen Pokémon per heads.`;
    case 'healEachActive':
      return `Remove ${step.amount} damage counter${step.amount > 1 ? 's' : ''} from ${step.scope === 'all' ? "each player's Pokémon" : 'each of your Pokémon'} that has damage counters on it.`;
    case 'opponentChoosesFromTop':
      return `Reveal the top ${step.count} cards; your opponent picks ${step.chosen} to put into your hand, the rest to the ${step.restTo === 'top' ? 'top of your deck' : 'discard pile'}.`;
    case 'millPerHeads':
      return `Flip ${step.coins} coins; discard ${step.per} card${step.per > 1 ? 's' : ''} from the top of your opponent's deck per heads.`;
    case 'flipUntilTailsDraw':
      return 'Flip a coin until you get tails; draw a card for each heads.';
    case 'toolsToHand':
      return `Choose up to ${step.count} attached Pokémon Tool${step.count > 1 ? 's' : ''} and put them into your hand.`;
    case 'switchHandWithTop':
      return 'Switch a card from your hand with the top card of your deck.';
    case 'putHandBottomThenDraw':
      return 'Put any number of cards from your hand on the bottom of your deck, then draw that many.';
    case 'shuffleHandCardsThenDraw':
      return `Shuffle ${step.count} card${step.count > 1 ? 's' : ''} from your hand into your deck, then draw ${step.draw}.`;
    case 'drawBottom':
      return `Draw the bottom ${step.count} card${step.count > 1 ? 's' : ''} of your deck.`;
    case 'moveEnergyOpponent':
      return `Move a ${step.energy} from 1 of your opponent's Pokémon to another of their Pokémon.`;
    case 'sendEnergyToDeckBottom':
      return `Put a ${step.energy} attached to 1 of your opponent's Pokémon on the bottom of their deck.`;
    case 'revealTopEnergy':
      return `Reveal the top card of your deck; if it is a ${step.energy} Energy card, attach it to 1 of your Pokémon, otherwise put it into your hand.`;
    case 'discardAllEnergyFromActive':
      return `Discard all Energy attached to ${step.side === 'opponent' ? "your opponent's Active Pokémon" : 'your Active Pokémon'}.`;
    case 'searchToTop':
      return `Choose ${step.count} card${step.count > 1 ? 's' : ''} from your deck, shuffle the rest, then put the chosen card${step.count > 1 ? 's' : ''} on top.`;
    case 'healAllOwnAndDiscardEnergy':
      return 'Remove all damage counters from your damaged Pokémon, then discard all Energy attached to them.';
    case 'healOneDiscardEnergy':
      return 'Remove all damage counters from 1 of your Pokémon, then discard all Energy attached to it.';
    case 'rearrangeTop':
      return `Look at the top ${step.count} cards of your deck and rearrange them as you like.`;
    case 'shuffleDiscardThenMill':
      return 'Shuffle your discard pile into your deck, then discard that many cards from the top of your deck.';
    case 'discardRandomOpponentHandIfSupporter':
      return "Reveal a random card from your opponent's hand; discard it if it is a Supporter.";
    case 'lostZoneCost':
      return `Put ${step.count} card${step.count > 1 ? 's' : ''} from your hand in the Lost Zone.`;
    case 'toolOrStadiumToLostZone':
      return step.side === 'opponent'
        ? `Choose a Pokémon Tool${
            step.includeSpecialEnergy ? ' or Special Energy' : ''
          } attached to 1 of your opponent's Pokémon, or a Stadium in play, and put it in the Lost Zone.`
        : 'Choose a Pokémon Tool attached to any Pokémon, or a Stadium in play, and put it in the Lost Zone.';
    case 'sendEnergyToLostZone':
      return `Put a ${step.energy} attached to 1 of your opponent's Pokémon in the Lost Zone.`;
    case 'opponentDiscardToLostZonePerPokemon':
      return `For each of your ${step.energyType} Pokémon in play, put a card from your opponent's discard pile in the Lost Zone.`;
    case 'opponentDiscardUntil':
      return `Your opponent discards cards from their hand until they have ${step.count} cards in their hand.`;
    case 'eachPlayerDiscardUntil':
      return `Each player discards cards from their hand until they have ${step.count} cards in their hand${step.opponentFirst ? ' (opponent first)' : ''}.`;
    case 'opponentCountShuffleDraw':
      return 'Your opponent counts their hand, shuffles it to the bottom of their deck, then draws that many cards.';
    case 'discardEnergyFromOpponent': {
      const dest = step.action === 'returnToHand' ? "into their hand" : 'to the discard pile';
      const scope = step.scope === 'each Pokémon' ? 'each of their Pokémon' : '1 of their Pokémon';
      return `${step.action === 'returnToHand' ? 'Put' : 'Discard'} ${step.count > 1 ? step.count + ' ' : 'a '}${step.energy} from ${scope} ${dest}.`;
    }
    case 'damageCounters':
      return `Put ${step.count} damage counter${step.count > 1 ? 's' : ''} on ${step.target}.`;
    case 'millSelf':
      return `Discard the top ${step.count} card${step.count > 1 ? 's' : ''} of your deck.`;
    case 'reviveFromDiscard':
      return `Put a ${step.what} from ${step.side === 'opponent' ? "your opponent's" : 'your'} discard pile onto the Bench.`;
    case 'moveDamageCounters': {
      const fromLabel = step.from === 'ownActive' ? 'your Active Pokémon'
        : step.from === 'opponent' ? "your opponent's Pokémon" : '1 of your Pokémon';
      const toLabel = step.to === 'opponentActive' ? "your opponent's Active Pokémon"
        : step.to === 'opponent' ? "another of your opponent's Pokémon" : 'another of your Pokémon';
      return `Move up to ${step.count} damage counter${step.count > 1 ? 's' : ''} from ${fromLabel} to ${toLabel}.`;
    }
    case 'lookAtOpponentHand': return "Look at your opponent's hand.";
    case 'attachFromHand': return `Attach ${step.count > 1 ? `up to ${step.count}` : 'a'} ${step.energy} card${step.count > 1 ? 's' : ''} from your hand to ${step.target}.`;
    case 'attachAttackTool': return `Attach ${step.target === '1 of your Pokémon' ? 'this card to 1 of your Pokémon' : `this card to ${step.target}`}; it may use the printed attack${step.discardAtEndOfTurn ? ' (discard this card at the end of the turn)' : ''}.`;
    case 'revealPrizes': return step.scope === 'all' ? 'Turn all players\' Prize cards face up.' : 'Turn your Prize cards face up.';
    case 'prizeToHand': return `Put up to ${step.count} Prize card${step.count > 1 ? 's' : ''} into your hand${step.replace ? ', then set that many cards from your hand face down as Prizes' : ''}.`;
    case 'clearStatus': return step.target === 'allYourPokémon'
      ? 'Remove all Special Conditions from all of your Pokémon.'
      : 'Remove all Special Conditions from your Active Pokémon.';
    case 'discardStadium': return 'Discard any Stadium card in play.';
    case 'putDiscardOnTop': return `Put a ${step.what} from your discard pile on top of your deck.`;
    case 'energyToHand': return 'Return attached Energy cards to your hand.';
    case 'opponentDiscardToHand': return "Put a card from your opponent's discard pile into their hand.";
    case 'opponentDiscardToDeckBottom': return "Put a card from your opponent's discard pile on the bottom of their deck.";
    case 'shufflePokemonIntoDeck': return 'Choose 1 of your Pokémon and shuffle it and all attached cards into your deck.';
    case 'discardOwnBenchPokemon': return `Discard ${step.count > 1 ? `up to ${step.count}` : '1'} of your Benched Pokémon${step.filter && step.filter !== 'no damage counters' ? ` ${step.filter}` : ''} and all attached cards.`;
    case 'shuffleDiscardIntoDeck': return "Each player shuffles the cards in their discard pile into their deck.";
    case 'passive': return step.detail || 'Passive effect — stays in play.';
    case 'searchEvolve': return 'Search your deck for a card that evolves from 1 of your Pokémon and evolve it, then shuffle.';
    case 'prizeBargain': return `Your opponent chooses: each player takes a Prize card, or you draw ${step.drawCount} cards.`;
    case 'searchAttachEach': return `Choose up to ${step.count} of your Pokémon; attach a ${step.energy} from your deck to each, then shuffle.`;
    default: return '';
  }
}