// Special-energy effect parser (taxonomy §F, Gap #4c).
//
// `energy-effects.mjs` classifies a special energy into a coarse *family*
// (double / attach-type / lock / redirect / protect) and executes the four
// families it knows. This module goes one level deeper: it turns the *printed
// text* of any special-energy card into a list of structured effect steps, the
// same way `trainer-effects.mjs` parses Trainers and `abilities.mjs` parses
// abilities.
//
// Like the rest of the rules parsers this module is pure + DOM-free and
// **announce-only**: `parseSpecialEnergyEffects` recognizes and describes
// effects, it never mutates game state. The pure execution helpers at the
// bottom (`getSpecialEnergyHpBonus`, `getSpecialEnergyAttackBonus`,
// `getSpecialEnergyDamageReduction`, …) are used by the live damage/HP paths;
// adding execution means touching those call sites, not this parser.
//
// Step vocabulary (all energy symbols normalized to {X}):
//   { type: 'provide', energyTypes: ['Grass'|'Any'|'CrystalBasic'], count, combination?, condition?, fallback? }
//   { type: 'attachRestriction', kind, hostType?, discardIfNot? }
//   { type: 'attachCost', discardFromHand }
//   { type: 'deckLimit', max }
//   { type: 'discardAtEndOfTurn' }
//   { type: 'discardWhenConditionLost', condition }
//   { type: 'onDiscardReturnToHand', condition? }
//   { type: 'onDiscardReattach', hostType?, condition? }
//   { type: 'onKnockoutReturnToHand', hostType? }
//   { type: 'onKnockoutDraw', until }
//   { type: 'prizeReduction', count }
//   { type: 'onDamagedDamageCounters', count, hostType?, activeOnly?, against? }
//   { type: 'onDamagedDraw', count }
//   { type: 'onEvolveHeal', amount, hostType? }
//   { type: 'onAttachDraw', count, hostType? }
//   { type: 'onAttachSearch', what, count, destination, hostType? }
//   { type: 'activatedSearch', what, count, destination, oncePerTurn, endsTurn, requiresActive }  (Call Energy; no consumer yet)
//   { type: 'onAttachHeal', amount, hostType? }
//   { type: 'onAttachRemoveDamage', count, alsoCure?, hostType? }
//   { type: 'onAttachDamageCounter', count }
//   { type: 'onAttachSwitch', side: 'self'|'opponent', target? }
//   { type: 'onAttachReturnBasicEnergy' }
//   { type: 'onAttachDevolve', count }
//   { type: 'onAttachClearStatus', conditions }
//   { type: 'hpBonus', amount, hostType? }
//   { type: 'damageBonus', amount, hostType?, target: 'opponentActive'|'active', condition? }
//   { type: 'attackDamagePenalty', amount, target: 'opponentPokemon' }
//   { type: 'damageReduction', amount, hostType?, source?: 'opponentPokemon'|'opponentPokemonEx'|'opponentPokemonV', afterWR? }
//   { type: 'noWeakness', hostType?, condition? }
//   { type: 'ignoresResistance', condition? }
//   { type: 'freeRetreat', hostType? }
//   { type: 'retreatReduction', amount }
//   { type: 'cannotRetreat' }
//   { type: 'statusImmunity', conditions }
//   { type: 'clearStatusOnAttach', conditions }
//   { type: 'effectShield', hostType?, source?: 'opponentPokemon'|'opponentAttacks', excludeDamage? }
//   { type: 'abilityShield', source: 'opponentPokemon' }
//   { type: 'benchDamageShield', hostType? }
//   { type: 'canUseEvolutionAttacks' }
//   { type: 'attachFromPrize' }
//   { type: 'ignoredOn', host: 'pokemonEx', unless: 'basicEnergy' }
//   { type: 'officialIllegal' }

import { isEnergyCard } from './energy-effects.mjs';
import { isExCard, isGxCard, isRuleBoxPokemon, isVCard } from './card-classify.mjs';

const SYMBOL_TYPES = {
  c: 'Colorless',
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  d: 'Dark',
  m: 'Metal',
  n: 'Dragon',
  y: 'Fairy',
};

const ALL_STATUS = ['Asleep', 'Confused', 'Paralyzed', 'Poisoned', 'Burned'];

