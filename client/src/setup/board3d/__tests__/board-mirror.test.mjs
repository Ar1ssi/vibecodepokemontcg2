import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { DEFAULT_GLOW_RGB, createBoardMirror } from '../board-mirror.js';

const setup = () => {
  const dom = new JSDOM(
    '<body><div id="boardMirror"><div id="selfBoard" class="self"></div><div id="oppBoard" class="opp"></div></div></body>'
  );
  const doc = dom.window.document;
  const hostSelf = doc.getElementById('selfBoard');
  const hostOpp = doc.getElementById('oppBoard');
  const box = { left: 10, top: 20, width: 1900, height: 1060 };
  for (const host of [hostSelf, hostOpp]) host.getBoundingClientRect = () => box;
  const mirror = createBoardMirror({ hostSelf, hostOpp, doc });
  return { dom, doc, mirror };
};

// The <img> apply-view.js builds (createOrUpdateCardElement stamps these data attributes).
const addCard = (doc, parent, instanceId, { holo = false } = {}) => {
  const img = doc.createElement('img');
  img.className = 'card-image';
  img.dataset.instanceId = String(instanceId);
  if (!holo) {
    parent.appendChild(img);
    return { img, wrapper: null };
  }
  const wrapper = doc.createElement('div');
  wrapper.className = 'card mat-holo';
  const rotator = doc.createElement('div');
  rotator.className = 'card__rotator';
  rotator.appendChild(img);
  wrapper.appendChild(rotator);
  parent.appendChild(wrapper);
  return { img, wrapper };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const recorder = (mirror) => {
  const calls = [];
  const unsubscribe = mirror.observe((id, patch) => calls.push({ id, patch }));
  return { calls, unsubscribe };
};

describe('createBoardMirror', () => {
  it('gives each side an open shadow root with the iframe document ids', () => {
    const { mirror } = setup();
    for (const side of ['self', 'opp']) {
      const root = mirror.roots[side];
      assert.equal(root.mode, 'open');
      assert.equal(mirror.hosts[side].shadowRoot, root);
      for (const id of ['active', 'deckCover', 'bench', 'hand', 'prizes', 'board', 'deckStack', 'matCoinSlot',
        'attachedCards', 'viewCards', 'deckCount', 'handCount', 'shuffleDeckButton', 'sortHandCheckbox']) {
        assert.ok(root.getElementById(id), `${side} root has #${id}`);
      }
      assert.equal(mirror.zoneElement(side, 'active'), root.getElementById('active'));
      assert.equal(root.getElementById('deck').closest('#playfield')?.id, 'playfield');
      assert.equal(root.getElementById('hand').closest('#playfield'), null);
      assert.equal(root.createElement('div').ownerDocument, mirror.hosts[side].ownerDocument);
    }
  });

  it('sync writes card and pile rects in px from the host box', () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'hand'), 7);
    const model = { placements: [{ instanceId: 7, side: 'self', zone: 'hand' }] };
    mirror.sync(model, {
      7: { left: 110, top: 920, width: 120, height: 168 },
      'pile:self:deck': { left: 1610, top: 720, width: 100, height: 140 },
    });
    assert.deepEqual(
      ['left', 'top', 'width', 'height'].map((key) => img.style[key]),
      ['100px', '900px', '120px', '168px']
    );
    const cover = mirror.zoneElement('self', 'deckCover');
    assert.deepEqual(
      ['left', 'top', 'width', 'height'].map((key) => cover.style[key]),
      ['1600px', '700px', '100px', '140px']
    );
    const hand = mirror.zoneElement('self', 'hand');
    assert.equal(hand.style.width, '120px');
    // A zone with no drawn card falls back to the host's box.
    const bench = mirror.zoneElement('opp', 'bench');
    assert.deepEqual([bench.style.left, bench.style.width], ['0px', '1900px']);
  });

  it('reports .highlight as selected', async () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'active'), 3);
    const { calls } = recorder(mirror);
    img.classList.add('highlight');
    await flush();
    assert.deepEqual(calls, [{ id: 3, patch: { selected: true, glow: null, matPick: null, hidden: false, pending: false } }]);
  });

  it('reports a hidden .mat-holo wrapper as hidden and its glow', async () => {
    const { doc, mirror } = setup();
    const { wrapper } = addCard(doc, mirror.zoneElement('opp', 'bench'), 11, { holo: true });
    const { calls } = recorder(mirror);
    wrapper.style.visibility = 'hidden';
    await flush();
    assert.equal(calls.at(-1).id, 11);
    assert.equal(calls.at(-1).patch.hidden, true);
    wrapper.classList.add('has-glow');
    wrapper.style.setProperty('--glow-rgb', '255,80,40');
    await flush();
    assert.equal(calls.at(-1).patch.glow, '255,80,40');
    wrapper.style.removeProperty('--glow-rgb');
    await flush();
    assert.equal(calls.at(-1).patch.glow, DEFAULT_GLOW_RGB);
  });

  it('reports a hand card under its flight (.draw-flight-source, img or wrapper) as hidden', async () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'hand'), 30);
    const { wrapper } = addCard(doc, mirror.zoneElement('opp', 'hand'), 31, { holo: true });
    const { calls } = recorder(mirror);
    img.classList.add('draw-flight-source');
    wrapper.classList.add('draw-flight-source');
    await flush();
    assert.deepEqual(calls.map((call) => [call.id, call.patch.hidden]).sort(), [[30, true], [31, true]]);
    assert.deepEqual([...mirror.uiState().hidden].sort(), [30, 31]);
    img.classList.remove('draw-flight-source');
    await flush();
    assert.deepEqual(calls.at(-1), { id: 30, patch: { selected: false, glow: null, matPick: null, hidden: false, pending: false } });
  });

  it('reports .cmd-pending (a command in flight) as pending, and its clearing', async () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'hand'), 8);
    const { calls } = recorder(mirror);
    img.classList.add('cmd-pending');
    await flush();
    assert.equal(calls.at(-1).patch.pending, true);
    img.classList.remove('cmd-pending');
    await flush();
    assert.equal(calls.at(-1).patch.pending, false);
  });

  it('a uiState() snapshot between pending and its clearing still lets the clearing report', async () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'hand'), 9);
    const { calls } = recorder(mirror);
    img.classList.add('cmd-pending');
    await flush();
    mirror.uiState();
    img.classList.remove('cmd-pending');
    await flush();
    assert.deepEqual(calls.map((call) => call.patch.pending), [true, false]);
  });

  it('maps data-mat-pick to idle and the green outline to picked', async () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'bench'), 5);
    const { calls } = recorder(mirror);
    img.dataset.matPick = '1';
    img.style.outline = '4px solid #ffd23f';
    await flush();
    assert.equal(calls.at(-1).patch.matPick, 'idle');
    img.style.outline = '4px solid #38d66b';
    await flush();
    assert.equal(calls.at(-1).patch.matPick, 'picked');
  });

  it('stays quiet when a mutation leaves the state as it was (its own rect writes)', async () => {
    const { doc, mirror } = setup();
    addCard(doc, mirror.zoneElement('self', 'hand'), 9);
    const { calls } = recorder(mirror);
    mirror.sync({ placements: [] }, { 9: { left: 1, top: 2, width: 3, height: 4 } });
    await flush();
    assert.deepEqual(calls, []);
  });

  it('uiState() snapshots every card of both roots', () => {
    const { doc, mirror } = setup();
    addCard(doc, mirror.zoneElement('self', 'active'), 1).img.classList.add('selectHighlight');
    addCard(doc, mirror.zoneElement('opp', 'active'), 2).img.style.visibility = 'hidden';
    const glowing = addCard(doc, mirror.zoneElement('self', 'bench'), 4, { holo: true }).wrapper;
    glowing.classList.add('has-glow');
    glowing.style.setProperty('--glow-rgb', '1,2,3');
    addCard(doc, mirror.zoneElement('opp', 'bench'), 6).img.dataset.matPick = '1';
    const state = mirror.uiState();
    assert.deepEqual([...state.selected], [1]);
    assert.deepEqual([...state.hidden], [2]);
    assert.deepEqual([...state.glows], [[4, '1,2,3']]);
    assert.deepEqual([...state.matPick], [[6, 'idle']]);
  });

  it('reports a deselect the scene learnt from a uiState() snapshot', async () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'active'), 13);
    img.classList.add('highlight');
    const { calls } = recorder(mirror);
    assert.deepEqual([...mirror.uiState().selected], [13]);
    img.classList.remove('highlight');
    await flush();
    assert.deepEqual(calls, [{ id: 13, patch: { selected: false, glow: null, matPick: null, hidden: false, pending: false } }]);
  });

  it('keeps an FX-hidden card hidden when the next view moves it to another zone (edge case 22)', () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'hand'), 21);
    img.style.visibility = 'hidden';
    mirror.zoneElement('self', 'bench').appendChild(img);
    assert.deepEqual([...mirror.uiState().hidden], [21]);
  });

  it('dispose disconnects every observer and stops syncing', async () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'active'), 8);
    const { calls } = recorder(mirror);
    mirror.dispose();
    img.classList.add('highlight');
    await flush();
    assert.deepEqual(calls, []);
    mirror.sync({ placements: [] }, { 8: { left: 50, top: 50, width: 10, height: 10 } });
    assert.equal(img.style.left, '');
  });

  it('an unsubscribe stops only that observer', async () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'active'), 12);
    const first = recorder(mirror);
    const second = recorder(mirror);
    first.unsubscribe();
    img.classList.add('highlight');
    await flush();
    assert.equal(first.calls.length, 0);
    assert.equal(second.calls.length, 1);
  });

  it('refuses to build without both hosts', () => {
    assert.throws(() => createBoardMirror({ hostSelf: null, hostOpp: null }));
  });
});

