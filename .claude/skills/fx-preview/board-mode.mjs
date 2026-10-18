// Which board the fx-preview scripts drive (design 074 F1). PTCG_BOARD=3d opens the three.js
// board (`?board=3d`); the default `iframe` is the classic playmat iframes, so existing captures are
// unchanged. The three.js board needs a server started with SERVER_AUTHORITATIVE=1 (`pnpm start`
// prints "server-authoritative"), and WebGL: this module launches Chromium on SwiftShader for it.
//
// Page side, installed before any page script runs: `window.__fxBoard`
//   root(side)              the board's document for 'self' | 'opp': the iframe's document, or the
//                           mirror's open shadow root on the 3D board (same getElementById/querySelector)
//   zoneRect(side, zoneId)  Promise<{ left, top, width, height } | null> the zone's rect in top-page px
//                           (iframe: visualRectOf the zone element; 3D: the scene's zoneRects())
//   pauseAll()              pauses every animation, the 3D scene clock included (it is a WAAPI Animation
//                           on the canvas, design 074 O10), so the scene stands still too
//   stepTo(ms)              sets every animation but the scene clock to `ms`, then waits two frames
//                           (stepping the scene clock back would rewind the card tweens)
//   pushView(state, events) applies a fabricated server view through the real applyView with the
//                           production advisory hooks, as a game's view does. `state` is
//                           `{ self: zones, opp: zones }`, each zone map `{ hand, active, bench, board,
//                           prizes, discard, lostZone, deck }` (deck is a count; the rest card arrays,
//                           `{ instanceId }` stubs for what the viewer cannot see). On the 3D board the
//                           scene draws it, so recorders that fake DOM images in the iframes use this
//   imageOf(id)             the registry <img> of a card (the mirror twin on the 3D board), or null
import { existsSync } from 'node:fs';
import path from 'node:path';

export const BOARD = process.env.PTCG_BOARD === '3d' ? '3d' : 'iframe';
export const IS_3D = BOARD === '3d';
// No GPU in CI containers: WebGL2 through SwiftShader.
export const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const BOARD_READY_MS = 60000;
const BOARD_SETTLE_MS = 1500;

/** The browser executable: CHROMIUM_PATH (as the e2e harnesses) or CHROMIUM (as this skill's scripts). */
export const chromiumPath = () => process.env.CHROMIUM_PATH || process.env.CHROMIUM || undefined;

/**
 * `chromium.launch` options: the executable, plus SwiftShader's flags when the 3D board is asked
 * for. `args` are the script's own flags (kept; GL flags are not added twice).
 */
export function launchOptions({ args = [] } = {}) {
  const all = [...args, ...(IS_3D ? GL_ARGS.filter((flag) => !args.includes(flag)) : [])];
  return {
    ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
    ...(all.length > 0 ? { args: all } : {}),
  };
}

/** The e2e page at `base`, on the asked-for board. */
export const boardUrl = (base) => `${base}/?e2e=1${IS_3D ? '&board=3d' : '&board=iframe'}`;

