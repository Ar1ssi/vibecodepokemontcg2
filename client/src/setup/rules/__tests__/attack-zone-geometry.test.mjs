import test from 'node:test';
import assert from 'node:assert/strict';

const { attackZoneBounds, listAttackZoneBounds, abilityZoneBounds, computeContentBox } =
  await import('../attack-zone-geometry.js');

test('0 attacks: attackZoneBounds and listAttackZoneBounds both return empty/null', () => {
  assert.equal(attackZoneBounds({ attackCount: 0, index: 0 }), null);
  assert.deepEqual(listAttackZoneBounds({ attackCount: 0 }), []);
});

test('1 attack: single zone spans the whole band', () => {
  const zones = listAttackZoneBounds({ attackCount: 1 });
  assert.equal(zones.length, 1);
  assert.ok(zones[0].heightPct > 0);
});

test('2 attacks: two equal, non-overlapping zones covering the band', () => {
  const zones = listAttackZoneBounds({ attackCount: 2 });
  assert.equal(zones.length, 2);
  assert.equal(zones[0].heightPct, zones[1].heightPct);
  // second zone starts exactly where the first ends
  assert.equal(zones[0].topPct + zones[0].heightPct, zones[1].topPct);
});

test('3 attacks: three equal shares, in order, non-overlapping', () => {
  const zones = listAttackZoneBounds({ attackCount: 3 });
  assert.equal(zones.length, 3);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(zones[i].heightPct, zones[0].heightPct);
  }
  assert.equal(zones[1].topPct, zones[0].topPct + zones[0].heightPct);
  assert.equal(zones[2].topPct, zones[1].topPct + zones[1].heightPct);
});

test('an ability shifts the whole attack band down without changing zone heights', () => {
  const noAbility = listAttackZoneBounds({ attackCount: 2, abilityCount: 0 });
  const withAbility = listAttackZoneBounds({ attackCount: 2, abilityCount: 1 });
  assert.equal(withAbility[0].heightPct, noAbility[0].heightPct);
  assert.ok(withAbility[0].topPct > noAbility[0].topPct);
});

test('attackZoneBounds rejects an out-of-range index', () => {
  assert.equal(attackZoneBounds({ attackCount: 2, index: 2 }), null);
  assert.equal(attackZoneBounds({ attackCount: 2, index: -1 }), null);
});

test('abilityZoneBounds is null with no ability, present with one, and sits above the attack band', () => {
  assert.equal(abilityZoneBounds({ abilityCount: 0 }), null);
  const ability = abilityZoneBounds({ abilityCount: 1 });
  const [firstAttack] = listAttackZoneBounds({ attackCount: 1, abilityCount: 1 });
  assert.ok(ability.heightPct > 0);
  assert.ok(ability.topPct + ability.heightPct <= firstAttack.topPct + 0.001);
});

test('computeContentBox: cover fit fills the whole box regardless of aspect', () => {
  const box = computeContentBox({
    boxWidth: 300,
    boxHeight: 400,
    naturalWidth: 100,
    naturalHeight: 50,
    fit: 'cover',
  });
  assert.deepEqual(box, { left: 0, top: 0, width: 300, height: 400 });
});

test('computeContentBox: missing natural size falls back to the full box', () => {
  const box = computeContentBox({ boxWidth: 300, boxHeight: 400, fit: 'contain' });
  assert.deepEqual(box, { left: 0, top: 0, width: 300, height: 400 });
});

test('computeContentBox: contain letterboxes on the sides when the image is relatively taller', () => {
  // box is wider (relative to height) than the image, so contain fits height
  // and pillarboxes left/right.
  const box = computeContentBox({
    boxWidth: 400,
    boxHeight: 400,
    naturalWidth: 250,
    naturalHeight: 350,
  });
  assert.equal(box.height, 400);
  assert.ok(box.width < 400);
  assert.equal(box.left, (400 - box.width) / 2);
  assert.equal(box.top, 0);
});

test('computeContentBox: contain letterboxes top/bottom when the image is relatively wider', () => {
  const box = computeContentBox({
    boxWidth: 400,
    boxHeight: 400,
    naturalWidth: 350,
    naturalHeight: 250,
  });
  assert.equal(box.width, 400);
  assert.ok(box.height < 400);
  assert.equal(box.top, (400 - box.height) / 2);
  assert.equal(box.left, 0);
});

test('computeContentBox: matching aspect ratio fills the box exactly', () => {
  const box = computeContentBox({
    boxWidth: 250,
    boxHeight: 350,
    naturalWidth: 250,
    naturalHeight: 350,
  });
  assert.deepEqual(box, { left: 0, top: 0, width: 250, height: 350 });
});
