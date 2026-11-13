# Issue lines merged or rewritten in the 2026-11-13 maintain sweep — verbatim, with what replaced each.
# Grep the I-number. The live line is in .agent/ISSUES.md.

- I284 2026-11-13 P2 [tooling] e2e harness stale since D239, on the source build too: `pnpm test:solo` step 6 expects 7/8 hands before the Actives are placed; playtest-bot fails setup 0/3 ("timeout waiting for page predicate"). Scripts that `import('/src/…')` need the source build (refs: 088)
  → rewritten; new wording in ISSUES.md
- I245 2026-10-15 P2 [netcode] e2e tests failing on main (merged I245, I246): scripts/e2e/flip-gate-test.mjs step 3 throws `reading 'image'` via e2e-api.js:570, steps 1/2 flake; scripts/e2e/room-change-reset-test.mjs waits for a legacy coin-call picker the bridge auto-answers (design 072)
  → merged into I284
- I282 2026-11-09 P2 [mat-fx] stadium-environment-layout.test "environmentKeyFor gives every Homebrew Stadium in set.json a board" fails on origin/main: 27 committed customhb Stadiums unmapped (Altar of the Moone, Sky Field, Brooklet Hill…) — repro: node --test that file (design 077)
  → rewritten; new wording in ISSUES.md
