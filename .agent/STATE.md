# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 228
Focus: Modern Mega prize count — Gen 9 Mega ex award 3 (was 2), Gen 6 Mega-EX stay 2.
Active: none.
Next: none.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Mega prize split (D89): `prizesForKO` gives **3** to `isModernMegaCard` ("Mega X ex", 2025+),
  **2** to `isLegacyMegaCard` ("M X-EX"/"Primal X-EX", Gen 6). `isModernMegaCard` checks the legacy
  name form FIRST so a `stage: "MEGA"`-derived subtype token can't mis-flag a legacy Mega. Mega
  turn-end (`evolution.mjs`/D33) reads the same two predicates — don't reintroduce `isMegaCard`.
- apply-view placement order (S227): a view can list a stack's attached card BEFORE its Basic root
  (`applyRetreatSwap` pushes the attached top Evolution first). `applyView` must place every root
  (`attachedTo == null`) before its attachments, or `placeCardInZone` falls through to the top-level
  play-zone branch and the stack renders as two cards. Regression: `apply-view.test.mjs`.
- KO promotion (S226/D88): `handleKnockout` no longer auto-promotes. It marks `player.promotionPending`;
  `settlePromotionChoices` at the command tail auto-promotes a lone Bench Pokémon or raises a
  PendingChoice (`source:'promote'`, `resumeToken.effectType:'promote'`) that the mat picker renders.
- Ancient Traits: `ancientTraitIn` recognizes all four printed markers Δ/θ/Ω/α + spelled "Delta …";
  `parseAbility` tags every step `trait`; EFFECTS stay announce-only. Audit `scripts/audit-all-ancient-traits.mjs`
  must report `unrecognized 0` (59 printings / 10 traits).
- `pnpm lint` is pre-existing red: CRLF vs prettier `endOfLine` across the tree, plus `no-undef` on scripts
  that use `process`. Only treat new rule errors (not `Delete ␍` / `prettier/prettier`) as regressions.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S228 fix(rules): modern Mega ex → 3 prizes, legacy Mega-EX → 2; `isModernMegaCard` name-first (D89); full suite 2598/2598.
- S227 fix(render): applyView places stack roots before attachments so a retreat no longer splits the evolution
  stack into two side-by-side cards; 1 regression test, 2600/2600.
- S226 fix(rules): server-authoritative KO promotion raises a mat-pick PendingChoice (auto for 1 bench); 1 regression test, 2597/2597.
