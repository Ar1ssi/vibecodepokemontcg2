# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 148
Focus: multiplayer (server-authoritative) render parity: holofoil, Energy tokens + attachedCards, card-picker for pendingChoice.
Active: none. Branch fix/mp-render-holo-energy-picker (worktree ../wt-mp-render), committed, not pushed.
Next: user live-checks a SERVER_AUTHORITATIVE 2P game (holo on board, Energy tokens + double-click carousel,
  Nest Ball opens card picker); then push + PR. Pre-existing fail on main: "trainer drop: stays a plain move
  when promotion does not apply". Then I47. Owed: test for changeCardBack/applySleeveToPlaymat stale-image patch.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox/worktree (not persisted). Playwright's
  pinned browser revision (1.63.0) may not match a pre-installed one — on sandbox use
  `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Netcode: test under `SERVER_AUTHORITATIVE=1` only (S137). :4000 is often another session's
  server — run your own with `PORT=<free>`. Server-rendered cards carry `data-instance-id` + `img.card`;
  legacy images never enter server-drawn zones' DOM (D36). Holo-hydrated server cards move as their
  `.mat-holo` wrapper (`cardNodeOf` in apply-view.js) — never appendChild the bare <img>.
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json.
  `pnpm lint` fails repo-wide on CRLF; lint a diff with
  `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>`.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Evolutions stay attached under the Basic: read HP/attacks/stats through evolvedView (D40), write damage to the root.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S148 2026-09-16 feature: MP holo / Energy tokens / card-picker choices in apply-view.js (branch, unpushed).
- S147 2026-09-16 patch: bench card layout fixed with 5-column CSS grid matching 5 SVG slots.
- S146 2026-09-16 patch: I51/I52 — Trainer drops before card data rejected; one Energy rule set (untested).
