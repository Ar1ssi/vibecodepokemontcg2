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
    // Stadium straddles the midline: half on the opponent's half, half on the
    // player's. Bottom = 50% - height/2, so the card centers on the seam, and
    // height matches an in-play card (active-height * 0.84, the iframe/parent
    // mat-height ratio) so it reads the same size as the cards around it.
    stadium: { bottom: '43.28vh', left: '26%', height: '13.44vh' },
    board: { bottom: '61%', left: '66%', width: '24%', height: '30%' },
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
  matFit: 'contain',
  aspectRatio: 1.9394,
  zones: {
    hand: { height: '30%' },
    bench: {
      bottom: '9.2%',
      left: '16.7%',
      width: '65.7%',
      height: '30.9%',
      gap: '1.9%',
    },
    active: { bottom: '66.1%', left: '38%', width: '24%', height: '30.9%' },
    prizes: {
      bottom: '4.5%',
      left: '2.0%',
      width: '13.6%',
      height: '92.4%',
      columns: 2,
    },
    deck: { bottom: '56.6%', right: '2.7%', width: '11.7%', height: '30.9%' },
    discard: { bottom: '11.9%', right: '2.7%', width: '11.7%', height: '30.9%' },
    lostZone: { bottom: '84%', left: '2%', width: '8%', height: '14%' },
    // Straddles the midline: bottom = 100% - height/2 in the half frame, and
    // height matches an in-play card (active-height * 0.84).
    stadium: { bottom: '87.02%', left: '25%', height: '25.96%' },
    // Trainers in play: the open strip between the battle field and the deck.
    board: { bottom: '56.6%', left: '63.5%', width: '20.5%', height: '30.9%' },
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
  matFit: 'contain',
  aspectRatio: 1.91,
  sheetAspectRatio: 1.0,
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
    // Straddles the midline: bottom = 100% - height/2 in the half frame, and
    // height matches an in-play card (active-height * 0.84).
    stadium: { bottom: '89.08%', left: '24%', height: '21.84%' },
    board: { bottom: '72%', left: '63%', width: '20%', height: '26%' },
  },
};

/**
 * Edge-to-edge / zoneless playmat for a single player half. Fits 100% of the half
 * using object-fit: cover, spreading cards in the default simulator layout.
 */
const EDGE_TO_EDGE = {
  id: 'edge-to-edge',
  label: 'Edge-to-edge (one player)',
  matMode: 'one-player',
  matFit: 'cover',
  aspectRatio: 1.9394,
  zones: ONE_PLAYER.zones,
};

/**
 * Edge-to-edge / zoneless playmat spanning both players across the entire table.
 */
const EDGE_TO_EDGE_TWO_PLAYER = {
  id: 'edge-to-edge-two-player',
  label: 'Full-size edge-to-edge (both players)',
  matMode: 'two-player',
  matFit: 'cover',
  aspectRatio: null,
  zones: SIM.zones,
};

export const MAT_LAYOUTS = {
  [SIM.id]: SIM,
  [ONE_PLAYER.id]: ONE_PLAYER,
  [TWO_PLAYER.id]: TWO_PLAYER,
  [EDGE_TO_EDGE.id]: EDGE_TO_EDGE,
  [EDGE_TO_EDGE_TWO_PLAYER.id]: EDGE_TO_EDGE_TWO_PLAYER,
};

export const DEFAULT_MAT_LAYOUT_ID = SIM.id;

