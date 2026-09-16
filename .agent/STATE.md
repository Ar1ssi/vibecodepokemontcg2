# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 137
Focus: feature — holofoil fixes per generation (reverse holo art cut, gold seams, rarity mapping,
  silver shiny effect, holo rare art-window clip, classic cosmos).
Active: all uncommitted in worktree claude/holofoil-effects-comparison-919cf3; suite 1477/1477.
  Worktree server for the user at http://localhost:4000 (preview "app").
Next: user checks on :4000 every new effect (list in journal S137); tune from feedback;
  commit + push only when user says so. Radiant not reviewed against TCG Live.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox session (not persisted). Playwright's
  pinned browser revision (1.63.0) won't match what's pre-installed at /opt/pw-browsers — launch
  with `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Test netcode changes in BOTH modes (`SERVER_AUTHORITATIVE=1` vs default); S101 shipped a
  legacy-only fix to a server-authoritative prod (D17).
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json
  (holo tests were silently excluded until S136). `pnpm lint` fails repo-wide on CRLF + `no-undef`
  on `.mjs`; lint a diff with `npx eslint --rule 'linebreak-style: off' <files>`. No prettier CLI
  installed — `eslint --fix` applies prettier formatting.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Holo `--pointer-*` CSS vars mean the LIGHT position (from card angle), not the cursor (D34).
  A mask-image host without CORS hides the foil entirely — extend INK_MASK_CORS_HOSTS only after
  checking the host's Access-Control-Allow-Origin header.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S137 2026-09-16 feature: reverse holo rewrite + per-generation holo fixes (uncommitted, awaiting user check).
- S136 2026-09-15 feature: TCG Live-style holofoil (fixed light, ink mask) — PR #130, merged 9729902.
  + patch: Primal Kyogre + Groudon sleeves cropped (no white margins), pushed to main directly.
- S135 2026-09-15 feature: ability-guidance accuracy + Mega/Primal Spirit Link turn-end rule.
- S134 2026-09-15 feature: CSV deck export/import now carries sleeve+coin. Pushed 3883471.
