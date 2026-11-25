// SM-LOT audit: Sun & Moon through Lost Thunder Abilities that did nothing in play. Every text is
// the TCGdex card the game loads (id named per case); each runs through the reducer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { listConditions } from '../rules/special-conditions.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', subtypes: ['Basic'], hp: 200, types: ['Colorless'], ...extra });
const energy = (type, attachedTo) =>
  createCard({ instanceId: nextId++, name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], energyType: type, attachedTo });
const ability = (text, name = 'Ability') => ({ abilities: [{ name, type: 'Ability', text }] });

function board(turn = 5) {
  nextId = 1;
  const state = createGameState({ gameId: 'sm-lot-abilities', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 8; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: turn, phase: 'main' };
  return state;
}
const command = (state, playerId, type, payload) => applyCommand(state, { type, playerId, payload }, createRng(3));

/** p1's Active (1 Colorless Retreat Cost, no Energy) retreating after `setup`. */
function retreats(setup, turn = 5) {
  const state = board(turn);
  const active = mon('Holder', { retreatCost: ['Colorless'] });
  const bench = mon('Bench');
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(bench);
  state.players.p2.zones.active.push(mon('Opponent'));
  setup(state, active);
  return !command(state, 'p1', 'retreat', { benchInstanceId: bench.instanceId, discardEnergyIds: [] }).error;
}

/** Damage p1's 10-damage attack deals to p2's Active after `setup`. */
function dealt(setup, damage = '10') {
  const state = board();
  const attacker = mon('Attacker', { attacks: [{ name: 'Hit', cost: [], damage, text: '' }] });
  const defender = mon('Defender', { hp: 500 });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(defender);
  setup(state, attacker, defender);
  const res = command(state, 'p1', 'attack', { attackIndex: 0 });
  assert.equal(res.error ?? null, null, res.reason);
  return res.events.find((e) => e.type === 'attackExecuted')?.damage;
}

/** Whether p1 (1 Fire Energy, a {C} attack) is refused its attack after `setup`. */
function attackRefused(setup) {
  const state = board();
  const attacker = mon('Attacker', { attacks: [{ name: 'Hit', cost: ['Colorless'], damage: '10', text: '' }] });
  state.players.p1.zones.active.push(attacker, energy('Fire', attacker.instanceId));
  state.players.p2.zones.active.push(mon('Defender'));
  setup(state, attacker);
  return Boolean(command(state, 'p1', 'attack', { attackIndex: 0 }).error);
}

const weakTo = (defender, type) => {
  defender.weakness = { type, value: 2 };
  defender.weaknesses = [{ type, value: '×2' }];
};

test('a 1-Colorless Retreat Cost is not free without an Ability (control)', () => {
  assert.equal(retreats(() => {}), false);
});

test('Wimpod Wimp Out (sm3-16): no Retreat Cost during its first turn only', () => {
  const wimpOut = (state, active) => Object.assign(active, ability('During your first turn, this Pokémon has no Retreat Cost.'));
  assert.equal(retreats(wimpOut, 2), true);
  assert.equal(retreats(wimpOut, 4), false);
});

test('Weakness readers: Earthen Aura (sm6-71), Weather Guard (sm5-11), Full Metal Body (sm7-99)', () => {
  const fightingIntoWeakness = (state, attacker, defender) => {
    attacker.types = ['Fighting'];
    weakTo(defender, 'Fighting');
  };
  assert.equal(dealt(fightingIntoWeakness), 20, 'control: Weakness doubles');
  assert.equal(
    dealt((state, attacker, defender) => {
      fightingIntoWeakness(state, attacker, defender);
      Object.assign(attacker, ability('Damage from this Pokémon’s attacks isn’t affected by Weakness or Resistance.'));
    }),
    10
  );
  assert.equal(
    dealt((state, attacker, defender) => {
      fightingIntoWeakness(state, attacker, defender);
      defender.types = ['Grass'];
      state.players.p2.zones.bench.push(mon('Cherrim', ability('Your Grass Pokémon have no Weakness.')));
    }),
    10
  );
  const metal = (withEnergy) => (state, attacker, defender) => {
    fightingIntoWeakness(state, attacker, defender);
    Object.assign(defender, ability('If this Pokémon has any Metal Energy attached to it, it has no Weakness.'));
    if (withEnergy) state.players.p2.zones.active.push(energy('Metal', defender.instanceId));
  };
  assert.equal(dealt(metal(true)), 10);
  assert.equal(dealt(metal(false)), 20);
});

test('Mesprit Silent Waves (sm6-42): no Resistance while Azelf is in play', () => {
  const resisted = (withAzelf) => (state, attacker, defender) => {
    attacker.types = ['Fire'];
    defender.resistance = { type: 'Fire', value: -20 };
    defender.resistances = [{ type: 'Fire', value: '-20' }];
    state.players.p1.zones.bench.push(mon('Mesprit', ability('If you have Azelf in play, your opponent’s Pokémon in play have no Resistance.')));
    if (withAzelf) state.players.p1.zones.bench.push(mon('Azelf'));
  };
  assert.equal(dealt(resisted(true), '40'), 40);
  assert.equal(dealt(resisted(false), '40'), 20);
});

test('Damage reduction: Stakataka-GX Ultra Wall (sm7-102), Shelgon Energy Guard (sm7.5-43)', () => {
  const wall = (ultraBeast) => (state, attacker, defender) => {
    if (ultraBeast) defender.subtypes = ['Basic', 'Ultra Beast'];
    state.players.p2.zones.bench.push(
      mon('Stakataka GX', ability('Your Ultra Beasts take 10 less damage from your opponent’s attacks (after applying Weakness and Resistance).'))
    );
  };
  assert.equal(dealt(wall(true)), 0);
  assert.equal(dealt(wall(false)), 10);
  const guard = (attached) => (state, attacker, defender) => {
    Object.assign(defender, ability('If this Pokémon has any basic Energy attached to it, it takes 20 less damage from attacks (after applying Weakness and Resistance).'));
    if (attached) state.players.p2.zones.active.push(energy('Fire', defender.instanceId));
  };
  assert.equal(dealt(guard(true), '30'), 10);
  assert.equal(dealt(guard(false), '30'), 30);
});

test('Damage bonuses: Passimian Power Huddle (sm5-70), Charizard Resolute Flame (sm7.5-3)', () => {
  const huddle = (state, attacker, defender) => {
    attacker.name = 'Passimian';
    defender.stage = 'Stage 1';
    defender.subtypes = ['Stage 1'];
    state.players.p1.zones.bench.push(
      mon(
        'Passimian',
        ability(
          'As long as this Pokémon is on your Bench, your Passimian’s attacks do 30 more damage to your opponent’s Active Evolution Pokémon (before applying Weakness and Resistance).'
        )
      )
    );
  };
  assert.equal(dealt(huddle), 40);
  const flame = (state, attacker) => {
    Object.assign(attacker, ability('This Pokémon’s attacks do 30 more damage to your opponent’s Active Pokémon for each of their Pokémon-GX and Pokémon-EX in play.'));
    state.players.p2.zones.bench.push(mon('Tapu Koko GX', { subtypes: ['Basic', 'GX'] }), mon('Lucario-EX', { subtypes: ['Basic', 'EX'] }), mon('Plain'));
  };
  assert.equal(dealt(flame), 70);
});

test('Attack gates: Sticky Membrane (sm6-91), Disgusting Pollen (sm3-6), Seal of Antiquity (sm4-84)', () => {
  assert.equal(attackRefused(() => {}), false, 'control');
  const activeHolder = (text) => (state) => state.players.p2.zones.active.splice(0, 1, mon('Holder', ability(text)));
  assert.equal(attackRefused(activeHolder('As long as this Pokémon is your Active Pokémon, your opponent’s Pokémon’s attacks cost Colorless more.')), true);
  assert.equal(attackRefused(activeHolder('As long as this Pokémon is your Active Pokémon, your opponent’s Basic Pokémon can’t attack.')), true);
  const seal = (benched) => (state, attacker) => {
    Object.assign(attacker, ability('This Pokémon can’t attack unless Regirock, Regice, and Registeel are on your Bench.'), { name: 'Regigigas' });
    state.players.p1.zones.bench.push(...benched.map((name) => mon(name)));
  };
  assert.equal(attackRefused(seal(['Regirock', 'Regice'])), true);
  assert.equal(attackRefused(seal(['Regirock', 'Regice', 'Registeel'])), false);
});

// ── activated Abilities ─────────────────────────────────────────────────────

const trainer = (name, subtype = 'Item', extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype, trainerType: subtype, ...extra });

