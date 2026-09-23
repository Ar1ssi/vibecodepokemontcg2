# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 278
Focus: S278 feature: Tera/Mega entry FX rebuilt from TCG Live reference clips (design 034, D117).
Active: none.
Next: maintenance due (S270, still not run). User visual check of the new Tera/Mega entries in a real game.
  I126/I127 (retreat-cost: energy-conditional variants + inspector tile), I121-I125 (design 032
  leftovers); I113 oracle still cannot see damage amounts for immunity/prevention.
  Design numbers collide: 032-oracle-execution-gate.md and 032-coin-gated-attack-sentences.md (code comments mean the latter).
  Still pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy (untested by policy).
  ISSUES Open still over cap.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Attack/ability execution gate: `pnpm audit:oracle` (~2 min, D108). Run after engine attack/ability changes; legit
  rate changes → `--update-baseline`, commit scripts/oracle-baseline.json. Later-turn markers are ORACLE_BLIND_FAMILIES.
- Editing via bash heredoc eats `\` → write edit scripts with the Write tool / String.raw.
  Working-copy files are CRLF (repo LF); keep eol when scripting edits.
- Timed attack effects are `card.attackMarkers` (D109, attackLock D113); copy attacks resolve before coins, tokens carry `copiedAttack` (D110).
  BLOCKS regexes are wrapped by `gatedBlock` (adds capture group 1): no backreferences in them.
- Mat FX / deck-builder CSS layering / vendored `*.generated.mjs`: see D95, D99, D103, D104, D117, D97-D100. To eyeball an effect:
  Playwright on /?e2e=1 (Chromium /opt/pw-browsers/chromium; route cdn.socket.io → local /socket.io/socket.io.min.js), import the
  effect module, pause `document.getAnimations()` and step `currentTime` into screenshots.
- Pre-existing `pnpm test` failure: card-inspector-model "retreat greys…" (the other 6 listed before passed in S278).
  ESLint runs after `pnpm install` (`npx eslint <files>`); the repo carries many prettier warnings, so lint touched files only.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S278 Tera/Mega entry FX replicate TCG Live (design 034): mint crystal + jewel + smoke burst; mat-wide hex field + orb + slash vortex.
- S277 team-wide retreat-cost: `teamNoRetreatCostForActive` (D116) zeroes the Active's cost from a Benched Skyliner-style holder; retreat callers pass `benchCards`.
- S276 ability self-shuffle: `returnSelfToDeckAbility` executes (shuffleSelf, requiresDraw gate); ability path settles a vacated Active.
