// Pure summarizers for sync/decision log entries (design 087 §5); no DOM or state imports.

/** Short hint summary safe for logs (no huge deck arrays). */
export function summarizeCardHint(hint) {
  if (!hint) return null;
  const parts = [];
  if (hint.name) parts.push(hint.name);
  if (typeof hint.syncInstance === 'number') parts.push(`#${hint.syncInstance}`);
  if (hint.number) parts.push(`n${hint.number}`);
  if (hint.set) parts.push(hint.set);
  return parts.join(' ') || null;
}

/** Trim moveCardBundle parameters for logging. */
export function summarizeMoveCardParams(parameters) {
  if (!parameters?.length) return {};
  const [
    initiator,
    oZoneId,
    dZoneId,
    index,
    targetIndex,
    action,
    cardHints,
  ] = parameters;
  return {
    initiator,
    from: oZoneId,
    to: dZoneId,
    index,
    targetIndex,
    action,
    moving: summarizeCardHint(cardHints?.moving),
    target: summarizeCardHint(cardHints?.target),
    isEvolution: cardHints?.isEvolution ?? false,
  };
}

export function summarizeMoveParamsLine(parameters) {
  const s = summarizeMoveCardParams(parameters);
  const tgt =
    typeof s.targetIndex === 'number'
      ? `→target:${s.target}`
      : `→${s.to}`;
  return `${s.from}[${s.index}] ${s.moving} ${tgt}`;
}

/**
 * Summarize a decision into a short human-readable line.
 * @param {string} action
 * @param {any[]} parameters
 * @returns {string}
 */
export function summarizeDecision(action, parameters = []) {
  switch (action) {
    case 'moveCardBundle': {
      const [, from, to, , , subAction, hints] = parameters;
      const moving = hints?.moving?.name || (hints?.moving?.syncInstance ?? '?');
      const target = hints?.target?.name ? ` →${hints.target.name}` : '';
      return `${moving} ${from}[${parameters[3]}] ${subAction} →${to}${target}`;
    }
    case 'attack':
      return `attack[${parameters[0] ?? 0}]`;
    case 'retreat':
      return 'retreat';
    case 'pass':
      return 'pass';
    case 'useAbility': {
      const hint = parameters[3];
      const name = hint?.name || (hint?.syncInstance ?? '?');
      return `useAbility ${name} (${parameters[1] ?? '?'})`;
    }
    case 'draw':
      return `draw[${parameters[1] ?? 1}]`;
    case 'takePrizes':
      return `takePrizes[${parameters[1] ?? '?'}]`;
    case 'takePrizesByIndex':
      return `takePrizesByIndex`;
    case 'shuffleIntoDeck':
      return `shuffleIntoDeck ${parameters[1] ?? '?'}`;
    case 'moveToDeckTop':
      return `moveToDeckTop ${parameters[1] ?? '?'}`;
    case 'switchWithDeckTop':
      return `switchWithDeckTop ${parameters[1] ?? '?'}`;
    case 'shuffleZone':
      return `shuffleZone ${parameters[1] ?? '?'}`;
    case 'shuffleBottom':
      return `shuffleBottom ${parameters[1] ?? '?'}`;
    case 'discardAll':
      return `discardAll ${parameters[1] ?? '?'}`;
    case 'handAll':
      return `handAll ${parameters[1] ?? '?'}`;
    case 'lostZoneAll':
      return `lostZoneAll ${parameters[1] ?? '?'}`;
    case 'shuffleAll':
      return `shuffleAll ${parameters[1] ?? '?'}`;
    case 'discardAndDraw':
      return `discardAndDraw ${parameters[1] ?? '?'}`;
    case 'shuffleAndDraw':
      return `shuffleAndDraw ${parameters[1] ?? '?'}`;
    case 'shuffleBottomAndDraw':
      return `shuffleBottomAndDraw ${parameters[1] ?? '?'}`;
    case 'shufflePrizesToDeckBottom':
      return 'shufflePrizesToDeckBottom';
    case 'addDamageCounter':
      return `damage ${parameters[2] ?? '?'}`;
    case 'addSpecialCondition':
      return `condition ${parameters[2] ?? '?'}`;
    case 'rotateCard':
      return 'rotate';
    case 'stadium-effect':
      return 'stadium-effect';
    default:
      return action;
  }
}
