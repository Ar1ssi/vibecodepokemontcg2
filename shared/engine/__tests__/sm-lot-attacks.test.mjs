// SM-LOT audit: Sun & Moon through Lost Thunder attacks that dealt only their printed damage or
// skipped their effect. Every text is the TCGdex card the game loads (id named per case).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { addCondition, listConditions } from '../rules/special-conditions.mjs';

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

// ── next-turn effects ───────────────────────────────────────────────────────

/** Hands the board to `playerId` on turn `number` (a fresh turn: no Energy attached yet). */
function turnTo(state, playerId, number) {
  // Rules on, so attach and play legality apply.
  state.rulesEnabled = true;
  state.turn = { player: playerId, number, phase: 'main' };
  for (const player of Object.values(state.players)) player.flags = { ...(player.flags || {}), energyAttached: false, attackerAttacked: false };
  return state;
}
const command = (state, playerId, type, payload) => applyCommand(state, { type, playerId, payload }, createRng(5));

test('Espurr Perplexing Eyes (sm3-59) makes the Defending Pokémon weak to Psychic', () => {
  const res = attack(board('Espurr', 'The Defending Pokémon’s Weakness is now Psychic until the end of your next turn. (The amount of Weakness doesn’t change.)'));
  const marker = res.state.players.p2.zones.active[0].attackMarkers?.find((m) => m.kind === 'weaknessOverride');
  assert.equal(marker?.type, 'psychic');
});

test('Aegislash Ticking Knock Out (sm6-49) Knocks Out the Defending Pokémon the next time an attack damages it', () => {
  const marked = attack(board('Aegislash', 'During your next turn, if the Defending Pokémon is damaged by an attack, it will be Knocked Out.', {
    setup: (s) => s.players.p2.zones.bench.push(mon('Spare')),
  })).state;
  turnTo(marked, 'p1', 7);
  marked.players.p1.zones.active[0].attacks = [{ name: 'Tap', cost: [], damage: '10', text: '' }];
  const res = attack(marked);
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.name === 'Defender'), 'Knocked Out by 10 damage');
});

test('Poipole Knockout Reviver (sm6-55): no Prizes for it during the opponent’s next turn', () => {
  const marked = attack(board('Poipole', 'During your opponent’s next turn, if this Pokémon is Knocked Out, your opponent can’t take any Prize cards for it.', {
    setup: (s) => s.players.p1.zones.bench.push(mon('Spare')),
  })).state;
  const poipole = marked.players.p1.zones.active[0];
  poipole.hp = 30;
  turnTo(marked, 'p2', 6);
  marked.players.p2.zones.active[0].attacks = [{ name: 'Hit', cost: [], damage: '50', text: '' }];
  const res = applyCommand(marked, { type: 'attack', playerId: 'p2', payload: { attackIndex: 0 } }, createRng(3));
  assert.equal(res.error ?? null, null);
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.name === 'Poipole'));
  assert.equal(res.state.players.p2.flags?.prizesOwed || 0, 0);
});

test('Seedot Harden (sm7-11) and Phanpy Endure (sm7-72) set their opponent-turn shields', () => {
  const harden = attack(board('Seedot', 'During your opponent’s next turn, prevent all damage done to this Pokémon by attacks if that damage is 40 or less.'));
  const shield = harden.state.players.p1.zones.active[0].attackMarkers?.find((m) => m.kind === 'incomingPrevent');
  assert.equal(shield?.maxDamage, 40);
  const endure = 'Flip a coin. If heads, if this Pokémon would be Knocked Out by damage from an attack during your opponent’s next turn, it is not Knocked Out, and its remaining HP becomes 10.';
  const kinds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
    const res = applyCommand(board('Phanpy', endure), { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
    return (res.state.players.p1.zones.active[0].attackMarkers || []).map((m) => m.kind).join();
  });
  assert.ok(kinds.includes('surviveKnockOutHp10') && kinds.includes(''), kinds.join('|'));
});

test('Alolan Geodude Rock Polish (sm2-40) retreats for free next turn', () => {
  const marked = attack(board('Alolan Geodude', 'During your next turn, this Pokémon has no Retreat Cost.', {
    setup: (s, { attacker }) => {
      attacker.retreatCost = ['Colorless', 'Colorless'];
      s.players.p1.zones.bench.push(mon('Spare'));
    },
  })).state;
  turnTo(marked, 'p1', 7);
  const spare = marked.players.p1.zones.bench[0];
  const res = command(marked, 'p1', 'retreat', { benchInstanceId: spare.instanceId, discardEnergyIds: [] });
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(res.state.players.p1.zones.active[0].name, 'Spare');
});

