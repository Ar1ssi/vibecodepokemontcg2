import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { resetAbilityCounters } from '../counters/reset-counters.js';
import { discardBoard } from '../general/board-actions.js';
import { rulesState, canPerformAction, markAttacked, endTurn, ensureCardData, markAbilityUsed, abilityUsed, markStadiumUsed, stadiumUsed, getStadium } from '../../setup/rules/rules-state.mjs';
import { classifyAbility, searchTargetType } from '../../setup/rules/ability-effects.mjs';
import { computeAttackDamage, canPayAttackCost } from '../../setup/rules/attack-engine.mjs';
import { classifyEnergyEffect, effectiveEnergyType, pokemonHasRedirectEnergy, pokemonHasProtectEnergy, applyProtectCap } from '../../setup/rules/energy-effects.mjs';
import {
  parseDamagePrevention,
  applyDamagePrevention,
  passiveCostDiscount,
  applyCostDiscount,
  combinedDamagePrevention,
  combinedPassiveCostDiscount,
  parseStatusInflict,
  parseMoveDamage,
  parseLookAtTop,
  parseRecursionFromDiscard,
} from '../../setup/rules/ability-executors.mjs';
import { parseAbility } from '../../setup/rules/abilities.mjs';
import { canEvolve, markEvolvedThisTurn } from '../../setup/rules/evolution.mjs';
import { parseAttackDamage, healTarget, planHeal, planBenchTarget, drawCount, attachEnergyCount, switchClause, oncePerTurnClause, allBenchDamage, discardCost, shuffleDrawClause, discardEnergyScaling, parseAttackSearchClause, resolveAttackText } from '../../setup/rules/damage-parser.mjs';
import { draw } from '../zones/deck-actions.js';
import { takePrizes, takePrizesByIndex } from '../zones/prizes-actions.js';
import { shuffleAndDraw } from '../zones/hand-actions.js';
import { handleKO, promotionGuidance, planPromotion } from '../../setup/rules/ko-flow.mjs';
import { markRetreated } from '../../setup/rules/retreat.mjs';
import { moveCard } from '../move-card-bundle/move-card.js';
import { moveCardBundle } from '../move-card-bundle/move-card-bundle.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { shuffleZone } from '../zones/shuffle-zone.js';
import {
  canAct,
  getStatus,
  resolveWake,
  resolveConfusedAttack,
  statusAllowsRetreat,
  clearStatuses,
  applyStatus,
  parseStatusFromAttackText,
  resolveTurnBoundary,
} from '../../setup/rules/status.mjs';
import { addDamageCounter, updateDamageCounter, removeDamageCounter } from '../counters/damage-counter.js';
import { applyStadiumEffect, parseStadiumOncePerTurn, parseStadiumSetupDraw, parseStadiumDamagePrevention, parseStadiumDamagePreventionDetail, stadiumPreventionApplies, getStadiumDamageReduction, getStadiumAttackDamageBonus, getStadiumAttackCostIncrease, getStadiumCheckupPoisonBonus, stadiumAbilityBlocked, isStadiumRetreatPrevention, isStadiumHandProtect, parseStadiumCostModifier, effectiveHp, getStadiumRetreatCost, stadiumBlocksStatusApplication, stadiumBlocksToolEffects, stadiumOnceConditionMet, matchesStadiumSearch } from '../../setup/rules/stadium-effects.mjs';

const abilityBlockedByStadium = (user, target) => {
  if (!stadiumAbilityBlocked(target)) return false;
  appendMessage(
    user,
    `🏟️ ${getStadium()?.card?.name || 'The Stadium'} — ${target.name || 'This Pokémon'}'s Abilities are suppressed.`,
    'announcement',
    false
  );
  return true;
};

// Safe self-damage accumulation: addDamageCounter would clobber any damage
// already on the card, so accumulate textContent when a counter exists.
const placeSelfDamage = (user, zoneId, index, damage) => {
  const target = getZone(user, zoneId).array[index];
  if (!target) return;
  if (target.image?.damageCounter) {
    const current =
      parseInt(target.image.damageCounter.textContent || '0', 10) || 0;
    updateDamageCounter(user, zoneId, index, current + damage);
  } else {
    addDamageCounter(user, zoneId, index, damage);
  }
};

// Rules mode: an attack (or pass) ends the turn — advance rulesState and
// refresh the HUD/panel via the same event updateTurnBanner() uses.
const endTurnWithBanner = (user) => {
  // SOLO turn-boundary: resolve this player's active status (poison/burn
  // damage, asleep/paralyzed clear) BEFORE the turn advances. Shared by both
  // attack() and pass(), so pass is covered too. Mirrors the +Turn button
  // path in rules-bridge.js; solo never goes through rules-bridge, so there is
  // no double-resolve.
  const active = getZone(user, 'active').array[0];
  if (active) {
    const key = active.image?.dataset?.cardId || active.name;
    const checkupBonus = getStadiumCheckupPoisonBonus(active, user);
    const boundary = resolveTurnBoundary(user, key, Math.random, {
      checkupPoisonBonus: checkupBonus,
    });
    if (boundary.damage > 0) placeSelfDamage(user, 'active', 0, boundary.damage);
    for (const note of boundary.notes) appendMessage('', note, 'announcement', false);
  }
  const next = endTurn(user);
  appendMessage('', `Turn passes to ${next === 'self' ? 'P1' : 'P2'}`, 'announcement', false);
  document.dispatchEvent(new CustomEvent('rules-turn-began', { detail: { player: rulesState.turnPlayer } }));
};

