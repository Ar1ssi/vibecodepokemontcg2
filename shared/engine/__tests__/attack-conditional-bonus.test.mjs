// "If <condition>, this attack does N more damage" bonuses read the shared condition vocabulary
// (attack-conditions.mjs) instead of a separate damage-parser list. Texts are the corpus rows
// named in each case (out/pkmn-pokemon-cards.json / out/pkmn-gx-cards.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';

// ── vocabulary table: parseAttackDamage with a server-shaped ctx ─────────────

// `benchNames` marks a server-built ctx (buildServerAttackContext); a defender is present.
const serverCtx = (extra = {}) => ({ benchNames: [], defenderPresent: true, ...extra });
const dealt = (attack, ctx, attacker = {}) => parseAttackDamage(attack, attacker, {}, serverCtx(ctx)).total;

// [source, attacker name, printed damage, text, ctx where the bonus applies, ctx where it does not]
const CASES = [
  [
    'Sableye Cocky Claw (TCGdex me02-059)',
    'Sableye',
    '20+',
    'If you have any Stage 2 {D} Pokémon on your Bench, this attack does 70 more damage.',
    { benchNames: ['Tyranitar'], benchStages: ['Stage 2'], benchTypes: [['Darkness']] },
    { benchNames: ['Pupitar'], benchStages: ['Stage 1'], benchTypes: [['Darkness']] },
  ],
  [
    'Keldeo ex Gale Thrust (White Flare 167)',
    'Keldeo ex',
    '30+',
    'If this Pokémon moved from your Bench to the Active Spot this turn, this attack does 90 more damage.',
    { attackerMovedToActiveThisTurn: true },
    { attackerMovedToActiveThisTurn: false },
  ],
  [
    'Golisopod First Impression (Unified Minds 51)',
    'Golisopod',
    '120+',
    'If this Pokémon was on the Bench and became your Active Pokémon this turn, this attack does 60 more damage.',
    { attackerMovedToActiveThisTurn: true },
    { attackerMovedToActiveThisTurn: false },
  ],
  [
    'Amoonguss Venoshock (SM202)',
    'Amoonguss',
    '20+',
    "If your opponent's Active Pokémon is Poisoned, this attack does 70 more damage.",
    { defenderConditions: ['Poisoned'] },
    { defenderConditions: ['Asleep'] },
  ],
  [
    'Crobat ex Pester (Deoxys 96)',
    'Crobat ex',
    '60+',
    'If the Defending Pokémon is affected by a Special Condition, this attack does 60 damage plus 40 more damage.',
    { defenderConditions: ['Confused'] },
    { defenderConditions: [] },
  ],
  [
    'Castform Extra Ball (Hidden Legends 30)',
    'Castform',
    '20+',
    'If the Defending Pokémon is Pokémon-ex, this attack does 20 damage plus 20 more damage.',
    { defenderKinds: ['ex', 'basic'] },
    { defenderKinds: ['basic'] },
  ],
  [
    'Galvantula ex Charged Web (Stellar Crown 168)',
    'Galvantula ex',
    '110+',
    "If your opponent's Active Pokémon is a Pokémon ex or Pokémon V, this attack does 110 more damage.",
    { defenderKinds: ['v', 'basic'] },
    { defenderKinds: ['gx', 'basic'] },
  ],
  [
    'Bewear Cross-Cut (Crimson Invasion 56)',
    'Bewear',
    '60+',
    "If your opponent's Active Pokémon is an Evolution Pokémon, this attack does 60 more damage.",
    { defenderKinds: ['evolved'] },
    { defenderKinds: ['basic'] },
  ],
  [
    'Snorlax Big Counter (Unbroken Bonds 158)',
    'Snorlax',
    '60+',
    "If your opponent's Active Pokémon is a TAG TEAM, this attack does 120 more damage.",
    { defenderKinds: ['gx', 'tagteam'] },
    { defenderKinds: ['gx'] },
  ],
  [
    'Poliwrath Beatdown (Unseen Forces 11)',
    'Poliwrath',
    '40+',
    'If the Defending Pokémon is a {D} Pokémon or has Dark in its name, this attack does 40 damage plus 30 more damage.',
    { defenderKinds: ['basic'], defenderName: 'Dark Golbat' },
    { defenderKinds: ['type:psychic'], defenderName: 'Golbat' },
  ],
  [
    'Zangoose Target Slash (Sandstorm 14)',
    'Zangoose',
    '10+',
    'If the Defending Pokémon is Seviper, this attack does 10 damage plus 30 more damage.',
    { defenderName: 'Seviper' },
    { defenderName: 'Ekans' },
  ],
  [
    'Medicham Vigorous Kick (Silver Tempest 073)',
    'Medicham',
    '80+',
    'If your opponent has any Pokémon VMAX in play, this attack does 90 more damage.',
    { opponentInPlayKinds: [['v'], ['v', 'vmax', 'evolved']] },
    { opponentInPlayKinds: [['v']] },
  ],
  [
    'Slither Wing Iron Smasher (Shrouded Fable 026; .agent/scratch/attack-full-audit/rows.json)',
    'Slither Wing',
    '20+',
    'If your opponent has any Future Pokémon in play, this attack does 120 more damage.',
    { opponentInPlayKinds: [['basic'], ['basic', 'future']] },
    { opponentInPlayKinds: [['basic']] },
  ],
  [
    'Diancie Sensitive Ray (Vivid Voltage 079)',
    'Diancie',
    '50+',
    'If you played a Supporter card from your hand during this turn, this attack does 70 more damage.',
    { supporterPlayedThisTurn: true, supporterNamesThisTurn: ['Marnie'] },
    { supporterPlayedThisTurn: false, supporterNamesThisTurn: [] },
  ],
  [
    'Morpeko V Hangry Spike (Brilliant Stars 095)',
    'Morpeko V',
    '120+',
    "If you played Marnie's Pride from your hand during this turn, this attack does 120 more damage.",
    { supporterNamesThisTurn: ["Marnie's Pride"] },
    { supporterNamesThisTurn: ['Marnie'] },
  ],
  [
    "Team Rocket's Kangaskhan ex Wicked Impact (Ascended Heroes 162)",
    "Team Rocket's Kangaskhan ex",
    '120+',
    'If you played a Supporter card that has "Team Rocket" in its name from your hand during this turn, this attack does 100 more damage.',
    { supporterNamesThisTurn: ["Team Rocket's Archer"] },
    { supporterNamesThisTurn: ['Arven'] },
  ],
  [
    'Koraidon ex Orichalcum Fang (Ascended Heroes 121)',
    'Koraidon ex',
    '50+',
    "If any of your Pokémon were Knocked Out by damage from an attack during your opponent's last turn, this attack does 120 more damage.",
    { koLastOpponentTurnVictims: [{ name: 'Pikachu', types: ['Lightning'], byAttackDamage: true }] },
    { koLastOpponentTurnVictims: [{ name: 'Pikachu', types: ['Lightning'], byAttackDamage: false }] },
  ],
  [
    'Dhelmise V Anchor Anger (Shining Fates 009)',
    'Dhelmise V',
    '30+',
    "If any of your {G} Pokémon were Knocked Out by damage from an opponent's attack during their last turn, this attack does 90 more damage.",
    { koLastOpponentTurnVictims: [{ name: 'Rillaboom', types: ['Grass'], byAttackDamage: true }] },
    { koLastOpponentTurnVictims: [{ name: 'Pikachu', types: ['Lightning'], byAttackDamage: true }] },
  ],
  [
    'Altaria-EX Powerful Gain (Fates Collide 123)',
    'Altaria-EX',
    '30+',
    'If this Pokémon was healed during this turn, this attack does 60 more damage and heal 30 damage from this Pokémon.',
    { attackerHealedThisTurn: true },
    { attackerHealedThisTurn: false },
  ],
  [
    'Lucario-GX Aura Strike (Forbidden Light SV64)',
    'Lucario-GX',
    '30+',
    'If this Pokémon evolved from Riolu during this turn, this attack does 90 more damage.',
    { attackerEvolvedThisTurn: true, attackerStackNames: ['Riolu'] },
    { attackerEvolvedThisTurn: false, attackerStackNames: ['Riolu'] },
  ],
  [
    'Flygon Sand Sonic (Secret Wonders 5)',
    'Flygon',
    '60+',
    'If you attach a {F} Energy card from your hand to Flygon during this turn, this attack does 60 damage plus 20 more damage.',
    { attackerHandEnergyTypesThisTurn: ['Fighting'] },
    { attackerHandEnergyTypesThisTurn: ['Grass'] },
  ],
  [
    'Togedemaru ex Spiky Rolling (Ascended Heroes 149)',
    'Togedemaru ex',
    '80+',
    'If this Pokémon used Spiky Rolling during your last turn, this attack does 80 more damage.',
    { attackerLastTurnAttackName: 'Spiky Rolling' },
    { attackerLastTurnAttackName: '' },
  ],
  [
    'Electivire ex High-Voltage Press (Destined Rivals 212)',
    'Electivire ex',
    '180+',
    "If this Pokémon has at least 2 extra Energy attached (in addition to this attack's cost), this attack does 100 more damage.",
    { attackerEnergyUnits: ['Lightning', 'Lightning', 'Lightning', 'Lightning', 'Lightning'], attackCost: ['Lightning', 'Lightning', 'Colorless'] },
    { attackerEnergyUnits: ['Lightning', 'Lightning', 'Lightning', 'Lightning'], attackCost: ['Lightning', 'Lightning', 'Colorless'] },
  ],
  [
    'Raichu & Alolan Raichu-GX Lightning Ride-GX (Unified Minds 221)',
    'Raichu & Alolan Raichu-GX',
    '200+',
    "If this Pokémon has at least 2 extra {L} Energy attached to it (in addition to this attack's cost), this attack does 100 more damage.",
    { attackerEnergyUnits: ['Lightning', 'Lightning', 'Lightning', 'Lightning'], attackCost: ['Lightning', 'Lightning'] },
    { attackerEnergyUnits: ['Lightning', 'Lightning', 'Psychic', 'Psychic'], attackCost: ['Lightning', 'Lightning'] },
  ],
  [
    'Galarian Mr. Rime V Customized Cane (Astral Radiance 049)',
    'Galarian Mr. Rime V',
    '90+',
    'If this Pokémon has a Pokémon Tool attached, this attack does 90 more damage.',
    { attackerToolCount: 1 },
    { attackerToolCount: 0 },
  ],
  [
    'Manectric-EX Assault Laser (Phantom Forces 113)',
    'Manectric-EX',
    '60+',
    "If your opponent's Active Pokémon has a Pokémon Tool card attached to it, this attack does 60 more damage.",
    { defenderToolCount: 1 },
    { defenderToolCount: 0 },
  ],
  [
    'Deoxys-EX Helix Force gate reads Plasma Energy by name (BW82)',
    'Deoxys-EX',
    '30+',
    'If this Pokémon has any Plasma Energy attached to it, this attack does 30 more damage for each Energy attached to the Defending Pokémon.',
    { attackerEnergyNames: ['Plasma Energy'], opponentEnergyCount: 2 },
    { attackerEnergyNames: ['Double Colorless Energy'], opponentEnergyCount: 2 },
  ],
  [
    'Flamigo ex Precise Beak (Surging Sparks 160)',
    'Flamigo ex',
    '30+',
    "If this Pokémon and your opponent's Active Pokémon have the same amount of Energy attached, this attack does 100 more damage.",
    { energyCount: 2, opponentEnergyCount: 2 },
    { energyCount: 2, opponentEnergyCount: 3 },
  ],
  [
    'Gallade-EX Assault Sword (XY Promos XY45)',
    'Gallade-EX',
    '40+',
    "If your opponent's Active Pokémon has no Energy attached to it, this attack does 40 more damage.",
    { opponentEnergyCount: 0 },
    { opponentEnergyCount: 1 },
  ],
  [
    'Dark Tyranitar Second Strike (Team Rocket Returns 20)',
    'Dark Tyranitar',
    '50+',
    'If the Defending Pokémon already has at least 2 damage counters on it, this attack does 50 damage plus 20 more damage.',
    { defenderDamage: 20 },
    { defenderDamage: 10 },
  ],
  [
    'Registeel Silver Fist (Celestial Storm 96)',
    'Registeel',
    '60+',
    "If your opponent's Active Pokémon has an Ability, this attack does 60 more damage.",
    { defenderAbilityKinds: ['ability'] },
    { defenderAbilityKinds: [] },
  ],
  [
    'Exploud ex Hyper Tail (Crystal Guardians 92)',
    'Exploud ex',
    '60+',
    'If the Defending Pokémon has any Poké-Powers or Poké-Bodies, this attack does 60 damage plus 20 more damage.',
    { defenderAbilityKinds: ['body'] },
    { defenderAbilityKinds: [] },
  ],
  [
    'Scizor Pound Down (Stormfront 25)',
    'Scizor',
    '40+',
    "If you don't have any Pokémon with any Poké-Powers in play, this attack does 40 damage plus 30 more damage.",
    { ownInPlayAbilityKinds: [[], ['body']] },
    { ownInPlayAbilityKinds: [[], ['power']] },
  ],
  [
    'Medicham ex Sky Kick (Emerald 95)',
    'Medicham ex',
    '60+',
    'If the Defending Pokémon has {F} Resistance, this attack does 60 damage plus 40 more damage.',
    { defenderResistanceTypes: ['Fighting'] },
    { defenderResistanceTypes: ['Psychic'] },
  ],
  [
    'Shinx Payback (Arceus SH12)',
    'Shinx',
    '10+',
    'If your opponent has only 1 Prize card left, this attack does 10 damage plus 30 more damage.',
    { opponentPrizes: 1 },
    { opponentPrizes: 2 },
  ],
  [
    'Naganadel Turning Point (Lost Thunder 108)',
    'Naganadel',
    '80+',
    'If you have exactly 3 Prize cards remaining, this attack does 80 more damage.',
    { ownPrizes: 3 },
    { ownPrizes: 4 },
  ],
  [
    'Dark Houndoom Fire Payback (Team Rocket Returns 37)',
    'Dark Houndoom',
    '40+',
    'If you have less Benched Pokémon than your opponent, this attack does 40 damage plus 20 more damage.',
    { benchNames: ['a'], opponentBenchCount: 2 },
    { benchNames: ['a', 'b'], opponentBenchCount: 2 },
  ],
  [
    'Houndoom V Vengeful Flame (Darkness Ablaze 178)',
    'Houndoom V',
    '100+',
    'If your Benched {R} Pokémon have any damage counters on them, this attack does 100 more damage.',
    { benchNames: ['a', 'b'], benchTypes: [['Water'], ['Fire']], benchDamaged: [false, true] },
    { benchNames: ['a', 'b'], benchTypes: [['Water'], ['Fire']], benchDamaged: [true, false] },
  ],
  [
    'Mesprit Mind Splash (Forbidden Light 42)',
    'Mesprit',
    '20+',
    'If Uxie is on your Bench, this attack does 50 more damage.',
    { benchNames: ['Uxie'] },
    { benchNames: ['Azelf'] },
  ],
  [
    'Arbok Rocket Tail (Hidden Fates 27)',
    'Arbok',
    '50+',
    'If Jessie & James is in your discard pile, this attack does 80 more damage.',
    { ownDiscardNames: ['Jessie & James'] },
    { ownDiscardNames: ['Professor Oak'] },
  ],
  [
    'Wigglytuff Ballon Attack (Great Encounters 32)',
    'Wigglytuff',
    '40+',
    'If Igglybuff is anywhere under Wigglytuff, this attack does 40 damage plus 20 more damage.',
    { attackerStackNames: ['Igglybuff', 'Jigglypuff'] },
    { attackerStackNames: ['Jigglypuff'] },
  ],
  [
    'Pyroar Dominating Fangs (Forbidden Light 19)',
    'Pyroar',
    '80+',
    'If Lysandre Labs is in play, this attack does 60 more damage.',
    { stadiumName: 'Lysandre Labs' },
    { stadiumName: 'Parallel City' },
  ],
  [
    'Castform Weather Ball (Legends Awakened 48): the bonus reads its own sentence',
    'Castform',
    '30+',
    'If you have a Stadium card in play, remove 3 damage counters from Castform. If your opponent has a Stadium card in play, this attack does 30 damage plus 30 more damage.',
    { stadiumOwner: 'opponent' },
    { stadiumOwner: 'self' },
  ],
];

