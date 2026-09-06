/**
 * Playmat zone layout profiles.
 *
 * Physical playmats print their own zone boxes (side cards, deck, discard,
 * bench, battle field), and those boxes land in different places depending on
 * the mat family: a full-size mat covers both players and mirrors its zones
 * across the midline, while a one-player mat packs the same zones into a
 * single side. The simulator's own synthetic board agrees with neither.
 *
 * Zone geometry is therefore data instead of hardcoded CSS. Every profile is
 * expressed in the coordinate space of ONE player's half — percentages of the
 * playmat iframe, with `bottom` measured from that player's near edge, which
 * is the same frame the container stylesheets already use. `layoutToCssVars`
 * flattens a profile into the custom properties those stylesheets read, so
 * switching mats is a matter of rewriting a handful of variables.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

/**
 * The simulator's own board: no printed art to line up with, so zones are
 * spread for legibility rather than to match a mat.
 */
const SIM = {
  id: 'sim',
  label: 'Simulator board',
  matMode: 'two-player',
  matFit: '100% 100%',
  zones: {
    hand: { height: '32%' },
    bench: {
      bottom: '34%',
      left: '20%',
      width: '60%',
      height: '28%',
      gap: '0.35vw',
    },
    active: { bottom: '63%', left: '32.5%', width: '35%', height: '32%' },
    prizes: {
      bottom: '35%',
      left: '1%',
      width: '7%',
      height: '46%',
      columns: 2,
    },
    deck: { bottom: '64%', right: '1%', width: '9%', height: '28%' },
    discard: { bottom: '35%', right: '1%', width: '9%', height: '26%' },
    lostZone: { bottom: '84%', left: '1%', width: '7%', height: '15%' },
    stadium: { bottom: '42%', left: '11%', width: '6%', height: '16%' },
  },
};

/**
 * A single-player mat (most Japanese rubber playmats, and the smaller "half"
 * mats). The whole sheet belongs to one player, so the printed zones fill the
 * player's own half: side cards down the left, deck and discard stacked on the
 * right, battle field top-centre, bench across the lower middle.
 */
const ONE_PLAYER = {
  id: 'one-player',
  label: 'One-player mat',
  matMode: 'one-player',
  matFit: '100% 100%',
  zones: {
    hand: { height: '30%' },
    bench: {
      bottom: '30%',
      left: '19%',
      width: '62%',
      height: '28%',
      gap: '0.3vw',
    },
    active: { bottom: '62%', left: '36%', width: '26%', height: '30%' },
    prizes: {
      bottom: '30%',
      left: '2%',
      width: '12%',
      height: '52%',
      columns: 2,
    },
    deck: { bottom: '60%', right: '2%', width: '12%', height: '28%' },
    discard: { bottom: '30%', right: '2%', width: '12%', height: '26%' },
    lostZone: { bottom: '84%', left: '2%', width: '8%', height: '14%' },
    stadium: { bottom: '44%', left: '15%', width: '8%', height: '16%' },
  },
};

/**
 * A full-size mat spanning both players. Each iframe still renders one half,
 * so the geometry below describes the near player's side of the sheet: the
 * side-card block is a wide 2×3 grid hugging the left edge, the battle field
 * sits right against the midline, and the bench is pushed down to the mat's
 * outer edge.
 */
const TWO_PLAYER = {
  id: 'two-player',
  label: 'Full-size mat (both players)',
  matMode: 'two-player',
  matFit: '100% 100%',
  zones: {
    hand: { height: '26%' },
    bench: {
      bottom: '18%',
      left: '20%',
      width: '61%',
      height: '26%',
      gap: '0.3vw',
    },
    active: { bottom: '72%', left: '38%', width: '24%', height: '26%' },
    prizes: {
      bottom: '22%',
      left: '1%',
      width: '17%',
      height: '74%',
      columns: 2,
    },
    deck: { bottom: '47%', right: '2%', width: '14%', height: '26%' },
    discard: { bottom: '18%', right: '2%', width: '14%', height: '26%' },
    lostZone: { bottom: '86%', left: '1%', width: '8%', height: '13%' },
    stadium: { bottom: '50%', left: '20%', width: '9%', height: '17%' },
  },
};

