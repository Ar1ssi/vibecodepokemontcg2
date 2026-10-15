import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENERGY_COUNT_BADGE_CLASS,
  planEnergyTokenRow,
  relayoutLegacyEnergyTokens,
  renderEnergyCountBadges,
  scaleEnergyCountBadges,
  stampEnergyAttachOrder,
} from '../energy-token-row.mjs';

const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('up to four tokens sit side by side, squeezed to the card width', () => {
  const plan = planEnergyTokenRow(['fire', 'fire', 'water', 'fire'], 150);
  assert.equal(plan.tokenSize, 36);
  assert.deepEqual(plan.badges, []);
  assert.deepEqual(
    plan.tokens.map((t) => t.zIndex),
    [101, 102, 103, 104]
  );
  const lefts = plan.tokens.map((t) => t.left);
  assert.ok(lefts[0] === 0 && lefts[1] < lefts[2] && lefts[2] < lefts[3]);
  close(lefts[3] + plan.tokenSize, 150);
});

test('a short row keeps its natural spacing', () => {
  const plan = planEnergyTokenRow(['fire', 'water'], 150);
  close(plan.tokens[1].left, 36 * 1.15);
});

test('past four, one type piles onto one spot with a count badge after it', () => {
  const plan = planEnergyTokenRow(['fire', 'fire', 'fire', 'fire', 'fire'], 150);
  assert.deepEqual(
    plan.tokens.map((t) => t.left),
    [0, 0, 0, 0, 0]
  );
  assert.deepEqual(
    plan.tokens.map((t) => t.zIndex),
    [101, 102, 103, 104, 105],
    'newest token of the pile is on top'
  );
  assert.equal(plan.badges.length, 1);
  assert.equal(plan.badges[0].label, '5x');
  assert.ok(plan.badges[0].left >= plan.tokenSize, 'badge sits after the token');
  assert.equal(plan.badges[0].fontSize, 18);
  assert.equal(plan.badges[0].zIndex, 106, 'badge above every token');
});

test('the next type follows the previous badge, in order of first attach', () => {
  const keys = ['fire', 'fire', 'water', 'fire', 'fire', 'water'];
  const plan = planEnergyTokenRow(keys, 150);
  const fire = [0, 1, 3, 4].map((i) => plan.tokens[i].left);
  const water = [2, 5].map((i) => plan.tokens[i].left);
  assert.deepEqual(new Set(fire), new Set([0]));
  assert.equal(water[0], water[1]);
  assert.deepEqual(
    plan.badges.map((b) => b.label),
    ['4x', '2x']
  );
  const [fireBadge, waterBadge] = plan.badges;
  assert.ok(fireBadge.left < water[0], 'water token comes after the 4x badge');
  assert.ok(water[0] + plan.tokenSize <= waterBadge.left);
});

test('a single token of a type in a collapsed row gets no badge', () => {
  const plan = planEnergyTokenRow(['fire', 'fire', 'fire', 'fire', 'water'], 150);
  assert.deepEqual(
    plan.badges.map((b) => b.label),
    ['4x']
  );
  assert.ok(plan.tokens[4].left > plan.badges[0].left);
});

test('a collapsed row still wider than the card is squeezed onto it', () => {
  const plan = planEnergyTokenRow(['a', 'b', 'c', 'd', 'e'], 150);
  assert.deepEqual(plan.badges, []);
  close(plan.tokens[4].left + plan.tokenSize, 150);
});

test('no card size yet, or no tokens, plans without throwing', () => {
  const unsized = planEnergyTokenRow(['fire', 'fire', 'fire', 'fire', 'fire'], 0);
  assert.equal(unsized.tokenSize, 0);
  assert.equal(unsized.badges[0].label, '5x');
  assert.deepEqual(planEnergyTokenRow([], 150).tokens, []);
  assert.deepEqual(planEnergyTokenRow(undefined, NaN).tokens, []);
});

class FakeElement {
  constructor(doc, tagName = 'span') {
    this.ownerDocument = doc;
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.textContent = '';
    this.classes = new Set();
    this.attrs = {};
  }
  appendChild(child) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    this.children.splice(this.children.indexOf(child), 1);
    child.parentNode = null;
    return child;
  }
  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
}

