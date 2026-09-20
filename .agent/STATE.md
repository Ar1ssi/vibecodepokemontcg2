# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 215
Focus: Knockout active promotion via existing mat picker & merging PR #177 / PR #178 into main.
Active: merge PR #178 into main.
Next: sync primary local repository on main and verify full test suite.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Knockout promotion uses openMatPick with cancellable: false when bench has eligible Pokémon.
- Under server authority, turn-start draws are executed authoritatively on the server; client must never emit a start-of-turn draw command.
- In 2P setup under server authority, coin call is resolved server-side; `maybeBeginServerTurnOrder` must wait for `openingSetupReadyForCoinFlip` so setupPrizes and dealOrder settle before drawing opening hands.
- Stadium extras have ONE merge order (D78): printed → inherited → granted, de-duped by name, shared by server and client.
- Server executor (`shared/engine/effects/executor.mjs`) supports a subset of step types; S213 new steps + damageCounters/moveEnergy/variableDraw are client-only.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S215 feature: linked existing mat picker to Active Pokémon knockout flow for player choice (PR #178).
- S214 fix(netcode): closed I47 — eliminated 9-card overdraw on turn 1 and setup deal order race; flip-gate-test green (PR #177).
- S213 feature: pkmncards trainer parse coverage (~57 step families, 402→25 unrecognizable) + Lost Zone rail (PR #176).