export const attack = async (user, emit = true, attackIndex = 0) => {
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'attack', []);
    return;
  }

  if (rulesState.enabled) {
    const check = canPerformAction({ user, action: 'attack' });
    if (!check.allowed) {
      appendMessage(user, `⛔ ${check.reason}`, 'announcement', false);
      return;
    }

    // Statuses that gate attacking: asleep (wake coin), paralyzed (blocked),
    // confused (pre-attack coin; tails = 3 damage counters, attack fizzles).
    const active = getZone(user, 'active').array[0];
    if (active) {
      const key = active.image?.dataset?.cardId || active.name;
      const gate = canAct(user, key);
      if (!gate.can) {
        if (getStatus(user, key)?.asleep) {
          const wake = resolveWake(user, key);
          if (!wake.woke) {
            appendMessage(
              user,
              '💤 Tails — still asleep, the attack is cancelled.',
              'announcement',
              false
            );
            return; // turn does NOT end; player can retry or pass
          }
          appendMessage(user, '☀️ Heads — the Pokémon is awake!', 'announcement', false);
        } else {
          appendMessage(user, `⛔ ${gate.reason}`, 'announcement', false);
          return; // paralyzed — turn does NOT end
        }
      }
      if (getStatus(user, key)?.confused) {
        const result = resolveConfusedAttack(user, key);
        if (!result.proceeds) {
          placeSelfDamage(user, 'active', 0, result.damage);
          appendMessage(
            user,
            '🌀 Tails — the attack fizzles, 3 damage counters are placed.',
            'announcement',
            false
          );
          // A failed attack is still an attack: the turn ends (below).
        } else {
          appendMessage(
            user,
            '🌀 Heads — the attack proceeds despite confusion.',
            'announcement',
            false
          );
        }
      }
    }
    // ── Attack execution: energy cost, damage, KO ──
    const oppPlayer = user === 'self' ? 'opp' : 'self';
    const oppActive = getZone(oppPlayer, 'active').array[0];
    if (active && oppActive) {
      await ensureCardData(active);
      let atk = active.attacks?.[attackIndex] || active.attacks?.[0];
      if (atk) {
        const atkText = resolveAttackText(active, atk);
        if (atkText) atk = { ...atk, text: atkText };
        // Once-per-turn (taxonomy §D once-per-turn family): if this attack
        // carries an "Once during your turn" clause and it was already used
        // this turn, fizzle before any cost/damage is applied. Consistent
        // with the other invalid-attack bails (not-enough-energy, paralyzed):
        // the turn does NOT end, so the player can retry another attack or
        // pass. On success we mark it used (below) via the shared per-turn
        // flag map that resetTurnFlags() clears each turn.
        if (rulesState.enabled && oncePerTurnClause(atk.text)) {
          if (abilityUsed(user, active)) {
            appendMessage(
              user,
              `⛔ ${atk.name} was already used this turn (once per turn).`,
              'announcement',
              false
            );
            return; // turn does NOT end; player can retry or pass
          }
        }

        // Energy cost check
        const activeZone = getZone(user, 'active');
        const attachedEnergies = activeZone.array.filter(
          (c) => c.type === 'Energy' && c.image?.relative === active.image
        );
        const energyTypes = [];
        for (const e of attachedEnergies) {
          await ensureCardData(e);
          const type = e.types?.[0] ||
            (/fire/i.test(e.name || '') ? 'Fire'
            : /water/i.test(e.name || '') ? 'Water'
            : /grass/i.test(e.name || '') ? 'Grass'
            : /lightning/i.test(e.name || '') ? 'Lightning'
            : /psychic/i.test(e.name || '') ? 'Psychic'
            : /fighting/i.test(e.name || '') ? 'Fighting'
            : /metal/i.test(e.name || '') ? 'Metal'
            : /dark/i.test(e.name || '') ? 'Dark'
            : /dragon/i.test(e.name || '') ? 'Dragon'
            : 'Colorless');
          // taxonomy §F: pass the effect family so Double / Double Colorless
          // energy count as 2 toward the cost (`canPayAttackCost` expands it).
          const family = classifyEnergyEffect(e);
          // attach-type family (letter / named specials): use the effective
          // attached type (e.g. U Energy → Fighting) for cost payment.
          const override = effectiveEnergyType(e);
          energyTypes.push({ type: override || type, family });
        }
        // Passive cost discount (ability family: passive) — reduce the
        // attacker's energy cost per the active card's printed ability.
        const rawCost = atk.cost || [];
        let effectiveCost = rawCost;
        if (rulesState.enabled) {
          let discount = combinedPassiveCostDiscount(active, activeZone.array, {
            blockTools: stadiumBlocksToolEffects(),
          });
          // Stadium cost modifier (taxonomy §E): same hook as the passive
          // discount, stacked on top of it (both applied sequentially).
          const stadiumCard = getStadium()?.card;
          const stadiumDiscount = stadiumCard
            ? parseStadiumCostModifier(stadiumCard)
            : 0;
          discount += stadiumDiscount;
          if (discount > 0 && rawCost.length > 0) {
            effectiveCost = applyCostDiscount(rawCost, discount);
            if (effectiveCost.length < rawCost.length) {
              const note =
                stadiumDiscount > 0
                  ? ` (Stadium: −${stadiumDiscount})`
                  : '';
              appendMessage(user, `✨ ${atk.name}'s cost is reduced by ${discount}${note}!`, 'announcement', false);
            }
          }
          const costIncrease = getStadiumAttackCostIncrease(active, user);
          if (costIncrease > 0) {
            effectiveCost = [
              ...effectiveCost,
              ...Array(costIncrease).fill('Colorless'),
            ];
            appendMessage(
              user,
              `🏟️ Stadium — ${active?.name || 'Your Active'}'s attack costs ${costIncrease} more Energy.`,
              'announcement',
              false
            );
          }
        }
        if (!canPayAttackCost(energyTypes, effectiveCost)) {
          appendMessage(user, `⛔ Not enough energy for ${atk.name}.`, 'announcement', false);
          return; // turn does NOT end
        }

        // Discard-cost (taxonomy §D discard-cost family): the attack's
        // printed discard cost is paid from the attacker's own zones BEFORE
        // damage is applied. Insufficient energy/hand → ⛔ fizzle (early
        // return; turn does NOT end), consistent with the energy-cost gate.
        if (rulesState.enabled) {
          const cost = discardCost(atk.text);
          if (cost.energy > 0) {
            const zone = getZone(user, 'active');
            const have = zone.array.filter((c) => c.type === 'Energy').length;
            if (have < cost.energy) {
              appendMessage(
                user,
                `⛔ Not enough Energy to pay ${atk.name}'s discard cost (need ${cost.energy}).`,
                'announcement',
                false
              );
              return;
            }
            for (let i = 0; i < cost.energy; i++) {
              const z = getZone(user, 'active');
              const idx = z.array.findIndex((c) => c.type === 'Energy');
              if (idx === -1) break;
              moveCard(user, user, 'active', 'discard', idx);
            }
            appendMessage(
              user,
              `🗑 Discarded ${cost.energy} Energy as ${atk.name}'s cost.`,
              'announcement',
              false
            );
          }
          if (cost.hand > 0) {
            const zone = getZone(user, 'hand');
            if (zone.array.length < cost.hand) {
              appendMessage(
                user,
                `⛔ Not enough cards in hand to pay ${atk.name}'s discard cost (need ${cost.hand}).`,
                'announcement',
                false
              );
              return;
            }
            for (let i = 0; i < cost.hand; i++) {
              const z = getZone(user, 'hand');
              if (z.array.length === 0) break;
              moveCard(user, user, 'hand', 'discard', z.array.length - 1);
            }
            appendMessage(
              user,
              `🗑 Discarded ${cost.hand} card(s) from your hand as ${atk.name}'s cost.`,
              'announcement',
              false
            );
          }
        }

        // Shuffle-cost (taxonomy §D shuffle-cost family): attacks whose
        // printed cost is "shuffle your hand into your deck, then draw N"
        // (e.g. Dunsparce's Coil Dance / Iono's signature). The whole hand
        // goes to the deck, it is shuffled, and N cards are drawn. Never
        // fails (an empty deck just yields fewer cards), so no fizzle gate.
        if (rulesState.enabled) {
          const shuf = shuffleDrawClause(atk.text);
          if (shuf.draw > 0) {
            shuffleAndDraw(user, user, shuf.draw, undefined, false);
          }
        }

        // Discard-to-scale (taxonomy §D damage-scaling family): "Discard up
        // to N Energy cards from this Pokémon… does X damage for each card
        // you discarded in this way" (Mega Diancie ex / Garland Ray). The
        // player CHOOSES how many to discard (0..N, capped by what's
        // attached); the damage multiplies by the chosen amount, so 0
        // discarded → 0 damage (printed behavior). Cancel bails the attack
        // (turn does not end), like the other cost gates.
        let energyDiscarded = 0;
        if (rulesState.enabled) {
          const scaling = discardEnergyScaling(atk.text);
          if (scaling) {
            const cap = Math.min(scaling.max, attachedEnergies.length);
            let chosen = 0;
            if (cap > 0) {
              const options = [];
              for (let k = 0; k <= cap; k++) {
                options.push({
                  label: `Discard ${k} Energy → ${(atk.damage || 0) * k} damage`,
                  idx: k,
                });
              }
              const pick = await _pickFromList(
                `${atk.name}: how many Energy to discard?`,
                options
              );
              if (pick === null) {
                appendMessage(user, 'Attack cancelled.', 'announcement', false);
                return;
              }
              chosen = pick;
              for (let k = 0; k < chosen; k++) {
                const z = getZone(user, 'active');
                const idx = z.array.findIndex((c) => c.type === 'Energy');
                if (idx === -1) break;
                moveCard(user, user, 'active', 'discard', idx);
              }
              appendMessage(
                user,
                `🗑 Discarded ${chosen} Energy; ${atk.name} does ${(atk.damage || 0) * chosen} damage.`,
                'announcement',
                false
              );
            } else {
              appendMessage(
                user,
                `⚠️ ${atk.name}: no Energy to discard — it deals 0 damage.`,
                'announcement',
                false
              );
            }
            energyDiscarded = chosen;
          }
        }

        // Damage calculation
        await ensureCardData(oppActive);
        await ensureCardData(active);
        // Text-based damage scaling (taxonomy §D damage families): when rules
        // are on, parse the printed attack text for per-energy / per-prize /
        // per-turn / extra-by-type / conditional bonuses and substitute the
        // effective base number into computeAttackDamage (which still applies
        // weakness/resistance and the defender's damage prevention below).
        // Falls back to the flat printed damage when rules are off or the text
        // carries no recognized scaling — the flat-damage path stays intact.
        let effectiveAttack = atk;
        if (rulesState.enabled) {
          // Coin-flip modifiers (taxonomy §D): attacks that say "Flip a coin"
          // resolve the coin here in the live path. Heads bonus is added to
          // the effective damage total by the parser; tails self-damage is
          // executed after the KO check (below).
          const coin = /flip a coin/.test(String(atk.text || '').toLowerCase())
            ? Math.random() < 0.5
              ? 'heads'
              : 'tails'
            : null;
          // "is damaged" conditions (taxonomy §D "if conditional damage"):
          // pass the defender's current damage-counter count when it is in the
          // DOM; leave undefined otherwise so the parser keeps it honestly unresolved.
          const defenderDmgEl = oppActive?.image?.damageCounter;
          const parsed = parseAttackDamage(atk, active, oppActive, {
            energyCount: attachedEnergies.length,
            energyDiscarded,
            opponentPrizes: getZone(oppPlayer, 'prizes').getCount(),
            turnCount: Math.max(1, rulesState.turnNumber),
            attackerHp: active?.hp ?? 0,
            defenderHp: oppActive?.hp ?? 0,
            defenderDamage: defenderDmgEl
              ? parseInt(defenderDmgEl.textContent || '0', 10) || 0
              : undefined,
            coin,
          });
          if (coin) {
            appendMessage(
              user,
              coin === 'heads'
                ? '🪙 Coin flip: Heads!'
                : '🪙 Coin flip: Tails!',
              'announcement',
              false
            );
          }
          if (parsed.total !== (atk.damage ?? 0)) {
            effectiveAttack = { ...atk, damage: parsed.total };
          }
          // Announce the fired scaling pieces so the player sees *why* the
          // number is what it is (skip unresolved coin/condition caveats —
          // those are not yet part of the executed total).
          for (const note of parsed.notes) {
            if (/pending|resolve the printed/.test(note)) continue;
            appendMessage(user, `✨ ${note}`, 'announcement', false);
          }
        }
        let dmg = computeAttackDamage(active, oppActive, effectiveAttack);

        if (rulesState.enabled) {
          const stadiumBonus = getStadiumAttackDamageBonus(active, user);
          if (stadiumBonus > 0) {
            dmg = { ...dmg, total: dmg.total + stadiumBonus };
            appendMessage(
              user,
              `🏟️ Stadium — +${stadiumBonus} damage from ${active?.name || 'your Active'}!`,
              'announcement',
              false,
            );
          }
        }

        // Defender-side damage prevention (ability family: damage-prevent)
        if (rulesState.enabled) {
          const oppActiveZone = getZone(oppPlayer, 'active');
          const prevention = combinedDamagePrevention(oppActive, oppActiveZone.array, {
            blockTools: stadiumBlocksToolEffects(),
          });
          const prevented = applyDamagePrevention(dmg.total, prevention);
          if (prevented !== dmg.total) {
            appendMessage(
              user,
              `🛡️ ${oppActive?.name || 'The defender'} prevents some damage!`,
              'announcement',
              false
            );
            dmg = { ...dmg, total: prevented };
          }
          // Continuous stadium damage prevention (taxonomy E)
          const st = getStadium()?.card;
          if (st && stadiumPreventionApplies(st, { zoneId: 'active', defender: oppActive })) {
            const detail = parseStadiumDamagePreventionDetail(st);
            const stPrevention = detail?.amount ?? null;
            if (stPrevention !== null) {
              const stPrevented =
                stPrevention === Infinity
                  ? 0
                  : Math.max(0, dmg.total - stPrevention);
              if (stPrevented !== dmg.total) {
                appendMessage(
                  user,
                  `🏟️ ${st.name || 'The Stadium'} prevents some damage!`,
                  'announcement',
                  false
                );
                dmg = { ...dmg, total: stPrevented };
              }
            }
          }
          const stReduction = getStadiumDamageReduction(oppActive, oppPlayer, 'active');
          if (stReduction > 0 && dmg.total > 0) {
            const reduced = Math.max(0, dmg.total - stReduction);
            if (reduced !== dmg.total) {
              appendMessage(
                user,
                `🏟️ ${getStadium()?.card?.name || 'The Stadium'} reduces damage by ${stReduction}!`,
                'announcement',
                false
              );
              dmg = { ...dmg, total: reduced };
            }
          }
          // Buddy-Buddy Energy damage cap (taxonomy §F, family 4): if the
          // defender carries a Buddy-Buddy Energy, an opponent's attack deals
          // at most 1 damage to it.
          const hasProtect =
            oppActive && pokemonHasProtectEnergy(oppActive, oppActiveZone.array);
          if (hasProtect) {
            const capped = applyProtectCap(dmg.total, true);
            if (capped !== dmg.total) {
              appendMessage(
                user,
                '🛡️ Buddy-Buddy Energy — damage is reduced to 1!',
                'announcement',
                false
              );
              dmg = { ...dmg, total: capped };
            }
          }
        }

        // Read current damage on opponent's active (for KO check)
        let currentDmg = 0;
        if (oppActive.image?.damageCounter) {
          currentDmg =
            parseInt(oppActive.image.damageCounter.textContent || '0', 10) || 0;
        }
        const totalDmg = currentDmg + dmg.total;

        // Place damage counters
        placeSelfDamage(oppPlayer, 'active', 0, dmg.total);
        const willSearch =
          rulesState.enabled && parseAttackSearchClause(atk.text);
        if (dmg.total > 0 || !willSearch) {
          appendMessage(
            user,
            `💥 ${atk.name} deals ${dmg.total} damage!`,
            'announcement',
            false
          );
        }

        // KO check → prizes (effective HP includes stadium +/−HP modifiers)
        const oppHp = effectiveHp(oppActive.hp ?? 0, oppPlayer, oppActive);
        if (oppHp > 0 && totalDmg >= oppHp) {
          const koResult = handleKO({
            attackerPlayer: user,
            defender: oppActive,
            defenderBoard: getZone(oppPlayer, 'active'),
          });
          if (koResult.won) {
            appendMessage(user, '🏆 Victory!', 'announcement', false);
          } else {
            appendMessage(
              user,
              `🎯 KO! ${koResult.prizeCount} prize${koResult.prizeCount !== 1 ? 's' : ''} taken.`,
              'announcement',
              false
            );
            await _takePrizesWithPicker(user, koResult.prizeCount);
            // P4: real promotion — move KO'd active to discard, promote first bench.
            const benchCount = getZone(oppPlayer, 'bench').getCount();
            const plan = planPromotion(true, benchCount);
            if (plan.promote) {
              const oldActiveName = oppActive.name || 'The active Pokémon';
              moveCard(oppPlayer, user, 'active', 'discard', 0);
              moveCard(oppPlayer, user, 'bench', 'active', 0);
              const newActive = getZone(oppPlayer, 'active').array[0];
              appendMessage(
                user,
                `⬆️ ${oldActiveName} was KO'd — ${newActive?.name || 'a benched Pokémon'} promotes to Active.`,
                'announcement',
                false
              );
            }
          }
        }

        // Apply a status the attack text specifies, but only if the defender
        // survived — a KO'd Pokémon leaves the field, so status is moot.
        // Solo path; the multiplayer status-on-opponent case is a separate
        // pre-existing gap (flagged, not built here).
        if (oppHp > 0 && totalDmg < oppHp) {
          const oppKey = oppActive.image?.dataset?.cardId || oppActive.name;
          const found = parseStatusFromAttackText(atk.text);
          const oppZoneCards = getZone(oppPlayer, 'active').array;
          const statusBlocked = stadiumBlocksStatusApplication(oppActive, oppZoneCards);
          for (const st of found) {
            if (applyStatus(oppPlayer, oppKey, st, { blocked: statusBlocked })) {
              appendMessage(
                user,
                `💫 ${oppActive?.name || 'The defender'} is now ${st}!`,
                'announcement',
                false
              );
            }
          }
        }

        // Coin tails self-damage (taxonomy §D coin-flip family): the parser
        // reports `selfDamage` when ctx.coin is tails; execute it now on the
        // attacker's active Pokémon.
        if (rulesState.enabled && parsed?.selfDamage > 0) {
          placeSelfDamage(user, 'active', 0, parsed.selfDamage);
          appendMessage(
            user,
            `🩸 ${parsed.selfDamage} damage to ${active?.name || 'your Pokémon'} instead!`,
            'announcement',
            false
          );
        }

        // Heal / remove counters (taxonomy §D heal family): remove up to N
        // counters from the printed target (defender when it says "Defending
        // Pokémon", otherwise the attacker's active — the common self-heal
        // form). Skipped when the defender was KO'd by this very attack.
        if (parsed?.heal > 0) {
          const wantDefender = healTarget(atk.text) === 'defender';
          const defenderKO = oppHp === 0 || totalDmg >= oppHp;
          const target = wantDefender && !defenderKO
            ? { player: oppPlayer, name: oppActive?.name || 'the defender' }
            : wantDefender
              ? null
              : { player: user, name: active?.name || 'your Pokémon' };
          if (!target) {
            appendMessage(
              user,
              `⚠️ Heal had no valid target (defender was KO'd).`,
              'announcement',
              false
            );
          } else {
            const countersEl =
              getZone(target.player, 'active').array[0]?.image?.damageCounter;
            const current = countersEl
              ? parseInt(countersEl.textContent || '0', 10) || 0
              : 0;
            const plan = planHeal(current, parsed.heal);
            if (plan.removed === 0) {
              appendMessage(
                user,
                `💖 Heal had no effect — ${target.name} has no damage counters.`,
                'announcement',
                false
              );
            } else if (plan.zeroOut) {
              removeDamageCounter(target.player, 'active', 0, true);
              appendMessage(
                user,
                `💖 ${plan.removed} damage counter${plan.removed !== 1 ? 's' : ''} removed from ${target.name}.`,
                'announcement',
                false
              );
            } else {
              updateDamageCounter(
                target.player,
                'active',
                0,
                plan.remaining,
                true
              );
              appendMessage(
                user,
                `💖 ${plan.removed} damage counter${plan.removed !== 1 ? 's' : ''} removed from ${target.name} (${plan.remaining} left).`,
                'announcement',
                false
              );
            }
          }
        }

        // Bench damage (taxonomy §D bench family): apply the printed bench
        // damage to one of the opponent's benched Pokémon. Exactly one
        // benched → auto-apply; multiple → first (announced heuristic);
        // none → fizzle announcement. KO on the benched Pokémon still
        // awards prizes and triggers promotion guidance.
        if (parsed?.bench > 0) {
          const oppBench = getZone(oppPlayer, 'bench').array
            .map((card, idx) => ({ card, idx }))
            .filter(({ card }) => card.type === 'Pokémon');
          const plan = planBenchTarget(oppBench.length);
          if (plan === null) {
            appendMessage(
              user,
              `💤 ${atk.name}'s bench damage fizzles — opponent has no benched Pokémon.`,
              'announcement',
              false
            );
          } else {
            const { card: benchTarget, idx: benchIdx } = oppBench[0];
            const hitName = benchTarget?.name || 'a benched Pokémon';
            if (plan === -1) {
              appendMessage(
                user,
                `🎯 Applying bench damage to the first benched Pokémon (${oppBench.length} available).`,
                'announcement',
                false
              );
            }
            placeSelfDamage(oppPlayer, 'bench', benchIdx, parsed.bench);
            const benchHp = effectiveHp(benchTarget.hp ?? 0, oppPlayer, benchTarget);
            const benchDmgEl =
              getZone(oppPlayer, 'bench').array[benchIdx]?.image
                ?.damageCounter;
            const benchDmg = benchDmgEl
              ? parseInt(benchDmgEl.textContent || '0', 10) || 0
              : 0;
            if (benchHp > 0 && benchDmg >= benchHp) {
              const benchKO = handleKO({
                attackerPlayer: user,
                defender: benchTarget,
                defenderBoard: getZone(oppPlayer, 'bench'),
              });
              if (benchKO.won) {
                appendMessage(user, '🏆 Victory!', 'announcement', false);
              } else {
                appendMessage(
                  user,
                  `🎯 Bench KO! ${hitName} — ${benchKO.prizeCount} prize${benchKO.prizeCount !== 1 ? 's' : ''} taken.`,
                  'announcement',
                  false
                );
                await _takePrizesWithPicker(user, benchKO.prizeCount);
              }
            } else {
              appendMessage(
                user,
                `💥 ${parsed.bench} damage to ${hitName} on the bench!`,
                'announcement',
                false
              );
            }
          }
        }

        // Multi-target damage (taxonomy §D multi-target family): apply the
        // printed per-Pokémon damage to ALL of the opponent's benched
        // Pokémon. Empty bench or unnumbered clause → fizzle announcement.
        // Per-Pokémon KO check + prizes + promotion guidance, same as the
        // single-bench block above.
        const allBench = allBenchDamage(atk.text);
        if (allBench > 0) {
          const oppBench = getZone(oppPlayer, 'bench').array
            .map((card, idx) => ({ card, idx }))
            .filter(({ card }) => card.type === 'Pokémon');
          if (oppBench.length === 0) {
            appendMessage(
              user,
              `💤 ${atk.name}'s spread damage fizzles — opponent has no benched Pokémon.`,
              'announcement',
              false
            );
          } else {
            appendMessage(
              user,
              `🎯 ${allBench} damage to each of the opponent's ${oppBench.length} benched Pokémon.`,
              'announcement',
              false
            );
            for (const { card: benchTarget, idx: benchIdx } of oppBench) {
              const hitName = benchTarget?.name || 'a benched Pokémon';
              placeSelfDamage(oppPlayer, 'bench', benchIdx, allBench);
              const benchDmgEl =
                getZone(oppPlayer, 'bench').array[benchIdx]?.image
                  ?.damageCounter;
              const benchDmg = benchDmgEl
                ? parseInt(benchDmgEl.textContent || '0', 10) || 0
                : 0;
              const benchHp = effectiveHp(benchTarget.hp ?? 0, oppPlayer, benchTarget);
              if (benchHp > 0 && benchDmg >= benchHp) {
                const benchKO = handleKO({
                  attackerPlayer: user,
                  defender: benchTarget,
                  defenderBoard: getZone(oppPlayer, 'bench'),
                });
                if (benchKO.won) {
                  appendMessage(user, '🏆 Victory!', 'announcement', false);
                } else {
                  appendMessage(
                    user,
                    `🎯 Bench KO! ${hitName} — ${benchKO.prizeCount} prize${benchKO.prizeCount !== 1 ? 's' : ''} taken.`,
                    'announcement',
                    false
                  );
                  await _takePrizesWithPicker(user, benchKO.prizeCount);
                }
              } else {
                appendMessage(
                  user,
                  `💥 ${allBench} damage to ${hitName} on the bench!`,
                  'announcement',
                  false
                );
              }
            }
          }
        }

        // Draw (taxonomy §D draw family): attack text saying "draw N card(s)".
        // Draws from your own deck (capped at what's left; fizzle announced
        // if empty). The shared draw action already handles the message and
        // multiplayer emission.
        const drawN = drawCount(atk.text);
        if (drawN > 0) {
          const deckLeft = getZone(user, 'deck').getCount();
          const actual = Math.min(drawN, deckLeft);
          if (actual === 0) {
            appendMessage(
              user,
              `📖 ${atk.name}'s draw fizzles — your deck is empty.`,
              'announcement',
              false
            );
          } else {
            draw(user, user, actual, true);
            if (actual < drawN) {
              appendMessage(
                user,
                `📖 Your deck ran dry — only ${actual} of ${drawN} cards drawn.`,
                'announcement',
                false
              );
            }
          }
        }

        // Attach energy (taxonomy §D attach family): attack text saying
        // "attach N Energy card(s)". Attaches from your hand to the active
        // Pokémon via the same moveCard path the attach ability uses;
        // fizzles when no Energy remains in hand.
        const attachN = attachEnergyCount(atk.text);
        for (let i = 0; i < attachN; i++) {
          const hand = getZone(user, 'hand');
          const energyIdx = hand.array.findIndex((c) => c.type === 'Energy');
          if (energyIdx === -1) {
            appendMessage(
              user,
              `⚡ ${atk.name}'s energy attach fizzles — no Energy left in hand.`,
              'announcement',
              false
            );
            break;
          }
          const energy = hand.array[energyIdx];
          moveCard(user, user, 'hand', 'active', energyIdx, 0);
          appendMessage(
            user,
            `⚡ ${atk.name} attaches ${energy.name || 'an Energy card'} to ${active?.name || 'the active'}.`,
            'announcement',
            false
          );
        }

        // Switch (taxonomy §D switch family): attack text saying "switch
        // your Active …". Auto-swaps with the first benched Pokémon — the
        // same moveCard pair the switch ability uses (no energy cost); the
        // first-bench heuristic matches the bench-damage family. Fizzles
        // when the bench is empty or the active was KO'd mid-attack.
        if (switchClause(atk.text)) {
          const curActive = getZone(user, 'active').array[0];
          const benchZone = getZone(user, 'bench');
          if (!curActive || benchZone.getCount() === 0) {
            appendMessage(
              user,
              `🔁 ${atk.name}'s switch fizzles — nothing to switch with.`,
              'announcement',
              false
            );
          } else {
            const oldName = curActive.name || 'The active';
            moveCard(user, user, 'active', 'bench', 0);
            moveCard(user, user, 'bench', 'active', 0);
            const newActive = getZone(user, 'active').array[0];
            appendMessage(
              user,
              `🔁 ${oldName} switches with ${newActive?.name || 'the benched Pokémon'}.`,
              'announcement',
              false
            );
          }
        }

        // Deck search (taxonomy §D search-deck family): Call for Family, Flock,
        // Lucky Find, etc. Opens the filtered deck picker, moves to Bench/hand,
        // then shuffles — awaited so the turn does not end before the pick.
        if (rulesState.enabled) {
          const searchStep = parseAttackSearchClause(atk.text);
          if (searchStep) {
            await _runAttackDeckSearch(user, atk, searchStep, emit);
          }
        }

        // Record the once-per-turn attack as used this turn (only reached on
        // a successful attack — the fizzle path returns early above). Reuses
        // the shared abilitiesUsed flag map, cleared by resetTurnFlags().
        if (rulesState.enabled && oncePerTurnClause(atk.text)) {
          markAbilityUsed(user, active);
        }
      }
    }
    markAttacked(user);
  }

  resetAbilityCounters();
  const message = determineUsername(user) + ' attacked';
  appendMessage(user, message, 'player', false);
  discardBoard(user, user, false, false);

  processAction(user, emit, 'attack', []);

  if (rulesState.enabled) {
    endTurnWithBanner(user);
  }
};

