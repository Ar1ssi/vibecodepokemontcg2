import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { HOVER_DWELL_MS, previewPlacement, gutterBox } from '../hover-preview-model.mjs';
import { GUTTER_PROBE_CLASS, HOVER_HOST_ID, createHoverPreview } from '../hover-preview-dom.mjs';

// The main page and one playmat iframe are separate documents, as in the browser. Timers and the
// clock are hand-cranked on the main window, which owns the model.
const setup = ({ isEnabled = () => true, isModalOpen = () => false, cardBackSrc = () => undefined } = {}) => {
  const main = new JSDOM('<body><div id="battleMat"></div><div id="stadium"></div></body>', {
    pretendToBeVisual: true,
  });
  const frame = new JSDOM('<body><div id="playfield"><div id="bench"></div><div id="hand"></div></div></body>');
  const win = main.window;
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  win.setTimeout = (fn, ms) => {
    const id = nextId++;
    timers.set(id, { fn, due: time + ms });
    return id;
  };
  win.clearTimeout = (id) => timers.delete(id);
  Object.defineProperty(win, 'performance', { value: { now: () => time } });
  Object.defineProperty(win, 'innerWidth', { value: 1920 });
  Object.defineProperty(win, 'innerHeight', { value: 1080 });
  const advance = (ms) => {
    time += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.due <= time) {
        timers.delete(id);
        timer.fn();
      }
    }
  };
  const rect = (el, box) => {
    el.getBoundingClientRect = () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height });
  };
  rect(main.window.document.getElementById('battleMat'), { left: 0, top: 0, width: 1450, height: 1080 });

  const preview = createHoverPreview({ doc: win.document, isEnabled, isModalOpen, cardBackSrc });
  preview.install(win.document, { within: '#stadium' });
  preview.install(frame.window.document);
  const probe = frame.window.document.querySelector(`.${GUTTER_PROBE_CLASS}`);
  if (probe) rect(probe, { left: 201, top: 0, width: 1047, height: 1080 });
  return { main, frame, preview, advance, rect, probe };
};

const addCard = (doc, parent, card, { rect = { left: 600, top: 700, width: 100, height: 140 }, holo = false } = {}) => {
  const img = doc.createElement('img');
  img.setAttribute('src', card.src ?? '');
  img.card = card;
  img.user = 'self';
  img.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height });
  if (holo) {
    const wrapper = doc.createElement('div');
    wrapper.className = 'card mat-holo';
    const shine = doc.createElement('div');
    shine.className = 'card__shine';
    wrapper.append(img, shine);
    parent.appendChild(wrapper);
  } else {
    parent.appendChild(img);
  }
  return img;
};

const pointer = (target, type, { relatedTarget = null, pointerType = 'mouse', buttons = 0 } = {}) => {
  const win = target.ownerDocument.defaultView;
  const event = new win.MouseEvent(type, { bubbles: true, relatedTarget, buttons });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
};

const hostOf = (main) => main.window.document.getElementById(HOVER_HOST_ID);
const shownSrc = (main) => {
  const host = hostOf(main);
  if (!host?.classList.contains('is-shown')) return null;
  return host.querySelector('img')?.getAttribute('src') ?? null;
};

const card = (name, extra = {}) => ({ name, src: `https://img.test/${name}/low.webp`, ...extra });

describe('069 hover preview DOM — dwell and placement', () => {
  it('shows a hovered bench card after 800 ms, not before', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const img = addCard(doc, doc.getElementById('bench'), card('Pikachu'));
    pointer(img, 'pointerover');
    advance(HOVER_DWELL_MS - 1);
    assert.equal(shownSrc(main), null);
    advance(1);
    assert.equal(shownSrc(main), 'https://img.test/Pikachu/low.webp', 'board art first; high-res swaps in on load');
  });

  it('places the preview in the band left of the probe', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const img = addCard(doc, doc.getElementById('bench'), card('Pikachu'));
    pointer(img, 'pointerover');
    advance(HOVER_DWELL_MS);
    const host = hostOf(main);
    const expected = previewPlacement({
      gutter: gutterBox({
        boardRect: { left: 0, top: 0, width: 1450, height: 1080 },
        probeRects: [{ left: 201, top: 0, width: 1047, height: 1080 }],
        viewport: { width: 1920, height: 1080 },
      }),
      boardRect: { left: 0, top: 0, width: 1450, height: 1080 },
      sourceRect: { left: 600, top: 700, width: 100, height: 140 },
      viewport: { width: 1920, height: 1080 },
    });
    assert.equal(host.style.left, `${expected.left}px`);
    assert.equal(host.style.top, `${expected.top}px`);
    assert.equal(host.style.width, `${expected.width}px`);
    assert.equal(host.style.height, `${expected.height}px`);
    assert.equal(host.dataset.mode, 'band');
    assert.ok(expected.left + expected.width <= 201, 'the preview stays left of the mat art');
  });

  it('the host never takes pointer input and is hidden from assistive tech', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    pointer(addCard(doc, doc.getElementById('bench'), card('Pikachu')), 'pointerover');
    advance(HOVER_DWELL_MS);
    assert.equal(hostOf(main).getAttribute('aria-hidden'), 'true');
  });
});

