/**
 * acceptAction always calls `fn(user, ...parameters, emit)`.
 * processAction parameter lists must therefore be everything between user and emit.
 * Several composer-era APIs appended extra trailing args *after* emit, which
 * made the mirror treat hints/matIds as emit=true. These helpers normalize both
 * call styles so local `fn(..., false)` and acceptAction `fn(..., tail, false)`
 * both work.
 */

/** @param {*} emitOrTail @param {*} maybeEmit */
export function splitEmitAndTail(emitOrTail, maybeEmit, defaultEmit = true) {
  if (typeof emitOrTail === 'boolean') {
    return { emit: emitOrTail, tail: isHintLike(maybeEmit) ? maybeEmit : null };
  }
  if (emitOrTail === undefined || emitOrTail === null) {
    return {
      emit: defaultEmit,
      tail: isHintLike(maybeEmit) ? maybeEmit : null,
    };
  }
  if (typeof emitOrTail === 'object') {
    return {
      emit: maybeEmit === undefined ? defaultEmit : !!maybeEmit,
      tail: emitOrTail,
    };
  }
  return { emit: defaultEmit, tail: null };
}

function isHintLike(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * attack() local: (user, emit=true, attackIndex=0)
 * attack() acceptAction: (user, attackIndex, rngBundle, emit)
 */
export function parseAttackArgs(a, b, c) {
  if (typeof c === 'boolean') {
    return {
      attackIndex: typeof a === 'number' ? a : 0,
      rngBundle: isHintLike(b) ? b : {},
      emit: c,
    };
  }
  if (typeof a === 'boolean' || a === undefined) {
    return {
      attackIndex: typeof b === 'number' ? b : 0,
      rngBundle: {},
      emit: a !== false,
    };
  }
  if (typeof a === 'number') {
    return {
      attackIndex: a,
      rngBundle: isHintLike(b) ? b : {},
      emit: typeof b === 'boolean' ? b : true,
    };
  }
  if (isHintLike(a)) {
    return {
      attackIndex: typeof a.attackIndex === 'number' ? a.attackIndex : 0,
      rngBundle: a,
      emit: typeof b === 'boolean' ? b : true,
    };
  }
  return { attackIndex: 0, rngBundle: {}, emit: true };
}

/** rng() < 0.5 is heads in status.mjs / attack coin flips. */
export function rngFromCoin(result) {
  if (result === true || result === 'heads') return () => 0;
  if (result === false || result === 'tails') return () => 1;
  return Math.random;
}

export function flipCoin(bundle, key) {
  const existing = bundle?.[key];
  if (existing === 'heads' || existing === 'tails') return existing;
  const value = Math.random() < 0.5 ? 'heads' : 'tails';
  if (bundle) bundle[key] = value;
  return value;
}

export function deckDataEquals(a, b) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
