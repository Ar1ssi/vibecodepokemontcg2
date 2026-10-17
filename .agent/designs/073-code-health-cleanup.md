# 073: Code-health cleanup — less code, same behaviour
Status: draft
Date: 2026-10-15 · Session: audit (read-only; nothing but ISSUES/STATE/MAP and this file changed)

## Problem
The user asked whether the codebase can be made smaller and easier to maintain. A full read-only
audit on 2026-09-28 (`.agent/scratch/fable-audit-2026-09-28.md`) already answered yes with ten
concrete actions; 17 days and 58 commits later, zero of them have landed and none were filed in
ISSUES, so each session re-pays the same costs. This design re-measures, records what is still
true, and pins the cleanup as batches that `refactor.md` / `patch.md` sessions can execute.

## Current state — measured 2026-10-15 on `claude/affectionate-ride-gpxinn` (= main + 0)
| Metric | Value |
|---|---|
| Tracked files / bytes / pack | 10,765 files · 356.6 MB · 302 MB pack (1,496 commits) |
| Of which assets (`client/src/assets`) | 263 MB — coins 83, playmats 59, deckbox 40, build-battle 33, sleeves 18 (game content, keep) |
| Of which junk (§A) | ~90 MB: `tools/` 44.7 MB, `out/*.webm` 16 MB, `playmats/custom/*.png` 30 MB, logs/baks/lockfile |
| Product JS | 251,504 lines (25,953 generated); CSS 20,771 lines |
| Tests | 466 files · 120,849 lines · 6,722 `test()` calls |
| Ten largest product files | 51,114 lines = 23 % of all non-generated product code |
| Verbatim duplication (14-line windows, incl. giants) | 976 lines in 49 regions over 172 k lines = 0.6 % |
| jscpd (120-token clones, files ≤100 KB) | 8 clones, 0.2 % |
| Exports with zero references | 439 of 3,459 (210 are mat-fx move specs aggregated in their own file; ~230 real), 544 more used only by tests |
| ESLint `--quiet`, whole repo | 28 errors: 20 `no-empty`, 3 `no-undef` (`dmg`, `chat-buttons.js:2168,2176,2181`), 4 in `tools/package`, 2 in `.agent/designs/refs` |
| Remote branches | 279 (claude 109, feature 68, cursor 64, fix 29) |
| `rules-extended.test.mjs` alone | 428 tests · 23.9 s wall · 1.4 s CPU (live TCGdex retry backoff, prior finding C1) |
| Harness | 453 commits since `maintain:` 3cc1593 (trigger 30) · DECISIONS 199 lines/47 KB (cap 90/20) · ISSUES 69 open (cap 40) · designs root 91, 46 shipped · MAP 131 (cap 120) |

Hotspots, commits in the last two months (tests, `.agent/`, `out/`, generated excluded):
`reduce.mjs` 186 · `index.css` 139 · `rules-bridge.js` 112 · `package.json` 111 · `chat-buttons.js` 92 ·
`NEXTSTEPS.md` 89 · `rules/attack-steps.mjs` 79 · `effects/attack-steps.mjs` 73 · `trainer-steps.mjs` 70 ·
`executor.mjs` 63 · `self-containers.css` 54 / `opp-containers.css` 53.

**Reading of the numbers.** Copy-paste is not the problem (0.6 %). Size comes from four things:
tracked junk (§A), a handful of giant files that every session touches (§B), a legacy client rules
layer kept alive beside the server engine (§C), and catalog data checked in as JavaScript (§D). The
harness itself is the fifth cost (§E). Each is cheap to measure again; the numbers above are the
baseline a cleanup must beat.

## Findings — cap 5, filed as I249–I253

