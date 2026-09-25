# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 302
Focus: design 039 shipped — the deck sprite catalog gained 86 battle alternate forms (Kyurem
  B/W, Necrozma dawn/dusk/ultra, Rotom appliances, Calyrex riders, Arceus/Silvally type forms,
  …), 172 vendored PNGs; `card-sprites.mjs` resolves form names, aliases and card types (D150).
Active: none.
Next: user browser check of the sprite picker (search kyurem / necrozma / arceus). Then the
  backlog from S301: I168 copy attacks, I167 attack markers, I166 attack effects, I162
  ability-audit backlog, then I153 (needs a contract first), I137, I121, I126 (partial), I127,
  I44, I60. Pending approval: designs 028 (I85), 029 (I86).
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
- S302: design 039 transform-form sprites — 86 catalog rows + 172 PNGs; card names/types resolve
  the form; suite 4165/4166 (known inspector fail), eslint clean.
- S301: merge `claude/rules-engine-issues-e79707` into main — harness union, no id renumber;
  suite 4158/4159 (known inspector fail), all four behaviour gates PASSED.
- S300 branch: design 036 slice 16 — `pnpm audit:attacks` gate + per-row baseline; I136 closed.