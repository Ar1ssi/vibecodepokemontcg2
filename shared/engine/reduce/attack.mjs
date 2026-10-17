/**
 * @file Attack declaration: attack coin flips, Ninja Trick, the declared and copied attack flows,
 * granted/borrowed attacks (attackViewFor, attackExtrasFor), GX/VSTAR spend, and the `attack`
 * command. Split out of reduce.mjs (design 073 B, I250); reduce.mjs stays the public entry.
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { isEnergy, isPokemon } from '../cards.mjs';
import { flipCoin } from '../rng.mjs';
import { isGxAttack, isVstarPowerAttack } from '../rules/damage-parser.mjs';
import {
  attachedLegacyTrainers, hasAttachedTrainerEffect,
} from '../rules/legacy-attached-trainer.mjs';
import { countUnit, normalizeUnit } from '../rules/scaling-count.mjs';
import { buildServerAttackContext } from '../rules/attack-damage-context.mjs';
import { parseGrantedAttacks } from '../rules/tool-attacks.mjs';
import { attachedTools, isTeraCard } from '../rules/tool-combat.mjs';
import {
  isAbilitySuppressed, abilityAttackFlipGate, abilityVictoryStar,
} from '../rules/ability-combat.mjs';
import { createPendingChoice } from '../effects/executor.mjs';
import { replaceSelfName } from '../rules/attack-text.mjs';
import { parseAttackUseGate, attackConditionMet } from '../rules/attack-conditions.mjs';
import {
  parseCopyAttack, inCopyGroup, copiedAttackFor, parseAttackBorrowAbility, parseAttackGrant,
} from '../rules/attack-copy.mjs';
import {
  isStadiumToolNegation, isStadiumGlimwoodReFlip, stadiumExtraAttacks, mergeAttacks,
} from '../rules/stadium-effects.mjs';
import { isRuleBoxPokemon } from '../rules/card-classify.mjs';
import { priorEvolutionCards, topPokemonCard } from '../rules/evolved-pokemon.mjs';
import { normalizeStage } from '../rules/evolution.mjs';
import { isBabyPokemon } from '../rules/baby-rule.mjs';
import { clearConditions, listConditions } from '../rules/special-conditions.mjs';
import {
  benchTargets, activeAttackMarkers, inPlayView, cardText, ensureOncePerGame, isGameConcluded,
  abilitySideContext, shuffleDeckWithRng, rootsIn,
} from './shared.mjs';
import { onceAttackBlockReason, resolveAttacker, attackCostPayable } from './legality.mjs';
import { resolveAttackEffectPhase } from './attack-effect.mjs';
import { handleKnockout } from './knockout.mjs';
import { resolveCheckup, advanceTurn } from './turn.mjs';

/**
 * Coin flips an attack's own printed text calls for, rolled from the command's RNG so a
 * replay reproduces them (design 002 catch-up). "Flip a coin" is one flip; "Flip N coins"
 * plus a "for each heads" clause is N flips whose heads are counted for damage scaling.
 *
 * @returns {{ coin: 'heads'|'tails'|null, headsCount: number|undefined, flips: string[] }}
 */
export function flipAttackCoins(attack, rng, countOf = null) {
  const text = String(attack?.text || '').toLowerCase();
  const flip = () => flipCoin(rng);
  // Electivire Discharge / Arcanine Fire Blow: the coins follow the discard (discardFlipHeads).
  if (/flip (?:a coin for each|a number of coins equal to the number of) [^.]*you discarded/.test(text)) {
    return { coin: null, headsCount: 0, flips: [] };
  }

  // "Flip a coin for each Energy attached to this Pokémon" / "Flip a number of coins equal to
  // the number of damage counters on the Defending Pokémon": the board sets the count. A unit
  // the counter cannot read falls through to the fixed wordings below.
  const dynamic =
    /flip a coin for each ([^.]+)\./.exec(text) ||
    /flip a number of coins equal to the (?:number|amount) of ([^.]+)\./.exec(text);
  const dynamicCount = dynamic && countOf ? countOf(dynamic[1]) : null;
  if (typeof dynamicCount === 'number') {
    const flips = Array.from({ length: Math.min(Math.max(dynamicCount, 0), 20) }, flip);
    const headsCount = flips.filter((f) => f === 'heads').length;
    return { coin: flips.length === 1 ? flips[0] : null, headsCount, flips };
  }

  const multi = text.match(/flip (\d+) coins?/);
  if (multi) {
    const requested = Number.parseInt(multi[1], 10);
    // A printed count is always small; cap it so a malformed text cannot spin the RNG.
    const count = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 0), 20)
      : 0;
    const flips = Array.from({ length: count }, flip);
    const headsCount = flips.filter((f) => f === 'heads').length;
    return {
      coin:
        count === 1
          ? flips[0]
          : headsCount === count
            ? 'heads'
            : headsCount === 0
              ? 'tails'
              : null,
      headsCount,
      flips,
    };
  }
  // "Flip a coin until you get tails": every flip but the last is heads. No single face, so
  // only "for each heads" clauses read it. Capped like the printed count above.
  if (/flip a coin until you get tails/.test(text)) {
    const flips = [];
    while (flips.length < 20) {
      flips.push(flip());
      if (flips[flips.length - 1] === 'tails') break;
    }
    return { coin: null, headsCount: flips.filter((f) => f === 'heads').length, flips };
  }
  if (/flip a coin/.test(text)) {
    const coin = flip();
    return { coin, headsCount: coin === 'heads' ? 1 : 0, flips: [coin] };
  }
  return { coin: null, headsCount: undefined, flips: [] };
}

/**
 * A board count for a dynamic coin wording ("for each Energy attached to this Pokémon"): reads
 * the attacker and the Defending Pokémon (the chosen target when there is one). The ctx is
 * built only when the attack prints such a wording.
 */
export function coinCountReader(draft, { playerId, attacker, attackerView, targetInstanceId = null }) {
  let built = null;
  return (unit) => {
    if (!built) {
      const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
      const target = targetInstanceId != null ? findCard(draft, targetInstanceId) : null;
      const defender = target?.card || draft.players[oppId]?.zones?.active?.find((c) => !c.attachedTo) || null;
      built = buildServerAttackContext(draft, {
        attackerPlayerId: playerId,
        defenderPlayerId: target?.playerId || oppId,
        attacker,
        defender,
        attackerView,
        defenderView: defender ? inPlayView(draft, defender) : null,
      });
    }
    return countUnit(normalizeUnit(unit, attackerView?.name || attacker?.name), built)?.count ?? null;
  };
}

