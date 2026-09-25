# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 304
Focus: landed design 040 transform-form sprites on main (`1d2fb8ae` + S302/S303 → merge tip): the
  deck sprite catalog gains 86 battle alternate forms (Kyurem B/W, Necrozma dawn/dusk/ultra, Rotom
  appliances, Calyrex riders, Arceus/Silvally type forms, …) + 172 vendored PNGs; card-sprites
  resolves form names/aliases/types (D152); harness union, no code overlap with S302/S303.
Active: none — pushed to main; primary folder synced.
Next: maintenance due (S302 handoff item 2): DECISIONS vs cap, designs/ root ~50 shipped docs,
  ISSUES 38/30, triage I180; MAP spot-checks, flags, scratch/worktrees. Then backlog: I181 copy
  deferrals, I167 markers, I166 effects, I162 abilities, then I153 (needs a contract first), I137,
  I121, I126 (partial), I127, I44, I60. User visual checks: typed Tera entry/skin + Mega vortex,
  and the sprite picker (search kyurem / necrozma / arceus). Pending approval: designs 028 (I85),
  029 (I86). Worktrees `rules-engine-issues-e79707` and `i168-copy-attacks` are merged, safe to remove.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`,
  `pnpm audit:attacks` (~2 min). Known `pnpm test` failure: card-inspector-model "retreat greys…";
  coin-flip-ceremony is flaky.
- Copy attacks: spec in `rules/attack-copy.mjs`; unknown prefixes fail closed. `player.lastAttack`
  is read only at `turnNumber === currentTurn - 1` (extra turns break it). Multi-coin "all N are
  heads" copy gates stay unparsed (I181).
- Engine: `applyCommand` clones state — read results via the returned `state`; attacking ends the
  turn. Special-Energy fixtures need `type: 'Energy'` and accented "Pokémon" text.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- `opponentHandSetAside` (Tickling Machine heads) parses but has no executor — tracked in I137.

## Recently shipped (≤3 one-liners; older → journal)
- S304: landed design 040 transform-form sprites (86 forms + 172 vendored PNGs; D152); merged with
  S302/S303, suite 4185/4186 (known inspector fail).
- S303: landed `feature/i168-copy-attacks` on main (fast-forward `1d2fb8ae` → `8f387bdf`; design
  039 / I168); suite 4178/4179, four gates PASSED.
- S302: design 039 / I168 — 17 residual copy wordings + `player.lastAttack`; I168 closed, I181 filed.