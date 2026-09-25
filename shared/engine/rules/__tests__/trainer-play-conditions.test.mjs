// Design 035 slice 11 (I135d): card-printed play conditions. Card texts are verbatim from
// the trainer corpus (out/pkmn-trainer-cards.json); each condition is parsed, gated by the
// pure trainerPlayBlockReason, and enforced by the server's playTrainer legality check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { applyCommand } from '../../reduce.mjs';
import { parseTrainerEffect } from '../trainer-effects.mjs';
import { trainerPlayBlockReason } from '../trainer-play-conditions.mjs';

const TEXTS = {
  Fantina:
    'You can use this card only if you have 10 or more cards in the Lost Zone. Choose 1 of your opponent’s Benched Pokémon. Discard that Pokémon and all attached cards.',
  'Mirage Gate':
    'You can use this card only if you have 7 or more cards in the Lost Zone. Search your deck for up to 2 basic Energy cards of different types and attach them to your Pokémon in any way you like. Then, shuffle your deck.',
  Bonnie:
    'You can play this card only if there is any Stadium card in play. Discard any Stadium card in play. Search your deck for up to 2 Pokémon, reveal them, and put them into your hand. Shuffle your deck afterward.',
  Nita: 'You can play this card only if your opponent’s Active Pokémon is a Basic Pokémon. Draw 3 cards.',
  Evelyn: 'You can play this card only if your opponent’s Active Pokémon is a Stage 1 Pokémon. Draw 3 cards.',
  Dana: 'You can play this card only if your opponent’s Active Pokémon is a Stage 2 Pokémon. Draw 3 cards.',
  Atticus:
    'You can use this card only if your opponent’s Active Pokémon is Poisoned. Draw 3 cards.',
  Raihan:
    'You can play this card only if any of your Pokémon were Knocked Out during your opponent’s last turn. Attach a basic Energy card from your discard pile to 1 of your Pokémon. If you do, search your deck for a card and put it into your hand. Then, shuffle your deck.',
  Morty:
    'You can play this card only if 1 of your {P} Pokémon was Knocked Out during your opponent’s last turn. Draw 3 cards.',
  'Team Rocket’s Archer':
    'You can use this card only if any of your Team Rocket’s Pokémon were Knocked Out during your opponent’s last turn. Each player shuffles their hand into their deck. Then, you draw 5 cards, and your opponent draws 3 cards.',
  'Single Strike Style Mustard':
    'You can play this card only when it is the last card in your hand. Search your deck for up to 2 cards and put them into your hand. Then, shuffle your deck.',
  'Blaine’s Last Resort':
    'You can’t play this card if you have any cards in your hand other than Blaine’s Last Resort. Draw 5 cards.',
  'Erika’s Hospitality':
    'You can play this card only if you have 4 or fewer other cards in your hand. Draw a card for each of your opponent’s Pokémon in play.',
  'Mail from Bill':
    'You can’t play this card if you have 5 or more cards in your hand (including this one). Look at the top 5 cards of your deck.',
  Kamado:
    'Choose a card in your hand, and discard the other cards. If you do, draw 4 cards. (If you have no other cards in your hand, you can’t use this card.)',
  Briar:
    'You can use this card only if your opponent has exactly 2 Prize cards remaining. During this turn, if your opponent’s Active Pokémon is Knocked Out by damage from an attack used by your Tera Pokémon, take 1 more Prize card.',
  'Beast Ring':
    'You can play this card only if your opponent has exactly 3 or 4 Prize cards remaining. Search your deck for up to 2 basic Energy cards and attach them to 1 of your Ultra Beasts.',
  'Ace Trainer':
    'You can play this card only if you have more Prize cards left than your opponent. Each player shuffles his or her hand into his or her deck. Then, you draw 6 cards, and your opponent draws 3 cards.',
  'Call Bell':
    'You can use this card only if you go second, and only during your first turn. Search your deck for a Supporter card, reveal it, and put it into your hand. Then, shuffle your deck.',
  Carmine:
    'If you go first, you may use this card during your first turn. Discard your hand and draw 5 cards.',
  Beauty: 'If you go first, you may play this card during your first turn. Draw 2 cards.',
  'Battle VIP Pass':
    'You can use this card only during your first turn. Search your deck for up to 2 Basic Pokémon and put them onto your Bench. Then, shuffle your deck.',
};

