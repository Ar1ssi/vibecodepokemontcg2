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

function setupMockDom() {
  const doc = new MockDocument();
  doc.registerElement('stadium', doc.createElement('div'));

  const selfMat = doc.registerElement('selfMat', doc.createElement('div'));
  const oppMat = doc.registerElement('oppMat', doc.createElement('div'));

  ['hand', 'active', 'bench', 'discard', 'prizes', 'lostZone', 'deck'].forEach((zid) => {
    const sEl = doc.createElement('div');
    sEl.id = zid;
    selfMat.appendChild(sEl);

    const oEl = doc.createElement('div');
    oEl.id = zid;
    oppMat.appendChild(oEl);
  });

  const mockGetZone = (side, zoneId) => {
    const root = side === 'you' ? selfMat : oppMat;
    const element = root.querySelector(`#${zoneId}`);
    return { element, array: [] };
  };

  return { doc, mockGetZone };
}

beforeEach(() => {
  resetRenderState();
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

  assert.equal(eventsDispatched.length, 1);
  assert.equal(eventsDispatched[0].type, 'rules-game-ended');
  assert.equal(eventsDispatched[0].detail.isWinner, true);
  assert.equal(eventsDispatched[0].detail.winner, 'p1');

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


