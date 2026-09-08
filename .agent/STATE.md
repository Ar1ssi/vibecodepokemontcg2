# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 11
Focus: server-authoritative netcode — resolving critical audit findings
Active: none (Critical Findings 1, 2, and 3 resolved)
Next: Critical Finding 4 (exchangeData parameter offset) and remaining audit items
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 912 pass / 0 fail (plain `node --test`, no jsdom).
- Server broadcasts redact PendingChoice options for opponents and spectators (Finding 1 resolved).
- `instanceId` is minted monotonically via `mintInstanceId(state)` across all player decks (Finding 3 resolved).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S11 2026-09-08 patch: Fixed audit findings 1-3 (broadcast redaction leak, opponent choice deadlock, unique instanceId minting); 912 tests green.
- S10 2026-09-08 feature: Slice 8 shipped — Phase 3 flip, Phase 4 deletion pass, edge cases 7/14/16/17/18 covered; 910 tests green.
- S9 2026-09-07 feature: Slice 7 shipped — Client applyView renderer, cmd emitters, in-flight affordances, Phase 2 dual-run; 912 tests green.
