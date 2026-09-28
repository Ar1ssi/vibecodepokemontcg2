# Fable audit — 2026-09-28 — waste, dead code, harness friction

Read-only audit of committed `main` (`d163b53`, 2026-09-27) in a detached worktree. Nothing edited,
deleted or committed. Out of scope per brief: parser rulings, security, legacy netcode *behaviour*,
visual taste. Environment caveats:
- The cloud clone was shallow (60 commits); deepened to the full 1098-commit history before any
  history-based number below. Numbers marked "S60" were also checked on the shallow view.
- The primary folder here is clean (`git status --short` empty): the uncommitted edits the brief
  mentions live on the user's Windows machine, not in this clone. No clutter list from that source.
- `~/.claude/CLAUDE.md`, `~/.claude/RTK.md` and the Windows memory directory do not exist in this
  container, so the user-level contradiction check (area D) could not be run.
- No LSP tool in this session (the harness lists none), so caller counts are grep-based.
- `mcp__ccd_session_mgmt__get_usage` is not available here; context stayed well under the cap by
  construction (six Sonnet investigators returned tables, not file bodies; ~50 turns).

Effort key: S < 1 h · M = one session · L = multi-session. Tags: `[delete]` `[merge]` `[fix]`
`[simplify]` `[harness]`.

---

## 1. Summary — top 10 actions by payoff ÷ effort