export const retreat = (user, emit = true) => {
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'retreat', []);
    return;
  }

  if (rulesState.enabled) {
    const check = canPerformAction({ user, action: 'retreat' });
    if (!check.allowed) {
      appendMessage(user, `⛔ ${check.reason}`, 'announcement', false);
      return;
    }

    // Opponent retreat prevention (taxonomy E, continuous stadium)
    const st = getStadium();
    if (st && st.user !== user && isStadiumRetreatPrevention(st.card)) {
      appendMessage(
        user,
        `🏟️ ${st.card?.name || 'The Stadium'} prevents this Pokémon from retreating.`,
        'announcement',
        false
      );
      return;
    }

    // Only Paralyzed blocks retreating. Retreating also clears Confused.
    const active = getZone(user, 'active').array[0];
    let activeKey = null;
    if (active) {
      activeKey = active.image?.dataset?.cardId || active.name;
      const gate = statusAllowsRetreat(user, activeKey);
      if (!gate.can) {
        appendMessage(user, `⛔ ${gate.reason}`, 'announcement', false);
        return;
      }
    }

    // Must have at least one bench card to retreat to
    const bench = getZone(user, 'bench');
    if (bench.getCount() === 0) {
      appendMessage(user, '⛔ No bench Pokémon to retreat to.', 'announcement', false);
      return;
    }

    // Switching Energy (taxonomy §F, family 3): a free switch — skip the
    // retreat-cost energy-discard step when the active has one attached.
    const activeZoneForCheck = getZone(user, 'active');
    const hasRedirectEnergy =
      active && pokemonHasRedirectEnergy(active, activeZoneForCheck.array);
    if (hasRedirectEnergy) {
      appendMessage(
        user,
        `🔁 ${active?.name || 'This Pokémon'} has a Switching Energy — the switch is free.`,
        'announcement',
        false
      );
    }

    // Pay retreat cost: discard N energy from the active Pokémon (unless free)
    const baseRetreatCost = active?.retreatCost ?? 0;
    const retreatCost = rulesState.enabled
      ? getStadiumRetreatCost(baseRetreatCost, active, user)
      : baseRetreatCost;
    if (retreatCost > 0 && !hasRedirectEnergy) {
      const activeZone = getZone(user, 'active');
      const attachedEnergies = activeZone.array.filter(
        (c) => c.type === 'Energy' && c.image?.relative === active.image
      );
      if (attachedEnergies.length < retreatCost) {
        appendMessage(
          user,
          `⛔ Not enough energy to retreat (need ${retreatCost}).`,
          'announcement',
          false
        );
        return;
      }
      // Discard the required number of energies
      for (let i = 0; i < retreatCost; i++) {
        const z = getZone(user, 'active');
        const idx = z.array.findIndex(
          (c) => c.type === 'Energy' && c.image?.relative === active.image
        );
        if (idx === -1) break;
        moveCard(user, user, 'active', 'discard', idx);
      }
    }

    // Swap: active → bench, first bench → active
    moveCard(user, user, 'active', 'bench', 0);
    moveCard(user, user, 'bench', 'active', 0);

    markRetreated(user);
    // Retreating clears Confused (and other statuses) on the old active.
    if (activeKey) clearStatuses(user, activeKey);
  }

  resetAbilityCounters();
  const message = determineUsername(user) + ' retreated';
  appendMessage(user, message, 'player', false);
  discardBoard(user, user, false, false);
  processAction(user, emit, 'retreat', []);
};

