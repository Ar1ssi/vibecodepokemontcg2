// Verify the new classifier against the A–J edge-case attack texts.
import { classifyAttackEffect } from './client/src/setup/rules/attack-effects.mjs';

const cases = [
  // A: per-energy "for each Energy attached"
  ['Mega Symphonia', 'This attack does 50 damage for each Psychic Energy attached to all of your Pokémon.', 'per-energy'],
  ['Giant Bouquet', 'This attack does 50 more damage for each Grass Energy attached to this Pokémon.', 'per-energy'],
  ['Energized Balloon', 'This attack does 40 more damage for each Psychic Energy attached to this Pokémon.', 'per-energy'],
  ['Thunderous Fist', 'This attack does 60 damage for each Lightning Energy attached to this Pokémon.', 'per-energy'],
  ['Energized Slap', 'This attack does 40 damage for each Energy attached to this Pokémon.', 'per-energy'],
  ['Ear Force', 'This attack does 80 more damage for each Energy attached to your opponent’s Active Pokémon.', 'per-energy'],
  // B/C: heal
  ['Jungle Dump', 'Heal 30 damage from this Pokémon.', 'heal'],
  ['Shining Feathers', 'Heal 50 damage from each of your Pokémon.', 'heal'],
  // D: damage-prevention
  ['Frost Barrier', 'During your opponent’s next turn, this Pokémon takes 30 less damage from attacks (after applying Weakness and Resistance).', 'damage-prevention'],
  ['Flash Ray', 'During your opponent’s next turn, prevent all damage done to this Pokémon by attacks from Basic Pokémon.', 'damage-prevention'],
  ['Iron Feathers', 'During your opponent’s next turn, this Pokémon takes 60 less damage from attacks (after applying Weakness and Resistance).', 'damage-prevention'],
  // D: next-turn-lock
  ['Mega Brave', 'During your next turn, this Pokémon can’t use Mega Brave.', 'next-turn-lock'],
  ['Thunderous Bolt', 'During your next turn, this Pokémon can’t attack.', 'next-turn-lock'],
  ['Impact Blow', 'During your next turn, this Pokémon can’t use Impact Blow.', 'next-turn-lock'],
  ['Power Tackle', 'During your next turn, this Pokémon can’t use attacks.', 'next-turn-lock'],
  ['Big Bite', 'During your opponent’s next turn, the Defending Pokémon can’t retreat.', 'next-turn-lock'],
  // D: self-damage
  ['Crimson Blast', 'This Pokémon also does 60 damage to itself.', 'self-damage'],
  ['Wild Scissors', 'This Pokémon also does 30 damage to itself.', 'self-damage'],
  // D: conditional base-change (Huge Bite)
  ['Huge Bite', 'If your opponent’s Active Pokémon already has any damage counters on it, this attack’s base damage is 30.', 'conditional-damage'],
  // D: immunity
  ['Spiky Hopper', 'This attack’s damage isn’t affected by any effects on your opponent’s Active Pokémon.', 'immunity'],
  ['Nebula Beam', 'This attack’s damage isn’t affected by Weakness or Resistance, or by any effects on your opponent’s Active Pokémon.', 'immunity'],
  // D: redirect-damage
  ['Shellnado Spin', 'During your opponent’s next turn, if this Pokémon is damaged by an attack (even if this Pokémon is Knocked Out), place 12 damage counters on the Attacking Pokémon.', 'redirect-damage'],
  // E: dual-status
  ['Bloom Powder', 'Your opponent’s Active Pokémon is now Asleep and Poisoned.', 'dual-status'],
  ['Eerie Glow', 'Your opponent’s Active Pokémon is now Burned and Confused.', 'dual-status'],
  ['Dire Nails', 'Your opponent’s Active Pokémon is now Burned and Poisoned. Switch this Pokémon with 1 of your Benched Pokémon.', 'dual-status'],
  // E: self-status
  ['Falling Down', 'This Pokémon is now Asleep.', 'self-status'],
  // E: conditional-on-status (Roasting Heat)
  ['Roasting Heat', 'If your opponent’s Active Pokémon is Burned, this attack does 160 more damage.', 'conditional-damage'],
  // F: discard-opponent
  ['Mountain Ramming', 'Discard the top 2 cards of your opponent’s deck.', 'discard-opponent'],
  ['Undermine', 'Discard the top 2 cards of your opponent’s deck.', 'discard-opponent'],
  ['Ghostly Touch', 'Discard a random card from your opponent’s hand.', 'discard-opponent'],
  ['Crushing Arrow', 'Discard an Energy from your opponent’s Active Pokémon.', 'discard-opponent'],
  // G: draw-until
  ['Hexa-Magic', 'You may draw cards until you have 6 cards in your hand.', 'draw-until'],
  ['Corkscrew Dive', 'You may draw cards until you have 6 cards in your hand.', 'draw-until'],
  // I: per-heads-coin
  ['Rapid-Fire Combo', 'Flip a coin until you get tails. This attack does 50 more damage for each heads.', 'per-heads-coin'],
  ['Hundred-Hitting Ball', 'Flip a coin until you get tails. This attack does 100 more damage for each heads.', 'per-heads-coin'],
  ['Comet Punch', 'Flip 4 coins. This attack does 30 damage for each heads.', 'per-heads-coin'],
  ['Work Rush', 'Flip a coin for each Energy attached to this Pokémon. This attack does 80 damage for each heads.', 'per-heads-coin'],
  // keep: single status
  ['Absolute Snow', 'Your opponent’s Active Pokémon is now Asleep.', 'status-asleep'],
  ['Ice Prison', 'Discard 2 Energy from this Pokémon, and your opponent’s Active Pokémon is now Paralyzed.', 'status-paralyzed'],
  ['Stun Needle', 'Flip a coin. If heads, your opponent’s Active Pokémon is now Paralyzed.', 'status-paralyzed'],
  // keep: discard-cost
  ['Volcanic Meteor', 'Discard 2 Energy from this Pokémon.', 'discard-cost'],
  ['Illusory Impulse', 'Discard all Energy from this Pokémon.', 'discard-cost'],
  // keep: coin-flip
  ['Coin Test', 'Flip a coin. If heads, this attack does 30 more damage. If tails, do 10 damage to yourself.', 'coin-flip'],
  // keep: switch
  ['Strafe', 'You may switch this Pokémon with 1 of your Benched Pokémon.', 'switch'],
  // keep: draw-attach
  ['Aura Jab', 'Attach up to 3 Basic Fighting Energy cards from your discard pile to your Benched Pokémon in any way you like.', 'draw-attach'],
  ['Spiky Thunder', 'Draw 2 cards.', 'draw-attach'],
];

let pass = 0, fail = 0;
for (const [name, text, expected] of cases) {
  const actual = classifyAttackEffect({ name, damage: 10, text });
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}: expected ${expected}, got ${actual}`);
}
console.log(`\n${pass} pass, ${fail} fail`);