### A. Tracked junk — I249 (P2, effort S, zero behaviour risk)
Proof: `git ls-files tools | wc -l` = 1317; `tools/package/package.json` is `"name": "npm", "version":
"10.9.2"`; `grep -rl "tools/package\|npmcache"` over code = 0 hits; `tools/.npmcache` alone is 39.3 MB.
`out/unboxing.webm` + `out/unboxing-18.webm` = 16 MB recorder output committed 2026-09-29.
`client/src/assets/playmats/custom/*.png` = 9 files / 29.9 MB; `mats-catalog.mjs` serves the 13.5 MB
`fire-type-edge-to-edge.png` as the board image. Root: 17 `*-audit.mjs` / `*-test.mjs` with no
reference outside README/designs (`two-player-sync`, `flip-gate`, `test-card-inspector-e2e`,
`reset-during-choice`, `opening-coin-choice`, `spectator-view`, `playtest-bot`, `record-legacy-2p-fixture`,
`probe` are the referenced keepers), `server.log` ×2, `index.css.bak` (I72), `coins.mjs.bak-urls` (I67),
`package-lock.json` beside `pnpm-lock.yaml`, 7 stray docs (`HANDOFF.md`, `COIN_HANDOFF.md`, `ISSUES.txt`,
3 `rulebook-30c-*.md`, `server-authority-*.md`). `.gitignore` has no `*.log`, `*.bak*`, `out/*.webm`.
Cost: 71 root entries hit every `ls`/MAP grep; `pnpm lint` lints `tools/package` (config ignores only
`client/src/vendor`); 90 MB in every clone. Prior audit A1–A5, A7, A8, A11, all still true.

### B. `reduce.mjs` — I250 (P2, effort M, behaviour-preserving)
Proof: 10,976 lines, 173 top-level functions, 123 `case` labels, 55 imports, 3 exports
(`applyCommand`, `validateLegality`, `attackExtrasFor`); `applyCommand` 2,322 lines,
`resolveAttackEffectPhase` 1,420, `validateLegality` 986, `handleKnockout` 305. One importer.
Cost: top hotspot (186 commits / 2 months); the PostToolUse hook re-lints the whole file per edit; a
339 KB file is re-read into context by every engine session. Seam: one module per command domain
(`reduce/attack.mjs`, `reduce/trainer.mjs`, `reduce/knockout.mjs`, `reduce/legality.mjs`) behind the
same three exports — the file's own section structure already follows the `case` labels.

### C. Legacy client rules layer — I251 (P2, effort L, gated: netcode)
Proof: `rules-bridge.js` 3,527 + `trainer-execution.js` 2,939 + `chat-buttons.js` 5,421 lines; 55
`serverAuthoritative`-style guards in 23 client files; `DISPOSITION_TABLE` still 35 `server_command`
of 58 (unchanged since 09-28, so retirement has not advanced); four legacy/server twins still
imported (`rules/status.mjs` 5 importers vs `special-conditions.mjs`; `rules/retreat.mjs`;
`rules/mulligan.mjs`; `trainer-execution.js` vs `effects/trainer-steps.mjs`); `server/game/shadow.mjs`
+ 13 `SHADOW_MODE` refs; `SERVER_AUTHORITATIVE` is still opt-in in `server/server.js:44`.
`chat-buttons.js:2168` reads `dmg`, which is not defined in scope (ESLint `no-undef`): the mirror-heal
branch of the client attack path throws a ReferenceError the moment it runs. Cost: two rule readings
that can disagree (I79/I80 class), every FX/e2e check on localhost boots the non-production path
(I177), 12 k lines of client rules that the server already owns. Prior audit B1–B3.
Removal is a feature.md item with a user gate; the default flip (`SERVER_AUTHORITATIVE` opt-out) and
deleting `shadow.mjs` + `/debug/shadow-report` are the S-sized first step.

### D. Data shipped as code — I252 (P3, effort M)
Proof: `coins.mjs` 462 KB / 9,647 lines (939 catalog entries + 10 functions), imported at boot through
`rules-bridge.js` for `getCoinById`; `set-browser.mjs` has 720 JSON-shaped lines, with the same
`STARTER_DECK_CATALOG` block (set `me02`, 143 lines) at `:984-1142` and `:1445-1620`;
`native-deck-builder-bnb-run.js` (870 lines, the `run` flow) and `native-deck-builder-build-battle.js`
(725 lines, the `legacy` flow at `/build-and-battle-legacy`) share 160 verbatim lines in 7 regions.
`resizer.js` repeats two 23–29-line blocks twice each (112 duplicated lines). Cost: 1.6 MB of JS on
every cold load before the board is usable (prior audit C8); two Build & Battle flows to keep in step.
Fix: catalogs → JSON fetched on picker open; one B&B flow once the user picks which (taste call).