// How many damage counters a heal ability removes: "remove all damage" →
// 'all', "remove 2 damage" → 2, unparseable → 1.
const parseHealAmount = (abilityText) => {
  const t = String(abilityText || '').toLowerCase();
  if (/remove (all|every) damage/.test(t)) return 'all';
  const m = t.match(/remove (\d+) damage/);
  if (m) return parseInt(m[1], 10);
  return 1;
};

// Heal ability (taxonomy C, once-per-turn): remove N damage counters from the
// active Pokémon using the active's own heal-family ability. Does NOT end the
// turn (like retreat). Damage-counter updates relay in multiplayer via the
// existing updateDamageCounter/removeDamageCounter actions.
export const healAbility = async (user, emit = true, targetCard = null) => {
  if (rulesState.enabled && rulesState.turnPlayer !== user) {
    appendMessage(user, `⛔ It's not your turn.`, 'announcement', false);
    return;
  }

  const _activeCard = getZone(user, 'active').array[0];
  const target = targetCard || _activeCard;
  if (!target) {
    appendMessage(user, '⛔ No Pokémon to heal.', 'announcement', false);
    return;
  }

  const zoneId = targetCard && targetCard !== _activeCard ? 'bench' : 'active';
  const zoneIdx = targetCard && targetCard !== _activeCard
    ? getZone(user, 'bench').array.indexOf(targetCard) : 0;

  await ensureCardData(target);
  if (abilityBlockedByStadium(user, target)) return;
  if (classifyAbility(target) !== 'heal') {
    appendMessage(
      user,
      `⛔ ${target.name || 'This Pokémon'} has no heal ability.`,
      'announcement',
      false
    );
    return;
  }

  if (rulesState.enabled && abilityUsed(user, target)) {
    appendMessage(
      user,
      `⛔ ${target.name}'s heal ability was already used this turn.`,
      'announcement',
      false
    );
    return;
  }

  const abilityText =
    target.ability?.text ?? target.abilityText ?? target.text ?? '';
  const amount = parseHealAmount(abilityText);
  let current = 0;
  if (target.image?.damageCounter) {
    current =
      parseInt(target.image.damageCounter.textContent || '0', 10) || 0;
  }
  if (current === 0) {
    appendMessage(
      user,
      `⛔ ${target.name} has no damage counters to remove.`,
      'announcement',
      false
    );
    return;
  }

  const healed = amount === 'all' ? current : Math.min(amount, current);
  if (amount === 'all' || current - amount <= 0) {
    removeDamageCounter(user, zoneId, zoneIdx, emit);
  } else {
    updateDamageCounter(user, zoneId, zoneIdx, current - amount, emit);
  }

  if (rulesState.enabled) markAbilityUsed(user, target);
  appendMessage(
    user,
    `💖 ${target.name} heals ${healed} damage counter${healed !== 1 ? 's' : ''}.`,
    'announcement',
    false
  );
};

// Switch ability (taxonomy C, once-per-turn): free active↔bench swap using the
// active's own switch-family ability. No energy cost (unlike retreat) and does
// NOT end the turn. Card movement relays in multiplayer via moveCard.
export const switchAbility = async (user, emit = true, targetCard = null) => {
  if (rulesState.enabled && rulesState.turnPlayer !== user) {
    appendMessage(user, `⛔ It's not your turn.`, 'announcement', false);
    return;
  }

  const _activeCard = getZone(user, 'active').array[0];
  const target = targetCard || _activeCard;
  if (!target) {
    appendMessage(user, '⛔ No Pokémon to switch.', 'announcement', false);
    return;
  }

  const targetIsBench = targetCard && targetCard !== _activeCard;
  const targetZone = targetIsBench ? 'bench' : 'active';
  const targetIdx = targetIsBench
    ? getZone(user, 'bench').array.indexOf(targetCard) : 0;

  await ensureCardData(target);
  if (abilityBlockedByStadium(user, target)) return;
  if (classifyAbility(target) !== 'switch') {
    appendMessage(
      user,
      `⛔ ${target.name || 'This Pokémon'} has no switch ability.`,
      'announcement',
      false
    );
    return;
  }

  if (rulesState.enabled && abilityUsed(user, target)) {
    appendMessage(
      user,
      `⛔ ${target.name}'s switch ability was already used this turn.`,
      'announcement',
      false
    );
    return;
  }

  const bench = getZone(user, 'bench');
  if (bench.getCount() === 0) {
    appendMessage(
      user,
      '⛔ No bench Pokémon to switch with.',
      'announcement',
      false
    );
    return;
  }

  const switcherName = target.name || 'This Pokémon';
  // Free swap: move the target to active; autoMoveActiveBenchCard handles
  // pushing the old active to bench. For active source, move active→bench first
  // then bench→active (two-step since active can't hold two cards).
  if (targetIsBench) {
    moveCard(user, user, 'bench', 'active', targetIdx);
  } else {
    moveCard(user, user, 'active', 'bench', 0);
    moveCard(user, user, 'bench', 'active', 0);
  }

  if (rulesState.enabled) markAbilityUsed(user, target);
  const newActive = getZone(user, 'active').array[0];
  appendMessage(
    user,
    `🔁 ${switcherName} switches with ${newActive?.name || 'the other Pokémon'}.`,
    'announcement',
    false
  );
};

// Attach-energy ability (taxonomy C, once-per-turn): attach an Energy card
// from hand to the active Pokémon using its own attach-family ability.
// Does NOT end the turn.
export const attachAbility = async (user, emit = true, targetCard = null) => {
  if (rulesState.enabled && rulesState.turnPlayer !== user) {
    appendMessage(user, `⛔ It's not your turn.`, 'announcement', false);
    return;
  }

  const _activeCard = getZone(user, 'active').array[0];
  const target = targetCard || _activeCard;
  if (!target) {
    appendMessage(user, '⛔ No Pokémon.', 'announcement', false);
    return;
  }

  const targetZone = targetCard && targetCard !== _activeCard ? 'bench' : 'active';
  const targetIdx = targetCard && targetCard !== _activeCard
    ? getZone(user, 'bench').array.indexOf(targetCard) : 0;

  await ensureCardData(target);
  if (abilityBlockedByStadium(user, target)) return;
  if (classifyAbility(target) !== 'attach') {
    appendMessage(
      user,
      `⛔ ${target.name || 'This Pokémon'} has no attach ability.`,
      'announcement',
      false
    );
    return;
  }

  if (rulesState.enabled && abilityUsed(user, target)) {
    appendMessage(
      user,
      `⛔ ${target.name}'s attach ability was already used this turn.`,
      'announcement',
      false
    );
    return;
  }

  // Find the first Energy-type card in hand.
  const hand = getZone(user, 'hand');
  const energyIndex = hand.array.findIndex((c) => c.type === 'Energy');
  if (energyIndex === -1) {
    appendMessage(
      user,
      '⛔ No Energy in hand to attach.',
      'announcement',
      false
    );
    return;
  }

  const energy = hand.array[energyIndex];

  // Attach: hand → target. targetIndex triggers attachCard path.
  moveCard(user, user, 'hand', targetZone, energyIndex, targetIdx);

  if (rulesState.enabled) markAbilityUsed(user, target);
  appendMessage(
    user,
    `⚡ ${target.name} attaches ${energy.name || 'an Energy card'} via its ability.`,
    'announcement',
    false
  );
};

