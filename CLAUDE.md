# Agent Operating Manual

You operate this repo through the harness in `.agent/` — persistent state and procedures that let
any session, on any model, pick up work with minimal context and leave the repo better than found.
First session on this repo? `.agent/STATE.md` will route you to bootstrap.

## Prime directives
1. The user outranks this file; this file outranks habit. When rules conflict:
   Hard rules > active workflow > style sections.
2. Correct and complete beats fast. No stubs, no placeholder code, no mock data outside tests,
   no silently narrowed scope. If you can't finish honestly, say exactly what's missing.
3. Smallest sufficient context: `.agent/MAP.md` → area doc if one exists → grep → read only
   implicated files. Never read directories wholesale. Lost after ~3 file reads? Re-scope from
   MAP or the area doc instead of reading more code.
4. Never call an API/function you haven't seen defined this session — read its definition first.
   Unsure how something behaves? Verify in source, not from memory.
5. Code is truth; docs serve code. A wrong harness doc is a bug — fix it in passing (≤5 lines)
   or leave a `flag:` in the journal.
6. Chat carries outcomes; files carry detail. Long analysis → `.agent/scratch/`,
   designs → `.agent/designs/`, lasting choices → `.agent/DECISIONS.md`,
   deferred bugs/work → `.agent/ISSUES.md`.

## Session protocol
START: read `.agent/STATE.md` → classify the request (routing below) → open that one workflow
file and follow it. Read only what the workflow tells you to read.
DURING: after each completed slice/checkpoint, update the `Active:` line in STATE.md (crash insurance).
END — mandatory whenever you changed anything:
1. Rewrite `.agent/STATE.md` in full (template is inside it; Session +1).
2. Append to `.agent/journal/<YYYY-MM>.md`: `S<n> <YYYY-MM-DD> <workflow>: outcome + key files`
   (≤4 lines; optionally `  flag: <debt/risk noticed>`).
3. Structure changed → update MAP.md. Lasting choice made → one line in DECISIONS.md.
4. Tick your workflow's Done checklist in your final message.
If the new Session number is a multiple of 10, add "maintenance due" to STATE `Next:`
(run `.agent/workflows/maintain.md` now if the session has room).

## Routing
| Request looks like | Route |
|---|---|
| Whole project from one brief; no product code yet | `.agent/workflows/oneshot.md` |
| New capability; or touches >2 files, or any interface/schema/dependency | `.agent/workflows/feature.md` |
| Small fix or tweak, cause known | `.agent/workflows/patch.md` |
| Defect, cause unknown | `.agent/workflows/debug.md` |
| Restructure with zero behavior change | `.agent/workflows/refactor.md` |
| Review a diff / PR | `.agent/workflows/review.md` |
| Harness upkeep / maintenance due | `.agent/workflows/maintain.md` |
| Debt/overengineering audit — STATE says `audit due`, or user asks | `.agent/workflows/audit.md` (read-only: files findings, never fixes) |
| Bug/task to record for later, not fix now | One line in `.agent/ISSUES.md` (format in its header). |
| Question or read-only analysis | Answer from MAP/PROJECT.md + targeted reads. Change nothing. Skip session END. |

Each workflow states an exit test; when on the fence, start with the lighter workflow.

## Delegation  <!-- only if your tool can spawn subagents; otherwise ignore this section -->
Subagents keep this context small on large tasks. Delegate only work whose spec already lives in
files: read-only exploration (returns conclusions, never file contents), `review.md` on a diff
this session wrote, or one work-plan slice of an approved design.
- Briefs are self-contained: goal, exact files/design sections to read, what to return. A
  subagent inherits no chat context — if it would need to ask questions, don't delegate yet.
- Subagents never touch harness state (STATE/journal/DECISIONS/ISSUES/MAP, session END); they
  change only code, tests, and scratch, then report. You verify (run the tests yourself) and
  you record — a subagent's "done" is a claim, not evidence.
- Sequential, one at a time: the harness assumes a single writer.

## User sync — keep the user in the decision loop
Building the wrong thing correctly is the costliest failure. When the user can respond (attended):
- Before designing non-trivial work, post the restated goal + out-of-scope list and fold in the
  user's corrections first. Design/plan gates default to user approval — self-approval is the
  unattended fallback, never a shortcut past a reachable user.
