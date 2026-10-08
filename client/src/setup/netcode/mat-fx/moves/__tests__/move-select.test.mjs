import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSE_STAT_GAP,
  coinFor,
  hashString,
  moveFor,
  statClassFor,
  tierFor,
  vgTypeFor,
} from '../move-select.mjs';

test('tierFor: 12 rule-box name forms are tier 3 even when printed Basic', () => {
  const kinds = {
    mega: { name: 'Mega Gengar ex', stage: 'Basic' },
    legacyMega: { name: 'M Lucario-EX' },
    ex: { name: 'Pikachu ex', stage: 'Basic' },
    v: { name: 'Zacian V', stage: 'Basic' },
    vmax: { name: 'Zacian VMAX', stage: 'Basic' },
    vstar: { name: 'Arceus VSTAR' },
    gx: { name: 'Lucario-GX', stage: 'Basic' },
    tagTeam: { name: 'Pikachu & Zekrom-GX' },
    legend: { name: 'Ho-Oh LEGEND' },
    vunion: { name: 'Zacian V-UNION' },
    prism: { name: 'Mew ◇', stage: 'Basic' },
    radiant: { name: 'Radiant Greninja', stage: 'Basic' },
  };
  for (const [kind, card] of Object.entries(kinds)) {
    assert.equal(tierFor(card), 3, kind);
  }
});

test('tierFor: stage literals', () => {
  assert.equal(tierFor({ name: 'Pidgey', stage: 'Basic' }), 1);
  assert.equal(tierFor({ name: 'Pidgeotto', stage: 'Stage 1' }), 2);
  assert.equal(tierFor({ name: 'Pidgeotto', stage: 'Stage1' }), 2);
  assert.equal(tierFor({ name: 'Pidgeot', stage: 'Stage 2' }), 3);
  assert.equal(tierFor({ name: 'Golurk', stage: 'break' }), 3);
  assert.equal(tierFor({ name: 'Garchomp ex', stage: 'Stage 2 ex' }), 3);
  assert.equal(tierFor({ name: 'Eevee', subtypes: ['Stage 1'] }), 2);
  assert.equal(tierFor({ name: 'Pichu', stage: 'Baby' }), 1);
  assert.equal(tierFor({ name: 'Fossil', stage: 'Restored' }), 1);
  assert.equal(tierFor({ name: 'Mystery' }), 1);
  assert.equal(tierFor(null), 1);
});

test('statClassFor: gap at the limit is the coin, above it is fixed', () => {
  assert.equal(CLOSE_STAT_GAP, 10);
  const stats = (atk, spa) => ({ atk, spa });
  assert.equal(statClassFor(stats(100, 90), 'special'), 'special');
  assert.equal(statClassFor(stats(100, 90), 'physical'), 'physical');
  assert.equal(statClassFor(stats(130, 130), 'special'), 'special');
  assert.equal(statClassFor(stats(101, 90), 'special'), 'physical');
  assert.equal(statClassFor(stats(90, 101), 'physical'), 'special');
  assert.equal(statClassFor(null, 'special'), 'special');
  assert.equal(statClassFor({ atk: NaN, spa: 5 }, 'physical'), 'physical');
});

test('coinFor: deterministic, both outcomes occur', () => {
  const seen = new Set();
  for (let id = 0; id < 40; id += 1) {
    const first = coinFor(id);
    for (let i = 0; i < 100; i += 1) assert.equal(coinFor(id), first);
    assert.equal(coinFor(String(id)), first);
    seen.add(first);
  }
  assert.deepEqual([...seen].sort(), ['physical', 'special']);
  assert.ok(['physical', 'special'].includes(coinFor(undefined)));
});

test('hashString: FNV-1a vectors', () => {
  assert.equal(hashString(''), 0x811c9dc5);
  assert.equal(hashString('a'), 0xe40c292c);
  assert.equal(hashString(undefined), 0x811c9dc5);
});