test('Dragonair Dragon’s Wish (sm1-95) lifts the one-Energy attach rule next turn', () => {
  const marked = attack(board('Dragonair', 'During your next turn, you may attach any number of Energy cards from your hand to your Pokémon.')).state;
  turnTo(marked, 'p1', 7);
  const [a, b] = [energy('Water'), energy('Lightning')];
  marked.players.p1.zones.hand.push(a, b);
  const host = marked.players.p1.zones.active[0].instanceId;
  let res = command(marked, 'p1', 'attachCard', { instanceId: a.instanceId, targetInstanceId: host });
  assert.equal(res.error ?? null, null, res.reason);
  res = command(res.state, 'p1', 'attachCard', { instanceId: b.instanceId, targetInstanceId: host });
  assert.equal(res.error ?? null, null, res.reason);
  turnTo(res.state, 'p1', 9);
  const c = energy('Fire');
  const d = energy('Fire');
  res.state.players.p1.zones.hand.push(c, d);
  res = command(res.state, 'p1', 'attachCard', { instanceId: c.instanceId, targetInstanceId: host });
  assert.ok(command(res.state, 'p1', 'attachCard', { instanceId: d.instanceId, targetInstanceId: host }).error, 'one per turn again');
});

test('Chimecho Bell of Silence (sm4-43) stops Pokémon with an Ability being played next turn', () => {
  const locked = attack(board('Chimecho', 'Your opponent can’t play any Pokémon that has an Ability from their hand during their next turn.', { damage: '10' })).state;
  turnTo(locked, 'p2', 6);
  const withAbility = mon('Shiinotic', { abilities: [{ name: 'Illuminate', type: 'Ability', text: 'x' }] });
  const plain = mon('Morelull');
  locked.players.p2.zones.hand.push(withAbility, plain);
  const play = (card) => command(locked, 'p2', 'moveCard', { instanceId: card.instanceId, from: 'hand', to: 'bench' });
  assert.ok(play(withAbility).error);
  assert.equal(play(plain).error ?? null, null);
});

// ── chained effects ─────────────────────────────────────────────────────────

const conditionsOf = (state, playerId) => listConditions(state.players[playerId].zones.active.find((c) => !c.attachedTo));

test('Pachirisu Overshort (sm8-80): Paralyzed only when a Tool was discarded', () => {
  const text =
    'Before doing damage, discard all Pokémon Tool cards from your opponent’s Active Pokémon. If you discarded a Pokémon Tool card in this way, this attack does 40 more damage, and your opponent’s Active Pokémon is now Paralyzed.';
  const tool = (s, { defender }) => s.players.p2.zones.active.push(trainer('Choice Band', 'Pokémon Tool', { trainerType: 'Tool', attachedTo: defender.instanceId }));
  const hit = attack(board('Pachirisu', text, { damage: '20+', setup: tool }));
  assert.equal(hit.dealt, 60);
  assert.deepEqual(conditionsOf(hit.state, 'p2'), ['Paralyzed']);
  assert.deepEqual(conditionsOf(attack(board('Pachirisu', text, { damage: '20+' })).state, 'p2'), []);
});

test('Bergmite Break Open (sm6-29) discards only the opponent’s Stadium, then Paralyzes', () => {
  const text = 'If your opponent has a Stadium card in play, discard it. If you do, your opponent’s Active Pokémon is now Paralyzed.';
  const stadium = (ownerId) => (s) => {
    s.stadium = createCard({ instanceId: 900, name: 'Po Town', supertype: 'Trainer', subtypes: ['Stadium'], ownerId });
  };
  const theirs = attack(board('Bergmite', text, { damage: '10', setup: stadium('p2') }));
  assert.equal(theirs.state.stadium, null);
  assert.deepEqual(conditionsOf(theirs.state, 'p2'), ['Paralyzed']);
  const mine = attack(board('Bergmite', text, { damage: '10', setup: stadium('p1') }));
  assert.equal(mine.state.stadium?.name, 'Po Town');
  assert.deepEqual(conditionsOf(mine.state, 'p2'), []);
});

test('Latias Mist Ball (SM135): tails discards one Fire and one Psychic Energy', () => {
  const text = 'Flip a coin. If tails, discard a Fire Energy and a Psychic Energy from this Pokémon.';
  const results = new Set(
    [7, 8, 9, 10, 11, 12].map((seed) => {
      const state = board('Latias', text, {
        damage: '110',
        setup: (s, { attacker }) => s.players.p1.zones.active.push(energy('Fire', attacker.instanceId), energy('Psychic', attacker.instanceId), energy('Water', attacker.instanceId)),
      });
      const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
      return zoneNames(res.state, 'p1', 'discard').join(',');
    })
  );
  assert.deepEqual([...results].sort(), ['', 'Basic Fire Energy,Basic Psychic Energy']);
});

