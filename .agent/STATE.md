# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 217
Focus: Disabled Lost Zone rail by default with quick toggle in Settings.
Active: none.
Next: sync primary local repository on main and verify full test suite.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Lost Zone rail is disabled (`display: none`) by default; toggled via Settings `showLostZoneCheckbox` or `window.toggleLostZone()`.
- Lost Zone rail is positioned in the board area (`left: 60%, top: 28vh, height: 52vh`).
- Knockout promotion uses openMatPick with cancellable: false when bench has eligible Pokémon.
- Under server authority, turn-start draws are executed authoritatively on the server; client must never emit a start-of-turn draw command.
- In 2P setup under server authority, coin call is resolved server-side; `maybeBeginServerTurnOrder` must wait for `openingSetupReadyForCoinFlip` so setupPrizes and dealOrder settle before drawing opening hands.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S217 patch: disabled Lost Zone rail by default with quick toggle in Settings (showLostZoneCheckbox).
- S216 patch: moved Lost Zone rail to the board area beside the playmat as outlined (index.css).
- S215 feature: linked existing mat picker to Active Pokémon knockout flow for player choice (PR #178).
