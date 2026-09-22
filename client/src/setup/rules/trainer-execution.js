// Guided + deterministic execution for parsed trainer effect steps.
// Wired from rules-bridge.js when a Trainer card hits the board.

import { moveToDeckBottom } from '../../actions/zones/deck-actions.js';
import { moveCardBundle } from '../../actions/move-card-bundle/move-card-bundle.js';
import { addDamageCounter, updateDamageCounter } from '../../actions/counters/damage-counter.js';
import { applyStatus, clearStatuses } from '/shared/engine/rules/status.mjs';
import { rulesState, ensureCardData, getStadium } from '/shared/engine/rules/rules-state.mjs';
import { normalizeStage, isRareCandyJump, canEvolve } from '/shared/engine/rules/evolution.mjs';
import { isEnergyCard, classifyEnergyEffect } from '/shared/engine/rules/energy-effects.mjs';
import { filterSearchMatches, searchPickerAllCandidates } from '/shared/engine/rules/search-match.mjs';
import { maybeAnnounceSearchReveal, announceDiscardPick, shuffleDeckAfterSearch } from '/shared/engine/rules/search-reveal.mjs';
import { countBenchPokemon } from '/shared/engine/zones/active-pokemon.mjs';
import { openMatPick } from './mat-picker.js';

const STATUS_KEY = {
  Burned: 'burned',
  Confused: 'confused',
  Poisoned: 'poisoned',
  Asleep: 'asleep',
  Paralyzed: 'paralyzed',
};

function cardKey(card) {
  return card?.image?.dataset?.cardId || card?.name || '';
}

function normalizeCoinBranch(branch) {
  if (!branch) return [];
  if (Array.isArray(branch)) return branch;
  if (typeof branch === 'object' && branch.type) return [branch];
  return [];
}

function zone(user, zoneId) {
  return _getZone(user, zoneId);
}

function getInPlayPokemon(user) {
  return [
    ...getZoneSafe(user, 'active').array,
    ...getZoneSafe(user, 'bench').array,
  ].filter((c) => c && !c.image?.attached);
}

function getAttachedCards(zoneObj, parent) {
  if (!zoneObj?.array || !parent?.image) return [];
  return zoneObj.array.filter(
    (c) => c?.image?.attached && c.image.relative === parent.image
  );
}

function getZoneSafe(user, zoneId) {
  try {
    return zone(user, zoneId);
  } catch {
    return { array: [], getCount: () => 0 };
  }
}

let _getZone = null;
let _appendMessage = null;
let _openChoicePicker = null;
let _openHealPicker = null;
let _applyHealToCard = null;
let _openDeckSearchWindow = null;
let _shuffleZone = null;
let _matchesSearch = null;
let _isPokemonCard = null;
let _prizeState = null;
let _pickerTriggerCard = null;
/** Runs the shared full-screen coin-flip ceremony for an effect; resolves to the face. */
let _playCoinFlip = null;
/** Zone owner for the trainer effect currently executing (`self` or `opp`). */
let _effectOwner = 'self';

export function initTrainerExecution(deps) {
  _getZone = deps.getZone;
  _appendMessage = deps.appendMessage;
  _openChoicePicker = deps.openChoicePicker;
  _openHealPicker = deps.openHealPicker;
  _applyHealToCard = deps.applyHealToCard;
  _openDeckSearchWindow = deps.openDeckSearchWindow;
  _shuffleZone = deps.shuffleZone;
  _matchesSearch = deps.matchesSearch;
  _isPokemonCard = deps.isPokemonCard;
  _prizeState = deps.prizeState;
  _playCoinFlip = deps.playCoinFlip;
}

function msg(text) {
  _appendMessage('', text, 'announcement', false);
}

function countVariableDraw(source) {
  const opp = _effectOwner === 'self' ? 'opp' : 'self';
  switch (source) {
    case 'ancientInPlay':
      return getInPlayPokemon(_effectOwner).filter((c) =>
        String(c.name || '').toLowerCase().includes('ancient')
      ).length;
    case 'opponentBench':
      return getZoneSafe(opp, 'bench').getCount();
    case 'opponentMegaExInPlay':
      return getInPlayPokemon(opp).filter((c) =>
        /mega evolution.*\bex\b/i.test(String(c.name || '')) ||
        String(c.name || '').toLowerCase().includes('mega') &&
          String(c.name || '').toLowerCase().includes(' ex')
      ).length;
    case 'opponentHandPokemon':
      return getZoneSafe(opp, 'hand').array.filter((c) => _isPokemonCard(c)).length;
    case 'opponentPokemonInPlay':
      return getInPlayPokemon(opp).length;
    case 'opponentBenchBasic':
      return getZoneSafe(opp, 'bench').array.filter(
        (c) => _isPokemonCard(c) && (normalizeStage(c.stage) || 'Basic') === 'Basic'
      ).length;
    case 'opponentHandTrainer':
      return getZoneSafe(opp, 'hand').array.filter((c) => !_isPokemonCard(c) && !isEnergyCard(c)).length;
    case 'allBench':
      return getZoneSafe('self', 'bench').getCount() + getZoneSafe('opp', 'bench').getCount();
    default:
      return 0;
  }
}

function getRemainingPrizes(who) {
  const pZone = getZoneSafe(who, 'prizes');
  const count = pZone?.getCount ? pZone.getCount() : 0;
  if (count > 0) return count;
  if (_prizeState?.[who]?.taken != null) {
    return Math.max(0, 6 - (_prizeState[who].taken || 0));
  }
  return 6;
}

function applyStatusToCard(player, card, conditions = []) {
  const key = cardKey(card);
  if (!key) return;
  for (const condition of conditions) {
    const st = STATUS_KEY[condition] || String(condition).toLowerCase();
    applyStatus(player, key, st);
  }
  msg(`  auto: applied ${conditions.join(', ')} to ${card.name}`);
}

function placeDamageCounters(user, zoneId, index, count) {
  const card = zone(user, zoneId).array[index];
  if (!card?.image) return;
  const existing = parseInt(card.image.damageCounter?.textContent || '0', 10) || 0;
  const next = existing + count;
  if (existing === 0) addDamageCounter(user, zoneId, index, false, false);
  updateDamageCounter(user, zoneId, index, next);
}

function pokemonZoneEntry(user, card) {
  for (const zoneId of ['active', 'bench']) {
    const idx = zone(user, zoneId).array.indexOf(card);
    if (idx >= 0) return { zoneId, index: idx };
  }
  return null;
}

function isBasicEnergyCard(card) {
  if (!isEnergyCard(card)) return false;
  return classifyEnergyEffect(card) === 'basic' || String(card.name || '').toLowerCase().startsWith('basic');
}

function isSpecialEnergyCard(card) {
  if (!isEnergyCard(card)) return false;
  return !isBasicEnergyCard(card);
}

async function ensureToolData(card) {
  await ensureCardData(card);
  const tt = String(card.trainerType || '').toLowerCase();
  const subs = (card.subtypes || []).map((s) => String(s).toLowerCase());
  return tt === 'tool' || subs.includes('tool') || String(card.name || '').toLowerCase().includes('tool');
}

async function isPokemonToolCard(card) {
  if (String(card.type || '').toLowerCase().includes('trainer')) {
    await ensureToolData(card);
    const tt = String(card.trainerType || '').toLowerCase();
    if (tt === 'tool') return true;
  }
  return false;
}

function collectAttachedForUser(user, filterFn) {
  const out = [];
  for (const zoneId of ['active', 'bench']) {
    const z = zone(user, zoneId);
    for (const parent of z.array.filter((c) => c && !c.image?.attached)) {
      for (const att of getAttachedCards(z, parent)) {
        if (filterFn(att, parent, zoneId)) out.push({ card: att, parent, zoneId, user });
      }
    }
  }
  return out;
}

function openPickOnly({ title, candidates, onPick, onCancel, user = _effectOwner || 'self', triggerCard = null, allCandidates = null }) {
  _openChoicePicker({
    title,
    candidates,
    allCandidates,
    triggerCard: triggerCard ?? _pickerTriggerCard,
    user,
    pickOnly: true,
    onPick,
    onCancel,
  });
}

function openMultiPickOnly({ title, candidates, count, onConfirm, onCancel, user = _effectOwner || 'self', triggerCard = null, allCandidates = null, upTo = false }) {
  _openChoicePicker({
    title,
    candidates,
    allCandidates,
    triggerCard: triggerCard ?? _pickerTriggerCard,
    user,
    pickOnly: true,
    multiSelect: true,
    requiredCount: Math.min(count, candidates.length),
    upTo,
    onConfirm,
    onCancel,
  });
}

function matchesSwapFilter(card, filter = '') {
  const name = String(card.name || '').toLowerCase();
  const f = String(filter || '').toLowerCase();
  if (f.includes('ogerpon')) return name.includes('ogerpon') && name.includes(' ex');
  if (f.includes('basic')) return (normalizeStage(card.stage) || 'Basic') === 'Basic';
  return _isPokemonCard(card);
}

async function findEvolvedPokemon(user, psychicOnly = false) {
  const out = [];
  for (const c of getInPlayPokemon(user)) {
    await ensureCardData(c);
    const st = normalizeStage(c.stage) || 'Basic';
    if (st === 'Basic') continue;
    if (psychicOnly) {
      const types = (c.types || []).map((t) => String(t).toLowerCase());
      if (!types.includes('psychic') && !String(c.name || '').toLowerCase().includes('psychic')) continue;
    }
    out.push(c);
  }
  return out;
}

function devolvePokemon(user, target) {
  const loc = pokemonZoneEntry(user, target);
  if (!loc) return;
  const z = zone(user, loc.zoneId);
  const idx = z.array.indexOf(target);
  if (idx < 0) return;
  moveCardBundle(user, user, loc.zoneId, 'hand', idx, false, 'move');
  msg(`  auto: devolved ${target.name} → hand`);
}

function attachEnergyCard(user, energy, target) {
  const loc = pokemonZoneEntry(user, target);
  if (!loc) return;
  for (const zoneId of ['active', 'bench', 'discard', 'hand', 'deck']) {
    const idx = zone(user, zoneId).array.indexOf(energy);
    if (idx >= 0) {
      moveCardBundle(user, user, zoneId, loc.zoneId, idx, loc.index, 'move', true);
      return;
    }
  }
}

function swapPokemonWithDiscard(inPlay, fromDiscard) {
  const playLoc = pokemonZoneEntry(_effectOwner, inPlay);
  const discardIdx = zone(_effectOwner, 'discard').array.indexOf(fromDiscard);
  if (!playLoc || discardIdx < 0) return;
  const playZone = playLoc.zoneId;
  const playIndex = playLoc.index;
  moveCardBundle(_effectOwner, _effectOwner, playZone, 'discard', playIndex, false, 'move');
  const newDiscardIdx = zone(_effectOwner, 'discard').array.indexOf(fromDiscard);
  moveCardBundle(_effectOwner, _effectOwner, 'discard', playZone, newDiscardIdx >= 0 ? newDiscardIdx : 0, false, 'move');
  msg(`  auto: swapped ${inPlay.name} with ${fromDiscard.name}`);
}

function discardAttachedEntry(entry) {
  const { card, zoneId, user } = entry;
  const idx = zone(user, zoneId).array.indexOf(card);
  if (idx >= 0) moveCardBundle(user, user, zoneId, 'discard', idx, false, 'move');
}

function discardStadiumInPlay() {
  const stadium = getStadium();
  if (!stadium?.card) return false;
  const owner = stadium.user || 'self';
  const idx = zone(owner, 'stadium').array.indexOf(stadium.card);
  if (idx >= 0) {
    moveCardBundle(owner, owner, 'stadium', 'discard', idx, false, 'move');
    msg(`  auto: discarded ${stadium.card.name}`);
    return true;
  }
  return false;
}

export function switchBenchToActive(user, benchCard) {
  const benchIdx = zone(user, 'bench').array.indexOf(benchCard);
  if (benchIdx < 0) return;
  moveCardBundle(user, user, 'bench', 'active', benchIdx, false, 'move');
  msg(`  auto: switched in ${benchCard.name}`);
}

function matchesHealTarget(card, target) {
  if (target === 'Mega Evolution Pokémon ex') {
    const name = String(card.name || '').toLowerCase();
    return /mega evolution.*\bex\b/i.test(String(card.name || '')) ||
      (name.includes('mega') && name.includes(' ex'));
  }
  return true;
}

