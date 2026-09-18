# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 174
Focus: PTCG Live card inspector on double-click. Design 013 WRITTEN (`.agent/designs/
  013-tcg-live-card-inspector.md`); spike complete. Nothing shipped in client/ or shared/.
Active: none. Look approved by the user over 20 spike revisions; dim states added this session.
Next: **design gate** — 013's O1-C revises 008's user-confirmed D1/D6 and needs explicit sign-off.
  On approval, build slices 1→3 of 013 in a worktree. Unrelated queue: I56 (keybinds c/z/e/q on
  server cards), audit lows A-6/A-10, I28, PR #143.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- **008/013 GESTURE COLLISION (blocking, solved in 013 O1).** `click: imageClick` and
  `dblclick: doubleClick` bind to the same nodes (`card-listener-table.js:18-19`), and 008 put
  the attack preview on single-click. A double-click on your own active pops the attack preview,
  re-pops it, then tears it down for the carousel. Teardown is already sound (`onClosed` cleans
  up), so it is a visible flash, not a leak. 013 resolves it by folding 008's zones INTO the
  double-click inspector and giving single-click back to select-to-move (repairs 008's R3).
- **The card scan is the background and stays visible (013 C1).** Pieces occlude only the print
  they replace — never an opaque cream/silver/dark fill. Dimming uses `filter`, NEVER `opacity`
  (C2): alpha makes a panel translucent and the printed text ghosts back through it. Both were
  verified in renders this session (opacity leaked at v22/v23, filter clean at v24/v25).
- Legacy zone arrays are EMPTY under SERVER_AUTHORITATIVE 2P — read `getAuthoritativeZoneArray`
  / `cardRegistry`, or the `img.card` stamp via `resolvePreviewCard`. `attachedEnergiesFor`
  already falls back to the `card.attachedCards` stamp, so the attached-energy path is safe.
- Board cards live INSIDE the `selfContainer`/`oppContainer` playmat iframes (separate documents,
  only self-/opp-containers.css; index.css never reaches them). Panel chrome must mount in the
  MAIN document — which is why 013 picks the carousel (`card-picker.js`) over the pop host:
  only the carousel can carry attached-Energy slides (C3) and it already serves both branches.
- Reuse, don't re-derive: `attackZoneBounds()` (bands, ability-aware), `listAttacks()`
  (payability — the panel must never disagree with it), `parseAttackDamage()` (resolved damage),
  `computeContentBox()` (letterbox, per 008 R4). Bands are FRAME-SPECIFIC; one set cannot serve
  Tera-ex and classic frames. `ENERGY_SYMBOL_TO_TYPE` is module-private in `energy-effects.mjs`
  and must be EXPORTED, not copied (013 C7).
- Tooling: test under `SERVER_AUTHORITATIVE=1`, pick a free port (:4000/:4317 often held).
  `pnpm test` is an explicit file list — a new test file runs only once added to package.json.
  `eslint.config.mjs` scopes globals to `**/*.js` only, so EVERY root `.mjs` fails `no-undef`
  (pre-existing; `verify.mjs` identical). Prettier is not a direct dep, so `npx prettier` and the
  repo's own `format` script fail — format via `npx eslint --fix` instead.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S171 2026-09-18 feature: design 012 manual board tools under server authority (D47, D48, D49).
- S172 2026-09-18 patch: I57 discard-pile viewer reads the authoritative discard.
- S170 2026-09-17 feature: prize picker restored under server authority (D46).