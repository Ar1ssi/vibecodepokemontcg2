/**
 * @file What the legacy `pushAction` relay may tell the opponent about an action.
 *
 * The server relays `pushAction` packets to the other seat unfiltered, and the receiver only
 * logs a server-command action (accept-action.js). A card leaving the hand is hidden until the
 * server's view shows it — a Starting Active stays face down until both are placed — so the
 * relayed copy drops the card names the authoritative hints carry. The command sent to the
 * server is built from the original parameters, never from this copy.
 */

const withoutName = (hint) => {
  if (!hint || typeof hint !== 'object' || !('name' in hint)) return hint;
  const { name: _name, ...rest } = hint;
  return rest;
};

/**
 * @param {string} action legacy action name
 * @param {any[]} parameters the action's parameters (not mutated)
 * @returns {any[]} parameters safe to relay to the opponent
 */
export function relayParameters(action, parameters) {
  if (action !== 'moveCardBundle' || !Array.isArray(parameters)) return parameters;
  const [, from, , , , , hints] = parameters;
  if (from !== 'hand' || !hints || typeof hints !== 'object') return parameters;
  const safeHints = { ...hints, moving: withoutName(hints.moving), target: withoutName(hints.target) };
  if (hints.target === undefined) delete safeHints.target;
  const relayed = [...parameters];
  relayed[6] = safeHints;
  return relayed;
}
