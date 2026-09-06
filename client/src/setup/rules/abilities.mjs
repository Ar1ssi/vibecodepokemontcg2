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

  if (
    lower.includes('onto your bench') ||
    lower.includes('put it onto your bench') ||
    lower.includes('put them onto your bench')
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

  const typedEnergy = lower.match(/basic\s+(\{[a-z]\})\s+energy/);
  if (typedEnergy) {
    what = `Basic ${typedEnergy[1].toUpperCase()} Energy`;
  } else if (/up to\s+(\d+)\s+basic energy/.test(lower)) {
    const m = lower.match(/up to\s+(\d+)\s+basic energy/);
    what = 'Basic Energy';
    count = Number(m[1]);
    upTo = true;
  } else if (lower.includes('basic energy')) {
    what = 'Basic Energy';
  } else if (lower.includes('energy')) {
    what = 'Energy';
  } else if (/up to\s+(\d+)\s+basic pok/.test(lower)) {
    const m = lower.match(/up to\s+(\d+)\s+basic pok/);
    what = 'a Basic Pokémon';
    count = Number(m[1]);
    upTo = true;
  } else if (lower.includes('basic pokémon') || lower.includes('basic pokemon')) {
    what = 'a Basic Pokémon';
  } else if (/up to\s+(\d+)\s+pok/.test(lower)) {
    const m = lower.match(/up to\s+(\d+)\s+pok/);
    what = 'a Pokémon';
    count = Number(m[1]);
    upTo = true;
  } else if (lower.includes('pokémon') || lower.includes('pokemon')) {
    what = 'a Pokémon';
  } else if (lower.includes('supporter')) {
    what = 'Supporter';
  } else if (lower.includes('item')) {
    what = 'Item';
  } else if (lower.includes('trainer')) {
    what = 'Trainer';
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
    (lower.includes('up to') && lower.includes('from your deck') && lower.includes('into your hand'))
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
  if (
    (lower.includes('switch your active') ||
      lower.includes('switch in 1 of') ||
      lower.includes('bring in 1 of')) &&
    (lower.includes('benched') || lower.includes('bench'))
  ) {
    const isOpponent = lower.includes("opponent's benched") || lower.includes('opponent\'s benched');
    steps.push({
      type: 'switchAbility',
      target: isOpponent ? 'opponent' : 'self',
      guidance: isOpponent
        ? 'Once during your turn: switch in 1 of your opponent\'s Benched Pokémon.'
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
    const basic = lower.includes('basic');
    const energyType = parseEnergyTypeHint(lower);
    steps.push({
      type: 'attachAbility',
      fromDiscard,
      upTo: upTo ? Number(upTo) : null,
      basic,
      energyType,
      guidance: fromDiscard
        ? 'Once during your turn: attach Energy from your discard pile.'
        : upTo
          ? `Once during your turn: attach up to ${upTo} Energy cards.`
          : 'Once during your turn: attach Energy as described.',
    });
  }

  // Bench → Active promotion trigger (Lustrous Assist, Tachyon Bits, …)
  const hasPromotionTrigger =
    lower.includes('moves from your bench to the active spot') ||
    lower.includes('move from your bench to the active spot');

  // ── 6. Move energy between Pokémon ──────────────────────────────────────
  if (
    !hasPromotionTrigger &&
    hasWord(lower, 'move') &&
    lower.includes('energy') &&
    (lower.includes('to 1 of your') ||
      lower.includes('to another') ||
      lower.includes('to a different') ||
      lower.includes('to your active'))
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
    lower.includes('energy')
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

  // ── 8. Move / place damage counters ─────────────────────────────────────
  if (
    (hasWord(lower, 'move') || lower.includes('place')) &&
    lower.includes('damage counter') &&
    hasDamageCounterPlacement(lower)
  ) {
    const upToMatch = lower.match(/(?:move|place)\s+up to\s+(\d+)\s+damage/);
    const exactMatch = lower.match(/(?:move|place)\s+(\d+)\s+damage/);
    const count = upToMatch ? Number(upToMatch[1]) : exactMatch ? Number(exactMatch[1]) : null;
    const onOpponent = lower.includes('opponent');
    const verb = hasWord(lower, 'move') && !lower.includes('place') ? 'move' : 'place';
    steps.push({
      type: 'moveDamageAbility',
      count,
      upTo: upToMatch ? count : null,
      onOpponent,
      guidance: count
        ? `Once during your turn: ${verb} ${upToMatch ? 'up to ' : ''}${count} damage counter${count !== 1 ? 's' : ''} ${onOpponent ? 'on your opponent\'s Pokémon' : 'as described'}.`
        : 'Once during your turn: move/place damage counters as described.',
    });
  }

  // ── 9. Opponent disruption (discard / shuffle / return to opp hand) ─────
  if (
    lower.includes('opponent') &&
    !isSelfHandDiscardCost(lower) &&
    (lower.includes('discard') || lower.includes('shuffle') ||
     (lower.includes('put') && lower.includes('into their hand')))
  ) {
    const n = lower.match(/discard\s+(?:up to\s+)?(\d+)\s+cards?/)?.[1] || null;
    const returnToHand = lower.includes('into their hand');
    steps.push({
      type: 'opponentDisruptAbility',
      count: n ? Number(n) : null,
      returnToHand,
      guidance: returnToHand
        ? 'Once during your turn: return a card/Energy from your opponent\'s Pokémon to their hand (as described).'
        : n
          ? `Once during your turn: discard up to ${n} cards from your opponent (as described).`
          : 'Once during your turn: disrupt your opponent as described (discard/shuffle).',
    });
  }

  // ── 10. Recursion (KO-trigger: search/return from discard) ───────────────
  if (
    lower.includes('knocked out') &&
    (lower.includes('search') || lower.includes('put') || lower.includes('return') || lower.includes('add'))
  ) {
    steps.push({
      type: 'recursionAbility',
      guidance: 'When this Pokémon is Knocked Out: search/return a card as described (recursion).',
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
  if (lower.includes('look at the top')) {
    const n = lower.match(/top\s+(\d+)\s+cards?/)?.[1] || null;
    steps.push({
      type: 'lookAtTopAbility',
      count: n ? Number(n) : null,
      guidance: n
        ? `Once during your turn: look at the top ${n} cards of your deck (take what qualifies, shuffle the rest).`
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
  if (
    namesStatus ||
    (lower.includes('make') &&
      lower.includes('opponent') &&
      namesStatus) ||
    (lower.includes('special condition') && namesStatus && !lower.includes('recover'))
  ) {
    const target = lower.includes('opponent') ? 'opponent' : 'attacker';
    steps.push({
      type: 'statusAbility',
      target,
      guidance: `Apply a Special Condition to the ${target === 'opponent' ? 'opponent\'s Active Pokémon' : 'attacking Pokémon'} as described.`,
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
  if (lower.includes('retreat cost')) {
    const increased = lower.includes('more') || lower.includes('increase');
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
    (lower.includes('less') || lower.includes('ignore') || lower.includes('reduce')) &&
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

  // ── 20. Weakness change ─────────────────────────────────────────────────
  if (lower.includes('weakness')) {
    steps.push({
      type: 'weaknessAbility',
      guidance: 'Passive: modifies this Pokémon\'s Weakness as described.',
    });
  }

  // ── 21. Damage reduction ────────────────────────────────────────────────
  if (
    (lower.includes('less damage') || lower.includes('reduce damage') || lower.includes('damage dealt to')) &&
    lower.includes('this pokémon')
  ) {
    const amount = lower.match(/(\d+)\s+less\s+damage/)?.[1] || lower.match(/reduce.*?(\d+)/)?.[1] || null;
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

  // ── 25. Tool cap / extra Tool slot ──────────────────────────────────────
  if (lower.includes('tool') && (lower.includes('attach') || lower.includes('slot') || lower.includes('more'))) {
    steps.push({
      type: 'toolCapAbility',
      guidance: 'Passive: this Pokémon can have an extra Pokémon Tool attached (as described).',
    });
  }

  // ── 26. Prize modification ──────────────────────────────────────────────
  if (lower.includes('prize card') && (lower.includes('less') || lower.includes('fewer') || lower.includes('more') || lower.includes('extra'))) {
    steps.push({
      type: 'prizeModifyAbility',
      guidance: 'Passive: modifies the number of Prize cards taken when this Pokémon is Knocked Out (as described).',
    });
  }

  // ── 27. Effect prevention / negation ────────────────────────────────────
  if (
    ((lower.includes('prevent') ||
      lower.includes("can't") ||
      lower.includes('have no effect') ||
      lower.includes('have no abilities') ||
      lower.includes('has no abilities')) &&
      (lower.includes('effect') || lower.includes('ability') || lower.includes('attack'))) ||
    (lower.includes('active spot') && lower.includes('no abilities'))
  ) {
    steps.push({
      type: 'effectPreventAbility',
      guidance: 'Passive: prevent or negate effects/abilities as described.',
    });
  }

  // ── 27. Energy ×N / double energy ───────────────────────────────────────
  if (
    lower.includes('energy') &&
    (lower.includes('×') ||
      lower.includes('x2') ||
      lower.includes('counts as') ||
      lower.includes('treated as') ||
      (lower.includes('provides') &&
        (/\{[a-z]\}\{[a-z]\}/.test(lower) || lower.includes('basic'))))
  ) {
    steps.push({
      type: 'energyMultiplierAbility',
      guidance: 'Passive: Energy attached to this Pokémon counts as more (as described).',
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

  // ── Passive fallback (only if NO other step matched) ────────────────────
  if (steps.length === 0 && text) {
    steps.push({
      type: 'passiveAbility',
      guidance: 'Passive ability — always active while in play (see card text for details).',
    });
  }

  return steps;
}

export function describeAbilityStep(step) {
  return step.guidance || '';
}
