# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 224
Focus: Ancient-Trait parse coverage — Δ/θ markers + `has:ancient-trait` corpus audit.
Active: none.
Next: none.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Ancient Traits: `ancientTraitIn` (`shared/engine/rules/abilities.mjs`) recognizes all four printed
  markers Δ/θ/Ω/α + the spelled "Delta …"; `parseAbility` tags EVERY step with `trait` at one site
  (after the passive fallback). `isAncientTraitAbility` gates "have no Abilities" (`stadiumAbilityBlocked`);
  marker-less wording is never a trait (D72); values are 'alpha'|'omega'|'delta'|'theta' ('ancient' = bare header).
- Ancient-Trait audit: `node scripts/audit-all-ancient-traits.mjs` over `out/pkmn-ancient-trait-cards.json`
  (re-scrape: `scrape-pkmncards.mjs --query="has:ancient-trait"`); must report `unrecognized 0`, else exits 1.
  Current: 59 printings / 10 traits / guided 3 / passive 7. Report: `out/ancient-trait-full-audit.txt`.
- The pkmncards splitter is now shared: `scripts/lib/split-card-text.mjs` (both `audit-all-pokemon.mjs` and
  the ancient-trait audit import it). Scripts use `process`, which eslint flags `no-undef` (pre-existing style).
- Ancient-Trait EFFECTS (Δ Plus extra prize, θ Max heal-on-evolve, θ Double extra tool, …) are announce-only —
  the parser tags them but nothing executes them.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S224 feat(rules): Ancient-Trait audit + Δ/θ marker support; parseAbility tags all steps (App. 23/D72); 4 tests.
- S223 feat(rules): authoritative special-energy trigger execution (attach/evolve/damaged/KO/endTurn/discard) + Legacy guard; 11 tests (I69).
- S222 feat(rules): wired special-energy on-evolve/on-damaged/end-turn triggers + Retro devolve; Legacy prize test.
