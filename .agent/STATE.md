# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 234
Focus: Feature — realistic coin materials CSS: fixed virtual light + environment / specular /
  luminance-relief layers (techniques 1–3 of the coin-material audit; 4–5 deferred).
Active: none.
Next: User visual check of the coin picker + mat token, then commit/merge `feature/coin-material-realism`.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Coin effects (S234/D92): `client/src/css/coin/` (`base` + one file per material + `finish`) is the ONE
  source of coin material styling; `index.css` (picker) and `mat-coin.css` (playmat iframes) only
  `@import url('./coin/coin.css')` + sizing/position. `coin-effects.mjs` resolves `data-coin-material` /
  `data-coin-finish` (finish derived from `description`; NOT invented) and drives `--coin-light-x/y`
  (fixed light from angle, never the cursor) via `wireCoinPointerLight` (picker) / `startCoinDrift` (mat).
  Never put `filter`/`isolation`/`opacity` on `.coin-3d`/`.coin-face` — it flattens the flip's
  `preserve-3d` (contract-tested). Metallics mask `.coin__spec` by the coin's own art (`--coin-relief`).
- Concurrent writers collided on `.agent` (S230/S233 vs S231/S232). S234's coin files are in the PRIMARY
  uncommitted, plus worktree `coin-materials-wt`; S233 battle-log and S232 GX `oncePerGame` are also recent.
  Re-read `git log`/`git status` before assuming what is on main.
- Battle-log mapper (S233/D91): `client/src/setup/netcode/server-battle-log.mjs` is the single
  server-event→text map, wired as `onAdvisoryEvent`; don't reintroduce a second text handler.
- Ability-step executor contract (S229): `parseAbility`'s `discardCostAbility` emits `energyOnly` /
  `basicOnly` / `energyTypes`; `moveDamageAbility` is in `EXTRA_STEP_HANDLERS`. A new step type needs
  BOTH parser-output fields and a handler.
- Mega prize split (D89): `prizesForKO` → **3** for `isModernMegaCard`, **2** for `isLegacyMegaCard`;
  `isModernMegaCard` checks the legacy name form first. Mega turn-end reads the same two predicates.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S234 feature: coin material CSS — shared `css/coin/` + `coin-effects.mjs` (fixed light, studio env,
  per-material specular, luminance relief mask, holofoil/mirror finishes); 13 new tests, full suite
  2651/2651, headless smoke 939 coins / 0 page errors. UNCOMMITTED (primary + worktree).
- S233 feature: authoritative battle-log narration (design 021/I71) — pure event→text mapper + server
  `trainerPlayed`, `cardAttached` non-Pokémon gate; 23 tests, 2635/2635. UNCOMMITTED, primary.
- S232 fix(rules): GX once-per-game single-sourced on `player.oncePerGame`, shared `oncePerGameUsed`,
  flags mirror removed (commit 25e18c4 on main).
