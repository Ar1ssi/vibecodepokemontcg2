import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDropSlotHitboxes,
  findDropSlotIndex,
} from '../card-picker-hitbox.mjs';

test('computeDropSlotHitboxes: returns empty array for empty inputs', () => {
  assert.deepEqual(computeDropSlotHitboxes([]), []);
  assert.deepEqual(computeDropSlotHitboxes(null), []);
  assert.equal(findDropSlotIndex([], { x: 100, y: 100 }), -1);
});

test('computeDropSlotHitboxes: single slot expands in all directions', () => {
  const slot = { left: 100, right: 180, top: 200, bottom: 310, width: 80, height: 110 };
  const [hb] = computeDropSlotHitboxes([slot]);

  assert.equal(hb.origIndex, 0);
  assert.ok(hb.left < slot.left, 'left expands outward');
  assert.ok(hb.right > slot.right, 'right expands outward');
  assert.ok(hb.top < slot.top, 'top expands upward');
  assert.ok(hb.bottom > slot.bottom, 'bottom expands downward');

  // Exact bounds check: slot width 80 -> padX = Math.max(48, min(90, 60)) = 60
  assert.equal(hb.left, 40);
  assert.equal(hb.right, 240);
  assert.equal(hb.top, 140);
  assert.equal(hb.bottom, 370);

  // Drop hits inside expanded bounds
  assert.equal(findDropSlotIndex([slot], { x: 140, y: 250 }), 0, 'center');
  assert.equal(findDropSlotIndex([slot], { x: 60, y: 250 }), 0, 'left expanded');
  assert.equal(findDropSlotIndex([slot], { x: 220, y: 250 }), 0, 'right expanded');
  assert.equal(findDropSlotIndex([slot], { x: 140, y: 160 }), 0, 'top expanded');
  assert.equal(findDropSlotIndex([slot], { x: 140, y: 350 }), 0, 'bottom expanded');

  // Drop misses outside expanded bounds
  assert.equal(findDropSlotIndex([slot], { x: 30, y: 250 }), -1, 'too far left');
  assert.equal(findDropSlotIndex([slot], { x: 250, y: 250 }), -1, 'too far right');
  assert.equal(findDropSlotIndex([slot], { x: 140, y: 120 }), -1, 'too far above');
  assert.equal(findDropSlotIndex([slot], { x: 140, y: 390 }), -1, 'too far below');
});

test('computeDropSlotHitboxes: multiple slots partition gap with zero overlap', () => {
  const slots = [
    { left: 100, right: 180, top: 200, bottom: 310, width: 80, height: 110 },
    { left: 186, right: 266, top: 200, bottom: 310, width: 80, height: 110 },
    { left: 272, right: 352, top: 200, bottom: 310, width: 80, height: 110 },
  ];

  const hitboxes = computeDropSlotHitboxes(slots);
  assert.equal(hitboxes.length, 3);

  // Check no overlap and no gap between adjacent hitboxes
  assert.equal(hitboxes[0].right, hitboxes[1].left, 'slot 0 and 1 meet at same x boundary');
  assert.equal(hitboxes[1].right, hitboxes[2].left, 'slot 1 and 2 meet at same x boundary');

  // Midpoint between slot 0 (right: 180) and slot 1 (left: 186) is 183
  assert.equal(hitboxes[0].right, 183);
  assert.equal(hitboxes[1].left, 183);

  // Midpoint between slot 1 (right: 266) and slot 2 (left: 272) is 269
  assert.equal(hitboxes[1].right, 269);
  assert.equal(hitboxes[2].left, 269);

  // Points right on the boundary go cleanly to the right slot without overlap
  assert.equal(findDropSlotIndex(slots, { x: 182.9, y: 250 }), 0);
  assert.equal(findDropSlotIndex(slots, { x: 183.0, y: 250 }), 1);
  assert.equal(findDropSlotIndex(slots, { x: 268.9, y: 250 }), 1);
  assert.equal(findDropSlotIndex(slots, { x: 269.0, y: 250 }), 2);

  // Test across full X range at y=250: each X matches at most ONE slot
  for (let x = 0; x <= 450; x += 1) {
    const idx = findDropSlotIndex(slots, { x, y: 250 });
    if (x < hitboxes[0].left) {
      assert.equal(idx, -1);
    } else if (x < 183) {
      assert.equal(idx, 0);
    } else if (x < 269) {
      assert.equal(idx, 1);
    } else if (x <= hitboxes[2].right) {
      assert.equal(idx, 2);
    } else {
      assert.equal(idx, -1);
    }
  }
});

test('computeDropSlotHitboxes: topLimit and bottomLimit prevent overlapping other UI', () => {
  const slot = { left: 100, right: 180, top: 200, bottom: 310, width: 80, height: 110 };

  // Carousel ends at y=170 -> topLimit = 176
  // Bottom bar starts at y=340 -> bottomLimit = 334
  const [hb] = computeDropSlotHitboxes([slot], {
    topLimit: 176,
    bottomLimit: 334,
  });

  assert.equal(hb.top, 176, 'clamped to topLimit');
  assert.equal(hb.bottom, 334, 'clamped to bottomLimit');

  // Above carousel limit -> miss
  assert.equal(findDropSlotIndex([slot], { x: 140, y: 170 }, { topLimit: 176, bottomLimit: 334 }), -1);
  // Just inside limit -> hit
  assert.equal(findDropSlotIndex([slot], { x: 140, y: 180 }, { topLimit: 176, bottomLimit: 334 }), 0);
  // Below bottom limit -> miss
  assert.equal(findDropSlotIndex([slot], { x: 140, y: 340 }, { topLimit: 176, bottomLimit: 334 }), -1);
  // Just inside bottom limit -> hit
  assert.equal(findDropSlotIndex([slot], { x: 140, y: 330 }, { topLimit: 176, bottomLimit: 334 }), 0);
});

test('computeDropSlotHitboxes: leftLimit and rightLimit clamp outer boundaries', () => {
  const slot = { left: 50, right: 130, top: 200, bottom: 310, width: 80, height: 110 };
  const [hb] = computeDropSlotHitboxes([slot], {
    leftLimit: 20,
    rightLimit: 160,
  });

  assert.equal(hb.left, 20);
  assert.equal(hb.right, 160);
});

test('computeDropSlotHitboxes: preserves original indices even if slots are unordered', () => {
  const slotA = { left: 280, right: 360, top: 200, bottom: 310, width: 80, height: 110 };
  const slotB = { left: 100, right: 180, top: 200, bottom: 310, width: 80, height: 110 };

  // slotA is index 0 in array, but physically on the right
  // slotB is index 1 in array, but physically on the left
  assert.equal(findDropSlotIndex([slotA, slotB], { x: 140, y: 250 }), 1);
  assert.equal(findDropSlotIndex([slotA, slotB], { x: 320, y: 250 }), 0);
});