for (const [source, name, damage, text, yes, no] of CASES) {
  test(`bonus condition: ${source}`, () => {
    const attack = { name: source, damage, text };
    const base = Number.parseInt(damage, 10);
    assert.ok(dealt(attack, yes, { name }) > base, 'bonus applies when the condition holds');
    assert.equal(dealt(attack, no, { name }), base, 'no bonus when it does not');
  });
}

test('a gated "more damage for each" bonus scales only when the gate holds (Deoxys-EX Helix Force)', () => {
  const attack = {
    damage: '30+',
    text: 'If this Pokémon has any Plasma Energy attached to it, this attack does 30 more damage for each Energy attached to the Defending Pokémon.',
  };
  assert.equal(dealt(attack, { attackerEnergyNames: ['Plasma Energy'], opponentEnergyCount: 2 }), 90);
  assert.equal(dealt(attack, { attackerEnergyNames: [], opponentEnergyCount: 2 }), 30);
});

test('a client ctx (no server marker) keeps the unresolved note instead of guessing', () => {
  const parsed = parseAttackDamage(
    { damage: '30+', text: "If your opponent's Active Pokémon is Poisoned, this attack does 90 more damage." },
    {},
    {},
    {}
  );
  assert.equal(parsed.total, 30);
  assert.match(parsed.notes.join(' '), /resolve the printed condition/);
});

