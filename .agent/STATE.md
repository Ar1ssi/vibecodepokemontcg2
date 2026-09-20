# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 227
Focus: Authoritative renderer split an evolution stack into two side-by-side cards after a retreat.
Active: none.
Next: none.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- apply-view placement order (S227): a view can list a stack's attached card BEFORE its Basic root
  (`applyRetreatSwap` pushes the attached top Evolution first). `applyView` must place every root
  (`attachedTo == null`) before its attachments, or `placeCardInZone` falls through to the top-level
  play-zone branch and the stack renders as two cards. Regression test:
  `apply-view.test.mjs` "an attachment that precedes its root in view order still joins the host slot".
- KO promotion (S226/D88): `handleKnockout` no longer auto-promotes. It marks `player.promotionPending`;
  `settlePromotionChoices` at the command tail auto-promotes a lone Bench Pokémon or raises a
  PendingChoice (`source:'promote'`, `resumeToken.effectType:'promote'`) that the mat picker renders.
- Ancient Traits: `ancientTraitIn` recognizes all four printed markers Δ/θ/Ω/α + spelled "Delta …";
  `parseAbility` tags every step `trait`; EFFECTS stay announce-only. Audit `scripts/audit-all-ancient-traits.mjs`
  must report `unrecognized 0` (59 printings / 10 traits).
- Gen 5 Energy tab reverse holos: `REVERSE_HOLO_ENERGY_SET_IDS_BY_GENERATION[5]` lists every BW set with an
  Energy card; `fetchGenerationEnergyCards` synthesizes the `-reverse` variant.
- `pnpm lint` is pre-existing red: CRLF vs prettier `endOfLine` across the tree, plus `no-undef` on scripts
  that use `process`. Only treat new rule errors (not `Delete ␍` / `prettier/prettier`) as regressions.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S227 fix(render): applyView places stack roots before attachments so a retreat no longer splits the evolution
  stack into two side-by-side cards; 1 regression test, 2600/2600.
- S226 fix(rules): server-authoritative KO promotion raises a mat-pick PendingChoice (auto for 1 bench); 1 regression test, 2597/2597.
- S225 feat(deck-builder): Gen 5 Energy tab emits reverse-holo variants for all 7 BW sets with Energy cards; 21 targeted tests, 2592/2592.
