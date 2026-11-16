# Decisions pruned, folded or shortened in the 2026-11-13 maintain sweep — verbatim, with what replaced each.
# Grep the D-number. The live line is in .agent/DECISIONS.md.

- D244 2026-11-09 [netcode] 073: the deck box id rides exchangeData/loadDeckData as a display-only param after format (PROTOCOL_VERSION 2.3.0); the opening coin waits for the deal (deck-box-gate).
  → shortened or widened by a fold; new wording in DECISIONS.md
- D243 2026-11-09 [mat-fx] 073: deck boxes lie in the blurred band beside each deck and deal it at game start, drawn in the three.js board's table frame; lid = mesh cut at the cap groove + front flap.
  → folded into D244
- D242 2026-11-09 [deck-builder] Homebrew Build & Battle is the 'homebrew' flow of the B&B tab (/homebrew-battle): customhb packs, Standard 60-card/6-Prize deck, ETB scene skinned as the 151 Ultra-Premium exterior. (design 086)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D238 2026-11-03 [mat-fx] Scorched Earth's river is a layout path (lavaPath) off every card; Vitality's crown is three underlit shelves (kitGlow) with mist and light columns. (design 085)
  → folded into D236
- D237 2026-11-03 [mat-fx] (assumed) Forest of Vitality's tree stands top-left as the 084 audit asks, not 077's top right; HERO_SIDE flips it. (design 084)
  → folded into D236
- D236 2026-11-03 [mat-fx] Stadium lights reach their ground through one shared contact glow (setGlows, MAX_GLOWS 16); LOOK.pulse for soft LED; bake outputs fit half float (<65504). (design 084)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D235 2026-11-01 [mat-fx] Stadium boards live: drift on every board (one point shader, never over cards or the opp hand), foot-phased sway, LOOK.blink, per-instance tints, clumped scatters. (design 083)
  → folded into D236
- D234 2026-10-31 [mat-fx] Stadium boards look like BDSP: kit solids in one soft light per mood, no outlines, leaf splats; grounds from one ground kit; plate tilt-shift. (design 082; supersedes D233)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D232 2026-10-31 [mat-fx] Stadium boards keep the field calm: shaders read card footprints (fieldCalm) to fade detail, glow, particles and motion round cards; fine patterns fade by fwidth. (design 080)
  → folded into D234
- D231 2026-10-29 [mat-fx] Attack FX are per-type element shaders: instanced three.js meshes in the FX pass, emitted by element kits over canvas-kit methods/beats; canvas kits stay the 2D + cast fallback. (design 079)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D230 2026-10-29 [mat-fx] Element looks are hybrid: own GLSL for structure + committed TCG Live attack textures for detail; refraction reads one board copy per frame, only while a kind needs it. (design 079)
  → folded into D231
- D229 2026-10-25 [mat-fx] GPU-canvas paints take stackable modifiers (fxMod), lift (fxLift arc/stand) and a cast pass; drawers own dissolve and lift, kits texture. Designs 078/079 renumbered from 076/077 at landing.
  → folded into D231
- D228 2026-10-25 [server] Custom sets reach Render via R2: publish.mjs uploads blobs by sha256 + swaps index.json (rclone); the site polls it every 10 s, mirrors set.json, art lazily; R2 overlays git. (design 076)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D227 2026-10-25 [server] Custom sets reload live: server watches custom-sets/ (fs.watch, poll fallback), keeps a broken set's last good copy, emits `customSetsChanged`; cardback "Send to ptcg-sim" writes there. Design 075 addendum.
  → folded into D228
- D226 2026-10-25 [deck-builder] A custom set's /sets record carries each card's `category`, and fetchSetCards trusts it over the /cards?category= supertype index: those lists sit in IndexedDB for a day, so a set added since marked every custom Trainer as Pokémon.
  → folded into D223
- D225 2026-10-25 [deck-builder] Custom-set foil (I271): each set folder may hold foil.json + foil/<nnn>-<kind>.webp (cardback's TCG Live foil export, converted by scripts/custom-sets/import-foil.py); /api/tcgl-foil/config lists those sets and the client merges them into the foil manifest as base-printing records with a `dir`, so card textures load from the repo while shaders and shared material textures still need the texture host. Alternative rejected: upload to R2 keyed by TCGdex id (needs a deploy step per set, collides with the source card's own foil).
  → folded into D228
