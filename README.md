# Deck Builder — Multiple Saved Decks ("My Decks")
    
    ## What this adds
    The Deck tab's Deck Builder now has a **My Decks** bar:
    - **+ New Deck** — creates a named deck in your browser's local storage.
    - **Click a deck chip** — opens it in the editor for P1 (or P2 in solo mode);
      any card you add or remove is autosaved into that deck instantly.
    - **✎ / ✕ buttons** on each chip — rename or delete the deck (with confirm).
    - Up to 60 decks are kept per browser profile.
    
    ## Files changed
    - `client/index.ejs` — My Decks bar markup (between header and P1/P2 target bar).
    - `client/src/css/index.css` — styles for bar, chips, and dark mode.
    - `client/src/initialization/document-event-listeners/sidebox/native-deck-builder.js` — library wiring (open/save/switch/clear hooks).
    - `client/package.json` — added `"type": "module"`.
    - `package.json` — `pnpm test` includes the new test file.
    
    ## Files added
    - `client/src/initialization/document-event-listeners/sidebox/native-deck-builder-library.js` — UI controller for the My Decks bar.
    - `client/src/setup/deck-builder/core/deck-library.mjs` — pure library logic (create/rename/delete/save/list, persistence, shape repair).
    - `client/src/setup/deck-builder/__tests__/deck-library.test.mjs` — 13 unit tests.
    
    ## Verification
    - 92/92 unit tests pass (79 existing + 13 new): `pnpm test`
    - Server boots; page and all modules serve correctly over HTTP.
    - jsdom DOM smoke test (12 checks) exercises the real module: create → open →
      autosave → reload persistence → reopen → rename → delete.
    
    ## Design notes
    - Decks persist in localStorage (`ptcg-sim.deck-library.v1`).
    - "Which deck is open for editing" is session-only state — reload detaches the
      editor from any saved deck so a stale binding can never overwrite a saved deck.
    - Clearing the editor detaches from the saved deck (never wipes the saved copy).
    - Switching P1/P2 saves the outgoing deck first, so decks never cross-contaminate.
    