- A discovery that changes scope, cost, or approach → surface when found, with a recommendation.
  Taste-heavy calls (naming, UX, product behavior) go to the user when asking is cheap.
- Each checkpoint: 1–2 line note (done / next / surprises) so the user can redirect early.
- Task close lists every judgment call made on the user's behalf ("Decided for you: …") for veto.
Unattended (oneshot, CI): question budget spent up front; the `(assumed)` ledger is the audit trail.

## Output contract
- Lead with the outcome. Progress notes ≤2 sentences; never narrate tool calls or echo file contents.
- ≤10 lines of code in chat unless asked; reference `path:line` instead.
- Task close: Did / Changed (files) / Verified (how, with actual output) / Decided for you / Next —
  ≤8 lines, plus the Done checklist.
- Ask the user only what only the user can answer; otherwise decide, record it, proceed — and
  surface it in the task-close "Decided for you" list (§ User sync).
- Report failures verbatim (real test output, real errors) — never summarized optimism.

## Code standard
- Write for the reader: descriptive names, small functions, early returns, obvious control flow.
  Spend complexity on the design (edge cases, failure modes) — never on clever code.
- Every boundary you touch handles: empty/null, invalid input, dependency failure/timeout.
  "Happy path only" is incomplete work.
- Every behavior change ships with a test that fails without it.
- Comments only for constraints and whys the code can't express. No dead or commented-out code.
- Match the file's existing local style when it conflicts with this section.

## Hard rules
- Never: commit secrets · force-push · delete/overwrite content you haven't read · edit journal
  history or archives.
- New dependency ⇒ a DECISIONS.md line justifying it.
- Debug instrumentation is removed before done (keep a ledger while it exists).
- Data-touching changes (migrations, deletions) need a written revert path in their design.

## Project facts  <!-- filled by bootstrap; keep ≤20 lines -->
- What: Web-based 2-player Pokémon TCG simulator with interactive board mats, deck builder, rules mode engine, multiplayer Socket.IO sync, and SQLite backend.
- Stack: Node.js (ES modules), Express 4, Socket.IO 4, SQLite3, EJS, Playwright, native node --test runner, ESLint 9 + Prettier.
- Commands — run: `pnpm start` (or `node server/server.js`) · test: `pnpm test` (797 tests) · lint: `pnpm lint` (failing: CRLF/no-undef issues) · build: n/a
- Entry points: `server/server.js` (backend server & Socket.IO), `client/index.ejs` (frontend UI markup), `client/src/front-end.js` (frontend JS boot script)
- Deeper facts: `.agent/PROJECT.md` (architecture, constraints, glossary, landmines)

## Token / model policy

- Implementation grunt work (boilerplate, test writing, content entry): delegate to subagents on \model: sonnet\ or `haiku` (.claude/agents/). Delegate an increment, never a whole feature — the unit must be bounded with its contract already pinned (rule 8), so the brief can be exhaustive (files, signatures, data, test cases) and leave no design judgment. If the integration point isn't pinned yet, scout it inline first, then delegate the wiring. Always verify independently — don't trust the agent's self-report.``

- Orchestrator reviews diffs against the spec's acceptance criteria — not against taste.

- Hooks run linter + tests after edits; do not spend orchestrator review on anything the hooks can catch.

- Periodic architecture audit (ultracode/x-high effort): only on explicit request, roughly once per phase.

**High-complexity specs ship in increments on ONE branch.** When a spec has ~4+ independent acceptance criteria, or spans state + UI + cross-system coupling, do NOT build it in one session. First pin a *schema/naming contract* in the spec (data field names, sub-object API, signals — the stable surface other specs reuse). Then build one criterion-cluster per commit on a single \feature/<spec>\ branch, each green before the next, `/clear` between. Keep the increment ledger (what's done / what's next) in NEXTSTEPS.md so any session can resume.``

## Worktrees & syncing main
- Unless the user explicitly instructs otherwise, do all work in a git worktree (not directly in
  the primary checkout) — create one per task/branch so the main working copy stays clean and
  multiple sessions can run without colliding.
- After pushing to `main` (from a worktree or otherwise), always sync the primary project folder
  so it matches the remote: switch it to `main` and pull/fast-forward before ending the session.
  Never leave the primary folder stale relative to what was just pushed.