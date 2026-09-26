# Workflow: One-shot feature — one request or implementation doc, driven to a verified branch
Use when: the user asks you to one-shot a feature on this codebase ("one-shot X", "build all of it,
don't check in"), or hands over an implementation doc (repo path or pasted) to be done end to end.
Exit test — no product code yet? oneshot.md. User wants to approve the design first? feature.md.
Wants to be asked at each structural point of an existing plan? exec-plan.md. A small fix? patch.md.

"One shot" means one prompt, not one context window. The 1M window auto-compacts: never wrap up
early, never hand off mid-run. After a compaction, trust the disk (the design doc, slice commits,
the NEXTSTEPS ledger), not your memory of it. A mid-run question means the run failed.

## What the prompt authorizes — and what it doesn't
Invoking this workflow is the user's approval of the design gate and of every slice. They see the
work at the close, not before. It does NOT authorize:
- landing on `main` or pushing, unless the prompt says `Land: main` / `Land: main+push`;
- anything irreversible — data deletion, a migration without a revert path, force operations;
- work outside the request. Adjacent bugs become ISSUES lines, not edits;
- subagents beyond what `.agent/DELEGATION.md` picks, or any at all when the prompt says `Agents: none`.

## How the user invokes it (prompt template; every line after the first is optional)
```
One-shot: <the feature in a few lines>   — or —   One-shot <path/to/implementation-doc.md>
Must: <acceptance criteria, in the user's words>
Out of scope: <what to leave alone>
Land: branch (default) | main | main+push
Agents: auto (default — DELEGATION.md decides) | none
```
Name cards by exact name + set code; the run looks their text up (CLAUDE.md prime directive 7).

## Resume — a session told "resume one-shot <slug>", or finding its ledger, starts HERE
`git worktree list` → the `feature/<slug>` worktree → NEXTSTEPS ledger + the design's Work plan →
first unticked slice → confirm `pnpm test:changed` is green there → continue at §3.

## 0 · Persist the brief — before anything else
1. Worktree `.claude/worktrees/<slug>` on branch `feature/<slug>` from the latest `main`;
   `pnpm install --prefer-offline --frozen-lockfile`.
2. Spec file:
   - Chat request → `.agent/designs/<NNN>-<slug>.md` from TEMPLATE.md (NNN = next free number).
     Copy the prompt VERBATIM into § Problem.
   - Doc under `.agent/designs/` → it is the spec. Fill its missing TEMPLATE sections in place.
   - Doc elsewhere (repo root, pasted) → copy it verbatim into a new design's § Problem.
3. Add `## Acceptance`: `| # | Criterion (the brief's words) | Evidence |`. One row per testable
   promise in the brief. Criteria already in the brief or doc? Copy them verbatim as the rows.
4. Add `## Assumptions`: every gap you decide, tagged `(assumed)`, with a one-line why.
5. NEXTSTEPS.md ledger (on the branch): `oneshot <NNN>-<slug> · worktree <path> · slice 0/N`.

## 1 · Recon + the question budget — spent here or never
1. Read STATE watch-outs and PROJECT.md landmines. Grep (never load) DECISIONS and ISSUES for the
   area's scope tags. MAP → area doc → only the files you will change. Card text and rulings:
   `out/pkmn-*-cards.json`, then TCGdex; cite the row or id in the Acceptance evidence.
2. The request conflicts with a DECISIONS line or a PROJECT constraint, or contradicts itself, and a
   wrong guess is expensive → ONE batched AskUserQuestion now (recommended option first), with the
   Acceptance table attached. No answer → take the most reasonable reading and say so at the top.
3. Every other gap: decide, add an Assumptions row, continue.

## 2 · Design — Architect, self-approved
1. Fill every TEMPLATE section; "n/a — <why>" instead of deleting. Non-obvious choice: ≥2 options,
   one tradeoff line each, the pick and why. ≥4 independent criteria, or state + UI + cross-system
   coupling → pin the schema/naming contract first (feature.md §2 step 4).
2. Edge-case table: TEMPLATE rows plus this repo's usual ones — hidden info never reaches the
   opponent · reconnect/resync mid-feature · both seats see the right thing · card variants across
   eras. Netcode: verify with `SERVER_AUTHORITATIVE=1` only.
3. Scope line: all of the request is in scope. Cut something only when it is truly blocked; each cut
   = one ISSUES line + an ✗ row in Acceptance. Silent narrowing is the classic one-shot failure.
4. Work plan: slices each green on their own, ordered so behavior runs early (rules → server →
   client → FX). Every row is a pinned contract (TEMPLATE Work-plan columns): all judgment —
   options, rulings lookups, edge-case expectations — is spent here, so §3 only executes.
   Run the self-approval checklist → `Status: approved (self — one-shot)`.
5. Commit `oneshot <slug> slice 0: design`.

## 3 · Slice loop — Builder; the design is the spec
Per slice, in order:
1. Re-read the slice row and the design sections it touches. Always do this after a compaction.
2. Implement it completely: no TODO, no stub, no "for now".
3. Tests for the slice's edge rows; each must fail without the change (visual-only work exempt).
   `node --test <file>` → `pnpm test:changed` → `npx eslint --quiet <touched files>`.
4. Green → tick edge rows and the slice, update the NEXTSTEPS ledger, commit
   `oneshot <slug> slice k/N: <what now works>`. One commit per slice; never batch slices.
5. Red twice with nothing new learned → run debug.md on that failure. Still blocked → Stopping rule.
6. Design wrong: cosmetic → `## Deviations`. Structural, or the slice needs a choice its row
   doesn't pin → back to §2: decide it, re-pin the row, log it under Deviations, then build.
   No re-gate — unless the fix crosses the authorization list above.
Before each slice, run DELEGATION.md's table: a big pinned slice goes to `slice-builder` (low effort;
it returns instead of guessing at an unpinned choice — then you decide) (brief = design path +
slice row + files). You rerun the tests and read its diff against Acceptance before ticking.

