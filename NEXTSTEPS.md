# NEXTSTEPS — in-flight increment ledgers ONLY (CLAUDE.md § Token / model policy).
# Cap ~60 lines. A finished ledger moves to .agent/archive/NEXTSTEPS-history.md in the session
# that finishes it.

# Active work — design 036: attack behaviour (merged to main with PR #183)

Slices 1–15 are on main (PR #183). Per-slice notes: `.agent/designs/036-attack-behaviour-implementation.md`
Deviations; HANDOFF.md (repo root) is the S284–S287 hand-off.
- [ ] 16 Regression gate: promote `audit-attack-behaviour.mjs` + baseline + `pnpm audit:attacks`; annotate reports;
      close I136. Edge row 14 (stacking markers) still untested.

# Parked — S264 batch leftovers (tracked as issues, not increments)
#5 "basic prompt gone" → I87 · #6 match logging → I85 (design 028) · #4 30th anniversary → I86 (design 029).
