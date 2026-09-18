# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 174
Focus: Design 013 — TCG Live card inspector on double-click. All 3 slices CODE-COMPLETE.
Active: branch `worktree-card-inspector` PUSHED to origin (4 commits on main). **Draft PR NOT
  created — `gh` is not authenticated on this machine** (`gh auth status`: "not logged into any
  GitHub hosts"). Open it at https://github.com/Ar1ssi/vibecodepokemontcg2/pull/new/worktree-card-inspector
  with body `C:\Users\SMG26\AppData\Local\Temp\pr-013-body.md`, or `gh auth login` then
  `gh pr create --draft`. Work lives in `.qwen/worktrees/card-inspector`.
Next: **THE E2E NEVER RAN** (013 Deviation D1) — double-click under SERVER_AUTHORITATIVE=1:
  chrome anchored, dim lifts on attach, attack click fires, Energy slide has no chrome, Escape
  closes. Then mark the PR ready. Unrelated queue: I56, audit lows A-6/A-10, I28, PR #143.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- **A WORKTREE CANNOT RUN THE SERVER HERE.** No `node_modules` inside it, so `server/server.js`
  dies on `ERR_MODULE_NOT_FOUND: socket.io`. Browser verification needs deps installed in the
  worktree, or the branch landed on main and tested from the primary checkout. The :4000 server
  belongs to the primary checkout and serves PRE-slice-3 code — do not test against it.
- **D50 supersedes 008 D1/D6, and it is now in the code.** Double-click = inspect AND attack;
  single-click is back to select-to-move (repairs 008 R3). `attack-preview.js`,
  `attack-preview-gate.js` and the gate test are DELETED. Do not resurrect them.
- **The card scan is the background and stays visible (C1).** Pieces occlude only the print they
  replace — never an opaque cream/silver/dark fill. Dimming uses `filter`, NEVER `opacity` (C2):
  alpha makes a panel translucent and the printed text ghosts back through it. Guarded by
  `card-inspector-css.test.mjs`, which asserts on the stylesheet text.
- **Card shapes are dual-sourced; the model handles all of these — do not undo it.**
  Weakness/resistance arrive singular (`card.weakness`, server hydration) AND plural
  (`card.weaknesses`, createCard), and they are NOT `${key}s` ("weakness" → "weaknesses").
  Printed damage is a STRING server-side ('30+') and a NUMBER client-side. `bandTopPct`/
  `bandHeightPct` are NULLABLE (attackZoneBounds returns null for 0 attacks). Retreat tiles can
  only ever show Colorless pips — that is what the engine charges, not a bug.
- **Grep before deleting a module.** `attack-preview.js` had two callers outside the click path
  (sidebox p1/p2 chat-buttons, 008 Component 7); the design never mentioned them. Also: the
  inspector ports 008's ATTACK panels only, NOT its ability zones (D5) — abilities still come from
  `abilityPicker()`, so nothing is unreachable, but the panel cannot show or fire them yet.
- Tooling: `pnpm test` is an explicit file list — a new test file runs only once added to
  package.json. Suite is 1752 with 1 pre-existing fail ("trainer drop: Trainer without synced
  effect text"). Prettier is not a direct dep (`npx prettier` and the `format` script both fail) —
  format with `npx eslint --fix --rule "linebreak-style: off" <files>`, only on files you touched:
  `rules-state.mjs`/`card-picker.js` are legacy CRLF and report ~1200 pre-existing errors. Every
  root `.mjs` fails `no-undef` because `eslint.config.mjs` scopes globals to `**/*.js` only.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S174 2026-09-19 feature: design 013 all 3 slices — card inspector on double-click (D50). Pushed, PR pending auth, NOT browser-verified.
- S171 2026-09-18 feature: design 012 manual board tools under server authority (D47, D48, D49).
- S172 2026-09-18 patch: I57 discard-pile viewer reads the authoritative discard.