/** p1 uses `holder`'s Ability, answering choices with `pick` (default: the first `min` options). */
function useAbility(state, holder, pick) {
  let res = command(state, 'p1', 'useAbility', { instanceId: holder.instanceId, abilityIndex: 0 });
  for (let n = 0; n < 10 && !res.error && res.state?.pendingChoice; n++) {
    const pc = res.state.pendingChoice;
    const selection = pick ? pick(pc) : pc.options.slice(0, Math.max(1, pc.min || 0)).map((o) => o.instanceId);
    res = applyCommand(res.state, { type: 'resolveChoice', playerId: pc.player, payload: { choiceId: pc.choiceId, selection } }, createRng(4));
  }
  return res;
}
const names = (state, playerId, zone) => state.players[playerId].zones[zone].map((c) => c.name);

function abilityBoard(turn = 5) {
  const state = board(turn);
  state.players.p1.zones.active.push(mon('Active'));
  state.players.p2.zones.active.push(mon('Opponent'));
  return state;
}

test('Wishiwashi Cowardice (sm1-44): back to the hand, not on the first turn or the turn it came into play', () => {
  const text =
    'Once during your turn (before your attack), you may discard all cards attached to this Pokémon and return it to your hand. You can’t use this Ability during your first turn or on the turn this Pokémon was put into play.';
  const play = (turn, entered) => {
    const state = abilityBoard(turn);
    const wishiwashi = mon('Wishiwashi', { ...ability(text), enteredPlayTurn: entered });
    state.players.p1.zones.bench.push(wishiwashi, energy('Water', wishiwashi.instanceId));
    return useAbility(state, wishiwashi);
  };
  const used = play(5, 3);
  assert.deepEqual(names(used.state, 'p1', 'hand'), ['Wishiwashi']);
  assert.deepEqual(names(used.state, 'p1', 'discard'), ['Basic Water Energy']);
  assert.ok(play(5, 5).error, 'put into play this turn');
  assert.ok(play(1, 1).error, 'first turn');
});

