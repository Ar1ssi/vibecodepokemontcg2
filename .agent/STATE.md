# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 289
Focus: S289 feature: design 038 (I138-I150 fixes for the design 035 review) approved (option A x5); slice 1 shipped
  on claude/wizardly-brown-k61li3 (= feature/trainer-behaviour + main merged).
Active: design 038 slice 1/5 done (0ab2dbc: prize-clause side, Tool damage/KO phase). Next = slice 2 (I141 + I143
  faceDown choice options, count-only look events, Heavy/Beast Ball choice). Ledger: NEXTSTEPS.md top section.
Next: design 038 slices 2-5, then merge the trainer-behaviour branch to main. Maintenance due (S270, S280 not run).
  I151 (reactive Tool conditions unchecked), I136 (26 server-missing Trainer steps), I137 (design 035 leftovers).
  User visual check of typed Tera entry/skin, Mega vortex in a real rules-mode game.
  I126/I127 (retreat-cost), I121-I125 (design 032 leftovers); I113 oracle still blind to damage amounts.
  Design numbers collide: 032 (two files) and 035 (mega orb in D118 vs trainer-behaviour design file).
  Still pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy (untested by policy). ISSUES Open over cap.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Execution gates: `pnpm audit:oracle` (~2 min, D108) after engine attack/ability changes; `pnpm audit:trainers`
  (seconds, D123) after trainer parser/executor changes. Legit improvements → `--update-baseline` and commit the
  baseline JSON. Later-turn markers are ORACLE_BLIND_FAMILIES.
- Editing via bash heredoc eats `\` → write edit scripts with the Write tool / String.raw.
  Timed attack effects are `card.attackMarkers` (D109, attackLock D113); copy attacks resolve before coins (D110).
- Reactive Tools: `parsePrizeModify().side` and `parseToolOnDamageEffect().phase` decide which loop applies a clause
  (design 038). An attack ends the turn, so the defender's hand gains the turn draw in attack tests.
- Pre-existing `pnpm test` failure: card-inspector-model "retreat greys…"; coin-flip-ceremony is flaky.
  ESLint runs after `pnpm install` (`npx eslint <files>`); the repo carries many prettier warnings, so lint touched files only.
- Board FX: D103, D117-D122 (playCanvasStage WAAPI clock; holo wrappers need TCGdex, emulate with buildHoloCard).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S289 Design 038 slice 1: attacker-held prize Tools no longer change the attacker's KO Prizes; Lucky Egg only on KO;
  Handheld Fan/Rugged Helmet move one Energy once (Rugged Helmet no longer crashes); Vengeful Punch only on KO.
- S287 Forest of Vitality (evolution-speed Stadiums) allows a {G} Basic → Stage 1 → Stage 2 in one turn, server + client.
- S286 Design 035 done: Trainer play conditions enforced server-side; `pnpm audit:trainers` ratchet.
