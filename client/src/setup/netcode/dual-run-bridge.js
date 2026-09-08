/**
 * @file Phase 2 dual-run action-to-command translator.
 * Bridges legacy client actions into structured server commands.
 */

const SPECIAL_CONDITIONS = ['Asleep', 'Burned', 'Confused', 'Paralyzed', 'Poisoned'];

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
  if (upper === 'P' || upper === 'POISON' || upper === 'POISONED') return 'Poisoned';
  if (upper === 'B' || upper === 'BURN' || upper === 'BURNED') return 'Burned';
  if (upper === 'A' || upper === 'ASLEEP' || upper === 'SLEEP') return 'Asleep';
  if (upper === 'PA' || upper === 'PARALYZED' || upper === 'PARALYZE') return 'Paralyzed';
  if (upper === 'C' || upper === 'CONFUSED' || upper === 'CONFUSE') return 'Confused';
  if (SPECIAL_CONDITIONS.includes(str)) return str;
  return 'Poisoned';
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
 * @param {any[]} parameters
 * @param {number} defaultAmount
 * @returns {{ instanceId: number, amount: number }}
 */
function unpackTargetAndAmount(parameters, defaultAmount = 10) {
  let args = Array.isArray(parameters) ? [...parameters] : [];
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    const obj = args[0];
    const instanceId =
      obj.instanceId != null
        ? Number(obj.instanceId)
        : obj.syncInstance != null
          ? Number(obj.syncInstance)
          : 0;
    const amount = obj.amount != null ? Number(obj.amount) : defaultAmount;
    return {
      instanceId: Number.isInteger(instanceId) ? instanceId : 0,
      amount: !isNaN(amount) ? amount : defaultAmount,
    };
  }

  // Strip optional leading user ('self', 'opp', 'p1', 'p2')
  if (typeof args[0] === 'string' && ['self', 'opp', 'p1', 'p2'].includes(args[0])) {
    args.shift();
  }

  let instanceId = 0;
  let amount = defaultAmount;

  if (typeof args[0] === 'string' && isNaN(Number(args[0]))) {
    // args: [zoneId, index, maybeAmount, maybeHint]
    const [, index, maybeAmount, maybeHint] = args;
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

    const hintId = hint?.instanceId != null ? hint.instanceId : hint?.syncInstance;
    if (hintId != null && Number.isInteger(Number(hintId))) {
      instanceId = Number(hintId);
    } else if (index != null && Number.isInteger(Number(index))) {
      instanceId = Number(index);
    }
  } else {
    // args: [instanceId, amount?]
    const [rawId, rawAmount] = args;
    if (rawId && typeof rawId === 'object') {
      const hintId = rawId.instanceId != null ? rawId.instanceId : rawId.syncInstance;
      instanceId = Number(hintId) || 0;
    } else if (rawId != null && !isNaN(Number(rawId))) {
      instanceId = Number(rawId);
    }

    if (rawAmount != null && !isNaN(Number(rawAmount))) {
      amount = Number(rawAmount);
    }
  }

  return {
    instanceId: Number.isInteger(instanceId) ? instanceId : 0,
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
 * @param {any[]} parameters
 * @param {string|null} defaultCondition
 * @returns {{ instanceId: number, condition: string|null }}
 */
function unpackTargetAndCondition(parameters, defaultCondition = 'Poisoned') {
  let args = Array.isArray(parameters) ? [...parameters] : [];
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    const obj = args[0];
    const instanceId =
      obj.instanceId != null
        ? Number(obj.instanceId)
        : obj.syncInstance != null
          ? Number(obj.syncInstance)
          : 0;
    const condition =
      obj.condition !== undefined ? normalizeSpecialCondition(obj.condition) : defaultCondition;
    return {
      instanceId: Number.isInteger(instanceId) ? instanceId : 0,
      condition,
    };
  }

  // Strip optional leading user ('self', 'opp', 'p1', 'p2')
  if (typeof args[0] === 'string' && ['self', 'opp', 'p1', 'p2'].includes(args[0])) {
    args.shift();
  }

  let instanceId = 0;
  let condition = defaultCondition;

  if (typeof args[0] === 'string' && isNaN(Number(args[0]))) {
    // args: [zoneId, index, maybeCondOrHint, maybeHint]
    const [, index, maybeCondOrHint, maybeHint] = args;
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

    const hintId = hint?.instanceId != null ? hint.instanceId : hint?.syncInstance;
    if (hintId != null && Number.isInteger(Number(hintId))) {
      instanceId = Number(hintId);
    } else if (index != null && Number.isInteger(Number(index))) {
      instanceId = Number(index);
    }
  } else {
    // args: [instanceId, condition?]
    const [rawId, rawCond] = args;
    if (rawId && typeof rawId === 'object') {
      const hintId = rawId.instanceId != null ? rawId.instanceId : rawId.syncInstance;
      instanceId = Number(hintId) || 0;
    } else if (rawId != null && !isNaN(Number(rawId))) {
      instanceId = Number(rawId);
    }

    if (rawCond !== undefined) {
      condition = normalizeSpecialCondition(rawCond);
    }
  }

  return {
    instanceId: Number.isInteger(instanceId) ? instanceId : 0,
    condition,
  };
}

/**
 * Translates legacy client action and parameters into structured command { type, payload } | null.
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
      const [, oZoneId, dZoneId, index, targetIndex, actionType, cardHints] = parameters;
      const instanceId =
        cardHints?.moving?.syncInstance != null
          ? Number(cardHints.moving.syncInstance)
          : Number(index);

      if (Number.isNaN(instanceId)) return null;

      const isAttach =
        actionType === 'attach' ||
        (targetIndex != null && targetIndex !== false && ['active', 'bench'].includes(dZoneId));

      if (isAttach && cardHints?.target?.syncInstance != null) {
        return {
          type: 'attachCard',
          payload: {
            instanceId,
            targetInstanceId: Number(cardHints.target.syncInstance),
          },
        };
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

    case 'retreat': {
      // parameters: [targetBench or benchInstanceId, discardEnergyIds]
      const [target, discardEnergyIds] = parameters;
      const payload = {};
      if (target != null) {
        const rawId =
          target?.benchInstanceId != null
            ? target.benchInstanceId
            : target?.targetBenchInstanceId != null
              ? target.targetBenchInstanceId
              : target?.instanceId != null
                ? target.instanceId
                : target?.syncInstance != null
                  ? target.syncInstance
                  : target;
        const benchInstanceId = Number(rawId);
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

      if (typeof parameters[0] === 'string' && ['self', 'opp', 'p1', 'p2'].includes(parameters[0])) {
        const [, , index, hint] = parameters;
        const hintId = hint?.instanceId != null ? hint.instanceId : hint?.syncInstance;
        instanceId =
          hintId != null && Number.isInteger(Number(hintId))
            ? Number(hintId)
            : Number(index) || 0;
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
      const { instanceId, condition } = unpackTargetAndCondition(parameters, 'Poisoned');
      return {
        type: 'addSpecialCondition',
        payload: {
          instanceId,
          condition: condition || 'Poisoned',
        },
      };
    }

    case 'updateSpecialCondition': {
      const { instanceId, condition } = unpackTargetAndCondition(parameters, null);
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
      return {
        type: 'removeSpecialCondition',
        payload: {
          instanceId,
        },
      };
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

    default:
      return null;
  }
}
