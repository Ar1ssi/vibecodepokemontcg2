import {
  parseDeckDataRows,
} from '../../../setup/deck-builder/core/csv-adapter.mjs';

export const syncDeckFromLoadedRows = (deckRows = []) => {
  return parseDeckDataRows(deckRows);
};
