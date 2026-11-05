// Pokémon whose forms play as different Pokémon although every card prints the same name.
//
// Zygarde (user request 2026-11-05, homebrew line made in cardback): 10% Forme is a Basic, 50% Forme a Stage 1
// and Complete Forme a Stage 2, each later one "Evolves from Zygarde"; Mega Zygarde ex, edited as the homebrew
// MEGA stage (MEGAHB), evolves from Complete Forme. Evolution keeps the name check and adds this one: the Pokémon
// evolved onto must be the form one step below (two for Rare Candy). The deck limit counts each form apart.
//
// A card's form comes from its Pokédex entry (TCGdex `description`): every form has its own entries in the games
// and the prints carry them — sm6-71 "...when about 10% of its cells have been gathered...", sm3-100 / smp-SM15
// Complete Forme "...uses its overwhelming power to suppress...", swsh4-93 "Born when all of Zygarde's cells...";
// any other Zygarde entry is a 50% Forme one (sm6-72, xy10-52, swsh7-118). A Mega is told by its name. A card with
// neither (Zygarde-EX/-GX, or an entry that never arrived) takes the form its stage stands for.

const FORM_LINES = {
  zygarde: {
    forms: [
      { key: 'zygarde-10', label: '10% Forme', entries: ['10%'] },
      { key: 'zygarde-50', label: '50% Forme', entries: [] },
      {
        key: 'zygarde-complete',
        label: 'Complete Forme',
        entries: ['perfected form', "all of zygarde's cells", 'overwhelming power to suppress'],
      },
      { key: 'zygarde-mega', label: 'Mega', entries: [], prefix: 'mega' },
    ],
    // the form an entry with none of the words above shows
    fallback: 1,
  },
};

// Stage → the form index it stands for when a card carries no form of its own (and the stage rank for Rare Candy).
const STAGE_RANK = { basic: 0, stage1: 1, stage2: 2, megahb: 3 };

/** "Mega Zygarde ex", "Zygarde-GX", "Zygarde" → "zygarde". */
export function formSpecies(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^mega\s+/, '')
    .replace(/[\s-]+(?:ex|gx|v|vmax|vstar)$/, '')
    .replace(/[^a-z0-9]/g, '');
}

function lineOf(name) {
  return FORM_LINES[formSpecies(name)] || null;
}

function stageRank(stage) {
  const rank = STAGE_RANK[String(stage || '').toLowerCase().replace(/[^a-z0-9]/g, '')];
  return rank ?? null;
}

function indexFromEntry(line, description) {
  const text = String(description || '').replace(/’/g, "'").toLowerCase();
  if (!text.trim()) return null;
  const hit = line.forms.findIndex((form) => form.entries.some((word) => text.includes(word)));
  return hit >= 0 ? hit : line.fallback;
}

function indexFromName(line, name) {
  const words = String(name || '').trim().toLowerCase();
  const hit = line.forms.findIndex((form) => form.prefix && words.startsWith(`${form.prefix} `));
  return hit >= 0 ? hit : null;
}

/**
 * The form key a card record shows, from its name and Pokédex entry (`description`); null when the card is not
 * one of FORM_LINES or neither tells. Stored on enriched cards as `form`.
 * @param {{name?: string, description?: string}} detail
 */
export function pokemonFormKey(detail) {
  const line = lineOf(detail?.name);
  if (!line) return null;
  const index = indexFromName(line, detail.name) ?? indexFromEntry(line, detail.description);
  return index == null ? null : line.forms[index].key;
}

/** Index in its line of the form a card shows: its name, its `form`, its entry, else its stage; null if unknown. */
function formIndex(line, card) {
  const byName = indexFromName(line, card?.name);
  if (byName != null) return byName;
  const byKey = line.forms.findIndex((form) => form.key === card?.form);
  if (byKey >= 0) return byKey;
  const byEntry = indexFromEntry(line, card?.description);
  if (byEntry != null) return byEntry;
  const rank = stageRank(card?.stage);
  return rank != null && rank < line.forms.length ? rank : null;
}

// Zygarde-EX / Zygarde-GX: a rule-box Pokémon of the same species, never a form of the line.
const RULE_BOX_SUFFIX = /[s-](?:ex|gx|v|vmax|vstar)$/i;

/**
 * Whether `evolution` may go onto `target` as far as forms go (the name and stage checks are the caller's):
 * the form one below its own, two below with Rare Candy (`rareCandy`, which skips a stage). Pokémon outside
 * FORM_LINES, or a pair whose forms cannot be told, always may.
 * @param {object} evolution
 * @param {object} target the Pokémon in play (its top card)
 * @param {{rareCandy?: boolean}} [options]
 */
export function formsAllowEvolution(evolution, target, { rareCandy = false } = {}) {
  const line = lineOf(evolution?.name);
  if (!line || formSpecies(target?.name) !== formSpecies(evolution?.name)) return true;
  if (indexFromName(line, target?.name) == null && RULE_BOX_SUFFIX.test(String(target?.name || '').trim())) {
    return false;
  }
  const own = formIndex(line, evolution);
  const onto = formIndex(line, target);
  if (own == null || onto == null) return true;
  return onto === own - (rareCandy ? 2 : 1);
}

/** Why formsAllowEvolution refused, for the player. */
export function formMismatchReason(evolution, target) {
  const line = lineOf(evolution?.name);
  const onto = line ? formIndex(line, target) : null;
  const ontoLabel = onto == null ? '' : ` (${line.forms[onto].label})`;
  return `${evolution?.name} can't evolve from this ${target?.name}${ontoLabel}: the forms do not follow on.`;
}

/**
 * The deck-limit name of a card: "Zygarde (10% Forme)" for a form of FORM_LINES, else the name unchanged.
 * @param {string} officialName the name the copy limit already counts by
 * @param {object} card the card record (name, form, description, stage)
 */
export function formDeckName(officialName, card) {
  const line = lineOf(card?.name);
  // Only the plain name is shared: "Mega Zygarde ex" and "Zygarde-EX" already count apart.
  const plain = String(officialName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!line || plain !== formSpecies(card?.name)) return officialName;
  const index = formIndex(line, card);
  return index == null ? officialName : `${officialName} (${line.forms[index].label})`;
}
