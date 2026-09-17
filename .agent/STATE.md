# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 170
Focus: Prize picker restored under server authority (D46) on top of the audit fixes — uncommitted.
Active: none.
Next: commit (user to confirm). Fix local node_modules (express/@eslint/js missing; pnpm install EACCES)
  then run lint + `SERVER_AUTHORITATIVE=1` playtest-bot to see a real KO prize pick. User eyeballs the
  prize fan and stacked condition markers in a live 2P game. Then audit lows A-6/A-10. maintenance due.
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
- Prize cards move only on a server-granted entitlement (`flags.prizesOwed`, D43). A KO raises a prize
  pendingChoice at command end (D46) that pauses the game; never splice `zones.prizes` on a client's say-so. Manual counters/conditions and deck-order ops are
  turn-player-only in rules mode (S167).
- Mat `.mat-holo` wrappers get NO inline px size (S164): each zone's CSS sizes them. Never measure
  clientWidth in one document/zoom space and write px into another (hand is 1x, #playfield is zoom:2).
  Pre-existing failing test: "trainer drop: a Trainer without synced effect text is rejected".

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S170 2026-09-17 feature: prize picker — KO raises server prize choice, client fly-up fan (D46, I4).
- S169 2026-09-17 feature: A-1 stacked conditions — Poison/Burn marker keys + per-condition board markers (D45).
- S168 2026-09-17 patch: audit mediums — status parity, dual-type weakness, clientSeq required (D44).
