# Signature move study — brief for one study agent

You study the reference animations of legendary Pokémon signature moves and write observational
notes that feed design 064 (signature move animations for a 2-player Pokémon TCG board that
imitates Pokémon TCG Live). You do NOT write code and you do NOT touch the repository except to
READ design 063 (path below). Your deliverable is one markdown file in the schema below.

## Inputs (all under `sig/`)
- `signature-list.tsv` — every move: slug, English and French names, type, class, power,
  owner species, group, notes (e.g. "status move").
- `moves/manifest.json` — per slug: `modern` (the video used: `gen` tag, `fps`, `frames`,
  `durationMs`, `sheets`, `file`) or, when no video exists, `sprite` (a sprite-era GIF, same
  fields); `available` lists every tag Poképédia has. Tags: `EV` = Scarlet/Violet (the user's
  chosen reference), `LPZA` = Legends Z-A, `LPA` = Legends Arceus, `EB` = Sword/Shield, `USUL`
  = Ultra Sun/Moon, `SL` = Sun/Moon, `ROSA` = Omega Ruby/Alpha Sapphire, `XY`, `LGPE` = Let's Go.
- `moves/<slug>/video-1.png … video-4.png` (or `sprite-*.png`) — contact sheets. Each tile's
  top-left number is the source FRAME INDEX; ms = frame / fps × 1000. Tiles read left→right,
  top→bottom. The video opens with the "<Pokémon> used <Move>!" text box and the camera on the
  attacker; t = 0 is the FIRST frame that shows any effect or any move-specific motion of the
  Pokémon (not the text box). Report every time in ms from that t = 0.
