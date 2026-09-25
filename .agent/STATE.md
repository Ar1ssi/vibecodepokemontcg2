# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 297
Focus: I155+ backlog fixes on `claude/rules-engine-issues-e79707` (12 commits, not pushed):
  S297a closed I164 I151 I165 I78 I173 I175 I172 I169; S297b closed I171 I155 I154 I163 I161.
Active: none — branch green, ready to push / merge; nothing half-done.
  Handoff: `.agent/scratch/297-i155-handoff.md` (branch state, decisions, next sessions).
Next: push `claude/rules-engine-issues-e79707` (or PR) — it is main + 12 commits, all gates green.
  I153 needs its own feature session: per-viewer event filtering (design 038 option 3B) has no
  contract yet — it touches the netcode contract and every event producer.
  Remaining I155+ backlog, each its own session: I168 copy attacks, I167 attack markers, I166
  attack effects, I162 ability-audit backlog. Then I136, I137, I121, I126 (partial), I127, I44, I60.
  User visual check of typed Tera entry/skin + Mega vortex in a real rules-mode game.
  Pending approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`.
  I154/I155/I161 legitimately changed baselines (`trainer-behaviour-baseline.json` regenerated);
  a baseline change needs `--update-baseline` + a commit. Known `pnpm test` failure:
  card-inspector-model "retreat greys…"; coin-flip-ceremony is flaky.
- The I155 hand-ability work is server-authoritative only: glow/affordance model, bot options and
  the context-menu `useAbility` dispatch. The legacy ability-picker was deliberately left alone
  (user: legacy is never used).
- `opponentHandSetAside` (Tickling Machine heads) parses but has no executor — tracked in I137.
- Engine: `applyCommand` clones state — read results via `findRes.state`; attacking ends the turn.
  Special-Energy fixtures need `type: 'Energy'` and accented "Pokémon" text.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.

## Recently shipped (≤3 one-liners; older → journal)
- S297b: I171 shields, I155 coin turn-ends + hand abilities, I154 26 trainer executors, I163
  between-turns Checkup, I161 retreat wordings — suite 4010/4011, all 3 gates PASSED.
- S297a: I164 I151 I165 I78 I173 I175 I172 I169 — suite 3964/3965, 3 gates PASSED.
- S296 merged PRs #186/#187/#188 (special-Energy, inspector, drag) to main.
