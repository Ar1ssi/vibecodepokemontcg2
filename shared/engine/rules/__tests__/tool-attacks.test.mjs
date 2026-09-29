// Technical Machine helpers in rules/tool-attacks.mjs. Card texts: TCGdex effect fields
// (ex5-84, pl2-95, dp6-136, sv08-188) and pkmncards corpus rows (out/pkmn-trainer-cards.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mayAttachAnyTechnicalMachine,
  parseGrantedAttacks,
  parseTmAttachRestriction,
  tmAttachAllowed,
  toolDiscardsAtEndOfTurn,
} from '../tool-attacks.mjs';

const ANCIENT_TM_ICE =
  "Attach this card to 1 of your Evolved Pokémon (excluding Pokémon-ex and Pokémon that has an owner in its name) in play. That Pokémon may use this card's attack instead of its own. At the end of your turn, discard Ancient Technical Machine [Ice].";
const G107 =
  "Attach this card to 1 of your Pokémon SP in play. That Pokémon may use this card's attack instead of its own. When the Pokémon this card is attached to is no longer Pokémon SP, discard this card.";
const TS1 =
  "Attach this card to 1 of your Pokémon in play. That Pokémon may use this card's attack instead of its own.";
const SV_TM =
  'The Pokémon this card is attached to can use the attack on this card. (You still need the necessary Energy to use this attack.) If this card is attached to 1 of your Pokémon, discard it at the end of your turn.';
const TEAM_MAGMA_TM =
  'Attach this card to 1 of your Pokémon that has Team Magma in its name. That Pokémon may use this card’s attack instead of its own. At the end of your turn, discard Team Magma Technical Machine 01. {C} → Crushing Magma : 10 Choose an Energy card attached to the Defending Pokémon and put that card at the bottom of your opponent’s deck.';

const trainer = (name, text) => ({ name, supertype: 'Trainer', subtypes: ['Pokémon Tool'], text });

test('toolDiscardsAtEndOfTurn reads the SV TM and older TM/Cube clauses', () => {
  assert.equal(toolDiscardsAtEndOfTurn(trainer('Technical Machine: Fluorite', SV_TM)), true);
  assert.equal(toolDiscardsAtEndOfTurn(trainer('Ancient Technical Machine [Ice]', ANCIENT_TM_ICE)), true);
  assert.equal(toolDiscardsAtEndOfTurn(trainer('Technical Machine TS-1', TS1)), false);
  assert.equal(toolDiscardsAtEndOfTurn(trainer('Team Galactic’s Invention G-107', G107)), false);
  assert.equal(toolDiscardsAtEndOfTurn(null), false);
  assert.equal(
    toolDiscardsAtEndOfTurn({ name: 'Boost Energy', supertype: 'Energy', text: 'At the end of your turn, discard this card.' }),
    false,
    'Special Energy has its own sweep'
  );
});

test('parseTmAttachRestriction reads each printed TM target', () => {
  assert.deepEqual(parseTmAttachRestriction(ANCIENT_TM_ICE), {
    evolved: true,
    excludeEx: true,
    excludeOwners: true,
  });
  assert.deepEqual(parseTmAttachRestriction(G107), { sp: true });
  assert.deepEqual(parseTmAttachRestriction(TEAM_MAGMA_TM), { nameIncludes: 'team magma' });
  assert.equal(parseTmAttachRestriction(TS1), null, 'any of your Pokémon');
  assert.equal(parseTmAttachRestriction(SV_TM), null, 'SV TMs attach like any Tool');
  assert.equal(parseTmAttachRestriction(''), null);
});

test('tmAttachAllowed enforces the Ancient TM, SP and Team Magma targets', () => {
  const ancient = parseTmAttachRestriction(ANCIENT_TM_ICE);
  assert.equal(tmAttachAllowed(ancient, { top: { name: 'Kirlia' }, evolved: true }), true);
  assert.equal(tmAttachAllowed(ancient, { top: { name: 'Ralts' }, evolved: false }), false);
  assert.equal(tmAttachAllowed(ancient, { top: { name: 'Gardevoir ex' }, evolved: true }), false);
  assert.equal(tmAttachAllowed(ancient, { top: { name: "Brock's Golem" }, evolved: true }), false);

  const sp = parseTmAttachRestriction(G107);
  assert.equal(tmAttachAllowed(sp, { top: { name: 'Crobat G' } }), true);
  assert.equal(tmAttachAllowed(sp, { top: { name: 'Mismagius GL LV.X' } }), true);
  assert.equal(tmAttachAllowed(sp, { top: { name: 'Crobat' } }), false);

  const magma = parseTmAttachRestriction(TEAM_MAGMA_TM);
  assert.equal(tmAttachAllowed(magma, { top: { name: "Team Magma's Groudon" } }), true);
  assert.equal(tmAttachAllowed(magma, { top: { name: 'Groudon' } }), false);

  assert.equal(tmAttachAllowed(null, { top: { name: 'Ralts' } }), true);
  assert.equal(tmAttachAllowed(magma, { top: null }), false);
});

test('Xatu Synchronicity (Skyridge 35) lifts the TM restriction', () => {
  const xatu = {
    name: 'Xatu',
    abilities: [{ name: 'Synchronicity', text: 'You may attach any Technical Machine to Xatu.' }],
  };
  assert.equal(mayAttachAnyTechnicalMachine(xatu), true);
  assert.equal(mayAttachAnyTechnicalMachine({ name: 'Natu' }), false);
  const magma = parseTmAttachRestriction(TEAM_MAGMA_TM);
  assert.equal(tmAttachAllowed(magma, { top: xatu, mayAttachAnyTm: true }), true);
});

test('parseGrantedAttacks falls back to the corpus attack for TS-1/TS-2 (TCGdex attacks: [{}])', () => {
  const ts1 = parseGrantedAttacks({ name: 'Technical Machine TS-1', attacks: [{}], effect: TS1 });
  assert.equal(ts1.length, 1);
  assert.equal(ts1[0].name, 'Evoluter');
  assert.deepEqual(ts1[0].cost, []);
  assert.equal(ts1[0].granted, true);
  const ts2 = parseGrantedAttacks({ name: 'Technical Machine TS-2', attacks: [{}], effect: TS1 });
  assert.equal(ts2[0].name, 'Devoluter');
  assert.deepEqual(parseGrantedAttacks({ name: 'Choice Belt', text: 'The attacks of the Pokémon…' }), []);
});

test('parseGrantedAttacks splits a "Devolve …" effect off the attack name', () => {
  const [attack] = parseGrantedAttacks({
    name: 'Technical Machine: Devolution',
    text: `${SV_TM} {C} → Devolution Devolve each of your opponent’s evolved Pokémon by putting the highest Stage Evolution card on it into your opponent’s hand.`,
  });
  assert.equal(attack.name, 'Devolution');
  assert.match(attack.text, /^Devolve each/);
});