export const NINJA_TRICK_EFFECT = 'ninjaTrick';

/**
 * Koga's Ninja Trick (gym2-115): "When your opponent attacks, you may switch this Pokémon with 1
 * of your Benched Pokémon (before damage or other effects of attacks)." The defending player
 * chooses (none = keep) before the attack resolves; returns true when the attack suspended.
 */
function offerNinjaTrick(draft, declared) {
  const { oppId, playerId, attacker, attack, atkIdx, targetInstanceId } = declared;
  const side = draft.players[oppId];
  const active = (side?.zones?.active || []).find((c) => !c.attachedTo);
  if (!active || !hasAttachedTrainerEffect(side.zones.active, active, 'switchWhenAttacked')) return false;
  const bench = benchTargets(side);
  if (bench.length === 0) return false;
  draft.pendingChoice = createPendingChoice({
    player: oppId,
    source: 'trainer',
    prompt: `${attack.name}: Koga's Ninja Trick lets you switch ${inPlayView(draft, active)?.name || 'your Active Pokémon'} with 1 of your Benched Pokémon first (choose none to stay).`,
    options: bench,
    min: 0,
    max: 1,
    resumeToken: {
      effectType: NINJA_TRICK_EFFECT,
      initiatorPlayerId: playerId,
      attackerId: attacker?.instanceId ?? null,
      attackIndex: atkIdx,
      switchedOutId: active.instanceId,
      targetInstanceId,
    },
  });
  return true;
}

/** Swaps the defending side's Active for the chosen Benched Pokémon, attachments following. */
function ninjaTrickSwitch(draft, player, benchRoot, events) {
  const active = player.zones.active.find((c) => !c.attachedTo);
  if (!active || !benchRoot) return;
  const moveStack = (root, from, to) => {
    for (const card of player.zones[from].filter((c) => c === root || c.attachedTo === root.instanceId)) {
      player.zones[from].splice(player.zones[from].indexOf(card), 1);
      player.zones[to].push(card);
    }
  };
  moveStack(active, 'active', 'bench');
  moveStack(benchRoot, 'bench', 'active');
  benchRoot.movedToActiveTurn = Math.max(1, Number(draft.turn?.number) || 1);
  clearConditions(active);
  events.push({ type: 'cardSwitched', playerId: player.playerId, activeId: active.instanceId, benchId: benchRoot.instanceId });
}

/** Resumes an attack after the Ninja Trick choice, against whichever Pokémon is now Active. */
export function resumeNinjaTrick(draft, { token, selection, choicePlayerId, activeRng, events }) {
  const side = draft.players[choicePlayerId];
  const picked = benchTargets(side).find((c) => c.instanceId === (selection || [])[0]);
  if (picked) ninjaTrickSwitch(draft, side, picked, events);
  const playerId = token.initiatorPlayerId;
  const attackerPlayer = draft.players[playerId];
  const attackerRef = findCard(draft, token.attackerId);
  const attacker = attackerRef?.playerId === playerId ? attackerRef.card : null;
  const attackerView = attackViewFor(draft, attacker);
  const attack = attackerView?.attacks?.[token.attackIndex ?? 0];
  if (!attacker || !attack) {
    endTurnAfterFailedAttack(draft, { playerId, oppId: choicePlayerId, activeRng, events });
    return;
  }
  const keepTarget = token.targetInstanceId != null && token.targetInstanceId !== token.switchedOutId;
  const targetRef = keepTarget ? findCard(draft, token.targetInstanceId) : null;
  resolveDeclaredAttack(draft, {
    playerId,
    activeRng,
    events,
    attacker,
    defender: targetRef ? targetRef.card : (side.zones.active || []).find((c) => !c.attachedTo) || null,
    defenderPlayerId: targetRef?.playerId || choicePlayerId,
    oppId: choicePlayerId,
    attack,
    attackerPlayer,
    attackerView,
    atkIdx: token.attackIndex ?? 0,
    targetInstanceId: keepTarget ? token.targetInstanceId : null,
  });
}

/**
 * The attack after its declaration gates (Confusion, Smokescreen, Pattern Distraction) and the
 * defending side's Koga's Ninja Trick: copy-attack selection, then coins and the effect phase.
 */
function resolveDeclaredAttack(draft, ctx) {
  const {
    playerId,
    activeRng,
    events,
    attacker,
    defender,
    defenderPlayerId,
    oppId,
    attack,
    attackerPlayer,
    attackerView,
    atkIdx,
    targetInstanceId,
  } = ctx;
  // A copy attack (design 031) picks the attack it uses before any coin is flipped.
  const copy = parseCopyAttack(attack?.text);
  // Misty's Psyduck ESP (design 049): all 3 heads copies; otherwise the attack's own text
  // resolves with these same coins (1 heads draws, 2 heads does 20 damage).
  let presetCoinResult = null;
  if (copy?.coinGateFlips > 1) {
    const flips = Array.from({ length: copy.coinGateFlips }, () => flipCoin(activeRng));
    const headsCount = flips.filter((f) => f === 'heads').length;
    const allMatch = flips.every((f) => f === copy.coinGate);
    const coin = headsCount === flips.length ? 'heads' : headsCount === 0 ? 'tails' : null;
    events.push({ type: 'attackCoinFlipped', playerId, attackName: attack.name, coin, headsCount, flips });
    if (!allMatch && !copy.ownTextOnMiss) {
      endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
      return;
    }
    if (copy.ownTextOnMiss) presetCoinResult = { coin, headsCount, flips };
    if (!allMatch) {
      flipAndResolveAttack(draft, {
        playerId,
        activeRng,
        events,
        attacker,
        defender,
        defenderPlayerId,
        oppId,
        attack,
        attackerPlayer,
        attackerView,
        atkIdx,
        targetInstanceId,
        presetCoinResult,
      });
      return;
    }
  } else if (copy?.coinGate) {
    // Togetic Mini-Metronome: the attack's own coin decides whether there is a copy at all.
    const coin = flipCoin(activeRng);
    events.push({
      type: 'attackCoinFlipped',
      playerId,
      attackName: attack.name,
      coin,
      headsCount: coin === 'heads' ? 1 : 0,
      flips: [coin],
    });
    if (coin !== copy.coinGate) {
      endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
      return;
    }
  }
  if (
    copy &&
    offerCopiedAttack(draft, {
      copy,
      playerId,
      oppId,
      defenderPlayerId,
      attacker,
      defender,
      atkIdx,
      targetInstanceId,
      activeRng,
      events,
    })
  ) {
    return;
  }
  flipAndResolveAttack(draft, {
    playerId,
    activeRng,
    events,
    attacker,
    defender,
    defenderPlayerId,
    oppId,
    attack,
    attackerPlayer,
    attackerView,
    atkIdx,
    targetInstanceId,
    presetCoinResult,
  });
}

