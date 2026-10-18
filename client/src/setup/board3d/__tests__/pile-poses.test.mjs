import test from 'node:test';
import assert from 'node:assert/strict';

import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { flatLayout } from '../board-layout.mjs';
import { CARD_UNITS, cardScaleFor } from '../card-geometry.mjs';
import { pilePose, pileThicknessPx, prizeSlotPose, stadiumPose } from '../pile-poses.mjs';

// sim at 1920×1080 (board-layout.test.mjs): iframe 1449.6 × 540.
const layout = flatLayout(getMatLayout('sim'), { w: 1449.6, h: 540 });

const close = (actual, expected, message, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

test('deck, discard and Lost Zone sit at their zone rect centres on both sides', () => {
  for (const side of ['self', 'opp']) {
    for (const zone of ['deck', 'discard', 'lostZone']) {
      const rect = layout[side][zone];
      const pose = pilePose(side, zone, layout);
      close(pose.x, rect.x + rect.w / 2, `${side} ${zone} x`);
      close(pose.y, rect.y + rect.h / 2, `${side} ${zone} y`);
      close(pose.widthPx, layout[side].cardBox[zone].w, `${side} ${zone} width`);
      assert.equal(pose.yawDeg, side === 'opp' ? 180 : 0, `${side} ${zone} yaw`);
    }
  }
});

test('the far deck mirrors the near deck about the seam centre', () => {
  const self = pilePose('self', 'deck', layout);
  const opp = pilePose('opp', 'deck', layout);
  close(opp.x, -self.x, 'x');
  close(opp.y, 2 * layout.depth - self.y, 'y');
});

test('unknown zones and sides have no pile pose', () => {
  assert.equal(pilePose('self', 'prizes', layout), null);
  assert.equal(pilePose('self', 'hand', layout), null);
  assert.equal(pilePose('nobody', 'deck', layout), null);
  assert.equal(pilePose('self', 'deck', null), null);
});

test('thickness: 0 / 1 / 12 layers are that many card thicknesses', () => {
  const scale = cardScaleFor(layout.self.cardBox.deck.w);
  assert.equal(pileThicknessPx(0, scale), 0);
  close(pileThicknessPx(1, scale), CARD_UNITS.t * scale, '1 layer');
  close(pileThicknessPx(12, scale), 12 * CARD_UNITS.t * scale, '12 layers');
  assert.equal(pileThicknessPx(-3, scale), 0);
  assert.equal(pileThicknessPx(Number.NaN, scale), 0);
  assert.equal(pileThicknessPx(4, 0), 0);
});

test('stadium: the layout stadium rect centre, yaw by facing', () => {
  const rect = layout.stadium;
  const self = stadiumPose({ instanceId: 7, src: 's.png', name: 'S', facing: 'self' }, layout, 'you');
  close(self.x, rect.x + rect.w / 2, 'x');
  close(self.y, rect.y + rect.h / 2, 'y');
  close(self.widthPx, rect.w, 'width');
  assert.equal(self.z, 0);
  assert.equal(self.yawDeg, 0);
  const opp = stadiumPose({ instanceId: 7, src: 's.png', name: 'S', facing: 'opp' }, layout, 'you');
  assert.equal(opp.yawDeg, 180);
  close(opp.x, self.x, 'same spot whoever played it');
  assert.equal(stadiumPose(null, layout, 'you'), null);
  assert.equal(stadiumPose({ facing: 'self' }, { ...layout, stadium: null }, 'you'), null);
});

test('prize slots 0 and 5: slot centres, prize width, slot 5 drawn on top', () => {
  const width = layout.self.cardBox.prizes.w;
  const t = CARD_UNITS.t * cardScaleFor(width);
  const first = prizeSlotPose('self', 0, layout);
  const rect0 = layout.self.prizes[0];
  close(first.x, rect0.x + rect0.w / 2, 'slot 0 x');
  close(first.y, rect0.y + rect0.h / 2, 'slot 0 y');
  close(first.widthPx, width, 'slot 0 width');
  assert.equal(first.z, 0, 'slot 0 is the bottom of the paint order');
  assert.equal(first.yawDeg, 0);
  const last = prizeSlotPose('self', 5, layout);
  const rect5 = layout.self.prizes[5];
  close(last.x, rect5.x + rect5.w / 2, 'slot 5 x');
  close(last.y, rect5.y + rect5.h / 2, 'slot 5 y');
  close(last.z, 5 * t, 'slot 5 is the top of the paint order');
  const opp = prizeSlotPose('opp', 5, layout);
  const oppRect = layout.opp.prizes[5];
  close(opp.x, oppRect.x + oppRect.w / 2, 'opp slot 5 x');
  assert.equal(opp.yawDeg, 180);
  assert.equal(prizeSlotPose('self', 6, layout), null);
  assert.equal(prizeSlotPose('self', -1, layout), null);
});
