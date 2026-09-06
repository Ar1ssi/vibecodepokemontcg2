import {
  deckDataRowsToSimCsv,
  parseDeckDataRows,
} from '../../../setup/deck-builder/core/csv-adapter.mjs';

export const deckRowsToSimCsv = deckDataRowsToSimCsv;

export const syncDeckFromLoadedRows = (deckRows = []) => {
  return parseDeckDataRows(deckRows);
};
