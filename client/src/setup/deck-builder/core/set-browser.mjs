import { GENERATED_STARTER_DECKS } from './starter-decks.generated.mjs';

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
    
    // Sets legal in the 2026-27 Standard format (H regulation mark onward).
    // Source: Bulbapedia "2026-27 Standard format (TCG)" — matched to TCGdex IDs.
    const LEGAL_SET_REGISTRY = [
  {
    "series": "sv",
    "setId": "sv03.5",
    "name": "151",
    "category": "other"
  },
  {
    "series": "sv",
    "setId": "sv05",
    "name": "Temporal Forces"
  },
  {
    "series": "sv",
    "setId": "sv06",
    "name": "Twilight Masquerade"
  },
  {
    "series": "sv",
    "setId": "sv06.5",
    "name": "Shrouded Fable"
  },
  {
    "series": "sv",
    "setId": "sv07",
    "name": "Stellar Crown"
  },
  {
    "series": "sv",
    "setId": "sv08",
    "name": "Surging Sparks"
  },
  {
    "series": "sv",
    "setId": "sv08.5",
    "name": "Prismatic Evolutions"
  },
  {
    "series": "sv",
    "setId": "sv09",
    "name": "Journey Together"
  },
  {
    "series": "sv",
    "setId": "sv10",
    "name": "Destined Rivals"
  },
  {
    "series": "sv",
    "setId": "sv10.5b",
    "name": "Black Bolt"
  },
  {
    "series": "sv",
    "setId": "sv10.5w",
    "name": "White Flare"
  },
  {
    "series": "me",
    "setId": "me01",
    "name": "Mega Evolution"
  },
  {
    "series": "me",
    "setId": "me02",
    "name": "Phantasmal Flames"
  },
  {
    "series": "me",
    "setId": "me02.5",
    "name": "Ascended Heroes"
  },
  {
    "series": "me",
    "setId": "me03",
    "name": "Perfect Order"
  },
  {
    "series": "sv",
    "setId": "svp",
    "name": "SVP Black Star Promos"
  },
  {
    "series": "me",
    "setId": "mep",
    "name": "MEP Black Star Promos"
  },
  {
    "series": "mc",
    "setId": "2024sv",
    "name": "McDonald's Collection 2024"
  },
    {"series": "me", "setId": "me04"},
    {"series": "me", "setId": "me05"},
    {"series": "me", "setId": "mee"},
  ];
    
    const setRecordCache = new Map();

    // Synthetic "set" id for the Energy tab — aggregates every Energy card
    // (basic + special + rarer variants) printed in a Standard-legal set.
    export const ENERGY_SET_ID = '__energy__';
    const ENERGY_SET_LOGO = 'src/assets/energy/colorless.png';
    let energySummaryCache = null;
    
    async function fetchJson(url, options = {}) {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
      }
      return response.json();
    }
    
    function normalizeAssetUrl(url = '') {
      const value = String(url || '').trim();
      if (!value) return '';
      if (/\.(png|webp|jpg|jpeg|gif|svg)$/i.test(value)) return value;
      return `${value}.png`;
    }
    
    function normalizeSetCard(card = {}, set = {}) {
      const imageBase = card.image || '';
      const detailImage = imageBase ? `${imageBase}/high.webp` : '';
      const lowImage = imageBase ? `${imageBase}/low.webp` : '';
    
      return {
        id: card.id,
        name: card.name,
        localId: card.localId || '',
        image: detailImage,
        images: {
          small: lowImage,
          large: detailImage,
        },
        set: {
          id: set.id,
          name: set.name,
          releaseDate: set.releaseDate || '',
        },
        _provider: 'tcgdex-set-browser',
      };
    }
    
    export function getLegalSetRegistry() {
      return LEGAL_SET_REGISTRY.map((entry) => ({ ...entry }));
    }

    async function fetchSetRecord(setId, seriesId) {
      const cacheKey = `${seriesId}/${setId}`;
      if (setRecordCache.has(cacheKey)) return setRecordCache.get(cacheKey);
      const record = await fetchJson(`${TCGDEX_BASE}/sets/${setId}`);
      setRecordCache.set(cacheKey, record);
      return record;
    }

    // Generation → TCGdex series id(s). Gen 9 is Scarlet & Violet only (excludes
    // the separate `me` Mega Evolution series, user's explicit call). Gen 4 is
    // Diamond & Pearl + Platinum only (HeartGold & SoulSilver's `hgss` and Call
    // of Legends' `col` are deliberately left out, user's explicit call). `pop`,
    // `mc` (McDonald's), `tk` (trainer kits), `misc`, and `lc` (Legendary
    // Collection) are never referenced here, so they're unreachable from any
    // pill without needing their own filter (D5 doc: ignore POP/Other/Misc).
    export const GENERATION_SERIES = {
      9: ['sv'],
      8: ['swsh'],
      7: ['sm'],
      6: ['xy'],
      5: ['bw'],
      4: ['dp', 'pl'],
      3: ['ecard', 'ex'],
      2: ['neo'],
      1: ['base', 'gym'],
    };
    export const GENERATIONS = [9, 8, 7, 6, 5, 4, 3, 2, 1];

    const seriesRecordCache = new Map();
    async function fetchSeriesRecord(seriesId) {
      if (seriesRecordCache.has(seriesId)) return seriesRecordCache.get(seriesId);
      const promise = fetchJson(`${TCGDEX_BASE}/series/${seriesId}`).catch((error) => {
        seriesRecordCache.delete(seriesId);
        throw error;
      });
      seriesRecordCache.set(seriesId, promise);
      return promise;
    }

    const generationSetStubsCache = new Map(); // generation -> Promise<{setId, series}[]>

    // Every {setId, series} pair belonging to a generation, deduped across its
    // series (shared by fetchGenerationSets and fetchGenerationEnergyCards so
    // both agree on exactly which sets a generation covers).
    function fetchGenerationSetStubs(generation) {
      if (generationSetStubsCache.has(generation)) return generationSetStubsCache.get(generation);

      const promise = (async () => {
        const seriesIds = GENERATION_SERIES[generation] || [];
        const seriesRecords = await Promise.all(
          seriesIds.map((seriesId) => fetchSeriesRecord(seriesId).catch(() => null))
        );

        const seenSetIds = new Set();
        const setStubs = [];
        for (const record of seriesRecords) {
          if (!record) continue;
          for (const set of record.sets || []) {
            if (!set?.id || seenSetIds.has(set.id)) continue;
            seenSetIds.add(set.id);
            setStubs.push({ setId: set.id, series: record.id });
          }
        }
        return setStubs;
      })();

      generationSetStubsCache.set(generation, promise);
      return promise;
    }

    // Synthetic set id for a generation's Energy tab, e.g. `__energy_gen9__`.
    export function generationEnergySetId(generation) {
      return `__energy_gen${generation}__`;
    }
    const GENERATION_ENERGY_SET_ID_RE = /^__energy_gen(\d+)__$/;

    // Fetch every set in a Pokémon generation (across all its TCGdex series),
    // newest first, in the same shape fetchLegalStandardSets() returns, plus a
    // synthetic Energy tab aggregating every Energy card (basic + special +
    // rarer variants) printed across that generation's sets.
    export async function fetchGenerationSets(generation) {
      const setStubs = await fetchGenerationSetStubs(generation);

      const entries = await Promise.all(
        setStubs.map(async ({ setId, series }) => {
          try {
            const record = await fetchSetRecord(setId, series);
            return {
              setId: record.id,
              name: record.name,
              seriesId: series,
              releaseDate: record.releaseDate || '',
              logo: normalizeAssetUrl(record.logo),
              symbol: normalizeAssetUrl(record.symbol),
              cardCount: (record.cards || []).filter((c) => c.image).length,
              category: 'generation',
            };
          } catch {
            return null;
          }
        })
      );

      const sets = entries
        .filter(Boolean)
        .filter((entry) => entry.cardCount > 0)
        .sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')));

      try {
        const energyCards = await fetchGenerationEnergyCards(generation);
        if (energyCards.length > 0) {
          sets.push({
            setId: generationEnergySetId(generation),
            name: 'Energy',
            seriesId: '',
            releaseDate: '',
            logo: ENERGY_SET_LOGO,
            symbol: '',
            cardCount: energyCards.length,
            category: 'generation',
          });
        }
      } catch {
        // Energy tab is additive — a lookup failure shouldn't break the rest of the browser.
      }

      return sets;
    }
    
    // Fetch all legal Standard-format sets, newest first, with logo + release date.
    export async function fetchLegalStandardSets() {
      const entries = await Promise.all(
        LEGAL_SET_REGISTRY.map(async (entry) => {
          try {
            const record = await fetchSetRecord(entry.setId, entry.series);
            return {
              setId: record.id,
              name: record.name,
              seriesId: entry.series,
              releaseDate: record.releaseDate || '',
              logo: normalizeAssetUrl(record.logo),
              symbol: normalizeAssetUrl(record.symbol),
              cardCount: (record.cards || []).filter((c) => c.image).length,
              category: entry.category || 'standard',
            };
          } catch {
            return null;
          }
        })
      );

      const sets = entries
        .filter(Boolean)
        .filter((entry) => entry.cardCount > 0)
        .sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')));

      try {
        const energyCards = await fetchLegalEnergyCards();
        if (energyCards.length > 0) {
          sets.push({
            setId: ENERGY_SET_ID,
            name: 'Energy',
            seriesId: '',
            releaseDate: '',
            logo: ENERGY_SET_LOGO,
            symbol: '',
            cardCount: energyCards.length,
            category: 'standard',
          });
        }
      } catch {
        // Energy tab is additive — a lookup failure shouldn't break the rest of the browser.
      }

      return sets;
    }

    // Every Energy card (id + localId + name) across all TCGdex sets.
    async function fetchEnergyCardSummaries() {
      if (energySummaryCache) return energySummaryCache;
      const url = new URL(`${TCGDEX_BASE}/cards`);
      url.searchParams.set('category', 'Energy');
      energySummaryCache = fetchJson(url.toString()).catch((error) => {
        energySummaryCache = null;
        throw error;
      });
      return energySummaryCache;
    }

    // The Mega Evolution Energy (MEE) support product — the modern-standard basic
    // energy reprint for the current era — has no `image` in TCGdex at all (its
    // /sets/mee and /cards/mee-* records both omit the field), so it's hardcoded here
    // with art hotlinked from pkmncards.com, the same way every other card here is
    // hotlinked from TCGdex's own asset CDN.
    const MODERN_BASIC_ENERGY_TYPES = [
      { localId: '001', type: 'Grass' },
      { localId: '002', type: 'Fire' },
      { localId: '003', type: 'Water' },
      { localId: '004', type: 'Lightning' },
      { localId: '005', type: 'Psychic' },
      { localId: '006', type: 'Fighting' },
      { localId: '007', type: 'Darkness' },
      { localId: '008', type: 'Metal' },
    ];
    const MEE_SET = { id: 'mee', name: 'Mega Evolution Energy', releaseDate: '' };

    function getModernBasicEnergyCards() {
      return MODERN_BASIC_ENERGY_TYPES.map(({ localId, type }) => {
        const image = `https://pkmncards.com/wp-content/uploads/mee_en_${localId}_std.jpg`;
        return {
          id: `mee-${localId}`,
          name: `${type} Energy`,
          localId,
          image,
          images: { small: image, large: image },
          set: MEE_SET,
          _provider: 'pkmncards-set-browser',
        };
      });
    }

    // The gold secret rare "Basic {Type} Energy" cards are each a one-off print in a
    // set that has since rotated out of Standard (sv01/sv02/sv03/151); the Standard-
    // legal sv06.5 (Shrouded Fable) already has its own Darkness/Metal gold prints,
    // which the normal registry sweep below picks up without help.
    const EXTRA_ENERGY_CARD_REFS = [
      { id: 'sv01-257', setId: 'sv01', series: 'sv' }, // Basic Lightning Energy (gold)
      { id: 'sv01-258', setId: 'sv01', series: 'sv' }, // Basic Fighting Energy (gold)
      { id: 'sv02-278', setId: 'sv02', series: 'sv' }, // Basic Grass Energy (gold)
      { id: 'sv02-279', setId: 'sv02', series: 'sv' }, // Basic Water Energy (gold)
      { id: 'sv03-230', setId: 'sv03', series: 'sv' }, // Basic Fire Energy (gold)
      { id: 'sv03.5-207', setId: 'sv03.5', series: 'sv' }, // Basic Psychic Energy (gold)
    ];

    async function fetchExtraEnergyCards() {
      const refsBySetId = new Map();
      for (const ref of EXTRA_ENERGY_CARD_REFS) {
        if (!refsBySetId.has(ref.setId)) refsBySetId.set(ref.setId, { series: ref.series, ids: [] });
        refsBySetId.get(ref.setId).ids.push(ref.id);
      }

      const cardGroups = await Promise.all(
        [...refsBySetId.entries()].map(async ([setId, { series, ids }]) => {
          try {
            const record = await fetchSetRecord(setId, series);
            const set = { id: record.id, name: record.name, releaseDate: record.releaseDate || '' };
            const cardsById = new Map((record.cards || []).map((card) => [card.id, card]));
            return ids
              .map((id) => cardsById.get(id))
              .filter((card) => card?.id && card?.name && card.image)
              .map((card) => normalizeSetCard(card, set));
          } catch {
            return [];
          }
        })
      );

      return [...getModernBasicEnergyCards(), ...cardGroups.flat()];
    }

    // Every Energy card (basic, special, and rarer variants) printed across a
    // given list of {setId, series} entries. The /cards?category=Energy summary
    // has no image, so once we know which sets contain a match we hydrate
    // images from each set's already-cached full record.
    async function fetchEnergyCardsForSetEntries(setEntries) {
      const summaries = await fetchEnergyCardSummaries();

      const summariesBySetId = new Map();
      for (const summary of summaries) {
        const entry = setEntries.find((candidate) => String(summary.id || '').startsWith(`${candidate.setId}-`));
        if (!entry) continue;
        if (!summariesBySetId.has(entry.setId)) summariesBySetId.set(entry.setId, { entry, summaries: [] });
        summariesBySetId.get(entry.setId).summaries.push(summary);
      }

      const cardGroups = await Promise.all(
        [...summariesBySetId.values()].map(async ({ entry, summaries: setSummaries }) => {
          try {
            const record = await fetchSetRecord(entry.setId, entry.series);
            const set = { id: record.id, name: record.name, releaseDate: record.releaseDate || '' };
            const cardsById = new Map((record.cards || []).map((card) => [card.id, card]));
            return setSummaries
              .map((summary) => cardsById.get(summary.id))
              .filter((card) => card?.id && card?.name && card.image)
              .map((card) => normalizeSetCard(card, set));
          } catch {
            return [];
          }
        })
      );

      return cardGroups.flat();
    }

    // Fetch every Energy card (basic, special, and rarer variants) printed in a
    // Standard-legal set, plus the modern basic-energy reprints and gold secret
    // rares in EXTRA_ENERGY_CARD_REFS.
    export async function fetchLegalEnergyCards() {
      const legalSetEntries = LEGAL_SET_REGISTRY.filter((entry) => (entry.category || 'standard') !== 'other');

      const [cardGroups, extraCards] = await Promise.all([
        fetchEnergyCardsForSetEntries(legalSetEntries),
        fetchExtraEnergyCards(),
      ]);

      const seenIds = new Set();
      const allCards = [...cardGroups, ...extraCards].filter((card) => {
        if (seenIds.has(card.id)) return false;
        seenIds.add(card.id);
        return true;
      });

      return sortCardsWithinGroup(allCards, { sortBy: 'name', sortDirection: 'asc' });
    }

    // Fetch every Energy card (basic, special, and rarer variants) printed
    // across every set in a Pokémon generation. No modern-basic/gold-secret
    // extras here — those exist only to backfill Standard-legal sets that have
    // since rotated out of LEGAL_SET_REGISTRY; a generation's own set list
    // already includes every set it ever had, rotated or not.
    export async function fetchGenerationEnergyCards(generation) {
      const setEntries = await fetchGenerationSetStubs(generation);
      const cards = await fetchEnergyCardsForSetEntries(setEntries);
      return sortCardsWithinGroup(cards, { sortBy: 'name', sortDirection: 'asc' });
    }

    // Fetch all cards of one legal set (only those with images).
    export async function fetchSetCards(setId) {
      if (setId === ENERGY_SET_ID) return fetchLegalEnergyCards();

      const generationEnergyMatch = GENERATION_ENERGY_SET_ID_RE.exec(setId);
      if (generationEnergyMatch) return fetchGenerationEnergyCards(Number(generationEnergyMatch[1]));

      const record = await fetchSetRecord(setId);
      const set = {
        id: record.id,
        name: record.name,
        releaseDate: record.releaseDate || '',
      };
      return (record.cards || [])
        .filter((card) => card?.id && card?.name && card.image)
        .map((card) => normalizeSetCard(card, set));
    }
    
    export function filterCardsByName(cards = [], term = '') {
      const needle = String(term || '').trim().toLowerCase();
      if (!needle) return [...cards];
      return cards.filter((card) => String(card?.name || '').toLowerCase().includes(needle));
    }
    
    export function sortCardsWithinGroup(cards = [], options = {}) {
      const { sortBy = 'number', sortDirection = 'asc' } = options;
      const direction = sortDirection === 'desc' ? -1 : 1;
    
      return [...cards].sort((a, b) => {
        if (sortBy === 'name') {
          return String(a?.name || '').localeCompare(String(b?.name || '')) * direction;
        }
        const idA = String(a?.localId || '');
        const idB = String(b?.localId || '');
        const numA = parseInt(idA, 10);
        const numB = parseInt(idB, 10);
        const aIsNumeric = !Number.isNaN(numA);
        const bIsNumeric = !Number.isNaN(numB);
        if (aIsNumeric && bIsNumeric) {
          if (numA !== numB) return (numA - numB) * direction;
          return idA.localeCompare(idB) * direction;
        }
        if (aIsNumeric !== bIsNumeric) {
          // non-numeric ids always trail, regardless of direction
          return aIsNumeric ? -1 : 1;
        }
        return idA.localeCompare(idB) * direction;
      });
    }
    
    // ── Starter decks (Mega Battle Decks + Pokémon TCG Live starter decks) ──
    // Gengar/Diancie: Bulbapedia Mega Battle Deck lists. TCG Live decks: official
    // lists from pokemon.com (March 2026 starter strategies + Pitch Black battle pass).
    // Resolved card data is baked in; GENERATED decks built via scripts/generate-starter-decks.mjs.
    const STARTER_DECKS = {
  "gengar": [
    {
      "id": "me02-056",
      "name": "Mega Gengar ex",
      "supertype": "Pokémon",
      "localId": "056",
      "image": "https://assets.tcgdex.net/en/me/me02/056/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/056/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/056/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-055",
      "name": "Haunter",
      "supertype": "Pokémon",
      "localId": "055",
      "image": "https://assets.tcgdex.net/en/me/me02/055/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/055/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/055/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me03-049",
      "name": "Haunter",
      "supertype": "Pokémon",
      "localId": "049",
      "image": "https://assets.tcgdex.net/en/me/me03/049/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me03/049/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me03/049/high.webp"
      },
      "set": {
        "id": "me03",
        "name": "Perfect Order",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me02-054",
      "name": "Gastly",
      "supertype": "Pokémon",
      "localId": "054",
      "image": "https://assets.tcgdex.net/en/me/me02/054/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/054/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/054/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 4
    },
    {
      "id": "me02-068",
      "name": "Toxtricity",
      "supertype": "Pokémon",
      "localId": "068",
      "image": "https://assets.tcgdex.net/en/me/me02/068/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/068/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/068/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-067",
      "name": "Toxel",
      "supertype": "Pokémon",
      "localId": "067",
      "image": "https://assets.tcgdex.net/en/me/me02/067/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/067/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/067/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-059",
      "name": "Sableye",
      "supertype": "Pokémon",
      "localId": "059",
      "image": "https://assets.tcgdex.net/en/me/me02/059/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/059/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/059/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-062",
      "name": "Seviper",
      "supertype": "Pokémon",
      "localId": "062",
      "image": "https://assets.tcgdex.net/en/me/me02/062/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/062/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/062/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-069",
      "name": "Eternatus",
      "supertype": "Pokémon",
      "localId": "069",
      "image": "https://assets.tcgdex.net/en/me/me02/069/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/069/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/069/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me01-119",
      "name": "Lillie's Determination",
      "supertype": "Trainer",
      "localId": "119",
      "image": "https://assets.tcgdex.net/en/me/me01/119/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/119/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/119/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 4
    },
    {
      "id": "sv03-186",
      "name": "Arven",
      "supertype": "Trainer",
      "localId": "186",
      "image": "https://assets.tcgdex.net/en/sv/sv03/186/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv03/186/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv03/186/high.webp"
      },
      "set": {
        "id": "sv03",
        "name": "Obsidian Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-114",
      "name": "Boss's Orders",
      "supertype": "Trainer",
      "localId": "114",
      "image": "https://assets.tcgdex.net/en/me/me01/114/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/114/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/114/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-087",
      "name": "Dawn",
      "supertype": "Trainer",
      "localId": "087",
      "image": "https://assets.tcgdex.net/en/me/me02/087/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/087/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/087/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me02-090",
      "name": "Grimsley's Move",
      "supertype": "Trainer",
      "localId": "090",
      "image": "https://assets.tcgdex.net/en/me/me02/090/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/090/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/090/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "sv04.5-080",
      "name": "Iono",
      "supertype": "Trainer",
      "localId": "080",
      "image": "https://assets.tcgdex.net/en/sv/sv04.5/080/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv04.5/080/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv04.5/080/high.webp"
      },
      "set": {
        "id": "sv04.5",
        "name": "Paldean Fates",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "sv04.5-084",
      "name": "Nest Ball",
      "supertype": "Trainer",
      "localId": "084",
      "image": "https://assets.tcgdex.net/en/sv/sv04.5/084/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv04.5/084/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv04.5/084/high.webp"
      },
      "set": {
        "id": "sv04.5",
        "name": "Paldean Fates",
        "releaseDate": ""
      },
      "qty": 3
    },
    {
      "id": "sv05-144",
      "name": "Buddy-Buddy Poffin",
      "supertype": "Trainer",
      "localId": "144",
      "image": "https://assets.tcgdex.net/en/sv/sv05/144/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv05/144/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv05/144/high.webp"
      },
      "set": {
        "id": "sv05",
        "name": "Temporal Forces",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "sv06.5-061",
      "name": "Night Stretcher",
      "supertype": "Trainer",
      "localId": "061",
      "image": "https://assets.tcgdex.net/en/sv/sv06.5/061/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv06.5/061/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv06.5/061/high.webp"
      },
      "set": {
        "id": "sv06.5",
        "name": "Shrouded Fable",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-125",
      "name": "Rare Candy",
      "supertype": "Trainer",
      "localId": "125",
      "image": "https://assets.tcgdex.net/en/me/me01/125/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/125/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/125/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-130",
      "name": "Switch",
      "supertype": "Trainer",
      "localId": "130",
      "image": "https://assets.tcgdex.net/en/me/me01/130/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/130/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/130/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-131",
      "name": "Ultra Ball",
      "supertype": "Trainer",
      "localId": "131",
      "image": "https://assets.tcgdex.net/en/me/me01/131/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/131/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/131/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "sv10.5b-084",
      "name": "Pokégear 3.0",
      "supertype": "Trainer",
      "localId": "084",
      "image": "https://assets.tcgdex.net/en/sv/sv10.5b/084/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv10.5b/084/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv10.5b/084/high.webp"
      },
      "set": {
        "id": "sv10.5b",
        "name": "Black Bolt",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me01-121",
      "name": "Mega Signal",
      "supertype": "Trainer",
      "localId": "121",
      "image": "https://assets.tcgdex.net/en/me/me01/121/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/121/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/121/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me02-092",
      "name": "Punk Helmet",
      "supertype": "Trainer",
      "localId": "092",
      "image": "https://assets.tcgdex.net/en/me/me02/092/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/092/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/092/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-127",
      "name": "Risky Ruins",
      "supertype": "Trainer",
      "localId": "127",
      "image": "https://assets.tcgdex.net/en/me/me01/127/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/127/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/127/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "sve-007",
      "name": "Basic Darkness Energy",
      "supertype": "Energy",
      "localId": "007",
      "image": "https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/SVE/SVE_007_R_EN.png",
      "images": {
        "small": "https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/SVE/SVE_007_R_EN.png",
        "large": "https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/SVE/SVE_007_R_EN.png"
      },
      "set": {
        "id": "sve",
        "name": "Scarlet & Violet Energy",
        "releaseDate": ""
      },
      "qty": 13
    }
  ],
  "diancie": [
    {
      "id": "me02-041",
      "name": "Mega Diancie ex",
      "supertype": "Pokémon",
      "localId": "041",
      "image": "https://assets.tcgdex.net/en/me/me02/041/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/041/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/041/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-040",
      "name": "Meloetta",
      "supertype": "Pokémon",
      "localId": "040",
      "image": "https://assets.tcgdex.net/en/me/me02/040/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/040/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/040/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me02-040",
      "name": "Meloetta",
      "supertype": "Pokémon",
      "localId": "040",
      "image": "https://assets.tcgdex.net/en/me/me02/040/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/040/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/040/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me01-063",
      "name": "Grumpig",
      "supertype": "Pokémon",
      "localId": "063",
      "image": "https://assets.tcgdex.net/en/me/me01/063/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/063/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/063/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-062",
      "name": "Spoink",
      "supertype": "Pokémon",
      "localId": "062",
      "image": "https://assets.tcgdex.net/en/me/me01/062/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/062/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/062/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-044",
      "name": "Alcremie",
      "supertype": "Pokémon",
      "localId": "044",
      "image": "https://assets.tcgdex.net/en/me/me02/044/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/044/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/044/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-043",
      "name": "Milcery",
      "supertype": "Pokémon",
      "localId": "043",
      "image": "https://assets.tcgdex.net/en/me/me02/043/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/043/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/043/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-042",
      "name": "Mimikyu",
      "supertype": "Pokémon",
      "localId": "042",
      "image": "https://assets.tcgdex.net/en/me/me02/042/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/042/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/042/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me02-039",
      "name": "Cresselia",
      "supertype": "Pokémon",
      "localId": "039",
      "image": "https://assets.tcgdex.net/en/me/me02/039/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/039/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/039/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me02-045",
      "name": "Zacian",
      "supertype": "Pokémon",
      "localId": "045",
      "image": "https://assets.tcgdex.net/en/me/me02/045/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/045/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/045/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me01-119",
      "name": "Lillie's Determination",
      "supertype": "Trainer",
      "localId": "119",
      "image": "https://assets.tcgdex.net/en/me/me01/119/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/119/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/119/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 4
    },
    {
      "id": "sv03-186",
      "name": "Arven",
      "supertype": "Trainer",
      "localId": "186",
      "image": "https://assets.tcgdex.net/en/sv/sv03/186/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv03/186/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv03/186/high.webp"
      },
      "set": {
        "id": "sv03",
        "name": "Obsidian Flames",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-114",
      "name": "Boss's Orders",
      "supertype": "Trainer",
      "localId": "114",
      "image": "https://assets.tcgdex.net/en/me/me01/114/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/114/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/114/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "sv04.5-080",
      "name": "Iono",
      "supertype": "Trainer",
      "localId": "080",
      "image": "https://assets.tcgdex.net/en/sv/sv04.5/080/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv04.5/080/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv04.5/080/high.webp"
      },
      "set": {
        "id": "sv04.5",
        "name": "Paldean Fates",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "sv10.5b-085",
      "name": "Professor's Research",
      "supertype": "Trainer",
      "localId": "085",
      "image": "https://assets.tcgdex.net/en/sv/sv10.5b/085/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv10.5b/085/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv10.5b/085/high.webp"
      },
      "set": {
        "id": "sv10.5b",
        "name": "Black Bolt",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me01-132",
      "name": "Wally's Compassion",
      "supertype": "Trainer",
      "localId": "132",
      "image": "https://assets.tcgdex.net/en/me/me01/132/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/132/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/132/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 1
    },
    {
      "id": "me02-094",
      "name": "Wondrous Patch",
      "supertype": "Trainer",
      "localId": "094",
      "image": "https://assets.tcgdex.net/en/me/me02/094/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me02/094/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me02/094/high.webp"
      },
      "set": {
        "id": "me02",
        "name": "Phantasmal Flames",
        "releaseDate": ""
      },
      "qty": 4
    },
    {
      "id": "sv04.5-084",
      "name": "Nest Ball",
      "supertype": "Trainer",
      "localId": "084",
      "image": "https://assets.tcgdex.net/en/sv/sv04.5/084/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv04.5/084/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv04.5/084/high.webp"
      },
      "set": {
        "id": "sv04.5",
        "name": "Paldean Fates",
        "releaseDate": ""
      },
      "qty": 3
    },
    {
      "id": "sv05-144",
      "name": "Buddy-Buddy Poffin",
      "supertype": "Trainer",
      "localId": "144",
      "image": "https://assets.tcgdex.net/en/sv/sv05/144/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv05/144/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv05/144/high.webp"
      },
      "set": {
        "id": "sv05",
        "name": "Temporal Forces",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "sv06.5-061",
      "name": "Night Stretcher",
      "supertype": "Trainer",
      "localId": "061",
      "image": "https://assets.tcgdex.net/en/sv/sv06.5/061/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv06.5/061/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv06.5/061/high.webp"
      },
      "set": {
        "id": "sv06.5",
        "name": "Shrouded Fable",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-130",
      "name": "Switch",
      "supertype": "Trainer",
      "localId": "130",
      "image": "https://assets.tcgdex.net/en/me/me01/130/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/130/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/130/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-131",
      "name": "Ultra Ball",
      "supertype": "Trainer",
      "localId": "131",
      "image": "https://assets.tcgdex.net/en/me/me01/131/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/131/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/131/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "sv10.5b-079",
      "name": "Air Balloon",
      "supertype": "Trainer",
      "localId": "079",
      "image": "https://assets.tcgdex.net/en/sv/sv10.5b/079/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/sv/sv10.5b/079/low.webp",
        "large": "https://assets.tcgdex.net/en/sv/sv10.5b/079/high.webp"
      },
      "set": {
        "id": "sv10.5b",
        "name": "Black Bolt",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "me01-122",
      "name": "Mystery Garden",
      "supertype": "Trainer",
      "localId": "122",
      "image": "https://assets.tcgdex.net/en/me/me01/122/high.webp",
      "images": {
        "small": "https://assets.tcgdex.net/en/me/me01/122/low.webp",
        "large": "https://assets.tcgdex.net/en/me/me01/122/high.webp"
      },
      "set": {
        "id": "me01",
        "name": "Mega Evolution",
        "releaseDate": ""
      },
      "qty": 2
    },
    {
      "id": "sve-005",
      "name": "Basic Psychic Energy",
      "supertype": "Energy",
      "localId": "005",
      "image": "https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/SVE/SVE_005_R_EN.png",
      "images": {
        "small": "https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/SVE/SVE_005_R_EN.png",
        "large": "https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/SVE/SVE_005_R_EN.png"
      },
      "set": {
        "id": "sve",
        "name": "Scarlet & Violet Energy",
        "releaseDate": ""
      },
      "qty": 14
    }
  ]
};

