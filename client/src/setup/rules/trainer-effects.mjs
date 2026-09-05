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
  if (lower.includes('more damage')) return 'Turn-scoped attack damage boost — applies automatically.';
  if (lower.includes('less damage')) return 'Passive damage reduction — applies automatically.';
  if (lower.includes('prevent all damage')) return 'Prevents damage / attack effects — applies automatically.';
  if (/more prize cards?/.test(lower)) return 'Bonus prize cards under a condition — applies when the condition is met.';
  if (/gets \+\d+ hp/.test(lower)) return 'HP boost — applies automatically while attached.';
  if (lower.includes('recovers from all special conditions') || lower.includes("can't be affected by any special condition")) {
    return 'Special Condition immunity/recovery — applies automatically while attached.';
  }
  if (lower.includes('have no abilities')) return 'Negates Abilities — applies automatically.';
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
  return 'Passive / conditional effect — applies automatically or when its condition is met.';
}

function parseEnergyType(lower) {
  const m = lower.match(/\{([a-z])\}/);
  return m ? `{${m[1].toUpperCase()}}` : null;
}

// Boss's Orders, Lisia's Appeal, etc. — optional stage/type words between "Benched" and "Pokémon".
function matchesSwitchOpponentIn(lower) {
  return (
    lower.includes("switch in 1 of your opponent's benched") &&
    lower.includes('pokémon') &&
    lower.includes('active spot')
  );
}

function appendTrailingDraw(steps, lower) {
  // A trailing draw clause that wasn't consumed by the primary branch.
  // "draw cards until you have N" takes precedence over a bare "draw N".
  const until = lower.match(/draw\s+cards\s+until\s+you have\s+(\d+)\s+cards?/i);
  if (until) {
    steps.push({ type: 'drawUntil', target: Number(until[1]) });
    return;
  }
  const m = lower.match(/(?:then\s+)?draw\s+(\d+)\s+cards?\.?/i);
  if (m) {
    steps.push({ type: 'draw', count: Number(m[1]) });
  }
}

// Shared search-deck target parsing — used by the main search branch and
// coin-flip heads/tails sub-clauses.
function parseSearchDeckParams(lower) {
  let what = 'card';
  let count = 1;
  let destination = 'hand';

  if (lower.includes('item card and a pokémon tool card')) what = 'Item + Pokémon Tool';
  else if (lower.includes('stadium card and an energy card') || lower.includes('stadium card and a energy card')) {
    what = 'Stadium + Energy';
    count = 2;
  } else if (lower.includes('basic pokémon, a stage 1 pokémon, and a stage 2 pokémon')) {
    what = 'Basic/Stage1/Stage2 Pokémon';
    count = 3;
  } else if (lower.includes('up to 2 basic pokémon')) {
    what = 'Basic Pokémon ≤70 HP';
    count = 2;
    destination = 'bench';
  } else if (lower.includes('basic pokémon') && lower.includes('onto your bench')) {
    what = 'Basic Pokémon';
    destination = 'bench';
  } else if (lower.includes('evolution team rocket')) what = "Evolution Team Rocket's Pokémon";
  else if (lower.includes('basic team rocket')) {
    what = "Basic Team Rocket's Pokémon";
    const m = lower.match(/up to\s+(\d+)/);
    if (m) count = Number(m[1]);
  } else if (lower.includes('up to 3') && lower.includes('basic')) {
    what = 'Basic Pokémon';
    count = 3;
  } else if (lower.includes('mega evolution pokémon ex')) what = 'Mega Evolution Pokémon ex';
  else if (lower.includes('supporter card')) what = 'Supporter';
  else if (lower.includes('trainer card')) what = 'Trainer';
  // Energy before generic Pokémon fallback (Misty's Vitality, etc.)
  else if (/up to\s+(\d+)\s+basic\s+\{[a-z]\}\s+energy/.test(lower)) {
    const m = lower.match(/up to\s+(\d+)\s+basic\s+(\{[a-z]\})\s+energy/);
    what = `Basic ${m[2].toUpperCase()} Energy`;
    count = Number(m[1]);
  } else if (lower.includes('up to 7') && lower.includes('energy')) {
    what = 'Basic Energy';
    count = 7;
  } else if (/up to\s+(\d+)\s+basic\s+energy/.test(lower)) {
    const m = lower.match(/up to\s+(\d+)\s+basic\s+energy/);
    what = 'Basic Energy';
    count = Number(m[1]);
  } else if (lower.includes('basic') && lower.includes('energy') && !lower.includes('or')) {
    const typed = lower.match(/basic\s+(\{[a-z]\})\s+energy/);
    what = typed ? `Basic ${typed[1].toUpperCase()} Energy` : 'Basic Energy';
  } else if (lower.includes('up to 4') && lower.includes('pokémon')) {
    what = 'Pokémon';
    count = 4;
  } else if (lower.includes('energy') && lower.includes('or') && lower.includes('pokémon')) {
    what = 'Basic Energy or Basic Pokémon';
  } else if (lower.includes('pokémon')) what = 'Pokémon';

  if (
    lower.includes('attach them to') ||
    lower.includes('attach them to 1') ||
    (lower.includes('attach') && lower.includes('energy') && lower.includes('to 1 of your'))
  ) {
    destination = 'attach';
  }

  return { what, count, destination };
}

