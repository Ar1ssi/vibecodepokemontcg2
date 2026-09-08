import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCloseCardPicker,
  computeDropSlotHitboxes,
  findDropSlotIndex,
  findSelectedSlotIndex,
  resolveTargetSlotIndex,
  shouldSuppressClickAfterDrag,
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

test('shouldSuppressClickAfterDrag: suppresses clicks within threshold, allows outside', () => {
  const baseTime = 10000;
  // No drag recorded: never suppress
  assert.equal(shouldSuppressClickAfterDrag(null, baseTime), false);
  assert.equal(shouldSuppressClickAfterDrag(undefined, baseTime), false);
  assert.equal(shouldSuppressClickAfterDrag(0, baseTime), false);

  // Click 50ms after drag: suppress
  assert.equal(shouldSuppressClickAfterDrag(baseTime, baseTime + 50), true);
  // Click 399ms after drag: suppress
  assert.equal(shouldSuppressClickAfterDrag(baseTime, baseTime + 399), true);
  // Click 400ms after drag: allowed
  assert.equal(shouldSuppressClickAfterDrag(baseTime, baseTime + 400), false);
  // Click 1000ms after drag: allowed
  assert.equal(shouldSuppressClickAfterDrag(baseTime, baseTime + 1000), false);
});

test('findSelectedSlotIndex: prioritizes open slot from the left', () => {
  assert.equal(findSelectedSlotIndex([]), -1);
  assert.equal(findSelectedSlotIndex(null), -1);
  assert.equal(findSelectedSlotIndex([null]), 0);
  assert.equal(findSelectedSlotIndex([null, null, null]), 0);
  assert.equal(findSelectedSlotIndex(['card1', null, null]), 1);
  assert.equal(findSelectedSlotIndex(['card1', 'card2', null]), 2);
  assert.equal(findSelectedSlotIndex(['card1', 'card2', 'card3']), -1);
  assert.equal(findSelectedSlotIndex([null, 'card2', null]), 0, 'prioritizes left even with gaps');
});

test('resolveTargetSlotIndex: resolves target slot prioritizing leftmost open slot', () => {
  // Empty inputs
  assert.equal(resolveTargetSlotIndex({ slotAssignments: [] }), -1);
  assert.equal(resolveTargetSlotIndex(), -1);

  // Explicit slot requested
  assert.equal(
    resolveTargetSlotIndex({
      slotAssignments: [null, null],
      requestedSlotIndex: 1,
    }),
    1
  );

  // Multi-select mode: fills from left to right, stops when full
  const multiSlots = [null, null];
  assert.equal(
    resolveTargetSlotIndex({ slotAssignments: multiSlots, multiSelect: true, maxCount: 2 }),
    0
  );
  multiSlots[0] = 'card1';
  assert.equal(
    resolveTargetSlotIndex({ slotAssignments: multiSlots, multiSelect: true, maxCount: 2 }),
    1
  );
  multiSlots[1] = 'card2';
  assert.equal(
    resolveTargetSlotIndex({ slotAssignments: multiSlots, multiSelect: true, maxCount: 2 }),
    -1,
    'full in multi-select returns -1'
  );

  // Single-select mode: fills slot 0, and replaces slot 0 when full
  const singleSlot = [null];
  assert.equal(
    resolveTargetSlotIndex({ slotAssignments: singleSlot, multiSelect: false, maxCount: 1 }),
    0
  );
  singleSlot[0] = 'cardA';
  assert.equal(
    resolveTargetSlotIndex({ slotAssignments: singleSlot, multiSelect: false, maxCount: 1 }),
    0,
    'replaces slot 0 in single-select when already filled'
  );
});

test('DOM: slot assignment and is-selected-slot class behavior', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const { document } = dom.window;

  // Set up drop slots
  const slotElements = [];
  const slotAssignments = [null, null];
  const maxSel = 2;

  for (let i = 0; i < maxSel; i += 1) {
    const slot = document.createElement('div');
    slot.className = 'card-picker-drop-slot is-empty';
    slot.dataset.slotIndex = String(i);
    slotElements.push(slot);
  }

  const renderSlots = () => {
    const selectedIdx = findSelectedSlotIndex(slotAssignments);
    slotElements.forEach((el, i) => {
      const card = slotAssignments[i];
      el.classList.toggle('has-card', Boolean(card));
      el.classList.toggle('is-empty', !card);
      el.classList.toggle('is-selected-slot', i === selectedIdx);
    });
  };

  // Initial render: slot 0 is the selected slot (open, prioritizing left)
  renderSlots();
  assert.ok(slotElements[0].classList.contains('is-selected-slot'));
  assert.ok(!slotElements[1].classList.contains('is-selected-slot'));

  // Put card 1 in slot 0
  const card1 = { name: 'Pikachu' };
  const target0 = resolveTargetSlotIndex({ slotAssignments, multiSelect: true, maxCount: 2 });
  assert.equal(target0, 0);
  slotAssignments[target0] = card1;
  renderSlots();

  // Slot 1 is now the selected slot
  assert.ok(!slotElements[0].classList.contains('is-selected-slot'));
  assert.ok(slotElements[0].classList.contains('has-card'));
  assert.ok(slotElements[1].classList.contains('is-selected-slot'));

  // Put card 2 in slot 1
  const card2 = { name: 'Raichu' };
  const target1 = resolveTargetSlotIndex({ slotAssignments, multiSelect: true, maxCount: 2 });
  assert.equal(target1, 1);
  slotAssignments[target1] = card2;
  renderSlots();

  // Both slots full: neither is selected-slot
  assert.ok(!slotElements[0].classList.contains('is-selected-slot'));
  assert.ok(!slotElements[1].classList.contains('is-selected-slot'));

  // Unslot slot 0 -> slot 0 becomes selected slot again
  slotAssignments[0] = null;
  renderSlots();
  assert.ok(slotElements[0].classList.contains('is-selected-slot'));
  assert.ok(!slotElements[1].classList.contains('is-selected-slot'));
});

