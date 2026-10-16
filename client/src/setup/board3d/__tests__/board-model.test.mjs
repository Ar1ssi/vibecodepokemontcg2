import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boardModelFrom,
  diffModels,
  EMPTY_MODEL,
  EMPTY_UI_STATE,
  placementById,
} from '../board-model.mjs';
import { planEnergyTokenRow } from '../../../actions/move-card-bundle/energy-token-row.mjs';

const backs = (side) => `/back-${side}.png`;
const opts = (extra = {}) => ({ cardBackSrcFor: backs, ...extra });

const zones = (overrides = {}) => ({
  deck: { count: 0 },
  hand: [],
  prizes: [],
  active: [],
  bench: [],
  discard: [],
  lostZone: [],
  board: [],
  ...overrides,
});

const ownerView = ({ you = {}, them = {}, stadium = null, stateVersion = 1, youFlags = {}, themFlags = {} } = {}) => ({
  stateVersion,
  stadium,
  isSpectator: false,
  you: { playerId: 'p1', flags: youFlags, zones: zones(you) },
  them: { playerId: 'p2', flags: themFlags, zones: zones(them) },
});

const card = (instanceId, name, extra = {}) => ({ instanceId, name, src: `/${name}.png`, ...extra });
const pokemon = (instanceId, name, stage, extra = {}) =>
  card(instanceId, name, { supertype: 'Pokémon', stage, hp: 100, ...extra });
const energy = (instanceId, name, extra = {}) =>
  card(instanceId, name, { supertype: 'Energy', type: 'Energy', ...extra });
const tool = (instanceId, name, extra = {}) =>
  card(instanceId, name, { supertype: 'Trainer', subtypes: ['Pokémon Tool'], ...extra });

test('row 1: a view with no cards gives no placements and empty piles', () => {
  const model = boardModelFrom(ownerView(), opts());
  assert.deepEqual(model.placements, []);
  for (const side of ['self', 'opp']) {
    assert.deepEqual(model.piles[side], {
      deck: { count: 0, sleeve: `/back-${side}.png`, layers: 0 },
      discard: { count: 0, top: null },
      lostZone: { count: 0, top: null },
      prizes: { count: 0, faceUp: [] },
    });
    assert.deepEqual(model.handStacks[side], []);
  }
  assert.equal(model.stadium, null);
  assert.equal(model.version, 1);
  assert.equal(model.nearSeat, 'you');
});

test('row 2: malformed views return the previous model and report once', () => {
  const previous = boardModelFrom(ownerView({ you: { hand: [card(1, 'Pikachu')] } }), opts());
  const cases = [
    null,
    { stateVersion: 3 },
    { stateVersion: 3, you: null, them: null },
    ownerView({ you: { hand: [{ name: 'No Id' }] } }),
    ownerView({ them: { bench: 'oops' } }),
    { stateVersion: 3, players: {} },
  ];
  for (const view of cases) {
    const reasons = [];
    const result = boardModelFrom(view, opts({ previous, onInvalid: (r) => reasons.push(r) }));
    assert.equal(result, previous);
    assert.equal(reasons.length, 1);
    assert.equal(typeof reasons[0], 'string');
  }
  assert.equal(boardModelFrom(undefined, opts()), EMPTY_MODEL);
  assert.doesNotThrow(() => boardModelFrom({ you: { zones: { hand: [{}] } } }));
});

test('row 3: a redacted card shows its side\'s back and carries no overlays', () => {
  const model = boardModelFrom(ownerView({ them: { hand: [{ instanceId: 40 }] } }), opts());
  const p = placementById(model, 40);
  assert.equal(p.face, 'back');
  assert.equal(p.src, null);
  assert.equal(p.name, '');
  assert.equal(p.backSrc, '/back-opp.png');
  assert.equal(p.damage, 0);
  assert.deepEqual(p.conditions, []);
});

test('row 4: a face-down board card flips when revealed and the diff restyles it', () => {
  const hidden = boardModelFrom(ownerView({ you: { board: [{ instanceId: 20 }] } }), opts());
  assert.equal(placementById(hidden, 20).face, 'back');

  // A face-down card carrying data but not revealed still shows its back.
  const stillHidden = boardModelFrom(
    ownerView({ you: { board: [card(20, 'Ditto', { faceDown: true })] } }),
    opts()
  );
  assert.equal(placementById(stillHidden, 20).face, 'back');

  const revealed = boardModelFrom(
    ownerView({ stateVersion: 2, you: { board: [card(20, 'Ditto', { faceDown: true, revealed: true })] } }),
    opts()
  );
  const p = placementById(revealed, 20);
  assert.equal(p.face, 'front');
  assert.equal(p.src, '/Ditto.png');
  const diff = diffModels(hidden, revealed);
  assert.deepEqual([...diff.restyled], [20]);
  assert.deepEqual([...diff.moved], []);
  assert.deepEqual([...diff.added], []);
});

