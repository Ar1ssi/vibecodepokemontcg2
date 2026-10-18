/**
 * The tabletop's DOM chrome (design 073 Options 6): a hint line, a dock whose primary button
 * always takes the next physical step (so keyboard, touch and tests share one path), "Reveal the
 * rest" while a pack is in hand, "Skip", a sound toggle, and the loading veil.
 */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (className, text, action) => {
  const node = el('button', className, text);
  node.type = 'button';
  node.dataset.ttAction = action;
  return node;
};

/**
 * @param {{root: HTMLElement, onAction: (action: string) => void, soundOn: () => boolean}} options
 */
export function createTabletopUi({ root, onAction, soundOn }) {
  const ui = el('div', 'tt-ui');
  const top = el('div', 'tt-top');
  const title = el('p', 'tt-title');
  const counter = el('p', 'tt-counter');
  top.append(title, counter);
  const hint = el('p', 'tt-hint');
  hint.setAttribute('role', 'status');
  hint.setAttribute('aria-live', 'polite');
  const dock = el('div', 'tt-dock');
  const primary = button('tt-btn tt-btn--primary', '', 'primary');
  const revealAll = button('tt-btn', 'Reveal the rest', 'revealAll');
  const skip = button('tt-btn tt-btn--quiet', 'Skip to the end', 'skip');
  const sound = button('tt-btn tt-btn--icon', '', 'sound');
  dock.append(primary, revealAll, skip, sound);
  const loading = el('div', 'tt-loading');
  const spinner = el('span', 'tt-spinner');
  const loadingText = el('span', 'tt-loading__text', 'Setting the table…');
  loading.append(spinner, loadingText);
  ui.append(top, hint, dock, loading);
  root.append(ui);

  const paintSound = () => {
    const on = soundOn();
    sound.textContent = on ? '🔊' : '🔇';
    sound.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
    sound.setAttribute('aria-pressed', String(!on));
  };
  paintSound();

  const onClick = (event) => {
    const target = event.target.closest('[data-tt-action]');
    if (!target || target.disabled) return;
    event.stopPropagation();
    onAction(target.dataset.ttAction);
    if (target === sound) paintSound();
  };
  ui.addEventListener('click', onClick);

  return {
    setTitle: (text) => {
      title.textContent = text || '';
    },
    setCounter: (text) => {
      counter.textContent = text || '';
    },
    setPrimary: (label, { enabled = true } = {}) => {
      primary.textContent = label || '';
      primary.hidden = !label;
      primary.disabled = !enabled;
    },
    setHint: (text) => {
      if (hint.textContent !== (text || '')) hint.textContent = text || '';
    },
    showRevealAll: (show) => {
      revealAll.hidden = !show;
    },
    showSkip: (show) => {
      skip.hidden = !show;
    },
    setLoading: (show, text) => {
      loading.hidden = !show;
      if (text) loadingText.textContent = text;
    },
    focusPrimary: () => primary.focus({ preventScroll: true }),
    dispose: () => {
      ui.removeEventListener('click', onClick);
      ui.remove();
    },
  };
}
