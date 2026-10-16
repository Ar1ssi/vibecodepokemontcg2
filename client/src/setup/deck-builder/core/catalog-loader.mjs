// Deck-builder catalogs (coins, sleeves, starter decks) are static JSON in client/src/assets/catalogs/,
// fetched on first use instead of shipped as JavaScript in the boot bundle (design 073 § D).
// `loadCatalog` is the one fetch: each file loads once per page, and a failed load is retried on the
// next call. Under node (tests, scripts) the file is read from disk, so no fetch stub is needed.

const CATALOG_URL = new URL('../../../assets/catalogs/', import.meta.url);
// A hung request fails instead of stalling every waiter; the failure clears the cache for a retry.
const FETCH_TIMEOUT_MS = 10_000;
const pending = new Map();
const loaded = new Map();

const isNode = () => typeof process !== 'undefined' && Boolean(process.versions?.node);

const readCatalog = async (url) => {
  if (url.protocol === 'file:' && isNode()) {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
  return response.json();
};

/** The parsed `assets/catalogs/<name>.json`, loaded once; a failed load is retried next time. */
export const loadCatalog = (name) => {
  if (!pending.has(name)) {
    const promise = readCatalog(new URL(`${name}.json`, CATALOG_URL)).then(
      (data) => {
        loaded.set(name, data);
        return data;
      },
      (error) => {
        pending.delete(name);
        throw error;
      }
    );
    pending.set(name, promise);
  }
  return pending.get(name);
};

/** The catalog's data once `loadCatalog(name)` has resolved, else undefined. */
export const loadedCatalog = (name) => loaded.get(name);

/**
 * Runs `fn` now when `isLoaded()`, so a page that already has its catalogs behaves exactly as when
 * they were modules; else once `load()` settles. A failed load is logged and `fn` still runs, over
 * the empty catalogs: the default card back and no coin, as for a deck that names none.
 */
export const whenLoaded = (isLoaded, load, fn, label) => {
  if (isLoaded()) {
    fn();
    return;
  }
  load().then(
    () => fn(),
    (error) => {
      console.warn(`[${label}] catalog unavailable.`, error);
      fn();
    }
  );
};

/**
 * A picker controller (`setSelected`, `getSelected`, `refreshOwned`) for a picker whose catalog is
 * still loading: it answers at once, with nothing selected, and keeps the last selection asked for;
 * once `load()` resolves, `build()` draws the real picker in `panelEl` and takes that selection over.
 * A failed load leaves `failureText` and a Retry button in the panel, styled by `noteClass` (the
 * picker's own empty-state class).
 */
export const deferredPicker = ({ panelEl, load, build, label, failureText, noteClass }) => {
  let picker = null;
  let pending = { set: false, id: null };

  const showRetry = (error) => {
    console.warn(`[${label}] catalog unavailable.`, error);
    const doc = panelEl.ownerDocument;
    const note = doc.createElement('div');
    note.className = noteClass;
    note.dataset.catalogRetry = '';
    note.textContent = `${failureText} `;
    const retry = doc.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => {
      retry.disabled = true;
      start();
    });
    note.append(retry);
    panelEl.replaceChildren(note);
  };

  const start = () =>
    load().then(() => {
      if (picker) return;
      picker = build();
      if (pending.set) picker.setSelected(pending.id);
    }, showRetry);

  start();
  return {
    setSelected: (id) => {
      if (picker) picker.setSelected(id);
      else pending = { set: true, id };
    },
    getSelected: () => picker?.getSelected() ?? null,
    refreshOwned: () => picker?.refreshOwned(),
  };
};
