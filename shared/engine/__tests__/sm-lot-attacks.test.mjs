// SM-LOT audit: Sun & Moon through Lost Thunder attacks that dealt only their printed damage or
// skipped their effect. Every text is the TCGdex card the game loads (id named per case).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { addCondition } from '../rules/special-conditions.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', subtypes: ['Basic'], hp: 300, types: ['Colorless'], ...extra });
const trainer = (name, subtype = 'Item', extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype, trainerType: subtype, ...extra });
const energy = (type, attachedTo = null) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo,
  });

/** p1 (turn 5) attacks with `name`'s one attack; `setup` adds anything else to the board. */
function board(name, text, { damage = '', setup = () => {}, turn = 5 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'sm-lot', seed: 3, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: turn, phase: 'main' };
  const attacker = mon(name, { attacks: [{ name: 'Probe', cost: [], damage, text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400 });
  state.players.p2.zones.active.push(defender);
  setup(state, { attacker, defender });
  return state;
}

/** Runs the attack, answering every choice with `pick(choice)` (default: the first `min` options). */
function attack(state, pick) {
  let res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
  const events = [...(res.events || [])];
  for (let n = 0; n < 12 && !res.error && res.state?.pendingChoice; n++) {
    const pc = res.state.pendingChoice;
    const selection = pick
      ? pick(pc)
      : (pc.options || []).slice(0, Math.max(pc.min || 0, 1)).map((o) => o.instanceId ?? o.id ?? o.value);
    res = applyCommand(res.state, { type: 'resolveChoice', playerId: pc.player, payload: { choiceId: pc.choiceId, selection } }, createRng(4));
    events.push(...(res.events || []));
  }
  assert.equal(res.error ?? null, null, res.reason);
  return { state: res.state, events, dealt: events.find((e) => e.type === 'attackExecuted')?.damage };
}

const zoneNames = (state, playerId, zone) => state.players[playerId].zones[zone].map((c) => c.name);
const dealt = (name, text, damage, setup) => attack(board(name, text, { damage, setup })).dealt;

// ── conditional bonuses ─────────────────────────────────────────────────────

test('Dedenne Electrichain (sm6-88): +30 with a Lightning Pokémon on the Bench', () => {
  const text = 'If you have any Lightning Pokémon on your Bench, this attack does 30 more damage.';
  assert.equal(dealt('Dedenne', text, '30+', (s) => s.players.p1.zones.bench.push(mon('Pikachu', { types: ['Lightning'] }))), 60);
  assert.equal(dealt('Dedenne', text, '30+', (s) => s.players.p1.zones.bench.push(mon('Eevee'))), 30);
});

test('Slowbro Facade (sm2-49): +80 while Burned or Poisoned', () => {
  const text = 'If this Pokémon is Burned or Poisoned, this attack does 80 more damage.';
  assert.equal(dealt('Slowbro', text, '50+', (s, { attacker }) => addCondition(attacker, 'Poisoned')), 130);
  assert.equal(dealt('Slowbro', text, '50+'), 50);
});

test('Darkrai Dark Raid (sm3-87) and Zygarde Calm Strike (sm6-72) read who used their GX attack', () => {
  const raid = 'If your opponent has already used their GX attack, this attack does 80 more damage.';
  assert.equal(dealt('Darkrai', raid, '80+', (s) => (s.players.p2.oncePerGame = { gxUsed: true })), 160);
  assert.equal(dealt('Darkrai', raid, '80+', (s) => (s.players.p1.oncePerGame = { gxUsed: true })), 80);
  const calm = 'If you have used your GX attack, this attack does 60 more damage.';
  assert.equal(dealt('Zygarde', calm, '60+', (s) => (s.players.p1.oncePerGame = { gxUsed: true })), 120);
  assert.equal(dealt('Zygarde', calm, '60+'), 60);
});

test('Wigglytuff Punishing Slap (sm4-72): +60 for Darkness Energy on any opposing Pokémon', () => {
  const text = 'If any of your opponent’s Pokémon have any Darkness Energy attached to them, this attack does 60 more damage.';
  const benched = (s) => {
    const b = mon('Umbreon');
    s.players.p2.zones.bench.push(b, energy('Darkness', b.instanceId));
  };
  assert.equal(dealt('Wigglytuff', text, '60+', benched), 120);
  assert.equal(dealt('Wigglytuff', text, '60+', (s, { defender }) => s.players.p2.zones.active.push(energy('Fire', defender.instanceId))), 60);
});

test('Hippopotas Eleventh Hour Tackle (sm5-68): +130 with 3 or fewer cards in the deck', () => {
  const text = 'If there are 3 or fewer cards in your deck, this attack does 130 more damage.';
  assert.equal(dealt('Hippopotas', text, '50+', (s) => s.players.p1.zones.deck.splice(3)), 180);
  assert.equal(dealt('Hippopotas', text, '50+'), 50);
});

test('Araquanid Bubble Trap (sm6-33) and Volbeat Pheromone Catch (sm7-17) read last turn’s attack', () => {
  const lastTurn = (attackName, attackerName) => (s) => {
    s.players.p1.lastAttack = { attack: { name: attackName }, attackerName, attackerInstanceId: 999, turnNumber: 3 };
  };
  const trap = 'If 1 of your Pokémon used Bubble during your last turn, this attack does 80 more damage.';
  assert.equal(dealt('Araquanid', trap, '40+', lastTurn('Bubble', 'Dewpider')), 120);
  assert.equal(dealt('Araquanid', trap, '40+', lastTurn('Bite', 'Dewpider')), 40);
  const catchText = 'If your Illumise used Pheromone Signals during your last turn, this attack does 100 more damage.';
  assert.equal(dealt('Volbeat', catchText, '20+', lastTurn('Pheromone Signals', 'Illumise')), 120);
  assert.equal(dealt('Volbeat', catchText, '20+', lastTurn('Pheromone Signals', 'Volbeat')), 20);
});

test('Grumpig Mirror Step (sm7-60): +70 when both sides share a Pokémon name', () => {
  const text = 'If 1 of your opponent’s Pokémon in play has the same name as 1 of your Pokémon in play, this attack does 70 more damage.';
  const both = (s) => {
    s.players.p1.zones.bench.push(mon('Spoink'));
    s.players.p2.zones.bench.push(mon('Spoink'));
  };
  assert.equal(dealt('Grumpig', text, '10+', both), 80);
  assert.equal(dealt('Grumpig', text, '10+', (s) => s.players.p2.zones.bench.push(mon('Spoink'))), 10);
});

test('Medicham Strike of Enlightenment (sm7-77): +160 at 30 HP or less', () => {
  const text = 'If this Pokémon’s remaining HP is 30 or less, this attack does 160 more damage.';
  assert.equal(dealt('Medicham', text, '10+', (s, { attacker }) => (attacker.damage = 270)), 170);
  assert.equal(dealt('Medicham', text, '10+', (s, { attacker }) => (attacker.damage = 260)), 10);
});

test('Raikou Lost Voltage (sm8-79): +90 with Lightning Energy in the Lost Zone', () => {
  const text = 'If you have any Lightning Energy cards in the Lost Zone, this attack does 90 more damage.';
  assert.equal(dealt('Raikou', text, '30+', (s) => s.players.p1.zones.lostZone.push(energy('Lightning'))), 120);
  assert.equal(dealt('Raikou', text, '30+', (s) => s.players.p1.zones.lostZone.push(energy('Fire'))), 30);
});

test('Sudowoodo Reply Strongly (sm8-110): +80 after taking attack damage last turn', () => {
  const text =
    'If this Pokémon was damaged by an attack during your opponent’s last turn while it was your Active Pokémon, this attack does 80 more damage.';
  assert.equal(dealt('Sudowoodo', text, '20+', (s, { attacker }) => (attacker.attackDamageTaken = { turn: 4, amount: 30 })), 100);
  assert.equal(dealt('Sudowoodo', text, '20+'), 20);
});

test('Alolan Meowth Spoil the Fun (sm8-118): +60 only on the second player’s first turn', () => {
  const text = 'If you go second, this attack does 60 more damage during your first turn.';
  assert.equal(attack(board('Alolan Meowth', text, { damage: '10+', turn: 2 })).dealt, 70);
  assert.equal(attack(board('Alolan Meowth', text, { damage: '10+', turn: 4 })).dealt, 10);
});

test('Wigglytuff Charmed Slap (sm8-134): +70 with a Fairy Charm attached', () => {
  const text = 'If this Pokémon has a Pokémon Tool card that has "Fairy Charm" in its name attached to it, this attack does 70 more damage.';
  const charm = (name) => (s, { attacker }) => {
    s.players.p1.zones.active.push(trainer(name, 'Pokémon Tool', { trainerType: 'Tool', attachedTo: attacker.instanceId }));
  };
  assert.equal(dealt('Wigglytuff', text, '70+', charm('Fairy Charm Dragon')), 140);
  assert.equal(dealt('Wigglytuff', text, '70+', charm('Choice Band')), 70);
});

test('Gumshoos Identify (sm5-113) and Xatu Energy Gaze (sm8-88) read the revealed hand', () => {
  const identify = 'Your opponent reveals their hand. If you find a Pokémon there, this attack does 80 more damage.';
  assert.equal(dealt('Gumshoos', identify, '20+', (s) => s.players.p2.zones.hand.push(mon('Rattata'))), 100);
  assert.equal(dealt('Gumshoos', identify, '20+', (s) => s.players.p2.zones.hand.push(energy('Fire'))), 20);
  const gaze = 'Your opponent reveals their hand. If you find any Energy cards there, this attack does 60 more damage.';
  assert.equal(dealt('Xatu', gaze, '30+', (s) => s.players.p2.zones.hand.push(energy('Fire'))), 90);
  assert.equal(dealt('Xatu', gaze, '30+', (s) => s.players.p2.zones.hand.push(mon('Rattata'))), 30);
});

// ── scaling ─────────────────────────────────────────────────────────────────

test('Honchkrow Raven’s Claw (sm2-79) and Chandelure Vortex of Pain (sm8-103) count every opposing counter', () => {
  const counters = (s, { defender }) => {
    defender.damage = 30;
    const b = mon('Bench');
    b.damage = 20;
    s.players.p2.zones.bench.push(b);
  };
  const claw = 'This attack does 10 more damage for each damage counter on all of your opponent’s Pokémon.';
  assert.equal(dealt('Honchkrow', claw, '10+', counters), 60);
  const vortex = 'This attack does 20 damage for each damage counter on all of your opponent’s Pokémon.';
  assert.equal(dealt('Chandelure', vortex, '20×', counters), 100);
});

test('Alolan Exeggutor Tropical Shake (sm6-2): +20 per basic Energy type in the discard, capped at 100', () => {
  const text =
    'This attack does 20 more damage for each type of basic Energy card in your discard pile. You can’t add more than 100 damage in this way.';
  const discard = (types) => (s) => s.players.p1.zones.discard.push(...types.map((t) => energy(t)));
  assert.equal(dealt('Alolan Exeggutor', text, '20+', discard(['Fire', 'Fire', 'Water'])), 60);
  assert.equal(dealt('Alolan Exeggutor', text, '20+', discard(['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Metal'])), 120);
});

test('Eevee Palette of Friends (sm5-105): 10 per different type on the Bench', () => {
  const text = 'This attack does 10 damage for each different type of Pokémon on your Bench.';
  const bench = (s) => s.players.p1.zones.bench.push(mon('A', { types: ['Fire'] }), mon('B', { types: ['Fire'] }), mon('C', { types: ['Water'] }));
  assert.equal(dealt('Eevee', text, '10×', bench), 20);
});

test('Weavile Evil Admonition (sm5-74): 50 per opposing Pokémon with an Ability', () => {
  const text = 'This attack does 50 damage for each of your opponent’s Pokémon that has an Ability.';
  const abilities = (s) =>
    s.players.p2.zones.bench.push(mon('Shiinotic', { abilities: [{ name: 'Illuminate', text: 'x' }] }), mon('Plain'));
  assert.equal(dealt('Weavile', text, '50×', abilities), 50);
});

test('Toxapex Venom Fever (sm8-69): 50 per counter on a Poisoned Active, nothing otherwise', () => {
  const text = 'If your opponent’s Active Pokémon is Poisoned, this attack does 50 damage for each damage counter on that Pokémon.';
  const poisoned = (s, { defender }) => {
    defender.damage = 40;
    addCondition(defender, 'Poisoned');
  };
  assert.equal(dealt('Toxapex', text, '50×', poisoned), 200);
  assert.equal(dealt('Toxapex', text, '50×', (s, { defender }) => (defender.damage = 40)), 0);
});

test('Jumpluff Lost March (sm8-14): 20 per own Pokémon in the Lost Zone, Prism Stars excluded', () => {
  const text = 'This attack does 20 damage for each of your Pokémon, except {*} (Prism Star) Pokémon, in the Lost Zone.';
  const lost = (s) => s.players.p1.zones.lostZone.push(mon('Hoppip'), mon('Skiploom'), mon('Lunala ◇'), energy('Grass'));
  assert.equal(dealt('Jumpluff', text, '20×', lost), 40);
});

// ── cards moved between zones ───────────────────────────────────────────────


test('Bail Out (sm2-39 Mareanie, sm3.5-26 Keldeo) puts a [Water] Pokémon from the discard into the hand', () => {
  const discard = (s) => s.players.p1.zones.discard.push(mon('Lapras', { types: ['Water'] }), mon('Vulpix', { types: ['Fire'] }), energy('Water'));
  const any = attack(board('Mareanie', 'Put a Pokémon from your discard pile into your hand.', { setup: discard }), (pc) => [pc.options.at(-1).instanceId]);
  assert.deepEqual(zoneNames(any.state, 'p1', 'hand'), ['Vulpix']);
  const water = attack(board('Keldeo', 'Put a Water Pokémon from your discard pile into your hand.', { setup: discard }));
  assert.deepEqual(zoneNames(water.state, 'p1', 'hand'), ['Lapras']);
});

test('Pinsir Roof Fling (sm1-6): heads returns the opposing Active and its cards to their hand', () => {
  const text = 'Flip a coin. If heads, put your opponent’s Active Pokémon and all cards attached to it into your opponent’s hand.';
  const setup = (s, { defender }) => s.players.p2.zones.active.push(energy('Fire', defender.instanceId)) && s.players.p2.zones.bench.push(mon('Next'));
  const outcomes = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
    const state = board('Pinsir', text, { setup });
    const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
    return zoneNames(res.state, 'p2', 'hand').filter((name) => !name.startsWith('p2 deck')).sort().join(',');
  });
  assert.ok(outcomes.includes('Basic Fire Energy,Defender'), outcomes.join(' | '));
  assert.ok(outcomes.includes(''), 'tails leaves it in play');
});