/**
 * An attack that was declared but does not happen (Confusion tails, Smokescreen Shot tails,
 * Mini-Metronome tails): the attack still ends the turn — Pokémon Checkup, then the hand-off.
 */
export function endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events }) {
  const attackerPlayer = draft.players[playerId];
  if (!attackerPlayer.flags) attackerPlayer.flags = {};
  attackerPlayer.flags.attackerAttacked = true;
  if (isGameConcluded(draft)) return;
  resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: playerId });
  if (!isGameConcluded(draft)) advanceTurn(draft, { nextPlayerId: oppId, events });
}

/**
 * Baby rule (I230, baby-rule.mjs): when the opponent's Active is a Baby Pokémon, the attacker
 * flips before anything else — before Confusion (WotC chat Nov 14, 2002, Q8: "Baby rule.") and
 * before any cost is paid. Tails ends the turn without an attack. True when the attack stops.
 */
function babyRuleStopsAttack(draft, { playerId, oppId, attacker, attack, activeRng, events }) {
  const oppActive = draft.players[oppId]?.zones?.active || [];
  const root = oppActive.find((c) => !c.attachedTo);
  if (!isBabyPokemon(topPokemonCard(oppActive, root))) return false;
  const face = flipCoin(activeRng);
  events.push({ type: 'coinFlipped', playerId, face, source: 'Baby rule', instanceId: root.instanceId });
  if (face === 'heads') return false;
  events.push({
    type: 'attackPrevented',
    playerId,
    attackerId: attacker?.instanceId ?? null,
    attackName: attack?.name,
    source: 'Baby rule',
  });
  endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
  return true;
}

/**
 * Spends the player's once-per-game GX attack. Declaring the attack is what spends it, so this
 * runs on the resolving path and on an attack that failed its printed condition (design 036 A1).
 */
export function spendGxAttack(draft, { playerId, attacker, attack, events }) {
  if (!isGxAttack(attack)) return;
  const oncePerGame = ensureOncePerGame(draft, playerId);
  if (oncePerGame && !oncePerGame.gxUsed) {
    oncePerGame.gxUsed = true;
    events.push({
      type: 'gxAttackUsed',
      playerId,
      instanceId: attacker?.instanceId,
      attackName: attack.name,
    });
  }
}

/**
 * Spends the player's once-per-game VSTAR Power when the attack used is a VSTAR Power attack
 * (App. 9, design 049): the printed one, a copied one, or a borrowed one. Runs beside every
 * `spendGxAttack` call.
 */
export function spendVstarAttack(draft, { playerId, attacker, attack, events }) {
  if (!isVstarPowerAttack(attack)) return;
  const oncePerGame = ensureOncePerGame(draft, playerId);
  if (oncePerGame && !oncePerGame.vstarUsed) {
    oncePerGame.vstarUsed = true;
    events.push({
      type: 'vstarUsed',
      playerId,
      instanceId: attacker?.instanceId,
      kind: 'vstar',
      attackName: attack.name,
    });
  }
}

// Extra attacks a Stadium makes usable by this Pokémon (Shrine of Memories /
// Meteor Falls inheritance, Holon Lake / Rocket's Tricky Gym grants). Order is
// shared with the client's list builders, so an attackIndex resolves alike.
function stadiumExtraAttacksFor(state, card, { isActive = true } = {}) {
  const stadiumCard = state.stadium?.card || state.stadium;
  if (!card) return [];
  const ref = findCard(state, card.instanceId);
  const zone = ref?.player?.zones?.[ref.zoneId];
  if (!Array.isArray(zone)) return [];
  return stadiumExtraAttacks(stadiumCard, {
    zoneCards: zone,
    root: card,
    isActive,
  });
}

// Attacks a Pokémon Tool grants to the Pokémon it is attached to (TM/Cube Items,
// design 035 slice 7). Read from the same zone stack the tool lives in.
function toolGrantedAttacksFor(state, card) {
  if (!card) return [];
  const ref = findCard(state, card.instanceId);
  const zone = ref?.player?.zones?.[ref.zoneId];
  if (!Array.isArray(zone)) return [];
  const out = [];
  for (const attached of zone) {
    if (attached.attachedTo !== card.instanceId) continue;
    // Evolution cards sit in the stack attached to the Basic root: their attacks are the
    // previous Evolutions', usable only through a grant (design 049), never as a Tool's.
    if (isPokemon(attached) || isEnergy(attached)) continue;
    out.push(...parseGrantedAttacks(attached));
  }
  return out;
}

function borrowSourceMatches(card, borrow) {
  if (!isPokemon(card)) return false;
  const name = String(card.name || '').toLowerCase();
  if (borrow.basic && (normalizeStage(card.stage) || 'Basic') !== 'Basic') return false;
  if (borrow.noRuleBox && isRuleBoxPokemon(card)) return false;
  if (borrow.gxOrEx && !/-(?:gx|ex)$/.test(name)) return false;
  if (borrow.evolvesFrom && String(card.evolvesFrom || '').toLowerCase() !== borrow.evolvesFrom) {
    return false;
  }
  if (borrow.names && !borrow.names.includes(name)) return false;
  if (borrow.namePrefix && !name.startsWith(borrow.namePrefix)) return false;
  return true;
}

// Legacy Pokémon Power status gate (Mimic, Psymimic; design 049): 'rotation' is off while the
// holder is Asleep, Confused or Paralyzed, 'any' while it has any Special Condition.
function powerStatusBlocks(powerStatus, holder) {
  if (!powerStatus) return false;
  const conditions = listConditions(holder);
  if (powerStatus === 'any') return conditions.length > 0;
  return conditions.some((c) => ['Asleep', 'Confused', 'Paralyzed'].includes(c));
}

