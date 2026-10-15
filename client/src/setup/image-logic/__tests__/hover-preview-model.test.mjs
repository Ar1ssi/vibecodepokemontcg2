import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CARD_ASPECT,
  HOVER_DWELL_MS,
  HOVER_WARM_MS,
  createHoverModel,
  gutterBox,
  isHoverEligible,
  previewPlacement,
  stackTopCard,
} from '../hover-preview-model.mjs';

// A hand-cranked clock: timers fire only when `advance` passes their due time.
const fakeClock = () => {
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => time,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, due: time + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= time) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
    pending: () => timers.size,
  };
};

const modelWithClock = () => {
  const clock = fakeClock();
  const model = createHoverModel(clock);
  const changes = [];
  model.onChange((change) => changes.push(change));
  return { clock, model, changes };
};

const MOUSE = { pointerType: 'mouse' };
const A = { id: 'A' };
const B = { id: 'B' };

describe('069 hover model — dwell', () => {
  it('arms on enter and shows after exactly 800 ms', () => {
    const { clock, model } = modelWithClock();
    model.enter(A, MOUSE);
    assert.equal(model.state().phase, 'arming');
    clock.advance(HOVER_DWELL_MS - 1);
    assert.equal(model.state().phase, 'arming');
    clock.advance(1);
    assert.deepEqual(
      { phase: model.state().phase, key: model.state().key },
      { phase: 'shown', key: A }
    );
  });

  it('leaving at 799 ms shows nothing, and re-entering restarts the dwell from 0', () => {
    const { clock, model } = modelWithClock();
    model.enter(A, MOUSE);
    clock.advance(799);
    model.leave(A);
    assert.equal(model.state().phase, 'idle');
    assert.equal(clock.pending(), 0);
    model.enter(A, MOUSE);
    clock.advance(799);
    assert.equal(model.state().phase, 'arming');
    clock.advance(1);
    assert.equal(model.state().phase, 'shown');
  });

  it('a repeated enter on the arming card does not restart the timer', () => {
    const { clock, model } = modelWithClock();
    model.enter(A, MOUSE);
    clock.advance(500);
    model.enter(A, MOUSE);
    clock.advance(300);
    assert.equal(model.state().phase, 'shown');
  });

  it('moving to another card while arming re-arms for the new card', () => {
    const { clock, model } = modelWithClock();
    model.enter(A, MOUSE);
    clock.advance(500);
    model.enter(B, MOUSE);
    clock.advance(500);
    assert.equal(model.state().phase, 'arming');
    clock.advance(300);
    assert.equal(model.state().key, B);
    assert.equal(clock.pending(), 0);
  });

  it('touch and pen pointers never arm', () => {
    const { clock, model } = modelWithClock();
    model.enter(A, { pointerType: 'touch' });
    model.enter(A, { pointerType: 'pen' });
    model.enter(A, {});
    clock.advance(5000);
    assert.equal(model.state().phase, 'idle');
  });

  it('a null key never arms', () => {
    const { model } = modelWithClock();
    model.enter(null, MOUSE);
    assert.equal(model.state().phase, 'idle');
  });

  it('leave for a card that is not current is ignored', () => {
    const { clock, model } = modelWithClock();
    model.enter(A, MOUSE);
    clock.advance(HOVER_DWELL_MS);
    model.leave(B);
    assert.equal(model.state().key, A);
  });
});

describe('069 hover model — warm swap', () => {
  const shownOn = (card) => {
    const env = modelWithClock();
    env.model.enter(card, MOUSE);
    env.clock.advance(HOVER_DWELL_MS);
    return env;
  };

  it('entering another card while shown swaps with no dwell', () => {
    const { model } = shownOn(A);
    model.enter(B, MOUSE);
    assert.equal(model.state().phase, 'shown');
    assert.equal(model.state().key, B);
  });

  it('leave then enter within the warm window shows at once (the out/over pair of a sweep)', () => {
    const { clock, model } = shownOn(A);
    model.leave(A);
    clock.advance(HOVER_WARM_MS - 1);
    model.enter(B, MOUSE);
    assert.equal(model.state().phase, 'shown');
    assert.equal(model.state().key, B);
  });

  it('entering after the warm window dwells the full 800 ms again', () => {
    const { clock, model } = shownOn(A);
    model.leave(A);
    clock.advance(HOVER_WARM_MS);
    model.enter(B, MOUSE);
    assert.equal(model.state().phase, 'arming');
    clock.advance(HOVER_DWELL_MS);
    assert.equal(model.state().phase, 'shown');
  });

  it('leaving an armed (never shown) card does not warm the next one', () => {
    const { clock, model } = modelWithClock();
    model.enter(A, MOUSE);
    clock.advance(400);
    model.leave(A);
    model.enter(B, MOUSE);
    assert.equal(model.state().phase, 'arming');
  });
});

