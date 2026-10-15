# 071: Build & Battle as a TCG Live "run" (replaces the one-shot box flow)
Status: approved (user — "one shot it, then have a hostile review", 2026-10-15)
Date: 2026-10-15 · Session: S(current)

## Problem
`/build-and-battle` is a box simulator: pick a box, open it, build, Play (designs 051–055). TCG Live's
Build & Battle is a *run*: buy in, the box opens, a lobby map of match nodes tracks `x/N Matches`, the
player edits the deck between matches, plays them one by one, and the run ends after the last match or a
forfeit. The user asked for that mode to replace the current flow and for the old code to stay available.

Brief (verbatim): "Implement the build and battle gamemode from pokemon tcg live (from e:/tcglive_extract).
Have it replace the existing build and battle, but keep the original code left over in case we need it
in the future." Follow-ups: 5 matches · no reward ladder · collect screen shows the run only · old flow at
`/build-and-battle/legacy` · player picks any of the 42 boxes · "One shot it, then have a hostile review".

## Acceptance
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| A1 | TCG Live B&B mode (run: buy-in, box opening, lobby of match nodes, per-match progress, forfeit, end) replaces the existing flow at `/build-and-battle` | run-state/run-view/controller tests; route markup test |
| A2 | Original code kept, reachable | `/build-and-battle-legacy` + the `/build-and-battle/legacy` 302 asserted in `bnb-run-test.mjs` (server.js is not unit-testable); legacy controller untouched; `bb-box-picker-test.mjs`, `bb-room-reset-test.mjs`, `room-format-test.mjs` ALL PASS against the worktree server |
| A3 | Results recorded from game ends | run-reporter tests; `bnb-run-test.mjs` dispatches `rules-game-ended` on a real game tab (a full two-player game to the end is a manual check) |
| A4 | Deck rules as the mode's rules doc | existing deck-validation tests (rules doc cited) |

## Assumptions
- (assumed) Rematch in same room does not auto-count; lobby Play re-arms (design Options 4).
- (assumed) "Classic box opener" link kept on buy-in; sprites vendored from the extract.
- (assumed) Run is per browser (localStorage), not per account.

## Source (looked up, not recalled — E:\tcglive_extract)
- Run lifecycle: `Code/BuildAndBattleFeature/…DataTypes/RunStatus.cs` (Invalid, InProgress, Ended,
  RewardsGranted), `BuildAndBattleResponse.cs` (matchResults: List<bool>, eventMatchCount, runEndedEarly,
  deckGuid, Upfront seed deck / boosters / promo), `BnbEvent.cs` (MatchCount, Win/LossRewardsLadder,
  EntryCost).
- Lobby: `TPCI.RainierClient/_Rainier.Features.BuildAndBattle/HUBBnbLobbyRunController.cs` (Play, Edit Deck,
  invalid-deck icon, forfeit, mode info, run-over state), `BnBMapDisplay.cs` (node states: completed
  win/loss, current, unreached), `BnBLobbySceneViewBindings.cs` (`{0}/{1} Matches` meter).
- Deck rules: `config-cache/rules-build-and-battle_0.1.json` — exactly 40, ≥1 Basic, ≤1 ACE SPEC,
  ≤1 Radiant, 1 per name for Prism Star, per-name cap 99, deck built only from the run's card inventory
  (`BnBLobbySceneViewBindings.EditBnBDeck` passes `_bnbInventory.Keys`). Already enforced by
  `deck-validation.mjs` `BUILD_BATTLE_DECK_RULES` + `validatePoolDeck`; no rule change.
- Strings: `WebApp/tools/tmp/ui_backup_1012/loc_en.json` keys `rain_bnb_*`, `global_buildandbattle_mode`.
- Sprites: `WebApp/assets/ui/_data_sharedassets1|3/UI_BnB_*.webp` (MatchProgress_MeterFrame(+_Complete),
  WinLoss_BG, Lobby_Play_L, Carousel_SplashArt 1–3, Popup_* mascots).
- NOT in the extract (server data): real MatchCount, reward ladders, entry cost. `FakeBnBLobbyData.MatchCount = 5`
  is a test fixture and the only number in the client.

## Constraints
- User decisions (2026-10-15): 5 matches; no reward ladder; collect screen shows the run only (nothing
  persisted to the collection); old flow reachable at `/build-and-battle/legacy`; player picks any of the 42 boxes.