function normalizeText(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019\u201A\u201B\u201A`]/g, "'")
    .replace(/\{\s*([A-Za-z])\s*\}/g, '{$1}')
    .toLowerCase();
}

function symbolTypes(segment) {
  const seen = new Set();
  const out = [];
  for (const m of String(segment).matchAll(/\{([a-z])\}/g)) {
    const t = SYMBOL_TYPES[m[1]];
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function repeatedSymbolCount(segment) {
  // "provides {C}{C} Energy" → 2; only when a single distinct symbol repeats.
  const types = symbolTypes(segment);
  if (types.length !== 1) return null;
  const symbols = [...String(segment).matchAll(/\{([a-z])\}/g)];
  if (symbols.length > 1) return symbols.length;
  return null;
}

// Energy-provided clause conditions → machine-readable tags.
function provisionCondition(segment) {
  if (/3 or more stage 2 pok/.test(segment)) return 'threeStage2';
  if (/stage 2 pok/.test(segment)) return 'stage2';
  if (/evolution pok/.test(segment)) return 'evolution';
  if (/ultra beast/.test(segment)) return 'ultraBeast';
  if (/basic pok/.test(segment)) return 'hostBasic';
  if (/is a pokémon sp\b/.test(segment)) return 'hostSP';
  if (/δ|delta species/.test(segment)) return 'delta';
  if (/any other special energy/.test(segment)) return 'otherSpecial';
  if (/more prize cards (left|remaining) than your opponent/.test(segment)) {
    if (/pokémon-gx or pokémon-ex/.test(segment)) return 'trailingPrizesNotGxEx';
    if (/excluding pokémon lv\.x|lv\.x/.test(segment)) return 'trailingPrizesNotLvX';
    if (/doesn't have a rule box|does not have a rule box/.test(segment)) {
      return 'trailingPrizesEvolutionNoRuleBox';
    }
    return 'trailingPrizes';
  }
  const host = segment.match(/only while (?:this card|it) is attached to an? ([^.]*?) pok/);
  if (host) {
    const types = symbolTypes(host[1]);
    if (types.length) return `host:${types[0]}`;
    if (/team magma/.test(host[1])) return 'teamMagma';
    if (/team aqua/.test(host[1])) return 'teamAqua';
  }
  return null;
}

function pickCount(segment, fallback = 1) {
  const only = segment.match(/provides? only (\d+) energy/);
  if (only) return Number(only[1]);
  const providesN = segment.match(/provides (\d+) energy/);
  if (providesN) return Number(providesN[1]);
  // Rapid Strike Energy: "it provides 2 in any combination of {W} Energy and {F} Energy" (SE14).
  const anyCombo = segment.match(/(?:^|provides (?:only )?)(\d+) in any combination/);
  if (anyCombo) return Number(anyCombo[1]);
  const atATime = segment.match(/provides? (\d+) energy at a time/);
  if (atATime) return Number(atATime[1]);
  const repeated = repeatedSymbolCount(segment);
  if (repeated) return repeated;
  return fallback;
}

// Parse a single "…provides X Energy…" clause into a provide step.
function parseProvideClause(segment) {
  const everyType = /every type of energy|all types|counts as every type/.test(segment);
  const combination =
    /any combination/.test(segment) || /and ?\/?or/.test(segment) || /counts as every type/.test(segment);
  let energyTypes;
  if (/energy of all types \(colors\) of basic energy cards/.test(segment)) {
    energyTypes = ['CrystalBasic'];
  } else if (everyType) {
    energyTypes = ['Any'];
  } else {
    energyTypes = symbolTypes(segment);
    if (!energyTypes.length) return null;
  }
  const count = pickCount(segment, 1);
  const step = { type: 'provide', energyTypes, count };
  if (combination) step.combination = true;
  const condition = provisionCondition(segment);
  if (condition) step.condition = condition;
  return step;
}

// Unit / Blend Energy share a name across printings with different types: read the
// "{F}, {D}, and {Y} Energy but provides only 1" clause, falling back when text is absent.
function printedComboTypes(lower, fallback) {
  const clause = String(lower || '').match(/provides ((?:\{[a-z]\}[^.]*?)+)energy but provides only 1/);
  const types = clause ? symbolTypes(clause[1]) : [];
  return types.length > 1 ? types : fallback;
}

// Cards whose provision is conditional and cannot be inferred from a single
// clause alone. Each returns the full ordered list of provide steps.
const CONDITIONAL_PROVISION = [
  [/^team rocket's energy$/, () => [
    { type: 'provide', energyTypes: ['Psychic', 'Dark'], count: 2, combination: true },
  ]],
  [/^prism energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 1, condition: 'hostBasic' },
  ]],
  [/^ignition energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Colorless'], count: 3, condition: 'evolution' },
  ]],
  [/^luminous energy$/, () => [
    { type: 'provide', energyTypes: ['Any'], count: 1 },
    { type: 'provide', energyTypes: ['Colorless'], count: 1, condition: 'otherSpecial' },
  ]],
  [/^neo upper energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 2, condition: 'stage2' },
  ]],
  [/^reversal energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 3, condition: 'trailingPrizesEvolutionNoRuleBox' },
  ]],
  [/^twin energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 2, condition: 'notVOrGx' },
    { type: 'provide', energyTypes: ['Colorless'], count: 1, condition: 'isVOrGx' },
  ]],
  [/^aurora energy$/, () => [
    { type: 'provide', energyTypes: ['Any'], count: 1 },
  ]],
  [/^rainbow energy$/, () => [
    { type: 'provide', energyTypes: ['Any'], count: 1 },
  ]],
  [/^unit energy/, (lower) => [
    { type: 'provide', energyTypes: printedComboTypes(lower, ['Fighting', 'Dark', 'Fairy']), count: 1, combination: true },
  ]],
  [/^beast energy prism star$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 1, condition: 'ultraBeast' },
  ]],
  [/^super boost energy prism star$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 1, condition: 'stage2' },
    { type: 'provide', energyTypes: ['Any'], count: 4, condition: 'threeStage2' },
  ]],
  [/^counter energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 2, condition: 'trailingPrizesNotGxEx' },
  ]],
  [/^strong energy$/, () => [
    { type: 'provide', energyTypes: ['Fighting'], count: 1, condition: 'host:Fighting' },
  ]],
  [/^splash energy$/, () => [
    { type: 'provide', energyTypes: ['Water'], count: 1, condition: 'host:Water' },
  ]],
  [/^burning energy$/, () => [
    { type: 'provide', energyTypes: ['Fire'], count: 1, condition: 'host:Fire' },
  ]],
  [/^flash energy$/, () => [
    { type: 'provide', energyTypes: ['Lightning'], count: 1, condition: 'host:Lightning' },
  ]],
  [/^dangerous energy$/, () => [
    { type: 'provide', energyTypes: ['Dark'], count: 1, condition: 'host:Dark' },
  ]],
  [/^double dragon energy$/, () => [
    { type: 'provide', energyTypes: ['Any'], count: 2, condition: 'host:Dragon' },
  ]],
  [/^double magma energy$/, () => [
    { type: 'provide', energyTypes: ['Fighting'], count: 2, condition: 'teamMagma' },
  ]],
  [/^double aqua energy$/, () => [
    { type: 'provide', energyTypes: ['Water'], count: 2, condition: 'teamAqua' },
  ]],
  [/^wonder energy$/, () => [
    { type: 'provide', energyTypes: ['Fairy'], count: 1, condition: 'host:Fairy' },
  ]],
  [/^shield energy$/, () => [
    { type: 'provide', energyTypes: ['Metal'], count: 1, condition: 'host:Metal' },
  ]],
  [/^mystery energy$/, () => [
    { type: 'provide', energyTypes: ['Psychic'], count: 1, condition: 'host:Psychic' },
  ]],
  [/^herbal energy$/, () => [
    { type: 'provide', energyTypes: ['Grass'], count: 1, condition: 'host:Grass' },
  ]],
  [/^blend energy/, (lower) => [
    { type: 'provide', energyTypes: printedComboTypes(lower, ['Water', 'Lightning', 'Fighting', 'Metal']), count: 1, combination: true },
  ]],
  [/^metal energy$/, () => [{ type: 'provide', energyTypes: ['Metal'], count: 1 }]],
  [/^darkness energy$/, () => [{ type: 'provide', energyTypes: ['Dark'], count: 1 }]],
  [/^rescue energy$/, () => [{ type: 'provide', energyTypes: ['Colorless'], count: 1 }]],
  [/^upper energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Colorless'], count: 2, condition: 'trailingPrizesNotLvX' },
  ]],
  [/^sp energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 1, condition: 'hostSP' },
  ]],
  [/^multi energy$/, () => [
    { type: 'provide', energyTypes: ['Any'], count: 1 },
    { type: 'provide', energyTypes: ['Colorless'], count: 1, condition: 'otherSpecial' },
  ]],
  [/^δ rainbow energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 1, condition: 'delta' },
  ]],
  [/^boost energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 3 },
  ]],
  [/^double rainbow energy$/, () => [
    { type: 'provide', energyTypes: ['Any'], count: 2 },
  ]],
  [/^scramble energy$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 3, condition: 'trailingPrizes' },
  ]],
  [/^holon energy wp$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
  ]],
  [/^holon energy gl$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
  ]],
  [/^holon energy ff$/, () => [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
  ]],
  [/^heal energy$/, () => [{ type: 'provide', energyTypes: ['Colorless'], count: 1 }]],
  [/^dark metal energy$/, () => [
    { type: 'provide', energyTypes: ['Dark', 'Metal'], count: 1, combination: true },
  ]],
  [/^react energy$/, () => [{ type: 'provide', energyTypes: ['Colorless'], count: 1 }]],
  [/^r energy$/, () => [{ type: 'provide', energyTypes: ['Dark'], count: 2 }]],
  [/^magma energy$/, () => [
    { type: 'provide', energyTypes: ['Fighting', 'Dark'], count: 2, combination: true },
  ]],
  [/^aqua energy$/, () => [
    { type: 'provide', energyTypes: ['Water', 'Dark'], count: 2, combination: true },
  ]],
  [/^retro energy$/, () => [{ type: 'provide', energyTypes: ['Colorless'], count: 1 }]],
  [/^bounce energy$/, () => [{ type: 'provide', energyTypes: ['Colorless'], count: 2 }]],
  [/^crystal energy$/, () => [
    { type: 'provide', energyTypes: ['CrystalBasic'], count: 1 },
    { type: 'provide', energyTypes: ['Colorless'], count: 1, condition: 'noBasicEnergy' },
  ]],
  [/^miracle energy$/, () => [{ type: 'provide', energyTypes: ['Any'], count: 2 }]],
];

function parseProvision(name, lower) {
  for (const [re, build] of CONDITIONAL_PROVISION) {
    if (re.test(name)) return build(lower);
  }
  const steps = [];
  for (const sentence of lower.split(/(?<=\.)\s+/)) {
    if (!/provide/.test(sentence)) continue;
    const seg = sentence.match(/provides? ([^.]*?energy[^.]*)/);
    if (!seg) continue;
    const condition = provisionCondition(seg[1]);
    const step = parseProvideClause(seg[1]);
    if (step) steps.push(step);
    if (condition) steps[steps.length - 1].condition = condition;
  }
  return steps;
}

// Attach restrictions and prerequisites.
function parseAttachRestriction(lower) {
  const steps = [];
  const restrict = (kind, extra = {}) =>
    steps.push({ type: 'attachRestriction', kind, discardIfNot: true, ...extra });

  if (/only be attached to (a )?team rocket's pokémon/.test(lower)) restrict('teamRocket');
  else if (/only be attached to (a )?fusion strike pokémon/.test(lower)) restrict('fusionStrike');
  else if (/only be attached to (a )?single strike pokémon/.test(lower)) restrict('singleStrike');
  else if (/only be attached to (a )?rapid strike pokémon/.test(lower)) restrict('rapidStrike');
  else if (/only be attached to (a )?team magma pokémon/.test(lower)) restrict('teamMagma');
  else if (/only be attached to (a )?team aqua pokémon/.test(lower)) restrict('teamAqua');
  else if (/can be attached only to a pokémon with team magma in its name/.test(lower)) restrict('teamMagma');
  else if (/can be attached only to a pokémon with team aqua in its name/.test(lower)) restrict('teamAqua');
  else if (/can be attached only to a pokémon that has dark or rocket's in its name/.test(lower)) {
    restrict('darkOrRocket');
  } else if (/can be attached to 1 of your shining or light pokémon/.test(lower)) {
    restrict('shiningOrLight');
  } else if (/attach miracle energy to 1 of your shining or light pokémon/.test(lower)) {
    // Neo Destiny Miracle Energy limits where it is attached, with no discard rule (SE14).
    restrict('shiningOrLight', { discardIfNot: false });
  } else if (/can be attached only to an evolved pokémon \(excluding pokémon-ex\)/.test(lower)) {
    restrict('evolvedExcludingEx');
  } else if (/can be attached only to an evolved pokémon|can be attached only to evolution pokémon/.test(lower)) {
    restrict('evolution');
  } else if (/only be attached to evolution pokémon/.test(lower)) {
    restrict('evolution');
  } else {
    const typed = lower.match(/can only be attached to \{([a-z])\} pokémon/);
    if (typed) {
      const hostType = SYMBOL_TYPES[typed[1]];
      if (hostType) steps.push({ type: 'attachRestriction', kind: 'type', hostType, discardIfNot: true });
    }
  }

  const bearer = /attach this card to your pokémon that has basic energy cards attached to it/.test(lower);
  if (bearer) steps.push({ type: 'attachRestriction', kind: 'basicEnergyBearer', discardIfNot: false });

  if (/discard another card from your hand/.test(lower)) {
    steps.push({ type: 'attachCost', discardFromHand: 1 });
  }
  if (/have more than 1 .*energy in your deck/.test(lower)) {
    steps.push({ type: 'deckLimit', max: 1 });
  }
  return steps;
}

// Generic effect-clause matchers. Order matters only for readability; steps are
// additive, so a card can match several.
function parseEffects(lower) {
  const steps = [];
  const push = (step) => steps.push(step);

  // ── lifecycle / discard ────────────────────────────────────────────────
  if (/discard (?:it|this card|boost energy|mirror|r energy|magma energy|aqua energy|miracle energy)\b[^.]*at the end of (?:your|the) turn|discard .* at the end of the turn it was attached|at the end of your turn, discard|when your turn ends, discard/.test(lower)) {
    push({ type: 'discardAtEndOfTurn' });
  }
  if (/at the end of every turn, put (\d+) damage counter on the pokémon darkness energy is attached to/.test(lower)) {
    const m = lower.match(/put (\d+) damage counter/);
    push({ type: 'endOfTurnDamageCounter', count: Number(m[1]), unless: 'host:Dark' });
  }
  if (/isn't an evolved pokémon, discard|no longer an evolved pokémon, discard|isn't an evolved pokémon \(or evolves into pokémon-ex\), discard|attached to anything other than an evolution pokémon, discard/.test(lower)) {
    push({ type: 'discardWhenConditionLost', condition: 'evolution' });
  }
  if (/if this card is discarded from play, put it into your hand instead of the discard pile/.test(lower)) {
    push({ type: 'onDiscardReturnToHand' });
  }
  const discardToHand = lower.match(/if this card is discarded by an effect of an attack used by the \{?([a-z])\}? ?pokémon this card is attached to, put this card into your hand/);
  if (discardToHand) {
    push({ type: 'onDiscardReturnToHand', condition: 'attackEffect', hostType: SYMBOL_TYPES[discardToHand[1]] });
  }
  if (/if this card is discarded by an effect of an attack used by the pokémon this card is attached to, attach this card from your discard pile/.test(lower)) {
    push({ type: 'onDiscardReattach', condition: 'attackEffect' });
  }
  const discardReattach = lower.match(/if this card is discarded by an attack of the \{([a-z])\} pokémon this card is attached to, attach this card from your discard pile/);
  if (discardReattach) {
    push({ type: 'onDiscardReattach', condition: 'attack', hostType: SYMBOL_TYPES[discardReattach[1]] });
  }
  if (/if (?:the|that) (?:[a-z{}]* )?pokémon this card is attached to is knocked out by damage from (?:an opponent's|an) attack, put (?:that|this) pokémon (?:back )?into your hand/.test(lower)
    || /is knocked out by damage from an opponent's attack, put that pokémon into your hand/.test(lower)) {
    const host = lower.match(/the \{([a-z])\} pokémon this card is attached to is knocked out/);
    // Rescue reads "by damage from an attack" (any attack, own recoil included);
    // Splash reads "from an opponent's attack".
    const anyAttack = /knocked out by damage from an attack, put/.test(lower);
    push({
      type: 'onKnockoutReturnToHand',
      hostType: host ? SYMBOL_TYPES[host[1]] : undefined,
      source: anyAttack ? 'attack' : 'opponentAttack',
    });
  }
  if (/is knocked out by damage from an attack from your opponent's pokémon, draw cards until you have (\d+) cards in your hand/.test(lower)) {
    const m = lower.match(/until you have (\d+) cards in your hand/);
    push({ type: 'onKnockoutDraw', until: Number(m[1]) });
  }
  if (/is knocked out by damage from an attack from your opponent's pokémon, that player takes (\d+) fewer prize card/.test(lower)) {
    const m = lower.match(/takes (\d+) fewer prize card/);
    push({ type: 'prizeReduction', count: Number(m[1]) });
  }
  if (/has no effect other than providing energy/.test(lower)) {
    push({ type: 'noExtraEffect' });
  }
  if (/can't be used at official tournaments/.test(lower)) {
    push({ type: 'officialIllegal' });
  }

  // ── reactive damage effects ────────────────────────────────────────────
  if (/is in the active spot and is damaged by (?:an|a) (?:attack|opponent's attack|attack from your opponent's pokémon)/.test(lower)
    && /put (\d+) damage counters on the attacking pokémon/.test(lower)) {
    const m = lower.match(/put (\d+) damage counters on the attacking pokémon/);
    const hostTypeMatch = lower.match(/the \{([a-z])\} pokémon this card is attached to is in the active spot/);
    push({
      type: 'onDamagedDamageCounters',
      count: Number(m[1]),
      activeOnly: true,
      hostType: hostTypeMatch ? SYMBOL_TYPES[hostTypeMatch[1]] : undefined,
      against: /opponent's pokémon-ex/.test(lower) ? 'pokemonEx' : undefined,
    });
  } else if (/whenever the \{([a-z])\} pokémon this card is attached to is your active pokémon and is damaged by an attack from your opponent's pokémon-ex/.test(lower)
    && /put (\d+) damage counters on the attacking pokémon-ex/.test(lower)) {
    const m = lower.match(/put (\d+) damage counters on the attacking pokémon-ex/);
    const host = lower.match(/whenever the \{([a-z])\} pokémon/);
    push({ type: 'onDamagedDamageCounters', count: Number(m[1]), activeOnly: true, hostType: SYMBOL_TYPES[host[1]], against: 'pokemonEx' });
  }
  if (/is in the active spot and is damaged by an attack from your opponent's pokémon[^.]*draw a card/.test(lower)) {
    push({ type: 'onDamagedDraw', count: 1 });
  }
  if (/whenever you play a pokémon from your hand to evolve the pokémon v this card is attached to, heal (\d+) damage/.test(lower)) {
    const m = lower.match(/heal (\d+) damage/);
    push({ type: 'onEvolveHeal', amount: Number(m[1]), hostType: 'Pokémon V' });
  }

  // ── on-attach triggers ─────────────────────────────────────────────────
  const drawAttach = lower.match(/when you attach this card from your hand to (?:a \{([a-z])\} pokémon|a pokémon), draw (a card|\d+ cards?)/);
  if (drawAttach) {
    const count = drawAttach[2] === 'a card' ? 1 : Number(drawAttach[2].match(/\d+/)[0]);
    push({ type: 'onAttachDraw', count, hostType: drawAttach[1] ? SYMBOL_TYPES[drawAttach[1]] : undefined });
  }
  const searchAttach = lower.match(/when you attach this card from your hand to a? ?\{?([a-z])?\}? ?pokémon, search your deck for up to (\d+) basic (?:pokémon|\{([a-z])\} pokémon) and put them onto your bench/);
  if (searchAttach) {
    const hostType = searchAttach[1] ? SYMBOL_TYPES[searchAttach[1]] : (searchAttach[3] ? SYMBOL_TYPES[searchAttach[3]] : undefined);
    const what = searchAttach[3] ? `Basic ${SYMBOL_TYPES[searchAttach[3]]} Pokémon` : 'Basic Pokémon';
    push({ type: 'onAttachSearch', what, count: Number(searchAttach[2]), destination: 'bench', hostType });
  }
  const searchAttachSingle = lower.match(/when you attach this card from your hand to a pokémon, search your deck for a basic pokémon and put it onto your bench/);
  if (searchAttachSingle) {
    push({ type: 'onAttachSearch', what: 'Basic Pokémon', count: 1, destination: 'bench' });
  }
  const healAttach = lower.match(/when you attach this card from your hand to 1 of your(?: \{([a-z])\})? pokémon, heal (\d+) damage from that pokémon/);
  if (healAttach) {
    push({ type: 'onAttachHeal', amount: Number(healAttach[2]), hostType: healAttach[1] ? SYMBOL_TYPES[healAttach[1]] : undefined });
  }
  const removeAttach = lower.match(/when you attach this card from your hand to 1 of your pokémon, remove (up to )?(\d+) damage counters?(?! and all special conditions)/);
  if (removeAttach) {
    push({ type: 'onAttachRemoveDamage', count: Number(removeAttach[2]) });
  }
  if (/when you attach this card from your hand to 1 of your pokémon, remove 1 damage counter and all special conditions/.test(lower)) {
    push({ type: 'onAttachRemoveDamage', count: 1, alsoCure: true });
  }
  if (/when you attach this card from your hand to 1 of your pokémon, remove all special conditions/.test(lower)) {
    push({ type: 'onAttachClearStatus', conditions: ALL_STATUS });
  }
  if (/when you attach this card from your hand to 1 of your pokémon, put 1 damage counter on that pokémon/.test(lower)) {
    push({ type: 'onAttachDamageCounter', count: 1 });
  }
  if (/when you attach this card from your hand to 1 of your benched pokémon, switch that pokémon with your active pokémon/.test(lower)) {
    push({ type: 'onAttachSwitch', side: 'self', target: 'benchedToActive', hostZone: 'bench' });
  }
  if (/when you attach this card from your hand to your active pokémon, switch that pokémon with 1 of your benched pokémon/.test(lower)) {
    push({ type: 'onAttachSwitch', side: 'self', target: 'activeToBench', hostZone: 'active' });
  }
  if (/when you attach this card from your hand to your active pokémon, switch 1 of the defending pokémon with 1 of your opponent's benched pokémon/.test(lower)) {
    // Stormfront Cyclone: "Your opponent chooses the Benched Pokémon to switch."
    const opponentChooses = /your opponent chooses the benched pokémon/.test(lower);
    push({ type: 'onAttachSwitch', side: 'opponent', hostZone: 'active', ...(opponentChooses ? { chooser: 'opponent' } : {}) });
  }
  if (/attach it to your active pokémon, your opponent switches (?:his or her|their) active pokémon with 1 of (?:his or her|their) benched pokémon/.test(lower)) {
    push({ type: 'onAttachSwitch', side: 'opponent', hostZone: 'active', chooser: 'opponent' });
  }
  if (/attach warp energy from your hand to your active pokémon, switch your active pokémon with 1 of your benched pokémon/.test(lower)) {
    push({ type: 'onAttachSwitch', side: 'self', target: 'activeToBench', hostZone: 'active' });
  }
  if (/when you play this card from your hand and attach it to 1 of your pokémon, return a basic energy card attached to that pokémon to your hand/.test(lower)) {
    push({ type: 'onAttachReturnBasicEnergy' });
  }
  if (/when you play this card from your hand and attach it to 1 of your evolved pokémon, you may remove up to 2 damage counters from that pokémon and discard the top card from it/.test(lower)) {
    push({ type: 'onAttachDevolve', count: 2 });
  }
  if (/if you play this card from your hand, remove 1 damage counter from the pokémon you attach it to/.test(lower)) {
    push({ type: 'onAttachRemoveDamage', count: 1 });
  }
  if (/if you play this card from your hand, the pokémon you attach it to is no longer affected by a special condition/.test(lower)) {
    push({ type: 'onAttachClearStatus', conditions: ['Special Condition'] });
  }
  if (/if you play this card from your hand, the pokémon you attach it to is no longer asleep, confused, paralyzed, or poisoned/.test(lower)) {
    push({ type: 'onAttachClearStatus', conditions: ['Asleep', 'Confused', 'Paralyzed', 'Poisoned'] });
  }
  // Team Rocket Rainbow Energy: "it does 10 damage to that Pokémon (Don't apply W/R)".
  if (/when you attach this card from your hand to 1 of your pokémon, it does 10 damage to that pokémon/.test(lower)) {
    push({ type: 'onAttachDamageCounter', count: 1 });
  }
  if (/if this card is put into your discard pile from play, return it to your hand/.test(lower)) {
    push({ type: 'onDiscardReturnToHand' });
  }
  const callSearch = lower.match(/once during your turn, if the pokémon call energy is attached to is your active pokémon, you may search your deck for up to (\d+) basic pokémon and put them onto your bench/);
  if (callSearch) {
    // An activated once-per-turn action that ends the turn, not an attach trigger. No command
    // runs it yet (I169), so it fails closed instead of granting a free search on attach.
    push({ type: 'activatedSearch', what: 'Basic Pokémon', count: Number(callSearch[1]), destination: 'bench', oncePerTurn: true, endsTurn: true, requiresActive: true });
  }
  if (/if you took this card as a face-down prize card during your turn, before you put it into your hand, you may attach this card to 1 of your pokémon/.test(lower)) {
    push({ type: 'attachFromPrize' });
  }

  // ── continuous combat modifiers ────────────────────────────────────────
  // HP bonus.
  const hp = lower.match(/the \{([a-z])\} pokémon this card is attached to gets \+(\d+) hp/);
  if (hp) {
    push({ type: 'hpBonus', amount: Number(hp[2]), hostType: SYMBOL_TYPES[hp[1]] });
  }
  // Damage bonus to the attached Pokémon's attacks.
  let bonus = lower.match(/attacks used by the \{([a-z])\} pokémon this card is attached to do (\d+) more damage/);
  if (!bonus) bonus = lower.match(/the attacks of the \{([a-z])\} pokémon this card is attached to do (\d+) more damage/);
  if (!bonus) bonus = lower.match(/the attacks of the pokémon this card is attached to do (\d+) more damage[^.]*opponent's active/);
  if (!bonus) bonus = lower.match(/the attacks of the (ultra beast) this card is attached to do (\d+) more damage/);
  if (bonus) {
    let hostType;
    if (bonus[1] && /ultra beast/.test(bonus[1])) hostType = 'Ultra Beast';
    else if (bonus[1] && SYMBOL_TYPES[bonus[1]]) hostType = SYMBOL_TYPES[bonus[1]];
    const m2 = lower.match(/do (\d+) more damage/);
    push({ type: 'damageBonus', amount: Number(m2[1]), hostType, target: 'opponentActive' });
  }
  // Unseen Forces prints "is attached to attack," (SE14).
  if (/if the pokémon darkness energy is attached to attacks?, the attack does (\d+) more damage/.test(lower)) {
    const m = lower.match(/the attack does (\d+) more damage/);
    push({ type: 'damageBonus', amount: Number(m[1]), hostType: 'Dark', target: 'active', condition: 'host:Dark' });
  }
  if (/if the pokémon darkness energy is attached to (?:damages the defending pokémon|does damage with an attack)/.test(lower)) {
    const m = lower.match(/the attack does (\d+) more damage/);
    // Aquapolis / Expedition print this bonus for any host, after W/R and only when the
    // attack does damage; only the end-of-turn damage counter spares {D} Pokémon (SE14).
    if (m) push({ type: 'damageBonus', amount: Number(m[1]), target: 'active', afterWR: true });
  }
  if (/if the pokémon r energy is attached to attacks, the attack does (\d+) more damage/.test(lower)) {
    const m = lower.match(/the attack does (\d+) more damage/);
    push({ type: 'damageBonus', amount: Number(m[1]), target: 'active' });
  }
  // Penalty to the attached Pokémon's own attacks.
  if (/the attacks of the pokémon this card is attached to do (\d+) less damage/.test(lower)) {
    const m = lower.match(/do (\d+) less damage/);
    push({ type: 'attackDamagePenalty', amount: Number(m[1]), target: 'opponentPokemon' });
  }
  if (/damage done to your opponent's pokémon by the pokémon double rainbow energy is attached to is reduced by (\d+)/.test(lower)) {
    const m = lower.match(/is reduced by (\d+)/);
    push({
      type: 'attackDamagePenalty',
      amount: Number(m[1]),
      target: 'opponentPokemon',
      afterWR: /reduced by \d+ \(after applying weakness and resistance\)/.test(lower),
    });
  }
  // Damage reduction on the attached Pokémon.
  let red = lower.match(/the \{([a-z])\} pokémon this card is attached to takes (\d+) less damage from attacks from your opponent's pokémon/);
  if (red) {
    push({ type: 'damageReduction', amount: Number(red[2]), hostType: SYMBOL_TYPES[red[1]], source: 'opponentPokemon', afterWR: true });
  }
  if (/the pokémon this card is attached to takes (\d+) less damage from attacks from your opponent's pokémon v/.test(lower)) {
    const m = lower.match(/takes (\d+) less damage/);
    push({ type: 'damageReduction', amount: Number(m[1]), source: 'opponentPokemonV', afterWR: true });
  }
  if (/the attacks of your opponent's pokémon do (\d+) less damage to the \{([a-z])\} pokémon this card is attached to/.test(lower)) {
    const m = lower.match(/do (\d+) less damage to the \{([a-z])\} pokémon/);
    push({ type: 'damageReduction', amount: Number(m[1]), hostType: SYMBOL_TYPES[m[2]], source: 'opponentPokemon', afterWR: false });
  }
  // Metal Energy: Call of Legends gates the reduction on a {M} host ("Ignore this effect
  // if … isn't {M}"); Aquapolis / Expedition print it for any host (SE14).
  const metalIncoming = lower.match(/damage done (?:by attacks )?to the pokémon (?:that )?metal energy is attached to is reduced by (\d+) \(after applying weakness and resistance\)/);
  if (metalIncoming) {
    const gated = /ignore this effect if the pokémon that metal energy is attached to isn't \{m\}/.test(lower);
    push({
      type: 'damageReduction',
      amount: Number(metalIncoming[1]),
      source: 'opponentPokemon',
      afterWR: true,
      ...(gated && { condition: 'host:Metal' }),
    });
  }
  // "…isn't {M}, whenever it damages a Pokémon, reduce that damage by 10" is the host's
  // own outgoing damage, not incoming (SE14).
  const metalOutgoing = lower.match(/if the pokémon metal energy is attached to isn't \{m\}, whenever it damages a pokémon[^.]*reduce that damage by (\d+) \((before|after) applying/);
  if (metalOutgoing) {
    push({
      type: 'attackDamagePenalty',
      amount: Number(metalOutgoing[1]),
      target: 'opponentPokemon',
      afterWR: metalOutgoing[2] === 'after',
      condition: 'not:Metal',
    });
  }
  // Holon Energy GL: the Pokémon-ex reduction needs a basic {L} Energy (DF 85 and DS 105 word it differently).
  const holonGlEx = lower.match(/also has a basic \{([a-z])\} energy card attached to it, damage done (?:to that pokémon by attacks from|by) your opponent's pokémon-ex is reduced by (\d+)/);
  if (holonGlEx) {
    push({
      type: 'damageReduction',
      amount: Number(holonGlEx[2]),
      source: 'opponentPokemonEx',
      condition: `hostHasBasic:${SYMBOL_TYPES[holonGlEx[1]]}`,
    });
  }
  if (/ignore (?:this|these) effects? if (?:the pokémon )?(?:that )?(?:darkness|metal|holon energy|heal energy)[^.]*isn't \{([a-z])\}/.test(lower)) {
    const m = lower.match(/isn't \{([a-z])\}/);
    push({ type: 'ignoredOn', condition: `not:${SYMBOL_TYPES[m[1]]}` });
  }

  // ── type / retreat / status modifiers ──────────────────────────────────
  if (/the \{([a-z])\} pokémon this card is attached to (?:has no weakness|gets no weakness)/.test(lower)) {
    const m = lower.match(/the \{([a-z])\} pokémon/);
    push({ type: 'noWeakness', hostType: SYMBOL_TYPES[m[1]] });
  } else if (/the (?:pokémon this card is attached to|pokémon weakness guard energy is attached to) has no weakness/.test(lower)) {
    push({ type: 'noWeakness' });
  }
  if (/if the pokémon that holon energy ff is attached to also has a basic \{([a-z])\} energy card attached to it, that pokémon has no weakness/.test(lower)) {
    push({ type: 'noWeakness', condition: 'hostHasBasic:Fire' });
  }
  if (/damage done by that pokémon's attack isn't affected by resistance/.test(lower)) {
    push({ type: 'ignoresResistance', condition: 'hostHasBasic:Fighting' });
  }
  if (/the \{([a-z])\} pokémon this card is attached to has no retreat cost/.test(lower)) {
    const m = lower.match(/the \{([a-z])\} pokémon/);
    push({ type: 'freeRetreat', hostType: SYMBOL_TYPES[m[1]] });
  }
  if (/retreat cost of the pokémon this card is attached to is \{c\}\{c\} less/.test(lower)) {
    push({ type: 'retreatReduction', amount: 2 });
  }
  if (/the pokémon boost energy is attached to can't retreat/.test(lower)) {
    push({ type: 'cannotRetreat' });
  }
  const typedImmunity = lower.match(/the \{([a-z])\} pokémon this card is attached to recovers from all special conditions and can't be affected by any special conditions/);
  if (typedImmunity) {
    push({ type: 'statusImmunity', conditions: ALL_STATUS, hostType: SYMBOL_TYPES[typedImmunity[1]] });
  } else if (/the pokémon this card is attached to recovers from being asleep, confused, or paralyzed and can't be affected by those special conditions/.test(lower)) {
    push({ type: 'statusImmunity', conditions: ['Asleep', 'Confused', 'Paralyzed'] });
  }
  if (/if the pokémon that holon energy gl is attached to also has a basic \{([a-z])\} energy card attached to it, that pokémon can't be affected by any special conditions/.test(lower)) {
    push({ type: 'statusImmunity', conditions: ALL_STATUS, condition: 'hostHasBasic:Grass' });
  }
  if (/the pokémon this card is attached to can't be paralyzed/.test(lower)) {
    push({ type: 'statusImmunity', conditions: ['Paralyzed'] });
  }
  if (/the pokémon this card is attached to can't be poisoned/.test(lower)) {
    push({ type: 'statusImmunity', conditions: ['Poisoned'] });
  }

  // ── effect shields ─────────────────────────────────────────────────────
  if (/prevent all effects of attacks[^.]*done to the \{([a-z])\} pokémon this card is attached to/.test(lower)) {
    const m = lower.match(/done to the \{([a-z])\} pokémon/);
    push({ type: 'effectShield', hostType: SYMBOL_TYPES[m[1]], source: 'opponentPokemon', excludeDamage: true });
  } else if (/prevent all effects of attacks used by your opponent's pokémon done to the pokémon this card is attached to/.test(lower)) {
    push({ type: 'effectShield', source: 'opponentPokemon', excludeDamage: true });
  }
  if (/prevent all effects of your opponent's attacks, except damage, done to the \{([a-z])\} pokémon that this card is attached to/.test(lower)) {
    const m = lower.match(/done to the \{([a-z])\} pokémon/);
    push({ type: 'effectShield', hostType: SYMBOL_TYPES[m[1]], source: 'opponentPokemon', excludeDamage: true });
  }
  // Dragon Frontiers: "all effects of attacks, excluding damage"; Delta Species: "all effects, excluding damage".
  if (/if the pokémon that holon energy wp is attached to also has a basic \{([a-z])\} energy card attached to it, prevent all effects(?: of attacks)?, excluding damage/.test(lower)) {
    push({ type: 'effectShield', source: 'opponentPokemon', excludeDamage: true, condition: 'hostHasBasic:Water' });
  }
  if (/prevent all effects of your opponent's pokémon's abilities done to the pokémon this card is attached to/.test(lower)) {
    push({ type: 'abilityShield', source: 'opponentPokemon' });
  }
  if (/as long as the \{([a-z])\} pokémon this card is attached to is on your bench, prevent all damage done to it by attacks from your opponent's pokémon/.test(lower)) {
    const m = lower.match(/as long as the \{([a-z])\} pokémon/);
    push({ type: 'benchDamageShield', hostType: SYMBOL_TYPES[m[1]] });
  }
  if (/if the pokémon that holon energy wp is attached to also has a basic \{([a-z])\} energy card attached to it, that pokémon's retreat cost is 0/.test(lower)) {
    push({ type: 'freeRetreat', condition: 'hostHasBasic:Psychic' });
  }

  // ── misc ───────────────────────────────────────────────────────────────
  if (/the pokémon this card is attached to can use any attack from its previous evolutions/.test(lower)) {
    push({ type: 'canUseEvolutionAttacks' });
  }
  if (/if heal energy is attached to pokémon-ex, heal energy has no effect other than providing energy/.test(lower)) {
    push({ type: 'ignoredOn', host: 'pokemonEx', unless: 'basicEnergy' });
  }
  if (/ignore these effects if (?:holon energy ff|holon energy gl|holon energy wp) is attached to pokémon-ex/.test(lower)) {
    push({ type: 'ignoredOn', host: 'pokemonEx' });
  }
  if (/can't be applied more than once at a time to the same pokémon/.test(lower)) {
    push({ type: 'onceAtATime' });
  }
  if (/this effect of your legacy energy can't be applied more than once per game/.test(lower)) {
    push({ type: 'oncePerGame' });
  }

  return steps;
}

const STEP_DESCRIPTIONS = {
  provide: (s) => {
    let label;
    if (s.energyTypes.includes('Any')) label = 'Energy of every type';
    else if (s.energyTypes.includes('CrystalBasic')) label = 'Energy of all types of basic Energy attached';
    else label = `${s.energyTypes.join(' / ')} Energy`;
    const combo = s.combination ? ' (any combination)' : '';
    const cond = s.condition ? ` [${s.condition}]` : '';
    return `provides ${s.count} ${label}${combo}${cond}`;
  },
  attachRestriction: (s) =>
    s.kind === 'type'
      ? `can only be attached to a ${s.hostType} Pokémon`
      : `attach restricted to ${s.kind} Pokémon`,
  attachCost: (s) => `attach cost: discard ${s.discardFromHand} card from hand`,
  deckLimit: (s) => `at most ${s.max} per deck`,
  discardAtEndOfTurn: () => 'discard at the end of the turn',
  endOfTurnDamageCounter: (s) => `at end of every turn, put ${s.count} damage counter on host${s.unless ? ` (unless ${s.unless})` : ''}`,
  discardWhenConditionLost: (s) => `discard if no longer ${s.condition}`,
  onDiscardReturnToHand: (s) => `if discarded by ${s.condition || 'an effect'}, return to hand`,
  onDiscardReattach: (s) => `if discarded by ${s.condition || 'an effect'}, reattach from discard`,
  onKnockoutReturnToHand: (s) => `if host is KO'd, return it to hand${s.hostType ? ` (${s.hostType})` : ''}`,
  onKnockoutDraw: (s) => `if host is KO'd, draw until ${s.until} cards in hand`,
  prizeReduction: (s) => `KO by opponent: they take ${s.count} fewer Prize`,
  onDamagedDamageCounters: (s) =>
    `if host is damaged, put ${s.count} damage counters on the attacker${s.against ? ` (${s.against})` : ''}`,
  onDamagedDraw: (s) => `if host is damaged, draw ${s.count} card`,
  onEvolveHeal: (s) => `on evolving the host, heal ${s.amount} damage`,
  onAttachDraw: (s) => `on attach from hand: draw ${s.count}${s.hostType ? ` (${s.hostType})` : ''}`,
  activatedSearch: (s) =>
    `once per turn while Active: search ${s.count} ${s.what} → ${s.destination}, then the turn ends`,
  onAttachSearch: (s) =>
    `on attach from hand: search ${s.count} ${s.what} → ${s.destination}${s.oncePerTurn ? ' (once/turn)' : ''}${s.endsTurn ? ' (ends turn)' : ''}`,
  onAttachHeal: (s) => `on attach from hand: heal ${s.amount} damage${s.hostType ? ` (${s.hostType})` : ''}`,
  onAttachRemoveDamage: (s) => `on attach from hand: remove ${s.count} damage counter${s.alsoCure ? ' + cure status' : ''}`,
  onAttachDamageCounter: (s) => `on attach from hand: put ${s.count} damage counter`,
  onAttachSwitch: (s) => `on attach from hand: switch (${s.side}${s.target ? `/${s.target}` : ''})`,
  onAttachReturnBasicEnergy: () => 'on attach from hand: return a basic Energy to hand',
  onAttachDevolve: (s) => `on attach from hand: remove ${s.count} damage counters + devolve`,
  onAttachClearStatus: () => 'on attach from hand: clear Special Conditions',
  hpBonus: (s) => `host gets +${s.amount} HP`,
  damageBonus: (s) => `host attacks do +${s.amount} damage${s.hostType ? ` (${s.hostType})` : ''}`,
  attackDamagePenalty: (s) => `host attacks do -${s.amount} damage`,
  damageReduction: (s) =>
    `host takes -${s.amount} damage${s.source === 'opponentPokemonV' ? ' from Pokémon V' : s.source === 'opponentPokemonEx' ? ' from Pokémon-EX' : ''}${s.afterWR ? ' (after W/R)' : ''}`,
  noWeakness: (s) => `host has no Weakness${s.hostType ? ` (${s.hostType})` : ''}`,
  ignoresResistance: () => "host attack ignores Resistance",
  freeRetreat: (s) => `host has no Retreat Cost${s.hostType ? ` (${s.hostType})` : ''}`,
  retreatReduction: (s) => `host Retreat Cost -${s.amount}`,
  cannotRetreat: () => 'host cannot retreat',
  statusImmunity: (s) => `host immune to ${s.conditions.join(', ')}`,
  effectShield: (s) => `prevents attack effects on host${s.hostType ? ` (${s.hostType})` : ''}`,
  abilityShield: () => 'prevents opponent Abilities on host',
  benchDamageShield: (s) => `prevents all attack damage on host while benched${s.hostType ? ` (${s.hostType})` : ''}`,
  canUseEvolutionAttacks: () => 'host may use attacks from its previous Evolutions',
  attachFromPrize: () => 'may attach from a face-down Prize',
  ignoredOn: (s) =>
    s.host
      ? `ignored on ${s.host}${s.unless ? ` unless it has a basic Energy` : ''}`
      : `ignored unless host is ${String(s.condition).replace('not:', '')}`,
  onceAtATime: () => 'effect applies at most once at a time',
  oncePerGame: () => 'effect applies at most once per game',
  noExtraEffect: () => 'no effect other than providing Energy',
  officialIllegal: () => 'not legal at official tournaments',
};