| # | Action | Saves | Effort |
|---|---|---|---|
| 1 | **Stub TCGdex in the unit suite** (A-shaped fix in `shared/engine/rules/__tests__/rules-extended.test.mjs`, or make `fetchWithRetry` skip retries when `globalThis.fetch` is absent/blocked). `canEvolve` tests pay 3 retry attempts × 250 ms backoff per `ensureCardData` call. | **~22 s of a 40 s `pnpm test`** (56 % of wall time); removes the live-network dependency D161 says must be opt-in | S |
| 2 | **Delete `tools/package/` + `tools/npm.tgz`** — a vendored copy of the npm CLI 10.9.2 (1317 files, 44 MB of pack history), never referenced | 1317 tracked files, ~6 MB working tree, 44 MB clone | S |
| 3 | **Move the 9 `playmats/custom/*.png` originals out of the tree** (29.3 MB; `fire-type-edge-to-edge.png` alone is 13.5 MB and is the mat's `board` image, so it is served as-is) | 29 MB repo; up to 13.5 MB per page load when that mat is chosen | S |
| 4 | **Lazy-load the deck builder, sample decklists and mat FX** (78 modules, 1.49 MB = 35 % of the 4.28 MB eager JS; `coins.mjs` 461 KB is pulled in at boot by one `getCoinById` import in `rules-bridge.js:89`) | ~1.6 MB per cold page load | M |
| 5 | **Delete the 26 root-level loose scripts/docs and 3 tracked logs** (12 dead `*-audit.mjs`/`*-test.mjs`/`verify.mjs`/`probe.mjs`…, `HANDOFF.md`, `COIN_HANDOFF.md`, `ISSUES.txt`, 3 `rulebook-30c-*.md`, `server-authority-*.md`, `server.log` ×3) | 26 files / ~420 KB at the repo root; every `ls` and every MAP grep hits them | S |
| 6 | **Archive 23 shipped designs + 6 handoff files** to `designs/archive/` and cut `DECISIONS.md` (169 lines / 40 KB vs cap 90 / 20 KB) and `ISSUES.md` (41 open vs cap 40) — maintenance is 55 commits overdue (trigger ≥ 30) | ~410 KB of designs out of the active folder; DECISIONS grep noise halved | M |
| 7 | **Stop committing audit outputs** (`out/gx-oracle-rows.json` 863 KB + `out/gx-oracle-audit.txt` 273 KB rewritten in 10 of the last 60 commits; `out/` carries 21 MB of pack history) — gitignore outputs, keep baselines under `scripts/` | ~1.1 MB per oracle run, 21 MB clone | S |
| 8 | **Drop the `.claude/settings.json` `ENABLE_TOOL_SEARCH=auto` line or scope it** — D167 measured +9 k tokens per session for eager tool schemas so LSP is always loaded, yet this session had no LSP at all and CLAUDE.md still tells sessions to load it via ToolSearch | ~9 k tokens/session (≈ 3× the whole CLAUDE.md) | S |
| 9 | **Split the 356 KB `rules-extended.test.mjs`** (420 tests, one file, largest test in repo) by module so the PostToolUse hook and `test:changed` stop paying the whole file per edit | seconds per edit cycle; enables #1 cleanly | M |
| 10 | **Dedupe the three `normalizeText` copies and the 122 inline `self`/`opp` ternaries** into one helper each | prevents the regex drift already present between copies; -25 files touched by future changes | S/M |

Estimated total: **~1350 tracked files, ~100 MB of clone/pack, ~1.6 MB per page load, ~22 s per
test run, ~9–12 k tokens per session.**

---

## 2. Findings by area

### A. Repository clutter and dead code

**A1 `[delete]` `tools/package/` and `tools/npm.tgz` are a vendored npm CLI.** `tools/package/package.json` is `"name": "npm", "version": "10.9.2"`; 1317 tracked files, 3.4 MB + 2.6 MB tarball, plus two tracked npm debug logs under `tools/.npmcache/_logs/`. Proof: `grep -rn "tools/" package.json scripts .agent .claude README.md` → only `MAP.md:18` ("internal dev tools") and `README.md:296`, neither naming `package/`. Last touched in the 2026-09-05 import commit `6f10f089 aaaaaaaaaaaaaa`. Cost: 44 MB of pack history, 1317 files in every `git ls-files`/knip/grep sweep. Action: `git rm -r tools/package tools/npm.tgz tools/.npmcache`; keep `tools/compare-sync-logs.mjs` and the coin `.tsv/.txt` mappings only if `scripts/download-coin-images.mjs` reads them (it reads `client/src/assets/coins/historical/manifest.json`, not these; verify once). Revert: `git revert <commit>`. Effort S.

**A2 `[delete]` Root loose scripts — 12 dead, 14 referenced only by README.** Reference grep (basename across package.json, scripts, .agent, docs, README, .claude, server, shared, client):
| File | Refs | Verdict |
|---|---|---|
| `ability-simulator-audit.mjs`, `attack-simulator-audit.mjs`, `stadium-tool-simulator-audit.mjs`, `trainer-simulator-audit.mjs`, `trainer-rotation-audit.mjs`, `manual-verify-i24.mjs`, `verify.mjs` | 0 | dead |
| `ability-audit.mjs`, `attack-audit.mjs`, `attack-false-positive-audit.mjs` | design 031/032 + `scripts/lib/executed-families.mjs` comment only | superseded by `pnpm audit:*` (D108/D124/D134/D149) |
| `browser-test.mjs`, `coin-flip-visual-test.mjs`, `explore-ui.mjs`, `fullview-test.mjs`, `join-deck-sync-test.mjs`, `room-change-reset-test.mjs`, `room-rejoin-reset-test.mjs`, `integration-test.mjs` | README only | one-off Playwright probes; `integration-test.mjs` is the sole `jsdom` user |
| `two-player-sync-test.mjs`, `flip-gate-test.mjs`, `test-card-inspector-e2e.mjs`, `reset-during-choice-test.mjs`, `playtest-bot.mjs`, `record-legacy-2p-fixture.mjs`, `probe.mjs` | package.json / render.yaml / tests | keep (move under `scripts/e2e/`) |
Cost: the root directory has 60 entries; MAP.md line 85 documents them as one blob. Action: delete the first two groups (17 files, ~230 KB), drop `jsdom` from root devDependencies with `integration-test.mjs`, move the keepers under `scripts/e2e/` and fix the 4 `package.json` script paths. Revert: `git revert`. Effort S.

**A3 `[delete]` Stray root docs.** `HANDOFF.md`, `COIN_HANDOFF.md`, `NEXTSTEPS.md`, `ISSUES.txt`, `rulebook-30c-implementation-plan.md`, `rulebook-30c-review-fix-plan.md`, `rulebook-30c-vs-rules-engine-gaps.md`, `server-authority-and-rules-engine-audit.md` (8 files, ~130 KB). Refs: only from designs or each other; `NEXTSTEPS.md` is named by `maintain.md`/`feature.md`/`oneshot-feature.md` as a historical source (its role is now STATE + ISSUES per D162). `server-authority-and-rules-engine-audit.md` is cited by `audit-authority.test.mjs` as provenance only. Action: move to `.agent/archive/` (they are pre-harness journals) and fix the three workflow mentions. Effort S.

**A4 `[delete]` Tracked logs and backups.** `server.log` (997 B, a crash trace), `server/server.log`, `tools/server.log`, `client/src/css/index.css.bak` (111 KB, open issue **I72**), `client/src/setup/deck-builder/core/coins.mjs.bak-urls` (66 KB, open issue **I67**). New evidence for I67/I72: both `.bak` files still import-resolve nothing and are 3+ weeks old. Action: delete all five, add `*.log` and `*.bak*` to `.gitignore`. Effort S.

**A5 `[delete]` Two lockfiles.** `package-lock.json` (144 KB, 2026-09-25) alongside `pnpm-lock.yaml`; `render.yaml`, `.cursor/environment.json` and CLAUDE.md all use `pnpm install --frozen-lockfile`. Nothing reads the npm lockfile. Action: delete; revert via git. Effort S.

**A6 `[fix]` Dependency hygiene.** `nodemon` is declared in both root and `server/package.json` (only `server` uses it). `jsdom` (root) has one consumer, the dead `integration-test.mjs` (A2). `ejs` is flagged unused by knip but is required at runtime by Express's view engine — keep (false positive). `prettier` is not a direct devDependency (works only through `eslint-plugin-prettier`'s transitive install; `pnpm exec prettier --version` → 3.8.1 today). Action: remove root `nodemon` + `jsdom`, add `prettier` explicitly. Effort S.

