import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatPickerRequest } from '../mat-pick-request.mjs';

const record = (instanceId, zone, name = 'Pikachu') => ({
  instanceId,
  zone,
  element: { instanceId },
  card: { name },
  holoCard: { wrapper: { instanceId } },
});

const registryOf = (records) => new Map(records.map((r) => [r.instanceId, r]));

const choice = (overrides = {}) => ({
  prompt: 'Rare Candy: Choose the Basic Pokémon',
  options: [
    { instanceId: 1, name: 'Swinub' },
    { instanceId: 2, name: 'Budew' },
  ],
  min: 1,
  max: 1,
  cancellable: false,
  ...overrides,
});

test('single in-play pick maps every option to a mat candidate', () => {
  const registry = registryOf([
    record(1, 'active', 'Swinub'),
    record(2, 'bench', 'Budew'),
  ]);
  const req = buildMatPickerRequest(choice(), registry);

  assert.equal(req.title, 'Rare Candy: Choose the Basic Pokémon');
  assert.equal(req.cancellable, false);
  assert.equal(req.candidates.length, 2);
  assert.equal(req.candidates[0].instanceId, 1);
  assert.equal(req.candidates[0].name, 'Swinub');
  assert.equal(req.candidates[0].image, registry.get(1).element);
  assert.equal(req.candidates[0].wrapper, registry.get(1).holoCard.wrapper);
  assert.equal(req.candidates[1].name, 'Budew');
});

test('no options / no registry entry / missing element means no mat pick', () => {
  assert.equal(
    buildMatPickerRequest(choice({ options: [] }), registryOf([])),
    null
  );
  assert.equal(buildMatPickerRequest(null, registryOf([])), null);
  assert.equal(
    buildMatPickerRequest(choice(), registryOf([record(1, 'active')])),
    null
  );
  assert.equal(
    buildMatPickerRequest(
      choice(),
      registryOf([{ instanceId: 1, zone: 'active' }, record(2, 'bench')])
    ),
    null
  );
});

test('off-mat options (hand/deck/discard/prizes) are not mat picks', () => {
  for (const zone of [
    'hand',
    'deck',
    'discard',
    'prizes',
    'lostZone',
    'board',
  ]) {
    assert.equal(
      buildMatPickerRequest(
        choice(),
        registryOf([record(1, zone), record(2, 'bench')])
      ),
      null,
      `zone ${zone} must not be treated as in play`
    );
  }
});

test('mixed option set falls back (one off-mat option disqualifies the whole choice)', () => {
  assert.equal(
    buildMatPickerRequest(
      choice(),
      registryOf([record(1, 'active'), record(2, 'hand')])
    ),
    null
  );
});

test('multi-pick in-play choices keep the mat picker with a max > 1', () => {
  const req = buildMatPickerRequest(
    choice({ max: 2 }),
    registryOf([record(1, 'active'), record(2, 'bench')])
  );
  assert.ok(req);
  assert.equal(req.min, 1);
  assert.equal(req.max, 2);
  assert.equal(req.cancellable, false);
});

test('an "up to N" in-play choice is cancellable and bounded by the option count', () => {
  const req = buildMatPickerRequest(
    choice({ min: 0, max: 5 }),
    registryOf([record(1, 'active'), record(2, 'bench')])
  );
  assert.ok(req);
  assert.equal(req.min, 0);
  assert.equal(req.max, 2);
  assert.equal(req.cancellable, true);
});

test('missing/invalid max defaults to the single-pick path', () => {
  const req = buildMatPickerRequest(
    choice({ max: undefined }),
    registryOf([record(1, 'active'), record(2, 'bench')])
  );
  assert.ok(req);
  assert.equal(req.max, 1);
});

test('an optional (cancellable) in-play choice keeps the decline affordance', () => {
  const req = buildMatPickerRequest(
    choice({ min: 0, cancellable: true }),
    registryOf([record(1, 'active'), record(2, 'bench')])
  );
  assert.equal(req.cancellable, true);
});

test('a required choice is not cancellable even if the choice object says so', () => {
  const req = buildMatPickerRequest(
    choice({ min: 1, cancellable: true }),
    registryOf([record(1, 'active'), record(2, 'bench')])
  );
  assert.equal(req.cancellable, false);
});

test('attached cards in a play zone are not mat targets (only Pokémon roots)', () => {
  const attachedEnergy = {
    instanceId: 2,
    zone: 'active',
    element: {},
    card: { name: 'Basic Fire Energy', attachedTo: 1 },
  };
  assert.equal(
    buildMatPickerRequest(
      choice(),
      registryOf([record(1, 'active'), attachedEnergy])
    ),
    null
  );
});

test('candidate name falls back to the choice option when the record has no card', () => {
  const bare = { instanceId: 1, zone: 'active', element: {}, card: null };
  const req = buildMatPickerRequest(
    choice({ options: [{ instanceId: 1, name: 'Swinub' }] }),
    registryOf([bare])
  );
  assert.equal(req.candidates[0].name, 'Swinub');
  assert.equal(req.candidates[0].instanceId, 1);
});

// Peonia (Chilling Reign 149/196/219): "Put up to 3 Prize cards into your hand." The Prize pick is
// blind, so the cards on the mat are the picker, not a menu of card backs.
const PEONIA = {
  prompt: 'Peonia: Choose up to 3 Prize card(s) to put into your hand',
  options: [20, 21, 22, 23].map((instanceId) => ({ instanceId, faceDown: true })),
  min: 0,
  max: 3,
  resumeToken: { stepIndex: 0, steps: [{ type: 'prizeToHand', count: 3, replace: true }] },
};
const prizeRecords = () => [20, 21, 22, 23].map((id) => record(id, 'prizes', 'Card Back'));

