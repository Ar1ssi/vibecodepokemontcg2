import { reset } from '../../../../actions/general/reset.js';
import { restartGame } from '../../../../actions/general/restart.js';
import { readyUp, updateReadyButtons } from '../../../../actions/general/ready.js';
import { systemState } from '../../../../state.js';
import {
  clearChatboxContent,
  exportChatboxContent,
} from '../../../../setup/chatbox/export-chat.js';
import { hideOptionsContextMenu } from '../../../../setup/chatbox/hide-options-context-menu.js';
import { exportFullLog, markMoment, toggleVerbose } from '../../../../log/export-ui.js';
import { wireButtonCues } from '../../../../setup/netcode/mat-fx/ui-cue.mjs';

export const initializeP1BottomButtons = () => {
  const setupButton = document.getElementById('setupButton');
  const setupFunction = () => readyUp(systemState.initiator);

  const setupBothButton = document.getElementById('setupBothButton');
  const setupBothFunction = () => {
    readyUp('self');
    readyUp('opp');
  };

  updateReadyButtons();
  wireButtonCues([
    'setupButton',
    'setupBothButton',
    'resetButton',
    'resetBothButton',
    'restartButton',
    'optionsButton',
    'clearLog',
    'exportLog',
  ]);

  const resetButton = document.getElementById('resetButton');
  const resetFunction = () => reset(systemState.initiator);

  const resetBothButton = document.getElementById('resetBothButton');
  const resetBothFunction = () => {
    reset('self');
    reset('opp');
  };

  const restartButton = document.getElementById('restartButton');
  const restartFunction = () => restartGame();

  setupButton.addEventListener('click', setupFunction);
  setupBothButton.addEventListener('click', setupBothFunction);
  resetButton.addEventListener('click', resetFunction);
  resetBothButton.addEventListener('click', resetBothFunction);
  restartButton.addEventListener('click', restartFunction);

  const optionsContextMenu = document.getElementById('optionsContextMenu');

  const optionsButton = document.getElementById('optionsButton');
  optionsButton.addEventListener('click', () => {
    const p1Box = document.getElementById('p1Box');
    optionsContextMenu.style.display = 'block';
    const adjustment = p1Box.offsetHeight - optionsButton.offsetTop;
    optionsContextMenu.style.bottom = `${adjustment}px`;
    document.addEventListener('mousedown', hideOptionsContextMenu);
  });

  const clearLog = document.getElementById('clearLog');
  clearLog.addEventListener('click', () => {
    clearChatboxContent();
    optionsContextMenu.style.display = 'none';
  });

  const exportLog = document.getElementById('exportLog');
  exportLog.addEventListener('click', () => {
    exportChatboxContent();
    optionsContextMenu.style.display = 'none';
  });

  const exportFullLogButton = document.getElementById('exportFullLog');
  exportFullLogButton.addEventListener('click', () => {
    optionsContextMenu.style.display = 'none';
    const note = window.prompt('Optional: describe what went wrong (saved in the log).', '');
    if (note === null) return;
    exportFullLog({ note }).catch((err) => console.error('Export full log failed:', err));
  });

  const markLogMomentButton = document.getElementById('markLogMoment');
  markLogMomentButton.addEventListener('click', () => {
    optionsContextMenu.style.display = 'none';
    const note = window.prompt('Optional: note for this moment.', '');
    if (note === null) return;
    markMoment(note);
  });

  const verboseLoggingButton = document.getElementById('verboseLogging');
  verboseLoggingButton.addEventListener('click', () => {
    toggleVerbose();
    optionsContextMenu.style.display = 'none';
  });

  const fullscreenButton = document.getElementById('fullscreenButton');

  fullscreenButton.addEventListener('click', function () {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.webkitRequestFullScreen) {
      element.webkitRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
    optionsContextMenu.style.display = 'none';
  });
};
