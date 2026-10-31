// Stills of the Stadium boards (design 077) as a game shows them: every zone of both players filled
// with real Homebrew card art, the Stadium in play, both camera presets, at a real window size.
// Each board opens in a fresh page (the Stadium in the view picks the board, as in a game) and is
// shot once its programs are ready and its reveal has ended.
//
// usage: PORT=4100 pnpm start   (worktree server; SERVER_AUTHORITATIVE on, e2e bridge armed)
//        node .claude/skills/fx-preview/rec/rec-stadium-boards.mjs
// env:   BOARDS=scorched-earth,levincia   (default: every board)
//        PRESETS=tilt12,tcgl              (default: both camera presets)
//        OUT=.agent/scratch/stadium-boards (stills: <OUT>/<board>-<preset>.png, plus sheet-<preset>.png)
//        W=1920 H=1080                    (window size), BASE_URL (default http://localhost:4100)
//        EMPTY=1                          (no cards: the bare board)
//        CHROMIUM / CHROMIUM_PATH, SIO_JS (cloud container: see SKILL.md)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { launchOptions, openBoard } from '../board-mode.mjs';
import { ENVIRONMENT_KEYS } from '../../../../client/src/setup/board3d/stadium-environment-layout.mjs';

const {
  BASE_URL = 'http://localhost:4100',
  OUT = '.agent/scratch/stadium-boards',
  W = '1920',
  H = '1080',
  SIO_JS,
  EMPTY,
} = process.env;
const boards = process.env.BOARDS ? process.env.BOARDS.split(',') : ENVIRONMENT_KEYS;
const presets = process.env.PRESETS ? process.env.PRESETS.split(',') : ['tilt12', 'tcgl'];
const READY_MS = 90000;
mkdirSync(OUT, { recursive: true });

/** The Homebrew Stadium card each board belongs to (stadium-environment-layout.mjs ENVIRONMENT_BY_CARD). */
const CARD_OF = {
  'forest-of-vitality': '030',
  'stormy-mountains': '051',
  'crystal-cave': '052',
  'steel-shelter': '162',
  'full-metal-lab': '163',
  'mystery-garden': '197',
  'old-cemetery': '198',
  'dimension-valley': '199',
  'surfing-beach': '209',
  'brooklet-hill': '212',
  'fighting-stadium': '239',
  'mountain-ring': '240',
  'perilous-jungle': '253',
  'dark-city': '254',
  levincia: '278',
  'magma-basin': '289',
  'scorched-earth': '299',
  'lumiose-city': '351',
  'magnetic-storm': '358',
  'shopping-center': '360',
  'community-center': '361',
  'pokemon-center': '362',
  'grand-tree': '376',
  'neutralization-zone': '378',
  'fairy-garden': '428',
};

const art = (number) => `/src/assets/custom-sets/customhb/${number}/high.webp`;
const hasArt = (number) => existsSync(path.join('client/src/assets/custom-sets/customhb', number, 'high.webp'));

/** A full two-player board: Active, five / four Bench, hands, prizes, piles, discards. */
function boardState() {
  if (EMPTY) return { self: {}, opp: {} };
  let id = 1000;
  const pokemon = (number, name, types, stage = 'Basic') => ({
    instanceId: (id += 1),
    name,
    src: art(number),
    supertype: 'Pokémon',
    subtypes: [stage],
    types,
    rarity: 'Common',
    hp: '120',
  });
  const trainer = (number, name, kind) => ({
    instanceId: (id += 1),
    name,
    src: art(number),
    supertype: 'Trainer',
    subtypes: [kind],
    types: [],
    rarity: 'Uncommon',
  });
  const hidden = (count) => Array.from({ length: count }, () => ({ instanceId: (id += 1) }));
  return {
    self: {
      active: [pokemon('086', 'Blacephalon', ['Fire'])],
      bench: [
        pokemon('019', 'Thwackey', ['Grass'], 'Stage 1'),
        pokemon('041', 'Garchomp', ['Dragon'], 'Stage 2'),
        pokemon('104', 'Ralts', ['Psychic']),
        pokemon('202', 'Alolan Sandshrew', ['Water']),
        pokemon('224', 'Kubfu', ['Fighting']),
      ],
      hand: [
        trainer('028', 'Net Ball', 'Item'),
        trainer('046', 'Lance', 'Supporter'),
        pokemon('001', 'Weedle', ['Grass']),
        trainer('048', 'Dragon Elixir', 'Item'),
        pokemon('122', 'Dreepy', ['Dragon']),
        trainer('029', "Gardenia's Vigor", 'Supporter'),
      ],
      prizes: hidden(6),
      deck: 30,
      discard: [trainer('047', "N's Resolve", 'Supporter'), pokemon('032', 'Oddish', ['Grass'])],
    },
    opp: {
      active: [pokemon('140', 'Hisuian Samurott', ['Darkness'], 'Stage 2')],
      bench: [
        pokemon('149', 'Lairon', ['Metal'], 'Stage 1'),
        pokemon('068', 'Gastly', ['Darkness']),
        pokemon('233', 'Onix', ['Fighting']),
        pokemon('131', 'Tapu Lele', ['Psychic']),
      ],
      hand: hidden(6),
      prizes: hidden(5),
      deck: 26,
      discard: [pokemon('158', 'Bisharp', ['Metal'], 'Stage 1'), trainer('050', 'Haban Berry', 'Tool')],
    },
  };
}

