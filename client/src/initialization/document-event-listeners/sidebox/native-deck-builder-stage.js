import { fxDisabled, motionReduced } from '../../../setup/image-logic/mat-fx.mjs';

/**
 * The fullscreen stage a box opening plays on (design 052; shared by Build & Battle and the Elite
 * Trainer Box, design 057). The stage is a child of the builder workspace so the Live tokens and
 * the scene CSS apply; while it is open the rest of the builder UI is hidden.
 */

const STAGE_ACTIVE_CLASS = 'bb-unboxing-active';
const UI_ENTER_CLASS = 'bb-ui-enter';
const STAGE_FADE_MS = 360;
const UI_ENTER_MS = 900;

/**
 * @param {HTMLElement|null} workspaceEl the `.db-live` builder workspace
 * @returns {{open: (label: string) => HTMLElement|null, close: () => void,
 *   readonly el: HTMLElement|null}} `open(label)` names the stage for assistive tech; it is
 *   idempotent and returns null without a workspace.
 */
export const createStage = (workspaceEl) => {
  let stageEl = null;

  const open = (label) => {
    if (stageEl || !workspaceEl) return stageEl;
    stageEl = document.createElement('div');
    stageEl.className = 'bb-stage';
    stageEl.id = 'bbUnboxingStage';
    stageEl.setAttribute('role', 'dialog');
    stageEl.setAttribute('aria-label', label);
    workspaceEl.classList.remove(UI_ENTER_CLASS);
    workspaceEl.classList.add(STAGE_ACTIVE_CLASS);
    workspaceEl.append(stageEl);
    return stageEl;
  };

  // The stage fades out while the builder UI loads back in, piece by piece (CSS stagger).
  const close = () => {
    if (!stageEl) return;
    const leaving = stageEl;
    stageEl = null;
    workspaceEl?.classList.remove(STAGE_ACTIVE_CLASS);
    if (motionReduced() || fxDisabled()) {
      leaving.remove();
      return;
    }
    leaving.classList.add('is-leaving');
    setTimeout(() => leaving.remove(), STAGE_FADE_MS);
    workspaceEl?.classList.add(UI_ENTER_CLASS);
    setTimeout(() => workspaceEl?.classList.remove(UI_ENTER_CLASS), UI_ENTER_MS);
  };

  return {
    open,
    close,
    get el() {
      return stageEl;
    },
  };
};