function parseCoinFlipStep(lower) {
  if (!lower.includes('flip a coin')) return null;

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

  const headsEnergy = lower.match(/if heads,?\s+discard an energy from 1 of your opponent's pokémon/);
  if (headsEnergy) {
    return {
      type: 'coinFlip',
      heads: [{ type: 'discardEnergyFromOpponent', energy: 'any Energy', count: 1, scope: '1 Pokémon' }],
      tails: [],
    };
  }

  const headsDmg = lower.match(/if heads,?\s+put\s+(\d+)\s+damage counters on 1 of your opponent's pokémon/);
  const tailsDmg = lower.match(/if tails,?\s+put\s+(\d+)\s+damage counters on your active pokémon/);
  if (headsDmg && tailsDmg) {
    return {
      type: 'coinFlip',
      heads: [{ type: 'damageCounters', count: Number(headsDmg[1]), target: "1 of your opponent's Pokémon" }],
      tails: [{ type: 'damageCounters', count: Number(tailsDmg[1]), target: 'your Active Pokémon' }],
    };
  }

  return null;
}

export function parseTrainerEffect(text = '') {
  const lower = normalizeText(text);
  const steps = [];

  // discard-hand-then-draw (Professor's Research)
  if (lower.includes('discard your hand and draw')) {
    const m = lower.match(/draw\s+(\d+)\s+cards?/);
    steps.push({ type: 'discardHandThenDraw', count: m ? Number(m[1]) : 7 });
    return { steps, recognizable: true };
  }

  // shuffle hand then draw (Lillie's Determination)
  if (lower.includes('shuffle your hand into your deck')) {
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

  // search deck → hand/bench/attach (with optional discard cost)
  if (lower.includes('search your deck for')) {
    const { what, count, destination } = parseSearchDeckParams(lower);
    steps.push({ type: 'searchDeck', what, count, destination });
    appendDiscardCost(steps, lower);
    // Compound effects: search-then-draw is common; append the trailing draw
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // look at top N (Pokégear, Grimsley's Move)
  if (lower.includes('look at the top')) {
    const m = lower.match(/top\s+(\d+)\s+cards?/);
    let pick = 'any';
    if (lower.includes('supporter card')) pick = 'Supporter';
    else if (lower.includes('attach a basic energy')) pick = 'Basic Energy (attach)';
    else if (lower.includes('onto your bench')) pick = 'Darkness Pokémon (bench)';
    steps.push({
      type: 'lookAtTop',
      count: m ? Number(m[1]) : 7,
      pick,
      destination: lower.includes('onto your bench') ? 'bench' : 'hand',
    });
    // Compound effects: look-then-draw is common
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // look at bottom N (Dusk Ball)
  if (lower.includes('look at the bottom')) {
    const m = lower.match(/bottom\s+(\d+)\s+cards?/);
    let pick = 'any';
    if (lower.includes('supporter card')) pick = 'Supporter';
    else if (lower.includes('pokémon')) pick = 'Pokémon';
    else if (lower.includes('attach a basic energy')) pick = 'Basic Energy (attach)';
    else if (lower.includes('onto your bench')) pick = 'Darkness Pokémon (bench)';
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
      steps.push({ type: 'switchOpponent' });
    }
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }
  if (lower.includes('switch your active pokémon with 1 of your benched pokémon') ||
      lower.includes("switch your active team rocket's pokémon")) {
    steps.push({ type: 'switchOwn' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // recursion from discard (Night Stretcher)
  if (lower.includes('from your discard pile into your hand')) {
    let what = 'card';
    if (lower.includes('pokémon or a basic energy')) what = 'Pokémon or Basic Energy';
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
      target: lower.includes('active pokémon') ? 'Active Pokémon' : '1 of your Pokémon',
      cure: lower.includes('special condition'),
    });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // heal all damage (Wally's Compassion)
  if (lower.includes('heal all damage')) {
    steps.push({ type: 'heal', target: lower.includes('mega evolution') ? 'Mega Evolution Pokémon ex' : 'Pokémon' });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // attach multiple from discard (Philippe — up to N typed Energy to one Pokémon)
  if (lower.includes('attach up to') && lower.includes('from your discard pile')) {
    const countMatch = lower.match(/attach up to\s+(\d+)/);
    const count = countMatch ? Number(countMatch[1]) : 2;
    const type = parseEnergyType(lower);
    const energy = type ? `Basic ${type} Energy` : 'Basic Energy';
    let target = '1 of your Pokémon';
    if (type && lower.includes(`${type.toLowerCase()} pokémon`)) target = `1 of your ${type} Pokémon`;
    else if (lower.includes('benched')) target = '1 of your Benched Pokémon';
    steps.push({ type: 'attachMultipleFromDiscard', count, energy, target });
    appendTrailingDraw(steps, lower);
    return { steps, recognizable: true };
  }

  // attach from discard (Wondrous Patch, Glass Trumpet, N's PP Up)
  if (lower.includes('attach a basic') && lower.includes('from your discard pile')) {
    const typedEnergy = lower.match(/attach a basic\s+(\{[a-z]\})\s+energy/);
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

  // both players shuffle hands (Iono — matches both the SV wording
  // "each player shuffles their hand" and PAL 185
  // "each player shuffles the cards in their hand into their deck")
  if (lower.includes('each player shuffles') && lower.includes('hand')) {
    steps.push({ type: 'ionoShuffle' });
    appendTrailingDraw(steps, lower);
    // Archer: "you draw 5 cards, and your opponent draws 3 cards"
    const oppDraw = lower.match(/your opponent draws?\s+(\d+)\s+cards?/i);
    if (oppDraw) steps.push({ type: 'opponentDraw', count: Number(oppDraw[1]) });
    return { steps, recognizable: true };
  }

  // draw until you have N (standalone — Iris's Fighting Spirit, Ariana)
  if (lower.includes('draw cards until you have')) {
    const all = [...lower.matchAll(/until you have\s+(\d+)\s+cards?/g)].map((x) => Number(x[1]));
    steps.push({
      type: 'drawUntil',
      target: all[0] ?? null,
      bonusTarget: lower.includes('instead') ? all[all.length - 1] : null,
    });
    appendDiscardCost(steps, lower);
    return { steps, recognizable: true };
  }

  // ── choice-based / guided actions (recognized, not auto-executed) ──────
  // These are discrete player actions. They are matched BEFORE the passive
  // fallback and the bare-draw fallback so they are never swallowed.

  // Rare Candy — evolve a Basic directly to Stage 2, skipping Stage 1
  if (lower.includes('skipping the stage 1') || (lower.includes('stage 2 card in your hand') && lower.includes('evolve'))) {
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

  // Strange Timepiece — devolve an evolved Pokémon. Matched specifically
  // ("devolve 1 of your …") so a Stadium that merely mentions the word
  // (e.g. Dizzying Valley: "…when they evolve or devolve.") stays passive.
  if (lower.includes('devolve 1 of your')) {
    steps.push({ type: 'devolve', target: lower.includes('{p}') ? '1 of your evolved {P} Pokémon' : '1 of your evolved Pokémon' });
    return { steps, recognizable: true };
  }

  // Tool Scrapper — discard up to 2 attached Pokémon Tools
  if (lower.includes('pokémon tools attached to pokémon')) {
    steps.push({ type: 'discardTools', count: 2 });
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

  // Scoop Up Cyclone / Professor Turo's Scenario — return Pokémon to hand
  if (lower.includes('put 1 of your pokémon') && lower.includes('into your hand')) {
    const keepAttached = lower.includes('all attached cards');
    steps.push({ type: 'returnPokemonToHand', keepAttached });
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

  // Redeemable Ticket — shuffle Prize cards back into deck and redraw
  if (lower.includes('count your prize cards') && lower.includes('shuffle them')) {
    steps.push({ type: 'reshufflePrizes' });
    return { steps, recognizable: true };
  }

  // Accompanying Flute — reveal opponent deck top, bench Basic Pokémon
  if (lower.includes("opponent's deck") && lower.includes('onto their bench')) {
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
    else if (lower.includes("opponent's benched pokémon")) source = 'opponentBench';
    else if (lower.includes('opponent reveals their hand') && lower.includes('pokémon you find')) {
      source = 'opponentHandPokemon';
    } else if (lower.includes("opponent's mega evolution pokémon ex in play")) {
      source = 'opponentMegaExInPlay';
    }
    if (source) {
      steps.push({ type: 'variableDraw', source, per: 'card' });
      appendDiscardCost(steps, lower);
      return { steps, recognizable: true };
    }
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

  // shuffle from discard into deck (Energy Recycler, Sacred Ash, Great Haul Net)
  if (lower.includes('from your discard pile into your deck')) {
    const countMatch = lower.match(/shuffle\s+up\s+to\s+(\d+)/);
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
      if (lower.includes('basic energy')) what = 'Basic Energy';
      else if (lower.includes('pokémon')) what = 'Pokémon';
      steps.push({ type: 'shuffleFromDiscard', what, count });
    }
    return { steps, recognizable: true };
  }

  // apply Special Conditions (Dangerous Laser, Dark Bell)
  if (lower.includes(' is now ') || lower.includes(' are now ')) {
    if (lower.includes("opponent's active pokémon is now")) {
      const conditions = [];
      if (lower.includes('burned')) conditions.push('Burned');
      if (lower.includes('confused')) conditions.push('Confused');
      if (conditions.length) {
        steps.push({ type: 'applyStatus', target: 'opponentActive', conditions });
        return { steps, recognizable: true };
      }
    }
    if (lower.includes('both active') && lower.includes('non-{d}') && lower.includes('confused')) {
      steps.push({ type: 'applyStatus', target: 'bothActiveNonDark', conditions: ['Confused'] });
      return { steps, recognizable: true };
    }
  }

  // Eri — reveal opponent hand, discard Items found there
  if (lower.includes('opponent reveals their hand') && lower.includes('discard') && lower.includes('item')) {
    const m = lower.match(/discard up to (\d+) item cards?/);
    steps.push({
      type: 'revealOpponentHandDiscard',
      what: 'Item',
      count: m ? Number(m[1]) : 2,
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

  // ── passive / turn-scoped / conditional effects ─────────────────────────
  // Recognized (recognizable: true) but not stepped — they are modifiers or
  // conditional effects that apply automatically or over a turn, and must NOT
  // fall through to the bare-draw branch. A short `detail` is attached so the
  // announcement is descriptive instead of a generic "passive".
  const passiveKeywords = [
    'retreat cost',
    'whenever any player',
    'is damaged by an attack',
    'once during each player',
    'once during your turn',
    'once during their turn',
    'more damage',
    'less damage',
    'prevent all damage',
    'more prize cards',
    'more prize card',
    'have no abilities',
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
  ];
  if (
    passiveKeywords.some((k) => lower.includes(k)) ||
    /gets \+\d+ hp/.test(lower)
  ) {
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
    case 'drawUntil': return `Draw cards until you have ${step.target} card${step.target === 1 ? '' : 's'} in your hand${step.bonusTarget ? ` (${step.bonusTarget} instead if the condition is met)` : ''}.`;
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
    case 'coinFlip': {
      const fmt = (branch) => {
        if (!branch) return 'nothing';
        const list = Array.isArray(branch) ? branch : [branch];
        if (list.length === 0) return 'nothing';
        return list.map((s) => {
          if (s.type === 'draw') return `draw ${s.count}`;
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
    case 'ionoShuffle': return 'Both players shuffle the cards in their hands into their decks.';
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
    case 'passive': return step.detail || 'Passive effect — stays in play.';
    default: return '';
  }
}