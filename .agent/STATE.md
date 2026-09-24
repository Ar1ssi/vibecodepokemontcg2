# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 281
Focus: S281 feature: Tera entry + crystal skin take the card's type colour (D122, design 037 amendment).
Active: none.
Next: maintenance due (S270 and S280, still not run). User visual check of typed Tera entry/skin, Mega vortex
  in a real rules-mode game.
  I126/I127 (retreat-cost: energy-conditional variants + inspector tile), I121-I125 (design 032
  leftovers); I113 oracle still cannot see damage amounts for immunity/prevention.
  Design numbers collide: 032-oracle-execution-gate.md and 032-coin-gated-attack-sentences.md (code comments mean the latter).
  Still pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy (untested by policy).
  ISSUES Open still over cap.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Attack/ability execution gate: `pnpm audit:oracle` (~2 min, D108). Run after engine attack/ability changes; legit
  rate changes → `--update-baseline`, commit scripts/oracle-baseline.json. Later-turn markers are ORACLE_BLIND_FAMILIES.
- Editing via bash heredoc eats `\` → write edit scripts with the Write tool / String.raw.
  Timed attack effects are `card.attackMarkers` (D109, attackLock D113); copy attacks resolve before coins (D110).
- Mat FX: see D103, D117-D122. Canvas FX go through entry.js `playCanvasStage` (WAAPI clock). Board cards live in the
  playmat iframes (css/mat-ambient.css); `.card` is preserve-3d, so layer order inside a holo wrapper needs translateZ,
  not z-index. Holo wrappers need TCGdex (unreachable in the sandbox): emulate with buildHoloCard + `holo-wrapper-changed`.
  To eyeball an effect: Playwright on /?e2e=1, pause `document.getAnimations()`, step `currentTime`, wait 2 rAFs, screenshot.
- Pre-existing `pnpm test` failure: card-inspector-model "retreat greys…".
  ESLint runs after `pnpm install` (`npx eslint <files>`); the repo carries many prettier warnings, so lint touched files only.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S281 Tera crystal (entry prisms/floor/burst + lasting skin tint/facets/rim/glints) is the card's type colour;
  Colorless/unknown stays icy; orb, flash, jewel, rainbow universal.
- S280 Mega vortex = 3D brush strokes behind/in front of the card; Tera entry = S/V canvas Terastallization; Tera Pokémon
  keep a crystal skin while in play.
- S279 Mega orb is a 3D canvas shell (mega-orb.mjs): white-hot sphere → faceted cracked shell → perspective shatter.
