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
  repositionCardOverlays,
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
          { instanceId: 20, name: 'Pikachu', src: '/a.png', specialCondition: null, poisoned: true },
        ],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v1, [], { document: doc, getZone: mockGetZone });

  const img = getCardRegistry().get(20).element;
  assert.ok(img.poisonMarker, 'poison marker div created');
  assert.equal(img.poisonMarker.classList.contains('status-poison'), true);
  assert.equal(img.poisonMarker.parentNode, selfActive);

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
  assert.equal(img.poisonMarker, null);
});

// Design 011 / audit A-1: Poison and Burn stack with the rotation condition, one marker each.
test('Row 21: stacked conditions draw one marker each, stacked down the card, and clear independently', () => {
  const { doc, mockGetZone } = setupMockDom();
  const selfActive = doc.getElementById('selfMat').querySelector('#active');
  const card = (extra) => ({ instanceId: 25, name: 'Pikachu', src: '/a.png', ...extra });

  applyView(
    {
      stateVersion: 1,
      you: { playerId: 'p1', zones: { active: [card({ specialCondition: 'Asleep', poisoned: true, burned: true })] } },
      them: { playerId: 'p2', zones: {} },
    },
    [],
    { document: doc, getZone: mockGetZone }
  );
  const img = getCardRegistry().get(25).element;
  // The mock DOM has no layout; give the card a size so marker offsets are measurable.
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 90, height: 126 });
  applyView(
    {
      stateVersion: 2,
      you: { playerId: 'p1', zones: { active: [card({ specialCondition: 'Asleep', poisoned: true, burned: true })] } },
      them: { playerId: 'p2', zones: {} },
    },
    [],
    { document: doc, getZone: mockGetZone }
  );
  const markers = [img.specialCondition, img.poisonMarker, img.burnMarker];
  assert.ok(markers.every(Boolean), 'rotation, poison and burn markers all exist');
  assert.equal(markers.every((m) => m.parentNode === selfActive), true);
  assert.equal(new Set(markers.map((m) => m.style.top)).size, 3, 'markers do not overlap');
  const burnMarker = img.burnMarker;

  applyView(
    {
      stateVersion: 3,
      you: { playerId: 'p1', zones: { active: [card({ specialCondition: 'Asleep', poisoned: true })] } },
      them: { playerId: 'p2', zones: {} },
    },
    [],
    { document: doc, getZone: mockGetZone }
  );
  assert.equal(img.burnMarker, null);
  assert.equal(selfActive.children.includes(burnMarker), false);
  assert.ok(img.specialCondition);
  assert.ok(img.poisonMarker);
});

// A window resize moves the card without a new view; the Poison/Burn markers must follow it
// like the rotation marker does (repositionCardOverlays is the resize listener's handler).
test('Row 21: resize re-positions the Poison and Burn markers, not only the rotation marker', () => {
  const { doc, mockGetZone } = setupMockDom();
  const view = {
    stateVersion: 1,
    you: {
      playerId: 'p1',
      zones: {
        active: [{ instanceId: 26, name: 'Pikachu', src: '/a.png', specialCondition: 'Asleep', poisoned: true, burned: true }],
      },
    },
    them: { playerId: 'p2', zones: {} },
  };
  const options = { document: doc, getZone: mockGetZone };
  applyView(view, [], options);
  const img = getCardRegistry().get(26).element;
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 90, height: 126 });
  applyView({ ...view, stateVersion: 2 }, [], options);
  const tops = () => [img.specialCondition, img.poisonMarker, img.burnMarker].map((m) => m.style.top);
  const before = tops();

  img.getBoundingClientRect = () => ({ left: 0, top: 100, width: 150, height: 210 });
  repositionCardOverlays();

  const after = tops();
  assert.equal(after.every((top, i) => top !== before[i]), true, `markers moved: ${before} -> ${after}`);
  assert.equal(new Set(after).size, 3, 'markers still stacked without overlap');
  assert.equal(img.poisonMarker.style.width, '50px');
  assert.equal(img.burnMarker.style.width, '50px');
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
            specialCondition: 'Asleep',
            burned: true,
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
  const burnMarker = img.burnMarker;
  assert.equal(selfActive.children.includes(damageCounter), true);
  assert.equal(selfActive.children.includes(specialCondition), true);
  assert.equal(selfActive.children.includes(burnMarker), true);

  // Card discarded: leaves the view entirely
  const v2 = {
    stateVersion: 2,
    you: { playerId: 'p1', zones: { active: [], discard: [] } },
    them: { playerId: 'p2', zones: {} },
  };
  applyView(v2, [], { document: doc, getZone: mockGetZone });

  assert.equal(selfActive.children.includes(damageCounter), false);
  assert.equal(selfActive.children.includes(specialCondition), false);
  assert.equal(selfActive.children.includes(burnMarker), false);
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
  // Shares its container's id, so it must carry legacy Cover's inline reset or
  // `#discardCover { position: fixed }` blows it up across the board.
  assert.equal(coverImg.style.position, 'relative');

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

