# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 174
Focus: Design 013 — TCG Live card inspector on double-click. APPROVED by user (D50).
Active: **slice 1 of 3 SHIPPED** on branch `worktree-card-inspector` (4ce9c9d) —
  `client/src/setup/rules/card-inspector-model.mjs` + 28 tests. Pure/DOM-free, so still ZERO
  user-visible change. Work happens in `.qwen/worktrees/card-inspector`, not the primary checkout.
Next: slice 2 = `decorate` hook in `card-picker.js` + `card-inspector.mjs` renderer + CSS + band
  table. Then slice 3 = double-click routing, fold 008's zones in, live refresh, delete the spike.
  Unrelated queue: I56 (keybinds c/z/e/q on server cards), audit lows A-6/A-10, I28, PR #143.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- **D50 supersedes 008 D1/D6.** Inspection AND attack/ability selection both live on double-click,
  in one inspector; single-click returns to select-to-move. Do NOT "restore" 008's single-click
  preview — it collided with `dblclick` on the same nodes (`card-listener-table.js:18-19`) and
  popped/re-popped/tore down itself. Slice 3 is what actually removes it; until then 008's zones
  still fire on single-click and the flash still exists.
- **The card scan is the background and stays visible (C1).** Pieces occlude only the print they
  replace — never an opaque cream/silver/dark fill. Dimming uses `filter`, NEVER `opacity` (C2):
  alpha makes a panel translucent and the printed text ghosts back through it.
- **Card shapes are dual-sourced; the model handles all of these — the renderer must not undo it.**
  Weakness/resistance arrive singular (`card.weakness`, server hydration) AND plural
  (`card.weaknesses`, createCard), and they are NOT `${key}s` ("weakness" → "weaknesses"). Printed
  damage is a STRING server-side ('30+') and a NUMBER client-side. `bandTopPct`/`bandHeightPct` are
  NULLABLE (attackZoneBounds returns null for 0 attacks). Retreat tiles can only ever show Colorless
  pips — that is what the engine charges, not a bug.
- Chrome mounts in the **carousel** (`card-picker.js`), not 008's pop host — only the carousel can
  carry attached-Energy slides (C3). Slice 2 adds an optional `decorate({node, holoWrapper, card,
  index})` hook; the decorator MUST keep `holoWrapper` inside the returned node or `slideWrapper()`
  and the holo hover sync break. card-picker also serves the discard/deck/prizes/trainer pickers, so
  no-decorate behaviour must stay byte-identical. Reuse `computeContentBox()` for the letterbox case
  (008 R4); bands are FRAME-SPECIFIC, one set cannot serve Tera-ex and classic frames.
- Tooling: test under `SERVER_AUTHORITATIVE=1`, pick a free port (:4000/:4317 often held). Board
  cards live INSIDE the playmat iframes (only self-/opp-containers.css), so chrome mounts in the
  main document; legacy zone arrays are EMPTY there — read the `img.card` stamp via
  `resolvePreviewCard`. `pnpm test` is an explicit file list — a new test file runs only once added
  to package.json. Prettier is not a direct dep (`npx prettier` and the `format` script both fail) —
  format with `npx eslint --fix --rule "linebreak-style: off" <files>`, and only files you touched:
  `rules-state.mjs` is legacy CRLF and reports ~1200 pre-existing errors. Suite is 1746/1747; the
  one fail ("trainer drop: Trainer without synced effect text") is pre-existing.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S174 2026-09-19 feature: design 013 slice 1 — card inspector model + tests (D50).
- S171 2026-09-18 feature: design 012 manual board tools under server authority (D47, D48, D49).
- S172 2026-09-18 patch: I57 discard-pile viewer reads the authoritative discard.