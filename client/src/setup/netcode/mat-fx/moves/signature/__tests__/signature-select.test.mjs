import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  baseDamage,
  normalizeAttackName,
  pickFromPool,
  signatureFor,
  signatureForSlug,
  signatureMaterial,
  signaturePoolForSlug,
  slugFor,
  strongestAttackName,
} from '../signature-select.mjs';
import { SIGNATURE_BY_SLUG, SIGNATURE_MOVES, SIGNATURE_POOL_BY_SLUG } from '../signature-moves.mjs';
import { hashString } from '../../move-select.mjs';
import { SIGNATURE_SPECS } from '../specs/index.mjs';
import { SPECS } from '../../specs/index.mjs';

// Lugia V, Sword & Shield Promos SWSH301 (out/pkmn-pokemon-cards.json): Read the Wind, Aero Dive 130.
const lugiaV = {
  name: 'Lugia V',
  types: ['Colorless'],
  attacks: [
    { name: 'Read the Wind', damage: '' },
    { name: 'Aero Dive', damage: '130' },
  ],
};

test('strongestAttackName: largest base damage, ties to the later, none → null (edge 3, 4)', () => {
  assert.equal(
    strongestAttackName([
      { name: 'A', damage: '60' },
      { name: 'B', damage: '120+' },
    ]),
    'B'
  );
  assert.equal(
    strongestAttackName([
      { name: 'A', damage: '90' },
      { name: 'B', damage: '90' },
    ]),
    'B'
  );
  assert.equal(strongestAttackName([{ name: 'A', damage: '' }]), null);
  assert.equal(strongestAttackName(undefined), null);
  assert.equal(strongestAttackName('nope'), null);
  assert.equal(
    strongestAttackName([{ name: 'A', damage: '' }, { name: 'B' }]),
    null
  );
});

test('baseDamage reads the first integer (edge 5)', () => {
  assert.equal(baseDamage('30×'), 30);
  assert.equal(baseDamage('120+'), 120);
  assert.equal(baseDamage('50-'), 50);
  assert.equal(baseDamage(''), 0);
  assert.equal(baseDamage(undefined), 0);
});

test('normalizeAttackName: curly and straight apostrophes agree (edge 6), empty → "" (edge 2)', () => {
  assert.equal(
    normalizeAttackName('Nature’s Madness'),
    normalizeAttackName("Nature's Madness")
  );
  assert.equal(normalizeAttackName('Land’s Wrath'), 'lands wrath');
  assert.equal(normalizeAttackName('  V-create!! '), 'v create');
  assert.equal(normalizeAttackName(undefined), '');
  assert.equal(normalizeAttackName(''), '');
});

test('signatureForSlug: exact keys, form walk, explicit null (edge 7, 8, 9)', () => {
  assert.equal(signatureForSlug('arceus-fire'), 'judgment');
  assert.equal(signatureForSlug('silvally-water'), 'multi-attack');
  assert.equal(signatureForSlug('deoxys-attack'), 'psycho-boost');
  assert.equal(signatureForSlug('zacian-crowned'), 'behemoth-blade');
  assert.equal(signatureForSlug('mewtwo'), 'psystrike');
  assert.equal(signatureForSlug('mew'), null);
  assert.equal(signatureForSlug('ho-oh'), 'sacred-fire');
  assert.equal(signatureForSlug('tapu-koko'), 'natures-madness');
  assert.equal(signatureForSlug('calyrex'), null);
  assert.equal(signatureForSlug('moltres'), null);
  assert.equal(signatureForSlug('kyurem-black'), 'freeze-shock');
  assert.equal(signatureForSlug('ogerpon-wellspring-mask'), 'ivy-cudgel');
  assert.equal(signatureForSlug('charizard'), null);
  assert.equal(signatureForSlug(''), null);
  assert.equal(signatureForSlug(null), null);
});

