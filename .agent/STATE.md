# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 302
Focus: design 039 / I168 copy-attack residuals on `feature/i168-copy-attacks` (from main
  `1d2fb8ae`): 17 wordings fixed — old "copies that attack" prints, previous-Evolution
  (`priorEvolutionCards`), last-turn (new `player.lastAttack`, scoped by turn number), Slowking
  deck top, Mew opponent discard, Dark/Tera filters, Thievul/Nihilego conditions. Design 039
  shipped + archived; D150/D151; I168 closed; I181 tracks the 5 deferrals.
Active: none — built, verified (suite 4178/4179 known inspector fail; four gates PASSED) and
  committed on `feature/i168-copy-attacks` (one commit, user choice). Not pushed/merged.
Next: maintenance due (S300 cadence): DECISIONS 150+ lines vs 90 cap, designs/ root ~50 shipped
  docs; triage I180. Backlog: I181 copy deferrals, I167 markers, I166 effects, I162 abilities,
  then I153 (needs a contract first), I137, I121, I126 (partial), I127, I44, I60. User visual
  check of typed Tera entry/skin + Mega vortex. Pending approval: designs 028 (I85), 029 (I86).
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
- S302: design 039 / I168 — 17 residual copy wordings fixed + `player.lastAttack`; I168 closed,
  I181 filed; suite 4178/4179, four gates PASSED.
- S301: merge `claude/rules-engine-issues-e79707` into main — harness union, no id renumber.
- S300 branch: design 036 slice 16 — `pnpm audit:attacks` gate + per-row baseline; I136 closed.
