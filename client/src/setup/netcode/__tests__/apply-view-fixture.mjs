// Shared fixtures for the apply-view unit tests (design 074 F2): a mock DOM with
// both mats, plus the board-mode seam. apply-view.test.mjs runs every behavioural
// case under both boards; apply-view-dom-layout.test.mjs holds the px layout cases
// the 3D board skips (its scene lays cards and overlays out instead).
import { test } from 'node:test';
import {
  getCardRegistry,
  resetRenderState as resetApplyViewState,
  setDefaultNetcodeContext,
} from '../apply-view.js';

export const BOARD_MODES = [
  { label: 'iframe board', board3d: false },
  { label: '3D board', board3d: true },
];

let board3dOn = false;

export function setBoardMode(board3d) {
  board3dOn = board3d;
  setDefaultNetcodeContext({ isBoard3dActive: () => board3dOn });
}

/** apply-view's reset, which also drops the context, keeping the current board mode. */
export function resetRenderState() {
  resetApplyViewState();
  setBoardMode(board3dOn);
}

/** Registers one case per board mode, each starting from a fresh render state. */
export function testInBothBoardModes(name, fn) {
  for (const { label, board3d } of BOARD_MODES) {
    test(`${name} [${label}]`, (t) => {
      board3dOn = board3d;
      resetRenderState();
      return fn(t);
    });
  }
}

export class MockClassList {
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

export class MockElement {
  constructor(tagName = 'div', doc = null) {
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.ownerDocument = doc;
    this.id = '';
    this.classList = new MockClassList();
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.textContent = '';
    this.disabled = false;
    this.style = {};
  }

  get className() {
    return Array.from(this.classList.classes).join(' ');
  }

  set className(val) {
    this.classList.classes = new Set(String(val).split(' ').filter(Boolean));
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
    if (name === 'id') this.id = String(val);
    if (name === 'class') {
      this.className = String(val);
      this.classList.classes = new Set(String(val).split(' ').filter(Boolean));
    }
    if (name === 'src') this.src = String(val);
  }

  getAttribute(name) {
    if (name === 'src' && this.src) return this.src;
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
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

  insertBefore(child, reference) {
    if (!reference) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.splice(this.children.indexOf(reference), 0, child);
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

  append(...nodes) {
    nodes.forEach((n) => this.appendChild(n));
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(fn);
  }

  dispatchEvent(event) {
    const fns = this.listeners.get(event.type) || [];
    fns.forEach((fn) => fn(event));
    return true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const match = (el) => {
      if (selector.startsWith('#') && el.id === selector.slice(1)) return true;
      if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) return true;
      if (selector === 'img' && el.tagName === 'IMG') return true;
      if (selector.startsWith('img[data-instance-id=')) {
        const id = selector.match(/data-instance-id="([^"]+)"/)?.[1];
        if (el.tagName === 'IMG' && el.dataset.instanceId === id) return true;
      }
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
}

export class MockDocument {
  constructor() {
    this.body = new MockElement('body', this);
    this.elementsById = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(fn);
  }

  dispatchEvent(event) {
    const fns = this.listeners.get(event.type) || [];
    fns.forEach((fn) => fn(event));
    return true;
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }

  getElementById(id) {
    if (this.elementsById.has(id)) return this.elementsById.get(id);
    const found = this.body.querySelector(`#${id}`);
    if (found) return found;
    return null;
  }

  registerElement(id, el) {
    el.id = id;
    this.elementsById.set(id, el);
    this.body.appendChild(el);
    return el;
  }
}

export const COVER_ZONE_IDS = ['deck', 'discard', 'lostZone'];

export function setupMockDom() {
  const doc = new MockDocument();
  doc.registerElement('stadium', doc.createElement('div'));

  const selfMat = doc.registerElement('selfMat', doc.createElement('div'));
  const oppMat = doc.registerElement('oppMat', doc.createElement('div'));

  const selfCovers = {};
  const oppCovers = {};

  ['hand', 'active', 'bench', 'discard', 'prizes', 'lostZone', 'deck'].forEach((zid) => {
    const sEl = doc.createElement('div');
    sEl.id = zid;
    selfMat.appendChild(sEl);

    const oEl = doc.createElement('div');
    oEl.id = zid;
    oppMat.appendChild(oEl);

    if (COVER_ZONE_IDS.includes(zid)) {
      const sCover = doc.createElement('div');
      sCover.id = `${zid}Cover`;
      selfMat.appendChild(sCover);
      selfCovers[zid] = sCover;

      const oCover = doc.createElement('div');
      oCover.id = `${zid}Cover`;
      oppMat.appendChild(oCover);
      oppCovers[zid] = oCover;
    }
  });

  const mockGetZone = (side, zoneId) => {
    const root = side === 'you' ? selfMat : oppMat;
    const covers = side === 'you' ? selfCovers : oppCovers;
    const element = root.querySelector(`#${zoneId}`);
    return { element, array: [], elementCover: covers[zoneId] || null };
  };

  return { doc, mockGetZone, selfCovers, oppCovers };
}

// Stands in for hydrate-holo.js: wraps the <img> in a `.mat-holo` node the way
// hydrateHolo does (synchronously here), and unwraps it back in place.
export function fakeHolo(doc) {
  return {
    hydrate(card) {
      if (card.wrapper) return Promise.resolve(card.wrapper);
      const wrapper = doc.createElement('div');
      wrapper.className = 'mat-holo';
      card.image.parentNode.appendChild(wrapper);
      wrapper.appendChild(card.image);
      card.wrapper = wrapper;
      return Promise.resolve(wrapper);
    },
    unhydrate(card) {
      const wrapper = card.wrapper;
      if (!wrapper) return;
      wrapper.parentNode?.appendChild(card.image);
      wrapper.parentNode?.removeChild(wrapper);
      card.wrapper = undefined;
    },
  };
}

// Mock elements have no layout; give every registered card a real-looking size
// and re-apply, the way a loaded image would measure in the browser.
export function sizeRegisteredCards(width, height) {
  for (const record of getCardRegistry().values()) {
    record.element.clientWidth = width;
    record.element.clientHeight = height;
  }
}
