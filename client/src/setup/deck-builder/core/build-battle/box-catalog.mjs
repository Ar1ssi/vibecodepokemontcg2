// Build & Battle boxes and the Prerelease Kits they grew out of (designs 051, 054). The catalog is
// eager and small: names, promos, kinds, skins. Card data lives in per-set and per-box modules
// that `box-data.mjs` loads on demand. Every box's contents come from its Bulbapedia page
// (`sources.box`); promos are TCGdex ids.

/**
 * @typedef {'xy'|'sm'|'swsh'|'sv'|'me'} Era
 * @typedef {'fixed-decks'|'evolution-pack'|'evolution-deck'} BoxKind
 *   fixed-decks: one of four 40-card decks (Mega Evolution →); evolution-pack: a 23-card Evolution
 *   pack of the promo's group, one other group and random Trainers (Fates Collide → Fusion Strike);
 *   evolution-deck: the same pack plus Basic Energy to 40 cards (Brilliant Stars → Destined Rivals).
 * @typedef {{key: string, name: string, promoId: string, energy: string|null, sprites: string[]}} BoxDeck
 *   `energy` is a fixed deck's Basic Energy, or an Evolution deck group's heaviest in its baked
 *   `energyNeeds` (design 054 A3); null when the group has none or the box deals no Energy.
 * @typedef {{keyArtCardId: string|null, palette: Era, packArtCardIds: string[],
 *   vendored: {box: boolean, packs: boolean}}} BoxSkin
 */

export const BOX_KINDS = Object.freeze(['fixed-decks', 'evolution-pack', 'evolution-deck']);

export const BUILD_BATTLE_ERA_NAMES = Object.freeze({
  xy: 'XY',
  sm: 'Sun & Moon',
  swsh: 'Sword & Shield',
  sv: 'Scarlet & Violet',
  me: 'Mega Evolution',
});

// Where each era's pack anatomy was read (design 054 § Research 5).
const PACK_SOURCES = Object.freeze({
  xy: 'https://www.pokebeach.com/2017/01/sun-moon-booster-packs-reintroducing-11-cards-new-reverse-holo-style',
  sm: 'https://www.pokebeach.com/2017/01/sun-moon-booster-packs-reintroducing-11-cards-new-reverse-holo-style',
  swsh: 'https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG)',
  sv: 'https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes',
  me: 'https://tcgprotectors.com/blogs/pokemon-blog/phantasmal-flames-pull-rates-10000-packs-analyzed-hits-or-misses',
});

const BULBAPEDIA_WIKI = 'https://bulbapedia.bulbagarden.net/wiki/';

// Pack count, Energy count and pack art follow from the kind; the skin defaults to procedural art
// over the four promos. Key art (the box front): an ME box shows the Special Illustration Rare of
// the Pokémon on its set's first Mega Hyper Rare, as 051 chose me02-125; an SV box the Special
// Illustration Rare of the Pokémon on its set's first Hyper rare (TCGdex rarities).
function defineBox({ key, name, era, kind, decks, skin = {}, page, ...rest }) {
  return Object.freeze({
    key,
    name,
    shortName: name.replace(/ (Build & Battle Box|Prerelease Kit)$/, ''),
    era,
    kind,
    packCount: 4,
    energyCount: kind === 'evolution-deck' ? 17 : 0,
    ...rest,
    decks: Object.freeze(decks.map((deck) => Object.freeze({ ...deck, sprites: [...deck.sprites] }))),
    skin: Object.freeze({
      keyArtCardId: skin.keyArtCardId ?? null,
      palette: skin.palette ?? era,
      packArtCardIds: skin.packArtCardIds ?? decks.map((deck) => deck.promoId),
      vendored: Object.freeze({ box: Boolean(skin.vendored?.box), packs: Boolean(skin.vendored?.packs) }),
    }),
    sources: Object.freeze({
      box: `${BULBAPEDIA_WIKI}${encodeURIComponent(page.replace(/ /g, '_'))}`,
      packs: PACK_SOURCES[era],
    }),
  });
}

