# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 207
Focus: Stadium full-coverage pass on branch `fix/stadium-effect-parsing` (PR #174), UNCOMMITTED on
  top of 79e8084 (batches 1–3 + deep mechanics, none journaled until now). Removed the dangerous
  `kind:'search'` fallback (`UNMODELED_GATE`); wired every parseable active/passive; closed all 7
  complex actives (Glimwood Tangle keep/re-flip). Deep mechanics: Special-Energy rewrites (Temple of
  Sinnoh / Crystal Beach / Holon Research Tower), attack inheritance (Shrine of Memories / Meteor
  Falls) and grants (Holon Lake / Rocket's Tricky Gym), and the three unlimited "as often as … likes"
  energy actions (Ultimate Zone / Saffron City Gym / Celadon City Gym). Client now computes Stadium
  `extraAttacks` from the live zone (rules-bridge affordance + card-inspector `resolveLiveContext`)
  and indexes a merged attack list; repeatable Stadiums bypass `stadiumUsedThisTurn` (D78).
Active: uncommitted on `fix/stadium-effect-parsing`; full suite 2226/2226; audit 0 unparsed.
Next: commit the branch into PR #174 — first split the unrelated Thundurus delta in
  `energy-effects.mjs`. Then overdue maintenance (DECISIONS ~127 lines vs 50-line cap; journal ~2290).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm test` = D75 globs, 2226/2226 green. Lint bar: `npx eslint --rule 'linebreak-style: off'
  --rule 'prettier/prettier: off' <files>`; pre-existing errors only (document/requestAnimationFrame,
  no-empty, unused imports, `dmg` no-undef in chat-buttons). `pnpm lint` NOT usable.
- Stadium extras have ONE merge order (D78): printed → inherited → granted, de-duped by name, shared
  by server `attackViewFor` and client `stadiumExtraAttacksFromZone`/`listAttacks`/`mergeAttacks`. An
  `attackIndex` is an index into that merged list — never into `card.attacks` alone.
- `isRepeatableStadiumAction` is the single gate exempting Ultimate Zone / Saffron City Gym / Celadon
  City Gym from the once-per-turn flag (reduce.mjs canPerformAction, effects/stadium.mjs, chat-buttons).
- `out/` is NOT gitignored; audit: `node scripts/audit-all-stadiums.mjs` → `out/stadium-full-audit.txt`
  (212 unique | 0 unparsed | 117 continuous-both | 67 once-per-turn | 28 unknown).
- The client inspector/affordance context is 'self'-oriented (`resolveLiveContext` reads
  `getZone('self', …)`), so opening it on the opponent's card yields no extras — pre-existing.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S207 stadium deep mechanics + client attack-list wiring; D78, I65; 2226/2226, 0 unparsed.
- S206 merge: PRs #171/#172/#173 on `main`; 171+173 once-per-game reconciled; 2145/2145, lint delta nil.
- S205 review-fix Phase 6: TFHG/tiebreak kept + documented (D74), `pnpm test` → globs (D75); 2126/2126.