// Stands in for hydrate-holo.js: wraps the <img> in a `.mat-holo` node the way
// hydrateHolo does (synchronously here), and unwraps it back in place.
function fakeHolo(doc) {
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

test('holo: a face-up hand card is hydrated and moves as its wrapper', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone, holo: fakeHolo(doc) };
  const selfMat = doc.getElementById('selfMat');
  const hand = selfMat.querySelector('#hand');
  const discard = selfMat.querySelector('#discard');
  const mew = { instanceId: 1, name: 'Mew ex', src: 'mew.png' };

  applyView({ stateVersion: 1, you: { playerId: 'p1', zones: { hand: [mew] } } }, [], opts);
  const wrapper = hand.querySelector('.mat-holo');
  assert.ok(wrapper, 'hand card gets a holo wrapper');
  assert.equal(wrapper.querySelector('img').dataset.instanceId, '1');

  applyView({ stateVersion: 2, you: { playerId: 'p1', zones: { hand: [], discard: [mew] } } }, [], opts);
  assert.equal(hand.children.length, 0, 'no empty foil frame left in hand');
  assert.equal(discard.querySelector('.mat-holo'), wrapper, 'wrapper moved with the card');
  assert.equal(wrapper.querySelector('img').dataset.instanceId, '1');
});

test('holo: face-down, attached and removed cards lose their wrapper', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone, holo: fakeHolo(doc) };
  const selfMat = doc.getElementById('selfMat');
  const active = selfMat.querySelector('#active');
  const pikachu = { instanceId: 10, name: 'Pikachu', src: 'pika.png' };
  const belt = { instanceId: 11, name: 'Choice Belt', src: 'belt.png', type: 'Trainer' };

  applyView(
    {
      stateVersion: 1,
      you: { playerId: 'p1', zones: { active: [pikachu], hand: [belt], prizes: [{ instanceId: 12 }] } },
    },
    [],
    opts
  );
  assert.equal(selfMat.querySelector('#prizes').querySelector('.mat-holo'), null, 'redacted prize is never foiled');
  assert.equal(selfMat.querySelector('#hand').querySelectorAll('.mat-holo').length, 1);

  applyView(
    {
      stateVersion: 2,
      you: { playerId: 'p1', zones: { active: [pikachu, { ...belt, attachedTo: 10 }], hand: [], prizes: [] } },
    },
    [],
    opts
  );
  const container = active.querySelector('.play-container');
  const beltImg = container.querySelector('img[data-instance-id="11"]');
  assert.equal(beltImg.parentNode, container, 'attached Tool is a bare child of the container');
  assert.equal(active.querySelectorAll('.mat-holo').length, 1, 'only the parent keeps its foil');

  applyView({ stateVersion: 3, you: { playerId: 'p1', zones: { active: [], hand: [], prizes: [] } } }, [], opts);
  assert.equal(active.children.length, 0);
  assert.equal(getCardRegistry().size, 0);
});

