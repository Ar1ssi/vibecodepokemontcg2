/**
 * @file Pure planners for ability-triggered effects (design 034 slice 4).
 *
 * These read in-play Pokémon on both sides and return plain effect descriptors
 * the reduce hooks run at the exact trigger sites: Pokémon Checkup, end of turn,
 * opponent-evolves, on-damage (thorns) and between-turns. Every reader filters
 * to Pokémon roots, skips Ancient Traits (D72) and skips holders whose Abilities
 * are suppressed (`isAbilitySuppressed`, design 034 slice 3), so a suppressed
 * holder never contributes a trigger.
 *
 * Dependency note (D125): this module may import `ability-combat.mjs` and
 * `tool-combat.mjs`; nothing those import may reach back here.
 *
 * Entries are `{ card, playerId, zone }` in-play roots. `ctx` is the
 * `abilitySideContext` shape used by `ability-combat.mjs`
 * (`sideCards`/`opponentSideCards`/`sideActive`/`sideBench`/…); holder-position
 * conditions fail closed when the context cannot say where the holder sits.
 */

import { isPokemon, isBasicPokemon } from '../cards.mjs';
import {
  cardAbilityText,
  parseOnOpponentEvolve,
  parseThorns,
} from './ability-executors.mjs';
import { parseAbility, isAncientTraitAbility } from './abilities.mjs';
import { isAbilitySuppressed, abilityPlayLocks, selfNamedText } from './ability-combat.mjs';
import { isAbilityCard } from './ability-effects.mjs';
import { hasCondition } from './special-conditions.mjs';
import { attackerTypes, TYPE_LETTER } from './tool-combat.mjs';
import { resolveAttachedEnergyType } from './energy-effects.mjs';
import { isBasicEnergy, isExCard } from './card-classify.mjs';

const lower = (v) => String(v ?? '').toLowerCase();

/** In-play Pokémon roots from a zone-card array. */
export function inPlayEntries(state) {
  const out = [];
  for (const playerId of Object.keys(state?.players || {})) {
    const zones = state.players[playerId]?.zones || {};
    for (const zone of ['active', 'bench']) {
      for (const card of zones[zone] || []) {
        if (card && !card.attachedTo && isPokemon(card)) {
          out.push({ card, playerId, zone });
        }
      }
    }
  }
  return out;
}

function holderCanTrigger(card, ctx) {
  if (!card || !isPokemon(card)) return false;
  if (isAncientTraitAbility(card)) return false;
  if (isAbilitySuppressed(card, ctx)) return false;
  return true;
}

/** True when `card` is in the Active Spot of whichever side the ctx places it. */
function holderIsActive(card, ctx) {
  const onSide =
    (ctx.sideActive || []).includes(card) ||
    (ctx.sideBench || []).includes(card);
  const active = onSide ? ctx.sideActive : ctx.opponentActive;
  return (active || []).includes(card);
}

const CONDITION_WORDS = [
  ['poisoned', 'Poisoned'],
  ['burned', 'Burned'],
  ['asleep', 'Asleep'],
  ['confused', 'Confused'],
];

/**
 * Normalize a Checkup-damage wording: base counters, "N more", the condition
 * and type/basic/Ability target filters, the scope (own/opponent/both) and the
 * holder-Active gate.
 */
const HOLDER_ACTIVE_CLAUSE =
  /(?:if|as long as) this pok[eé]mon is (?:in the active spot|your active pok[eé]mon)/;

