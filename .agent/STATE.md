# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 131
Focus: review + patch — design 009 (TCG Live table). S130 built all 6 slices unverified in the
  primary checkout. S131 ported them into worktree branch `claude/design-009-review-287815` and
  fixed the review findings (2 commits: build as found, then fixes).
Active: fixes done and fast-forward merged to main (7adc417), per user. Primary checkout synced;
  its stale uncommitted 009 tree was verified identical to commit 4114449, then replaced.
  Localhost look (user): zones sit on the art. Follow-up fix on branch, NOT pushed: non-holo hand
  hover and the raised deck cover were overridden by resetImage()'s inline `transform`; now use
  the `translate` property. User says the table "reads as multiple planes", but measured it is one
  plane; asked what they mean, no answer yet.
Next: push the follow-up if the user OKs. Pin down "multiple planes" with the user. Then run
  `pnpm test:2p` and the authoritative 2P run (`SERVER_AUTHORITATIVE=1 PORT=4100`).
  Carried: I39 (flip-gate-test.mjs) untested; bot runs only used the fixture deck (I35).
Blocked: design 009 formal approval + localhost look (user).

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox session (not persisted). Playwright's
  pinned browser revision (1.63.0) won't match what's pre-installed at /opt/pw-browsers — launch
  with `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Test netcode changes in BOTH modes (`SERVER_AUTHORITATIVE=1` vs default); S101 shipped a
  legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`) — verify a diff's own files with `npx eslint <files>`.
- Never put `perspective`/`transform`/`filter` on an iframe's `<html>`: the root is ~8px tall and
  becomes the containing block of every `position: fixed` zone, so the board collapses (S131). The
  tilt lives on `#playfield`, whose fixed children now resolve against it (intended).
- Catch-up replay sets `systemState.isCatchingUp`; `syncReplaying` is never set anywhere. Gate
  animations on `isCatchingUp`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S131 2026-09-14 review+patch: design 009 build fixed + merged to main (collapse, hand, tilt sign,
  replay gate, deck stack, mat sizing).
- S130 2026-09-14 feature: design 009 slices 1-6 built, unverified, uncommitted.
- S129 2026-09-14 merge: SERVER_AUTHORITATIVE bot verification (9/9) + PR #128; branch to main.
