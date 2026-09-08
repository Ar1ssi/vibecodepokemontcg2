# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 28
Focus: UI / Card Picker interaction improvements
Active: none (card picker close-via-done-only complete)
Next: Proceeding to Slice 8 (Phase 3 flip & deletion pass)
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Grand Tree uses dedicated special rule in chat-buttons.js and searchDeck in stadium.mjs to chain Stage 1 -> Stage 2 evolution.
- Card picker only closes via Done button in choose/multi modes; closeCardPicker and closePopups are no-ops unless mode is browse or force=true.
- Drag-vs-tap safety gates card auto-slotting to presses <= 300ms with <= 8px movement, preventing conflict with carousel swiping.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S28 2026-09-08 patch: Pick card menu restricted to close only via Done button (card-picker.js, card-picker-hitbox.mjs, discard-pile-viewer.js); 988 tests green.
- S27 2026-09-08 patch: Card picker drag-vs-tap safety check via press duration and drift thresholds; 986 tests green.
- S26 2026-09-08 patch: Card picker clicking auto-slots into open slot prioritizing from left; 984 tests green.