function normalizeCheckup(text) {
  const m = text.match(/put\s+(\d+)\s+(more\s+)?damage/);
  // "put 4 damage counters … instead of 2" (Pyroar) replaces the condition's own counters, which
  // Checkup already puts: the ability adds the difference.
  const instead = text.match(/instead of (\d+)/);
  const printed = m ? Number(m[1]) : 0;
  const count = instead ? Math.max(0, printed - Number(instead[1])) : printed;
  const more = Boolean(m && m[2]) || Boolean(instead);
  let condition = null;
  for (const [word, label] of CONDITION_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(text)) {
      condition = label;
      break;
    }
  }
  const basic = /\bbasic pok[eé]mon\b/.test(text);
  const typeMatch = text.match(/\{([a-z])\}\s*pok[eé]mon/);
  const type = typeMatch ? lower(TYPE_LETTER[typeMatch[1]]) : null;
  const holderActive = HOLDER_ACTIVE_CLAUSE.test(text);
  const targetActive = /your opponent's active pok[eé]mon/.test(text);
  const both = /\(both yours and your opponent's\)/.test(text);
  const opponent = /your opponent's/.test(text);
  const scope = both ? 'both' : opponent ? 'opponent' : 'own';
  const hasAbility = /has an ability|with an ability/.test(text);
  const exceptName =
    text.match(/except any ([^.,]+)/)?.[1]?.trim().toLowerCase() || null;
  return {
    count,
    more,
    condition,
    basic,
    type,
    holderActive,
    targetActive,
    scope,
    hasAbility,
    exceptName,
  };
}

function resolveCheckupTargets(effect, entries, holderPlayerId) {
  let pool = entries.filter((e) => e.card && isPokemon(e.card));
  if (effect.scope === 'opponent') {
    pool = pool.filter((e) => e.playerId !== holderPlayerId);
  } else if (effect.scope === 'own') {
    pool = pool.filter((e) => e.playerId === holderPlayerId);
  }
  if (effect.targetActive) pool = pool.filter((e) => e.zone === 'active');
  if (effect.bench) pool = pool.filter((e) => e.zone === 'bench');
  if (effect.condition) {
    pool = pool.filter((e) => hasCondition(e.card, effect.condition));
  }
  if (effect.basic) pool = pool.filter((e) => isBasicPokemon(e.card));
  if (effect.type) {
    pool = pool.filter((e) => attackerTypes(e.card).includes(effect.type));
  }
  if (effect.hasAbility) pool = pool.filter((e) => isAbilityCard(e.card));
  if (effect.exceptEx) pool = pool.filter((e) => !isExCard(e.card));
  if (effect.exceptName) {
    pool = pool.filter((e) => !lower(e.card.name).includes(effect.exceptName));
  }
  return pool.map((e) => ({ card: e.card, playerId: e.playerId }));
}

/**
 * Pokémon Checkup damage abilities (Froslass Freezing Shroud, Magmortar Magma
 * Surge, Pecharunt Toxic Subjugation, Team Rocket's Tyranitar Sand Stream,
 * Trevenant Forest Miasma). Returns `{ holder, playerId, source, count, more,
 * targets }`; `more` means "add to the condition damage Checkup already deals".
 */
export function parseCheckupAbilities(entries = [], ctx = {}) {
  const out = [];
  for (const entry of entries) {
    const { card, playerId } = entry;
    if (!holderCanTrigger(card, ctx)) continue;
    const text = cardAbilityText(card);
    if (!text || !/checkup/.test(text) || !/damage counter/.test(text)) continue;
    if (!parseAbility(text).some((s) => s.type === 'checkupAbility')) continue;
    const effect = normalizeCheckup(text);
    if (!(effect.count > 0)) continue;
    // "as long as Pecharunt is your Active Pokémon": the printed name is the holder.
    effect.holderActive ||= HOLDER_ACTIVE_CLAUSE.test(selfNamedText(card));
    if (effect.holderActive && !holderIsActive(card, ctx)) continue;
    const targets = resolveCheckupTargets(effect, entries, playerId);
    if (targets.length === 0) continue;
    out.push({
      holder: card,
      playerId,
      source: card.name,
      ...effect,
      targets,
    });
  }
  return out;
}

/**
 * "Whenever your opponent plays a Pokémon from their hand to evolve 1 of their
 * Pokémon, put N damage counters on that Pokémon" (Team Rocket's Ampharos Darkest
 * Impulse). Non-stacking: one effect per source name.
 */
