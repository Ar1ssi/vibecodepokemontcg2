# Move animation study — brief for one study agent

You study reference animations for a set of Pokémon moves and write observational notes that
feed a design document (design 063: attack move animations for a 2-player Pokémon TCG board
that imitates Pokémon TCG Live). You do NOT design code and you do NOT touch the repository.
Your deliverable is one markdown file in the schema below.

## Inputs (all under this folder)
- `moves/manifest.json` — one entry per move slug: `en`, `fr`, `type`, `damageClass` (the video
  game's own class, for information only), `generation`, `sprite` (the Black 2/White 2 or
  Black/White GIF: `gen`, `fps`, `frames`, `durationMs`, `sheets`), `modern` (the newest 3D
  video, `EV` = Scarlet/Violet, else LPA/EB/USUL/SL/ROSA/XY: same fields), `available` (every
  game tag Poképédia has for it).
- `moves/<slug>/sprite-1.png … sprite-3.png` — contact sheets of the sprite GIF. Each tile's
  top-left number is the source FRAME INDEX; ms = frame / fps × 1000 (fps in the manifest).
  Tiles read left→right, top→bottom. The first ~1–1.5 s of a sprite GIF is the "X used Y!"
  text typing with no effect on screen — skip it, and report timings from the FIRST frame
  that shows any effect (call that t = 0).
- `moves/<slug>/modern-1.png, modern-2.png` — contact sheets of the 3D video (same labelling).
- `moves/<slug>/<slug>_<gen>.gif|mp4` — the media itself. If a sheet is too coarse to read a
  beat, extract frames yourself with ffmpeg into `moves/<slug>/tmp/` (delete after), e.g.
  `ffmpeg -v error -i <media> -vf "select='between(n\,40\,70)',scale=512:-1:flags=neighbor,tile=6x5" -frames:v 1 moves/<slug>/tmp/zoom.png`.
- A move with `sprite: null` has no sprite-era animation (it is newer than Black/White, or
  Poképédia lacks the file): study the modern sheets only and say so in `Flags`.

## Procedure per move
1. Read EVERY sheet listed in the manifest for the move (sprite first, then modern).
2. Identify the beats: what appears, where (on the attacker, travelling across, on the
   defender, over the whole screen), its shape, colour, count, motion path and speed, how
   it ends (fade, burst, fall), and whole-screen effects (background tint, white flash,
   screen shake, camera move). Give each beat a time range in ms from t = 0.
3. Note the palette as 3–4 approximate hex colours seen in the effect itself (not the
   background).
4. From the 3D video, note what the modern version adds: camera, volumes (3D shapes),
   particles, lighting, how the hit lands on the target.