function fakeDoc() {
  const doc = {
    tokens: [],
    createElement: (tag) => new FakeElement(doc, tag),
    querySelectorAll: (selector) => {
      assert.equal(selector, 'img.energy-token-3d');
      return doc.tokens;
    },
  };
  return doc;
}

test('badges replace the previous layout and are dropped when no longer needed', () => {
  const doc = fakeDoc();
  const parent = new FakeElement(doc, 'div');
  const owner = {};
  const badge = { left: 40, label: '4x', fontSize: 18, zIndex: 106 };

  renderEnergyCountBadges(owner, parent, [badge], 6);
  assert.equal(parent.children.length, 1);
  const [span] = parent.children;
  assert.equal(span.className, ENERGY_COUNT_BADGE_CLASS);
  assert.equal(span.textContent, '4x');
  assert.deepEqual(span.style, { left: '40px', bottom: '6px', fontSize: '18px', zIndex: '106' });

  renderEnergyCountBadges(owner, parent, [{ ...badge, label: '5x' }], 6);
  assert.deepEqual(
    parent.children.map((c) => c.textContent),
    ['5x']
  );

  renderEnergyCountBadges(owner, null, [], 6);
  assert.equal(parent.children.length, 0);
  assert.deepEqual(owner.energyCountBadges, []);
});

test('a resize scales the badges with the tokens', () => {
  const doc = fakeDoc();
  const parent = new FakeElement(doc, 'div');
  const owner = {};
  renderEnergyCountBadges(owner, parent, [{ left: 40, label: '4x', fontSize: 18, zIndex: 106 }], 6);
  scaleEnergyCountBadges(owner, 0.5);
  assert.equal(parent.children[0].style.left, '20px');
  assert.equal(parent.children[0].style.bottom, '3px');
  assert.equal(parent.children[0].style.fontSize, '9px');
  scaleEnergyCountBadges({}, 2);
  scaleEnergyCountBadges(null, 2);
});

test('legacy relayout reads the tokens on the Pokémon in attach order', () => {
  const doc = fakeDoc();
  const container = new FakeElement(doc, 'div');
  const pokemon = new FakeElement(doc, 'img');
  pokemon.clientWidth = 150;
  pokemon.clientHeight = 200;
  const other = new FakeElement(doc, 'img');
  const token = (src, relative = pokemon) => {
    const img = new FakeElement(doc, 'img');
    img.attrs.src = src;
    img.relative = relative;
    stampEnergyAttachOrder(img);
    container.appendChild(img);
    return img;
  };
  const fire = '/src/assets/energy/tokens/fire.png';
  const water = '/src/assets/energy/tokens/water.png';
  const tokens = [token(fire), token(water), token(fire), token(fire), token(fire)];
  const elsewhere = token(fire, other);
  // A fresh attach lands right after the Pokémon, so the DOM runs newest-first.
  doc.tokens = [elsewhere, ...tokens].reverse();

  relayoutLegacyEnergyTokens(pokemon);
  assert.deepEqual(
    tokens.map((img) => img.style.zIndex),
    ['101', '102', '103', '104', '105']
  );
  assert.equal(tokens[0].style.left, '0px');
  assert.equal(tokens[4].style.left, '0px');
  assert.equal(tokens[0].style.width, '36px');
  assert.equal(tokens[0].style.bottom, '6px');
  assert.ok(parseFloat(tokens[1].style.left) > 36, 'water follows the fire pile');
  assert.deepEqual(
    pokemon.energyCountBadges.map((b) => b.textContent),
    ['4x']
  );
  assert.equal(elsewhere.style.left, undefined, 'another Pokémon’s tokens are untouched');

  relayoutLegacyEnergyTokens(pokemon, { exclude: tokens[4] });
  assert.deepEqual(pokemon.energyCountBadges, [], 'back to four: no badge');
  assert.equal(
    container.children.filter((c) => c.className === ENERGY_COUNT_BADGE_CLASS).length,
    0
  );
  assert.ok(parseFloat(tokens[3].style.left) > parseFloat(tokens[2].style.left));
});

test('legacy relayout without a document is a no-op', () => {
  relayoutLegacyEnergyTokens(null);
  relayoutLegacyEnergyTokens({});
});
