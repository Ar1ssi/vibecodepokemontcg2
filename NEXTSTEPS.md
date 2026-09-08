# Netcode repair — increment ledger

Branch: `feature/netcode-repair`. Full plan: `.agent/designs/002-netcode-repair.md`.
One commit per slice; each commit leaves `pnpm test` green. `/clear` between slices.

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 0.1 | done | 8a79f12 | `SERVER_AUTHORITATIVE` defaults off; `render.yaml` explicit |
| 0.2 | done | 843f13b | `resolveRenderTargets` guard in `apply-view.js`; stadium-wipe repro fixed |
| 1.1 | done | f8f22a2 | Peer-log reconnect catch-up + O2-C fallback |
| 1.2 | done | 3a41122 | Counter-ordered `requestAction` queue |
| 1.3 | done | 57865a0 | Dead-scaffolding deletion; kept requestSyncLogBundle/syncLogBundle (live) |
| 2.1 | done | fc12f49 | Sweep grace + `roomInfo` decoupling |
| 2.2 | done | 4bd8c43 | `clientSeq` clearing, protocol version, `emitCmd` surfacing |
| 3.1 | | | **3A** `instanceMap` round-trip; index fallbacks deleted |
| 3.2 | | | **3A** Disposition map classifies all 58 actions (classify only, no impl) |
| 3.3 | | | **3A** Condition normalisation rejects unknowns |
| 3.4a | | | **3A** Zone-op translations |
| 3.4b | | | **3A** Prize & board translations |
| 3.4c | | | **3A** Setup & turn translations |
| 3.4d | | | **3A** Reveal/look family classified and translated |
| 3.4e | | | **3A** `undo` per D6, or re-gate |
| 3.5 | | | **3A exit** Server-truth replay harness (`hashState` agreement) |
| — | | | **O4 GATE** — rule on end state, record as D11. Blocks 3B. |
| 3.6 | | | **3B** Interactive elements via a shared image factory |
| 3.7 | | | **3B** Counters and status overlays |
| 3.8 | | | **3B** Covers, hand sort, intra-zone order (#10), attachment class (#11) |
| 3.9 | | | **3B** Reveal/look overlays |
| 3.10 | | | **3B** Room-change reset + context re-seed |
| 3.11 | | | **3C** Desync detection routed into the 1.1 peer-log path |
| 3.12 | | | **3C** Flip gate: full two-browser game, flag on |

Phases 0–2 are done (flag off; they changed only the path already in production).

Phase 3 was re-scoped in S39 after Phase 2 landed. It now splits three ways:

- **3A (3.1–3.5)** — make the server provably right. No renderer, no DOM, zero production
  exposure. Slice 3.5 (replay recorded 2P traffic through `GameRoom`, assert `hashState`
  agreement) is the exit test and the evidence the O4 gate needs.
- **O4 gate** — decide the end state: full authoritative rendering (A), server-as-arbiter only
  (B), or B now with A behind its own gate (C). OPEN. Rule on it with 3.5's evidence in hand,
  record as D11. **Do not start 3B first.**
- **3B (3.6–3.10)** — renderer parity, only if O4-A or O4-C. This is the migration's real cost
  centre: the authoritative renderer today emits a bare `<img>` with no listeners, no counter
  overlays and no covers, so wiring it in as-is would replace a working interactive board with a
  dead picture of one.
- **3C (3.11–3.12)** — desync detection, then the flip.

Verify each slice with `pnpm test` + `pnpm test:2p`. Manual two-browser games only matter from
3.6 onward — before that the renderer is inert by design.