test('energy: attached Energy draws as tokens and fills the parent attachedCards', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const view = (stateVersion, zones) => ({ stateVersion, you: { playerId: 'p1', zones } });
  const pikachu = { instanceId: 10, name: 'Pikachu', src: 'pika.png', type: 'Pokémon' };
  const lightning = { instanceId: 11, name: 'Basic Lightning Energy', src: 'l.png', type: 'Energy' };
  const belt = { instanceId: 12, name: 'Choice Belt', src: 'belt.png', type: 'Trainer' };
  const fire = { instanceId: 13, name: 'Basic Fire Energy', src: 'f.png', type: 'Energy' };

  applyView(
    view(1, {
      active: [
        pikachu,
        { ...lightning, attachedTo: 10 },
        { ...belt, attachedTo: 10 },
        { ...fire, attachedTo: 10 },
      ],
    }),
    [],
    opts
  );
  const registry = getCardRegistry();
  const lightningImg = registry.get(11).element;
  const beltImg = registry.get(12).element;
  const fireImg = registry.get(13).element;

  assert.equal(lightningImg.getAttribute('src'), '/src/assets/energy/tokens/lightning.png');
  assert.equal(lightningImg.dataset.energyCardSrc, 'l.png');
  assert.equal(lightningImg.classList.contains('energy-token-3d'), true);
  assert.equal(lightningImg.style.zIndex, '101');
  assert.equal(fireImg.getAttribute('src'), '/src/assets/energy/tokens/fire.png');
  assert.equal(fireImg.style.zIndex, '102', 'second Energy stacks after the first, skipping the Tool');
  assert.equal(beltImg.getAttribute('src'), 'belt.png', 'Tools keep their card art');
  assert.deepEqual(
    registry.get(10).card.attachedCards.map((c) => [c.instanceId, c.image]),
    [
      [11, lightningImg],
      [12, beltImg],
      [13, fireImg],
    ]
  );

  applyView(
    view(2, { active: [pikachu, { ...fire, attachedTo: 10 }], discard: [lightning], hand: [belt] }),
    [],
    opts
  );
  assert.deepEqual(registry.get(10).card.attachedCards.map((c) => c.instanceId), [13]);
  assert.equal(fireImg.style.zIndex, '101');
  assert.equal(lightningImg.getAttribute('src'), 'l.png', 'detached Energy shows its card art again');
  assert.equal(lightningImg.dataset.energyCardSrc, undefined);
  assert.equal(lightningImg.classList.contains('energy-token-3d'), false);
  assert.equal(lightningImg.style.position, '');
});

// Live 2P regression (sync log ptcg-sync-log_combined_test_1789677999175): decklists
// exported from Limitless name basic Energy by its cost symbol, and a deck row that
// skipped the importer's type resolution arrives with an empty `type`. Both used to
// miss the token branch and cascade behind the Pokemon as flat cards.
test('energy: cost-symbol names and untyped Energy rows still draw as tokens', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const view = (stateVersion, zones) => ({ stateVersion, you: { playerId: 'p1', zones } });
  const swinub = { instanceId: 20, name: 'Swinub', src: 'swinub.png', type: 'Pokemon' };
  const symbolEnergy = {
    instanceId: 21,
    name: 'Basic {F} Energy',
    src: 'GRI_169_R_EN.png',
    type: 'Energy',
  };
  const untypedEnergy = {
    instanceId: 22,
    name: 'Rocky Fighting Energy',
    src: 'me03-087.webp',
    type: '',
  };

  applyView(
    view(1, {
      active: [
        swinub,
        { ...symbolEnergy, attachedTo: 20 },
        { ...untypedEnergy, attachedTo: 20 },
      ],
    }),
    [],
    opts
  );
  const registry = getCardRegistry();
  const symbolImg = registry.get(21).element;
  const untypedImg = registry.get(22).element;

  assert.equal(symbolImg.getAttribute('src'), '/src/assets/energy/tokens/fighting.png');
  assert.equal(symbolImg.dataset.energyCardSrc, 'GRI_169_R_EN.png');
  assert.equal(symbolImg.classList.contains('energy-token-3d'), true);
  assert.equal(symbolImg.style.zIndex, '101');
  assert.equal(untypedImg.getAttribute('src'), '/src/assets/energy/tokens/fighting.png');
  assert.equal(untypedImg.classList.contains('energy-token-3d'), true);
  assert.equal(untypedImg.style.zIndex, '102');
});