test('Florges Wondrous Gift (sm6-86): heads puts an Item from the discard on top of the deck', () => {
  const text = 'Once during your turn (before your attack), you may flip a coin. If heads, put an Item card from your discard pile on top of your deck.';
  const tops = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
    const state = abilityBoard();
    const florges = mon('Florges', ability(text));
    state.players.p1.zones.bench.push(florges);
    state.players.p1.zones.discard.push(trainer('Ultra Ball'));
    const res = applyCommand(state, { type: 'useAbility', playerId: 'p1', payload: { instanceId: florges.instanceId, abilityIndex: 0 } }, createRng(seed));
    return res.state.players.p1.zones.deck[0]?.name;
  });
  assert.ok(tops.includes('Ultra Ball') && tops.some((name) => name !== 'Ultra Ball'), tops.join());
});

test('Meganium Quick-Ripening Herb (sm8-8) puts a Stage 2 from the hand onto its Basic, even on turn 1', () => {
  const text =
    'Once during your turn (before your attack), you may use this Ability. Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card onto the Basic Pokémon to evolve it. You can use this Ability during your first turn or on a Pokémon that was put into play this turn.';
  const state = abilityBoard(1);
  const meganium = mon('Meganium', { stage: 'Stage 2', subtypes: ['Stage 2'], ...ability(text) });
  const chikorita = mon('Chikorita', { enteredPlayTurn: 1 });
  state.players.p1.zones.bench.push(meganium, chikorita);
  state.players.p1.zones.hand.push(mon('Meganium', { stage: 'Stage 2', subtypes: ['Stage 2'], evolvesFrom: 'Bayleef', evolvesFromBase: 'Chikorita' }));
  const res = useAbility(state, meganium);
  assert.equal(res.error ?? null, null, res.reason);
  assert.ok(res.state.players.p1.zones.bench.some((c) => c.name === 'Meganium' && c.attachedTo === chikorita.instanceId));
});

test('Typhlosion Blazing Energy (sm8-42): every Energy provides Fire for the rest of the turn', () => {
  const text =
    'Once during your turn (before your attack), you may use this Ability. All Energy attached to your Pokémon are Fire Energy instead of their usual type until the end of your turn. (This includes cards that come into play on this turn.)';
  const state = board();
  const typhlosion = mon('Typhlosion', { attacks: [{ name: 'Flare', cost: ['Fire'], damage: '10', text: '' }], ...ability(text) });
  state.players.p1.zones.active.push(typhlosion, energy('Water', typhlosion.instanceId));
  state.players.p2.zones.active.push(mon('Opponent'));
  assert.ok(command(structuredClone(state), 'p1', 'attack', { attackIndex: 0 }).error, 'Water cannot pay {R} before');
  const used = useAbility(state, typhlosion);
  assert.equal(command(used.state, 'p1', 'attack', { attackIndex: 0 }).error ?? null, null);
});

test('Karrablast Shell On (sm4-7) and Ditto Prism Star Almighty Evolution (sm8-154) evolve the holder', () => {
  const shellOn =
    'Once during your turn (before your attack), you may discard a Shelmet from your hand. If you do, search your deck for a card that evolves from this Pokémon and put it onto this Pokémon to evolve it. Then, shuffle your deck.';
  const state = abilityBoard();
  const karrablast = mon('Karrablast', ability(shellOn));
  state.players.p1.zones.bench.push(karrablast);
  state.players.p1.zones.hand.push(mon('Shelmet'));
  state.players.p1.zones.deck.push(mon('Escavalier', { stage: 'Stage 1', subtypes: ['Stage 1'], evolvesFrom: 'Karrablast' }));
  const shelled = useAbility(state, karrablast);
  assert.ok(shelled.state.players.p1.zones.bench.some((c) => c.name === 'Escavalier' && c.attachedTo === karrablast.instanceId));
  assert.deepEqual(names(shelled.state, 'p1', 'discard'), ['Shelmet']);
  const almighty =
    'Once during your turn (before your attack), you may put any Stage 1 card from your hand onto this Pokémon to evolve it. You can’t use this Ability during your first turn or the turn this Pokémon was put into play.';
  const dittoBoard = abilityBoard();
  const ditto = mon('Ditto ◇', { ...ability(almighty), enteredPlayTurn: 3 });
  dittoBoard.players.p1.zones.bench.push(ditto);
  dittoBoard.players.p1.zones.hand.push(mon('Raichu', { stage: 'Stage 1', subtypes: ['Stage 1'], evolvesFrom: 'Pikachu' }));
  const evolved = useAbility(dittoBoard, ditto);
  assert.ok(evolved.state.players.p1.zones.bench.some((c) => c.name === 'Raichu' && c.attachedTo === ditto.instanceId));
});

