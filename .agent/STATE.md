# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 192
Focus: Made EVERY effect that chooses in-play Pokémon route to the mat picker (D60, supersedes
  D59's max===1 gate): mat picker now multi-selects; retreat (2+ bench) raises a choice; Escape
  Rope parses to switchOwn+switchOpponentOut; attack snipes/counter-placement raise an attack-target
  choice, including "in any way you like" placed one counter per click. Boss/Switch/heal already
  worked; damage-to-all-bench spread is intentionally automatic. Legacy chat-buttons.js retreat +
  attack snipes/counters also use openMatPick. Server-authoritative path is the tested one.
Active: worktree `C:\Users\SMG26\Downloads\vibe-mat-picker-server` on `feature/server-mat-picker`
  @ 48e612d (PR #170), with UNCOMMITTED S192 edits: `rules/mat-picker.js`, `mat-pick-request.mjs`,
  `mat-picker-adapter.js`, `apply-view.js`, `shared/engine/reduce.mjs`, `rules/damage-parser.mjs`,
  `rules/trainer-effects.mjs`, `client/src/actions/chat-buttons/chat-buttons.js`,
  `client/src/setup/image-logic/drag.js`, tests, `.agent/designs/017-*.md`, DECISIONS/MAP/STATE/journal.
Next: commit and push S192 onto the PR #170 branch. Then PR #170 merge. Primary checkout still on
  `main` @ ce0cc55 with uncommitted S190 holo + S183/S184/S188/S189 work — none on a branch yet.
  Legacy chat-buttons.js changes are syntax/lint-checked only (no unit/live harness); W/R is not
  applied to chosen snipe targets on either path.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Server mat pick (design 016/017, D59/D60): `apply-view.js` routes a PendingChoice to the mat
  picker when every option is an in-play Pokémon root (`cardRegistry` record: `zone ∈ active|bench`,
  `card.attachedTo == null`, `.element`) at ANY `max`; `mat-picker.js` toggles for `max>1` and needs
  Confirm. `MAT_PICKER.close()` is a SILENT `dismissMatPick()` — only user Cancel/Escape calls
  `onCancel`.
- Attack target choices are `resumeToken.effectType:'attack'` with `token.attackTarget`; the resume
  branch in `reduce.mjs` applies the damage then emits `attackExecuted` and ends the turn. The
  target block runs AFTER draw/energy/locks/search so a suspension never drops them; a
  `distributable` clause re-suspends one counter at a time (`remaining`).
- Carousel clicks: `stage.setPointerCapture()` retargets the follow-up `click` to the stage;
  interactive slide content must be in `isSwipeBlockedTarget` (`card-picker.js`). Verify with REAL
  input — `el.click()` hides it.
- Under SERVER_AUTHORITATIVE the legacy zone arrays are EMPTY; read
  `getAuthoritativeZoneArray`/`cardRegistry` and address cards by instanceId.
- `pnpm test` is an explicit file list (a new test file runs only once listed). Gate 1989/1989 green
  as of S192; `pnpm lint` still repo-wide red on CRLF (`core.autocrlf=true`) plus pre-existing
  `no-undef` (`dmg` in `chat-buttons.js`) and `no-useless-escape` in `trainer-effects.mjs:182/188`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S192 2026-09-19 feature: mat picker multi-select + retreat/Escape Rope/attack-target choices +
  "in any way" counter distribution, netcode and legacy (design 017, D60); pnpm test 1989/1989.
- S191 2026-09-19 feature: in-play-Pokémon server choices use the mat picker (design 016, D59,
  PR #170); pnpm test 1978/1978, live 2P probe passed.
- S190 2026-09-19 patch (primary, uncommitted): double-click preview foil flows like the mat (D58).
