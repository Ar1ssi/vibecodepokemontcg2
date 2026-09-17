Session: 160
Focus: The TCG Live highlight work is on main but has never been executed — verification is the whole remaining job.
Active: PR #143 (branch feat/highlight-plan: code dc51a0b + this harness state) merged into main. implementation_plan.md phases 1-3
  are shipped; C2 deliberately is not (D43 keeps the self-ring blue). Zero runs: no node/pnpm exists on this machine and the repo
  ships no CI, so the merge was the user's explicit ship-unverified call.
Next: run `pnpm install` + `pnpm test` + the lint bar below, then the rules-mode 2-player browser pass listed in the PR #143 body —
  fix forward on a branch if any of it is red. Then the deferred cleanup: delete the dead `#attackPanel` / `.attack-panel-*` CSS.
  maintenance due (S150, still owed).
Blocked: verification cannot run here — `node` and `pnpm` are absent from PATH and from the whole user profile; only `gh` works.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Board cards live INSIDE the `selfContainer`/`oppContainer` playmat iframes (separate documents that
  load only self-/opp-containers.css + its @imported partials; index.css never reaches them). Any class
  you put on a card/wrapper must be styled there, not in index.css. Stadium cards are the exception —
  they're in the main document, so index.css is right for those.
- Netcode: test under `SERVER_AUTHORITATIVE=1` only (S137). :4000 is often another session's
  server — run your own with `PORT=<free>`. Server-rendered cards carry `data-instance-id` + `img.card`;
  legacy images never enter server-drawn zones' DOM (D36). Holo-hydrated server cards move as their
  `.mat-holo` wrapper (`cardNodeOf` in apply-view.js) — never appendChild the bare <img>.
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json.
  `pnpm lint` fails repo-wide on CRLF; lint a diff with
  `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>`.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive = left)
  — counterintuitive; any new caller must order candidates accordingly (S132).
- Evolutions stay attached under the Basic: read HP/attacks/stats through evolvedView (D40), write damage to the root.
  Card counters/ability tabs are children of the ZONE, not the card, and sit on top of it (S156) — click targets
  must resolve through `preview-card.mjs`, never off `event.target` directly. `node_modules` needs `pnpm install`
  per worktree; this machine's plain cmd shell may have no node/pnpm/gh on PATH at all (S156).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S160 2026-09-17 feature: highlight-parity phases 1-3 merged as PR #143 — UNVERIFIED, nothing has run.
- S159 2026-09-17 harness: exec-plan.md workflow + routing; CLAUDE.md and QWEN.md are LF/CRLF mirrors — edit both together (D44).
- S158 2026-09-17 feature: highlight-parity Phase 3 (A3 ✕ marker, A4 glow scale) + C3 moved into the playmat sheets.