/** Page-side helpers; runs in the page, so it takes nothing from this module. */
function pageHelpers() {
  const SCENE_CANVAS_ID = 'board3dCanvas';
  const mode = () => window.__ptcg?.boardMode?.() ?? 'iframe';
  const root = (side) => {
    if (mode() === '3d') {
      return document.getElementById(side === 'opp' ? 'oppBoard' : 'selfBoard')?.shadowRoot ?? null;
    }
    return document.getElementById(side === 'opp' ? 'oppContainer' : 'selfContainer')?.contentDocument ?? null;
  };
  const isSceneClock = (animation) => animation.effect?.target?.id === SCENE_CANVAS_ID;
  let viewVersion = 900;
  const zonesOf = (zones = {}) => ({
    active: zones.active ?? [],
    bench: zones.bench ?? [],
    hand: zones.hand ?? [],
    deck: { count: zones.deck ?? 30 },
    prizes: zones.prizes ?? [],
    discard: zones.discard ?? [],
    lostZone: zones.lostZone ?? [],
    board: zones.board ?? [],
  });
  const twoFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__fxBoard = {
    root,
    async zoneRect(side, zoneId) {
      if (mode() === '3d') {
        const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
        const rect = getBoardScene()?.zoneRects()[`${side}:${zoneId}`];
        return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
      }
      const zone = root(side)?.getElementById(zoneId);
      if (!zone) return null;
      const { visualRectOf } = await import('/src/setup/image-logic/iframe-rect.mjs');
      return visualRectOf(zone);
    },
    async pushView(state, events = []) {
      const { applyView } = await import('/src/setup/netcode/apply-view.js');
      const { handleBeforeApply, handleAdvisoryEvent } = await import('/src/setup/netcode/advisory-animations.js');
      viewVersion += 1;
      return applyView(
        {
          stateVersion: viewVersion,
          you: { playerId: 'p1', zones: zonesOf(state.self) },
          them: { playerId: 'p2', zones: zonesOf(state.opp) },
        },
        events,
        { onBeforeApply: handleBeforeApply, onAdvisoryEvent: handleAdvisoryEvent }
      );
    },
    async imageOf(instanceId) {
      const { getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
      return getCardRegistry().get(instanceId)?.element ?? null;
    },
    pauseAll() {
      for (const animation of document.getAnimations()) animation.pause();
    },
    async stepTo(ms) {
      for (const animation of document.getAnimations()) {
        if (!isSceneClock(animation)) animation.currentTime = ms;
      }
      await twoFrames();
    },
  };
}

/**
 * Routes the hosts the recorders name to local art, for sandboxes with no network:
 * CARD_DIR (a folder of PNGs, matched by file name) or CARD_IMG (one image for every card face).
 */
async function routeCardImages(page) {
  const { CARD_DIR, CARD_IMG } = process.env;
  const single = CARD_IMG && existsSync(CARD_IMG) ? path.resolve(CARD_IMG) : null;
  if (!CARD_DIR && !single) return;
  await page.route('https://images.pokemontcg.io/**', (route) => {
    const named = CARD_DIR && path.join(CARD_DIR, path.basename(new URL(route.request().url()).pathname));
    const file = named && existsSync(named) ? named : single;
    return file ? route.fulfill({ path: file, contentType: 'image/png' }) : route.abort();
  });
}

/** Installs `window.__fxBoard` in every document the page opens, and the offline routes. */
export async function installBoardHelpers(page) {
  await page.addInitScript(pageHelpers);
  await routeCardImages(page);
}

/**
 * Opens the e2e page on the asked-for board and waits until it can be driven. The iframe board is
 * ready with the bridge (plus the 800 ms the scripts always allowed); the 3D board once its scene
 * runs and has laid out the zones. A 3D request that fell back to the iframes (a server that is not
 * authoritative, no WebGL2) is an error, not a silent capture of the wrong board.
 */
export async function openBoard(page, base) {
  await installBoardHelpers(page);
  await page.goto(boardUrl(base));
  await page.waitForFunction(() => window.__ptcg?.ready === true, null, { timeout: 30000 });
  if (!IS_3D) {
    await page.waitForTimeout(800);
    return;
  }
  const running = await page
    .waitForFunction(async () => window.__ptcg.boardMode() === '3d' && (await window.__fxBoard.zoneRect('self', 'active')) !== null, null, { timeout: BOARD_READY_MS })
    .then(() => true)
    .catch(() => false);
  if (!running) {
    const fallback = await page.evaluate(() => sessionStorage.getItem('ptcg-board-3d-fallback'));
    throw new Error(`the 3D board did not start (board mode ${await page.evaluate(() => window.__ptcg.boardMode())}, fallback ${fallback}); the server needs SERVER_AUTHORITATIVE=1 and the browser WebGL2`);
  }
  await page.waitForTimeout(BOARD_SETTLE_MS);
}