test('Oricorio Kindle (sm2-14) and Hydreigon Dark Destruction (sm4-62) discard from both sides', () => {
  const energies = (s, { attacker, defender }) => {
    s.players.p1.zones.active.push(energy('Fire', attacker.instanceId), energy('Water', attacker.instanceId));
    s.players.p2.zones.active.push(energy('Grass', defender.instanceId));
  };
  const kindle = attack(board('Oricorio', 'Discard an Energy from this Pokémon. If you do, discard an Energy from your opponent’s Active Pokémon.', { damage: '30', setup: energies }));
  assert.equal(zoneNames(kindle.state, 'p1', 'discard').length, 1);
  assert.deepEqual(zoneNames(kindle.state, 'p2', 'discard'), ['Basic Grass Energy']);
  const destruction = 'You may discard an Energy from this Pokémon. If you do, discard an Energy from your opponent’s Active Pokémon.';
  const paid = attack(board('Hydreigon', destruction, { damage: '120', setup: energies }));
  assert.deepEqual(zoneNames(paid.state, 'p2', 'discard'), ['Basic Grass Energy']);
  const declined = attack(board('Hydreigon', destruction, { damage: '120', setup: energies }), (pc) => [
    (pc.options.find((o) => o.name === 'No') || pc.options[0]).instanceId,
  ]);
  assert.deepEqual(zoneNames(declined.state, 'p1', 'discard'), []);
  assert.deepEqual(zoneNames(declined.state, 'p2', 'discard'), []);
});

test('Beedrill Sudden Sting (sm4-3): Paralyzed and Poisoned only after evolving from Kakuna this turn', () => {
  const text = 'If this Pokémon evolved from Kakuna during this turn, your opponent’s Active Pokémon is now Paralyzed and Poisoned.';
  const stack = (evolvedNow) => (s, { attacker }) => {
    attacker.name = 'Weedle';
    const kakuna = mon('Kakuna', { stage: 'Stage 1', subtypes: ['Stage 1'], attachedTo: attacker.instanceId });
    const beedrill = mon('Beedrill', { stage: 'Stage 2', subtypes: ['Stage 2'], attachedTo: attacker.instanceId, attacks: attacker.attacks });
    s.players.p1.zones.active.push(kakuna, beedrill);
    if (evolvedNow) s.players.p1.flags.evolved = { [attacker.instanceId]: true };
  };
  assert.deepEqual(conditionsOf(attack(board('Weedle', text, { damage: '10', setup: stack(true) })).state, 'p2').sort(), ['Paralyzed', 'Poisoned']);
  assert.deepEqual(conditionsOf(attack(board('Weedle', text, { damage: '10', setup: stack(false) })).state, 'p2'), []);
});

// ── switches and draws ──────────────────────────────────────────────────────

const benches = (s) => {
  s.players.p1.zones.bench.push(mon('MyBench'));
  s.players.p2.zones.bench.push(mon('TheirBench'));
};
const activeName = (state, playerId) => state.players[playerId].zones.active.find((c) => !c.attachedTo)?.name;

test('Floette Swirling Petals (sm6-85) switches itself only after switching the opponent', () => {
  const text = 'Switch 1 of your opponent’s Benched Pokémon with their Active Pokémon. If you do, switch this Pokémon with 1 of your Benched Pokémon.';
  const both = attack(board('Floette', text, { setup: benches })).state;
  assert.equal(activeName(both, 'p2'), 'TheirBench');
  assert.equal(activeName(both, 'p1'), 'MyBench');
  const noTarget = attack(board('Floette', text, { setup: (s) => s.players.p1.zones.bench.push(mon('MyBench')) })).state;
  assert.equal(activeName(noTarget, 'p1'), 'Floette');
});

test('Donphan Rapid Spin (sm7-73) makes the opponent switch after it switches', () => {
  const text = 'Switch this Pokémon with 1 of your Benched Pokémon. If you do, your opponent switches their Active Pokémon with 1 of their Benched Pokémon.';
  const res = attack(board('Donphan', text, { damage: '50', setup: benches })).state;
  assert.equal(activeName(res, 'p1'), 'MyBench');
  assert.equal(activeName(res, 'p2'), 'TheirBench');
});

test('Ariados Spider Trap (sm7-6): the switched-in Active is the one left Asleep and Poisoned', () => {
  const text = 'You may switch 1 of your opponent’s Benched Pokémon with their Active Pokémon. Your opponent’s Active Pokémon is now Asleep and Poisoned.';
  const res = attack(board('Ariados', text, { setup: benches }), (pc) => [pc.options[0].instanceId ?? pc.options[0].id]).state;
  assert.equal(activeName(res, 'p2'), 'TheirBench');
  assert.deepEqual(conditionsOf(res, 'p2').sort(), ['Asleep', 'Poisoned']);
  assert.deepEqual(listConditions(res.players.p2.zones.bench.find((c) => c.name === 'Defender')), []);
});

