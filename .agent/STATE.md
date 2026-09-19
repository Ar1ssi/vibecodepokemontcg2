# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 191
Focus: Wired the legacy mat picker (`openMatPick`, D19) into SERVER_AUTHORITATIVE netcode: a server
  PendingChoice whose options are all in-play Pokémon now resolves by clicking the real card on the
  mat (Rare Candy Basic pick, Grand Tree/Salvatore host, switch targets) instead of the carousel.
Active: worktree `C:\Users\SMG26\Downloads\vibe-mat-picker-server` on `feature/server-mat-picker`
  @ 7e3f716 (PR #170) — design 016, D59, new `rules/mat-picker.js`,
  `netcode/mat-pick-request.mjs`, `netcode/mat-picker-adapter.js`; edited `apply-view.js`,
  `socket-event-listeners.js`, `e2e-api.js`, `trainer-execution.js`, `mat-pick.mjs`, tests, package.json.
Next: PR #170 is open (not merged). The primary checkout is still on `main` @ ce0cc55 with uncommitted
  S190 holo-preview + S183/S184/S188/S189 work — none of that is on a branch/PR yet, and this branch's
  STATE/DECISIONS do not include it. Merge #170, then port that uncommitted work. S183's rules-bridge
  gate is still owed: `flip-gate-test.mjs`'s `playFromHand` throws under SERVER_AUTHORITATIVE.
  Verify against origin/main, never a push: #164 once orphaned a mid-flight commit.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Server mat pick (design 016): `apply-view.js` routes a PendingChoice to the mat picker only when
  every option is an in-play Pokémon root (`cardRegistry` record: `zone ∈ active|bench`,
  `card.attachedTo == null`, `.element`) and `max === 1`; anything else falls to the card
  picker/modal. `MAT_PICKER.close()` is a SILENT `dismissMatPick()` — teardown must not report a
  decline; only the user Cancel/Escape path invokes `onCancel`.
- Carousel clicks: `stage.setPointerCapture()` retargets the follow-up `click` to the stage, so a
  bubbling listener on slide content never fires. Interactive slide content must be in
  `isSwipeBlockedTarget` (`card-picker.js`). Verify with REAL input — `el.click()` hides it.
- The holo must NEVER consult `prefers-reduced-motion` again (D56). Measure with Playwright
  `reducedMotion: null` — its default emulation masks the OS value.
- Under SERVER_AUTHORITATIVE the legacy zone arrays are EMPTY, so `__ptcg.playFromHand` dies in
  `moveCardMessage`; read `getAuthoritativeZoneArray`/`cardRegistry` and address cards by instanceId.
- `pnpm test` is an explicit file list (a new test file runs only once listed). Gate 1978/1978 green as
  of S191; `pnpm lint` still repo-wide red on CRLF (`core.autocrlf=true`) plus pre-existing `no-undef`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S191 2026-09-19 feature: in-play-Pokémon server choices use the mat picker (design 016, D59,
  PR #170); pnpm test 1978/1978, live 2P probe passed.
- S190 2026-09-19 patch (primary, uncommitted): double-click preview foil flows like the mat (D58).
- S189 2026-09-19 debug: attack-panel clicks reach the inspector (pointer-capture fix, D57).