const NEST_BALL_CHOICE = {
  choiceId: 'choice_p1_4',
  player: 'p1',
  prompt: 'Nest Ball: choose a Basic Pokémon',
  options: [
    { instanceId: 1, name: 'Pikachu', src: 'pika.png' },
    { instanceId: 2, name: 'Mew', src: 'mew.png' },
  ],
  min: 0,
  max: 1,
};

const choiceView = (stateVersion, pendingChoice) => ({
  stateVersion,
  pendingChoice,
  you: { playerId: 'p1', zones: {} },
  them: { playerId: 'p2', zones: {} },
});

function fakeChoicePicker() {
  const picker = { opened: [], closed: 0 };
  picker.open = (request) => picker.opened.push(request);
  picker.close = () => {
    picker.closed += 1;
  };
  return picker;
}

test('choice: a card choice opens the card picker once instead of the grid modal', async () => {
  const { doc, mockGetZone } = setupMockDom();
  const choicePicker = fakeChoicePicker();
  const resolved = [];
  const opts = { document: doc, getZone: mockGetZone, choicePicker, onResolveChoice: (sel) => resolved.push(sel) };

  applyView(choiceView(1, NEST_BALL_CHOICE), [], opts);
  applyView(choiceView(2, NEST_BALL_CHOICE), [], opts);

  assert.equal(doc.getElementById('netcodeChoiceModal'), null);
  assert.equal(choicePicker.opened.length, 1, 're-applied view does not reopen the picker');
  assert.equal(choicePicker.opened[0].choice.choiceId, 'choice_p1_4');

  await choicePicker.opened[0].onResolve([2]);
  assert.deepEqual(resolved, [{ choiceId: 'choice_p1_4', selection: [2] }]);

  applyView(choiceView(3, null), [], opts);
  assert.equal(choicePicker.closed, 0, 'a resolved picker already closed itself');
});

test('choice: picker closes when the choice clears or passes to the opponent', () => {
  const { doc, mockGetZone } = setupMockDom();
  const choicePicker = fakeChoicePicker();
  const opts = { document: doc, getZone: mockGetZone, choicePicker };

  applyView(choiceView(1, NEST_BALL_CHOICE), [], opts);
  applyView(choiceView(2, null), [], opts);
  assert.equal(choicePicker.closed, 1);

  applyView(choiceView(3, NEST_BALL_CHOICE), [], opts);
  applyView(choiceView(4, { ...NEST_BALL_CHOICE, player: 'p2' }), [], opts);
  assert.equal(choicePicker.opened.length, 2);
  assert.equal(choicePicker.closed, 2);
  assert.ok(doc.getElementById('netcodeChoiceBanner'));
});

test('choice: options without art fall back to the grid modal', () => {
  const { doc, mockGetZone } = setupMockDom();
  const choicePicker = fakeChoicePicker();
  const noArt = { ...NEST_BALL_CHOICE, options: [{ instanceId: 1, name: 'Pikachu', src: '' }] };

  applyView(choiceView(1, noArt), [], { document: doc, getZone: mockGetZone, choicePicker });

  assert.equal(choicePicker.opened.length, 0);
  assert.ok(doc.getElementById('netcodeChoiceModal'));
});

// Mock elements have no layout; give every registered card a real-looking size
// and re-apply, the way a loaded image would measure in the browser.
function sizeRegisteredCards(width, height) {
  for (const record of getCardRegistry().values()) {
    record.element.clientWidth = width;
    record.element.clientHeight = height;
  }
}

