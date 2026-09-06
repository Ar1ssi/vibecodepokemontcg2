/* eslint-disable no-undef */
/**
 * Playmat iframe refs, kept separate from `global-variables.js` so zone
 * helpers can import them without creating a circular import through
 * `front-end.js` (which deadlocks module initialization in the browser).
 */
export const selfContainer = document.getElementById('selfContainer');
export const selfContainerDocument = selfContainer.contentWindow.document;
export const oppContainer = document.getElementById('oppContainer');
export const oppContainerDocument = oppContainer.contentWindow.document;
