import {
  BUILDER_WINDOW_NAME,
  BUILDER_WINDOW_PATH,
  buildBuilderMessage,
  parseBuilderMessage,
} from '../../../setup/deck-builder/core/builder-window.mjs';

/**
 * Browser plumbing for the deck builder's own tab (design 050): the game tab
 * opens it and listens (host); the builder tab posts to the game tab that
 * opened it (editor). Message shapes live in builder-window.mjs.
 */

/**
 * Opens the builder tab, or brings the open one forward without reloading it
 * (a reload would drop an unsaved deck). Must run inside a click handler, or
 * the browser's pop-up blocker refuses it.
 *
 * @returns {Window|null} null when the browser blocked the new tab.
 */
export const openDeckBuilderWindow = () => {
  let builder = null;
  try {
    builder = window.open('', BUILDER_WINDOW_NAME);
  } catch {
    return null;
  }
  if (!builder) return null;

  let isBlank = true;
  try {
    isBlank = builder.location.href === 'about:blank';
  } catch {
    // A cross-origin document in a tab with our name: take the tab over.
    isBlank = true;
  }
  if (isBlank) builder.location.replace(BUILDER_WINDOW_PATH);
  builder.focus();
  return builder;
};

/**
 * Game tab: applies messages from the builder tab. Only same-origin messages
 * from another window that parse as builder messages get through.
 *
 * @param {object} options
 * @param {(message: {type: string, payload: object}) => void} options.apply
 * @param {() => {isTwoPlayer: boolean}} options.getHostState
 */
export const installDeckBuilderHost = ({ apply, getHostState }) => {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (!event.source || event.source === window) return;
    const message = parseBuilderMessage(event.data);
    if (!message) return;

    if (message.type === 'ready') {
      event.source.postMessage(
        buildBuilderMessage('host-state', getHostState()),
        window.location.origin
      );
      return;
    }
    if (message.type === 'host-state') return;
    apply(message);
  });
};

/**
 * Builder tab: the channel to the game tab that opened it.
 *
 * @param {object} options
 * @param {(state: {isTwoPlayer: boolean}) => void} options.onHostState
 * @returns {{post: (type: string, payload: object) => boolean, isConnected: () => boolean}}
 */
export const connectToHost = ({ onHostState }) => {
  const host = () => {
    const opener = window.opener;
    if (!opener || opener.closed) return null;
    return opener;
  };

  const post = (type, payload = {}) => {
    const target = host();
    if (!target) return false;
    try {
      target.postMessage(buildBuilderMessage(type, payload), window.location.origin);
      return true;
    } catch {
      return false;
    }
  };

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (!event.source || event.source !== host()) return;
    const message = parseBuilderMessage(event.data);
    if (message?.type === 'host-state') onHostState(message.payload);
  });

  post('ready');

  return { post, isConnected: () => Boolean(host()) };
};