// Energy redirection (taxonomy C, once-per-turn): move 1 attached Energy
// from the active Pokémon to another friendly Pokémon.
// Auto-fast-path: if exactly 1 energy + 1 target → immediate move.
// General path: two-step picker (pick energy → pick target).
export const energyRedirectAbility = async (user, emit = true, targetCard = null) => {
  if (rulesState.enabled && rulesState.turnPlayer !== user) {
    appendMessage(user, `⛔ It's not your turn.`, 'announcement', false);
    return;
  }

  const _activeCard = getZone(user, 'active').array[0];
  const source = targetCard || _activeCard;
  if (!source) {
    appendMessage(user, '⛔ No Pokémon.', 'announcement', false);
    return;
  }

  const sourceIsBench = targetCard && targetCard !== _activeCard;
  const sourceZone = sourceIsBench ? 'bench' : 'active';
  const sourceIdx = sourceIsBench
    ? getZone(user, 'bench').array.indexOf(targetCard) : 0;

  await ensureCardData(source);
  if (abilityBlockedByStadium(user, source)) return;
  const family = classifyAbility(source);
  if (family !== 'energy-redirect') {
    appendMessage(
      user,
      `⛔ ${source.name || 'This Pokémon'} has no energy-redirect ability.`,
      'announcement',
      false
    );
    return;
  }

  if (rulesState.enabled && abilityUsed(user, source)) {
    appendMessage(
      user,
      `⛔ ${source.name}'s redirect ability was already used this turn.`,
      'announcement',
      false
    );
    return;
  }

  // Find attached energies on the source Pokémon
  const sourceZoneObj = getZone(user, sourceZone);
  const energies = sourceZoneObj.array
    .map((c, i) => ({ card: c, idx: i }))
    .filter(
      ({ card }) => card.type === 'Energy' && card.image?.relative === source.image
    );

  if (energies.length === 0) {
    appendMessage(user, `⛔ No Energy attached to ${source.name || 'source'}.`, 'announcement', false);
    return;
  }

  // Find other friendly Pokémon (excluding the source).
  // If source is on bench, the active is also a valid target.
  const allBench = getZone(user, 'bench');
  const targets = allBench.array
    .map((c, i) => ({ card: c, idx: i, zone: 'bench' }))
    .filter(({ card }) => card.type === 'Pokémon' && card !== source);
  if (sourceIsBench) {
    const activeCard = getZone(user, 'active').array[0];
    if (activeCard && activeCard.type === 'Pokémon' && activeCard !== source) {
      targets.push({ card: activeCard, idx: 0, zone: 'active' });
    }
  }

  if (targets.length === 0) {
    appendMessage(user, '⛔ No other friendly Pokémon to redirect to.', 'announcement', false);
    return;
  }

  // Auto-fast-path (B): exactly 1 energy + 1 target → immediate move
  if (energies.length === 1 && targets.length === 1) {
    const { card: energy, idx: energyIdx } = energies[0];
    const { card: destTarget, idx: targetIdx, zone: targetZone } = targets[0];
    moveCard(user, user, sourceZone, targetZone, energyIdx, targetIdx);
    if (rulesState.enabled) markAbilityUsed(user, source);
    appendMessage(
      user,
      `🔀 ${source.name} redirects ${energy.name || 'Energy'} to ${destTarget.name}.`,
      'announcement',
      false
    );
    return;
  }

  // General path (A): two-step picker
  // Step 1: pick which energy to redirect
  const energyPick = await _pickFromList(
    'Which Energy to redirect?',
    energies.map(({ card, idx }) => ({ label: card.name || 'Energy', idx }))
  );
  if (energyPick === null) {
    appendMessage(user, 'Redirect cancelled.', 'announcement', false);
    return;
  }
  const energyCard = sourceZoneObj.array[energyPick];

  // Step 2: pick target Pokémon
  const targetPick = await _pickFromList(
    'Redirect to which Pokémon?',
    targets.map(({ card, idx }) => ({ label: card.name || 'Pokémon', idx }))
  );
  if (targetPick === null) {
    appendMessage(user, 'Redirect cancelled.', 'announcement', false);
    return;
  }
  const destTarget = targets[targetPick];

  moveCard(user, user, sourceZone, destTarget.zone, energyPick, destTarget.idx);
  if (rulesState.enabled) markAbilityUsed(user, source);
  appendMessage(
    user,
    `🔀 ${source.name} redirects ${energyCard.name || 'Energy'} to ${destTarget.card.name}.`,
    'announcement',
    false
  );
};

// Minimal inline picker: renders a small grid of labelled buttons in the chat
// area. Resolves with the selected index, or null on cancel.
function _pickFromList(title, items) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'choice-picker-card';
    const titleEl = document.createElement('div');
    titleEl.className = 'choice-picker-title';
    titleEl.textContent = title;
    host.appendChild(titleEl);

    const grid = document.createElement('div');
    grid.className = 'choice-picker-grid';
    items.forEach(({ label, idx }) => {
      const btn = document.createElement('button');
      btn.className = 'choice-picker-item';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        host.remove();
        resolve(idx);
      });
      grid.appendChild(btn);
    });
    host.appendChild(grid);

    const cancel = document.createElement('button');
    cancel.className = 'choice-picker-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      host.remove();
      resolve(null);
    });
    host.appendChild(cancel);

    // Insert at the top of the chat area (or body if not found)
    const chatArea = document.querySelector('.chat-messages') || document.body;
    chatArea.prepend(host);
    host.style.position = 'fixed';
    host.style.top = '10%';
    host.style.left = '50%';
    host.style.transform = 'translateX(-50%)';
    host.style.zIndex = 9999;
    host.style.minWidth = '220px';
    host.style.padding = '12px';
    host.style.borderRadius = '10px';
    host.style.boxShadow = '0 8px 32px rgba(0,0,0,0.35)';
  });
}

// Multi-select prize picker. Lets the player choose WHICH of their own prize
// cards to take (up to `count`), instead of the automatic "take the top N".
// Resolves to the array of chosen 0-based indices, or null (fallback to
// automatic top-N). Reuses the same positioning/styling as `_pickFromList`.
function _pickPrizeCards(count, cards) {
  return new Promise((resolve) => {
    const needed = Math.min(count, cards.length);
    const host = document.createElement('div');
    host.className = 'choice-picker-card';
    const titleEl = document.createElement('div');
    titleEl.className = 'choice-picker-title';
    titleEl.textContent = `Choose ${needed} prize card${needed !== 1 ? 's' : ''} to take:`;
    host.appendChild(titleEl);

    const selected = new Set();
    const grid = document.createElement('div');
    grid.className = 'choice-picker-grid';
    cards.forEach((card, idx) => {
      const btn = document.createElement('button');
      btn.className = 'choice-picker-item';
      btn.textContent = card.name || `Prize ${idx + 1}`;
      btn.addEventListener('click', () => {
        if (selected.has(idx)) {
          selected.delete(idx);
          btn.classList.remove('selected');
        } else if (selected.size < needed) {
          selected.add(idx);
          btn.classList.add('selected');
        }
        confirmBtn.disabled = selected.size !== needed;
      });
      grid.appendChild(btn);
    });
    host.appendChild(grid);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'choice-picker-confirm';
    confirmBtn.textContent = `Take ${needed} prize card${needed !== 1 ? 's' : ''}`;
    confirmBtn.disabled = true; // enabled once exactly `needed` are selected
    confirmBtn.addEventListener('click', () => {
      host.remove();
      resolve([...selected]);
    });
    host.appendChild(confirmBtn);

    const cancel = document.createElement('button');
    cancel.className = 'choice-picker-cancel';
    cancel.textContent = 'Take the top ones (automatic)';
    cancel.addEventListener('click', () => {
      host.remove();
      resolve(null);
    });
    host.appendChild(cancel);

    const chatArea = document.querySelector('.chat-messages') || document.body;
    chatArea.prepend(host);
    host.style.position = 'fixed';
    host.style.top = '10%';
    host.style.left = '50%';
    host.style.transform = 'translateX(-50%)';
    host.style.zIndex = 9999;
    host.style.minWidth = '220px';
    host.style.padding = '12px';
    host.style.borderRadius = '10px';
    host.style.boxShadow = '0 8px 32px rgba(0,0,0,0.35)';
  });
}

// Show the prize picker and take the chosen cards; fall back to the automatic
// top-N behavior if the player cancels. Falls back to `takePrizes` when there
// are no prize cards to choose from.
async function _takePrizesWithPicker(user, count) {
  const prizeCards = getZone(user, 'prizes').array.slice(0, count);
  if (prizeCards.length === 0) {
    takePrizes(user, user, count);
    return;
  }
  const chosen = await _pickPrizeCards(count, prizeCards);
  if (chosen === null || chosen.length === 0) {
    takePrizes(user, user, count);
    return;
  }
  takePrizesByIndex(user, user, chosen);
}

const abilityTurnAndUsageGuard = (user, target, family) => {
  if (rulesState.enabled && rulesState.turnPlayer !== user) {
    appendMessage(user, `⛔ It's not your turn.`, 'announcement', false);
    return false;
  }
  if (!target) {
    appendMessage(user, '⛔ No Pokémon.', 'announcement', false);
    return false;
  }
  if (family && classifyAbility(target) !== family) {
    appendMessage(
      user,
      `⛔ ${target.name || 'This Pokémon'} has no ${family} ability.`,
      'announcement',
      false
    );
    return false;
  }
  if (rulesState.enabled && abilityUsed(user, target)) {
    appendMessage(
      user,
      `⛔ ${target.name}'s ability was already used this turn.`,
      'announcement',
      false
    );
    return false;
  }
  return true;
};

const resolveAbilityTarget = (user, targetCard) => {
  const activeCard = getZone(user, 'active').array[0];
  const target = targetCard || activeCard;
  const targetIsBench = targetCard && targetCard !== activeCard;
  const targetZone = targetIsBench ? 'bench' : 'active';
  const targetIdx = targetIsBench
    ? getZone(user, 'bench').array.indexOf(targetCard)
    : 0;
  return { target, targetZone, targetIdx, activeCard };
};

const isPokemonCard = (card) => {
  if (card?.hp) return true;
  const t = String(card?.type || card?.supertype || '').toLowerCase();
  return t.includes('pokémon') || t.includes('pokemon');
};

const matchesSearch = (card, what = '') => {
  const w = what.toLowerCase();
  if (w.includes(' or ')) {
    return w.split(/\s+or\s+/).some((seg) => matchesSearch(card, seg));
  }
  const isPokemon = isPokemonCard(card);
  const isTrainer = String(card.supertype || card.type || '')
    .toLowerCase()
    .includes('trainer');
  if (w.includes('item') && w.includes('tool')) return isTrainer;
  if (w === 'item' || (w.includes('item') && !w.includes('tool'))) {
    const tt = String(card.trainerType || card.type || '').toLowerCase();
    return tt.includes('item') || (isTrainer && tt.includes('item'));
  }
  if (w.includes('energy')) {
    return (
      String(card.type || '').toLowerCase().includes('energy') ||
      String(card.name || '').toLowerCase().includes('energy')
    );
  }
  if (w.includes('mega evolution')) {
    return isPokemon && String(card.name || '').toLowerCase().includes('mega');
  }
  if (w.includes('basic') && w.includes('stage 1') && w.includes('stage 2')) {
    return isPokemon;
  }
  if (w.includes('basic')) {
    if (!isPokemon || (card.stage || 'Basic') !== 'Basic') return false;
    const hpCap = what.match(/[≤<]\s*(\d+)\s*hp/i);
    if (hpCap) {
      const maxHp = Number(hpCap[1]);
      const cardHp = Number(card.hp);
      return Number.isFinite(cardHp) && cardHp <= maxHp;
    }
    return true;
  }
  if (w.includes('pokémon') || w.includes('pokemon')) return isPokemon;
  // Named species (attack search: "up to 2 Grubbin", not a generic keyword)
  const generic =
    /\b(card|pokémon|pokemon|energy|item|tool|trainer|basic|supporter|stadium|mega|stage|evolution)\b/i;
  if (what.trim() && !generic.test(what)) {
    const needle = what.trim().toLowerCase();
    return String(card.name || '').toLowerCase().includes(needle);
  }
  return true;
};