test('Darkrai-GX Restoration (sm3-88) and Giratina Distortion Door (sm8-97) work from the discard pile', () => {
  const restoration =
    'Once during your turn (before your attack), if this Pokémon is in your discard pile, you may put it onto your Bench. Then, attach a Darkness Energy card from your discard pile to this Pokémon.';
  const state = abilityBoard();
  const darkrai = mon('Darkrai GX', ability(restoration));
  state.players.p1.zones.discard.push(darkrai, energy('Darkness'), energy('Fire'));
  const res = useAbility(state, darkrai);
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(names(res.state, 'p1', 'bench'), ['Darkrai GX', 'Basic Darkness Energy']);
  const inPlay = abilityBoard();
  const benched = mon('Darkrai GX', ability(restoration));
  inPlay.players.p1.zones.bench.push(benched);
  assert.ok(useAbility(inPlay, benched).error, 'not from the Bench');
  const door =
    'Once during your turn (before your attack), if this Pokémon is in your discard pile, you may put it onto your Bench. If you do, put 1 damage counter on 2 of your opponent’s Benched Pokémon.';
  const doorBoard = abilityBoard();
  const giratina = mon('Giratina', ability(door));
  doorBoard.players.p1.zones.discard.push(giratina);
  doorBoard.players.p2.zones.bench.push(mon('B1'), mon('B2'), mon('B3'));
  const opened = useAbility(doorBoard, giratina);
  assert.deepEqual(names(opened.state, 'p1', 'bench'), ['Giratina']);
  assert.deepEqual(opened.state.players.p2.zones.bench.map((c) => c.damage || 0).sort(), [0, 10, 10]);
});

// ── board-wide passives ─────────────────────────────────────────────────────

test('Solrock Sunbeam (sm7-62): each Lunatone has 130 HP', () => {
  const state = board();
  const attacker = mon('Attacker', { attacks: [{ name: 'Hit', cost: [], damage: '100', text: '' }] });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(mon('Lunatone', { hp: 90 }));
  state.players.p2.zones.bench.push(mon('Solrock', ability('The maximum HP of each of your Lunatone in play is 130.')));
  const res = command(state, 'p1', 'attack', { attackIndex: 0 });
  assert.deepEqual(names(res.state, 'p2', 'active'), ['Lunatone']);
});

test('Lunatone Heal Block (sm3-68): no Pokémon can be healed while Solrock is in play', () => {
  const blocked = (withSolrock) => {
    const state = board();
    const hurt = mon('Hurt');
    hurt.damage = 50;
    state.players.p1.zones.active.push(hurt);
    state.players.p2.zones.active.push(mon('Lunatone', ability('If you have Solrock in play, Pokémon (both yours and your opponent’s) can’t be healed.')));
    if (withSolrock) state.players.p2.zones.bench.push(mon('Solrock'));
    const potion = trainer('Potion', 'Item', { text: 'Heal 30 damage from 1 of your Pokémon.' });
    state.players.p1.zones.hand.push(potion);
    let res = command(state, 'p1', 'playTrainer', { instanceId: potion.instanceId, targetInstanceId: hurt.instanceId });
    for (let n = 0; n < 4 && !res.error && res.state.pendingChoice; n++) {
      const pc = res.state.pendingChoice;
      res = applyCommand(res.state, { type: 'resolveChoice', playerId: pc.player, payload: { choiceId: pc.choiceId, selection: [pc.options[0].instanceId] } }, createRng(4));
    }
    return res.error ? 50 : res.state.players.p1.zones.active[0].damage;
  };
  assert.equal(blocked(true), 50);
  assert.equal(blocked(false), 20);
});

test('Kecleon Unit Color (sm8-161): with Unit Energy GrassFireWater it is also a Fire Pokémon', () => {
  const text = 'As long as this Pokémon has Unit Energy GrassFireWater attached to it, it is a Grass, Fire, and Water Pokémon.';
  const hit = (withUnit) =>
    dealt((state, attacker, defender) => {
      Object.assign(attacker, ability(text), { name: 'Kecleon' });
      if (withUnit) {
        state.players.p1.zones.active.push(
          createCard({ instanceId: nextId++, name: 'Unit Energy GrassFireWater', supertype: 'Energy', subtypes: ['Special'], attachedTo: attacker.instanceId })
        );
      }
      weakTo(defender, 'Fire');
    });
  assert.equal(hit(true), 20);
  assert.equal(hit(false), 10);
});