export function describeSpecialEnergyStep(step) {
  const fn = STEP_DESCRIPTIONS[step?.type];
  return fn ? fn(step) : `unknown step ${step?.type}`;
}

const cardSubtypes = (card) => {
  const list = Array.isArray(card?.subtypes) ? card.subtypes.slice() : [];
  if (card?.subtype) list.push(card.subtype);
  return list.map((s) => String(s).toLowerCase());
};

export function isSpecialEnergyCard(card) {
  if (!card) return false;
  const subtypes = cardSubtypes(card);
  if (subtypes.some((s) => s.includes('special'))) return true;
  if (isEnergyCard({ ...card, subtypes })) {
    // Basic energy has no special-effect text; treat anything with effect text
    // that is not plainly a basic named energy as special.
    const name = String(card.name ?? '').toLowerCase();
    const isBasicNamed = /^(?:basic\s+)?(colorless|grass|fire|water|lightning|psychic|fighting|metal|darkness|dark|dragon|fairy) energy$/.test(name);
    return !isBasicNamed;
  }
  return false;
}

/**
 * Parse a special-energy card's printed text into structured effect steps.
 *
 * @returns {{
 *   name: string,
 *   family: string|null,
 *   steps: object[],
 *   provides: object[],
 *   unrecognized: boolean,
 * } | null}
 */