describe('069 hover model — suppress', () => {
  for (const reason of ['pointerdown', 'drag', 'contextmenu', 'wheel', 'modal', 'blur', 'detached', 'setting']) {
    it(`${reason} hides a shown preview and ends the sweep`, () => {
      const { clock, model } = modelWithClock();
      model.enter(A, MOUSE);
      clock.advance(HOVER_DWELL_MS);
      model.suppress(reason);
      assert.equal(model.state().phase, 'idle');
      model.enter(B, MOUSE);
      assert.equal(model.state().phase, 'arming', 'no warm swap after a suppress');
    });
  }

  it('suppress while arming cancels the timer', () => {
    const { clock, model } = modelWithClock();
    model.enter(A, MOUSE);
    model.suppress('pointerdown');
    assert.equal(clock.pending(), 0);
    clock.advance(HOVER_DWELL_MS);
    assert.equal(model.state().phase, 'idle');
  });

  it('notifies listeners on each phase change', () => {
    const { clock, model, changes } = modelWithClock();
    model.enter(A, MOUSE);
    clock.advance(HOVER_DWELL_MS);
    model.suppress('blur');
    assert.deepEqual(
      changes.map((change) => change.phase),
      ['arming', 'shown', 'idle']
    );
  });
});

const VIEWPORT_1080 = { width: 1920, height: 1080 };
const BOARD_1080 = { left: 0, top: 0, width: 1450, height: 1080 };

describe('069 hover placement', () => {
  it('gutterBox spans from the board edge to the nearer probe', () => {
    const gutter = gutterBox({
      boardRect: BOARD_1080,
      probeRects: [
        { left: 201, top: 540, width: 1047, height: 540 },
        { left: 230, top: 0, width: 990, height: 540 },
      ],
      viewport: VIEWPORT_1080,
    });
    assert.deepEqual(gutter, { left: 0, top: 0, width: 201, height: 1080 });
  });

  it('gutterBox with no measurable probe (iframe not loaded) has width 0', () => {
    for (const probeRects of [[], null, [{ left: 0, top: 0, width: 0, height: 0 }]]) {
      const gutter = gutterBox({ boardRect: BOARD_1080, probeRects, viewport: VIEWPORT_1080 });
      assert.equal(gutter.width, 0);
    }
    assert.equal(gutterBox({ boardRect: null, probeRects: [], viewport: VIEWPORT_1080 }).width, 0);
  });

  it('row 9: 201 px band at 1920×1080 → 177×247 centred in the band', () => {
    const placement = previewPlacement({
      gutter: { left: 0, top: 0, width: 201, height: 1080 },
      boardRect: BOARD_1080,
      sourceRect: { left: 600, top: 700, width: 100, height: 140 },
      viewport: VIEWPORT_1080,
    });
    assert.deepEqual(placement, { left: 12, top: 416, width: 177, height: 247, mode: 'band' });
  });

  it('row 10: sidebox hidden (436 px band) → 412×576', () => {
    const placement = previewPlacement({
      gutter: { left: 0, top: 0, width: 436, height: 1080 },
      boardRect: { left: 0, top: 0, width: 1920, height: 1080 },
      sourceRect: null,
      viewport: VIEWPORT_1080,
    });
    assert.deepEqual(placement, { left: 12, top: 252, width: 412, height: 576, mode: 'band' });
  });

  it('row 11: no band (two-player / sim) → 160 wide at the board edge', () => {
    const placement = previewPlacement({
      gutter: { left: 0, top: 0, width: 0, height: 1080 },
      boardRect: BOARD_1080,
      sourceRect: { left: 600, top: 700, width: 100, height: 140 },
      viewport: VIEWPORT_1080,
    });
    assert.deepEqual(placement, {
      left: 12,
      top: Math.round((1080 - 160 * CARD_ASPECT) / 2),
      width: 160,
      height: Math.round(160 * CARD_ASPECT),
      mode: 'edge',
    });
  });

  it('a band one pixel too narrow falls back to edge mode', () => {
    const placement = previewPlacement({
      gutter: { left: 0, top: 0, width: 160 + 24 - 1, height: 1080 },
      boardRect: BOARD_1080,
      sourceRect: null,
      viewport: VIEWPORT_1080,
    });
    assert.equal(placement.mode, 'edge');
  });

  it('row 12: edge mode over a far-left prize mirrors to the board right edge', () => {
    const placement = previewPlacement({
      gutter: { left: 0, top: 0, width: 0, height: 1080 },
      boardRect: BOARD_1080,
      sourceRect: { left: 20, top: 500, width: 80, height: 110 },
      viewport: VIEWPORT_1080,
    });
    assert.equal(placement.mode, 'edge-right');
    assert.equal(placement.left, 1450 - 12 - 160);
  });

  it('row 12: band mode over a hand card in the band mirrors to the right band', () => {
    const placement = previewPlacement({
      gutter: { left: 0, top: 0, width: 201, height: 1080 },
      boardRect: BOARD_1080,
      sourceRect: { left: 40, top: 450, width: 100, height: 140 },
      viewport: VIEWPORT_1080,
    });
    assert.deepEqual(placement, { left: 1450 - 201 + 12, top: 416, width: 177, height: 247, mode: 'band-right' });
  });

  it('row 13: a 600 px tall viewport caps the height at 90%', () => {
    const placement = previewPlacement({
      gutter: { left: 0, top: 0, width: 436, height: 600 },
      boardRect: { left: 0, top: 0, width: 1450, height: 600 },
      sourceRect: null,
      viewport: { width: 1920, height: 600 },
    });
    assert.deepEqual(placement, {
      left: Math.round((436 - 540 / CARD_ASPECT) / 2),
      top: 30,
      width: Math.round(540 / CARD_ASPECT),
      height: 540,
      mode: 'band',
    });
  });
});