// ── reducer integration ─────────────────────────────────────────────────────

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const trainer = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item' });

function board(attackerName, attack) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-bonus', seed: 3, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(attackerName, { attacks: [{ cost: [], ...attack }] });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400 });
  state.players.p2.zones.active.push(defender);
  return { state, attacker, defender };
}

const attackDamage = (state) => {
  const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
  assert.equal(res.error, null);
  return res.events.find((e) => e.type === 'attackExecuted')?.damage;
};

const GALE_THRUST = {
  name: 'Gale Thrust',
  damage: '30+',
  text: 'If this Pokémon moved from your Bench to the Active Spot this turn, this attack does 90 more damage.',
};

test('reducer: Keldeo ex Gale Thrust deals its +90 only after moving up this turn', () => {
  const moved = board('Keldeo ex', GALE_THRUST);
  moved.attacker.movedToActiveTurn = 5;
  assert.equal(attackDamage(moved.state), 120);
  const stayed = board('Keldeo ex', GALE_THRUST);
  stayed.attacker.movedToActiveTurn = 4;
  assert.equal(attackDamage(stayed.state), 30);
});

test('reducer: Amoonguss Venoshock adds 70 against a Poisoned Active', () => {
  const attack = {
    name: 'Venoshock',
    damage: '20+',
    text: "If your opponent's Active Pokémon is Poisoned, this attack does 70 more damage.",
  };
  const poisoned = board('Amoonguss', attack);
  poisoned.defender.specialConditions = ['Poisoned'];
  poisoned.defender.specialCondition = 'Poisoned';
  poisoned.defender.poisoned = true;
  assert.equal(attackDamage(poisoned.state), 90);
  assert.equal(attackDamage(board('Amoonguss', attack).state), 20);
});