/** Every box, in release order. */
export const BUILD_BATTLE_BOXES = Object.freeze([
  // ── Scarlet & Violet: 40-card Evolution decks (two groups, Trainers, 17 Basic Energy) ──
  defineBox({
    key: 'scarlet-violet',
    name: 'Scarlet & Violet Build & Battle Box',
    page: 'Scarlet & Violet Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv01',
    promoSetId: 'svp',
    kind: 'evolution-deck',
    packModelKey: 'sv',
    skin: { keyArtCardId: 'sv01-244' },
    decks: [
      { key: 'quaquaval', name: 'Quaquaval', promoId: 'svp-005', energy: 'Basic Water Energy', sprites: ['quaquaval'] },
      { key: 'pawmot', name: 'Pawmot', promoId: 'svp-006', energy: 'Basic Lightning Energy', sprites: ['pawmot'] },
      { key: 'hawlucha', name: 'Hawlucha', promoId: 'svp-007', energy: 'Basic Grass Energy', sprites: ['hawlucha'] },
      { key: 'revavroom', name: 'Revavroom', promoId: 'svp-008', energy: 'Basic Water Energy', sprites: ['revavroom'] },
    ],
  }),
  defineBox({
    key: 'paldea-evolved',
    name: 'Paldea Evolved Build & Battle Box',
    page: 'Paldea Evolved Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv02',
    promoSetId: 'svp',
    kind: 'evolution-deck',
    packModelKey: 'sv',
    skin: { keyArtCardId: 'sv02-256' },
    decks: [
      { key: 'baxcalibur', name: 'Baxcalibur', promoId: 'svp-019', energy: 'Basic Water Energy', sprites: ['baxcalibur'] },
      { key: 'tinkaton', name: 'Tinkaton', promoId: 'svp-020', energy: 'Basic Psychic Energy', sprites: ['tinkaton'] },
      { key: 'murkrow', name: 'Murkrow', promoId: 'svp-021', energy: 'Basic Darkness Energy', sprites: ['murkrow'] },
      { key: 'pelipper', name: 'Pelipper', promoId: 'svp-022', energy: 'Basic Grass Energy', sprites: ['pelipper'] },
    ],
  }),
  defineBox({
    key: 'obsidian-flames',
    name: 'Obsidian Flames Build & Battle Box',
    page: 'Obsidian Flames Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv03',
    promoSetId: 'svp',
    kind: 'evolution-deck',
    packModelKey: 'sv',
    skin: { keyArtCardId: 'sv03-223' },
    decks: [
      { key: 'palafin', name: 'Palafin', promoId: 'svp-036', energy: 'Basic Water Energy', sprites: ['palafin'] },
      { key: 'cleffa', name: 'Cleffa', promoId: 'svp-037', energy: 'Basic Fire Energy', sprites: ['cleffa'] },
      { key: 'togekiss', name: 'Togekiss', promoId: 'svp-038', energy: 'Basic Psychic Energy', sprites: ['togekiss'] },
      { key: 'mawile', name: 'Mawile', promoId: 'svp-039', energy: 'Basic Lightning Energy', sprites: ['mawile'] },
    ],
  }),
  defineBox({
    key: 'paradox-rift',
    name: 'Paradox Rift Build & Battle Box',
    page: 'Paradox Rift Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv04',
    promoSetId: 'svp',
    kind: 'evolution-deck',
    packModelKey: 'sv',
    skin: { keyArtCardId: 'sv04-245' },
    decks: [
      { key: 'chi-yu', name: 'Chi-Yu', promoId: 'svp-057', energy: 'Basic Fire Energy', sprites: ['chi-yu'] },
      { key: 'iron-bundle', name: 'Iron Bundle', promoId: 'svp-058', energy: 'Basic Water Energy', sprites: ['iron-bundle'] },
      { key: 'xatu', name: 'Xatu', promoId: 'svp-059', energy: 'Basic Psychic Energy', sprites: ['xatu'] },
      { key: 'aegislash', name: 'Aegislash', promoId: 'svp-060', energy: 'Basic Metal Energy', sprites: ['aegislash'] },
    ],
  }),
  defineBox({
    key: 'temporal-forces',
    name: 'Temporal Forces Build & Battle Box',
    page: 'Temporal Forces Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv05',
    promoSetId: 'svp',
    kind: 'evolution-deck',
    packModelKey: 'sv-acespec',
    skin: { keyArtCardId: 'sv05-203' },
    decks: [
      { key: 'feraligatr', name: 'Feraligatr', promoId: 'svp-089', energy: 'Basic Water Energy', sprites: ['feraligatr'] },
      { key: 'metang', name: 'Metang', promoId: 'svp-090', energy: 'Basic Metal Energy', sprites: ['metang'] },
      { key: 'koraidon', name: 'Koraidon', promoId: 'svp-091', energy: 'Basic Fighting Energy', sprites: ['koraidon'] },
      { key: 'miraidon', name: 'Miraidon', promoId: 'svp-092', energy: 'Basic Lightning Energy', sprites: ['miraidon'] },
    ],
  }),
  defineBox({
    key: 'twilight-masquerade',
    name: 'Twilight Masquerade Build & Battle Box',
    page: 'Twilight Masquerade Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv06',
    promoSetId: 'svp',
    kind: 'evolution-deck',
    packModelKey: 'sv-acespec',
    skin: { keyArtCardId: 'sv06-211' },
    decks: [
      { key: 'thwackey', name: 'Thwackey', promoId: 'svp-115', energy: 'Basic Grass Energy', sprites: ['thwackey'] },
      { key: 'infernape', name: 'Infernape', promoId: 'svp-116', energy: 'Basic Fire Energy', sprites: ['infernape'] },
      { key: 'froslass', name: 'Froslass', promoId: 'svp-117', energy: 'Basic Water Energy', sprites: ['froslass'] },
      { key: 'tatsugiri', name: 'Tatsugiri', promoId: 'svp-118', energy: 'Basic Psychic Energy', sprites: ['tatsugiri'] },
    ],
  }),
  defineBox({
    key: 'stellar-crown',
    name: 'Stellar Crown Build & Battle Box',
    page: 'Stellar Crown Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv07',
    promoSetId: 'svp',
    kind: 'evolution-deck',
    packModelKey: 'sv-acespec',
    skin: { keyArtCardId: 'sv07-170' },
    decks: [
      { key: 'ledian', name: 'Ledian', promoId: 'svp-133', energy: 'Basic Grass Energy', sprites: ['ledian'] },
      { key: 'crabominable', name: 'Crabominable', promoId: 'svp-134', energy: 'Basic Water Energy', sprites: ['crabominable'] },
      { key: 'drifblim', name: 'Drifblim', promoId: 'svp-135', energy: 'Basic Psychic Energy', sprites: ['drifblim'] },
      { key: 'bouffalant', name: 'Bouffalant', promoId: 'svp-136', energy: null, sprites: ['bouffalant'] },
    ],
  }),
  defineBox({
    key: 'surging-sparks',
    name: 'Surging Sparks Build & Battle Box',
    page: 'Surging Sparks Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv08',
    promoSetId: 'svp',
    kind: 'evolution-deck',
    packModelKey: 'sv-acespec',
    skin: { keyArtCardId: 'sv08-238' },
    decks: [
      { key: 'gouging-fire', name: 'Gouging Fire', promoId: 'svp-151', energy: 'Basic Fire Energy', sprites: ['gouging-fire'] },
      { key: 'chien-pao', name: 'Chien-Pao', promoId: 'svp-152', energy: 'Basic Water Energy', sprites: ['chien-pao'] },
      { key: 'magneton', name: 'Magneton', promoId: 'svp-153', energy: 'Basic Lightning Energy', sprites: ['magneton'] },
      { key: 'indeedee', name: 'Indeedee', promoId: 'svp-154', energy: 'Basic Grass Energy', sprites: ['indeedee'] },
    ],
  }),
  defineBox({
    key: 'journey-together',
    name: 'Journey Together Build & Battle Box',
    page: 'Journey Together Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv09',
    promoSetId: 'svp',
    kind: 'evolution-deck',
    packModelKey: 'sv-acespec',
    skin: { keyArtCardId: 'sv09-183' },
    decks: [
      { key: 'ns-darmanitan', name: "N's Darmanitan", promoId: 'svp-181', energy: 'Basic Fire Energy', sprites: ['darmanitan'] },
      { key: 'ionos-kilowattrel', name: "Iono's Kilowattrel", promoId: 'svp-182', energy: 'Basic Lightning Energy', sprites: ['kilowattrel'] },
      { key: 'lillies-ribombee', name: "Lillie's Ribombee", promoId: 'svp-183', energy: 'Basic Grass Energy', sprites: ['ribombee'] },
      { key: 'hops-snorlax', name: "Hop's Snorlax", promoId: 'svp-184', energy: 'Basic Metal Energy', sprites: ['snorlax'] },
    ],
  }),
  defineBox({
    key: 'destined-rivals',
    name: 'Destined Rivals Build & Battle Box',
    page: 'Destined Rivals Build & Battle Box (TCG)',
    era: 'sv',
    setId: 'sv10',
    promoSetId: 'sv10',
    kind: 'evolution-deck',
    packModelKey: 'sv-acespec',
    skin: { keyArtCardId: 'sv10-230' },
    decks: [
      { key: 'ethans-typhlosion', name: "Ethan's Typhlosion", promoId: 'sv10-034', energy: 'Basic Fire Energy', sprites: ['typhlosion'] },
      { key: 'mistys-gyarados', name: "Misty's Gyarados", promoId: 'sv10-049', energy: 'Basic Water Energy', sprites: ['gyarados'] },
      { key: 'team-rockets-mimikyu', name: "Team Rocket's Mimikyu", promoId: 'sv10-087', energy: 'Basic Darkness Energy', sprites: ['mimikyu'] },
      { key: 'team-rockets-tyranitar', name: "Team Rocket's Tyranitar", promoId: 'sv10-096', energy: 'Basic Fighting Energy', sprites: ['tyranitar'] },
    ],
  }),
  // ── Mega Evolution: four fixed 40-card decks per box ──
  defineBox({
    key: 'mega-evolution',
    name: 'Mega Evolution Build & Battle Box',
    page: 'Mega Evolution Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me01',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me01-178' },
    decks: [
      { key: 'meganium', name: 'Meganium', promoId: 'mep-001', energy: 'Basic Grass Energy', sprites: ['meganium', 'exeggutor'] },
      { key: 'inteleon', name: 'Inteleon', promoId: 'mep-002', energy: 'Basic Water Energy', sprites: ['inteleon', 'frosmoth'] },
      { key: 'alakazam', name: 'Alakazam', promoId: 'mep-003', energy: 'Basic Psychic Energy', sprites: ['alakazam', 'grumpig'] },
      { key: 'lunatone', name: 'Lunatone', promoId: 'mep-004', energy: 'Basic Fighting Energy', sprites: ['lunatone', 'garganacl'] },
    ],
  }),
  defineBox({
    key: 'phantasmal-flames',
    name: 'Phantasmal Flames Build & Battle Box',
    page: 'Phantasmal Flames Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me02',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me02-125', vendored: { box: true, packs: true } },
    decks: [
      {
        key: 'ceruledge',
        name: 'Ceruledge',
        promoId: 'mep-014',
        energy: 'Basic Fire Energy',
        sprites: ['ceruledge', 'charcadet'],
      },
      {
        key: 'zacian',
        name: 'Zacian',
        promoId: 'mep-015',
        energy: 'Basic Psychic Energy',
        sprites: ['zacian', 'alcremie'],
      },
      {
        key: 'flygon',
        name: 'Flygon',
        promoId: 'mep-016',
        energy: 'Basic Fighting Energy',
        sprites: ['flygon', 'gliscor'],
      },
      {
        key: 'toxtricity',
        name: 'Toxtricity',
        promoId: 'mep-017',
        energy: 'Basic Darkness Energy',
        sprites: ['toxtricity', 'krookodile'],
      },
    ],
  }),
  defineBox({
    key: 'perfect-order',
    name: 'Perfect Order Build & Battle Box',
    page: 'Perfect Order Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me03',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me03-120' },
    decks: [
      { key: 'serperior', name: 'Serperior', promoId: 'mep-064', energy: 'Basic Grass Energy', sprites: ['serperior', 'shaymin'] },
      { key: 'barbaracle', name: 'Barbaracle', promoId: 'mep-065', energy: 'Basic Fighting Energy', sprites: ['barbaracle', 'landorus'] },
      { key: 'tyrantrum', name: 'Tyrantrum', promoId: 'mep-066', energy: 'Basic Fighting Energy', sprites: ['tyrantrum', 'hawlucha'] },
      { key: 'doublade', name: 'Doublade', promoId: 'mep-067', energy: 'Basic Metal Energy', sprites: ['doublade', 'klefki'] },
    ],
  }),
  defineBox({
    key: 'chaos-rising',
    name: 'Chaos Rising Build & Battle Box',
    page: 'Chaos Rising Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me04',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me04-116' },
    decks: [
      { key: 'delphox', name: 'Delphox', promoId: 'mep-074', energy: 'Basic Fire Energy', sprites: ['delphox', 'ninetales'] },
      { key: 'ampharos', name: 'Ampharos', promoId: 'mep-075', energy: 'Basic Lightning Energy', sprites: ['ampharos', 'emolga'] },
      { key: 'crobat', name: 'Crobat', promoId: 'mep-076', energy: 'Basic Darkness Energy', sprites: ['crobat', 'qwilfish'] },
      { key: 'goodra', name: 'Goodra', promoId: 'mep-077', energy: 'Basic Psychic Energy', sprites: ['goodra', 'meowstic'] },
    ],
  }),
  defineBox({
    key: 'pitch-black',
    name: 'Pitch Black Build & Battle Box',
    page: 'Pitch Black Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me05',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me05-116' },
    decks: [
      { key: 'miraidon', name: 'Miraidon', promoId: 'mep-082', energy: 'Basic Lightning Energy', sprites: ['miraidon', 'vikavolt'] },
      { key: 'slowbro', name: 'Slowbro', promoId: 'mep-083', energy: 'Basic Psychic Energy', sprites: ['slowbro', 'silvally'] },
      { key: 'dhelmise', name: 'Dhelmise', promoId: 'mep-084', energy: 'Basic Psychic Energy', sprites: ['dhelmise', 'banette'] },
      { key: 'bastiodon', name: 'Bastiodon', promoId: 'mep-085', energy: 'Basic Metal Energy', sprites: ['bastiodon', 'skarmory'] },
    ],
  }),
]);

export const DEFAULT_BOX_KEY = 'phantasmal-flames';

/** The eras in release order, each with its boxes' keys in release order. */
export const BUILD_BATTLE_ERAS = Object.freeze(
  Object.entries(BUILD_BATTLE_ERA_NAMES).map(([key, name]) =>
    Object.freeze({
      key,
      name,
      boxKeys: Object.freeze(BUILD_BATTLE_BOXES.filter((box) => box.era === key).map((box) => box.key)),
    })
  )
);

export const BASIC_ENERGY_LABELS = [
  'Basic Grass Energy',
  'Basic Fire Energy',
  'Basic Water Energy',
  'Basic Lightning Energy',
  'Basic Psychic Energy',
  'Basic Fighting Energy',
  'Basic Darkness Energy',
  'Basic Metal Energy',
];

/** @returns {object|null} the box with this key, or null for an unknown key. */
export function getBuildBattleBox(key) {
  return BUILD_BATTLE_BOXES.find((box) => box.key === key) || null;
}

/** @returns {object[]} the era's boxes in release order ([] for an unknown era). */
export function boxesForEra(era) {
  return BUILD_BATTLE_BOXES.filter((box) => box.era === era);
}
