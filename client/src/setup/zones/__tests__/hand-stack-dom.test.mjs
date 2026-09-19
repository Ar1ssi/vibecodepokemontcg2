import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearHandStackPositioning,
  reconcileHandStacks,
} from '../hand-stack-dom.js';

class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...names) {
    names.forEach((n) => this.classes.add(n));
  }
  remove(...names) {
    names.forEach((n) => this.classes.delete(n));
  }
  contains(name) {
    return this.classes.has(name);
  }
}

class MockElement {
  constructor(tagName = 'div', doc = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = doc;
    this.id = '';
    this.classList = new MockClassList();
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.style = {};
    this.src = '';
    this.alt = '';
  }

  get className() {
    return Array.from(this.classList.classes).join(' ');
  }

  set className(val) {
    this.classList.classes = new Set(String(val).split(' ').filter(Boolean));
  }

  appendChild(child) {
    if (!child) return child;
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const match = (el) => {
      if (selector.startsWith('#') && el.id === selector.slice(1)) return true;
      if (selector.startsWith('.') && el.classList.contains(selector.slice(1)))
        return true;
      if (selector === 'img' && el.tagName === 'IMG') return true;
      return false;
    };

    const traverse = (node) => {
      for (const child of node.children) {
        if (match(child)) results.push(child);
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (
        selector.startsWith('.') &&
        curr.classList?.contains(selector.slice(1))
      )
        return curr;
      if (selector.startsWith('#') && curr.id === selector.slice(1))
        return curr;
      curr = curr.parentNode;
    }
    return null;
  }
}

class MockDocument {
  constructor() {
    this.elementsById = new Map();
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElement(id, el) {
    el.id = id;
    this.elementsById.set(id, el);
    return el;
  }
}

function createCardImg(doc, name, src = 'https://example.com/card.png') {
  const img = doc.createElement('img');
  img.alt = name;
  img.src = src;
  img.card = { name };
  return img;
}

test('reconcileHandStacks: empty hand does not throw and leaves 0 children', () => {
  const doc = new MockDocument();
  const hand = doc.registerElement('hand', doc.createElement('div'));

  reconcileHandStacks('self', { document: doc });
  assert.equal(hand.children.length, 0);
});

test('reconcileHandStacks: unique cards remain direct children without stacks or badges', () => {
  const doc = new MockDocument();
  const hand = doc.registerElement('hand', doc.createElement('div'));

  const c1 = createCardImg(doc, 'Rare Candy');
  const c2 = createCardImg(doc, 'Ultra Ball');
  const c3 = createCardImg(doc, 'Nest Ball');

  hand.appendChild(c1);
  hand.appendChild(c2);
  hand.appendChild(c3);

  reconcileHandStacks('self', { document: doc });

  assert.equal(hand.children.length, 3);
  assert.equal(hand.querySelectorAll('.hand-card-stack').length, 0);
  assert.equal(hand.querySelectorAll('.hand-card-stack__badge').length, 0);
});

test('reconcileHandStacks: 2 duplicate cards stack with badge and stepped offsets', () => {
  const doc = new MockDocument();
  const hand = doc.registerElement('hand', doc.createElement('div'));

  const rc1 = createCardImg(doc, 'Rare Candy');
  const rc2 = createCardImg(doc, 'Rare Candy');
  const ub = createCardImg(doc, 'Ultra Ball');

  hand.appendChild(rc1);
  hand.appendChild(rc2);
  hand.appendChild(ub);

  reconcileHandStacks('self', { document: doc });

  // 1 stack for Rare Candy, 1 direct child for Ultra Ball
  assert.equal(hand.children.length, 2);

  const stack = hand.querySelector('.hand-card-stack');
  assert.ok(stack, 'Should create a .hand-card-stack element');
  assert.equal(stack.dataset.cardName, 'Rare Candy');
  assert.equal(stack.dataset.stackCount, '2');

  const badge = stack.querySelector('.hand-card-stack__badge');
  assert.ok(badge, 'Should create badge');
  assert.equal(badge.textContent, '2');

  // Back card has translateY(-14px) and stacked-back class
  assert.equal(rc2.style.transform, 'translateY(-14px)');
  assert.ok(rc2.classList.contains('hand-card--stacked-back'));

  // Front card has translateY(0) and stacked-front class
  assert.equal(rc1.style.transform, 'translateY(0)');
  assert.ok(rc1.classList.contains('hand-card--stacked-front'));

  // Ultra ball remains unstacked
  assert.equal(ub.parentNode, hand);
  assert.equal(ub.style.transform, '');
});

test('reconcileHandStacks: playing 1 card from 2-stack unwraps the remaining card', () => {
  const doc = new MockDocument();
  const hand = doc.registerElement('hand', doc.createElement('div'));

  const rc1 = createCardImg(doc, 'Rare Candy');
  const rc2 = createCardImg(doc, 'Rare Candy');

  hand.appendChild(rc1);
  hand.appendChild(rc2);

  reconcileHandStacks('self', { document: doc });
  assert.equal(hand.children.length, 1);
  assert.ok(hand.children[0].classList.contains('hand-card-stack'));

  // Simulate user playing rc1: rc1 is moved to discard/board
  rc1.remove();

  // Reconcile hand after play
  reconcileHandStacks('self', { document: doc });

  // Now only rc2 is in hand, and it must be unwrapped
  assert.equal(hand.children.length, 1);
  assert.equal(hand.children[0], rc2);
  assert.equal(hand.querySelectorAll('.hand-card-stack').length, 0);
  assert.equal(hand.querySelectorAll('.hand-card-stack__badge').length, 0);
  assert.equal(rc2.style.transform, '');
  assert.equal(rc2.style.position, '');
  assert.ok(!rc2.classList.contains('hand-card--stacked-front'));
  assert.ok(!rc2.classList.contains('hand-card--stacked-back'));
});

test('reconcileHandStacks: 3 duplicate cards create 2 stepped back layers and badge "3"', () => {
  const doc = new MockDocument();
  const hand = doc.registerElement('hand', doc.createElement('div'));

  const c1 = createCardImg(doc, 'Basic Psychic Energy');
  const c2 = createCardImg(doc, 'Basic Psychic Energy');
  const c3 = createCardImg(doc, 'Basic Psychic Energy');

  hand.appendChild(c1);
  hand.appendChild(c2);
  hand.appendChild(c3);

  reconcileHandStacks('self', { document: doc });

  const stack = hand.querySelector('.hand-card-stack');
  assert.ok(stack);
  assert.equal(stack.dataset.stackCount, '3');

  const badge = stack.querySelector('.hand-card-stack__badge');
  assert.equal(badge.textContent, '3');

  assert.equal(c1.style.transform, 'translateY(0)');
  assert.equal(c2.style.transform, 'translateY(-14px)');
  assert.equal(c3.style.transform, 'translateY(-28px)');
});

test('reconcileHandStacks: hidden card backs are never stacked', () => {
  const doc = new MockDocument();
  const hand = doc.registerElement('hand', doc.createElement('div'));

  const back1 = createCardImg(doc, '', 'https://example.com/cardback.png');
  const back2 = createCardImg(doc, '', 'https://example.com/cardback.png');

  hand.appendChild(back1);
  hand.appendChild(back2);

  reconcileHandStacks('self', { document: doc });

  assert.equal(hand.children.length, 2);
  assert.equal(hand.querySelectorAll('.hand-card-stack').length, 0);
});

// S181 live report: "the Pokémon is invisible in the Active spot but still takes up the
// space". A stacked card carries `position: absolute` + `width/height: 100%` +
// `translateY(-Npx)` inline; playing it to Active used to keep them, and inline styles
// outrank `.play-container img` / `.play-container .mat-holo`, so it stopped drawing where
// its slot was. Cleared on the way out, the card arrives clean.
test('a card leaving a duplicate stack loses every stack style', () => {
  const doc = new MockDocument();
  const hand = doc.registerElement('hand', doc.createElement('div'));

  const front = createCardImg(doc, 'Rare Candy');
  const back = createCardImg(doc, 'Rare Candy');
  hand.appendChild(front);
  hand.appendChild(back);

  reconcileHandStacks('self', { document: doc });

  // The reconciler really did write the styles this fix exists to undo.
  assert.equal(back.style.position, 'absolute');
  assert.equal(back.style.transform, 'translateY(-14px)');
  const writtenKeys = Object.keys(back.style).filter(
    (k) => back.style[k] !== ''
  );
  assert.ok(
    writtenKeys.length >= 8,
    `expected the full stack style set, got ${writtenKeys}`
  );

  clearHandStackPositioning(back);
  clearHandStackPositioning(front);

  // Nothing may survive onto the board: this also fails if a future stack style is added
  // to the reconciler without being added to the clearer.
  assert.deepEqual(
    Object.keys(back.style).filter((k) => back.style[k] !== ''),
    [],
    'a played card must keep no stack inline styles'
  );
  assert.deepEqual(
    Object.keys(front.style).filter((k) => front.style[k] !== ''),
    []
  );
  assert.equal(back.classList.contains('hand-card--stacked-back'), false);
  assert.equal(front.classList.contains('hand-card--stacked-front'), false);
});

test('clearing stack positioning leaves other cards and non-elements alone', () => {
  const doc = new MockDocument();
  const plain = createCardImg(doc, 'Pikachu');
  plain.style.width = 'auto';

  clearHandStackPositioning(plain);
  assert.equal(
    plain.style.width,
    'auto',
    'an unstacked card keeps its own styles'
  );

  assert.doesNotThrow(() => clearHandStackPositioning(null));
  assert.doesNotThrow(() => clearHandStackPositioning(undefined));
  assert.doesNotThrow(() => clearHandStackPositioning({}));
});
