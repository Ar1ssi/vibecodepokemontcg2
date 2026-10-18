import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropTargetFor, routeDrop } from '../drop-router.mjs';

const STATE = { initiator: 'self', isSpectator: false, rulesEnabled: true, solo: false };
const held = (zone, extra = {}) => ({ instanceId: 10, side: 'self', zone, index: 2, attached: false, ...extra });
const card = (zone, instanceId = 20, side = 'self') => ({ instanceId, side, zone, index: 0 });
const plane = (zone, side = 'self') => ({ zone, side, instanceId: null, plane: true });
const pile = (zone, side = 'self') => ({ zone, side, instanceId: null, pile: true });
const route = (hit, dragging, state = STATE) => routeDrop(dropTargetFor(hit, dragging, state), dragging, state);

test('active → a Bench card is a retreat onto that card', () => {
  assert.deepEqual(route(card('bench', 30), held('active')), { kind: 'retreat', args: ['self', true, 30], gates: [] });
});

test('active → the empty Bench is a retreat with no target', () => {
  assert.deepEqual(route(plane('bench'), held('active')), { kind: 'retreat', args: ['self', true, null], gates: [] });
});

test('hand → the deck is moveToDeckTop behind the moveToDeck gate', () => {
  assert.deepEqual(route(pile('deck'), held('hand')), {
    kind: 'deckTop',
    args: ['self', 'self', 'hand', 2],
    gates: ['moveToDeck'],
  });
  assert.equal(route(plane('deck'), held('hand')).kind, 'deckTop', 'an empty deck footprint too');
});

test('hand → the Active card is a move with that card as the target', () => {
  const target = { ...dropTargetFor(card('active', 40), held('hand'), STATE), targetIndex: -1 };
  assert.equal(target.highlight, 'card');
  assert.deepEqual(routeDrop(target, held('hand'), STATE), {
    kind: 'move',
    args: ['self', 'self', 'hand', 'active', 2, -1, 'move', true, null, { moving: 10, target: 40 }],
    gates: [],
  });
});

test('hand → the empty Active Spot is a move with no target', () => {
  const target = dropTargetFor(plane('active'), held('hand'), STATE);
  assert.equal(target.highlight, 'zone');
  assert.deepEqual(routeDrop(target, held('hand'), STATE).args, [
    'self', 'self', 'hand', 'active', 2, undefined, 'move', true, null, { moving: 10, target: null },
  ]);
});

test('an Energy from the hand onto a Bench Pokémon attaches to it', () => {
  const energy = held('hand', { isEnergy: true });
  const result = route(card('bench', 50), energy);
  assert.equal(result.kind, 'move');
  assert.equal(result.args[3], 'bench');
  assert.deepEqual(result.args[9], { moving: 10, target: 50 });
});

test('an Item from the hand over the Trainer board lands on zone board', () => {
  const item = held('hand', { isTrainer: true });
  const target = dropTargetFor(plane('board'), item, STATE);
  assert.deepEqual(target, { kind: 'zone', side: 'self', zone: 'board', instanceId: null, highlight: 'zone' });
  assert.equal(routeDrop(target, item, STATE).args[3], 'board');
});

test('the opponent\'s zones refuse a card outside a solo room; its own cards cannot move', () => {
  assert.equal(dropTargetFor(plane('bench', 'opp'), held('hand'), STATE), null);
  assert.equal(dropTargetFor(plane('bench', 'opp'), held('hand', { side: 'opp' }), STATE), null);
});

test('in a solo room the far seat\'s card moves on its own side', () => {
  const solo = { ...STATE, solo: true };
  const far = held('hand', { side: 'opp' });
  const result = route(plane('active', 'opp'), far, solo);
  assert.deepEqual(result.args.slice(0, 4), ['opp', 'self', 'hand', 'active']);
  assert.equal(dropTargetFor(plane('active', 'self'), far, solo), null, 'still not onto the other side');
});

test('a spectator drops nothing', () => {
  const watcher = { ...STATE, isSpectator: true };
  assert.equal(dropTargetFor(plane('active'), held('hand'), watcher), null);
  assert.equal(routeDrop({ kind: 'zone', side: 'self', zone: 'active', instanceId: null }, held('hand'), watcher), null);
});

test('the Lost Zone rail moves to lostZone for its own side only', () => {
  const rail = { rail: true, zone: 'lostZone', side: 'self' };
  const target = dropTargetFor(rail, held('hand'), STATE);
  assert.equal(target.kind, 'rail');
  assert.deepEqual(routeDrop(target, held('hand'), STATE).args.slice(2, 4), ['hand', 'lostZone']);
  assert.equal(dropTargetFor({ ...rail, side: 'opp' }, held('hand'), STATE), null);
  assert.equal(routeDrop({ ...target, side: 'opp' }, held('hand'), STATE), null);
});

test('open piles and their top card are their cover zone', () => {
  assert.equal(route(pile('discard'), held('hand')).args[3], 'discardCover');
  assert.equal(route(card('discard', 60), held('hand')).args[3], 'discardCover');
  assert.equal(route(plane('lostZone'), held('bench')).args[3], 'lostZoneCover');
});

test('a pile\'s top card dropped back on its pile, or a card on its own zone, does nothing', () => {
  assert.equal(route(pile('discard'), held('discard')), null);
  assert.equal(route(plane('hand'), held('hand')), null);
  assert.equal(dropTargetFor(plane('hand'), held('hand'), STATE).highlight, null);
});

test('the Stadium slot is shared by both sides', () => {
  const stadium = held('hand', { isTrainer: true });
  const target = dropTargetFor({ zone: 'stadium', side: null, instanceId: null, plane: true }, stadium, STATE);
  assert.equal(target.kind, 'stadium');
  assert.equal(routeDrop(target, stadium, STATE).args[3], 'stadium');
});

test('manual deck gates: deck → hand draws, deck → bench, bench → hand', () => {
  assert.deepEqual(route(plane('hand'), held('deck')).gates, ['draw']);
  assert.deepEqual(route(plane('hand'), held('viewCards')).gates, ['draw']);
  assert.deepEqual(route(plane('bench'), held('deck')).gates, ['deckToBench']);
  assert.deepEqual(route(plane('hand'), held('bench')).gates, ['benchToHand']);
});

test('an attached card moves to a play zone only onto a card, and never onto an attached card', () => {
  const token = held('active', { attached: true });
  assert.equal(route(plane('bench'), token), null);
  assert.equal(route(card('bench', 70), token).kind, 'move');
  assert.equal(routeDrop({ ...dropTargetFor(card('bench', 70), held('hand'), STATE), attached: true }, held('hand'), STATE), null);
});

test('a hit on the held card itself or nothing is no target', () => {
  assert.equal(dropTargetFor(card('hand', 10), held('hand'), STATE), null);
  assert.equal(dropTargetFor(null, held('hand'), STATE), null);
  assert.equal(routeDrop(null, held('hand'), STATE), null);
});

test('bench → active card lights both card and zone (dragOver)', () => {
  assert.equal(dropTargetFor(card('active', 80), held('bench'), STATE).highlight, 'both');
  assert.equal(dropTargetFor(card('prizes', 81), held('hand'), STATE).highlight, 'zone');
});