test('row 5 (model side): spectator view with nearPlayerId picks the near player', () => {
  const view = {
    stateVersion: 7,
    isSpectator: true,
    you: null,
    them: null,
    stadium: card(90, 'Path to the Peak', { ownerId: 'p1' }),
    players: {
      p1: { playerId: 'p1', flags: {}, zones: zones({ hand: [card(1, 'Pikachu')], deck: { count: 5 } }) },
      p2: { playerId: 'p2', flags: {}, zones: zones({ hand: [card(2, 'Eevee')], deck: { count: 9 } }) },
    },
  };
  const model = boardModelFrom(view, opts({ nearPlayerId: 'p2' }));
  assert.equal(model.nearSeat, 'p2');
  assert.equal(placementById(model, 2).side, 'self');
  assert.equal(placementById(model, 2).face, 'front');
  assert.equal(placementById(model, 1).side, 'opp');
  assert.equal(placementById(model, 1).face, 'back', 'far hand shows backs');
  assert.equal(model.piles.self.deck.count, 9);
  assert.equal(model.piles.opp.deck.count, 5);
  assert.equal(model.stadium.facing, 'opp');

  const defaultNear = boardModelFrom(view, opts());
  assert.equal(defaultNear.nearSeat, 'p1');
  assert.equal(placementById(defaultNear, 1).side, 'self');
  assert.equal(defaultNear.stadium.facing, 'self');
});

test('row 8: Basic + Stage 1 + Stage 2 with 2 Tools and 4 Energy stacks as apply-view does', () => {
  const active = [
    pokemon(1, 'Charmander', 'Basic', { damage: 30, poisoned: true, specialCondition: 'Asleep', rotation: 90 }),
    pokemon(2, 'Charmeleon', 'Stage 1', { attachedTo: 1 }),
    pokemon(3, 'Charizard', 'Stage 2', { attachedTo: 1, abilityUsed: true }),
    tool(4, 'Rescue Board', { attachedTo: 1 }),
    energy(6, 'Basic Fire Energy', { attachedTo: 1 }),
    tool(5, 'Bravery Charm', { attachedTo: 1 }),
    energy(7, 'Basic Fire Energy', { attachedTo: 1 }),
    energy(8, 'Double Colorless Energy', { attachedTo: 1, subtypes: ['Special'] }),
    energy(9, 'Basic Water Energy', { attachedTo: 1 }),
  ];
  const model = boardModelFrom(ownerView({ you: { active } }), opts());
  const at = (id) => placementById(model, id);

  const expected = {
    1: { role: 'root', host: null, stackIndex: 0, stackOffset: [0, 2 / 15] },
    2: { role: 'stage', host: 1, stackIndex: 1, stackOffset: [0, 1 / 15] },
    3: { role: 'stage', host: 1, stackIndex: 2, stackOffset: [0, 0] },
    4: { role: 'tool', host: 1, stackIndex: 3, stackOffset: [1 / 6, 0] },
    5: { role: 'tool', host: 1, stackIndex: 4, stackOffset: [2 / 6, 0] },
    6: { role: 'energy', host: 1, stackIndex: 5, stackOffset: [0, 0] },
    7: { role: 'energy', host: 1, stackIndex: 6, stackOffset: [0, 0] },
    8: { role: 'energy', host: 1, stackIndex: 7, stackOffset: [0, 0] },
    9: { role: 'energy', host: 1, stackIndex: 8, stackOffset: [0, 0] },
  };
  for (const [id, want] of Object.entries(expected)) {
    const p = at(Number(id));
    assert.deepEqual(
      { role: p.role, host: p.host, stackIndex: p.stackIndex, stackOffset: p.stackOffset },
      want,
      `card ${id}`
    );
    assert.equal(p.rotation, 90, `card ${id} turns with its root`);
  }

  const srcs = [
    '/src/assets/energy/tokens/fire.png',
    '/src/assets/energy/tokens/fire.png',
    '/src/assets/energy/special/double-colorless-energy.svg',
    '/src/assets/energy/tokens/water.png',
  ];
  const row = planEnergyTokenRow(srcs, 1);
  [6, 7, 8, 9].forEach((id, i) => {
    assert.deepEqual(at(id).energyToken, {
      src: srcs[i],
      double: id === 8,
      left: row.tokens[i].left,
      size: row.tokenSize,
      bottom: 0.03,
      zIndex: row.tokens[i].zIndex,
    });
  });
  for (const id of [1, 2, 3, 4, 5]) assert.equal(at(id).energyToken, null);

  // Overlays sit on the visible card (the Stage 2), read from the root.
  assert.equal(at(3).damage, 30);
  assert.deepEqual(at(3).conditions, ['Poisoned', 'Asleep']);
  assert.equal(at(3).poison, true);
  assert.equal(at(3).burn, false);
  assert.equal(at(3).abilityUsed, true);
  assert.equal(at(1).damage, 0);
  assert.deepEqual(at(1).conditions, []);

  // Roots before attachments, attachments in view order.
  assert.deepEqual(
    model.placements.filter((p) => p.zone === 'active').map((p) => p.instanceId),
    [1, 2, 3, 4, 6, 5, 7, 8, 9]
  );
  assert.deepEqual(at(5).index, 5);
});

