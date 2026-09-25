// I151: reactive Tool effects honour the Tool's printed holder/attacker condition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachedToolOnDamageEffects, attachedToolOnKoEffects } from '../tool-combat.mjs';

const tool = (instanceId, name, text, attachedTo) => ({
  instanceId,
  name,
  supertype: 'Trainer',
  subtypes: ['Item', 'Pokémon Tool'],
  text,
  attachedTo,
});
const mon = (instanceId, extra = {}) => ({ instanceId, name: 'Mon', supertype: 'Pokémon', hp: 200, damage: 0, ...extra });

const PUNK_HELMET =
  'If the {D} Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if this Pokémon is Knocked Out), place 4 damage counters on the Attacking Pokémon.';
const ADVERSITY =
  'If the Pokémon this card is attached to has Weakness to your opponent’s Active Pokémon’s type, is in the Active Spot, and is damaged by an attack from your opponent’s Pokémon (even if this Pokémon is Knocked Out), draw 3 cards.';
const FAREWELL_BELL =
  'If the Pokémon VMAX this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, search your deck for a card and put it into your hand. Then, shuffle your deck.';
const BOX_OF_DISASTER =
  'If the Pokémon V this card is attached to has full HP and is Knocked Out by damage from an attack from your opponent’s Pokémon, put 8 damage counters on the Attacking Pokémon.';

test('Punk Helmet fires only on a {D} holder', () => {
  const dark = mon(1, { types: ['Darkness'] });
  const fire = mon(2, { types: ['Fire'] });
  assert.equal(attachedToolOnDamageEffects(dark, [dark, tool(10, 'Punk Helmet', PUNK_HELMET, 1)]).length, 1);
  assert.equal(attachedToolOnDamageEffects(fire, [fire, tool(11, 'Punk Helmet', PUNK_HELMET, 2)]).length, 0);
});

test('Adversity Policy needs Weakness to the attacker type', () => {
  const holder = mon(1, { types: ['Grass'], weaknesses: [{ type: 'Fire', value: '×2' }] });
  const zone = [holder, tool(10, 'Adversity Policy', ADVERSITY, 1)];
  assert.equal(attachedToolOnDamageEffects(holder, zone, { attacker: mon(9, { types: ['Fire'] }) }).length, 1);
  assert.equal(attachedToolOnDamageEffects(holder, zone, { attacker: mon(9, { types: ['Water'] }) }).length, 0);
});

test('Box of Disaster needs a full-HP Pokémon V', () => {
  const v = mon(1, { name: 'Zacian V', subtypes: ['Basic', 'V'] });
  const zone = [v, tool(10, 'Box of Disaster', BOX_OF_DISASTER, 1)];
  assert.equal(attachedToolOnDamageEffects(v, zone, { phase: 'ko' }).length, 1);
  assert.equal(attachedToolOnDamageEffects({ ...v, damage: 10 }, zone, { phase: 'ko' }).length, 0);
  const plain = mon(2);
  assert.equal(attachedToolOnDamageEffects(plain, [plain, tool(11, 'Box of Disaster', BOX_OF_DISASTER, 2)], { phase: 'ko' }).length, 0);
});

test('Farewell Bell fires only on a Pokémon VMAX', () => {
  const vmax = mon(1, { subtypes: ['VMAX'] });
  const plain = mon(2);
  const player = (holder, id) => ({ zones: { active: [holder, tool(id, 'Farewell Bell', FAREWELL_BELL, holder.instanceId)], bench: [] } });
  assert.equal(attachedToolOnKoEffects(player(vmax, 10), vmax).length, 1);
  assert.equal(attachedToolOnKoEffects(player(plain, 11), plain).length, 0);
});