test('Sudowoodo Roadblock (sm2-66): 4 Benched Pokémon at most, and a 5th is discarded', () => {
  const roadblock = mon('Sudowoodo', ability('Your opponent can’t have more than 4 Benched Pokémon. If they have 5 or more Benched Pokémon, they discard Benched Pokémon until they have 4 Pokémon on the Bench. If more than one effect changes the number of Benched Pokémon allowed, use the smaller number.'));
  const state = board();
  state.players.p1.zones.active.push(mon('Active'));
  for (let i = 0; i < 4; i++) state.players.p1.zones.bench.push(mon(`Bench ${i}`));
  state.players.p2.zones.active.push(roadblock);
  const extra = mon('Fifth');
  state.players.p1.zones.hand.push(extra);
  assert.ok(command(state, 'p1', 'moveCard', { instanceId: extra.instanceId, from: 'hand', to: 'bench' }).error);
  // Sudowoodo arriving when the opponent already has 5: they choose one to discard.
  const crowded = board();
  crowded.turn = { player: 'p2', number: 6, phase: 'main' };
  crowded.players.p1.zones.active.push(mon('Active'));
  for (let i = 0; i < 5; i++) crowded.players.p1.zones.bench.push(mon(`Bench ${i}`));
  crowded.players.p2.zones.active.push(mon('Opponent'));
  const sudowoodo = mon('Sudowoodo', roadblock.abilities ? { abilities: roadblock.abilities } : {});
  crowded.players.p2.zones.hand.push(sudowoodo);
  let res = command(crowded, 'p2', 'moveCard', { instanceId: sudowoodo.instanceId, from: 'hand', to: 'bench' });
  assert.equal(res.state.pendingChoice?.player, 'p1');
  const pc = res.state.pendingChoice;
  res = applyCommand(res.state, { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: pc.choiceId, selection: [pc.options[0].instanceId] } }, createRng(4));
  assert.equal(res.state.players.p1.zones.bench.length, 4);
  assert.deepEqual(names(res.state, 'p1', 'discard'), ['Bench 0']);
});

/** A Stage 1 `name` evolved this turn (turn 5) from a Basic in `zone`. */
function evolvedThisTurn(state, zone, name, text, evolvedTurn = 5) {
  const root = mon(`${name} root`);
  const top = mon(name, { stage: 'Stage 1', subtypes: ['Stage 1'], attachedTo: root.instanceId, ...ability(text) });
  top.enteredPlayTurn = evolvedTurn;
  state.players.p1.zones[zone].push(root, top);
  if (evolvedTurn === 5) state.players.p1.flags.evolved = { [root.instanceId]: true, [top.instanceId]: true };
  return { root, top };
}

/** A Basic `name` benched from the hand on `turn`. */
function benchedOn(state, name, text, turn = 5) {
  const card = mon(name, ability(text));
  card.playedToBenchTurn = turn;
  card.enteredPlayTurn = turn;
  state.players.p1.zones.bench.push(card);
  return card;
}

test('Lucario Stance (smp-SM54) protects the evolved Pokémon, only on the turn it evolved', () => {
  const text =
    'When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may prevent all effects of your opponent’s attacks, including damage, done to this Pokémon until the end of your opponent’s next turn.';
  const state = board();
  const { root, top } = evolvedThisTurn(state, 'active', 'Lucario', text);
  state.players.p2.zones.active.push(mon('Opponent'));
  const res = useAbility(state, top);
  assert.equal(res.error ?? null, null, res.reason);
  const kinds = res.state.players.p1.zones.active.find((c) => c.instanceId === root.instanceId).attackMarkers.map((m) => m.kind);
  assert.deepEqual(kinds.sort(), ['effectPrevent', 'incomingPrevent']);

  const stale = board();
  const old = evolvedThisTurn(stale, 'active', 'Lucario', text, 3);
  stale.players.p2.zones.active.push(mon('Opponent'));
  assert.ok(useAbility(stale, old.top).error);
});

test('Marshadow Let Loose (sm35-45): each player shuffles their hand away and draws 4', () => {
  const text =
    'When you play this Pokémon from your hand onto your Bench during your turn, you may have each player shuffle their hand into their deck and draw 4 cards.';
  const state = board();
  state.players.p1.zones.active.push(mon('Active'));
  const marshadow = benchedOn(state, 'Marshadow', text);
  state.players.p1.zones.hand.push(trainer('Mine'));
  state.players.p2.zones.active.push(mon('Opponent'));
  state.players.p2.zones.hand.push(trainer('A'), trainer('B'));
  const res = useAbility(state, marshadow);
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(res.state.players.p1.zones.hand.length, 4);
  assert.equal(res.state.players.p2.zones.hand.length, 4);
});

test('Banette Red Eyes (sm7-65) benches a Basic from the opponent’s discard pile', () => {
  const state = board();
  state.players.p1.zones.active.push(mon('Active'));
  const { top } = evolvedThisTurn(
    state,
    'bench',
    'Banette',
    'When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may put a Basic Pokémon from your opponent’s discard pile onto their Bench.'
  );
  state.players.p2.zones.active.push(mon('Opponent'));
  state.players.p2.zones.discard.push(mon('Victim'));
  const res = useAbility(state, top);
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(res.state.players.p2.zones.bench.map((c) => c.name), ['Victim']);
});