export function parseSpecialEnergyEffects(card) {
  if (!card || !card.name) return null;
  const name = String(card.name);
  const lowerName = normalizeText(name);
  const text = card.text ?? card.effect ?? '';
  const lower = normalizeText(text);
  const canonical = { ...card, subtypes: cardSubtypes(card) };

  const steps = [];
  if (isSpecialEnergyCard(canonical) || /energy/i.test(lowerName)) {
    steps.push(...parseAttachRestriction(lower));
    steps.push(...parseProvision(lowerName, lower));
    steps.push(...parseEffects(lower));
  }

  const provides = steps.filter((s) => s.type === 'provide');
  const hasRecognized = steps.length > 0;
  return {
    name,
    family: null,
    steps,
    provides,
    unrecognized: !hasRecognized,
  };
}

/** "You can't have more than 1 Miracle Energy in your deck": the copy cap, or null. */
export function specialEnergyDeckLimit(card) {
  const step = parseSpecialEnergyEffects(card)?.steps.find((s) => s.type === 'deckLimit');
  return step ? step.max : null;
}

/** Cards from hand an attach from hand costs (Aurora Energy: 1), else 0. */
export function specialEnergyAttachDiscardCost(card) {
  const step = parseSpecialEnergyEffects(card)?.steps.find((s) => s.type === 'attachCost');
  return step?.discardFromHand || 0;
}

