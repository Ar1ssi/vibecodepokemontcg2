import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { voicesFor } from '../../../../netcode/mat-fx/fx-audio.mjs';
import { getBuildBattleBox } from '../box-catalog.mjs';
import { BOX_FACE_TEXTURES, boxFaceTexture, packArtSrc } from '../box-textures.mjs';
import {
  BUILD_BATTLE_DECKS,
  BUILD_BATTLE_SET_CARDS,
} from '../build-battle.generated.mjs';
import { openBox } from '../pack-opening.mjs';
import {
  CARD_FLIP_MS,
  CARD_LIFT_MS,
  CARD_SETTLE_MS,
  FAN_COLLAPSE_MS,
  HIT_HOLD_MS,
  HIT_LIFT_MS,
  PACK_ARTS,
  REVEAL_STAGGER_MS,
  advanceUnboxing,
  cardRevealPhases,
  cardRevealPose,
  createUnboxing,
  faceMatrix3d,
  fanSlot,
  finishedUnboxing,
  hitTierFor,
  homography,
  lidPose,
  nextPackToTear,
  packArtIndexes,
  packSlotKind,
  packSpillPose,
  packTearEdge,
  packTearProgress,
  packTornAt,
  parseUnboxing,
  promoLiftPose,
  tearReleaseOutcome,
  tornPackCount,
  trayRisePose,
  unboxingHoloRarity,
  unboxingTimeline,
  unboxingVoiceFor,
  wrapTearPose,
} from '../unboxing.mjs';

const box = getBuildBattleBox('phantasmal-flames');
const setCards = BUILD_BATTLE_SET_CARDS.me02;
const cardsById = new Map(setCards.map((card) => [card.id, card]));

const play = (events, start = createUnboxing()) => events.reduce(advanceUnboxing, start);
const toPacks = [{ type: 'tearWrap' }, { type: 'openLid' }, { type: 'unwrapDeck' }];
const tear = (packIndex) => ({ type: 'tearPack', packIndex });
const reveal = (packIndex) => ({ type: 'revealCard', packIndex });
const revealAll = (packIndex) => ({ type: 'revealAll', packIndex });

// ── State machine (design 052 rows 3, 4, 7, 17) ──────────────────────────────
test('the beats walk sealed → opened → deckShown → packs → done', () => {
  const sealed = createUnboxing();
  assert.equal(sealed.stage, 'sealed');
  const wrapOff = advanceUnboxing(sealed, { type: 'tearWrap' });
  assert.equal(wrapOff.stage, 'sealed');
  assert.equal(wrapOff.wrapTorn, true);
  assert.equal(play(toPacks.slice(0, 2)).stage, 'opened');
  assert.equal(play(toPacks).stage, 'deckShown');
  const firstTear = play([...toPacks, tear(0)]);
  assert.equal(firstTear.stage, 'packs');
  assert.deepEqual(firstTear.packsTorn, [true, false, false, false]);

  const allOpen = play([0, 1, 2, 3].flatMap((i) => [tear(i), revealAll(i)]), play(toPacks));
  assert.equal(allOpen.stage, 'done');
  assert.deepEqual(allOpen, finishedUnboxing());
});

test('row 3: an illegal event returns the same object', () => {
  const sealed = createUnboxing();
  assert.equal(advanceUnboxing(sealed, { type: 'openLid' }), sealed, 'lid before the wrap');
  assert.equal(advanceUnboxing(sealed, tear(0)), sealed, 'pack before the box is open');
  assert.equal(advanceUnboxing(sealed, reveal(0)), sealed, 'reveal before any tear');

  const deckShown = play(toPacks);
  assert.equal(advanceUnboxing(deckShown, reveal(0)), deckShown, 'reveal an untorn pack');
  assert.equal(advanceUnboxing(deckShown, tear(4)), deckShown, 'no pack 5');
  assert.equal(advanceUnboxing(deckShown, tear(-1)), deckShown);
  assert.equal(advanceUnboxing(deckShown, { type: 'tearPack' }), deckShown);

  const torn = play([tear(0)], deckShown);
  assert.equal(advanceUnboxing(torn, tear(0)), torn, 'tear twice');
  const midPack = play([reveal(0), reveal(0)], torn);
  assert.equal(advanceUnboxing(midPack, { type: 'finish' }), midPack, 'finish mid-pack');

  const done = finishedUnboxing();
  assert.equal(advanceUnboxing(done, { type: 'finish' }), done);
  assert.equal(advanceUnboxing(done, reveal(0)), done);
  assert.equal(advanceUnboxing(sealed, { type: 'shake' }), sealed);
  assert.equal(advanceUnboxing(sealed, undefined), sealed);
});