async function runSearchStep(card, searchStep, done) {
  _pickerTriggerCard = card;
  if (!searchStep) {
    done?.();
    return;
  }
  const sourceText = card.text || card.effect || '';
  const revealPicked = (picked) =>
    maybeAnnounceSearchReveal(_effectOwner, card.name, picked, _appendMessage, {
      step: searchStep,
      sourceText,
    });
  const deck = zone(_effectOwner, 'deck');
  if (deck?.array?.length) {
    await Promise.all(deck.array.map((c) => ensureCardData(c)));
  }
  // Nest Ball: single Basic → bench
  if (searchStep.destination === 'bench' && searchStep.what === 'Basic Pokémon' && (searchStep.count || 1) === 1) {
    const basics = [];
    for (const c of deck.array) {
      if ((c.stage || 'Basic') === 'Basic' && _isPokemonCard(c)) basics.push(c);
    }
    if (basics.length === 1) {
      const idx = deck.array.indexOf(basics[0]);
      revealPicked(basics[0]);
      await moveCardBundle(_effectOwner, _effectOwner, 'deck', 'bench', idx, false, 'move');
      msg(`  auto: benched ${basics[0].name}`);
      shuffleDeckAfterSearch(_effectOwner, _appendMessage, _shuffleZone, { sourceName: card.name });
      done?.();
      return;
    }
    if (basics.length === 0) {
      msg('  no Basic Pokémon in deck');
      shuffleDeckAfterSearch(_effectOwner, _appendMessage, _shuffleZone, { sourceName: card.name });
      done?.();
      return;
    }
  }
  _openDeckSearchWindow(`${card.name} lets you search your deck`);
  msg(`  ${card.name} — opening card select…`);
  const pool = filterSearchMatches(deck.array, searchStep.what, {
    onNoMatches: (what) => msg(`  no cards in deck match "${what}"`),
  });
  if (pool.length === 0) {
    msg('  no cards left in deck');
    if (!searchStep.suppressShuffle) shuffleDeckAfterSearch(_effectOwner, _appendMessage, _shuffleZone, { sourceName: card.name });
    done?.();
    return;
  }
  const shuffleAfter = (opts) => {
    if (searchStep.suppressShuffle) return;
    shuffleDeckAfterSearch(_effectOwner, _appendMessage, _shuffleZone, {
      sourceName: card.name,
      ...opts,
    });
  };
  const toBench = searchStep.destination === 'bench';
  const toAttach = searchStep.destination === 'attach';

  const attachEnergyToPokemon = async (energyCard) => {
    const targets = getInPlayPokemon(_effectOwner);
    if (targets.length === 0) {
      msg('  no Pokémon to attach to — put energy in hand instead');
      const idx = zone(_effectOwner, 'deck').array.indexOf(energyCard);
      if (idx >= 0) await moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', idx, false, 'move');
      shuffleAfter();
      done?.();
      return;
    }
    if (targets.length === 1) {
      const target = targets[0];
      const zoneId = zone(_effectOwner, 'active').array.includes(target) ? 'active' : 'bench';
      const targetIndex = zone(_effectOwner, zoneId).array.indexOf(target);
      const idx = zone(_effectOwner, 'deck').array.indexOf(energyCard);
      if (idx >= 0) await moveCardBundle(_effectOwner, _effectOwner, 'deck', zoneId, idx, targetIndex, 'move', true);
      msg(`  auto: attached ${energyCard.name} to ${target.name}`);
      shuffleAfter();
      done?.();
      return;
    }
    _openChoicePicker({
      title: `${card.name} — choose a Pokémon to attach ${energyCard.name} to`,
      candidates: targets,
      triggerCard: card,
      user: _effectOwner,
      pickOnly: true,
      onPick: async (target) => {
        const zoneId = zone(_effectOwner, 'active').array.includes(target) ? 'active' : 'bench';
        const targetIndex = zone(_effectOwner, zoneId).array.indexOf(target);
        const idx = zone(_effectOwner, 'deck').array.indexOf(energyCard);
        if (idx >= 0) await moveCardBundle(_effectOwner, _effectOwner, 'deck', zoneId, idx, targetIndex, 'move', true);
        msg(`  auto: attached ${energyCard.name} to ${target.name}`);
        shuffleAfter();
        done?.();
      },
      onCancel: () => {
        shuffleAfter();
        done?.();
      },
    });
  };

  if ((searchStep.count || 1) > 1 || searchStep.upTo) {
    const count = searchStep.count || 1;
    const upTo = searchStep.upTo === true;
    const maxSel = Math.min(count, pool.length);
    const minSel = upTo ? 0 : count;
    _openChoicePicker({
      title: upTo
        ? `${card.name} — choose up to ${count} cards`
        : `${card.name} — choose ${count} cards`,
      candidates: pool,
      allCandidates: searchPickerAllCandidates(pool, deck.array),
      triggerCard: card,
      zoneFrom: 'deck',
      destination: toBench ? 'bench' : 'hand',
      multiSelect: true,
      requiredCount: maxSel,
      minCount: minSel,
      maxCount: count,
      upTo,
      onConfirm: (selected) => {
        // openChoicePicker (rules-bridge.js) already moves every picked card
        // itself via zoneFrom/destination — a second manual moveCardBundle
        // here raced it, reading `deck.array` after the picker's own splice
        // had already shifted it, and silently dropped the sync hint
        // (buildMoveCardHints found no card at the stale index).
        revealPicked(selected);
        if (selected.length === 0) {
          msg('  no cards taken — deck shuffled');
          shuffleAfter({ message: null });
        } else {
          msg(`  ${selected.map((s) => s.name).join(', ')} → ${toBench ? 'Bench' : 'hand'}`);
          shuffleAfter();
        }
        done?.();
      },
      onCancel: () => {
        msg('  search canceled — shuffle your deck');
        shuffleAfter({ message: null });
        done?.();
      },
    });
    return;
  }

  _openChoicePicker({
    title: `${card.name} — ${toBench ? 'put a card on Bench' : toAttach ? 'choose Energy to attach' : 'take a card to hand'}`,
    candidates: pool,
    allCandidates: searchPickerAllCandidates(pool, deck.array),
    triggerCard: card,
    zoneFrom: 'deck',
    destination: toBench ? 'bench' : 'hand',
    onPick: (picked) => {
      revealPicked(picked);
      if (toAttach) attachEnergyToPokemon(picked);
      else {
        shuffleAfter();
        done?.();
      }
    },
    onCancel: () => {
      shuffleAfter();
      done?.();
    },
  });
}

// Dawn-style effect: search for one card per named stage, back to back
// (each opens its own filtered picker for exactly 1 card), then shuffle once
// at the end instead of after every stage.
async function runSearchSequenceStep(card, step, done) {
  const stages = step.stages || [];
  const runStage = async (i) => {
    if (i >= stages.length) {
      shuffleDeckAfterSearch(_effectOwner, _appendMessage, _shuffleZone, { sourceName: card.name });
      done?.();
      return;
    }
    await runSearchStep(card, { ...stages[i], suppressShuffle: true }, () => runStage(i + 1));
  };
  await runStage(0);
}

async function runLookStep(card, step, fromBottom, done) {
  _openDeckSearchWindow(`${card.name} — look at ${fromBottom ? 'bottom' : 'top'} of deck`);
  const deck = zone(_effectOwner, 'deck');
  const count = Math.min(step.count || 7, deck.getCount());
  if (count === 0) {
    done?.();
    return;
  }
  const indices = fromBottom
    ? Array.from({ length: count }, (_, i) => deck.getCount() - 1 - i)
    : Array.from({ length: count }, (_, i) => i);
  const candidates = indices.map((i) => deck.array[i]).filter(Boolean);
  let pool = candidates;
  if (step.pick && step.pick !== 'any') {
    const filtered = [];
    for (const c of candidates) {
      await ensureCardData(c);
      if (step.pick.includes('Supporter') && String(c.type || '').toLowerCase().includes('trainer')) {
        filtered.push(c);
      } else if (step.pick.includes('Pokémon') && _isPokemonCard(c)) {
        filtered.push(c);
      } else if (step.pick.includes('Energy')) {
        filtered.push(c);
      }
    }
    if (filtered.length) pool = filtered;
  }
  _openChoicePicker({
    title: `${card.name} — choose a card to ${step.destination === 'bench' ? 'Bench' : 'hand'} (optional)`,
    candidates: pool,
    zoneFrom: 'deck',
    destination: step.destination === 'bench' ? 'bench' : 'hand',
    onPick: (picked) => {
      maybeAnnounceSearchReveal(_effectOwner, card.name, picked, _appendMessage, {
        step,
        sourceText: card.text || card.effect || '',
      });
      shuffleDeckAfterSearch(_effectOwner, _appendMessage, _shuffleZone, { sourceName: card.name });
      done?.();
    },
    onCancel: () => {
      msg('  kept all looked-at cards in deck order — shuffle your deck');
      shuffleDeckAfterSearch(_effectOwner, _appendMessage, _shuffleZone, { sourceName: card.name, message: null });
      done?.();
    },
  });
}

function discardFromHandUntil(user, count, preferUser = 'self') {
  const hand = zone(user, 'hand');
  const toDiscard = hand.getCount() - count;
  if (toDiscard <= 0) return;
  if (hand.getCount() === toDiscard) {
    for (let i = 0; i < toDiscard; i++) moveCardBundle(user, user, 'hand', 'discard', 0, false, 'move');
    msg(`  auto: ${user === _effectOwner ? 'you' : 'opponent'} discarded ${toDiscard} card(s)`);
    return;
  }
  _openChoicePicker({
    title: `Discard ${toDiscard} card(s) from ${user === _effectOwner ? 'your' : "opponent's"} hand`,
    candidates: [...hand.array],
    user,
    zoneFrom: 'hand',
    destination: 'discard',
    multiSelect: true,
    requiredCount: toDiscard,
    onConfirm: (picks) => {
      for (const pick of picks) {
        const idx = zone(user, 'hand').array.indexOf(pick);
        if (idx >= 0) moveCardBundle(user, user, 'hand', 'discard', idx, false, 'move');
      }
      msg(`  discarded ${picks.length} card(s)`);
    },
  });
}