test('Rayquaza-GX Stormy Winds (sm7-109) mills 3 then attaches a basic Energy from the discard', () => {
  const state = board();
  state.players.p1.zones.active.push(mon('Active'));
  const rayquaza = benchedOn(
    state,
    'Rayquaza-GX',
    'When you play this Pokémon from your hand onto your Bench during your turn, you may discard the top 3 cards of your deck. If you do, attach a basic Energy card from your discard pile to this Pokémon.'
  );
  state.players.p1.zones.deck.unshift(energy('Grass', null), mon('x'), mon('y'));
  state.players.p2.zones.active.push(mon('Opponent'));
  const res = useAbility(state, rayquaza, (pc) => [(pc.options.find((o) => o.name === 'Yes') || pc.options[0]).instanceId]);
  assert.equal(res.error ?? null, null, res.reason);
  const attached = res.state.players.p1.zones.bench.filter((c) => c.attachedTo === rayquaza.instanceId);
  assert.deepEqual(attached.map((c) => c.name), ['Basic Grass Energy']);
});

test('Ninjask Molting (sm8-30) benches a Shedinja from the discard pile', () => {
  const state = board();
  state.players.p1.zones.active.push(mon('Active'));
  const { top } = evolvedThisTurn(
    state,
    'bench',
    'Ninjask',
    'When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may put a Shedinja from your discard pile onto your Bench.'
  );
  state.players.p1.zones.discard.push(mon('Shedinja', { stage: 'Stage 1', subtypes: ['Stage 1'] }), mon('Other'));
  state.players.p2.zones.active.push(mon('Opponent'));
  const res = useAbility(state, top);
  assert.equal(res.error ?? null, null, res.reason);
  assert.ok(res.state.players.p1.zones.bench.some((c) => c.name === 'Shedinja'));
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.name === 'Other'));
});

test('Minior Falling Star (sm7-83) needs room on the Bench', () => {
  const text =
    'Once during your turn (before your attack), if this Pokémon is in your hand and your Bench isn’t full, you may move your Active Pokémon to your Bench and play this Pokémon as your new Active Pokémon.';
  const setup = (benched) => {
    const state = board();
    state.players.p1.zones.active.push(mon('Old Active'));
    for (let i = 0; i < benched; i++) state.players.p1.zones.bench.push(mon(`Bench ${i}`));
    const minior = mon('Minior', ability(text));
    state.players.p1.zones.hand.push(minior);
    state.players.p2.zones.active.push(mon('Opponent'));
    return useAbility(state, minior);
  };
  const ok = setup(0);
  assert.equal(ok.error ?? null, null, ok.reason);
  assert.equal(ok.state.players.p1.zones.active[0].name, 'Minior');
  assert.ok(ok.state.players.p1.zones.bench.some((c) => c.name === 'Old Active'));
  assert.match(setup(5).error || '', /bench is full/i);
});

test('Trumbeak Mountain Pass (sm8-165) Lost Zones itself and a Supporter on top of the opponent’s deck', () => {
  const text =
    'Once during your turn (before your attack), if this Pokémon is in your hand, you may reveal it. If you do, look at the top card of your opponent’s deck and put this Pokémon in the Lost Zone. If that card is a Supporter card, you may put it in the Lost Zone. If your opponent has no cards in their deck, you can’t use this Ability.';
  const setup = (emptyDeck) => {
    const state = board();
    state.players.p1.zones.active.push(mon('Active'));
    const trumbeak = mon('Trumbeak', ability(text));
    state.players.p1.zones.hand.push(trumbeak);
    state.players.p2.zones.active.push(mon('Opponent'));
    if (emptyDeck) state.players.p2.zones.deck.length = 0;
    else state.players.p2.zones.deck.unshift(trainer('Cynthia', 'Supporter'));
    return useAbility(state, trumbeak);
  };
  const res = setup(false);
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(res.state.players.p1.zones.lostZone.map((c) => c.name), ['Trumbeak']);
  assert.deepEqual(res.state.players.p2.zones.lostZone.map((c) => c.name), ['Cynthia']);
  assert.match(setup(true).error || '', /no cards in their deck/);
});

// --- Trigger Abilities: each fires from the board event its text names. ---

const resolveAll = (res, pick) => {
  for (let n = 0; n < 8 && !res.error && res.state.pendingChoice; n++) {
    const pc = res.state.pendingChoice;
    const selection = pick ? pick(pc) : pc.options.slice(0, Math.max(1, pc.min || 0)).map((o) => o.instanceId);
    res = command(res.state, pc.player, 'resolveChoice', { choiceId: pc.choiceId, selection });
  }
  return res;
};
const conditionsOf = (card) => listConditions(card);

