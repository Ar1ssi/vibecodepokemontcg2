// Guided + deterministic execution for parsed trainer effect steps.
// Wired from rules-bridge.js when a Trainer card hits the board.

import { moveToDeckBottom } from '../../actions/zones/deck-actions.js';
import { flipCoin } from '../../actions/general/flip-coin.js';
import { moveCard } from '../../actions/move-card-bundle/move-card.js';
import { moveCardBundle } from '../../actions/move-card-bundle/move-card-bundle.js';
import { addDamageCounter, updateDamageCounter } from '../../actions/counters/damage-counter.js';
import { applyStatus } from './status.mjs';
import { ensureCardData, getStadium } from './rules-state.mjs';
import { normalizeStage, isRareCandyJump } from './evolution.mjs';
import { isEnergyCard, classifyEnergyEffect } from './energy-effects.mjs';

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
}

function msg(text) {
  _appendMessage('', text, 'announcement', false);
}

function countVariableDraw(source) {
  switch (source) {
    case 'ancientInPlay':
      return getInPlayPokemon('self').filter((c) =>
        String(c.name || '').toLowerCase().includes('ancient')
      ).length;
    case 'opponentBench':
      return getZoneSafe('opp', 'bench').getCount();
    case 'opponentMegaExInPlay':
      return getInPlayPokemon('opp').filter((c) =>
        /mega evolution.*\bex\b/i.test(String(c.name || '')) ||
        String(c.name || '').toLowerCase().includes('mega') &&
          String(c.name || '').toLowerCase().includes(' ex')
      ).length;
    case 'opponentHandPokemon':
      return getZoneSafe('opp', 'hand').array.filter((c) => _isPokemonCard(c)).length;
    default:
      return 0;
  }
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

function openPickOnly({ title, candidates, onPick, onCancel, user = 'self' }) {
  _openChoicePicker({
    title,
    candidates,
    user,
    pickOnly: true,
    onPick,
    onCancel,
  });
}

function openMultiPickOnly({ title, candidates, count, onConfirm, onCancel, user = 'self' }) {
  _openChoicePicker({
    title,
    candidates,
    user,
    pickOnly: true,
    multiSelect: true,
    requiredCount: Math.min(count, candidates.length),
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
      moveCard(user, user, zoneId, loc.zoneId, idx, loc.index);
      return;
    }
  }
}

function swapPokemonWithDiscard(inPlay, fromDiscard) {
  const playLoc = pokemonZoneEntry('self', inPlay);
  const discardIdx = zone('self', 'discard').array.indexOf(fromDiscard);
  if (!playLoc || discardIdx < 0) return;
  const playZone = playLoc.zoneId;
  const playIndex = playLoc.index;
  moveCardBundle('self', 'self', playZone, 'discard', playIndex, false, 'move');
  const newDiscardIdx = zone('self', 'discard').array.indexOf(fromDiscard);
  moveCardBundle('self', 'self', 'discard', playZone, newDiscardIdx >= 0 ? newDiscardIdx : 0, false, 'move');
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

function switchBenchToActive(user, benchCard) {
  const benchIdx = zone(user, 'bench').array.indexOf(benchCard);
  if (benchIdx < 0) return;
  moveCard(user, user, 'bench', 'active', benchIdx, 0);
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

function openCoinFlipOverlay(cardName, onResult) {
  document.getElementById('rulesCoinEffectOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rulesCoinEffectOverlay';
  overlay.className = 'rules-coin-call-overlay';
  overlay.innerHTML = `
    <div class="rules-coin-call-card">
      <p>${cardName} — flip a coin</p>
      <div class="rules-coin-call-buttons">
        <button type="button" data-face="heads">Heads</button>
        <button type="button" data-face="tails">Tails</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const finish = (face) => {
    flipCoin('self', face);
    overlay.remove();
    onResult(face);
  };
  overlay.querySelector('[data-face="heads"]').addEventListener('click', () => finish('heads'));
  overlay.querySelector('[data-face="tails"]').addEventListener('click', () => finish('tails'));
}

async function runSearchStep(card, searchStep, done) {
  if (!searchStep) {
    done?.();
    return;
  }
  // Nest Ball: single Basic → bench
  if (searchStep.destination === 'bench' && searchStep.what === 'Basic Pokémon' && (searchStep.count || 1) === 1) {
    const deck = zone('self', 'deck');
    const basics = [];
    for (const c of deck.array) {
      await ensureCardData(c);
      if ((c.stage || 'Basic') === 'Basic' && _isPokemonCard(c)) basics.push(c);
    }
    if (basics.length === 1) {
      const idx = deck.array.indexOf(basics[0]);
      moveCardBundle('self', 'self', 'deck', 'bench', idx, false, 'move');
      msg(`  auto: benched ${basics[0].name}`);
      _shuffleZone('self', 'self', 'deck');
      done?.();
      return;
    }
    if (basics.length === 0) {
      msg('  no Basic Pokémon in deck');
      done?.();
      return;
    }
  }
  _openDeckSearchWindow(`${card.name} lets you search your deck`);
  msg(`  ${card.name} — opening card select…`);
  const deck = zone('self', 'deck');
  const matches = [];
  for (const c of deck.array) {
    await ensureCardData(c);
    if (_matchesSearch(c, searchStep.what)) matches.push(c);
  }
  const usingFallback = matches.length === 0 && deck.array.length > 0;
  const pool = usingFallback ? deck.array : matches;
  if (pool.length === 0) {
    msg('  no cards left in deck');
    done?.();
    return;
  }
  const shuffleAfter = () => _shuffleZone('self', 'self', 'deck');
  const toBench = searchStep.destination === 'bench';
  const toAttach = searchStep.destination === 'attach';

  const attachEnergyToPokemon = (energyCard) => {
    const targets = getInPlayPokemon('self');
    if (targets.length === 0) {
      msg('  no Pokémon to attach to — put energy in hand instead');
      const idx = zone('self', 'deck').array.indexOf(energyCard);
      if (idx >= 0) moveCardBundle('self', 'self', 'deck', 'hand', idx, false, 'move');
      shuffleAfter();
      done?.();
      return;
    }
    if (targets.length === 1) {
      const target = targets[0];
      const zoneId = zone('self', 'active').array.includes(target) ? 'active' : 'bench';
      const targetIndex = zone('self', zoneId).array.indexOf(target);
      const idx = zone('self', 'deck').array.indexOf(energyCard);
      if (idx >= 0) moveCard('self', 'self', 'deck', zoneId, idx, targetIndex);
      msg(`  auto: attached ${energyCard.name} to ${target.name}`);
      shuffleAfter();
      done?.();
      return;
    }
    _openChoicePicker({
      title: `${card.name} — choose a Pokémon to attach ${energyCard.name} to`,
      candidates: targets,
      zoneFrom: 'active',
      destination: 'hand',
      onPick: (target) => {
        const zoneId = zone('self', 'active').array.includes(target) ? 'active' : 'bench';
        const targetIndex = zone('self', zoneId).array.indexOf(target);
        const idx = zone('self', 'deck').array.indexOf(energyCard);
        if (idx >= 0) moveCard('self', 'self', 'deck', zoneId, idx, targetIndex);
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

  if ((searchStep.count || 1) > 1) {
    _openChoicePicker({
      title: `${card.name} — choose ${searchStep.count} cards${usingFallback ? ' (full deck)' : ''}`,
      candidates: pool,
      zoneFrom: 'deck',
      destination: toBench ? 'bench' : 'hand',
      multiSelect: true,
      requiredCount: searchStep.count,
      onConfirm: (selected) => {
        for (const s of selected) {
          const idx = zone('self', 'deck').array.indexOf(s);
          if (idx >= 0) {
            moveCardBundle('self', 'self', 'deck', toBench ? 'bench' : 'hand', idx, false, 'move');
          }
        }
        msg(`  ${selected.map((s) => s.name).join(', ')} → ${toBench ? 'Bench' : 'hand'}`);
        shuffleAfter();
        done?.();
      },
      onCancel: () => {
        msg('  search canceled — shuffle your deck');
        shuffleAfter();
        done?.();
      },
    });
    return;
  }

  _openChoicePicker({
    title: `${card.name} — ${toBench ? 'put a card on Bench' : toAttach ? 'choose Energy to attach' : 'take a card to hand'}${usingFallback ? ' (full deck)' : ''}`,
    candidates: pool,
    zoneFrom: 'deck',
    destination: toBench ? 'bench' : 'hand',
    onPick: (picked) => {
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

async function runLookStep(card, step, fromBottom, done) {
  _openDeckSearchWindow(`${card.name} — look at ${fromBottom ? 'bottom' : 'top'} of deck`);
  const deck = zone('self', 'deck');
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
    onPick: () => {
      _shuffleZone('self', 'self', 'deck');
      done?.();
    },
    onCancel: () => {
      msg('  kept all looked-at cards in deck order — shuffle your deck');
      _shuffleZone('self', 'self', 'deck');
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
    msg(`  auto: ${user === 'self' ? 'you' : 'opponent'} discarded ${toDiscard} card(s)`);
    return;
  }
  _openChoicePicker({
    title: `Discard ${toDiscard} card(s) from ${user === 'self' ? 'your' : "opponent's"} hand`,
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

export function runTrainerSteps(card, steps, startIndex = 0, onComplete) {
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
      const candidates = zone('self', 'hand').array.filter((c) => c !== card);
      _openChoicePicker({
        title: `${card.name} — discard ${step.count} cards to pay the cost`,
        candidates,
        zoneFrom: 'hand',
        destination: 'discard',
        multiSelect: true,
        requiredCount: step.count,
        onConfirm: (selected) => {
          for (const s of selected) {
            const i = zone('self', 'hand').array.indexOf(s);
            if (i >= 0) moveCardBundle('self', 'self', 'hand', 'discard', i, false, 'move');
          }
          msg(`  cost paid: discarded ${selected.map((s) => s.name).join(', ')}`);
          runAt(idx + 1);
        },
        onCancel: () => msg('  cost not paid — effect canceled'),
      });
      return;
    }

    if (step.type === 'coinFlip') {
      openCoinFlipOverlay(card.name, (face) => {
        const branch = normalizeCoinBranch(face === 'heads' ? step.heads : step.tails);
        if (branch.length === 0) {
          msg(`  coin: ${face} — no effect`);
          runAt(idx + 1);
          return;
        }
        runTrainerSteps(card, branch, 0, () => runAt(idx + 1));
      });
      return;
    }

    try {
      switch (step.type) {
        case 'discardHandThenDraw': {
          while (zone('self', 'hand').getCount() > 0) {
            moveCardBundle('self', 'self', 'hand', 'discard', 0, false, 'move');
          }
          for (let i = 0; i < step.count; i++) {
            if (zone('self', 'deck').getCount() > 0) moveCardBundle('self', 'self', 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: discarded hand, drew ${step.count}`);
          break;
        }
        case 'shuffleHandThenDraw': {
          const handCount0 = zone('self', 'hand').getCount();
          for (let i = 0; i < handCount0; i++) moveCardBundle('self', 'self', 'hand', 'deck', 0, false, 'move');
          let drawCount = step.count;
          const prizesRemaining = Math.max(0, 6 - (_prizeState?.self?.taken || 0));
          if (step.bonusCount && step.bonusWhen === 'prizesRemaining==6' && prizesRemaining === 6) {
            drawCount = step.bonusCount;
          }
          for (let i = 0; i < drawCount; i++) {
            if (zone('self', 'deck').getCount() > 0) moveCardBundle('self', 'self', 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: shuffled hand in, drew ${drawCount}`);
          break;
        }
        case 'countShuffleDrawPlus': {
          const n = zone('self', 'hand').getCount();
          for (let i = 0; i < n; i++) moveCardBundle('self', 'self', 'hand', 'deck', 0, false, 'move');
          const drawCount = n + 1;
          for (let i = 0; i < drawCount; i++) {
            if (zone('self', 'deck').getCount() > 0) moveCardBundle('self', 'self', 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: shuffled ${n} cards in, drew ${drawCount}`);
          break;
        }
        case 'ionoShuffle': {
          for (const who of ['self', 'opp']) {
            const n = zone(who, 'hand').getCount();
            for (let i = 0; i < n; i++) moveCardBundle(who, who, 'hand', 'deck', 0, false, 'move');
          }
          msg('  auto: both players shuffled hands into decks');
          break;
        }
        case 'draw':
          for (let i = 0; i < step.count; i++) {
            if (zone('self', 'deck').getCount() > 0) moveCardBundle('self', 'self', 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: drew ${step.count}`);
          break;
        case 'drawUntil': {
          const target = Number(step.target);
          let drew = 0;
          while (zone('self', 'hand').getCount() < target && zone('self', 'deck').getCount() > 0) {
            moveCardBundle('self', 'self', 'deck', 'hand', 0, false, 'move');
            drew++;
          }
          msg(`  auto: drew ${drew} until ${target} in hand`);
          break;
        }
        case 'variableDraw': {
          const n = countVariableDraw(step.source);
          for (let i = 0; i < n; i++) {
            if (zone('self', 'deck').getCount() > 0) moveCardBundle('self', 'self', 'deck', 'hand', 0, false, 'move');
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
          const hand = zone('self', 'hand').array.filter((c) => c !== card);
          if (hand.length < step.count) {
            msg('  not enough cards in hand — skipped');
            break;
          }
          if (hand.length === step.count) {
            for (let i = 0; i < step.count; i++) moveToDeckBottom('self', 'self', 'hand', 0);
            msg(`  auto: put ${step.count} on bottom of deck`);
            break;
          }
          _openChoicePicker({
            title: `${card.name} — put ${step.count} cards on bottom of deck`,
            candidates: hand,
            zoneFrom: 'hand',
            destination: 'discard',
            multiSelect: true,
            requiredCount: step.count,
            onConfirm: (picks) => {
              for (const pick of picks) {
                const i = zone('self', 'hand').array.indexOf(pick);
                if (i >= 0) moveToDeckBottom('self', 'self', 'hand', i);
              }
              msg(`  put ${picks.length} on bottom`);
              runAt(idx + 1);
            },
            onCancel: () => msg('  canceled'),
          });
          return;
        }
        case 'opponentShuffleHandDraw': {
          const n = zone('opp', 'hand').getCount();
          for (let i = 0; i < n; i++) moveToDeckBottom('opp', 'opp', 'hand', 0);
          for (let i = 0; i < step.count; i++) {
            if (zone('opp', 'deck').getCount() > 0) moveCardBundle('opp', 'opp', 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: opponent shuffled hand to deck bottom, drew ${step.count}`);
          break;
        }
        case 'millSelf':
          for (let i = 0; i < step.count; i++) {
            if (zone('self', 'deck').getCount() > 0) moveCardBundle('self', 'self', 'deck', 'discard', 0, false, 'move');
          }
          msg(`  auto: milled top ${step.count} to discard`);
          break;
        case 'healAmount': {
          const isActiveOnly = step.target === 'Active Pokémon';
          const candidates = isActiveOnly
            ? zone('self', 'active').array.filter((c) => c?.hp)
            : getInPlayPokemon('self').filter((c) => c?.hp);
          if (candidates.length === 0) msg('  no Pokémon to heal');
          else if (isActiveOnly || candidates.length === 1) _applyHealToCard(candidates[0], step.amount, step.cure);
          else {
            _openHealPicker({
              title: `${card.name} — choose a Pokémon to heal`,
              candidates,
              amount: step.amount,
              cure: step.cure,
            });
          }
          break;
        }
        case 'heal': {
          const candidates = getInPlayPokemon('self').filter((c) => matchesHealTarget(c, step.target));
          if (!candidates.length) {
            msg('  no valid Pokémon to heal');
            break;
          }
          const doFullHeal = (target) => {
            const loc = pokemonZoneEntry('self', target);
            if (!loc) return;
            const current = parseInt(target.image?.damageCounter?.textContent || '0', 10) || 0;
            if (current <= 0) {
              msg(`  ${target.name} has no damage to heal`);
              return;
            }
            _applyHealToCard(target, current, false);
            const z = zone('self', loc.zoneId);
            for (const att of [...getAttachedCards(z, target)]) {
              if (isEnergyCard(att)) {
                const ai = z.array.indexOf(att);
                if (ai >= 0) moveCardBundle('self', 'self', loc.zoneId, 'hand', ai, false, 'move');
              }
            }
            msg(`  auto: healed all damage from ${target.name}`);
          };
          if (candidates.length === 1) doFullHeal(candidates[0]);
          else {
            openPickOnly({
              title: `${card.name} — choose Pokémon to heal`,
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
          }
          break;
        case 'damageCounters': {
          if (step.target.includes('opponent')) {
            const targets = getInPlayPokemon('opp');
            if (targets.length === 1) {
              const zoneId = zone('opp', 'active').array.includes(targets[0]) ? 'active' : 'bench';
              placeDamageCounters('opp', zoneId, zone('opp', zoneId).array.indexOf(targets[0]), step.count);
            } else if (targets.length > 1) {
              openPickOnly({
                title: `Choose opponent's Pokémon (${step.count} damage)`,
                candidates: targets,
                user: 'opp',
                onPick: (t) => {
                  const zoneId = zone('opp', 'active').array.includes(t) ? 'active' : 'bench';
                  placeDamageCounters('opp', zoneId, zone('opp', zoneId).array.indexOf(t), step.count);
                },
              });
            }
          } else {
            placeDamageCounters('self', 'active', 0, step.count);
          }
          break;
        }
        case 'searchDeck':
          await runSearchStep(card, step, () => runAt(idx + 1));
          return;
        case 'lookAtTop':
          await runLookStep(card, step, false, () => runAt(idx + 1));
          return;
        case 'lookAtBottom':
          await runLookStep(card, step, true, () => runAt(idx + 1));
          return;
        case 'recursion': {
          const discard = zone('self', 'discard');
          const matches = discard.array.filter((c) => {
            const isPokemon = _isPokemonCard(c);
            const isEnergy = String(c.name || '').toLowerCase().includes('energy');
            return isPokemon || isEnergy;
          });
          if (matches.length) {
            _openChoicePicker({
              title: `${card.name} — take from discard`,
              candidates: matches,
              zoneFrom: 'discard',
              destination: 'hand',
            });
          }
          break;
        }
        case 'shuffleFromDiscard': {
          const discard = zone('self', 'discard');
          const choices = step.choices || [{ what: step.what, count: step.count }];
          const runChoice = (choiceIdx) => {
            if (choiceIdx >= choices.length) {
              _shuffleZone('self', 'self', 'deck');
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
              zoneFrom: 'discard',
              destination: 'deck',
              multiSelect: pool.length > 1,
              requiredCount: Math.min(choice.count, pool.length),
              onConfirm: (picked) => {
                const list = Array.isArray(picked) ? picked : [picked];
                for (const p of list) {
                  const i = zone('self', 'discard').array.indexOf(p);
                  if (i >= 0) moveCardBundle('self', 'self', 'discard', 'deck', i, false, 'move');
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
          const discard = zone('self', 'discard');
          const energies = discard.array.filter((c) => String(c.name || '').toLowerCase().includes('energy'));
          const max = step.type === 'attachMultipleFromDiscard' ? step.count : 1;
          if (!energies.length) {
            msg('  no Energy in discard');
            break;
          }
          _openChoicePicker({
            title: `${card.name} — attach Energy from discard`,
            candidates: energies.slice(0, max),
            zoneFrom: 'discard',
            destination: 'hand',
            onPick: (energy) => {
              const targets = getInPlayPokemon('self');
              if (targets.length === 1) {
                const t = targets[0];
                const zoneId = zone('self', 'active').array.includes(t) ? 'active' : 'bench';
                const ti = zone('self', zoneId).array.indexOf(t);
                const ei = zone('self', 'discard').array.indexOf(energy);
                if (ei >= 0) moveCard('self', 'self', 'discard', zoneId, ei, ti);
              } else {
                _openChoicePicker({
                  title: 'Choose Pokémon to attach to',
                  candidates: targets,
                  zoneFrom: 'active',
                  destination: 'hand',
                  onPick: (t) => {
                    const zoneId = zone('self', 'active').array.includes(t) ? 'active' : 'bench';
                    const ti = zone('self', zoneId).array.indexOf(t);
                    const ei = zone('self', 'discard').array.indexOf(energy);
                    if (ei >= 0) moveCard('self', 'self', 'discard', zoneId, ei, ti);
                  },
                });
              }
            },
          });
          break;
        }
        case 'switchOpponent': {
          const bench = zone('opp', 'bench').array.filter((c) => c && !c.image?.attached);
          if (bench.length === 1) {
            switchBenchToActive('opp', bench[0]);
          } else if (bench.length > 1) {
            openPickOnly({
              title: `${card.name} — choose Benched Pokémon to switch in`,
              candidates: bench,
              user: 'opp',
              onPick: (b) => switchBenchToActive('opp', b),
            });
          }
          break;
        }
        case 'switchOwn': {
          const bench = zone('self', 'bench').array.filter((c) => c && !c.image?.attached);
          if (bench.length === 1) {
            switchBenchToActive('self', bench[0]);
          } else if (bench.length > 1) {
            openPickOnly({
              title: `${card.name} — choose Benched Pokémon to switch with`,
              candidates: bench,
              onPick: (b) => switchBenchToActive('self', b),
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
        case 'opponentDiscardUntil':
          discardFromHandUntil('opp', step.count);
          break;
        case 'eachPlayerDiscardUntil':
          if (step.opponentFirst) discardFromHandUntil('opp', step.count);
          discardFromHandUntil('self', step.count);
          break;
        case 'opponentCountShuffleDraw': {
          const n = zone('opp', 'hand').getCount();
          for (let i = 0; i < n; i++) moveToDeckBottom('opp', 'opp', 'hand', 0);
          for (let i = 0; i < n; i++) {
            if (zone('opp', 'deck').getCount() > 0) moveCardBundle('opp', 'opp', 'deck', 'hand', 0, false, 'move');
          }
          msg(`  auto: opponent shuffled ${n} to deck bottom, drew ${n}`);
          break;
        }
        case 'discardEnergyFromOpponent': {
          const targets = [];
          for (const z of ['active', 'bench']) {
            for (const parent of zone('opp', z).array.filter((c) => !c.image?.attached)) {
              for (const att of getAttachedCards(zone('opp', z), parent)) {
                if (String(att.name || '').toLowerCase().includes('energy')) targets.push({ parent, att, zoneId: z });
              }
            }
          }
          if (step.scope === 'each Pokémon') {
            for (const t of targets.slice(0, 8)) {
              const idx = zone('opp', t.zoneId).array.indexOf(t.att);
              const dest = step.action === 'returnToHand' ? 'hand' : 'discard';
              if (idx >= 0) moveCardBundle('opp', 'opp', t.zoneId, dest, idx, false, 'move');
            }
            msg(`  auto: removed Special Energy from each Pokémon`);
          } else if (targets.length) {
            openPickOnly({
              title: `${card.name} — discard Energy from opponent`,
              candidates: targets.map((t) => t.att),
              user: 'opp',
              onPick: (att) => {
                for (const z of ['active', 'bench']) {
                  const idx = zone('opp', z).array.indexOf(att);
                  if (idx >= 0) {
                    const dest = step.action === 'returnToHand' ? 'hand' : 'discard';
                    moveCardBundle('opp', 'opp', z, dest, idx, false, 'move');
                  }
                }
              },
            });
          }
          break;
        }
        case 'returnPokemonToHand': {
          const targets = getInPlayPokemon('self');
          if (!targets.length) break;
          openPickOnly({
            title: `${card.name} — return Pokémon to hand`,
            candidates: targets,
            onPick: (t) => {
              const loc = pokemonZoneEntry('self', t);
              if (!loc) return;
              if (!step.keepAttached) {
                const z = zone('self', loc.zoneId);
                for (const att of [...getAttachedCards(z, t)]) {
                  const ai = z.array.indexOf(att);
                  if (ai >= 0) moveCardBundle('self', 'self', loc.zoneId, 'discard', ai, false, 'move');
                }
              }
              const i = zone('self', loc.zoneId).array.indexOf(t);
              if (i >= 0) moveCardBundle('self', 'self', loc.zoneId, 'hand', i, false, 'move');
              msg(`  auto: returned ${t.name} to hand`);
            },
          });
          break;
        }
        case 'fossilItem': {
          const bench = zone('self', 'bench');
          if (bench.getCount() >= 8) {
            msg('  bench full — play fossil manually');
            break;
          }
          const boardIdx = zone('self', 'board').array.indexOf(card);
          if (boardIdx >= 0) {
            moveCardBundle('self', 'self', 'board', 'bench', boardIdx, false, 'move');
            msg(`  auto: played ${card.name} as Basic Pokémon on Bench`);
          }
          break;
        }
        case 'moveEnergy': {
          const energies = collectAttachedForUser('self', (att) => isBasicEnergyCard(att));
          if (!energies.length) {
            msg('  no Basic Energy attached to move');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose Basic Energy to move`,
            candidates: energies.map((e) => e.card),
            onPick: (energy) => {
              const src = energies.find((e) => e.card === energy);
              const targets = getInPlayPokemon('self').filter((p) => p !== src?.parent);
              if (!targets.length) return;
              openPickOnly({
                title: `${card.name} — attach ${energy.name} to which Pokémon?`,
                candidates: targets,
                onPick: (target) => {
                  attachEnergyCard('self', energy, target);
                  msg(`  auto: moved ${energy.name} to ${target.name}`);
                },
              });
            },
          });
          break;
        }
        case 'moveEnergyToActive': {
          const fromBench = [];
          for (const parent of zone('self', 'bench').array.filter((c) => c && !c.image?.attached)) {
            for (const att of getAttachedCards(zone('self', 'bench'), parent)) {
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
            onConfirm: (picked) => {
              const active = zone('self', 'active').array[0];
              if (!active) return;
              for (const energy of picked) {
                attachEnergyCard('self', energy, active);
              }
              msg(`  auto: moved ${picked.length} Energy to Active`);
            },
          });
          break;
        }
        case 'evolveStage2': {
          const basics = getInPlayPokemon('self').filter((c) => (normalizeStage(c.stage) || 'Basic') === 'Basic');
          if (!basics.length) {
            msg('  no Basic Pokémon in play');
            break;
          }
          openPickOnly({
            title: `${card.name} — choose Basic to evolve`,
            candidates: basics,
            onPick: async (base) => {
              const hand = zone('self', 'hand');
              const options = [];
              for (const c of hand.array) {
                await ensureCardData(c);
                if (_isPokemonCard(c) && isRareCandyJump(base, c)) options.push(c);
              }
              if (!options.length) {
                msg('  no Stage 2 in hand that evolves from that Basic');
                return;
              }
              openPickOnly({
                title: `${card.name} — choose Stage 2`,
                candidates: options,
                onPick: async (evo) => {
                  const loc = pokemonZoneEntry('self', base);
                  const handIdx = hand.array.indexOf(evo);
                  if (!loc || handIdx < 0) return;
                  await moveCard('self', 'self', 'hand', loc.zoneId, handIdx, loc.index);
                  msg(`  auto: Rare Candy — ${base.name} → ${evo.name}`);
                },
              });
            },
          });
          break;
        }
        case 'devolve': {
          const psychicOnly = String(step.target || '').includes('{P}');
          findEvolvedPokemon('self', psychicOnly).then((targets) => {
            if (!targets.length) {
              msg('  no evolved Pokémon to devolve');
              return;
            }
            openPickOnly({
              title: `${card.name} — choose Pokémon to devolve`,
              candidates: targets,
              onPick: (t) => devolvePokemon('self', t),
            });
          });
          break;
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
            openPickOnly({
              title: `${card.name} — choose opponent's Pokémon`,
              candidates: candidates.map((c) => c.parent),
              user: 'self',
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
            let n = 0;
            for (const entry of collectAttachedForUser('opp', (att) => true)) {
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
          const inPlay = getInPlayPokemon('self').filter((c) => matchesSwapFilter(c, step.filter));
          openPickOnly({
            title: `${card.name} — choose in-play Pokémon`,
            candidates: inPlay,
            onPick: (play) => {
              const disc = zone('self', 'discard').array.filter((c) => matchesSwapFilter(c, step.filter));
              if (!disc.length) {
                msg('  no matching Pokémon in discard');
                return;
              }
              openPickOnly({
                title: `${card.name} — choose discard Pokémon to swap`,
                candidates: disc,
                onPick: (d) => swapPokemonWithDiscard(play, d),
              });
            },
          });
          break;
        }
        case 'reshufflePrizes': {
          const n = zone('self', 'prizes').getCount();
          if (n === 0) break;
          for (let i = 0; i < n; i++) moveToDeckBottom('self', 'self', 'prizes', 0);
          _shuffleZone('self', 'self', 'deck');
          for (let i = 0; i < n; i++) {
            if (zone('self', 'deck').getCount() > 0) moveCard('self', 'self', 'deck', 'prizes', 0);
          }
          msg(`  auto: reshuffled ${n} Prize cards`);
          break;
        }
        case 'revealOpponentDeckBench': {
          const deck = zone('opp', 'deck');
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
              user: 'self',
              onPick: (pick) => {
                const idx = deck.array.indexOf(pick);
                if (idx >= 0) moveCardBundle('opp', 'opp', 'deck', 'bench', idx, false, 'move');
              },
              onCancel: () => _shuffleZone('opp', 'opp', 'deck'),
            });
          })();
          break;
        }
        case 'opponentPrizeHandSwap': {
          const prizes = zone('opp', 'prizes').array;
          const facedown = prizes.filter((c) => c.image?.faceDown);
          const hand = zone('opp', 'hand').array;
          if (!facedown.length || !hand.length) {
            msg('  cannot swap — missing face-down Prize or hand card');
            break;
          }
          openPickOnly({
            title: `${card.name} — turn a face-down Prize face up`,
            candidates: facedown,
            user: 'self',
            onPick: (prize) => {
              if (prize.image) prize.image.faceDown = false;
              const randomHand = hand[Math.floor(Math.random() * hand.length)];
              openPickOnly({
                title: `${card.name} — swap with ${randomHand.name}? (click Prize to swap)`,
                candidates: [prize],
                user: 'self',
                onPick: () => {
                  const pi = zone('opp', 'prizes').array.indexOf(prize);
                  const hi = zone('opp', 'hand').array.indexOf(randomHand);
                  if (pi < 0 || hi < 0) return;
                  moveCard('opp', 'opp', 'prizes', 'hand', pi);
                  moveCard('opp', 'opp', 'hand', 'prizes', hi);
                  msg('  auto: swapped Prize and hand card');
                },
                onCancel: () => msg('  kept cards — no swap'),
              });
            },
          });
          break;
        }
        case 'switchOpponentOut': {
          const active = zone('opp', 'active').array[0];
          const benchBefore = zone('opp', 'bench').array.filter((c) => c && !c.image?.attached);
          if (!active || !benchBefore.length) {
            msg('  opponent has no Benched Pokémon to switch');
            break;
          }
          moveCardBundle('opp', 'opp', 'active', 'bench', 0, false, 'move');
          const benchAfter = zone('opp', 'bench').array.filter((c) => c && !c.image?.attached);
          if (benchAfter.length === 1) {
            switchBenchToActive('opp', benchAfter[0]);
          } else {
            openPickOnly({
              title: `${card.name} — opponent chooses new Active`,
              candidates: benchAfter,
              user: 'opp',
              onPick: (b) => switchBenchToActive('opp', b),
            });
          }
          msg('  auto: switched opponent Active to Bench');
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
