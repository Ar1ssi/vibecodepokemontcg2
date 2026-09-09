import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import {
  applyView,
  getLastRenderedVersion,
  resetRenderState,
  getCardRegistry,
  setDefaultNetcodeContext,
  getDefaultNetcodeContext,
  reconcileGameEnded,
  reconcileTurnState,
  hasAuthoritativeView,
  getAuthoritativeZoneArray,
  getAuthoritativeStadiumArray,
} from '../apply-view.js';

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

class MockDocument {
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

const COVER_ZONE_IDS = ['deck', 'discard', 'lostZone'];

function setupMockDom() {
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

beforeEach(() => {
  resetRenderState();
});

test('§0.2 guard: a renderer with no resolvable zone (real resolveZone fallback, not injected) writes nothing', () => {
  // No options.getZone, no options.document, and no window/window.__getZone in this
  // Node test environment: resolveZone's real fallback chain has nothing to resolve
  // against, so it must return a null element and applyView must refuse to render.
  const view = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: { hand: [{ instanceId: 101, name: 'Pikachu', src: 'pikachu.png' }] },
    },
    them: { playerId: 'p2', zones: { hand: [{ instanceId: 201 }] } },
  };

  const res = applyView(view, []);

  assert.equal(res.applied, false);
  assert.equal(res.reason, 'no_render_target');
  assert.equal(getLastRenderedVersion(), -1);
  assert.equal(getCardRegistry().size, 0);
});

test('Edge Case 8: monotonic stateVersion drops out-of-order and duplicate views', () => {
  const { doc, mockGetZone } = setupMockDom();

  const v5 = {
    stateVersion: 5,
    you: { playerId: 'p1', zones: { hand: [] } },
    them: { playerId: 'p2', zones: { hand: [] } },
  };

  const res1 = applyView(v5, [], { document: doc, getZone: mockGetZone });
  assert.equal(res1.applied, true);
  assert.equal(getLastRenderedVersion(), 5);

  // Duplicate stateVersion 5 dropped
  const res2 = applyView(v5, [], { document: doc, getZone: mockGetZone });
  assert.equal(res2.applied, false);
  assert.equal(res2.reason, 'out_of_order');

  // Stale stateVersion 4 dropped
  const v4 = {
    stateVersion: 4,
    you: { playerId: 'p1', zones: { hand: [] } },
    them: { playerId: 'p2', zones: { hand: [] } },
  };
  const res3 = applyView(v4, [], { document: doc, getZone: mockGetZone });
  assert.equal(res3.applied, false);
  assert.equal(res3.reason, 'out_of_order');

  // Higher stateVersion 6 accepted
  const v6 = {
    stateVersion: 6,
    you: { playerId: 'p1', zones: { hand: [] } },
    them: { playerId: 'p2', zones: { hand: [] } },
  };
  const res4 = applyView(v6, [], { document: doc, getZone: mockGetZone });
  assert.equal(res4.applied, true);
  assert.equal(getLastRenderedVersion(), 6);
});

test('Invariant 5: Redaction correctly renders cardback for redacted opponent cards and real art for owner', () => {
  const { doc, mockGetZone } = setupMockDom();

  const view = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        hand: [{ instanceId: 101, name: 'Pikachu', src: 'pikachu.png' }],
      },
    },
    them: {
      playerId: 'p2',
      zones: {
        hand: [{ instanceId: 201 }], // Redacted stub (no name/src)
      },
    },
  };

  const res = applyView(view, [], {
    document: doc,
    getZone: mockGetZone,
    cardBackSrc: 'cardback.png',
  });
  assert.equal(res.applied, true);

  const registry = getCardRegistry();
  const p1Card = registry.get(101);
  const p2Card = registry.get(201);

  assert.ok(p1Card);
  assert.ok(p2Card);

  assert.equal(p1Card.element.getAttribute('src'), 'pikachu.png');
  assert.equal(p2Card.element.getAttribute('src'), 'cardback.png');
});

test('Zone moves: active pokemon wrapped in play-container and attachments nested correctly', () => {
  const { doc, mockGetZone } = setupMockDom();

  // Step 1: Pikachu and Energy in hand
  const v1 = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        hand: [
          { instanceId: 10, name: 'Pikachu', src: 'pikachu.png' },
          { instanceId: 11, name: 'Lightning Energy', src: 'energy.png' },
        ],
        active: [],
      },
    },
  };

  applyView(v1, [], { document: doc, getZone: mockGetZone });

  const selfHand = doc.getElementById('selfMat').querySelector('#hand');
  const selfActive = doc.getElementById('selfMat').querySelector('#active');

  assert.equal(selfHand.querySelectorAll('img').length, 2);
  assert.equal(selfActive.querySelectorAll('img').length, 0);

  // Step 2: Pikachu moved to active, Energy attached to Pikachu
  const v2 = {
    stateVersion: 2,
    you: {
      playerId: 'p1',
      zones: {
        hand: [],
        active: [
          { instanceId: 10, name: 'Pikachu', src: 'pikachu.png', damage: 20 },
          { instanceId: 11, name: 'Lightning Energy', src: 'energy.png', attachedTo: 10 },
        ],
      },
    },
  };

  applyView(v2, [], { document: doc, getZone: mockGetZone });

  assert.equal(selfHand.querySelectorAll('img').length, 0);

  const playContainers = selfActive.querySelectorAll('.play-container');
  assert.equal(playContainers.length, 1);

  const pikachuImg = playContainers[0].querySelector('img[data-instance-id="10"]');
  const energyImg = playContainers[0].querySelector('img[data-instance-id="11"]');

  assert.ok(pikachuImg, 'Pikachu should be inside play-container');
  assert.ok(energyImg, 'Attached Energy should be inside play-container');
  assert.equal(pikachuImg.dataset.damage, '20');
  assert.equal(energyImg.classList.contains('attached-card'), true);
});