// Modal card picker (mirrors rules-bridge openChoicePicker for ability buttons).
const openAbilityChoicePicker = ({
  user,
  title,
  candidates,
  zoneFrom,
  destination,
  multiSelect = false,
  requiredCount = 1,
  minCount,
  maxCount,
  upTo = false,
  onPick,
  onConfirm,
  onCancel,
}) => {
  document.getElementById('rulesChoicePicker')?.remove();

  const maxSel = maxCount ?? requiredCount;
  const minSel = minCount ?? (upTo ? 0 : requiredCount);
  const cappedMax = Math.min(maxSel, candidates.length);

  if (multiSelect && !upTo && minSel > candidates.length) {
    appendMessage(
      user,
      `⛔ Not enough cards to select ${requiredCount}.`,
      'announcement',
      false
    );
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'rulesChoicePicker';
  overlay.innerHTML = `
    <div class="choice-picker-card">
      <div class="choice-picker-title"></div>
      <div class="choice-picker-grid"></div>
      ${multiSelect ? '<button class="choice-picker-confirm" disabled>Confirm</button>' : ''}
      <button class="choice-picker-cancel">Cancel</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.choice-picker-title').textContent = title;

  const selected = new Set();
  const grid = overlay.querySelector('.choice-picker-grid');
  const confirmBtn = overlay.querySelector('.choice-picker-confirm');
  if (confirmBtn && upTo && minSel === 0) {
    confirmBtn.disabled = false;
  }

  for (const cand of candidates) {
    const btn = document.createElement('button');
    btn.className = 'choice-picker-item';
    const thumb =
      cand.images?.small ||
      (typeof cand.image === 'string' ? cand.image : cand.image?.src) ||
      '';
    btn.innerHTML = thumb
      ? `<img src="${thumb}" alt="" loading="lazy" /><span>${cand.name || 'Card'}</span>`
      : `<span>${cand.name || 'Card'}</span>`;
    btn.addEventListener('click', () => {
      if (multiSelect) {
        if (selected.has(cand)) {
          selected.delete(cand);
          btn.classList.remove('selected');
        } else if (selected.size < cappedMax) {
          selected.add(cand);
          btn.classList.add('selected');
        }
        if (confirmBtn) {
          confirmBtn.disabled = selected.size < minSel || selected.size > cappedMax;
        }
        return;
      }
      try {
        const zone = getZone(user, zoneFrom);
        const idx = zone.array.indexOf(cand);
        if (idx >= 0 && destination) {
          moveCardBundle(user, user, zoneFrom, destination, idx, false, 'move', true);
        }
      } catch {}
      onPick?.(cand);
      overlay.remove();
    });
    grid.appendChild(btn);
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      onConfirm?.(Array.from(selected));
      overlay.remove();
    });
  }
  overlay.querySelector('.choice-picker-cancel').addEventListener('click', () => {
    onCancel?.();
    overlay.remove();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      onCancel?.();
      overlay.remove();
    }
  });
};

// Attack deck-search (Call for Family, Flock, …): filtered picker, then shuffle.
async function _runAttackDeckSearch(user, atk, searchStep, emit) {
  const deck = getZone(user, 'deck');
  if (deck.array.length === 0) {
    appendMessage(
      user,
      `🔍 ${atk.name} fizzles — your deck is empty.`,
      'announcement',
      false
    );
    shuffleZone(user, user, 'deck');
    return;
  }

  let destZone = 'hand';
  if (searchStep.destination === 'bench') destZone = 'bench';
  else if (searchStep.destination === 'attach') destZone = 'hand';
  const destLabel = destZone === 'bench' ? 'Bench' : 'hand';
  const maxCount = searchStep.count || 1;
  const upTo = searchStep.upTo === true;
  let effectiveMax = maxCount;

  if (destZone === 'bench') {
    const openSlots = 5 - getZone(user, 'bench').getCount();
    if (openSlots <= 0) {
      appendMessage(
        user,
        `🔍 ${atk.name} fizzles — your Bench is full.`,
        'announcement',
        false
      );
      shuffleZone(user, user, 'deck');
      return;
    }
    effectiveMax = Math.min(maxCount, openSlots);
  }

  const matches = [];
  for (const c of deck.array) {
    await ensureCardData(c);
    if (matchesSearch(c, searchStep.what)) matches.push(c);
  }
  const usingFallback = matches.length === 0 && deck.array.length > 0;
  const pool = usingFallback ? deck.array : matches;
  if (pool.length === 0) {
    appendMessage(
      user,
      `🔍 ${atk.name} — no matching cards in your deck.`,
      'announcement',
      false
    );
    shuffleZone(user, user, 'deck');
    return;
  }

  const finishSearch = () => shuffleZone(user, user, 'deck');

  const useMulti = upTo ? effectiveMax >= 1 : effectiveMax > 1;
  const minPick = upTo ? 0 : effectiveMax;
  const pickLabel = upTo
    ? `up to ${effectiveMax}`
    : String(effectiveMax);

  if (useMulti) {
    await new Promise((resolve) => {
      openAbilityChoicePicker({
        user,
        title: `${atk.name} — choose ${pickLabel} for ${destLabel}${usingFallback ? ' (full deck)' : ''}`,
        candidates: pool,
        zoneFrom: 'deck',
        destination: destZone,
        multiSelect: true,
        requiredCount: effectiveMax,
        minCount: minPick,
        maxCount: effectiveMax,
        upTo,
        onConfirm: (selected) => {
          for (const s of selected) {
            const idx = getZone(user, 'deck').array.indexOf(s);
            if (idx >= 0) {
              moveCardBundle(user, user, 'deck', destZone, idx, false, 'move', emit);
            }
          }
          if (selected.length === 0) {
            appendMessage(user, `🔍 ${atk.name}: no cards taken — deck shuffled.`, 'announcement', false);
          } else {
            appendMessage(
              user,
              `🔍 ${atk.name}: ${selected.map((s) => s.name).join(', ')} → ${destLabel}.`,
              'announcement',
              false
            );
          }
          finishSearch();
          resolve();
        },
        onCancel: () => {
          appendMessage(user, '🔍 Search canceled — shuffle your deck.', 'announcement', false);
          finishSearch();
          resolve();
        },
      });
    });
    return;
  }

  await new Promise((resolve) => {
    openAbilityChoicePicker({
      user,
      title: `${atk.name} — take a card to ${destLabel}${usingFallback ? ' (full deck)' : ''}`,
      candidates: pool,
      zoneFrom: 'deck',
      destination: destZone,
      onPick: (picked) => {
        appendMessage(
          user,
          `🔍 ${atk.name}: ${picked.name || 'a card'} → ${destLabel}.`,
          'announcement',
          false
        );
        finishSearch();
        resolve();
      },
      onCancel: () => {
        appendMessage(user, '🔍 Search canceled — shuffle your deck.', 'announcement', false);
        finishSearch();
        resolve();
      },
    });
  });
}

// Search ability (taxonomy C, once-per-turn): full-deck filtered search via
// choice picker (Trainer-style). Does NOT end the turn.
export const searchAbility = async (user, emit = true, targetCard = null) => {
  const { target } = resolveAbilityTarget(user, targetCard);
  await ensureCardData(target);
  if (!abilityTurnAndUsageGuard(user, target, 'search')) return;

  const deck = getZone(user, 'deck');
  if (deck.array.length === 0) {
    appendMessage(user, '⛔ Your deck is empty.', 'announcement', false);
    return;
  }

  const abilityText =
    target.ability?.text ?? target.abilityText ?? target.text ?? '';
  const searchStep = parseAbility(abilityText).find(
    (s) => s.type === 'searchAbility'
  );
  const what =
    searchStep?.what ||
    (searchTargetType(target) === 'Energy'
      ? 'Energy'
      : searchTargetType(target) === 'Trainer'
        ? 'Trainer'
        : 'a Pokémon');
  const count = searchStep?.count || 1;
  const destZone =
    searchStep?.destination === 'Bench' ? 'bench' : 'hand';
  const destLabel = destZone === 'bench' ? 'Bench' : 'hand';

  const matches = [];
  for (const c of deck.array) {
    await ensureCardData(c);
    if (matchesSearch(c, what)) matches.push(c);
  }
  const usingFallback = matches.length === 0 && deck.array.length > 0;
  const pool = usingFallback ? deck.array : matches;
  if (pool.length === 0) {
    appendMessage(user, '⛔ No matching cards in your deck.', 'announcement', false);
    return;
  }

  const completeSearch = () => {
    shuffleZone(user, user, 'deck');
    if (rulesState.enabled) markAbilityUsed(user, target);
  };

  if (count > 1) {
    openAbilityChoicePicker({
      user,
      title: `${target.name} — choose ${count} cards for ${destLabel}${usingFallback ? ' (full deck)' : ''}`,
      candidates: pool,
      zoneFrom: 'deck',
      destination: destZone,
      multiSelect: true,
      requiredCount: count,
      onConfirm: (selected) => {
        for (const s of selected) {
          const idx = getZone(user, 'deck').array.indexOf(s);
          if (idx >= 0) {
            moveCardBundle(user, user, 'deck', destZone, idx, false, 'move', emit);
          }
        }
        appendMessage(
          user,
          `🔍 ${target.name} searches: ${selected.map((s) => s.name).join(', ')} → ${destLabel}.`,
          'announcement',
          false
        );
        completeSearch();
      },
      onCancel: () => {
        appendMessage(
          user,
          '🔍 Search canceled — ability not used (you may decline).',
          'announcement',
          false
        );
      },
    });
    return;
  }

  openAbilityChoicePicker({
    user,
    title: `${target.name} — take a card to ${destLabel}${usingFallback ? ' (full deck)' : ''}`,
    candidates: pool,
    zoneFrom: 'deck',
    destination: destZone,
    onPick: (picked) => {
      appendMessage(
        user,
        `🔍 ${target.name} searches: ${picked.name || 'a card'} → ${destLabel}.`,
        'announcement',
        false
      );
      completeSearch();
    },
    onCancel: () => {
      appendMessage(
        user,
        '🔍 Search canceled — ability not used (you may decline).',
        'announcement',
        false
      );
    },
  });
};

// Draw ability (taxonomy C, once-per-turn): draw N from deck. Does NOT end turn.

export const drawAbility = async (user, emit = true, targetCard = null) => {
  const { target } = resolveAbilityTarget(user, targetCard);
  await ensureCardData(target);

  const abilityText =
    target.ability?.text ?? target.abilityText ?? target.text ?? '';
  const drawStep = parseAbility(abilityText).find((s) => s.type === 'drawAbility');
  const family = classifyAbility(target);
  if (!drawStep && family !== 'draw') {
    appendMessage(
      user,
      `⛔ ${target.name || 'This Pokémon'} has no draw ability.`,
      'announcement',
      false
    );
    return;
  }
  if (!abilityTurnAndUsageGuard(user, target)) return;

  const deck = getZone(user, 'deck');
  if (deck.array.length === 0) {
    appendMessage(user, '⛔ Your deck is empty.', 'announcement', false);
    return;
  }

  let drew = 0;
  if (drawStep?.until) {
    const targetHand = drawStep.count;
    while (
      getZone(user, 'hand').getCount() < targetHand &&
      getZone(user, 'deck').getCount() > 0
    ) {
      moveCardBundle(user, user, 'deck', 'hand', 0, false, 'move', emit);
      drew++;
    }
  } else if (drawStep?.eachPlayer) {
    for (const who of ['self', 'opp']) {
      if (getZone(who, 'deck').getCount() > 0) {
        moveCardBundle(who, who, 'deck', 'hand', 0, false, 'move', emit);
        if (who === user) drew++;
      }
    }
  } else {
    const n = drawStep?.count || 1;
    for (let i = 0; i < n; i++) {
      if (getZone(user, 'deck').getCount() === 0) break;
      moveCardBundle(user, user, 'deck', 'hand', 0, false, 'move', emit);
      drew++;
    }
  }

  if (rulesState.enabled) markAbilityUsed(user, target);
  appendMessage(
    user,
    `🃏 ${target.name} draws ${drew} card${drew !== 1 ? 's' : ''}.`,
    'announcement',
    false
  );
};

// Status ability: apply a Special Condition to the opponent's Active Pokémon.
export const statusAbility = async (user, emit = true, targetCard = null) => {
  const { target } = resolveAbilityTarget(user, targetCard);
  await ensureCardData(target);
  if (!abilityTurnAndUsageGuard(user, target, 'status')) return;

  const parsed = parseStatusInflict(target);
  if (!parsed?.status) {
    appendMessage(
      user,
      `⛔ Could not parse ${target.name}'s status effect.`,
      'announcement',
      false
    );
    return;
  }

  const oppPlayer = user === 'self' ? 'opp' : 'self';
  const onOpponent =
    parsed.target === 'opponent-active' || parsed.target === 'opponent';
  const statusPlayer = onOpponent ? oppPlayer : user;
  const statusTarget = getZone(statusPlayer, 'active').array[0];
  if (!statusTarget) {
    appendMessage(user, '⛔ No target Pokémon in the Active Spot.', 'announcement', false);
    return;
  }

  const key = statusTarget.image?.dataset?.cardId || statusTarget.name;
  applyStatus(statusPlayer, key, parsed.status);
  if (rulesState.enabled) markAbilityUsed(user, target);
  appendMessage(
    user,
    `💫 ${target.name} makes ${statusTarget.name} ${parsed.status}.`,
    'announcement',
    false
  );
};