/**
 * Attacks an Ability lets `card` use as its own (Mew ex Memory Helix, Ditto Sudden
 * Transformation, Mewtwo & Mew-GX Perfection, Mew-EX Versatile, …; design 034 slice 6).
 * In-play sources are read through their top evolution; the copier itself never counts.
 * Each attack keeps its own cost, and its text names the copier (copiedAttackFor).
 */
function abilityBorrowedAttacks(state, card) {
  const ref = findCard(state, card?.instanceId);
  if (!ref || !['active', 'bench'].includes(ref.zoneId)) return [];
  const view = inPlayView(state, card);
  const texts = (view?.abilities || []).map((a) => (typeof a === 'string' ? a : a?.text));
  const borrow = texts.map(parseAttackBorrowAbility).find(Boolean);
  if (!borrow) return [];
  if (borrow.requiresActive && ref.zoneId !== 'active') return [];
  if (isAbilitySuppressed(view, abilitySideContext(state, ref.playerId))) return [];
  if (powerStatusBlocks(borrow.powerStatus, card)) return [];
  const own = state.players?.[ref.playerId];
  const opp = Object.values(state.players || {}).find((p) => p.playerId !== ref.playerId);
  const inPlay = (p, zones) =>
    zones.flatMap((z) => rootsIn(p?.zones?.[z])).map((root) => inPlayView(state, root));
  const bySource = {
    ownBench: () => inPlay(own, ['bench']),
    ownInPlay: () => inPlay(own, ['active', 'bench']),
    oppInPlay: () => inPlay(opp, ['active', 'bench']),
    oppActive: () => inPlay(opp, ['active']),
    ownDiscard: () => own?.zones?.discard || [],
    ownLostZone: () => own?.zones?.lostZone || [],
    oppLostZone: () => opp?.zones?.lostZone || [],
    // Gyarados Dragon DNA: the Basic card under this Pokémon (the stack root itself).
    selfBasic: () =>
      priorEvolutionCards(ref.player?.zones?.[ref.zoneId] || [], card).filter(
        (c) => (normalizeStage(c.stage) || 'Basic') === 'Basic'
      ),
  };
  const borrowed = [];
  for (const scope of borrow.scopes) {
    for (const source of bySource[scope]?.() || []) {
      const isSelf = source.instanceId === card.instanceId;
      if ((isSelf && scope !== 'selfBasic') || !borrowSourceMatches(source, borrow)) continue;
      for (const attack of source.attacks || []) {
        if (!attack?.name) continue;
        const copied = copiedAttackFor(attack, { sourceName: source.name, copierName: view.name });
        borrowed.push(borrow.bonusBeforeWR ? { ...copied, bonusBeforeWR: borrow.bonusBeforeWR } : copied);
      }
    }
  }
  return borrowed;
}

const abilityTexts = (view) =>
  (view?.abilities || []).map((a) => (typeof a === 'string' ? a : a?.text ?? a?.effect ?? ''));

/**
 * Attacks other cards let `card` use (design 049 slice 4): an in-play Ability on either side
 * (Relicanth Memory Dive, Celebi-EX Time Recall, Aerodactyl Prehistoric Memory, Honchkrow Dark
 * Genes), an attached Tool (Memory Capsule, Memory Berry), or this turn's Recall. Each attack
 * keeps its cost unless the grant says otherwise, and carries `grantedBy`.
 */
function grantedAttacksFor(state, card) {
  const ref = findCard(state, card?.instanceId);
  if (!ref || !['active', 'bench'].includes(ref.zoneId)) return [];
  const zone = ref.player?.zones?.[ref.zoneId] || [];
  const view = inPlayView(state, card);
  const priorAttacks = (grantedBy) =>
    priorEvolutionCards(zone, card).flatMap((src) =>
      (src.attacks || []).filter((a) => a?.name).map((a) => ({ ...a, grantedBy }))
    );
  const out = [];

  for (const [ownerId, owner] of Object.entries(state.players || {})) {
    const sideContext = abilitySideContext(state, ownerId);
    for (const root of ['active', 'bench'].flatMap((z) => rootsIn(owner?.zones?.[z]))) {
      const holder = inPlayView(state, root);
      // Cheap prefilter: this runs for every root on every attack view.
      const grants = abilityTexts(holder)
        .filter((t) => /can use any attack|attack as its own/i.test(t))
        .map(parseAttackGrant)
        .filter(Boolean);
      if (grants.length === 0) continue;
      if (isAbilitySuppressed(holder, sideContext)) continue;
      for (const grant of grants) {
        if (powerStatusBlocks(grant.powerStatus, root)) continue;
        const sameSide = ownerId === ref.playerId;
        if (grant.recipients === 'ownEvolved' && sameSide) out.push(...priorAttacks(holder.name));
        if (grant.recipients === 'allEvolved') out.push(...priorAttacks(holder.name));
        if (
          grant.recipients === 'ownNamed' &&
          sameSide &&
          root.instanceId !== card.instanceId &&
          String(view?.name || '').toLowerCase() === grant.recipientName
        ) {
          for (const attack of holder.attacks || []) {
            if (!attack?.name) continue;
            if (grant.holderMustPay && !attackCostPayable(state, ownerId, root, attack)) continue;
            const copied = copiedAttackFor(attack, { sourceName: holder.name, copierName: view.name });
            out.push({ ...copied, ...(grant.costFree ? { cost: [] } : {}), grantedBy: holder.name });
          }
        }
      }
    }
  }

  if (!isStadiumToolNegation(state.stadium?.card || state.stadium)) {
    for (const tool of attachedTools(card, zone)) {
      const grant = parseAttackGrant(cardText(tool));
      if (grant?.recipients === 'host') out.push(...priorAttacks(tool.name));
    }
  }

  const owner = state.players?.[ref.playerId];
  if (owner?.flags?.evolutionAttacksTurn && ref.zoneId === 'active') out.push(...priorAttacks('Recall'));
  return out;
}

// `inPlayView` with Stadium extras, Ability-borrowed and granted attacks merged into its
// attacks list, in the order the client panel renders them (design 049).
export function attackViewFor(state, card, { isActive = true } = {}) {
  const view = inPlayView(state, card);
  const extras = mergeAttacks(
    mergeAttacks(
      mergeAttacks(stadiumExtraAttacksFor(state, card, { isActive }), toolGrantedAttacksFor(state, card)),
      abilityBorrowedAttacks(state, card)
    ),
    grantedAttacksFor(state, card)
  );
  if (extras.length === 0) return view;
  return { ...view, attacks: mergeAttacks(view?.attacks || [], extras) };
}

