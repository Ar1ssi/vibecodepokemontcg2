/**
 * @file Phase 2 dual-run action-to-command translator.
 * Bridges legacy client actions into structured server commands.
 */

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
      // parameters: [targetBenchIndex or cardHints]
      const [target] = parameters;
      const targetBenchInstanceId =
        target?.syncInstance != null ? Number(target.syncInstance) : Number(target) || 0;
      return {
        type: 'retreat',
        payload: { targetBenchInstanceId },
      };
    }

    case 'useAbility': {
      // parameters: [instanceId, abilityIndex]
      const [instanceId, abilityIndex] = parameters;
      return {
        type: 'useAbility',
        payload: {
          instanceId: Number(instanceId) || 0,
          abilityIndex: typeof abilityIndex === 'number' ? abilityIndex : 0,
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
      // parameters: [user, zoneId, index, amount]
      const [, , index, amount] = parameters;
      return {
        type: 'addDamageCounter',
        payload: {
          instanceId: Number(index) || 0,
          amount: Number(amount) || 10,
        },
      };
    }

    case 'updateDamageCounter': {
      const [, , index, amount] = parameters;
      return {
        type: 'updateDamageCounter',
        payload: {
          instanceId: Number(index) || 0,
          amount: Number(amount) || 0,
        },
      };
    }

    case 'removeDamageCounter': {
      const [, , index] = parameters;
      return {
        type: 'removeDamageCounter',
        payload: {
          instanceId: Number(index) || 0,
        },
      };
    }

    case 'addSpecialCondition': {
      // parameters: [user, zoneId, index, condition]
      const [, , index, condition] = parameters;
      return {
        type: 'addSpecialCondition',
        payload: {
          instanceId: Number(index) || 0,
          condition: String(condition || 'Asleep'),
        },
      };
    }

    case 'removeSpecialCondition': {
      const [, , index] = parameters;
      return {
        type: 'removeSpecialCondition',
        payload: {
          instanceId: Number(index) || 0,
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