### E. Harness friction — I253 (P3, effort M)
Proof in the table above. 453 commits since the last `maintain:`; the trigger is 30. The 09-28 audit
was never filed, so its ten actions were lost. `rules-extended.test.mjs` spends 22 of its 24 s in
`fetchWithRetry` backoff against TCGdex because only 3 `globalThis.fetch` stubs exist in a 7,417-line
file (D161 says live TCGdex is opt-in). Harness files are 4 of the 6 most-churned paths since 09-25
(MAP 36, DECISIONS 35, ISSUES 31, STATE 30 commits of 441).

## Not findings — cleared this audit (don't re-litigate)
Verbatim duplication overall (0.6 %) · engine parser modules (`trainer-effects`, `attack-steps`,
`abilities`, `stadium-effects`: large but single-purpose, out of scope per the 09-28 audit) ·
`shared/engine/effects/executor.mjs` intra-file repeats (4 × 16 lines, a template pattern) · mat-fx move
specs' per-move exports (consumed by the same-file aggregate; dropping `export` is cosmetic) · ESLint
health (24 real problems in product code, prettier warnings only) · CRLF (0 tracked files) · `bot/`,
`docs/`, `.claude/`, server dependencies (all 8 imported) · `(assumed)` decisions (none in DECISIONS).

## Execution plan — one worktree per batch, land each on `main` separately
| Batch | Route | Contents | Verify | Revert |
|---|---|---|---|---|
| 1 | patch.md | I249: `git rm -r tools/package tools/npm.tgz tools/.npmcache out/*.webm`; delete 17 dead root scripts + 7 stray docs (move keepers to `scripts/e2e/`, fix 6 `package.json` paths + `render.yaml`), `server.log` ×2, both `.bak`, `package-lock.json`; gitignore `*.log *.bak* out/*.webm`; thumbs for `playmats/custom` via `scripts/generate-mat-thumbs.mjs`, gitignore the PNG originals; eslint `ignores` += `tools/**`, `out/**`, `.agent/**` | `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm test:flip` path resolves, `pnpm start` boots, fire-type mat loads ≤300 KB | `git revert` |
| 2 | patch.md | I253 test speed: module-level fetch stub in `rules-extended.test.mjs` (or `fetchWithRetry` skips backoff on network error when not `LIVE_TESTS`) | `node --test shared/engine/rules/__tests__/rules-extended.test.mjs` ≤3 s, 428 pass; `pnpm test:live` unchanged | `git revert` |
| 3 | maintain.md | I253: archive 46 shipped designs, DECISIONS ≤90 lines, ISSUES ≤40 open, MAP ≤120; make the maintenance trigger a `pnpm harness:check` script | caps table in maintain.md all green | n/a (archive, not delete) |
| 4 | refactor.md | I250: split `reduce.mjs` by command domain, exports unchanged; `pnpm audit:oracle` must match baseline byte-for-byte | `pnpm test`, `pnpm gates` → oracle REQUIRED → `pnpm audit:oracle` | `git revert` |
| 5 | refactor.md | I252: `coins.mjs`/`sleeves.mjs`/`STARTER_DECK_CATALOG` → JSON loaded on picker open; dedupe `set-browser.mjs` block; fold `bnb-run`/`build-battle` shared regions into one module | `pnpm test`, deck builder opens, coin flip works, boot JS ≤2.8 MB | `git revert` |
| 6 | feature.md (gate) | I251: flip `SERVER_AUTHORITATIVE` default, delete `shadow.mjs` + `/debug/shadow-report`, fix `dmg` at `chat-buttons.js:2168`; then retire the four legacy twins pair by pair as `DISPOSITION_TABLE` grows | `pnpm test`, `pnpm test:flip`, `pnpm test:2p`; user gate | `git revert` per pair |

Batches 1–3 are pure deletion/archive and need no design approval. Batch 4 is behaviour-preserving
(oracle baseline is the proof). Batch 5 changes load order (deck builder data arrives async) — a
`feature.md` approval if the user wants the picker to stay synchronous. Batch 6 is netcode: gated.

## Decisions the user owns
1. Which Build & Battle flow survives (`run` default vs `legacy` path) — or both, in which case the
   160 shared lines move to one module and the two files stay.
2. Whether `SERVER_AUTHORITATIVE` becomes the default now (prior audit B1 argued yes: every localhost
   check currently runs the path production never uses).
3. Pruning 279 remote branches (`git branch -r --merged main`) — the user's repo, their call.
