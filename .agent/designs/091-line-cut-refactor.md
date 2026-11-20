# 091: Line-cut refactor (PufferLib guide)
Status: shipped (first pass) · remaining work in § What is left
Date: 2026-11-20 · PR Ar1ssi/vibecodepokemontcg2#258

## Problem
The user asked to refactor the app with the PufferLib refactoring guide
(https://github.com/PufferAI/PufferLib/blob/5.0/SKILL_ISSUES.md). Their stated aim: "cut lines",
with behaviour unchanged. The guide's steps: inline every function used once and tighten the call
site, drop defensive checks, merge and invert nested conditionals, co-optimize shared functions
with their callers, then apply its style rules.

## Decisions (user, 2026-11-20; D259)
- Scope: client, server and `shared/` (engine included). Tests, `scripts/`, vendored and
  `*.generated.*` files are not touched.
- Checks at trust boundaries stay (socket/HTTP input, DB, network, files, outside JSON, user text).
  Only a check the same function already made redundant may go.
- A function a test imports stays exported. No test file is edited.
- No reformat. The guide's 4-space / 100-column style was measured with Prettier before applying:
  it ADDS ~79,000 lines repo-wide (~37,000 in app source), because 88% of app files are
  hand-wrapped, not Prettier-formatted. That is the opposite of the aim, so formatting stays.
- Only synchronous code is inlined. Inlining an awaited `async` function removes promise hops,
  and in `apply-view.js` that let a socket emit run before the picker's own cleanup. Every async
  inline the hand pass made was reverted after review.

## What shipped
App source (client/server/shared, no tests, no generated files): 245,210 → 241,967 lines
(−3,243, −1.3%), 857 → 853 files.
1. **Codemod pass** (`tools/refactor/inline-single-use.mjs`): 685 functions inlined in 255 files,
   ~1,900 lines. It inlines a function only when it can prove the move safe: one call site, same
   file, not exported, no reference from tests or scripts, every free name resolves to the same
   declaration at the call site, no change to evaluation order or count, no `async`, `this`,
   `arguments` or `var`. Doc comments move to the call site (`@param`/`@returns` lines dropped).
   Everything else is left alone and listed with a reason in its report.
2. **Hand pass** (17 Sonnet subagents, one disjoint area each, own worktree): about 190 more inlines,
   about 20 groups of copy-pasted helpers reduced to one shared export each, 34 unreferenced
   declarations removed, four one-function wrapper files folded into their caller; ~1,340 lines.
3. **Review** (6 independent reviewers over every hunk of the hand pass): no behaviour-changing
   difference found; findings were async timing (all reverted), one deleted export that
   `.claude/skills/fx-preview/rec/rec-move.mjs` imports (`announceStrike`, restored), and stale
   comments (fixed).

## Verification (final tree)
Full unit suite, `pnpm audit:oracle`, `eslint --quiet` on changed files, client bundle build, and
12 `scripts/e2e` browser scripts run against this branch and an untouched checkout side by side.
Results are in the PR description. No manual play-through was done.

## What we learned (read before continuing)
- The guide yields little here: what the codemod could not inline mostly does not get shorter when
  inlined by hand (early returns need a flag or nesting; long bodies only move). Subagents skipped
  ~1,000 of ~1,400 items for that reason.
- A TypeScript-language-service "zero references" scan is NOT proof a declaration is dead: 24 of
  57 hits were used by `client/` through dynamic `import()` or a namespace object, or by
  `scripts/e2e` and `.claude/skills` through string paths. Always `git grep -w` the name across
  the whole repo, `.claude/` included, before deleting an export.
- Source comments and harness docs name helper functions as landmarks. After inlining, grep the
  removed names and fix the mentions (this pass fixed about 20).
- Under machine load `shared/log/__tests__/bench.test.mjs` and `server/log/__tests__/disk-sink`
  fail on timing; both pass on a quiet machine.

## What is left (each is optional; none is started)
| # | Work | Expected gain | Notes |
|---|---|---|---|
| 1 | 13 duplicate-helper groups that span two areas | ~150 lines | e.g. `gate` ×4 (keybinds + three context-menu files, not yet compared), `withSlot` in two server proxies, `browserStorage`. Check for import cycles. |
| 2 | 186 single-use functions whose one call is in another area | small | Mostly entry-point wrappers (`initialize*`); moving them changes ES-module load order. Low value. |
| 3 | ~1,000 single-use functions with early returns or long bodies | ~0 | Judged not worth it; see first lesson. |
| 4 | Code only tests reach | unknown | Exports whose only importers are tests are product-dead, but removing them means deleting tests: a user decision. |
| 5 | Client-side rules execution (`client/src/setup/rules`, `chat-buttons`: ~17k lines) | large if any of it is unreachable | The server runs the rules (design 087). Whether parts of the client path are now dead needs an audit and a product decision; this is where a real cut would come from. |

To rerun the codemod after other changes: `node tools/refactor/inline-single-use.mjs "$PWD"
/tmp/report.json --dry` (drop `--dry` to apply; add path prefixes to limit it), then eslint the
changed files, `pnpm test`, `pnpm audit:oracle`.