export function parseOnOpponentEvolveAbilities(entries = [], ctx = {}) {
  const out = [];
  const seen = new Set();
  for (const entry of entries) {
    const { card, playerId } = entry;
    if (!holderCanTrigger(card, ctx)) continue;
    const text = cardAbilityText(card);
    if (!text) continue;
    if (!parseAbility(text).some((s) => s.type === 'onOpponentEvolveAbility')) {
      continue;
    }
    const { count } = parseOnOpponentEvolve(card);
    if (!(count > 0)) continue;
    const key = lower(card.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ holder: card, playerId, count, source: card.name });
  }
  return out;
}

/**
 * On-damage thorns (damage to the Attacking Pokémon). Returns the parsed thorns
 * when the holder's Ability is live, `{ count: 0, zone }` otherwise; an
 * Active-Spot-only wording is inert when the holder is not the Active.
 */
export function parseOnDamageAbilities(holder, ctx = {}) {
  if (!holderCanTrigger(holder, ctx)) return { count: 0, zone: 'any' };
  const thorns = parseThorns(holder);
  if (!thorns || !(thorns.count > 0)) return { count: 0, zone: 'any' };
  if (thorns.zone === 'active' && ctx.isActive === false) {
    return { count: 0, zone: thorns.zone };
  }
  return thorns;
}

// "If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon
// (even if this Pokémon is Knocked Out), [flip a coin. If heads,] the Attacking Pokémon is now
// Poisoned [and …]." The whole clause must match: any other condition (a Pokémon-GX attacker,
// Energy attached) fails closed. Old printings say "the Defending Pokémon" for the attacker.
const STATUS_WORD = '(asleep|burned|confused|paralyzed|poisoned)';
const ON_DAMAGE_STATUS = new RegExp(
  "(?:^|\\.\\s)if this pokémon (?:is in the active spot|is your active pokémon) and is damaged by " +
    "(?:an attack from your opponent's pokémon|an opponent's attack) " +
    '\\(even if (?:this pokémon|it) is knocked out\\), (flip a coin\\. if heads, )?' +
    `(?:this |the )(?:attacking|defending) pokémon is now ${STATUS_WORD}(?: and ${STATUS_WORD})?\\.`
);
const capitalised = (word) => word[0].toUpperCase() + word.slice(1);

/**
 * On-damage Special Conditions for the Attacking Pokémon (Qwilfish, Numel, Venomoth, …):
 * `{ conditions, coin }`, or null when the holder's Ability is not live or its wording is not
 * this exact trigger. Every printing is Active-only, and the reduce hook runs for the Active.
 */
export function parseOnDamageStatus(holder, ctx = {}) {
  if (!holderCanTrigger(holder, ctx)) return null;
  const text = selfNamedText(holder).replace(/’/g, "'");
  const m = text.match(ON_DAMAGE_STATUS);
  if (!m) return null;
  return {
    conditions: [m[2], m[3]].filter(Boolean).map(capitalised),
    coin: Boolean(m[1]),
    source: holder.name,
  };
}

// Energy-attach triggers. Self: "when(ever) you attach a [Basic] [{W}] Energy card from your hand
// to this Pokémon [during your turn], <effect>." Team: "as long as this Pokémon is in the Active
// Spot / your Active Pokémon, whenever you attach an Energy card from your hand to 1 of your
// Pokémon, <effect> from that Pokémon." Effects: recover from all Special Conditions, heal N,
// remove N / all damage counters. Any other wording, or a Poké-Power with printed stop
// conditions, fails closed.
const ATTACH_SELF = new RegExp(
  "(?:^|\\.\\s)when(?:ever)? you attach an? (basic )?(?:\\{([a-z])\\} )?(basic )?energy card from your hand " +
    "to this pokémon(?: during your turn)?, ([^.]+)\\.(?:\\s|$)"
);
const ATTACH_TEAM = new RegExp(
  "(?:^|\\.\\s)as long as this pokémon is (?:in the active spot|your active pokémon), whenever you attach " +
    "an energy card from your hand to 1 of your pokémon, ([^.]+) from that pokémon\\.(?:\\s|$)"
);
const SELF_REF = "(?:it|this pokémon)";

