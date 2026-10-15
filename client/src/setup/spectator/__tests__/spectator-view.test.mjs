import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  perspectiveSeat,
  spectatorModeLabel,
  spectatorPerspective,
} from '../spectator-view.mjs';

const spectatorView = () => ({
  gameId: 'room',
  stateVersion: 7,
  isSpectator: true,
  you: null,
  them: null,
  turn: { player: 'p2', isYourTurn: false, number: 3, phase: 'main' },
  pendingChoice: null,
  players: {
    p2: {
      playerId: 'p2',
      username: 'Gary',
      zones: {
        deck: { count: 40 },
        hand: [
          { instanceId: 20, name: 'Iono' },
          { instanceId: 21, name: 'Rare Candy', revealed: true },
        ],
        active: [{ instanceId: 22, name: 'Pidgeot ex' }],
      },
    },
    p1: {
      playerId: 'p1',
      username: 'Ash',
      zones: {
        deck: { count: 38 },
        hand: [{ instanceId: 10, name: 'Ultra Ball' }],
        active: [{ instanceId: 11, name: 'Raichu' }],
      },
    },
  },
});

test('p1 POV: Ash is you, Gary is them with his unrevealed hand redacted', () => {
  const view = spectatorPerspective(spectatorView(), 'p1');
  assert.equal(view.isSpectator, true);
  assert.equal(view.players, undefined);
  assert.equal(view.you.playerId, 'p1');
  assert.equal(view.you.zones.hand[0].name, 'Ultra Ball');
  assert.equal(view.them.playerId, 'p2');
  assert.deepEqual(view.them.zones.hand[0], { instanceId: 20 });
  assert.equal(view.them.zones.hand[1].name, 'Rare Candy');
  assert.equal(view.them.zones.active[0].name, 'Pidgeot ex');
  assert.equal(view.turn.isYourTurn, false);
  assert.equal(view.turn.number, 3);
});

test('p2 POV: Gary is you and it is his turn; Ash\'s hand is redacted', () => {
  const view = spectatorPerspective(spectatorView(), 'p2');
  assert.equal(view.you.playerId, 'p2');
  assert.equal(view.you.zones.hand[0].name, 'Iono');
  assert.equal(view.them.playerId, 'p1');
  assert.deepEqual(view.them.zones.hand, [{ instanceId: 10 }]);
  assert.equal(view.turn.isYourTurn, true);
});

test('broadcast: p1 on the you side, both hands face up', () => {
  const view = spectatorPerspective(spectatorView(), 'broadcast');
  assert.equal(view.you.playerId, 'p1');
  assert.equal(view.you.zones.hand[0].name, 'Ultra Ball');
  assert.equal(view.them.zones.hand[0].name, 'Iono');
});

test('the raw spectator view is not mutated', () => {
  const raw = spectatorView();
  spectatorPerspective(raw, 'p1');
  assert.equal(raw.players.p2.zones.hand[0].name, 'Iono');
  assert.equal(raw.you, null);
});

test('one seat only: that seat is you in every mode, them is null', () => {
  const raw = spectatorView();
  delete raw.players.p2;
  for (const mode of ['p1', 'p2', 'broadcast']) {
    const view = spectatorPerspective(raw, mode);
    assert.equal(view.you.playerId, 'p1', mode);
    assert.equal(view.them, null, mode);
  }
});

test('no seats yet: you and them are null', () => {
  const view = spectatorPerspective({ ...spectatorView(), players: {} }, 'p2');
  assert.equal(view.you, null);
  assert.equal(view.them, null);
  assert.equal(view.turn.isYourTurn, false);
  assert.equal(perspectiveSeat({ players: {} }, 'p1'), null);
});

test('a non-spectator or malformed view is refused', () => {
  assert.equal(spectatorPerspective(null, 'p1'), null);
  assert.equal(spectatorPerspective('view', 'p1'), null);
  assert.equal(spectatorPerspective({ isSpectator: false, you: {}, them: {} }, 'p1'), null);
  assert.equal(spectatorPerspective({ isSpectator: true }, 'p1'), null);
});

test('switch labels name the seats, with fallbacks', () => {
  const raw = spectatorView();
  assert.equal(spectatorModeLabel(raw, 'p1'), 'Ash');
  assert.equal(spectatorModeLabel(raw, 'p2'), 'Gary');
  assert.equal(spectatorModeLabel(raw, 'broadcast'), 'Both');
  assert.equal(spectatorModeLabel(null, 'p2'), 'Player 2');
});
