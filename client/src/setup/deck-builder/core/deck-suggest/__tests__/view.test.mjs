import test from 'node:test';
import assert from 'node:assert/strict';

import {
  datasetFooter,
  evidenceLine,
  formatPercent,
  formatUsd,
  headerText,
  lowConfidenceText,
  previewUrl,
  tagBadges,
  thumbnailUrl,
  windowLabel,
} from '../view.mjs';
import { fixtureDataset } from './fixture-dataset.mjs';

const item = { idx: 3, inclusion: 0.92, typicalCount: 4, yourCount: 0, price: 0.25, tags: ['draw', 'disruption'] };

test('formatPercent and formatUsd', () => {
  assert.deepEqual([0, 0.004, 0.5, 0.919, NaN].map(formatPercent), ['0%', '<1%', '50%', '92%', '0%']);
  assert.equal(formatUsd(0.3), '$0.30');
  assert.equal(formatUsd(null), '');
});

test('windowLabel spans the dataset window', () => {
  assert.equal(windowLabel({ window: { from: '2026-04-25', to: '2026-10-10' } }), 'Apr 2026 – Oct 2026');
  assert.equal(windowLabel({ window: { from: '2026-10-03', to: '2026-10-10' } }), 'Oct 2026');
  assert.equal(windowLabel({}), '');
});

test('evidenceLine per section', () => {
  assert.equal(evidenceLine(item, 'missingCore'), 'In 92% of similar lists · usually 4');
  assert.equal(
    evidenceLine({ ...item, yourCount: 1 }, 'countTweaks'),
    'You play 1 · similar lists usually play 4 (92% play it)'
  );
  assert.equal(evidenceLine({ ...item, inclusion: 0.03 }, 'cuts'), 'In 3% of similar lists');
  assert.equal(evidenceLine({ ...item, idx: null, inclusion: 0 }, 'cuts'), 'Not in any tournament list in the data');
  assert.equal(evidenceLine(item, 'budget'), '$0.25 · in 92% of similar lists · usually 4');
  assert.equal(
    evidenceLine({ ...item, metaInclusion: 0.12 }, 'goal'),
    'In 92% of similar lists · usually 4 · 12% of all lists'
  );
  assert.equal(
    evidenceLine({ ...item, inclusion: 0, typicalCount: 0, metaInclusion: 0.05 }, 'goal'),
    'Rare in lists like yours · 5% of all lists'
  );
});

test('tagBadges drop the section goal; image URLs', () => {
  assert.deepEqual(tagBadges(item), ['Draw & search', 'Disruption']);
  assert.deepEqual(tagBadges(item, 'draw'), ['Disruption']);
  assert.equal(thumbnailUrl('https://assets.tcgdex.net/en/sv/sv02/185'), 'https://assets.tcgdex.net/en/sv/sv02/185/low.webp');
  assert.equal(previewUrl(null), null);
});

test('headerText, lowConfidenceText, datasetFooter', () => {
  assert.equal(
    headerText({ neighbors: 50, archetype: { name: 'Dragapult', share: 0.81 } }),
    'Looks like Dragapult (81%) · 50 similar lists'
  );
  assert.equal(headerText({ neighbors: 1, archetype: null }), '1 similar list');
  assert.match(lowConfidenceText({ bestSimilarity: 0.31 }), /share 31% of it/);
  assert.equal(
    datasetFooter(fixtureDataset()),
    'Tournament data: Limitless TCG · 6 Masters lists from 1 Standard event · updated 2026-10-15'
  );
});