test('stack: an evolution is the visible card with the Basic peeking out underneath', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone, holo: fakeHolo(doc) };
  const active = doc.getElementById('selfMat').querySelector('#active');
  const zones = {
    active: [
      { instanceId: 10, name: 'Charmander', src: 'c.png', type: 'Pokémon', stage: 'Basic', damage: 30 },
      { instanceId: 11, name: 'Charmeleon', src: 'm.png', type: 'Pokémon', stage: 'Stage 1', attachedTo: 10 },
      { instanceId: 12, name: 'Choice Belt', src: 'belt.png', type: 'Trainer', attachedTo: 10 },
      { instanceId: 13, name: 'Basic Fire Energy', src: 'f.png', type: 'Energy', attachedTo: 10 },
    ],
  };

  applyView({ stateVersion: 1, you: { playerId: 'p1', zones } }, [], opts);
  sizeRegisteredCards(150, 210);
  applyView({ stateVersion: 2, you: { playerId: 'p1', zones } }, [], opts);

  const registry = getCardRegistry();
  const basic = registry.get(10);
  const stage1 = registry.get(11);
  assert.equal(stage1.element.style.position || '', '', 'Stage 1 stays in flow as the visible card');
  assert.equal(basic.element.style.position, 'absolute');
  assert.equal(basic.element.style.bottom, '10px');
  assert.equal(basic.element.style.zIndex, '-1');

  const belt = registry.get(12).element;
  assert.equal(belt.style.left, '25px', 'Tool fans out behind by a sixth of the card');
  assert.equal(belt.style.zIndex, '-1');
  assert.equal(basic.container.style.width, '175px', 'slot widens for the Tool');
  assert.equal(registry.get(13).element.style.width, '36px', 'token sized from the visible card');

  const holoWrappers = active.querySelectorAll('.mat-holo');
  assert.equal(holoWrappers.length, 1);
  assert.equal(holoWrappers[0].querySelector('img'), stage1.element, 'only the visible card is foiled');

  assert.deepEqual(stage1.card.attachedCards.map((c) => c.instanceId), [10, 12, 13]);
  assert.deepEqual(basic.card.attachedCards, []);
  assert.equal(basic.element.damageCounter.textContent, '30', 'root damage still shown');
  assert.equal(basic.overlayImage, stage1.element, 'overlays measured on the visible card');

  // Evolution discarded: the Basic is back in flow with no stack styling.
  zones.active = [zones.active[0]];
  applyView({ stateVersion: 3, you: { playerId: 'p1', zones } }, [], opts);
  assert.equal(basic.element.style.position, '');
  assert.equal(basic.element.style.bottom, '');
  assert.equal(basic.container.style.width, '');
});

test('stack: an attachment to the stacked evolution stays in the host slot, not the zone', () => {
  // Reported S181: Energy dropped onto Mega Greninja ex — the TOP card of a stack, whose
  // own `attachedTo` is the Basic underneath — rendered as a separate in-play card lying
  // in the bench row, instead of a token on the visible card.
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const bench = doc.getElementById('selfMat').querySelector('#bench');
  const zones = {
    bench: [
      { instanceId: 10, name: 'Froakie', src: 'f.png', type: 'Pokémon', stage: 'Basic' },
      { instanceId: 11, name: 'Mega Greninja ex', src: 'g.png', type: 'Pokémon', stage: 'Stage 2', attachedTo: 10 },
      { instanceId: 12, name: 'Choice Belt', src: 'belt.png', type: 'Trainer', attachedTo: 11 },
      { instanceId: 13, name: 'Basic Water Energy', src: 'w.png', type: 'Energy', attachedTo: 11 },
    ],
  };

  applyView({ stateVersion: 1, you: { playerId: 'p1', zones } }, [], opts);
  sizeRegisteredCards(150, 210);
  applyView({ stateVersion: 2, you: { playerId: 'p1', zones } }, [], opts);

  const registry = getCardRegistry();
  const basic = registry.get(10);
  const stage2 = registry.get(11);
  const energy = registry.get(13);

  assert.equal(bench.children.length, 1, 'the stack owns the only play-container in the zone');
  assert.equal(bench.children[0], basic.container);
  assert.equal(energy.element.parentNode, basic.container, 'Energy stays in the host slot');
  assert.equal(registry.get(12).element.parentNode, basic.container, 'Tool stays in the host slot');
  assert.equal(energy.element.style.width, '36px', 'Energy is drawn as a token on the visible card');
  assert.ok(energy.element.classList.contains('attached-card'));
  assert.deepEqual(stage2.card.attachedCards.map((c) => c.instanceId), [10, 12, 13]);
});