describe('069 hover eligibility', () => {
  const base = { card: { name: 'x' }, enabled: true, modalOpen: false, buttons: 0 };
  it('eligible for a resolved card with nothing in the way', () => {
    assert.equal(isHoverEligible(base), true);
  });
  it('not for a redacted / unresolved card, the setting off, a modal, or a held button', () => {
    assert.equal(isHoverEligible({ ...base, card: null }), false);
    assert.equal(isHoverEligible({ ...base, enabled: false }), false);
    assert.equal(isHoverEligible({ ...base, modalOpen: true }), false);
    assert.equal(isHoverEligible({ ...base, buttons: 1 }), false);
  });
});

describe('069 stackTopCard — "only the top card if it\'s a Pokémon"', () => {
  const basic = { instanceId: 1, name: 'Basic', supertype: 'Pokémon', stage: 'Basic', hp: 70 };
  const stage1 = { instanceId: 2, attachedTo: 1, name: 'Stage 1', supertype: 'Pokémon', stage: 'Stage 1', hp: 100 };
  const stage2 = { instanceId: 3, attachedTo: 1, name: 'Stage 2', supertype: 'Pokémon', stage: 'Stage 2', hp: 160 };
  const energy = { instanceId: 4, attachedTo: 1, name: 'Fire Energy', supertype: 'Energy' };
  const tool = { instanceId: 5, attachedTo: 1, name: 'Tool', supertype: 'Trainer', subtypes: ['Pokémon Tool'] };
  const stack = [basic, stage1, stage2, energy, tool];

  it('every member of an evolved stack previews the top Stage', () => {
    for (const hovered of stack) assert.equal(stackTopCard(hovered, stack), stage2);
  });

  it('an unevolved Pokémon previews itself, from its Energy too', () => {
    assert.equal(stackTopCard(energy, [basic, energy]), basic);
    assert.equal(stackTopCard(basic, [basic, energy]), basic);
  });

  it('a card outside any stack previews itself', () => {
    assert.equal(stackTopCard(energy, []), energy);
    assert.equal(stackTopCard(energy, undefined), energy);
  });

  it('a non-Pokémon root (free-play mat) previews the hovered card', () => {
    const trainerRoot = { instanceId: 9, name: 'Item', supertype: 'Trainer' };
    const under = { instanceId: 10, attachedTo: 9, name: 'Energy', supertype: 'Energy' };
    assert.equal(stackTopCard(under, [trainerRoot, under]), under);
  });

  it('nothing hovered → null', () => {
    assert.equal(stackTopCard(null, stack), null);
  });
});
