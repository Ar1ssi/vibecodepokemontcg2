# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 164
Focus: I28 closed (holo CSS import parity). PR #143's owed verification pass (pnpm test/lint + 2P
  rules-mode browser walk) is the next real chore.
Active: none — S164 fix complete; pnpm test 1619/1620 (same pre-existing trainer-execution failure).
Next: user eyeball-check I28 fix in a live 2P game (both sides should show the same era foil).
  Then PR #143 2-player rules-mode verification pass. Then delete dead `#attackPanel` /
  `.attack-panel-*` CSS. maintenance due (S150, still owed). If Meowth-ex "ability unusable" recurs
  with one copy, I48's fix wasn't the whole story.
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
- S164 2026-09-17 debug: I28 — self-containers.css missing 7 per-generation holo @imports that
  opp-containers.css had; owner/opponent saw different foils. Added + test parity.
- S163 2026-09-17 debug (I28, in progress): MP bench holo freezes on the opponent-viewing client only.
  Couldn't isolate-repro yet. Added TEMP DEBUG try/catch in holo.mjs's tick() to surface a
  silently-thrown loop-killer; also fixed hydrateHolo's ensureCardData() call dropping
  card.image/set/number (separate bug: fuzzy name search often failed silently -> no holo at all).
- S162 2026-09-17 debug: ability-used flag keyed by card.name collided across same-named Pokémon
  (I48) — shared/engine/effects/ability.mjs now keys by instanceId first.