/** True when a special energy's effect is limited to once per game (Legacy). */
export function hasOncePerGameSpecialEnergyEffect(card) {
  const parsed = parseSpecialEnergyEffects(card);
  return !!parsed?.steps.some((s) => s.type === 'oncePerGame');
}

export function describeSpecialEnergyEffects(card) {
  const parsed = parseSpecialEnergyEffects(card);
  if (!parsed) return null;
  if (!parsed.steps.length) return `${parsed.name}: no special effect recognized.`;
  const lines = parsed.steps.map(describeSpecialEnergyStep);
  return `${parsed.name}: ${lines.join('; ')}.`;
}

// ── trigger planner ───────────────────────────────────────────────────────
// Maps the parsed steps of an attached special energy to the concrete actions a
// trigger should run. Pure and DOM-free so the client adapters (rules-bridge,
// move-card) stay thin and the planning is headless-tested.
//
//   trigger 'attach'   — energy moved from hand onto a Pokémon
//   trigger 'discard'  — energy moved out of play to the discard pile
//   trigger 'knockout' — the host Pokémon was KO'd
//   trigger 'evolve'   — the host evolved
//   trigger 'damaged'  — the host was damaged by an opponent's attack
//   trigger 'endTurn'  — end-of-turn checkup
//
// Action shapes:
//   { action: 'draw', count } | { action: 'drawUntil', until }
//   { action: 'search', what, count, destination, oncePerTurn?, endsTurn?, requiresActive? }
//   { action: 'heal', amount }
//   { action: 'removeDamage', count, alsoCure }
//   { action: 'addDamage', count, target: 'host'|'attacker', against? }
//   { action: 'clearStatus' }
//   { action: 'switch', side: 'self'|'opponent', target? }
//   { action: 'returnBasicEnergy' }
//   { action: 'devolve', count }
//   { action: 'returnToHand' }   (discard or knockout)
//   { action: 'reattach' }       (discard, attack effect only)
//   { action: 'prizeReduction', count }
export function planSpecialEnergyTriggers(
  card,
  { trigger, host = null, zoneArray = [], fromZone = null, attackExecuting = false, hostZoneId = null, evolvedFrom = null } = {}
) {
  const parsed = parseSpecialEnergyEffects(card);
  if (!parsed || !trigger) return [];
  const plans = [];
  // Both gates apply: Nitro is "discarded by an effect of an attack used by the {R}
  // Pokémon", so its attack condition and its host type must each hold (audit SE11a).
  const ready = (step) =>
    conditionMet(step.condition ?? null, host, zoneArray) &&
    (!step.hostType || conditionMet(`host:${step.hostType}`, host, zoneArray));
  const attackCondition = (step) => step.condition === 'attack' || step.condition === 'attackEffect';

  for (const step of parsed.steps) {
    switch (step.type) {
      case 'attachCost':
        // Aurora Energy's discard is paid as part of attaching; legality checked the hand size.
        if (trigger === 'attach' && fromZone === 'hand' && step.discardFromHand) {
          plans.push({ action: 'discardHand', count: step.discardFromHand });
        }
        break;
      case 'onAttachDraw':
        if (trigger === 'attach' && fromZone === 'hand' && ready(step)) plans.push({ action: 'draw', count: step.count });
        break;
      case 'onAttachSearch':
        if (trigger === 'attach' && fromZone === 'hand' && ready(step)) {
          plans.push({
            action: 'search',
            what: step.what,
            count: step.count,
            destination: step.destination,
            oncePerTurn: !!step.oncePerTurn,
            endsTurn: !!step.endsTurn,
            requiresActive: !!step.requiresActive,
          });
        }
        break;
      case 'onAttachHeal':
        if (trigger === 'attach' && fromZone === 'hand' && ready(step)) plans.push({ action: 'heal', amount: step.amount });
        break;
      case 'onAttachRemoveDamage':
        if (trigger === 'attach' && fromZone === 'hand') plans.push({ action: 'removeDamage', count: step.count, alsoCure: !!step.alsoCure });
        break;
      case 'onAttachDamageCounter':
        if (trigger === 'attach' && fromZone === 'hand') plans.push({ action: 'addDamage', count: step.count, target: 'host' });
        break;
      case 'onAttachClearStatus':
        if (trigger === 'attach' && fromZone === 'hand') {
          // Team Rocket Full Heal names four conditions; the others clear everything.
          const named = (step.conditions || []).filter((c) => ALL_STATUS.includes(c));
          plans.push({ action: 'clearStatus', ...(named.length && named.length < ALL_STATUS.length && { conditions: named }) });
        }
        break;
      case 'onAttachSwitch':
        // "…to your Active Pokémon" / "…to 1 of your Benched Pokémon" (audit SE11d).
        if (trigger === 'attach' && fromZone === 'hand' && (!step.hostZone || !hostZoneId || step.hostZone === hostZoneId)) {
          plans.push({ action: 'switch', side: step.side, target: step.target, chooser: step.chooser ?? 'self' });
        }
        break;
      case 'onAttachReturnBasicEnergy':
        if (trigger === 'attach' && fromZone === 'hand') plans.push({ action: 'returnBasicEnergy' });
        break;
      case 'onAttachDevolve':
        if (trigger === 'attach' && fromZone === 'hand') plans.push({ action: 'devolve', count: step.count });
        break;
      case 'onDiscardReturnToHand':
        if (trigger === 'discard' && ready(step) && (!attackCondition(step) || attackExecuting)) {
          plans.push({ action: 'returnToHand' });
        }
        break;
      case 'onDiscardReattach':
        if (trigger === 'discard' && ready(step) && (!attackCondition(step) || attackExecuting)) {
          plans.push({ action: 'reattach' });
        }
        break;
      case 'onKnockoutReturnToHand':
        if (trigger === 'knockout' && ready(step)) {
          plans.push({ action: 'returnToHand', source: step.source || 'opponentAttack' });
        }
        break;
      case 'onKnockoutDraw':
        if (trigger === 'knockout') plans.push({ action: 'drawUntil', until: step.until, source: 'opponentAttack' });
        break;
      case 'prizeReduction':
        if (trigger === 'knockout') plans.push({ action: 'prizeReduction', count: step.count });
        break;
      case 'onEvolveHeal':
        // hostType names the card class evolved from ("evolve the Pokémon V this card
        // is attached to"), so gate on the Pokémon before it evolved (audit SE11b).
        if (trigger === 'evolve' && (step.hostType !== 'Pokémon V' || isVCard(evolvedFrom))) {
          plans.push({ action: 'heal', amount: step.amount });
        }
        break;
      case 'onDamagedDamageCounters':
        if (trigger === 'damaged') {
          plans.push({ action: 'addDamage', count: step.count, target: 'attacker', against: step.against ?? null });
        }
        break;
      case 'onDamagedDraw':
        if (trigger === 'damaged') plans.push({ action: 'draw', count: step.count });
        break;
      case 'endOfTurnDamageCounter':
        if (trigger === 'endTurn' && !(step.unless && conditionMet(step.unless, host, zoneArray))) {
          plans.push({ action: 'addDamage', count: step.count, target: 'host' });
        }
        break;
      default:
        break;
    }
  }
  return plans;
}

