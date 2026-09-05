// Trainer/Supporter effect parser: converts printed card text into
// structured effect steps the rules engine can guide a player through.
// Grounded in the actual text of the Mega Battle starter decks.

// Effect step vocabulary:
//   { type: 'draw', count: N }
//   { type: 'drawUntil', target: N, bonusTarget?: M }
//   { type: 'opponentDraw', count: N }
//   { type: 'shuffleHandThenDraw', count: N, bonusCount: M, bonusWhen: 'prizes==6' }
//   { type: 'discardHandThenDraw', count: N }
//   { type: 'searchDeck', what: 'Item+Tool' | 'Basic Pokemon' | 'Pokemon' | ... , destination: 'hand'|'bench', count: N }
//   { type: 'lookAtTop', count: N, pick: 'Supporter'|'Dark Pokemon', destination: 'hand'|'bench' }
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
  if (lower.includes('more prize cards')) return 'Bonus prize cards under a condition — applies when the condition is met.';
  if (lower.includes('have no abilities')) return 'Negates Abilities — applies automatically.';
  if (lower.includes('have no effect')) return 'Negates Pokémon Tool effects — applies automatically.';
  if (lower.includes('cost {c} more') || lower.includes('cost {c} less')) return 'Attack cost modifier — applies automatically.';
  if (lower.includes('can evolve into')) return 'Evolution timing modifier — applies automatically.';
  if (lower.includes("don't recover") || lower.includes('do not recover')) return 'Special Condition modifier — applies automatically.';
  if (lower.includes('retreat cost')) return 'Retreat Cost modifier — applies automatically.';
  return 'Passive / conditional effect — applies automatically or when its condition is met.';
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

  // search deck → hand/bench (with optional discard cost)
  if (lower.includes('search your deck for')) {
    let what = 'card';
    let count = 1;
    let destination = 'hand';
    if (lower.includes('item card and a pokémon tool card')) what = 'Item + Pokémon Tool';
    else if (lower.includes('basic pokémon, a stage 1 pokémon, and a stage 2 pokémon')) { what = 'Basic/Stage1/Stage2 Pokémon'; count = 3; }
    else if (lower.includes('up to 2 basic pokémon')) { what = 'Basic Pokémon ≤70 HP'; count = 2; destination = 'bench'; }
    else if (lower.includes('basic pokémon') && lower.includes('onto your bench')) { what = 'Basic Pokémon'; destination = 'bench'; }
    else if (lower.includes('mega evolution pokémon ex')) what = 'Mega Evolution Pokémon ex';
    else if (lower.includes('supporter card')) what = 'Supporter';
    else if (lower.includes('trainer card')) what = 'Trainer';
    else if (lower.includes('up to 4') && lower.includes('pokémon')) { what = 'Pokémon'; count = 4; }
    else if (lower.includes('up to 3') && lower.includes('basic')) { what = 'Basic Pokémon'; count = 3; }
    else if (lower.includes('up to 7') && lower.includes('energy')) { what = 'Basic Energy'; count = 7; }
    else if (lower.includes('energy') && lower.includes('or') && lower.includes('pokémon')) { what = 'Basic Energy or Basic Pokémon'; }
    else if (lower.includes('pokémon')) what = 'Pokémon';
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

  // switches (with optional trailing draw)
  if (lower.includes("switch in 1 of your opponent's benched pokémon")) {
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

  // attach from discard (Wondrous Patch, Glass Trumpet, N's PP Up)
  if (lower.includes('attach a basic') && lower.includes('from your discard pile')) {
    const energy = lower.includes('{p}') ? 'Basic {P} Energy' : 'Basic Energy';
    let target;
    if (lower.includes('up to 2')) target = 'up to 2 of your Benched {C} Pokémon';
    else if (lower.includes('{p} pokémon')) target = '1 of your Benched {P} Pokémon';
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
    'have no abilities',
    'have no effect',
    'cost {c} more',
    'cost {c} less',
    'can evolve into',
    "don't recover",
    'do not recover',
  ];
  if (passiveKeywords.some((k) => lower.includes(k))) {
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
    case 'searchDeck': return `Search your deck for ${step.count > 1 ? step.count + ' ' : ''}${step.what} → ${step.destination === 'bench' ? 'put on Bench' : 'add to hand'}, then shuffle.`;
    case 'lookAtTop': return `Look at the top ${step.count} cards; take a ${step.pick} to ${step.destination === 'bench' ? 'Bench' : 'hand'}, shuffle the rest.`;
    case 'switchOpponent': return "Choose 1 of your opponent's Benched Pokémon to switch into the Active Spot.";
    case 'switchOwn': return 'Switch your Active Pokémon with 1 of your Benched Pokémon.';
    case 'discardCost': return `Discard ${step.count} other card${step.count > 1 ? 's' : ''} from your hand (cost).`;
    case 'recursion': return `Put a ${step.what} from your discard pile into your hand.`;
    case 'heal': return `Heal all damage from your ${step.target}.`;
    case 'healAmount': return `Heal ${step.amount} damage from ${step.target}${step.cure ? ', and it recovers from Special Conditions' : ''}.`;
    case 'attachFromDiscard': return `Attach a ${step.energy} from your discard pile to ${step.target}.`;
    case 'ionoShuffle': return 'Both players shuffle the cards in their hands into their decks.';
    case 'evolveStage2': return 'Choose 1 of your Basic Pokémon in play; if you have a Stage 2 that evolves from it in your hand, put it on to evolve, skipping the Stage 1.';
    case 'moveEnergy': return 'Move a Basic Energy from 1 of your Pokémon to another of your Pokémon.';
    case 'devolve': return `Devolve ${step.target} by putting its Evolution cards into your hand (it can't evolve this turn).`;
    case 'discardTools': return `Choose up to ${step.count} Pokémon Tools attached to Pokémon (yours or your opponent's) and discard them.`;
    case 'discardFromOpponent': return `Discard ${step.target}.`;
    case 'switchOpponentOut': return "Switch out your opponent's Active Pokémon to the Bench (your opponent chooses the new Active).";
    case 'passive': return step.detail || 'Passive effect — stays in play.';
    default: return '';
  }
}