test('Neutral Stadium: reconciles top-level stadium element', () => {
  const { doc, mockGetZone } = setupMockDom();

  const v1 = {
    stateVersion: 1,
    stadium: { instanceId: 99, name: 'Artazon', src: 'artazon.png' },
    you: { zones: {} },
    them: { zones: {} },
  };

  applyView(v1, [], { document: doc, getZone: mockGetZone });

  const stadiumEl = doc.getElementById('stadium');
  const stadiumImg = stadiumEl.querySelector('img');
  assert.ok(stadiumImg);
  assert.equal(stadiumImg.getAttribute('src'), 'artazon.png');

  // Step 2: Stadium discarded
  const v2 = {
    stateVersion: 2,
    stadium: null,
    you: { zones: {} },
    them: { zones: {} },
  };

  applyView(v2, [], { document: doc, getZone: mockGetZone });
  assert.equal(stadiumEl.querySelectorAll('img').length, 0);
});

test('§0.2 guard: stadium-wipe repro no longer reproduces when the renderer is blind', () => {
  // Production shape: #stadium lives in the top-level document, but there is no
  // resolvable 'active' zone (the real board zones live inside iframes). Legacy has
  // already rendered a played Stadium into #stadium. A blind authoritative view whose
  // stadium is null (the untranslated-action case from design 002) must not wipe it.
  const doc = new MockDocument();
  const legacyStadiumEl = doc.registerElement('stadium', doc.createElement('div'));
  const legacyStadiumImg = doc.createElement('img');
  legacyStadiumImg.setAttribute('src', 'artazon.png');
  legacyStadiumEl.appendChild(legacyStadiumImg);

  const view = {
    stateVersion: 1,
    stadium: null,
    you: { zones: { hand: [] } },
    them: { zones: { hand: [] } },
  };

  const res = applyView(view, [], { document: doc });

  assert.equal(res.applied, false);
  assert.equal(res.reason, 'no_render_target');
  assert.equal(legacyStadiumEl.querySelectorAll('img').length, 1);
  assert.equal(getLastRenderedVersion(), -1);
});

test('PendingChoice: mounts modal for owner and waiting banner for opponent', () => {
  const { doc, mockGetZone } = setupMockDom();

  // Choice belongs to local player p1
  const v1 = {
    stateVersion: 1,
    pendingChoice: {
      choiceId: 'choice_p1_1',
      player: 'p1',
      prompt: 'Select 1 card',
      options: [
        { instanceId: 1, name: 'Card 1', src: 'c1.png' },
        { instanceId: 2, name: 'Card 2', src: 'c2.png' },
      ],
      min: 1,
      max: 1,
    },
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  };

  let resolvedChoice = null;
  applyView(v1, [], {
    document: doc,
    getZone: mockGetZone,
    onResolveChoice: (sel) => {
      resolvedChoice = sel;
    },
  });

  const modal = doc.getElementById('netcodeChoiceModal');
  assert.ok(modal, 'Modal should be mounted');
  const optionCards = modal.querySelectorAll('.choice-option-card');
  assert.equal(optionCards.length, 2);

  const confirmBtn = modal.querySelector('#choiceConfirmBtn');
  assert.equal(confirmBtn.disabled, true);

  // Click first option
  optionCards[0].dispatchEvent({ type: 'click' });
  assert.equal(confirmBtn.disabled, false);

  // Click confirm
  confirmBtn.dispatchEvent({ type: 'click' });
  assert.deepEqual(resolvedChoice, {
    choiceId: 'choice_p1_1',
    selection: [1],
  });

  // Next view: choice belongs to opponent p2
  const v2 = {
    stateVersion: 2,
    pendingChoice: {
      choiceId: 'choice_p2_1',
      player: 'p2',
      prompt: 'Discarding cards',
    },
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  };

  applyView(v2, [], { document: doc, getZone: mockGetZone });

  assert.equal(doc.getElementById('netcodeChoiceModal'), null);
  const banner = doc.getElementById('netcodeChoiceBanner');
  assert.ok(banner);
  assert.ok(banner.textContent.includes('Opponent is making a choice'));

  // Next view: no pending choice
  const v3 = {
    stateVersion: 3,
    pendingChoice: null,
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  };

  applyView(v3, [], { document: doc, getZone: mockGetZone });
  assert.equal(doc.getElementById('netcodeChoiceBanner'), null);
});