## 4 · Verify against the brief, not the design
1. Full `pnpm test`. Engine, attack, ability, or trainer changes → `pnpm audit:oracle` plus the
   touched `audit:*` gate. Paste the summary lines.
2. Runnable flow → exercise it once end to end (e2e board, worktree server `PORT=4100 pnpm start`).
   CSS/FX/layout → do not self-grade; list exactly what the user should look at on localhost.
3. Walk `## Acceptance`: every row gets a test name or pasted output. Unmet → fix now if ≤1 slice of
   work, else an ISSUES line + an honest ✗. Every edge row ticked, or struck with a written why.

## 5 · Review — hostile fresh eyes
1. Read `git diff main...HEAD` in full: unhandled error paths · debug leftovers · drift from the
   design · pattern drift from neighbors · tests that could never fail · hidden-info leaks.
2. Engine, rules, or netcode diff → review.md by an agent that did not write it (DELEGATION.md row 12):
   run it now and fix findings. `Agents: none` → offer it at the close; the diff does not land until it's done.
3. Delete pass: remove what the feature made obsolete; bigger removals → ISSUES lines.

## 6 · Close
- `Land: branch` → the branch is ready. List the harness edits the landing commit will carry.
- `Land: main` → rebase on the latest `main`, full `pnpm test` again, then one landing commit with
  STATE rewritten, DECISIONS lines (lasting picks + `(assumed)` ones), ISSUES cuts, MAP if files
  moved, design `Status: shipped`, ledger → `.agent/archive/NEXTSTEPS-history.md`. Fast-forward
  `main`, sync the primary folder, remove the worktree. Push only on `main+push`.
- Final message (the task-close format): the Acceptance table with evidence · assumptions made ·
  cuts · the localhost checks for the user · the Done checklist.

## Stopping rule
Blocked by what only the user can give (credentials, a taste call with no reasonable default), or
the next step is irreversible and could go either way → do the prep, finish every slice that
doesn't depend on it, and lay out the choice at the close. Never stall on a mid-run question.

## Done — tick in your final message
- [ ] Brief verbatim on disk; every Acceptance row has evidence or an honest ✗ + why
- [ ] Every slice green and committed on its own; full `pnpm test` (+ audits if engine) green, shown
- [ ] Zero mid-run questions; every gap an `(assumed)` row; every cut an ISSUES line
- [ ] Hostile review done; independent review run or offered for engine/rules/netcode
- [ ] Landed only as the prompt allowed; STATE/DECISIONS/MAP/ledger handled for that landing mode
