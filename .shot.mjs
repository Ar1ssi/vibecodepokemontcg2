import { chromium } from 'playwright';
const [,, out, mode] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });
const p = await b.newPage({ viewport: { width: 1920, height: 950 } });
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await p.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.click('#deckImportButton');
await p.waitForTimeout(1000);
if (mode === 'deck') {
  await p.click('#nativeDeckBuilderLibraryList .native-deck-builder-library-chip');
  await p.waitForTimeout(4000);
}
if (mode === 'search') {
  await p.fill('#nativeDeckBuilderSearchInput', 'Pikachu');
  await p.click('#nativeDeckBuilderSearchButton');
  await p.waitForTimeout(8000);
}
await p.screenshot({ path: out });
await b.close();
