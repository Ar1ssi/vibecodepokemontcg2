# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 75
Focus: feasibility analysis of a CPU AI playtest bot, then a written plan for one.
  No product code changed.
Active: done. Deliverable: `.agent/designs/004-playwright-playtest-bot.md` (draft, UNAPPROVED)
  on branch `claude/cpu-ai-game-testing-pfdzak` — a 6-slice plan for a self-playing Playwright
  bot driving the real UI through the existing `?e2e=1` `window.__ptcg` bridge. Findings behind
  it: (1) `applyCommand` (shared/engine/reduce.mjs:973) can already play headless games end to
  end (see __tests__/integration-game.test.mjs), and `pendingChoice` enumerates effect choices —
  so a Tier-1 headless soak harness is the cheaper option and remains unbuilt; (2) but the
  headless path is NOT what local play uses — the reducer's `attack` case does damage + KO +
  drawCount only, with all attack-text clauses (damage-parser.mjs, rules/attack-effects.mjs)
  living solely in the browser via chat-buttons.js, and effects/executor.mjs implements ~23 step
  kinds against trainer-effects.mjs's 40+ parsed types, so unimplemented card effects silently
  no-op headless; (3) `loadDeck` mints cards with no hp/attacks — stats arrive later via the
  `cardStats` command from client TCGdex enrichment, so any headless harness needs its own Node
  card-data loader (precedent: scripts/generate-starter-decks.mjs). The user's reference repo
  (TomBombadyl/kaggle_pokemon) contains NO engine — its `core/` is a README-only scaffold and it
  targets Kaggle's cabt engine — so only its never-crash-scaffold shape and MAIN_PRIORITY
  ordering were borrowed into the plan.
Next: user decides — approve design 004 and build slice 1, or build the cheaper Tier-1 headless
  soak harness first. Still open from S73: (1) live-verify drag active→bench retreat flow,
  (2) mat click-to-select pickers + Grand Tree fix. Also: maintenance due (run
  .agent/workflows/maintain.md next session).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, installed only under `?e2e=1`) is the
  supported programmatic seam into a live game — extend it rather than writing DOM-selector
  automation. `flip-gate-test.mjs` is the reference two-browser harness.
- `openMatPick()` in client/src/setup/rules/trainer-execution.js is the pattern for any future
  "pick an in-play Pokémon" step — reuse it, don't re-add a modal picker for that case. It relies
  on `card.image` already being the live DOM node and on a document-level capture-phase click
  listener outrunning click-events.js/drag.js; a move to Shadow DOM would silently break it.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- `apply-view.js`, `authoritative-dispatch.js` and `card-stats.js` must stay Node-importable.
  Never statically import `click-events.js`, `drag.js`, `process-action.js`, or anything reaching
  `state.js` — inject instead. `rules-state.mjs` IS safe and statically imported.
- Cross-client parity may only be asserted over public zones (D14). Owner-secret zones
  (hand/prizes/deck) are redacted per recipient — compare counts instead, never `deck`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S75 2026-09-10 docs: design 004 drafted (Playwright playtest bot). No code changed.
- S74 2026-09-10 fix: energy cards not auto-discarding on KO + false "already attached this
  turn" on manual discard (legacy rules-mode).
- S73 2026-09-10 fix(bench,retreat): drag active→bench now runs the retreat flow.
