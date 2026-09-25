# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 300
Focus: design 036 slice 16 shipped on `claude/rules-engine-issues-e79707` (19 commits, not pushed):
  attack regression gate `pnpm audit:attacks` (`scripts/audit-attack-behaviour.mjs`,
  `scripts/lib/attack-behaviour.mjs`, `scripts/lib/attack-harness.mjs`) + per-row
  `scripts/attack-behaviour-baseline.json` (3,528 unique attacks: 3,247 ok / 152 partial /
  129 ran-no-effect / 0 engine-error); 12 tests; I136 closed.
Active: none — branch green, ready to push / merge.
  Handoff: `.agent/designs/300-handoff.md` (branch state, decisions, next sessions).
Next: push `claude/rules-engine-issues-e79707` (or PR) — it is main + 19 commits, all gates green.
  Maintenance due (S300). Remaining backlog, each its own session: I168 copy attacks, I167 attack
  markers, I166 attack effects, I162 ability-audit backlog. Then I153 (needs a contract first),
  I137, I121, I126 (partial), I127, I44, I60. User visual check of typed Tera entry/skin + Mega
  vortex in a real rules-mode game. Pending approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`,
  `pnpm audit:attacks` (~2 min, design 036 slice 16). A legitimate baseline change needs
  `--update-baseline` + a commit. Known `pnpm test` failure: card-inspector-model "retreat greys…";
  coin-flip-ceremony is flaky.
- `pnpm audit:attacks` covers committed `out/pkmn-pokemon-cards.json` (3,528 unique effect
  attacks); the S279 10,966-attack full `type:pokemon` sweep is scratch-only and ungated. Its
  partial/no-effect rows are the I166–I168 ratchet.
- Engine: `applyCommand` clones state — read results via the returned `state`; attacking ends the
  turn. Special-Energy fixtures need `type: 'Energy'` and accented "Pokémon" text.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- `opponentHandSetAside` (Tickling Machine heads) parses but has no executor — tracked in I137.

## Recently shipped (≤3 one-liners; older → journal)
- S300: design 036 slice 16 — `pnpm audit:attacks` gate + per-row baseline; I136 closed;
  suite 4041/4042 (known inspector fail); `audit:attacks` PASSED (no engine diff, other gates untouched).
- S297b: I171 shields, I155 coin turn-ends + hand abilities, I154 26 trainer executors, I163
  between-turns Checkup, I161 retreat wordings — suite 4010/4011, all 3 gates PASSED.
- S297a: I164 I151 I165 I78 I173 I175 I172 I169 — suite 3964/3965, 3 gates PASSED.
