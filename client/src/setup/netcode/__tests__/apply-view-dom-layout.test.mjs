// Px layout cases for apply-view (design 074 F2). The iframe board positions overlays,
// stack offsets and Energy tokens with inline px from measured rects; the 3D board skips
// all of that (its scene lays them out) and keeps only the DOM state that
// apply-view.test.mjs checks under both boards. The last cases here pin that skip.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyView, getCardRegistry, repositionCardOverlays } from '../apply-view.js';
import {
  fakeHolo,
  resetRenderState,
  setBoardMode,
  setupMockDom,
  sizeRegisteredCards,
} from './apply-view-fixture.mjs';

beforeEach(() => {
  setBoardMode(false);
  resetRenderState();
});

test('Row 21: stacked condition markers are stacked down the card without overlapping', () => {
  const { doc, mockGetZone } = setupMockDom();
  const view = (stateVersion) => ({
    stateVersion,
    you: {
      playerId: 'p1',
      zones: {
        active: [{ instanceId: 25, name: 'Pikachu', src: '/a.png', specialCondition: 'Asleep', poisoned: true, burned: true }],
      },
    },
    them: { playerId: 'p2', zones: {} },
  });
  const options = { document: doc, getZone: mockGetZone };

  applyView(view(1), [], options);
  const img = getCardRegistry().get(25).element;
  // The mock DOM has no layout; give the card a size so marker offsets are measurable.
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 90, height: 126 });
  applyView(view(2), [], options);

  const markers = [img.specialCondition, img.poisonMarker, img.burnMarker];
  assert.equal(new Set(markers.map((m) => m.style.top)).size, 3, 'markers do not overlap');
});

test('status loop: the box is the card footprint and its card frame turns with the card', () => {
  const { doc, mockGetZone } = setupMockDom();
  const options = { document: doc, getZone: mockGetZone };
  const view = (stateVersion, extra) => ({
    stateVersion,
    you: { playerId: 'p1', zones: { active: [{ instanceId: 27, name: 'Pikachu', src: '/a.png', ...extra }] } },
    them: { playerId: 'p2', zones: {} },
  });

  applyView(view(1, { poisoned: true }), [], options);
  const img = getCardRegistry().get(27).element;
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 126, height: 90 });
  applyView(view(2, { poisoned: true, specialCondition: 'Asleep', rotation: -90 }), [], options);
  const loop = img.statusLoop;
  assert.equal(loop.style.width, '126px', 'the box is the sideways footprint');
  assert.equal(loop.card.style.width, '90px', 'the card frame is the card, turned with it');
  assert.equal(loop.card.style.rotate, '-90deg');

  applyView(view(3, { poisoned: true, burned: true }), [], options);
  assert.equal(loop.card.style.rotate, '0deg');
});

// A window resize moves the card without a new view; the Poison/Burn markers must follow it
// like the rotation marker does (repositionCardOverlays is the resize listener's handler).
test('Row 21: resize re-positions the Poison and Burn markers, not only the rotation marker', () => {
  const { doc, mockGetZone } = setupMockDom();
  const view = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        active: [{ instanceId: 26, name: 'Pikachu', src: '/a.png', specialCondition: 'Asleep', poisoned: true, burned: true }],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  const options = { document: doc, getZone: mockGetZone };
  applyView(view, [], options);
  const img = getCardRegistry().get(26).element;
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 90, height: 126 });
  applyView({ ...view, stateVersion: 2 }, [], options);
  const tops = () => [img.specialCondition, img.poisonMarker, img.burnMarker].map((m) => m.style.top);
  const before = tops();

  img.getBoundingClientRect = () => ({ left: 0, top: 100, width: 150, height: 210 });
  repositionCardOverlays();

  const after = tops();
  assert.equal(after.every((top, i) => top !== before[i]), true, `markers moved: ${before} -> ${after}`);
  assert.equal(new Set(after).size, 3, 'markers still stacked without overlap');
  assert.equal(img.poisonMarker.style.width, '50px');
  assert.equal(img.burnMarker.style.width, '50px');
});