const trainer = (name, trainerType = 'Supporter') => ({ name, type: 'Trainer', trainerType, text: TEXTS[name] });
const base = { turnNumber: 5, myPrizes: 6, opponentPrizes: 6, handCount: 3 };
const blocked = (name, params, trainerType) =>
  trainerPlayBlockReason({ ...base, ...params, card: trainer(name, trainerType) });

test('parsePlayCondition: every slice 11 wording maps to one condition', () => {
  const expected = {
    Fantina: 'lostZone>=10',
    'Mirage Gate': 'lostZone>=7',
    Bonnie: 'stadiumInPlay',
    Nita: 'opponentActiveStage=Basic',
    Evelyn: 'opponentActiveStage=Stage 1',
    Dana: 'opponentActiveStage=Stage 2',
    Atticus: 'opponentActivePoisoned',
    Raihan: 'koedLastTurn',
    Morty: 'koedLastTurn:type=p',
    'Team Rocket’s Archer': "koedLastTurn:name=team rocket's",
    'Single Strike Style Mustard': 'lastCardInHand',
    'Blaine’s Last Resort': 'onlyCopiesInHand',
    'Erika’s Hospitality': 'handCount<=5',
    'Mail from Bill': 'handCount<=4',
    Kamado: 'handCount>=2',
    Briar: 'opponentPrizes==2',
    'Beast Ring': 'opponentPrizes==3|4',
    'Ace Trainer': 'morePrizesThanOpponent',
    'Call Bell': 'secondPlayerFirstTurn',
    'Battle VIP Pass': 'firstTurnOnly',
  };
  for (const [name, condition] of Object.entries(expected)) {
    assert.equal(parseTrainerEffect(TEXTS[name]).playCondition, condition, name);
  }
  assert.equal(parseTrainerEffect('Draw 3 cards.').playCondition, undefined);
  assert.equal(parseTrainerEffect('').playCondition, undefined);
});

test('lostZone>=N gates on the Lost Zone size', () => {
  assert.match(blocked('Mirage Gate', { lostZoneCount: 6 }, 'Item'), /7 or more/);
  assert.equal(blocked('Mirage Gate', { lostZoneCount: 7 }, 'Item'), null);
  assert.match(blocked('Fantina', { lostZoneCount: 9 }), /10 or more/);
  assert.equal(blocked('Fantina', { lostZoneCount: 12 }), null);
  // Unknown to the caller (playtest bot): the server stays the authority.
  assert.equal(blocked('Fantina', {}), null);
});

test('stadiumInPlay needs a Stadium', () => {
  assert.match(blocked('Bonnie', { stadiumName: null }), /Stadium/);
  assert.equal(blocked('Bonnie', { stadiumName: 'Path to the Peak' }), null);
});

test("opponent's Active stage and Poisoned gates", () => {
  const basic = { name: 'Pikachu', stage: 'Basic' };
  const stage1 = { name: 'Raichu', stage: 'Stage 1' };
  const stage2 = { name: 'Charizard', subtypes: ['Stage 2'] };
  assert.equal(blocked('Nita', { opponentActive: basic }), null);
  assert.match(blocked('Nita', { opponentActive: stage1 }), /Basic Pokémon/);
  assert.equal(blocked('Evelyn', { opponentActive: stage1 }), null);
  assert.match(blocked('Evelyn', { opponentActive: stage2 }), /Stage 1/);
  assert.equal(blocked('Dana', { opponentActive: stage2 }), null);
  assert.match(blocked('Dana', { opponentActive: null }), /Stage 2/);
  assert.equal(blocked('Dana', {}), null);
  assert.match(blocked('Atticus', { opponentActive: basic }), /Poisoned/);
  assert.equal(blocked('Atticus', { opponentActive: { ...basic, poisoned: true } }), null);
});

test("KO'd-last-turn gates, including typed and Team Rocket's victims", () => {
  assert.match(blocked('Raihan', { koedLastOppTurn: false }), /Knocked Out/);
  assert.equal(blocked('Raihan', { koedLastOppTurn: true }), null);
  const psychic = { name: 'Gardevoir', types: ['Psychic'] };
  const rocket = { name: 'Team Rocket’s Mewtwo ex', types: ['Psychic'] };
  const fire = { name: 'Charizard', types: ['Fire'] };
  assert.match(blocked('Morty', { koedLastOppTurn: true, koedLastOppTurnVictims: [fire] }), /Knocked Out/);
  assert.equal(blocked('Morty', { koedLastOppTurn: true, koedLastOppTurnVictims: [fire, psychic] }), null);
  assert.match(
    blocked('Team Rocket’s Archer', { koedLastOppTurn: true, koedLastOppTurnVictims: [psychic] }),
    /Knocked Out/
  );
  assert.equal(blocked('Team Rocket’s Archer', { koedLastOppTurn: true, koedLastOppTurnVictims: [rocket] }), null);
});