test('packs open one after the other: in order, each after the last is fully revealed', () => {
  const deckShown = play(toPacks);
  assert.equal(nextPackToTear(createUnboxing()), -1, 'not before the deck is shown');
  assert.equal(nextPackToTear(deckShown), 0);
  assert.equal(advanceUnboxing(deckShown, tear(2)), deckShown, 'pack 3 before pack 1');

  const midPack = play([tear(0), reveal(0)], deckShown);
  assert.equal(nextPackToTear(midPack), -1, 'pack 1 still has face-down cards');
  assert.equal(advanceUnboxing(midPack, tear(1)), midPack, 'pack 2 while pack 1 is mid-reveal');

  const firstDone = play([revealAll(0)], midPack);
  assert.equal(nextPackToTear(firstDone), 1);
  assert.equal(advanceUnboxing(firstDone, tear(3)), firstDone, 'pack 4 skips pack 2');
  assert.deepEqual(play([tear(1)], firstDone).packsTorn, [true, true, false, false]);
  assert.equal(nextPackToTear(finishedUnboxing()), -1);
});

test('row 17: Skip scene from sealed jumps to done', () => {
  assert.deepEqual(advanceUnboxing(createUnboxing(), { type: 'finish' }), finishedUnboxing());
  const packDone = play([...toPacks, tear(0), revealAll(0)]);
  assert.equal(advanceUnboxing(packDone, { type: 'finish' }).stage, 'done');
});

test('row 7: Reveal all continues from the current card', () => {
  const three = play([...toPacks, tear(0), revealAll(0), tear(1), reveal(1), reveal(1), reveal(1)]);
  assert.equal(three.revealed[1], 3);
  const beats = unboxingTimeline(three, { packIndex: 1 });
  const cards = beats.filter((beat) => beat.kind !== 'collapse').map((beat) => beat.cardIndex);
  assert.deepEqual(cards, [3, 4, 5, 6, 7, 8, 9], 'no card revealed twice');
  assert.equal(advanceUnboxing(three, revealAll(1)).revealed[1], 10);
});

test('row 4: every stage survives a save/parse round trip', () => {
  const states = [
    createUnboxing(),
    play(toPacks.slice(0, 1)),
    play(toPacks.slice(0, 2)),
    play(toPacks),
    play([...toPacks, tear(0), reveal(0), reveal(0), reveal(0)]),
    finishedUnboxing(),
  ];
  for (const state of states) {
    assert.deepEqual(parseUnboxing(JSON.parse(JSON.stringify(state))), state, state.stage);
  }
  const midPack = parseUnboxing(states[4]);
  assert.equal(midPack.revealed[0], 3, '3 cards in the fan, 7 on the stack');
  assert.equal(tornPackCount(midPack), 1);
});

test('parseUnboxing refuses inconsistent states', () => {
  const good = createUnboxing();
  const bad = (patch) => parseUnboxing({ ...good, ...patch });
  assert.equal(parseUnboxing(null), null);
  assert.equal(bad({ stage: 'lidless' }), null);
  assert.equal(bad({ wrapTorn: 'yes' }), null);
  assert.equal(bad({ packsTorn: [false, false, false] }), null);
  assert.equal(bad({ revealed: [0, 0, 0, 11] }), null);
  assert.equal(bad({ revealed: [0, 0, 0, 0.5] }), null);
  assert.equal(bad({ stage: 'opened' }), null, 'lid open with the wrap on');
  assert.equal(bad({ stage: 'done', wrapTorn: true }), null, 'done with nothing revealed');
  assert.equal(
    bad({ stage: 'packs', wrapTorn: true, packsTorn: [true, true, true, true], revealed: [10, 10, 10, 10] }),
    null,
    'all revealed is done, not packs'
  );
});

// ── Poses ────────────────────────────────────────────────────────────────────
test('lidPose opens from 0° to −112° and overshoots on the way', () => {
  assert.deepEqual(lidPose(0), { rotateXDeg: 0, translateYPx: 0 });
  assert.equal(lidPose(1).rotateXDeg, -112);
  const samples = Array.from({ length: 21 }, (_, i) => lidPose(i / 20).rotateXDeg);
  assert.ok(Math.min(...samples) < -112, 'the lid swings past open before settling');
  assert.deepEqual(lidPose(-1), lidPose(0));
  assert.deepEqual(lidPose(2), lidPose(1));
});

