/**
 * @file Phase 2 dual-run action-to-command translator.
 * Bridges legacy client actions into structured server commands.
 */

import { DISPOSITION_TABLE } from '../../../../shared/engine/commands.mjs';

const SPECIAL_CONDITIONS = [
  'Asleep',
  'Burned',
  'Confused',
  'Paralyzed',
  'Poisoned',
];

// True under `node --test` and any bundler/dev-server that sets NODE_ENV; false when
// `process` doesn't exist at all (a real browser bundle with no env shim), which is an
// acceptable degrade-to-logging default since there's no other dev/prod signal in client/src.
const isDevLikeEnvironment = () =>
  typeof process !== 'undefined' &&
  !!process.env &&
  process.env.NODE_ENV !== 'production';

// Server-issued { syncInstance -> instanceId } lookup for the local player's own cards
// (see design 002 §3.1 / decision D10). The server is the sole minter of instanceId;
// the client's syncInstance numbering is a purely local, per-player sequence that does
// not match it. Every outgoing command must translate through this map or be dropped.
let instanceMap = null;

/**
 * Stores the server-issued syncInstance -> instanceId lookup for this player.
 *
 * @param {Record<string, number>|null} map
 */
export function setInstanceMap(map) {
  instanceMap = map && typeof map === 'object' ? map : null;
}

/**
 * Resolves a client-local syncInstance to the server's authoritative instanceId.
 * Returns null when unresolvable (no map yet, or the id isn't in it) — callers must
 * treat that as "drop the command", never fall back to guessing.
 *
 * @param {number} syncInstance
 * @returns {number|null}
 */
export function resolveInstanceId(syncInstance) {
  if (instanceMap == null || syncInstance == null) return null;
  const value = instanceMap[syncInstance];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * Resolves a card-identity hint object to a server instanceId.
 * If the hint already carries a server-shaped `.instanceId`, it's used as-is.
 * If it carries a client-local `.syncInstance`, it's translated via resolveInstanceId.
 * Returns null when the hint is missing, malformed, or unresolvable.
 *
 * @param {{ instanceId?: any, syncInstance?: any }|null|undefined} hint
 * @returns {number|null}
 */
function resolveHintInstanceId(hint) {
  if (!hint || typeof hint !== 'object') return null;
  if (hint.instanceId != null) {
    const id = Number(hint.instanceId);
    return Number.isInteger(id) ? id : null;
  }
  if (hint.syncInstance != null) {
    return resolveInstanceId(Number(hint.syncInstance));
  }
  return null;
}

/**
 * Helper to normalize a special condition string or code into canonical engine name.
 *
 * @param {any} val
 * @returns {string|null}
 */
export function normalizeSpecialCondition(val) {
  if (val == null) return null;
  const str = String(val).trim();
  if (!str || str === '0') return null;
  const upper = str.toUpperCase();
  if (upper === 'P' || upper === 'POISON' || upper === 'POISONED')
    return 'Poisoned';
  if (upper === 'B' || upper === 'BURN' || upper === 'BURNED') return 'Burned';
  if (upper === 'A' || upper === 'ASLEEP' || upper === 'SLEEP') return 'Asleep';
  if (upper === 'PA' || upper === 'PARALYZED' || upper === 'PARALYZE')
    return 'Paralyzed';
  if (upper === 'C' || upper === 'CONFUSED' || upper === 'CONFUSE')
    return 'Confused';
  if (SPECIAL_CONDITIONS.includes(str)) return str;
  return null;
}

/**
 * Unpacks target card instance ID and numeric amount for damage counter actions.
 * Supports:
 * - [zoneId, resolvedIndex, damageAmount, hint]
 * - [zoneId, resolvedIndex, hint]
 * - [user, zoneId, resolvedIndex, damageAmount, hint]
 * - [instanceId, amount]
 * - [{ instanceId, amount }]
 *
 * instanceId is null when no hint was provided or the hint's syncInstance could not be
 * resolved through the server's instance map — callers must drop the command in that case.
 *
 * @param {any[]} parameters
 * @param {number} defaultAmount
 * @returns {{ instanceId: number|null, amount: number }}
 */
function unpackTargetAndAmount(parameters, defaultAmount = 10) {
  let args = Array.isArray(parameters) ? [...parameters] : [];
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    const obj = args[0];
    const instanceId = resolveHintInstanceId(obj);
    const amount = obj.amount != null ? Number(obj.amount) : defaultAmount;
    return {
      instanceId,
      amount: !isNaN(amount) ? amount : defaultAmount,
    };
  }

  // Strip optional leading user ('self', 'opp', 'p1', 'p2')
  if (
    typeof args[0] === 'string' &&
    ['self', 'opp', 'p1', 'p2'].includes(args[0])
  ) {
    args.shift();
  }

  let instanceId = null;
  let amount = defaultAmount;

  if (typeof args[0] === 'string' && isNaN(Number(args[0]))) {
    // args: [zoneId, index, maybeAmount, maybeHint]
    const [, , maybeAmount, maybeHint] = args;
    let hint = null;

    if (maybeHint && typeof maybeHint === 'object') {
      hint = maybeHint;
      if (maybeAmount != null && !isNaN(Number(maybeAmount))) {
        amount = Number(maybeAmount);
      }
    } else if (maybeAmount && typeof maybeAmount === 'object') {
      hint = maybeAmount;
    } else if (maybeAmount != null && !isNaN(Number(maybeAmount))) {
      amount = Number(maybeAmount);
    }

    instanceId = resolveHintInstanceId(hint);
  } else {
    // args: [instanceId, amount?]
    const [rawId, rawAmount] = args;
    if (rawId && typeof rawId === 'object') {
      instanceId = resolveHintInstanceId(rawId);
    } else if (rawId != null && !isNaN(Number(rawId))) {
      instanceId = Number(rawId);
    }

    if (rawAmount != null && !isNaN(Number(rawAmount))) {
      amount = Number(rawAmount);
    }
  }

  return {
    instanceId,
    amount: !isNaN(amount) ? amount : defaultAmount,
  };
}

