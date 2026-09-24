# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 287
Focus: S286 feature: design 035 finished — slice 11 trainer play conditions + slice 12 `pnpm audit:trainers` gate
  (branch claude/wizardly-brown-k61li3 = feature/trainer-behaviour + main merged).
Active: S288 review of feature/trainer-behaviour (design 035 slices 1-10b): verdict fix first — I138/I139 (P1 prize/KO-draw),
  I140-I145 (P2), I146/I147 (P3). Same code on this branch (S286/S287 did not touch those paths).
  Slices 11-12 (S286) reviewed too: sound; I148/I150 (P3), I149 (P2, pre-existing turn-1 Supporter rule).
Next: maintenance due (S270 and S280, still not run). Merge the trainer-behaviour branch to main after review.
  I136 (26 server-missing Trainer step kinds, `pnpm audit:trainers`), I137 (design 035 leftovers).
  User visual check of typed Tera entry/skin, Mega vortex in a real rules-mode game.
  I126/I127 (retreat-cost), I121-I125 (design 032 leftovers); I113 oracle still blind to damage amounts.
  Design numbers collide: 032 (two files) and 035 (mega orb in D118 vs trainer-behaviour design file).
  Still pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy (untested by policy).
  ISSUES Open still over cap.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Execution gates: `pnpm audit:oracle` (~2 min, D108) after engine attack/ability changes; `pnpm audit:trainers`
  (seconds, D123) after trainer parser/executor changes. Legit improvements → `--update-baseline` and commit the
  baseline JSON. Later-turn markers are ORACLE_BLIND_FAMILIES.
- Editing via bash heredoc eats `\` → write edit scripts with the Write tool / String.raw.
  Timed attack effects are `card.attackMarkers` (D109, attackLock D113); copy attacks resolve before coins (D110).
- Mat FX: see D103, D117-D122. Canvas FX go through entry.js `playCanvasStage` (WAAPI clock). Board cards live in the
  playmat iframes (css/mat-ambient.css); `.card` is preserve-3d, so layer order inside a holo wrapper needs translateZ.
  Holo wrappers need TCGdex (unreachable in the sandbox): emulate with buildHoloCard + `holo-wrapper-changed`.
- Pre-existing `pnpm test` failure: card-inspector-model "retreat greys…".
  ESLint runs after `pnpm install` (`npx eslint <files>`); the repo carries many prettier warnings, so lint touched files only.
- Session numbers S282–S285 were used on another machine for design 035 without journal entries (see S286 line).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S287 Forest of Vitality (evolution-speed Stadiums) allows a {G} Basic → Stage 1 → Stage 2 in one turn, server + client.
- S286 Design 035 done: Trainer play conditions (Lost Zone, Stadium, opponent Active stage/Poisoned, typed KO'd-last-
  turn, last card/hand size, exactly-N Prizes, first-turn-only) enforced server-side; `pnpm audit:trainers` ratchet.
- S280–S285 (other machine) design 035 slices 1–10: prize clauses, fossil bench picks, gated Tool modifiers, ~27 new
  Trainer step executors, TM attacks, Tool on-KO effects, triggered Stadiums.