- `moves/<slug>/gen7-1.png … gen7-4.png` — SECONDARY reference: the Generation 7 video (Ultra
  Sun/Moon, `USUL`; manifest field `gen7`, same labelling; `null` = none exists, 52 of the moves
  have one). Gen 7 uses a steadier, wider side camera, so it often shows the SHAPE of the
  animation better: the path from attacker to defender, how many bodies, their geometry and
  the order of beats. Use it when the primary video confuses you about shape or the camera
  angle hides the action. Priority rule (the user's): materials, shading, colours, textures,
  particles and lighting ALWAYS come from the primary (Scarlet/Violet) video; Gen 7 only
  settles shape, path, count and beat order. Timings are measured on the primary video.
- `moves/<slug>/<slug>_<tag>.mp4` — the video itself (and `<slug>_USUL.mp4` for Gen 7). When a sheet is too coarse to read a beat,
  extract frames yourself into `moves/<slug>/tmp/` (delete it after), e.g.
  `ffmpeg -v error -i <video> -vf "select='between(n\,60\,90)',scale=480:-1,tile=4x4" -frames:v 1 moves/<slug>/tmp/zoom.png`
  and read the PNG.
- Design 063 (READ ONLY): `/home/user/vibecodepokemontcg2/.agent/designs/063-attack-move-animations.md`.
  Read its sections "What the look test settled", "Drawers", "Card motion" and the materials
  list under "Materials" before your first entry (find them with
  `grep -n "^## \|^### " <file>` then `sed -n <a>,<b>p`). That is the vocabulary your board
  mapping must use. Read Appendix A's "Worked example — Fire Blast" as the model entry.

## What the board is
- A dark table seen from above. The attacker is a CARD (portrait, ~1:1.4) — there is no 3D
  model; the card's art stands in for the Pokémon. "The Pokémon leaps / glows / transforms" is
  the card's ghost copy moving (card-motion presets) or glowing (`aura`, rim glow).
- The two Active cards nearly touch: the lane (centre to centre) is ~1.2 card heights (h), so a
  travel beat crosses ~0.75 h. It must also read on a long lane (a Benched target).
- Layers: back canvas < attacker ghost < defender ghost < front canvas < CSS particles.
- Signature moves get a longer budget than the generic tier-3 moves: total 1.8–2.6 s, ONE
  contact moment between 0.9 s and 1.2 s (the damage number pops there; multi-hit moves name
  each hit and put the damage on the last, which must still be ≤ 1.2 s). Status moves (no
  damage) have no contact: their effect is on the attacker or the defender, total ≤ 2.0 s.

## House rules the mapping must respect (each is a past user correction)
1. No whiteouts, no full-screen or board-wide white blooms, no spinning sunburst/god-ray fans,
   no mid-effect background colour change, no camera moves. The 3D videos do all of these:
   translate a screen tint into a local `vignette` around a card, a camera cut into card motion,
   a whole-screen flash into `impactFlash` on the defender — or drop it. Say so in `Flags`.
2. Effects stay local: at most the defender's half of the table for the biggest moves, never
   the whole viewport.
3. Copy the reference's ENERGY and its one recognisable image, not every beat. Fewer, larger,
   cleaner shapes. A signature move must not look like the generic move of its type: name what
   makes it unmistakable.
4. Materials, not flat gradients: every visible body is drawn by a type material (tongues with
   wobbling edges, blurred body + crisp mid + hot core, additive blending, grain).
5. Record the reference's exact colours even when they differ from the type palette.

## Procedure per move
1. Read EVERY primary sheet listed for the move in the manifest, in order. Then, if the shape,
   path or count is unclear, or the camera hides the action, read the Gen 7 sheets (`gen7`).
2. Find t = 0 and the beats: what appears, where (attacker / lane / defender / above / ground /
   whole screen), its shape, colour, count, motion path and speed, how it ends. What the Pokémon
   itself does (rears, leaps, charges, spins, transforms). Camera cuts. Whole-screen effects.
3. Palette: 3–5 approximate hex colours of the effect itself (not the arena background).
4. Board mapping with ONLY design 063's drawers, card-motion presets and materials, ≤ 8 lines,
   with ms times. If something essential has no drawer, describe the missing piece under
   `New pieces` (≤ 2 lines each: what it draws, its motion, which material) — do not force it.
5. Write the entry, append it to your notes file, save, then the next move (a crash loses at
   most one entry).

## Output — `notes/<batch>.md`, strictly this schema, one entry per move, in your batch's order
```
### <English name> — <owner species> · <vg type> · <physical|special|status> · power <n|—>
Refs: video <tag> (<durationMs> ms, <fps> fps, effect frames <a>–<b>) | sprite <tag> (…) — plus "no EV video" when the tag is not EV · gen7 <USUL (used for: shape/path/count/angle) | USUL (not needed) | none>
Signature read: <one sentence: the single image a player must recognise>
Video beats (t = 0 at frame <a>):
- <t0>–<t1> ms: <what, where, shape, colour, count, motion>
- …
Pokémon: <what the Pokémon's body does, with ms — the cue for the card ghost>
Camera & screen: <cuts, pans, zooms, tints, flashes with ms — and the board's replacement, or "none">
Palette: <#hex, #hex, #hex[, …]>
Closest generic: <the design-063 move it most resembles (e.g. hydro-pump) and what must differ>
Board mapping:
- <ms>: <drawer>(<target>, <params>) …
- attacker <preset>, defender <preset>[ <strength>]
- contact at <ms>; total <ms>
New pieces: <none | one line per missing drawer/material unit>
Flags: <none | missing refs | house-rule translations | status move | uncertainty>
```

## Out of scope (the user's)
Status moves that only affect the user's own side are skipped and are not in any batch list:
burning-bulwark, jungle-healing, geomancy, lunar-dance, lunar-blessing, take-heart. Status
moves that target the opponent (dark-void, heart-swap) stay.

## Rules of engagement
- Write ONLY `notes/<batch>.md` (and temporary frames under `moves/<slug>/tmp/`, deleted).
- Never skip a move. A move with no sheets: write the entry from what you have, `Flags: missing refs`.
- Do not invent beats you did not see. Anything from your own memory of the games is marked
  `(from memory, unverified)`.
- Return to the caller: the notes file path, the number of entries written, and the moves whose
  `Flags` line is not `none` (slug: one-phrase reason). Nothing else.