export const STARTER_DECK_CATALOG = [
  {
    key: 'gengar',
    name: 'Mega Gengar ex Battle Deck',
    sleeveId: 'd92570dc-bbd5-43a4-b7d6-9094993ba975',
    coinId: 'MBG_Purple_Mega_Gengar_Coin',
  },
  {
    key: 'diancie',
    name: 'Mega Diancie ex Battle Deck',
    // No Mega Diancie sleeve in catalog — closest Mega Evolution fairy ETB art.
    sleeveId: '00b68849-fd1f-4908-a8d8-b44ac392e455',
    coinId: 'MBD_Magenta_Mega_Diancie_Coin',
  },
  {
    key: 'lucario',
    name: 'Mega Lucario ex Starter Deck',
    sleeveId: '5341801a-a512-4842-ae15-bd8ce8748f8d',
    coinId: 'MEGETB_Blue_Mega_Lucario_Coin',
  },
  {
    key: 'charizard',
    name: 'Mega Charizard X ex Starter Deck',
    sleeveId: '5f123df1-82c9-4fae-998c-9e5ce1d7eb9a',
    coinId: 'PFLETB_Mega_Charizard_X_Coin',
  },
  {
    key: 'darkrai',
    name: 'Mega Darkrai ex Starter Deck',
    sleeveId: '52a78878-0457-4619-bc4a-6cba7853998e',
    // No solo Mega Darkrai coin — best available features Darkrai prominently.
    coinId: 'TCGBA_Gold_Pikachu_Darkrai_Armarouge_Coin',
  },
  {
    key: 'dragonite',
    name: 'Mega Dragonite ex Starter Deck',
    sleeveId: '86456fdb-d9b2-4990-94c6-5ac3657b8260',
    coinId: 'ASCETB_Yellow_Mega_Dragonite_Coin',
  },
  {
    key: 'greninja',
    name: 'Mega Greninja ex Starter Deck',
    sleeveId: 'b4952582-3bc4-4bb8-87f6-07dd88f771ff',
    // No Mega Greninja coin — normal Greninja variant.
    coinId: 'M4_Blue_Greninja_Coin',
  },
];

export function getStarterDecks() {
  return {
    ...STARTER_DECKS,
    ...GENERATED_STARTER_DECKS,
  };
}
    