test('token row for 2 basic + 1 double Energy equals planEnergyTokenRow', () => {
  const active = [
    pokemon(1, 'Pikachu', 'Basic'),
    energy(2, 'Basic Lightning Energy', { attachedTo: 1 }),
    energy(3, 'Basic Lightning Energy', { attachedTo: 1 }),
    energy(4, 'Double Colorless Energy', { attachedTo: 1, subtypes: ['Special'] }),
  ];
  const model = boardModelFrom(ownerView({ you: { active } }), opts());
  const keys = [
    '/src/assets/energy/tokens/lightning.png',
    '/src/assets/energy/tokens/lightning.png',
    '/src/assets/energy/special/double-colorless-energy.svg',
  ];
  const row = planEnergyTokenRow(keys, 1);
  assert.deepEqual(
    [2, 3, 4].map((id) => placementById(model, id).energyToken.left),
    row.tokens.map((t) => t.left)
  );
  assert.deepEqual(
    [2, 3, 4].map((id) => placementById(model, id).energyToken.double),
    [false, false, true]
  );
  assert.deepEqual(placementById(model, 1).energyBadges, []);
});

test('five Energy of two types put an Nx badge on the visible card', () => {
  const active = [
    pokemon(1, 'Pikachu', 'Basic'),
    ...[2, 3, 4, 5].map((id) => energy(id, 'Basic Lightning Energy', { attachedTo: 1 })),
    energy(6, 'Basic Fire Energy', { attachedTo: 1 }),
  ];
  const model = boardModelFrom(ownerView({ you: { active } }), opts());
  assert.deepEqual(
    placementById(model, 1).energyBadges.map((b) => b.label),
    ['4x']
  );
});

test('row 9: duplicate hand cards group as hand-stack-dom does', () => {
  const hand = [
    card(1, 'Pikachu', { id: 'sv1-1' }),
    card(2, 'Pikachu', { id: 'sv1-1' }),
    card(3, 'Ultra Ball', { id: 'sv1-196' }),
    card(4, 'Pikachu', { id: 'sv2-5' }),
    card(5, 'Ultra Ball', { id: 'sv1-196' }),
  ];
  const model = boardModelFrom(
    ownerView({ you: { hand }, them: { hand: [{ instanceId: 10 }, { instanceId: 11 }] } }),
    opts()
  );
  assert.deepEqual(model.handStacks.self, [[1, 2], [3, 5], [4]]);
  assert.deepEqual(model.handStacks.opp, [[10], [11]], 'backs never stack');
});

test('piles: counts, layers, top cards and face-up prizes', () => {
  const model = boardModelFrom(
    ownerView({
      you: {
        deck: { count: 60 },
        discard: [card(1, 'Ultra Ball'), card(2, 'Nest Ball')],
        lostZone: [card(3, 'Comfey')],
        prizes: [{ instanceId: 4 }, card(5, 'Boss', { revealed: true }), { instanceId: 6 }],
      },
      them: {
        deck: { count: 1 },
        prizes: [card(7, 'Iono'), card(8, 'Arven')],
      },
      themFlags: { prizesFaceUp: true },
    }),
    opts()
  );
  assert.deepEqual(model.piles.self.deck, { count: 60, sleeve: '/back-self.png', layers: 12 });
  assert.equal(model.piles.self.discard.count, 2);
  assert.equal(model.piles.self.discard.top, placementById(model, 2));
  assert.equal(model.piles.self.lostZone.top.instanceId, 3);
  assert.deepEqual(model.piles.self.prizes, { count: 3, faceUp: [5] });
  assert.deepEqual(model.piles.opp.deck, { count: 1, sleeve: '/back-opp.png', layers: 1 });
  assert.deepEqual(model.piles.opp.prizes, { count: 2, faceUp: [7, 8] });
  assert.equal(placementById(model, 4).face, 'back');
  assert.equal(model.piles.opp.discard.top, null);

  const ninety = boardModelFrom(ownerView({ you: { deck: { count: 90 } } }), opts());
  assert.equal(ninety.piles.self.deck.layers, 12);
});

