# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 135
Focus: feature — ability guidance accuracy for Ancient-Trait-style texts (α Growth / Ω Barrier)
  + Gen 6 Mega Evolution/Primal Reversion turn-end mechanic with Spirit Link exemption, excluding
  modern (2025+) Mega ex cards.
Active: implemented, tests green, not yet committed.
  abilities.mjs: attach step detects "when(ever) you attach ... you may attach N" trigger phrasing
  (was mis-guided as a manual action); effectPreventAbility detects "opponent plays a Trainer
  card ... prevent effects" phrasing and names the trigger.
  evolution.mjs: new isModernMegaCard/isLegacyMegaOrPrimalCard ("M "/"Primal " prefix, NOT
  full-word "Mega ")/hasMatchingSpiritLink/requiresTurnEndOnEvolve.
  move-card.js: reads requiresTurnEndOnEvolve BEFORE evolveCard() (which migrates attachedCards
  off targetCard) — dispatches `rules-mega-evolution-forces-turn-end`.
  rules-bridge.js: listener clicks the Pass button on that event, reusing hookTurnButton's full
  pipeline instead of duplicating it (same pattern as keybinds.js Alt+T).
  Tests: +9 (evolution.test.mjs, rules-extended.test.mjs). Full suite 1412/1412 green. Lint: only
  pre-existing CRLF noise on touched files. Not exercised live in browser — user verifies gameplay
  UI themselves (recorded preference); design routes through the already-vetted Pass-button path.
Next: none pending. Not yet committed — ask user before commit/push.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox session (not persisted). Playwright's
  pinned browser revision (1.63.0) won't match what's pre-installed at /opt/pw-browsers — launch
  with `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Test netcode changes in BOTH modes (`SERVER_AUTHORITATIVE=1` vs default); S101 shipped a
  legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`) — verify a diff's own files with `npx eslint <files>`.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Catch-up replay sets `systemState.isCatchingUp`; `syncReplaying` is never set anywhere. Gate
  animations on `isCatchingUp`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S135 2026-09-15 feature: ability-guidance accuracy + Mega/Primal Spirit Link turn-end rule.
- S134 2026-09-15 feature: CSV deck export/import now carries sleeve+coin. Pushed 3883471.
- S133 2026-09-15 patch: enhance playmat zones vector sharpness and edge contrast.
