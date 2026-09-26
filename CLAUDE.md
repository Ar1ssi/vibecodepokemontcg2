# Agent Operating Manual

You operate this repo through the harness in `.agent/`: persistent state and procedures that let
any session pick up work with minimal context. First session? `.agent/STATE.md` routes to bootstrap.

## Prime directives
1. The user outranks this file; this file outranks habit. Conflicts: Hard rules > active workflow > style.
2. Correct and complete beats fast. No stubs, placeholders, mock data outside tests, or silently
   narrowed scope. Can't finish honestly? Say exactly what's missing.
3. Smallest sufficient context: `.agent/MAP.md` → area doc → grep → read only implicated files.
   Never read directories wholesale. Lost after ~3 reads? Re-scope from MAP/area doc.
   Tracing a symbol's definition or references: use LSP (`goToDefinition`, `findReferences`, `hover`), not Grep.
   LSP gives exact results; Grep gives text matches. Grep/Glob for discovery (files, patterns); LSP for
   understanding (definitions, references, types). After locating a file, navigate it with LSP rather than
   reading the whole file. LSP is a deferred tool: load it once per session with ToolSearch
   `select:LSP` before the first call. Grep is the fallback when LSP is unavailable.
4. Never call an API/function you haven't seen defined this session. Verify behavior in source.
5. Code is truth. A wrong harness doc is a bug — fix it in passing (≤5 lines) or add a `flag:` line to your commit message.
6. Chat carries outcomes; files carry detail: analysis → `.agent/scratch/`, designs → `.agent/designs/`,
   lasting choices → `.agent/DECISIONS.md`, deferred work → `.agent/ISSUES.md`.
7. Card text and rulings are looked up, never recalled — however familiar the card. Source order: the
   corpora in `out/pkmn-*-cards.json`, then TCGdex. Name the source (corpus row or TCGdex id) in the test or commit.

## Reading budget — large files are grep-only
Never load these whole: `DECISIONS.md`, `ISSUES.md`, `journal/*` (frozen, pre-S313), `.agent/archive/*`.
- DECISIONS/ISSUES: `grep -n "\[<scope>\]"` for the target area, or grep the D/I number.
- Journal: `git log -20 main --format='%h %ad %s%n%b' --date=short`; flags: `git log --grep='flag:'`.
  Pre-S313 history: grep `.agent/journal/`.
- Verbose/closed history: grep `.agent/archive/`.

## Session protocol
START: read `.agent/STATE.md` → classify the request (routing below) → open that one workflow and follow it.
DURING: work on your own branch in a worktree. Crash insurance = WIP commits on that branch, not STATE edits.
  Context auto-compacts (1M window): never wrap up early or hand off mid-task to save context.
END — whenever you changed anything:
- **The journal is the commit message.** Subject `<workflow>: <outcome>`; body ≤4 lines of why,
  plus optional `flag: <debt/risk>` lines. Never append to `.agent/journal/` (frozen history).
  Wherever a workflow says "journal", it means this commit message.
- **Shared harness files** (STATE, DECISIONS, ISSUES, MAP) change only in the commit that lands on
  `main`, after rebasing/merging on the latest `main` — never on the primary folder mid-task.
- **Light END** (default — patch, debug, refactor, small feature, issue-only, harness typo): commit
  message only; edit STATE lines only if Focus/Active/Next/Blocked actually changed.
- **Full END** (only when priorities/plan changed — exec-plan, feature.md, oneshot-feature, maintain): rewrite
  STATE.md in full (template in it).
- Either END: MAP.md only if files moved/were added; DECISIONS.md only for a genuinely lasting choice.
- Tick your workflow's Done checklist in your final message.
- Maintenance due when ≥30 commits landed on `main` since the last `maintain:` commit
  (`git rev-list --count $(git log -1 --format=%h --grep='^maintain' main)..main`).

## Routing
| Request looks like | Route |
|---|---|
| Whole project from one brief; no product code yet | `.agent/workflows/oneshot.md` |
| "One-shot" a feature or an implementation doc end to end, no check-ins | `.agent/workflows/oneshot-feature.md` |
| Work through a sectioned plan/brief already in the repo | `.agent/workflows/exec-plan.md` |
| New interface/schema/dependency, netcode or engine-rule change, or work spanning >1 session | `.agent/workflows/feature.md` |
| Fix, tweak, or small feature (any file count) with none of the above | `.agent/workflows/patch.md` |
| Defect, cause unknown | `.agent/workflows/debug.md` |
| Restructure with zero behavior change | `.agent/workflows/refactor.md` |
| Review a diff / PR | `.agent/workflows/review.md` |
| Harness upkeep / maintenance due | `.agent/workflows/maintain.md` |
| Debt audit — STATE says `audit due`, or user asks | `.agent/workflows/audit.md` (read-only: files findings, never fixes) |
| Bug/task to record for later | One line in `.agent/ISSUES.md` (format in its header) |
| Question or read-only analysis | Answer from MAP/PROJECT.md + targeted reads. Change nothing. Skip END. |

Each workflow states an exit test; on the fence, start with the lighter workflow.

## Delegation and model policy
- Spawn gate: the session's Agent tool description outranks this section. When it says spawn only on
  the user's request, work inline and *offer* the delegation below (one line); the user's yes is the request.
