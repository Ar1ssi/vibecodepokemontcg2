# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 193
Focus: Once-per-game GX attack + VSTAR Power (design 018, rulebook gaps #2/#3). `player.oncePerGame
  {vstarUsed,gxUsed}` is game-scoped (state/setup/clone; `advanceTurn` never rebuilds it);
  `isGxAttack` (name ends `GX`) gates the `attack` command and sets `gxUsed` on resolve (also on
  the target-choice resume); `useVStarGX` takes `kind:'vstar'|'gx'` and splits the independent
  limits; legacy `ko-flow` GX KO now awards 2 prizes instead of declaring a match loss. VMAX
  untouched (no once-per-game rule; 3-prize KO already correct).
Active: worktree `C:\Users\SMG26\Downloads\vibe-gx-vmax` on `feature/gx-vmax-attacks` @ 1bcff16
  with UNCOMMITTED S193 edits: `shared/engine/{reduce,state,setup,view,commands}.mjs`,
  `rules/damage-parser.mjs` (+`isGxAttack`), `rules/ko-flow.mjs`, `server/game/room.mjs` (seeds
  oncePerGame), `__tests__/once-per-game.test.mjs`, `rules/__tests__/rules-extended.test.mjs`,
  `netcode/dual-run-bridge.js` (+ test), `package.json`, `README.md`, `docs/card-types-taxonomy.md`,
  `.agent/designs/018-*.md`, DECISIONS/MAP/STATE/journal.
Next: user review; commit/push when asked. Primary checkout is still on `main` @ 1bcff16 with its
  own S192 uncommitted mat-picker work — do not confuse the two.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `player.oncePerGame` is the ONLY game-scoped marker; `advanceTurn` replaces `player.flags`
  wholesale, so never put a once-per-game flag back on `flags`. Reads use `?.` for old snapshots.
- `useVStarGX.kind` is REQUIRED (`'vstar'|'gx'`); `instanceId` is optional and only verified when
  present. `dual-run-bridge.js` maps legacy `[type]` → kind. Shape rejection = `bad_command`.
- The attack panel (`attack-window.mjs`/`attack-preview`) does not yet grey a spent GX attack; the
  server rejects it with "Only one GX attack can be used per game." (design 018 out-of-scope note).
- `pnpm test` fails on Windows with "The command line is too long" (the explicit file list). Use
  `node --test "shared/**/__tests__/*.test.mjs" "client/**/__tests__/*.test.mjs"
  "server/**/__tests__/*.test.mjs" "bot/__tests__/*.test.mjs"` (2065/2065 green S193).
- `pnpm lint` is repo-wide red on CRLF (`core.autocrlf=true`) plus pre-existing unused imports in
  `rules-extended.test.mjs` / `ko-flow.mjs`; confirm new errors only via prettier-off eslint.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S193 2026-09-19 feature: once-per-game GX attack + VSTAR Power, legacy GX KO = 2 prizes
  (design 018, gaps #2/#3); node --test 2060/2060.
- S192 2026-09-19 feature: mat picker multi-select + retreat/Escape Rope/attack-target choices +
  "in any way" counter distribution, netcode and legacy (design 017, D60); pnpm test 1989/1989.
- S191 2026-09-19 feature: in-play-Pokémon server choices use the mat picker (design 016, D59,
  PR #170); pnpm test 1978/1978, live 2P probe passed.