test('wrapTearPose wipes the wrap away from the top-right corner', () => {
  const pointCount = (pose) => pose.clipPath.match(/%\s/g).length;
  assert.equal(wrapTearPose(0).clipPath, 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 100%)');
  assert.ok(!wrapTearPose(0.3).clipPath.includes('100% 0%'), 'top-right corner goes first');
  assert.ok(wrapTearPose(0.3).clipPath.includes('0% 100%'), 'bottom-left goes last');
  for (const t of [0, 0.2, 0.5, 0.8, 1]) assert.equal(pointCount(wrapTearPose(t)), 5);
  assert.match(wrapTearPose(1).clipPath, /^polygon\((0% 100%(, )?){5}\)$/);
});

test('trayRisePose rises 24 px per item, staggered by index', () => {
  assert.deepEqual(trayRisePose(0, 0), { translateYPx: 24, opacity: 0 });
  for (let index = 0; index < 7; index += 1) {
    assert.deepEqual(trayRisePose(1, index), { translateYPx: 0, opacity: 1 });
  }
  assert.ok(trayRisePose(0.3, 0).opacity > trayRisePose(0.3, 6).opacity, 'later items lag');
});

test('promoLiftPose lifts 40 px and settles its tilt to 0', () => {
  const start = promoLiftPose(0);
  assert.equal(start.translateYPx + 0, 0);
  assert.equal(start.scale, 1);
  const end = promoLiftPose(1);
  assert.equal(end.translateYPx, -40);
  assert.ok(Math.abs(end.rotateXDeg) < 1e-9 && Math.abs(end.rotateYDeg) < 1e-9);
  const mid = promoLiftPose(0.5);
  assert.ok(mid.rotateXDeg <= -7.9 && mid.rotateYDeg >= 5.9, 'tilts −8°/+6° at its peak');
});

test('row 5: a tear needs 40 % of the width, or a click', () => {
  assert.equal(packTearProgress(39, 100), 0.39);
  assert.equal(packTornAt(packTearProgress(39, 100)), false);
  assert.equal(packTornAt(packTearProgress(40, 100)), true);
  assert.equal(packTearProgress(500, 100), 1);
  assert.equal(packTearProgress(-20, 100), 0);
  assert.equal(packTearProgress(40, 0), 0);
  assert.equal(packTearProgress(Number.NaN, 100), 0);

  assert.equal(tearReleaseOutcome({ dxPx: 39, movedPx: 39, widthPx: 100 }), 'spring');
  assert.equal(tearReleaseOutcome({ dxPx: 40, movedPx: 40, widthPx: 100 }), 'tear');
  assert.equal(tearReleaseOutcome({ dxPx: 5, movedPx: 5, widthPx: 100 }), 'tear', 'a click');
  assert.equal(tearReleaseOutcome({ dxPx: 7, movedPx: 7, widthPx: 100 }), 'spring', 'a short drag');
});

test('packSpillPose rises 55 % of the pack then settles into an offset stack', () => {
  const size = { packWidthPx: 100, packHeightPx: 200 };
  assert.deepEqual(packSpillPose(0, 0, size), { translateXPx: 0, translateYPx: 0, rotateZDeg: 0 });
  const risen = packSpillPose(0.5, 0, size);
  assert.ok(Math.abs(risen.translateYPx + 110) < 1e-9, `${risen.translateYPx}`);
  assert.equal(risen.translateXPx, 0);
  const settled = [0, 9].map((index) => packSpillPose(1, index, size));
  assert.deepEqual(settled[0], { translateXPx: 112, translateYPx: 0, rotateZDeg: 0 });
  assert.deepEqual(settled[1], { translateXPx: 130, translateYPx: -18, rotateZDeg: 8 });
});

