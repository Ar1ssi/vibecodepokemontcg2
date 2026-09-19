# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 182
Focus: "make the engine not zone-agnostic on abilities" — Active-Spot abilities now gated in the
  engine, the server and the panel. PR #159 open.
Active: worktree `.qwen/worktrees/ability-zone` (`fix/ability-zone-restriction`), clean and pushed.
Next: Note S179's warning is now stale (`pnpm install` in a worktree takes 6s and makes the full
  gate runnable). Outstanding from S181/S182: neither has been browser-verified under
  `SERVER_AUTHORITATIVE=1` — for PR #159, double-click a benched Pokémon with a positional ability
  and confirm the panel is greyed and the server refuses the dispatch.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- A positional ability is now refused from the Bench by the ENGINE (`requiresActiveSpot` in
  `ability-executors.mjs`), not only by the panel. `listAbilities` takes an optional `zone`
  (default `'active'`) — a caller that passes a wrong zone now changes gameplay, not just UI.
- The predicate is deliberately NARROW: only "if this Pokémon is in the Active Spot" / "…is active".
  Do NOT broaden it to a bare mention of the Active Spot — that also matches the on-move trigger
  ("when this Pokémon moves from your Bench to the Active Spot") and the "As long as…" passive, both
  legal from the Bench. A false positive silently breaks a legal ability.
- `useVStarGX` shares the active/bench reachability but its legality case resolves no card, so it is
  NOT covered by that guard (I60).
- The card scan is the background and stays visible (C1). Dimming uses filter (C2), never opacity —
  translucent panels let the printed card ghost back through.
- Legacy zone arrays are EMPTY under SERVER_AUTHORITATIVE 2P. Read `getAuthoritativeZoneArray` /
  `cardRegistry` and address cards by instanceId (D12, D47).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S182 2026-09-19 patch: Active-Spot abilities refused from the Bench in engine + server + panel
  (PR #159, design 015, D54).
- S181 2026-09-19 patch: `passiveCostDiscount` no longer discounts attacks for merely mentioning
  Energy — committed then, but it only reached main now, inside PR #159 (see the S182 journal entry).
- S179 2026-09-19 feature: TCG Live card inspector on double-click (PR #153, design 013, D53).
