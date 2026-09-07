/* eslint-disable no-undef */
/**
 * Playmat iframe refs, kept separate from `global-variables.js` so zone
 * helpers can import them without creating a circular import through
 * `front-end.js` (which deadlocks module initialization in the browser).
 */
export const selfContainer = typeof document !== 'undefined' ? document.getElementById('selfContainer') : null;
export const selfContainerDocument = selfContainer?.contentWindow?.document ?? null;
export const oppContainer = typeof document !== 'undefined' ? document.getElementById('oppContainer') : null;
export const oppContainerDocument = oppContainer?.contentWindow?.document ?? null;