- I270 2026-10-19 P3 [rules] Delinquent (PR #222) adds a third "If you do" gate: opponentDiscardFromHand rescans events for a Stadium cardMoved (trainer-steps.mjs:4536) though the executor has `cost` steps and `requiresStadiumDiscard` (executor.mjs:400, :483) — fold into one
  → rewritten; new wording in ISSUES.md
- I267 2026-10-19 P3 [rules] Delinquent opponentDiscardFromHand (trainer-steps.mjs:4530, PR #222) has no tests for an opponent hand under 3 (count clamps), an empty hand (`empty_hand`) or an effect shield (`effect_shield`)
  → merged into I270
- I268 2026-10-19 P3 [rules] Delinquent no-Stadium test (trainer-steps-missing.test.mjs:186) checks reason `no_stadium`, which discardStadium (trainer-steps.mjs:2190) also emits, so it cannot tell which step skipped — give the gate its own reason
  → merged into I270
- I269 2026-10-19 P3 [client] trainer-execution.js `_stadiumDiscardedByStep` (:82, PR #222) is module state never reset per runTrainerSteps; a later requiresStadium step with no discardStadium before it reads the last Trainer's value — reset it at run start
  → merged into I270
- I257 2026-10-16 P3 [board-ui] TCG Live foil gaps: Poké/Master Ball reverse (`_sph`/`_mph`/`_ph2`, ~600) not imported; sets ec, gum, me5-5m, smalt, xyalt, xybsp, swshbsp, mebsp #94–100, mee #9–16 unmapped (186+ cards keep CSS holo) (refs: D217)
  → rewritten; new wording in ISSUES.md
- I256 2026-10-16 P3 [board-ui] r2.dev public URL for foil textures is rate-limited and not for production; move ptcg-foil to a custom domain when one is on Cloudflare (refs: D217)
  → merged into I257
- I258 2026-10-16 P3 [board-ui] TCG Live foil costs ~12 MB GPU per live card (front + etch + plate, mipmapped); not measured with ~20 on screen or in mat iframes (refs: D217)
  → merged into I257
- I275 2026-11-01 P3 [mat-fx] Design 083 rows left for a later pass (lawn/marsh/island swells, raised beds, snow drifts, Magma rim rocks, billboard/sign blink, roof tones, Lab crates, Shelter floor marks): see 083 Deviations
  → rewritten; new wording in ISSUES.md
- I274 2026-10-31 P3 [mat-fx] KIT_LEAVES loops 27 cells per foliage pixel each plate redraw (30 fps while a board sways): measure on a low-end GPU; past budget, fade leaves to plain foliage (refs: D234, design 082)
  → merged into I275
- I44 2026-09-14 P3 [rules] Small rule gaps (merged I44, I60, I61, I62, I63, I64, I65): attack inheritance never inherits; `useVStarGX` never resolves the card; spent GX shown usable; Stadium grants read the Basic root; V-UNION and LEGEND play rules; no sudden-death mat (refs: D71, D78)
  → rewritten; new wording in ISSUES.md
- I1 2026-09-07 P2 [rules] Legacy ISSUES.txt items unverified: turn-start auto-draw both players (I1), +Turn/End Turn rework (I2), Garland Ray discard parse on multipliers (I3) (merged I1–I3)
  → merged into I44
- I121 2026-09-23 P3 [rules] Residuals of designs 032–039 (merged I121–I125, I137, I166, I167, I181): Bowed Whip/Blast Burn gates; unparsed Trainer conditions/steps (Lt. Surge, Kahili); ~160 conditional-status sentences and self-heal conditions unread; hand locks; copy-attack deferrals
  → rewritten; new wording in ISSUES.md
- I126 2026-09-23 P3 [rules] Energy-conditional team retreat abilities: Metal Bridge / Thunderclap Zone now zero the Active when it holds the typed Energy (S297, I161); Aqua Tube / Dark Cloak wordings still unapplied by `teamNoRetreatCostForActive` (refs: S277)
  → merged into I121
- I85 2026-09-23 P1 [feature] Match logging (user: IMPORTANT) — design 028 awaiting user approval (refs: S264)
  → rewritten; new wording in ISSUES.md
- I86 2026-09-23 P2 [feature] 30th Celebration + Classic Collection support — design 029 awaiting user approval (refs: S264)
  → merged into I85
- I247 2026-10-15 P3 [netcode] Design 072 seat-loss (merged I247, I248): a seat rejoining after the opening deal gets no dealOrder/turnOrderResult replay (Set Up shuffles locally after 45 s); a caller or coin winner whose socket blips is answered for at once, no reconnect grace (refs: design 072)
  → rewritten; new wording in ISSUES.md
- I73 2026-09-21 P3 [netcode] Battle logs diverge between players (merged I73, I74): reconnect catch-up skips appends while `isCatchingUp`; "Clear battle log" clears only the local client (refs: S230)
  → merged into I247
- I255 2026-10-15 P3 [netcode] joinGame/reconnect add the socket to the Socket.IO room before roomReject (server.js:789/:925 vs :810/:940/:949): rejected sockets get room broadcasts and keep roomInfo alive past the sweep; join only after the seat checks pass (refs: D216 review)
  → rewritten; new wording in ISSUES.md
- I153 2026-09-24 P3 [netcode] Events and pendingChoice payloads go unfiltered to both sockets; hidden info is safe only where the producer emits it redacted (design 038 option 3B: per-viewer event filtering in room.mjs) (refs: I141, design 038, S293)
  → merged into I255
- I263 2026-10-16 P3 [board-ui] Bench AttackOverlay (074 A2: attacks hidden, Retreat inert) has no DOM or e2e test; test-card-inspector-e2e covers the Active and stack view only (refs: D219, design 074)
  → rewritten; new wording in ISSUES.md
- I178 2026-09-22 P3 [board-ui] No remaining-HP readout (TCG Live shows HP depleting); design 024 O5 scoped it out as new persistent UI, not an effect. (refs: design 024) (PR #181 branch id I82)
  → merged into I263
- I201 2026-09-28 P3 [client] No UI to attack from the Bench: the engine accepts `attackerInstanceId` (I196, Alakazam ex Dimensional Hand) but chat-buttons.js / dual-run-bridge.js always attack with the Active (refs: S328)
  → merged into I263
- I266 2026-10-18 P3 [client] 074-three-board user-check items: TCG Live camera keeps the tilt hand size; focus mesh mode drops the holo tilt; far hand showed the deck rect one sample after the opp draw; deck keys send the legacy index for server cards; 2P join of the second e2e client times out under load
  → rewritten; new wording in ISSUES.md
- I262 2026-10-16 P3 [rules] attack-mirror-heal.test "Absorb Vitality" fails ('0' !== '20'), alone and in the full run, on main 87450d13 (2026-11-12). Client attack path (chat-buttons.js mirror heal): goes with design 087 slice 3 unless fixed first
  → closed 2026-11-13, shortened in ISSUES.md
- I261 2026-10-16 P3 [deck-builder] coin-normalize.test "committed coin catalog is already normalized" fails on a CRLF working copy of the catalog: compare normalizes line endings or .gitattributes pins LF
  → closed 2026-11-13, shortened in ISSUES.md