test('every form override in SIGNATURE_BY_SLUG resolves to itself', () => {
  const forms = {
    'kyurem-black': 'freeze-shock',
    'kyurem-white': 'ice-burn',
    'calyrex-ice-rider': 'glacial-lance',
    'calyrex-shadow-rider': 'astral-barrage',
    'urshifu-rapid-strike': 'surging-strikes',
    'urshifu-rapid-strike-gmax': 'surging-strikes',
    'hoopa-unbound': 'hyperspace-fury',
    'necrozma-dawn': 'moongeist-beam',
    'necrozma-dusk': 'sunsteel-strike',
    'necrozma-ultra': 'photon-geyser',
    'zygarde-10': 'thousand-arrows',
    'zygarde-complete': 'core-enforcer',
    'zygarde-mega': 'nihil-light',
    'articuno-galar': 'freezing-glare',
    'moltres-galar': 'fiery-wrath',
    'zapdos-galar': 'thunderous-kick',
  };
  for (const [slug, id] of Object.entries(forms))
    assert.equal(signatureForSlug(slug), id, slug);
  for (const [slug, id] of Object.entries(SIGNATURE_BY_SLUG))
    assert.equal(signatureForSlug(slug), id, slug);
});

test('signatureMaterial: card-typed moves, Ogerpon masks (edge 16, 17)', () => {
  assert.equal(
    signatureMaterial('ivy-cudgel', { slug: 'ogerpon-hearthflame-mask' }),
    'fire'
  );
  assert.equal(
    signatureMaterial('ivy-cudgel', { slug: 'ogerpon-wellspring-mask' }),
    'water'
  );
  assert.equal(
    signatureMaterial('ivy-cudgel', { slug: 'ogerpon-cornerstone-mask' }),
    'rock'
  );
  assert.equal(signatureMaterial('ivy-cudgel', { slug: 'ogerpon' }), 'grass');
  assert.equal(signatureMaterial('ivy-cudgel', {}), 'grass');
  assert.equal(
    signatureMaterial('judgment', { card: { types: ['Colorless'] } }),
    'normal'
  );
  assert.equal(
    signatureMaterial('multi-attack', { card: { types: ['Colorless'] } }),
    'normal'
  );
  assert.equal(
    signatureMaterial('judgment', { card: { types: ['Darkness'] } }),
    'dark'
  );
  assert.equal(
    signatureMaterial('techno-blast', { card: { types: ['Metal'] } }),
    'steel'
  );
  assert.equal(signatureMaterial('techno-blast', { card: {} }), 'normal');
  assert.equal(signatureMaterial('tera-starstorm', {}), 'stellar');
  assert.equal(signatureMaterial('aeroblast', {}), 'flying');
});

test('signatureFor: name match on any species (edge 10)', () => {
  // Darkrai, Diamond & Pearl Promos DP24 (corpus): attacks Spacial Rend 10, Roar of Time 80.
  assert.deepEqual(
    signatureFor(
      { name: 'Darkrai', attacks: [] },
      { attackName: 'Roar of Time', slug: 'darkrai' }
    ),
    {
      move: 'roar-of-time',
      reason: 'name',
      material: 'dragon',
    }
  );
});

test('signatureFor: the strongest attack of a legendary plays its signature', () => {
  assert.deepEqual(
    signatureFor(lugiaV, { attackName: 'Aero Dive', slug: 'lugia' }),
    {
      move: 'aeroblast',
      reason: 'strongest',
      material: 'flying',
    }
  );
  assert.equal(
    signatureFor(lugiaV, { attackName: 'Read the Wind', slug: 'lugia' }),
    null
  );
  assert.equal(slugFor(lugiaV), 'lugia');
  assert.equal(
    signatureFor(lugiaV, { attackName: 'Aero Dive', slug: slugFor(lugiaV) })
      ?.move,
    'aeroblast'
  );
});

test('signatureFor: missing card / empty name / no attacks (edge 1, 2, 3)', () => {
  assert.equal(
    signatureFor(undefined, { attackName: 'Aero Dive', slug: 'lugia' }),
    null
  );
  assert.equal(signatureFor(null, { attackName: undefined, slug: null }), null);
  assert.equal(signatureFor(lugiaV, { attackName: '', slug: 'lugia' }), null);
  assert.equal(
    signatureFor(lugiaV, { attackName: undefined, slug: 'lugia' }),
    null
  );
  assert.equal(
    signatureFor({ attacks: 'x' }, { attackName: 'Aero Dive', slug: 'lugia' }),
    null
  );
  assert.equal(
    signatureFor(
      { attacks: [{ name: 'Aero Dive', damage: '' }] },
      { attackName: 'Aero Dive', slug: 'lugia' }
    ),
    null
  );
  // Name match needs no card at all.
  assert.equal(
    signatureFor(undefined, { attackName: 'Sacred Fire' })?.move,
    'sacred-fire'
  );
});