test('rotation: the root turns its whole stack and clears back to upright', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const stack = (rotation) => ({
    active: [
      { instanceId: 10, name: 'Pikachu', src: 'p.png', type: 'Pokémon', rotation },
      { instanceId: 11, name: 'Basic Lightning Energy', src: 'l.png', type: 'Energy', attachedTo: 10 },
    ],
  });

  applyView({ stateVersion: 1, you: { playerId: 'p1', zones: stack(90) } }, [], opts);
  const registry = getCardRegistry();
  assert.equal(registry.get(10).element.style.transform, 'rotate(90deg)');
  assert.equal(registry.get(11).element.style.transform, 'rotate(90deg)');

  applyView({ stateVersion: 2, you: { playerId: 'p1', zones: stack(0) } }, [], opts);
  assert.equal(registry.get(10).element.style.transform, '');
  assert.equal(registry.get(11).element.style.transform, '');
});

test('ability used: shows the legacy tab on the card and removes it when reset', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const active = doc.getElementById('selfMat').querySelector('#active');
  const view = (stateVersion, abilityUsed) => ({
    stateVersion,
    you: { playerId: 'p1', zones: { active: [{ instanceId: 10, name: 'Mew', src: 'm.png', abilityUsed }] } },
  });

  applyView(view(1, true), [], opts);
  assert.equal(active.querySelectorAll('.self-tab').length, 1);

  applyView(view(2, false), [], opts);
  assert.equal(active.querySelectorAll('.self-tab').length, 0);
  assert.equal(getCardRegistry().get(10).element.abilityCounter, null);
});

test('zone counts and VSTAR/GX buttons follow the view', () => {
  const { doc, mockGetZone } = setupMockDom();
  const labels = {};
  for (const id of ['deckCount', 'handCount', 'discardCount', 'VSTARButton', 'GXButton']) {
    labels[id] = doc.registerElement(id, doc.createElement(id.endsWith('Button') ? 'button' : 'span'));
  }
  const opts = { document: doc, getZone: mockGetZone };
  const view = (stateVersion, flags) => ({
    stateVersion,
    you: {
      playerId: 'p1',
      flags,
      zones: {
        deck: { count: 47 },
        hand: [
          { instanceId: 1, name: 'A', src: 'a.png' },
          { instanceId: 2, name: 'B', src: 'b.png' },
        ],
        discard: [],
      },
    },
  });

  applyView(view(1, { vstarUsed: true, gxUsed: true }), [], opts);
  assert.equal(labels.deckCount.textContent, '47');
  assert.equal(labels.handCount.textContent, '2');
  assert.equal(labels.discardCount.textContent, '0');
  assert.equal(labels.VSTARButton.classList.contains('used-special-move'), true);
  assert.equal(labels.GXButton.classList.contains('used-special-move'), true);

  applyView(view(2, { vstarUsed: false, gxUsed: false }), [], opts);
  assert.equal(labels.VSTARButton.classList.contains('used-special-move'), false);
});

test('stadium: reads upright for its owner and flipped for the opponent', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone };
  const view = (stateVersion, ownerId) => ({
    stateVersion,
    stadium: { instanceId: 99, name: 'Artazon', src: 'a.png', ownerId },
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  });

  applyView(view(1, 'p2'), [], opts);
  assert.equal(doc.getElementById('stadium').style.transform, 'scaleX(-1) scaleY(-1)');

  applyView(view(2, 'p1'), [], opts);
  assert.equal(doc.getElementById('stadium').style.transform, 'scaleX(1) scaleY(1)');
});

// A Knockout's prize pendingChoice opens the fly-up prize fan over this player's
// server-drawn prize cards instead of the grid modal.
const PRIZE_CHOICE = {
  choiceId: 'choice_p1_prizes_7',
  player: 'p1',
  prompt: 'Choose a Prize card',
  options: [{ instanceId: 101, name: '', src: '' }, { instanceId: 102, name: '', src: '' }],
  min: 1,
  max: 1,
  resumeToken: { effectType: 'prizes', initiatorPlayerId: 'p1' },
};