test('vgTypeFor: family resolution per TCG type', () => {
  const typed = (tcg, ...types) => vgTypeFor({ types: [tcg] }, { types });
  assert.equal(typed('Colorless', 'normal', 'flying'), 'flying');
  assert.equal(typed('Colorless', 'normal'), 'normal');
  assert.equal(typed('Colorless', 'dragon', 'flying'), 'dragon');
  assert.equal(vgTypeFor({ types: ['Colorless'] }, null), 'normal');
  assert.equal(typed('Darkness', 'fire', 'flying'), 'dark');
  assert.equal(typed('Grass', 'bug', 'flying'), 'bug');
  assert.equal(typed('Grass', 'poison', 'bug'), 'bug');
  assert.equal(typed('Grass', 'normal'), 'grass');
  assert.equal(typed('Water', 'ice'), 'ice');
  assert.equal(typed('Psychic', 'ghost'), 'ghost');
  assert.equal(typed('Fighting', 'rock', 'ground'), 'rock');
  assert.equal(typed('Fire', 'water'), 'fire');
  assert.equal(vgTypeFor({ types: ['Lightning'] }, null), 'electric');
  assert.equal(vgTypeFor({ types: ['Metal'] }, null), 'steel');
  assert.equal(vgTypeFor({ types: ['Fairy'] }, null), 'fairy');
  assert.equal(vgTypeFor({ types: ['Bogus'] }, null), 'normal');
  assert.equal(vgTypeFor({}, null), 'normal');
  assert.equal(vgTypeFor(null, null), 'normal');
});

const attack = { instanceId: 7, attackName: 'Tackle', damage: 30 };

test('moveFor: Colorless Snorlax is null, Colorless Pidgeot is flying', () => {
  const colorless = { name: 'X', types: ['Colorless'], stage: 'Basic' };
  const snorlax = { atk: 110, spa: 65, types: ['normal'] };
  const pidgeot = { atk: 80, spa: 70, types: ['normal', 'flying'] };
  assert.equal(moveFor(colorless, { ...attack, species: snorlax }), null);
  assert.equal(
    moveFor(colorless, { ...attack, species: pidgeot }).vgType,
    'flying'
  );
});

test('moveFor: Darkness Charizard ex is dark, tier 3, special by stats', () => {
  const card = { name: 'Charizard ex', types: ['Darkness'], stage: 'Stage 2' };
  const species = { atk: 84, spa: 109, types: ['fire', 'flying'] };
  const pick = moveFor(card, { ...attack, species });
  assert.equal(pick.vgType, 'dark');
  assert.equal(pick.tier, 3);
  assert.equal(pick.statClass, 'special');
  assert.equal(pick.move, 'dark-pulse');
});

test('moveFor: same inputs give the same result x100; attack names can differ', () => {
  const card = { name: 'Blastoise ex', types: ['Water'] };
  const species = { atk: 83, spa: 100, types: ['water'] };
  const first = moveFor(card, { ...attack, species });
  for (let i = 0; i < 100; i += 1) {
    assert.deepEqual(moveFor(card, { ...attack, species }), first);
  }
  const moves = new Set(
    ['Surf', 'Hydro', 'Splash', 'Cannon', 'Blast', 'Jet', 'Wave', 'Gush'].map(
      (attackName) => moveFor(card, { ...attack, species, attackName }).move
    )
  );
  assert.ok(moves.size > 1);
  for (const move of moves) {
    assert.ok(
      ['water-pledge', 'hydro-cannon', 'hydro-pump', 'surf'].includes(move),
      move
    );
  }
});

test('moveFor: zero damage without bench damage is null; bench damage plays a move', () => {
  const card = { name: 'Charmander', types: ['Fire'], stage: 'Basic' };
  assert.equal(moveFor(card, { ...attack, damage: 0 }), null);
  assert.equal(moveFor(card, { ...attack, damage: 0, benchDealt: 0 }), null);
  assert.ok(moveFor(card, { ...attack, damage: 0, benchDealt: 20 }));
  assert.ok(moveFor(card, { instanceId: 1 }));
});

test('moveFor: missing attackName and instanceId still pick deterministically', () => {
  const card = { name: 'Charmander', types: ['Fire'], stage: 'Basic' };
  const first = moveFor(card, { damage: 10 });
  assert.deepEqual(moveFor(card, { damage: 10, attackName: '' }), first);
  assert.ok(['flame-charge', 'ember'].includes(first.move));
});

test('moveFor: scores parameter supplies the score and family, and gates unscored moves', () => {
  const card = { name: 'Charmander', types: ['Fire'], stage: 'Basic' };
  const species = { atk: 100, spa: 50, types: ['fire'] };
  const score = { move: 'flame-charge', family: 'dash' };
  const hit = moveFor(card, { ...attack, species }, { 'flame-charge': score });
  assert.equal(hit.score, score);
  assert.equal(hit.family, 'dash');
  assert.equal(moveFor(card, { ...attack, species }, { ember: {} }), null);
  assert.equal(moveFor(card, { ...attack, species }).score, undefined);
});
