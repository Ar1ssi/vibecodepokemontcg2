---
name: fx-preview
description: Host the app in e2e mode and capture screenshots/frame strips of board visual effects (Tera/Mega entry animations, Tera crystal skin, holo foil) without playing a real game. Use when changing anything under client/src/setup/netcode/mat-fx/ or mat CSS and you need to see the result.
---

# Previewing board effects in e2e mode

Unit tests prove the maths; only a screenshot proves an effect *looks* right. This is the
fast loop: host locally, open `/?e2e=1` in Playwright, fake the board state, fire the effect,
freeze time, screenshot.

## 1. Host in e2e mode

From the worktree root (each worktree needs its own `pnpm install` the first time):

```powershell
pnpm install
$env:PORT = 4000; pnpm start          # PowerShell
# PORT=4000 pnpm start                # bash
```

- The `?e2e=1` bridge (`window.__ptcg`) arms whenever `NODE_ENV` is not `production`
  (`server/server.js`, `E2E_ENABLED`). Leave `NODE_ENV` unset, or set `PTCG_E2E=1`.
  The startup log line says `e2e bridge: ARMED`.
- Open `http://localhost:4000/?e2e=1`. The page is ready when `window.__ptcg.ready === true`.
- Running two worktrees at once? Give each its own `PORT` and pass it as `BASE_URL`.
- Stop the server by its PID. `pkill -f "server/server.js"` also matches, and kills, the
  shell running that pkill.

## 2. One-time Playwright setup

Playwright is a devDependency. Install its browser once per machine:
`pnpm exec playwright install chromium`. In the cloud container, skip this and set
`CHROMIUM=/opt/pw-browsers/chromium`.

## 3. Capture

Both scripts need `CARD_IMG`: a local PNG/JPG of any card face, or a card image URL. Write
output under `.agent/scratch/`, which is not committed.

**Entry animations** (a one-shot burst when a card enters play):

```powershell
$env:CARD_IMG = "C:\path\to\card.png"; $env:TYPE = "Fire"
node .claude/skills/fx-preview/capture-entry.mjs tera .agent/scratch/tera-fire 100 2400
node .claude/skills/fx-preview/capture-entry.mjs mega .agent/scratch/mega
```

The script writes frames `f000.png…` every `stepMs` over `durationMs`. Read a handful of them
(the Read tool shows images), or tile them into one sheet:
`ffmpeg -framerate 1 -i f%03d.png -vf "scale=480:-1,tile=5x5" sheet%d.png`.

**Persistent board looks** (Tera crystal skin, holo foil, anything drawn from card state):

```powershell
node .claude/skills/fx-preview/capture-board.mjs .agent/scratch/skin
```

It writes `<prefix>-board.png` (active and bench, cropped) and `<prefix>-full.png`.

## How it works (adapt it for new effects)

- **Fake state.** `import('/src/setup/netcode/apply-view.js')` then
  `applyView(view, [], {})` with
  `{stateVersion, you:{playerId, zones:{active,bench,hand}}, them:{…}}`. Cards need
  `instanceId, name, src, supertype, subtypes, types, rarity, hp`. Subtypes drive the
  effects: `'Tera'` gives the crystal skin and entry, `'MEGA'` gives the Mega entry. This is the
  same path a server view takes, so what renders is real.
- **Board DOM** lives in an iframe:
  `document.getElementById('selfContainer').contentDocument` holds `#active` and `#bench`.
  Use `visualRectOf` (`/src/setup/image-logic/iframe-rect.mjs`) for page-space rects.
- **Entry effects** are `playSignatureEntry(kind, rect, instanceId, card)` from
  `/src/setup/netcode/mat-fx/entry.js`. Call it directly; there is no need to drive an evolution
  through the rules engine.
- **Freeze time.** Pause every `document.getAnimations()` (or the iframe document's, for
  on-board CSS animations). Set `currentTime = t` and wait two `requestAnimationFrame`s,
  then screenshot. This gives deterministic frames regardless of machine speed. Canvas-drawn
  effects are driven by the same animation clock. Long teardown timers (≥1.5 s) are stubbed
  out so the overlay stays up while time is stepped.
- **Holo foil** normally hydrates from TCGdex. Fabricated cards don't get that, so
  `capture-board.mjs` repeats `hydrateHolo`'s DOM moves (`buildHoloCard` + `.mat-holo` +
  `startHoloAnimation`, then dispatches `holo-wrapper-changed`). Set `HOLO=0` to skip it.
- **Offline sandbox?** If `cdn.socket.io` is blocked, set `SIO_JS` to a local copy of
  `socket.io.min.js`; the scripts route the CDN request to it.

## Video recordings of whole scenes (`rec/`)

Frames prove a pose; a video proves pacing. `rec/rec-<effect>.mjs` records one scene on the e2e
board to `out/<effect>*.webm` (Playwright video, 1280×720): `evolve`, `ko`, `discard`, `opp-play`,
`draw`, `prize` (designs 041–045). Each imports the effect module straight from `/src/...` and
fakes only the card rects, so it needs no game state. Start a worktree server on :4100 first
(`PORT=4100 pnpm start`; the primary's :4000 may be running other code), then
`node .claude/skills/fx-preview/rec/rec-evolve.mjs`. New effect → copy the closest script.
Frame sheets from a video: ffmpeg (winget `Gyan.FFmpeg`).

## Done means

Judge the effect from the frames, not the code. Check the key moments (start, peak, settle)
and the final resting state. Then run the unit tests next to the effect, e.g.
`node --test client/src/setup/netcode/mat-fx/`.