test('reducer: Diancie Sensitive Ray reads the Supporter played this turn', () => {
  const attack = {
    name: 'Sensitive Ray',
    damage: '50+',
    text: 'If you played a Supporter card from your hand during this turn, this attack does 70 more damage.',
  };
  const played = board('Diancie', attack);
  played.state.players.p1.flags.supporterPlayed = true;
  played.state.players.p1.flags.supporterNamesThisTurn = ['Marnie'];
  assert.equal(attackDamage(played.state), 120);
  assert.equal(attackDamage(board('Diancie', attack).state), 50);
});

test('Sableye Cocky Claw ignores a Stage 2 of the wrong type and a Stage 2 Defender', () => {
  const cocky = {
    name: 'Cocky Claw',
    damage: '20+',
    text: 'If you have any Stage 2 {D} Pokémon on your Bench, this attack does 70 more damage.',
  };
  const wrongType = serverCtx({ benchNames: ['Venusaur'], benchStages: ['Stage 2'], benchTypes: [['Grass']] });
  assert.equal(parseAttackDamage(cocky, { name: 'Sableye' }, {}, wrongType).total, 20);
  const stage2Defender = { stage: 'Stage 2' };
  const noBench = serverCtx({ benchNames: ['Pupitar'], benchStages: ['Stage 1'], benchTypes: [['Dark']] });
  assert.equal(parseAttackDamage(cocky, { name: 'Sableye' }, stage2Defender, noBench).total, 20);
  const darkBoard = serverCtx({ benchNames: ['Tyranitar'], benchStages: ['Stage 2'], benchTypes: [['Dark']] });
  assert.equal(parseAttackDamage(cocky, { name: 'Sableye' }, {}, darkBoard).total, 90);
});
