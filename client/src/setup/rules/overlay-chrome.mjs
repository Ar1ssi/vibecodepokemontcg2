// Small DOM pieces the board overlays (inspector, card focus, stack view, status popup, attack
// options) all build from.

/** Events after which a board overlay must tear itself down: the turn it described is over. */
export const OVERLAY_CLOSE_EVENTS = ['rules-turn-began', 'rules-session-reset'];

/** An element with an optional class and text content. */
export const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};
