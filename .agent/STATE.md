# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 179
Focus: Merging PR #153 (TCG Live card inspector) into main.
Active: worktree-card-inspector merging origin/main.
Next: Complete PR #153 merge to main and sync local repository.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- D53 supersedes 008 D1/D6: card inspection and attack selection live on double-click; single-click returns to select-to-move (repairs 008 R3). attack-preview.js, attack-preview-gate.js and gate test are removed.
- The card scan is the background and stays visible (C1). Occluding panels cover only replaced print. Dimming uses filter (C2), never opacity (to prevent print ghosting).
- Dual-sourced card shapes in model: weakness/resistance (singular and plural), printed damage (string vs number), and retreat tile only shows Colorless pips.
- Duplicate hand stacking groups duplicate face-up cards in .hand-card-stack containers with count badges and stepped offsets; underlying zone arrays untouched.
- Legacy zone arrays are EMPTY under SERVER_AUTHORITATIVE 2P. Read getAuthoritativeZoneArray(side, zone) / cardRegistry and address by instanceId (D12, D47).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S179 2026-09-19 feature: TCG Live card inspector on double-click (PR #153, design 013, D53).
- S178 2026-09-18 feature: duplicate card stacking in hand with stepped offset layers and count badges (PR #151).
- S177 2026-09-18 feature: Starting Active Pokémon Selection Step (TCG Live style) before turn 1 starts.