/**
 * Unpacks target card instance ID and condition name for special condition actions.
 * Supports:
 * - [zoneId, resolvedIndex, condition, hint]
 * - [zoneId, resolvedIndex, hint]
 * - [user, zoneId, resolvedIndex, condition, hint]
 * - [instanceId, condition]
 * - [{ instanceId, condition }]
 *
 * instanceId is null when no hint was provided or the hint's syncInstance could not be
 * resolved through the server's instance map — callers must drop the command in that case.
 *
 * @param {any[]} parameters
 * @param {string|null} defaultCondition
 * @returns {{ instanceId: number|null, condition: string|null }}
 */
function unpackTargetAndCondition(parameters, defaultCondition = 'Poisoned') {
  let args = Array.isArray(parameters) ? [...parameters] : [];
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    const obj = args[0];
    const instanceId = resolveHintInstanceId(obj);
    const condition =
      obj.condition !== undefined
        ? normalizeSpecialCondition(obj.condition)
        : defaultCondition;
    return {
      instanceId,
      condition,
    };
  }

  // Strip optional leading user ('self', 'opp', 'p1', 'p2')
  if (
    typeof args[0] === 'string' &&
    ['self', 'opp', 'p1', 'p2'].includes(args[0])
  ) {
    args.shift();
  }

  let instanceId = null;
  let condition = defaultCondition;

  if (typeof args[0] === 'string' && isNaN(Number(args[0]))) {
    // args: [zoneId, index, maybeCondOrHint, maybeHint]
    const [, , maybeCondOrHint, maybeHint] = args;
    let hint = null;

    if (maybeHint && typeof maybeHint === 'object') {
      hint = maybeHint;
      if (maybeCondOrHint !== undefined) {
        condition = normalizeSpecialCondition(maybeCondOrHint);
      }
    } else if (maybeCondOrHint && typeof maybeCondOrHint === 'object') {
      hint = maybeCondOrHint;
    } else if (maybeCondOrHint !== undefined) {
      condition = normalizeSpecialCondition(maybeCondOrHint);
    }

    instanceId = resolveHintInstanceId(hint);
  } else {
    // args: [instanceId, condition?]
    const [rawId, rawCond] = args;
    if (rawId && typeof rawId === 'object') {
      instanceId = resolveHintInstanceId(rawId);
    } else if (rawId != null && !isNaN(Number(rawId))) {
      instanceId = Number(rawId);
    }

    if (rawCond !== undefined) {
      condition = normalizeSpecialCondition(rawCond);
    }
  }

  return {
    instanceId,
    condition,
  };
}