**A7 `[delete]` Unreferenced assets.** Investigator scan of 4328 asset files against 712 reference files (catalogs included), hand-verified: `client/src/assets/sprites/pokemon-spritesheet.png` (1.60 MB, zero refs, sprites now under `pokemon/gen8|9`) and five `holo/` files (`masterball-*.webp`, `pokeball-*.webp`, `galaxy.jpg`, 230 KB). Every other asset directory is 100 % referenced by filename (`box-wallpapers` is templated and asserted by its test). Also unreferenced by app code: `out/playmat_outlines/*` (2.2 MB of pipeline previews) and `tools/coin-test.png` (262 KB). Action: delete the 6 assets (1.83 MB) and the previews (2.5 MB). Revert: git. Effort S.

**A8 `[fix]` Custom playmat PNG originals served raw.** `client/src/assets/playmats/custom/` holds 9 PNGs totalling 29.3 MB next to 12 WebPs; the 350 board mats are WebP at ~125 KB each. `mats-catalog.mjs:34-38` sets `image`, `thumb` and `board` of `custom-fire-type-edge-to-edge` all to the 13.5 MB PNG, so picking it loads 13.5 MB. `scripts/generate-mat-thumbs.mjs` (header of `mats-catalog.mjs`) already produces ~320 px WebP thumbs and trimmed boards for the board set but was not run for `custom/`. Cost: 29 MB repo, up to 13.5 MB/page load. Action: run the thumb generator over `custom/`, gitignore the PNG originals like `playmats/original/` already is. Effort S.

**A9 `[simplify]` Coin catalog `thumb` = full image.** `coins.mjs` (461 KB, 939 entries) sets `thumb` to the same ~280 KB PNG as `url` for the 205 launch-era coins (average historical coin: 27 KB). No `loading="lazy"` on the coin picker grid (`native-deck-builder-coin-picker.js`). Cost: opening the coin picker can request tens of MB. Action: generate real thumbs (same script family as A8) and lazy-load grid images. Effort M. (Not counted in savings; needs a measurement in the browser first.)

**A10 `[delete]` Dead client modules (knip, verified by grep).** `client/src/initialization/document-event-listeners/sidebox/native-deck-builder-load-feedback.js` (463 B) and `client/src/setup/general/add-action-data.js` (365 B): zero importers anywhere. `client/src/css/holo/basic.css` (49 B, empty) is @imported nowhere. Knip's other "unused file" hits (`modern-energy.mjs`, `coin-image-manifest.mjs`, `playmat-anim.mjs`, `deck-stack.mjs`) are false positives: build-time generators or the iframe-injected module at `client/index.ejs:1142`. Knip also lists 84 unused exports (e.g. `resizer.js` 8 exports, `apply-mat-layout.js` 6, `shuffle-pose.mjs` 6) — cheap to prune with `test:changed`. Effort S.

**A11 `[delete]` `out/` audit outputs are committed and churn.** `out/gx-oracle-rows.json` (864 KB) and `out/gx-oracle-audit.txt` (273 KB) were rewritten in 10 of the last 60 commits (`git log --oneline -- out/gx-oracle-rows.json`); `out/trainer-simulator-audit.json` (554 KB) is a dead root-script output (A2). `out/` contributes 21 MB of pack history. The card corpora (`out/pkmn-*-cards.json`, 4.4 MB) are inputs and must stay (prime directive 7). Action: gitignore `out/*-rows.json`, `out/*-audit.*`, `out/*simulator*`, keep corpora and `scripts/*-baseline.json`; delete the tracked outputs. Effort S. Revert: git.

**A12 `[delete]` `.superdesign/` (108 KB) and `.cursor/environment.json`.** `.superdesign/resume.json` points at a hosted project id; nothing in the repo references the directory except its own gitignore line. `.cursor/environment.json` is a Cursor background-agent config that runs `playwright install chromium` and starts the server in legacy mode (see B1). Keep `.cursor` only if Cursor is still used; delete `.superdesign`. Effort S.

**A13 `[delete]` `scripts/`: 2 orphans, rest wired.** `scripts/build_playmat_assets.py` (14 KB, the only `.py` in the repo) and `scripts/trim-mat-whitespace.mjs` (9.5 KB) have zero references; every other script is reached from `package.json`, a generated-file header, or a design. Effort S.

Cleared in A: `bot/` (in the test glob), `docs/` (all 5 files cited from designs/DECISIONS), `client/src/assets` beyond A7/A8, `.vscode/`, `eslint.config.mjs`.

### B. Architecture debt and inconsistencies

