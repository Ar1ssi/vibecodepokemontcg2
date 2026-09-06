// Piece B of Gap #1 (taxonomy Section D): a pure damage-expression parser.
//
// It reads an attack's printed `text` (the real input — `ensureCardData`
// stores `{ name, cost[], damage, text }` per attack) and computes the
// *effective base damage number*, i.e. the value that belongs in
// `attack.damage` when the existing, already-tested
// `computeAttackDamage()` (attack-engine.mjs) applies weakness/resistance.
//
// Pure + DOM-free + no state mutation: it never touches rulesState, never
// flips coins, never applies damage. Coin outcomes are supplied by the
// caller via `ctx.coin`. This is the "announce-only doctrine" in parser
// form: execution/wiring (Pieces C/D) is a separate, user-confirmed step.
//
// Shape contract:
//   parseAttackDamage(attack, attacker, defender, ctx) →
//     { base, total, components[], notes[], bench, heal, selfDamage, resolved }
//   - `base`      : printed damage number (attack.damage, default 0)
//   - `total`     : effective base damage AFTER text scaling (BEFORE
//                   weakness/resistance — feed it to computeAttackDamage)
//   - `components`: which scaling pieces fired (DAMAGE_COMPONENTS values)
//   - `notes`     : human-readable caveats (unresolved conditions, coin
//                   not yet flipped, …)
//   - `bench`     : bonus damage available against a benched Pokémon (0 = none)
//   - `heal`      : damage counters removed (0 = none)
//   - `selfDamage`: damage the attack deals to itself (e.g. coin tails)
//   - `resolved`  : true when `total` is final (no pending coin/condition)
//
// ctx (all optional, defaulted):
//   { energyCount, opponentPrizes, turnCount,
//     attackerHp, defenderHp, coin: 'heads'|'tails',
//     defenderDamage /* damage counters on the defender; leave undefined
//                         when unknown — enables "is damaged" */,
//     attackerDamage /* damage counters on the attacker (this Pokémon) */ }

import { parseSearchDeckParams } from './trainer-effects.mjs';

export const DAMAGE_COMPONENTS = [
  'per-energy',
  'per-each',
  'per-prize',
  'per-turn',
  'per-hp',
  'extra-by-type',
  'conditional',
  'coin',
  'per-heads',
  'bench',
  'heal',
];

