# Decisions — binding choices, one line each, newest first. Do not relitigate without new info.
# Read by GREP, not wholesale: `grep -n "\[rules\]" .agent/DECISIONS.md` (scope tag) or `grep -n "D119"`.
# Format: `D<n> <YYYY-MM-DD> [scope] decision — why. (Supersedes D<m>.)` — ONE line, ≤220 chars.
#   Detail belongs in the design doc the line cites, not here.
# Caps: ≤90 active lines / ≤20 KB (`pnpm harness:check`). Superseded lines are deleted (git + archive keep them).
# Pruned, folded or shortened lines, verbatim: .agent/archive/DECISIONS-pruned-2026-11-13.md, DECISIONS-pruned-2026-10-15.md (grep the D-number).
# Full pre-2026-09-24 wording of every line: .agent/archive/DECISIONS-full-2026-09-24.md (grep it).
# ID collisions from parallel sessions: D43, D44, D86, D117–D120, D214 each exist twice — cite as `D119[rules]`.
#   Next id = highest D number in this file and the archives + 1 (next: D251).

- D250 2026-11-13 [harness] CI (.github/workflows/ci.yml) runs `eslint --quiet .` and the unit suite on pushes to main and on PRs: lint errors are a gate, formatting warnings are not.
- D249 2026-11-13 [mat-fx] A Stadium board is keyed by its Homebrew card's name (lower case, `-` joined), never its number: a set renumbering sent 22 Stadiums to no board or the wrong one (I282). (environmentKeyFor)
- D248 2026-11-13 [server] Access lives in server/access-policy.mjs: production admin UI only with its own ADMIN_PASSWORD, other origins only by ALLOWED_ORIGINS; the page loads the server's own /socket.io/socket.io.js.
- D247 2026-11-13 [server] Deploys serve an esbuild bundle (one hashed script + sheet, immutable); unhashed files are `no-cache`; dev stays unbundled ESM. Deps: esbuild, compression. (Amends D4; design 088)
- D246 2026-11-12 [client] The board outside a room stays (user): the client rules layer is its engine and is not deleted; 087 slice 3 struck. It draws nothing today (I283). (design 087)
- D245 2026-11-12 [netcode] Legacy relay removed: the server always runs the rules; SERVER_AUTHORITATIVE opt-outs only warn; no shadow mode; room-sweep.mjs frees roomInfo past grace. (Supersedes D216; design 087)
- D244 2026-11-09 [netcode] 073 deck boxes: the box id rides exchangeData/loadDeckData display-only (PROTOCOL_VERSION 2.3.0); the opening coin waits for the deal; boxes lie beside each deck on the table. (Folds D243)
- D242 2026-11-09 [deck-builder] Homebrew Build & Battle is the B&B tab's 'homebrew' flow (/homebrew-battle): customhb packs, Standard 60-card/6-Prize deck, ETB scene skinned as the 151 Ultra-Premium box. (design 086)
- D240 2026-11-05 [rules] Zygarde forms play as different Pokémon (10% Basic, 50% Stage 1, Complete Stage 2, Mega from Complete): form from the Pokédex entry, 4 copies per form. (pokemon-forms.mjs, user request)
- D239 2026-11-03 [engine] Server-side setup: the starter's turn-1 draw waits until both Starting Actives are placed, and placing one is the only game action until then — official order. (opening-draw.mjs)
- D236 2026-11-03 [mat-fx] Stadium boards: lights reach the ground through one contact glow (setGlows, 16 max); drift, foot-phased sway and LOOK.blink/pulse on every board, never over cards. (Folds D235, D237, D238)
- D234 2026-10-31 [mat-fx] Stadium boards look like BDSP: kit solids in one soft light per mood, no outlines, one ground kit; shaders read card footprints (fieldCalm) to stay calm round cards. (Folds D232; 080, 082)
- D231 2026-10-29 [mat-fx] Attack FX are per-type element shaders (instanced three.js meshes; own GLSL + committed TCG Live textures); canvas kits stay the 2D + cast fallback, with fxMod/fxLift. (Folds D229, D230; 079)
- D228 2026-10-25 [server] Custom sets reload live from custom-sets/ (fs.watch) and reach Render via R2 (publish.mjs, polled every 10 s; R2 overlays git); a set may carry foil.json + foil/*.webp. (Folds D225, D227)
- D223 2026-10-23 [server] Custom cards are TCGdex records served by the TCGdex proxy (`withCustomSets`): ids `custom<code>-<nnn>`, files in assets/custom-sets/<setId>/, `category` on each record. (Folds D224, D226)

## Active
- D220 2026-10-18 [client] The board is three.js only (074-three-board; user chose flag-then-delete): board-mirror shadow roots keep the iframe id set so legacy modules work unchanged; no fallback board, WebGL2 required.
- D221 2026-10-18 [netcode] Solo = a server room where one socket owns both seats (`cmd.seat`, `viewForSolo`, PROTOCOL_VERSION 2.2.0); the legacy DOM-rendered solo board is gone (074-three-board A2/A3).
- D222 2026-10-18 [harness] Number 074 names two designs (074-tcgl-attack-ui, 074-three-board): cite by file name. Slice builders stop at lint + unit tests; the session runs browser harnesses one at a time.
- D219 2026-10-16 [rules-ui] In-play taps follow TCG Live: own Active, or own Bench with a usable action, open the AttackOverlay; else the stack view. 013 print chrome retired for Pokémon. (Supersedes D210; design 074)
- D218 2026-10-16 [engine] Commands live in shared/engine/reduce/<domain>.mjs; reduce.mjs is a facade with the 3 exports; handlers get locals explicitly; reduce/ cycles are call-time only, never read at load. (I250)
- D217 2026-10-16 [board-ui] TCG Live foil/reverse cards wear its own shader+masks; lossless WebP streamed from R2 (`FOIL_TEXTURE_URL`), never in git; others keep CSS holo. (design 069-tcgl-card-foil)
- D215 2026-10-15 [board-ui] Custom playmats ship as WebP in `thumbs/` and `board/`; PNG originals in `custom/` are untracked. Don't rerun `generate-mat-thumbs.mjs` blindly: manifest.json lacks custom entries. (052f8ac)
- D214 2026-10-15 [harness] Playwright/jsdom e2e harnesses live in `scripts/e2e/`; the repo root holds config and entry docs only, no probe scripts, logs, `.bak` files or notes. (052f8ac, design 073)
- D213 2026-10-27 [deck-builder] Sleeves: the sleeve database dump (451), TCG Live art only for the 106 `cs_*` both have; database ids live on as `aliases`; importer output merged by hand. (Folds D214[deck-builder])
- D212 2026-10-15 [netcode] Opening coin is server-owned, as TCG Live: caller calls (15 s, else the server), server flips, winner picks, a silent winner goes first; client latch `openingStarted`. (Folds D51, D52; 072)
- D211 2026-10-15 [board-ui] Special Energy tokens are cut from the card's orb art, one per name, never drawn (user); finish = the art printing's; 2-Energy cards: two orbs; Basic-named Metal/Darkness need a Special tag.
- D208 2026-10-11 [rules-ui] Single-click on your own Active opens the TCG Live card focus; it ignores card/backdrop clicks for 500 ms after opening (a double-click's second click). Narrows D53. (Folds D209; design 067)
- D207 2026-10-08 [mat-fx] Evolutions (non-Mega/Tera) and devolutions play TCG Live's Card_Evolution/Devolution prefabs as pure timelines on one canvas per card (tcgl-canvas.js). (Supersedes D153, D155; design 066)
- D205 2026-10-08 [board-ui] Attack scenes play a main-series move chosen by type, species stats and tier; stats are vendored from Showdown's pokedex (MIT) by `pnpm vendor:species-stats`, never fetched. (design 063)
- D203 2026-10-07 [render] Audio = sampled TCG Live cues (sfx-cues → sample-bank), synth fallback; samples committed; ffmpeg is a dev tool for `pnpm sfx:import` only, never a dependency. (Folds D204; supersedes D147)
- D202 2026-10-01 [rules] WotC wordings are rewritten to the modern wording the parsers read; untyped WotC Trainers get trainerType from their printed rules line at data entry — no new templates. (design 062)
- D201 2026-10-01 [board-ui] Holo art window (`--art-*`) keys on `data-card-layout` (printed box per layout, Trainers apart); `data-card-era` only picks the foil pattern — one era spans boxes of different sizes.
- D200 2026-09-30 [rules] Markers TCGdex lacks (Tera, Team Plasma, Strike styles, Baby, Prism Star, TAG TEAM; Ancient/Future per printing) come from generated tables, never by name (paradoxTagOf). (Folds D196; I220, 058)
- D199 2026-09-30 [rules] "Choose 1" modes and deck-top order reuse the label-option and one-pick-per-position prompts, not new selectMode/orderCards pendingChoice types: same result, no netcode change. (design 061)
- D195 2026-09-29 [deck-builder] An Elite Trainer Box is a product, not a format: opening one adds counts to a localStorage collection (`ptcg-sim.collection.v1`) the Standard builder only badges. (design 057)
- D193 2026-09-29 [client] New dependency: three.js, pinned devDependency 0.185.0, vendored byte-identical into client/src/vendor/three/ (scripts/vendor-three.mjs), loaded by import() when a box opens. (design 055)
- D191 2026-09-28 [netcode] Match format is room-level: both seated players agree (propose/accept), the server keeps it on roomInfo/GameRoom.roomFormat, never in engine state; locks when the coin call opens. (design 053)
- D190 2026-09-28 [netcode] A deck `format` rides load-deck → `player.deckFormat` (sets Prize count; replayed by commandLog) and is checked at the deal, not at load (I202). (Folds D187; supersedes its load refusal.)
- D185 2026-09-28 [deck-builder] Build & Battle is a builder-tab mode (/build-and-battle); boxes are seeded `createRng(seed)`; its deck is a `format:'build-battle'` record. (Folds D186, D188, D189, D192; design 051)
- D183 2026-09-28 [deck-builder] The deck builder runs in its own browser tab (/deck-builder); game effects cross via a validated postMessage protocol; the game tab never writes deck cards. (user, design 050)
- D179 2026-09-26 [tooling] pkmncards scraping: one query per trainer subtype merged by URL + balanced-span name extraction (`scripts/lib/pkmn-article-html.mjs`); comma-OR queries drop rows. (S325)
- D178 2026-09-26 [rules] One-shot coin control: `withForcedCoinOnce` marks a shared `forcedCoinUsed`, releases to `forcedCoinParent`; `withForcedCoin` resets the one-shot fields (nulling broke Malamar). (S325)
- D177 2026-09-26 [rules] Rule-box attacker filters are clause-scoped any-of over "attacks from/of/by your opponent's"; reminders never gate; whole-text scans broke Pot Helmet. (S325)
- D167 2026-09-26 [harness] LSP: `.claude/settings.json` sets ENABLE_TOOL_SEARCH=auto so it loads at session start; the `typescript` devDependency + root jsconfig.json (checkJs off) exist only for it. (Folds D166)
- D164 2026-09-26 [netcode] Browser TCGdex reads go via the same-origin `/api/tcgdex` proxy (server/tcgdex-proxy.mjs) + IndexedDB cache (core/tcgdex-cache.mjs; D102) — direct calls got Cloudflare-blocked.
- D162 2026-09-25 [harness] Journal = commit messages; journal/ frozen; no Session counter; STATE/DECISIONS/ISSUES/MAP edited only in the commit landing on main - parallel sessions collided.
- D161 2026-09-25 [tests] `pnpm test` must be fully green: network tests are opt-in (`pnpm test:live`, LIVE_TESTS=1); `pnpm test:changed` runs the branch's sibling tests; globs, not file lists (D75).
- D149 2026-09-25 [tooling] Engine claims are ratcheted against scripts/*-baseline.json: `pnpm audit:oracle`, audit:abilities, audit:trainers (+ `trainerPlayBlockReason`), audit:attacks. (Folds D108, D124, D134)
- D146 2026-09-22 [render] Mat FX share one dispatch (`EVENT_FX` row → mat-fx/dispatcher.mjs → mat-fx/index.js) and pacing is data: fx-holds.mjs + fx-queue.mjs drain plans in engine order. (Folds D94; designs 022, 024)
- D143 2026-09-25 [rules] Special Energy is priced from printed provisions (D142); lasting passives run in one `settleSpecialEnergyPassives` sweep at the applyCommand tail; KO effects need an attack KO (D144). (S295)
- D126 2026-09-24 [rules] Ability activation legality is one reader, `abilityActivationBlockReason`; passive reads live in pure `rules/ability-combat.mjs`; `cardAbilityText` is the one text accessor. (Folds D125, D127)
- D122 2026-09-24 [mat-fx] Mega/Tera entries are canvas scenes (orb shell, brush vortex, Tera crystal by `teraPaletteFor`, skin) sharing `playCanvasStage`. (Folds D104, D118/D119/D121[mat-fx]; designs 035-037)
- D115 2026-09-23 [board-ui] #stadium's transform belongs to the table tilt; owner-facing flip is class `.stadium-opp-facing` rotating the img (`setStadiumFacing`), never an inline transform on #stadium. (S273)
- D107 2026-09-23 [rules] Attack effects run as parsed executor steps (design 030); coin sentences are steps, timed effects live in `card.attackMarkers`, locks are `attackLock` markers (D109-D113).
- D106 2026-09-23 [netcode] applyView moves a card node only when out of view order (`placeInViewOrder`) and never re-sets an unchanged `src` — re-inserting restarts foil/idle animations (blink). (S264)
- D105 2026-09-22 [mat-fx] `motionReduced()` ignores OS prefers-reduced-motion; opt-in only via `localStorage['ptcg-reduce-motion']==='1'` (Windows reports reduce whenever animations are off). (S260)
- D103 2026-09-22 [mat-fx] Mat effects run on WAAPI keyframes sampled from pure pose functions (`sampleKeyframes`/`animateFrames`), not rAF style writes; hit/KO wait on an impact queue (design 026).
- D100 2026-09-22 [deck-builder] Pokémon sprites are vendored (pokesprite gen-8), never hotlinked; Gen 9/Z-A sprites are user fan art in a hand-kept catalog, no shiny; decks store `sprites: [{slug, shiny}]`. (Folds D97)
- D96 2026-09-22 [deck-builder] Presentation splits pure models (`core/deck-counter.mjs`, `core/card-filters.mjs`) from DOM renderers; the Live restyle is one sheet, `deck-builder-live.css`, under `.db-live`. (Folds D95)
- D92 2026-09-21 [render] Coin material realism is one shared CSS system `css/coin/`; `resolveCoinEffect` derives finish from the catalog description; fixed light, never cursor. (S234)
- D87 2026-09-20 [rules] Ancient Traits are identified only by the printed Δ/θ/Ω/α marker (or "Delta …" name) via `ancientTraitIn`, tagged once in `parseAbility`; own audit script. (Supersedes D69, D72.) (S224)
- D84 2026-09-20 [deck-builder] Coin catalog normalized by committed `scripts/normalize-coin-catalog.mjs`; ids unique; the 202 Gen IX ids stay frozen (decks persist `coin.id`). (S219)
- D76 2026-09-19 [rules] One classification contract, `card-classify.mjs` (`prizesForKO`: VMAX/TAG TEAM/V-UNION/modern Mega ex 3, M/Primal-EX 2); `isExCard`/`isGxCard` need a separator before the suffix. (Folds D73)
- D71 2026-09-20 [rules] `handleKnockout` counts win WAYS per player; tiebreak only when both boards empty with equal ways; `isGameFrozen` (ended) vs `isGameConcluded` (ended or tiebreak). (Supersedes D62.) (S200)
- D66 2026-09-19 [rules] Two name normalisers stay distinct: evolution's `cleanPokemonName` vs deck-validation's `officialCardName`; only LV-stripping is shared. (S197)
- D61 2026-09-19 [rules] GX/VSTAR limits are per-player per-game `player.oncePerGame {vstarUsed,gxUsed}` (not `flags`, which `advanceTurn` rebuilds); GX = name ends "GX". (design 018)
- D57 2026-09-19 [rules-ui] Carousel never sets pointer capture over interactive slide content (`isSwipeBlockedTarget`); verify carousel UI with real input, not `el.click()`. (S189)
- D56 2026-09-19 [board-ui] Holofoil is lit by a fixed virtual light from card angle, never the cursor; it drifts on every surface, ignores prefers-reduced-motion, no opt-out (user). (Folds D34, D55; design 010)
- D54 2026-09-19 [rules] Ability position gate is in the ENGINE: `requiresActiveSpot` + `listAbilities({zone})` + `validateLegality`; matches only the restrictive conditional wording (design 015). (S182)
- D53 2026-09-19 [rules-ui] Card inspection and attack/ability selection live on double-click in one inspector; single-click = select-to-move (design 013). In-play Pokémon: D208, D219. (S174)
- D49 2026-09-18 [netcode] Manual tools are planned from the card registry and sent as the acting player; `card.faceDown` is redacted until `revealShortcut`; look-at-top is `peekDeck`, to the asker only. (Folds D47, D48)
- D46 2026-09-17 [rules] Prize entitlement (`player.flags.prizesOwed`) is settled by a server pendingChoice (`effectType:'prizes'`) that pauses the game until picked. (Supersedes D43[rules] self-collect.) (S170)
- D44[netcode] 2026-09-17 Socket commands carry integer `clientSeq ≥ 0` via `GameRoom.handleClientCommand`; replayed seq answers success+dedupe, never re-executes. (S168)
- D43[board-ui] 2026-09-17 Highlight palette: own side BLUE, far side RED; gold only means "attack payable"; "cannot act" = grey + red ✕. (user decision, S158)
- D40 2026-09-16 [rules] Evolutions stay attached under the Basic; rules read `evolvedView(zone, root)`; damage/conditions stay on the root. (S145)
- D39 2026-09-16 [engine] Multi-choice step progress lives in `resumeToken.context` keyed `<stepIndex>:<stepType>`; yes/no uses BARGAIN_YES/NO pseudo-ids. (S144)
- D36[netcode] 2026-09-16 Under server authority the legacy renderer never writes DOM for zones apply-view draws (`server-rendered-zones.mjs`); deck/pile covers stay legacy. (S142)
- D27 2026-09-11 [testing] Debug mode = the ?e2e=1 bridge + `window.__ptcg.debugMode(enabled)`; e2e mode is exempt from the 2P rules-forced-on lock; `stampE2eCard` stamps only e2eFixtureDeck() cards (D29).
- D24 2026-09-10 [deck-builder] Generation pills source sets from TCGdex `series`; map 9=sv, 8=swsh, 7=sm, 6=xy, 5=bw, 4=dp+pl, 3=ecard+ex, 2=neo, 1=base+gym (user call).
- D20 2026-09-10 [rules-ui] Pickers: either auto-move (no `pickOnly`) or `pickOnly:true` + manual move in `onPick` — never both; in-play Pokémon candidates use `openMatPick()`, not the carousel (D19, user).
- D16 2026-09-10 [netcode] reveal/hide commands only flip the sender's own cards; no cross-player reveal.
- D14 2026-09-09 [netcode] Server is sole turn authority (`reconcileTurnState`); cross-client parity compares public zones only, secret zones by count.
- D12 2026-09-09 [netcode] A `server_command` action gates its legacy body on `serverAuthoritative`; untranslatable commands fail OPEN to the legacy body.
- D11 2026-09-09 [netcode] Full authoritative rendering: client renders only from server views (O4 gate, user call). Closes I5, I6.
- D10 2026-09-09 [netcode] Card identity is translated, never punned: server mints instanceId, returns syncInstance→instanceId map; unresolvable hint drops the command.
- D9 2026-09-09 [netcode] Reconnect = bounded peer action-log catch-up (cap 200, 5 s) with a mandatory loud "reload and rejoin" failure branch.
- D6 2026-09-07 [netcode] Named-payload commands validate in a pure `applyCommand` reducer; undo = deterministic commandLog replay; models are pure (instanceId, Mulberry32 PRNG, D5). (design 001)
- D4 2026-09-07 [netcode] Shared engine in shared/ served at /shared; the source needs no bundler to run (deploys bundle it, D247) (design 001).
- D1–D3 2026-09-07 [stack] Node ES modules + native `node --test`; Express + Socket.IO + SQLite3; pure rules logic tested on plain objects, no jsdom. (observed)