/** Profiles in picker order. */
export function listMatLayouts() {
  return [
    SIM,
    ONE_PLAYER,
    TWO_PLAYER,
    EDGE_TO_EDGE,
    EDGE_TO_EDGE_TWO_PLAYER,
  ].map(({ id, label }) => ({ id, label }));
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
  if (/(edge[\s-]?to[\s-]?edge|zoneless|seamless|full[\s-]?bleed)/.test(text)) {
    return /full[\s-]?size|two[\s-]?player|both/.test(text)
      ? EDGE_TO_EDGE_TWO_PLAYER.id
      : EDGE_TO_EDGE.id;
  }
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
  if (mat.layoutProfile && MAT_LAYOUTS[mat.layoutProfile]) {
    return MAT_LAYOUTS[mat.layoutProfile];
  }
  if (
    mat.fit === 'cover' ||
    mat.layout === 'edge-to-edge' ||
    mat.layout === 'edge-to-edge-two-player'
  ) {
    return mat.layout === 'two-player' ||
      /full[\s-]?size|two[\s-]?player/i.test(mat.title)
      ? getMatLayout(EDGE_TO_EDGE_TWO_PLAYER.id)
      : getMatLayout(EDGE_TO_EDGE.id);
  }
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

  const aspect = resolved.aspectRatio ? Number(resolved.aspectRatio) : null;
  const hasAspect = aspect !== null && !Number.isNaN(aspect) && aspect > 0;

  if (hasAspect) {
    put('--mat-aspect', `${aspect} / 1`);
    put(
      '--mat-height',
      'calc(var(--mat-half-height, 100vh) * var(--mat-scale, 1))'
    );
    put(
      '--mat-width',
      `min(var(--mat-container-width, 100%), calc(var(--mat-height) * ${aspect}))`
    );
    put(
      '--mat-offset-x',
      'max(0px, calc((var(--mat-container-width, 100%) - var(--mat-width)) / 2))'
    );
    put(
      '--mat-offset-y',
      'max(0px, calc((var(--mat-half-height, 100vh) - var(--mat-height)) / 2))'
    );
  } else {
    put('--mat-aspect', 'none');
    put('--mat-height', 'var(--mat-half-height, 100vh)');
    put('--mat-width', '100%');
    put('--mat-offset-x', '0px');
    put('--mat-offset-y', '0px');
  }

  if (resolved.sheetAspectRatio) {
    put('--mat-sheet-aspect', `${resolved.sheetAspectRatio} / 1`);
  } else if (hasAspect) {
    put('--mat-sheet-aspect', `${aspect} / 1`);
  } else {
    put('--mat-sheet-aspect', 'none');
  }

  const scaleH = (val) => {
    if (!val || !hasAspect) return val;
    const str = String(val).trim();
    if (str.endsWith('%')) {
      const num = Number.parseFloat(str);
      if (!Number.isNaN(num)) {
        return `calc(var(--mat-width) * ${num / 100})`;
      }
    }
    return val;
  };

  const scaleLeft = (val) => {
    if (!val || !hasAspect) return val;
    const str = String(val).trim();
    if (str.endsWith('%')) {
      const num = Number.parseFloat(str);
      if (!Number.isNaN(num)) {
        return `calc(var(--mat-offset-x) + var(--mat-width) * ${num / 100})`;
      }
    }
    return val;
  };

  const scaleRight = (val) => {
    if (!val || !hasAspect) return val;
    const str = String(val).trim();
    if (str.endsWith('%')) {
      const num = Number.parseFloat(str);
      if (!Number.isNaN(num)) {
        return `calc(var(--mat-offset-x) + var(--mat-width) * ${num / 100})`;
      }
    }
    return val;
  };

  const scaleBottom = (val) => {
    if (!val || !hasAspect) return val;
    const str = String(val).trim();
    if (str.endsWith('%')) {
      const num = Number.parseFloat(str);
      if (!Number.isNaN(num)) {
        return `calc(var(--mat-offset-y, 0px) + var(--mat-height) * ${num / 100})`;
      }
    }
    return val;
  };

  const scaleV = (val) => {
    if (!val || !hasAspect) return val;
    const str = String(val).trim();
    if (str.endsWith('%')) {
      const num = Number.parseFloat(str);
      if (!Number.isNaN(num)) {
        return `calc(var(--mat-height) * ${num / 100})`;
      }
    }
    return val;
  };

  put('--hand-height', zones.hand?.height);

  put('--bench-bottom', scaleBottom(zones.bench?.bottom));
  put('--bench-left', scaleLeft(zones.bench?.left));
  put('--bench-width', scaleH(zones.bench?.width));
  put('--bench-height', scaleV(zones.bench?.height));
  put('--bench-gap', scaleH(zones.bench?.gap));

  put('--active-bottom', scaleBottom(zones.active?.bottom));
  put('--active-left', scaleLeft(zones.active?.left));
  put('--active-width', scaleH(zones.active?.width));
  put('--active-height', scaleV(zones.active?.height));

  put('--prizes-bottom', scaleBottom(zones.prizes?.bottom));
  put('--prizes-left', scaleLeft(zones.prizes?.left));
  put('--prizes-width', scaleH(zones.prizes?.width));
  put('--prizes-height', scaleV(zones.prizes?.height));
  if (zones.prizes?.columns) {
    const columns = Number(zones.prizes.columns);
    put('--prizes-columns', columns);
    put('--prizes-card-max-width', `calc(${100 / columns}% - .1vw)`);
  }

  put('--deck-bottom', scaleBottom(zones.deck?.bottom));
  put('--deck-right', scaleRight(zones.deck?.right));
  put('--deck-width', scaleH(zones.deck?.width));
  put('--deck-height', scaleV(zones.deck?.height));

  put('--discard-bottom', scaleBottom(zones.discard?.bottom));
  put('--discard-right', scaleRight(zones.discard?.right));
  put('--discard-width', scaleH(zones.discard?.width));
  put('--discard-height', scaleV(zones.discard?.height));

  put('--lost-zone-bottom', scaleBottom(zones.lostZone?.bottom));
  put('--lost-zone-left', scaleLeft(zones.lostZone?.left));
  put('--lost-zone-width', scaleH(zones.lostZone?.width));
  put('--lost-zone-height', scaleV(zones.lostZone?.height));

  put('--stadium-bottom', scaleBottom(zones.stadium?.bottom));
  put('--stadium-left', scaleLeft(zones.stadium?.left));
  put('--stadium-height', scaleV(zones.stadium?.height));

  put('--board-bottom', scaleBottom(zones.board?.bottom));
  put('--board-left', scaleLeft(zones.board?.left));
  put('--board-width', scaleH(zones.board?.width));
  put('--board-height', scaleV(zones.board?.height));

  put('--mat-fit', resolved.matFit);

  return vars;
}
