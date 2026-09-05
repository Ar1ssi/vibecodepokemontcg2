// Guided + deterministic execution for parsed trainer effect steps.
// Wired from rules-bridge.js when a Trainer card hits the board.

import { moveToDeckBottom } from '../../actions/zones/deck-actions.js';
import { flipCoin } from '../../actions/general/flip-coin.js';
import { moveCard } from '../../actions/move-card-bundle/move-card.js';
import { moveCardBundle } from '../../actions/move-card-bundle/move-card-bundle.js';
import { addDamageCounter, updateDamageCounter } from '../../actions/counters/damage-counter.js';
import { applyStatus } from './status.mjs';
import { ensureCardData } from './rules-state.mjs';

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
  return _zone(user, zoneId);
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
    onPick: () => _shuffleZone('self', 'self', 'deck'),
    onCancel: () => {
      msg('  kept all looked-at cards in deck order — shuffle your deck');
      _shuffleZone('self', 'self', 'deck');
      done?.();
    },
  });
  // onPick doesn't call done in openChoicePicker default path — wrap
  done?.();
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

    if (step.type === 'passive' || step.type === 'fossilItem') {
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
              _openChoicePicker({
                title: `Choose opponent's Pokémon (${step.count} damage)`,
                candidates: targets,
                zoneFrom: 'active',
                destination: 'hand',
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
            msg(`  auto: switch in ${bench[0].name} — drag to confirm`);
          } else if (bench.length > 1) {
            _openChoicePicker({
              title: `${card.name} — choose Benched Pokémon to switch in`,
              candidates: bench,
              zoneFrom: 'bench',
              destination: 'active',
            });
          }
          break;
        }
        case 'switchOwn': {
          const bench = zone('self', 'bench').array.filter((c) => c && !c.image?.attached);
          if (bench.length === 1) msg('  auto: switch with only benched Pokémon — drag to confirm');
          else if (bench.length > 1) {
            _openChoicePicker({
              title: `${card.name} — choose Benched Pokémon to switch with`,
              candidates: bench,
              zoneFrom: 'bench',
              destination: 'active',
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
            _openChoicePicker({
              title: `${card.name} — put opponent card on bottom of deck`,
              candidates: pool,
              zoneFrom: 'hand',
              destination: 'discard',
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
            _openChoicePicker({
              title: `${card.name} — discard Energy from opponent`,
              candidates: targets.map((t) => t.att),
              zoneFrom: 'active',
              destination: step.action === 'returnToHand' ? 'hand' : 'discard',
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
          if (targets.length) {
            _openChoicePicker({
              title: `${card.name} — return Pokémon to hand`,
              candidates: targets,
              zoneFrom: 'active',
              destination: 'hand',
              onPick: (t) => {
                const zoneId = zone('self', 'active').array.includes(t) ? 'active' : 'bench';
                const i = zone('self', zoneId).array.indexOf(t);
                if (i >= 0) moveCardBundle('self', 'self', zoneId, 'hand', i, false, 'move');
              },
            });
          }
          break;
        }
        case 'moveEnergy':
        case 'moveEnergyToActive':
          msg('  drag Energy between Pokémon to complete this effect');
          break;
        case 'evolveStage2':
        case 'devolve':
        case 'discardTools':
        case 'discardFromOpponent':
        case 'discardToolAndSpecialEnergy':
        case 'massDiscardAttached':
        case 'swapWithDiscard':
        case 'reshufflePrizes':
        case 'revealOpponentDeckBench':
        case 'opponentPrizeHandSwap':
        case 'switchOpponentOut':
          msg(`  ${step.type}: use the board — guided steps announced above`);
          break;
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