- No build step, no new dependency (PROJECT.md). Same-origin tabs; builder tab closes itself on Play
  (`createRemoteGameLink.play` → `window.close()`, native-deck-builder.js:223-226), so the *game tab* must
  record the match result into localStorage; the builder tab reads it on its next open (D183: game tab
  never writes deck cards — it writes only the run record's result fields).
- Engine, rules and netcode untouched. Prize count stays driven by deck format (`'build-battle'` → 4).
- The legacy controller/modules are not edited, so their tests stay valid.
- Comments only for constraints; match file style (ES modules, pure `core/*.mjs`, DOM in `sidebox/*.js`).

## Current state (read this session)
- Route: server.js:247-255 renders `index` with `builderWindow:true, builderMode:'build-battle'`;
  index.ejs:5 `isBuildBattle`, :259-261 tab buttons `#buildBattleTabBox/#buildBattleTabPool`, :301-303
  panels `#buildBattleBoxPanel/#buildBattlePoolPanel`.
- builder-window.mjs:39-41 `resolveBuilderMode(pathname)`; initialize-sidebox.js:22-23 passes role/mode.
- native-deck-builder.js:1858-1895 builds `buildBattle = initializeBuildBattle({...})` and uses its
  `poolErrors/refresh/setRoom/initialMode`; :1383-1384 gates Play on pool+deck validity; :366-376 Play.
- native-deck-builder-build-battle.js: box picker, `openBox`, session persistence (`ptcg-sim.build-battle.v1`),
  unboxing stage, pool grid — all closure-private; room-bound (`sessionBelongsHere`).
- Game end: apply-view.js:2005-2136 dispatches `document` CustomEvent `rules-game-ended`
  `{winner, reason, isWinner, title}` once per game (2-player netcode path only; local/solo dispatches carry
  only `{reason}`). No concede feature exists.
- Pure modules reusable as-is: box-catalog, box-data `loadBoxData`, pack-opening `openBox/poolFromBox/
  startingDeckRows`, build-battle-session `createSession/parseSession/verifySessionCards/validatePoolDeck/
  canAddFromPool/deckCardCounts`, build-battle-view, unboxing, native-deck-builder-unboxing/stage.

## Options
1. **New controller vs. editing the legacy controller.** A: add `runMode` branches to
   native-deck-builder-build-battle.js — mutates the code the user wants preserved, 725 lines of
   room-binding logic to special-case. B: new `native-deck-builder-bnb-run.js` composing the same pure
   modules; ~60 lines of pool-grid DOM duplicated. **Pick B**: legacy stays byte-identical and tested.
2. **How the legacy flow stays reachable.** A: `/build-and-battle/legacy` path → flow `'legacy'`; default flow
   constant `BUILD_BATTLE_DEFAULT_FLOW = 'run'` (one constant to flip back). B: query param. **Pick A**: paths
   already drive role/mode (`resolveBuilderRole/Mode`), and e2e scripts can name it.
3. **Where run state lives.** A: extend the legacy session key. B: new key `ptcg-sim.build-battle-run.v1`
   holding the run record with the opened-box `session` embedded (validated through `parseSession`).
   **Pick B**: legacy at `/legacy` shares neither key nor room binding; a run is not room-bound (it spans
   matches and rematches).
4. **Who records a match.** A: builder tab listens — impossible, it closes on Play. B: game tab listener on
   `rules-game-ended`, applied only when the run is *armed* (the lobby's Play sets `armedAt`) and the detail
   has a boolean `isWinner` and a `winner`. C: manual only. **Pick B + a small manual
   "Record result" fallback** in the lobby (draws, solo/local engine, closed game tab). Arming makes
   rematches not auto-count: the player returns to the lobby and presses Play again (one node per Play, as TCG Live).
5. **Tab wiring.** A: new `run` mode in `switchMode`. B: relabel the existing Box tab/panel in run flow
   ("Run"), keep ids. **Pick B**: zero change to `switchMode`; ids are internal. Box tab's old content has
   no role in the run flow (after opening you go to the lobby, not a box screen).
6. **Lobby map.** A: port TCG Live's 3D ring scene. B: 2D row of five nodes using the vendored
   MeterFrame/WinLoss sprites, current node highlighted. **Pick B**: the 3D scene is Unity-only.
7. **Opening scene.** Reuse `mountUnboxingScene` on the fullscreen stage exactly as legacy does (design
   052/055 already imitate TCG Live's opening); on finish the lobby opens and the Pool tab holds the cards.
8. **Rewards UI.** With no ladder there is no Reward Pool / prospective-rewards popup and node clicks do
   nothing. The end screen is a run summary, not a reward claim. Trainer Tips omitted (loc strings exist
   for ~7 sets only) — listed out of scope.

## Design
### Pure modules — `client/src/setup/deck-builder/core/build-battle-run/`
`run-state.mjs`
```
RUN_STORAGE_KEY = 'ptcg-sim.build-battle-run.v1'; RUN_VERSION = 1
RUN_MATCH_COUNT = 5; ARMED_TTL_MS = 12 * 60 * 60 * 1000
Run = { version:1, status:'in-progress'|'ended', boxKey, seed, startedAt, results:boolean[],
        endedEarly:boolean, armedAt:number|null, session:Session }
createRun({ session, now })            -> Run (in-progress, results [], armedAt null)
armMatch(run, now)                     -> Run | same run if status!=='in-progress' or finished
recordResult(run, won, now)            -> Run  (appends; length==MATCH_COUNT → status 'ended')
forfeitRun(run, now)                   -> Run  (status 'ended', endedEarly true)
consumeArmedResult(run, won, now)      -> Run | null (null when not armed, expired, or not in progress)
runProgress(run)                       -> { wins, losses, played, total, finished, canPlay,
                                            nodes:[{index, state:'win'|'loss'|'current'|'upcoming'}] }
parseRun(json) -> Run|null (strict: version, status enum, results booleans ≤ 5, session via parseSession)
loadRun(storage) / saveRun(storage, run) -> boolean / clearRun(storage) -> boolean   (all guarded)
```
`run-view.mjs` — UI strings (TCG Live text; adaptations marked) and helpers:
`RUN_TEXT` { title 'Build & Battle Mode', carousel ×3, startConfirm 'Are you sure you'd like to begin Build & Battle Mode?',
progress '{0}/{1} Matches', modeInfo ×2 (rain_bnb_gamemode_explanation_body1 reworded: no rewards, rain_bnb_…body2 verbatim),
deckInvalid 'The deck you are editing is not valid for play in Build & Battle Mode.', forfeitConfirm (adapted),
runOver 'Run complete'}; `progressLabel(progress)`; `matchResultLine(index, won)`.

### Reporter — game tab
`run-reporter.mjs` (pure): `reportMatchResult(storage, detail, now)` — loads run, `consumeArmedResult(run,
detail.isWinner)`, saves; returns the run or null. Ignored unless `typeof detail.isWinner==='boolean' && detail.winner`.
`sidebox/bnb-run-reporter.js`: `installRunReporter({ document, storage })` adds the `rules-game-ended` listener;
installed from `initializeSidebox` only when `role==='host'`.

### Flow resolution
`builder-window.mjs`: `BUILD_BATTLE_LEGACY_PATH='/build-and-battle/legacy'`,
`BUILD_BATTLE_DEFAULT_FLOW='run'`, `resolveBuildBattleFlow(pathname) -> 'run'|'legacy'`
(`/build-and-battle/legacy` → legacy; every other build-battle path → default flow). `resolveBuilderRole/Mode`
treat the legacy path as editor/'build-battle'. server.js: `/build-and-battle/legacy` renders index with
`builderMode:'build-battle', buildBattleFlow:'legacy'`; `/build-and-battle` with `buildBattleFlow` = default.
index.ejs: run flow renders tab label "Run" for `#buildBattleTabBox`, body class adds `bb-flow-run`.

### Run controller — `sidebox/native-deck-builder-bnb-run.js`
`initializeBuildBattleRun({ runPanelEl, poolPanelEl, deckLibrary, getTarget, getDeck, addToDeck,
showUnsavedDeck, detachEditor, showPool, showRun, onPreviewCard, getPlayState, play })` →
`{ poolErrors, initialMode, refresh, setRoom /*no-op*/, playBlock, onPlay }`.
Screens (all inside `runPanelEl`, re-rendered from `loadRun`):
1. **Buy-in** (no run): header "Build & Battle Mode", 3-page carousel (captions + splash sprites), era chips +
   box select (legacy picker markup/classes reused), "Start run" → confirm popup → `loadBoxData`, `openBox`,
   `createSession({roomId:null})`, `createRun`, `saveRun`, open box deck via `deckLibrary.createAndOpenDeck(
   …, {format:'build-battle'})`, unboxing on the stage, then Lobby. Small link "Classic box opener".
2. **Lobby** (in-progress): box logo, `{wins+losses}/5 Matches` meter, five nodes, deck-validity icon + first
   error, **Play** (calls `play()`; disabled when `getPlayState().disabled`), **Edit Deck** (→ `showPool()`),
   **Mode info** popup, **Forfeit** (confirm → `forfeitRun`), `<details>` manual "Record result" Win/Loss.
   Play press: `armMatch` + `saveRun` then `play()`.
3. **Run complete** (ended): record `W–L`, per-match list, ended-early note, cards kept line, "Done" →
   `clearRun` + `clearSession`-equivalent (the embedded session goes with the run), detach editor, buy-in.
`storage` event on `RUN_STORAGE_KEY` re-renders (a game tab recorded a result while this tab was open).
Unboxing resume: a run whose `session.unboxing.stage !== 'done'` re-opens the stage on load (legacy parity).
At the deck limit the editor deck is kept in `session.unsavedDeck` exactly as legacy (I207).
`native-deck-builder.js` changes (additive): accept `flow`; when `isBuildBattle && flow==='run'` build the run
controller instead; `playButton` click calls `buildBattle?.onPlay?.()` first; Play gating adds
`buildBattle?.playBlock?.()`.

### CSS / assets
`css/deck-builder-bnb-run.css` (imported after deck-builder-build-battle.css; scoped `.bb-flow-run`, `.bnb-*`),
sprites vendored to `client/src/assets/build-battle/run/` by `scripts/build-battle/vendor-run-ui.mjs <extractDir>`
(copies the listed webps; test checks the files exist). Visual-only: user checks on localhost.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No stored run | Buy-in screen | [ ] |
| 2 | Corrupt / wrong-version run JSON | `parseRun` null → buy-in; stored value left until replaced | [ ] |
| 3 | `results` longer than 5 or non-boolean | parse rejects | [ ] |
| 4 | Result when not armed | ignored, run unchanged | [ ] |
| 5 | Armed more than 12 h ago | ignored | [ ] |
| 6 | Same game ends twice (event replay) | second ignored: first consumed `armedAt` | [ ] |
| 7 | 5th result | status `ended`, endedEarly false; Play disabled | [ ] |
| 8 | Forfeit with 0..4 played | status `ended`, endedEarly true, results kept | [ ] |
| 9 | Result after run ended/forfeited | ignored | [ ] |
| 10 | Draw / no winner / solo local engine | not recorded automatically; manual Record result | [ ] |
| 11 | Storage unavailable / throws | run lives in memory; banner "will not survive a reload"; Play works | [ ] |
| 12 | Box data fails to load | error line on buy-in, no run created (legacy row 5) | [ ] |
| 13 | Reload mid-unboxing | stage reopens at saved beat | [ ] |
| 14 | Saved session cards no longer match box data | run discarded with a note; buy-in | [ ] |
| 15 | Deck invalid (≠40, pool, Basic, ACE…) | invalid icon + first error; Play disabled | [ ] |
| 16 | Play with no game tab (builder opened directly) | Play disabled with legacy tooltip | [ ] |
| 17 | Two builder tabs, one run | last write wins; `storage` event refreshes the other | [ ] |
| 18 | Leaving/joining a room mid-run | run unaffected (not room-bound) | [ ] |
| 19 | Deck limit in My Decks | deck kept in `session.unsavedDeck`, banner (I207 parity) | [ ] |
| 20 | `/build-and-battle/legacy` | legacy flow, its own key; run record untouched | [ ] |
| 21 | Spectator / opponent Play in same room | each tab has own run; result keyed to local `isWinner` | [ ] |

## Test plan
- Unit (`node --test`): run-state transitions & parse (rows 1–9), run-reporter (4–6, 10), view strings/progress,
  `resolveBuildBattleFlow`, server route render (`builder-window-markup.test.mjs` pattern).
- DOM: controller test with the harness used by native-deck-builder-build-battle.test.mjs (buy-in → start →
  lobby → forfeit → summary; rows 11–16, 19).
- E2E scripts `bb-box-picker-test.mjs`, `bb-room-reset-test.mjs` repointed to `/build-and-battle/legacy`.
- Manual (user, localhost, SERVER_AUTHORITATIVE=1): two tabs, win one match, confirm node fills and Play re-arms.

## Migration / rollout
No data migration. New key only. Revert: set `BUILD_BATTLE_DEFAULT_FLOW = 'legacy'` (one line); delete
`ptcg-sim.build-battle-run.v1` is harmless. Legacy data under `ptcg-sim.build-battle.v1` is never read by the run flow.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Run model | create core/build-battle-run/run-state.mjs, run-view.mjs, __tests__/run-state.test.mjs, run-view.test.mjs | as in Design | create→status in-progress, results [] · record true,false → results [true,false], played 2 · 5th → ended · forfeit at 2 → ended, endedEarly · armed 13 h ago → consumeArmedResult null · parseRun('{') null | RunStatus/MatchCount: Code/BuildAndBattleFeature DataTypes; 5 = user | `node --test` on the two files |
| 2 Reporter + flow | create run-reporter.mjs, sidebox/bnb-run-reporter.js, tests; modify builder-window.mjs (+test), initialize-sidebox.js, server.js (+builder-window-markup test), index.ejs | `reportMatchResult`, `installRunReporter`, `resolveBuildBattleFlow` | detail {winner:'p1', isWinner:true} armed → results [true] · {reason:'x'} → null · `/build-and-battle/legacy` → 'legacy', `/build-and-battle` → 'run' · route markup contains flow | — | `pnpm test:changed` |
| 3 Controller | create sidebox/native-deck-builder-bnb-run.js + test; modify native-deck-builder.js (flow, onPlay, playBlock), index.ejs tab label, repoint 2 e2e scripts | as in Design | start run → run saved, lobby shows `0/5 Matches` · forfeit → summary `endedEarly` · Play armed (`armedAt` set) · invalid deck → Play disabled | strings: loc_en.json rain_bnb_* | `pnpm test:changed`; lint touched files |
| 4 Look | create css/deck-builder-bnb-run.css, scripts/build-battle/vendor-run-ui.mjs, assets, test for asset list; modify css/index.css | `.bnb-*` selectors | vendored files exist (test) | sprites: WebApp/assets/ui UI_BnB_* | `pnpm test:changed`; user localhost check |
| 5 Close | MAP.md, area doc deck-builder.md, DECISIONS.md lines, ISSUES (Trainer Tips, ladders) | — | full `pnpm test` if `pnpm gates` says REQUIRED | — | tests green |

## Deviations (Builder appends here during build)
- Legacy path is the sibling `/build-and-battle-legacy`, not `/build-and-battle/legacy`: the page's asset URLs
  are relative and break one level down. `/build-and-battle/legacy` 302s to it (query string kept).
- The tab label and `bb-flow-run` body class are set by the controller wiring in native-deck-builder.js, not
  index.ejs (the server does not know the default flow; it lives in builder-window.mjs). Index still renders
  "Box" for a frame.
- Controller option `play` became `requestPlay`; `getPlayState` reads the deck pane's Play button.
- Reporter takes `{ now, deckFormat }` and requires the end screen's `isWinner` or `isLoser`; apply-view.js
  gained `isLoser` on the `rules-game-ended` detail (additive). A Standard-deck game or a spectator never
  fills a node.
- Review fixes: unsaved-deck wipe before resume (I207 parity), Start run adopts a run another tab stored,
  Done only clears its own run, `?seed=` is first-run only, inline scene when no stage host, opener tab
  retargets from the legacy page, redirect keeps the query, rec-unboxing.mjs repointed to legacy.
- Known limits (ISSUES at landing): arming is not bound to a game or tab, so two game tabs in one browser
  share one run and the first reporter wins; a second tab adopting a mid-opening run plays its own scene;
  dialogs do not trap focus; the controller has no teardown for its `storage` listener.

---
Self-approval checklist: n/a — user reachable; gate = user approval.

## For the landing commit
- DECISIONS.md: run flow replaces the one-shot flow at `/build-and-battle`, legacy kept at
  `/build-and-battle-legacy` (flip `BUILD_BATTLE_DEFAULT_FLOW`); run state `ptcg-sim.build-battle-run.v1`,
  results recorded by the game tab (armed Play, 12 h TTL); 5 matches, no reward ladder (assumed — server data).
- MAP.md: `core/build-battle-run/` (run-state, run-view, run-reporter), `sidebox/native-deck-builder-bnb-run.js`,
  `sidebox/bnb-run-reporter.js`, `css/deck-builder-bnb-run.css`, `scripts/build-battle/{run-ui-assets,vendor-run-ui}.mjs`,
  `bnb-run-test.mjs`.
- Area doc deck-builder.md: the Run flow paragraph beside the Build & Battle one.
- ISSUES.md: the "Known limits" above; reward ladders / Trainer Tips cut (not in the extract / ~7 sets of strings).
- STATE.md: Focus line only if priorities changed; Light END.
