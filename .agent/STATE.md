# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 24
Focus: server-authoritative netcode — resolving audit findings
Active: none (Finding 16 resolved)
Next: Proceeding to Slice 8 (Phase 3 flip & deletion pass)
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 980 pass / 0 fail (plain `node --test`, no jsdom).
- Asleep active Pokémon cannot attack or retreat (rejected in reduce.mjs validateLegality); wake-up coin flip occurs exclusively in resolveCheckup.
- Deck-to-bench searches clamp choice.max to available bench space and skip with effectStepSkipped (bench_full) if full; playTrainer/stadium-effect reject with bench_full.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S24 2026-09-08 patch: Fixed audit finding 16 (Asleep attack legality in reduce.mjs, removed asleep reroll in attack reducer); 980 tests green.
- S23 2026-09-08 patch: Fixed audit finding 15 (bench limit enforcement in executor.mjs searchDeck, reduce.mjs playTrainer/stadium-effect); 976 tests green.
- S22 2026-09-08 patch: Fixed audit finding 14 (stadium overwrite & discard in trainer.mjs & reduce.mjs, duplicate name block); 969 tests green.