describe('createBoardMirror zone list popups (D4)', () => {
  it('links the panel stylesheet and gives each pile viewer its Sort label', () => {
    const { mirror } = setup();
    for (const side of ['self', 'opp']) {
      const root = mirror.roots[side];
      assert.equal(root.querySelector('link[rel="stylesheet"]')?.getAttribute('href'), 'src/css/board3d-panels.css');
      for (const id of ['Deck', 'Discard', 'LostZone']) {
        assert.ok(root.querySelector(`label[for="sort${id}Checkbox"]`), `${side} has the ${id} Sort label`);
      }
    }
  });

  it('sync leaves the popups and the cards in them to the panel layout', () => {
    const { doc, mirror } = setup();
    const { img } = addCard(doc, mirror.zoneElement('self', 'lostZone'), 9);
    const looked = addCard(doc, mirror.zoneElement('opp', 'viewCards'), 10).img;
    mirror.sync({ placements: [] }, {
      9: { left: 110, top: 920, width: 120, height: 168 },
      10: { left: 300, top: 40, width: 120, height: 168 },
      'pile:self:lostZone': { left: 1610, top: 720, width: 100, height: 140 },
      'pile:self:discard': { left: 1710, top: 720, width: 100, height: 140 },
    });
    for (const card of [img, looked]) {
      assert.deepEqual(['left', 'top', 'width', 'height'].map((key) => card.style[key]), ['', '', '', '']);
    }
    for (const id of ['lostZone', 'discard', 'deck']) {
      assert.equal(mirror.zoneElement('self', id).style.left, '', `#${id} is not sized as its pile`);
    }
    assert.equal(mirror.zoneElement('self', 'lostZoneCover').style.left, '1600px');
    assert.equal(mirror.zoneElement('self', 'discardCover').style.width, '100px');
  });
  it('sync pins each hand\'s Sort box and count to its strip: above the near one, below the far one', () => {
    const { mirror } = setup();
    const at = (side, id) => {
      const el = mirror.zoneElement(side, id);
      return [el.style.left, el.style.top, el.style.transform, el.classList.contains('hand-label-placed')];
    };
    mirror.sync({ placements: [] }, {}, {
      'self:hand': { left: 210, top: 900, width: 1500, height: 160 },
      'opp:hand': { left: 310, top: 20, width: 1300, height: 120 },
    });
    // Host box origin (10, 20); a 4 px gap off the strip.
    assert.deepEqual(at('self', 'handLabel'), ['200px', '876px', 'translateY(-100%)', true]);
    assert.deepEqual(at('self', 'handText'), ['1700px', '876px', 'translate(-100%, -100%)', true]);
    assert.deepEqual(at('opp', 'handLabel'), ['1600px', '124px', 'translateX(-100%)', true]);
    assert.deepEqual(at('opp', 'handText'), ['300px', '124px', 'none', true]);
    // A strip wider than the canvas keeps its ends 2% of the canvas in from its edges.
    mirror.sync({ placements: [] }, {}, { 'self:hand': { left: -40, top: 900, width: 1600, height: 160 } }, {
      left: 10, top: 20, width: 1450, height: 1060,
    });
    assert.deepEqual(at('self', 'handLabel').slice(0, 2), ['29px', '876px']);
    assert.deepEqual(at('self', 'handText').slice(0, 2), ['1421px', '876px']);
    mirror.sync({ placements: [] }, {}, { 'self:hand': { left: 210, top: 900, width: 1500, height: 160 } });
    assert.equal(at('opp', 'handLabel')[3], false, 'no strip, no Sort box');
    assert.equal(at('opp', 'handText')[3], false);
    mirror.sync({ placements: [] }, {});
    assert.equal(at('self', 'handText')[3], false, 'an old caller without zones hides them');
  });
});