test('Invariant 4: Deleting events array leaves client DOM state completely correct', () => {
  const { doc: docWithEvents, mockGetZone: getZoneWithEvents } = setupMockDom();
  const { doc: docWithoutEvents, mockGetZone: getZoneWithoutEvents } = setupMockDom();

  const view = {
    stateVersion: 10,
    you: {
      playerId: 'p1',
      zones: {
        active: [{ instanceId: 10, name: 'Pikachu', src: 'pika.png', damage: 30 }],
        hand: [{ instanceId: 11, name: 'Energy', src: 'energy.png' }],
      },
    },
    them: {
      playerId: 'p2',
      zones: {
        active: [{ instanceId: 20, name: 'Squirtle', src: 'squirtle.png' }],
      },
    },
  };

  const advisoryEvents = [
    { type: 'cardMoved', instanceId: 10, from: 'hand', to: 'active' },
    { type: 'damageDealt', targetInstanceId: 10, amount: 30 },
  ];

  let animatedEventCount = 0;
  // Apply with full events array
  applyView(view, advisoryEvents, {
    document: docWithEvents,
    getZone: getZoneWithEvents,
    onAdvisoryEvent: () => {
      animatedEventCount++;
    },
  });

  resetRenderState();

  // Apply with EMPTY events array (events completely stripped)
  applyView(view, [], {
    document: docWithoutEvents,
    getZone: getZoneWithoutEvents,
  });

  assert.equal(animatedEventCount, 2, 'Advisory animations were called when events present');

  // Assert DOM state is identical between both documents
  const activeImg1 = docWithEvents.getElementById('selfMat').querySelector('img[data-instance-id="10"]');
  const activeImg2 = docWithoutEvents.getElementById('selfMat').querySelector('img[data-instance-id="10"]');

  assert.ok(activeImg1);
  assert.ok(activeImg2);
  assert.equal(activeImg1.dataset.damage, activeImg2.dataset.damage);
  assert.equal(activeImg1.getAttribute('src'), activeImg2.getAttribute('src'));
});

test('Finding 5: choice resolver emits resolveChoice over socket when options.socket and options.roomId provided', async () => {
  const { doc, mockGetZone } = setupMockDom();

  const view = {
    stateVersion: 1,
    pendingChoice: {
      choiceId: 'choice_audit_5a',
      player: 'p1',
      prompt: 'Select 1 card to attach',
      options: [
        { instanceId: 101, name: 'Fire Energy', src: 'fire.png' },
        { instanceId: 102, name: 'Water Energy', src: 'water.png' },
      ],
      min: 1,
      max: 1,
    },
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  };

  const emitted = [];
  const mockSocket = {
    emit(event, payload) {
      emitted.push({ event, payload });
    },
  };

  applyView(view, [], {
    document: doc,
    getZone: mockGetZone,
    socket: mockSocket,
    roomId: 'room_audit_5a',
  });

  const modal = doc.getElementById('netcodeChoiceModal');
  assert.ok(modal, 'Modal mounted');

  const optionCards = modal.querySelectorAll('.choice-option-card');
  const confirmBtn = modal.querySelector('#choiceConfirmBtn');

  // Select card 101 and confirm
  optionCards[0].dispatchEvent({ type: 'click' });
  assert.equal(confirmBtn.disabled, false);

  confirmBtn.dispatchEvent({ type: 'click' });

  // Await microtasks for async resolver
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(emitted.length, 1, 'Socket resolveChoice was emitted');
  assert.equal(emitted[0].event, 'resolveChoice');
  assert.equal(emitted[0].payload.roomId, 'room_audit_5a');
  assert.equal(emitted[0].payload.choiceId, 'choice_audit_5a');
  assert.deepEqual(emitted[0].payload.selection, [101]);
  assert.equal(doc.getElementById('netcodeChoiceModal'), null, 'Modal removed on confirm');
});

test('Finding 5: choice resolver uses setDefaultNetcodeContext fallback when options omit socket and roomId', async () => {
  const { doc, mockGetZone } = setupMockDom();

  const view = {
    stateVersion: 1,
    pendingChoice: {
      choiceId: 'choice_audit_5b',
      player: 'p1',
      prompt: 'Select 1 card to search',
      options: [
        { instanceId: 201, name: 'Ultra Ball', src: 'ub.png' },
      ],
      min: 1,
      max: 1,
    },
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  };

  const emitted = [];
  const mockSocket = {
    emit(event, payload) {
      emitted.push({ event, payload });
    },
  };

  let dynamicRoomId = 'room_audit_5b_initial';
  setDefaultNetcodeContext({
    socket: mockSocket,
    roomId: () => dynamicRoomId,
  });

  assert.equal(getDefaultNetcodeContext().socket, mockSocket);
  assert.equal(getDefaultNetcodeContext().roomId, 'room_audit_5b_initial');

  // Call applyView WITHOUT socket or roomId in options
  applyView(view, [], {
    document: doc,
    getZone: mockGetZone,
  });

  const modal = doc.getElementById('netcodeChoiceModal');
  assert.ok(modal, 'Modal mounted');

  const optionCards = modal.querySelectorAll('.choice-option-card');
  const confirmBtn = modal.querySelector('#choiceConfirmBtn');

  // Update dynamic room id to verify getter evaluation
  dynamicRoomId = 'room_audit_5b_updated';

  optionCards[0].dispatchEvent({ type: 'click' });
  confirmBtn.dispatchEvent({ type: 'click' });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(emitted.length, 1, 'Socket resolveChoice was emitted using fallback context');
  assert.equal(emitted[0].event, 'resolveChoice');
  assert.equal(emitted[0].payload.roomId, 'room_audit_5b_updated');
  assert.equal(emitted[0].payload.choiceId, 'choice_audit_5b');
  assert.deepEqual(emitted[0].payload.selection, [201]);
  assert.equal(doc.getElementById('netcodeChoiceModal'), null, 'Modal removed on confirm');
});

