// Design 063: the attack-move spec, verbatim. MOVE_TABLE[vgType][statClass][tierIndex] is the list
// of candidate move slugs for a main-series type, hit class and evolution tier (index 0 = tier 1),
// or null where the spec has no move (N/A). `cellLookup` resolves those through neighbouring cells.

export const STAT_CLASSES = ['physical', 'special'];
export const TIERS = [1, 2, 3];

// Spec order per row: Physical 1, 2, 3 then Special 1, 2, 3. Moves in a cell are separated by
// "," or "/" in the user's table; both mean "any of these".
const SPEC_ROWS = {
  grass: [
    'vine whip',
    'razor leaf',
    'leaf blade',
    'absorb',
    'magical leaf',
    'leaf storm, solar beam, seed flare, petal dance, energy ball',
  ],
  water: [
    'aqua jet',
    'waterfall / liquidation',
    'wave crash / aqua tail',
    'water gun, bubble, whirlpool',
    'octazooka, scald',
    'water pledge, hydro cannon, hydro pump, surf',
  ],
  fire: [
    'flame charge',
    'flame wheel',
    'fire punch',
    'ember',
    'incinerate, mystical fire, lava plume, flame burst',
    'blast burn, overheat, flamethrower',
  ],
  ghost: [
    'lick / astonish',
    'shadow punch',
    'shadow claw / phantom force',
    'night shade',
    'hex, ominous wind',
    'shadow ball',
  ],
  dark: [
    'pursuit',
    'feint attack / bite',
    'night slash / throat chop',
    'N/A',
    'snarl',
    'dark pulse',
  ],
  electric: [
    'nuzzle',
    'thunder fang',
    'wild charge',
    'thunder shock',
    'shock wave',
    'electro shot, thunder, zap cannon',
  ],
  ice: [
    'ice shard',
    'avalanche',
    'ice hammer / ice spinner',
    'powder snow',
    'aurora beam, icy wind',
    'ice beam, blizzard',
  ],
  fighting: [
    'arm thrust',
    'karate chop, low sweep, triple kick',
    'close combat, meteor assault, superpower',
    'vacuum wave',
    'aura sphere',
    'focus blast',
  ],
  poison: [
    'poison sting',
    'poison tail',
    'poison jab / cross poison',
    'acid',
    'sludge, venoshock',
    'sludge bomb, sludge wave',
  ],
  ground: [
    'sand tomb, mud slap',
    'bulldoze, stomping tantrum',
    'earthquake, high horsepower',
    'mud slap',
    'mud shot, mud bomb',
    'earth power',
  ],
  flying: [
    'peck',
    'aerial ace / wing attack',
    'brave bird',
    'gust',
    'air cutter',
    'hurricane, aeroblast',
  ],
  psychic: [
    'N/A',
    'zen headbutt, psycho cut',
    'N/A',
    'confusion',
    'psybeam',
    'psychic, future sight',
  ],
  bug: [
    'fell stinger, fury cutter, pin missile, twineedle',
    'x-scissor, lunge',
    'megahorn',
    'infestation',
    'struggle bug, silver wind, signal beam',
    'bug buzz',
  ],
  rock: [
    'smack down, rock throw, rock blast',
    'rock slide, rock tomb',
    'head smash, stone edge, rock wrecker',
    'N/A',
    'ancient power',
    'power gem',
  ],
  dragon: [
    'N/A',
    'dual chop, dragon claw',
    'outrage',
    'twister',
    'dragon breath',
    'dragon pulse, draco meteor',
  ],
  steel: [
    'bullet punch, metal claw',
    'smart strike, steel wing',
    'iron tail, iron head',
    'N/A',
    'flash cannon',
    'steel beam',
  ],
  fairy: [
    'N/A',
    'spirit break',
    'play rough',
    'disarming voice, fairy wind',
    'draining kiss, dazzling gleam',
    'moonblast',
  ],
};

const slug = (name) => name.trim().replace(/\s+/g, '-');

const parseCell = (text) =>
  text === 'N/A' ? null : text.split(/\s*[,/]\s*/).map(slug);

const buildTable = (rows) =>
  Object.fromEntries(
    Object.entries(rows).map(([vgType, cells]) => [
      vgType,
      {
        physical: cells.slice(0, 3).map(parseCell),
        special: cells.slice(3, 6).map(parseCell),
      },
    ])
  );

export const MOVE_TABLE = Object.freeze(buildTable(SPEC_ROWS));

export const VG_TYPES = Object.freeze(Object.keys(MOVE_TABLE));

/** Every distinct move slug in the table. */
export const ALL_MOVES = Object.freeze([
  ...new Set(
    VG_TYPES.flatMap((vgType) =>
      STAT_CLASSES.flatMap((statClass) =>
        MOVE_TABLE[vgType][statClass].flatMap((cell) => cell ?? [])
      )
    )
  ),
]);

const otherClass = (statClass) =>
  statClass === 'physical' ? 'special' : 'physical';

// Tier visiting order for an N/A cell: its own tier, then lower tiers down to 1, then higher ones.
const tierOrder = (tier) => {
  const lower = [];
  for (let t = tier - 1; t >= 1; t -= 1) lower.push(t);
  const higher = [];
  for (let t = tier + 1; t <= TIERS.length; t += 1) higher.push(t);
  return [tier, ...lower, ...higher];
};

/**
 * Candidate moves for a cell, walking the design's N/A order: same tier other class, then each
 * lower tier (same class, other class), then each higher tier. Null for an unknown type.
 * @returns {string[] | null}
 */
export function cellLookup(vgType, statClass, tier) {
  const rows = MOVE_TABLE[vgType];
  if (!rows || !STAT_CLASSES.includes(statClass)) return null;
  const clamped = Math.min(Math.max(Math.trunc(tier) || 1, 1), TIERS.length);
  for (const t of tierOrder(clamped)) {
    for (const cls of [statClass, otherClass(statClass)]) {
      const cell = rows[cls][t - 1];
      if (cell?.length) return cell;
    }
  }
  return null;
}