export function runTrainerSteps(card, steps, startIndex = 0, onComplete, ownerUser) {
  _pickerTriggerCard = card;
  _effectOwner = ownerUser || card?.user || 'self';
  const runAt = async (idx) => {
    if (idx >= steps.length) {
      onComplete?.();
      return;
    }
    const step = steps[idx];

    if (step.type === 'passive') {
      runAt(idx + 1);
      return;
    }

    if (step.type === 'discardCost') {
      const candidates = zone(_effectOwner, 'hand').array.filter((c) => c !== card);
      _openChoicePicker({
        title: `${card.name} — discard ${step.count} cards to pay the cost`,
        candidates,
        zoneFrom: 'hand',
        destination: 'discard',
        multiSelect: true,
        requiredCount: step.count,
        onConfirm: async (selected) => {
          for (const s of selected) {
            const i = zone(_effectOwner, 'hand').array.indexOf(s);
            if (i >= 0) await moveCardBundle(_effectOwner, _effectOwner, 'hand', 'discard', i, false, 'move');
          }
          msg(`  cost paid: discarded ${selected.map((s) => s.name).join(', ')}`);
          runAt(idx + 1);
        },
        onCancel: () => {
          msg('  cost not paid — effect canceled');
          onComplete?.();
        },
      });
      return;
    }

    if (step.type === 'coinFlip') {
      // Auto-random (no player input): the shared ceremony renders the acting
      // player's chosen coin full-screen on both seats, then the face picks the
      // branch. `playCoinFlip` is injected by rules-bridge (it owns the socket).
      Promise.resolve(
        _playCoinFlip ? _playCoinFlip(_effectOwner, card.name) : 'heads'
      ).then((face) => {
        const branch = normalizeCoinBranch(face === 'heads' ? step.heads : step.tails);
        if (branch.length === 0) {
          msg(`  coin: ${face} — no effect`);
          runAt(idx + 1);
          return;
        }
        runTrainerSteps(card, branch, 0, () => runAt(idx + 1), _effectOwner);
      });
      return;
    }

    try {
      switch (step.type) {
        case 'discardHandThenDraw': {
          // I37: each move must land (and relay) before the next one reads the zone —
          // moveCardBundle captures its cardHints synchronously at call time, so firing
          // these un-awaited raced a stale hand/deck snapshot into the peer's hints.
          while (zone(_effectOwner, 'hand').getCount() > 0) {
            await moveCardBundle(_effectOwner, _effectOwner, 'hand', 'discard', 0, false, 'move');
          }
          for (let i = 0; i < step.count; i++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) {
              await moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
            }
          }
          msg(`  auto: discarded hand, drew ${step.count}`);
          break;
        }
        case 'shuffleHandThenDraw': {
          const handCount0 = zone(_effectOwner, 'hand').getCount();
          for (let i = 0; i < handCount0; i++) {
            await moveCardBundle(_effectOwner, _effectOwner, 'hand', 'deck', 0, false, 'move');
          }
          // I37: these effects moved the hand into the deck but never actually
          // shuffled it — draws came back in the exact order they went in.
          shuffleDeckAfterSearch(_effectOwner, _appendMessage, _shuffleZone, {
            sourceName: card.name,
            message: null,
          });
          let drawCount = step.count;
          const prizesRemaining = Math.max(0, 6 - (_prizeState?.self?.taken || 0));
          if (step.bonusCount && step.bonusWhen === 'prizesRemaining==6' && prizesRemaining === 6) {
            drawCount = step.bonusCount;
          }
          for (let i = 0; i < drawCount; i++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) {
              await moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
            }
          }
          msg(`  auto: shuffled hand in, drew ${drawCount}`);
          break;
        }
        case 'countShuffleDrawPlus': {
          const n = zone(_effectOwner, 'hand').getCount();
          for (let i = 0; i < n; i++) {
            await moveCardBundle(_effectOwner, _effectOwner, 'hand', 'deck', 0, false, 'move');
          }
          shuffleDeckAfterSearch(_effectOwner, _appendMessage, _shuffleZone, {
            sourceName: card.name,
            message: null,
          });
          const drawCount = n + 1;
          for (let i = 0; i < drawCount; i++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) {
              await moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
            }
          }
          msg(`  auto: shuffled ${n} cards in, drew ${drawCount}`);
          break;
        }
        case 'ionoShuffle': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const getEffectiveHandCount = (who) => {
            const h = getZoneSafe(who, 'hand');
            const arr = Array.isArray(h?.array) ? h.array : [];
            return arr.filter((c) => c !== card).length;
          };

          const initialHandCounts = {
            [_effectOwner]: getEffectiveHandCount(_effectOwner),
            [oppSide]: getEffectiveHandCount(oppSide),
          };

          const hasTrailingDraw = steps.some((s) => s.type === 'draw' || s.type === 'opponentDraw');
          const isPrizeDraw = step.drawPrizes !== false && (!hasTrailingDraw || /iono/i.test(card?.name || ''));
          const isBottom = step.bottom || /iono/i.test(card?.name || '') || isPrizeDraw;

          for (const who of [_effectOwner, oppSide]) {
            const n = initialHandCounts[who];
            for (let i = 0; i < n; i++) {
              await moveCardBundle(who, who, 'hand', 'deck', 0, false, isBottom ? 'bottom' : 'move');
            }
            if (!isBottom) {
              shuffleDeckAfterSearch(who, _appendMessage, _shuffleZone, {
                sourceName: card.name,
                message: null,
              });
            }
          }

          if (isBottom) {
            msg('  auto: both players put hands on bottom of decks');
          } else {
            msg('  auto: both players shuffled hands into decks');
          }

          if (isPrizeDraw) {
            const initiatorPut = initialHandCounts[_effectOwner] > 0;
            const oppPut = initialHandCounts[oppSide] > 0;
            const anyPut = initiatorPut || oppPut;

            if (!anyPut) {
              msg('  auto: neither player had cards in hand — no cards drawn');
            } else {
              for (const who of [_effectOwner, oppSide]) {
                if (who === _effectOwner && !initiatorPut) {
                  msg(`  auto: ${who === 'self' ? 'your' : "opponent's"} hand was empty — drew 0 cards`);
                  continue;
                }
                const prizeCount = getRemainingPrizes(who);
                let drew = 0;
                for (let i = 0; i < prizeCount; i++) {
                  if (zone(who, 'deck').getCount() > 0) {
                    await moveCardBundle(who, who, 'deck', 'hand', 0, false, 'move');
                    drew++;
                  }
                }
                msg(`  auto: ${who === 'self' ? 'you' : 'opponent'} drew ${drew} card(s) (${prizeCount} Prize(s) remaining)`);
              }
            }
          }
          break;
        }
        case 'draw':
          for (let i = 0; i < step.count; i++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: drew ${step.count}`);
          break;
        case 'drawUntil': {
          const target = Number(step.target);
          let drew = 0;
          while (zone(_effectOwner, 'hand').getCount() < target && zone(_effectOwner, 'deck').getCount() > 0) {
            moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
            drew++;
          }
          msg(`  auto: drew ${drew} until ${target} in hand`);
          break;
        }
        case 'variableDraw': {
          const n = countVariableDraw(step.source);
          for (let i = 0; i < n; i++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: drew ${n} (variable draw)`);
          break;
        }
        case 'opponentDraw':
          for (let i = 0; i < step.count; i++) {
            if (zone('opp', 'deck').getCount() > 0) moveCardBundle('opp', 'opp', 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: opponent drew ${step.count}`);
          break;
        case 'putHandOnBottom': {
          const hand = zone(_effectOwner, 'hand').array.filter((c) => c !== card);
          if (hand.length < step.count) {
            msg('  not enough cards in hand — skipped');
            break;
          }
          if (hand.length === step.count) {
            for (let i = 0; i < step.count; i++) moveToDeckBottom(_effectOwner, _effectOwner, 'hand', 0);
            msg(`  auto: put ${step.count} on bottom of deck`);
            break;
          }
          _openChoicePicker({
            title: `${card.name} — put ${step.count} cards on bottom of deck`,
            candidates: hand,
            user: _effectOwner,
            // pickOnly: the confirm handler below performs the deck-bottom move
            // itself. Without it the shared picker auto-moved the picks to the
            // `destination` (discard) first and the handler's index lookup
            // found nothing, so Kofu discarded instead of bottoming.
            pickOnly: true,
            multiSelect: true,
            requiredCount: step.count,
            onConfirm: (picks) => {
              for (const pick of picks) {
                const i = zone(_effectOwner, 'hand').array.indexOf(pick);
                if (i >= 0) moveToDeckBottom(_effectOwner, _effectOwner, 'hand', i);
              }
              msg(`  put ${picks.length} on bottom`);
              runAt(idx + 1);
            },
            onCancel: () => {
              msg('  canceled');
              onComplete?.();
            },
          });
          return;
        }
        case 'opponentShuffleHandDraw': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const n = zone(oppSide, 'hand').getCount();
          for (let i = 0; i < n; i++) moveToDeckBottom(oppSide, oppSide, 'hand', 0);
          for (let i = 0; i < step.count; i++) {
            if (zone(oppSide, 'deck').getCount() > 0) moveCardBundle(oppSide, oppSide, 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: opponent shuffled hand to deck bottom, drew ${step.count}`);
          break;
        }
        case 'millSelf':
          for (let i = 0; i < step.count; i++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'discard', 0, false, 'move');
          }
          msg(`  auto: milled top ${step.count} to discard`);
          break;
        case 'healAmount': {
          const isActiveOnly = step.target === 'Active Pokémon';
          const candidates = isActiveOnly
            ? zone(_effectOwner, 'active').array.filter((c) => c?.hp)
            : getInPlayPokemon(_effectOwner).filter((c) => c?.hp);
          if (candidates.length === 0) msg('  no Pokémon to heal');
          else if (isActiveOnly || candidates.length === 1) _applyHealToCard(candidates[0], step.amount, step.cure, _effectOwner);
          else {
            _openHealPicker({
              title: `${card.name} — choose a Pokémon to heal`,
              candidates,
              amount: step.amount,
              cure: step.cure,
              user: _effectOwner,
            });
          }
          break;
        }
        case 'heal': {
          const candidates = getInPlayPokemon(_effectOwner).filter((c) => matchesHealTarget(c, step.target));
          if (!candidates.length) {
            msg('  no valid Pokémon to heal');
            break;
          }
          const doFullHeal = (target) => {
            const loc = pokemonZoneEntry(_effectOwner, target);
            if (!loc) return;
            const current = parseInt(target.image?.damageCounter?.textContent || '0', 10) || 0;
            if (current <= 0) {
              msg(`  ${target.name} has no damage to heal`);
              return;
            }
            _applyHealToCard(target, current, false, _effectOwner);
            const z = zone(_effectOwner, loc.zoneId);
            for (const att of [...getAttachedCards(z, target)]) {
              if (isEnergyCard(att)) {
                const ai = z.array.indexOf(att);
                if (ai >= 0) moveCardBundle(_effectOwner, _effectOwner, loc.zoneId, 'hand', ai, false, 'move');
              }
            }
            msg(`  auto: healed all damage from ${target.name}`);
          };
          if (candidates.length === 1) doFullHeal(candidates[0]);
          else {
            openMatPick({
              title: `${card.name} — click a Pokémon to heal`,
              candidates,
              onPick: doFullHeal,
            });
          }
          break;
        }
        case 'applyStatus':
          if (step.target === 'opponentActive') {
            const active = zone('opp', 'active').array[0];
            if (active) applyStatusToCard('opp', active, step.conditions);
          } else if (step.target === 'bothActiveNonDark') {
            for (const who of ['self', 'opp']) {
              const active = zone(who, 'active').array[0];
              if (active && !String(active.types?.[0] || active.type || '').toLowerCase().includes('darkness')) {
                applyStatusToCard(who, active, step.conditions);
              }
            }
          } else if (step.target === 'bothActiveAll') {
            for (const who of ['self', 'opp']) {
              const active = zone(who, 'active').array[0];
              if (active) applyStatusToCard(who, active, step.conditions);
            }
          } else if (step.target === 'ownActive') {
            const active = zone(_effectOwner, 'active').array[0];
            if (active) applyStatusToCard(_effectOwner, active, step.conditions);
          }
          break;
        case 'damageCounters': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          if (step.target.includes('opponent')) {
            const targets = getInPlayPokemon(oppSide);
            if (targets.length === 1) {
              const zoneId = zone(oppSide, 'active').array.includes(targets[0]) ? 'active' : 'bench';
              placeDamageCounters(oppSide, zoneId, zone(oppSide, zoneId).array.indexOf(targets[0]), step.count);
            } else if (targets.length > 1) {
              openMatPick({
                title: `Click opponent's Pokémon (${step.count} damage)`,
                candidates: targets,
                onPick: (t) => {
                  const zoneId = zone(oppSide, 'active').array.includes(t) ? 'active' : 'bench';
                  placeDamageCounters(oppSide, zoneId, zone(oppSide, zoneId).array.indexOf(t), step.count);
                },
              });
            }
          } else {
            placeDamageCounters(_effectOwner, 'active', 0, step.count);
          }
          break;
        }
        case 'searchDeck':
          await runSearchStep(card, step, () => runAt(idx + 1));
          return;
        case 'searchDeckSequence':
          await runSearchSequenceStep(card, step, () => runAt(idx + 1));
          return;
        case 'lookAtTop':
          await runLookStep(card, step, false, () => runAt(idx + 1));
          return;
        case 'lookAtBottom':
          await runLookStep(card, step, true, () => runAt(idx + 1));
          return;
        case 'recursion': {
          const discard = zone(_effectOwner, 'discard');
          const what = step.what || 'card';
          const count = step.count || 1;
          // Honour the parsed filter (a generic 'card' still matches the whole
          // pile, but a typed clause like Tarragon's must not).
          const matches = discard.array.filter((c) => _matchesSearch(c, what));
          if (matches.length) {
            const multi = count > 1 && matches.length > 1;
            _openChoicePicker({
              title: `${card.name} — take${count > 1 ? ` up to ${count}` : ''} from discard`,
              candidates: matches,
              user: _effectOwner,
              zoneFrom: 'discard',
              destination: 'hand',
              multiSelect: multi,
              requiredCount: Math.min(count, matches.length),
              upTo: count > 1,
              onPick: (picked) =>
                announceDiscardPick(_effectOwner, card.name, picked, _appendMessage),
              onConfirm: (picked) =>
                announceDiscardPick(_effectOwner, card.name, picked, _appendMessage),
              onCancel: () => {},
            });
          }
          break;
        }
        case 'shuffleFromDiscard': {
          const discard = zone(_effectOwner, 'discard');
          const choices = step.choices || [{ what: step.what, count: step.count }];
          const runChoice = (choiceIdx) => {
            if (choiceIdx >= choices.length) {
              _shuffleZone(_effectOwner, _effectOwner, 'deck');
              runAt(idx + 1);
              return;
            }
            const choice = choices[choiceIdx];
            const pool = discard.array.filter((c) => _matchesSearch(c, choice.what));
            if (!pool.length) {
              runChoice(choiceIdx + 1);
              return;
            }
            _openChoicePicker({
              title: `${card.name} — shuffle up to ${choice.count} from discard`,
              candidates: pool,
              user: _effectOwner,
              zoneFrom: 'discard',
              destination: 'deck',
              multiSelect: pool.length > 1,
              requiredCount: Math.min(choice.count, pool.length),
              onConfirm: (picked) => {
                const list = Array.isArray(picked) ? picked : [picked];
                announceDiscardPick(_effectOwner, card.name, list, _appendMessage);
                for (const p of list) {
                  const i = zone(_effectOwner, 'discard').array.indexOf(p);
                  if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'discard', 'deck', i, false, 'move');
                }
                runChoice(choiceIdx + 1);
              },
              onCancel: () => runChoice(choiceIdx + 1),
            });
          };
          runChoice(0);
          return;
        }
        case 'attachFromDiscard':
        case 'attachMultipleFromDiscard': {
          const discard = zone(_effectOwner, 'discard');
          const energies = discard.array.filter((c) => String(c.name || '').toLowerCase().includes('energy'));
          const max = step.type === 'attachMultipleFromDiscard' ? step.count : 1;
          if (!energies.length) {
            msg('  no Energy in discard');
            break;
          }
          _openChoicePicker({
            title: `${card.name} — attach Energy from discard`,
            candidates: energies.slice(0, max),
            user: _effectOwner,
            // pickOnly: the onPick handler attaches the chosen Energy to a
            // Pokémon itself. The default auto-move sent it to the `destination`
            // (hand) first, so the discard lookup missed and the attach never
            // happened.
            pickOnly: true,
            onPick: (energy) => {
              announceDiscardPick(_effectOwner, card.name, energy, _appendMessage);
              const targets = getInPlayPokemon(_effectOwner);
              if (targets.length === 1) {
                const t = targets[0];
                const zoneId = zone(_effectOwner, 'active').array.includes(t) ? 'active' : 'bench';
                const ti = zone(_effectOwner, zoneId).array.indexOf(t);
                const ei = zone(_effectOwner, 'discard').array.indexOf(energy);
                if (ei >= 0) moveCardBundle(_effectOwner, _effectOwner, 'discard', zoneId, ei, ti, 'move', true);
              } else {
                openMatPick({
                  title: 'Click a Pokémon to attach to',
                  candidates: targets,
                  onPick: (t) => {
                    const zoneId = zone(_effectOwner, 'active').array.includes(t) ? 'active' : 'bench';
                    const ti = zone(_effectOwner, zoneId).array.indexOf(t);
                    const ei = zone(_effectOwner, 'discard').array.indexOf(energy);
                    if (ei >= 0) moveCardBundle(_effectOwner, _effectOwner, 'discard', zoneId, ei, ti, 'move', true);
                  },
                });
              }
            },
          });
          break;
        }
        case 'switchOpponent': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const bench = zone(oppSide, 'bench').array.filter((c) => c && !c.image?.attached);
          if (bench.length === 1) {
            switchBenchToActive(oppSide, bench[0]);
          } else if (bench.length > 1) {
            openMatPick({
              title: `${card.name} — click a Benched Pokémon to switch in`,
              candidates: bench,
              onPick: (b) => switchBenchToActive(oppSide, b),
            });
          }
          break;
        }
        case 'switchOwn': {
          const bench = zone(_effectOwner, 'bench').array.filter((c) => c && !c.image?.attached);
          if (bench.length === 1) {
            switchBenchToActive(_effectOwner, bench[0]);
          } else if (bench.length > 1) {
            openMatPick({
              title: `${card.name} — click a Benched Pokémon to switch with`,
              candidates: bench,
              onPick: (b) => switchBenchToActive(_effectOwner, b),
            });
          }
          break;
        }
        case 'revealOpponentHandDiscard': {
          const hand = zone('opp', 'hand').array.filter((c) =>
            String(c.type || c.supertype || '').toLowerCase().includes('trainer')
          );
          if (hand.length) {
            _openChoicePicker({
              title: `${card.name} — discard up to ${step.count} Items`,
              candidates: hand,
              user: 'opp',
              zoneFrom: 'hand',
              destination: 'discard',
              multiSelect: true,
              requiredCount: Math.min(step.count, hand.length),
              onConfirm: (picks) => {
                for (const p of picks) {
                  const i = zone('opp', 'hand').array.indexOf(p);
                  if (i >= 0) moveCardBundle('opp', 'opp', 'hand', 'discard', i, false, 'move');
                }
              },
            });
          }
          break;
        }
        case 'opponentHandBottom': {
          const hand = zone('opp', 'hand').array;
          const pool = step.what === 'Energy'
            ? hand.filter((c) => String(c.name || '').toLowerCase().includes('energy'))
            : hand;
          if (pool.length) {
            openPickOnly({
              title: `${card.name} — put opponent card on bottom of deck`,
              candidates: pool,
              user: 'opp',
              onPick: (pick) => {
                const i = zone('opp', 'hand').array.indexOf(pick);
                if (i >= 0) moveToDeckBottom('opp', 'opp', 'hand', i);
                if (step.optionalOpponentDraw && zone('opp', 'deck').getCount() > 0) {
                  moveCardBundle('opp', 'opp', 'deck', 'hand', 0, false, 'move');
                }
              },
            });
          }
          break;
        }
        case 'opponentDiscardUntil': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          discardFromHandUntil(oppSide, step.count);
          break;
        }
        case 'eachPlayerDiscardUntil': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          if (step.opponentFirst) discardFromHandUntil(oppSide, step.count);
          discardFromHandUntil(_effectOwner, step.count);
          if (!step.opponentFirst) discardFromHandUntil(oppSide, step.count);
          break;
        }
        case 'opponentCountShuffleDraw': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const n = zone(oppSide, 'hand').getCount();
          for (let i = 0; i < n; i++) moveToDeckBottom(oppSide, oppSide, 'hand', 0);
          for (let i = 0; i < n; i++) {
            if (zone(oppSide, 'deck').getCount() > 0) moveCardBundle(oppSide, oppSide, 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: opponent shuffled ${n} to deck bottom, drew ${n}`);
          break;
        }
        case 'discardEnergyFromOpponent': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const targets = [];
          for (const z of ['active', 'bench']) {
            for (const parent of zone(oppSide, z).array.filter((c) => !c.image?.attached)) {
              for (const att of getAttachedCards(zone(oppSide, z), parent)) {
                if (String(att.name || '').toLowerCase().includes('energy')) targets.push({ parent, att, zoneId: z });
              }
            }
          }
          if (step.scope === 'each Pokémon') {
            for (const t of targets.slice(0, 8)) {
              const idx = zone(oppSide, t.zoneId).array.indexOf(t.att);
              const dest = step.action === 'returnToHand' ? 'hand' : 'discard';
              if (idx >= 0) moveCardBundle(oppSide, oppSide, t.zoneId, dest, idx, false, 'move');
            }
            msg(`  auto: removed Special Energy from each Pokémon`);
          } else if (targets.length) {
            openPickOnly({
              title: `${card.name} — discard Energy from opponent`,
              candidates: targets.map((t) => t.att),
              user: oppSide,
              onPick: (att) => {
                for (const z of ['active', 'bench']) {
                  const idx = zone(oppSide, z).array.indexOf(att);
                  if (idx >= 0) {
                    const dest = step.action === 'returnToHand' ? 'hand' : 'discard';
                    moveCardBundle(oppSide, oppSide, z, dest, idx, false, 'move');
                  }
                }
              },
            });
          }
          break;
        }
        case 'returnPokemonToHand': {
          const targets = getInPlayPokemon(_effectOwner);
          if (!targets.length) break;
          openPickOnly({
            title: `${card.name} — return Pokémon to hand`,
            candidates: targets,
            user: _effectOwner,
            onPick: (t) => {
              const loc = pokemonZoneEntry(_effectOwner, t);
              if (!loc) return;
              if (!step.keepAttached) {
                const z = zone(_effectOwner, loc.zoneId);
                for (const att of [...getAttachedCards(z, t)]) {
                  const ai = z.array.indexOf(att);
                  if (ai >= 0) moveCardBundle(_effectOwner, _effectOwner, loc.zoneId, 'discard', ai, false, 'move');
                }
              }
              const i = zone(_effectOwner, loc.zoneId).array.indexOf(t);
              if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, loc.zoneId, 'hand', i, false, 'move');
              msg(`  auto: returned ${t.name} to hand`);
            },
          });
          break;
        }
        case 'fossilItem': {
          const bench = zone(_effectOwner, 'bench');
          if (countBenchPokemon(bench) >= 8) {
            msg('  bench full — play fossil manually');
            break;
          }
          const boardIdx = zone(_effectOwner, 'board').array.indexOf(card);
          if (boardIdx >= 0) {
            moveCardBundle(_effectOwner, _effectOwner, 'board', 'bench', boardIdx, false, 'move');
            msg(`  auto: played ${card.name} as Basic Pokémon on Bench`);
          }
          break;
        }
        case 'moveEnergy': {
          const energies = collectAttachedForUser(_effectOwner, (att) => isBasicEnergyCard(att));
          if (!energies.length) {
            msg('  no Basic Energy attached to move');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose Basic Energy to move`,
            candidates: energies.map((e) => e.card),
            user: _effectOwner,
            onPick: (energy) => {
              const src = energies.find((e) => e.card === energy);
              const targets = getInPlayPokemon(_effectOwner).filter((p) => p !== src?.parent);
              if (!targets.length) return;
              openMatPick({
                title: `${card.name} — click a Pokémon to attach ${energy.name}`,
                candidates: targets,
                onPick: (target) => {
                  attachEnergyCard(_effectOwner, energy, target);
                  msg(`  auto: moved ${energy.name} to ${target.name}`);
                },
              });
            },
          });
          break;
        }
        case 'moveEnergyToActive': {
          const fromBench = [];
          for (const parent of zone(_effectOwner, 'bench').array.filter((c) => c && !c.image?.attached)) {
            for (const att of getAttachedCards(zone(_effectOwner, 'bench'), parent)) {
              if (isEnergyCard(att)) fromBench.push({ energy: att, parent });
            }
          }
          if (!fromBench.length) {
            msg('  no Energy on Bench to move');
            break;
          }
          openMultiPickOnly({
            title: `${card.name} — move up to ${step.count} Energy to Active`,
            candidates: fromBench.map((e) => e.energy),
            count: step.count || 2,
            user: _effectOwner,
            onConfirm: (picked) => {
              const active = zone(_effectOwner, 'active').array[0];
              if (!active) return;
              for (const energy of picked) {
                attachEnergyCard(_effectOwner, energy, active);
              }
              msg(`  auto: moved ${picked.length} Energy to Active`);
            },
          });
          break;
        }
        case 'evolveStage2': {
          const basics = getInPlayPokemon(_effectOwner).filter(
            (c) => !c.isEvolution && (normalizeStage(c.stage) || 'Basic') === 'Basic'
          );
          if (!basics.length) {
            msg('  no Basic Pokémon in play');
            onComplete?.();
            return;
          }
          openMatPick({
            title: `${card.name} — click a Basic Pokémon on your mat to evolve`,
            candidates: basics,
            onCancel: () => {
              msg('  Rare Candy canceled');
              onComplete?.();
            },
            onPick: async (base) => {
              const hand = zone(_effectOwner, 'hand');
              const options = [];
              let rejectionReason = null;
              await ensureCardData(base);
              const wasPlayedThisTurn = Boolean(
                base.enteredPlayTurn && base.enteredPlayTurn === rulesState.turnNumber
              );
              for (const c of hand.array) {
                await ensureCardData(c);
                if (_isPokemonCard(c) && isRareCandyJump(base, c)) {
                  const check = await canEvolve(_effectOwner, base, c, wasPlayedThisTurn, { isRareCandy: true });
                  if (check.allowed) options.push(c);
                  else if (!rejectionReason) rejectionReason = check.reason;
                }
              }
              if (!options.length) {
                if (rejectionReason) msg(`  ⛔ ${rejectionReason}`);
                else msg('  no Stage 2 in hand that evolves from that Basic');
                onComplete?.();
                return;
              }
              openPickOnly({
                title: `${card.name} — choose Stage 2`,
                candidates: options,
                user: _effectOwner,
                onCancel: () => {
                  msg('  evolution canceled');
                  onComplete?.();
                },
                onPick: async (evo) => {
                  const loc = pokemonZoneEntry(_effectOwner, base);
                  const handIdx = hand.array.indexOf(evo);
                  if (!loc || handIdx < 0) {
                    onComplete?.();
                    return;
                  }
                  const success = await moveCardBundle(
                    _effectOwner,
                    _effectOwner,
                    'hand',
                    loc.zoneId,
                    handIdx,
                    loc.index,
                    'move',
                    true,
                    { isRareCandy: true }
                  );
                  if (success) {
                    msg(`  auto: Rare Candy — ${base.name} → ${evo.name}`);
                  } else {
                    msg(`  ⛔ Rare Candy could not evolve ${base.name}`);
                  }
                  runAt(idx + 1);
                },
              });
            },
          });
          return;
        }
        case 'devolve': {
          const psychicOnly = String(step.target || '').includes('{P}');
          findEvolvedPokemon(_effectOwner, psychicOnly).then((targets) => {
            if (!targets.length) {
              msg('  no evolved Pokémon to devolve');
              onComplete?.();
              return;
            }
            openMatPick({
              title: `${card.name} — click a Pokémon to devolve`,
              candidates: targets,
              onCancel: () => onComplete?.(),
              onPick: (t) => {
                devolvePokemon(_effectOwner, t);
                runAt(idx + 1);
              },
            });
          });
          return;
        }
        case 'discardTools': {
          (async () => {
            const tools = [];
            for (const who of ['self', 'opp']) {
              for (const entry of collectAttachedForUser(who, (att) => true)) {
                if (await isPokemonToolCard(entry.card)) tools.push(entry);
              }
            }
            if (!tools.length) {
              msg('  no Pokémon Tools attached');
              return;
            }
            openMultiPickOnly({
              title: `${card.name} — discard up to ${step.count} Tools`,
              candidates: tools.map((t) => t.card),
              count: step.count || 2,
              onConfirm: (picked) => {
                for (const p of picked) {
                  const entry = tools.find((t) => t.card === p);
                  if (entry) discardAttachedEntry(entry);
                }
                msg(`  auto: discarded ${picked.length} Tool(s)`);
              },
            });
          })();
          break;
        }
        case 'discardFromOpponent': {
          (async () => {
            const options = [];
            for (const entry of collectAttachedForUser('opp', (att) => true)) {
              if (await isPokemonToolCard(entry.card) || isSpecialEnergyCard(entry.card)) {
                options.push({ kind: 'attached', entry });
              }
            }
            const stadium = getStadium();
            if (stadium?.card) options.push({ kind: 'stadium', card: stadium.card, user: stadium.user });
            if (!options.length) {
              msg('  nothing to discard');
              return;
            }
            openPickOnly({
              title: `${card.name} — discard Tool, Special Energy, or Stadium`,
              candidates: options.map((o) => (o.kind === 'stadium' ? o.card : o.entry.card)),
              user: 'self',
              onPick: (pick) => {
                const opt = options.find((o) => (o.kind === 'stadium' ? o.card : o.entry.card) === pick);
                if (!opt) return;
                if (opt.kind === 'stadium') discardStadiumInPlay();
                else discardAttachedEntry(opt.entry);
              },
            });
          })();
          break;
        }
        case 'discardToolAndSpecialEnergy': {
          const byParent = new Map();
          for (const entry of collectAttachedForUser('opp', (att) => true)) {
            const key = entry.parent;
            if (!byParent.has(key)) byParent.set(key, { parent: key, zoneId: entry.zoneId, tools: [], special: [] });
            if (isSpecialEnergyCard(entry.card)) byParent.get(key).special.push(entry);
          }
          (async () => {
            for (const bucket of byParent.values()) {
              for (const entry of collectAttachedForUser('opp', (att, parent) => parent === bucket.parent)) {
                if (await isPokemonToolCard(entry.card)) bucket.tools.push(entry);
              }
            }
            const candidates = [...byParent.values()].filter((b) => b.tools.length && b.special.length);
            if (!candidates.length) {
              msg('  no opponent Pokémon with both Tool and Special Energy');
              return;
            }
            openMatPick({
              title: `${card.name} — click opponent's Pokémon`,
              candidates: candidates.map((c) => c.parent),
              onPick: (parent) => {
                const bucket = candidates.find((c) => c.parent === parent);
                if (!bucket) return;
                discardAttachedEntry(bucket.tools[0]);
                discardAttachedEntry(bucket.special[0]);
                msg(`  auto: discarded Tool + Special Energy from ${parent.name}`);
              },
            });
          })();
          break;
        }
        case 'massDiscardAttached': {
          (async () => {
            const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
            let n = 0;
            for (const entry of collectAttachedForUser(oppSide, (att) => true)) {
              if (isSpecialEnergyCard(entry.card) || await isPokemonToolCard(entry.card)) {
                discardAttachedEntry(entry);
                n++;
              }
            }
            if (discardStadiumInPlay()) n++;
            msg(`  auto: discarded ${n} attached card(s)/Stadium`);
          })();
          break;
        }
        case 'swapWithDiscard': {
          const inPlay = getInPlayPokemon(_effectOwner).filter((c) => matchesSwapFilter(c, step.filter));
          openMatPick({
            title: `${card.name} — click an in-play Pokémon`,
            candidates: inPlay,
            onPick: (play) => {
              const disc = zone(_effectOwner, 'discard').array.filter((c) => matchesSwapFilter(c, step.filter));
              if (!disc.length) {
                msg('  no matching Pokémon in discard');
                return;
              }
              openPickOnly({
                title: `${card.name} — choose discard Pokémon to swap`,
                candidates: disc,
                user: _effectOwner,
                onPick: (d) => {
                  announceDiscardPick(_effectOwner, card.name, d, _appendMessage);
                  swapPokemonWithDiscard(play, d);
                },
              });
            },
          });
          break;
        }
        case 'reshufflePrizes': {
          const n = zone(_effectOwner, 'prizes').getCount();
          if (n === 0) break;
          for (let i = 0; i < n; i++) moveToDeckBottom(_effectOwner, _effectOwner, 'prizes', 0);
          _shuffleZone(_effectOwner, _effectOwner, 'deck');
          for (let i = 0; i < n; i++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'prizes', 0, false, 'move', true);
          }
          msg(`  auto: reshuffled ${n} Prize cards`);
          break;
        }
        case 'revealOpponentDeckBench': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const deck = zone(oppSide, 'deck');
          const count = Math.min(step.count || 5, deck.getCount());
          if (!count) break;
          const top = deck.array.slice(0, count);
          (async () => {
            const basics = [];
            for (const c of top) {
              await ensureCardData(c);
              if ((normalizeStage(c.stage) || 'Basic') === 'Basic' && _isPokemonCard(c)) basics.push(c);
            }
            const pool = basics.length ? basics : top;
            _openDeckSearchWindow(`${card.name} — opponent deck (top ${count})`);
            openPickOnly({
              title: `${card.name} — Basic Pokémon to opponent Bench (optional)`,
              candidates: pool,
              user: _effectOwner,
              onPick: (pick) => {
                const idx = deck.array.indexOf(pick);
                if (idx >= 0) moveCardBundle(oppSide, oppSide, 'deck', 'bench', idx, false, 'move');
              },
              onCancel: () => _shuffleZone(oppSide, oppSide, 'deck'),
            });
          })();
          break;
        }
        case 'opponentPrizeHandSwap': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const prizes = zone(oppSide, 'prizes').array;
          const facedown = prizes.filter((c) => c.image?.faceDown);
          const hand = zone(oppSide, 'hand').array;
          if (!facedown.length || !hand.length) {
            msg('  cannot swap — missing face-down Prize or hand card');
            break;
          }
          openPickOnly({
            title: `${card.name} — turn a face-down Prize face up`,
            candidates: facedown,
            user: _effectOwner,
            onPick: (prize) => {
              if (prize.image) prize.image.faceDown = false;
              const randomHand = hand[Math.floor(Math.random() * hand.length)];
              openPickOnly({
                title: `${card.name} — swap with ${randomHand.name}? (click Prize to swap)`,
                candidates: [prize],
                user: _effectOwner,
                onPick: () => {
                  const pi = zone(oppSide, 'prizes').array.indexOf(prize);
                  const hi = zone(oppSide, 'hand').array.indexOf(randomHand);
                  if (pi < 0 || hi < 0) return;
                  moveCardBundle(oppSide, oppSide, 'prizes', 'hand', pi, false, 'move', true);
                  moveCardBundle(oppSide, oppSide, 'hand', 'prizes', hi, false, 'move', true);
                  msg('  auto: swapped Prize and hand card');
                },
                onCancel: () => msg('  kept cards — no swap'),
              });
            },
          });
          break;
        }
        case 'switchOpponentOut': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const active = zone(oppSide, 'active').array[0];
          const benchBefore = zone(oppSide, 'bench').array.filter((c) => c && !c.image?.attached);
          if (!active || !benchBefore.length) {
            msg('  opponent has no Benched Pokémon to switch');
            break;
          }
          moveCardBundle(oppSide, oppSide, 'active', 'bench', 0, false, 'move');
          const benchAfter = zone(oppSide, 'bench').array.filter((c) => c && !c.image?.attached);
          if (benchAfter.length === 1) {
            switchBenchToActive(oppSide, benchAfter[0]);
          } else {
            openMatPick({
              title: `${card.name} — opponent clicks new Active`,
              candidates: benchAfter,
              onPick: (b) => switchBenchToActive(oppSide, b),
            });
          }
          msg('  auto: switched opponent Active to Bench');
          break;
        }
        case 'reviveFromDiscard': {
          const side = step.side === 'opponent' ? (_effectOwner === 'self' ? 'opp' : 'self') : _effectOwner;
          const bench = zone(side, 'bench');
          if (countBenchPokemon(bench) >= 8) {
            msg('  Bench full — cannot put a Pokémon onto the Bench');
            break;
          }
          const basics = zone(side, 'discard').array.filter(
            (c) => _isPokemonCard(c) && (normalizeStage(c.stage) || 'Basic') === 'Basic'
          );
          if (!basics.length) {
            msg('  no Basic Pokémon in the discard pile');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a Basic Pokémon to put on the Bench`,
            candidates: basics,
            user: _effectOwner,
            onPick: (mon) => {
              const i = zone(side, 'discard').array.indexOf(mon);
              if (i >= 0) moveCardBundle(side, side, 'discard', 'bench', i, false, 'move');
              msg(`  auto: put ${mon.name} onto the Bench`);
            },
          });
          break;
        }
        case 'moveDamageCounters': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const fromSide = step.from === 'opponent' ? oppSide : _effectOwner;
          const toSide = step.to === 'opponent' || step.to === 'opponentActive' ? oppSide : _effectOwner;
          const donorPool = step.from === 'ownActive'
            ? zone(_effectOwner, 'active').array
            : getInPlayPokemon(fromSide);
          const donors = donorPool.filter(
            (p) => p && !p.image?.attached &&
              (parseInt(p.image?.damageCounter?.textContent || '0', 10) || 0) > 0
          );
          if (!donors.length) {
            msg('  no damage counters to move');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a Pokémon with damage counters`,
            candidates: donors,
            user: _effectOwner,
            onPick: (source) => {
              const current = parseInt(source.image?.damageCounter?.textContent || '0', 10) || 0;
              const amount = Math.min(step.count || 1, current);
              const targets = step.to === 'opponentActive'
                ? zone(oppSide, 'active').array.filter((p) => p && !p.image?.attached)
                : getInPlayPokemon(toSide).filter((p) => p !== source);
              if (!targets.length) {
                msg('  no Pokémon to receive the damage counters');
                return;
              }
              openMatPick({
                title: `${card.name} — click a Pokémon to receive ${amount} damage counter${amount === 1 ? '' : 's'}`,
                candidates: targets,
                onPick: (target) => {
                  _applyHealToCard(source, amount, false, fromSide);
                  const tgt = pokemonZoneEntry(toSide, target);
                  if (tgt) placeDamageCounters(toSide, tgt.zoneId, tgt.index, amount);
                  msg(`  auto: moved ${amount} damage counter${amount === 1 ? '' : 's'} from ${source.name} to ${target.name}`);
                },
              });
            },
          });
          break;
        }
        case 'lookAtOpponentHand': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const hand = zone(oppSide, 'hand').array;
          if (!hand.length) {
            msg("  opponent's hand is empty");
            break;
          }
          msg(`  opponent's hand: ${hand.map((c) => c.name).join(', ')}`);
          break;
        }
        case 'attachFromHand': {
          const handEnergy = zone(_effectOwner, 'hand').array.filter((c) => {
            if (!isEnergyCard(c)) return false;
            return step.energy === 'Basic Energy' ? isBasicEnergyCard(c) : true;
          });
          if (!handEnergy.length) {
            msg('  no matching Energy in hand');
            break;
          }
          const targets = getInPlayPokemon(_effectOwner);
          if (!targets.length) {
            msg('  no Pokémon to attach to');
            break;
          }
          const count = Math.min(step.count || 1, handEnergy.length);
          openMultiPickOnly({
            title: `${card.name} — choose ${count > 1 ? `up to ${count}` : '1'} Energy from your hand`,
            candidates: handEnergy,
            count,
            upTo: step.count > 1,
            user: _effectOwner,
            onConfirm: (picked) => {
              if (!picked.length) return;
              openPickOnly({
                title: `${card.name} — choose a Pokémon to attach ${picked.map((e) => e.name).join(', ')} to`,
                candidates: getInPlayPokemon(_effectOwner),
                user: _effectOwner,
                onPick: (target) => {
                  for (const e of picked) attachEnergyCard(_effectOwner, e, target);
                  msg(`  auto: attached ${picked.length} Energy to ${target.name}`);
                },
              });
            },
          });
          break;
        }
        case 'attachAttackTool': {
          const boardIdx = zone(_effectOwner, 'board').array.indexOf(card);
          const fromZone = boardIdx >= 0 ? 'board' : 'hand';
          if (zone(_effectOwner, fromZone).array.indexOf(card) < 0) {
            msg('  cannot attach this card automatically');
            break;
          }
          const attachTargets = getInPlayPokemon(_effectOwner);
          if (!attachTargets.length) {
            msg('  no Pokémon to attach to');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a Pokémon to attach this card to`,
            candidates: attachTargets,
            user: _effectOwner,
            onPick: (target) => {
              const loc = pokemonZoneEntry(_effectOwner, target);
              const i = zone(_effectOwner, fromZone).array.indexOf(card);
              if (loc && i >= 0) {
                moveCardBundle(_effectOwner, _effectOwner, fromZone, loc.zoneId, i, loc.index, 'move', true);
                msg(`  auto: attached ${card.name} to ${target.name} — it may use ${card.name}'s attack this turn`);
              }
            },
          });
          break;
        }
        case 'revealPrizes': {
          const sides = step.scope === 'all' ? ['self', 'opp'] : [_effectOwner];
          for (const side of sides) {
            for (const pz of zone(side, 'prizes').array) {
              if (pz?.image) pz.image.faceDown = false;
            }
          }
          msg(`  auto: turned ${step.scope === 'all' ? "both players'" : 'your'} Prize cards face up`);
          break;
        }
        case 'prizeToHand': {
          const prizes = zone(_effectOwner, 'prizes').array.filter((c) => c && !c.image?.attached);
          if (!prizes.length) {
            msg('  no Prize cards');
            break;
          }
          const takeCount = Math.min(step.count || 1, prizes.length);
          openMultiPickOnly({
            title: `${card.name} — choose up to ${takeCount} Prize card(s) to put into your hand`,
            candidates: prizes,
            count: takeCount,
            upTo: true,
            user: _effectOwner,
            onConfirm: (picked) => {
              for (const p of picked) {
                const i = zone(_effectOwner, 'prizes').array.indexOf(p);
                if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'prizes', 'hand', i, false, 'move');
              }
              msg(`  auto: put ${picked.length} Prize card(s) into hand`);
              if (!step.replace || !picked.length) return;
              const handCards = zone(_effectOwner, 'hand').array;
              if (!handCards.length) return;
              openMultiPickOnly({
                title: `${card.name} — choose ${picked.length} card(s) to set face down as Prizes`,
                candidates: handCards,
                count: picked.length,
                user: _effectOwner,
                onConfirm: (sel) => {
                  for (const h of sel) {
                    const i = zone(_effectOwner, 'hand').array.indexOf(h);
                    if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'hand', 'prizes', i, false, 'move', true);
                  }
                  msg(`  auto: set ${sel.length} card(s) face down as Prizes`);
                },
              });
            },
          });
          break;
        }
        case 'clearStatus': {
          const targets = step.target === 'allYourPokémon'
            ? getInPlayPokemon(_effectOwner)
            : zone(_effectOwner, 'active').array.filter((c) => c && !c.image?.attached);
          for (const t of targets) {
            const key = t.image?.dataset?.cardId || t.name;
            if (key) clearStatuses(_effectOwner, key);
          }
          msg('  auto: cleared Special Conditions');
          break;
        }
        case 'discardStadium': {
          if (!discardStadiumInPlay()) msg('  no Stadium in play to discard');
          break;
        }
        case 'putDiscardOnTop': {
          const candidates = zone(_effectOwner, 'discard').array.filter(
            (c) => step.what !== 'Pokémon' || _isPokemonCard(c)
          );
          if (!candidates.length) {
            msg('  no matching card in the discard pile');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a card to put on top of your deck`,
            candidates,
            user: _effectOwner,
            onPick: (chosen) => {
              const i = zone(_effectOwner, 'discard').array.indexOf(chosen);
              if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'discard', 'deck', i, 0, 'move');
              msg(`  auto: put ${chosen.name} on top of your deck`);
            },
          });
          break;
        }
        case 'energyToHand': {
          const energies = collectAttachedForUser(_effectOwner, (att) => isEnergyCard(att));
          if (!energies.length) {
            msg('  no attached Energy to return');
            break;
          }
          openMultiPickOnly({
            title: `${card.name} — choose Energy to return to your hand`,
            candidates: energies.map((e) => e.card),
            count: energies.length,
            upTo: true,
            user: _effectOwner,
            onConfirm: (picked) => {
              for (const e of picked) {
                const entry = energies.find((x) => x.card === e);
                if (!entry) continue;
                const i = zone(_effectOwner, entry.zoneId).array.indexOf(e);
                if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, entry.zoneId, 'hand', i, false, 'move');
              }
              msg(`  auto: returned ${picked.length} Energy to hand`);
            },
          });
          break;
        }
        case 'opponentDiscardToHand': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const discard = zone(oppSide, 'discard').array;
          if (!discard.length) {
            msg('  no cards in the opponent’s discard pile');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a card from your opponent's discard pile`,
            candidates: discard,
            user: _effectOwner,
            onPick: (chosen) => {
              const i = zone(oppSide, 'discard').array.indexOf(chosen);
              if (i >= 0) moveCardBundle(oppSide, oppSide, 'discard', 'hand', i, false, 'move');
              msg(`  auto: put ${chosen.name} into your opponent's hand`);
            },
          });
          break;
        }
        case 'opponentActiveEnergyToDeck': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const activeZone = zone(oppSide, 'active');
          const energies = [];
          for (const mon of activeZone.array.filter((c) => c && !c.image?.attached)) {
            for (const att of getAttachedCards(activeZone, mon)) {
              if (isEnergyCard(att)) energies.push(att);
            }
          }
          if (!energies.length) {
            msg('  no Energy attached to the opponent’s Active Pokémon');
            break;
          }
          openPickOnly({
            title: `${card.name} — put an opponent Energy on top of their deck`,
            candidates: energies,
            user: _effectOwner,
            onPick: (energy) => {
              const i = activeZone.array.indexOf(energy);
              if (i >= 0) moveToDeckBottom(oppSide, oppSide, 'active', i);
              msg(`  auto: put ${energy.name} on top of the opponent's deck`);
            },
          });
          break;
        }
        case 'opponentDiscardToDeckBottom': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const discard = zone(oppSide, 'discard').array;
          if (!discard.length) {
            msg('  no cards in the opponent’s discard pile');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a card to put on the bottom of your opponent's deck`,
            candidates: discard,
            user: _effectOwner,
            onPick: (chosen) => {
              const i = zone(oppSide, 'discard').array.indexOf(chosen);
              if (i >= 0) moveToDeckBottom(oppSide, oppSide, 'discard', i);
              msg(`  auto: put ${chosen.name} on the bottom of your opponent's deck`);
            },
          });
          break;
        }
        case 'shufflePokemonIntoDeck': {
          const candidates = getInPlayPokemon(_effectOwner);
          if (!candidates.length) {
            msg('  no Pokémon to shuffle in');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a Pokémon to shuffle into your deck`,
            candidates,
            user: _effectOwner,
            onPick: (mon) => {
              const loc = pokemonZoneEntry(_effectOwner, mon);
              if (!loc) return;
              const z = zone(_effectOwner, loc.zoneId);
              for (const att of [...getAttachedCards(z, mon)]) {
                const ai = z.array.indexOf(att);
                if (ai >= 0) moveCardBundle(_effectOwner, _effectOwner, loc.zoneId, 'deck', ai, false, 'move');
              }
              const i = z.array.indexOf(mon);
              if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, loc.zoneId, 'deck', i, false, 'move');
              if (_shuffleZone) _shuffleZone(_effectOwner, _effectOwner, 'deck');
              msg(`  auto: shuffled ${mon.name} into the deck`);
            },
          });
          break;
        }
        case 'discardOwnBenchPokemon': {
          const bench = zone(_effectOwner, 'bench').array.filter((c) => c && !c.image?.attached);
          if (!bench.length) {
            msg('  no Benched Pokémon');
            break;
          }
          openMultiPickOnly({
            title: `${card.name} — choose up to ${step.count || 1} Benched Pokémon to discard`,
            candidates: bench,
            count: step.count || 1,
            upTo: true,
            user: _effectOwner,
            onConfirm: (picked) => {
              for (const mon of picked) {
                const loc = pokemonZoneEntry(_effectOwner, mon);
                if (!loc) continue;
                const z = zone(_effectOwner, loc.zoneId);
                for (const att of [...getAttachedCards(z, mon)]) {
                  const ai = z.array.indexOf(att);
                  if (ai >= 0) moveCardBundle(_effectOwner, _effectOwner, loc.zoneId, 'discard', ai, false, 'move');
                }
                const i = z.array.indexOf(mon);
                if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, loc.zoneId, 'discard', i, false, 'move');
              }
              msg(`  auto: discarded ${picked.length} Benched Pokémon`);
            },
          });
          break;
        }
        case 'shuffleDiscardIntoDeck': {
          for (const side of ['self', 'opp']) {
            while (zone(side, 'discard').getCount() > 0) {
              moveCardBundle(side, side, 'discard', 'deck', 0, false, 'move');
            }
            if (_shuffleZone) _shuffleZone(side, side, 'deck');
          }
          msg('  auto: each player shuffled their discard pile into their deck');
          break;
        }
        case 'opponentHandShuffleDeck': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const hand = zone(oppSide, 'hand').array.filter((c) => !c.image?.attached);
          const pool = step.what === 'Trainer'
            ? hand.filter((c) => String(c.cardType || c.supertype || c.cardKind || '').toLowerCase().includes('trainer'))
            : hand;
          if (!pool.length) {
            msg('  opponent has no matching cards in hand');
            break;
          }
          const n = Math.min(step.count || 1, pool.length);
          openMultiPickOnly({
            title: `${card.name} — shuffle ${n} card(s) from your opponent's hand into their deck`,
            candidates: pool,
            count: n,
            upTo: !!step.upTo,
            user: oppSide,
            onConfirm: (picks) => {
              for (const pick of picks) {
                const i = zone(oppSide, 'hand').array.indexOf(pick);
                if (i >= 0) moveCardBundle(oppSide, oppSide, 'hand', 'deck', i, false, 'move');
              }
              if (_shuffleZone) _shuffleZone(oppSide, oppSide, 'deck');
              if (step.optionalOpponentDraw && zone(oppSide, 'deck').getCount() > 0) {
                moveCardBundle(oppSide, oppSide, 'deck', 'hand', 0, false, 'move');
              }
              msg(`  auto: shuffled ${picks.length} opponent card(s) into their deck`);
            },
          });
          break;
        }
        case 'opponentHandToBenchBasic': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const benchZone = zone(oppSide, 'bench');
          const space = Math.max(0, 8 - countBenchPokemon(benchZone));
          if (space <= 0) {
            msg('  opponent Bench is full');
            break;
          }
          const basics = zone(oppSide, 'hand').array.filter(
            (c) => _isPokemonCard(c) && (normalizeStage(c.stage) || 'Basic') === 'Basic'
          );
          if (!basics.length) {
            msg("  no Basic Pokémon in the opponent's hand");
            break;
          }
          const placeBasics = (picks) => {
            for (const mon of picks) {
              const i = zone(oppSide, 'hand').array.indexOf(mon);
              if (i >= 0) moveCardBundle(oppSide, oppSide, 'hand', 'bench', i, false, 'move');
            }
            if (step.switchActive && picks[0]) switchBenchToActive(oppSide, picks[0]);
            msg(`  auto: put ${picks.length} Basic Pokémon onto the opponent's Bench`);
          };
          if (step.anyNumber) {
            openMultiPickOnly({
              title: `${card.name} — put Basic Pokémon onto the opponent's Bench`,
              candidates: basics,
              count: space,
              upTo: true,
              user: oppSide,
              onConfirm: placeBasics,
            });
          } else {
            openPickOnly({
              title: `${card.name} — choose a Basic Pokémon to put onto the opponent's Bench`,
              candidates: basics,
              user: oppSide,
              onPick: (mon) => placeBasics([mon]),
            });
          }
          break;
        }
        case 'eachPlayerDiscardFromHand': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const order = step.opponentFirst ? [oppSide, _effectOwner] : [_effectOwner, oppSide];
          for (const side of order) {
            for (let i = 0; i < step.count; i++) {
              if (zone(side, 'hand').getCount() === 0) break;
              moveCardBundle(side, side, 'hand', 'discard', 0, false, 'move');
            }
          }
          msg(`  auto: each player discarded up to ${step.count} card(s)`);
          break;
        }
        case 'eachPlayerDraw': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          for (const side of [_effectOwner, oppSide]) {
            for (let i = 0; i < step.count; i++) {
              if (zone(side, 'deck').getCount() > 0) moveCardBundle(side, side, 'deck', 'hand', 0, false, 'move');
            }
          }
          msg(`  auto: each player drew up to ${step.count} card(s)`);
          break;
        }
        case 'eachPlayerReturnBench': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          for (const side of [_effectOwner, oppSide]) {
            const z = zone(side, 'bench');
            const mon = z.array.find((c) => c && !c.image?.attached);
            if (!mon) continue;
            for (const att of [...getAttachedCards(z, mon)]) {
              const ai = z.array.indexOf(att);
              if (ai >= 0) moveCardBundle(side, side, 'bench', 'hand', ai, false, 'move');
            }
            const i = z.array.indexOf(mon);
            if (i >= 0) moveCardBundle(side, side, 'bench', 'hand', i, false, 'move');
          }
          msg('  auto: each player returned a Benched Pokémon to hand');
          break;
        }
        case 'eachPlayerShuffleHandDraw': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          for (const side of [_effectOwner, oppSide]) {
            const n = zone(side, 'hand').getCount();
            while (zone(side, 'hand').getCount() > 0) moveCardBundle(side, side, 'hand', 'deck', 0, false, 'move');
            if (_shuffleZone) _shuffleZone(side, side, 'deck');
            for (let i = 0; i < n; i++) {
              if (zone(side, 'deck').getCount() > 0) moveCardBundle(side, side, 'deck', 'hand', 0, false, 'move');
            }
          }
          msg('  auto: each player shuffled their hand into their deck and redrew');
          break;
        }
        case 'eachPlayerHandToFive': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const order = step.opponentFirst ? [oppSide, _effectOwner] : [_effectOwner, oppSide];
          for (const side of order) {
            while (zone(side, 'hand').getCount() > step.count) {
              moveCardBundle(side, side, 'hand', 'discard', 0, false, 'move');
            }
            while (zone(side, 'hand').getCount() < step.count && zone(side, 'deck').getCount() > 0) {
              moveCardBundle(side, side, 'deck', 'hand', 0, false, 'move');
            }
          }
          msg(`  auto: each player now has ${step.count} cards in hand`);
          break;
        }
        case 'eachPlayerRecoverPokemon': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          for (const side of [oppSide, _effectOwner]) {
            const mon = zone(side, 'discard').array.find((c) => _isPokemonCard(c));
            if (!mon) continue;
            const i = zone(side, 'discard').array.indexOf(mon);
            if (i >= 0) moveCardBundle(side, side, 'discard', 'hand', i, false, 'move');
          }
          msg('  auto: each player recovered a Pokémon from their discard pile');
          break;
        }
        case 'discardAnyThenDraw': {
          const hand = zone(_effectOwner, 'hand').array;
          if (!hand.length) {
            msg('  no cards in hand to discard');
            break;
          }
          openMultiPickOnly({
            title: `${card.name} — discard any number, then draw that many`,
            candidates: hand,
            count: hand.length,
            upTo: true,
            user: _effectOwner,
            onConfirm: (picks) => {
              for (const p of picks) {
                const i = zone(_effectOwner, 'hand').array.indexOf(p);
                if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'hand', 'discard', i, false, 'move');
              }
              for (let k = 0; k < picks.length; k++) {
                if (zone(_effectOwner, 'deck').getCount() > 0) {
                  moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
                }
              }
              msg(`  auto: discarded ${picks.length} and drew ${picks.length}`);
            },
          });
          break;
        }
        case 'opponentHandShuffleItemsDraw': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const items = zone(oppSide, 'hand').array.filter(
            (c) => String(c.type || c.supertype || '').toLowerCase().includes('trainer') && !_isPokemonCard(c) && !isEnergyCard(c)
          );
          let n = 0;
          for (const item of items) {
            const i = zone(oppSide, 'hand').array.indexOf(item);
            if (i >= 0) {
              moveCardBundle(oppSide, oppSide, 'hand', 'deck', i, false, 'move');
              n++;
            }
          }
          if (_shuffleZone) _shuffleZone(oppSide, oppSide, 'deck');
          for (let k = 0; k < n; k++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: opponent shuffled ${n} Item card(s); you drew ${n}`);
          break;
        }
        case 'discardAllTrainerInPlay': {
          const side = step.side === 'opponent' ? (_effectOwner === 'self' ? 'opp' : 'self') : _effectOwner;
          for (const zoneId of ['active', 'bench']) {
            const z = zone(side, zoneId);
            for (const parent of z.array.filter((c) => c && !c.image?.attached)) {
              for (const att of [...getAttachedCards(z, parent)]) {
                const attStr = `${att.type || ''} ${att.supertype || ''} ${att.name || ''}`.toLowerCase();
                if (attStr.includes('trainer') || attStr.includes('tool')) {
                  const ai = z.array.indexOf(att);
                  if (ai >= 0) moveCardBundle(side, side, zoneId, 'discard', ai, false, 'move');
                }
              }
            }
          }
          if (side === _effectOwner) discardStadiumInPlay();
          msg('  auto: discarded Trainer cards in play');
          break;
        }
        case 'returnStadiumToHand': {
          const stadium = getStadium();
          if (!stadium?.card) {
            msg('  no Stadium in play');
            break;
          }
          const owner = stadium.user || 'self';
          const idx = zone(owner, 'stadium').array.indexOf(stadium.card);
          if (idx >= 0) {
            moveCardBundle(owner, owner, 'stadium', 'hand', idx, false, 'move');
            msg(`  auto: returned ${stadium.card.name} to hand`);
          } else {
            msg('  no Stadium in play');
          }
          break;
        }
        case 'shuffleDeckOnly': {
          if (_shuffleZone) _shuffleZone(_effectOwner, _effectOwner, 'deck');
          msg('  auto: shuffled deck');
          break;
        }
        case 'clearAttackEffects': {
          msg('  cleared all effects of attacks — resolve any lingering effects manually');
          break;
        }
        case 'revealUntilCard': {
          const deck = zone(_effectOwner, 'deck');
          const what = String(step.what || '').toLowerCase();
          const match = (c) => {
            if (what.includes('supporter')) {
              return String(c.type || c.supertype || '').toLowerCase().includes('trainer');
            }
            if (what.includes('pokémon')) {
              if (!_isPokemonCard(c)) return false;
              return what.includes('evolution') ? (normalizeStage(c.stage) || 'Basic') !== 'Basic' : true;
            }
            return false;
          };
          let idx = -1;
          for (let i = 0; i < deck.getCount(); i++) {
            if (match(deck.array[i])) {
              idx = i;
              break;
            }
          }
          if (idx >= 0) {
            const name = deck.array[idx]?.name || 'a card';
            moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', idx, false, 'move');
            msg(`  auto: revealed and took ${name}`);
          } else {
            msg('  no matching card revealed');
          }
          if (_shuffleZone) _shuffleZone(_effectOwner, _effectOwner, 'deck');
          break;
        }
        case 'lookAtFaceDownPrize': {
          const prizes = zone(_effectOwner, 'prizes');
          const what = String(step.what || '').toLowerCase();
          const match = (c) =>
            what.includes('ultra beast')
              ? /ultra beast/i.test(String(c.name || ''))
              : _isPokemonCard(c) && (normalizeStage(c.stage) || 'Basic') === 'Basic';
          const found = prizes.array.find((c) => c && !c.image?.faceUp && match(c));
          if (!found) {
            msg('  no matching face-down Prize card');
            break;
          }
          const i = prizes.array.indexOf(found);
          moveCardBundle(_effectOwner, _effectOwner, 'prizes', 'hand', i, false, 'move');
          msg(`  auto: revealed ${found.name} from your Prizes into your hand`);
          break;
        }
        case 'putHandBasicAsActive': {
          const basics = zone(_effectOwner, 'hand').array.filter(
            (c) => _isPokemonCard(c) && (normalizeStage(c.stage) || 'Basic') === 'Basic'
          );
          if (!basics.length) {
            msg('  no Basic Pokémon in hand');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a Basic Pokémon to make your Active`,
            candidates: basics,
            user: _effectOwner,
            onPick: (mon) => {
              while (zone(_effectOwner, 'active').getCount() > 0) {
                moveCardBundle(_effectOwner, _effectOwner, 'active', 'bench', 0, false, 'move');
              }
              const i = zone(_effectOwner, 'hand').array.indexOf(mon);
              if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'hand', 'active', i, false, 'move');
              msg(`  auto: put ${mon.name} into play as your Active Pokémon`);
            },
          });
          break;
        }
        case 'healPerHeads': {
          const coins = step.coins || 2;
          let heads = 0;
          for (let i = 0; i < coins; i++) heads += Math.random() < 0.5 ? 1 : 0;
          const amount = heads * (step.perHeads || 3);
          const candidates = getInPlayPokemon(_effectOwner).filter((c) => c?.hp);
          if (!candidates.length) {
            msg('  no Pokémon to heal');
            break;
          }
          _openHealPicker({
            title: `${card.name} — ${heads} heads: remove up to ${amount} damage counters`,
            candidates,
            amount,
            cure: false,
            user: _effectOwner,
          });
          break;
        }
        case 'healEachActive': {
          const sides = step.scope === 'all' ? ['self', 'opp'] : [_effectOwner];
          for (const side of sides) {
            for (const mon of getInPlayPokemon(side)) {
              const cur = parseInt(mon.image?.damageCounter?.textContent || '0', 10) || 0;
              if (cur <= 0) continue;
              _applyHealToCard(mon, Math.min(step.amount, cur), false, side);
            }
          }
          msg(`  auto: removed ${step.amount} damage counter(s) from each damaged Pokémon`);
          break;
        }
        case 'opponentChoosesFromTop': {
          const deck = zone(_effectOwner, 'deck');
          const top = deck.array.slice(0, Math.min(step.count, deck.getCount()));
          if (!top.length) {
            msg('  deck is empty');
            break;
          }
          const keep = top.slice(0, step.chosen);
          for (const c of keep) {
            const i = zone(_effectOwner, 'deck').array.indexOf(c);
            if (i >= 0) {
              moveCardBundle(_effectOwner, _effectOwner, 'deck', step.chosenTo === 'discard' ? 'discard' : 'hand', i, false, 'move');
            }
          }
          for (const c of top.slice(step.chosen)) {
            const i = zone(_effectOwner, 'deck').array.indexOf(c);
            if (i >= 0 && step.restTo === 'hand') {
              moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', i, false, 'move');
            }
          }
          msg(`  auto: opponent chose ${keep.length} card(s) from the top of the deck`);
          break;
        }
        case 'millPerHeads': {
          const coins = step.coins || 2;
          let heads = 0;
          for (let i = 0; i < coins; i++) heads += Math.random() < 0.5 ? 1 : 0;
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const n = heads * (step.per || 1);
          for (let i = 0; i < n; i++) {
            if (zone(oppSide, 'deck').getCount() > 0) moveCardBundle(oppSide, oppSide, 'deck', 'discard', 0, false, 'move');
          }
          msg(`  auto: ${heads} heads — milled ${n} from the opponent's deck`);
          break;
        }
        case 'flipUntilTailsDraw': {
          let heads = 0;
          while (Math.random() < 0.5 && heads < 50) heads++;
          for (let i = 0; i < heads; i++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: ${heads} heads — drew ${heads} card(s)`);
          break;
        }
        case 'toolsToHand': {
          const tools = collectAttachedForUser(_effectOwner, (att) => {
            const s = `${att.type || ''} ${att.supertype || ''} ${att.name || ''}`.toLowerCase();
            return s.includes('trainer') || s.includes('tool');
          });
          if (!tools.length) {
            msg('  no attached Pokémon Tools');
            break;
          }
          openMultiPickOnly({
            title: `${card.name} — choose up to ${step.count} Tool(s) to return to hand`,
            candidates: tools.map((t) => t.card),
            count: step.count || 1,
            upTo: true,
            user: _effectOwner,
            onConfirm: (picks) => {
              for (const p of picks) {
                const loc = tools.find((t) => t.card === p);
                if (!loc) continue;
                const z = zone(_effectOwner, loc.zoneId);
                const i = z.array.indexOf(p);
                if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, loc.zoneId, 'hand', i, false, 'move');
              }
              msg(`  auto: returned ${picks.length} Tool(s) to hand`);
            },
          });
          break;
        }
        case 'switchHandWithTop': {
          if (zone(_effectOwner, 'deck').getCount() === 0) {
            msg('  deck is empty');
            break;
          }
          if (zone(_effectOwner, 'hand').getCount() === 0) {
            msg('  hand is empty');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a card to swap with the top of your deck`,
            candidates: [...zone(_effectOwner, 'hand').array],
            user: _effectOwner,
            onPick: (pick) => {
              const top = zone(_effectOwner, 'deck').array[0];
              const hi = zone(_effectOwner, 'hand').array.indexOf(pick);
              if (hi >= 0) moveCardBundle(_effectOwner, _effectOwner, 'hand', 'deck', hi, false, 'move');
              const ti = zone(_effectOwner, 'deck').array.indexOf(top);
              if (ti >= 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', ti, false, 'move');
              msg('  auto: swapped a hand card with the top of the deck');
            },
          });
          break;
        }
        case 'putHandBottomThenDraw': {
          const hand = zone(_effectOwner, 'hand').array;
          if (!hand.length) {
            msg('  no cards in hand');
            break;
          }
          openMultiPickOnly({
            title: `${card.name} — put any number on the bottom of your deck, then draw that many`,
            candidates: hand,
            count: hand.length,
            upTo: true,
            user: _effectOwner,
            onConfirm: (picks) => {
              for (const p of picks) {
                const i = zone(_effectOwner, 'hand').array.indexOf(p);
                if (i >= 0) moveToDeckBottom(_effectOwner, _effectOwner, 'hand', i);
              }
              for (let k = 0; k < picks.length; k++) {
                if (zone(_effectOwner, 'deck').getCount() > 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
              }
              msg(`  auto: put ${picks.length} on the bottom and drew ${picks.length}`);
            },
          });
          break;
        }
        case 'shuffleHandCardsThenDraw': {
          const handCards = zone(_effectOwner, 'hand').array;
          if (!handCards.length) {
            msg('  no cards in hand to shuffle');
            break;
          }
          const picks = handCards.slice(0, Math.min(step.count, handCards.length));
          for (const p of picks) {
            const i = zone(_effectOwner, 'hand').array.indexOf(p);
            if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'hand', 'deck', i, false, 'move');
          }
          if (_shuffleZone) _shuffleZone(_effectOwner, _effectOwner, 'deck');
          for (let k = 0; k < (step.draw || 1); k++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: shuffled ${picks.length} into the deck and drew ${step.draw || 1}`);
          break;
        }
        case 'drawBottom': {
          for (let i = 0; i < step.count; i++) {
            const deck = zone(_effectOwner, 'deck');
            if (deck.getCount() === 0) break;
            moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', deck.getCount() - 1, false, 'move');
          }
          msg(`  auto: drew the bottom ${step.count} card(s)`);
          break;
        }
        case 'moveEnergyOpponent': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const energies = collectAttachedForUser(oppSide, (att) => isEnergyCard(att));
          if (!energies.length) {
            msg('  no Special Energy attached to the opponent');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a Special Energy to move`,
            candidates: energies.map((e) => e.card),
            user: _effectOwner,
            onPick: (energy) => {
              const src = energies.find((e) => e.card === energy);
              const targets = getInPlayPokemon(oppSide).filter((p) => p !== src?.parent);
              if (!targets.length) return;
              openMatPick({
                title: `${card.name} — click a Pokémon to receive ${energy.name}`,
                candidates: targets,
                onPick: (target) => {
                  attachEnergyCard(oppSide, energy, target);
                  msg(`  auto: moved ${energy.name} to ${target.name}`);
                },
              });
            },
          });
          break;
        }
        case 'sendEnergyToDeckBottom': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const energies = collectAttachedForUser(oppSide, (att) => isEnergyCard(att));
          if (!energies.length) {
            msg('  no Energy attached to the opponent');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a Special Energy to put on the bottom of their deck`,
            candidates: energies.map((e) => e.card),
            user: _effectOwner,
            onPick: (energy) => {
              const loc = energies.find((e) => e.card === energy);
              if (!loc) return;
              const z = zone(oppSide, loc.zoneId);
              const i = z.array.indexOf(energy);
              if (i >= 0) moveToDeckBottom(oppSide, oppSide, loc.zoneId, i);
              msg(`  auto: put ${energy.name} on the bottom of the opponent's deck`);
            },
          });
          break;
        }
        case 'revealTopEnergy': {
          const deck = zone(_effectOwner, 'deck');
          if (deck.getCount() === 0) {
            msg('  deck is empty');
            break;
          }
          const top = deck.array[0];
          const want = String(step.energy || '').toLowerCase();
          const energyMatch = isEnergyCard(top) && (want.includes('basic') ? isBasicEnergyCard(top) : true);
          if (energyMatch) {
            const active = zone(_effectOwner, 'active').array[0];
            const targets = (step.toBench ? getInPlayPokemon(_effectOwner).filter((p) => p !== active) : getInPlayPokemon(_effectOwner)).filter((c) => c?.hp);
            if (!targets.length) {
              msg('  no Pokémon to attach to');
              break;
            }
            if (targets.length === 1) {
              attachEnergyCard(_effectOwner, top, targets[0]);
              msg(`  auto: attached ${top.name} to ${targets[0].name}`);
            } else {
              openMatPick({
                title: `${card.name} — attach ${top.name} to which Pokémon?`,
                candidates: targets,
                onPick: (t) => {
                  attachEnergyCard(_effectOwner, top, t);
                  msg(`  auto: attached ${top.name} to ${t.name}`);
                },
              });
            }
          } else {
            const i = zone(_effectOwner, 'deck').array.indexOf(top);
            if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'hand', i, false, 'move');
            msg(`  auto: put ${top.name} into your hand`);
          }
          break;
        }
        case 'discardAllEnergyFromActive': {
          const side = step.side === 'opponent' ? (_effectOwner === 'self' ? 'opp' : 'self') : _effectOwner;
          const z = zone(side, 'active');
          for (const parent of z.array.filter((c) => c && !c.image?.attached)) {
            for (const att of [...getAttachedCards(z, parent)]) {
              if (isEnergyCard(att)) {
                const ai = z.array.indexOf(att);
                if (ai >= 0) moveCardBundle(side, side, 'active', 'discard', ai, false, 'move');
              }
            }
          }
          msg('  auto: discarded all Energy from the Active Pokémon');
          break;
        }
        case 'searchToTop': {
          const deck = zone(_effectOwner, 'deck');
          if (deck.getCount() === 0) {
            msg('  deck is empty');
            break;
          }
          openMultiPickOnly({
            title: `${card.name} — choose ${step.count} card(s) to put on top`,
            candidates: [...deck.array],
            count: Math.min(step.count || 1, deck.getCount()),
            user: _effectOwner,
            onConfirm: (picks) => {
              for (let k = picks.length - 1; k >= 0; k--) {
                const i = zone(_effectOwner, 'deck').array.indexOf(picks[k]);
                if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'deck', i, false, 'move');
              }
              msg(`  auto: put ${picks.length} card(s) on top of your deck`);
            },
          });
          break;
        }
        case 'rearrangeTop': {
          msg(`  look at the top ${step.count} cards of your deck and rearrange them as you like`);
          break;
        }
        case 'shuffleDiscardThenMill': {
          const n = zone(_effectOwner, 'discard').getCount();
          while (zone(_effectOwner, 'discard').getCount() > 0) {
            moveCardBundle(_effectOwner, _effectOwner, 'discard', 'deck', 0, false, 'move');
          }
          if (_shuffleZone) _shuffleZone(_effectOwner, _effectOwner, 'deck');
          for (let i = 0; i < n; i++) {
            if (zone(_effectOwner, 'deck').getCount() > 0) moveCardBundle(_effectOwner, _effectOwner, 'deck', 'discard', 0, false, 'move');
          }
          msg(`  auto: shuffled the discard pile in, then milled ${n}`);
          break;
        }
        case 'discardRandomOpponentHandIfSupporter': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const hand = zone(oppSide, 'hand').array;
          if (!hand.length) {
            msg('  opponent hand is empty');
            break;
          }
          const pick = hand[Math.floor(Math.random() * hand.length)];
          const isSupporter = String(pick.subtype || pick.type || pick.supertype || '').toLowerCase().includes('supporter') ||
            String(pick.type || pick.supertype || '').toLowerCase().includes('trainer');
          if (isSupporter) {
            const i = zone(oppSide, 'hand').array.indexOf(pick);
            if (i >= 0) moveCardBundle(oppSide, oppSide, 'hand', 'discard', i, false, 'move');
            msg(`  auto: revealed ${pick.name} (Supporter) and discarded it`);
          } else {
            msg(`  auto: revealed ${pick.name} — not a Supporter, no effect`);
          }
          break;
        }
        case 'lostZoneCost': {
          const hand = zone(_effectOwner, 'hand').array;
          if (!hand.length) {
            msg('  no cards in hand to put in the Lost Zone');
            break;
          }
          openMultiPickOnly({
            title: `${card.name} — put ${step.count} card(s) from your hand in the Lost Zone`,
            candidates: hand,
            count: Math.min(step.count, hand.length),
            user: _effectOwner,
            onConfirm: (picks) => {
              for (const p of picks) {
                const i = zone(_effectOwner, 'hand').array.indexOf(p);
                if (i >= 0) moveCardBundle(_effectOwner, _effectOwner, 'hand', 'lostZone', i, false, 'move');
              }
              msg(`  auto: put ${picks.length} card(s) in the Lost Zone`);
            },
          });
          break;
        }
        case 'toolOrStadiumToLostZone': {
          const toolEntries = [];
          for (const side of ['self', 'opp']) {
            for (const zoneId of ['active', 'bench']) {
              const z = zone(side, zoneId);
              for (const parent of z.array.filter((c) => c && !c.image?.attached)) {
                for (const att of getAttachedCards(z, parent)) {
                  const s = `${att.type || ''} ${att.supertype || ''} ${att.name || ''}`.toLowerCase();
                  if (s.includes('tool') || s.includes('trainer')) toolEntries.push({ side, zoneId, card: att });
                }
              }
            }
          }
          const stadium = getStadium();
          const candidates = toolEntries.map((t) => t.card);
          if (stadium?.card) candidates.push(stadium.card);
          if (!candidates.length) {
            msg('  no Tool or Stadium in play to put in the Lost Zone');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a Tool or Stadium to put in the Lost Zone`,
            candidates,
            user: _effectOwner,
            onPick: (pick) => {
              const t = toolEntries.find((x) => x.card === pick);
              if (t) {
                const z = zone(t.side, t.zoneId);
                const i = z.array.indexOf(pick);
                if (i >= 0) moveCardBundle(t.side, t.side, t.zoneId, 'lostZone', i, false, 'move');
              } else if (stadium?.card === pick) {
                const owner = stadium.user || 'self';
                const zi = zone(owner, 'stadium').array.indexOf(pick);
                if (zi >= 0) moveCardBundle(owner, owner, 'stadium', 'lostZone', zi, false, 'move');
              }
              msg(`  auto: put ${pick.name} in the Lost Zone`);
            },
          });
          break;
        }
        case 'sendEnergyToLostZone': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const energies = collectAttachedForUser(oppSide, (att) => isEnergyCard(att));
          if (!energies.length) {
            msg('  no Energy attached to the opponent');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose a Special Energy to put in the Lost Zone`,
            candidates: energies.map((e) => e.card),
            user: _effectOwner,
            onPick: (energy) => {
              const loc = energies.find((e) => e.card === energy);
              if (!loc) return;
              const z = zone(oppSide, loc.zoneId);
              const i = z.array.indexOf(energy);
              if (i >= 0) moveCardBundle(oppSide, oppSide, loc.zoneId, 'lostZone', i, false, 'move');
              msg(`  auto: put ${energy.name} in the Lost Zone`);
            },
          });
          break;
        }
        case 'opponentDiscardToLostZonePerPokemon': {
          const oppSide = _effectOwner === 'self' ? 'opp' : 'self';
          const n = getInPlayPokemon(_effectOwner).filter((c) => {
            const t = String(c.type || c.types || '').toLowerCase();
            return t.includes('fire') || String(c.name || '').toLowerCase().includes('fire');
          }).length;
          let moved = 0;
          for (let k = 0; k < n; k++) {
            const discard = zone(oppSide, 'discard');
            if (discard.getCount() === 0) break;
            moveCardBundle(oppSide, oppSide, 'discard', 'lostZone', 0, false, 'move');
            moved++;
          }
          msg(`  auto: put ${moved} card(s) from the opponent's discard pile in the Lost Zone`);
          break;
        }
        case 'healAllOwnAndDiscardEnergy': {
          for (const mon of getInPlayPokemon(_effectOwner)) {
            const cur = parseInt(mon.image?.damageCounter?.textContent || '0', 10) || 0;
            if (cur > 0) _applyHealToCard(mon, cur, false, _effectOwner);
          }
          for (const zoneId of ['active', 'bench']) {
            const z = zone(_effectOwner, zoneId);
            for (const parent of z.array.filter((c) => c && !c.image?.attached)) {
              for (const att of [...getAttachedCards(z, parent)]) {
                if (isEnergyCard(att)) {
                  const ai = z.array.indexOf(att);
                  if (ai >= 0) moveCardBundle(_effectOwner, _effectOwner, zoneId, 'discard', ai, false, 'move');
                }
              }
            }
          }
          msg('  auto: healed your Pokémon and discarded their Energy');
          break;
        }
        case 'healOneDiscardEnergy': {
          const healable = getInPlayPokemon(_effectOwner).filter((c) => c?.hp);
          if (!healable.length) {
            msg('  no Pokémon to heal');
            break;
          }
          const cleanse = (mon, side) => {
            const cur = parseInt(mon.image?.damageCounter?.textContent || '0', 10) || 0;
            if (cur > 0) _applyHealToCard(mon, cur, false, side);
            const loc = pokemonZoneEntry(side, mon);
            if (!loc) return;
            const z = zone(side, loc.zoneId);
            for (const att of [...getAttachedCards(z, mon)]) {
              if (isEnergyCard(att)) {
                const ai = z.array.indexOf(att);
                if (ai >= 0) moveCardBundle(side, side, loc.zoneId, 'discard', ai, false, 'move');
              }
            }
          };
          if (healable.length === 1) {
            cleanse(healable[0], _effectOwner);
            msg('  auto: healed a Pokémon and discarded its Energy');
          } else {
            openPickOnly({
              title: `${card.name} — choose a Pokémon to heal`,
              candidates: healable,
              user: _effectOwner,
              onPick: (mon) => {
                cleanse(mon, _effectOwner);
                msg('  auto: healed a Pokémon and discarded its Energy');
              },
            });
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      msg(`  step ${step.type} failed — play manually`);
    }

    runAt(idx + 1);
  };

  runAt(startIndex);
}
