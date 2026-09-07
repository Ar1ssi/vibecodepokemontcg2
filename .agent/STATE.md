# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 2
Focus: server-authoritative netcode — kill multiplayer desyncs at the architecture level
Active: none (design written, no product code touched)
Next: USER APPROVAL GATE on `.agent/designs/001-server-authoritative-netcode.md`.
      On approval → feature.md phase 3, slice 1 (create `shared/`, move the pure engine modules).
      The design carries step-by-step procedures for slices 1-4; start there, not from scratch.
Blocked: design 001 needs user approval before any build work starts (feature.md § 2 GATE).

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings and no-undef globals (from S1 bootstrap; unfixed).
- Design 001 is approved on neither code nor scope yet — do not start building it. Both of its
  open questions are already answered: restart-loss accepted, no optimistic animation in v1.
- Scale is small and private (PROJECT.md constraints). Clustering, auth, durable persistence, and
  anti-cheat are explicit non-goals — prefer the simple mechanism.
- Test baseline: `pnpm test` → 797 pass / 0 fail (41 `.mjs` files, plain `node --test`, no jsdom).
- D3 in DECISIONS.md says rules tests use JSDOM. They do not; PROJECT.md was corrected in S2 but
  D3 itself is left as the user wrote it.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S2 2026-09-07 feature (phases 1-2): design 001 server-authoritative netcode — 10 decisions,
  20 edge cases, 8 slices, passive shadow-mode rollout. Draft, awaiting approval.
- S1 2026-09-07 bootstrap: adopted repository, verified 797 unit tests passing.
