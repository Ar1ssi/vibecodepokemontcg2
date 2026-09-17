# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 165
Focus: I28 holo import parity (PR #144) and mat sizing fix (4abcb5c) both on main.
Active: none.
Next: user eyeball-check both in a live 2P game (same era foil both sides; Active/Bench evolutions,
  prizes, board sized right). Then PR #143 2P rules-mode verification pass. Then delete dead
  `#attackPanel` / `.attack-panel-*` CSS. maintenance due (S150, still owed).
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

- Mat `.mat-holo` wrappers get NO inline px size (S164): each zone's CSS sizes them. Never measure
  clientWidth in one document/zoom space and write px into another (hand is 1x, #playfield is zoom:2).
  Pre-existing failing test: "trainer drop: a Trainer without synced effect text is rejected".

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S165 2026-09-17 merge: PR #144 merged into main.
- S164 2026-09-17 debug: I28 — self-containers.css lacked 7 per-generation holo @imports; added + parity test.
- S164 2026-09-17 debug: mat card sizing — removed hydrateHolo px snapshot, cancel in-flight hydration,
  prizes grid rows minmax(0,1fr), board img/holo same height.
