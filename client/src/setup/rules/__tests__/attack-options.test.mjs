import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  buildAbilityOption,
  buildAttackOption,
  buildStadiumOption,
  buildWeakResistBar,
  typeIcon,
  typeKeyFor,
} from '../attack-options.mjs';

// Design 074: the option rows are TCG Live's AttackActionOption_L / AbilityActionOption_L and the
// WeakResistRetreatBar. These pin the variant classes each SetupCustom path picks, the routing hooks
// the inspector's delegated click handler reads, and that every class the builders emit is styled.

const CSS = readFileSync(fileURLToPath(new URL('../../../css/attack-options.css', import.meta.url)), 'utf8');
const FOCUS_CSS = readFileSync(fileURLToPath(new URL('../../../css/card-focus.css', import.meta.url)), 'utf8');

let dom;
before(() => {
  dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
});
after(() => {
  delete globalThis.window;
  delete globalThis.document;
});

const attack = (overrides = {}) => ({
  index: 0,
  name: 'Flare',
  text: '',
  cost: ['Fire', 'Colorless'],
  costIcons: [
    { type: 'fire', filled: true },
    { type: 'colorless', filled: false },
  ],
  readout: { text: '30', tone: 'plain', mod: null, showTab: true },
  usable: true,
  recede: false,
  ...overrides,
});

const classesOf = (node) => [...node.classList];

describe('074 — buildAttackOption (AttackOption.SetupCustom)', () => {
  it('a usable attack wears the type titlebar, its damage tab and routes by index', () => {
    const row = buildAttackOption(attack({ index: 1 }), 'Fire');
    assert.deepEqual(classesOf(row), ['tcgl-opt', 'tcgl-opt--attack', 'tcgl-opt--on', 'tcgl-opt--damage']);
    assert.equal(row.dataset.ptcgAttack, '1');
    assert.equal(row.dataset.ptcgType, 'fire');
    assert.equal(row.querySelector('.tcgl-opt__name').textContent, 'Flare');
    assert.equal(row.querySelector('.tcgl-opt__dmg').textContent, '30');
  });

  it('cost icons are the filled or empty type textures EnergyCostDisplay picks', () => {
    const icons = [...buildAttackOption(attack(), 'Fire').querySelectorAll('.tcgl-opt__cost img')];
    assert.deepEqual(
      icons.map((img) => img.getAttribute('src')),
      ['/src/assets/attack-ui/type-fire.png', '/src/assets/attack-ui/type-colorless-empty.png']
    );
    assert.ok(icons[1].classList.contains('tcgl-icon--empty'));
  });

  it('an unpayable attack is the off look; an inert benched one keeps its colours', () => {
    assert.ok(buildAttackOption(attack({ usable: false, recede: true }), 'Fire').classList.contains('tcgl-opt--off'));
    assert.ok(buildAttackOption(attack({ usable: false, recede: false }), 'Fire').classList.contains('tcgl-opt--on'));
  });

  it('effect text adds the text variant, a divider and the description with inline icons', () => {
    const row = buildAttackOption(attack({ text: 'Discard a {R} Energy.' }), 'Fire');
    assert.ok(row.classList.contains('tcgl-opt--text'));
    assert.ok(row.querySelector('.tcgl-opt__divider'));
    const body = row.querySelector('.tcgl-opt__text');
    assert.match(body.textContent, /Discard a .*Energy\./);
    assert.equal(body.querySelector('img.tcgl-icon--inline').getAttribute('src'), '/src/assets/attack-ui/type-fire.png');
  });

  it('no printed damage: the tab is hidden and the number empty (damageAmountBG alpha 0)', () => {
    const row = buildAttackOption(attack({ readout: { text: '', tone: 'plain', mod: null, showTab: false } }), 'Fire');
    assert.ok(!row.classList.contains('tcgl-opt--damage'));
    assert.equal(row.querySelector('.tcgl-opt__dmg').textContent, '');
  });

  it('weakness / resistance tint the number; buff / debuff add the arrow', () => {
    const weak = buildAttackOption(attack({ readout: { text: '60', tone: 'weakness', mod: 'buff', showTab: true } }), 'Fire');
    assert.ok(weak.querySelector('.tcgl-opt__dmg--weakness'));
    assert.ok(weak.querySelector('.tcgl-opt__mod--buff .tcgl-opt__mod-icon'));
    const resist = buildAttackOption(attack({ readout: { text: '0', tone: 'resistance', mod: 'debuff', showTab: true } }), 'Fire');
    assert.ok(resist.querySelector('.tcgl-opt__dmg--resistance'));
    assert.ok(resist.querySelector('.tcgl-opt__mod--debuff'));
  });

  it('a long readout (a range) drops to the auto-size minimum', () => {
    const row = buildAttackOption(attack({ readout: { text: '120-180', tone: 'plain', mod: null, showTab: true } }), 'Fire');
    assert.ok(row.querySelector('.tcgl-opt__dmg--long'));
  });

  it('VSTAR and GX entries carry their variants; VSTAR adds the VPowerBar strip', () => {
    const vstar = buildAttackOption(attack({ vstar: true }), 'Fire');
    assert.ok(vstar.classList.contains('tcgl-opt--vstar'));
    assert.equal(vstar.querySelector('.tcgl-opt__vpower-title').textContent, 'VSTAR Power');
    assert.ok(buildAttackOption(attack({ gx: true }), 'Fire').classList.contains('tcgl-opt--gx'));
  });

  it('a borrowed attack names its source, and a reason rides on the tooltip', () => {
    const row = buildAttackOption(attack({ from: 'Mew ex', reason: 'Not enough Energy' }), 'Fire');
    assert.equal(row.querySelector('.tcgl-opt__from').textContent, 'from Mew ex');
    assert.equal(row.title, 'Not enough Energy');
  });
});

