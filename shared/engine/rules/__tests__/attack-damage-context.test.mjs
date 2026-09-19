import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { buildServerAttackContext } from '../attack-damage-context.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });
const energy = (props) =>
  createCard({ supertype: 'Energy', type: 'Energy', name: 'Basic Fighting Energy', ...props });

function boardState() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 4, phase: 'main' };

  const attacker = pokemon({ instanceId: 1, name: 'Toucannon', hp: 150, damage: 30 });
  state.players.p1.zones.active.push(attacker);
  state.players.p1.zones.active.push(energy({ instanceId: 2, attachedTo: 1 }));
  state.players.p1.zones.bench.push(
    pokemon({ instanceId: 3, name: 'Pikipek', hp: 60 }),
    pokemon({ instanceId: 4, name: 'Piloswine', hp: 100, stage: 'Stage 1', damage: 10 }),
    pokemon({ instanceId: 5, name: 'Mamoswine', hp: 180, stage: 'Stage 2' })
  );
  state.players.p1.zones.bench.push(energy({ instanceId: 6, attachedTo: 3 }));
  state.players.p1.zones.hand.push(createCard({ instanceId: 7, name: 'Ultra Ball' }));

  const defender = pokemon({ instanceId: 20, name: 'Lunatone', hp: 90, damage: 20, retreatCost: ['Colorless', 'Colorless'] });
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.active.push(energy({ instanceId: 21, attachedTo: 20 }));
  state.players.p2.zones.bench.push(
    pokemon({ instanceId: 22, name: 'Solrock', hp: 90 }),
    pokemon({ instanceId: 23, name: 'Riolu', hp: 70 })
  );
  for (let i = 0; i < 5; i += 1) {
    state.players.p2.zones.prizes.push(createCard({ instanceId: 30 + i, name: 'Prize' }));
  }
  state.players.p2.zones.hand.push(
    createCard({ instanceId: 40, name: 'Switch' }),
    createCard({ instanceId: 41, name: 'Judge' })
  );

  return { state, attacker, defender };
}

test('counts bench, energy, hands, prizes and turn from the authoritative state', () => {
  const { state, attacker, defender } = boardState();

  const ctx = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker,
    defender,
  });

  assert.equal(ctx.ownBenchCount, 3);
  assert.equal(ctx.opponentBenchCount, 2);
  assert.equal(ctx.energyCount, 1);
  assert.equal(ctx.ownEnergyCount, 2); // one on the attacker, one on a benched Pokémon
  assert.equal(ctx.opponentEnergyCount, 1);
  assert.equal(ctx.ownHandCount, 1);
  assert.equal(ctx.opponentHandCount, 2);
  assert.equal(ctx.opponentPrizes, 5);
  assert.equal(ctx.turnCount, 4);
  assert.equal(ctx.attackerHp, 150);
  assert.equal(ctx.defenderHp, 90);
  assert.equal(ctx.attackerDamage, 30);
  assert.equal(ctx.defenderDamage, 20);
  assert.equal(ctx.retreatCostColorless, 2);
  assert.equal(ctx.ownPokemonInPlayCount, 4);
  assert.equal(ctx.damagedOwnPokemonCount, 2); // attacker 30 + Piloswine 10
  assert.equal(ctx.stage2BenchCount, 1);
  assert.equal(ctx.stage2InPlayCount, 1);
});

test('attached cards are never counted as Pokémon in play', () => {
  const { state, attacker, defender } = boardState();
  // A Tool attached to the active must not inflate the in-play count.
  state.players.p1.zones.active.push(
    createCard({ instanceId: 8, name: 'Air Balloon', type: 'Trainer', attachedTo: 1 })
  );

  const ctx = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker,
    defender,
  });

  assert.equal(ctx.ownPokemonInPlayCount, 4);
  assert.equal(ctx.ownBenchCount, 3);
});

test('an evolution attached under its Basic is read at its evolved stage', () => {
  const { state, attacker, defender } = boardState();
  const basic = pokemon({ instanceId: 50, name: 'Swinub', hp: 70, stage: 'Basic' });
  const evolution = pokemon({
    instanceId: 51,
    name: 'Piloswine',
    hp: 100,
    stage: 'Stage 1',
    attachedTo: 50,
    evolvesFrom: 'Swinub',
  });
  state.players.p1.zones.bench.push(basic, evolution);

  const ctx = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker,
    defender,
  });

  // The Basic is one root Pokémon (the Evolution is attached to it), not two.
  assert.equal(ctx.ownBenchCount, 4);
  assert.equal(ctx.ownPokemonInPlayCount, 5);
});

test('empty board: every count is 0 and nothing throws', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  const attacker = pokemon({ instanceId: 1, name: 'Pikipek', hp: 60 });
  state.players.p1.zones.active.push(attacker);

  const ctx = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker,
    defender: null,
  });

  assert.equal(ctx.ownBenchCount, 0);
  assert.equal(ctx.opponentBenchCount, 0);
  assert.equal(ctx.energyCount, 0);
  assert.equal(ctx.opponentPrizes, 0);
  assert.equal(ctx.turnCount, 1); // turn.number is 1 during setup
});

test('no defender: defender-derived fields are omitted rather than faked as 0', () => {
  const { state, attacker } = boardState();

  const ctx = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker,
    defender: null,
  });

  assert.equal('defenderHp' in ctx, false);
  assert.equal('defenderDamage' in ctx, false);
  assert.equal('opponentEnergyCount' in ctx, false);
  assert.equal('retreatCostColorless' in ctx, false);
});

test('coin and headsCount pass through; headsCount stays absent when not flipped', () => {
  const { state, attacker, defender } = boardState();

  const single = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker,
    defender,
    coin: 'heads',
  });
  assert.equal(single.coin, 'heads');
  assert.equal('headsCount' in single, false);

  const multi = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker,
    defender,
    headsCount: 3,
  });
  assert.equal(multi.coin, null);
  assert.equal(multi.headsCount, 3);
});

test('missing player entries degrade to zeros instead of throwing', () => {
  const state = createGameState({ players: { p1: { username: 'Ash' } }, rulesEnabled: true });
  const attacker = pokemon({ instanceId: 1, name: 'Pikipek', hp: 60 });
  state.players.p1.zones.active.push(attacker);

  const ctx = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'ghost',
    attacker,
    defender: null,
  });

  assert.equal(ctx.opponentBenchCount, 0);
  assert.equal(ctx.opponentHandCount, 0);
  assert.equal(ctx.opponentPrizes, 0);
});
