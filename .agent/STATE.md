# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 91
Focus: legacy 2P mirror desync — benched Pokémon from a deck search (Buddy-Buddy Poffin) never
  appeared on the peer. Root cause: search effects relayed `shuffleZone` before the un-awaited
  `moveCardBundle`, so the peer's mirror applied a permutation of the wrong length; the old
  `rearrangeArray` dropped a card or left an undefined hole, and `resolveCardIndex` threw on the
  hole (swallowed by acceptAction). Design 007.
Active: done, UNCOMMITTED on branch claude/ptcg-benched-pokemon-desync-7591b3: picker awaits moves
  before confirm (card-picker-moves.mjs); move→shuffle sites await; moveCard re-resolves its index
  before the splice; rearrangeArray keeps every card and returns an exact-permutation flag;
  shuffleZone logs `shuffleZone.indices_mismatch`; resolveCardIndex skips holes; 3 duplicate
  picker move loops removed. pnpm test 1295/1295.
Next: user live-checks a 2P game on the worktree server (port 4100 — 4000 was taken last session):
  play Buddy-Buddy Poffin / Ultra Ball / Nest Ball; peer must show every benched Pokémon and the
  sync log must show each move before its `shuffleZone`, with no `indices_mismatch`. Then commit,
  and close I24 if clean. Open follow-ups: I37 (hand→deck-then-shuffle paths unaudited), I36
  (promote-abort, unexplained), I34 (turn desync residual). Still open from S73: drag
  active→bench retreat live-verify; mat pickers + Grand Tree. Maintenance due S96.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files — known baseline since S1. Verify a diff's own files with `npx eslint --quiet <files>`,
  drop `prettier/prettier` lines, and compare against HEAD copies of the same files.
- A relayed action that throws inside `acceptAction` leaves NO sync-log entry (console.error only)
  — a recv with no following resolve/abort line means "threw", not "skipped". Check the mirror
  zone for undefined slots / wrong length first (design 007).
- `playtest-bot.mjs --games=N` is a real regression gate for legacy-mode multiplayer desyncs;
  treat a new failure from it as a real finding.
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong — see
  `parseAttackArgs`/`parseRetreatArgs` (sync-action-args.mjs) before adding a parameter.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S91 2026-09-11 debug→feature: design 007 — search move/shuffle ordering + mirror-drift defenses (uncommitted).
- S90/S90b 2026-09-10 feature: design 006 — generation pills + per-generation Energy tabs.
- S89/S89b 2026-09-10 feature+patch: 3D energy tokens for attached Energy (design 005).
