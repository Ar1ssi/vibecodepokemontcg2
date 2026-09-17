# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 156
Focus: Fix double-click card previews on the opponent's Active and in the Stadium slot.
Active: none. Shipped preview-card.mjs overlay resolution + Stadium routed into the card preview.
Next: maintenance due (S150, still owed). user live-checks PR branch fix/double-click-preview in a
  SERVER_AUTHORITATIVE 2P game: double-click the opponent's damaged Active (on the counter and off it),
  double-click the Stadium, and re-check own active/bench/hand + prizes + holo carousel still open.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox/worktree (not persisted). Playwright's
  pinned browser revision (1.63.0) may not match a pre-installed one — on sandbox use
  `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`. This machine's plain
  cmd shell had NO node/pnpm/gh on PATH at all (S156) — S156 shipped unverified by execution.
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
  Card counters/ability tabs are children of the ZONE, not the card, and sit on top of it (S156) — click targets
  must resolve through `preview-card.mjs`, never off `event.target` directly.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S156 2026-09-17 patch: double-click preview resolves counter overlays and covers the Stadium slot.
- S155 2026-09-17 patch: fix static PRNG seed preventing deck shuffle randomness across games and resets.
- S154 2026-09-17 feature: guided statement for both players to move Basic Pokémon to Active Spot before turn 1.
