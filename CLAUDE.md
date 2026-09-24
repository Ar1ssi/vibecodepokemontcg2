# Agent Operating Manual

You operate this repo through the harness in `.agent/`: persistent state and procedures that let
any session pick up work with minimal context. First session? `.agent/STATE.md` routes to bootstrap.

## Prime directives
1. The user outranks this file; this file outranks habit. Conflicts: Hard rules > active workflow > style.
2. Correct and complete beats fast. No stubs, placeholders, mock data outside tests, or silently
   narrowed scope. Can't finish honestly? Say exactly what's missing.
3. Smallest sufficient context: `.agent/MAP.md` → area doc → grep → read only implicated files.
   Never read directories wholesale. Lost after ~3 reads? Re-scope from MAP/area doc.
4. Never call an API/function you haven't seen defined this session. Verify behavior in source.
5. Code is truth. A wrong harness doc is a bug — fix it in passing (≤5 lines) or `flag:` it in the journal.
6. Chat carries outcomes; files carry detail: analysis → `.agent/scratch/`, designs → `.agent/designs/`,
   lasting choices → `.agent/DECISIONS.md`, deferred work → `.agent/ISSUES.md`.

## Reading budget — large files are grep-only
Never load these whole: `DECISIONS.md`, `ISSUES.md`, `journal/*`, `.agent/archive/*`.
- DECISIONS/ISSUES: `grep -n "\[<scope>\]"` for the target area, or grep the D/I number.
- Journal: `tail -n 20 .agent/journal/<YYYY-MM>.md`, or grep `S<n>`.
- Verbose/closed history: grep `.agent/archive/`.

## Session protocol
START: read `.agent/STATE.md` → classify the request (routing below) → open that one workflow and follow it.
DURING: after each completed slice/checkpoint, update STATE's `Active:` line (crash insurance).
END — whenever you changed anything:
- **Light END** (patch, issue-only, harness typo): append one journal line; edit only the STATE lines
  that changed (Session +1, Active, Recently shipped).
- **Full END** (feature, exec-plan, debug, refactor, maintain): rewrite STATE.md in full (template in it);
  journal entry; MAP.md if structure changed; one DECISIONS.md line per lasting choice.
- Journal entry: `S<n> <YYYY-MM-DD> <workflow>: outcome + key files` — ≤4 lines, ≤200 chars each,
  optional `  flag: <debt/risk>`. Detail goes in the design or scratch file, not the journal.
- Tick your workflow's Done checklist in your final message.
- New Session number a multiple of 10 → add "maintenance due" to STATE `Next:`.

## Routing
| Request looks like | Route |
|---|---|
| Whole project from one brief; no product code yet | `.agent/workflows/oneshot.md` |
| Work through a sectioned plan/brief already in the repo | `.agent/workflows/exec-plan.md` |
| New capability; or touches >2 files, or any interface/schema/dependency | `.agent/workflows/feature.md` |
| Small fix or tweak, cause known | `.agent/workflows/patch.md` |
| Defect, cause unknown | `.agent/workflows/debug.md` |
| Restructure with zero behavior change | `.agent/workflows/refactor.md` |
| Review a diff / PR | `.agent/workflows/review.md` |
| Harness upkeep / maintenance due | `.agent/workflows/maintain.md` |
| Debt audit — STATE says `audit due`, or user asks | `.agent/workflows/audit.md` (read-only: files findings, never fixes) |
| Bug/task to record for later | One line in `.agent/ISSUES.md` (format in its header) |
| Question or read-only analysis | Answer from MAP/PROJECT.md + targeted reads. Change nothing. Skip END. |

Each workflow states an exit test; on the fence, start with the lighter workflow.

## Delegation and model policy
- Delegate only work whose spec already lives in files: read-only exploration (returns conclusions and
  `path:line`, never file contents), `review.md` on a diff this session wrote, or one bounded increment
  of an approved design whose contract is pinned (files, signatures, data, test cases — no design judgment).
