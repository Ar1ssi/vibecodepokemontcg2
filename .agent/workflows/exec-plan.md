# Workflow: Exec-plan — drive a written plan to green, one section at a time.
For: a sectioned brief that already lives in the repo (`implementation_plan.md` at the root, or a spec in
`.agent/designs/`) and the user asks to work through it. Exit test — no plan file exists yet, or the ask is
a single capability? That's feature.md. Plan is empty/finished? Nothing to run.

Verification is the loop's spine, not its epilogue: a section is not done until tests and lint are green
for it. (The user may waive a run — their call — then STATE `Active:` and the journal must say UNVERIFIED.)

## 0 · Handshake
1. Read the plan file end to end, once. List its sections in order and mark which are already done —
   from the plan's own status notes, the branch, and `git log`. Never redo, silently skip, or narrow one.
2. Where the work goes: a worktree per plan (CLAUDE.md § Worktrees). `node_modules` needs `pnpm install`
   per worktree; a plan resumed by another session resumes in the SAME worktree — say which one in STATE.
3. Post the ledger: sections you will do, in order, and which you read as already done. Order or
   remainder ambiguous → ask before editing anything.

## 1 · One section at a time — never batch
Per section, in plan order:
1. Implement it completely. No TODO, no stub, no "phase 2 will cover it".
2. **Test** — narrowest covering test first, then `pnpm test`. A new test file does nothing until it is
   added to package.json's explicit file list; add it in the same pass. Test-only change? Still run.
3. **Lint** — `pnpm lint` is red repo-wide on pre-existing CRLF/no-undef, so the bar is *no new
   violations*: `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <changed files>`.
4. Red → read the failure, fix, re-run. Loop until green. Paste the real output when reporting; never
   summarize a failure into optimism. If two consecutive runs teach you nothing new, stop and name what
   blocks you instead of burning the session on a loop.
5. Green → annotate the plan in place (✅ + one line on what shipped, where, and any deviation from the
   plan's wording), tick the design's edge-case rows if the plan is a design doc, update STATE `Active:`.
   Then, and only then, the next section.

## 2 · When a section is bigger than it looked
It touches an interface/schema, spans >4 files, or collides with a DECISIONS.md line or PROJECT.md
constraint → STOP before editing and ask the user (their standing choice, S159). Write the answer next to
that section in the plan so no later session re-asks. Genuinely out-of-scope discoveries become one
ISSUES.md line each, not unplanned edits.

## 3 · Close
1. Re-run `pnpm test` and the lint bar from a clean shell. Show the summary lines, verbatim.
2. One commit for the whole plan (the user's standing choice): stage only the plan's paths, message
   `exec-plan <slug>: <what the plan delivered>`, body = the journal (plan file, sections shipped, what
   stayed unverified). Push / open a PR only when asked.
3. DECISIONS.md per lasting
   choice the plan forced, MAP.md if structure changed, STATE.md rewritten.

## Done — copy into your final message and tick honestly
- [ ] Sections executed in plan order; none skipped, narrowed, or silently merged
- [ ] Tests + lint green per section, output pasted; new test files registered in package.json
- [ ] Plan file annotated; every deviation from its wording visible there
- [ ] Structural calls put to the user, not assumed
- [ ] One commit at the end (if permitted); nothing pushed without asking
- [ ] Journal + STATE written; DECISIONS/MAP updated if the plan changed them
