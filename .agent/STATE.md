# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 226
Focus: Server-authoritative Active-KO promotion now prompts (mat picker) instead of auto-taking bench[0].
Active: none.
Next: none.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- KO promotion (S226/D88): `handleKnockout` no longer auto-promotes. It marks the KO'd player with
  `player.promotionPending`; `settlePromotionChoices` runs at the command tail (before
  `settlePrizeEntitlements`) and auto-promotes a lone Bench Pokémon or raises a PendingChoice
  (`source:'promote'`, `resumeToken.effectType:'promote'`, min=max=1) for 2+, which the existing
  mat picker renders. `promoteBenchToActive` is shared by the direct `promote` command + resume.
- Ancient Traits: `ancientTraitIn` (`shared/engine/rules/abilities.mjs`) recognizes all four printed
  markers Δ/θ/Ω/α + the spelled "Delta …"; `parseAbility` tags EVERY step with `trait` at one site.
  Ancient-Trait EFFECTS are announce-only — the parser tags them but nothing executes them.
- Ancient-Trait audit: `node scripts/audit-all-ancient-traits.mjs` over `out/pkmn-ancient-trait-cards.json`
  must report `unrecognized 0`; current 59 printings / 10 traits. Report `out/ancient-trait-full-audit.txt`.
- Gen 5 Energy tab reverse holos: `REVERSE_HOLO_ENERGY_SET_IDS_BY_GENERATION[5]` lists every BW set with an
  Energy card (`bw1,bw4,bw6,bw8,bw9,bw10,bw11`); `fetchGenerationEnergyCards` synthesizes `-reverse`.
- `pnpm lint` is pre-existing red: CRLF vs prettier `endOfLine` across the tree, plus `no-undef` on scripts
  that use `process`. Only treat new rule errors (not `Delete ␍` / `prettier/prettier`) as regressions.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S226 fix(rules): server-authoritative KO promotion raises a mat-pick PendingChoice (auto for 1 bench); 1 regression test, 2597/2597.
- S225 feat(deck-builder): Gen 5 Energy tab emits reverse-holo variants for all 7 BW sets with Energy cards; 21 targeted tests, 2592/2592.
- S224 feat(rules): Ancient-Trait audit + Δ/θ marker support; parseAbility tags all steps (App. 23/D72); 4 tests.