test('Pelipper Courier (sm1-38) returns one Benched Pokémon with its cards to the hand', () => {
  const setup = (s) => {
    const b = mon('Wingull');
    s.players.p1.zones.bench.push(b, energy('Water', b.instanceId));
  };
  const res = attack(board('Pelipper', 'Put 1 of your Benched Pokémon and all cards attached to it into your hand.', { setup }));
  assert.deepEqual(zoneNames(res.state, 'p1', 'hand').sort(), ['Basic Water Energy', 'Wingull']);
  assert.deepEqual(zoneNames(res.state, 'p1', 'active'), ['Pelipper']);
});

test('Alomomola Borne Ashore (sm2-36) and Marshadow Shadowy Echoes (SM93) bench Basics onto their owners’ Benches', () => {
  const discards = (s) => {
    s.players.p1.zones.discard.push(mon('Mine'));
    s.players.p2.zones.discard.push(mon('Theirs'), mon('Evolved', { stage: 'Stage 1', subtypes: ['Stage 1'] }));
  };
  const either = attack(
    board('Alomomola', 'Put a Basic Pokémon from either player’s discard pile onto its owner’s Bench.', { setup: discards }),
    (pc) => [pc.options.find((o) => o.name === 'Theirs').instanceId]
  );
  assert.deepEqual(zoneNames(either.state, 'p2', 'bench'), ['Theirs']);
  assert.deepEqual(zoneNames(either.state, 'p1', 'bench'), []);
  const each = attack(board('Marshadow', 'Put a Basic Pokémon from each player’s discard pile onto its owner’s Bench.', { setup: discards }));
  assert.deepEqual(zoneNames(each.state, 'p1', 'bench'), ['Mine']);
  assert.deepEqual(zoneNames(each.state, 'p2', 'bench'), ['Theirs']);
});

