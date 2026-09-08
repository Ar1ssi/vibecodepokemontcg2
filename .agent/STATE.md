# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 20
Focus: server-authoritative netcode — resolving audit findings
Active: none (Finding 12 resolved)
Next: maintenance due; Remaining audit items (Finding 13 paralysis, Finding 14 stadium overwrite)
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 954 pass / 0 fail (plain `node --test`, no jsdom).
- `GameRoom.prototype.getGameEndedPayload` formats customized win/loss/spectator payloads when phase === 'ended'.
- `applyView` reconciles `#netcodeEndModal` and updates `#rulesEndScreen` on phase === 'ended'.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S20 2026-09-08 patch: Fixed audit finding 12 (gameEnded socket broadcast in server.js, getGameEndedPayload in GameRoom, reconcileGameEnded in apply-view.js); 954 tests green.
- S19 2026-09-08 patch: Fixed audit finding 11 (resolveChoice deduplication in GameRoom and socket handlers); 952 tests green.
- S18 2026-09-08 patch: Fixed audit finding 10 (initiatorPlayerId in PendingChoice.resumeToken, trainer cleanup to initiator discard); 948 tests green.