/**
 * The attacks an in-play Pokémon can use beyond its printed ones (Stadium, Tool, borrowed and
 * granted), in the order `attackViewFor` merges them — so printed.length + k is the
 * `attackIndex` of extra k. Projected to the owner's view for the attack panel (design 049).
 * @returns {object[]} [] when the card is not in play or has no extras
 */
export function attackExtrasFor(state, card) {
  const ref = card ? findCard(state, card.instanceId) : null;
  if (!ref || !['active', 'bench'].includes(ref.zoneId)) return [];
  const printedCount = (inPlayView(state, card)?.attacks || []).length;
  const all = attackViewFor(state, card, { isActive: ref.zoneId === 'active' })?.attacks || [];
  return all.slice(printedCount);
}

// Older printings name the attacker ("Mantine can't attack during your next turn", "Put 1 damage
// counter on Beldum"). Every reader of the attack's text sees "this Pokémon" instead.
export function withSelfNamedAttack(ctx) {
  const name = ctx.attackerView?.name || ctx.attacker?.name;
  const text = ctx.attack?.text;
  if (!text) return ctx;
  // TCGdex prints curly apostrophes ("opponent’s"); every reader matches straight ones.
  const straight = String(text).replace(/[‘’]/g, "'");
  const named = name ? replaceSelfName(straight, name) : straight;
  return named === text ? ctx : { ...ctx, attack: { ...ctx.attack, text: named } };
}

/**
 * Flips the attack's coins, offers a Glimwood Tangle re-flip, then resolves the effect
 * phase. `copiedAttack` is set when a copy attack chose `attack` (design 031); resume
 * tokens carry it because the copier's own attack list does not hold it.
 */
function flipAndResolveAttack(draft, ctx) {
  ctx = withSelfNamedAttack(ctx);
  const { playerId, activeRng, events, attack, attackerPlayer, atkIdx, targetInstanceId, copiedAttack } = ctx;
  // A new attack starts with no before-damage discard recorded (attack-steps recordDiscardedForDamage).
  delete draft.attackDiscardedForDamage;
  delete draft.attackAttachedForDamage;
  // The attack this player used, for next-turn copy wordings (Mimikyu Copycat, Sudowoodo
  // Watch and Learn): the copied attack when one was chosen, scoped by turn number so the
  // opponent reads it only during their next turn (design 039).
  if (attackerPlayer) {
    // Borrow-only fields (Dragon DNA's bonus, the source labels) belong to how this Pokémon used
    // the attack, not to the attack a next-turn copier reads (design 049 review).
    const printedAttack = { ...attack };
    for (const key of ['bonusBeforeWR', 'grantedBy', 'copiedFrom', 'waivesUseGate']) delete printedAttack[key];
    attackerPlayer.lastAttack = {
      attack: printedAttack,
      isGx: isGxAttack(attack),
      attackerName: ctx.attackerView?.name || ctx.attacker?.name || '',
      attackerInstanceId: ctx.attacker?.instanceId ?? null,
      turnNumber: draft.turn?.number || 1,
      // Who was in play on the other side during this attack (Smeargle Sketch, design 049).
      opponentInPlayIds: ['active', 'bench'].flatMap((zoneId) =>
        rootsIn(
          draft.players?.[ctx.oppId ?? Object.keys(draft.players || {}).find((id) => id !== playerId)]
            ?.zones?.[zoneId]
        ).map((c) => c.instanceId)
      ),
    };
  }
  // Printed-text damage (design 013): coin flips first, then the "for each …" scaling
  // the parser resolves from live board counts, then bench/spread damage. Without this
  // every attack dealt its flat printed number regardless of the board (I26 follow-up).
  // A copy attack's gate coins (Misty's Psyduck ESP, design 049) are this attack's coins: no
  // second flip, no second event, and no Glimwood / Victory Star re-flip of the gate.
  const preset = ctx.presetCoinResult || null;
  const coinResult = preset || flipAttackCoins(attack, activeRng, coinCountReader(draft, ctx));
  const { coin, headsCount, flips } = coinResult;
  if (flips.length > 0 && !preset) {
    events.push({
      type: 'attackCoinFlipped',
      playerId,
      attackName: attack.name,
      coin,
      headsCount,
      flips,
    });
  }

  // Glimwood Tangle: after any coins are flipped for an attack, the player
  // may ignore the results and re-flip. The choice is offered before any
  // effect resolves, so a re-flip never has to undo damage or a KO.
  // Victini Victory Star (design 034 slice 6) offers the same keep-or-re-flip choice, at
  // most once per turn.
  const glimwood =
    isStadiumGlimwoodReFlip(draft.stadium?.card || draft.stadium) &&
    !attackerPlayer?.flags?.glimwoodUsedThisTurn;
  const victoryStar =
    !glimwood &&
    !attackerPlayer?.flags?.victoryStarUsedThisTurn &&
    abilityVictoryStar(abilitySideContext(draft, playerId));
  // Sabrina's ESP (gym1-117): "If that Pokémon uses and attack that involves flipping coins,
  // Sabrina's ESP lets you re-flip those coins once. If you do, re-flip all the coins."
  const esp =
    !glimwood && !victoryStar
      ? attachedLegacyTrainers(attackerPlayer?.zones?.active || [], ctx.attacker).find(
          ({ card, spec }) => spec.effect.kind === 'reflipAttackCoins' && !card.reflipUsed
        )?.card || null
      : null;
  if (flips.length > 0 && !preset && (glimwood || victoryStar || esp)) {
    const reflipSource = glimwood ? 'glimwood' : victoryStar ? 'victoryStar' : 'sabrinasEsp';
    const sourceLabel = glimwood ? 'Glimwood Tangle' : victoryStar ? 'Victory Star' : esp.name;
    draft.pendingChoice = createPendingChoice({
      player: playerId,
      source: glimwood ? 'stadium' : victoryStar ? 'ability' : 'trainer',
      prompt: `${attack.name}: keep the coin results or re-flip them (${sourceLabel})?`,
      // Numeric sentinels: the choice validator only accepts integer
      // instanceIds. 1 = keep, 2 = re-flip.
      options: [
        { instanceId: 1, name: 'Keep results', type: 'option' },
        { instanceId: 2, name: 'Re-flip coins', type: 'option' },
      ],
      min: 1,
      max: 1,
      resumeToken: {
        effectType: 'glimwood',
        reflipSource,
        ...(esp ? { reflipCardId: esp.instanceId } : {}),
        initiatorPlayerId: playerId,
        attackIndex: atkIdx,
        targetInstanceId,
        coinResult,
        ...(copiedAttack ? { copiedAttack } : {}),
      },
    });
    return;
  }

  resolveAttackEffectPhase(draft, { ...ctx, coin, headsCount, flips });
}