describe('074 — buildAbilityOption (GetAssetForAbilityEntry)', () => {
  it('usable: on look, tag on, routes as the ability', () => {
    const row = buildAbilityOption({ name: 'Skyliner', text: 'x', usable: true, recede: false }, 'Psychic');
    assert.deepEqual(classesOf(row), ['tcgl-opt', 'tcgl-opt--ability', 'tcgl-opt--on', 'tcgl-opt--text']);
    assert.equal(row.dataset.ptcgAbility, '1');
    assert.ok(row.querySelector('.tcgl-opt__tag--on'));
  });

  it('passive: the tinted header, tag on', () => {
    const row = buildAbilityOption({ name: 'Aura', text: 'x', passive: true }, 'Psychic');
    assert.ok(row.classList.contains('tcgl-opt--passive'));
    assert.ok(row.querySelector('.tcgl-opt__tag--on'));
  });

  it('spent or blocked: the bare tile, tag off', () => {
    const row = buildAbilityOption({ name: 'Draw', text: 'x', usable: false, recede: true }, 'Psychic');
    assert.ok(row.classList.contains('tcgl-opt--off'));
    assert.ok(row.querySelector('.tcgl-opt__tag--off'));
  });
});

// The in-play Stadium's row, fed the inspector model's stadium entry (card-inspector-model).
const stadium = (overrides = {}) => ({
  kind: 'stadium',
  name: 'Safari Zone',
  text: 'Once during each player\'s turn, that player may put a Basic Pokémon onto their Bench.',
  actionable: true,
  usable: true,
  recede: false,
  reason: null,
  ...overrides,
});

describe('018 — buildStadiumOption (the Stadium in the focus overlay)', () => {
  it('an activatable Stadium: the usable titlebar in Stadium green, routed as the Stadium', () => {
    const row = buildStadiumOption(stadium());
    assert.deepEqual(classesOf(row), ['tcgl-opt', 'tcgl-opt--stadium', 'tcgl-opt--on', 'tcgl-opt--text']);
    assert.equal(row.dataset.ptcgStadium, '1');
    assert.equal(row.dataset.ptcgType, 'grass');
    assert.equal(row.querySelector('.tcgl-opt__name').textContent, 'Safari Zone');
    assert.equal(row.querySelector('.tcgl-opt__label').textContent, 'Stadium');
    assert.match(row.querySelector('.tcgl-opt__text').textContent, /Basic Pokémon onto their Bench/);
  });

  it('used this turn or off-turn: the bare tile, with the reason on the tooltip', () => {
    const row = buildStadiumOption(stadium({ usable: false, recede: true, reason: 'Already used this turn' }));
    assert.ok(row.classList.contains('tcgl-opt--off'));
    assert.equal(row.title, 'Already used this turn');
  });

  it('a continuous Stadium (nothing to activate) wears the tinted header', () => {
    const row = buildStadiumOption(stadium({ actionable: false, usable: false }));
    assert.ok(row.classList.contains('tcgl-opt--passive'));
    assert.ok(!row.classList.contains('tcgl-opt--on'));
  });

  it('no effect text: no divider or description', () => {
    const row = buildStadiumOption(stadium({ text: '' }));
    assert.ok(!row.classList.contains('tcgl-opt--text'));
    assert.equal(row.querySelector('.tcgl-opt__divider'), null);
    assert.equal(row.querySelector('.tcgl-opt__text'), null);
  });
});

