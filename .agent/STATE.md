# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 90 (90b: same-session follow-up, no new session number)
Focus: merge of two concurrent sessions' work onto main — S89/S89b (3D Energy tokens on attached
  Energy cards, design 005) and S90/S90b (nine "Generation 9".."Generation 1" pills + per-
  generation Energy tabs in the deck builder's Browse Sets panel, design 006 — drafted as 005,
  renumbered on merge since S89 claimed that number first). Both sessions independently numbered
  themselves S89 on branches that hadn't met (same collision pattern as the S87/S88 merge in
  journal S88) — this session's renumbered to S90/S90b; DECISIONS D22/D23→D24/D25 for the same
  reason. Full detail for each feature is in journal S89/S89b and S90/S90b respectively.
Active: done for design 006 (this session's work): `fetchGenerationSets`/`fetchGenerationEnergyCards`/
  `GENERATION_SERIES`/`GENERATIONS` in set-browser.mjs pull every set (and a synthetic Energy tab)
  of a Pokémon generation live from TCGdex's `/v2/en/series/{id}` grouping — confirmed live that
  TCGdex series ids match pkmncards.com/sets/'s era headers almost exactly. Panel state in
  native-deck-builder-set-browser.js refactored to a per-category `categoryState` Map so pills
  don't re-fetch on revisit. 14 tests in generation-sets.test.mjs, now wired into `pnpm test`.
  Design 005 (3D Energy tokens, S89/S89b, merged from main) is unrelated pre-existing work from a
  different session — not touched or re-verified this session beyond the merge itself.
Next: user should smoke-check both features on localhost:4100 (worktree server; port 4000 was
  already taken by another node process, likely the primary checkout's): generation pills + their
  Energy tabs in Browse Sets (design 006), and the 3D Energy token render on attached Energy
  (design 005, already live-verified by its own session per journal S89b). Still open from
  S82/S88: I34 (turn-desync residual, 1/10 soak failures) — see journal S88 for the lead. Still
  open from S73: drag active→bench retreat live-verify; mat pickers + Grand Tree. Maintenance due
  S96 (S86 sweep was the last one).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`, so `.mjs` gets no `globals` and no `endOfLine:
  'auto'`) — known baseline since S1. Verify a diff's own files with a targeted `npx eslint
  <files>` and read past the CRLF noise; don't try to fix the repo-wide config in passing.
- `playtest-bot.mjs --games=N` is now a real regression gate for legacy-mode multiplayer
  desyncs, not just a bug-finder — a clean run used to be blocked on I30, now it isn't. Treat
  a new failure from it as a real finding again, not "known I30 noise."
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs`/
  `parseRetreatArgs` (sync-action-args.mjs) before adding a parameter to any legacy action.
- `turnState().fromServer` is meaningless in legacy mode (SERVER_AUTHORITATIVE unset, this
  repo's default) — it only ever becomes true under flip-gate-test.mjs's authoritative mode.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S90/S90b 2026-09-10 feature: design 006 — generation pills + per-generation Energy tabs in
  Browse Sets — see Active above.
- S89/S89b 2026-09-10 feature+patch: 3D energy tokens for attached Energy (design 005, a
  concurrent session, merged from main).
- S88b 2026-09-10 patch(security): closed the `?e2e=1` bridge exposure.