function attachEffect(clause, ref) {
  const recover = new RegExp(
    `^(?:${ref} recovers from all special conditions|remove all special conditions (?:from|affecting) ${ref})$`
  );
  if (recover.test(clause)) return { recover: true, heal: 0 };
  const heal = clause.match(new RegExp(`^heal (\\d+) damage from ${ref}$`));
  if (heal) return { recover: false, heal: Number(heal[1]) };
  const counters = clause.match(
    new RegExp(`^remove (all special conditions and )?(\\d+|a|an|all) damage counters? from ${ref}(?:, if it has any)?$`)
  );
  if (!counters) return null;
  const n = counters[2] === 'all' ? Infinity : /^an?$/.test(counters[2]) ? 1 : Number(counters[2]);
  return { recover: Boolean(counters[1]), heal: n * 10 };
}

/**
 * The effects an Energy attached from the hand to `host` triggers (`ctx` is the attaching
 * player's `abilitySideContext`): `[{ target, recover, heal, source }]`, `heal` in damage
 * (Infinity = all). Self triggers come from the host; team triggers from the Active.
 */
export function parseOnEnergyAttachAbilities(host, energy, ctx = {}) {
  const out = [];
  if (!host || !energy) return out;
  const energyType = lower(resolveAttachedEnergyType(energy));
  const holders = [host, ...(ctx.sideActive || []).filter((c) => c && !c.attachedTo && c !== host)];
  for (const holder of holders) {
    if (!holderCanTrigger(holder, ctx)) continue;
    const text = selfNamedText(holder).replace(/’/g, "'");
    if (/this power (?:stops working|can't be used)/.test(text)) continue;
    const self = holder === host ? text.match(ATTACH_SELF) : null;
    if (self) {
      const typeOk = !self[2] || TYPE_LETTER[self[2]] === energyType;
      const basicOk = !(self[1] || self[3]) || isBasicEnergy(energy);
      const effect = typeOk && basicOk ? attachEffect(self[4], SELF_REF) : null;
      if (effect) out.push({ target: host, ...effect, source: holder.name });
    }
    const team = holderIsActive(holder, ctx) ? text.match(ATTACH_TEAM) : null;
    if (team) {
      const effect = attachEffect(`${team[1]} from that pokémon`, 'that pokémon');
      if (effect) out.push({ target: host, ...effect, source: holder.name });
    }
  }
  return out;
}

/**
 * Mandatory end-of-turn effects (Great Tusk ex Quaking Demolition: "if this
 * Pokémon is in the Active Spot, you must discard the top 5 cards of your
 * deck"). Optional end-of-turn abilities are activated through useAbility, not
 * this hook. Returns `{ holder, playerId, kind: 'discardTop', n }`.
 */
export function parseEndOfTurnAbilities(entries = [], ctx = {}) {
  const out = [];
  for (const entry of entries) {
    const { card, playerId } = entry;
    if (!holderCanTrigger(card, ctx)) continue;
    const text = cardAbilityText(card);
    if (!text || !/end of your turn/.test(text)) continue;
    const discard = text.match(/discard the top (\d+) cards? of your deck/);
    if (!discard) continue;
    if (/in the active spot/.test(text) && !holderIsActive(card, ctx)) continue;
    out.push({
      holder: card,
      playerId,
      kind: 'discardTop',
      n: Number(discard[1]) || 0,
      source: card.name,
    });
  }
  return out;
}

/**
 * "In between turns" ability effects (I163): the pre-Checkup wording family.
 * Returns typed descriptors the Checkup hook runs:
 *   { kind: 'damage', count, more, insteadOf, scope, targetActive, bench, condition, basic, type, exceptEx }
 *   { kind: 'heal', amount, scope: 'holder'|'own'|'opponent'|'both', bench?, exceptEx? }
 *   { kind: 'sleepFlips', flips }
 * A holder clause ("as long as X is your Active Pokémon", "if this Pokémon remains
 * Asleep") gates the effect; any wording the parser cannot resolve is dropped.
 */
export function parseBetweenTurnsAbilities(entries = [], ctx = {}) {
  const out = [];
  for (const entry of entries) {
    const { card, playerId } = entry;
    if (!holderCanTrigger(card, ctx)) continue;
    const text = cardAbilityText(card);
    if (!text) continue;
    const isBetweenTurns = /between turns/.test(text);
    const isCheckup = /during pok[eé]mon checkup/.test(text);
    if (!isBetweenTurns && !isCheckup) continue;
    const named = selfNamedText(card);
    const holderActive = HOLDER_ACTIVE_CLAUSE.test(named);
    if (holderActive && !holderIsActive(card, ctx)) continue;

    // "If this Pokémon is Asleep, flip 2 coins instead of 1 between turns."
    const flips = text.match(/flip (\d+) coins? instead of (\d+)/);
    if (flips && /asleep/.test(text)) {
      out.push({
        holder: card,
        playerId,
        source: card.name,
        kind: 'sleepFlips',
        flips: Number(flips[1]) || 2,
      });
      continue;
    }
    // Modern Checkup damage belongs to parseCheckupAbilities; this reader owns the
    // pre-Checkup "between turns" wording only.
    if (!isBetweenTurns) continue;

    // "heal N damage from …" / "remove N damage counter(s) from …".
    const heal =
      text.match(/heal (\d+) damage from ([^.]*)/) ||
      text.match(/remove (\d+) damage counters? from ([^.]*)/);
    if (heal) {
      const amount = /^heal/.test(heal[0]) ? Number(heal[1]) : (Number(heal[1]) || 0) * 10;
      const target = betweenTurnsHealTarget(heal[2], card);
      if (amount > 0 && target) {
        out.push({ holder: card, playerId, source: card.name, kind: 'heal', amount, ...target });
      }
      continue;
    }

    // "Put N [more] damage counters …" — spreads and condition-damage modifiers.
    const put = text.match(
      /put\s+(\d+)\s+(more\s+)?damage counters?\s*(?:instead of \d+\s+)?(?:on|to)\s+([^.]*)/
    );
    if (!put) continue;
    // "as long as X remains Asleep" is the HOLDER's condition, not a target filter.
    const holderCondition = /remains asleep/.test(named) ? 'Asleep' : null;
    if (holderCondition && !hasCondition(card, holderCondition)) continue;
    const target = betweenTurnsDamageTarget(put[3]);
    if (!target) continue;
    const instead = text.match(/instead of (\d+)/);
    const printed = Number(put[1]) || 0;
    out.push({
      holder: card,
      playerId,
      source: card.name,
      kind: 'damage',
      // "put 6 damage counters instead of 2" replaces the condition's own 2, so the
      // ability contributes the difference (normalizeCheckup's rule).
      count: instead ? Math.max(0, printed - Number(instead[1])) : printed,
      more: Boolean(put[2]) || Boolean(instead),
      insteadOf: instead ? Number(instead[1]) : null,
      ...target,
    });
  }
  return out;
}

// Target phrase of a between-turns damage clause. Null when the scope cannot be read.
function betweenTurnsDamageTarget(clause) {
  const t = lower(clause);
  const scope = /both yours and your opponent's|each player's/.test(t)
    ? 'both'
    : /your opponent's/.test(t)
      ? 'opponent'
      : /your (?:benched )?pok[eé]mon/.test(t)
        ? 'own'
        : null;
  if (!scope) return null;
  const condition =
    CONDITION_WORDS.find(([word]) => new RegExp(`\\b${word}\\b`).test(t))?.[1] || null;
  const typeMatch = t.match(/\{([a-z])\}/);
  return {
    scope,
    targetActive: /active pok[eé]mon|defending pok[eé]mon/.test(t),
    bench: /benched/.test(t),
    condition,
    basic: /\bbasic pok[eé]mon\b/.test(t),
    type: typeMatch ? lower(TYPE_LETTER[typeMatch[1]]) : null,
    exceptEx: /excluding pok[eé]mon-ex/.test(t),
  };
}

// Target phrase of a between-turns heal clause. Null when the scope cannot be read.
function betweenTurnsHealTarget(clause, holder) {
  const t = lower(clause);
  const holderName = lower(holder?.name);
  if (/this pok[eé]mon|itself/.test(t) || (holderName && t.includes(holderName))) {
    return { scope: 'holder' };
  }
  const scope = /both yours and your opponent's/.test(t)
    ? 'both'
    : /your opponent's/.test(t)
      ? 'opponent'
      : /your (?:benched )?pok[eé]mon/.test(t)
        ? 'own'
        : null;
  if (!scope) return null;
  return { scope, bench: /benched/.test(t), exceptEx: /excluding pok[eé]mon-ex/.test(t) };
}

/**
 * Resolve a between-turns descriptor to `{ card, playerId }[]`. Damage effects
 * filter by the condition/basic/type/position the clause printed; heals by the
 * holder's side and position. Exported for the Checkup hook (I163).
 */
export function resolveBetweenTurnsTargets(effect, entries, holderPlayerId) {
  if (effect.kind === 'heal' && effect.scope === 'holder') {
    return [{ card: effect.holder, playerId: holderPlayerId }];
  }
  return resolveCheckupTargets(effect, entries, holderPlayerId);
}

/**
 * On-Knockout energy moves (Miraidon Photon Cord, Raichu Electrical Grounding,
 * Veluza Fillet Memento). Reader only: moving Energy needs a target choice and
 * belongs to the executor batches (slice 5/6); the parsed step is returned so
 * the KO path can announce it without guessing.
 */
export function parseOnKoAbilities(entries = [], ctx = {}) {
  const out = [];
  for (const entry of entries) {
    const { card, playerId } = entry;
    if (!holderCanTrigger(card, ctx)) continue;
    const text = cardAbilityText(card);
    if (!text) continue;
    const step = parseAbility(text).find((s) => s.type === 'energyOnKoAbility');
    if (!step) continue;
    const move = text.match(
      /move\s+(?:up to\s+(\d+)\s+)?(?:(?:a|an|\d+)\s+)?(?:basic\s+)?(?:\{([a-z])\}\s*)?energy/
    );
    out.push({
      holder: card,
      playerId,
      source: card.name,
      basic: Boolean(step.basic),
      upTo: step.upTo ? Number(step.upTo) : move?.[1] ? Number(move[1]) : null,
      // Printed Energy symbol ({L} → 'lightning'), or null for "any Energy".
      energyType: move?.[2] ? TYPE_LETTER[move[2]] || null : null,
      // 'bench' = "move … to 1 of your Benched Pokémon"; 'holder' = "to this Pokémon".
      targetKind: /benched/.test(text) ? 'bench' : 'holder',
      // True when the holder is itself the Pokémon that must be Knocked Out.
      selfSource: /this pok[eé]mon is in the active spot and is knocked out/.test(
        text
      ),
      activeOnly: /in the active spot/.test(text),
    });
  }
  return out;
}

/**
 * Bench→Active promotion triggers (Cobalion ex Metal Road, Iron Valiant ex
 * Tachyon Bits, …). Reader for the on-promotion window; the effect itself runs
 * through the ability templates once the window is legal (slice 4 enforces the
 * window, `abilityActivationBlockReason`).
 */
export function parseOnPromotionAbilities(entries = [], ctx = {}) {
  const out = [];
  for (const entry of entries) {
    const { card, playerId } = entry;
    if (!holderCanTrigger(card, ctx)) continue;
    const text = cardAbilityText(card);
    if (!text) continue;
    const step = parseAbility(text).find((s) => s.type === 'onPromotionAbility');
    if (!step) continue;
    out.push({
      holder: card,
      playerId,
      source: card.name,
      effect: step.effect,
      count: step.count ?? null,
    });
  }
  return out;
}

/**
 * Ability play locks (thin re-export of `abilityPlayLocks` under the slice-4
 * naming contract, so trigger consumers have one import for play locks).
 */
export function parsePlayLocks(card, ctx = {}) {
  return abilityPlayLocks(card, ctx);
}