describe('074 — buildWeakResistBar (WeakResistRetreatBar)', () => {
  const model = (overrides = {}) => ({
    type: 'Fire',
    weakness: { type: 'Water', value: 2 },
    resistance: { type: 'Fighting', value: 30 },
    retreatUsable: true,
    retreatRecede: false,
    retreatIcons: [{ type: 'colorless', filled: true }, { type: 'colorless', filled: false }],
    retreatCount: { attached: 1, needed: 2 },
    ...overrides,
  });

  it('weakness reads x2, resistance -30, each with its type icon', () => {
    const bar = buildWeakResistBar(model());
    const weak = bar.querySelector('.tcgl-wr__row--weakness');
    assert.equal(weak.querySelector('.tcgl-wr__amount').textContent, 'x2');
    assert.equal(weak.querySelector('img').getAttribute('src'), '/src/assets/attack-ui/type-water.png');
    assert.equal(bar.querySelector('.tcgl-wr__row--resistance .tcgl-wr__amount').textContent, '-30');
  });

  it('a card with no weakness keeps the label and shows nothing after it', () => {
    const row = buildWeakResistBar(model({ weakness: null })).querySelector('.tcgl-wr__row--weakness');
    assert.equal(row.querySelector('.tcgl-wr__label').textContent, 'Weakness');
    assert.equal(row.querySelector('img'), null);
    assert.equal(row.querySelector('.tcgl-wr__amount').textContent, '');
  });

  it('the Retreat button routes, wears the type, and shows the filled / empty cost', () => {
    const button = buildWeakResistBar(model()).querySelector('.tcgl-retreat');
    assert.equal(button.dataset.ptcgRetreat, '1');
    assert.equal(button.dataset.ptcgType, 'fire');
    assert.ok(button.classList.contains('tcgl-retreat--on'));
    assert.equal(button.querySelectorAll('.tcgl-retreat__cost img').length, 2);
  });

  it('a receded retreat is the disabled sprite and explains itself', () => {
    const button = buildWeakResistBar(
      model({ retreatUsable: false, retreatRecede: true, retreatReason: 'Already retreated' })
    ).querySelector('.tcgl-retreat');
    assert.ok(button.classList.contains('tcgl-retreat--off'));
    assert.equal(button.title, 'Already retreated');
  });

  it('past four Energy the cost is ShortRetreatCostDisplay: attached/<b>needed</b>', () => {
    const button = buildWeakResistBar(model({ retreatIcons: null, retreatCount: { attached: 3, needed: 5 } })).querySelector(
      '.tcgl-retreat'
    );
    const count = button.querySelector('.tcgl-retreat__count');
    assert.equal(count.textContent, '3/5');
    assert.equal(count.querySelector('b').textContent, '5');
  });
});

describe('074 — type keys and icons', () => {
  it('maps engine type names onto the registry keys, unknown to colorless', () => {
    assert.equal(typeKeyFor('Fire'), 'fire');
    assert.equal(typeKeyFor('Darkness'), 'darkness');
    assert.equal(typeKeyFor('Unknown'), 'colorless');
  });

  it('the empty icon has no "-empty" twin', () => {
    assert.equal(typeIcon('empty', false).getAttribute('src'), '/src/assets/attack-ui/type-empty.png');
  });
});

describe('074 — attack-options.css covers every class the builders emit', () => {
  it('each emitted class has a rule', () => {
    const rows = [
      buildAttackOption(attack({ text: 'x {R}', vstar: true, from: 'Mew', readout: { text: '120-180', tone: 'weakness', mod: 'buff', showTab: true } }), 'Fire'),
      buildAttackOption(attack({ gx: true, recede: true, readout: { text: '10', tone: 'resistance', mod: 'debuff', showTab: true } }), 'Fire'),
      buildAbilityOption({ name: 'a', text: 'b', passive: true }, 'Fire'),
      buildAbilityOption({ name: 'a', text: 'b', recede: true }, 'Fire'),
      buildStadiumOption(stadium({ recede: true })),
      buildWeakResistBar({ type: 'Fire', weakness: { type: 'Water', value: 2 }, resistance: null, retreatRecede: true, retreatIcons: null, retreatCount: { attached: 0, needed: 5 } }),
      buildWeakResistBar({ type: 'Fire', weakness: null, resistance: null, retreatIcons: [{ type: 'colorless', filled: true }] }),
    ];
    const emitted = new Set();
    for (const root of rows) for (const node of [root, ...root.querySelectorAll('*')]) for (const name of node.classList) emitted.add(name);
    const styled = (name) => new RegExp(`\\.${name}(?![\\w-])`).test(CSS) || new RegExp(`\\.${name}(?![\\w-])`).test(FOCUS_CSS);
    // Variant classes that only exist for routing or as a negative (`:not(...)`) need no rule of their own.
    const markerOnly = new Set(['tcgl-opt--attack', 'tcgl-opt--on', 'tcgl-retreat--on', 'tcgl-icon--empty', 'tcgl-wr__row--weakness', 'tcgl-wr__row--resistance', 'tcgl-opt__tag--on']);
    const missing = [...emitted].filter((name) => !markerOnly.has(name) && !styled(name));
    assert.deepEqual(missing, []);
  });

  it('the type table is attribute-keyed, so the focus chrome and the stack view share it', () => {
    assert.match(CSS, /\[data-ptcg-type='fire'\] \{/);
    assert.doesNotMatch(CSS, /\.ptcg-chrome \[data-ptcg-type=/);
  });
});
