import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLegality } from '../reduce.mjs';
import { createCard } from '../cards.mjs';

function evolveState(base, evo) {
  const zones = () => ({ active: [], bench: [], hand: [], deck: [], discard: [], prizes: [], lostZone: [] });
  const state = {
    rulesEnabled: true,
    stateVersion: 1,
    turn: { number: 3, player: 'p1', phase: 'turn' },
    commandLog: [],
    stadium: null,
    players: {
      p1: { playerId: 'p1', zones: zones(), flags: { evolved: {} } },
      p2: { playerId: 'p2', zones: zones(), flags: {} },
    },
  };
  state.players.p1.zones.bench.push(createCard({ instanceId: 501, supertype: 'Pokémon', enteredPlayTurn: 1, ...base }));
  state.players.p1.zones.hand.push(createCard({ instanceId: 502, supertype: 'Pokémon', ...evo }));
  return validateLegality(state, { type: 'attachCard', payload: { instanceId: 502, targetInstanceId: 501 }, playerId: 'p1' });
}

const NAME = 'Single Strike Urshifu VMAX';
const vmax = (id, extra = {}) => ({ name: NAME, stage: 'Basic', id, evolvesFrom: 'Single Strike Urshifu V', ...extra });

test('homebrew VMAX evolves onto a same-name VMAX in play', () => {
  assert.equal(evolveState(vmax('customhb-600'), vmax('customhb-601')).allowed, true);
});

test('homebrew VMAX does not evolve onto a different name or onto itself when printed', () => {
  assert.equal(evolveState({ ...vmax('customhb-600'), name: 'Rapid Strike Urshifu VMAX' }, vmax('customhb-601')).allowed, false);
  assert.equal(evolveState(vmax('swsh5-089'), vmax('swsh5-088')).allowed, false);
});
