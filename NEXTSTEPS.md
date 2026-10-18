# NEXTSTEPS — in-flight increment ledgers ONLY (feature.md §2 step 4).
# Cap ~60 lines. A finished ledger moves to .agent/archive/NEXTSTEPS-history.md in the session
# that finishes it.

# Parked — S264 batch leftovers (tracked as issues, not increments)
#5 "basic prompt gone" → I87 · #6 match logging → I85 (design 028) · #4 30th anniversary → I86 (design 029).


# 074 three.js board — build ledger (design .agent/designs/074-three-board.md, approved by user 2026-10-16)
# Branch: claude/awesome-pascal-m8afbp. Opus subagent per slice; the session verifies + commits each.
# Waves: 1 = A1 B1 B2 B3 (parallel, disjoint) · 2 = A2 C1 · 3 = A3 C2 · 4-8 = C3 C4 C5 C6 C7 · 9-12 = D1-D4 · 13-14 = E1 E2 · 15 = F1 F2 · then G1 = user parity sign-off (stop).
done: A1 B1 B2 B3 C1 A2 C2 A3 (2026-10-16) · C3 095b993 · C4 34a126b · C5 f79a6b1 · C6 8d14869 · C7 56f6784 · D1 5e2e92d · F2 2009c6a · D2 645ebe5 · E2 ae27035 · E1 c2a2927 · D3 acad188 · D4 (this commit) — phases A–E complete, F2 done; 22 of 27
next: F1 (rewrite inspector/fullview/spectator e2e + fx-preview captures onto the mirror; Sonnet builder per user) → G1 user parity sign-off (stop) → G2 flag default on → G3 delete iframe path → H1–H3. Flags: turn-order seat on the wire (A3); legacy deck covers after solo flip (A3); foil colour + GPU budget need a real GPU (C2); legacy setupPrizes detaches opp-hand imgs after the deal (C7, I251); deck keys (arrows, s) still send the legacy index for server cards (D3); Tera skins return only on the next view after a context-loss rebuild (E2); `pnpm test:board3d` spectator steps flaky under load; D3 commit acad188 swept in D4's in-progress edits to close-popups.js/click-events.js/board-mirror.js whose new modules land only with D4 (HEAD between them does not load click-events.js); harnesses need CHROMIUM_PATH=/opt/pw-browsers/chromium here (Playwright wants chromium 1243; aliased under /opt/pw-browsers for scripts that ignore CHROMIUM_PATH). fullview-test.mjs needs an exported-state.json that is not in the repo — F1 rewrites it.
