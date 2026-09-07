# Project — stable facts beyond CLAUDE.md. Read before feature work or when confused. Cap: 80 lines.

## Architecture (≤10 lines — how the pieces talk; MAP.md owns the directory list)
<fill at bootstrap>

## Constraints & non-goals (hard requirements; things deliberately unsupported)
<!-- Recorded S1 from the user; the rest of this file is still owed by bootstrap. -->
- Scale: small, mostly private. A handful of concurrent games, players known to each other.
  Prefer the simple mechanism over the scalable one whenever they conflict.
- Losing in-progress games on a server restart is acceptable. No durable game log, no crash
  recovery, no rehydration.
- Non-goals unless a decision reopens them: clustering/horizontal scaling, user accounts or auth,
  rate limiting, adversarial anti-cheat hardening.
- No build step. Browser loads native ESM; deploy is `pnpm install` then `node server/server.js`
  (`render.yaml`). Any proposal needing a bundler must justify itself in DECISIONS.md first.

## Glossary (domain terms with exact meanings — misreading one produces wrong code)
<fill at bootstrap>

## Landmines (cross-cutting gotchas, ≤15; area-specific ones belong in .agent/areas/)
<!-- format: symptom → actual cause → what to do instead -->
- (none yet)