/** Where a copy attack looks for attacks to use (design 031). */
function copySourceCards(draft, { copy, playerId, oppId, attacker, deckTopCard }) {
  const own = draft.players[playerId]?.zones || {};
  const opp = draft.players[oppId]?.zones || {};
  switch (copy.source) {
    case 'ownBench':
      return rootsIn(own.bench).filter((c) => !copy.group || inCopyGroup(c, copy.group));
    case 'ownDiscard':
      return rootsIn(own.discard).filter((c) => (c.types || []).includes(copy.pokemonType));
    case 'ownInPlay':
      return [...rootsIn(own.active), ...rootsIn(own.bench)];
    case 'ownEvolutionStack': {
      // Incineroar/Charizard: the Basic plus every Evolution below the current top.
      const ref = attacker ? findCard(draft, attacker.instanceId) : null;
      const zone = ref?.player?.zones?.[ref.zoneId];
      return Array.isArray(zone) ? priorEvolutionCards(zone, attacker) : [];
    }
    case 'ownDeckTop':
      // Slowking: the card is discarded by offerCopiedAttack before candidates are read.
      return deckTopCard ? [deckTopCard] : [];
    case 'oppActive':
      return rootsIn(opp.active);
    case 'oppBench':
      return rootsIn(opp.bench);
    case 'oppInPlay':
      return [...rootsIn(opp.active), ...rootsIn(opp.bench)];
    case 'oppDiscard':
      return rootsIn(opp.discard);
    case 'oppDeckTop':
      return rootsIn((opp.deck || []).slice(0, copy.count));
    // Shiftry ex Skill Hack, Malamar Hypnotic Reign / Alakazam Star Skill Copy (design 049).
    case 'oppHand':
      return rootsIn(opp.hand);
    case 'ownHand':
      return rootsIn(own.hand);
    default:
      return [];
  }
}

// Sources whose attacks are read from the card as stored, not from its in-play view.
const RAW_ATTACK_SOURCES = new Set([
  'ownDiscard',
  'oppDeckTop',
  'oppDiscard',
  'ownDeckTop',
  'ownEvolutionStack',
  'oppHand',
  'ownHand',
]);

/**
 * Whether the copier may choose `attack` at all (design 049): the once-per-game limits apply to
 * a copied attack (R2, App. 19), and an attack whose "You can use this attack only if …" gate
 * fails for the copier cannot be chosen (Mimed Games ruling R7). "Does nothing" gates stay the
 * copied attack's own (R1). A wording that waives "anything else required in order to use that
 * attack" (Smeargle Sketch) skips the use gate.
 */
function copyCandidateAllowed(draft, { copy, playerId, attacker, attack }) {
  if (onceAttackBlockReason(draft, playerId, attack, attacker)) return false;
  if (copy?.ignoreRequirements) return true;
  const gate = parseAttackUseGate(attack?.text, { selfName: inPlayView(draft, attacker)?.name || attacker?.name });
  if (!gate) return true;
  // The full attack view (grants scan both sides) only when a gate needs the board.
  const attackerView = attacker ? attackViewFor(draft, attacker) : null;
  const defenderPlayerId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  const defender = (draft.players[defenderPlayerId]?.zones?.active || []).find((c) => !c.attachedTo);
  const conditionCtx = buildServerAttackContext(draft, {
    attackerPlayerId: playerId,
    defenderPlayerId,
    attacker,
    defender,
    attackerView,
    defenderView: defender ? inPlayView(draft, defender) : null,
  });
  return attackConditionMet(gate, conditionCtx);
}

/**
 * The attacks a copy attack may use: every attack on its source cards except other copy
 * attacks, and — when the text requires it — only those the copier has the Energy for.
 * Design 039 filters: Tera only, Dark-name only, exclude the user, no Rule Box.
 */
function copyAttackCandidates(draft, { copy, playerId, oppId, attacker, deckTopCard }) {
  if (copy.source === 'oppLastAttack') {
    return lastTurnAttackCandidates(draft, { copy, oppId, playerId, attacker });
  }
  const candidates = [];
  for (const card of copySourceCards(draft, { copy, playerId, oppId, attacker, deckTopCard })) {
    if (copy.excludeSelf && card.instanceId === attacker?.instanceId) continue;
    const view = RAW_ATTACK_SOURCES.has(copy.source) ? card : inPlayView(draft, card);
    if (copy.tera && !isTeraCard(view)) continue;
    if (copy.darkName && !/dark/i.test(String(view?.name || ''))) continue;
    // Togetic δ Delta Copy: δ Pokémon carry "δ" in their TCGdex name (ex15-1 … ex15-40).
    if (copy.delta && !/δ/.test(String(view?.name || ''))) continue;
    if (copy.noRuleBox && isRuleBoxPokemon(view ?? card)) continue;
    for (const attack of view?.attacks || []) {
      if (!attack?.name || parseCopyAttack(attack.text)) continue;
      if (copy.excludeGx && isGxAttack(attack)) continue;
      if (copy.needsEnergy && !attackCostPayable(draft, playerId, attacker, attack)) continue;
      if (!copyCandidateAllowed(draft, { copy, playerId, attacker, attack })) continue;
      candidates.push({ sourceId: card.instanceId, sourceName: card.name, attack: { ...attack } });
    }
  }
  return candidates;
}

/**
 * The single attack the opponent used during their last turn (design 039). Empty when they
 * did not attack, when the wording excludes GX attacks and theirs was one, or when the attack
 * they used was itself a copy.
 */