test('Tag Team card resolves to its partner: no slug signature, name match still works (edge 13)', () => {
  const card = {
    name: 'Reshiram & Charizard-GX',
    types: ['Fire'],
    attacks: [
      { name: 'Outrage', damage: '30+' },
      { name: 'Flare Strike', damage: '230' },
    ],
  };
  assert.equal(slugFor(card), 'charizard');
  assert.equal(
    signatureFor(card, { attackName: 'Flare Strike', slug: slugFor(card) }),
    null
  );
  assert.equal(
    signatureFor(card, { attackName: 'Blue Flare', slug: slugFor(card) })?.move,
    'blue-flare'
  );
});

test('a selected signature with no shipped spec falls through to 063 (edge 11)', () => {
  const sig = signatureFor(lugiaV, { attackName: 'Aero Dive', slug: 'lugia' });
  assert.equal(SIGNATURE_SPECS[sig.move], undefined);
});

test('ids shared with 063 stay separate registries (edge 21)', () => {
  assert.ok(SPECS.aeroblast && SPECS['seed-flare']);
  assert.notEqual(SIGNATURE_SPECS.aeroblast, SPECS.aeroblast);
  assert.notEqual(SIGNATURE_SPECS['seed-flare'], SPECS['seed-flare']);
});

test('signaturePoolForSlug: forms with several signatures share a pool; others one move', () => {
  assert.deepEqual(signaturePoolForSlug('kyurem-black'), ['freeze-shock', 'fusion-bolt']);
  assert.deepEqual(signaturePoolForSlug('kyurem-white'), ['ice-burn', 'fusion-flare']);
  assert.deepEqual(signaturePoolForSlug('kyurem'), ['glaciate']);
  assert.equal(signaturePoolForSlug('zygarde-complete'), SIGNATURE_POOL_BY_SLUG.zygarde);
  assert.deepEqual(signaturePoolForSlug('lugia'), ['aeroblast']);
  assert.deepEqual(signaturePoolForSlug('pikachu'), []);
  for (const pool of Object.values(SIGNATURE_POOL_BY_SLUG)) {
    assert.ok(pool.length >= 2);
    for (const id of pool) assert.ok(SIGNATURE_MOVES[id], id);
  }
});

test('pickFromPool: uniform over the seed, deterministic, empty → null', () => {
  const pool = ['a', 'b'];
  assert.equal(pickFromPool(pool, 0), 'a');
  assert.equal(pickFromPool(pool, 1), 'b');
  assert.equal(pickFromPool(pool, 7), pickFromPool(pool, 7));
  assert.equal(pickFromPool([], 3), null);
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 1000; i++) counts[pickFromPool(pool, hashString(`k|${i}`))]++;
  assert.ok(counts.a > 400 && counts.b > 400, JSON.stringify(counts));
});

test('signatureFor: a multi-signature legendary’s strongest attack is a 50/50 by seed', () => {
  const blackKyurem = {
    name: 'Black Kyurem',
    types: ['Dragon'],
    attacks: [
      { name: 'Ice Edge', damage: '30' },
      { name: 'Black Frost', damage: '250' },
    ],
  };
  const seen = new Set();
  for (let seed = 0; seed < 8; seed++) {
    const sig = signatureFor(blackKyurem, { attackName: 'Black Frost', slug: 'kyurem-black', seed });
    assert.equal(sig.reason, 'strongest');
    seen.add(sig.move);
  }
  assert.deepEqual([...seen].sort(), ['freeze-shock', 'fusion-bolt']);
  assert.equal(
    signatureFor(blackKyurem, { attackName: 'Ice Edge', slug: 'kyurem-black', seed: 1 }),
    null
  );
  // A name match still wins over the pool.
  assert.equal(
    signatureFor(blackKyurem, { attackName: 'Fusion Bolt', slug: 'kyurem-black', seed: 0 })?.move,
    'fusion-bolt'
  );
});
