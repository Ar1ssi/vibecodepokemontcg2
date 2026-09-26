# GX no-effect triage (design 047 slice 6)

Source: `out/gx-oracle-audit.txt` / `out/gx-oracle-rows.json` (604 GX printings, 1723 entries).
After slices 1–5 the report is down to **109 unique no-effect texts (591 rows)**; this file tags
them by cause. Regenerate the raw list by filtering the rows with
`rowObserved` from `scripts/lib/oracle-gate.mjs`.

## Not gaps — expected on the one-shot fixture board

- **Bare damage** (`attack:unknown`, 180 rows): attacks whose text is empty or only the GX rule
  note (`Dedenne-GX Static Shock`, `Lunala-GX Requiem-GX`). `dealt === printedBase` is correct.
- **Marker families** (oracle-blind by design, covered by `__tests__/attack-markers*.test.mjs`):
  immunity ("damage isn't affected by Weakness/Resistance/effects"), damage-prevention ("takes N
  less", "prevent all damage"), effect-prevention ("prevent all effects"). ~120 rows.
- **Fixture conditions correctly unmet**: defender is a Basic (Cross-Cut, Cross-Cut-GX, Dump
  Truck Press), no Supporter played (Brave Buddies, Sensitive Blade, Light of the Protector-GX),
  no Stadium in play (Dueling Saber), not promoted from the Bench this turn (First Impression,
  Tandem Shock), did not evolve from Riolu this turn (Aura Strike), opponent not Confused
  (Enraged Strike, Jumping Side Kick), asleep gate (Thunderous Snore), first-turn gate (Fast
  Raid), prize-race gate (Sun's/Moon's Eclipse-GX), fewer than N extra Energy attached (Double
  Blaze-GX and the other "at least N extra Energy" GX clauses).
- **Scaling count is genuinely 0/base on the fixture**: `Heatran-GX Hot Burn-GX` (1 Fire = base
  50), `Banette-GX Shadow Chant` cap, `Alolan Muk-GX Chemical Breath` (no statuses),
  `Celesteela-GX Rocket Fall` (no Retreat Cost), `Incineroar-GX Hustling Strike` /
  `Espeon & Deoxys-GX Psychic Club` (no typed Bench), `Lycanroc-GX Splintered Shards-GX` /
  `Flareon-GX Power Burner-GX` (no matching discard), `Naganadel-GX Beast Raid` (no Ultra
  Beasts in play), `Persian-GX Vengeance` (empty discard).

## Engine gaps — implement (grouped; representative cards)

1. **Opponent turn-scoped play/attack locks**: Noivern-GX Distort / Sonic Volume, Alolan
   Golem-GX Heavy Rock-GX, Gengar & Mimikyu-GX Horror House-GX, Umbreon & Darkrai-GX Dark
   Moon-GX, Cobalion-GX Iron Rule-GX; rest-of-game GX lock Latios-GX Clear Vision-GX.
2. **Extra turns**: Dialga-GX Timeless-GX, Togepi & Cleffa & Igglybuff-GX Supreme Puff-GX.
3. **Prize manipulation**: Naganadel-GX Stinger-GX (shuffle Prizes), Nihilego-GX Symbiont-GX /
   Naganadel-GX Injection-GX (cards to Prizes), Kartana-GX Blade-GX (take a Prize — now
   observed), Blacephalon-GX Burst-GX (discard a Prize), Chaotic Order-GX / Blaster-GX
   (face-up Prizes), Celesteela-GX Discovery-GX (Prize-to-hand swap).
4. **KO replacement / conditional KO / discard opponent Pokémon**: Silvally-GX Silver Knight-GX,
   Lunala-GX Lunar Fall-GX, Garchomp & Giratina-GX GG End-GX, Bewear-GX Big Throw-GX,
   Marshadow & Machamp-GX Acme of Heroism-GX (KO prevention), Trevenant & Dusknoir-GX Pale
   Moon-GX (deferred KO).
5. **Bounce opponent Pokémon to hand**: Sylveon-GX Plea-GX, Mimikyu-GX Dream Fear-GX,
   Shiftry-GX Den of Iniquity-GX, Virizion-GX Breeze Away-GX, Greninja-GX Dark Mist-GX.
6. **Bench setup from discard/deck**: Ho-Oh-GX Eternal Flame-GX, Greninja & Zoroark-GX Dark
   Union-GX, Carracosta-GX Stone Age-GX, Wishiwashi-GX Massive Catch-GX.
7. **Move any number of Energy in any way you like**: Gardevoir & Sylveon-GX Kaleidostorm,
   Alolan Exeggutor-GX Tower-Go-Round-GX. `Kaleidostorm` also emits `pokemonKnockedOut` on the
   fixture — investigate before implementing.
8. **Return attached Energy to hand**: Volcarona-GX Backfire.
9. **Scaling scopes/caps not yet read**: `Mr. Mime-GX Breakdown` (per opponent-hand card),
   `Slowpoke & Psyduck-GX Ditch and Splash` / `Alolan Raticate-GX Chuck Away` (discard-this-way
   caps), `Mega Lopunny & Jigglypuff-GX Jumping Balloon` (opponent GX/EX count).
10. **Activated abilities**: Silvally-GX Disk Reload (draw-until), Magcargo-GX Crushing Charge
    (discard top, conditional attach); `Ampharos-GX Power Recharge` (recover all named cards).
11. **Copy-attack GX**: Zoroark-GX Trickster-GX (use one of the opponent's attacks).

## Audit-tooling follow-ups

- The new non-KO `opp:attached->discard` rule makes Crunch/Psycrush readable; other
  `opp:attached->deck`/`->hand` shuffles are already covered by non-base tags.
- `attack:effect-prevention` and `attack:damage-prevention` stay in
  `ORACLE_BLIND_FAMILIES` terms — they are marker-side effects held by the attack-marker tests.

## Proposed ISSUES.md lines (land with the design on `main`)

- I### attack: opponent turn-scoped play/attack locks + rest-of-game GX lock (design 047 §1).
- I### attack: extra-turn clause ("Take another turn after this one") (design 047 §2).
- I### attack: Prize manipulation beyond taking (shuffle/add/discard/face-up) (design 047 §3).
- I### attack: conditional KO / KO replacement / discard opponent Pokémon (design 047 §4).
- I### attack: bounce opponent Pokémon to hand (design 047 §5).
- I### attack: bench setup from discard/deck for GX attacks (design 047 §6).
- I### attack: "move any number of Energy … in any way you like" + Kaleidostorm KO anomaly (design 047 §7).
- I### attack: recover attached Energy to hand (Backfire) (design 047 §8).
- I### attack: remaining scaling scopes/caps (design 047 §9).
- I### ability: Disk Reload / Crushing Charge / Power Recharge (design 047 §10).
- I### attack: Trickster-GX copy-attack (design 047 §11).