test('canCloseCardPicker: only permits closing in browse mode unless force=true', () => {
  // Browse mode: permitted to close
  assert.equal(canCloseCardPicker({ mode: 'browse' }), true);
  assert.equal(canCloseCardPicker({ mode: 'browse', force: false }), true);
  assert.equal(canCloseCardPicker({ mode: 'browse', force: true }), true);

  // Choose mode (pick card menu): cannot close unless forced
  assert.equal(canCloseCardPicker({ mode: 'choose' }), false);
  assert.equal(canCloseCardPicker({ mode: 'choose', force: false }), false);
  assert.equal(canCloseCardPicker({ mode: 'choose', force: true }), true);

  // Multi mode: cannot close unless forced
  assert.equal(canCloseCardPicker({ mode: 'multi' }), false);
  assert.equal(canCloseCardPicker({ mode: 'multi', force: false }), false);
  assert.equal(canCloseCardPicker({ mode: 'multi', force: true }), true);

  // Null/undefined mode: cannot close unless forced
  assert.equal(canCloseCardPicker(), false);
  assert.equal(canCloseCardPicker({ mode: null, force: false }), false);
  assert.equal(canCloseCardPicker({ mode: null, force: true }), true);
});

test('DOM: pick card menu only closes via Done button', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const { document, KeyboardEvent, MouseEvent } = dom.window;

  let closed = false;
  let pickedCard = null;

  const teardown = () => {
    closed = true;
    overlay.remove();
  };

  const overlay = document.createElement('div');
  overlay.className = 'card-picker-overlay card-picker-choose';
  const doneBtn = document.createElement('button');
  doneBtn.className = 'card-picker-done';
  doneBtn.textContent = 'Done';
  overlay.appendChild(doneBtn);
  document.body.appendChild(overlay);

  const mode = 'choose';
  const candidate = { name: 'Pikachu' };

  // Keydown listener simulating pick card menu
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (mode === 'browse') {
        if (canCloseCardPicker({ mode })) teardown();
      } else {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  overlay.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target === overlay) {
      if (mode === 'browse' && canCloseCardPicker({ mode })) teardown();
    }
  });

  overlay.addEventListener('contextmenu', (event) => {
    event.stopPropagation();
  });

  doneBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    pickedCard = candidate;
    teardown();
  });

  document.addEventListener('keydown', onKeyDown);

  // 1. Pressing Escape does NOT close the menu
  let escDefaultPrevented = false;
  let escPropagationStopped = false;
  const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  // Intercept preventDefault & stopPropagation
  const origPreventDefault = escEvent.preventDefault.bind(escEvent);
  const origStopPropagation = escEvent.stopPropagation.bind(escEvent);
  escEvent.preventDefault = () => {
    escDefaultPrevented = true;
    origPreventDefault();
  };
  escEvent.stopPropagation = () => {
    escPropagationStopped = true;
    origStopPropagation();
  };
  document.dispatchEvent(escEvent);

  assert.equal(closed, false, 'Escape did not close pick card menu');
  assert.equal(escDefaultPrevented, true, 'Escape prevented default');
  assert.equal(escPropagationStopped, true, 'Escape stopped propagation');

  // 2. Pressing Enter does NOT close the menu
  const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
  document.dispatchEvent(enterEvent);
  assert.equal(closed, false, 'Enter did not close pick card menu');

  // 3. Clicking overlay backdrop does NOT close the menu
  overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert.equal(closed, false, 'Overlay click did not close pick card menu');

  // 4. Calling close without force does NOT close
  if (canCloseCardPicker({ mode, force: false })) {
    teardown();
  }
  assert.equal(closed, false, 'Unforced closeCardPicker did not close pick card menu');

  // 5. Clicking Done button DOES close the menu and confirms selection
  doneBtn.click();
  assert.equal(closed, true, 'Clicking Done closed the menu');
  assert.equal(pickedCard?.name, 'Pikachu', 'Picked card was assigned');
});

