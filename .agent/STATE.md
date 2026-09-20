# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 219
Focus: Coin catalog integrity + metadata (design 019). Concurrent rules/UI work active in the same tree.
Active: none.
Next: none.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Coin catalog is 939 entries with unique ids; rewrite via `node scripts/normalize-coin-catalog.mjs`
  (`--check` guards). 202 Gen IX ids are frozen (decks persist `coin.id`).
- Coin art: real image = url NOT under `/coins/bulbapedia/` (214 today). `scripts/download-coin-images.mjs`
  downloads available scans to `client/src/assets/coins/historical/` and writes a manifest — it never edits the catalog.
- Coin picker filters by name/material/region/image via `filterCoins`; materials now include `metal`/`cardboard`
  (`.coin-mat-metal` CSS added). No fabricated `rarity` — variant counts come from `groupCoinsByRelease`.
- Lost Zone rail is disabled (`display: none`) by default; toggled via Settings `showLostZoneCheckbox` or `window.toggleLostZone()`.
- Under server authority, turn-start draws are executed authoritatively on the server; client must never emit a start-of-turn draw command.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S219 feat: coin catalog normalized 942→939 + metadata helpers, picker filters, image downloader (design 019).
- S218 feat: merged 740 Bulbapedia coins Gens I-VIII → 942 total (sleeves.test.mjs now includes coin test).
- S217 patch: disabled Lost Zone rail by default with quick toggle in Settings (showLostZoneCheckbox).
