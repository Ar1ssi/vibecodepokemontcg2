# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 252
Focus: docs — root README replaced with a full project readme + feature catalog (user request).
Active: none. README.md rewritten and Prettier-formatted, UNCOMMITTED on main for user review.
Next: review/commit the README diff; then I78–I80 (deferred). Maintenance due at S260.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- The old root README (append-only release notes) was replaced outright at the user's explicit
  call; the old content remains at `git show HEAD:README.md` if ever needed.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost
  is unpaid" — suite 2844 tests / 2843 pass at S252; nothing else fails.
- S251's 31 audit fixes are COMMITTED (6dbca11, 13b7788); working tree clean except untracked
  `.qwen/`. `pnpm test` on this checkout can trigger an implicit install and once emptied
  node_modules — prefer `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs"
  "server/**/*.test.mjs" "bot/**/*.test.mjs"`.
- Design 023: the glow-loss cause class is still present — `hookActionAffordances`' bare catch
  (rules-bridge.js:1949-1962) clears every glow when computeCardGlows throws (no repro, left as-is).
- Client legacy mode still lags the server on: GX once-per-game (I79), fossil Items (I80),
  simultaneous stadium KO tiebreak (I78, server-side).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S252 docs: root README.md replaced — overview, quick start, full feature catalog (deck builder,
  table, rules mode, multiplayer, visuals, import/export), architecture, commands, config, testing,
  deployment, limitations, documentation map.
- S251 audit+fix: 31 fixes across items/energy/abilities/attacks/effects plus client parity
  (committed 6dbca11); I78–I80 deferred with repros.
