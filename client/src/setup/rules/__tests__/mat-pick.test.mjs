import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatPickEntry, findMatPickHit } from '../mat-pick.mjs';

class MockElement {
  constructor(tagName = 'div', parent = null) {
    this.tagName = tagName.toUpperCase();
    this.parentElement = parent;
    this.children = [];
    this.style = {};
    if (parent) parent.children.push(this);
  }
  closest(selector) {
    let cur = this;
    while (cur) {
      if (selector === '.mat-holo' && cur.classList?.contains('mat-holo')) return cur;
      if (selector === '.play-container' && cur.classList?.contains('play-container')) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  contains(node) {
    let cur = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }
}

class MockClassList {
  constructor(classes = []) {
    this.classes = new Set(classes);
  }
  contains(c) {
    return this.classes.has(c);
  }
  add(c) {
    this.classes.add(c);
  }
  remove(c) {
    this.classes.delete(c);
  }
}

function createHoloCardFixture(card) {
  // Structure:
  // .play-container
  //   -> .mat-holo (wrapper)
  //        -> .card__rotator
  //             -> img (card.image)
  //             -> .card__shine
  //             -> .card__glare
  const container = new MockElement('div');
  container.classList = new MockClassList(['play-container']);

  const holo = new MockElement('div', container);
  holo.classList = new MockClassList(['mat-holo']);

  const rotator = new MockElement('div', holo);
  rotator.classList = new MockClassList(['card__rotator']);

  const img = new MockElement('img', rotator);
  img.card = card;
  card.image = img;
  card.wrapper = holo;

  const shine = new MockElement('div', rotator);
  shine.classList = new MockClassList(['card__shine']);

  const glare = new MockElement('div', rotator);
  glare.classList = new MockClassList(['card__glare']);

  return { container, holo, rotator, img, shine, glare };
}

function createPlainCardFixture(card) {
  const container = new MockElement('div');
  container.classList = new MockClassList(['play-container']);

  const img = new MockElement('img', container);
  img.card = card;
  card.image = img;

  return { container, img };
}

test('reproduce bug: old matcher fails on holo shine and rotator', () => {
  const card = { name: 'Charmander', stage: 'Basic' };
  const fixture = createHoloCardFixture(card);

  // The old matcher only checked: e.img === target || e.img.contains(target)
  const oldMatcher = (entries, target) => {
    const hit = entries.find((e) => e.img === target || e.img.contains?.(target));
    return hit?.card || null;
  };

  const oldEntries = [{ card, img: card.image }];

  // Clicking on shine (top layer in rotator)
  assert.equal(oldMatcher(oldEntries, fixture.shine), null, 'Old matcher fails on holo shine click');
  // Clicking on holo wrapper
  assert.equal(oldMatcher(oldEntries, fixture.holo), null, 'Old matcher fails on holo wrapper click');
  // Clicking on play container
  assert.equal(oldMatcher(oldEntries, fixture.container), null, 'Old matcher fails on play container click');
});

test('buildMatPickEntry: resolves targetEl to holo wrapper when present', () => {
  const card = { name: 'Charmander', stage: 'Basic' };
  const fixture = createHoloCardFixture(card);
  const entry = buildMatPickEntry(card);

  assert.equal(entry.card, card);
  assert.equal(entry.img, fixture.img);
  assert.equal(entry.targetEl, fixture.holo);
  assert.equal(entry.container, fixture.container);
});

test('buildMatPickEntry: resolves targetEl to bare img for plain cards', () => {
  const card = { name: 'Pidgey', stage: 'Basic' };
  const fixture = createPlainCardFixture(card);
  const entry = buildMatPickEntry(card);

  assert.equal(entry.card, card);
  assert.equal(entry.img, fixture.img);
  assert.equal(entry.targetEl, fixture.img);
  assert.equal(entry.container, fixture.container);
});

test('findMatPickHit: successfully matches clicks on holo shine, rotator, wrapper, and container', () => {
  const card1 = { name: 'Charmander', stage: 'Basic' };
  const fixture1 = createHoloCardFixture(card1);

  const card2 = { name: 'Pidgey', stage: 'Basic' };
  const fixture2 = createPlainCardFixture(card2);

  const entries = [
    buildMatPickEntry(card1),
    buildMatPickEntry(card2),
  ];

  // Click on Charmander's shine overlay
  assert.equal(findMatPickHit(entries, fixture1.shine), card1);
  // Click on Charmander's glare overlay
  assert.equal(findMatPickHit(entries, fixture1.glare), card1);
  // Click on Charmander's bare img
  assert.equal(findMatPickHit(entries, fixture1.img), card1);
  // Click on Charmander's holo wrapper
  assert.equal(findMatPickHit(entries, fixture1.holo), card1);
  // Click on Charmander's play container
  assert.equal(findMatPickHit(entries, fixture1.container), card1);

  // Click on Pidgey's bare img
  assert.equal(findMatPickHit(entries, fixture2.img), card2);
  // Click on Pidgey's play container
  assert.equal(findMatPickHit(entries, fixture2.container), card2);

  // Click on irrelevant element
  const outside = new MockElement('div');
  assert.equal(findMatPickHit(entries, outside), null);
});