test('Mega Delphox ex Trick Portal (customhb 434): the Pokémon switched in is Burned and Confused', () => {
  const text = "Switch in 1 of your opponent's Benched Pokémon to the Active Spot. If you do, your opponent's new Active Pokémon is now Burned and Confused.";
  const res = attack(board('Mega Delphox ex', text, { setup: benches }), (pc) => [pc.options[0].instanceId ?? pc.options[0].id]).state;
  assert.equal(activeName(res, 'p2'), 'TheirBench');
  assert.deepEqual(conditionsOf(res, 'p2').sort(), ['Burned', 'Confused']);
  assert.deepEqual(listConditions(res.players.p2.zones.bench.find((c) => c.name === 'Defender')), []);
});

test('Plusle Draw for Everybody (sm7-53) draws one card per Benched Pokémon on both sides', () => {
  const text = 'Shuffle your hand into your deck. Then, draw a card for each Benched Pokémon (both yours and your opponent’s).';
  const res = attack(board('Plusle', text, { setup: (s) => benches(s) || s.players.p2.zones.bench.push(mon('Another')) })).state;
  assert.equal(res.players.p1.zones.hand.length, 3);
});

test('Dunsparce Strike and Run (sm7-110) may switch only after benching from its search', () => {
  const text =
    'Search your deck for up to 3 Basic Pokémon and put them onto your Bench. Then, shuffle your deck. If you put any Pokémon onto your Bench in this way, you may switch this Pokémon with 1 of your Benched Pokémon.';
  const yes = (pc) => [(pc.options.find((o) => o.name === 'Yes') || pc.options[0]).instanceId ?? pc.options[0].id];
  const found = attack(board('Dunsparce', text, { setup: (s) => s.players.p1.zones.deck.push(mon('Found')) }), yes).state;
  assert.equal(activeName(found, 'p1'), 'Found');
  const none = attack(board('Dunsparce', text, { setup: (s) => s.players.p1.zones.bench.push(mon('Old')) }), yes).state;
  assert.equal(activeName(none, 'p1'), 'Dunsparce');
});

// ── searches and attaches ───────────────────────────────────────────────────

const attachedTo = (state, playerId, host) =>
  [...state.players[playerId].zones.active, ...state.players[playerId].zones.bench]
    .filter((c) => c.attachedTo === host.instanceId)
    .map((c) => c.name)
    .sort();
const deckTop = (cards) => (s) => s.players.p1.zones.deck.unshift(...cards);

test('Guzzlord-GX Eat Sloppily (sm4-63) attaches every Energy among the 5 discarded cards', () => {
  const text = 'Discard the top 5 cards of your deck. If any of those cards are Energy cards, attach them to this Pokémon.';
  const state = board('Guzzlord GX', text, { setup: deckTop([energy('Darkness'), trainer('X'), energy('Fire')]) });
  const res = attack(state);
  const guzzlord = res.state.players.p1.zones.active.find((c) => !c.attachedTo);
  assert.deepEqual(attachedTo(res.state, 'p1', guzzlord), ['Basic Darkness Energy', 'Basic Fire Energy']);
  assert.equal(res.state.players.p1.zones.discard.length, 3);
});

test('Torkoal Flaming Honk (sm7-29) attaches only the discarded Fire Energy, to any Pokémon', () => {
  const text = 'Discard the top 4 cards of your deck. If any of those cards are Fire Energy cards, attach them to your Pokémon in any way you like.';
  const setup = (s) => {
    deckTop([energy('Fire'), energy('Water'), energy('Fire')])(s);
    s.players.p1.zones.bench.push(mon('Slugma'));
  };
  const res = attack(board('Torkoal', text, { damage: '30', setup }), (pc) => [pc.options.find((o) => o.name === 'Slugma').instanceId]);
  const slugma = res.state.players.p1.zones.bench[0];
  assert.deepEqual(attachedTo(res.state, 'p1', slugma), ['Basic Fire Energy', 'Basic Fire Energy']);
  assert.ok(zoneNames(res.state, 'p1', 'discard').includes('Basic Water Energy'));
});

