# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 303
Focus: landed `feature/i168-copy-attacks` on main (fast-forward `1d2fb8ae` → `8f387bdf`): design 039
  copy-attack residuals (`6076be12`) + S302 handoff (`8f387bdf`). Verified on the tip before
  landing: suite 4178/4179 (known inspector fail), four gates PASSED; no conflicts. I168 closed,
  I181 filed; D150/D151 already on the branch.
Active: none — main pushed; primary synced at `8f387bdf`.
Next: maintenance due (S302 handoff item 2): DECISIONS 152 lines vs 90 cap, designs/ root ~50
  shipped docs, ISSUES 38 open/30 closed (at cap); triage I180; MAP spot-checks, flags,
  scratch/worktrees. Then backlog: I181 copy deferrals, I167 markers, I166 effects, I162
  abilities, then I153 (needs a contract first), I137, I121, I126 (partial), I127, I44, I60.
  Worktrees `rules-engine-issues-e79707` (dirty: orphan draft) and `i168-copy-attacks` are merged
  and safe to remove. Orphan `039-transform-form-sprites.md` (rules-engine worktree) collides with
  shipped 039 — renumber (040) + approval. User visual check typed Tera entry/skin + Mega vortex;
  pending approval designs 028 (I85), 029 (I86).
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
- S303: landed `feature/i168-copy-attacks` on main (fast-forward `1d2fb8ae` → `8f387bdf`; design
  039 / I168); suite 4178/4179, four gates PASSED.
- S302: design 039 / I168 — 17 residual copy wordings + `player.lastAttack`; I168 closed, I181 filed.
- S301: merge `claude/rules-engine-issues-e79707` into main — harness union, no id renumber.