/** Pushes the board state with the board's Stadium in play, through the real applyView. */
async function pushBoard(page, board) {
  const number = CARD_OF[board];
  const stadium = {
    instanceId: 999,
    id: `customhb-${number}`,
    set: 'customhb',
    number,
    name: board,
    src: art(hasArt(number) ? number : '299'),
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    types: [],
    rarity: 'Uncommon',
    ownerId: 'p1',
  };
  await page.evaluate(
    async ([state, stadiumCard]) => {
      const { applyView } = await import('/src/setup/netcode/apply-view.js');
      const zones = (z = {}) => ({
        active: z.active ?? [],
        bench: z.bench ?? [],
        hand: z.hand ?? [],
        deck: { count: z.deck ?? 30 },
        prizes: z.prizes ?? [],
        discard: z.discard ?? [],
        lostZone: z.lostZone ?? [],
        board: z.board ?? [],
      });
      applyView(
        {
          stateVersion: 901,
          you: { playerId: 'p1', zones: zones(state.self) },
          them: { playerId: 'p2', zones: zones(state.opp) },
          stadium: stadiumCard,
        },
        [],
        {}
      );
    },
    [boardState(), stadium]
  );
}

/** True once the board's group shows and its reveal has ended (a shared uniform of its materials). */
async function boardShown(board) {
  const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
  const holder = getBoardScene()?.inspect().scene.getObjectByName(`board3d-stadium-env-${board}`);
  if (!holder?.visible) return false;
  const material = holder.children.find((child) => child.material?.uniforms?.uReveal)?.material;
  return Boolean(material) && material.uniforms.uReveal.value >= 1 && material.uniforms.uExit.value <= 0;
}

/** The time since `t0`, in seconds, for the log. */
const since = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

/**
 * One page per board: the first preset is stored before the page loads, later ones switch the
 * camera in place (the board's programs stay compiled, which is most of a still's time on SwiftShader).
 * Before each still the scene clock stops, so the plate holds and the screenshot gets a frame.
 */
async function shootBoard(browser, board) {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  page.on('pageerror', (error) => console.log(`  pageerror ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      const text = message.text();
      if (/stadium|shader|WebGL|GL_/i.test(text) && !/PCFSoftShadowMap|KHR_parallel/.test(text)) {
        console.log(`  ${message.type()} ${text.slice(0, 300)}`);
      }
    }
  });
  if (SIO_JS) await page.route('https://cdn.socket.io/**', (r) => r.fulfill({ path: SIO_JS, contentType: 'application/javascript' }));
  await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
  await page.addInitScript((cameraPreset) => {
    localStorage.setItem('ptcg-camera-preset', cameraPreset);
    localStorage.removeItem('ptcg-stadium-env');
    localStorage.removeItem('ptcg-stadium-boards-off');
  }, presets[0]);
  const started = Date.now();
  await openBoard(page, BASE_URL);
  await pushBoard(page, board);
  const shown = await page
    .waitForFunction(boardShown, board, { timeout: READY_MS, polling: 500 })
    .then(() => true)
    .catch(() => false);
  if (!shown) console.log(`  ${board}: board never showed`);
  const files = {};
  for (const [index, preset] of presets.entries()) {
    if (index > 0) {
      await page.evaluate(async (next) => {
        for (const animation of document.getAnimations()) animation.play();
        const { setCameraPreset } = await import('/src/setup/image-logic/fx-settings.js');
        setCameraPreset(next);
      }, preset);
    }
    // A few ambient frames, so particles and the plate are current.
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.__fxBoard.pauseAll());
    await page.waitForTimeout(500);
    files[preset] = path.join(OUT, `${board}-${preset}.png`);
    await page.screenshot({ path: files[preset], timeout: 240000 });
    console.log(`${board} ${preset}: ${since(started)} -> ${files[preset]}`);
  }
  await page.close();
  return files;
}

const browser = await chromium.launch(launchOptions());
const shot = Object.fromEntries(presets.map((preset) => [preset, []]));
for (const board of boards) {
  const files = await shootBoard(browser, board);
  for (const preset of presets) shot[preset].push(files[preset]);
}
await browser.close();

// One contact sheet per preset, the board's name under each still.
for (const preset of presets) {
  if (shot[preset].length < 2) continue;
  const sheet = path.join(OUT, `sheet-${preset}.png`);
  execFileSync('montage', [
    ...shot[preset].flatMap((file) => ['-label', path.basename(file, '.png'), file]),
    '-tile', '5x', '-geometry', '640x360+4+4', '-pointsize', '18', sheet,
  ]);
  console.log(`sheet ${sheet}`);
}
