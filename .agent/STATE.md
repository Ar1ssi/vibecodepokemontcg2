# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 190
Focus: "Dive Ball shows every Pokémon, not just Water" — the search parser only knew the energy-symbol
  form (`Basic {W} Pokémon`); a word-form type (`a Water Pokémon`) fell through to `what: 'Pokémon'`, so
  the picker matched every Pokémon. Word-form types now parse + enforce the printed type.
Active: worktree `vibe-dive-ball`, branch `fix/dive-ball-water-filter` @ 990ff54+ (PR #167, open):
  `shared/engine/rules/{search-match,trainer-effects}.mjs` + `trainer-effects.test.mjs`. Primary
  checkout on `main` @ ce0cc55 still holds the uncommitted S188/S183/S184/S189 work, untouched here.
Next: review/merge PR #167. Then commit the primary checkout's still-uncommitted S189 (and S188/S183/
  S184) work — none of it is on a branch/PR. S183's rules-bridge gate is still owed: `flip-gate-test.mjs`'s
  `playFromHand` throws under SERVER_AUTHORITATIVE, so it needs real UI drags or `__ptcg.act`.
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
- `matchesSearch` (`search-match.mjs`) silently widens to all Pokémon when the parsed `what` loses a
  qualifier — any new search clause must round-trip its type. `pnpm test` is an explicit file list (a
  new test file runs only once listed); gate 1967/1967 green as of S190. `pnpm lint` still repo-wide red
  on CRLF (`core.autocrlf=true`) plus pre-existing `no-undef`/`no-useless-escape`.
- The opening sequence must gate on state, never a sleep: `waitForOpeningHand` + the `openingStarted`
  latch (D52); under server authority the server already dealt.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S190 2026-09-19 debug: Dive Ball (and word-form typed searches) filter by the printed type; 1967/1967, PR #167.
- S189 2026-09-19 debug: attack-panel clicks now reach the inspector's handler (pointer-capture fix);
  real-input e2e step 13 red→green, 1965/1965.
- S188 2026-09-19 patch: the foil drifts even when the OS asks for reduced motion (D56, PR #165).