**B1 `[fix]` Legacy mode cannot be deleted yet — and it is the local default.** `server/server.js:22-24`: `SERVER_AUTHORITATIVE` is off unless set (D17); `render.yaml` sets it on. The client diverges only through `DISPOSITION_TABLE` (`shared/engine/commands.mjs:1054`: 35 `server_command` + 24 other dispositions); every action outside it, plus all 1-player play, still runs the client rules engine. Investigator trace of every import under `client/src/setup/rules/`, `netcode/` and the gated `actions/` sites: **zero files are legacy-only** — `rules-bridge.js` (150 KB) and `trainer-execution.js` (118 KB) are load-bearing in authoritative mode too. Deleting legacy mode today removes only guard lines in ~30 files. What *is* removable now is the `SHADOW_MODE` machinery: `server/game/shadow.mjs` (18 KB) + `/debug/shadow-report` (`server.js:259-275`) exists to compare legacy vs authoritative and I15/I34 already track the parity gaps. Cost of the current default: `pnpm start`, `.cursor/environment.json`, and the fx-preview skill (`PORT=4100 pnpm start`) all boot the *non-production* netcode, so every local visual/e2e check runs a path production never uses (I177: no FX/sound in legacy mode). Action: flip the default to authoritative (`SERVER_AUTHORITATIVE` opt-out instead of opt-in) and document the estimate above in ISSUES; no deletion until DISPOSITION_TABLE covers Trainer play. Effort S for the default flip; L for the removal.

**B2 `[merge]` Parallel rule modules under `shared/engine/rules/` that are actually legacy-only vs server-only.** Verified importers:
| Legacy copy (client-only importers) | Server copy | Bytes |
|---|---|---|
| `rules/status.mjs` `applyStatus` (5 client importers) | `rules/special-conditions.mjs` (13 importers, reduce + effects) | 8.7 KB vs 3.5 KB |
| `rules/retreat.mjs` `getEffectiveRetreatCost` | `reduce.mjs:1091` `computeEffectiveRetreatCost` | 4 KB |
| `rules/mulligan.mjs` (rules-bridge only) | `shared/engine/setup.mjs:30,67` inline | 1.8 KB |
| `client/src/setup/rules/trainer-execution.js` (rules-bridge + e2e-api) | `shared/engine/effects/trainer-steps.mjs` | 118 KB vs 165 KB |
Cost: two rule readings for special conditions and retreat that can silently disagree (I79/I80 are examples of that class). Action: file one ISSUE naming the four pairs so the legacy side is retired pair by pair when DISPOSITION_TABLE grows; no code change now. Effort S to file, L to retire.

**B3 `[simplify]` `resolveCardIndex` / `syncInstance` still live, functionally inert under authority.** `shared/engine/zones/resolve-card-index.mjs:71` is called unconditionally at the top of `use-ability.js:22`, `move-card-bundle.js:37`, `special-condition.js:19`, `damage-counter.js:22`, `ability-counter.js:21`; under authority the legacy zone array it searches is empty (`use-ability.js:28-30` comment) and identity comes from `authoritative-dispatch.js:75` `buildAuthoritativeCardHint`. `syncInstance` survives as the translation shim in `dual-run-bridge.js:26-49` (27 hits). `instanceId` is server-minted (`server.js:941`, `cards.mjs:7`) as design 001 intended. PROJECT.md's glossary line ("design 001 retires them") is therefore half-true: the server side is done, the client shim is not. Action: correct the glossary line (≤5 lines) and tie removal to B1. Effort S.