// Move-damage ability: place damage counters on opponent Pokémon.
export const moveDamageAbility = async (user, emit = true, targetCard = null) => {
  const { target } = resolveAbilityTarget(user, targetCard);
  await ensureCardData(target);
  if (!abilityTurnAndUsageGuard(user, target, 'move-damage')) return;

  const parsed = parseMoveDamage(target);
  if (!parsed || parsed.count === null) {
    appendMessage(
      user,
      `⛔ Could not parse ${target.name}'s damage effect.`,
      'announcement',
      false
    );
    return;
  }
  const amount = parsed.count || 1;

  const damagePlayer = parsed.onOpponent
    ? user === 'self'
      ? 'opp'
      : 'self'
    : user;
  const candidates = [];
  const active = getZone(damagePlayer, 'active').array[0];
  if (active?.type === 'Pokémon') {
    candidates.push({ card: active, zone: 'active', idx: 0 });
  }
  getZone(damagePlayer, 'bench').array.forEach((c, idx) => {
    if (c.type === 'Pokémon') candidates.push({ card: c, zone: 'bench', idx });
  });

  if (candidates.length === 0) {
    appendMessage(user, '⛔ No Pokémon to damage.', 'announcement', false);
    return;
  }

  const applyDamage = (pick) => {
    const { card, zone, idx } = pick;
    if (card.image?.damageCounter) {
      const current =
        parseInt(card.image.damageCounter.textContent || '0', 10) || 0;
      updateDamageCounter(damagePlayer, zone, idx, current + amount, emit);
    } else {
      addDamageCounter(damagePlayer, zone, idx, amount, emit);
    }
    if (rulesState.enabled) markAbilityUsed(user, target);
    appendMessage(
      user,
      `💥 ${target.name} places ${amount} damage counter${amount !== 1 ? 's' : ''} on ${card.name}.`,
      'announcement',
      false
    );
  };

  if (candidates.length === 1) {
    applyDamage(candidates[0]);
    return;
  }

  const pick = await _pickFromList(
    `${target.name} — place damage on which Pokémon?`,
    candidates.map(({ card }, i) => ({ label: card.name || 'Pokémon', idx: i }))
  );
  if (pick === null) {
    appendMessage(user, 'Damage placement canceled.', 'announcement', false);
    return;
  }
  applyDamage(candidates[pick]);
};

// Look-at-top ability: reveal top N cards; optionally take one to hand.
export const lookAtTopAbility = async (user, emit = true, targetCard = null) => {
  const { target } = resolveAbilityTarget(user, targetCard);
  await ensureCardData(target);
  if (!abilityTurnAndUsageGuard(user, target, 'look-at-top')) return;

  const parsed = parseLookAtTop(target);
  if (!parsed?.count) {
    appendMessage(
      user,
      `⛔ Could not parse ${target.name}'s look-at-top effect.`,
      'announcement',
      false
    );
    return;
  }

  const deck = getZone(user, 'deck');
  if (deck.array.length === 0) {
    appendMessage(user, '⛔ Your deck is empty.', 'announcement', false);
    return;
  }

  const topCards = deck.array.slice(0, parsed.count);
  const finish = () => {
    if (rulesState.enabled) markAbilityUsed(user, target);
  };

  if (parsed.takeToHand) {
    openAbilityChoicePicker({
      user,
      title: `${target.name} — take a top card to hand`,
      candidates: topCards,
      zoneFrom: 'deck',
      destination: 'hand',
      onPick: (picked) => {
        appendMessage(
          user,
          `👁️ ${target.name} takes ${picked.name || 'a card'} from the top of the deck.`,
          'announcement',
          false
        );
        finish();
      },
      onCancel: () => {
        appendMessage(user, '👁️ Look canceled.', 'announcement', false);
        finish();
      },
    });
    return;
  }

  openAbilityChoicePicker({
    user,
    title: `${target.name} — top ${topCards.length} card${topCards.length !== 1 ? 's' : ''} (view only)`,
    candidates: topCards,
    zoneFrom: 'deck',
    destination: null,
    onPick: () => {
      appendMessage(
        user,
        `👁️ ${target.name} looked at: ${topCards.map((c) => c.name || 'Card').join(', ')}.`,
        'announcement',
        false
      );
      finish();
    },
    onCancel: () => {
      appendMessage(user, '👁️ Look canceled.', 'announcement', false);
      finish();
    },
  });
};

// Recursion ability: put a card from discard into hand.
export const recursionAbility = async (user, emit = true, targetCard = null) => {
  const { target } = resolveAbilityTarget(user, targetCard);
  await ensureCardData(target);
  if (!abilityTurnAndUsageGuard(user, target, 'recursion')) return;

  const parsed = parseRecursionFromDiscard(target);
  if (!parsed?.count) {
    appendMessage(
      user,
      `⛔ Could not parse ${target.name}'s discard recursion.`,
      'announcement',
      false
    );
    return;
  }

  const discard = getZone(user, 'discard');
  if (discard.array.length === 0) {
    appendMessage(user, '⛔ Your discard pile is empty.', 'announcement', false);
    return;
  }

  const finish = () => {
    if (rulesState.enabled) markAbilityUsed(user, target);
  };

  openAbilityChoicePicker({
    user,
    title: `${target.name} — take a card from discard`,
    candidates: discard.array,
    zoneFrom: 'discard',
    destination: 'hand',
    onPick: (picked) => {
      appendMessage(
        user,
        `♻️ ${target.name} returns ${picked.name || 'a card'} to hand.`,
        'announcement',
        false
      );
      finish();
    },
    onCancel: () => {
      appendMessage(user, '♻️ Recursion canceled.', 'announcement', false);
    },
  });
};

// Evolve ability: evolve this Pokémon using a card from hand.
export const evolveAbility = async (user, emit = true, targetCard = null) => {
  const { target, targetZone, targetIdx } = resolveAbilityTarget(user, targetCard);
  await ensureCardData(target);
  if (!abilityTurnAndUsageGuard(user, target, 'evolve')) return;

  const hand = getZone(user, 'hand');
  const valid = [];
  for (let i = 0; i < hand.array.length; i++) {
    const c = hand.array[i];
    if (c.type !== 'Pokémon') continue;
    await ensureCardData(c);
    const check = await canEvolve(user, target, c, false);
    if (check.allowed) valid.push({ card: c, idx: i });
  }

  if (valid.length === 0) {
    appendMessage(
      user,
      `⛔ No valid evolution in hand for ${target.name}.`,
      'announcement',
      false
    );
    return;
  }

  const finishEvolve = async (entry) => {
    moveCard(user, user, 'hand', targetZone, entry.idx, targetIdx);
    markEvolvedThisTurn(user, target.name);
    if (rulesState.enabled) markAbilityUsed(user, target);
    appendMessage(
      user,
      `🧬 ${target.name} evolves into ${entry.card.name}!`,
      'announcement',
      false
    );
  };

  if (valid.length === 1) {
    await finishEvolve(valid[0]);
    return;
  }

  const pick = await _pickFromList(
    `${target.name} — choose an evolution from hand`,
    valid.map(({ card }, i) => ({ label: card.name || 'Pokémon', idx: i }))
  );
  if (pick === null) {
    appendMessage(user, 'Evolution canceled.', 'announcement', false);
    return;
  }
  await finishEvolve(valid[pick]);
};


export const pass = (user, emit = true) => {
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'pass', []);
    return;
  }

  if (rulesState.enabled) {
    const check = canPerformAction({ user, action: 'pass' });
    if (!check.allowed) {
      appendMessage(user, `⛔ ${check.reason}`, 'announcement', false);
      return;
    }
  }

  resetAbilityCounters();
  const message = determineUsername(user) + ' passed';
  appendMessage(user, message, 'player', false);
  discardBoard(user, user, false, false);

  processAction(user, emit, 'pass', []);

  if (rulesState.enabled) {
    endTurnWithBanner(user);
  }
};

const pokemonMatchesType = (card, typeFilter) => {
  if (!typeFilter || !card) return true;
  return (card.types || []).map((t) => String(t).toLowerCase()).includes(typeFilter);
};

const payStadiumCost = (user, cost) => {
  if (!cost) return true;
  const hand = getZone(user, 'hand');
  if (cost.type === 'discard-energy') {
    const idx = hand.array.findIndex((c) => c.type === 'Energy');
    if (idx < 0) {
      appendMessage(user, '⛔ No Energy in hand to discard.', 'announcement', false);
      return false;
    }
    moveCard(user, user, 'hand', 'discard', idx);
    return true;
  }
  if (cost.type === 'discard-hand') {
    if (hand.array.length < cost.n) {
      appendMessage(user, `⛔ Need ${cost.n} card(s) in hand to discard.`, 'announcement', false);
      return false;
    }
    for (let i = 0; i < cost.n; i++) moveCard(user, user, 'hand', 'discard', 0);
    return true;
  }
  return true;
};

const finishStadiumAction = (user, card, emit, payload) => {
  if (rulesState.enabled) markStadiumUsed(user);
  processAction(user, emit, 'stadium-effect', [payload]);
};

