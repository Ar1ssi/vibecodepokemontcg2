/**
 * Shared runtime state (socket, systemState, playmat iframe refs).
 *
 * Import this module instead of `front-end.js` anywhere that only needs
 * state — pulling `front-end.js` from its own dependency tree deadlocks
 * module initialization in the browser.
 */
export {
  version,
  socket,
  systemState,
  mouseClick,
  selfContainer,
  oppContainer,
  selfContainerDocument,
  oppContainerDocument,
} from './initialization/global-variables/global-variables.js';