test('Toxapex Toxic Spikes (sm1-63): the opponent’s new Active after a retreat is Poisoned', () => {
  const state = board();
  state.turn = { player: 'p2', number: 6, phase: 'main' };
  state.players.p1.zones.active.push(mon('Toxapex', ability('Whenever your opponent’s Active Pokémon retreats, their new Active Pokémon is Poisoned.')));
  const old = mon('Old', { retreatCost: [] });
  const incoming = mon('New');
  state.players.p2.zones.active.push(old);
  state.players.p2.zones.bench.push(incoming);
  const res = command(state, 'p2', 'retreat', { benchInstanceId: incoming.instanceId, discardEnergyIds: [] });
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(conditionsOf(res.state.players.p2.zones.active[0]), ['Poisoned']);
});

test('Komala Comatose (sm2-114): an Energy from the hand puts the Active Komala to sleep', () => {
  const state = board();
  const komala = mon('Komala', ability('As long as this Pokémon is your Active Pokémon, whenever you attach an Energy from your hand to it, it is now Asleep.'));
  const fire = energy('Fire', null);
  state.players.p1.zones.active.push(komala);
  state.players.p1.zones.hand.push(fire);
  state.players.p2.zones.active.push(mon('Opponent'));
  const res = command(state, 'p1', 'attachCard', { instanceId: fire.instanceId, targetInstanceId: komala.instanceId });
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(conditionsOf(res.state.players.p1.zones.active[0]), ['Asleep']);
});

test('Primarina Harmonics (sm8-67): the hand attach may bring a second Energy', () => {
  const state = board();
  const primarina = mon('Primarina', ability('Whenever you attach an Energy card from your hand to 1 of your Pokémon, except with an attack, Ability, or Trainer card, attach up to 2 Energy cards to that Pokémon instead of 1.'));
  const target = mon('Target');
  const [w1, w2] = [energy('Water', null), energy('Water', null)];
  state.players.p1.zones.active.push(primarina);
  state.players.p1.zones.bench.push(target);
  state.players.p1.zones.hand.push(w1, w2);
  state.players.p2.zones.active.push(mon('Opponent'));
  const res = resolveAll(command(state, 'p1', 'attachCard', { instanceId: w1.instanceId, targetInstanceId: target.instanceId }));
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(res.state.players.p1.zones.bench.filter((c) => c.attachedTo === target.instanceId).length, 2);
});

test('Eevee Energy Evolution (sm1-101) evolves into the deck card of the attached Energy’s type', () => {
  const state = board();
  const eevee = mon('Eevee', ability('When you attach a basic Energy card from your hand to this Pokémon, you may search your deck for a card that evolves from this Pokémon that is the same type as that Energy card and put it onto this Pokémon. (This counts as evolving this Pokémon.) Shuffle your deck afterward.'));
  const evo = (name, type) => mon(name, { stage: 'Stage 1', subtypes: ['Stage 1'], evolvesFrom: 'Eevee', types: [type] });
  state.players.p1.zones.active.push(eevee);
  state.players.p1.zones.deck.push(evo('Flareon', 'Fire'), evo('Vaporeon', 'Water'));
  const water = energy('Water', null);
  state.players.p1.zones.hand.push(water);
  state.players.p2.zones.active.push(mon('Opponent'));
  let offered = [];
  const res = resolveAll(command(state, 'p1', 'attachCard', { instanceId: water.instanceId, targetInstanceId: eevee.instanceId }), (pc) => {
    offered = pc.options.map((o) => o.name);
    return [pc.options[0].instanceId];
  });
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(offered, ['Vaporeon']);
  assert.ok(res.state.players.p1.zones.active.some((c) => c.name === 'Vaporeon' && c.attachedTo === eevee.instanceId));
});

test('Tapu Lele Charmed Charm (sm8-150): a Fairy Charm Tool from the hand Confuses the opponent’s Active', () => {
  const state = board();
  const lele = mon('Tapu Lele', ability('Whenever you attach a Pokémon Tool card that has "Fairy Charm" in its name from your hand to this Pokémon during your turn, you may leave your opponent’s Active Pokémon Confused.'));
  const charm = trainer('Fairy Charm Lightning', 'Pokémon Tool');
  state.players.p1.zones.active.push(lele);
  state.players.p1.zones.hand.push(charm);
  state.players.p2.zones.active.push(mon('Opponent'));
  const res = command(state, 'p1', 'attachCard', { instanceId: charm.instanceId, targetInstanceId: lele.instanceId });
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(conditionsOf(res.state.players.p2.zones.active[0]), ['Confused']);
});

