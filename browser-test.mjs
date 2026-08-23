
    import { chromium } from 'playwright';
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // auto-accept dialogs with the given text
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept('Chromium Test Deck');
      else await dialog.accept();
    });
    
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    
    const T = (n, c) => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}`);
    
    try {
      await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
    
      await page.click('#deckImportButton');
      await page.waitForTimeout(800);
    
      await page.click('#nativeDeckBuilderNewDeck');
      await page.waitForTimeout(300);
      const chips = await page.locator('.native-deck-builder-library-chip').count();
      T('1. + New Deck creates a chip', chips === 1);
      const chipText = chips ? await page.locator('.native-deck-builder-library-chip-name').first().textContent() : '';
      console.log('   chip name:', JSON.stringify(chipText));
    
      await page.click('#nativeDeckBuilderTabBrowse');
      await page.waitForTimeout(300);
    
      await page.waitForSelector('.native-deck-builder-set-browser-group', { timeout: 30000 });
      const groups = await page.locator('.native-deck-builder-set-browser-group').count();
      T('2. expansions rendered', groups >= 5);
    
      const logos = await page.locator('.native-deck-builder-set-browser-group-logo').count();
      T('3. set logos rendered', logos === groups);
    
      const cards = await page.locator('.native-deck-builder-set-browser-group [data-card-id]').count();
      T('4. cards rendered', cards > 900);
    
      await page.locator('.native-deck-builder-set-browser-group [data-card-id]').first().click();
      await page.waitForTimeout(400);
      const deckRows = await page.locator('.native-deck-builder-deck-row').count();
      T('5. card added to deck', deckRows === 1);
    
      const lib = await page.evaluate(() => window.localStorage.getItem('ptcg-sim.deck-library.v1'));
      const parsed = lib ? JSON.parse(lib) : null;
      const ids = parsed ? Object.keys(parsed.decks) : [];
      const savedOk = ids.length === 1
        && parsed.decks[ids[0]].name === 'Chromium Test Deck'
        && Object.keys(parsed.decks[ids[0]].cards).length >= 1;
      T('6. deck autosaved with browser card', savedOk);
    
      // screenshots: browse view + deck panel
      await page.screenshot({ path: 'out/browse-sets-final.png' });
      console.log('screenshot: out/browse-sets-final.png');
    } catch (e) {
      console.log('TEST ERROR:', e.message);
    }
    
    console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
    await browser.close();
    