# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 218
Focus: Scrape and merge 740 historical coins from Bulbapedia Gens I-VIII.
Active: none.
Next: none.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Coin catalog expanded 202 → 942 coins. Gens V, VII, VIII previously zero; now 100+/150+/100+ respectively.
- New coins use placeholder asset refs (`src/assets/coins/bulbapedia/{ID}.jpg`); actual images not downloaded.
- Lost Zone rail is disabled (`display: none`) by default; toggled via Settings `showLostZoneCheckbox` or `window.toggleLostZone()`.
- Knockout promotion uses openMatPick with cancellable: false when bench has eligible Pokémon.
- Under server authority, turn-start draws are executed authoritatively on the server; client must never emit a start-of-turn draw command.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S218 feat: merged 740 Bulbapedia coins Gens I-VIII → 942 total (sleeves.test.mjs now includes coin test).
- S217 patch: disabled Lost Zone rail by default with quick toggle in Settings (showLostZoneCheckbox).
- S216 patch: moved Lost Zone rail to the board area beside the playmat as outlined (index.css).