**B4 `[simplify]` Giant files — top 15 by size and churn (1098-commit history).**
| File | KB | Commits | Natural seam (cost it removes) |
|---|---|---|---|
| `client/src/setup/deck-builder/core/coins.mjs` | 461 | low | data → `coins.json` fetched on picker open (removes 461 KB from boot; A9/#4) |
| `shared/engine/reduce.mjs` | 339 | 11 (S60) | command handlers by domain (`reduce/attack.mjs`, `reduce/trainer.mjs`…) — every engine edit currently lints 0.9 s and re-reads a 339 KB file; the PostToolUse hook runs `reduce.test.mjs` per edit |
| `client/src/actions/chat-buttons/chat-buttons.js` | 210 | high | attack / retreat / pass / stadium handlers (4 gated bodies at :551, :2566, :4340, :4757) — split removes the 19 `/shared/engine/rules/*` imports from a UI file |
| `client/src/setup/deck-builder/core/sleeves.mjs` | 165 | low | data → JSON (same as coins) |
| `shared/engine/effects/trainer-steps.mjs` | 165 | 9 | out of scope (parser); structure only: per-step-family modules |
| `client/src/setup/rules/rules-bridge.js` | 150 | high | its 13 `ensureCardData` call sites and 3 authority early-returns (:53, :1396, :3181) mark the legacy/live boundary; split along it before B1 |
| `shared/engine/rules/trainer-effects.mjs` | 138 | 9 | parser, out of scope |
| `client/src/setup/rules/trainer-execution.js` | 118 | med | legacy twin of trainer-steps (B2) |
| `shared/engine/effects/attack-steps.mjs` | 117 | 10 | parser, out of scope |
| `shared/engine/rules/abilities.mjs` | 94 | 7 | parser |
| `shared/engine/rules/stadium-effects.mjs` | 89 | — | parser |
| `shared/engine/rules/special-energy-parse.mjs` | 80 | — | parser |
| `client/src/setup/netcode/apply-view.js` | 78 | — | zone renderers vs diff/animation driver |
| `shared/engine/effects/executor.mjs` | 75 | 5 | — |
| `shared/engine/rules/attack-steps.mjs` | 71 | 9 | parser |
Only the first four splits have a named cost that is not "size"; the parsers are another review's call. Effort M each.

**B5 `[merge]` Duplicate helpers.** Verified counts:
- `normalizeText` defined three times with drifted regexes: `special-energy-parse.mjs:80`, `trainer-effects.mjs:99`, `abilities.mjs:17` (no cross-import). Cost: the drift is already real (differing punctuation classes). Action: one export in `rules/text.mjs`. Effort S.
- `self`/`opp` flip: 122 inline `x === 'self' ? 'opp' : 'self'` ternaries in 25 files (client + shared), no helper; `reduce.mjs` inlines `Object.keys(state.players).find(...)` 5+ times while `turn-order-flip.mjs:68` exports `otherPlayerId`. Effort S (mechanical, `test:changed`).
- `getZone` name collision: `client/src/setup/zones/get-zone.js:36` `(user, zoneId)` vs `shared/engine/state.mjs:135` `(state, playerId, zoneId)` — 367 call sites; `zoneOf` defined 3× with unrelated bodies. Cost: grep/LSP ambiguity every session. Action: rename the client one `getClientZone`. Effort S.

**B6 `[simplify]` `.js` vs `.mjs` drift.** `client/src`: 194 `.js` + 267 `.mjs`; `server`: 1 `.js` (the entry) + 22 `.mjs`; `shared`/`scripts`: all `.mjs`. `client/package.json` is `"type": "module"`, so the extension carries no meaning. Cost: every glob and hook rule needs both. Action: rename `.js` → `.mjs` in one mechanical commit (git detects renames; imports use absolute `/shared/...` or relative paths so a sed pass suffices). Effort M; low payoff — rank last.

**B7 `[fix]` DOM-node state.** 97 direct `card.image.{damageCounter,specialCondition,abilityCounter}` reads/writes across 12 client files (top: `damage-counter.js` 22, `special-condition.js` 19, `keybinds.js` 14, `evolve-card.js` 10). The canonical helper is `shared/engine/zones/card-state.mjs` (3.2 KB), not a client file as PROJECT.md's landmine implies. Cost: the syncCheck blind spot PROJECT.md documents; I56 (keybinds throw on server-drawn cards) is the same class. Action: route the 5 read-only sites (`keybinds.js`, `evolve-card.js`, `chat-buttons.js`, `rules-bridge.js`, `resizer.js`) through `card-state.mjs`; leave the counter modules as owners. Effort M.

### C. Network and API calls

**C1 `[fix]` Unit tests hit TCGdex through the retry-backoff path (top finding).** `pnpm test` wall time 40.3 s, CPU 47 s; `shared/engine/rules/__tests__/rules-extended.test.mjs` alone is 22.6 s wall / 1.1 s CPU. The 13 slowest tests are all `canEvolve`/`evolution` cases (6.0 s, 4.4 s, 3.9 s …). Cause: `evolution.mjs:225-226` awaits `ensureCardData` for both cards → `rules-state.mjs:158` `fetchTcgdexJson` → `fetchWithRetry` (`:140-152`, 3 attempts, 250·n ms sleeps = 750 ms per miss) → live `fetch` to `api.tcgdex.net`. Isolated run of one test: 6.26 s = 8 misses × 750 ms. Only 12 of the file's 420 tests stub `globalThis.fetch`. In the user's environment the same tests *succeed* against live TCGdex, which D161 says must be opt-in (`pnpm test:live`). Action: install a module-level fetch stub in the file's setup (or a `LIVE_TESTS` guard in `fetchWithRetry` that skips backoff when `fetch` rejects with a network error). Saves ~22 s per run, ~20 s per `test:changed` on any `rules/` edit. Effort S.

**C2 `[fix]` No timeout on any client/shared TCGdex fetch.** `grep -rl AbortController shared client` → none; `shared/tcgdex/tcgdex-cache.mjs:22-28` and `rules-state.mjs:140-152` are bare `fetch(url)`, while the server proxy (`server/tcgdex-proxy.mjs:93`) and `/api/mat-image` (`server.js:181`) both use a 10 s abort. A hanging upstream stalls `ensureCardData` (83 call sites) and `import.js:640-655`'s `Promise.all` of `new Image()` (no onload/onerror timeout → import dialog stuck "Loading"). Action: one `fetchWithTimeout` helper (8 s) used by both leaf fetchers; a 10 s race in the image preload. Effort S.

**C3 `[merge]` Two cache layers for the same `/cards/<id>` call.** `native-deck-builder.js:818` fetches rarity via the bare `cachedFetchJson` singleton while every other consumer goes through `rules-state.mjs:236-255` `fetchCardDetail` (own `createCachedFetchJson()` instance + `detailInFlight` dedupe). Same IndexedDB key, different in-flight maps → a hover and an enrichment for the same card can issue two requests. Action: rarity via `fetchCardDetail`. Effort S.

**C4 `[simplify]` Sequential `await ensureCardData` loops** at `rules-bridge.js:1457-1459`, `:2742-2744`, `:489-494`, `action-affordances.mjs:124-130` (runs on every board refresh via `card-glow-model.mjs:78`) where siblings at `rules-bridge.js:2334` and `trainer-execution.js:338,525` already use `Promise.all`. Cost: first-load only (memo at `rules-state.mjs:400`), so low. Effort S.

**C5 `[fix]` `build-deck.js:41-46` preloads ~60 card images with no cap** three lines above a deliberately capped (`ENRICHMENT_CONCURRENCY=6`, D164 anti-block) JSON pool. Effort S.

**C6 `[fix]` `/api/mat-image` has no server-side cache** (`server.js:163-221`; only `Cache-Control: max-age=86400`), unlike the TCGdex proxy's LRU. Effort S.

**C7 Socket.IO — cleared with two `[simplify]` notes.** 41 custom events; every emit has a listener and vice versa (no orphans). Full `view` is sent on every command from 6 sites (`server.js:362,400,990,1048,1098,1144`); measured payload for a mid-game board with real corpus cards: **15.0 KB for 58 visible cards (≈ 260 B/card, `src` URL is the largest field)**. For a private 2-player game that is not worth a delta protocol; the only diff logic (`view-diff.mjs`) is client-side animation and should stay. Simplification only: `gameEnded` is emitted from 8 sites and `cmdRejected`/`roomReject` from 5 each with the payload rebuilt inline — one `reject(socket, reason)` / `endGame(...)` helper (S). No legacy-exclusive event exists: `pushAction`/`requestAction` still fire under authority (`process-action.js:41`), which is the dual-run bridge, not waste.

**C8 `[fix]` Client boot.** 357 modules / 4.28 MB JS + 29 CSS / 333 KB before the board is usable, plus a blocking `cdn.socket.io` script. Lazy-load candidates (static import graph, verified): deck builder 32 modules / 1.18 MB (incl. `coins.mjs` 461 KB reached via `rules-bridge.js:89` `getCoinById`, `sleeves.mjs` 165 KB, `mats-catalog.mjs` 103 KB, sprite catalogs 128 KB, `starter-decks.generated.mjs` 66 KB), `sample.decklists.js` 134 KB (import UI), mat FX 45 modules / 273 KB, `e2e-api.js` 32 KB. Action: `import()` the deck builder on sidebox open, the coin lookup on first coin flip, mat FX after first view; convert `coins.mjs`/`sleeves.mjs` to JSON. Effort M.

### D. The harness

**D1 `[harness]` Biggest fixed cost is tool schemas, not docs.** Per-session token estimates (chars ÷ 3.6): CLAUDE.md 2.9 k · STATE 0.5 k · one workflow 0.5–2.4 k · DELEGATION 2.1 k (when spawning) · PROJECT 1.6 k (feature work) · agent/skill frontmatter ~0.5 k → **~6–8 k tokens of harness text per session**. D167's own measurement: `ENABLE_TOOL_SEARCH=auto` (`.claude/settings.json`) adds **~9 k tokens** (19.8 k of a 31.6 k start) so LSP is preloaded, but CLAUDE.md line 12-14 still hedges ("if a session lists it as deferred, load it with ToolSearch") and this session had no LSP tool at all. Action: drop the env line and keep the ToolSearch instruction (LSP is then loaded on demand only by sessions that do symbol work). Saves ~9 k tokens/session. Effort S.

**D2 `[harness]` Caps are blown and the maintenance trigger fires but nobody routes to it.** `DECISIONS.md` 169 lines / 40 KB (cap 90 / 20 KB); `ISSUES.md` 41 open / 38 closed (caps 40 / 30); `.agent/designs/` 61 files / 1.0 MB with 34 unreferenced by STATE/ISSUES (408 KB), 23 of them marked shipped/built and 6 `*-handoff.md` with no status line; `designs/archive/` holds 3. 55 commits since the last `maintain:` (threshold 30); STATE.md line 8 already says "Maintenance: … over cap". `maintain` appears once in 1098 commit subjects. Cost: every `grep -n "\[rules\]" DECISIONS.md` returns ~2× the lines it should; designs listing is 61 entries. Action: run `maintain.md` once (archive the 29 designs, prune superseded D-lines, close/merge the 4 lowest P3 issues); then make the trigger a hook-emitted line in STATE or a `pnpm harness:check` script so it is not a mental arithmetic step. Effort M.

**D3 `[harness]` Workflows never routed to.** Subject-prefix counts over 1098 commits: patch 33 · harness 32 · feature 14 · oneshot 8 · refactor 4 · review 2 · debug 2 · maintain 1 · audit 1 · **bootstrap 0 · exec-plan 0 · oneshot-feature 0** (oneshot-feature is used but commits as `oneshot`). `bootstrap.md` (2.5 KB) and `oneshot.md` (4.3 KB) are template leftovers ("Session 1 / journal S1", already a `flag:` line). `exec-plan.md` (3.7 KB) has never been used. Action: delete `bootstrap.md` and `oneshot.md`, fold `exec-plan.md` into `oneshot-feature.md`, trim the routing table to 8 rows (saves ~150 tokens/session of CLAUDE.md and three files nobody reads). Effort S.

**D4 `[harness]` `.agent/README.md` contradicts CLAUDE.md.** Line 63: journal "Append-only session outcomes | Written at session close"; CLAUDE.md/D162: journal frozen, commit message is the journal. It also describes copying `AGENTS.md` + `.agent/` as a template product ("RepoResident"). `AGENTS.md` (217 B) just says "read CLAUDE.md". Cost: the brief told this session to read README (1.2 k tokens) and it added nothing true. Action: cut README to the file map + layers (~25 lines) with the journal row fixed. Effort S.

**D5 `[harness]` Stale facts in CLAUDE.md / PROJECT.md / MAP.md (≤5-line fixes).** CLAUDE.md:125 "~4260" tests → 4469 (4466 pass, 3 skipped). PROJECT.md glossary: SyncInstance/CardHint "retired by design 001" → server side only (B3). PROJECT.md landmine names `card-state.mjs` as if client-side → it is `shared/engine/zones/card-state.mjs`. MAP.md:18 `tools/` "internal dev tools" → vendored npm (A1). MAP.md:85 documents the root audit scripts as live. `.agent/areas/`: two docs (netcode 6.3 KB, deck-builder 3.1 KB) — MAP.md (92 lines, one per module) is doing the area job adequately; no finding.

**D6 `[harness]` PostToolUse hook — acceptable.** Measured: eslint 0.87 s on `reduce.mjs`, 0.54 s `coins.mjs`, 0.70 s `chat-buttons.js`; `reduce.test.mjs` 0.33 s. `post-edit-plan.mjs` is wired (imported by the hook and by `scripts/test-changed.mjs`). The one bad case is any edit under `shared/engine/rules/` whose sibling test is `rules-extended.test.mjs` — not mapped by the hook (only `<name>.test.mjs` siblings run) but run by `test:changed`, paying C1's 22 s. Fix C1/#9 and this is clean.

**D7 `[harness]` Review gate is skipped and only flagged.** Two `flag:` lines in the last 60 commits say "engine+rules change not independently reviewed before main" (CLAUDE.md § Delegation row 12 says required). Only 2 `review` commits in 1098. Cost: the rule costs tokens to read and is not followed. Action: either make it the `Done` checklist line of `patch.md`/`feature.md` for engine diffs with a one-line agent spawn, or downgrade the rule to "offer". Effort S.

Cleared in D: `.claude/agents/*` (both referenced by DELEGATION rows 4/7), `.claude/skills/fx-preview` (referenced by STATE watch-outs), `settings.json` hook wiring, `scripts/hooks/post-edit-plan.mjs` (5 tests, wired).

### E. Workflow

**E1 Commit hygiene — fine.** 1098 commits: 2 `wip:`, 196 merges (18 %), 2 local branches, 1 worktree in this clone. On the remote: **204 branches** (`cursor/*` 64, `feature/*` 61, `claude/*` 43, `fix/*` 28) — every landed branch is left behind. Cost: `git branch -a` noise, fetch time. `[fix]` Action: delete merged remote branches (`git branch -r --merged main`), S. Stale worktrees cannot be measured from this clone.

**E2 Test suite.** 288 test files, 4469 tests, 40.3 s wall, 0 failures, 3 skipped. Per-test durations sum to 56 s (parallel files). Slowest: `rules-extended.test.mjs` 22.6 s (C1). Tests touching the network: only via C1's unstubbed path (the 20 files matching `fetch(`/`https://` are URL-building unit tests). Near-duplicate names: `sync-check.test.mjs` exists in `client/src/setup/netcode/__tests__/` and `server/game/__tests__/` (different subjects, fine). `[simplify]` `rules-extended.test.mjs` is 356 KB / 420 tests in one file (#9).

**E3 Maintenance cadence.** Last `maintain:` 2026-09-25 (`3cc1593`), 55 commits since; STATE names the overdue items but the last 5 sessions routed `patch`/`oneshot`. The trigger is a manual `git rev-list --count` in CLAUDE.md that nobody runs (D2).

**E4 Friction the harness creates.** `flag:` lines (14 in the full history, all post-S313): 2× review gate skipped (D7), 1× unused workflows (D3), 4× "baseline regenerated after review" (the `out/`/baseline churn of A11 makes every oracle run a commit). Docs fixed repeatedly: `DECISIONS.md` 15 commits, `STATE.md` 11, `CLAUDE.md` 10, `MAP.md` 10 of the last 60 — harness files are 4 of the 5 most-churned paths, above `reduce.mjs`. That is the cost of "shared harness files change only in the landing commit": every landing touches four files by hand. Action: D2 + D3 shrink the surface; a `pnpm harness:check` (caps, trigger, stale paths in MAP) replaces the arithmetic. Effort M.

---

## 3. Proposed execution order (one session each, cheaper model)

| Batch | Contents | Verify |
|---|---|---|
| **1 — test speed (Sonnet, S)** | C1 fetch stub; C2 `fetchWithTimeout`; C3 rarity via `fetchCardDetail`; C5 image-preload cap | `pnpm test` (expect ~18 s, 4466 pass); `pnpm test:live` unchanged |
| **2 — repo clutter (Sonnet, S)** | A1 `tools/package`; A2/A3 root scripts + docs (move keepers to `scripts/e2e/`, fix 4 package.json paths); A4 logs/`.bak`; A5 `package-lock.json`; A6 deps; A11 `out/` outputs + gitignore; A12/A13; A10 dead modules + `basic.css` | `pnpm install --frozen-lockfile`, `pnpm test`, `npx eslint --quiet` on touched files, `pnpm start` boots, `pnpm test:flip` path resolves |
| **3 — assets (Sonnet, S)** | A7 six assets + previews; A8 custom mat thumbs via `scripts/generate-mat-thumbs.mjs`, gitignore PNG originals; A9 measurement only | `node --test client/src/setup/deck-builder/__tests__/mats.test.mjs`, boot check: pick the fire-type mat, Network tab ≤ 300 KB |
| **4 — harness maintenance (Opus, M)** | D2 run `maintain.md` (archive 29 designs, prune DECISIONS to ≤90, ISSUES ≤40); D3 delete/fold 3 workflows; D4 README; D5 five stale lines; D1 settings env line; D7 gate wording; file B1/B2/B3 as ISSUES | `grep -c '^- D' .agent/DECISIONS.md` ≤ 90; designs root ≤ 32; `git log -1 --grep='^maintain'` = this commit |
| **5 — boot weight (Opus, M)** | C8 lazy `import()` of deck builder / coin lookup / mat FX / sample decklists; `coins.mjs`, `sleeves.mjs` → JSON | `pnpm test`; boot check: Network tab JS ≤ 2.8 MB before first view; deck builder opens; coin flip works |
| **6 — duplication (Sonnet, S/M)** | B5 `normalizeText` + `otherSide()` helper + `getClientZone` rename; C4 `Promise.all` loops; C7 `reject`/`endGame` helpers; knip's 84 unused exports | `pnpm test:changed`, then `pnpm test`; `pnpm audit:oracle` after the `normalizeText` merge (parser-adjacent) |
| **7 — netcode default + shadow (Opus, M, gated)** | B1 default `SERVER_AUTHORITATIVE=1`, delete `shadow.mjs` + `/debug/shadow-report`; B7 read sites through `card-state.mjs` | `pnpm test`, `pnpm test:flip`, `pnpm test:2p`; user gate (netcode) |
| **8 — later, optional** | B4 splits of `reduce.mjs` / `chat-buttons.js` / `rules-bridge.js`; B6 extension rename; E1 remote branch prune (user's call) | full `pnpm test` + `pnpm audit:oracle` |

---

## 4. Coverage

**Checked and cleared:** Socket.IO event pairing (0 orphans); server TCGdex proxy (cache, cooldown, timeout all present); IndexedDB cache design D102/D164; asset directories other than `sprites/`, `holo/`, `playmats/custom/` (100 % referenced by catalog); side-effect imports (none); `bot/`, `docs/`, `.vscode/`, `.claude/agents`, `.claude/skills`, hook wiring and runtime; `.agent/areas/` sizing; commit hygiene (`wip:` 2/1098); duplicate test basenames; `(assumed)` decisions (none in the active file).

**Not reached (budget / environment):** user-level `~/.claude/CLAUDE.md`, `RTK.md` and the Windows memory folder (absent in this container); the primary folder's uncommitted edits (clean here); stale local worktrees on the user's machine; live measurement of the coin-picker download (A9) and of the boot waterfall in a browser (numbers above are static-graph bytes); `pnpm audit:oracle` timing; per-file CSS dedupe beyond the investigator's estimate (~30 KB reclaimable of 424 KB, mostly the `self-`/`opp-containers.css` mirror pair — 220 differing lines after `self`/`opp` normalisation — and the `holo/*-rare.css` family; I72's battle-log block plus the dead attack-panel/attack-zone/load-status rules ≈ 9.5 KB).