// ── Stadium effect (taxonomy E, once-per-turn / setup-once) ──────────
// Uses the active stadium's once-per-turn or setup-once effect.
// For once-per-turn: draw N / search / search-evolve / heal based on the parsed effect.
// For setup-once: draw N (one-shot, applied immediately).
export const stadiumEffect = async (user, emit = true) => {
  if (rulesState.enabled && rulesState.turnPlayer !== user) {
    appendMessage(user, `⛔ It's not your turn.`, 'announcement', false);
    return;
  }

  const stadium = getStadium();
  if (!stadium || !stadium.card) {
    appendMessage(user, '⛔ No Stadium is in play.', 'announcement', false);
    return;
  }

  const card = stadium.card;
  await ensureCardData(card);
  const result = applyStadiumEffect(card);

  if (!result.executed || result.results.length === 0) {
    appendMessage(user, `⚠️ ${card.name || 'Stadium'} has no actionable effect.`, 'announcement', false);
    return;
  }

  // Once-per-turn gate
  if (result.family === 'once-per-turn' && rulesState.enabled && stadiumUsed(user)) {
    appendMessage(user, `⛔ ${card.name || 'Stadium'}'s effect was already used this turn.`, 'announcement', false);
    return;
  }

  const action = result.results[0];
  const flags = rulesState.flags[user] || {};
  if (action.condition && !stadiumOnceConditionMet(action.condition, flags)) {
    const msg =
      action.condition.type === 'named-supporter'
        ? `⛔ Play a Supporter with "${action.condition.contains}" in its name first this turn.`
        : '⛔ Play a Supporter from your hand this turn first.';
    appendMessage(user, msg, 'announcement', false);
    return;
  }

  if (action.cost && !payStadiumCost(user, action.cost)) return;

  switch (action.action) {
    case 'hand-to-deck-top': {
      const hand = getZone(user, 'hand');
      if (hand.array.length === 0) {
        appendMessage(user, '⛔ Your hand is empty.', 'announcement', false);
        return;
      }
      moveCard(user, user, 'hand', 'deck', 0, 0);
      appendMessage(user, `◈ ${card.name}: Put a card from your hand on top of your deck.`, 'announcement', false);
      finishStadiumAction(user, card, emit, { action: 'hand-to-deck-top' });
      break;
    }
    case 'switch-type': {
      const active = getZone(user, 'active').array[0];
      const bench = getZone(user, 'bench');
      if (!active || !pokemonMatchesType(active, action.typeFilter)) {
        appendMessage(user, `⛔ Your Active Pokémon must be ${action.typeFilter || 'matching'}.`, 'announcement', false);
        return;
      }
      const benchIdx = bench.array.findIndex((c) => pokemonMatchesType(c, action.typeFilter));
      if (benchIdx < 0) {
        appendMessage(user, `⛔ No benched ${action.typeFilter || ''} Pokémon to switch with.`, 'announcement', false);
        return;
      }
      const benchCard = bench.array[benchIdx];
      moveCard(user, user, 'active', 'bench', 0);
      const newIdx = getZone(user, 'bench').array.indexOf(benchCard);
      if (newIdx >= 0) moveCard(user, user, 'bench', 'active', newIdx);
      appendMessage(user, `🔁 ${card.name}: Switched Active with a benched ${action.typeFilter} Pokémon.`, 'announcement', false);
      finishStadiumAction(user, card, emit, { action: 'switch-type' });
      break;
    }
    case 'discard-to-bench': {
      const discard = getZone(user, 'discard');
      const bench = getZone(user, 'bench');
      const { canAddToBench } = await import('../../setup/rules/ko-flow.mjs');
      const { getEffectiveBenchLimit, playerHasTeraInPlay } = await import('../../setup/rules/stadium-effects.mjs');
      const inPlay = [...getZone(user, 'active').array, ...bench.array].filter((c) => c.type === 'Pokémon');
      const limit = getEffectiveBenchLimit(playerHasTeraInPlay(inPlay));
      let moved = 0;
      for (let i = 0; i < discard.array.length && moved < (action.n || 1); i++) {
        const c = discard.array[i];
        if (c.type !== 'Energy') continue;
        if (action.typeFilter && !pokemonMatchesType({ types: c.types || [c.name] }, action.typeFilter)) {
          const name = String(c.name || '').toLowerCase();
          if (action.typeFilter === 'lightning' && !name.includes('lightning')) continue;
        }
        if (!canAddToBench(bench.getCount(), limit).allowed) break;
        moveCard(user, user, 'discard', 'bench', i - moved);
        moved++;
      }
      if (moved === 0) {
        appendMessage(user, '⛔ No matching Energy in discard (or bench full).', 'announcement', false);
        return;
      }
      appendMessage(user, `◈ ${card.name}: Put ${moved} Basic ${action.typeFilter || ''} Energy onto your Bench.`, 'announcement', false);
      finishStadiumAction(user, card, emit, { action: 'discard-to-bench', n: moved });
      break;
    }
    case 'heal-all': {
      const n = action.n || 10;
      let healed = 0;
      for (const zoneId of ['active', 'bench']) {
        const zone = getZone(user, zoneId);
        for (let i = 0; i < zone.array.length; i++) {
          if (zone.array[i]?.type !== 'Pokémon') continue;
          removeDamageCounter(user, zoneId, i, n, emit);
          healed++;
        }
      }
      appendMessage(user, `💚 ${card.name}: Healed ${n} damage from each of your Pokémon (${healed} total).`, 'announcement', false);
      finishStadiumAction(user, card, emit, { action: 'heal-all', n });
      break;
    }
    case 'search-bench': {
      const deck = getZone(user, 'deck');
      const { canAddToBench } = await import('../../setup/rules/ko-flow.mjs');
      const { getEffectiveBenchLimit, playerHasTeraInPlay } = await import('../../setup/rules/stadium-effects.mjs');
      const bench = getZone(user, 'bench');
      const inPlay = [...getZone(user, 'active').array, ...bench.array].filter((c) => c.type === 'Pokémon');
      const limit = getEffectiveBenchLimit(playerHasTeraInPlay(inPlay));
      if (!canAddToBench(bench.getCount(), limit).allowed) {
        appendMessage(user, '⛔ Bench is full.', 'announcement', false);
        return;
      }
      let found = -1;
      for (let i = 0; i < deck.array.length; i++) {
        await ensureCardData(deck.array[i]);
        if (matchesStadiumSearch(deck.array[i], action)) {
          found = i;
          break;
        }
      }
      if (found < 0) {
        appendMessage(user, `🔍 ${card.name}: no matching Pokémon found in deck.`, 'announcement', false);
        shuffleZone(user, user, 'deck');
        finishStadiumAction(user, card, emit, { action: 'search-bench', found: false });
        return;
      }
      const foundName = deck.array[found]?.name || 'Basic Pokémon';
      moveCard(user, user, 'deck', 'bench', found);
      appendMessage(user, `🔍 ${card.name}: ${foundName} → Bench.`, 'announcement', false);
      shuffleZone(user, user, 'deck');
      finishStadiumAction(user, card, emit, { action: 'search-bench' });
      break;
    }
    case 'search-hand': {
      const deck = getZone(user, 'deck');
      let moved = 0;
      const want = action.n || 1;
      for (let i = 0; i < deck.array.length && moved < want; ) {
        await ensureCardData(deck.array[i]);
        if (matchesStadiumSearch(deck.array[i], action)) {
          moveCard(user, user, 'deck', 'hand', i);
          moved++;
        } else {
          i++;
        }
      }
      appendMessage(
        user,
        moved
          ? `🔍 ${card.name}: found ${moved} card(s) → hand.`
          : `🔍 ${card.name}: no matching cards in deck.`,
        'announcement',
        false
      );
      shuffleZone(user, user, 'deck');
      finishStadiumAction(user, card, emit, { action: 'search-hand', n: moved });
      break;
    }
    case 'discard-draw':
    case 'draw': {
      const n = action.n || 1;
      draw(user, n, emit);
      appendMessage(user, `◈ ${card.name}: Drew ${n} card(s).`, 'announcement', false);
      finishStadiumAction(user, card, emit, { action: action.action, n });
      break;
    }
    case 'search': {
      const deck = getZone(user, 'deck');
      if (deck.array.length === 0) {
        appendMessage(user, '⛔ Your deck is empty.', 'announcement', false);
        return;
      }
      const topCard = deck.array[0];
      // If it's a Pokémon, put it in hand; otherwise deck unchanged
      const isPokemon = (topCard.type || '').toLowerCase().includes('pokemon') || (topCard.subtypes || []).some(s => s.toLowerCase() === 'pokemon');
      if (isPokemon) {
        moveCard(user, user, 'deck', 'hand', 0, 0);
        appendMessage(user, `🔍 ${card.name} searches: found ${topCard.name || 'a Pokémon'} → hand.`, 'announcement', false);
      } else {
        appendMessage(user, `🔍 ${card.name} searches: top card was ${topCard.name || 'a card'} (not a Pokémon). Deck unchanged.`, 'announcement', false);
      }
      finishStadiumAction(user, card, emit, { action: 'search' });
      break;
    }
    case 'search-evolve': {
      // Search-and-evolve (e.g. Grand Tree) evolves a Pokémon already in
      // play rather than fetching a card to hand, and its exact target
      // (which of your Pokémon in play, chained Stage 1 → Stage 2 search)
      // is a player choice this rules engine doesn't drive a picker for —
      // so this is guided, not auto-executed, same as other multi-choice
      // Trainer searches elsewhere in the engine.
      appendMessage(
        user,
        `🔍 ${card.name}: search your deck for a Pokémon that evolves from one of your Pokémon in play, then evolve it onto that Pokémon manually (see card text for any chained follow-up search).`,
        'announcement',
        false
      );
      shuffleZone(user, user, 'deck');
      finishStadiumAction(user, card, emit, { action: 'search-evolve' });
      break;
    }
    case 'energy': {
      appendMessage(
        user,
        `◈ ${card.name}: attach up to ${action.n || 1} Energy from your hand to your Pokémon manually (see card text).`,
        'announcement',
        false
      );
      finishStadiumAction(user, card, emit, { action: 'energy', n: action.n });
      break;
    }
    case 'heal': {
      const n = action.n || 1;
      const active = getZone(user, 'active').array[0];
      if (!active) {
        appendMessage(user, '⛔ No active Pokémon to heal.', 'announcement', false);
        return;
      }
      // Remove up to n damage counters from the active Pokémon
      removeDamageCounter(user, 'active', 0, n, emit);
      appendMessage(user, `💚 ${card.name}: Healed ${n} damage counter(s) from ${active.name || 'active'}.`, 'announcement', false);
      finishStadiumAction(user, card, emit, { action: 'heal', n });
      break;
    }
    case 'damage-prevention': {
      // Continuous effect — no action needed, always active
      appendMessage(user, `◈ ${card.name}: Damage prevention is active (${action.amount === Infinity ? 'all damage' : action.amount + ' counters'}).`, 'announcement', false);
      break;
    }
    case 'retreat-prevention': {
      // Continuous effect — no action needed, always active
      appendMessage(user, `◈ ${card.name}: Opponent's Active Pokémon cannot retreat while in play.`, 'announcement', false);
      break;
    }
    case 'hand-protect': {
      // Continuous effect — no action needed, always active
      appendMessage(user, `◈ ${card.name}: Your hand is protected while this Stadium is in play.`, 'announcement', false);
      break;
    }
    default:
      appendMessage(user, `⚠️ ${card.name || 'Stadium'}: unrecognized effect "${action.action}".`, 'announcement', false);
  }
};
