# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 154
Focus: Guided setup announcement: move basic pokemon to active spot before turn 1.
Active: none. Shipped guided prompt in rules-bridge.js and ready.js.
Next: maintenance due (S150, still owed). user live-checks a SERVER_AUTHORITATIVE 2P game (holo, evolve stack, Tool/Energy layout + double-click carousel,
  rotation, ability tab, counts, VSTAR/GX, Stadium flip, Nest Ball picker); then push + PR.
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
- S154 2026-09-17 feature: guided statement for both players to move Basic Pokémon to Active Spot before turn 1.
- S153 2026-09-17 patch: hydrateHolo ensureCardData pass-through for accurate ID/rarity resolution.
- S150 2026-09-17 debug: MP discard cover blew up over prizes (#discardCover id rule hit the img); resetImage on covers.