test('stadium faces whoever played it', () => {
  const mine = boardModelFrom(ownerView({ stadium: card(9, 'Artazon', { ownerId: 'p1' }) }), opts());
  assert.deepEqual(mine.stadium, { instanceId: 9, src: '/Artazon.png', name: 'Artazon', facing: 'self' });
  const theirs = boardModelFrom(ownerView({ stadium: card(9, 'Artazon', { ownerId: 'p2' }) }), opts());
  assert.equal(theirs.stadium.facing, 'opp');
  const unknown = boardModelFrom(ownerView({ stadium: card(9, 'Artazon') }), opts());
  assert.equal(unknown.stadium.facing, 'self');
  const asP2 = boardModelFrom(
    ownerView({ stadium: card(9, 'Artazon', { ownerId: 'p2' }) }),
    opts({ selfPlayerId: 'p2' })
  );
  assert.equal(asP2.stadium.facing, 'self');
});

test('uiState drives glow, selection, mat pick and hidden', () => {
  const uiState = {
    selected: new Set([1]),
    glows: new Map([[1, '255,0,0']]),
    matPick: new Map([[2, 'picked']]),
    hidden: new Set([2]),
  };
  const view = ownerView({ you: { bench: [pokemon(1, 'Mew', 'Basic'), pokemon(2, 'Mewtwo', 'Basic')] } });
  const plain = boardModelFrom(view, opts());
  const styled = boardModelFrom(view, opts({ uiState }));
  assert.equal(placementById(styled, 1).selected, true);
  assert.equal(placementById(styled, 1).glow, '255,0,0');
  assert.equal(placementById(styled, 2).matPick, 'picked');
  assert.equal(placementById(styled, 2).hidden, true);
  assert.equal(placementById(plain, 2).matPick, null);
  assert.deepEqual([...diffModels(plain, styled).restyled].sort(), [1, 2]);
  assert.equal(EMPTY_UI_STATE.selected.size, 0);
});

test('diffModels lists exact added, removed and moved sets', () => {
  const a = boardModelFrom(
    ownerView({
      you: { hand: [card(11, 'Iono'), card(10, 'Pikachu')], discard: [card(13, 'Nest Ball')], deck: { count: 40 } },
    }),
    opts()
  );
  const b = boardModelFrom(
    ownerView({
      stateVersion: 2,
      you: { hand: [card(11, 'Iono'), card(12, 'Arven')], bench: [card(10, 'Pikachu')], deck: { count: 39 } },
    }),
    opts()
  );
  const diff = diffModels(a, b);
  assert.deepEqual([...diff.added], [12]);
  assert.deepEqual([...diff.removed], [13]);
  assert.deepEqual([...diff.moved], [10]);
  assert.deepEqual([...diff.restyled], []);
  assert.equal(diff.pilesChanged, true);
  assert.equal(diff.stadiumChanged, false);
  assert.equal(diff.handStacksChanged, true);

  const same = diffModels(b, boardModelFrom(ownerView({
    stateVersion: 2,
    you: { hand: [card(11, 'Iono'), card(12, 'Arven')], bench: [card(10, 'Pikachu')], deck: { count: 39 } },
  }), opts()));
  assert.deepEqual(
    [same.added.size, same.removed.size, same.moved.size, same.restyled.size],
    [0, 0, 0, 0]
  );
  assert.equal(same.pilesChanged || same.stadiumChanged || same.handStacksChanged, false);

  const fromNothing = diffModels(null, a);
  assert.deepEqual([...fromNothing.added].sort(), [10, 11, 13]);
});

test('an attachment whose host is missing is drawn as a root', () => {
  const model = boardModelFrom(
    ownerView({ you: { bench: [energy(5, 'Basic Fire Energy', { attachedTo: 99 })] } }),
    opts()
  );
  const p = placementById(model, 5);
  assert.equal(p.role, 'root');
  assert.equal(p.host, null);
  assert.equal(placementById(model, 404), null);
});
