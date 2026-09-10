# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 78
Focus: implement design 004 slice 3 (`act(option)` write path).
Active: done. `e2e-api.js` gained `async act(option) -> {ok, error}`, never throws. Confirmed
  (by reading move-card.js/authoritative-dispatch.js, not assumed) that every real UI call site
  passes the literal action string `'move'` for playBasic/attach/evolve/playTrainer alike —
  move-card.js itself classifies attach vs. evolve from whether `targetIndex` resolves to an
  existing card in the destination zone, not from the action string, so the design's
  'move'/'attach'/'evolve' vocabulary note was aspirational, not real. playBasic/attach/evolve
  route through `moveCardBundle('self','self','hand', targetZone, handIndex, targetIndex, 'move',
  true)`; playTrainer targets 'board' (move-card.js redirects Stadiums to 'stadium' itself, and
  rules-bridge.js's board-zone watcher fires Supporter/Item effects once the card lands there).
  ability -> useAbility(zone,index); attack -> chat-buttons attack(); retreat -> chat-buttons
  retreat('self', true, benchCard.image) (image works as the identity token on both render paths
  — legacy `.image.relative` match and authoritative `readCardInstanceId` read the same DOM node);
  pass -> chat-buttons pass().
Next: design 004 slice 4 (`picker()`/`pick()` — the risk-gate slice; stop and decide if the
  overlay set is bigger than card-picker + coin overlays). Still unverified: no live two-page run
  has exercised observe()/options()/act() together (open since S76). Also open from S73:
  (1) live-verify drag active→bench retreat, (2) mat click-to-select pickers + Grand Tree fix.
  Maintenance due at S80 (2 sessions away).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, installed only under `?e2e=1`) is the
  supported programmatic seam into a live game — extend it rather than writing DOM-selector
  automation. `flip-gate-test.mjs` is the reference two-browser harness.
- moveCardBundle's `action` param is misleadingly named: every real call site passes `'move'`
  regardless of whether the move is a play/attach/evolve — move-card.js infers attach vs. evolve
  from `targetIndex` resolving to an existing target card, and from `movingCard.type`. Don't
  reintroduce literal 'attach'/'evolve' strings without re-reading move-card.js first.
- `openMatPick()` in client/src/setup/rules/trainer-execution.js is the pattern for any future
  "pick an in-play Pokémon" step — reuse it, don't re-add a modal picker for that case. It relies
  on `card.image` already being the live DOM node and on a document-level capture-phase click
  listener outrunning click-events.js/drag.js; a move to Shadow DOM would silently break it.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- Cross-client parity may only be asserted over public zones (D14). Owner-secret zones
  (hand/prizes/deck) are redacted per recipient — compare counts instead, never `deck`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S78 2026-09-10 feature: design 004 slice 3 — `__ptcg.act(option)` write path in e2e-api.js.
- S77 2026-09-10 feature: design 004 slice 2 — `__ptcg.options()` + pure e2e-options.mjs (11 tests).
- S76 2026-09-10 feature: design 004 slice 1 — `__ptcg.observe()` read model added to
  e2e-api.js. No gameplay files touched.
