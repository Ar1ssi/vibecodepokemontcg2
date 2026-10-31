// The Stadium kit's asset gallery (design 081, kit-gallery/): every asset in the kit's light, as a
// board's plate draws it, for asset and shading work without a board or a game.
//
// usage: node .claude/skills/fx-preview/rec/rec-stadium-kit.mjs
// env:   OUT=.agent/scratch/kit-gallery.png   QUERY='zoom=2.6&cx=-380&cy=250&mood=night'
//        CHROMIUM / CHROMIUM_PATH (cloud container: see SKILL.md)
// Serves the repo root itself (no app server needed); exits non-zero on a GL or page error.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { launchOptions } from '../board-mode.mjs';

const { OUT = '.agent/scratch/kit-gallery.png', QUERY = '' } = process.env;
const root = process.cwd();
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };

const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (path.includes('..')) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(join(root, path));
    response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const w = Number(/(?:^|&)w=(\d+)/.exec(QUERY)?.[1] || 1600);
const h = Number(/(?:^|&)h=(\d+)/.exec(QUERY)?.[1] || 900);
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (message) => {
    if (message.type() === 'error' || /GL|Shader/.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/.claude/skills/fx-preview/kit-gallery/index.html?${QUERY}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.screenshot({ path: OUT });
  console.log('kit gallery ->', OUT);
} finally {
  await browser.close();
  server.close();
}
if (errors.length) {
  console.error(errors.slice(0, 10).join('\n'));
  process.exitCode = 1;
}