test('cardRevealPose lifts, crosses 90° at the flip midpoint, and flares only on hits', () => {
  for (const tier of [0, 1, 2, 3]) {
    const { flipMid, flipEnd } = cardRevealPhases(tier);
    assert.equal(cardRevealPose(0, { tier }).rotateYDeg, 0);
    assert.ok(Math.abs(cardRevealPose(flipMid, { tier }).rotateYDeg - 90) < 1e-9, `tier ${tier}`);
    assert.equal(cardRevealPose(flipEnd, { tier }).rotateYDeg, 180);
    assert.equal(cardRevealPose(1, { tier }).translateYPx + 0, 0, 'settles back down');
  }
  const { flipStart } = cardRevealPhases(0);
  assert.equal(cardRevealPose(flipStart, { tier: 0 }).translateYPx, -18);
  assert.equal(cardRevealPose(cardRevealPhases(1).flipStart, { tier: 1 }).translateYPx, -34);

  for (const tier of [0, 1]) {
    for (let i = 0; i <= 20; i += 1) assert.equal(cardRevealPose(i / 20, { tier }).flare, 0);
  }
  assert.equal(cardRevealPose(0.55, { tier: 2 }).flare, 1, 'flare peaks at 0.55');
  assert.ok(cardRevealPose(0.4, { tier: 3 }).flare < 1);
  assert.equal(cardRevealPose(0, { tier: 3 }).flare, 0);
});

test('cardRevealPhases uses the hit timings from tier 2', () => {
  assert.equal(cardRevealPhases(0).totalMs, CARD_LIFT_MS + CARD_FLIP_MS + CARD_SETTLE_MS);
  assert.equal(cardRevealPhases(1).totalMs, CARD_LIFT_MS + CARD_FLIP_MS + CARD_SETTLE_MS);
  assert.equal(cardRevealPhases(2).totalMs, HIT_LIFT_MS + CARD_FLIP_MS + HIT_HOLD_MS);
});

test('fanSlot spreads cards symmetrically within ±8°', () => {
  assert.deepEqual(fanSlot(0, 1, 500), { xPx: 0, rotateZDeg: 0 });
  assert.deepEqual(fanSlot(0, 10, 500), { xPx: -225, rotateZDeg: -8 });
  assert.deepEqual(fanSlot(9, 10, 500), { xPx: 225, rotateZDeg: 8 });
  assert.deepEqual(fanSlot(2, 5, Number.NaN), { xPx: 0, rotateZDeg: 0 });
});

// ── Slots, tiers, foil (row 11) ──────────────────────────────────────────────
function styledHoloFamilies() {
  const dir = new URL('../../../../../css/holo/', import.meta.url);
  const families = new Set();
  for (const file of readdirSync(dir)) {
    const css = readFileSync(new URL(file, dir), 'utf8');
    for (const [, value] of css.matchAll(/data-rarity\$?="([^"]+)"/g)) families.add(value);
  }
  return families;
}

test('packSlotKind finds the reverse draws in slot order', () => {
  const common = { rarity: 'Common' };
  const kinds = Array.from({ length: 10 }, (_, index) =>
    packSlotKind(box.packModel, index, common)
  );
  assert.deepEqual(kinds, [...Array(7).fill('normal'), 'reverse', 'reverse', 'normal']);
  assert.equal(packSlotKind(box.packModel, 8, { rarity: 'Illustration rare' }), 'normal');
  assert.equal(packSlotKind(box.packModel, 8, { rarity: 'Special illustration rare' }), 'normal');
  assert.equal(packSlotKind(box.packModel, 9, { rarity: 'Double rare' }), 'normal');
  assert.equal(packSlotKind(undefined, 3, common), 'normal');
});

test('hitTierFor ranks plain, reverse/Double rare, UR/IR, SIR/MHR', () => {
  assert.equal(hitTierFor({ rarity: 'Common' }, 'normal'), 0);
  assert.equal(hitTierFor({ rarity: 'Rare' }, 'normal'), 0);
  assert.equal(hitTierFor({ rarity: 'Uncommon' }, 'reverse'), 1);
  assert.equal(hitTierFor({ rarity: 'Double rare' }, 'normal'), 1);
  assert.equal(hitTierFor({ rarity: 'Ultra Rare' }, 'normal'), 2);
  assert.equal(hitTierFor({ rarity: 'Illustration rare' }, 'normal'), 2);
  assert.equal(hitTierFor({ rarity: 'Special illustration rare' }, 'normal'), 3);
  assert.equal(hitTierFor({ rarity: 'Mega Hyper Rare' }, 'normal'), 3);
  assert.equal(hitTierFor(undefined, 'normal'), 0);
});

