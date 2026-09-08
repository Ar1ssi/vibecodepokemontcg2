# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 23
Focus: server-authoritative netcode — resolving audit findings
Active: none (Finding 15 resolved)
Next: Remaining audit item (Finding 16 asleep reroll)
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 976 pass / 0 fail (plain `node --test`, no jsdom).
- Deck-to-bench searches clamp choice.max to available bench space and skip with effectStepSkipped (bench_full) if full; playTrainer/stadium-effect reject with bench_full.
- Stadium cards record ownerId, displaced stadiums move to owner's discard zone, and duplicate stadium plays by name are rejected.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S23 2026-09-08 patch: Fixed audit finding 15 (bench limit enforcement in executor.mjs searchDeck, reduce.mjs playTrainer/stadium-effect); 976 tests green.
- S22 2026-09-08 patch: Fixed audit finding 14 (stadium overwrite & discard in trainer.mjs & reduce.mjs, duplicate name block); 969 tests green.
- S21 2026-09-08 patch: Fixed audit finding 13 (Paralysis checkup endingPlayerId gate in reduce.mjs); 961 tests green.
