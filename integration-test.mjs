
    import { JSDOM, VirtualConsole } from 'jsdom';
    import fs from 'fs';
    
    // FULL page — same modules the browser loads, in the same order
    let html = fs.readFileSync('./client/index.ejs', 'utf-8');
    // ejs render: replace the one ejs variable with null (as the server does)
    html = html.replace('<%= importDataJSON %>', '');
    
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => { /* resource load noise */ });
    vc.on('error', (e) => console.log('PAGE ERROR:', String(e).slice(0, 300)));
    
    const dom = new JSDOM(html, {
      url: 'http://localhost:4000/',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(window) {
        window.structuredClone = (o) => JSON.parse(JSON.stringify(o));
        window.prompt = () => 'Test Deck';
        window.confirm = () => true;
        // socket.io CDN stub — injected before any module runs
        window.io = () => ({ emit: () => {}, on: () => {} });
      },
    });
    
    await new Promise(r => setTimeout(r, 2500));
    
    const document = dom.window.document;
    const T = (n, c) => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}`);
    
    // The real init ran via the module script. Exercise the buttons:
    document.getElementById('nativeDeckBuilderNewDeck').click();
    const chips = document.querySelectorAll('.native-deck-builder-library-chip');
    T('2. + New Deck creates a chip', chips.length === 1);
    
    document.getElementById('nativeDeckBuilderTabBrowse').click();
    const panel = document.getElementById('nativeDeckBuilderSetBrowserPanel');
    T('3a. Browse panel unhidden', panel && !panel.hidden);
    T('3b. Search pane hidden', document.querySelector('.native-deck-builder-pane-main-header').style.display === 'none');
    
    await new Promise(r => setTimeout(r, 5000));
    const groups = panel.querySelectorAll('.native-deck-builder-set-browser-group');
    T('4. expansions rendered from live API', groups.length >= 5);
    console.log('   groups:', JSON.stringify([...groups].map(g => g.querySelector('strong')?.textContent)));
    
    const logos = panel.querySelectorAll('.native-deck-builder-set-browser-group-logo');
    T('5. set logos rendered', logos.length === groups.length);
    console.log('   logo srcs:', JSON.stringify([...logos].map(i => i.getAttribute('src')).slice(0, 3)));
    
    const firstCard = panel.querySelector('[data-card-id]');
    if (firstCard) firstCard.click();
    const deckRows = document.querySelectorAll('.native-deck-builder-deck-row');
    T('6. card added to deck from browser', deckRows.length === 1);
    
    document.getElementById('nativeDeckBuilderTabSearch').click();
    T('7. Search tab restores panes', panel.hidden && document.querySelector('.native-deck-builder-pane-main-header').style.display !== 'none');
    
    document.getElementById('nativeDeckBuilderSearchInput').value = 'pikachu';
    document.getElementById('nativeDeckBuilderSearchButton').click();
    await new Promise(r => setTimeout(r, 5000));
    const results = document.querySelectorAll('.native-deck-builder-search-results .native-deck-builder-result');
    T('8. search still works', results.length >= 1);
    
    const stored = dom.window.localStorage.getItem('ptcg-sim.deck-library.v1');
    const lib = stored ? JSON.parse(stored) : null;
    const ids = lib ? Object.keys(lib.decks) : [];
    const savedCards = ids.length ? Object.keys(lib.decks[ids[0]].cards) : [];
    T('9. deck autosaved with browser card', savedCards.length >= 1);
    