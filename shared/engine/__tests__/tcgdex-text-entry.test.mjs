// Live-game path for BW TCGdex text (design 063, audit F1): TCGdex detail → client enrichment
// (tcgAbilityFromDetail) → buildCardStatsPayload → reduce.mjs 'cardStats' → reducer. TCGdex spells
// BW types as words and carries a few damaged rows; the readers only ever saw pkmncards symbols.
// Texts are the TCGdex `effect` strings of the cited ids (snapshot 2026-10-01, out/tcgdex-bw-*.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { tcgAbilityFromDetail, inferMissingEvolveFrom } from '../rules/rules-state.mjs';
import { isTeamPlasmaCard } from '../rules/card-markers.mjs';
import { CARD_MARKERS } from '../rules/card-markers.generated.mjs';
import { isAceSpecCard } from '../rules/card-classify.mjs';
import { abilityPlayLocks } from '../rules/ability-combat.mjs';
import { normalizeTcgdexText } from '../rules/tcgdex-text.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { buildCardStatsPayload } from '../../../client/src/setup/netcode/card-stats.js';

const DARK_CLOAK_DETAIL = {
  id: 'bw5-63',
  abilities: [
    {
      type: 'Ability',
      name: 'Dark Cloak',
      effect: 'Each of your Pokémon that has any Darkness Energy attached to it has no Retreat Cost.',
    },
  ],
};
const STICKINESS_DETAIL = {
  id: 'bw7-45',
  abilities: [
    {
      type: 'Ability',
      name: 'Stickiness',
      effect: 'The Retreat Cost of each of your opponent’s Pokémon in play is Colorless more.',
    },
  ],
};
// bw6-64 Claydol Rapid Spin, as TCGdex serves it (U+FFFD pair inside the last "Pokémon").
const RAPID_SPIN =
  'Switch this Pokémon with 1 of your Benched Pokémon. Then, your opponent switches the Defending Pokémon with 1 of his or her Benched Pok��mon.';

let nextId = 1;
const energy = (type, attachedTo) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    type: 'Energy',
    energyType: type,
    attachedTo,
  });
const pokemon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, syncInstance: nextId, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, ...extra });

// p1 Active (Retreat Cost 1, one Darkness Energy) with two Benched Pokémon; `abilityHolder` on
// the given side's Bench receives its Ability through cardStats like a live card.
function retreatBoard(holderSide, detail) {
  nextId = 1;
  const state = createGameState({ gameId: 'tcgdex-text-entry', seed: 3, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    const active = pokemon(`${playerId} Active`, { retreatCost: ['Colorless'], enteredPlayTurn: 1 });
    state.players[playerId].zones.active.push(active, energy('Darkness', active.instanceId));
    state.players[playerId].zones.bench.push(pokemon(`${playerId} Bench A`, { enteredPlayTurn: 1 }));
  }
  const holder = pokemon('Ability Holder', { enteredPlayTurn: 1 });
  state.players[holderSide].zones.bench.push(holder);
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const clientCard = { syncInstance: holder.syncInstance, hp: 100, stage: 'Basic', types: ['Darkness'], ability: tcgAbilityFromDetail(detail) };
  const res = applyCommand(state, { type: 'cardStats', playerId: holderSide, payload: buildCardStatsPayload([clientCard]) });
  assert.equal(res.error, null);
  return res.state;
}

function retreat(state) {
  const bench = state.players.p1.zones.bench.find((c) => c.name === 'p1 Bench A');
  return applyCommand(state, { type: 'retreat', playerId: 'p1', payload: { benchInstanceId: bench.instanceId } }, createRng(1));
}

const darknessStillAttached = (state) =>
  [...state.players.p1.zones.active, ...state.players.p1.zones.bench].some(
    (c) => c.supertype === 'Energy' && c.attachedTo != null
  );

test('Darkrai-EX Dark Cloak (bw5-63) TCGdex text: a Pokémon with Darkness Energy retreats for free', () => {
  const res = retreat(retreatBoard('p1', DARK_CLOAK_DETAIL));
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice ?? null, null);
  assert.equal(darknessStillAttached(res.state), true, 'the Darkness Energy is not discarded');
  assert.equal(res.state.players.p1.zones.discard.length, 0);
});

test('Jellicent Stickiness (bw7-45) TCGdex text: the opponent pays one more Colorless to retreat', () => {
  const res = retreat(retreatBoard('p2', STICKINESS_DETAIL));
  assert.ok(res.error, 'Retreat Cost 1 + Stickiness 1 = 2 with only 1 Energy attached');
  assert.match(String(res.reason || res.error), /retreat/i);
});