- D224 2026-10-23 [deck-builder] Custom set ids are `custom<code>` (code 2–5 [a-z0-9]), card ids `custom<code>-<nnn>`, files committed under client/src/assets/custom-sets/<setId>/ — one dash per id, no TCGdex collision, small repo-stored sets (user's call). (design 075)
  → folded into D223
- D223 2026-10-23 [server] Custom cards enter the sim as TCGdex records served by the TCGdex proxy (server/custom-sets.mjs `withCustomSets`) — one seam; deck builder, enrichment and engine parse them exactly like published cards. (design 075)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D222 2026-10-18 [harness] Number 074 names two designs from parallel sessions (074-tcgl-attack-ui, 074-three-board): cite by file name. Slice builders stop at lint + unit tests; the session runs browser harnesses one at a time.
  → shortened or widened by a fold; new wording in DECISIONS.md
- D219 2026-10-16 [rules-ui] In-play taps route as TCG Live: own Active, or own Bench with a usable action, open the AttackOverlay; else the stack view. 013 print chrome retired for Pokémon. (Supersedes D210; design 074)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D213 2026-10-16 [deck-builder] Sleeves are TCG Live's 415 (scripts/import-tcgl-sleeves.py: face crop 73-439 px, webp, ids `cs_*`), not the sleeve database; old stored ETB sleeve id remaps.
  → shortened or widened by a fold; new wording in DECISIONS.md
- D214 2026-10-27 [deck-builder] D213 narrowed: catalog is the sleeve database dump (451) with TCG Live art swapped in only where TCG Live has the same sleeve (106 `cs_*`, incl. 3 the starter decks use); other TCG Live sleeves and their webp are gone, database ids live on as `aliases`. Re-running import-tcgl-sleeves.py re-extracts all 415 into assets/sleeves/tcgl and a scratch catalog; merge by hand.
  → folded into D213
- D212 2026-10-15 [netcode] Opening coin follows TCG Live: caller calls, server flips, the winner picks first or second; a silent or dropped winner goes first. Extends D51. (design 072)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D209 2026-10-11 [board-ui] Card focus ignores card/backdrop clicks for 500 ms after opening: a double-click's second click would land on an attack panel. (design 067)
  → folded into D208
- D208 2026-10-11 [rules-ui] Single-click on your own Active opens the TCG Live card focus (CSS-3D lift on the game's 20° camera pose, hand drops, 013 panels on it); narrows D53 to Bench/Stadium. (user, design 067)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D204 2026-10-07 [tooling] ffmpeg/ffprobe on PATH are a dev-time system tool for `pnpm sfx:import` only, not an npm dependency; the game never needs them. (design 064)
  → folded into D203
- D203 2026-10-07 [render] Audio = sampled TCG Live cues (sfx-cues → sample-bank), synth as fallback; samples committed (user); hit samples land on their measured peak (D206). (Supersedes D147; design 064)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D200 2026-09-30 [rules] Markers TCGdex lacks (Tera, Team Plasma, Strike styles, Baby, Prism Star, TAG TEAM) come from a generated table: pkmncards is:/stage: lists matched to TCGdex by number and name. (I220)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D196 2026-09-29 [rules] Ancient/Future tags are looked up per printing in a generated table (pokemontcg.io subtypes, ids name-checked on TCGdex), never by name; readers call paradoxTagOf. (design 058)
  → folded into D200
- D167 2026-09-26 [harness] `.claude/settings.json` sets ENABLE_TOOL_SEARCH=auto so LSP loads at session start (deferred LSP went unused); ~+9k tokens/session, auto defers past 10% of the window.
  → shortened or widened by a fold; new wording in DECISIONS.md
- D166 2026-09-26 [harness] `typescript` devDependency + root `jsconfig.json` (checkJs off) exist only for the LSP tool — typescript-language-server failed without them; jsconfig makes findReferences project-wide.
  → folded into D167
- D149 2026-09-25 [tooling] `pnpm audit:attacks` ratchets each corpus attack's verdict (ok/partial/ran-no-effect/engine-error) against scripts/attack-behaviour-baseline.json; a regression fails by name. (design 036)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D146 2026-09-22 [render] FX pacing is data: fx-holds.mjs table + fx-queue.mjs drains plans in engine order, budget-capped; an effect returning a number overrides its hold. (design 024)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D134 2026-09-24 [tooling] `pnpm audit:abilities` classes each printed ability from `resolveAbilitySteps` + the oracle's state change; passives by behaviour probes (D135); claims come from evidence (D136). (design 034)
  → folded into D149
- D126 2026-09-24 [rules] Ability activation legality is ONE reader, `abilityActivationBlockReason` (ability-combat.mjs), used by validateLegality and the picker; `addCondition` gates status immunity. (design 034)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D125 2026-09-24 [rules] Ability passive reads live in pure `rules/ability-combat.mjs`; tool-combat/stadium-effects never import it (acyclic); `cardAbilityText` is the only text accessor. (Folds D127; design 034)
  → folded into D126
- D124 2026-09-24 [rules] `pnpm audit:trainers` ratchets per-card trainer gaps and play conditions against scripts/trainer-behaviour-baseline.json; conditions gate in pure `trainerPlayBlockReason`. (design 035)
  → folded into D149
- D108 2026-09-23 [tooling] Attack/ability execution claims are gated by `pnpm audit:oracle` (~2 min) against scripts/oracle-baseline.json; 0-row families only via ORACLE_BLIND_FAMILIES with a reason. (design 032)
  → folded into D149
- D100 2026-09-22 [deck-builder] Gen 9 and Legends Z-A/Mega Dimension sprites are user fan art in hand-kept `pokemon-sprite-catalog-gen9.mjs` + `gen9/regular/`; no shiny art, so shiny is never stored. (D101; S255)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D97 2026-09-22 [deck-builder] Pokémon sprites are VENDORED (pokesprite gen-8, scripts/generate-pokemon-sprites.mjs), not hotlinked; a deck stores `sprites: [{slug, shiny}]` normalized by `parseLibrary`. (S253)
  → folded into D100
- D96 2026-09-22 [deck-builder] Presentation splits pure model (`core/deck-counter.mjs`, `core/card-filters.mjs`; OR within group, AND across) from DOM renderers. (S252)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D95 2026-09-22 [deck-builder] PTCG Live restyle = one stylesheet `css/deck-builder-live.css`, every rule under `.db-live`; themes differ only by the top token block; dark default. (S252)
  → folded into D96
- D94 2026-09-21 [render] Mat cosmetic FX share ONE dispatch: `EVENT_FX` row → `mat-fx/dispatcher.mjs` → registry `mat-fx/index.js`; never a second handler (design 022).
  → folded into D146
- D76 2026-09-19 [rules] One card-classification contract: `rules/card-classify.mjs` (`isRuleBoxPokemon`, `prizesForKO`); VMAX/TAG TEAM/V-UNION = 3 Prizes, modern "Mega … ex" 3, "M …-EX"/"Primal …-EX" 2 (D89).
  → shortened or widened by a fold; new wording in DECISIONS.md
- D73 2026-09-20 [rules] `isExCard`/`isGxCard` need a separator before the suffix (Toxapex is not ex); `isExCard` unifies ex/EX engine-wide, so Team Flare Hyper Gear accepts modern ex (D74). (S203)
  → folded into D76
- D56 2026-09-19 [board-ui] Holofoil drifts on every surface while not held by the cursor and ignores prefers-reduced-motion; no holo opt-out (user decisions). (Folds D55; S186-188)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D52 2026-09-18 [netcode] Client opening sequence is guarded by an `openingStarted` latch, never `rulesState.phase === 'setup'`. (S173)
  → folded into D212
- D51 2026-09-18 [netcode] Opening turn order is a server-owned coin call on GameRoom (not GameState); silent caller for 15 s is called for by the server. (S173)
  → folded into D212
- D49 2026-09-18 [netcode] "Look at top/bottom N" is a `peekDeck` request to the asker only (no state change); picks leave as moveCard; opponent deck peek only with rules off. (S171)
  → shortened or widened by a fold; new wording in DECISIONS.md
- D48 2026-09-18 [netcode] Face-down card: `card.faceDown`, redacted for everyone until `revealShortcut`; flag swept off non-board cards each command; seeded pick. (S171)
  → folded into D49
- D47 2026-09-18 [netcode] Manual board tools are planned from the card registry (`manual-card-commands.mjs`) and sent as the acting player, never via the owner. (S171)
  → folded into D49
- D34 2026-09-15 [ui] Holo foil lit by a fixed virtual light from card angle (`computeLightVars`), never the cursor; ink mask only for CORS-verified hosts (design 010). (Supersedes D31.)
  → folded into D56