test('row 11: every me02 card and promo maps to a styled foil family or none', () => {
  const styled = styledHoloFamilies();
  const promos = Object.values(BUILD_BATTLE_DECKS['phantasmal-flames'])
    .flat()
    .filter((row) => row.rarity === 'Promo');
  assert.equal(promos.length, 4, 'one promo per deck (mep-014…mep-017)');
  for (const card of [...setCards, ...promos]) {
    for (const slot of ['normal', 'reverse']) {
      const family = unboxingHoloRarity(card, slot);
      if (family === null) {
        assert.ok(['Common', 'Uncommon'].includes(card.rarity) && slot === 'normal', card.id);
        continue;
      }
      assert.ok(styled.has(family) || family.endsWith('reverse holo'), `${card.id}/${slot}: ${family}`);
      if (slot === 'reverse') assert.match(family, /reverse holo$/, card.id);
    }
  }
  const plainRare = setCards.find((card) => card.rarity === 'Rare' && !/\bex$/i.test(card.name));
  assert.equal(unboxingHoloRarity(plainRare, 'normal'), 'rare holo', plainRare.id);
  const plainPromo = { name: 'Test Promo', rarity: 'Promo' };
  assert.equal(unboxingHoloRarity(plainPromo, 'normal'), 'rare holo');
  assert.equal(unboxingHoloRarity({ rarity: 'Common', name: 'Oddish' }, 'normal'), null);
  assert.equal(unboxingHoloRarity(undefined, 'normal'), null);
});

test('rows 11 + 13: the seed-42 box reveals the pack ids in order with reverse slots foiled', () => {
  const opened = openBox({ box, cards: setCards, rng: createRng(42) });
  for (const pack of opened.packs) {
    const cards = pack.map((id) => cardsById.get(id));
    assert.deepEqual(cards.map((card) => card.id), pack);
    assert.match(unboxingHoloRarity(cards[7], packSlotKind(box.packModel, 7, cards[7])), /reverse holo$/);
  }
});

// ── Timeline ─────────────────────────────────────────────────────────────────
test('unboxingTimeline staggers reveals and lets a hit play alone', () => {
  const torn = play([...toPacks, tear(0)]);
  const plain = unboxingTimeline(torn, { packIndex: 0 });
  assert.equal(plain.length, 10, 'no collapse while other packs are sealed');
  assert.deepEqual(plain.slice(0, 3).map((beat) => beat.at), [0, REVEAL_STAGGER_MS, 2 * REVEAL_STAGGER_MS]);
  assert.ok(plain.every((beat) => beat.kind === 'reveal'));

  const tiers = [0, 0, 0, 0, 0, 0, 0, 1, 0, 3];
  const withHit = unboxingTimeline(torn, { tiers });
  const hit = withHit.find((beat) => beat.kind === 'hit');
  assert.equal(hit.cardIndex, 9);
  assert.equal(hit.durationMs, HIT_LIFT_MS + CARD_FLIP_MS + HIT_HOLD_MS);

  const lastPack = play([0, 1, 2].flatMap((i) => [tear(i), revealAll(i)]).concat([tear(3)]), play(toPacks));
  const closing = unboxingTimeline(lastPack, { tiers });
  const collapse = closing.at(-1);
  assert.equal(collapse.kind, 'collapse');
  assert.equal(collapse.durationMs, FAN_COLLAPSE_MS);
  assert.equal(collapse.at, hit.at + hit.durationMs);

  assert.deepEqual(unboxingTimeline(createUnboxing()), []);
  assert.deepEqual(unboxingTimeline(finishedUnboxing()), []);
  assert.deepEqual(unboxingTimeline(torn, { packIndex: 2 }), [], 'an untorn pack has no beats');
});

// ── Sound ────────────────────────────────────────────────────────────────────
test('every beat names a voice the palette has, and the hit chime climbs with the tier', () => {
  const events = ['tearWrap', 'tearPack', 'openLid', 'unwrapDeck', 'finish'];
  for (const event of events) {
    const effect = unboxingVoiceFor(event);
    assert.ok(voicesFor(effect).length > 0, `${event} → ${effect}`);
  }
  assert.equal(unboxingVoiceFor('revealCard', 0), 'unbox-flip');
  assert.equal(unboxingVoiceFor('revealCard', 1), 'unbox-hit-1');
  assert.equal(unboxingVoiceFor('revealCard', 3), 'unbox-hit-3');
  assert.ok(voicesFor('unbox-hit-3').length >= 2);
  assert.equal(unboxingVoiceFor('revealAll'), null, 'reveal all sounds per card');
  assert.equal(unboxingVoiceFor('toString'), null);
});