function lastTurnAttackCandidates(draft, { copy, oppId, playerId, attacker }) {
  const last = draft.players?.[oppId]?.lastAttack;
  const currentTurn = Math.max(1, Number(draft.turn?.number) || 1);
  if (!last || Number(last.turnNumber) !== currentTurn - 1) return [];
  if (copy.excludeGx && last.isGx) return [];
  // Smeargle Sketch (design 049): the Defending Pokémon must be the one that attacked, and the
  // copier must have been in play during that attack.
  if (copy.fromDefending) {
    const defending = rootsIn(draft.players?.[oppId]?.zones?.active)[0];
    if (!defending || defending.instanceId !== last.attackerInstanceId) return [];
  }
  if (copy.requiresInPlayDuring && !(last.opponentInPlayIds || []).includes(attacker?.instanceId)) {
    return [];
  }
  const attack = last.attack;
  if (!attack?.name || parseCopyAttack(attack.text)) return [];
  if (!copyCandidateAllowed(draft, { copy, playerId, attacker, attack })) return [];
  return [
    {
      sourceId: last.attackerInstanceId ?? null,
      sourceName: last.attackerName || 'Opponent',
      attack: { ...attack },
    },
  ];
}

/**
 * Asks which attack a copy attack uses. Returns true while that choice is pending; false
 * when there is nothing to copy, and the copy attack then does only its own text.
 */