test('cardStats normalizes attack text: Claydol Rapid Spin (bw6-64) keeps its opponent switch', () => {
  nextId = 1;
  const state = createGameState({ gameId: 'tcgdex-text-entry', seed: 3, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'p1', zones: createPlayerZones(), flags: {} };
  const claydol = pokemon('Claydol');
  state.players.p1.zones.active.push(claydol);
  const payload = { stats: [{ syncInstance: claydol.syncInstance, attacks: [{ name: 'Rapid Spin', cost: ['Colorless', 'Colorless'], damage: 30, text: RAPID_SPIN }] }] };
  const res = applyCommand(state, { type: 'cardStats', playerId: 'p1', payload });
  const text = res.state.players.p1.zones.active[0].attacks[0].text;
  assert.doesNotMatch(text, /�/);
  const steps = parseAttackSteps(text, { selfName: 'Claydol' });
  assert.ok([...steps.before, ...steps.after].some((s) => s.type === 'atkGust'), 'opponent switch parsed');
});

test('normalizeTcgdexText: type words, encoding damage and typos become the corpus notation', () => {
  // bw7-45 Stickiness, bw5-109 Gardevoir Psychic Mirage, bw2-25 Basculin Splatter, bw4-12 Arcanine.
  assert.equal(
    normalizeTcgdexText('The Retreat Cost of each of your opponent’s Pokémon in play is Colorless more.'),
    'The Retreat Cost of each of your opponent’s Pokémon in play is {C} more.'
  );
  assert.equal(
    normalizeTcgdexText('Each basic Psychic Energy attached to your Psychic Pokémon provides PsychicPsychic Energy.'),
    'Each basic {P} Energy attached to your {P} Pokémon provides {P}{P} Energy.'
  );
  assert.equal(
    normalizeTcgdexText("Does 30 damage to one of your oppoent's Pokémon."),
    "Does 30 damage to one of your opponent's Pokémon."
  );
  assert.equal(
    normalizeTcgdexText('(even if this Pokémon is Knocked Out),the Attacking Pokémon is now Burned.'),
    '(even if this Pokémon is Knocked Out), the Attacking Pokémon is now Burned.'
  );
  assert.equal(normalizeTcgdexText(RAPID_SPIN).endsWith('Benched Pokémon.'), true);
});

test('normalizeTcgdexText leaves symbol text, names and non-strings alone', () => {
  // sv01-086 Gardevoir ex prints symbols already; card names keep their type words.
  const modern = 'As often as you like during your turn, you may attach a Basic {P} Energy card from your discard pile to 1 of your {P} Pokémon.';
  assert.equal(normalizeTcgdexText(modern), modern);
  assert.equal(normalizeTcgdexText(normalizeTcgdexText(RAPID_SPIN)), normalizeTcgdexText(RAPID_SPIN));
  assert.equal(normalizeTcgdexText('Search your deck for Fire Crystal.'), 'Search your deck for Fire Crystal.');
  assert.equal(normalizeTcgdexText("This Pokémon's Water Gun attack does 20 more damage."), "This Pokémon's Water Gun attack does 20 more damage.");
  assert.equal(normalizeTcgdexText(null), null);
  assert.equal(normalizeTcgdexText(''), '');
  assert.equal(normalizeTcgdexText(7), 7);
});

// Team Plasma (audit F2): live server cards carry only identity; the D200 table answers by id.
test('isTeamPlasmaCard reads the printed-marker table by TCGdex id', () => {
  assert.equal(isTeamPlasmaCard({ id: 'bw8-101', name: 'Snorlax' }), true); // Plasma Storm Snorlax
  assert.equal(isTeamPlasmaCard({ id: 'bw1-1', name: 'Snivy' }), false);
  assert.equal(isTeamPlasmaCard({ name: 'Snorlax' }), false, 'no id, no subtype: not Team Plasma');
  assert.equal(isTeamPlasmaCard({ name: 'Snorlax', subtypes: ['Basic', 'Team Plasma'] }), true);
  assert.equal(isTeamPlasmaCard({ name: 'Plasma Energy' }), true, 'bw8-127 Plasma Energy by name');
  assert.equal(isTeamPlasmaCard(null), false);
});

// ACE SPEC (audit F3): pkmncards `is:ace-spec` lists 13 BW printings; TCGdex rarity is "Rare".
const BW_ACE_SPEC = ['bw7-137', 'bw7-138', 'bw7-139', 'bw7-140', 'bw8-128', 'bw8-129', 'bw8-130', 'bw9-107', 'bw9-108', 'bw10-92', 'bw10-93', 'bw10-94', 'bw10-95'];

test('the 13 BW ACE SPEC printings are ACE SPEC on a live card', () => {
  for (const id of BW_ACE_SPEC) assert.ok(CARD_MARKERS[id]?.includes('ACE SPEC'), id);
  assert.equal(isAceSpecCard({ id: 'bw7-137', name: 'Computer Search', rarity: 'Rare' }), true);
  assert.equal(isAceSpecCard({ id: 'bw1-92', name: 'Energy Retrieval', rarity: 'Uncommon' }), false);
});

test('Spiritomb Sealing Scream (bw11-87) stops a BW ACE SPEC for both players', () => {
  const spiritomb = createCard({
    instanceId: 900,
    name: 'Spiritomb',
    supertype: 'Pokémon',
    abilities: [{ name: 'Sealing Scream', text: normalizeTcgdexText('Each player can’t play any ACE SPEC cards from his or her hand.') }],
  });
  const computerSearch = createCard({ instanceId: 901, id: 'bw7-137', name: 'Computer Search', type: 'Trainer', trainerType: 'Item' });
  const potion = createCard({ instanceId: 902, id: 'bw1-100', name: 'Potion', type: 'Trainer', trainerType: 'Item' });
  assert.ok(abilityPlayLocks(computerSearch, { sideCards: [], opponentSideCards: [spiritomb], opponentActive: [spiritomb] }));
  assert.ok(abilityPlayLocks(computerSearch, { sideCards: [spiritomb], sideActive: [spiritomb] }), 'each player');
  assert.equal(abilityPlayLocks(potion, { sideCards: [], opponentSideCards: [spiritomb], opponentActive: [spiritomb] }), null);
});

// Raichu bwp-BW78: TCGdex has stage Stage1 and no evolveFrom; bw4-40 Raichu evolves from Pikachu.
test('inferMissingEvolveFrom takes evolveFrom from another printing of the same name and stage', async () => {
  const details = {
    'bw4-40': { id: 'bw4-40', name: 'Raichu', category: 'Pokemon', stage: 'Stage1', evolveFrom: 'Pikachu' },
    'bwp-BW78': { id: 'bwp-BW78', name: 'Raichu', category: 'Pokemon', stage: 'Stage1' },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const body = /\/cards\?name=Raichu$/.test(u)
      ? [{ id: 'bwp-BW78', name: 'Raichu' }, { id: 'bw4-40', name: 'Raichu' }]
      : details[decodeURIComponent(u.split('/cards/')[1] || '')] ?? null;
    return { ok: body != null, status: body ? 200 : 404, json: async () => body };
  };
  try {
    assert.equal(await inferMissingEvolveFrom(details['bwp-BW78']), 'Pikachu');
    assert.equal(await inferMissingEvolveFrom(details['bw4-40']), 'Pikachu', 'own value wins');
    assert.equal(await inferMissingEvolveFrom({ id: 'x', name: 'Raichu', category: 'Pokemon', stage: 'Basic' }), null);
    assert.equal(await inferMissingEvolveFrom({ id: 'y', name: 'Nobody', category: 'Pokemon', stage: 'Stage1' }), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// bwp-BW71 Terrakion Justified, TCGdex text. With the type word unread the +50 applied to every
// defender (a wrong read, not a missing one); as {D} it applies to Darkness Pokémon only.
test('Terrakion Justified (bwp-BW71) TCGdex text adds 50 only against a Darkness Pokémon', () => {
  const dealt = (defenderType) => {
    nextId = 1;
    const state = createGameState({ gameId: 'tcgdex-text-entry', seed: 3, rulesEnabled: true });
    for (const playerId of ['p1', 'p2']) {
      state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    }
    const terrakion = pokemon('Terrakion', { enteredPlayTurn: 1, attacks: [{ name: 'Hit', cost: [], damage: '60', text: '' }] });
    const defender = pokemon('Defender', { hp: 300, types: [defenderType], enteredPlayTurn: 1 });
    state.players.p1.zones.active.push(terrakion);
    state.players.p2.zones.active.push(defender);
    state.players.p2.zones.bench.push(pokemon('Spare', { enteredPlayTurn: 1 }));
    state.turn = { player: 'p1', number: 5, phase: 'main' };
    const ability = tcgAbilityFromDetail({
      id: 'bwp-BW71',
      abilities: [{ type: 'Ability', name: 'Justified', effect: "Each of this Pokémon's attacks does 50 more damage to Darkness Pokémon (before applying Weakness and Resistance)." }],
    });
    const stats = applyCommand(state, { type: 'cardStats', playerId: 'p1', payload: buildCardStatsPayload([{ syncInstance: terrakion.syncInstance, hp: 130, stage: 'Basic', types: ['Fighting'], ability }]) });
    const res = applyCommand(stats.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(1));
    assert.equal(res.error, null);
    return res.events.filter((e) => e.type === 'attackExecuted').pop()?.damage;
  };
  assert.equal(dealt('Water'), 60);
  assert.equal(dealt('Darkness'), 110);
});
