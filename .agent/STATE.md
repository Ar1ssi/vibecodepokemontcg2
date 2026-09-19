# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 193
Focus: Double-clicking the in-play Stadium now opens the card-inspector module (effect panel +
  Use) instead of a plain scan; Use routes through the existing `stadiumEffect(user)`. Usability
  is a new pure `stadiumActivationStatus` (rules on / your turn / once-per-turn unused / condition
  met); continuous Stadiums show text but no click. Design 018, D61.

Active: worktree `C:\Users\SMG26\Downloads\vibe-stadium-inspector` on
  `feature/stadium-inspector-use` @ f78f3f6, pushed, PR #172 open against `main`. Changes:
  `stadium-effects.mjs`, `card-inspector.mjs`, `card-inspector-model.mjs`, `attack-zone-geometry.js`,
  `click-events.js`, `index.css`, tests (`rules-extended`, `card-inspector-model`,
  `card-inspector-css`), design 018 / DECISIONS / STATE / journal.
Next: PR #172 review/merge. Live browser e2e for this feature is still owed. Primary checkout still
  on `main` @ 1bcff16 with uncommitted S190 holo + S183/S184/S188/S189 work — none on a branch yet,
  and PR #170 (S192 mat-picker) still unmerged. Live browser e2e for this feature is still owed.

Blocked: live browser e2e not runnable here — primary `node_modules` lacks `socket.io`, so
  `node server/server.js` cannot boot; `pnpm test:inspector` therefore can't run.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `stadiumActivationStatus` (stadium-effects.mjs) is the ONLY stadium-usability decision; the model
  reads it, the DOM never re-derives it. `stadiumContextFor` (card-inspector.mjs) maps live
  `rulesState` into the model ctx; `hydrateContext` skips stadium (its getContext is authoritative
  and re-read on every REFRESH_EVENT).
- Inspector routing: `click-events.js` special-cases `zoneId === 'stadium'` BEFORE the
  `cardUser === 'self'` Pokémon gate — `#stadium` is neutral, and `identifyCard` sets cardUser
  `'opp'` there. Actor is `systemState.initiator` (same as the sidebox stadium button).
- `isStadiumCard` (stadium-effects.mjs) has name fallbacks (`zone`/`rooftop`/`grand tree`); the
  model's stadium branch runs before `isInspectablePokemon`, so a non-stadium reaching it stays
  plain (kind:'stadium' only for real stadium records).
- Under SERVER_AUTHORITATIVE the legacy zone arrays are EMPTY; read
  `getAuthoritativeZoneArray`/`cardRegistry` and address cards by instanceId.
- `pnpm test` is an explicit file list (a new test file runs only once listed). Full explicit list
  2012/2012 green as of S193; `pnpm lint` still repo-wide red on CRLF (`core.autocrlf=true`) plus
  pre-existing `no-undef` (`document` in card-inspector.mjs, `dmg` in chat-buttons.js).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S193 2026-09-20 feature: Stadium double-click → inspector module with a Use panel running
  `stadiumEffect`; pure `stadiumActivationStatus`, model/renderer `kind:'stadium'` (design 018, D61).
- S192 2026-09-19 feature: mat picker multi-select + retreat/Escape Rope/attack-target choices +
  "in any way" counter distribution, netcode and legacy (design 017, D60); pnpm test 1989/1989.
- S191 2026-09-19 feature: in-play-Pokémon server choices use the mat picker (design 016, D59,
  PR #170); pnpm test 1978/1978, live 2P probe passed.