test('energy: tokens layer above the card in attach order and drop their layout on detach', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const view = (stateVersion, zones) => ({ stateVersion, you: { playerId: 'p1', zones } });
  const pikachu = { instanceId: 10, name: 'Pikachu', src: 'pika.png', type: 'Pokémon' };
  const lightning = { instanceId: 11, name: 'Basic Lightning Energy', src: 'l.png', type: 'Energy' };
  const belt = { instanceId: 12, name: 'Choice Belt', src: 'belt.png', type: 'Trainer' };
  const fire = { instanceId: 13, name: 'Basic Fire Energy', src: 'f.png', type: 'Energy' };

  applyView(
    view(1, {
      active: [pikachu, { ...lightning, attachedTo: 10 }, { ...belt, attachedTo: 10 }, { ...fire, attachedTo: 10 }],
    }),
    [],
    opts
  );
  const registry = getCardRegistry();
  const lightningImg = registry.get(11).element;
  const fireImg = registry.get(13).element;
  assert.equal(lightningImg.style.zIndex, '101');
  assert.equal(fireImg.style.zIndex, '102', 'second Energy stacks after the first, skipping the Tool');

  applyView(
    view(2, { active: [pikachu, { ...fire, attachedTo: 10 }], discard: [lightning], hand: [belt] }),
    [],
    opts
  );
  assert.equal(fireImg.style.zIndex, '101');
  assert.equal(lightningImg.style.position, '');
});

// Five tokens ran off a Pokémon's card: past four, each type piles onto one
// spot with an "Nx" count badge, the next type following the badge.
test('energy: past four tokens each type piles up behind an Nx badge', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const view = (stateVersion, zones) => ({ stateVersion, you: { playerId: 'p1', zones } });
  const pikachu = { instanceId: 10, name: 'Pikachu', src: 'pika.png', type: 'Pokémon' };
  const fire = (id) => ({ instanceId: id, name: 'Basic Fire Energy', src: 'f.png', type: 'Energy', attachedTo: 10 });
  const water = { instanceId: 15, name: 'Basic Water Energy', src: 'w.png', type: 'Energy', attachedTo: 10 };
  const five = [pikachu, fire(11), water, fire(12), fire(13), fire(14)];

  applyView(view(1, { active: five }), [], opts);
  sizeRegisteredCards(150, 200);
  applyView(view(2, { active: five }), [], opts);

  const registry = getCardRegistry();
  const container = registry.get(10).container;
  const badges = () =>
    container.children.filter((child) => child.classList.contains('energy-token-count'));
  const left = (id) => parseFloat(registry.get(id).element.style.left);

  assert.deepEqual([11, 12, 13, 14].map(left), [0, 0, 0, 0], 'the Fire tokens share one spot');
  assert.equal(registry.get(14).element.style.zIndex, '105', 'newest Fire on top of the pile');
  assert.deepEqual(badges().map((b) => b.textContent), ['4x']);
  const [badge] = badges();
  assert.ok(parseFloat(badge.style.left) >= 36, 'badge after the Fire token');
  assert.ok(left(15) > parseFloat(badge.style.left), 'Water token follows the 4x badge');
  assert.equal(badge.style.bottom, registry.get(15).element.style.bottom);

  applyView(view(3, { active: [pikachu, fire(11), water, fire(12)], discard: [] }), [], opts);
  assert.deepEqual(badges(), [], 'back to four or fewer: no badge');
  assert.ok(left(15) > left(11) && left(12) > left(15), 'tokens side by side again');
});

test('energy: cost-symbol and untyped Energy tokens layer in attach order', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const swinub = { instanceId: 20, name: 'Swinub', src: 'swinub.png', type: 'Pokemon' };
  const symbolEnergy = { instanceId: 21, name: 'Basic {F} Energy', src: 'GRI_169_R_EN.png', type: 'Energy', attachedTo: 20 };
  const untypedEnergy = { instanceId: 22, name: 'Rocky Fighting Energy', src: 'me03-087.webp', type: '', attachedTo: 20 };

  applyView({ stateVersion: 1, you: { playerId: 'p1', zones: { active: [swinub, symbolEnergy, untypedEnergy] } } }, [], opts);
  const registry = getCardRegistry();
  assert.equal(registry.get(21).element.style.zIndex, '101');
  assert.equal(registry.get(22).element.style.zIndex, '102');
});