test('a Peonia Prize pick maps every face-down Prize card to a mat candidate', () => {
  const registry = registryOf(prizeRecords());
  const req = buildMatPickerRequest(PEONIA, registry);

  assert.ok(req, 'the Prize cards are click targets');
  assert.equal(req.title, PEONIA.prompt);
  assert.deepEqual(req.candidates.map((c) => c.instanceId), [20, 21, 22, 23]);
  assert.equal(req.candidates[2].image, registry.get(22).element);
  assert.equal(req.candidates[2].wrapper, registry.get(22).holoCard.wrapper);
  assert.equal(req.min, 0);
  assert.equal(req.max, 3, '"up to 3" stays a multi-pick');
  assert.equal(req.cancellable, true, 'taking none is allowed');
});

test('a Prize pick with a missing element, or Prize cards mixed with other zones, is not a mat pick', () => {
  assert.equal(
    buildMatPickerRequest(PEONIA, registryOf([...prizeRecords().slice(0, 3), { instanceId: 23, zone: 'prizes' }])),
    null
  );
  assert.equal(
    buildMatPickerRequest(PEONIA, registryOf([...prizeRecords().slice(0, 3), record(23, 'hand')])),
    null
  );
  assert.equal(
    buildMatPickerRequest(PEONIA, registryOf([...prizeRecords().slice(0, 3), record(23, 'bench')])),
    null
  );
});

// "… put a card from your hand face down as a Prize card": the hand pick of the same step.
const PEONIA_HAND = {
  prompt: 'Peonia: Choose 2 card(s) from your hand to set face down as Prizes',
  options: [{ instanceId: 30, name: 'Ultra Ball', src: '/u.png' }, { instanceId: 31, name: 'Fire Energy', src: '/f.png' }],
  min: 2,
  max: 2,
  resumeToken: PEONIA.resumeToken,
};
const handRecords = () => [record(30, 'hand', 'Ultra Ball'), record(31, 'hand', 'Fire Energy')];

test("Peonia's hand pick (cards to set as Prizes) maps the hand cards to mat candidates", () => {
  const registry = registryOf(handRecords());
  const req = buildMatPickerRequest(PEONIA_HAND, registry);

  assert.ok(req, 'the hand cards are click targets');
  assert.deepEqual(req.candidates.map((c) => [c.instanceId, c.name]), [[30, 'Ultra Ball'], [31, 'Fire Energy']]);
  assert.equal(req.candidates[0].image, registry.get(30).element);
  assert.equal(req.min, 2);
  assert.equal(req.max, 2);
  assert.equal(req.cancellable, false, 'the Prize swap must be completed');
});

test('only the Prize swap picks on the mat: any other hand pick, or a named Prize, keeps its menu', () => {
  const { resumeToken, ...plainHand } = PEONIA_HAND;
  assert.equal(buildMatPickerRequest(plainHand, registryOf(handRecords())), null, 'a plain hand pick keeps the card carousel');
  assert.equal(
    buildMatPickerRequest({ ...plainHand, resumeToken: { stepIndex: 0, steps: [{ type: 'discardHandThenDraw' }] } }, registryOf(handRecords())),
    null,
    'another step does not qualify'
  );
  assert.equal(
    buildMatPickerRequest({ ...PEONIA_HAND, options: [{ instanceId: 30, name: 'Ultra Ball' }, { instanceId: 20 }] }, registryOf([record(30, 'hand'), record(20, 'prizes')])),
    null,
    'hand cards mixed with a Prize card'
  );
  const named = { ...PEONIA, options: PEONIA.options.map(({ instanceId }) => ({ instanceId, name: 'Pikachu', src: '/p.png' })) };
  assert.equal(buildMatPickerRequest(named, registryOf(prizeRecords())), null, 'a Prize the owner looked at keeps the menu that names it');
});

test("Peonia's hand candidates carry a stackKey per printing; in-play and Prize candidates carry none", () => {
  const same = { id: 'sv1-1' };
  const registry = registryOf([
    { ...record(30, 'hand', 'Fire Energy'), card: { name: 'Fire Energy', ...same } },
    { ...record(31, 'hand', 'Fire Energy'), card: { name: 'Fire Energy', ...same } },
    { ...record(32, 'hand', 'Fire Energy'), card: { name: 'Fire Energy', id: 'sv2-9' } },
  ]);
  const hand = { ...PEONIA_HAND, options: [30, 31, 32].map((instanceId) => ({ instanceId, name: 'Fire Energy', src: '/f.png' })), min: 2, max: 2 };
  const [a, b, c] = buildMatPickerRequest(hand, registry).candidates.map((x) => x.stackKey);
  assert.equal(a, b, 'two copies of one printing share a stack');
  assert.notEqual(a, c, 'another printing is its own stack');

  const prizes = buildMatPickerRequest(PEONIA, registryOf(prizeRecords())).candidates;
  assert.ok(prizes.every((x) => !('stackKey' in x)));
  const inPlay = buildMatPickerRequest(choice(), registryOf([record(1, 'active'), record(2, 'bench')])).candidates;
  assert.ok(inPlay.every((x) => !('stackKey' in x)));
});