// Normalize curly quotes so card text matches our patterns.
const lower = (v) => String(v ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'");

// Recognized types for "if the Defending Pokémon is a [type] Pokémon" checks.
const TYPES = [
  'grass',
  'fire',
  'water',
  'lightning',
  'psychic',
  'fighting',
  'dark',
  'metal',
  'fairy',
  'dragon',
];

// First number in `text` matching `re` (pattern must have one capture group).
function amount(text, re) {
  const m = text.match(re);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

// Evaluate a single printed "if …" condition against the available card data.
// `cond` is the lowercased condition clause (text between "if" and the
// "…more damage" clause). Returns true/false when determinable, or null when
// the condition depends on something not present in card data (e.g. "you
// have an Energy attached…") — the caller keeps an honest unresolved note.
function evalCondition(cond, defender, ctx) {
  const hp = Number(defender?.hp) || 0;
  const hpMore = cond.match(/(\d+) hp or more/);
  if (hpMore) {
    if (hp <= 0) return null; // HP unknown — can't decide
    return hp >= parseInt(hpMore[1], 10);
  }
  const hpLess = cond.match(/(\d+) hp or less/);
  if (hpLess) {
    if (hp <= 0) return null;
    return hp <= parseInt(hpLess[1], 10);
  }
  const stage = cond.match(/\bstage (1|2)\b/);
  if (stage) {
    const defenderStage = String(defender?.stage ?? '').toLowerCase();
    if (!defenderStage) return null;
    return defenderStage.includes(`stage ${stage[1]}`);
  }
  if (/is damaged/.test(cond)) {
    const dmg = ctx?.defenderDamage;
    if (typeof dmg !== 'number') return null;
    return dmg > 0;
  }
  if (/\bex pok[ée]mon/.test(cond)) {
    if (typeof defender?.ex === 'boolean') return defender.ex;
    const name = String(defender?.name ?? '').toLowerCase();
    if (name) return / ex$/.test(name);
    return null;
  }
  if (/is a basic pok[ée]mon/.test(cond)) return defender?.basic !== false;
  return null;
}

// Parse the attack text into an effective base damage number + breakdown.
// See the module header for the shape contract and ctx options.
export function parseAttackDamage(attack, attacker = {}, defender = {}, ctx = {}) {
  const text = lower(attack?.text ?? '');
  const base = Number.isFinite(attack?.damage) ? attack.damage : 0;
  const components = [];
  const notes = [];

  const energyCount = ctx.energyCount ?? 0;
  const opponentPrizes = ctx.opponentPrizes ?? 0;
  const turnCount = ctx.turnCount ?? 1;
  const attackerHp = ctx.attackerHp ?? attacker?.hp ?? 0;
  const defenderHp = ctx.defenderHp ?? defender?.hp ?? 0;
  // Live game-state counts for "for each …" scaling (Mega Evolution audit A).
  // Each is OPTIONAL: when the caller has not supplied the relevant field we
  // keep an honest unresolved note instead of silently computing 0.
  const ownEnergyCount = ctx.ownEnergyCount; // Energy on ALL of your Pokémon
  const opponentEnergyCount = ctx.opponentEnergyCount; // Energy on opponent's Active
  const speciesCount = ctx.speciesCount; // e.g. Beedrill + Beedrill ex in play
  const opponentHandCount = ctx.opponentHandCount; // cards in opponent's hand
  const retreatCostColorless = ctx.retreatCostColorless; // Colorless in opponent's Active's Retreat Cost
  const ownBenchCount = ctx.ownBenchCount; // your Benched Pokémon
  const opponentBenchCount = ctx.opponentBenchCount; // opponent's Benched Pokémon
  const damagedBenchCount = ctx.damagedBenchCount; // your Benched Pokémon with damage counters
  const attackerDamage = ctx.attackerDamage; // damage counters on this Pokémon
  const defenderDamage = ctx.defenderDamage; // damage counters on opponent's Active
  const headsCount = ctx.headsCount; // heads from a "flip … for each heads" coin
  const ownHandCount = ctx.ownHandCount; // cards in your hand
  const ownPokemonInPlayCount = ctx.ownPokemonInPlayCount;
  const roundAttackCount = ctx.roundAttackCount;
  const teamRocketCount = ctx.teamRocketCount;
  const ancientCount = ctx.ancientCount;
  const grassPokemonCount = ctx.grassPokemonCount;
  const specialEnergyOnSelfCount = ctx.specialEnergyOnSelfCount;
  const opponentStatusCount = ctx.opponentStatusCount;
  const damagedOwnPokemonCount = ctx.damagedOwnPokemonCount;
  const taurosDamagedCount = ctx.taurosDamagedCount;

  let total = base;

  // ── Scaling damage ──
  // Discard-to-scale (taxonomy §D damage-scaling family): "Discard up to N
  // Energy cards from this Pokémon… does X damage for each card you
  // discarded in this way" (Mega Diancie ex / Garland Ray). The multiplier is
  // the number of Energy the player chose to discard (ctx.energyDiscarded),
  // NOT the attached count. 0 discarded → 0 damage, per the printed text.
  if (text && /for each card you discard(ed)?/.test(text)) {
    const discarded = ctx.energyDiscarded ?? 0;
    total = base * discarded;
    components.push('per-energy-discarded');
    notes.push(`× ${discarded} Energy discarded in this way`);
  } else if (text && /number of energy|× the number|\* the number/.test(text)) {
    total = base * energyCount;
    components.push('per-energy');
    notes.push(`× ${energyCount} attached Energy`);
  } else if (text && /damage for each/.test(text) && !/damage for each \d+ hp/.test(text)) {
    // "for each …" scaling (Mega Evolution audit A). "does N damage for each X"
    // → total = N × count (N is the per-unit value, so the printed base = N).
    // "does N more damage for each X" → total = base + N × count (N is a
    // per-unit bonus on top of the printed base). The live count comes from ctx
    // (caller supplies the game value); when the needed ctx field is absent we
    // keep an honest unresolved note instead of silently computing 0.
    const isMore = /more damage for each/.test(text);
    const per = amount(text, /does (\d+)(?: more)? damage for each/);
    // Anchor on the DAMAGE clause ("…damage for each X") so a coin-count
    // clause like "flip a coin for each Energy attached" is not mistaken for
    // the damage unit (Work Rush: damage scales per HEADS, not per Energy).
    const unit = (text.match(/damage for each (.+)/) || [])[1] || '';
    let count;
    let label;
    if (/energy attached to all of your pok[ée]mon/.test(unit)) {
      count = ownEnergyCount;
      label = 'Energy on all your Pokémon';
    } else if (/energy (card )?attached to your opponent's active pok[ée]mon/.test(unit)) {
      count = opponentEnergyCount;
      label = "Energy on opponent's Active Pokémon";
    } else if (/energy attached/.test(unit)) {
      count = energyCount;
      label = 'Energy attached';
    } else if (/beedrill/.test(unit)) {
      count = speciesCount;
      label = 'Beedrill/Beedrill ex in play';
    } else if (/card in your hand/.test(unit)) {
      count = ownHandCount;
      label = 'cards in your hand';
    } else if (/pok[ée]mon that has any damage counters/.test(unit) && !/benched/.test(unit)) {
      count = damagedOwnPokemonCount;
      label = 'your Pokémon with damage counters';
    } else if (/tauros.*in its name/.test(unit) && /damage counter/.test(unit)) {
      count = taurosDamagedCount;
      label = 'Tauros with damage counters';
    } else if (/card in your opponent's hand/.test(unit)) {
      count = opponentHandCount;
      label = "cards in opponent's hand";
    } else if (/round attack/.test(unit)) {
      count = roundAttackCount;
      label = 'Pokémon in play with the Round attack';
    } else if (/team rocket's pok[ée]mon/.test(unit)) {
      count = teamRocketCount;
      label = "Team Rocket's Pokémon in play";
    } else if (/ancient pok[ée]mon/.test(unit)) {
      count = ancientCount;
      label = 'Ancient Pokémon in play';
    } else if (/\{g\} pok[ée]mon in play/.test(unit)) {
      count = grassPokemonCount;
      label = '{G} Pokémon in play';
    } else if (/pok[ée]mon in play/.test(unit)) {
      count = ownPokemonInPlayCount;
      label = 'Pokémon in play';
    } else if (/special energy card attached to this pok[ée]mon/.test(unit)) {
      count = specialEnergyOnSelfCount;
      label = 'Special Energy attached to this Pokémon';
    } else if (/special condition affecting your opponent's active/.test(unit)) {
      count = opponentStatusCount;
      label = "Special Conditions on opponent's Active";
    } else if (/retreat cost/.test(unit)) {
      count = retreatCostColorless;
      label = "Colorless in opponent's Active's Retreat Cost";
    } else if (/(both yours and (your )?opponent's)|each benched pok[ée]mon/.test(unit)) {
      count = (ownBenchCount === undefined && opponentBenchCount === undefined)
        ? undefined
        : (ownBenchCount ?? 0) + (opponentBenchCount ?? 0);
      label = 'Benched Pokémon (both sides)';
    } else if (/damage counter|damaged/.test(unit)) {
      if (/(?:your )?benched pok[ée]mon|benched.*damage counter|damaged benched/.test(unit)) {
        count = damagedBenchCount;
        label = 'your damaged Benched Pokémon';
      } else if (/on this pok[ée]mon|this pok[ée]mon.*damage counter|damage counter.*on this pok/.test(unit)) {
        count = attackerDamage;
        label = 'damage counter on this Pokémon';
      } else if (/opponent's active|defending pok[ée]mon|damage counter.*on your opponent/.test(unit)) {
        count = defenderDamage;
        label = "damage counter on opponent's Active Pokémon";
      } else {
        count = undefined;
        label = unit || 'damage counter';
      }
    } else if (/benched pok[ée]mon/.test(unit)) {
      count = ownBenchCount;
      label = 'your Benched Pokémon';
    } else if (/heads/.test(unit)) {
      // Per-heads coin scaling (audit I): "flip … for each heads". The heads
      // count is supplied by the caller after the flip (ctx.headsCount).
      count = headsCount;
      label = 'heads';
    } else {
      count = undefined;
      label = unit || 'the printed count';
    }
    if (per > 0 && typeof count === 'number' && count >= 0) {
      total = isMore ? base + per * count : per * count;
      components.push('per-each');
      notes.push(`${isMore ? `+ ${per} × ${count}` : `${per} × ${count}`} (${label})`);
    } else {
      components.push('per-each');
      notes.push(`per-${label} scaling — resolve the printed count`);
    }
  } else if (text && /prize card/.test(text)) {
    const per = amount(text, /(\d+) more damage|does (\d+) damage/);
    total = base + per * opponentPrizes;
    components.push('per-prize');
    notes.push(`+ ${per} × ${opponentPrizes} opponent Prize cards`);
  } else if (text && /for each turn|each turn/.test(text)) {
    const per = amount(text, /(\d+) more damage|does (\d+) damage/);
    total = base + per * turnCount;
    components.push('per-turn');
    notes.push(`+ ${per} × turn ${turnCount}`);
  } else if (text && /for each \d+ hp/.test(text)) {
    // Per-HP scaling (e.g. "…10 more damage for each 10 HP of the Defending
    // Pokémon"). The HP reference defaults to the Defending Pokémon (the
    // common printed form); "…of this Pokémon" uses the attacker's HP.
    const step = amount(text, /for each (\d+) hp/) || 10;
    const per = amount(text, /(\d+) more damage/) || amount(text, /does (\d+) damage/);
    const attackerSide = /for each \d+ hp of this pok[ée]mon/.test(text);
    const hp = attackerSide ? attackerHp : defenderHp;
    if (per > 0) {
      const blocks = hp > 0 ? Math.floor(hp / step) : 0;
      total = base + per * blocks;
      components.push('per-hp');
      notes.push(
        `+ ${per} × ${blocks} (per ${step} HP ${attackerSide ? 'of this Pokémon' : 'of the Defending Pokémon'})`
      );
    } else {
      notes.push('per-HP scaling — resolve the printed amount');
    }
  }

  // ── Type-gated bonus: "+N if the Defending Pokémon is a [type] Pokémon" ──
  const typeMatch = text.match(/if the defending pokémon is a (grass|fire|water|lightning|psychic|fighting|dark|metal|fairy|dragon) pokémon.*?does (\d+) more damage/);
  if (typeMatch) {
    const bonus = parseInt(typeMatch[2], 10) || 0;
    const defenderType = lower(defender?.types?.[0] ?? defender?.type);
    if (defenderType === typeMatch[1]) {
      total += bonus;
      components.push('extra-by-type');
      notes.push(`+ ${bonus} (Defending Pokémon is ${typeMatch[1]})`);
    } else {
      notes.push(`+ ${bonus} not applied (Defending Pokémon is not ${typeMatch[1]})`);
    }
  } else if (
    text &&
    !/if heads|if tails/.test(text) &&
    /if .* this attack does \d+ more|if .*more damage/.test(text)
  ) {
    // Conditional bonus ("if …, this attack does N more"). The printed
    // condition clause is evaluated from card data where possible (HP
    // comparison, Stage, damaged state via ctx.defenderDamage, ex, Basic);
    // conditions not derivable from card data stay honest unresolved notes.
    // Coin-conditional bonuses ("if heads/if tails") are handled by the coin
    // block below and must not be misfiled here as an unresolved condition.
    const bonus = amount(text, /does (\d+) more damage|(\d+) more damage/);
    const cond = (text.match(/if (.+?)(?:,| this attack)/) || [])[1] || '';
    const result = evalCondition(cond, defender, ctx);
    if (result === null) {
      notes.push(`conditional +${bonus} bonus — resolve the printed condition`);
    } else if (result) {
      total += bonus;
      components.push('conditional');
      notes.push(`+ ${bonus} (condition met: ${cond.trim()})`);
    } else {
      notes.push(`+ ${bonus} not applied (condition not met: ${cond.trim()})`);
    }
  }

  // ── Coin flip (outcome supplied by caller; we never flip) ──
  const headsBonus = /if heads, this attack does (\d+) more|if heads, .*(\d+) more damage/.test(text)
    ? amount(text, /if heads, this attack does (\d+) more|if heads, .*(\d+) more damage/)
    : 0;
  const tailsSelf = /if tails, do (\d+) damage to yourself/.test(text)
    ? amount(text, /if tails, do (\d+) damage to yourself/)
    : 0;
  let selfDamage = 0;
  if ((headsBonus > 0 || tailsSelf > 0) && /flip a coin/.test(text)) {
    if (ctx.coin === 'heads') {
      total += headsBonus;
      components.push('coin');
      notes.push(`coin: heads → +${headsBonus}`);
    } else if (ctx.coin === 'tails') {
      selfDamage = tailsSelf || amount(text, /do (\d+) damage to yourself/);
      components.push('coin');
      notes.push(`coin: tails → ${selfDamage} to self`);
    } else {
      notes.push('coin flip pending — pass ctx.coin to resolve');
    }
  }

  // ── Side effects (reported, never executed) ──
  let bench = 0;
  if (text && /benched pok[ée]mon|your bench/.test(text) && /damage|do(?:es)? \d/.test(text)) {
    bench = amount(text, /(?:also )?do(?:es)? (\d+) damage/);
    if (bench > 0) components.push('bench');
  }
  let heal = 0;
  // Heal family (audit B): "Heal N damage from …" and "remove N damage
  // counter(s)" both remove N damage counters. The target (attacker /
  // defender / all) is resolved separately by healTarget().
  const healRe = /(?:heal|remove) (?:up to )?(\d+) damage/;
  if (text && healRe.test(text)) {
    heal = amount(text, healRe);
    if (heal > 0) components.push('heal');
  }

  const resolved =
    !/(coin flip pending)/.test(notes.join(' ')) &&
    !/resolve the printed (condition|amount|count)/.test(notes.join(' '));

  return {
    base,
    total,
    components,
    notes,
    bench,
    heal,
    selfDamage,
    resolved,
  };
}

// ── §D heal family helpers (pure — execution happens in attack()) ──
// Who receives the heal, from the printed text: "Defending Pokémon" →
// defender; otherwise the common "your Active Pokémon" / self form.
export function healTarget(attackText) {
  const t = String(attackText || '').toLowerCase();
  if (/(heal|remove)[^.]*defending pok[ée]mon/.test(t)) return 'defender';
  // "Heal N damage from each/all of your Pokémon" (audit B) → heals every one
  // of your Pokémon, not just the Active (Ethan's Ho-Oh / Shining Feathers).
  if (/(heal|remove)[^.]*(?:each|all) of your pok[ée]mon/.test(t)) return 'all';
  return 'attacker';
}

// How many counters a heal of `heal` removes from a Pokémon currently holding
// `current` counters. Plan only — the caller applies it to the DOM.
export function planHeal(current, heal) {
  const removed = Math.max(0, Math.min(heal, current));
  return {
    removed,
    zeroOut: removed > 0 && removed === current,
    remaining: current - removed,
  };
}

// Which benched Pokémon an attack's bench damage applies to (taxonomy §D
// bench family), given how many benched Pokémon the opponent has. Pure.
//   0 benched → null (no valid target; caller announces the fizzle)
//   1 benched → 0   (auto-apply to that Pokémon)
//   2+ benched → -1 (caller applies to the first and announces the heuristic;
//                   a picker is a separate UI concern)
export function planBenchTarget(benchCount) {
  const n = Math.max(0, Number(benchCount) || 0);
  if (n === 0) return null;
  return n === 1 ? 0 : -1;
}

// Number of cards to draw from attack text (taxonomy §D draw family).
// Matches "draw/draws N card(s)"; returns 0 when the text has no such
// clause. Pure.
export function drawCount(attackText) {
  const text = String(attackText || '');
  if (/draw\s+cards\s+until\s+you have\s+\d+\s+cards?/i.test(text)) return 0;
  const m = /draws? (\d+) cards?/i.exec(text);
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

// Draw-until target hand size (taxonomy §D draw-until family). Pure.
// Same pattern as attack-effects draw-until / trainer-effects drawUntil.
export function drawUntilTarget(attackText) {
  const m = /draw\s+cards\s+until\s+you have\s+(\d+)\s+cards?/i.exec(
    String(attackText || '')
  );
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

// Number of Energy cards to attach from attack text (taxonomy §D attach
// family). Matches "attach … Energy" clauses; an unnumbered clause attaches
// 1 (the common printed form). Returns 0 when the text has no such clause.
// Pure.
export function attachEnergyCount(attackText) {
  const m = /attach(?:es)?\b[^.;]*?(\d+)?\s*Energy/i.exec(String(attackText || ''));
  if (!m) return 0;
  return m[1] ? Math.max(1, parseInt(m[1], 10)) : 1;
}

// Whether attack text contains a "switch your Active" clause (taxonomy §D
// switch family). Matches the common printed forms: "switch your Active
// Pokémon with …", "then switch your Active", "you may switch your Active".
// Only applied to attack text (abilities are classified separately).
// Pure.
export function switchClause(attackText) {
  return /switch your (?:active|bench|pok[ée]mon)/i.test(String(attackText || ''));
}

// Whether attack text moves attached Energy to a Benched Pokémon (taxonomy §D
// move-energy family). Matches Wheel Pass: "Move an Energy from this Pokémon
// to 1 of your Benched Pokémon". Pure.
export function moveEnergyClause(attackText) {
  const text = String(attackText || '');
  return (
    /move an? energy from this pok[ée]mon/i.test(text) ||
    (/move\b[^.;]*\benergy\b/i.test(text) && /benched pok[ée]mon|your bench/i.test(text)) ||
    (/move\b[^.;]*\benergy\b/i.test(text) && /opponent's pok[ée]mon/i.test(text)) ||
    /move any amount of (?:\{[a-zA-Z]\} )?energy from your pok[ée]mon to your other pok[ée]mon/i.test(text)
  );
}

// Whether attack text reveals the opponent's hand (taxonomy §D reveal-hand
// family). Matches Silent Wing: "Your opponent reveals their hand". Pure.
export function revealHandClause(attackText) {
  return /your opponent reveal(?:s)? (?:their )?hand/i.test(String(attackText || ''));
}

// Whether attack text Knocks Out the opponent's Active when it has a Special
// Condition (taxonomy §D conditional-ko family). Matches Abyss Eye. Pure.
export function conditionalKoClause(attackText) {
  const text = String(attackText || '');
  if (
    /if your opponent's active pok[ée]mon is affected by a special condition/i.test(text) &&
    /knocked out/i.test(text)
  ) {
    return true;
  }
  if (
    /if your opponent's active pok[ée]mon is a basic pok[ée]mon/i.test(text) &&
    /knocked out/i.test(text)
  ) {
    return true;
  }
  if (
    /if your opponent's active pok[ée]mon has any special energy attached/i.test(text) &&
    /knocked out/i.test(text)
  ) {
    return true;
  }
  if (/both active pok[ée]mon are knocked out/i.test(text)) {
    return true;
  }
  if (/exactly \d+ damage counters?/.test(text) && /knocked out/i.test(text)) {
    return true;
  }
  if (/least hp remaining/.test(text) && /knocked out/i.test(text)) {
    return true;
  }
  if (/knock out 1 of your opponent's pok[ée]mon that has exactly \d+ damage counters/i.test(text)) {
    return true;
  }
  return false;
}

/** Exact damage-counter threshold for conditional KO (e.g. exactly 6 counters). */
export function exactCounterKoThreshold(attackText) {
  const m = /exactly (\d+) damage counters?/i.exec(String(attackText || ''));
  return m ? Math.max(0, parseInt(m[1], 10)) : null;
}

/** Place N damage counters on the Attacking Pokémon (redirect-damage family). */
export function redirectDamageCount(attackText) {
  const m = /place (\d+) damage counters? on the attacking pok[ée]mon/i.exec(
    String(attackText || '')
  );
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

/** Place N counters on opponent Active per card in your hand (hand-scaling). */
export function handScalingDamage(attackText) {
  const m =
    /place (\d+) damage counters? on your opponent's active pok[ée]mon for each card in your hand/i.exec(
      String(attackText || '')
    );
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

/** Put attached Energy from this Pokémon into your hand (return-energy). */
export function returnEnergyClause(attackText) {
  return /put (?:\d+|an?) [^.]*energy[^.]*attached to this pok[ée]mon into your hand/i.test(
    String(attackText || '')
  );
}

export function returnEnergyCount(attackText) {
  const text = String(attackText || '');
  const m = /put (\d+)/i.exec(text);
  if (m) return Math.max(1, parseInt(m[1], 10));
  return /put an energy/i.test(text) ? 1 : 1;
}

/** Damage ignores Weakness and Resistance (immunity family). */
export function immunityClause(attackText) {
  return /isn't affected by|is not affected by|not affected by (?:any )?(?:weakness|resistance)/i.test(
    String(attackText || '')
  );
}

/** Heal self for damage dealt this attack (mirror-heal family). */
export function mirrorHealClause(attackText) {
  return /heal from this pok[ée]mon the same amount of damage you did/i.test(
    String(attackText || '')
  );
}

/** Copy another Pokémon's attack (copy-attack family). Returns target scope or null. */
export function copyAttackScope(attackText) {
  const t = String(attackText || '').toLowerCase();
  if (
    !/choose 1 of .* attacks and use it as this attack/.test(t) &&
    !/choose an attack from .* and use it as this attack/.test(t)
  ) {
    return null;
  }
  if (/benched n's pok[ée]mon/.test(t)) return 'own-bench-ns';
  if (/opponent's active tera/.test(t)) return 'opp-active-tera';
  if (/opponent's active/.test(t)) return 'opp-active';
  if (/opponent's pok[ée]mon in play/.test(t)) return 'opp-in-play';
  return 'unknown';
}

/** Retaliate/thorns: counters on Attacking Pokémon if damaged next turn. */
export function retaliateCount(attackText) {
  const t = String(attackText || '');
  if (
    !/if this pok[ée]mon is damaged by an attack/i.test(t) ||
    !/put (\d+ )?damage counters on the attacking pok[ée]mon/i.test(t)
  ) {
    return 0;
  }
  const m = /put (\d+) damage counters/i.exec(t);
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

/** Put this Pokémon and attachments into your hand. */
export function returnSelfClause(attackText) {
  const t = String(attackText || '');
  return (
    /put this pok[ée]mon and all attached cards into your hand/i.test(t) ||
    /put 1 of your benched pok[ée]mon and all attached cards into your hand/i.test(t)
  );
}

/** Deferred damage at end of opponent's next turn. */
export function deferredDamageCount(attackText) {
  const m = /at the end of your opponent's next turn, put (\d+) damage counters/i.exec(
    String(attackText || '')
  );
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

/** Look at top N of opponent's deck. */
export function lookOpponentDeckCount(attackText) {
  const m = /look at the top (\d+) cards of your opponent's deck/i.exec(
    String(attackText || '')
  );
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

/** Look at top N of your own deck. */
export function lookOwnDeckCount(attackText) {
  const t = String(attackText || '');
  if (/opponent's deck/i.test(t)) return 0;
  const m = /look at the top (\d+) cards of your deck/i.exec(t);
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

/** Each player draws N cards. */
export function eachPlayerDrawCount(attackText) {
  const m = /each player draws (\d+) cards?/i.exec(String(attackText || ''));
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

/** Put/place damage counters on opponent Pokémon. */
export function opponentCounterClause(attackText) {
  const t = String(attackText || '');
  let m = /choose (\d+) of your opponent's pok[ée]mon and put (\d+) damage counters on each/i.exec(t);
  if (m) {
    return {
      mode: 'multi',
      targets: parseInt(m[1], 10) || 1,
      count: parseInt(m[2], 10) || 0,
    };
  }
  m = /(?:place|put) (\d+) damage counters? on your opponent's active pok[ée]mon/i.exec(t);
  if (m) return { mode: 'active', count: parseInt(m[1], 10) || 0 };
  m = /(?:place|put) (\d+) damage counters? on 1 of your opponent's pok[ée]mon/i.exec(t);
  if (m) return { mode: 'any', count: parseInt(m[1], 10) || 0 };
  m = /(?:place|put) (\d+) damage counters? on your opponent's pok[ée]mon in any way/i.exec(t);
  if (m) return { mode: 'any', count: parseInt(m[1], 10) || 0 };
  return null;
}

/** Devolve a single opponent Active if evolved. */
export function devolveActiveClause(attackText) {
  return (
    /if your opponent's active pok[ée]mon is an evolved pok[ée]mon/i.test(String(attackText || '')) &&
    /devolve it by putting/i.test(String(attackText || ''))
  );
}

/** Both Active Pokémon are Knocked Out. */
export function bothActiveKoClause(attackText) {
  return /both active pok[ée]mon are knocked out/i.test(String(attackText || ''));
}

/** KO if opponent Active has Special Energy attached. */
export function specialEnergyKoClause(attackText) {
  const t = String(attackText || '');
  return (
    /if your opponent's active pok[ée]mon has any special energy attached/i.test(t) &&
    /knocked out/i.test(t)
  );
}

/** Next-turn named attack bonus (Echoed Voice, Meteor Mash, …). */
export function nextTurnBonusClause(attackText) {
  const m =
    /during your next turn, this pok[ée]mon's ([^.]+?) attack does (\d+) more damage/i.exec(
      String(attackText || '')
    );
  if (!m) return null;
  return { attackName: m[1].trim(), bonus: parseInt(m[2], 10) || 0 };
}

/** Devolve each opponent evolved Pokémon. */
export function devolveOpponentClause(attackText) {
  return /devolve each of your opponent's evolved pok[ée]mon/i.test(String(attackText || ''));
}

/** Recovers from all Special Conditions. */
export function recoverAllStatusClause(attackText) {
  return /recovers from all special conditions/i.test(String(attackText || ''));
}

/** Remaining HP cap for damage placement. */
export function hpCapRemaining(attackText) {
  const m = /until its remaining hp is (\d+)/i.exec(String(attackText || ''));
  return m ? Math.max(0, parseInt(m[1], 10)) : null;
}

/** Return opponent Active Energy to their hand. */
export function returnOpponentEnergyClause(attackText) {
  return /put .* energy attached to your opponent's active pok[ée]mon into their hand/i.test(
    String(attackText || '')
  );
}

export function returnOpponentEnergyCount(attackText) {
  const m = /put (\d+) energy/i.exec(String(attackText || ''));
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

/** Bench exact-counter KO threshold. */
export function benchExactKoThreshold(attackText) {
  const m =
    /knock out 1 of your opponent's pok[ée]mon that has exactly (\d+) damage counters/i.exec(
      String(attackText || '')
    );
  return m ? Math.max(0, parseInt(m[1], 10)) : null;
}

/** Whether attack text carries a "Once during your turn" clause (taxonomy §D
 * once-per-turn family). Matches the common printed forms: "Once during your
 * turn: …", "Once during your turn, you may …". Only applied to attack text;
 * ability-side once-per-turn tracking is handled by the rules-state flag map.
 * Pure.
 */
export function oncePerTurnClause(attackText) {
  return /once during your turn/i.test(String(attackText || ''));
}

// Per-Pokémon damage dealt to ALL of the opponent's Benched Pokémon
// (taxonomy §D multi-target family). Matches the common printed forms:
// "Do 10 damage to each of your opponent's Benched Pokémon", "20 damage to
// all of your opponent's Benched Pokémon", "…to every one of your opponent's
// Benched Pokémon". Returns 0 when the text has no such clause OR the clause
// is unnumbered (caller announces the fizzle rather than guessing an amount).
// Pure.
export function allBenchDamage(attackText) {
  const text = String(attackText || '');
  if (!/to (?:each|every|all)\b[^.;]*benched pok[ée]mon/i.test(text)) return 0;
  const m = /(\d+)\s*damage\s+to\s+(?:each|every|all)\b/i.exec(text);
  return m ? Math.max(0, parseInt(m[1], 10)) : 0;
}

// Parse a printed "discard Energy to scale damage" clause
// (taxonomy §D damage-scaling family, distinct from the fixed discard-cost
// family): the discard amount is a *choice* ("up to N") and the damage
// scales with what was actually discarded. Returns { max: N } or null.
// e.g. Mega Diancie ex / Garland Ray: "Discard up to 2 Energy cards from
// this Pokémon, and this attack does 120 damage for each card you
// discarded in this way." Pure.
export function discardEnergyScaling(attackText) {
  const text = String(attackText || '');
  const each = /for each card you discard(ed)?/i.test(text);
  const discard = /discard\s+(?:up\s+to\s+)?(\d+\s+)?Energy\s+cards?\s+from\s+this\s+Pok[ée]mon/i.exec(text);
  if (!each || !discard) return null;
  const max = discard[1] ? Math.max(0, parseInt(discard[1], 10)) : 1;
  return { max };
}

// Parse a printed discard-cost clause (taxonomy §D discard-cost family).
// Returns { energy, hand } counts (0 when absent):
//   energy: Energy cards to discard from the Active Pokémon
//     ("discard an Energy card", "discard 2 Energy cards from this Pokémon")
//   hand:   cards to discard from your hand ("discard 2 cards from your hand")
// An unnumbered clause counts as 1 (the common printed form). Pure.
export function discardCost(attackText) {
  const text = String(attackText || '');
  const has = (re) => re.test(text);
  const firstNum = (re) => {
    const m = re.exec(text);
    return m && m[1] ? parseInt(m[1], 10) || 1 : 1;
  };
  const energyRe = /discard(?:s|ing)?\s+(?:a|an|\d+)\s+Energy/i;
  const handRe = /discard(?:s|ing)?\s+(?:a|an|\d+)\s+cards?\s+from\s+your\s+hand/i;
  return {
    energy: has(energyRe) ? firstNum(/discard(?:s|ing)?\s+(\d+)\s+Energy/i) : 0,
    hand: has(handRe) ? firstNum(/discard(?:s|ing)?\s+(\d+)\s+cards?\s+from\s+your\s+hand/i) : 0,
  };
}

// Parse a printed shuffle-cost clause (taxonomy §D shuffle-cost family):
// "shuffle your hand into your deck, then draw N cards". An unnumbered
// clause counts as drawing 1 (consistent with the discardCost convention).
// Returns { draw: N } with N = 0 when the text has no such clause. Pure.
export function shuffleDrawClause(attackText) {
  const text = String(attackText || '');
  if (!/shuffle\s+(?:your\s+)?hand\s+into\s+(?:your\s+|the\s+)?deck/i.test(text)) {
    return { draw: 0 };
  }
  const m = /draw\s+(?:up\s+to\s+)?(\d+)?\s+cards?/i.exec(text);
  return { draw: m && m[1] ? Math.max(0, parseInt(m[1], 10)) : 1 };
}

// Parse a deck-search clause from attack text (Call for Family, Flock, …).
// Returns { what, count, destination } or null when absent. Pure.
export function parseAttackSearchClause(attackText) {
  const text = String(attackText || '');
  if (!/search your deck for/i.test(text)) return null;
  return parseSearchDeckParams(lower(text));
}

// Resolve printed attack effect text from the attack object or its parent card.
// Board cards sometimes carry stub attacks (name/cost/damage) before enrichment
// fills `text` — always read through this before text-driven attack logic.
export function resolveAttackText(card, attack) {
  if (!attack) return '';
  const direct = attack.text || attack.effect || '';
  if (direct) return direct;
  const match = card?.attacks?.find((a) => a?.name && a.name === attack.name);
  return match?.text || match?.effect || '';
}

// One-line human summary of the parsed damage (for announcements).
export function describeParsedDamage(attack, attacker = {}, defender = {}, ctx = {}) {
  const parsed = parseAttackDamage(attack, attacker, defender, ctx);
  const name = attacker?.name || attack?.name || 'This attack';
  const parts = [`${name}: base ${parsed.base} → effective ${parsed.total} (before weakness/resistance)`];
  for (const note of parsed.notes) parts.push(note);
  if (parsed.bench > 0) parts.push(`${parsed.bench} available on a benched Pokémon`);
  if (parsed.heal > 0) parts.push(`removes up to ${parsed.heal} damage counters`);
  if (parsed.selfDamage > 0) parts.push(`${parsed.selfDamage} to itself`);
  if (!parsed.resolved) parts.push('not fully resolved yet');
  return parts.join('; ');
}