test('last card and hand-size gates count the Trainer itself', () => {
  assert.equal(blocked('Single Strike Style Mustard', { handCount: 1 }), null);
  assert.match(blocked('Single Strike Style Mustard', { handCount: 2 }), /last card/);
  assert.equal(blocked('Erika’s Hospitality', { handCount: 5 }), null);
  assert.match(blocked('Erika’s Hospitality', { handCount: 6 }), /too many/);
  assert.equal(blocked('Mail from Bill', { handCount: 4 }, 'Item'), null);
  assert.match(blocked('Mail from Bill', { handCount: 5 }, 'Item'), /too many/);
  assert.match(blocked('Kamado', { handCount: 1 }), /other cards/);
  assert.equal(blocked('Kamado', { handCount: 2 }), null);
});

test('exactly-N prize, prizes-left and first-turn gates', () => {
  assert.equal(blocked('Briar', { opponentPrizes: 2 }), null);
  assert.match(blocked('Briar', { opponentPrizes: 3 }), /exactly 2/);
  assert.equal(blocked('Beast Ring', { opponentPrizes: 4 }, 'Item'), null);
  assert.match(blocked('Beast Ring', { opponentPrizes: 5 }, 'Item'), /exactly 3 or 4/);
  assert.match(blocked('Ace Trainer', { myPrizes: 3, opponentPrizes: 4 }), /more Prize/);
  assert.equal(blocked('Ace Trainer', { myPrizes: 5, opponentPrizes: 4 }), null);
  assert.equal(blocked('Call Bell', { turnNumber: 2 }, 'Item'), null);
  assert.match(blocked('Call Bell', { turnNumber: 1 }, 'Item'), /go second/);
  assert.match(blocked('Call Bell', { turnNumber: 4 }, 'Item'), /go second/);
  assert.equal(blocked('Battle VIP Pass', { turnNumber: 1 }, 'Item'), null);
  assert.match(blocked('Battle VIP Pass', { turnNumber: 3 }, 'Item'), /first turn/);
});

let nextId = 7100;
const card = (props) => createCard({ instanceId: nextId++, ...props });

function game() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  for (const id of ['p1', 'p2']) {
    for (let i = 0; i < 6; i++) {
      state.players[id].zones.prizes.push(card({ name: `${id} prize ${i}` }));
      state.players[id].zones.deck.push(card({ name: `${id} deck ${i}` }));
    }
  }
  state.players.p1.zones.active.push(card({ name: 'Ralts', supertype: 'Pokémon', hp: 70, types: ['Psychic'] }));
  return state;
}

const play = (state, trainerCard) => {
  state.players.p1.zones.hand.push(trainerCard);
  return applyCommand(state, { type: 'playTrainer', payload: { instanceId: trainerCard.instanceId }, playerId: 'p1' });
};

test('server enforces Lost Zone, opponent-Active and KO gates on playTrainer', () => {
  const lz = game();
  lz.players.p2.zones.active.push(card({ name: 'Pikachu', supertype: 'Pokémon', hp: 60 }));
  const gate = card({ name: 'Mirage Gate', type: 'Trainer', trainerType: 'Item', text: TEXTS['Mirage Gate'] });
  assert.match(play(lz, gate).error || '', /Lost Zone/);
  const ok = game();
  ok.players.p1.zones.lostZone = Array.from({ length: 7 }, (_, i) => card({ name: `lz ${i}` }));
  ok.players.p2.zones.active.push(card({ name: 'Pikachu', supertype: 'Pokémon', hp: 60 }));
  const gate2 = card({ name: 'Mirage Gate', type: 'Trainer', trainerType: 'Item', text: TEXTS['Mirage Gate'] });
  assert.equal(play(ok, gate2).error, null);

  // Evolved opponent: the stage comes from the top of the stack.
  const evolved = game();
  const root = card({ name: 'Pichu', supertype: 'Pokémon', hp: 60, stage: 'Basic' });
  evolved.players.p2.zones.active.push(root, card({ name: 'Raichu', supertype: 'Pokémon', hp: 120, stage: 'Stage 1', attachedTo: root.instanceId }));
  const nita = card({ name: 'Nita', type: 'Trainer', trainerType: 'Supporter', text: TEXTS.Nita });
  assert.match(play(evolved, nita).error || '', /Basic Pokémon/);
  const evelyn = card({ name: 'Evelyn', type: 'Trainer', trainerType: 'Supporter', text: TEXTS.Evelyn });
  assert.equal(play(evolved, evelyn).error, null);

  const koed = game();
  koed.players.p2.zones.active.push(card({ name: 'Pikachu', supertype: 'Pokémon', hp: 60 }));
  koed.players.p1.flags = { ...koed.players.p1.flags, koedLastOppTurn: true, koedLastOppTurnVictims: [{ name: 'Charmander', types: ['Fire'] }] };
  const morty = card({ name: 'Morty', type: 'Trainer', trainerType: 'Supporter', text: TEXTS.Morty });
  assert.match(play(koed, morty).error || '', /Knocked Out/);
});

