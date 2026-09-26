# Delegation guide — when a subagent is cheaper than doing it inline
Read this before any Agent spawn, and at each slice boundary of feature/oneshot work. CLAUDE.md §
Delegation holds the rules; this file holds the cost model and the decision procedure.

## Permission — the user's standing request (2026-09-26)
The user asked that sessions decide delegation on their own, using this guide. That request is the
"user asks" the Agent tool's spawn gate requires, for the agents and cases in § Decision table.
- Covered: `slice-builder`, `fx-designer`, read-only search (`Explore`, `caveman:cavecrew-investigator`),
  and `review.md` reviews (`caveman:cavecrew-reviewer`, or a general agent running review.md).
- Not covered: `fable` models, `isolation: "remote"`, background agents left running past the turn,
  and any spawn the current prompt rules out (`Agents: none`, "don't use agents", "do it yourself").
- The session's own tool description still wins if it forbids spawning outright. Then offer the
  spawn in one line instead, quoting the row of the decision table that applies.

## Cost model — measured 2026-09-26 (`claude --agent <name> -p /context`)
| Context at start | Tokens | Of which tool schemas |
|---|---|---|
| Main session (all tools load: `ENABLE_TOOL_SEARCH=auto`, D167) | ~31.6k | 19.8k |
| `slice-builder` (tools allowlist) | ~16.9k | 9.0k |
| `fx-designer` (tools allowlist + Skill) | ~18.8k | 7.9k |
| Plugin/built-in agents without an allowlist | ~30k | ~20k |

What a spawn costs:
1. **Cold start** — the table above, paid once per spawn (cache write, then cheap on its own turns).
2. **Re-reads** — the agent has none of your context. Everything it needs (design sections, the
   files it edits, their tests) is read again. Estimate: sum of those file sizes ÷ 4 tokens.
3. **Brief + result** — your brief (~0.5–1.5k) and its report back into your context (~1–3k).

What a spawn saves:
1. **Your context stays small.** Everything the work reads, prints, and retries (file bodies, test
   output, lint, failed attempts) stays in the agent. Inline, it stays in your context and is
   re-sent on every later turn: at cache rates (~0.1× input) that is ≈ 0.1 × its size × the turns
   you have left. It also pulls the next compaction closer, and compaction costs quality.
2. **Cheaper thinking.** `slice-builder` runs at `low` effort; your session runs at `medium`/`high`.
   On a big slice, thinking and output tokens dominate the bill.
3. **Parallelism.** Independent agents launched in one message run at the same time.

Break-even, as one rule: **delegate when the work would add ≥ ~25k tokens to your context and
you still have work to do after it**, or when it is a pinned slice big enough that low-effort
thinking pays (≥ ~3 files or ≥ ~150 changed lines). Below that, the cold start and re-reads cost
more than they save — do it inline.

## Estimating "tokens the work adds to your context"
Count before deciding; it takes one `wc -c` call.
- Files it must read in full: bytes ÷ 4. Files you already read this session count 0 inline.
- Test and lint output: ~1–3k per run; expect 2–3 runs per slice, more for engine work.
- Edits: roughly 2× the changed lines × 12 tokens (the edit call plus the tool's echo).
- Images: each screenshot or frame sheet ~1.5k; a capture-and-compare FX loop easily runs 20–40k.

## Decision table — first matching row wins
| # | Situation | Do | Why |
|---|---|---|---|
| 1 | Task needs a choice nobody has made (design, rules reading, root cause unknown, taste call) | Inline at `high`, never delegate | Judgment needs your full context and the user's words |
| 2 | Fewer than ~3 reads and one or two small edits | Inline | Cold start alone (~17k) exceeds the work |
| 3 | 1–2 files, mechanical (rename, extract, typo sweep), and you already hold them | Inline | Re-reads would double the cost |
| 3b | 1–2 files, mechanical, and you have NOT read them, with a long session ahead | `caveman:cavecrew-builder` | Keeps the file bodies out of your context |
| 4 | Pinned slice (TEMPLATE Work-plan row passes its check), ≥ ~3 files or ≥ ~150 lines, and more work follows | `slice-builder` | Low effort + context kept lean |
| 5 | Pinned slice, small, or the LAST thing before close | Inline | Nothing later benefits from the lean context |
| 6 | Slice row not pinned (vague words, missing test cases, unsourced ruling) | Pin it first (row 1), then re-run this table | `slice-builder` would stop and return anyway |
| 7 | New or reworked FX scene, or CSS across several sheets with a capture-and-compare loop | `fx-designer` | Image-heavy iteration stays out of your context |
| 8 | Single CSS value, colour, timing number, or class-name tweak | Inline at `medium` | Knows no more than you do; cold start dominates |
| 9 | User is giving live visual feedback round by round | Inline; delegate only if a round needs a big rebuild, then paste their words verbatim | Their corrections are the spec |
| 10 | Locating code across many files, next search does not depend on the last result | `Explore` / `caveman:cavecrew-investigator` | Returns `path:line`, not file bodies |
| 11 | Research where each search depends on the previous finding | Inline | An agent can't be steered mid-search |
| 12 | Engine, rules, netcode, or hard-to-reverse diff before landing on `main` | Reviewer agent on the diff (review.md) | Work must not grade itself — required, not a cost call |

## Spawning — how
- **Brief = a file pointer, not a paraphrase:** design path, the slice row number, the files to
  touch, the tests to write, what to return. Never paste file bodies. The agent re-derives nothing
  that the design already pins.
- **Parallel only when disjoint:** agents that touch no common file launch in ONE message. Two
  writers on one file, or a slice that depends on another's output → sequential.
- **One writer per worktree at a time**, including you: don't edit while a builder runs in the
  same tree. Parallel builders on overlapping areas → `isolation: "worktree"`, and merge after.
- **Foreground vs background:** background when you have other useful work; foreground when your
  next step needs the result.
- **Model/effort come from the agent file.** Don't override `model:` on `slice-builder` or
  `fx-designer`. Plugin/general agents: `sonnet`/`haiku` for grunt work, inherit for judgment.

## After it returns — mandatory, never skipped
1. Its "done" is a claim. Run the tests yourself (`pnpm test:changed`; full `pnpm test` for engine work).
2. Read its diff against the slice row / brief — does it do what the contract says, nothing more?
3. It returned a gap (unpinned choice) → decide it in the design (row 1), re-pin the row, then
   either re-spawn once or finish inline, whichever the table now says. Never re-spawn a second
   time on the same failure — take it inline.
4. Its report goes into your commit message or the design, not re-summarized to the user in full.

## Worked examples
- **Design with 5 pinned slices, each 3–6 files:** slices 1–4 → `slice-builder`, one at a time
  (they share files); you verify and commit each. Slice 5 is the last → inline (row 5).
- **"Make the KO stars gold-er":** one colour constant → inline (row 8).
- **"Opponent's Stadium play should fly like the Trainer one":** new scene over designs 043/044,
  frames + video to check → design it inline at `high` (row 1), then `fx-designer` builds (row 7).
- **"Why does Guzma not switch the opponent?":** cause unknown → inline debug (row 1). The fix,
  once found, is small → inline (row 2).
- **Find every caller of `resolveAbilitySteps` across the engine:** one LSP `findReferences`
  first; only if LSP can't answer → investigator (row 10).