test('stack: the Basic peeks out under the evolution, the Tool fans out and the slot widens', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone, holo: fakeHolo(doc) };
  const zones = {
    active: [
      { instanceId: 10, name: 'Charmander', src: 'c.png', type: 'Pokémon', stage: 'Basic', damage: 30 },
      { instanceId: 11, name: 'Charmeleon', src: 'm.png', type: 'Pokémon', stage: 'Stage 1', attachedTo: 10 },
      { instanceId: 12, name: 'Choice Belt', src: 'belt.png', type: 'Trainer', attachedTo: 10 },
      { instanceId: 13, name: 'Basic Fire Energy', src: 'f.png', type: 'Energy', attachedTo: 10 },
    ],
  };

  applyView({ stateVersion: 1, you: { playerId: 'p1', zones } }, [], opts);
  sizeRegisteredCards(150, 210);
  applyView({ stateVersion: 2, you: { playerId: 'p1', zones } }, [], opts);

  const registry = getCardRegistry();
  const basic = registry.get(10);
  const stage1 = registry.get(11);
  assert.equal(stage1.element.style.position || '', '', 'Stage 1 stays in flow as the visible card');
  assert.equal(basic.element.style.position, 'absolute');
  assert.equal(basic.element.style.bottom, '10px');
  assert.equal(basic.element.style.zIndex, '-1');

  const belt = registry.get(12).element;
  assert.equal(belt.style.left, '25px', 'Tool fans out behind by a sixth of the card');
  assert.equal(belt.style.zIndex, '-1');
  assert.equal(basic.container.style.width, '175px', 'slot widens for the Tool');
  assert.equal(registry.get(13).element.style.width, '36px', 'token sized from the visible card');

  // Evolution discarded: the Basic is back in flow with no stack styling.
  zones.active = [zones.active[0]];
  applyView({ stateVersion: 3, you: { playerId: 'p1', zones } }, [], opts);
  assert.equal(basic.element.style.position, '');
  assert.equal(basic.element.style.bottom, '');
  assert.equal(basic.container.style.width, '');
});

test('stack: Energy on the stacked evolution is sized as a token on the visible card', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const zones = {
    bench: [
      { instanceId: 10, name: 'Froakie', src: 'f.png', type: 'Pokémon', stage: 'Basic' },
      { instanceId: 11, name: 'Mega Greninja ex', src: 'g.png', type: 'Pokémon', stage: 'Stage 2', attachedTo: 10 },
      { instanceId: 13, name: 'Basic Water Energy', src: 'w.png', type: 'Energy', attachedTo: 11 },
    ],
  };

  applyView({ stateVersion: 1, you: { playerId: 'p1', zones } }, [], opts);
  sizeRegisteredCards(150, 210);
  applyView({ stateVersion: 2, you: { playerId: 'p1', zones } }, [], opts);

  assert.equal(getCardRegistry().get(13).element.style.width, '36px');
});

test('stack: post-retreat order still draws the Basic under the evolution', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const zones = {
    active: [
      { instanceId: 11, name: 'Mega Greninja ex', src: 'g.png', type: 'Pokémon', stage: 'Stage 2', attachedTo: 10 },
      { instanceId: 10, name: 'Frogadier', src: 'f.png', type: 'Pokémon', stage: 'Basic' },
    ],
  };

  applyView({ stateVersion: 1, you: { playerId: 'p1', zones } }, [], opts);
  sizeRegisteredCards(150, 210);
  applyView({ stateVersion: 2, you: { playerId: 'p1', zones } }, [], opts);

  const registry = getCardRegistry();
  assert.equal(registry.get(11).element.style.position || '', '', 'Stage 2 stays in flow as the visible card');
  assert.equal(registry.get(10).element.style.position, 'absolute');
  assert.equal(registry.get(10).element.style.bottom, '10px');
});