function offerCopiedAttack(
  draft,
  {
    copy,
    playerId,
    oppId,
    defenderPlayerId = oppId,
    attacker,
    defender,
    atkIdx,
    targetInstanceId,
    activeRng,
    events,
  }
) {
  // An inline copy condition ("If you have no cards in your hand, …", Thievul; "You can use
  // this attack only if …", Nihilego) gates the copy itself: no prompt when it fails, so the
  // attack does only its own text. A printed whole-attack "does nothing" clause stays the
  // effect phase's gate.
  if (copy.condition) {
    const conditionCtx = buildServerAttackContext(draft, {
      attackerPlayerId: playerId,
      defenderPlayerId,
      attacker,
      defender,
      attackerView: attackViewFor(draft, attacker),
      defenderView: defender ? inPlayView(draft, defender) : null,
    });
    if (!attackConditionMet(copy.condition, conditionCtx)) return false;
  }
  const shuffleOppDeck = copy.source === 'oppDeckTop';
  if (shuffleOppDeck) {
    const looked = (draft.players[oppId]?.zones?.deck || []).slice(0, copy.count);
    events.push({
      type: 'cardsRevealed',
      playerId: oppId,
      cards: looked.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
  }
  // Skill Hack looks at / Hypnotic Reign reveals the opponent's hand, even when it holds no
  // Pokémon to copy (design 049).
  if (copy.source === 'oppHand') {
    events.push({
      type: 'cardsRevealed',
      playerId: oppId,
      hand: true,
      cards: (draft.players[oppId]?.zones?.hand || []).map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
  }
  // Slowking Seek Inspiration: discard the top card first; it is only copyable when it is a
  // Pokémon without a Rule Box. The discard happens even when nothing can be copied.
  let deckTopCard = null;
  if (copy.source === 'ownDeckTop') {
    const deck = draft.players[playerId]?.zones?.deck || [];
    deckTopCard = deck.shift() || null;
    if (deckTopCard) {
      deckTopCard.attachedTo = null;
      // Prism Star cards go to the Lost Zone (App. 17), like every other discard.
      discardCardToPlayerZone(draft.players[playerId], deckTopCard);
      events.push({
        type: 'cardsDiscarded',
        playerId,
        cards: [{ instanceId: deckTopCard.instanceId, name: deckTopCard.name }],
      });
    }
  }
  const candidates = copyAttackCandidates(draft, { copy, playerId, oppId, attacker, deckTopCard });
  if (candidates.length === 0) {
    if (shuffleOppDeck) shuffleDeckWithRng(draft.players[oppId], activeRng);
    events.push({ type: 'attackCopyNothing', playerId, attackerId: attacker?.instanceId ?? null });
    return false;
  }
  // Numeric sentinels: option k (1-based) is candidates[k - 1]; one past them declines.
  const options = candidates.map((c, i) => ({
    instanceId: i + 1,
    name: `${c.sourceName}: ${c.attack.name}`,
    type: 'option',
  }));
  if (copy.optional) {
    options.push({ instanceId: candidates.length + 1, name: "Don't use an attack", type: 'option' });
  }
  const resumeToken = {
    effectType: 'attackCopy',
    initiatorPlayerId: playerId,
    attackerId: attacker?.instanceId ?? null,
    attackIndex: atkIdx,
    targetInstanceId,
    candidates,
    shuffleOppDeck,
    // Smeargle Sketch waives "anything else required": the copied attack's use gate.
    ...(copy.ignoreRequirements ? { waiveUseGate: true } : {}),
    // Hypnotic Reign / Skill Copy discard the chosen hand card (design 049).
    ...(copy.discardSource
      ? { discardSource: true, sourceZoneOwner: copy.source === 'ownHand' ? playerId : oppId }
      : {}),
  };
  // A wording that prints no "choose" (Mimikyu Copycat, Sudowoodo Watch and Learn) uses its
  // single candidate directly, without a one-option prompt.
  if (copy.auto && candidates.length === 1) {
    resumeCopiedAttack(draft, { token: resumeToken, selection: [1], activeRng, events });
    return true;
  }
  // Mime Jr. Mimed Games: "Your opponent chooses an attack" — the opponent answers the prompt;
  // the token still resumes the attacker's attack.
  const opponentChooses = copy.chooser === 'opponent';
  draft.pendingChoice = createPendingChoice({
    player: opponentChooses ? oppId : playerId,
    source: 'attack',
    prompt: opponentChooses
      ? `Choose the attack your opponent's ${attacker?.name || 'Pokémon'} uses as this attack.`
      : 'Choose the attack to use as this attack.',
    options,
    min: 1,
    max: 1,
    resumeToken,
  });
  return true;
}

/** Moves the hand card a copy attack used to its owner's discard pile (Hypnotic Reign, Skill Copy). */
function discardCopySourceFromHand(draft, ownerId, instanceId, events) {
  const owner = draft.players?.[ownerId];
  const hand = owner?.zones?.hand || [];
  const index = hand.findIndex((c) => c.instanceId === instanceId);
  if (index < 0) return;
  const [card] = hand.splice(index, 1);
  discardCardToPlayerZone(owner, card);
  events.push({ type: 'cardsDiscarded', playerId: ownerId, cards: [{ instanceId: card.instanceId, name: card.name }] });
}

/** Resumes a copy attack with the chosen attack (or its own text when declined). */
export function resumeCopiedAttack(draft, { token, selection, activeRng, events }) {
  const playerId = token.initiatorPlayerId;
  const attackerPlayer = draft.players[playerId];
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  if (token.shuffleOppDeck) shuffleDeckWithRng(draft.players[oppId], activeRng);
  const attacker = attackerPlayer?.zones?.active?.find(
    (c) => !c.attachedTo && c.instanceId === token.attackerId
  );
  if (!attacker) return;
  const attackerView = attackViewFor(draft, attacker);
  const ownAttack = attackerView?.attacks?.[token.attackIndex ?? 0] || { name: 'Attack', damage: 0 };
  const picked = (token.candidates || [])[Number((selection || [])[0]) - 1];
  const copied = picked
    ? copiedAttackFor(picked.attack, { sourceName: picked.sourceName, copierName: attacker.name })
    : null;
  // The flag travels with the attack object through every later resume token.
  const copiedAttack = copied && token.waiveUseGate ? { ...copied, waivesUseGate: true } : copied;
  if (copiedAttack) {
    events.push({
      type: 'attackCopied',
      playerId,
      attackerId: attacker.instanceId,
      attackName: ownAttack.name,
      copiedName: copiedAttack.name,
      sourceId: picked.sourceId,
    });
    if (token.discardSource) discardCopySourceFromHand(draft, token.sourceZoneOwner, picked.sourceId, events);
  }
  let defender = null;
  let defenderPlayerId = oppId;
  if (token.targetInstanceId != null) {
    const targetRef = findCard(draft, token.targetInstanceId);
    defender = targetRef?.card || null;
    if (targetRef?.playerId) defenderPlayerId = targetRef.playerId;
  } else {
    defender = rootsIn(draft.players[oppId]?.zones?.active)[0] || null;
  }
  flipAndResolveAttack(draft, {
    playerId,
    activeRng,
    events,
    attacker,
    defender,
    defenderPlayerId,
    oppId,
    attack: copiedAttack || ownAttack,
    attackerPlayer,
    attackerView,
    atkIdx: token.attackIndex ?? 0,
    targetInstanceId: token.targetInstanceId ?? null,
    copiedAttack,
  });
}

export function attackCommand({ draft, playerId, payload, activeRng, events }) {
  const attackerPlayer = draft.players[playerId];
  const attacker = resolveAttacker(draft, playerId, payload);
  const attackerZone = attackerPlayer?.zones?.bench?.includes(attacker)
    ? attackerPlayer.zones.bench
    : attackerPlayer?.zones?.active;
  const atkIdx = payload?.attackIndex ?? 0;
  const attackerView = attackViewFor(draft, attacker);
  const attack = attackerView?.attacks?.[atkIdx] || {
    name: 'Attack',
    damage: 10,
  };
  const oppId = Object.keys(draft.players || {}).find(
    (id) => id !== playerId
  );
  if (babyRuleStopsAttack(draft, { playerId, oppId, attacker, attack, activeRng, events })) return;

  // Memory Berry (Aquapolis 128, Crystal Guardians 80): "discard this card at the end of any
  // turn the Pokémon attacks" — the end-of-turn Tool sweep discards it (design 049).
  if (attacker && !isStadiumToolNegation(draft.stadium?.card || draft.stadium)) {
    for (const tool of attachedTools(attacker, attackerZone)) {
      if (parseAttackGrant(cardText(tool))?.discardAfterAttack) tool.discardAtEndOfTurn = true;
    }
  }

  const defenderPlayer = draft.players[oppId];
  let defender = null;
  let defenderPlayerId = oppId;
  if (payload?.targetInstanceId != null) {
    const targetRef = findCard(draft, payload.targetInstanceId);
    defender = targetRef?.card;
    if (targetRef?.playerId) {
      defenderPlayerId = targetRef.playerId;
    }
  } else {
    defender = defenderPlayer?.zones?.active?.find((c) => !c.attachedTo);
  }

  // Check confused condition
  if (attacker && attacker.specialCondition === 'Confused') {
    const coin = flipCoin(activeRng);
    events.push({ type: 'coinFlipped', playerId, face: coin, source: 'Confused', instanceId: attacker.instanceId });
    if (coin === 'tails') {
      attacker.damage = (attacker.damage || 0) + 30;
      events.push({
        type: 'damageUpdated',
        instanceId: attacker.instanceId,
        damage: attacker.damage,
        dealt: 30,
      });
      events.push({
        type: 'attackConfusedFizzle',
        attackerId: attacker.instanceId,
        damage: 30,
        playerId,
      });

      // Check if confused self-damage KO'd attacker
      if (attackerView.hp && attacker.damage >= attackerView.hp) {
        handleKnockout(draft, {
          victimPlayerId: playerId,
          attackerPlayerId: oppId,
          victim: attacker,
          events,
        });
      }

      endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
      return;
    }
  }

  // Octillery Smokescreen Shot / Eevee VMAX G-Max Cuddle (design 032): the marked Pokémon's
  // owner flips when it tries to attack; tails, the attack doesn't happen.
  if (attacker && activeAttackMarkers(draft, playerId, attacker).some((m) => m.kind === 'attackFlipOrFail')) {
    const coin = flipCoin(activeRng);
    events.push({ type: 'attackMarkerCoinFlipped', kind: 'attackFlipOrFail', playerId, coin });
    if (coin === 'tails') {
      events.push({ type: 'attackPrevented', playerId, attackerId: attacker.instanceId, attackName: attack.name });
      endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
      return;
    }
  }

  // Spinda Pattern Distraction (design 034 slice 6): a Basic attacker flips; tails, the
  // attack does nothing.
  if (attacker && abilityAttackFlipGate(attackerView, abilitySideContext(draft, oppId))) {
    const coin = flipCoin(activeRng);
    events.push({ type: 'attackFlipGateCoinFlipped', playerId, coin });
    if (coin === 'tails') {
      events.push({ type: 'attackPrevented', playerId, attackerId: attacker.instanceId, attackName: attack.name });
      endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
      return;
    }
  }

  const declared = {
    playerId,
    activeRng,
    events,
    attacker,
    defender,
    defenderPlayerId,
    oppId,
    attack,
    attackerPlayer,
    attackerView,
    atkIdx,
    targetInstanceId: payload?.targetInstanceId ?? null,
  };
  if (offerNinjaTrick(draft, declared)) return;
  resolveDeclaredAttack(draft, declared);
}