test('Finding 12: applyView mounts Victory modal and dispatches rules-game-ended when local player wins', () => {
  const { doc, mockGetZone } = setupMockDom();
  const eventsDispatched = [];
  doc.dispatchEvent = (event) => {
    eventsDispatched.push(event);
    return true;
  };

  const endedView = {
    gameId: 'game-ended-test-1',
    stateVersion: 10,
    turn: { phase: 'ended', player: 'p1' },
    winner: 'p1',
    winReason: 'all prize cards taken',
    you: { playerId: 'p1', username: 'Ash', zones: {} },
    them: { playerId: 'p2', username: 'Gary', zones: {} },
  };

  let callbackResult = null;
  const res = applyView(endedView, [], {
    document: doc,
    getZone: mockGetZone,
    onGameEnded: (detail) => {
      callbackResult = detail;
    },
  });

  assert.equal(res.applied, true);

  const modal = doc.getElementById('netcodeEndModal');
  assert.ok(modal, 'Game end modal should be mounted in DOM');

  const title = modal.querySelector('.game-end-modal-title');
  assert.ok(title);
  assert.equal(title.textContent, 'Victory!');
  assert.ok(title.classList.contains('winner'));

  const reason = modal.querySelector('.game-end-modal-reason');
  assert.ok(reason);
  assert.equal(reason.textContent, 'Reason: all prize cards taken');

  const gameEndedEvents = eventsDispatched.filter((e) => e.type === 'rules-game-ended');
  assert.equal(gameEndedEvents.length, 1);
  assert.equal(gameEndedEvents[0].detail.isWinner, true);
  assert.equal(gameEndedEvents[0].detail.winner, 'p1');

  assert.ok(callbackResult);
  assert.equal(callbackResult.isWinner, true);
  assert.equal(callbackResult.title, 'Victory!');

  // Clicking close button removes the modal
  const closeBtn = modal.querySelector('#netcodeEndCloseBtn');
  assert.ok(closeBtn);
  closeBtn.dispatchEvent({ type: 'click' });
  assert.equal(doc.getElementById('netcodeEndModal'), null);
});

