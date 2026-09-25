# S300 handoff — design 036 slice 16 shipped (`claude/rules-engine-issues-e79707`)

Branch is main + 19 commits, **not pushed** (user chose to keep it local, S300). HEAD `279fa3b1`
before this handoff commit. Suite 4041/4042 — only the known `card-inspector-model` "retreat
greys…" failure. `pnpm audit:attacks` PASSED. Revert = revert the branch (or the S300 commits).

## Shipped this session (S300)

| Commit | What landed |
|---|---|
| fdc9cccc | `pnpm audit:attacks` gate + baseline (design 036 slice 16) |
| 4c9ddcc0 | Harness close: I136, design 036 complete, NEXTSTEPS archived, STATE/journal/DECISIONS |
| 279fa3b1 | Review fixes: per-row engine errors fail the gate, dead harness knobs dropped, seeds/corpus meta checked, +5 tests |

- New: `scripts/audit-attack-behaviour.mjs` (`--update-baseline`, `--rows` →
  `out/attack-behaviour-rows.json`, ~2 min), `scripts/lib/attack-behaviour.mjs` (verdict +
  per-row ratchet), `scripts/lib/attack-harness.mjs` (promoted S279 rich-board harness),
  `scripts/lib/attack-behaviour.test.mjs` (17 tests), `scripts/attack-behaviour-baseline.json`
  (3,528 unique effect attacks: **3,247 ok / 152 partial / 129 ran-no-effect / 0 engine-error**).
- `package.json` `audit:attacks`; docs guide §7/§8 now lists four behaviour gates; primary scratch
  `attack-full-audit/report.md` annotated; I136 closed; NEXTSTEPS ledger archived; D149 recorded.
- Hostile subagent review (7 findings): 6 fixed, 1 kept by design — a baseline key that vanishes
  (text edit/re-scrape) warns instead of failing, matching the trainer gate's "new cards report"
  contract; the replacement row is reported with its verdict.

## Decisions made

- **Gate scope = committed `out/pkmn-pokemon-cards.json`** (what `audit:oracle/abilities/trainers`
  use): 3,528 unique effect attacks. The S279 full `type:pokemon` sweep (10,966 unique) stays
  scratch-only (report §F); I166–I168 now use the gate for regressions and the report for scope.
- **Per-row baseline, not per-family shares**: key = normalized attack name + text hash →
  `{name, attack, family, verdict[, errors]}`. New rows warn, vanished rows warn, a verdict drop
  fails by card name, and a new engine error fails even when another seed kept the verdict up.
- **behave.mjs is not duplicated into the gate**: its targeted scenarios already live as the
  slice-1–15 unit tests (`attack-condition-gate`, `attack-prize-on-ko`, `attack-heal`, …).
- **No push** (user), **slice 16 on this branch** (user), so the baseline includes the S297 engine.
- Session/id notes: main was at S299 (its own S297 maintain, D146–148, I177–180); this branch's
  lines do not contain them. Next D here = D150. Merge will need the usual union/renumber pass.

## Next sessions (priority order)

1. **Land the branch**: push + merge/PR. 19 commits = S297 I155+ batch + S300 slice 16. Merge
   reconciliation: journal/DECISIONS/ISSUES union; main has S298/S299, D146–148, I177–180.
2. **Design 036 residuals**, now ratcheted by `pnpm audit:attacks --rows`: I168 copy attacks,
   I167 attack markers, I166 attack effects — one session each.
3. **I162** ability-audit backlog (`pnpm audit:abilities --rows`).
4. **I153** per-viewer event filtering (needs a contract first), then I137, I121, I126 (partial),
   I127, I44, I60.
5. **User actions**: visual check of typed Tera entry/skin + Mega vortex; approve designs 028
   (I85) / 029 (I86); I87 needs the repro description.
6. **Maintenance due (S300)**: ISSUES Open/Closed over caps; triage I180 (legacy-overlay zones).

## Verification / landmines

- `pnpm test` (~50 s, 4041 tests) · `node --test scripts/lib/attack-behaviour.test.mjs` ·
  `pnpm audit:attacks` (~2 min) · lint touched files `npx eslint --quiet <files>`.
- After an engine fix moves attack rows: `pnpm audit:attacks --update-baseline` + commit the
  baseline; a legitimate verdict drop (wrong effect removed before the right one exists) must be
  explained in the commit.
- Corpus re-scrape: keys are name+text hashes, so expect new/vanished warnings (report-only) and
  refresh the baseline in the same commit as the corpus change.
- `applyCommand` clones state — read results via the returned `state`; attacking ends the turn.
- Bash heredoc eats `\` and mangles é → use Edit/Write. Primary working copy is CRLF.