test("a KO on the opponent's turn records the victim for the victim's next turn", () => {
  const state = game();
  state.players.p1.zones.active[0].attacks = [{ name: 'Psyshot', cost: [], damage: 200 }];
  const victim = card({ name: 'Gardevoir', supertype: 'Pokémon', hp: 100, types: ['Psychic'] });
  state.players.p2.zones.active.push(victim);
  state.players.p2.zones.bench.push(card({ name: 'Kirlia', supertype: 'Pokémon', hp: 80, types: ['Psychic'] }));
  const result = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(result.error, null);
  const flags = result.state.players.p2.flags;
  // The attack ended p1's turn, so the record has already rolled into p2's turn flags.
  assert.equal(result.state.turn.player, 'p2');
  assert.equal(flags.koedLastOppTurn, true);
  assert.deepEqual(flags.koedLastOppTurnVictims, [{ name: 'Gardevoir', types: ['Psychic'] }]);
});

// Design 038 row 16 (I148): other copies of Blaine's Last Resort do not block it.
test("Blaine's Last Resort allows its own copies, blocks any other card, skips an unknown hand", () => {
  const name = 'Blaine’s Last Resort';
  assert.equal(blocked(name, { handCount: 2, handNames: [name, name] }), null);
  assert.equal(blocked(name, { handCount: 2, handNames: [name, "Blaine's Last Resort"] }), null);
  assert.match(blocked(name, { handCount: 2, handNames: [name, 'Pikachu'] }), /other than/);
  assert.equal(blocked(name, { handCount: 4, handNames: null }), null);

  const twoCopies = game();
  twoCopies.players.p1.zones.hand.push(card({ name, type: 'Trainer', trainerType: 'Supporter', text: TEXTS[name] }));
  const blaine = card({ name, type: 'Trainer', trainerType: 'Supporter', text: TEXTS[name] });
  assert.equal(play(twoCopies, blaine).error, null);

  const withOther = game();
  withOther.players.p1.zones.hand.push(card({ name: 'Pikachu', supertype: 'Pokémon', hp: 60 }));
  const blaine2 = card({ name, type: 'Trainer', trainerType: 'Supporter', text: TEXTS[name] });
  assert.match(play(withOther, blaine2).error || '', /other than/);
});

// Design 038 row 17 (I149): "If you go first, you may use this card during your first turn".
test('first-turn permission Supporters are playable on turn 1; plain Supporters are not', () => {
  assert.equal(parseTrainerEffect(TEXTS.Carmine).turnOnePermission, true);
  assert.equal(parseTrainerEffect(TEXTS.Beauty).turnOnePermission, true);
  assert.equal(parseTrainerEffect(TEXTS.Nita).turnOnePermission, undefined);
  assert.equal(blocked('Carmine', { turnNumber: 1 }), null);
  assert.equal(blocked('Carmine', { turnNumber: 2 }), null);
  assert.equal(blocked('Beauty', { turnNumber: 1 }), null);
  assert.match(blocked('Kamado', { turnNumber: 1 }), /turn 1/);

  const first = game();
  first.turn.number = 1;
  const carmine = card({ name: 'Carmine', type: 'Trainer', trainerType: 'Supporter', text: TEXTS.Carmine });
  assert.equal(play(first, carmine).error, null);
});
