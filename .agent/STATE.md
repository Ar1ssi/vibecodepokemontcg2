Session: 161
Focus: Drag-to-retreat bugfix (dZoneId mis-resolution) shipped. PR #143's owed verification pass (pnpm
  test/lint + 2P rules-mode browser walk) is still the next real chore — node/pnpm now work here.
Active: none — S161 patch complete and tested (pnpm test green modulo 1 pre-existing unrelated failure).
Next: run the PR #143 body's 2-player rules-mode browser verification pass (node/pnpm confirmed present
  now, S161 — STATE's old "absent" claim was stale). Then the deferred cleanup: delete dead `#attackPanel`
  / `.attack-panel-*` CSS. maintenance due (S150, still owed).
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- node/pnpm ARE on PATH on this machine as of S161 (`node v24.20.0`, `pnpm 12.3.4`) — ignore any older
  note in this file or the journal claiming otherwise.
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
- Drag-drop zone resolution: always use `zoneOf(event.target)?.id` (drop-zone.mjs), never
  `event.target.id` directly — an empty zone slot's target is often a child placeholder div with no id
  of its own (S161 root cause of the drag-to-retreat bug).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S161 2026-09-17 patch: drag-to-retreat dZoneId bugfix + require explicit bench-card target when 2+
  eligible — client\src\setup\image-logic\drag.js.
- S160 2026-09-17 feature: highlight-parity phases 1-3 merged as PR #143 — UNVERIFIED, nothing had run
  (now unblocked: node/pnpm work here as of S161).
- S159 2026-09-17 harness: exec-plan.md workflow + routing; CLAUDE.md and QWEN.md are LF/CRLF mirrors — edit both together (D44).