// ── pure execution helpers ────────────────────────────────────────────────
// These read a flat zone array and answer questions the live damage/HP paths
// ask. Attached cards point at their host via `energy.image.relative`.

export function getAttachedSpecialEnergies(pokemonCard, zoneArray = []) {
  if (!pokemonCard) return [];
  const targetImg = pokemonCard.image;
  const targetId = pokemonCard.instanceId;
  return (zoneArray || []).filter(
    (c) =>
      c &&
      c.type === 'Energy' &&
      ((targetId != null && c.attachedTo === targetId) ||
        (targetImg && c.image?.relative === targetImg))
  );
}

function hostHasBasicEnergy(zoneArray, hostImage, typeName, hostId) {
  return (zoneArray || []).some(
    (c) =>
      c &&
      c.type === 'Energy' &&
      ((hostId != null && c.attachedTo === hostId) ||
        (hostImage && c.image?.relative === hostImage)) &&
      !isSpecialEnergyCard(c) &&
      String(c.name ?? '').toLowerCase().includes(String(typeName ?? '').toLowerCase().split('|')[0]),
  );
}

const normalizeTypeName = (name) => {
  const lowered = String(name ?? '').toLowerCase();
  return lowered === 'darkness' ? 'dark' : lowered;
};

// Every printed type counts (dual-type Pokémon). The name fallback is only for cards
// whose types have not synced yet; with types present, "Dragonite" is not {N}.
function hostIsType(pokemon, typeName) {
  const want = normalizeTypeName(typeName);
  if (want === 'ultra beast') return isUltraBeast(pokemon);
  const types = (pokemon?.types || []).map(normalizeTypeName).filter(Boolean);
  if (types.length > 0) return types.includes(want);
  return String(pokemon?.name ?? '').toLowerCase().includes(want);
}