export const MAT_LAYOUTS = {
  [SIM.id]: SIM,
  [ONE_PLAYER.id]: ONE_PLAYER,
  [TWO_PLAYER.id]: TWO_PLAYER,
};

export const DEFAULT_MAT_LAYOUT_ID = SIM.id;

/** Profiles in picker order. */
export function listMatLayouts() {
  return [SIM, ONE_PLAYER, TWO_PLAYER].map(({ id, label }) => ({ id, label }));
}

export function getMatLayout(id) {
  return MAT_LAYOUTS[id] || MAT_LAYOUTS[DEFAULT_MAT_LAYOUT_ID];
}

/**
 * Guess which profile a mat wants from its product title. Only "full size"
 * mats cover both players; everything else in the catalogue is a single
 * player's sheet.
 */
export function classifyMatLayout(title) {
  const text = String(title || '').toLowerCase();
  if (!text) return DEFAULT_MAT_LAYOUT_ID;
  if (/full[\s-]?size/.test(text)) return TWO_PLAYER.id;
  // The English-language "Official Playmat" releases are two-player sheets.
  if (/official\s+playmat/.test(text)) return TWO_PLAYER.id;
  if (/(play\s?mat|playmat|mat)/.test(text)) return ONE_PLAYER.id;
  return DEFAULT_MAT_LAYOUT_ID;
}

/**
 * Pick the profile for a chosen mat. An explicit `layout` on the mat record
 * always wins so a single mat can override its family's guess.
 */
export function resolveMatLayout(mat) {
  if (!mat) return getMatLayout(DEFAULT_MAT_LAYOUT_ID);
  if (typeof mat === 'string') return getMatLayout(mat);
  if (mat.layout && MAT_LAYOUTS[mat.layout]) return MAT_LAYOUTS[mat.layout];
  return getMatLayout(classifyMatLayout(mat.title));
}

/**
 * Flatten a profile into the CSS custom properties the container stylesheets
 * read. Prize columns become a max-width so the prize grid reflows to the
 * number of printed columns instead of always being two wide.
 */
export function layoutToCssVars(layout) {
  const resolved = layout && layout.zones ? layout : getMatLayout(layout);
  const zones = resolved.zones;
  const vars = {};

  const put = (name, value) => {
    if (value !== undefined && value !== null) vars[name] = String(value);
  };

  put('--hand-height', zones.hand?.height);

  put('--bench-bottom', zones.bench?.bottom);
  put('--bench-left', zones.bench?.left);
  put('--bench-width', zones.bench?.width);
  put('--bench-height', zones.bench?.height);
  put('--bench-gap', zones.bench?.gap);

  put('--active-bottom', zones.active?.bottom);
  put('--active-left', zones.active?.left);
  put('--active-width', zones.active?.width);
  put('--active-height', zones.active?.height);

  put('--prizes-bottom', zones.prizes?.bottom);
  put('--prizes-left', zones.prizes?.left);
  put('--prizes-width', zones.prizes?.width);
  put('--prizes-height', zones.prizes?.height);
  if (zones.prizes?.columns) {
    const columns = Number(zones.prizes.columns);
    put('--prizes-columns', columns);
    put('--prizes-card-max-width', `calc(${100 / columns}% - .1vw)`);
  }

  put('--deck-bottom', zones.deck?.bottom);
  put('--deck-right', zones.deck?.right);
  put('--deck-width', zones.deck?.width);
  put('--deck-height', zones.deck?.height);

  put('--discard-bottom', zones.discard?.bottom);
  put('--discard-right', zones.discard?.right);
  put('--discard-width', zones.discard?.width);
  put('--discard-height', zones.discard?.height);

  put('--lost-zone-bottom', zones.lostZone?.bottom);
  put('--lost-zone-left', zones.lostZone?.left);
  put('--lost-zone-width', zones.lostZone?.width);
  put('--lost-zone-height', zones.lostZone?.height);

  put('--stadium-bottom', zones.stadium?.bottom);
  put('--stadium-left', zones.stadium?.left);
  put('--stadium-width', zones.stadium?.width);
  put('--stadium-height', zones.stadium?.height);

  put('--mat-fit', resolved.matFit);

  return vars;
}