/** p2's `damage` attack against p1's Active holder of `text` (Bench: two 100-HP Pokémon). */
function opponentHits(text, damage, holderHp, attackerExtra = {}) {
  const state = board();
  state.turn = { player: 'p2', number: 6, phase: 'main' };
  state.players.p1.zones.active.push(mon('Holder', { hp: holderHp, ...ability(text) }));
  state.players.p1.zones.bench.push(mon('Bench A', { hp: 100 }), mon('Bench B', { hp: 100 }));
  state.players.p2.zones.active.push(mon('Attacker', { hp: 300, attacks: [{ name: 'Hit', cost: [], damage: String(damage), text: '' }], ...attackerExtra }));
  state.players.p2.zones.bench.push(mon('Opponent Bench', { hp: 100 }));
  const res = resolveAll(command(state, 'p2', 'attack', { attackIndex: 0 }));
  assert.equal(res.error ?? null, null, res.reason);
  const damageOf = (playerId, name) =>
    [...res.state.players[playerId].zones.active, ...res.state.players[playerId].zones.bench].find((c) => c.name.startsWith(name))?.damage || 0;
  return damageOf;
}

test('Honedge Final Hour (sm6-46): Knocked Out in the Active Spot, 3 counters go on 1 opponent’s Pokémon', () => {
  const damageOf = opponentHits('If this Pokémon is your Active Pokémon and is Knocked Out by damage from an opponent’s attack, put 3 damage counters on 1 of your opponent’s Pokémon.', 100, 60);
  assert.equal(damageOf('p2', 'Attacker') + damageOf('p2', 'Opponent Bench'), 30);
});

test('Gyarados Commotion (sm7.5-20): damaged in the Active Spot, 2 counters on each own Benched Pokémon', () => {
  const damageOf = opponentHits('If this Pokémon is your Active Pokémon and is damaged by an opponent’s attack (even if this Pokémon is Knocked Out), put 2 damage counters on each of your Benched Pokémon.', 30, 200);
  assert.equal(damageOf('p1', 'Bench A'), 20);
  assert.equal(damageOf('p1', 'Bench B'), 20);
});

test('Sigilyph-GX Mirror Counter (sm8-98) returns the damage to a Pokémon-GX attacker only', () => {
  const text = 'If this Pokémon is your Active Pokémon and is damaged by an attack from your opponent’s Pokémon-GX or Pokémon-EX (even if this Pokémon is Knocked Out), put damage counters on the Attacking Pokémon equal to the damage done to this Pokémon.';
  assert.equal(opponentHits(text, 50, 200, { name: 'Attacker-GX', subtypes: ['Basic', 'GX'] })('p2', 'Attacker'), 50);
  assert.equal(opponentHits(text, 50, 200)('p2', 'Attacker'), 0);
});

test('Tyranitar-GX Lost Out (sm8-121): its Knock Outs go to the Lost Zone', () => {
  const state = board();
  state.players.p1.zones.active.push(
    mon('Tyranitar-GX', {
      attacks: [{ name: 'Hit', cost: [], damage: '200', text: '' }],
      ...ability('If your opponent’s Pokémon is Knocked Out by damage from this Pokémon’s attacks, put that Pokémon and all cards attached to it in the Lost Zone instead of the discard pile.'),
    })
  );
  const victim = mon('Victim', { hp: 100 });
  state.players.p2.zones.active.push(victim, energy('Grass', victim.instanceId));
  state.players.p2.zones.bench.push(mon('Next'));
  const res = resolveAll(command(state, 'p1', 'attack', { attackIndex: 0 }));
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(res.state.players.p2.zones.lostZone.map((c) => c.name).sort(), ['Basic Grass Energy', 'Victim']);
});

test('Metagross Extend (sm7-95): Steven’s Resolve does not end the turn while Metagross is Active', () => {
  const run = (zone) => {
    const state = board();
    const metagross = mon('Metagross', ability('As long as this Pokémon is your Active Pokémon, your turn does not end when you play Steven’s Resolve.'));
    if (zone === 'active') state.players.p1.zones.active.push(metagross);
    else {
      state.players.p1.zones.active.push(mon('Active'));
      state.players.p1.zones.bench.push(metagross);
    }
    const resolve = trainer('Steven’s Resolve', 'Supporter', {
      effect: 'Search your deck for up to 3 cards and put them into your hand. Then, shuffle your deck. Your turn ends.',
    });
    state.players.p1.zones.hand.push(resolve);
    state.players.p2.zones.active.push(mon('Opponent'));
    const res = resolveAll(command(state, 'p1', 'playTrainer', { instanceId: resolve.instanceId }));
    assert.equal(res.error ?? null, null, res.reason);
    return res.state.turn.player;
  };
  assert.equal(run('active'), 'p1');
  assert.equal(run('bench'), 'p2');
});

test('Gengar Netherworld Gate (SWSH241): benched from the discard pile with 3 damage counters', () => {
  const state = board();
  state.players.p1.zones.active.push(mon('Active'));
  state.players.p2.zones.active.push(mon('Opponent'));
  const gengar = mon('Gengar', ability('Once during your turn, if this Pokémon is in your discard pile, you may put it onto your Bench. If you do, put 3 damage counters on this Pokémon.'));
  state.players.p1.zones.discard.push(gengar);
  const res = useAbility(state, gengar);
  assert.equal(res.error ?? null, null, res.reason);
  const benched = res.state.players.p1.zones.bench.find((c) => c.name === 'Gengar');
  assert.equal(benched?.damage, 30);
});