// TCGdex spells stages inconsistently ("Stage 2" vs "Stage2"), so compare on
// letters/digits only, like cards.mjs collapseStage().
function stageKey(pokemon) {
  const subs = (pokemon?.subtypes || []).map((s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const stage = String(pokemon?.stage ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (stage) return stage;
  if (subs.includes('stage2')) return 'stage2';
  if (subs.includes('stage1')) return 'stage1';
  return 'basic';
}

function conditionMet(condition, pokemon, zoneArray) {
  if (!condition) return true;
  const img = pokemon?.image;
  if (condition.startsWith('host:')) return hostIsType(pokemon, condition.slice(5));
  if (condition.startsWith('hostHasBasic:')) return hostHasBasicEnergy(zoneArray, img, condition.slice('hostHasBasic:'.length), pokemon?.instanceId);
  if (condition.startsWith('not:')) return !hostIsType(pokemon, condition.slice(4));
  switch (condition) {
    case 'hostBasic':
      return stageKey(pokemon) === 'basic';
    case 'stage2':
      return stageKey(pokemon) === 'stage2';
    case 'evolution':
      return stageKey(pokemon) !== 'basic';
    case 'delta':
      return /δ|delta/i.test(String(pokemon?.name ?? '')) || (pokemon?.subtypes || []).map((s) => String(s).toLowerCase()).includes('delta species');
    case 'otherSpecial': {
      const attached = getAttachedSpecialEnergies(pokemon, zoneArray);
      return attached.length > 1;
    }
    default:
      return true;
  }
}

/** Sum of +HP modifiers from attached special energies (Growing/Heat …). */
export function getSpecialEnergyHpBonus(pokemonCard, zoneArray = []) {
  let total = 0;
  for (const energy of getAttachedSpecialEnergies(pokemonCard, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      if (step.type === 'hpBonus' && conditionMet(step.condition ?? (step.hostType ? `host:${step.hostType}` : null), pokemonCard, zoneArray)) {
        total += step.amount;
      }
    }
  }
  return total;
}

/** Attack-damage bonus from the attacker's attached special energies. */
export function getSpecialEnergyAttackBonus(attacker, zoneArray = [], { defenderIsActive = true, afterWR = false } = {}) {
  let total = 0;
  for (const energy of getAttachedSpecialEnergies(attacker, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      if (step.type !== 'damageBonus' || !!step.afterWR !== afterWR) continue;
      if (step.target === 'opponentActive' && !defenderIsActive) continue;
      if (!conditionMet(step.condition ?? (step.hostType ? `host:${step.hostType}` : null), attacker, zoneArray)) continue;
      total += step.amount;
    }
  }
  return total;
}

/** Penalty applied to the attacker's own attacks (Double Turbo, Double Rainbow). */
export function getSpecialEnergyAttackPenalty(attacker, zoneArray = [], { afterWR = false } = {}) {
  let total = 0;
  for (const energy of getAttachedSpecialEnergies(attacker, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      // Double Rainbow MA 88 is printed "after applying Weakness and Resistance" (SE13d).
      if (step.type !== 'attackDamagePenalty' || !!step.afterWR !== afterWR) continue;
      if (!conditionMet(step.condition ?? null, attacker, zoneArray)) continue;
      total += step.amount;
    }
  }
  return total;
}

/**
 * Damage reduction from the defender's attached special energies.
 * `afterWR` steps apply after Weakness/Resistance (Metal, Stone, V Guard);
 * before-WR steps (Shield) are returned separately for callers that need
 * the distinction.
 */
export function getSpecialEnergyDamageReduction(defender, zoneArray = [], { attacker = null, afterWR = true } = {}) {
  let total = 0;
  // "…can't be applied more than once at a time" (V Guard): one copy per name counts.
  const onceApplied = new Set();
  for (const energy of getAttachedSpecialEnergies(defender, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    const onceKey = parsed.steps.some((s) => s.type === 'onceAtATime') ? parsed.name.toLowerCase() : null;
    if (onceKey && onceApplied.has(onceKey)) continue;
    let applied = false;
    for (const step of parsed.steps) {
      if (step.type !== 'damageReduction') continue;
      if ((step.afterWR ?? false) !== afterWR) continue;
      if (step.source === 'opponentPokemonEx' && !isExCard(attacker ?? {})) continue;
      if (step.source === 'opponentPokemonV' && !isVCard(attacker ?? {})) continue;
      if (!conditionMet(step.condition ?? (step.hostType ? `host:${step.hostType}` : null), defender, zoneArray)) continue;
      total += step.amount;
      applied = true;
    }
    if (applied && onceKey) onceApplied.add(onceKey);
  }
  return total;
}

/** True when the attacker's special Energy makes its attacks ignore Resistance (Holon FF). */
export function hasSpecialEnergyIgnoresResistance(attacker, zoneArray = []) {
  for (const energy of getAttachedSpecialEnergies(attacker, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    for (const step of parsed?.steps || []) {
      if (step.type === 'ignoresResistance' && conditionMet(step.condition ?? null, attacker, zoneArray)) return true;
    }
  }
  return false;
}

/** True when an attached special energy grants a free retreat. */
export function hasSpecialEnergyFreeRetreat(pokemonCard, zoneArray = []) {
  for (const energy of getAttachedSpecialEnergies(pokemonCard, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      if (step.type === 'freeRetreat' && conditionMet(step.condition ?? (step.hostType ? `host:${step.hostType}` : null), pokemonCard, zoneArray)) {
        return true;
      }
    }
  }
  return false;
}

/** True when an attached special Energy stops the host retreating (Boost Energy). */
export function hasSpecialEnergyCannotRetreat(pokemonCard, zoneArray = []) {
  return getAttachedSpecialEnergies(pokemonCard, zoneArray).some((energy) =>
    parseSpecialEnergyEffects(energy)?.steps.some((step) => step.type === 'cannotRetreat')
  );
}

/** Retreat-cost reduction from attached special energies. */
export function getSpecialEnergyRetreatReduction(pokemonCard, zoneArray = []) {
  let total = 0;
  for (const energy of getAttachedSpecialEnergies(pokemonCard, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      if (step.type === 'retreatReduction') total += step.amount;
    }
  }
  return total;
}

/** Status conditions the host is immune to, for a given zone array. */
export function getSpecialEnergyStatusImmunity(pokemonCard, zoneArray = []) {
  const out = new Set();
  for (const energy of getAttachedSpecialEnergies(pokemonCard, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      if (step.type !== 'statusImmunity') continue;
      if (!conditionMet(step.condition ?? (step.hostType ? `host:${step.hostType}` : null), pokemonCard, zoneArray)) continue;
      for (const c of step.conditions) out.add(c);
    }
  }
  return [...out];
}

/** True when attached special energy nullifies the host's Weakness. */
export function hasSpecialEnergyNoWeakness(pokemonCard, zoneArray = []) {
  for (const energy of getAttachedSpecialEnergies(pokemonCard, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      if (step.type === 'noWeakness' && conditionMet(step.condition ?? (step.hostType ? `host:${step.hostType}` : null), pokemonCard, zoneArray)) {
        return true;
      }
    }
  }
  return false;
}

/** True when the host is shielded from opponent attack effects (not damage). */
export function hasSpecialEnergyEffectShield(pokemonCard, zoneArray = []) {
  for (const energy of getAttachedSpecialEnergies(pokemonCard, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      if (step.type === 'effectShield' && conditionMet(step.condition ?? (step.hostType ? `host:${step.hostType}` : null), pokemonCard, zoneArray)) {
        return true;
      }
    }
  }
  return false;
}

/** True when the host is shielded from opponent Abilities (Fusion Strike). */
export function hasSpecialEnergyAbilityShield(pokemonCard, zoneArray = []) {
  for (const energy of getAttachedSpecialEnergies(pokemonCard, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      if (step.type === 'abilityShield' && conditionMet(step.condition ?? (step.hostType ? `host:${step.hostType}` : null), pokemonCard, zoneArray)) {
        return true;
      }
    }
  }
  return false;
}

/** True when an attached special energy shields a benched host from all damage. */
export function blocksSpecialEnergyBenchDamage(pokemonCard, zoneId, zoneArray = []) {
  if (zoneId !== 'bench') return false;
  for (const energy of getAttachedSpecialEnergies(pokemonCard, zoneArray)) {
    const parsed = parseSpecialEnergyEffects(energy);
    if (!parsed) continue;
    for (const step of parsed.steps) {
      if (step.type === 'benchDamageShield' && conditionMet(step.hostType ? `host:${step.hostType}` : null, pokemonCard, zoneArray)) {
        return true;
      }
    }
  }
  return false;
}

const plainName = (card) => String(card?.name ?? '').replace(/[‘’]/g, "'");

const subtypeListHas = (pokemon, re) => (pokemon?.subtypes || []).some((s) => re.test(String(s)));

// Attach-restriction kinds → does this host qualify? `null` = the host's data cannot say
// (server Pokémon carry no subtypes), so the restriction is not enforced.
const knownStage = (host) => Boolean(host?.stage) || Boolean(host?.subtypes?.length);
const RESTRICTION_HOSTS = {
  type: (host, step) => (host?.types?.length ? hostIsType(host, step.hostType) : null),
  teamRocket: (host) => /^team rocket'?s\b/i.test(plainName(host)),
  darkOrRocket: (host) => /\bdark\b|\brocket'?s\b/i.test(plainName(host)),
  teamMagma: (host) => /\bteam magma\b/i.test(plainName(host)),
  teamAqua: (host) => /\bteam aqua\b/i.test(plainName(host)),
  evolution: (host) => (knownStage(host) ? stageKey(host) !== 'basic' : null),
  evolvedExcludingEx: (host) => (knownStage(host) ? stageKey(host) !== 'basic' && !isExCard(host) : null),
  shiningOrLight: (host) => /^(shining|light)\s/i.test(plainName(host)),
  fusionStrike: (host) => (host?.subtypes?.length ? subtypeListHas(host, /fusion strike/i) : null),
  singleStrike: (host) => (host?.subtypes?.length ? subtypeListHas(host, /single strike/i) : null),
  rapidStrike: (host) => (host?.subtypes?.length ? subtypeListHas(host, /rapid strike/i) : null),
};

/**
 * The first attach restriction `host` fails for this Energy ("This card can only be
 * attached to …"), or null when it may stay attached. `atAttach` also checks the
 * attach-time-only prerequisites (Bounce Energy's basic-Energy bearer).
 *
 * @returns {{kind:string, discardIfNot:boolean}|null}
 */
export function failedSpecialEnergyRestriction(energy, host, zoneArray = [], { atAttach = false } = {}) {
  if (!energy || !host) return null;
  const parsed = parseSpecialEnergyEffects(energy);
  for (const step of parsed?.steps || []) {
    if (step.type === 'attachRestriction') {
      if (step.kind === 'basicEnergyBearer') {
        if (atAttach && !hostHasAnyBasicEnergy(zoneArray, host)) return { kind: step.kind, discardIfNot: false };
        continue;
      }
      const check = RESTRICTION_HOSTS[step.kind];
      if (check && check(host, step) === false) return { kind: step.kind, discardIfNot: !!step.discardIfNot };
    }
    if (
      step.type === 'discardWhenConditionLost' &&
      !atAttach &&
      knownStage(host) &&
      !conditionMet(step.condition, host, zoneArray)
    ) {
      return { kind: step.condition, discardIfNot: true };
    }
  }
  return null;
}

function hostHasAnyBasicEnergy(zoneArray, host) {
  return (zoneArray || []).some(
    (c) =>
      c &&
      c.type === 'Energy' &&
      c.attachedTo != null &&
      c.attachedTo === host.instanceId &&
      !isSpecialEnergyCard(c)
  );
}

/** True when this Energy discards itself at the end of its owner's turn (Ignition, Boost). */
export function discardsAtEndOfTurn(energy) {
  return !!parseSpecialEnergyEffects(energy)?.steps.some((s) => s.type === 'discardAtEndOfTurn');
}

// Pool tokens use the cost-symbol spelling (TCGdex writes {D} costs "Darkness").
const POOL_TYPE = { Dark: 'Darkness' };
const poolType = (type) => POOL_TYPE[type] ?? type;

const isSpPokemon = (pokemon) =>
  (pokemon?.subtypes || []).some((s) => /^sp$/i.test(String(s))) ||
  /\s(?:G|GL|FB|C|E4|4)$/.test(String(pokemon?.name ?? ''));

const isLvXPokemon = (pokemon) =>
  /lv\.?\s*x$/i.test(String(pokemon?.name ?? '')) ||
  (pokemon?.subtypes || []).some((s) => /lv\.?\s*x/i.test(String(s)));

const isUltraBeast = (pokemon) =>
  (pokemon?.subtypes || []).some((s) => /ultra beast/i.test(String(s)));

const isVOrGx = (pokemon) => isVCard(pokemon) || isGxCard(pokemon);

// Client zone cards often carry no instanceId; two undefined ids are not the same card.
function isSameCard(card, self) {
  if (!self) return false;
  if (card === self) return true;
  return card.instanceId != null && card.instanceId === self.instanceId;
}

function basicEnergyTypesOn(attached, self) {
  const types = new Set();
  for (const card of attached) {
    if (!card || isSameCard(card, self)) continue;
    if (isSpecialEnergyCard(card)) continue;
    const m = String(card.name ?? '').match(TYPED_BASIC_NAME);
    if (m) types.add(poolType(SYMBOL_NAME_TYPES[m[1].toLowerCase()]));
  }
  return [...types];
}

const TYPED_BASIC_NAME = /^(?:basic\s+)?(grass|fire|water|lightning|psychic|fighting|darkness|dark|metal|dragon|fairy) energy$/i;
const SYMBOL_NAME_TYPES = {
  grass: 'Grass',
  fire: 'Fire',
  water: 'Water',
  lightning: 'Lightning',
  psychic: 'Psychic',
  fighting: 'Fighting',
  darkness: 'Darkness',
  dark: 'Darkness',
  metal: 'Metal',
  dragon: 'Dragon',
  fairy: 'Fairy',
};

/**
 * Board facts a provide condition reads (Reversal / Counter / Scramble prizes, Super
 * Boost Stage 2 count), built from client zone reads so the preview prices Energy the
 * way the server's `energyProvisionContext` does. A missing prize count stays
 * undefined, which leaves the trailing condition unmet rather than guessed.
 *
 * @param {{ownPrizes?:number, opponentPrizes?:number, inPlayPokemon?:object[]}} facts
 *   `inPlayPokemon` = the top card of each of the player's Active/Benched Pokémon
 */
export function specialEnergyBoard({ ownPrizes, opponentPrizes, inPlayPokemon = [] } = {}) {
  return {
    ownPrizes: Number.isFinite(ownPrizes) ? ownPrizes : undefined,
    opponentPrizes: Number.isFinite(opponentPrizes) ? opponentPrizes : undefined,
    ownStage2InPlay: (inPlayPokemon || []).filter((c) => c && stageKey(c) === 'stage2').length,
  };
}

/**
 * Whether a provide step's condition holds. Every condition the parser can emit is
 * decided explicitly; an unknown one is not met, so a missing rule never over-grants
 * Energy (the old default-true did).
 *
 * @param {string|undefined} condition
 * @param {{host?:object|null, attached?:object[], self?:object|null,
 *          board?:{ownPrizes?:number, opponentPrizes?:number, ownStage2InPlay?:number}}} ctx
 */
function provisionConditionMet(condition, { host = null, attached = [], self = null, board = {} } = {}) {
  if (!condition) return true;
  if (!host) return false;
  if (condition.startsWith('host:')) return hostIsType(host, condition.slice(5));
  const trailing =
    Number.isFinite(board.ownPrizes) &&
    Number.isFinite(board.opponentPrizes) &&
    board.ownPrizes > board.opponentPrizes;
  switch (condition) {
    case 'hostBasic':
      return stageKey(host) === 'basic';
    case 'stage2':
      return stageKey(host) === 'stage2';
    case 'evolution':
      return stageKey(host) !== 'basic';
    case 'threeStage2':
      // Super Boost: the 4-Energy mode extends the Stage 2 host mode (UPR ruling), so a
      // Basic host provides only {C} however many Stage 2 are in play.
      return stageKey(host) === 'stage2' && (board.ownStage2InPlay ?? 0) >= 3;
    case 'delta':
      return conditionMet('delta', host, []);
    case 'hostSP':
      return isSpPokemon(host);
    case 'ultraBeast':
      return isUltraBeast(host);
    case 'teamMagma':
      return /^team magma'?s\b/i.test(String(host.name ?? '').replace(/’/g, "'"));
    case 'teamAqua':
      return /^team aqua'?s\b/i.test(String(host.name ?? '').replace(/’/g, "'"));
    case 'isVOrGx':
      return isVOrGx(host);
    case 'notVOrGx':
      return !isVOrGx(host);
    case 'otherSpecial':
      return attached.some(
        (card) => card && !isSameCard(card, self) && isSpecialEnergyCard(card)
      );
    case 'noBasicEnergy':
      return basicEnergyTypesOn(attached, self).length === 0;
    case 'trailingPrizes':
      return trailing;
    case 'trailingPrizesNotGxEx':
      return trailing && !isGxCard(host) && !isExCard(host);
    case 'trailingPrizesNotLvX':
      return trailing && !isLvXPokemon(host);
    case 'trailingPrizesEvolutionNoRuleBox':
      return trailing && stageKey(host) !== 'basic' && !isRuleBoxPokemon(host);
    default:
      return false;
  }
}

function provideTokens(step, ctx) {
  const count = Math.max(1, step.count || 1);
  const types = step.energyTypes || [];
  if (types.includes('Any')) return new Array(count).fill('Wildcard');
  if (types.includes('CrystalBasic')) {
    const basics = basicEnergyTypesOn(ctx.attached || [], ctx.self);
    if (!basics.length) return null;
    return new Array(count).fill(basics.join('|'));
  }
  if (!types.length) return null;
  const token = types.map(poolType).join('|');
  return new Array(count).fill(token);
}

/**
 * What a special Energy provides where it is attached, as expandEnergyEntries pool
 * tokens ('Wildcard' = any type, "A|B" = one unit of either type). The last provide
 * step whose condition holds wins ("… provides {C}{C}{C} Energy instead"); with none
 * holding, the Energy provides nothing (Shield Energy off a {M} Pokémon).
 *
 * @param {object} energyCard
 * @param {{host?:object|null, attached?:object[],
 *          board?:{ownPrizes?:number, opponentPrizes?:number, ownStage2InPlay?:number}}} [ctx]
 *   `attached` is every card attached to the host (siblings of this Energy).
 * @returns {string[]|null} null when the card's text names no provision at all, so the
 *   caller keeps its type-based fallback.
 */
export function specialEnergyProvision(energyCard, { host = null, attached = [], board = {} } = {}) {
  if (!energyCard) return null;
  const provides = parseSpecialEnergyEffects(energyCard)?.provides ?? [];
  if (!provides.length) return null;
  const ctx = { host, attached: attached || [], self: energyCard, board: board || {} };
  const met = provides.filter((step) => provisionConditionMet(step.condition, ctx));
  if (!met.length) return [];
  const conditional = met.filter((step) => step.condition);
  const step = conditional.length ? conditional[conditional.length - 1] : met[met.length - 1];
  const tokens = provideTokens(step, ctx);
  if (tokens) return tokens;
  // Crystal Energy with no basic Energy beside it falls back to its {C} step.
  const fallback = met.filter((s) => s !== step);
  return fallback.length ? provideTokens(fallback[fallback.length - 1], ctx) ?? [] : [];
}