test('Pachirisu Snuggly Generator (sm5-49) powers only Benched Pokémon with Nuzzle', () => {
  const text =
    'For each of your Benched Pokémon that has the Nuzzle attack, search your deck for a Lightning Energy card and attach it to that Pokémon. Then, shuffle your deck.';
  const setup = (s) => {
    s.players.p1.zones.bench.push(mon('Dedenne', { attacks: [{ name: 'Nuzzle', cost: [], damage: '', text: '' }] }), mon('Plain'));
    s.players.p1.zones.deck.push(energy('Lightning'), energy('Lightning'));
  };
  const res = attack(board('Pachirisu', text, { setup }));
  const [dedenne, plain] = res.state.players.p1.zones.bench;
  assert.deepEqual(attachedTo(res.state, 'p1', dedenne), ['Basic Lightning Energy']);
  assert.deepEqual(attachedTo(res.state, 'p1', plain), []);
});

test('Delibird Happy Delivery (sm8-57) attaches a chosen Tool from the deck to each chosen Pokémon without one', () => {
  const text =
    'Choose any number of your Benched Pokémon that don’t already have a Pokémon Tool attached to them. For each of those Pokémon, search your deck for a Pokémon Tool card and attach it to that Pokémon. Then, shuffle your deck.';
  const tool = (name) => trainer(name, 'Pokémon Tool', { trainerType: 'Tool' });
  const setup = (s) => {
    const holding = mon('Holding');
    s.players.p1.zones.bench.push(mon('Empty'), holding, Object.assign(tool('Old Tool'), { attachedTo: holding.instanceId }));
    s.players.p1.zones.deck.push(tool('Choice Band'), tool('Float Stone'));
  };
  const res = attack(board('Delibird', text, { setup }), (pc) =>
    pc.max > 1 ? pc.options.map((o) => o.instanceId) : [pc.options.find((o) => o.name === 'Float Stone')?.instanceId ?? pc.options[0].instanceId]
  );
  const [empty, holding] = res.state.players.p1.zones.bench.filter((c) => !c.attachedTo);
  assert.deepEqual(attachedTo(res.state, 'p1', empty), ['Float Stone']);
  assert.deepEqual(attachedTo(res.state, 'p1', holding), ['Old Tool']);
});

test('Mawile Mining (sm7-91): an Item goes to the hand; only a Tool may be attached instead', () => {
  const text =
    'Search your deck for an Item card, reveal it, and put it into your hand. Then, shuffle your deck. If that card is a Pokémon Tool card, instead of putting it into your hand, you may attach it to 1 of your Pokémon that doesn’t already have a Pokémon Tool attached to it.';
  const pickNamed = (name) => (pc) => [(pc.options.find((o) => o.name === name || o.name === 'Yes') || pc.options[0]).instanceId];
  const potion = attack(board('Mawile', text, { setup: (s) => s.players.p1.zones.deck.push(trainer('Potion')) }), pickNamed('Potion'));
  assert.deepEqual(zoneNames(potion.state, 'p1', 'hand'), ['Potion']);
  const band = attack(
    board('Mawile', text, { setup: (s) => s.players.p1.zones.deck.push(trainer('Choice Band', 'Pokémon Tool', { trainerType: 'Tool' })) }),
    pickNamed('Choice Band')
  );
  const mawile = band.state.players.p1.zones.active.find((c) => !c.attachedTo);
  assert.deepEqual(attachedTo(band.state, 'p1', mawile), ['Choice Band']);
});

test('Alolan Marowak Dance of Flames (sm4-12) attaches one Fire Energy per opposing Energy', () => {
  const text = 'For each Energy attached to your opponent’s Pokémon, attach a Fire Energy card from your discard pile to your Pokémon in any way you like.';
  const setup = (s, { defender }) => {
    s.players.p2.zones.active.push(energy('Water', defender.instanceId), energy('Grass', defender.instanceId));
    s.players.p1.zones.discard.push(energy('Fire'), energy('Fire'), energy('Fire'));
  };
  const res = attack(board('Alolan Marowak', text, { setup }), (pc) => pc.options.slice(0, pc.min || 1).map((o) => o.instanceId));
  assert.equal(zoneNames(res.state, 'p1', 'discard').length, 1);
});

test('Heatran Steelworks (sm7-98) attaches the Metal Energy from the top 4 to one Pokémon', () => {
  const text =
    'Look at the top 4 cards of your deck and attach any number of Metal Energy cards you find there to 1 of your Pokémon. Shuffle the other cards back into your deck.';
  const res = attack(board('Heatran', text, { setup: deckTop([energy('Metal'), trainer('X'), energy('Metal'), energy('Fire')]) }), (pc) =>
    pc.options.map((o) => o.instanceId).slice(0, pc.max)
  );
  const heatran = res.state.players.p1.zones.active.find((c) => !c.attachedTo);
  assert.deepEqual(attachedTo(res.state, 'p1', heatran), ['Basic Metal Energy', 'Basic Metal Energy']);
});

