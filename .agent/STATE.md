# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 177
Focus: Hand card stacking for duplicate face-up cards with count badges and stepped offsets (PTCG Live style).
Active: branch `feature/duplicate-hand-stacking`.
Next: Review and merge PR for duplicate hand stacking.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Duplicate hand stacking groups duplicate face-up cards in `.hand-card-stack` containers with stepped top offsets
  and a count badge. Under the hood, underlying zone arrays (`getZone`, authoritative views) remain 100% untouched.
- Hovering a `.hand-card-stack` lifts the composite stack (`translate: 0 calc(-50% + 18px)`). Dragging/clicking plays
  the front card; `reconcileHandStacks` automatically unwraps or updates the stack.
- Legacy zone arrays are EMPTY under SERVER_AUTHORITATIVE 2P (verified live S171: legacy hand 0 vs view 7,
  legacy deck stale at 14). Anything reading `getZone(user, z).array` or `mouseClick.card` is broken there —
  read `getAuthoritativeZoneArray(side, zone)` / the `cardRegistry` and address cards by instanceId (D12, D47).
- Board cards live INSIDE the `selfContainer`/`oppContainer` playmat iframes (separate documents that load only
  self-/opp-containers.css + its @imported partials; index.css never reaches them). Stadium is the exception.
- Netcode: test under `SERVER_AUTHORITATIVE=1` only (S137). Pick a free PORT — other sessions hold :4000/:4317.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S177 2026-09-18 feature: duplicate card stacking in hand with stepped offset layers and count badges.
- S176 2026-09-18 feature: Phases 2, 3, 4 retreat engine, tool cap, attack effects, energy acceleration (PR #149).
- S175 2026-09-18 feature: Phase 1 combat passives, prevention/reduction, tools, thorns, KO & prize modifiers (PR #149).
