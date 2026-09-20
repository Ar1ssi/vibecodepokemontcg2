# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 213
Focus: merging PR #175 & PR #176 into main. PR #175 merged; PR #176 resolving and merging.
Active: merge PR #176 into main.
Next: sync primary local repository on main and verify full test suite.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Stadium extras have ONE merge order (D78): printed → inherited → granted, de-duped by name, shared by server and client.
- Both classifiers (attack & ability) are order-sensitive: primary mechanic wins. Both are announce-only.
- pkmncards text extraction normalizes curly quotes to ASCII; static clauses with no header skipped via `STATIC_CARD_TEXT`.
- Server executor (`shared/engine/effects/executor.mjs`) supports a subset of step types; S213 new steps + damageCounters/moveEnergy/variableDraw are client-only.
- Lost Zone rail (outside #battleMat) mirrors piles, opens zone on click, accepts drag/drop via `[data-drop-zone]` in drag.js.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S213 feature: pkmncards trainer parse coverage (~57 step families, 402→25 unrecognizable) + Lost Zone rail (PR #176).
- S212 feature: closed I65 — all 4228 abilities parse + classify (gaps 199→0, D83, PR #175).
- S207 stadium deep mechanics + client attack-list wiring (PR #174, D78).
