// Pokémon ability parser: structured guidance for the starter decks'
// abilities, same style as the Trainer effect parser.
//
// Returns an ARRAY of step objects (bridge iterates directly).
// Each step: { type, guidance, ...extra }
//
// Design: additive — ALL matching action families are pushed (no early return).
// Passive fallback only if no other step matched.
//
// Backward-compat: the bridge auto-draws by finding `type === 'drawAbility'`
// and reading `.count`. That step type + property are preserved.

// Normalize printed card text before matching.
//   curly quotes  ' ' `  →  straight '
//   energy symbol { P } {G}  →  {P} (no inner spaces)
function normalizeText(text) {
  return String(text)
    .replace(/[\u2018\u2019\u201A\u201B`]/g, "'")
    .replace(/\{\s*([A-Za-z])\s*\}/g, '{$1}')
    .toLowerCase();
}

// Detect "attach" as a VERB (not the adjective "attached" describing state).
// /\battach\b/ matches "attach an Energy", "attach up to 2", "attach energy"
// but NOT "attached to this Pokémon" (no word boundary between h and e).
// Also matches the common "Put an Energy card ... onto a Pokémon" attach wording.
const hasVerbAttach = (t) =>
  t.includes('energy') &&
  ((t.includes('attach') && !t.includes('attached')) || (t.includes('put') && t.includes('onto')));

// True if `w` appears as a whole word (not a substring of a longer word).
// Fixes the 'remove' ⊃ 'move' false-positive (split on non-letters, no regex).
const hasWord = (t, w) => t.split(/[^a-z]/).includes(w);

// "Place 6 damage counters on …" uses "on", not only "to/onto". Do not rely on
// incidental "to" elsewhere (e.g. "in order to use this Ability").
const hasDamageCounterPlacement = (t) =>
  /\bdamage counters?\s+(?:on|to|onto)\b/.test(t) ||
  /(?:place|move)\s+(?:up to\s+)?\d+\s+damage counters?\s+on\b/.test(t);

// Continuous "damage from this Pokémon's attacks ignores effects/Resistance
// on the Defending Pokémon" (Azure Seas, Bladed Armament, Despotic Fang, …).
const ignoresDefenderEffects = (t) =>
  /(?:isn't|aren't|is not|are not) affected by (?:any )?effects? on/.test(t) ||
  /(?:isn't|aren't|is not|are not) affected by resistance/.test(t);

// Borrowing another Pokémon's printed attacks ("can use the attacks of any …",
// "can use any attack from any …", "can use X's attack as its own").
// Excludes the previous-Evolution case, which has its own family + step.
const canUseAttacksOf = (t) =>
  (/\bcan use the attacks? of\b/.test(t) ||
    /can use any attack from any/.test(t) ||
    /\bcan use [^.]*'s attack\b/.test(t)) &&
  !t.includes('previous evolution');

// Extra attacks per turn ("may attack twice a turn", Festival Lead, Ω Barrage).
const attacksTwice = (t) =>
  /may attack twice/.test(t) ||
  /attack twice (?:a|each) turn/.test(t) ||
  /may use an attack it has twice/.test(t);

// Special-Condition immunity that never names a specific condition.
const specialConditionImmunity = (t) =>
  !t.includes('retreat') &&
  (/(?:can't|cannot|can not) be affected by (?:any )?special condition/.test(t) ||
    /recover(?:s)? from all special condition/.test(t) ||
    /remove any special condition/.test(t));

// Type-changing continuous text ("it is {F} and {P} type", "type is the same…",
// "in addition to its existing types", "provides … Energy of every type").
const typeChangeText = (t) =>
  /\bit is (?:a )?\{[a-z]\}/.test(t) ||
  /\btype is (?:the same|now|both|also|\{[a-z]\})/.test(t) ||
  /same type as/.test(t) ||
  /in addition to its existing type/.test(t) ||
  /provides? .*energy of every type/.test(t) ||
  /is both \{[a-z]\} and \{[a-z]\}/.test(t);

// Bench ↔ Active swap wording ("switch … Benched … with your Active …").
export const isBenchActiveSwitchText = (t) =>
  t.includes('switch') &&
  (t.includes('benched') || t.includes('bench')) &&
  t.includes('active');

// Printed once-per-turn usage cap — not effect prevention.
export const isAbilityUsageLimitText = (t) =>
  /can't use more than \d+/.test(t) ||
  /cannot use more than \d+/.test(t);

// App. 23: Ancient Traits are printed with an α/Ω/Δ/θ marker and are neither
// attacks nor Abilities, so effects that block/remove Abilities must not affect
// them. Returns a trait kind ('alpha'|'omega'|'delta'|'theta'), 'ancient' for a
// bare "Ancient Trait" header, or null. Markers (not wording) identify a trait —
// see D72. The printer uses four symbols: Δ Evolution/Δ Plus/Delta Wild, θ
// Stop/θ Double/θ Max, Ω Barrier/Ω Barrage, α Growth/α Recovery.
const ANCIENT_TRAIT_SYMBOLS = [
  ['\u03c9', 'omega'], // ω / Ω
  ['\u03b1', 'alpha'], // α / Α
  ['\u03b4', 'delta'], // δ / Δ
  ['\u03b8', 'theta'], // θ / Θ
];
// The one printing (M Rayquaza-EX, Roaring Skies 61) spells "Delta Wild" with no
// symbol; the Delta family is still a printed trait, so match it by name.
const ANCIENT_TRAIT_NAMES = [
  [/\bdelta evolution\b/, 'delta'],
  [/\bdelta plus\b/, 'delta'],
  [/\bdelta wild\b/, 'delta'],
];
export const ancientTraitIn = (text) => {
  const t = String(text ?? '').toLowerCase();
  // Upper-case Greek lowercases to the symbols above, so one lowercase check
  // covers both cases (checking the upper codepoints after toLowerCase() can
  // never match — the D72 defect).
  for (const [symbol, kind] of ANCIENT_TRAIT_SYMBOLS) {
    if (t.includes(symbol)) return kind;
  }
  for (const [re, kind] of ANCIENT_TRAIT_NAMES) {
    if (re.test(t)) return kind;
  }
  if (t.includes('ancient trait')) return 'ancient';
  return null;
};

/** True when a parsed ability step came from an Ancient Trait, not an Ability. */
export function isAncientTraitStep(step) {
  return Boolean(step?.trait);
}

/**
 * True when every parsed ability step on a card is an Ancient Trait, i.e. the
 * card has no real Ability for a "no Abilities" effect to suppress.
 */
export function isAncientTraitAbility(card) {
  const name = typeof card?.ability?.name === 'string' ? card.ability.name : '';
  const text =
    card?.ability?.text ??
    card?.abilityText ??
    card?.text ??
    card?.effect ??
    '';
  const steps = parseAbility(`${name} ${text}`.trim());
  return steps.length > 0 && steps.every((s) => s.trait);
}

// Discard-from-your-hand costs that affect the opponent are NOT opponent-disrupt.
const isSelfHandDiscardCost = (t) =>
  t.includes('discard') &&
  t.includes('from your hand') &&
  !t.includes("opponent's hand") &&
  !t.includes('from your opponent');

const parseEnergyTypeHint = (t) => {
  const types = [
    'water', 'fire', 'grass', 'lightning', 'psychic', 'fighting',
    'darkness', 'metal', 'dragon', 'fairy', 'colorless',
  ];
  for (const type of types) {
    if (t.includes(type)) return type;
  }
  const sym = t.match(/\{([a-z])\}/);
  if (sym) {
    const map = {
      w: 'water', r: 'fire', g: 'grass', l: 'lightning', p: 'psychic',
      f: 'fighting', d: 'darkness', m: 'metal', n: 'dragon', y: 'fairy', c: 'colorless',
    };
    return map[sym[1]] || null;
  }
  return null;
};

/** Ability deck-search parsing — separate from trainer parseSearchDeckParams(). */
export function parseAbilitySearchParams(lower) {
  let what = 'a card';
  let count = 1;
  let destination = 'hand';
  let upTo = false;

  // Isolate the search clause so trigger clauses like "When you play this
  // Pokémon from your hand onto your Bench" do not fool the destination
  // check into thinking the searched card goes onto the Bench.
  const withoutTrigger = lower.replace(
    /when you play this pok[ée]mon[\s\S]*?onto your bench/g,
    ''
  );
  const searchScope =
    withoutTrigger.match(
      /(?:search your deck|look through your deck|(?:find|up to)[\s\S]*?from your deck|from your deck)[\s\S]*/
    )?.[0] || withoutTrigger;

  if (
    searchScope.includes('onto your bench') ||
    searchScope.includes('put it onto your bench') ||
    searchScope.includes('put them onto your bench')
  ) {
    destination = 'bench';
  }

  const typedHp = lower.match(
    /up to\s+(\d+)\s+\{([a-z])\}\s+pok[ée]mon(?:\s+cards?)?(?:\s+with\s+(\d+)\s+hp\s+or\s+less)?/
  );
  if (typedHp) {
    const sym = typedHp[2].toUpperCase();
    const hp = typedHp[3];
    return {
      what: hp ? `Basic {${sym}} Pokémon ≤${hp} HP` : `Basic {${sym}} Pokémon`,
      count: Number(typedHp[1]),
      destination,
      upTo: true,
    };
  }

  const typedEvolution = lower.match(
    /(?:up to\s+(\d+)\s+)?evolution\s+(\{[a-z]\})\s+pok[ée]mon/
  );
  if (typedEvolution) {
    const sym = typedEvolution[2].toUpperCase();
    const n = typedEvolution[1] ? Number(typedEvolution[1]) : 1;
    return {
      what: `Evolution ${sym} Pokémon`,
      count: n,
      destination,
      upTo: !!typedEvolution[1] || lower.includes('up to'),
    };
  }

  const typedBasicMon = lower.match(
    /(?:up to\s+(\d+)\s+)?basic\s+(\{[a-z]\})\s+pok[ée]mon/
  );
  if (typedBasicMon) {
    const sym = typedBasicMon[2].toUpperCase();
    const n = typedBasicMon[1] ? Number(typedBasicMon[1]) : 1;
    return {
      what: `Basic ${sym} Pokémon`,
      count: n,
      destination,
      upTo: !!typedBasicMon[1] || lower.includes('up to'),
    };
  }

  if (destination === 'bench' && lower.includes('basic pok') && lower.includes('hp or less')) {
    const m = lower.match(/up to\s+(\d+)\s+basic pok/);
    const hp = lower.match(/(\d+)\s+hp\s+or\s+less/);
    return {
      what: hp ? `Basic Pokémon ≤${hp[1]} HP` : 'Basic Pokémon',
      count: m ? Number(m[1]) : 1,
      destination: 'bench',
      upTo: true,
    };
  }

  const typedEnergyUpTo = lower.match(/up to\s+(\d+)\s+basic\s+(\{[a-z]\})\s+energy/);
  if (typedEnergyUpTo) {
    return {
      what: `Basic ${typedEnergyUpTo[2].toUpperCase()} Energy`,
      count: Number(typedEnergyUpTo[1]),
      destination,
      upTo: true,
    };
  }

  // Scope bare word-presence checks to the search target clause ("search your
  // deck for a Supporter card, ..."), not the whole ability text — otherwise
  // an unrelated "this Pokémon" earlier in the text (e.g. a usage condition
  // like "if this Pokémon is in the Active Spot") falsely matches "pokémon"
  // before the real target ("Supporter") is ever checked.
  const scope = lower.match(/(?:search your deck|look through your deck) for ([^.]*)/)?.[1] || lower;

  const typedEnergy = lower.match(/basic\s+(\{[a-z]\})\s+energy/);
  if (typedEnergy) {
    what = `Basic ${typedEnergy[1].toUpperCase()} Energy`;
  } else if (/up to\s+(\d+)\s+basic energy/.test(scope)) {
    const m = scope.match(/up to\s+(\d+)\s+basic energy/);
    what = 'Basic Energy';
    count = Number(m[1]);
    upTo = true;
  } else if (scope.includes('basic energy')) {
    what = 'Basic Energy';
  } else if (scope.includes('supporter')) {
    what = 'Supporter';
  } else if (scope.includes('item')) {
    what = 'Item';
  } else if (scope.includes('trainer')) {
    what = 'Trainer';
  } else if (scope.includes('energy')) {
    what = 'Energy';
  } else if (/up to\s+(\d+)\s+basic pok/.test(scope)) {
    const m = scope.match(/up to\s+(\d+)\s+basic pok/);
    what = 'a Basic Pokémon';
    count = Number(m[1]);
    upTo = true;
  } else if (scope.includes('basic pokémon') || scope.includes('basic pokemon')) {
    what = 'a Basic Pokémon';
  } else if (/up to\s+(\d+)\s+pok/.test(scope)) {
    const m = scope.match(/up to\s+(\d+)\s+pok/);
    what = 'a Pokémon';
    count = Number(m[1]);
    upTo = true;
  } else if (scope.includes('pokémon') || scope.includes('pokemon')) {
    what = 'a Pokémon';
  }

  if (!upTo) {
    const upToM = lower.match(/up to\s+(\d+)/);
    if (upToM) {
      count = Number(upToM[1]);
      upTo = true;
    }
  }

  return { what, count, destination, upTo };
}

export function parseAbility(text = '') {
  const lower = normalizeText(text);
  const steps = [];

  // ── 1. Search (deck → hand / bench) ─────────────────────────────────────
  if (
    lower.includes('search your deck') ||
    lower.includes('look through your deck') ||
    (lower.includes('find') && lower.includes('from your deck')) ||
    (lower.includes('up to') && lower.includes('from your deck') && lower.includes('into your hand')) ||
    (lower.includes('from your deck') && lower.includes('into your hand'))
  ) {
    const parsed = parseAbilitySearchParams(lower);
    const what = parsed.what;
    const dest = parsed.destination === 'bench' ? 'Bench' : 'hand';
    const count = parsed.count || 1;
    steps.push({
      type: 'searchAbility',
      what,
      count,
      destination: dest,
      upTo: parsed.upTo || false,
      reveal: lower.includes('reveal'),
      guidance: `Once during your turn: search your deck for ${count > 1 || parsed.upTo ? `up to ${count} ` : ''}${what} → ${dest === 'Bench' ? 'put on Bench' : 'add to hand'}, then shuffle.`,
    });
  }

  // ── 2. Draw (broadened: bare N, "a card", "until N", "each player", opponent) ──
  // "draw until you have N cards"
  const until = lower.match(/draw\s+cards?\s+until\s+you have\s+(\d+)\s+cards?/);
  if (until) {
    steps.push({
      type: 'drawAbility',
      count: Number(until[1]),
      until: true,
      guidance: `Once during your turn: draw cards until you have ${until[1]} in your hand.`,
    });
  } else if (lower.includes('each player draws') || lower.includes('each player must draw')) {
    // "Each player draws a card" — both players draw 1
    steps.push({
      type: 'drawAbility',
      count: 1,
      eachPlayer: true,
      guidance: 'Once during your turn: each player draws 1 card.',
    });
  } else if (lower.includes('your opponent draws')) {
    // "Your opponent draws N cards" — opponent-facing draw
    const oppM = lower.match(/your opponent draws?\s+(\d+)\s+cards?/);
    steps.push({
      type: 'opponentDraw',
      count: oppM ? Number(oppM[1]) : 1,
      guidance: `Once during your turn: your opponent draws ${oppM ? oppM[1] : '1'} card${oppM && oppM[1] !== '1' ? 's' : ''}.`,
    });
  } else if (/draw\s+(\d+)\s+cards?/.test(lower)) {
    // "Draw N cards" — standard
    const m = lower.match(/draw\s+(\d+)\s+cards?/);
    steps.push({
      type: 'drawAbility',
      count: Number(m[1]),
      guidance: `Once during your turn: draw ${m[1]} card${m[1] !== '1' ? 's' : ''}.`,
    });
  } else if (/draw\s+a\s+card/.test(lower)) {
    // "Draw a card" — no number
    steps.push({
      type: 'drawAbility',
      count: 1,
      guidance: 'Once during your turn: draw 1 card.',
    });
  }

  // ── 3. Switch / bring in ────────────────────────────────────────────────
  const isOpponentBenchSwitch = lower.includes("opponent's benched");
  if (
    isBenchActiveSwitchText(lower) ||
    ((lower.includes('switch your active') ||
      lower.includes('switch in 1 of') ||
      lower.includes('bring in 1 of')) &&
      (lower.includes('benched') || lower.includes('bench')))
  ) {
    const typedBench = lower.match(/benched\s+\{([a-z])\}\s+pok/);
    const poisonNewActive =
      lower.includes('if you do') &&
      (lower.includes('now poisoned') || lower.includes('is now poisoned'));
    steps.push({
      type: 'switchAbility',
      target: isOpponentBenchSwitch ? 'opponent' : 'self',
      pokemonType: typedBench ? parseEnergyTypeHint(`{${typedBench[1]}}`) : null,
      exceptName: lower.match(/except any ([^.,]+)/)?.[1]?.trim().toLowerCase() || null,
      poisonNewActive,
      guidance: isOpponentBenchSwitch
        ? 'Once during your turn: switch in 1 of your opponent\'s Benched Pokémon.'
        : poisonNewActive
          ? 'Once during your turn: switch your Active with 1 of your Benched Pokémon; the new Active is Poisoned.'
          : 'Once during your turn: switch your Active with 1 of your Benched Pokémon.',
    });
  }

  // ── 4. Heal / remove damage counters ────────────────────────────────────
  if (lower.includes('heal') || (lower.includes('remove') && lower.includes('damage counter'))) {
    const amount = lower.match(/heal\s+(\d+)\s+damage/)?.[1] || lower.match(/remove\s+(?:up to\s+)?(\d+)\s+damage/)?.[1] || null;
    const all = lower.includes('all damage');
    const cure = lower.includes('special condition') || lower.includes('recover');
    steps.push({
      type: 'healAbility',
      amount: amount ? Number(amount) : null,
      all,
      cure,
      guidance: all
        ? 'Once during your turn: heal all damage from the target Pokémon.'
        : amount
          ? `Once during your turn: heal ${amount} damage${cure ? ' and cure Special Conditions' : ''}.`
          : 'Once during your turn: remove damage counters as described.',
    });
  }

  // ── 5. Attach energy (FIXED: verb only, not "attached" describing state) ──
  if (hasVerbAttach(lower) && !(
    hasWord(lower, 'move') &&
    lower.includes('energy') &&
    (lower.includes('to 1 of your') || lower.includes('to another') || lower.includes('to your active'))
  )) {
    const fromDiscard = lower.includes('from your discard pile');
    const upTo = lower.match(/(?:attach|put)\s+up to\s+(\d+)/)?.[1] || null;
    // "When you attach an Energy card from your hand to this Pokémon ... you
    // may attach N Energy cards" — a passive trigger off your normal attach,
    // not a separate once-per-turn manual action. The trigger wording alone is
    // a real Ability; only the printed α/Ω/Δ/θ marker makes it an Ancient Trait
    // (App. 23 — the wording is not a marker; parseAbility tags the step).
    const mayAttach = lower.match(/may attach\s+(\d+)/)?.[1] || null;
    const basic = lower.includes('basic');
    const energyType = parseEnergyTypeHint(lower);
    const triggeredByAttach = /when(?:ever)?\s+you attach an?\s+energy/.test(lower);
    steps.push({
      type: 'attachAbility',
      fromDiscard,
      upTo: upTo ? Number(upTo) : mayAttach ? Number(mayAttach) : null,
      basic,
      energyType,
      triggeredByAttach,
      guidance: fromDiscard
        ? 'Once during your turn: attach Energy from your discard pile.'
        : triggeredByAttach
          ? `Whenever you attach an Energy card from your hand to this Pokémon: you may attach ${mayAttach || 'more'} additional Energy card${mayAttach && mayAttach !== '1' ? 's' : ''} (triggers automatically on your normal attach — not a separate manual action).`
          : upTo
            ? `Once during your turn: attach up to ${upTo} Energy cards.`
            : 'Once during your turn: attach Energy as described.',
    });
  }

  // Bench → Active promotion trigger (Lustrous Assist, Tachyon Bits, …)
  const hasPromotionTrigger =
    lower.includes('moves from your bench to the active spot') ||
    lower.includes('move from your bench to the active spot') ||
    lower.includes('moves from your bench to become your active pokémon') ||
    lower.includes('move from your bench to become your active pokémon');

  // ── 6. Move energy between Pokémon ──────────────────────────────────────
  if (
    !hasPromotionTrigger &&
    !lower.includes('knocked out') &&
    hasWord(lower, 'move') &&
    lower.includes('energy') &&
    (lower.includes('to 1 of your') ||
      lower.includes('to another') ||
      lower.includes('to a different') ||
      lower.includes('to your active') ||
      lower.includes('to this pokémon') ||
      lower.includes('to this pokemon') ||
      lower.includes('to your benched'))
  ) {
    const upTo = lower.match(/move\s+(?:up to\s+)?(\d+)\s+energy/)?.[1] || null;
    const unlimited = lower.includes('as often as you like');
    const energyType = parseEnergyTypeHint(lower);
    const basic = lower.includes('basic');
    steps.push({
      type: 'moveEnergyAbility',
      upTo: upTo ? Number(upTo) : null,
      unlimited,
      energyType,
      basic,
      guidance: unlimited
        ? 'During your turn (as often as you like): move Energy between your Pokémon as described.'
        : upTo
          ? `Once during your turn: move up to ${upTo} Energy from this Pokémon to another of your Pokémon.`
          : 'Once during your turn: move Energy from this Pokémon to another of your Pokémon.',
    });
  }

  // ── 7. Discard cost (Energy from hand to use ability) ───────────────────
  if (
    lower.includes('discard') &&
    lower.includes('from your hand') &&
    lower.includes('energy') &&
    !/(?:to attach|whenever you attach)[^.]*energy card from your hand[^.]*discard an energy card attached/.test(lower)
  ) {
    const countMatch = lower.match(/discard\s+(?:up to\s+)?(\d+)\s+/);
    const count = countMatch ? Number(countMatch[1]) : 1;
    const basic = lower.includes('basic');
    const energyType = parseEnergyTypeHint(lower);
    const typeLabel = energyType
      ? `${basic ? 'Basic ' : ''}${energyType.charAt(0).toUpperCase()}${energyType.slice(1)} `
      : basic ? 'Basic ' : '';
    steps.push({
      type: 'discardCostAbility',
      count,
      basic,
      energyType,
      guidance: `Once during your turn: discard ${count > 1 ? `${count} ` : ''}${typeLabel}Energy from your hand (cost).`,
    });
  }

  // Self-KO cost ("If you use this Ability, this Pokémon is Knocked Out") — not a KO trigger.
  const selfKoOnUse =
    /if you use this ability.*knocked out/i.test(lower) ||
    (/this pokémon is knocked out/i.test(lower) && lower.includes('if you'));

  const betweenOwnDamage =
    !hasPromotionTrigger &&
    !lower.includes('checkup') &&
    hasWord(lower, 'move') &&
    lower.includes('damage counter') &&
    lower.includes('from') &&
    (lower.includes('to another') ||
      lower.includes('onto another') ||
      lower.includes('to this pokémon') ||
      lower.includes('to this pokemon') ||
      /to 1 of your (?!opponent)/.test(lower));

  // ── 8. Move / place / put damage counters (before KO-recursion false positives) ──
  if (
    !hasPromotionTrigger &&
    !lower.includes('checkup') &&
    !(lower.includes('opponent') && lower.includes('evolve')) &&
    (hasWord(lower, 'move') || lower.includes('place') || hasWord(lower, 'put')) &&
    lower.includes('damage counter') &&
    (betweenOwnDamage ||
      hasDamageCounterPlacement(lower) ||
      lower.includes('on this pokémon') ||
      lower.includes('on this pokemon') ||
      lower.includes('on 1 of your opponent') ||
      (hasWord(lower, 'move') &&
        lower.includes('from') &&
        (lower.includes('to this pokémon') ||
          lower.includes('to this pokemon') ||
          lower.includes('to 1 of your opponent') ||
          lower.includes('to your opponent'))))
  ) {
    const upToMatch = lower.match(/(?:move|place|put)\s+up to\s+(\d+)\s+damage/);
    const exactMatch = lower.match(/(?:move|place|put)\s+(\d+)\s+damage/);
    const count = upToMatch ? Number(upToMatch[1]) : exactMatch ? Number(exactMatch[1]) : null;
    const onSelf =
      lower.includes('on this pokémon') || lower.includes('on this pokemon');
    const onOpponent = lower.includes('opponent');
    const betweenOwn = betweenOwnDamage;
    const verb = hasWord(lower, 'move') && !lower.includes('place') && !hasWord(lower, 'put')
      ? 'move'
      : hasWord(lower, 'put')
        ? 'put'
        : 'place';

    if (betweenOwn) {
      const unlimited = lower.includes('as often as you like');
      steps.push({
        type: 'moveDamageBetweenAbility',
        count: count || 1,
        unlimited,
        guidance: unlimited
          ? 'As often as you like during your turn: move 1 damage counter from 1 of your Pokémon to another.'
          : 'Once during your turn: move damage counters between your Pokémon as described.',
      });
    } else if (onSelf) {
      steps.push({
        type: 'selfDamageAbility',
        count,
        selfKnockOut: selfKoOnUse,
        guidance: count
          ? `Once during your turn: put ${count} damage counter${count !== 1 ? 's' : ''} on this Pokémon.`
          : 'Once during your turn: put damage counters on this Pokémon as described.',
      });
    } else {
      steps.push({
        type: 'moveDamageAbility',
        count,
        upTo: upToMatch ? count : null,
        onOpponent,
        selfKnockOut: selfKoOnUse,
        guidance: count
          ? `Once during your turn: ${verb} ${upToMatch ? 'up to ' : ''}${count} damage counter${count !== 1 ? 's' : ''} ${onOpponent ? 'on your opponent\'s Pokémon' : 'as described'}.`
          : 'Once during your turn: move/place damage counters as described.',
      });
    }
  }

  // ── 8b. Turn-scoped attack damage bonus (Torrential Heart, …) ─────────────
  if (
    (lower.includes('once during your turn') || lower.includes('you may use this ability')) &&
    lower.includes('during this turn') &&
    lower.includes('more damage')
  ) {
    const amount =
      lower.match(/(\d+)\s+more\s+damage/)?.[1] ||
      lower.match(/do\s+(\d+)\s+more/)?.[1] ||
      null;
    steps.push({
      type: 'turnDamageBonusAbility',
      amount: amount ? Number(amount) : null,
      guidance: amount
        ? `During this turn, this Pokémon's attacks do ${amount} more damage to your opponent's Active Pokémon.`
        : 'During this turn, this Pokémon\'s attacks do more damage (as described).',
    });
  }

  // ── 9. Opponent disruption (discard / shuffle / return to opp hand) ─────
  if (
    lower.includes('opponent') &&
    !isSelfHandDiscardCost(lower) &&
    (lower.includes('discard') || lower.includes('shuffle') || lower.includes('reveal') ||
     (lower.includes('put') && (lower.includes('into their hand') || lower.includes("into your opponent's hand"))))
  ) {
    const n = lower.match(/discard\s+(?:up to\s+)?(\d+)\s+cards?/)?.[1] || null;
    const returnToHand = lower.includes('into their hand');
    const revealHand = lower.includes('reveal');
    steps.push({
      type: 'opponentDisruptAbility',
      count: n ? Number(n) : null,
      returnToHand,
      revealHand,
      guidance: revealHand
        ? 'Once during your turn: have your opponent reveal their hand (as described).'
        : returnToHand
          ? 'Once during your turn: return a card/Energy from your opponent\'s Pokémon to their hand (as described).'
          : n
            ? `Once during your turn: discard up to ${n} cards from your opponent (as described).`
            : 'Once during your turn: disrupt your opponent as described (discard/shuffle).',
    });
  }

  // ── 10. Recursion (KO-trigger: search/return from discard) ───────────────
  const koTrigger =
    (lower.includes('when this pokémon is knocked out') ||
      lower.includes('when it is knocked out') ||
      (lower.includes('when') && lower.includes('knocked out') && !lower.includes('if you use'))) &&
    !selfKoOnUse;
  if (
    koTrigger &&
    (lower.includes('search') || lower.includes('put') || lower.includes('return') || lower.includes('add'))
  ) {
    steps.push({
      type: 'recursionAbility',
      guidance: 'When this Pokémon is Knocked Out: search/return a card as described (recursion).',
    });
  }

  // Discard pile → top of deck (Munchlax Snack Search, Florges Wondrous Gift).
  if (
    lower.includes('discard pile') &&
    /top of your deck/.test(lower) &&
    (hasWord(lower, 'put') || lower.includes('place'))
  ) {
    steps.push({
      type: 'recursionAbility',
      coinFlip: lower.includes('flip a coin'),
      itemOnly: lower.includes('item card'),
      guidance: 'Once during your turn: put a card from your discard pile on top of your deck (as described).',
    });
  }

  // ── 11. Evolve (put an evolution card onto this Pokémon) ────────────────
  if (
    lower.includes('evolve') &&
    (lower.includes('this pokémon') || lower.includes('onto this pokémon'))
  ) {
    steps.push({
      type: 'evolveAbility',
      guidance: 'Once during your turn: evolve this Pokémon using a card from your hand (as described).',
    });
  }

  // ── 12. Look at top of deck ─────────────────────────────────────────────
  if (lower.includes('look at the top') || /look at \d+ cards? from the top/.test(lower)) {
    const n =
      lower.match(/top\s+(\d+)\s+cards?/)?.[1] ||
      lower.match(/(\d+)\s+cards? from the top/)?.[1] ||
      null;
    const opponent = lower.includes("opponent's deck");
    steps.push({
      type: 'lookAtTopAbility',
      count: n ? Number(n) : null,
      opponent,
      guidance: n
        ? `Once during your turn: look at the top ${n} cards of ${opponent ? "your opponent's" : 'your'} deck (as described).`
        : 'Once during your turn: look at the top of your deck (as described).',
    });
  }

  // ── 13. When-played (one-shot on play) ──────────────────────────────────
  if (lower.includes('when you play')) {
    steps.push({
      type: 'whenPlayedAbility',
      guidance: 'When you play this Pokémon: resolve the one-shot effect as described.',
    });
  }

  // ── 14. End-of-turn trigger ─────────────────────────────────────────────
  if (lower.includes('end of your turn') || lower.includes('at the end of your turn')) {
    steps.push({
      type: 'endOfTurnAbility',
      guidance: 'At the end of your turn: resolve the effect as described.',
    });
  }

  // ── 14. Status conditions (Confuse / Burn / Poison / Asleep) ────────────
  const namesStatus =
    lower.includes('confused') ||
    lower.includes('burned') ||
    lower.includes('poisoned') ||
    lower.includes('asleep') ||
    lower.includes('paralyzed');
  const conditionalPoisonOnSwitch =
    isBenchActiveSwitchText(lower) &&
    lower.includes('if you do') &&
    lower.includes('poisoned');
  const coinFlipStatus =
    lower.includes('flip a coin') &&
    (namesStatus || lower.includes('burned') || lower.includes('confused') || lower.includes('poisoned'));
  if (
    !conditionalPoisonOnSwitch &&
    (coinFlipStatus ||
      namesStatus ||
      (lower.includes('make') &&
        lower.includes('opponent') &&
        (lower.includes('asleep') ||
          lower.includes('burned') ||
          lower.includes('confused') ||
          lower.includes('poisoned'))) ||
      (lower.includes('special condition') && namesStatus && !lower.includes('recover')))
  ) {
    const target = lower.includes('opponent') ? 'opponent' : 'attacker';
    let status = null;
    if (lower.includes('asleep')) status = 'asleep';
    else if (lower.includes('burned')) status = 'burned';
    else if (lower.includes('poisoned') || lower.includes('now poisoned')) status = 'poisoned';
    else if (lower.includes('confused')) status = 'confused';
    steps.push({
      type: 'statusAbility',
      target,
      status,
      coinFlip: coinFlipStatus,
      guidance: coinFlipStatus
        ? 'Once during your turn: flip a coin — if heads, apply the Special Condition as described.'
        : `Apply a Special Condition to the ${target === 'opponent' ? 'opponent\'s Active Pokémon' : 'attacking Pokémon'} as described.`,
    });
  }

  // ── 15. KO-prevention (coin flip or full-HP survive) ─────────────────────
  if (
    (lower.includes('knocked out') &&
      (lower.includes('prevent') ||
        lower.includes("can't") ||
        lower.includes('coin') ||
        lower.includes('flip'))) ||
    (lower.includes('full hp') &&
      lower.includes('would be knocked out') &&
      lower.includes('not knocked out'))
  ) {
    const fullHp = lower.includes('full hp');
    steps.push({
      type: 'koPreventionAbility',
      fullHp,
      guidance: fullHp
        ? 'When this Pokémon has full HP and would be Knocked Out by an attack: it is not Knocked Out and its remaining HP becomes 10 (as described).'
        : 'When this Pokémon would be Knocked Out: flip a coin — if heads, it is not Knocked Out (as described).',
    });
  }

  // ── 17. Retreat cost modifier ───────────────────────────────────────────
  if (
    lower.includes('retreat cost') ||
    /(?:less|more|no energy cost|free) to retreat/.test(lower) ||
    (/\bpay\b/.test(lower) && lower.includes('to retreat'))
  ) {
    const increased =
      lower.includes('more') || lower.includes('increase') || lower.includes('additional');
    steps.push({
      type: 'retreatCostAbility',
      increased,
      guidance: increased
        ? 'Passive: increases the Retreat Cost of the target as described.'
        : 'Passive: modifies Retreat Cost as described.',
    });
  }

  // ── 18. Cost discount (ignore energy in cost) ───────────────────────────
  if (
    (lower.includes('cost') || lower.includes('energy')) &&
    (lower.includes('less') || lower.includes('ignore') || lower.includes('reduce') || lower.includes('more')) &&
    lower.includes('attack')
  ) {
    steps.push({
      type: 'costDiscountAbility',
      guidance: 'Passive: reduce the cost of attacks as described (ignore energy symbols).',
    });
  }

  // ── 18. HP bonus ────────────────────────────────────────────────────────
  if (
    lower.includes('hp') &&
    (lower.includes('more') ||
      lower.includes('increase') ||
      lower.includes('treated as') ||
      lower.includes('gets +') ||
      /maximum hp|max hp/.test(lower) ||
      /-\d+\s+hp/.test(lower) ||
      /\+\d+\s+hp/.test(lower))
  ) {
    const bonus =
      lower.match(/(\d+)\s+more\s+hp/)?.[1] ||
      lower.match(/(\d+)\s+hp\s+more/)?.[1] ||
      lower.match(/gets\s+\+(\d+)\s+hp/)?.[1] ||
      lower.match(/\+(\d+)\s+hp/)?.[1] ||
      null;
    steps.push({
      type: 'hpBonusAbility',
      bonus: bonus ? Number(bonus) : null,
      guidance: bonus
        ? `Passive: this Pokémon gets +${bonus} HP (as described).`
        : 'Passive: modifies this Pokémon\'s HP as described.',
    });
  }

  // ── 20. Weakness / Resistance change ────────────────────────────────────
  if (
    (lower.includes('weakness') || lower.includes('resistance')) &&
    !ignoresDefenderEffects(lower)
  ) {
    steps.push({
      type: 'weaknessAbility',
      guidance: 'Passive: modifies this Pokémon\'s Weakness/Resistance as described.',
    });
  }

  // ── 21. Damage reduction ────────────────────────────────────────────────
  if (
    lower.includes('less damage') ||
    lower.includes('reduce damage') ||
    lower.includes('damage dealt to') ||
    /damage (?:done|dealt) to [^.]*is reduced/.test(lower)
  ) {
    const amount = lower.match(/(\d+)\s+less\s+damage/)?.[1] || lower.match(/reduce.*?(\d+)/)?.[1] || lower.match(/reduced by\s+(\d+)/)?.[1] || null;
    steps.push({
      type: 'damageReductionAbility',
      amount: amount ? Number(amount) : null,
      guidance: amount
        ? `Passive: this Pokémon takes ${amount} less damage from attacks.`
        : 'Passive: this Pokémon takes less damage from attacks (as described).',
    });
  }

  // ── 22. Damage bonus ────────────────────────────────────────────────────
  if (lower.includes('more damage') && (lower.includes('attack') || lower.includes('this pokémon'))) {
    const amount = lower.match(/(\d+)\s+more\s+damage/)?.[1] || null;
    steps.push({
      type: 'damageBonusAbility',
      amount: amount ? Number(amount) : null,
      guidance: amount
        ? `Passive: attacks from this Pokémon deal ${amount} more damage (as described).`
        : 'Passive: attacks deal more damage (as described).',
    });
  }

  // ── 23. Damage prevention ───────────────────────────────────────────────
  if (
    (lower.includes('prevent') && lower.includes('damage')) ||
    lower.includes("can't be damaged") ||
    lower.includes('immune to damage')
  ) {
    steps.push({
      type: 'damagePreventAbility',
      guidance: 'Passive: prevent damage dealt to this Pokémon as described.',
    });
  }

  // ── 24. Setup / face-down placement ─────────────────────────────────────
  if (lower.includes('face-down') || lower.includes('face down')) {
    steps.push({
      type: 'setupAbility',
      guidance: 'When you play this Pokémon: place it face-down in the Active Spot (as described).',
    });
  }

  // Bench protection (Aurora Veil: Benched Pokémon take no damage from attacks).
  if (/benched pok[eé]mon (?:do not|don't|does not|doesn't) take damage/.test(lower)) {
    steps.push({
      type: 'damagePreventAbility',
      bench: true,
      guidance: "Passive: your Benched Pokémon take no damage from (and aren't affected by) attacks (as described).",
    });
  }

  // ── 25. Tool cap / extra Tool slot ──────────────────────────────────────
  if (lower.includes('tool') && (lower.includes('attach') || lower.includes('slot') || lower.includes('more'))) {
    steps.push({
      type: 'toolCapAbility',
      guidance: 'Passive: this Pokémon can have an extra Pokémon Tool attached (as described).',
    });
  }

  // ── 26. Prize modification ──────────────────────────────────────────────
  if (
    lower.includes('prize card') &&
    (lower.includes('less') ||
      lower.includes('fewer') ||
      lower.includes('more') ||
      lower.includes('extra') ||
      /doesn'?t take any prize|does not take any prize/.test(lower))
  ) {
    steps.push({
      type: 'prizeModifyAbility',
      guidance: 'Passive: modifies the number of Prize cards taken when this Pokémon is Knocked Out (as described).',
    });
  }

  // ── 27. Effect prevention / negation ────────────────────────────────────
  if (
    !isAbilityUsageLimitText(lower) &&
    (((lower.includes('prevent') ||
      lower.includes("can't") ||
      lower.includes('have no effect') ||
      lower.includes('has no effect') ||
      lower.includes('have no abilities') ||
      lower.includes('has no abilities') ||
      lower.includes('lose any abilit')) &&
      (lower.includes('effect') ||
        lower.includes('ability') ||
        lower.includes('abilities') ||
        lower.includes('attack') ||
        lower.includes('poké-power') ||
        lower.includes('poké-powers') ||
        lower.includes('poké-body') ||
        lower.includes('poké-bodies') ||
        lower.includes('poke-power') ||
        lower.includes('poke-powers') ||
        lower.includes('poke-body') ||
        lower.includes('poke-bodies'))) ||
    (lower.includes('active spot') && lower.includes('no abilit')))
  ) {
    // "Whenever your opponent plays a Trainer card ..., prevent all effects of
    // that card done to this Pokémon" — scope the guidance to Trainer-card
    // effects specifically instead of the generic catch-all. As above, the
    // trigger wording is a real Ability; only the printed α/Ω/Δ/θ marker makes
    // it an Ancient Trait (App. 23; parseAbility tags the step).
    const trainerTriggered = /(?:whenever|when)\s+your opponent plays a trainer card/.test(lower);
    const toolStadiumExcluded =
      trainerTriggered && lower.includes('excluding') &&
      (lower.includes('pokémon tool') || lower.includes('pokemon tool') || lower.includes('stadium'));
    steps.push({
      type: 'effectPreventAbility',
      trainerTriggered,
      guidance: trainerTriggered
        ? `Whenever your opponent plays a Trainer card${toolStadiumExcluded ? ' (excluding Pokémon Tools/Stadium)' : ''}: prevent all effects of that card done to this Pokémon.`
        : 'Passive: prevent or negate effects/abilities as described.',
    });
  }

  // ── 27. Energy ×N / double energy ───────────────────────────────────────
  if (
    lower.includes('energy') &&
    (lower.includes('×') ||
      lower.includes('x2') ||
      lower.includes('counts as') ||
      lower.includes('treated as') ||
      /instead of (?:its|their) usual type/.test(lower) ||
      (/\bprovide[sd]?\b/.test(lower) &&
        (/\{[a-z]\}\{[a-z]\}/.test(lower) || lower.includes('basic'))))
  ) {
    steps.push({
      type: 'energyMultiplierAbility',
      guidance: 'Passive: Energy attached to this Pokémon counts as/provides another type (as described).',
    });
  }

  // ── 29. Thorns / damage-on-attacker ─────────────────────────────────────
  if (
    lower.includes('damage counter') &&
    (lower.includes('put') || lower.includes('place')) &&
    (lower.includes('attacker') || lower.includes('attacking pokémon'))
  ) {
    const n = lower.match(/(\d+)\s+damage/)?.[1] || null;
    steps.push({
      type: 'thornsAbility',
      count: n ? Number(n) : null,
      guidance: n
        ? `Passive: when this Pokémon is damaged by an attack, put ${n} damage counter${n !== '1' ? 's' : ''} on the Attacking Pokémon.`
        : 'Passive: put damage counters on the Attacking Pokémon when this Pokémon is damaged.',
    });
  }

  // ── 29. Discard pile → hand ─────────────────────────────────────────────
  if (
    lower.includes('discard pile') &&
    lower.includes('into your hand') &&
    (lower.includes('put') || lower.includes('return') || lower.includes('add'))
  ) {
    const upTo = lower.match(/up to\s+(\d+)/)?.[1] || null;
    let what = 'card';
    if (lower.includes('energy')) what = 'Energy';
    else if (lower.includes('trainer')) what = 'Trainer';
    else if (lower.includes('item')) what = 'Item';
    else if (lower.includes('pokémon') || lower.includes('pokemon')) what = 'Pokémon';
    steps.push({
      type: 'recursionFromDiscardAbility',
      upTo: upTo ? Number(upTo) : null,
      what,
      guidance: upTo
        ? `Once during your turn: put up to ${upTo} cards from your discard pile into your hand.`
        : 'Once during your turn: put cards from your discard pile into your hand.',
    });
  }

  // ── 30. Pokémon Checkup damage ──────────────────────────────────────────
  if (lower.includes('checkup') && lower.includes('damage counter')) {
    const n = lower.match(/put\s+(\d+)\s+damage/)?.[1] || null;
    steps.push({
      type: 'checkupAbility',
      count: n ? Number(n) : null,
      guidance: n
        ? `During Pokémon Checkup: put ${n} damage counter${n !== '1' ? 's' : ''} as described.`
        : 'During Pokémon Checkup: put damage counters as described.',
    });
  }

  // ── 31. Attack inheritance from previous Evolutions ─────────────────────
  if (
    (lower.includes('previous evolution') || lower.includes('previous evolutions')) &&
    (lower.includes('attack') || lower.includes('attacks'))
  ) {
    steps.push({
      type: 'attackInheritanceAbility',
      guidance: 'Passive: this Pokémon (or your evolved Pokémon) can use attacks from its previous Evolutions (as described).',
    });
  }

  // ── 32. Opponent evolution trigger ──────────────────────────────────────
  if (
    lower.includes('opponent') &&
    lower.includes('evolve') &&
    lower.includes('damage counter')
  ) {
    const n = lower.match(/put\s+(\d+)\s+damage/)?.[1] || null;
    steps.push({
      type: 'onOpponentEvolveAbility',
      count: n ? Number(n) : null,
      guidance: n
        ? `Whenever your opponent evolves: put ${n} damage counter${n !== '1' ? 's' : ''} on that Pokémon.`
        : 'Whenever your opponent evolves: put damage counters as described.',
    });
  }

  // ── 33. Bench → Active promotion trigger ────────────────────────────────
  if (hasPromotionTrigger) {
    let effect = 'other';
    if (hasWord(lower, 'move') && lower.includes('energy')) effect = 'moveEnergy';
    else if (lower.includes('damage counter')) effect = 'damage';
    const n = lower.match(/put\s+(\d+)\s+damage/)?.[1] || null;
    steps.push({
      type: 'onPromotionAbility',
      effect,
      count: n ? Number(n) : null,
      guidance:
        effect === 'moveEnergy'
          ? 'When this Pokémon moves from your Bench to the Active Spot: move Energy as described.'
          : effect === 'damage'
            ? `When this Pokémon moves from your Bench to the Active Spot: put ${n || ''} damage counter${n && n !== '1' ? 's' : ''} as described.`
            : 'When this Pokémon moves from your Bench to the Active Spot: resolve the effect as described.',
    });
  }

  // ── 34. First-turn attack permission ────────────────────────────────────
  if (
    (lower.includes('first turn') && (lower.includes('attack') || lower.includes('attacks'))) ||
    (lower.includes('go first') && (lower.includes('attack') || lower.includes('attacks')))
  ) {
    steps.push({
      type: 'firstTurnAttackAbility',
      guidance: 'Passive: this Pokémon can use attacks during your first turn (as described).',
    });
  }

  // ── 35. Continuous type change ──────────────────────────────────────────
  if (
    typeChangeText(lower) ||
    /\b(?:is|are)\s+\{[a-z]\}(?:\s*,\s*\{[a-z]\})+(?:\s*,?\s*and\s+\{[a-z]\})?\s*type/.test(lower) ||
    /treat .* as a pok[eé]mon that has δ/.test(lower)
  ) {
    steps.push({
      type: 'typeChangeAbility',
      guidance: 'Passive: this Pokémon\'s type changes while the stated condition holds (as described).',
    });
  }

  // ── 36. Special-Condition immunity ──────────────────────────────────────
  if (specialConditionImmunity(lower)) {
    steps.push({
      type: 'statusImmunityAbility',
      guidance: 'Passive: this Pokémon can\'t be affected by Special Conditions (as described).',
    });
  }

  // ── 37. Attack copying (borrow another Pokémon's attacks) ───────────────
  if (canUseAttacksOf(lower)) {
    steps.push({
      type: 'attackCopyAbility',
      guidance: 'Passive: this Pokémon can use the listed Pokémon\'s attacks (Energy still required, as described).',
    });
  }

  // ── 38. Extra attacks per turn ──────────────────────────────────────────
  if (attacksTwice(lower)) {
    steps.push({
      type: 'extraAttackAbility',
      guidance: 'Passive: this Pokémon may attack twice during your turn (as described).',
    });
  }

  // ── 39. Attacks ignore effects on the Defending Pokémon ─────────────────
  if (ignoresDefenderEffects(lower)) {
    steps.push({
      type: 'ignoreDefenderEffectsAbility',
      guidance: 'Passive: damage from this Pokémon\'s attacks isn\'t affected by effects on the Defending Pokémon (as described).',
    });
  }

  // ── 40. Evolve during first turn / turn played (Δ Evolution) ────────────
  if (
    lower.includes('evolve') &&
    (/first turn or the turn you play/.test(lower) ||
      /evolve during the turn you play/.test(lower))
  ) {
    steps.push({
      type: 'evolvePermissionAbility',
      guidance: 'Passive: you may evolve this Pokémon during your first turn or the turn it was played (Δ Evolution).',
    });
  }

  // ── 41. When-drawn placement (Top Entry) ────────────────────────────────
  if (lower.includes('if you drew this pokémon from your deck')) {
    steps.push({
      type: 'whenDrawnAbility',
      guidance: 'When you draw this Pokémon at the start of your turn: you may put it onto your Bench (as described).',
    });
  }

  // ── 42. Hand ↔ top-of-deck swap (Primate Wisdom) ────────────────────────
  if (
    (lower.includes('switch') &&
      lower.includes('card from your hand') &&
      lower.includes('top card of your deck')) ||
    /shuffles? (?:his or her|their|your) hand into (?:his or her|their|your) deck/.test(lower)
  ) {
    steps.push({
      type: 'handDeckSwapAbility',
      guidance: 'Once during your turn: switch a card from your hand with the top card of your deck (as described).',
    });
  }

  // ── 43. Discard pile → Bench (recursion) ────────────────────────────────
  if (lower.includes('discard pile') && lower.includes('onto your bench')) {
    steps.push({
      type: 'benchFromDiscardAbility',
      guidance: 'Once during your turn: put Pokémon from your discard pile onto your Bench (as described).',
    });
  }

  // ── 44. Draw until hand matches a board count (variable) ────────────────
  if (lower.includes('draw cards until you have as many')) {
    steps.push({
      type: 'drawVariableAbility',
      guidance: 'Once during your turn: draw until your hand has as many cards as described (see card text).',
    });
  }

  // ── 45. Shuffle this Pokémon into the deck (self-return) ────────────────
  if (
    (/\bshuffle\b[^.]*into your deck/.test(lower) && lower.includes('this pokémon')) ||
    /put this pok[eé]mon on (?:the )?(?:bottom|top) of your deck/.test(lower) ||
    /discard all cards (?:attached to |from )[^.]*and put [^.]* on (?:the )?(?:bottom|top) of your deck/.test(lower) ||
    /shuffle that pok[eé]mon back into your deck/.test(lower)
  ) {
    steps.push({
      type: 'returnSelfToDeckAbility',
      guidance: 'Once during your turn: shuffle this Pokémon and its attached cards into your deck (as described).',
    });
  }

  // ── 46. Summon restriction (Zero to Hero) ───────────────────────────────
  if (lower.includes('put this pokémon into play only with the effect')) {
    steps.push({
      type: 'summonRestrictionAbility',
      guidance: 'Passive: this Pokémon can only be put into play by the stated effect (as described).',
    });
  }

  // ── 47. Card-play / evolve locks (continuous) ───────────────────────────
  const canPlayLock = /can'?t play [^.]*from (?:his or her|their) hand/.test(lower);
  const eachPlayerLock =
    /(?:each player|neither player) can'?t play any/.test(lower) || lower.includes('each play');
  const neitherCanPlay = /neither player can play/.test(lower);
  if (canPlayLock || eachPlayerLock || neitherCanPlay) {
    const evolveLock = lower.includes('to evolve');
    if (evolveLock) {
      steps.push({
        type: 'evolveLockAbility',
        eachPlayer: eachPlayerLock || neitherCanPlay,
        benchOnly: lower.includes('benched'),
        guidance: `Passive: ${eachPlayerLock || neitherCanPlay ? 'each player' : 'your opponent'} can't play Pokémon to evolve${lower.includes('benched') ? ' Benched Pokémon' : ' Pokémon in play'} (as described).`,
      });
    } else {
      const cards = [];
      if (lower.includes('item card')) cards.push('Item');
      if (lower.includes('pokémon tool')) cards.push('Pokémon Tool');
      if (lower.includes('supporter')) cards.push('Supporter');
      if (lower.includes('stadium')) cards.push('Stadium');
      if (lower.includes('special energy')) cards.push('Special Energy');
      if (lower.includes('ace spec')) cards.push('ACE SPEC');
      if (!cards.length && lower.includes('trainer')) cards.push('Trainer');
      if (!cards.length && lower.includes('pokémon')) cards.push('Pokémon');
      steps.push({
        type: 'playLockAbility',
        eachPlayer: eachPlayerLock || neitherCanPlay,
        cards: cards.length ? cards : ['card'],
        guidance: `Passive: ${eachPlayerLock || neitherCanPlay ? 'each player' : 'your opponent'} can't play ${cards.length ? cards.join('/') : 'the listed cards'} from hand (as described).`,
      });
    }
  }

  // ── 48. Retreat locks (continuous) ──────────────────────────────────────
  if (/(?:opponent's|defending)[^.]*can'?t retreat/.test(lower)) {
    steps.push({
      type: 'retreatLockAbility',
      conditioned: lower.includes('special condition'),
      guidance: lower.includes('special condition')
        ? "Passive: your opponent's Pokémon affected by Special Conditions can't retreat (as described)."
        : "Passive: the opponent's Active Pokémon can't retreat (as described).",
    });
  }

  // ── 49. Ability suppression / ignore (continuous) ───────────────────────
  if (
    /ignore all pok[eé]-powers and pok[eé]-bodies/.test(lower) ||
    /ignore all pok[eé]mon powers/.test(lower) ||
    (/has a pok[eé]mon power/.test(lower) && /that power stops working/.test(lower))
  ) {
    steps.push({
      type: 'powerSuppressAbility',
      guidance: 'Passive: suppresses or ignores the stated Abilities/Poké-Powers (as described).',
    });
  }

  // ── 50. Damage-counter movement lock (continuous) ───────────────────────
  if (/damage counters?[^.]*can'?t be moved/.test(lower)) {
    steps.push({
      type: 'damageCounterLockAbility',
      guidance: "Passive: damage counters can't be moved between Pokémon (as described).",
    });
  }

  // ── 51. Move Energy onto this Pokémon / opponent's / on KO ──────────────
  if (
    hasWord(lower, 'move') &&
    lower.includes('energy') &&
    !steps.some((s) => s.type === 'moveEnergyAbility')
  ) {
    if (/from your opponent's active pok[eé]mon to/.test(lower)) {
      steps.push({
        type: 'moveOpponentEnergyAbility',
        coinFlip: lower.includes('flip a coin'),
        guidance: "Once during your turn: move an Energy from your opponent's Active Pokémon to their Bench (as described).",
      });
    } else if (lower.includes('knocked out') && lower.includes('opponent')) {
      steps.push({
        type: 'energyOnKoAbility',
        basic: lower.includes('basic'),
        upTo: lower.match(/move\s+up to\s+(\d+)\s+(?:basic\s+)?energy/)?.[1] || null,
        guidance: lower.includes('benched')
          ? 'When this Pokémon is Knocked Out: move Energy from it to your Benched Pokémon (as described).'
          : 'When 1 of your Pokémon is Knocked Out: move Energy from it to this Pokémon (as described).',
      });
    } else if (lower.includes('to this pokémon') || lower.includes('to this pokemon')) {
      steps.push({
        type: 'moveEnergyAbility',
        upTo: lower.match(/move\s+(?:up to\s+)?(\d+)\s+(?:basic\s+)?energy/)?.[1] || null,
        unlimited: lower.includes('as often as you like') || lower.includes('any number'),
        energyType: parseEnergyTypeHint(lower),
        basic: lower.includes('basic'),
        guidance: 'Once during your turn: move Energy from your other Pokémon to this Pokémon (as described).',
      });
    } else if (lower.includes('to your benched')) {
      steps.push({
        type: 'moveEnergyAbility',
        upTo: lower.match(/move\s+up to\s+(\d+)\s+(?:basic\s+)?energy/)?.[1] || null,
        basic: lower.includes('basic'),
        guidance: 'Move Energy from this Pokémon to your Benched Pokémon (as described).',
      });
    }
  }

  // ── 52. Energy type swap with the discard pile (Second Coat) ────────────
  if (/switch .*energy .*with .*energy/.test(lower) && lower.includes('discard pile')) {
    steps.push({
      type: 'energySwapAbility',
      basic: lower.includes('basic'),
      guidance: 'Once during your turn: swap an attached basic Energy with a different basic Energy from your discard pile (as described).',
    });
  }

  // ── 53. Transform / replace this Pokémon (Stance Change, V Transformation, Schooling, Form Variation, Phantom Transformation) ──
  if (
    (/switch this pok[eé]mon with/.test(lower) &&
      (lower.includes('in your hand') || lower.includes('discard pile'))) ||
    (/switch it with/.test(lower) && lower.includes('discard pile')) ||
    /put a basic pok[eé]mon from your hand on top of this pok[eé]mon/.test(lower) ||
    /put the chosen pok[eé]mon in its place/.test(lower)
  ) {
    steps.push({
      type: 'transformAbility',
      fromDiscard: lower.includes('discard pile'),
      guidance:
        'Once during your turn: replace this Pokémon with the named card (attached cards, counters and conditions remain, as described).',
    });
  }

  // ── 54. Recover / transfer Special Conditions ───────────────────────────
  if (
    /recover(?:s|ed)? from all special conditions?/.test(lower) ||
    /remove (?:all |a |1 |that )?special conditions?/.test(lower)
  ) {
    steps.push({
      type: 'recoverStatusAbility',
      guidance: 'Once during your turn: remove/recover from Special Conditions (as described).',
    });
  }
  if (/choose 1 special condition/.test(lower) && /defending pok[eé]mon is now affected/.test(lower)) {
    steps.push({
      type: 'transferStatusAbility',
      guidance: 'Once during your turn: move a Special Condition from your Pokémon to the Defending Pokémon (as described).',
    });
  }

  // ── 55. Win condition (Unown MISSING / HAND) ────────────────────────────
  if (/you win this game/.test(lower)) {
    steps.push({
      type: 'winGameAbility',
      guidance: 'Once during your turn: if the stated condition holds, you win this game (as described).',
    });
  }

  // ── 56. Lost Zone from the top of the deck (Darkness Send) ──────────────
  if (/lost zone/.test(lower) && /top card/.test(lower) && lower.includes('flip')) {
    steps.push({
      type: 'lostZoneFromDeckAbility',
      guidance: "Once during your turn: flip coins — put the top card(s) of your opponent's deck in the Lost Zone (as described).",
    });
  }

  // ── 57. Peek at the opponent's deck / hand ──────────────────────────────
  if (/look at \d+ cards? from the top of your opponent's deck/.test(lower)) {
    steps.push({
      type: 'deckPeekAbility',
      target: 'opponentDeck',
      count: Number(lower.match(/(\d+)\s+cards? from the top/)?.[1] || 0) || null,
      guidance: "Once during your turn: look at the top cards of your opponent's deck and put them back in the same order (as described).",
    });
  } else if (lower.includes("look at your opponent's hand")) {
    steps.push({
      type: 'deckPeekAbility',
      target: 'opponentHand',
      guidance: "Once during your turn: look at your opponent's hand (as described).",
    });
  }
  if (/put the top card of your opponent's deck on the bottom/.test(lower)) {
    steps.push({
      type: 'deckPlaceAbility',
      to: 'bottom',
      guidance: "Once during your turn: put the top card of your opponent's deck on the bottom without looking (as described).",
    });
  }
  if (/plays with (?:his or her|their) hand face up/.test(lower)) {
    steps.push({
      type: 'deckPeekAbility',
      target: 'opponentHandRevealed',
      guidance: "Passive: your opponent plays with their hand revealed (as described).",
    });
  }

  // ── 58. Discard any number of cards, then draw that many (Conversion Star) ──
  if (/discard any number of cards from your hand/.test(lower) && lower.includes('draw that many')) {
    steps.push({
      type: 'discardForDrawAbility',
      guidance: 'Once during your turn: discard any number of cards from your hand, then draw that many (as described).',
    });
  }

  // ── 59. Self-attach as a Special Energy (Battery, Buzzap Thunder) ───────
  if (
    /attach this card from your hand to 1 of your/.test(lower) ||
    /knock out this pok[eé]mon and attach it/.test(lower)
  ) {
    steps.push({
      type: 'selfAttachEnergyAbility',
      knockOutSelf: /knock out this pok[eé]mon/.test(lower),
      guidance: /knock out this pok[eé]mon/.test(lower)
        ? 'Once during your turn: Knock Out this Pokémon and attach it to one of your Pokémon as a Special Energy card (as described).'
        : 'Once during your turn: attach this card from your hand as a Special Energy card (as described).',
    });
  }

  // ── 60. Return this Pokémon to hand / put it on the deck ────────────────
  if (/return [^.]*and all cards attached to it to your hand/.test(lower)) {
    steps.push({
      type: 'returnSelfToHandAbility',
      coinFlip: lower.includes('flip a coin'),
      guidance: 'Once during your turn: return this Pokémon and all attached cards to your hand (as described).',
    });
  }

  // ── 61. Put this Pokémon onto the Bench / swap with the Active ──────────
  if (
    (/put this pok[eé]mon onto your bench/.test(lower) ||
      /play this pok[eé]mon onto your bench/.test(lower) ||
      /play this pok[eé]mon as your new active pok[eé]mon/.test(lower)) &&
    !lower.includes('when you play')
  ) {
    steps.push({
      type: 'selfBenchPlacementAbility',
      swapActive: /move your active pok[eé]mon to your bench/.test(lower),
      guidance: /move your active pok[eé]mon to your bench/.test(lower)
        ? 'Once during your turn: move your Active Pokémon to the Bench and put this Pokémon in the Active Spot (as described).'
        : 'Once during your turn: put this Pokémon from your hand onto your Bench (as described).',
    });
  }

  // ── 62. Stadium manipulation (Crush Chance, Resetting Hole, Teleport Room) ──
  if (/discard (?:any|a) stadium card in play/.test(lower)) {
    steps.push({
      type: 'stadiumManipAbility',
      replace: /put a stadium card with a different name from your discard pile into play/.test(lower),
      discardSelf: /discard this pok[eé]mon/.test(lower),
      guidance: /put a stadium card with a different name/.test(lower)
        ? 'Once during your turn: discard the Stadium in play, then put a different Stadium from your discard pile into play (as described).'
        : 'Once during your turn: discard a Stadium card in play (as described).',
    });
  }

  // ── 63. Energy provides a different type / has no effect (Chlorophyll, Spectral Breach) ──
  if (
    /energy cards? that provide only .* provide .* instead/.test(lower) ||
    /all special energy attached .* provide .* and have no other effect/.test(lower)
  ) {
    steps.push({
      type: 'energyTypeChangeAbility',
      guidance: 'Passive: the stated Energy provides a different type (or has no other effect) as described.',
    });
  }

  // ── 64. Attack-cost modification (Insight, Tuning Echo, Star Light, Δ Aura, Glistening Bubbles) ──
  if (
    /attack cost/.test(lower) ||
    /ignore all energy in the cost/.test(lower) ||
    /pays .* less energy to use/.test(lower) ||
    /can use the [^.]* attack for \{/.test(lower)
  ) {
    steps.push({
      type: 'attackCostAbility',
      guidance: 'Passive: modifies the Energy cost of the stated attack(s) (as described).',
    });
  }

  // ── 65. Coin-flip control (Victory Star, Contrary/Unlucky Wind, Pattern Distraction) ──
  if (
    /after you flip any coins for an attack[^.]*begin flipping those coins again/.test(lower) ||
    /whenever your opponent flips a coin[^.]*treat it as tails/.test(lower) ||
    (/flips a coin/.test(lower) && /that attack does nothing/.test(lower))
  ) {
    steps.push({
      type: 'coinFlipControlAbility',
      reroll: /begin flipping those coins again/.test(lower),
      opponentTails: /treat it as tails/.test(lower),
      attackFail: /that attack does nothing/.test(lower),
      guidance: /begin flipping those coins again/.test(lower)
        ? 'Once during your turn: ignore the results of an attack\'s coin flips and reroll them (as described).'
        : /treat it as tails/.test(lower)
          ? 'Passive: your opponent\'s coin flips are treated as tails (as described).'
          : 'Passive: your opponent flips a coin when attacking — tails means the attack does nothing (as described).',
    });
  }

  // ── 66. Misc one-off continuous / trigger abilities ─────────────────────
  if (/you may play 2 supporter cards/.test(lower)) {
    steps.push({
      type: 'playExtraSupporterAbility',
      guidance: 'Passive: you may play 2 Supporter cards during your turn (as described).',
    });
  }
  if (/your turn does not end when you use/.test(lower)) {
    steps.push({
      type: 'turnNotEndAbility',
      guidance: 'Passive: your turn does not end when you use the stated card (as described).',
    });
  }
  if (/at the beginning of the game, you go first/.test(lower)) {
    steps.push({
      type: 'goFirstAbility',
      guidance: 'Passive: if this Pokémon is your Active Pokémon at the start of the game, you go first (as described).',
    });
  }
  if (/do \d+ of that damage to/.test(lower) && lower.includes('benched')) {
    steps.push({
      type: 'benchGuardAbility',
      guidance: 'Passive: damage done to your Benched Pokémon may be redirected to this Benched Pokémon (as described).',
    });
  }
  if (
    /attach [^.]*energy card from your hand[^.]*discard an energy card attached/.test(lower) ||
    /you must discard an energy card attached/.test(lower)
  ) {
    steps.push({
      type: 'attachRestrictionAbility',
      guidance: 'Passive: attaching the stated Energy from your hand to this Pokémon requires discarding an Energy attached to it (as described).',
    });
  }
  if (/attach any technical machine/.test(lower)) {
    steps.push({
      type: 'attachPermissionAbility',
      guidance: 'Passive: you may attach any Technical Machine to this Pokémon (as described).',
    });
  }
  if (/hold this card and throw it/.test(lower)) {
    steps.push({
      type: 'jokeAbility',
      guidance: 'Joke ability: printed for fun — no game effect.',
    });
  }
  if (/search your discard pile for a .* and attach it to/.test(lower)) {
    steps.push({
      type: 'searchDiscardAttachAbility',
      energyType: parseEnergyTypeHint(lower),
      basic: lower.includes('basic'),
      guidance: 'Once during your turn: search your discard pile for a card and attach it to this Pokémon (as described).',
    });
  }
  if (/discard your other benched pok[eé]mon/.test(lower)) {
    steps.push({
      type: 'discardBenchAbility',
      guidance: 'Once during your turn: keep the chosen Benched Pokémon and discard your other Benched Pokémon (as described).',
    });
  }
  if (/shuffles all cards in play/.test(lower)) {
    steps.push({
      type: 'resetInPlayAbility',
      guidance: 'Once per game: each player shuffles the stated cards in play into their deck (as described).',
    });
  }
  if (/use the effect of a supporter card you find there/.test(lower)) {
    steps.push({
      type: 'useSupporterAbility',
      guidance: "Once during your turn: use the effect of a Supporter card in your opponent's hand (as described).",
    });
  }
  if (/discard the top card of your opponent's deck/.test(lower)) {
    steps.push({
      type: 'discardOpponentDeckAbility',
      guidance: "Once during your turn: discard the top card of your opponent's deck (as described).",
    });
  }
  if (/defending pok[eé]mon retreats/.test(lower) && lower.includes('discard')) {
    steps.push({
      type: 'opponentDisruptAbility',
      onRetreat: true,
      guidance: 'Passive: when the Defending Pokémon retreats, discard the Energy attached to it (as described).',
    });
  }
  if (/damaged by an opponent's attack/.test(lower) && lower.includes("into your opponent's hand")) {
    steps.push({
      type: 'opponentDisruptAbility',
      returnToHand: true,
      guidance: "Passive: when this Pokémon is damaged, put an Energy from the Attacking Pokémon into your opponent's hand (as described).",
    });
  }

  // ── Passive fallback (only if NO other step matched) ────────────────────
  if (steps.length === 0 && text) {
    steps.push({
      type: 'passiveAbility',
      guidance: 'Passive ability — always active while in play (see card text for details).',
    });
  }

  // App. 23 / D72: a printed Ancient-Trait marker (or a spelled Delta name) tags
  // EVERY step this ability parsed to, so `isAncientTraitAbility` can tell a
  // trait from a real Ability. Wording alone never matches (`ancientTraitIn` is
  // marker/name based). Done once here, after the fallback, so a trait whose
  // body matched no branch still carries at least one tagged step.
  const trait = ancientTraitIn(text);
  if (trait) {
    for (const step of steps) step.trait = trait;
  }

  return steps;
}

export function describeAbilityStep(step) {
  return step.guidance || '';
}