const prizeView = (stateVersion, pendingChoice, zones = { prizes: [{ instanceId: 101 }, { instanceId: 102 }] }) => ({
  stateVersion,
  pendingChoice,
  you: { playerId: 'p1', zones },
  them: { playerId: 'p2', zones: {} },
});

test('prize choice: opens the prize picker over the prize cards once, and submits the chosen ids', async () => {
  const { doc, mockGetZone } = setupMockDom();
  const prizePicker = fakeChoicePicker();
  const choicePicker = fakeChoicePicker();
  const resolved = [];
  const opts = { document: doc, getZone: mockGetZone, prizePicker, choicePicker, onResolveChoice: (sel) => resolved.push(sel) };

  applyView(prizeView(1, PRIZE_CHOICE), [], opts);
  applyView(prizeView(2, PRIZE_CHOICE), [], opts);

  assert.equal(doc.getElementById('netcodeChoiceModal'), null);
  assert.equal(choicePicker.opened.length, 0);
  assert.equal(prizePicker.opened.length, 1, 're-applied view does not reopen the prize fan');
  const request = prizePicker.opened[0];
  assert.deepEqual(request.cards.map((c) => c.instanceId), [101, 102]);
  assert.equal(request.cards[0].image, getCardRegistry().get(101).element);

  await request.onResolve([102]);
  assert.deepEqual(resolved, [{ choiceId: 'choice_p1_prizes_7', selection: [102] }]);
});

test('prize choice: the fan closes when the choice passes to the opponent', () => {
  const { doc, mockGetZone } = setupMockDom();
  const prizePicker = fakeChoicePicker();
  const opts = { document: doc, getZone: mockGetZone, prizePicker };

  applyView(prizeView(1, PRIZE_CHOICE), [], opts);
  applyView(prizeView(2, { ...PRIZE_CHOICE, player: 'p2' }), [], opts);
  assert.equal(prizePicker.closed, 1);
  assert.ok(doc.getElementById('netcodeChoiceBanner'));
});

test('prize choice: falls back to the choice modal when no prize picker is available', () => {
  const { doc, mockGetZone } = setupMockDom();
  applyView(prizeView(1, PRIZE_CHOICE), [], { document: doc, getZone: mockGetZone });
  assert.ok(doc.getElementById('netcodeChoiceModal'));
});

test('prize choice: a chosen prize hidden by the fan is shown again once it reaches the hand', () => {
  const { doc, mockGetZone } = setupMockDom();
  const opts = { document: doc, getZone: mockGetZone, prizePicker: fakeChoicePicker() };
  applyView(prizeView(1, PRIZE_CHOICE), [], opts);
  const img = getCardRegistry().get(102).element;
  img.classList.add('draw-flight-source');

  applyView(
    prizeView(2, null, { prizes: [{ instanceId: 101 }], hand: [{ instanceId: 102, name: 'Pikachu', src: '/p.png' }] }),
    [],
    opts
  );
  assert.equal(img.classList.contains('draw-flight-source'), false);
});

// A trainer/stadium choice whose options are all in-play Pokémon opens the mat
// picker (click the real card) instead of the card carousel (D19).
const MAT_CHOICE = {
  choiceId: 'choice_p1_mat_9',
  player: 'p1',
  prompt: 'Rare Candy: Choose the Basic Pokémon Swinub evolves from',
  options: [{ instanceId: 10, name: 'Swinub' }, { instanceId: 11, name: 'Budew' }],
  min: 1,
  max: 1,
  cancellable: false,
  resumeToken: { effectType: 'trainer', initiatorPlayerId: 'p1' },
};

const matBoardView = (stateVersion, pendingChoice = null) => ({
  stateVersion,
  pendingChoice,
  you: {
    playerId: 'p1',
    zones: {
      active: [{ instanceId: 10, name: 'Swinub', src: '/s.png' }],
      bench: [{ instanceId: 11, name: 'Budew', src: '/b.png' }],
    },
  },
  them: { playerId: 'p2', zones: {} },
});