// ── Pack art and tear edge (row 10b) ─────────────────────────────────────────
test('row 10b: pack art is seeded on its own stream and never shifts the pool', () => {
  assert.deepEqual(packArtIndexes(42), packArtIndexes(42));
  assert.equal(packArtIndexes(42).length, 4);
  assert.ok(packArtIndexes(42).every((index) => index >= 0 && index < PACK_ARTS.length));
  const distinct = new Set(
    Array.from({ length: 100 }, (_, seed) => packArtIndexes(seed).join())
  );
  assert.ok(distinct.size > 1, 'arrays differ across seeds');

  // The seed-42 box as design 051 slice 2 landed it.
  const opened = openBox({ box, cards: setCards, rng: createRng(42) });
  assert.equal(opened.deckKey, 'flygon');
  assert.deepEqual(opened.packs[0], [
    'me02-035', 'me02-073', 'me02-057', 'me02-012', 'me02-069',
    'me02-044', 'me02-082', 'me02-046', 'me02-086', 'me02-017',
  ]);
  assert.deepEqual(opened.packs[3].at(-1), 'me02-045');
  assert.equal(packArtSrc(PACK_ARTS[0]), 'src/assets/build-battle/packs/me02-charizard.webp');
});

test('packTearEdge is a seeded jagged strip below the 7 % crimp', () => {
  const edge = packTearEdge(42, 0);
  assert.equal(edge, packTearEdge(42, 0), 'a reload shows the same tear');
  assert.notEqual(edge, packTearEdge(42, 1));
  const points = edge.slice('polygon('.length, -1).split(', ');
  assert.equal(points.length, 2 + 25, 'top edge + 12 teeth');
  const depths = points.slice(2).map((point) => Number.parseFloat(point.split(' ')[1]));
  depths.forEach((depth, index) => {
    if (index % 2 === 0) assert.equal(depth, 7);
    else assert.ok(depth >= 9 && depth <= 12, `tooth ${depth}`);
  });
});

// ── Box faces (row 10a) ──────────────────────────────────────────────────────
const applyMatrix = (matrix, { x, y }) => {
  const v = matrix.slice('matrix3d('.length, -1).split(', ').map(Number);
  const w = v[3] * x + v[7] * y + v[15];
  return { x: (v[0] * x + v[4] * y + v[12]) / w, y: (v[1] * x + v[5] * y + v[13]) / w };
};

test('row 10a: faceMatrix3d squares a quad onto its face', () => {
  const rectangle = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 200 },
    { x: 0, y: 200 },
  ];
  assert.equal(
    faceMatrix3d(rectangle, 50, 100),
    'matrix3d(0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'
  );

  const targets = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 435 },
    { x: 0, y: 435 },
  ];
  for (const face of Object.values(BOX_FACE_TEXTURES)) {
    const matrix = faceMatrix3d(face.quad, 300, 435);
    face.quad.forEach((corner, index) => {
      const landed = applyMatrix(matrix, corner);
      assert.ok(Math.abs(landed.x - targets[index].x) < 0.5, `x ${landed.x}`);
      assert.ok(Math.abs(landed.y - targets[index].y) < 0.5, `y ${landed.y}`);
    });
  }

  const degenerate = [rectangle[0], rectangle[0], rectangle[2], rectangle[3]];
  assert.throws(() => faceMatrix3d(degenerate, 50, 100), /degenerate/);
  assert.throws(() => faceMatrix3d(rectangle.slice(0, 3), 50, 100), /four/);
  assert.throws(() => faceMatrix3d(rectangle, 0, 100), /positive/);
  assert.equal(homography(rectangle, rectangle).length, 8);
});

test('box textures: the front and left are cut from the render, the rest are procedural', () => {
  assert.equal(boxFaceTexture('front').src, 'src/assets/build-battle/box/front.webp');
  assert.equal(boxFaceTexture('left').src, 'src/assets/build-battle/box/left.webp');
  for (const face of ['right', 'back', 'top', 'bottom', 'toString']) {
    assert.equal(boxFaceTexture(face), null, face);
  }
  for (const face of Object.values(BOX_FACE_TEXTURES)) {
    const { width, height } = face.cropInRender;
    assert.ok(face.quad.every(({ x, y }) => x >= 0 && x <= width && y >= 0 && y <= height));
  }
});