- Grunt work (boilerplate, tests, content entry) → `model: sonnet` or `haiku`. Code search →
  `caveman:cavecrew-investigator`; 1–2 file edits → `caveman:cavecrew-builder`; diff review → `caveman:cavecrew-reviewer`.
- Briefs are self-contained: goal, exact files/design sections, what to return. Subagents inherit no chat.
- Subagents never touch harness state (STATE/journal/DECISIONS/ISSUES/MAP/NEXTSTEPS). One writer at a time.
  A subagent's "done" is a claim: you run the tests yourself and review the diff against the spec's
  acceptance criteria, not taste.
- Architecture audit (high effort): only on explicit request, roughly once per phase.

## High-complexity specs ship in increments on ONE branch
~4+ independent acceptance criteria, or state + UI + cross-system coupling → don't build in one session.
Pin a schema/naming contract in the spec first; then one criterion-cluster per commit on
`feature/<spec>`, each green before the next, `/clear` between. Ledger (done / next) in NEXTSTEPS.md;
move it to `.agent/archive/NEXTSTEPS-history.md` when the spec ships.

## User sync and output
- Attended: before designing non-trivial work, post the restated goal + out-of-scope list and fold in
  corrections. Design/plan gates default to user approval; self-approval only when unattended.
- Scope/cost/approach-changing discovery → surface immediately with a recommendation. Taste calls
  (naming, UX, product behavior) go to the user when asking is cheap. Ask only what only the user can answer.
- Lead with the outcome. Progress notes ≤2 sentences; never narrate tool calls or echo file contents.
  ≤10 lines of code in chat; reference `path:line`.
- Task close (≤8 lines + Done checklist): Did / Changed / Verified (actual output) / Decided for you / Next.
- Report failures verbatim — never summarized optimism.

## Code standard
- Write for the reader: descriptive names, small functions, early returns, obvious control flow.
- Every boundary you touch handles empty/null, invalid input, dependency failure/timeout.
- Every behavior change ships with a test that fails without it.
- Verification is never a question. The PostToolUse hook (`scripts/hooks/post-edit-check.mjs`) lints
  each edited JS file and runs its own `__tests__/<name>.test.mjs`; fix what it reports. Iterate with
  `node --test <file>`; run the full `pnpm test` ONCE before commit, not after every edit.
- Comments only for constraints and whys. No dead or commented-out code. Match the file's local style.

## Hard rules
- Never: commit secrets · force-push · delete/overwrite content you haven't read · edit journal
  history or archives.
- New dependency ⇒ a DECISIONS.md line justifying it.
- Debug instrumentation is removed before done (keep a ledger while it exists).
- Data-touching changes (migrations, deletions) need a written revert path in their design.

## Project facts
- What: web 2-player Pokémon TCG simulator — board mats, deck builder, rules engine, Socket.IO sync, SQLite.
- Stack: Node.js ES modules, Express 4, Socket.IO 4, SQLite3, EJS, Playwright, `node --test`, ESLint 9 + Prettier.
- Commands: run `pnpm start` · full tests `pnpm test` (~3400, one known failure: card-inspector-model
  "retreat greys…") · one file `node --test <path>` · lint touched files `npx eslint --quiet <files>`
  (repo-wide `pnpm lint` is noisy with prettier/CRLF warnings) · engine gate `pnpm audit:oracle` (~2 min,
  after attack/ability engine changes) · build n/a.
- Entry points: `server/server.js`, `server/game/room.mjs`, `client/index.ejs`, `client/src/front-end.js`.
- Deeper facts: `.agent/PROJECT.md` (architecture, constraints, landmines).

## Worktrees and syncing main
- Unless told otherwise, work in a git worktree (one per task/branch) under `.claude/worktrees/`.
  Deps: `pnpm install --prefer-offline --frozen-lockfile` (~5 s from the shared pnpm store).
- After pushing to `main`, sync the primary folder: switch it to `main` and fast-forward before ending.
- Remove your worktree once its branch is merged (`git worktree remove <path>`; never `--force` on
  a tree with uncommitted work).