- Delegate only work whose spec already lives in files: read-only exploration (returns conclusions and
  `path:line`, never file contents), `review.md` on a diff this session wrote, or one bounded increment
  of an approved design whose contract is pinned (files, signatures, data, test cases — no design judgment).
  Research whose next search depends on the last finding stays inline.
- Work must not grade itself: engine, rules, netcode, and hard-to-reverse changes get `review.md` from
  an agent that didn't write the diff before landing on `main` (gated? offer it in the task close).
- Models (`model:` on Agent; omitted = inherit the session model, Opus 5.5): judgment work (design,
  review, debug) inherits · grunt work (boilerplate, tests, content entry) → `sonnet` or `haiku` ·
  `fable` (Fable 5.1, Mythos tier: strongest, priciest) only on explicit request — architecture audit,
  blind option generation for a high-stakes design.
- Code search → `caveman:cavecrew-investigator`; 1–2 file edits → `caveman:cavecrew-builder`; diff review
  → `caveman:cavecrew-reviewer`. Independent agents launch in one message so they run concurrently.
- Briefs are self-contained: goal, exact files/design sections, what to return. Subagents inherit no chat.
- Subagents never touch harness state (STATE/DECISIONS/ISSUES/MAP/NEXTSTEPS). One writer at a time.
  A subagent's "done" is a claim: you run the tests yourself and review the diff against the spec's
  acceptance criteria, not taste.
- Architecture audit (high effort): only on explicit request, roughly once per phase.

## High-complexity specs ship in increments on ONE branch
~4+ independent acceptance criteria, or state + UI + cross-system coupling → pin a schema/naming
contract in the spec first; then one criterion-cluster per commit on `feature/<spec>`, each green
before the next. One session carries the whole spec (context auto-compacts); `/clear` only if quality
degrades. Ledger (done / next) in NEXTSTEPS.md is the handoff if a session ends mid-spec;
move it to `.agent/archive/NEXTSTEPS-history.md` when the spec ships.

## User sync and output
- First line of every task: one sentence on what you're about to do, then act in the same reply.
- Ask-first test = cost of a wrong guess. Clear, or cheap to redo → start now; ask any question
  alongside the first results. Expensive to redo (many files, batch ops, hard to reverse) AND
  ambiguous or self-contradictory → AskUserQuestion before building (recommended option first).
- Small work (patch route): the ≤3-line plan is that first line; proceed without waiting.
- Approval gate (wait for user) only for schema, netcode, or engine-rule changes, or feature.md work.
  Before those, post restated goal + out-of-scope list and fold in corrections.
- Unattended (scheduled run, user said they'd check back, a question went unanswered): take the most
  reasonable reading, state it at the top, carry on — self-approve gates. A decision that can't be
  undone and could go either way: do the prep, lay out the choice, stop.
- Surface immediately, with a recommendation: scope/cost/approach-changing discoveries, and limits
  that change what the user gets. Taste calls (naming, UX, product behavior) go to the user when
  asking is cheap. Ask only what only the user can answer.
- Lead with the outcome. Between tool calls, near-silence: progress notes ≤2 sentences, only when
  something changed or the app asks for a status; never narrate tool calls or echo file contents. ≤10 lines of code in chat; reference `path:line`.
- Task close (≤8 lines + Done checklist): Changed / Verified (actual output) / Decided for you / Next
  (one real next step, or none). No recap of the steps taken.
- Report failures verbatim — never summarized optimism.

## Code standard
- Write for the reader: descriptive names, small functions, early returns, obvious control flow.
- Every boundary you touch handles empty/null, invalid input, dependency failure/timeout.
- Engine, rules, netcode, and state-logic changes ship with a test that fails without them.
  Visual-only changes (CSS, mat FX, animation, layout) are exempt — the user checks those on localhost.
- Verification is never a question. The PostToolUse hook (`scripts/hooks/post-edit-check.mjs`) lints
  each edited JS file and runs its own `__tests__/<name>.test.mjs`; fix what it reports. Iterate with
  `node --test <file>`. Before commit: `pnpm test:changed` for patch work; full `pnpm test` before
  landing on `main` and after any engine, rules or netcode change.
- Comments only for constraints and whys. No dead or commented-out code. Match the file's local style.

## Hard rules
- Never: commit secrets · force-push · delete/overwrite content you haven't read · edit the frozen
  `.agent/journal/` or archives.
- New dependency ⇒ a DECISIONS.md line justifying it.
- Debug instrumentation is removed before done (keep a ledger while it exists).
- Data-touching changes (migrations, deletions) need a written revert path in their design.

## Project facts
- What: web 2-player Pokémon TCG simulator — board mats, deck builder, rules engine, Socket.IO sync, SQLite.
- Stack: Node.js ES modules, Express 4, Socket.IO 4, SQLite3, EJS, Playwright, `node --test`, ESLint 9 + Prettier.
- Commands: run `pnpm start` · full tests `pnpm test` (~4260, all green; live TCGdex tests
  opt-in via `pnpm test:live`) · changed-only `pnpm test:changed` (tests for files this branch touched) · one file `node --test <path>` · lint touched files `npx eslint --quiet <files>`
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
