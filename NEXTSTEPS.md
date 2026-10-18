# NEXTSTEPS — in-flight increment ledgers ONLY (feature.md §2 step 4).
# Cap ~60 lines. A finished ledger moves to .agent/archive/NEXTSTEPS-history.md in the session
# that finishes it.

# Parked — S264 batch leftovers (tracked as issues, not increments)
#5 "basic prompt gone" → I87 · #6 match logging → I85 (design 028) · #4 30th anniversary → I86 (design 029).


# 074 three.js board — build ledger (design .agent/designs/074-three-board.md, approved by user 2026-10-16)
# Branch: claude/awesome-pascal-m8afbp. Opus subagent per slice; the session verifies + commits each.
# Waves: 1 = A1 B1 B2 B3 (parallel, disjoint) · 2 = A2 C1 · 3 = A3 C2 · 4-8 = C3 C4 C5 C6 C7 · 9-12 = D1-D4 · 13-14 = E1 E2 · 15 = F1 F2 · then G1 = user parity sign-off (stop).
done: A1 B1 B2 B3 C1 A2 C2 A3 (2026-10-16) · C3 095b993 · C4 34a126b · C5 f79a6b1 · C6 8d14869 · C7 56f6784 · D1 5e2e92d · F2 2009c6a · D2 645ebe5 · E2 ae27035 · E1 c2a2927 · D3 acad188 · D4 58eac73 · F1 8604cfb · G1 019a3a0 (user: "Appears to be correct") · G2 224b6c3 · G3 76119de · H1a+H3 03c4d74 · H1b 63a6777 · H2 (this commit) — all 27 rows landed on the branch
next: user visual check of H1/H2/H3 on localhost (draw/KO/retreat/promote/opp-Trainer mesh flights, focus mesh + dim hole, TCG Live camera checkbox) → review pass (feature.md phase 5) on the netcode/engine diffs by a reviewer agent → "push to main" (DECISIONS/MAP/STATE/ISSUES updated in that commit; ISSUES gets the orphaned sheets, the card-pop spring dt clamp, the retreat/promote pop, the 2P-join-under-load flake). Builders stop at lint + unit tests; the session runs harnesses one at a time.
