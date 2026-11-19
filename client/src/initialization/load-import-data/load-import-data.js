import { acceptAction } from '../../setup/general/accept-action.js';
import { refreshBoardImages } from '../../setup/sizing/refresh-board.js';
import { parseImportActions } from './parse-import-actions.js';

export function loadImportData() {
  const importDataElement = document.getElementById('importDataJSON');
  let actions;
  try {
    actions = parseImportActions(importDataElement?.textContent);
  } catch (error) {
    console.error('Saved state could not be loaded; starting empty.', error);
    return;
  }
  if (actions.length === 0) return;
  actions.forEach((data) => {
    acceptAction(data.user, data.action, data.parameters, true);
  });
  refreshBoardImages();
}
