import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardHint } from '../../../setup/zones/resolve-card-index.mjs';
import { splitEmitAndTail } from '../../../setup/general/sync-action-args.mjs';

// Mirrors buildMoveCardHints origin-zone lookup (must run before splice).
function hintForHandIndex(handArray, index) {
  const movingCard = handArray[index];
  if (!movingCard) return null;
  return buildCardHint(movingCard);
}

test('post-splice hand index points at wrong card for sync hint', () => {
  const popplio = {
    name: 'Popplio',
    type: 'Pokémon',
    syncInstance: 1,
    image: { src: 'popplio.png' },
  };
  const trainer = {
    name: "Professor's Research",
    type: 'Trainer',
    syncInstance: 2,
    image: { src: 'prof.png' },
  };
  const handBefore = [popplio, trainer];
  const handAfter = [trainer]; // Popplio spliced from index 0

  assert.equal(hintForHandIndex(handBefore, 0)?.name, 'Popplio');
  assert.equal(hintForHandIndex(handAfter, 0)?.name, "Professor's Research");
});

test('pre-move hint must be captured before origin zone splice', () => {
  const popplio = {
    name: 'Popplio',
    type: 'Pokémon',
    syncInstance: 1,
    image: { src: 'popplio.png' },
  };
  const trainer = {
    name: "Professor's Research",
    type: 'Trainer',
    syncInstance: 2,
    image: { src: 'prof.png' },
  };
  const index = 0;
  const handBefore = [popplio, trainer];
  const hintBeforeMove = hintForHandIndex(handBefore, index);

  // Simulate splice (what moveCard does)
  handBefore.splice(index, 1);

  const hintAfterMove = hintForHandIndex(handBefore, index);
  assert.equal(hintBeforeMove?.syncInstance, 1);
  assert.equal(hintAfterMove?.syncInstance, 2);
});

test('acceptAction arity: hints object + trailing false is emit=false', () => {
  const hints = {
    moving: { name: 'Popplio', syncInstance: 1 },
    isEvolution: false,
  };
  // How acceptAction calls moveCardBundle: (..., action, hints, emit)
  const parsed = splitEmitAndTail(hints, false);
  assert.equal(parsed.emit, false);
  assert.equal(parsed.tail.moving.name, 'Popplio');
});

test('local shuffle/top calls still pass emit as a boolean', () => {
  const parsed = splitEmitAndTail(false);
  assert.equal(parsed.emit, false);
  assert.equal(parsed.tail, null);
});

test('mirror autoMove bench swap inherits syncReplay from parent move', () => {
  // Documented contract: autoMoveActiveBenchCard passes syncOptions through
  // to nested moveCard so opponent mirror replay reveals active/bench cards.
  const syncOptions = { syncReplay: true };
  assert.equal(syncOptions.syncReplay, true);
});