describe('069 hover preview DOM — sweep and leave', () => {
  it('swaps instantly to the next card in a sweep (A3)', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const bench = doc.getElementById('bench');
    const a = addCard(doc, bench, card('Pikachu'));
    const b = addCard(doc, bench, card('Raichu'));
    pointer(a, 'pointerover');
    advance(HOVER_DWELL_MS);
    pointer(a, 'pointerout', { relatedTarget: b });
    pointer(b, 'pointerover', { relatedTarget: a });
    assert.equal(shownSrc(main), 'https://img.test/Raichu/low.webp');
  });

  it('moving onto the card\'s own holo layer is not a leave', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const img = addCard(doc, doc.getElementById('bench'), card('Pikachu'), { holo: true });
    const shine = img.parentElement.querySelector('.card__shine');
    pointer(img, 'pointerover');
    advance(HOVER_DWELL_MS);
    pointer(img, 'pointerout', { relatedTarget: shine });
    pointer(shine, 'pointerover', { relatedTarget: img });
    assert.equal(shownSrc(main), 'https://img.test/Pikachu/low.webp');
  });

  it('leaving to empty mat hides it, and the content clears after the fade', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const img = addCard(doc, doc.getElementById('bench'), card('Pikachu'));
    pointer(img, 'pointerover');
    advance(HOVER_DWELL_MS);
    pointer(img, 'pointerout', { relatedTarget: doc.getElementById('playfield') });
    assert.equal(shownSrc(main), null);
    advance(80);
    assert.equal(hostOf(main).childElementCount, 0);
  });

  it('pointerdown hides it at once (click/drag behave as before)', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const img = addCard(doc, doc.getElementById('bench'), card('Pikachu'));
    pointer(img, 'pointerover');
    advance(HOVER_DWELL_MS);
    pointer(img, 'pointerdown', { buttons: 1 });
    assert.equal(shownSrc(main), null);
  });

  it('a touch pointer never arms', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    pointer(addCard(doc, doc.getElementById('bench'), card('Pikachu')), 'pointerover', { pointerType: 'touch' });
    advance(HOVER_DWELL_MS * 2);
    assert.equal(shownSrc(main), null);
  });
});

describe('069 hover preview DOM — what may preview', () => {
  it('hovering an attached Energy previews the top Pokémon (A5)', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const container = doc.createElement('div');
    container.className = 'play-container';
    doc.getElementById('bench').appendChild(container);
    const basic = card('Charmander', { instanceId: 1, supertype: 'Pokémon', stage: 'Basic', hp: 70 });
    const stage1 = card('Charmeleon', { instanceId: 2, attachedTo: 1, supertype: 'Pokémon', stage: 'Stage 1', hp: 90 });
    const energy = card('Fire Energy', { instanceId: 3, attachedTo: 1, supertype: 'Energy' });
    addCard(doc, container, basic);
    addCard(doc, container, stage1);
    const token = addCard(doc, container, energy);
    pointer(token, 'pointerover');
    advance(HOVER_DWELL_MS);
    assert.equal(shownSrc(main), 'https://img.test/Charmeleon/low.webp');
  });

  it('a redacted (face-down) card never previews', () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const img = addCard(doc, doc.getElementById('hand'), { name: '', src: '' });
    img.setAttribute('src', '/src/assets/cardback.png');
    pointer(img, 'pointerover');
    advance(HOVER_DWELL_MS);
    assert.equal(hostOf(main), null);
  });

  it('a card drawn with its sleeve up never previews, even unredacted (legacy)', () => {
    const sleeve = 'https://sleeves.test/back.png';
    const { main, frame, advance } = setup({ cardBackSrc: () => sleeve });
    const doc = frame.window.document;
    const img = addCard(doc, doc.getElementById('hand'), card('Secret'));
    img.setAttribute('src', sleeve);
    pointer(img, 'pointerover');
    advance(HOVER_DWELL_MS);
    assert.equal(hostOf(main), null);
  });

  it('the setting off, or a modal open, blocks it', () => {
    for (const deps of [{ isEnabled: () => false }, { isModalOpen: () => true }]) {
      const { main, frame, advance } = setup(deps);
      const doc = frame.window.document;
      pointer(addCard(doc, doc.getElementById('bench'), card('Pikachu')), 'pointerover');
      advance(HOVER_DWELL_MS);
      assert.equal(shownSrc(main), null);
    }
  });

  it('suppress("setting") hides a shown preview', () => {
    const { main, frame, preview, advance } = setup();
    const doc = frame.window.document;
    pointer(addCard(doc, doc.getElementById('bench'), card('Pikachu')), 'pointerover');
    advance(HOVER_DWELL_MS);
    preview.suppress('setting');
    assert.equal(shownSrc(main), null);
  });

  it('in the main document only the Stadium previews', () => {
    const { main, advance } = setup();
    const doc = main.window.document;
    const stray = addCard(doc, doc.body, card('Stray'));
    pointer(stray, 'pointerover');
    advance(HOVER_DWELL_MS);
    assert.equal(shownSrc(main), null);
    const stadium = addCard(doc, doc.getElementById('stadium'), card('Stadium'));
    pointer(stadium, 'pointerover');
    advance(HOVER_DWELL_MS);
    assert.equal(shownSrc(main), 'https://img.test/Stadium/low.webp');
  });
});

describe('069 hover preview DOM — board re-render', () => {
  it('hides when the shown card is removed from the board', async () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const img = addCard(doc, doc.getElementById('bench'), card('Pikachu'));
    pointer(img, 'pointerover');
    advance(HOVER_DWELL_MS);
    img.remove();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shownSrc(main), null);
  });

  it('hides when the shown card flips face down in place', async () => {
    const { main, frame, advance } = setup();
    const doc = frame.window.document;
    const img = addCard(doc, doc.getElementById('bench'), card('Pikachu'));
    pointer(img, 'pointerover');
    advance(HOVER_DWELL_MS);
    img.card = { name: '', src: '' };
    img.setAttribute('src', '/src/assets/cardback.png');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shownSrc(main), null);
  });

  it('install is idempotent and adds one probe per iframe document', () => {
    const { frame, preview } = setup();
    preview.install(frame.window.document);
    assert.equal(frame.window.document.querySelectorAll(`.${GUTTER_PROBE_CLASS}`).length, 1);
  });
});
