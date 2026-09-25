# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 301
Focus: landed `claude/rules-engine-issues-e79707` on main (merge commit below) — main's S297–S300
  (design 024 FX/settings, S298/S299 board fixes, Gaia Volcano + Birch/Drasna/Gambler) unioned with
  the branch's S297 I155+ batch and S300 design 036 slice 16 (`pnpm audit:attacks` + baseline).
  Harness conflicts (journal/DECISIONS/ISSUES/STATE) resolved by union; ids needed no renumber
  (D146–148 + D149; I177–180 + the branch's closures), next D150 / I181.
Active: none — pushed to main (`5c8f09fa`); primary folder fast-forwarded to it; suite
  4158/4159 (known inspector fail), all four behaviour gates PASSED on the merge.
Next: maintenance due. Remaining backlog, each its own session: I168 copy attacks, I167 attack
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
- S301: merge `claude/rules-engine-issues-e79707` into main — harness union, no id renumber;
  suite 4158/4159 (known inspector fail), all four behaviour gates PASSED.
- S300 branch: design 036 slice 16 — `pnpm audit:attacks` gate + per-row baseline; I136 closed.
- S300 main: Gaia Volcano Stadium-bonus/discard step + Birch/Drasna/Gambler coin shuffle-draw.