5. Propose a board mapping using ONLY the primitive vocabulary below (see "Board", "House
   rules"). Keep it to ≤6 lines. This is a proposal; the designer will normalise it.
6. Write the entry. Then the next move. Save the file after every move (append), so a crash
   loses at most one entry.

## Output — `notes/<group>.md`, strictly this schema, one entry per move, in the group's order

```
### <English name> — <vg type> · <physical|special column> · tier <1|2|3>
Refs: sprite <gen or none> (<durationMs> ms, effect frames <a>–<b>) · modern <gen> (<durationMs> ms)
Sprite beats:
- <t0>–<t1> ms: <what, where, shape, colour, count, motion>
- …
Screen: <background tint / flash / shake / camera, with ms, or "none">
Palette: <#hex, #hex, #hex[, #hex]>
Modern cue: <2–3 lines: camera, volumes, particles, lighting, impact>
Board mapping:
- <ms>: <primitive>(<target>, <params>) …
- contact at <ms>; total <ms>
Flags: <none | missing refs | house-rule conflicts (what the reference does that the board must not) | uncertainty>
```

Type, column and tier come from the group list at the end of this brief (the user's table), not
from the game's own classification.

## Board — what the animation will be drawn on
- A dark table ("mat") seen from above. The attacker is a CARD (portrait rectangle, ~1:1.4)
  on the lower board; the defender is a card on the upper board, which belongs to the
  opponent and is rotated 180°. There is no 3D model of the Pokémon: the card's art stands
  in for it. Motion that would be "the Pokémon lunges" is the card (a ghost copy of it)
  moving; "the Pokémon glows" is a glow/aura on the card.
- Layers you can target: `attacker` (the attacker card's rectangle), `defender` (the
  defender card's rectangle), `lane` (the straight segment between the two card centres),
  `table` (the mat surface around a card: floor rings, fissures, waves, shadows).
- Everything is drawn in the TCG Live manner: clean, saturated, few large readable shapes,
  short (tier 1 ≈ 0.9–1.1 s, tier 2 ≈ 1.2–1.5 s, tier 3 ≈ 1.6–2.2 s including wind-up and
  settle), with ONE clear contact moment at which the damage number pops.

## Primitive vocabulary (use these names; add params in parentheses)
- `lunge(attacker→defender, reach, windup)` — ghost card winds up and strikes toward the defender, recoils home (today's default).
- `dash(attacker→defender, passThrough|stop, trails)` — ghost card crosses the lane to the defender (and through, or back).
- `cardMotion(target, kind)` — pose on a card ghost: `recoil | hop | spin | tilt | float | shiver | stomp | thrash | crouch`.
- `projectile(shape, count, path, speed, trail, spin)` — shapes flying along the lane; `path: straight | arc | homing | spiral | scatter | volley`; shapes from the shape list.
- `beam(shape, width, kind, duration, jitter)` — continuous ray along the lane; `kind: solid | segmented | helix | pulse-train | widening`.
- `burst(target, shape, count, radius, spread)` — particles flung from a point; `spread: ring | cone | up | down | random`.
- `slash(target, kind, count, angle)` — `claw(3 lines) | blade(1 line) | cross(2) | bite(jaw arcs) | x`.
- `impactFlash(target, colour, strength)` — the white/tinted flash on the struck card.
- `shake(table|card, amplitude, duration)` — today's damped shake.
- `aura(target, shape, colour, duration)` — glow/outline on a card: `flame | spark | water | wind | shadow | light | crystal | plain`.
- `charge(target, shape, count, duration)` — motes converge INTO the card (energy gathering before release).
- `orb(target|lane, size, colour, kind)` — a single big sphere: `grow-release | hover | hurl`.
- `ring(target, kind, count)` — expanding/contracting rings: `shockwave | halo | target | ripple`.
- `pillar(target, shape, height)` — vertical column rising from the card: `water | fire | light | rock | earth`.
- `terrain(target, kind)` — drawn on the table under/around a card: `fissure | quake-cracks | wave | mud-splash | sand-vortex | ice-floor | rock-spikes | shadow-pool | light-floor`.
- `cloud(target, shape, size, drift)` — soft volumetric mass: `smoke | mist | sand | spores | sludge | snow | sparkle`.
- `vignette(target, colour, strength, duration)` — a LOCAL darkening/tint around one card (the only allowed stand-in for a full-screen background change).
- `canvas(shape-draw)` — a bespoke drawn shape when none above fits (say what it draws).
Shapes: `leaf, petal, seed, vine, droplet, bubble, wave, icicle, snowflake, flame, ember, spark, bolt, star, orb, ring, shard, rock, boulder, mud-glob, sand, feather, wind-blade, gust-line, skull, ghost-wisp, shadow-claw, fist, foot, note, heart, crescent, gem, metal-slash, meteor, dragon-fang, sludge-glob, needle, pin, bug-wing, eye, fang, horn, hoof, fairy-light`.

## House rules the mapping must respect (each is a past user correction)
1. No whiteouts, no full-screen or board-wide white blooms, no spinning sunburst/god-ray
   fans, no mid-effect background colour change. The sprite games do these constantly
   (red/black backgrounds, white flashes): translate them into a `vignette` around the
   defender or attacker, or drop them. Say in `Flags` when you did.
2. Flares stay local to a card. Big effects (Earthquake, Surf, Blizzard) may cover the
   defender's half of the table, never the whole viewport.
3. Copy the reference's ENERGY and read, not every beat. Fewer, larger, cleaner shapes.
4. Colour comes from the type palette, but you still record the reference's exact colours.
5. One clear contact moment per move (multi-hit moves: name each hit, and which one carries
   the damage pop — the last).

## Rules of engagement
- Read-only on the repository. Write ONLY `notes/<group>.md` (and temporary frames under
  `moves/<slug>/tmp/`, deleted when done).
- Never skip a move. If a sheet is missing or unreadable, write the entry with what you
  have and say exactly what was missing in `Flags`.
- Do not invent beats you did not see. If you fill a gap from your own knowledge of the game,
  mark it `(from memory, unverified)`.
- Return to the caller: the note file path, the count of moves written, and the list of
  moves whose entries carry a `Flags` line other than `none`. Nothing else.

## Groups (type · column · tier)
G1 grass-bug: vine-whip (grass·physical·1) · razor-leaf (grass·physical·2) · leaf-blade (grass·physical·3) · absorb (grass·special·1) · magical-leaf (grass·special·2) · leaf-storm (grass·special·3) · solar-beam (grass·special·3) · seed-flare (grass·special·3) · petal-dance (grass·special·3) · energy-ball (grass·special·3) · fell-stinger (bug·physical·1) · fury-cutter (bug·physical·1) · pin-missile (bug·physical·1) · twineedle (bug·physical·1) · x-scissor (bug·physical·2) · lunge (bug·physical·2) · megahorn (bug·physical·3) · infestation (bug·special·1) · struggle-bug (bug·special·2) · silver-wind (bug·special·2) · signal-beam (bug·special·2) · bug-buzz (bug·special·3)
G2 water-ice: aqua-jet (water·physical·1) · waterfall (water·physical·2) · liquidation (water·physical·2) · wave-crash (water·physical·3) · aqua-tail (water·physical·3) · water-gun (water·special·1) · bubble (water·special·1) · whirlpool (water·special·1) · octazooka (water·special·2) · scald (water·special·2) · water-pledge (water·special·3) · hydro-cannon (water·special·3) · hydro-pump (water·special·3) · surf (water·special·3) · ice-shard (ice·physical·1) · avalanche (ice·physical·2) · ice-hammer (ice·physical·3) · ice-spinner (ice·physical·3) · powder-snow (ice·special·1) · aurora-beam (ice·special·2) · icy-wind (ice·special·2) · ice-beam (ice·special·3) · blizzard (ice·special·3)
G3 fire-electric: flame-charge (fire·physical·1) · flame-wheel (fire·physical·2) · fire-punch (fire·physical·3) · ember (fire·special·1) · incinerate (fire·special·2) · mystical-fire (fire·special·2) · lava-plume (fire·special·2) · flame-burst (fire·special·2) · blast-burn (fire·special·3) · overheat (fire·special·3) · flamethrower (fire·special·3) · nuzzle (electric·physical·1) · thunder-fang (electric·physical·2) · wild-charge (electric·physical·3) · thunder-shock (electric·special·1) · shock-wave (electric·special·2) · electro-shot (electric·special·3) · thunder (electric·special·3) · zap-cannon (electric·special·3)
G4 ghost-dark: lick (ghost·physical·1) · astonish (ghost·physical·1) · shadow-punch (ghost·physical·2) · shadow-claw (ghost·physical·3) · phantom-force (ghost·physical·3) · night-shade (ghost·special·1) · hex (ghost·special·2) · ominous-wind (ghost·special·2) · shadow-ball (ghost·special·3) · pursuit (dark·physical·1) · feint-attack (dark·physical·2) · bite (dark·physical·2) · night-slash (dark·physical·3) · throat-chop (dark·physical·3) · snarl (dark·special·2) · dark-pulse (dark·special·3)
G5 fighting-poison: arm-thrust (fighting·physical·1) · karate-chop (fighting·physical·2) · low-sweep (fighting·physical·2) · triple-kick (fighting·physical·2) · close-combat (fighting·physical·3) · meteor-assault (fighting·physical·3) · superpower (fighting·physical·3) · vacuum-wave (fighting·special·1) · aura-sphere (fighting·special·2) · focus-blast (fighting·special·3) · poison-sting (poison·physical·1) · poison-tail (poison·physical·2) · poison-jab (poison·physical·3) · cross-poison (poison·physical·3) · acid (poison·special·1) · sludge (poison·special·2) · venoshock (poison·special·2) · sludge-bomb (poison·special·3) · sludge-wave (poison·special·3)
G6 ground-rock: sand-tomb (ground·physical·1) · mud-slap (ground·physical·1 and ground·special·1) · bulldoze (ground·physical·2) · stomping-tantrum (ground·physical·2) · earthquake (ground·physical·3) · high-horsepower (ground·physical·3) · mud-shot (ground·special·2) · mud-bomb (ground·special·2) · earth-power (ground·special·3) · smack-down (rock·physical·1) · rock-throw (rock·physical·1) · rock-blast (rock·physical·1) · rock-slide (rock·physical·2) · rock-tomb (rock·physical·2) · head-smash (rock·physical·3) · stone-edge (rock·physical·3) · rock-wrecker (rock·physical·3) · ancient-power (rock·special·2) · power-gem (rock·special·3)
G7 flying-dragon-steel: peck (flying·physical·1) · aerial-ace (flying·physical·2) · wing-attack (flying·physical·2) · brave-bird (flying·physical·3) · gust (flying·special·1) · air-cutter (flying·special·2) · hurricane (flying·special·3) · aeroblast (flying·special·3) · dual-chop (dragon·physical·2) · dragon-claw (dragon·physical·2) · outrage (dragon·physical·3) · twister (dragon·special·1) · dragon-breath (dragon·special·2) · dragon-pulse (dragon·special·3) · draco-meteor (dragon·special·3) · bullet-punch (steel·physical·1) · metal-claw (steel·physical·1) · smart-strike (steel·physical·2) · steel-wing (steel·physical·2) · iron-tail (steel·physical·3) · iron-head (steel·physical·3) · flash-cannon (steel·special·2) · steel-beam (steel·special·3)
G8 psychic-fairy: zen-headbutt (psychic·physical·2) · psycho-cut (psychic·physical·2) · confusion (psychic·special·1) · psybeam (psychic·special·2) · psychic (psychic·special·3) · future-sight (psychic·special·3) · spirit-break (fairy·physical·2) · play-rough (fairy·physical·3) · disarming-voice (fairy·special·1) · fairy-wind (fairy·special·1) · draining-kiss (fairy·special·2) · dazzling-gleam (fairy·special·2) · moonblast (fairy·special·3)