test('Finding 12: applyView mounts Defeat modal and synchronizes rulesEndScreen when opponent wins', () => {
  const { doc, mockGetZone } = setupMockDom();
  const rulesEndScreen = doc.registerElement('rulesEndScreen', doc.createElement('div'));
  rulesEndScreen.hidden = true;
  const rulesTitle = doc.createElement('div');
  rulesTitle.className = 'rules-end-title';
  const rulesReason = doc.createElement('div');
  rulesReason.className = 'rules-end-reason';
  rulesEndScreen.appendChild(rulesTitle);
  rulesEndScreen.appendChild(rulesReason);

  const endedView = {
    gameId: 'game-ended-test-2',
    stateVersion: 12,
    turn: { phase: 'ended', player: 'p1' },
    winner: 'p2',
    winReason: 'deck-out',
    you: { playerId: 'p1', username: 'Ash', zones: {} },
    them: { playerId: 'p2', username: 'Gary', zones: {} },
  };

  applyView(endedView, [], {
    document: doc,
    getZone: mockGetZone,
  });

  const modal = doc.getElementById('netcodeEndModal');
  assert.ok(modal);
  const title = modal.querySelector('.game-end-modal-title');
  assert.equal(title.textContent, 'Defeat');
  assert.ok(title.classList.contains('loser'));

  // Existing rulesEndScreen should also be synchronized
  assert.equal(rulesEndScreen.hidden, false);
  assert.equal(rulesTitle.textContent, 'Defeat');
  assert.equal(rulesReason.textContent, 'Reason: deck-out');

  // Next non-ended view should clean up the end modals
  const activeView = {
    gameId: 'game-ended-test-2',
    stateVersion: 13,
    turn: { phase: 'main', player: 'p1' },
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(activeView, [], {
    document: doc,
    getZone: mockGetZone,
  });

  assert.equal(doc.getElementById('netcodeEndModal'), null);
  assert.equal(rulesEndScreen.hidden, true);
});

test('Finding 12: reconcileGameEnded export directly handles spectator view', () => {
  const { doc } = setupMockDom();

  const spectatorEndedView = {
    turn: { phase: 'ended' },
    isSpectator: true,
    winner: 'p1',
    winReason: 'all prize cards taken',
    them: { playerId: 'p1', username: 'Ash' },
  };

  reconcileGameEnded(spectatorEndedView, { document: doc });

  const modal = doc.getElementById('netcodeEndModal');
  assert.ok(modal);
  const title = modal.querySelector('.game-end-modal-title');
  assert.equal(title.textContent, 'Ash Wins!');
});

// --- Design 002 slice 3.6: shared image factory + real getZone wiring ---

test('Row 20: without injected cardListeners, authoritative card stays a bare non-interactive <img> (unchanged pre-3.6 behavior)', () => {
  const { doc, mockGetZone } = setupMockDom();

  const view = {
    gameId: 'g-3.6-bare',
    stateVersion: 1,
    you: { playerId: 'p1', zones: { hand: [{ instanceId: 1, name: 'Pikachu', src: '/a.png' }] } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(view, [], { document: doc, getZone: mockGetZone });

  const img = getCardRegistry().get(1).element;
  assert.equal(img.listeners.size, 0);
  assert.equal(img.card, undefined);
});

test('Row 20: with cardListeners injected, authoritative card gets the exact same listener table as legacy Card', () => {
  const { doc, mockGetZone } = setupMockDom();

  const fired = [];
  const cardListeners = {
    click: () => fired.push('click'),
    dblclick: () => fired.push('dblclick'),
    dragstart: () => fired.push('dragstart'),
    dragover: () => fired.push('dragover'),
    dragleave: () => fired.push('dragleave'),
    dragend: () => fired.push('dragend'),
    contextmenu: () => fired.push('contextmenu'),
  };

  const view = {
    gameId: 'g-3.6-listeners',
    stateVersion: 1,
    you: { playerId: 'p1', zones: { hand: [{ instanceId: 1, name: 'Pikachu', src: '/a.png' }] } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(view, [], { document: doc, getZone: mockGetZone, cardListeners });

  const img = getCardRegistry().get(1).element;
  for (const type of Object.keys(cardListeners)) {
    img.dispatchEvent({ type, target: img });
  }
  assert.deepEqual(fired.sort(), Object.keys(cardListeners).sort());

  // Read-shim for identifyCard/findZoneCardIndex, not a legacy Card instance.
  assert.equal(img.card.instanceId, 1);
  assert.equal(img.attached, false);
  assert.equal(img.user, 'self');
  assert.equal(img.getAttribute('draggable'), 'true');
});

test('Row 20: listeners are attached exactly once per element across repeated views (no double-registration)', () => {
  const { doc, mockGetZone } = setupMockDom();
  let clicks = 0;
  const cardListeners = { click: () => clicks++ };

  const v1 = {
    gameId: 'g-3.6-once',
    stateVersion: 1,
    you: { playerId: 'p1', zones: { hand: [{ instanceId: 1, name: 'Pikachu', src: '/a.png' }] } },
    them: { playerId: 'p2', zones: {} },
  };
  const v2 = { ...v1, stateVersion: 2 };

  applyView(v1, [], { document: doc, getZone: mockGetZone, cardListeners });
  applyView(v2, [], { document: doc, getZone: mockGetZone, cardListeners });

  const img = getCardRegistry().get(1).element;
  img.dispatchEvent({ type: 'click', target: img });
  assert.equal(clicks, 1);
});

test('getZone wiring: resolveZone prefers injected defaultNetcodeContext.getZone over the doc.getElementById fallback, adapting you/them to self/opp', () => {
  const { doc } = setupMockDom();
  const calls = [];
  const realGetZone = (user, zoneId) => {
    calls.push([user, zoneId]);
    const el = doc.createElement('div');
    el.id = zoneId;
    return { element: el, array: [] };
  };

  setDefaultNetcodeContext({ getZone: realGetZone });

  const view = {
    gameId: 'g-3.6-getzone',
    stateVersion: 1,
    you: { playerId: 'p1', zones: { hand: [{ instanceId: 1, name: 'Pikachu', src: '/a.png' }] } },
    them: { playerId: 'p2', zones: {} },
  };
  const res = applyView(view, [], { document: doc });

  assert.equal(res.applied, true);
  assert.ok(calls.some(([user, zoneId]) => user === 'self' && zoneId === 'active'));
  assert.ok(calls.some(([user, zoneId]) => user === 'opp' && zoneId === 'active'));
  assert.ok(calls.some(([user, zoneId]) => user === 'self' && zoneId === 'hand'));
  assert.ok(calls.every(([user]) => user === 'self' || user === 'opp'));

  resetRenderState();
});

test('getZone wiring: an explicit options.getZone test seam still overrides the injected default', () => {
  const { doc, mockGetZone } = setupMockDom();
  setDefaultNetcodeContext({
    getZone: () => {
      throw new Error('default getZone must not be called when options.getZone is provided');
    },
  });

  const view = {
    gameId: 'g-3.6-seam',
    stateVersion: 1,
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  };
  const res = applyView(view, [], { document: doc, getZone: mockGetZone });
  assert.equal(res.applied, true);

  resetRenderState();
});

// --- Design 002 slice 3.7: counter and status overlays ---

test('Row 21: damage-counter overlay created when view reports damage, removed when it drops to 0', () => {
  const { doc, mockGetZone } = setupMockDom();
  const selfActive = doc.getElementById('selfMat').querySelector('#active');

  const v1 = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: { active: [{ instanceId: 10, name: 'Pikachu', src: '/a.png', damage: 20 }] },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });

  const img = getCardRegistry().get(10).element;
  assert.ok(img.damageCounter, 'damage-counter div created');
  assert.equal(img.damageCounter.textContent, '20');
  assert.equal(img.damageCounter.classList.contains('damage-counter'), true);
  assert.equal(img.damageCounter.classList.contains('dmg-tier-10'), true);
  assert.equal(img.damageCounter.parentNode, selfActive);

  // Damage rises: same node, tier and text updated in place, no duplicate
  const v2 = {
    stateVersion: 2,
    you: {
      playerId: 'p1',
      zones: { active: [{ instanceId: 10, name: 'Pikachu', src: '/a.png', damage: 60 }] },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone });
  assert.equal(img.damageCounter.textContent, '60');
  assert.equal(img.damageCounter.classList.contains('dmg-tier-50'), true);
  assert.equal(selfActive.children.filter((c) => c === img.damageCounter).length, 1);

  // Damage cleared: overlay removed
  const v3 = {
    stateVersion: 3,
    you: {
      playerId: 'p1',
      zones: { active: [{ instanceId: 10, name: 'Pikachu', src: '/a.png', damage: 0 }] },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v3, [], { document: doc, getZone: mockGetZone });
  assert.equal(img.damageCounter, null);
  // 'active' is a play-zone: the card image lives inside a .play-container, not
  // directly in the zone element (unlike the damage-counter overlay above).
  assert.equal(img.parentNode?.parentNode, selfActive);
});

test('Row 21: special-condition overlay created from server condition word, removed when cleared', () => {
  const { doc, mockGetZone } = setupMockDom();
  const selfActive = doc.getElementById('selfMat').querySelector('#active');

  const v1 = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        active: [
          { instanceId: 20, name: 'Pikachu', src: '/a.png', specialCondition: 'Poisoned' },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });

  const img = getCardRegistry().get(20).element;
  assert.ok(img.specialCondition, 'special-condition div created');
  assert.equal(img.specialCondition.classList.contains('status-poison'), true);
  assert.equal(img.specialCondition.parentNode, selfActive);

  const v2 = {
    stateVersion: 2,
    you: {
      playerId: 'p1',
      zones: {
        active: [{ instanceId: 20, name: 'Pikachu', src: '/a.png', specialCondition: null }],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone });
  assert.equal(img.specialCondition, null);
});

test('Row 21: overlays removed from the zone element when the card itself leaves the registry', () => {
  const { doc, mockGetZone } = setupMockDom();
  const selfActive = doc.getElementById('selfMat').querySelector('#active');

  const v1 = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        active: [
          {
            instanceId: 30,
            name: 'Pikachu',
            src: '/a.png',
            damage: 30,
            specialCondition: 'Burned',
          },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });

  const img = getCardRegistry().get(30).element;
  const damageCounter = img.damageCounter;
  const specialCondition = img.specialCondition;
  assert.equal(selfActive.children.includes(damageCounter), true);
  assert.equal(selfActive.children.includes(specialCondition), true);

  // Card discarded: leaves the view entirely
  const v2 = {
    stateVersion: 2,
    you: { playerId: 'p1', zones: { active: [], discard: [] } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone });

  assert.equal(selfActive.children.includes(damageCounter), false);
  assert.equal(selfActive.children.includes(specialCondition), false);
  assert.equal(getCardRegistry().has(30), false);
});

test('Row 22 / Cover: discard/lostZone cover mirrors the real top card and updates as it changes', () => {
  const { doc, mockGetZone, selfCovers } = setupMockDom();

  const v1 = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        discard: [
          { instanceId: 1, name: 'Bulbasaur', src: '/bulbasaur.png' },
          { instanceId: 2, name: 'Charmander', src: '/charmander.png' },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });

  assert.equal(selfCovers.discard.children.length, 1);
  const coverImg = selfCovers.discard.children[0];
  assert.equal(coverImg.id, 'discardCover');
  assert.equal(coverImg.getAttribute('src'), '/charmander.png');
  assert.equal(coverImg.getAttribute('alt'), 'Charmander');

  // A third card discarded on top: cover follows the new top card, same
  // element reused (not a second competing node).
  const v2 = {
    stateVersion: 2,
    you: {
      playerId: 'p1',
      zones: {
        discard: [
          { instanceId: 1, name: 'Bulbasaur', src: '/bulbasaur.png' },
          { instanceId: 2, name: 'Charmander', src: '/charmander.png' },
          { instanceId: 3, name: 'Squirtle', src: '/squirtle.png' },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone });

  assert.equal(selfCovers.discard.children.length, 1);
  assert.equal(selfCovers.discard.children[0], coverImg);
  assert.equal(coverImg.getAttribute('src'), '/squirtle.png');
});

test('Cover: deck cover shows only the back skin (never a face) and clears when the deck empties', () => {
  const { doc, mockGetZone, selfCovers } = setupMockDom();

  const v1 = {
    stateVersion: 1,
    you: { playerId: 'p1', zones: { deck: { count: 40 } } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone, cardBackSrc: 'my-back.png' });

  assert.equal(selfCovers.deck.children.length, 1);
  assert.equal(selfCovers.deck.children[0].getAttribute('src'), 'my-back.png');

  const v2 = {
    stateVersion: 2,
    you: { playerId: 'p1', zones: { deck: { count: 0 } } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone, cardBackSrc: 'my-back.png' });

  assert.equal(selfCovers.deck.children.length, 0);
});

test('Cover: discard cover is removed once the zone is emptied', () => {
  const { doc, mockGetZone, selfCovers } = setupMockDom();

  const v1 = {
    stateVersion: 1,
    you: { playerId: 'p1', zones: { discard: [{ instanceId: 1, name: 'Bulbasaur', src: '/b.png' }] } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });
  assert.equal(selfCovers.discard.children.length, 1);

  const v2 = {
    stateVersion: 2,
    you: { playerId: 'p1', zones: { discard: [] } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone });
  assert.equal(selfCovers.discard.children.length, 0);
});

test('Finding #10: intra-zone order is reconciled to match the view array, not frozen at first placement', () => {
  const { doc, mockGetZone } = setupMockDom();
  const selfDiscard = doc.getElementById('selfMat').querySelector('#discard');

  const v1 = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        discard: [
          { instanceId: 1, name: 'A', src: '/a.png' },
          { instanceId: 2, name: 'B', src: '/b.png' },
          { instanceId: 3, name: 'C', src: '/c.png' },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });
  assert.deepEqual(
    selfDiscard.children.map((c) => c.dataset.instanceId),
    ['1', '2', '3']
  );

  // Same membership, different order (e.g. a reveal/reorder command): the
  // DOM must follow, not keep the stale first-seen order.
  const v2 = {
    stateVersion: 2,
    you: {
      playerId: 'p1',
      zones: {
        discard: [
          { instanceId: 3, name: 'C', src: '/c.png' },
          { instanceId: 1, name: 'A', src: '/a.png' },
          { instanceId: 2, name: 'B', src: '/b.png' },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone });
  assert.deepEqual(
    selfDiscard.children.map((c) => c.dataset.instanceId),
    ['3', '1', '2']
  );
});

test('Finding #10: bench play-container order follows the view array across views', () => {
  const { doc, mockGetZone } = setupMockDom();
  const selfBench = doc.getElementById('selfMat').querySelector('#bench');

  const v1 = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        bench: [
          { instanceId: 10, name: 'Pikachu', src: '/p.png' },
          { instanceId: 11, name: 'Eevee', src: '/e.png' },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });
  assert.deepEqual(
    selfBench.children.map((c) => c.dataset.instanceId),
    ['10', '11']
  );

  const v2 = {
    stateVersion: 2,
    you: {
      playerId: 'p1',
      zones: {
        bench: [
          { instanceId: 11, name: 'Eevee', src: '/e.png' },
          { instanceId: 10, name: 'Pikachu', src: '/p.png' },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone });
  assert.deepEqual(
    selfBench.children.map((c) => c.dataset.instanceId),
    ['11', '10']
  );
});

test('Finding #11: attached-card class is removed when a card moves from attached to top-level within a play zone', () => {
  const { doc, mockGetZone } = setupMockDom();
  const selfBench = doc.getElementById('selfMat').querySelector('#bench');

  const v1 = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        bench: [
          { instanceId: 10, name: 'Pikachu', src: '/p.png' },
          { instanceId: 11, name: 'Energy', src: '/en.png', attachedTo: 10 },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });

  const energyImg = getCardRegistry().get(11).element;
  assert.equal(energyImg.classList.contains('attached-card'), true);

  // Energy discarded from being attached and re-benched as its own top-level
  // card (contrived, but exercises the code path): attachedTo cleared while
  // the card stays in the same PLAY_ZONES zone.
  const v2 = {
    stateVersion: 2,
    you: {
      playerId: 'p1',
      zones: {
        bench: [
          { instanceId: 10, name: 'Pikachu', src: '/p.png' },
          { instanceId: 11, name: 'Energy', src: '/en.png' },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone });

  assert.equal(energyImg.classList.contains('attached-card'), false);
  const playContainers = selfBench.querySelectorAll('.play-container');
  assert.equal(playContainers.length, 2);
});

test('Hand sort hook: sortZoneCards reorders rendering without mutating the view, falls back to array order when absent', () => {
  const { doc, mockGetZone } = setupMockDom();
  const selfHand = doc.getElementById('selfMat').querySelector('#hand');

  const cards = [
    { instanceId: 1, name: 'A', src: '/a.png' },
    { instanceId: 2, name: 'B', src: '/b.png' },
    { instanceId: 3, name: 'C', src: '/c.png' },
  ];
  const view = {
    stateVersion: 1,
    you: { playerId: 'p1', zones: { hand: cards } },
    them: { playerId: 'p2', zones: {} },
  };

  // No hook wired: renders in the view's own array order (unchanged behavior).
  applyView(view, [], { document: doc, getZone: mockGetZone });
  assert.deepEqual(
    selfHand.children.map((c) => c.dataset.instanceId),
    ['1', '2', '3']
  );

  // Hook wired: rendering follows the hook's order; the underlying view array
  // is untouched (no mutation leaks back into game state).
  const reverseSort = (side, zoneId, zoneCards) =>
    zoneId === 'hand' ? [...zoneCards].reverse() : zoneCards;

  const view2 = {
    stateVersion: 2,
    you: { playerId: 'p1', zones: { hand: cards } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(view2, [], { document: doc, getZone: mockGetZone, sortZoneCards: reverseSort });

  assert.deepEqual(
    selfHand.children.map((c) => c.dataset.instanceId),
    ['3', '2', '1']
  );
  assert.deepEqual(
    cards.map((c) => c.instanceId),
    [1, 2, 3]
  );
});

test('Row 23: reveal/look — prize card renders real art once view.mjs reveals it, reverts to cardback when re-redacted', () => {
  const { doc, mockGetZone } = setupMockDom();
  const selfPrizes = doc.getElementById('selfMat').querySelector('#prizes');

  // v1: opponent's prize card is redacted (view.mjs's card.revealed === false path
  // — see shared/engine/view.mjs redactOwnerZones/redactOpponentZones), so the
  // stub carries only instanceId. createOrUpdateCardElement's isRedacted check
  // (no name/src) renders the shared card-back — same mechanism Invariant 5's
  // test above exercises, here for the prizes zone.
  const v1 = {
    stateVersion: 1,
    you: { playerId: 'p1', zones: { prizes: [{ instanceId: 301 }] } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone, cardBackSrc: 'cardback.png' });

  const prizeImg = getCardRegistry().get(301).element;
  assert.equal(prizeImg.getAttribute('src'), 'cardback.png');
  assert.equal(selfPrizes.querySelectorAll('img').length, 1);

  // v2: card.revealed flips true server-side, so view.mjs now sends the full
  // sanitized card (name + src) for instanceId 301 — same registry entry, no
  // new node, src swaps to the real art. This is the "overlay renders from
  // the view" half of edge case row 23.
  const v2 = {
    stateVersion: 2,
    you: {
      playerId: 'p1',
      zones: { prizes: [{ instanceId: 301, name: 'Boss Orders', src: 'boss.png' }] },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone, cardBackSrc: 'cardback.png' });

  assert.equal(prizeImg.getAttribute('src'), 'boss.png');
  assert.equal(prizeImg.getAttribute('alt'), 'Boss Orders');

  // v3: card.revealed flips back false, view.mjs redacts it again — the "clears
  // when the view clears it" half. Same element, reverts to card-back rather
  // than being torn down and rebuilt (registry entry unchanged, one node total).
  const v3 = {
    stateVersion: 3,
    you: { playerId: 'p1', zones: { prizes: [{ instanceId: 301 }] } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v3, [], { document: doc, getZone: mockGetZone, cardBackSrc: 'cardback.png' });

  assert.equal(prizeImg.getAttribute('src'), 'cardback.png');
  assert.equal(selfPrizes.querySelectorAll('img').length, 1);
  assert.equal(getCardRegistry().get(301).element, prizeImg);
});

// Design 002 I24: legacy's own zoneArrays (get-zone.js) are never populated
// under server-authoritative rendering — sync-check.js and e2e-api.js need a
// real live zone source instead, backed by the last view this renderer
// actually applied.
test('I24: hasAuthoritativeView/getAuthoritativeZoneArray/getAuthoritativeStadiumArray track the last applied view', () => {
  const { doc, mockGetZone } = setupMockDom();

  assert.equal(hasAuthoritativeView(), false);
  assert.deepEqual(getAuthoritativeZoneArray('you', 'active'), []);
  assert.deepEqual(getAuthoritativeStadiumArray(), []);

  const v1 = {
    stateVersion: 1,
    stadium: { instanceId: 900, name: 'Lost City' },
    you: {
      playerId: 'p1',
      zones: { active: [{ instanceId: 1, name: 'Pikachu' }], hand: [] },
    },
    them: { playerId: 'p2', zones: { active: [], hand: [] } },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });

  assert.equal(hasAuthoritativeView(), true);
  assert.deepEqual(getAuthoritativeZoneArray('you', 'active'), [
    { instanceId: 1, name: 'Pikachu' },
  ]);
  assert.deepEqual(getAuthoritativeZoneArray('them', 'active'), []);
  assert.deepEqual(getAuthoritativeStadiumArray(), [{ instanceId: 900, name: 'Lost City' }]);

  // deck is redacted to { count } even for its own owner (O4-A / I5) — never
  // a card array in the view — must resolve to [], not throw.
  assert.deepEqual(getAuthoritativeZoneArray('you', 'deck'), []);

  resetRenderState();
  assert.equal(hasAuthoritativeView(), false);
  assert.deepEqual(getAuthoritativeZoneArray('you', 'active'), []);
  assert.deepEqual(getAuthoritativeStadiumArray(), []);
});


// Design 002 slice 3.12: the flip gate found that nothing applied view.turn — the server
// advanced its own turn while the client's rulesState.turnPlayer stayed frozen, so the
// client's next command came back rejected with "It's not your turn."
test('3.12: reconcileTurnState syncs turnPlayer/turnNumber/phase from the view', () => {
  const local = { turnPlayer: 'self', turnNumber: 0, phase: 'setup' };

  const yours = reconcileTurnState(
    {
      you: { playerId: 'p1' },
      them: { playerId: 'p2' },
      turn: { player: 'p1', isYourTurn: true, number: 3, phase: 'main' },
    },
    { rulesState: local }
  );
  assert.equal(yours.applied, true);
  assert.equal(yours.turnPlayer, 'self');
  assert.equal(yours.changed, false);
  assert.equal(local.turnNumber, 3);
  assert.equal(local.phase, 'main');

  const theirs = reconcileTurnState(
    {
      you: { playerId: 'p1' },
      them: { playerId: 'p2' },
      turn: { player: 'p2', isYourTurn: false, number: 4, phase: 'main' },
    },
    { rulesState: local }
  );
  assert.equal(theirs.applied, true);
  assert.equal(theirs.turnPlayer, 'opp');
  assert.equal(theirs.changed, true);
  assert.equal(local.turnPlayer, 'opp');
  assert.equal(local.turnNumber, 4);
});

test('3.12: reconcileTurnState leaves a spectator and a turn-less view alone', () => {
  const local = { turnPlayer: 'self', turnNumber: 7, phase: 'main' };

  const spectator = reconcileTurnState(
    {
      isSpectator: true,
      you: null,
      turn: { player: 'p2', isYourTurn: false, number: 9, phase: 'main' },
    },
    { rulesState: local }
  );
  assert.equal(spectator.applied, false);
  assert.equal(spectator.reason, 'spectator');

  const noTurn = reconcileTurnState({ you: { playerId: 'p1' } }, { rulesState: local });
  assert.equal(noTurn.applied, false);
  assert.equal(noTurn.reason, 'no_turn');

  assert.deepEqual(local, { turnPlayer: 'self', turnNumber: 7, phase: 'main' });
});

test('I25: reconcileTurnState dispatches rules-turn-view-applied, not rules-turn-began', () => {
  const { doc } = setupMockDom();
  const seen = [];
  doc.addEventListener('rules-turn-view-applied', (e) => seen.push(e.detail));
  doc.addEventListener('rules-turn-began', () => seen.push('rules-turn-began'));
  const local = { turnPlayer: 'self', turnNumber: 0, phase: 'setup' };

  reconcileTurnState(
    {
      you: { playerId: 'p1' },
      them: { playerId: 'p2' },
      turn: { player: 'p2', isYourTurn: false, number: 2, phase: 'main' },
    },
    { rulesState: local, document: doc }
  );

  assert.deepEqual(seen, [{ player: 'opp' }]);
});

test('3.12: applyView syncs turn state as part of a normal view apply', () => {
  const { doc, mockGetZone } = setupMockDom();
  const local = { turnPlayer: 'self', turnNumber: 0, phase: 'setup' };

  applyView(
    {
      stateVersion: 1,
      turn: { player: 'p2', isYourTurn: false, number: 2, phase: 'main' },
      you: { playerId: 'p1', zones: { active: [], hand: [] } },
      them: { playerId: 'p2', zones: { active: [], hand: [] } },
    },
    [],
    { document: doc, getZone: mockGetZone, rulesState: local }
  );

  assert.equal(local.turnPlayer, 'opp');
  assert.equal(local.turnNumber, 2);
  assert.equal(local.phase, 'main');
});