test('stack: every under-card is pinned to the slot edge after a swap reorders the stack', () => {
  // A swap re-emits the stack as [top Evolution, Stage 1, Basic], so the Stage 1 lands
  // after the visible card in DOM order. An absolute card with `left: auto` keeps its
  // static position, which drew the Stage 1 beside the Stage 2 instead of under it.
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const basic = { instanceId: 10, name: 'Charmander', src: 'a.png', type: 'Pokémon', stage: 'Basic' };
  const stage1 = { instanceId: 11, name: 'Charmeleon', src: 'b.png', type: 'Pokémon', stage: 'Stage 1', attachedTo: 10 };
  const stage2 = { instanceId: 12, name: 'Mega Charizard Y ex', src: 'c.png', type: 'Pokémon', stage: 'Stage 2', attachedTo: 10 };
  const other = { instanceId: 20, name: 'Pidgey', src: 'p.png', type: 'Pokémon', stage: 'Basic' };
  const view = (stateVersion, zones) => ({ stateVersion, you: { playerId: 'p1', zones } });

  applyView(view(1, { active: [other], bench: [basic, stage1, stage2] }), [], opts);
  sizeRegisteredCards(150, 210);
  applyView(view(2, { active: [stage2, stage1, basic], bench: [other] }), [], opts);

  const registry = getCardRegistry();
  assert.equal(registry.get(11).element.style.left, '0px', 'Stage 1 sits under the Stage 2');
  assert.equal(registry.get(10).element.style.left, '0px', 'Basic sits under the Stage 2');
  assert.equal(registry.get(12).element.style.left || '', '', 'Stage 2 stays in flow');
});

// --- 3D board: apply-view keeps the DOM state but writes no px layout ---

const PX_KEYS = ['left', 'top', 'width', 'height'];
const pxWritten = (el) => PX_KEYS.filter((key) => el.style[key] !== undefined);

test('3D board: overlays are shown but carry no inline left/top/width/height', () => {
  setBoardMode(true);
  const { doc, mockGetZone } = setupMockDom();
  const options = { document: doc, getZone: mockGetZone };
  const card = {
    instanceId: 40,
    name: 'Pikachu',
    src: '/a.png',
    damage: 30,
    specialCondition: 'Asleep',
    poisoned: true,
    burned: true,
    abilityUsed: true,
  };
  const view = (stateVersion) => ({
    stateVersion,
    you: { playerId: 'p1', zones: { active: [card] } },
    them: { playerId: 'p2', zones: {} },
  });

  applyView(view(1), [], options);
  const img = getCardRegistry().get(40).element;
  img.getBoundingClientRect = () => ({ left: 10, top: 20, width: 90, height: 126 });
  applyView(view(2), [], options);

  const overlays = {
    damageCounter: img.damageCounter,
    specialCondition: img.specialCondition,
    poisonMarker: img.poisonMarker,
    burnMarker: img.burnMarker,
    abilityCounter: img.abilityCounter,
  };
  for (const [slot, overlay] of Object.entries(overlays)) {
    assert.ok(overlay, `${slot} exists`);
    assert.equal(overlay.style.display, 'inline-block', `${slot} is shown`);
    assert.deepEqual(pxWritten(overlay), [], `${slot} has no px layout`);
  }
  assert.ok(img.statusLoop, 'the status loop overlay exists');
  assert.deepEqual(pxWritten(img.statusLoop), [], 'the status loop box is not placed');
});