test('mat choice: in-play options open the mat picker once, not the card picker or modal', async () => {
  const { doc, mockGetZone } = setupMockDom();
  const matPicker = fakeChoicePicker();
  const choicePicker = fakeChoicePicker();
  const resolved = [];
  const opts = {
    document: doc,
    getZone: mockGetZone,
    matPicker,
    choicePicker,
    onResolveChoice: (sel) => resolved.push(sel),
  };

  applyView(matBoardView(1), [], opts);
  applyView(matBoardView(2, MAT_CHOICE), [], opts);
  applyView(matBoardView(3, MAT_CHOICE), [], opts);

  assert.equal(doc.getElementById('netcodeChoiceModal'), null);
  assert.equal(choicePicker.opened.length, 0);
  assert.equal(matPicker.opened.length, 1, 're-applied view does not reopen the mat picker');
  const request = matPicker.opened[0];
  assert.equal(request.cancellable, false);
  assert.deepEqual(request.candidates.map((c) => c.instanceId), [10, 11]);
  assert.equal(request.candidates[0].image, getCardRegistry().get(10).element);
  assert.equal(request.candidates[0].name, 'Swinub');

  await request.onResolve([11]);
  assert.deepEqual(resolved, [{ choiceId: 'choice_p1_mat_9', selection: [11] }]);
});

test('mat choice: closes when the choice passes to the opponent', () => {
  const { doc, mockGetZone } = setupMockDom();
  const matPicker = fakeChoicePicker();
  const resolved = [];
  const opts = { document: doc, getZone: mockGetZone, matPicker, onResolveChoice: (sel) => resolved.push(sel) };

  applyView(matBoardView(1), [], opts);
  applyView(matBoardView(2, MAT_CHOICE), [], opts);
  applyView(matBoardView(3, { ...MAT_CHOICE, player: 'p2' }), [], opts);

  assert.equal(matPicker.closed, 1);
  // Teardown on pass-to-opponent is silent: it must not report a decline.
  assert.deepEqual(resolved, []);
  assert.ok(doc.getElementById('netcodeChoiceBanner'));
});

test('mat choice: a hand option keeps the card picker (not every in-play-looking choice is a mat choice)', () => {
  const { doc, mockGetZone } = setupMockDom();
  const matPicker = fakeChoicePicker();
  const choicePicker = fakeChoicePicker();
  const opts = { document: doc, getZone: mockGetZone, matPicker, choicePicker };

  applyView(matBoardView(1), [], opts);
  const mixed = { ...MAT_CHOICE, options: [{ instanceId: 10, name: 'Swinub', src: '/s.png' }, { instanceId: 99, name: 'Ultra Ball', src: '/u.png' }] };
  applyView(matBoardView(2, mixed), [], opts);

  assert.equal(matPicker.opened.length, 0);
  assert.equal(choicePicker.opened.length, 1);
});

test('mat choice: adapter failure falls back to the modal', () => {
  const { doc, mockGetZone } = setupMockDom();
  const throwing = {
    open() {
      throw new Error('boom');
    },
    close() {},
  };
  const opts = { document: doc, getZone: mockGetZone, matPicker: throwing };

  applyView(matBoardView(1), [], opts);
  applyView(matBoardView(2, MAT_CHOICE), [], opts);

  assert.ok(doc.getElementById('netcodeChoiceModal'));
});

test('mat choice: declining an optional pick reports an empty selection; a required pick cannot be declined', async () => {
  const { doc, mockGetZone } = setupMockDom();
  const matPicker = fakeChoicePicker();
  const resolved = [];
  const opts = { document: doc, getZone: mockGetZone, matPicker, onResolveChoice: (sel) => resolved.push(sel) };

  applyView(matBoardView(1), [], opts);
  const optional = { ...MAT_CHOICE, min: 0, cancellable: true };
  applyView(matBoardView(2, optional), [], opts);
  assert.equal(matPicker.opened[0].cancellable, true);
  await matPicker.opened[0].onCancel();
  assert.deepEqual(resolved, [{ choiceId: 'choice_p1_mat_9', selection: [] }]);
});