/**
 * Translates legacy client action and parameters into structured command { type, payload } | null.
 * Returns null both for unrecognized actions and for any action whose card-identity hint
 * could not be resolved to a server instanceId (fail closed — never guess).
 *
 * @param {string} action
 * @param {any[]} [parameters=[]]
 * @returns {{ type: string, payload: object } | null}
 */
export function translateActionToCmd(action, parameters = []) {
  if (!action || typeof action !== 'string') return null;

  switch (action) {
    case 'moveCardBundle': {
      // parameters: [initiator, oZoneId, dZoneId, index, targetIndex, actionType, cardHints]
      const [, oZoneId, dZoneId, index, targetIndex, actionType, cardHints] =
        parameters;
      const moving = cardHints?.moving;

      let instanceId;
      if (moving?.instanceId != null || moving?.syncInstance != null) {
        instanceId = resolveHintInstanceId(moving);
        if (instanceId == null) {
          console.warn(
            'translateActionToCmd: moveCardBundle unresolved syncInstance',
            moving?.syncInstance
          );
          return null;
        }
      } else {
        instanceId = Number(index);
      }

      if (instanceId == null || Number.isNaN(instanceId)) return null;

      const isAttach =
        actionType === 'attach' ||
        (targetIndex != null &&
          targetIndex !== false &&
          ['active', 'bench'].includes(dZoneId));

      if (isAttach) {
        const target = cardHints?.target;
        if (
          target &&
          (target.instanceId != null || target.syncInstance != null)
        ) {
          const targetInstanceId = resolveHintInstanceId(target);
          if (targetInstanceId == null) {
            console.warn(
              'translateActionToCmd: moveCardBundle unresolved target syncInstance',
              target.syncInstance
            );
            return null;
          }
          return {
            type: 'attachCard',
            payload: {
              instanceId,
              targetInstanceId,
            },
          };
        }
      }

      return {
        type: 'moveCard',
        payload: {
          instanceId,
          from: oZoneId,
          to: dZoneId,
          ...(typeof targetIndex === 'number' ? { targetIndex } : {}),
        },
      };
    }

    case 'draw': {
      // parameters: [initiator, drawAmount]
      const [, drawAmount] = parameters;
      const count = Number(drawAmount) > 0 ? Number(drawAmount) : 1;
      return {
        type: 'draw',
        payload: { count },
      };
    }

    case 'attack': {
      // parameters: [attackIndex]
      const [attackIndex] = parameters;
      return {
        type: 'attack',
        payload: {
          attackIndex: typeof attackIndex === 'number' ? attackIndex : 0,
        },
      };
    }

    case 'pass': {
      return {
        type: 'pass',
        payload: {},
      };
    }

    // design 002 slice 3.4c: takeTurn advances the turn through the same
    // resolveCheckup/advanceTurn path as pass (see reduce.mjs). Legacy passes only
    // [oInitiator], which carries no card identity and nothing the server needs — the
    // server owns turn-start draw and board reset itself.
    case 'takeTurn': {
      return {
        type: 'takeTurn',
        payload: {},
      };
    }

    case 'retreat': {
      // parameters: [targetBench or benchInstanceId, discardEnergyIds]
      const [target, discardEnergyIds] = parameters;
      const payload = {};
      if (target != null) {
        let benchInstanceId = null;
        if (typeof target === 'object') {
          if (target.benchInstanceId != null) {
            benchInstanceId = Number(target.benchInstanceId);
          } else if (target.targetBenchInstanceId != null) {
            benchInstanceId = Number(target.targetBenchInstanceId);
          } else if (target.instanceId != null) {
            benchInstanceId = Number(target.instanceId);
          } else if (target.syncInstance != null) {
            benchInstanceId = resolveInstanceId(Number(target.syncInstance));
            if (benchInstanceId == null) {
              console.warn(
                'translateActionToCmd: retreat unresolved syncInstance',
                target.syncInstance
              );
              return null;
            }
          }
        } else if (!isNaN(Number(target))) {
          benchInstanceId = Number(target);
        }
        if (Number.isInteger(benchInstanceId)) {
          payload.benchInstanceId = benchInstanceId;
        }
      }
      if (Array.isArray(discardEnergyIds)) {
        payload.discardEnergyIds = discardEnergyIds
          .map(Number)
          .filter((id) => Number.isInteger(id));
      }
      return {
        type: 'retreat',
        payload,
      };
    }

    case 'useAbility': {
      // parameters: [instanceId, abilityIndex] OR [oInitiator, zoneId, resolved, hint]
      let instanceId = 0;
      let abilityIndex = 0;

      if (
        typeof parameters[0] === 'string' &&
        ['self', 'opp', 'p1', 'p2'].includes(parameters[0])
      ) {
        const [, , , hint] = parameters;
        const resolved = resolveHintInstanceId(hint);
        if (resolved == null) {
          console.warn(
            'translateActionToCmd: useAbility unresolved syncInstance',
            hint?.syncInstance
          );
          return null;
        }
        instanceId = resolved;
      } else {
        const [rawId, rawIndex] = parameters;
        instanceId = Number(rawId) || 0;
        abilityIndex = typeof rawIndex === 'number' ? rawIndex : 0;
      }

      return {
        type: 'useAbility',
        payload: {
          instanceId,
          abilityIndex,
        },
      };
    }

    case 'stadium-effect': {
      return {
        type: 'stadium-effect',
        payload: {},
      };
    }

    case 'addDamageCounter': {
      const { instanceId, amount } = unpackTargetAndAmount(parameters, 10);
      if (instanceId == null) {
        console.warn(
          'translateActionToCmd: addDamageCounter unresolved instanceId',
          parameters
        );
        return null;
      }
      return {
        type: 'addDamageCounter',
        payload: {
          instanceId,
          amount: amount > 0 ? amount : 10,
        },
      };
    }

    case 'updateDamageCounter': {
      const { instanceId, amount } = unpackTargetAndAmount(parameters, 0);
      if (instanceId == null) {
        console.warn(
          'translateActionToCmd: updateDamageCounter unresolved instanceId',
          parameters
        );
        return null;
      }
      return {
        type: 'updateDamageCounter',
        payload: {
          instanceId,
          amount: Math.max(0, amount),
        },
      };
    }

    case 'removeDamageCounter': {
      const { instanceId, amount } = unpackTargetAndAmount(parameters, 0);
      if (instanceId == null) {
        console.warn(
          'translateActionToCmd: removeDamageCounter unresolved instanceId',
          parameters
        );
        return null;
      }
      const payload = { instanceId };
      if (amount > 0) {
        payload.amount = amount;
      }
      return {
        type: 'removeDamageCounter',
        payload,
      };
    }

    case 'addSpecialCondition': {
      const { instanceId, condition } = unpackTargetAndCondition(
        parameters,
        'Poisoned'
      );
      if (instanceId == null) {
        console.warn(
          'translateActionToCmd: addSpecialCondition unresolved instanceId',
          parameters
        );
        return null;
      }
      // condition is only null here when a value WAS explicitly provided but failed to
      // normalize (the "nothing given" path resolves via defaultCondition above) — drop
      // the command rather than silently relabeling it as 'Poisoned'.
      if (condition == null) {
        console.warn(
          'translateActionToCmd: addSpecialCondition unrecognized condition',
          parameters
        );
        return null;
      }
      return {
        type: 'addSpecialCondition',
        payload: {
          instanceId,
          condition,
        },
      };
    }

    case 'updateSpecialCondition': {
      const { instanceId, condition } = unpackTargetAndCondition(
        parameters,
        null
      );
      if (instanceId == null) {
        console.warn(
          'translateActionToCmd: updateSpecialCondition unresolved instanceId',
          parameters
        );
        return null;
      }
      return {
        type: 'updateSpecialCondition',
        payload: {
          instanceId,
          condition,
        },
      };
    }

    case 'removeSpecialCondition': {
      const { instanceId } = unpackTargetAndCondition(parameters, null);
      if (instanceId == null) {
        console.warn(
          'translateActionToCmd: removeSpecialCondition unresolved instanceId',
          parameters
        );
        return null;
      }
      return {
        type: 'removeSpecialCondition',
        payload: {
          instanceId,
        },
      };
    }

    // --- Zone ops (design 002 slice 3.4a). None of these legacy calls attach a
    // cardHint, so there is no syncInstance to resolve — position-addressed ops pass
    // their zone index straight through and let the server resolve it against its own
    // zone array (see reduce.mjs). Shuffle order is never sent: the server always
    // rolls its own via activeRng.

    case 'shuffleIntoDeck': {
      // parameters: [oInitiator, zoneId, index, indices]
      const [, zoneId, index] = parameters;
      const idx = Number(index);
      if (typeof zoneId !== 'string' || Number.isNaN(idx)) return null;
      return { type: 'shuffleIntoDeck', payload: { from: zoneId, index: idx } };
    }

    case 'moveToDeckTop': {
      // parameters: [oInitiator, oZoneId, index]
      const [, oZoneId, index] = parameters;
      const idx = Number(index);
      if (typeof oZoneId !== 'string' || Number.isNaN(idx)) return null;
      return { type: 'moveToDeckTop', payload: { from: oZoneId, index: idx } };
    }

    case 'switchWithDeckTop': {
      // parameters: [oInitiator, oZoneId, index]
      const [, oZoneId, index] = parameters;
      const idx = Number(index);
      if (typeof oZoneId !== 'string' || Number.isNaN(idx)) return null;
      return {
        type: 'switchWithDeckTop',
        payload: { from: oZoneId, index: idx },
      };
    }

    case 'shuffleZone': {
      // parameters: [oInitiator, zoneId, indices, message]
      const [, zoneId] = parameters;
      if (typeof zoneId !== 'string') return null;
      return { type: 'shuffleZone', payload: { zoneId } };
    }

    case 'shuffleBottom': {
      // parameters: [oInitiator, zoneId, indices]
      const [, zoneId] = parameters;
      if (typeof zoneId !== 'string') return null;
      return { type: 'shuffleBottom', payload: { zoneId } };
    }

    case 'shuffleAll': {
      // parameters: [oInitiator, zoneId, indices]
      const [, zoneId] = parameters;
      if (typeof zoneId !== 'string') return null;
      return { type: 'shuffleAll', payload: { zoneId } };
    }

    case 'discardAll': {
      // parameters: [oInitiator, zoneId]
      const [, zoneId] = parameters;
      if (typeof zoneId !== 'string') return null;
      return { type: 'discardAll', payload: { zoneId } };
    }

    case 'lostZoneAll': {
      // parameters: [oInitiator, zoneId]
      const [, zoneId] = parameters;
      if (typeof zoneId !== 'string') return null;
      return { type: 'lostZoneAll', payload: { zoneId } };
    }

    case 'handAll': {
      // parameters: [oInitiator, zoneId]
      const [, zoneId] = parameters;
      if (typeof zoneId !== 'string') return null;
      return { type: 'handAll', payload: { zoneId } };
    }

    case 'leaveAll': {
      // parameters: [oInitiator, oZoneId, dZoneId]
      const [, oZoneId, dZoneId] = parameters;
      if (typeof oZoneId !== 'string' || typeof dZoneId !== 'string')
        return null;
      return { type: 'leaveAll', payload: { from: oZoneId, to: dZoneId } };
    }

    case 'discardAndDraw': {
      // parameters: [oInitiator, drawAmount]
      const [, drawAmount] = parameters;
      const count = Number(drawAmount);
      return {
        type: 'discardAndDraw',
        payload: { count: Number.isFinite(count) && count >= 0 ? count : 0 },
      };
    }

    case 'shuffleAndDraw': {
      // parameters: [oInitiator, drawAmount, indices]
      const [, drawAmount] = parameters;
      const count = Number(drawAmount);
      return {
        type: 'shuffleAndDraw',
        payload: { count: Number.isFinite(count) && count >= 0 ? count : 0 },
      };
    }

    case 'shuffleBottomAndDraw': {
      // parameters: [oInitiator, drawAmount, indices]
      const [, drawAmount] = parameters;
      const count = Number(drawAmount);
      return {
        type: 'shuffleBottomAndDraw',
        payload: { count: Number.isFinite(count) && count >= 0 ? count : 0 },
      };
    }

    case 'shufflePrizesToDeckBottom': {
      return { type: 'shufflePrizesToDeckBottom', payload: {} };
    }

    case 'takePrizes': {
      // parameters: [oInitiator, count]
      const [, count] = parameters;
      const n = Number(count);
      return {
        type: 'takePrizes',
        payload: { count: Number.isFinite(n) && n > 0 ? n : 1 },
      };
    }

    case 'takePrizesByIndex': {
      // parameters: [oInitiator, indices]
      const [, indices] = parameters;
      if (!Array.isArray(indices)) return null;
      const idxs = indices.filter((i) => Number.isInteger(i) && i >= 0);
      if (idxs.length === 0) return null;
      return { type: 'takePrizesByIndex', payload: { indices: idxs } };
    }

    // --- Board ops (design 002 slice 3.4b). Legacy targets the literal 'board' zone;
    // the `message` chat-toggle parameter is cosmetic and carries no server-side meaning.

    // I19: reveal/hide. No cardHint involved — the server flips card.revealed on its
    // own zone array, position- or zone-addressed, same shape as the zone-op family above.
    case 'revealShortcut': {
      // parameters: [zoneId, index]
      const [zoneId, index] = parameters;
      const idx = Number(index);
      if (typeof zoneId !== 'string' || Number.isNaN(idx)) return null;
      return { type: 'revealShortcut', payload: { zoneId, index: idx } };
    }

    case 'hideShortcut': {
      // parameters: [zoneId, index]
      const [zoneId, index] = parameters;
      const idx = Number(index);
      if (typeof zoneId !== 'string' || Number.isNaN(idx)) return null;
      return { type: 'hideShortcut', payload: { zoneId, index: idx } };
    }

    case 'revealCards': {
      // parameters: [zoneId]
      const [zoneId] = parameters;
      if (typeof zoneId !== 'string') return null;
      return { type: 'revealCards', payload: { zoneId } };
    }

    case 'hideCards': {
      // parameters: [zoneId]
      const [zoneId] = parameters;
      if (typeof zoneId !== 'string') return null;
      return { type: 'hideCards', payload: { zoneId } };
    }

    case 'discardBoard': {
      return { type: 'discardBoard', payload: {} };
    }

    case 'handBoard': {
      return { type: 'handBoard', payload: {} };
    }

    case 'shuffleBoard': {
      return { type: 'shuffleBoard', payload: {} };
    }

    case 'lostZoneBoard': {
      return { type: 'lostZoneBoard', payload: {} };
    }

    // design 002 slice 3.4e: legacy undo always removes exactly one entry
    // (client/src/actions/general/undo.js:42 `filteredActionData.pop()`); the replayed
    // filteredActionData array itself carries nothing the server needs — the server derives
    // the tail to drop from its own authoritative commandLog.
    case 'undo': {
      return { type: 'undo', payload: {} };
    }

    case 'VSTARGXFunction': {
      const [instanceId] = parameters;
      return {
        type: 'useVStarGX',
        payload: {
          instanceId: Number(instanceId) || 0,
        },
      };
    }

    default: {
      const entry = DISPOSITION_TABLE[action];

      // Edge case 14: a new action landed in accept-action.js's `functions` object with
      // no disposition classification at all. This must never silently no-op.
      if (!entry) {
        const message = `translateActionToCmd: unknown action "${action}" has no DISPOSITION_TABLE entry`;
        if (isDevLikeEnvironment()) {
          throw new Error(message);
        }
        console.error(message);
        return null;
      }

      // Slated to become a command (slice 3.4+) but no case exists yet — expected right
      // now, not a bug. Warn so it stays visible while translation work is incomplete.
      if (
        entry.disposition === 'server_command' ||
        entry.disposition === 'manual_override'
      ) {
        console.warn(
          `translateActionToCmd: action "${action}" is disposition '${entry.disposition}' but has no case yet`,
          {
            commandType: entry.commandType,
            slice: entry.slice,
            notes: entry.notes,
          }
        );
        return null;
      }

      // Every other disposition (server_lifecycle, replaced_by_protocol,
      // replaced_by_redaction, announcement_only, client_local) is intentionally
      // relay-only or handled elsewhere — silent null is correct, permanent behavior.
      return null;
    }
  }
}
