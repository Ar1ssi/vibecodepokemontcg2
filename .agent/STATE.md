# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 171
Focus: Design 012 — manual board tools restored under server authority (items 1-6 of the S171 gap diagnosis).
Active: none. Work is committed on branch `fix/netcode-dropped-features` in worktree ../vibe-netcode-gaps.
Next: user reviews/merges the branch (nothing pushed). Then I56 (keybinds c/z/e/q on server cards) and
  I57 (discard viewer). Then audit lows A-6/A-10, I28 holo/mat sizing, PR #143 2P rules pass. maintenance due.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Legacy zone arrays are EMPTY under SERVER_AUTHORITATIVE 2P (verified live S171: legacy hand 0 vs view 7,
  legacy deck stale at 14). Anything reading `getZone(user, z).array` or `mouseClick.card` is broken there —
  read `getAuthoritativeZoneArray(side, zone)` / the `cardRegistry` and address cards by instanceId (D12, D47).
- Board cards live INSIDE the `selfContainer`/`oppContainer` playmat iframes (separate documents that load only
  self-/opp-containers.css + its @imported partials; index.css never reaches them). Stadium is the exception.
- Netcode: test under `SERVER_AUTHORITATIVE=1` only (S137). Pick a free PORT — other sessions hold :4000/:4317.
  Live 2P probe harness: `.agent/scratch/probe.mjs <step-file>` (Playwright, joins a room, deals, runs a step module).
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json. `pnpm lint` fails
  repo-wide on CRLF; lint a diff with `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>`.
- Prize cards move only on a server-granted entitlement (D43/D46). Manual counters/conditions and deck-order ops
  are turn-player-only in rules mode. Pre-existing failing test: "trainer drop: a Trainer without synced effect text".

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S171 2026-09-18 feature: design 012 manual board tools under server authority (D47, D48, D49).
- S170 2026-09-17 feature: prize picker restored under server authority (D46).
- S169 2026-09-17 feature: A-1 stacked conditions — Poison/Burn marker keys + per-condition markers (D45).