test('3D board: a resize repositions no overlay', () => {
  setBoardMode(true);
  const { doc, mockGetZone } = setupMockDom();
  const options = { document: doc, getZone: mockGetZone };
  const view = (stateVersion) => ({
    stateVersion,
    you: {
      playerId: 'p1',
      zones: { active: [{ instanceId: 41, name: 'Pikachu', src: '/a.png', damage: 10, specialCondition: 'Asleep', poisoned: true }] },
    },
    them: { playerId: 'p2', zones: {} },
  });
  applyView(view(1), [], options);
  const img = getCardRegistry().get(41).element;
  img.getBoundingClientRect = () => ({ left: 0, top: 100, width: 150, height: 210 });

  repositionCardOverlays();

  for (const overlay of [img.damageCounter, img.specialCondition, img.poisonMarker]) {
    assert.deepEqual(pxWritten(overlay), []);
  }
});

test('3D board: a stack keeps its token art and attachments but no px offsets', () => {
  setBoardMode(true);
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const zones = {
    active: [
      { instanceId: 10, name: 'Charmander', src: 'c.png', type: 'Pokémon', stage: 'Basic' },
      { instanceId: 11, name: 'Charmeleon', src: 'm.png', type: 'Pokémon', stage: 'Stage 1', attachedTo: 10 },
      { instanceId: 12, name: 'Choice Belt', src: 'belt.png', type: 'Trainer', attachedTo: 10 },
      { instanceId: 13, name: 'Basic Fire Energy', src: 'f.png', type: 'Energy', attachedTo: 10 },
    ],
  };

  applyView({ stateVersion: 1, you: { playerId: 'p1', zones } }, [], opts);
  sizeRegisteredCards(150, 210);
  applyView({ stateVersion: 2, you: { playerId: 'p1', zones } }, [], opts);

  const registry = getCardRegistry();
  const basic = registry.get(10);
  const fire = registry.get(13).element;
  assert.equal(fire.getAttribute('src'), '/src/assets/energy/tokens/fire.png', 'Energy still swaps to its token');
  assert.equal(fire.classList.contains('energy-token-3d'), true);
  assert.deepEqual(registry.get(11).card.attachedCards.map((c) => c.instanceId), [10, 12, 13]);
  const stackKeys = ['position', 'width', 'height', 'left', 'bottom', 'zIndex'];
  for (const id of [10, 12, 13]) {
    const { style, dataset } = registry.get(id).element;
    assert.equal(dataset.stackStyled, 'true', `card ${id} is marked as stack-styled`);
    assert.deepEqual(
      stackKeys.filter((key) => style[key] !== ''),
      [],
      `card ${id} has its stack styles cleared and none written`
    );
  }
  assert.equal(basic.container.style.width, undefined, 'the slot is not widened');
});

test('3D board: an unloaded stack card waits for no load to relayout', () => {
  setBoardMode(true);
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const zones = {
    active: [
      { instanceId: 10, name: 'Charmander', src: 'c.png', type: 'Pokémon', stage: 'Basic' },
      { instanceId: 11, name: 'Charmeleon', src: 'm.png', type: 'Pokémon', stage: 'Stage 1', attachedTo: 10 },
    ],
  };
  applyView({ stateVersion: 1, you: { playerId: 'p1', zones } }, [], opts);
  const stage1 = getCardRegistry().get(11).element;
  stage1.complete = false;
  applyView({ stateVersion: 2, you: { playerId: 'p1', zones } }, [], opts);

  assert.equal(stage1.listeners.has('load'), false);
  assert.notEqual(stage1.stackRelayoutPending, true);
});

test('iframe board: the same unloaded stack card relayouts once its art loads', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const zones = {
    active: [
      { instanceId: 10, name: 'Charmander', src: 'c.png', type: 'Pokémon', stage: 'Basic' },
      { instanceId: 11, name: 'Charmeleon', src: 'm.png', type: 'Pokémon', stage: 'Stage 1', attachedTo: 10 },
    ],
  };
  applyView({ stateVersion: 1, you: { playerId: 'p1', zones } }, [], opts);
  const stage1 = getCardRegistry().get(11).element;
  stage1.complete = false;
  applyView({ stateVersion: 2, you: { playerId: 'p1', zones } }, [], opts);

  assert.equal(stage1.listeners.get('load')?.length, 1);
});