test('Oranguru Resource Management (sm5-114) puts 3 discard cards on the bottom of the deck', () => {
  const setup = (s) => s.players.p1.zones.discard.push(trainer('A'), trainer('B'), trainer('C'), trainer('D'));
  const res = attack(board('Oranguru', 'Put 3 cards from your discard pile on the bottom of your deck in any order.', { setup }), (pc) =>
    pc.options.slice(0, 3).map((o) => o.instanceId)
  );
  assert.deepEqual(zoneNames(res.state, 'p1', 'discard'), ['D']);
  assert.deepEqual(zoneNames(res.state, 'p1', 'deck').slice(-3), ['A', 'B', 'C']);
});

test('Flabébé Secret Blessings (sm6-84) shuffles Pokémon and basic Energy only', () => {
  const setup = (s) => s.players.p1.zones.discard.push(mon('M'), energy('Fairy'), trainer('T'), energy('Grass'));
  const res = attack(
    board('Flabébé', 'Shuffle 3 in any combination of Pokémon and basic Energy cards from your discard pile into your deck.', { setup })
  );
  assert.deepEqual(zoneNames(res.state, 'p1', 'discard'), ['T']);
});

test('Milotic TLC (sm4-27) shuffles only a damaged Benched Pokémon; Tapu Fini Dream Away (sm8-151) the Active on heads', () => {
  const setup = (s) => {
    const hurt = mon('Hurt');
    hurt.damage = 10;
    s.players.p2.zones.bench.push(mon('Fresh'), hurt);
  };
  const tlc = attack(
    board('Milotic', 'Shuffle 1 of your opponent’s Benched Pokémon that has any damage counters on it and all cards attached to it into their deck.', { setup })
  );
  assert.deepEqual(zoneNames(tlc.state, 'p2', 'bench'), ['Fresh']);
  const dream = 'Flip a coin. If heads, your opponent shuffles their Active Pokémon and all cards attached to it into their deck.';
  const shuffled = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((seed) => {
    const state = board('Tapu Fini', dream, { setup });
    const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
    return res.state.players.p2.zones.deck.some((c) => c.name === 'Defender');
  });
  assert.ok(shuffled);
});

test('Azelf Psychic Abduction (sm6-43) works only on the second player’s first turn', () => {
  const text =
    'You can use this attack only if you go second, and only on your first turn. Shuffle 1 of your opponent’s Benched Pokémon and all cards attached to it into their deck.';
  const setup = (s) => s.players.p2.zones.bench.push(mon('Target'));
  const firstTurn = attack(board('Azelf', text, { setup, turn: 2 }));
  assert.deepEqual(zoneNames(firstTurn.state, 'p2', 'bench'), []);
  const later = applyCommand(board('Azelf', text, { setup, turn: 4 }), { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
  assert.ok(later.error || later.state.players.p2.zones.bench.length === 1);
});

test('Guzzlord Lord’s Valley (sm6-80) mills 10 only with exactly 2, 4 or 6 Prizes left', () => {
  const text = 'If you have exactly 2, 4, or 6 Prize cards remaining, discard the top 10 cards of your deck.';
  assert.equal(attack(board('Guzzlord', text, { damage: '160' })).state.players.p1.zones.deck.length, 0);
  const five = attack(board('Guzzlord', text, { damage: '160', setup: (s) => s.players.p1.zones.prizes.pop() }));
  assert.equal(five.state.players.p1.zones.deck.length, 10);
});
