// Design 074 D4: with the 3D board requested, containers.js hands the board mirror's shadow
// roots to every importer as the container documents, and getZone resolves zones from them.
// containers.js decides at module load, so the page globals are set before it is imported.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  '<body><div id="board3dHost"><div id="boardMirror"><div id="selfBoard" class="self"></div>' +
    '<div id="oppBoard" class="opp"></div></div></div>' +
    '<iframe id="selfContainer"></iframe><iframe id="oppContainer"></iframe><div id="stadium"></div></body>',
  { url: 'http://localhost/?board=3d' }
);
// jsdom has no WebGL: a context stand-in passes containers.js's WebGL2 probe.
dom.window.HTMLCanvasElement.prototype.getContext = (kind) => (kind === 'webgl2' ? { getExtension: () => null } : null);
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;

const containers = await import('../../../initialization/global-variables/containers.js');
const { getZone } = await import('../get-zone.js');

describe('getZone over the board mirror', () => {
  it('exports the mirror hosts and roots as the containers', () => {
    assert.ok(containers.boardMirror);
    assert.equal(containers.selfContainer, document.getElementById('selfBoard'));
    assert.equal(containers.oppContainer, document.getElementById('oppBoard'));
    assert.equal(containers.selfContainerDocument, containers.boardMirror.roots.self);
    assert.equal(containers.oppContainerDocument, document.getElementById('oppBoard').shadowRoot);
  });

  it("resolves a side's zones and covers from its shadow root", () => {
    const active = getZone('self', 'active');
    assert.equal(active.element, containers.selfContainerDocument.getElementById('active'));
    assert.equal(active.element.getRootNode(), containers.selfContainerDocument);
    const deck = getZone('opp', 'deck');
    assert.equal(deck.elementCover, containers.oppContainerDocument.getElementById('deckCover'));
    const cover = getZone('self', 'discardCover');
    assert.equal(cover.element, containers.selfContainerDocument.getElementById('discard'));
    assert.equal(cover.elementCover, containers.selfContainerDocument.getElementById('discardCover'));
  });

  it('counts the card images rendered into a mirror zone', () => {
    const hand = getZone('self', 'hand');
    assert.equal(hand.getRenderedCount(), 0);
    for (let i = 0; i < 3; i += 1) hand.element.appendChild(document.createElement('img'));
    assert.equal(getZone('self', 'hand').getRenderedCount(), 3);
    assert.equal(getZone('opp', 'hand').getRenderedCount(), 0);
  });

  it('keeps the Stadium on the page document', () => {
    assert.equal(getZone('self', 'stadium').element, document.getElementById('stadium'));
  });
});
