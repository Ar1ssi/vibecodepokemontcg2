// Scarlet & Violet basic energy (SVE) — the modern Standard print used in TCG Live.
// TCGdex omits image URLs for SVE; use Limitless CDN (same source as import.js).

const SVE_IMAGE_BASE =
  'https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/SVE';

/** @type {Record<string, { id: string, file: string, name: string }>} */
const MODERN_BASIC_ENERGY = {
  'Basic Grass Energy': { id: 'sve-001', file: 'SVE_001', name: 'Basic Grass Energy' },
  'Basic Fire Energy': { id: 'sve-002', file: 'SVE_002', name: 'Basic Fire Energy' },
  'Basic Water Energy': { id: 'sve-003', file: 'SVE_003', name: 'Basic Water Energy' },
  'Basic Lightning Energy': { id: 'sve-004', file: 'SVE_004', name: 'Basic Lightning Energy' },
  'Basic Psychic Energy': { id: 'sve-005', file: 'SVE_005', name: 'Basic Psychic Energy' },
  'Basic Fighting Energy': { id: 'sve-006', file: 'SVE_006', name: 'Basic Fighting Energy' },
  'Basic Darkness Energy': { id: 'sve-007', file: 'SVE_007', name: 'Basic Darkness Energy' },
  'Basic {D} Energy': { id: 'sve-007', file: 'SVE_007', name: 'Basic Darkness Energy' },
  'Basic Metal Energy': { id: 'sve-008', file: 'SVE_008', name: 'Basic Metal Energy' },
};

export function buildModernBasicEnergy(label, qty, language = 'EN') {
  const spec = MODERN_BASIC_ENERGY[label];
  if (!spec) {
    throw new Error(`Unknown modern basic energy: ${label}`);
  }
  const image = `${SVE_IMAGE_BASE}/${spec.file}_R_${language}.png`;
  const localId = spec.id.split('-')[1];
  return {
    id: spec.id,
    name: spec.name,
    supertype: 'Energy',
    localId,
    image,
    images: { small: image, large: image },
    set: { id: 'sve', name: 'Scarlet & Violet Energy', releaseDate: '' },
    qty,
  };
}

export function isModernBasicEnergyLabel(label) {
  return Boolean(MODERN_BASIC_ENERGY[label]);
}