test('Silcoon Cocoon Collector (sm8-25) benches Silcoon and Cascoon in any combination', () => {
  const text = 'Search your deck for up to 4 in any combination of Silcoon and Cascoon and put them onto your Bench. Then, shuffle your deck.';
  const setup = (s) => s.players.p1.zones.deck.push(mon('Silcoon'), mon('Cascoon'), mon('Wurmple'));
  const res = attack(board('Silcoon', text, { setup }), (pc) => pc.options.map((o) => o.instanceId).slice(0, pc.max));
  assert.deepEqual(zoneNames(res.state, 'p1', 'bench').sort(), ['Cascoon', 'Silcoon']);
});

// ── costs paid for damage ───────────────────────────────────────────────────

const pickAll = (pc) => pc.options.filter((o) => !/^(?:don't|no)$/i.test(o.name)).slice(0, pc.max).map((o) => o.instanceId ?? o.id);

test('Pay-for-damage attacks count what was paid (Forceful Tackle, Spirit Juggling, Pumpkin Bomb, Milk Cannon, Make a Mess)', () => {
  const tackle = attack(
    board('Mamoswine', 'You may put up to 9 damage counters on this Pokémon. This attack does 10 more damage for each damage counter you placed in this way.', { damage: '90+' }),
    (pc) => [pc.options.at(-1).instanceId]
  );
  assert.equal(tackle.dealt, 180);
  const juggling = attack(
    board('Cofagrigus', 'Discard any number of your Benched Pokémon. This attack does 30 more damage for each Benched Pokémon you discarded in this way.', {
      damage: '10+',
      setup: (s) => s.players.p1.zones.bench.push(mon('A'), mon('B')),
    }),
    pickAll
  );
  assert.equal(juggling.dealt, 70);
  const tool = (host) => trainer('Tool', 'Pokémon Tool', { trainerType: 'Tool', attachedTo: host.instanceId });
  const bomb = attack(
    board('Gourgeist', 'Before doing damage, you may discard any number of Pokémon Tool cards from your Pokémon. This attack does 40 more damage for each card you discarded in this way.', {
      damage: '10+',
      setup: (s, { attacker }) => {
        const b = mon('B');
        s.players.p1.zones.active.push(tool(attacker));
        s.players.p1.zones.bench.push(b, tool(b));
      },
    }),
    pickAll
  );
  assert.equal(bomb.dealt, 90);
  const milk = attack(
    board('Miltank', 'Reveal any number of Moomoo Milk cards in your hand. This attack does 60 damage for each card you revealed in this way.', {
      damage: '60×',
      setup: (s) => s.players.p1.zones.hand.push(trainer('Moomoo Milk'), trainer('Moomoo Milk'), trainer('Potion')),
    }),
    pickAll
  );
  assert.equal(milk.dealt, 120);
  assert.equal(milk.state.players.p1.zones.hand.length, 3, 'revealed, not discarded');
  const mess = attack(
    board('Snubbull', 'Discard up to 2 Trainer cards from your hand. This attack does 20 damage for each card you discarded in this way.', {
      damage: '20×',
      setup: (s) => s.players.p1.zones.hand.push(trainer('A'), trainer('B'), trainer('C'), mon('M')),
    }),
    pickAll
  );
  assert.equal(mess.dealt, 40);
});

// ── the opponent's hand, deck and board ─────────────────────────────────────

test('Purugly Toss Aside (sm5-109), Slowking Memory Melt (sm8-55), Nuzleaf Clear the Room (sm7-13)', () => {
  const hand = (s) => s.players.p2.zones.hand.push(trainer('A'), trainer('B'), trainer('C'), trainer('D'), trainer('Cynthia', 'Supporter'));
  const toss = attack(board('Purugly', 'Discard random cards from your opponent’s hand until they have 3 cards in their hand.', { damage: '60', setup: hand }));
  assert.equal(toss.state.players.p2.zones.discard.length, 2);
  const melt = attack(board('Slowking', 'Look at your opponent’s hand and put a card you find there in the Lost Zone.', { setup: hand }));
  assert.equal(melt.state.players.p2.zones.lostZone.length, 1);
  const room = attack(
    board('Nuzleaf', 'Your opponent reveals their hand. Choose a Supporter card you find there. Your opponent shuffles that card into their deck.', { setup: hand })
  );
  assert.ok(room.state.players.p2.zones.deck.some((c) => c.name === 'Cynthia'));
  assert.ok(!room.state.players.p2.zones.hand.some((c) => c.name === 'Cynthia'));
});

test('Watchog Scrutinize (sm2-108) discards 1 of the top 2 and leaves the other on top', () => {
  const res = attack(board('Watchog', 'Look at the top 2 cards of your opponent’s deck, discard 1 of them, and put the other card back.'), (pc) => [pc.options[1].instanceId]);
  assert.deepEqual(zoneNames(res.state, 'p2', 'discard'), ['p2 deck 1']);
  assert.ok(zoneNames(res.state, 'p2', 'hand').includes('p2 deck 0'), 'the kept card is drawn next');
});

test('Espurr Energy Teaser (sm6-44) moves an Energy off an opposing Benched Pokémon', () => {
  const setup = (s) => {
    const b = mon('Bench');
    s.players.p2.zones.bench.push(b, energy('Fire', b.instanceId));
  };
  const res = attack(board('Espurr', 'Move an Energy from 1 of your opponent’s Benched Pokémon to another of their Pokémon.', { setup }));
  const defender = res.state.players.p2.zones.active.find((c) => !c.attachedTo);
  assert.deepEqual(attachedTo(res.state, 'p2', defender), ['Basic Fire Energy']);
});

test('Tapu Lele Magical Swap (sm5-94) moves counters between the opponent’s Pokémon until Done', () => {
  let picks = 0;
  const res = attack(
    board('Tapu Lele', 'Move any number of damage counters on your opponent’s Pokémon to their other Pokémon in any way you like.', {
      setup: (s, { defender }) => {
        defender.damage = 30;
        s.players.p2.zones.bench.push(mon('Bench'));
      },
    }),
    (pc) => {
      picks += 1;
      const done = pc.options.find((o) => o.name === 'Done');
      if (done && picks > 4) return [done.instanceId];
      return [(pc.options.find((o) => (/to which/.test(pc.prompt) ? o.name === 'Bench' : o.name === 'Defender')) || pc.options[0]).instanceId];
    }
  );
  assert.equal(res.state.players.p2.zones.active.find((c) => !c.attachedTo).damage, 10);
  assert.equal(res.state.players.p2.zones.bench[0].damage, 20);
});

test('Cinccino Amazing Plea (sm4-86): the opponent’s answer decides cards or 80 damage', () => {
  const text =
    'Choose 2 cards from your discard pile. Then, ask your opponent if you may put them into your hand. If yes, put those cards into your hand. If no, this attack does 80 damage to your opponent’s Active Pokémon.';
  const setup = (s) => s.players.p1.zones.discard.push(trainer('A'), trainer('B'), trainer('C'));
  const answer = (name) => (pc) =>
    pc.options.some((o) => o.name === name) ? [pc.options.find((o) => o.name === name).instanceId] : pc.options.slice(0, pc.min).map((o) => o.instanceId);
  const yes = attack(board('Cinccino', text, { setup }), answer('Yes'));
  assert.equal(yes.dealt, 0);
  assert.deepEqual(zoneNames(yes.state, 'p1', 'hand'), ['A', 'B']);
  const no = attack(board('Cinccino', text, { setup }), answer('No'));
  assert.equal(no.dealt, 80);
  assert.deepEqual(zoneNames(no.state, 'p1', 'hand'), []);
});

test('Shining Jirachi Stellar Reign (sm3.5-42) returns every Evolution card to the hand', () => {
  const setup = (s, { defender }) => {
    defender.name = 'Charmander';
    s.players.p2.zones.active.push(
      mon('Charmeleon', { stage: 'Stage 1', subtypes: ['Stage 1'], attachedTo: defender.instanceId }),
      mon('Charizard', { stage: 'Stage 2', subtypes: ['Stage 2'], attachedTo: defender.instanceId })
    );
  };
  const text = 'If your opponent’s Active Pokémon is an evolved Pokémon, devolve it by putting all of the Evolution cards on it into your opponent’s hand.';
  const res = attack(board('Shining Jirachi', text, { damage: '10', setup }));
  assert.deepEqual(zoneNames(res.state, 'p2', 'active'), ['Charmander']);
  assert.deepEqual(zoneNames(res.state, 'p2', 'hand').filter((n) => !n.startsWith('p2 deck')).sort(), ['Charizard', 'Charmeleon']);
});

// ── spreads and Special Energy ──────────────────────────────────────────────

test('Corsola Bubble Shoot (sm7.5-27) scales with Water Energy only', () => {
  const text =
    'This attack does 20 damage times the amount of Water Energy attached to this Pokémon to 1 of your opponent’s Pokémon. (Don’t apply Weakness and Resistance for Benched Pokémon.)';
  const setup = (s, { attacker }) => s.players.p1.zones.active.push(energy('Water', attacker.instanceId), energy('Water', attacker.instanceId), energy('Fire', attacker.instanceId));
  const res = attack(board('Corsola', text, { setup }));
  assert.equal(res.state.players.p2.zones.active.find((c) => !c.attachedTo).damage, 40);
});

test('Pupitar Dust Devil (sm7-75) hits every non-Fighting Pokémon on both sides', () => {
  const setup = (s) => {
    s.players.p1.zones.bench.push(mon('Rock', { types: ['Fighting'] }), mon('Wet', { types: ['Water'] }));
  };
  const res = attack(board('Pupitar', 'This attack does 20 damage to each non-Fighting Pokémon (both yours and your opponent’s). (Don’t apply Weakness and Resistance for Benched Pokémon.)', { setup }));
  const [rock, wet] = res.state.players.p1.zones.bench;
  assert.equal(rock.damage || 0, 0);
  assert.equal(wet.damage, 20);
  assert.equal(res.state.players.p2.zones.active[0].damage, 20);
});

test('Skarmory Metallic Sound (sm1-88) and Masquerain Surprising Pattern (sm7-16) discard Special Energy', () => {
  const special = (name, host) =>
    createCard({ instanceId: 800 + host.instanceId, name, supertype: 'Energy', subtypes: ['Special'], attachedTo: host.instanceId });
  const setup = (s, { attacker, defender }) => {
    s.players.p1.zones.active.push(special('Rainbow Energy', attacker), energy('Metal', attacker.instanceId));
    s.players.p2.zones.active.push(special('Double Colorless Energy', defender), energy('Water', defender.instanceId));
  };
  const both = attack(board('Skarmory', 'Discard all Special Energy from each Pokémon.', { setup }));
  assert.deepEqual(zoneNames(both.state, 'p1', 'discard'), ['Rainbow Energy']);
  assert.deepEqual(zoneNames(both.state, 'p2', 'discard'), ['Double Colorless Energy']);
  const theirs = attack(board('Masquerain', 'Discard all Special Energy from each of your opponent’s Pokémon.', { setup }));
  assert.deepEqual(zoneNames(theirs.state, 'p1', 'discard'), []);
  assert.deepEqual(zoneNames(theirs.state, 'p2', 'discard'), ['Double Colorless Energy']);
});

test('Look-only attacks show the attacker the card without naming it to the opponent', () => {
  const looks = [
    ['Glance', 'Look at the top card of your opponent’s deck.', 'p2 deck 0'],
    ['Code Check', 'Look at 1 of your opponent’s face-down Prize cards.', 'p2 prize 0'],
    ['Searching Light', 'Look at 1 of your face-down Prize cards.', 'p1 prize 0'],
    ['Eye Opener', 'Look at your face-down Prize cards.', 'p1 prize 5'],
  ];
  for (const [name, text, hidden] of looks) {
    let res = applyCommand(board(name, text), { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
    if (/Choose a face-down/.test(res.state.pendingChoice?.prompt || '')) {
      const pc = res.state.pendingChoice;
      res = applyCommand(res.state, { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: pc.choiceId, selection: [1] } }, createRng(4));
    }
    const pc = res.state.pendingChoice;
    assert.ok(pc?.options?.[0]?.name.includes(hidden), `${name}: ${pc?.options?.[0]?.name}`);
    assert.ok(!pc.prompt.includes(hidden), `${name} prompt names the card`);
  }
});

test('Magneton Electric Blast (pkmncards Skyridge 19): all Lightning Energy, paid back as Bench counters', () => {
  const text =
    "You may discard all {L} Energy cards attached to Magneton when you use this attack. If you do, put damage counters equal to the amount of Energy cards removed in this way on any number of your opponent's Benched Pokémon in the way you like. (For example, if you discard 3 {L} Energy cards, you can put 1 damage counter on 1 of your opponent's Benched Pokémon and 2 on another.)";
  const setup = (state, { attacker }) => {
    state.players.p1.zones.active.push(energy('Lightning', attacker.instanceId), energy('Lightning', attacker.instanceId), energy('Fire', attacker.instanceId));
    state.players.p2.zones.bench.push(mon('Bench A'), mon('Bench B'));
  };
  const answer = (yes) => (pc) => {
    const option = pc.options.find((o) => o.name === (yes ? 'Yes' : 'No')) || pc.options.find((o) => o.name === 'Bench B');
    return [option.instanceId];
  };
  const paid = attack(board('Magneton', text, { setup }), answer(true)).state;
  assert.equal(paid.players.p2.zones.bench.find((c) => c.name === 'Bench B').damage, 20);
  assert.deepEqual(zoneNames(paid, 'p1', 'discard').sort(), ['Basic Lightning Energy', 'Basic Lightning Energy']);
  const declined = attack(board('Magneton', text, { setup }), answer(false)).state;
  assert.equal(declined.players.p1.zones.discard.length, 0);
  assert.ok(declined.players.p2.zones.bench.every((c) => !c.damage));
});
