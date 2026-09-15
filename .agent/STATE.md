# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 136
Focus: feature — TCG Live-style holofoil (design 010, D34): fixed virtual light instead of the
  cursor, card-ink luminance mask, gold/SIR rewrite, default sparkle, angle shading.
Active: built on branch claude/holofoil-effects-comparison-919cf3 (worktree), tests green,
  committed + PR + merged to main at user's request (S136 close). holo.mjs (computeLightVars/driftTilt/foilMaskUrl, light from rotation or drift),
  css/holo/base.css (ink mask on all layers, default sparkle, angle shading), hyper-rare.css +
  ex-special-illustration-rare.css (identical, contract-tested), ex-full-art.css (ink mask),
  holo.test.mjs + new holo-css.test.mjs, package.json test list. Suite 1446/1446.
  Not viewed in a browser by me — user checks localhost (recorded preference).
  Highlight direction flipped so previews never read as a cursor light (design 010 Deviations).
  Round 2 (user feedback): no dark glare edges, stronger foil, tilted previews no longer clipped.
  Worktree server running for the user at http://localhost:4000 (preview "app").
  User's localhost :4001 serves the PRIMARY checkout (main) — the worktree must run on its own
  port (PORT=4002) to be seen before merge.
Next: user eyeballs holo cards on localhost (board drift, preview tilt, gold hyper rare); tune
  LIGHT/DRIFT constants or CSS opacities from feedback; commit + push only when user says so.
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
- S136 2026-09-15 feature: TCG Live-style holofoil (fixed light, ink mask) — PR #130, merged 9729902.
  + patch: Primal Kyogre sleeve cropped (no white margins), pushed to main directly.
- S135 2026-09-15 feature: ability-guidance accuracy + Mega/Primal Spirit Link turn-end rule.
- S134 2026-09-15 feature: CSV deck export/import now carries sleeve+coin. Pushed 3883471.
