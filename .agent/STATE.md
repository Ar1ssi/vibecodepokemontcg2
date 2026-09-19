# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 189
Focus: "the attack window doesn't operate" — the carousel's `stage.setPointerCapture()` retargets the
  follow-up `click` to the stage, so the inspector's delegated listener (a stage descendant) never
  fired. Fixed by adding `.ptcg-chrome` to `isSwipeBlockedTarget`; the inspector e2e now uses real input.
Active: primary folder on `main` @ 143d3a6 + uncommitted: S189 `image-logic/card-picker.js` (guard),
  `test-card-inspector-e2e.mjs` (real-input step 9), `package.json` (`test:inspector`); prior S188 holo
  (`deck-builder/core/holo.mjs` + test), S183 `rules/rules-bridge.js`, S184 `zones/hand-stack-dom.js`
  (+ its test), and the .agent docs.
Next: commit S189 (and the still-uncommitted S188/S183/S184 work) — none of it is on a branch/PR yet.
  Then merge PR #165 (`fix/holo-reduced-motion-drift`). S183's rules-bridge gate is still owed:
  `flip-gate-test.mjs`'s `playFromHand` throws under SERVER_AUTHORITATIVE, so it needs real UI drags
  or `__ptcg.act`. Verify against origin/main, never a push: #164 once orphaned a mid-flight commit.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Carousel clicks: `stage.setPointerCapture()` makes the browser deliver the follow-up `click` to the
  capturing stage, so a bubbling listener on carousel-slide content never fires. Interactive slide
  content must be in `isSwipeBlockedTarget` (`card-picker.js`). Verify with REAL input — `el.click()`
  dispatches no pointerdown and hides it (it did for S180's "working attack click" and PR #163).
- The holo must NEVER consult `prefers-reduced-motion` again (D56): drift amplitude is unconditional,
  and this machine reports reduce, so a re-added gate freezes every card. Measure with Playwright
  `reducedMotion: null` — its default 'no-preference' emulation masks the OS value.
- Under SERVER_AUTHORITATIVE the legacy zone arrays are EMPTY, so `__ptcg.playFromHand` dies in
  `moveCardMessage`; read `getAuthoritativeZoneArray`/`cardRegistry` and address cards by instanceId.
- The opening sequence must gate on state, never a sleep: `waitForOpeningHand` + the `openingStarted`
  latch (D52); under server authority the server already dealt.
- `pnpm test` is an explicit file list (a new test file runs only once listed). Gate 1965/1965 green as
  of S189; `pnpm lint` still repo-wide red on CRLF (`core.autocrlf=true`) plus pre-existing `no-undef`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S189 2026-09-19 debug: attack-panel clicks now reach the inspector's handler (pointer-capture fix);
  real-input e2e step 13 red→green, 1965/1965.
- S188 2026-09-19 patch: the foil drifts even when the OS asks for reduced motion (D56, PR #165).
- S187 2026-09-19 merge: PRs #162/#163/#164 to main, primary checkout un-stuck and synced.
