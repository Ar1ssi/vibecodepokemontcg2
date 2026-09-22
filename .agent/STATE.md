# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 253
Focus: design 024 — FX sequencing, procedural audio, and TCG-Live parity round 2.
Active: shipped, 10 commits pushed to `claude/charming-ride-78yi9u`. Suite 2949/2950.
Next: user to LOOK AND LISTEN (nothing visual/audible has been seen or heard by a human yet); then I83 (the pre-existing inspector failure), I78–I80.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- **Nobody has seen or heard design 024.** Every pacing value (`mat-fx/fx-holds.mjs`), every sound (`mat-fx/fx-audio.mjs` VOICES) and every colour is an unreviewed judgement call. They are all tuning-by-table on purpose — change a number, not a code path. Audio is arcade-style synthesis, not foley; sampled sound would need an asset pipeline + a licensing decision (design 024 O1).
- ONE pre-existing failing test, now I83: `card-inspector-model.test.mjs` "retreat greys only when the cost is unpaid". Re-verified at S252 by stashing the whole branch — it fails on a clean tree. Do NOT read a 2949/2950 run as a regression.
- `pnpm test` on this checkout triggers an implicit install that empties `node_modules` (`pnpm install` restores it). Prefer `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`. ESLint needs `pnpm install` first.
- Browser verification here needs two workarounds: socket.io is CDN-loaded and this sandbox blocks the CDN (stub `window.io` via `addInitScript` or boot aborts with "io is not defined"), and Playwright must be launched with `executablePath: '/opt/pw-browsers/chromium'`. `waitUntil: 'networkidle'` never fires — use `domcontentloaded`.
- Adding an effect is still one EVENT_FX row + one registry entry (D94), but now also one `fx-holds.mjs` row and one `fx-audio.mjs` voice — the tests assert every mapped effect has both. Idle motion inside the playmat iframes must carry a `:root.fx-off`/`.fx-reduced` guard (D97); a CSS test enforces it.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S252 design 024: FX queue + hold table (a batch now plays in engine order, not one frame), procedural Web Audio palette (the client was silent), attack name→target→impact→number choreography, damage-counter motion + prize-claim burst, effects for 7 previously-silent events + Tool attach, FX settings UI, and a kill switch that finally reaches inside the playmat iframes. D95/D96/D97; I81–I83 filed.
- S251 audit+fix: 31 server/client bugs across items, energy, abilities, attacks and attack effects (soft-locks, special-energy KOs, attack pricing, Trainer pickers, status-aware affordances). I78–I80 deferred.
- S250 debug/patch: four user-reported bugs — lethal ability/trainer damage counters never KO'd, Items attached as Tools, Items played to Bench, Tarragon combination discard.
