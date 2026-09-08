# Netcode repair — increment ledger

Branch: `feature/netcode-repair`. Full plan: `.agent/designs/002-netcode-repair.md`.
One commit per slice; each commit leaves `pnpm test` green. `/clear` between slices.

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 0.1 | done | 8a79f12 | `SERVER_AUTHORITATIVE` defaults off; `render.yaml` explicit |
| 0.2 | done | 843f13b | `resolveRenderTargets` guard in `apply-view.js`; stadium-wipe repro fixed |
| 1.1 | done | f8f22a2 | Peer-log reconnect catch-up + O2-C fallback |
| 1.2 | next | | Counter-ordered `requestAction` queue |
| 1.3 | | | Dead-scaffolding deletion (grep each event for a live listener first) |
| 2.1 | | | Sweep grace + `roomInfo` decoupling |
| 2.2 | | | `clientSeq` clearing, protocol version, `emitCmd` surfacing |
| 3.1 | | | `instanceMap` round-trip; index fallbacks deleted |
| 3.2 | | | Renderer wired to iframes; findings #10, #11 fixed |
| 3.3 | | | Disposition-map exhaustiveness over all 58 actions |
| 3.4 | | | Condition normalisation rejects unknowns |
| 3.5 | | | Room-change reset + `hashState` desync detection |
| 3.6 | | | Flip gate: full two-browser game, flag on |

Phases 0–2 change only the path already in production (flag off) — verify each with
`pnpm test` + `pnpm test:2p` + one manual two-browser game. Phase 3 is the migration tail;
re-scope after Phase 2 lands per the design's closing note.
