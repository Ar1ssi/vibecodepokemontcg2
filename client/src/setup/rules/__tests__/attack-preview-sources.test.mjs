import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachedEnergiesFor,
  stadiumCardFor,
  abilityUsedFor,
} from '../attack-preview-sources.mjs';

test('attached Energy: legacy zone array wins when it holds the card', () => {
  const image = {};
  const card = { name: 'Pikachu', image };
  const fire = { type: 'Energy', name: 'Fire Energy', image: { relative: image } };
  const tool = { type: 'Trainer', name: 'Belt', image: { relative: image } };
  const other = { type: 'Energy', name: 'Water Energy', image: { relative: {} } };

  assert.deepEqual(attachedEnergiesFor(card, [card, fire, tool, other]), [fire]);
});

test('attached Energy: server-rendered card falls back to its stamped attachedCards', () => {
  const lightning = { instanceId: 11, type: 'Energy', name: 'Basic Lightning Energy' };
  const belt = { instanceId: 12, type: 'Trainer', name: 'Choice Belt' };
  const card = { instanceId: 10, name: 'Pikachu', image: {}, attachedCards: [lightning, belt] };

  assert.deepEqual(attachedEnergiesFor(card, []), [lightning]);
  assert.deepEqual(attachedEnergiesFor({ name: 'Mew', image: {} }, []), []);
  assert.deepEqual(attachedEnergiesFor(null, []), []);
});

test('stadium: legacy rules stadium first, then the authoritative view', () => {
  const legacy = { name: 'Artazon' };
  const server = { name: 'Area Zero' };

  assert.equal(stadiumCardFor({ user: 'self', card: legacy }, [server]), legacy);
  assert.equal(stadiumCardFor(null, [server]), server);
  assert.equal(stadiumCardFor(null, []), null);
  assert.equal(stadiumCardFor(undefined, undefined), null);
});

test('ability used: legacy flag, stamped card flag, or server flags by instanceId/name', () => {
  const card = { instanceId: 7, name: 'Mew' };

  assert.equal(abilityUsedFor(card, true), true);
  assert.equal(abilityUsedFor({ ...card, abilityUsed: true }, false), true);
  assert.equal(abilityUsedFor(card, false, { 7: true }), true);
  assert.equal(abilityUsedFor(card, false, { Mew: true }), true);
  assert.equal(abilityUsedFor(card, false, { 8: true }), false);
  assert.equal(abilityUsedFor(card, false), false);
});
