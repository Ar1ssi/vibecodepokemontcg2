// One row per distinct Special Energy name in out/pkmn-special-energy-cards.json.
// body: what the card can provide at best · pips: the corner symbols (count = Energy provided,
// 'X|Y' = one of those types) · bezel: special (default) / ace / prism · glyph: what it does.
import {
  W,
  B,
  T,
  TH,
  pol,
  poly,
  circ,
  ring,
  line,
  fpath,
  spath,
  pline,
  g,
  rect,
  text,
  arc,
  starPts,
  head,
  sparkle,
  wave,
  heartD,
  shieldD,
} from './lib.mjs';

const range = (n) => [...Array(n).keys()];

// ---- shared motif builders -------------------------------------------------------------
const speedLines = (x, ys, len, w = 3.6) =>
  ys.map(([y, dx = 0]) => line(x + dx, y, x + dx + len, y, w)).join('');

const fannedCards = (angles, pivotY = 74) =>
  angles
    .map((a) =>
      g(
        rect(39.5, 27, 21, 31, 3, W, `stroke="${B}" stroke-width="2"`) +
          rect(
            43.5,
            31,
            13,
            23,
            1.5,
            'none',
            `stroke="${B}" stroke-width="1.3"`
          ),
        `rotate(${a} 50 ${pivotY})`
      )
    )
    .join('');

const laurel = () => {
  let out = '';
  for (const side of [-1, 1]) {
    out += spath(
      side < 0 ? arc(50, 50, 25, 195, 335) : arc(50, 50, 25, 25, 165),
      2.2
    );
    for (let i = 0; i < 6; i++) {
      const a = side < 0 ? 205 + i * 22 : 155 - i * 22;
      const [x, y] = pol(a, 25);
      const tilt = a + (side < 0 ? 40 : -40);
      out += g(
        `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="6.2" fill="${W}"/>`,
        `rotate(${tilt} ${x} ${y})`
      );
    }
  }
  return out;
};

const sword = (fill = W, extra = '') =>
  poly(
    [
      [47.6, 22],
      [50, 16],
      [52.4, 22],
      [52.6, 60],
      [47.4, 60],
    ],
    fill
  ).replace('/>', ` ${extra}/>`) +
  rect(40, 59, 20, 4.4, 2, fill, extra) +
  rect(47.8, 63, 4.4, 10, 1.5, fill, extra) +
  circ(50, 75.5, 3, fill, extra);

const anchor = (cx = 50, cy = 50, s = 1, w = W) =>
  g(
    ring(50, 25, 5, 3.6, w) +
      line(50, 30, 50, 75, 5.2, w) +
      line(38, 38, 62, 38, 4.6, w) +
      spath('M28 58 Q31 75 50 76 Q69 75 72 58', 5, w) +
      poly(
        [
          [23, 62],
          [28, 50],
          [35, 61],
        ],
        w
      ) +
      poly(
        [
          [77, 62],
          [72, 50],
          [65, 61],
        ],
        w
      ),
    `translate(${cx} ${cy}) scale(${s}) translate(-50 -50)`
  );

const twinPeaks = () =>
  poly([
    [20, 74],
    [36, 36],
    [44, 48],
    [50, 42],
    [56, 48],
    [64, 36],
    [80, 74],
  ]);

const plusShape = (cx, cy, arm, thick, fill = W) =>
  rect(cx - thick / 2, cy - arm, thick, arm * 2, thick * 0.22, fill) +
  rect(cx - arm, cy - thick / 2, arm * 2, thick, thick * 0.22, fill);

const spiralPts = (turns, r0, r1) =>
  range(Math.round(turns * 48) + 1).map((i) => {
    const t = i / 48;
    return pol(t * 360, r0 + ((r1 - r0) * i) / (turns * 48));
  });

const fist = (cx, cy, s) => T('fighting', cx, cy, s);

// ---- the catalogue --------------------------------------------------------------------
export const CARDS = [
  // ---------------- Mega Evolution / Scarlet & Violet ----------------
  {
    n: 'Voltaic {L} Energy',
    body: 'lightning',
    pips: ['L'],
    note: 'Bolt in a voltaic arc — +20 damage',
    glyph: () =>
      T('lightning', 50, 50, 0.8) +
      pline(
        [
          [21, 31],
          [29, 35],
          [25, 40],
          [33, 44],
        ],
        3.2
      ) +
      pline(
        [
          [79, 69],
          [71, 65],
          [75, 60],
          [67, 56],
        ],
        3.2
      ) +
      pline(
        [
          [24, 62],
          [31, 61],
          [29, 67],
        ],
        2.6
      ) +
      pline(
        [
          [76, 38],
          [69, 39],
          [71, 33],
        ],
        2.6
      ),
  },
  {
    n: 'Shadowy {D} Energy',
    body: 'darkness',
    pips: ['D'],
    note: 'Darkness symbol casting a shadow — Bench damage immunity',
    glyph: () =>
      g(T('darkness', 44, 45, 0.78), 'translate(0 0)').replace(
        /fill="#fff"/g,
        'fill="#fff" fill-opacity="0.45"'
      ) + TH('darkness', 56, 55, 0.78, 1.14),
  },
  {
    n: 'Nitro {R} Energy',
    body: 'fire',
    pips: ['R'],
    note: 'Nitro canister with a flame — returns to hand when discarded',
    glyph: () =>
      rect(33, 32, 34, 46, 9) +
      rect(43, 22, 14, 12, 2.5) +
      rect(39, 19, 22, 5, 2.5) +
      T('fire', 50, 57, 0.46, true),
  },
  {
    n: 'Magnetic {M} Energy',
    body: 'metal',
    pips: ['M'],
    note: 'Horseshoe magnet around the Metal symbol — no Retreat Cost',
    glyph: () =>
      spath(
        'M31 24 V50 A19 19 0 0 0 69 50 V24',
        11,
        W,
        'stroke-linecap="butt"'
      ) +
      rect(24, 31, 14, 2.6, 0, B) +
      rect(62, 31, 14, 2.6, 0, B) +
      T('metal', 50, 47, 0.4),
  },
  {
    n: 'Bubbly {W} Energy',
    body: 'water',
    pips: ['W'],
    note: 'Water drop rising in bubbles — Special Condition immunity',
    glyph: () =>
      T('water', 45, 55, 0.7) +
      ring(69, 34, 6.5, 2.8) +
      ring(74, 51, 4, 2.4) +
      ring(60, 22.5, 3.6, 2.2),
  },
  {
    n: 'Telepathic {P} Energy',
    body: 'psychic',
    pips: ['P'],
    note: 'Psychic eye broadcasting — calls 2 Basic {P} Pokémon',
    glyph: () =>
      T('psychic', 50, 60, 0.68) +
      [19, 26, 33].map((r) => spath(arc(50, 60, r, -42, 42), 3.4)).join(''),
  },
  {
    n: 'Rocky {F} Energy',
    body: 'fighting',
    pips: ['F'],
    note: 'Fist on a rock bed — blocks attack effects',
    glyph: () =>
      fist(50, 40, 0.62) +
      poly([
        [26, 70],
        [31, 61],
        [38, 64],
        [45, 58],
        [53, 63],
        [60, 58],
        [68, 63],
        [74, 70],
        [64, 78],
        [50, 80],
        [36, 78],
      ]) +
      pline(
        [
          [45, 58],
          [47, 66],
          [43, 75],
        ],
        1.6,
        B
      ) +
      pline(
        [
          [60, 58],
          [62, 64],
          [66, 70],
        ],
        1.4,
        B
      ),
  },
  {
    n: 'Growing {G} Energy',
    body: 'grass',
    pips: ['G'],
    note: 'Seedling sprouting the Grass leaf — +20 HP',
    glyph: () =>
      spath('M48 79 C48 68 50 58 56 48', 4.4) +
      T('grass', 59, 37, 0.5, false, 20) +
      fpath('M48.5 64 C40 65 32 60 29 51 C38 50 46 54 48.5 64Z'),
  },
  {
    n: 'Team Rocket’s Energy',
    body: ['psychic', 'darkness'],
    pips: ['P|D', 'P|D'],
    note: 'Team Rocket R — 2 Energy, {P}/{D}, Team Rocket’s Pokémon only',
    glyph: () =>
      text(
        'R',
        52,
        71,
        58,
        W,
        'transform="skewX(-10)" transform-origin="50 50"'
      ) + sparkle(71, 30, 6),
  },
  {
    n: 'Prism Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Prism splitting light — every type on a Basic',
    glyph: () =>
      poly([
        [48, 25],
        [70, 66],
        [26, 66],
      ]) +
      poly(
        [
          [48, 37],
          [61, 60.5],
          [35, 60.5],
        ],
        B
      ) +
      poly([
        [48, 45],
        [55, 57],
        [41, 57],
      ]) +
      line(18, 52, 36, 47, 3) +
      line(62, 44, 80, 36, 3) +
      line(64, 50, 82, 50, 3) +
      line(64, 56, 80, 64, 3),
  },
  {
    n: 'Ignition Energy',
    body: 'pearl',
    pips: ['C', 'C', 'C'],
    note: 'Power button — {C}{C}{C} for one turn on an Evolution',
    glyph: () => spath(arc(50, 53, 22, 35, 325), 7) + line(50, 23, 50, 50, 7.5),
  },
  {
    n: 'Spiky Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Spiked ball — 2 damage counters back on the attacker',
    glyph: () => poly(starPts(50, 50, 11, 30, 17)) + circ(50, 50, 7, B),
  },
  {
    n: 'Jet Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Jet — switches the Benched Pokémon into the Active Spot',
    glyph: () =>
      g(
        fpath(
          'M50 18 C54 22 55.5 28 55.5 35 L55.5 70 C55.5 75 52.5 78 50 78 C47.5 78 44.5 75 44.5 70 L44.5 35 C44.5 28 46 22 50 18Z'
        ) +
          poly([
            [50, 42],
            [78, 58],
            [78, 64],
            [50, 56],
            [22, 64],
            [22, 58],
          ]) +
          poly([
            [50, 68],
            [63, 77],
            [63, 80],
            [50, 76],
            [37, 80],
            [37, 77],
          ]),
        'rotate(45 50 50)'
      ),
  },
  {
    n: 'Enriching Energy',
    body: 'pearl',
    bezel: 'ace',
    pips: ['C'],
    note: 'Four-card fan — draw 4 when attached',
    glyph: () => fannedCards([-33, -11, 11, 33]),
  },
  {
    n: 'Luminous Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Radiant sun — every type unless another Special is attached',
    glyph: () =>
      circ(50, 50, 11) +
      range(12)
        .map((i) => {
          const a = i * 30;
          const [x1, y1] = pol(a, 16);
          const [x2, y2] = pol(a, i % 2 ? 24 : 29);
          return line(x1, y1, x2, y2, 3.6);
        })
        .join(''),
  },
  {
    n: 'Legacy Energy',
    body: 'rainbow',
    bezel: 'ace',
    pips: ['any'],
    note: 'Laurel wreath — opponent takes 1 fewer Prize, once per game',
    glyph: () => laurel() + poly(starPts(50, 50, 5, 11, 4.6)),
  },
  {
    n: 'Boomerang Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Boomerang — reattaches after an attack discards it',
    glyph: () =>
      fpath(
        'M27 30 C24 46 27 62 37 71 C50 73 63 67 75 58 C77 54 73 51 69 53 C59 58 49 60 42 58 C39 50 39 40 41 31 C42 26 29 24 27 30Z'
      ) +
      spath(arc(50, 50, 25, 10, 62), 3.2) +
      head(...pol(66, 25), 160, 7),
  },
  {
    n: 'Neo Upper Energy',
    body: 'rainbow',
    bezel: 'ace',
    pips: ['any', 'any'],
    note: 'Double chevron up — 2 of every type on a Stage 2',
    glyph: () =>
      pline(
        [
          [28, 52],
          [50, 30],
          [72, 52],
        ],
        9,
        W,
        'miter'
      ) +
      pline(
        [
          [28, 72],
          [50, 50],
          [72, 72],
        ],
        9,
        W,
        'miter'
      ),
  },
  {
    n: 'Mist Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Cloud and fog — blocks attack effects',
    glyph: () =>
      circ(38, 46, 10) +
      circ(52, 39, 13) +
      circ(65, 46, 9.5) +
      rect(30, 44, 42, 12, 6) +
      line(26, 65, 62, 65, 4.6) +
      line(40, 74, 74, 74, 4.6),
  },
  {
    n: 'Double Colorless Energy',
    body: 'pearl',
    pips: ['C', 'C'],
    note: 'Two Colorless stars — {C}{C}',
    glyph: () =>
      T('colorless', 40, 41, 0.62) + TH('colorless', 60, 60, 0.62, 1.28),
  },
  {
    n: 'Reversal Energy',
    body: 'rainbow',
    pips: ['any', 'any', 'any'],
    note: 'U-turn arrow — 3 of every type when behind on Prizes',
    glyph: () =>
      spath(
        'M33 76 V46 A15 15 0 0 1 63 46 V58',
        7.5,
        W,
        'stroke-linecap="butt"'
      ) + head(63, 75, 180, 15),
  },
  {
    n: 'Medical Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Medical cross — heals 30 when attached',
    glyph: () => plusShape(50, 50, 25, 15) + plusShape(50, 50, 20, 4.5, B),
  },
  {
    n: 'Therapeutic Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Lotus — cures Asleep, Confused, Paralyzed',
    glyph: () => {
      const petal = 'M50 66 C42 56 42 42 50 28 C58 42 58 56 50 66Z';
      return (
        [-62, -31, 31, 62]
          .map((a) =>
            g(
              fpath(petal, W, `stroke="${B}" stroke-width="1.6"`),
              `rotate(${a} 50 66) translate(0 ${Math.abs(a) > 40 ? 6 : 2}) scale(1 ${Math.abs(a) > 40 ? 0.82 : 0.95}) `
            )
          )
          .join('') +
        fpath(petal, W, `stroke="${B}" stroke-width="1.6"`) +
        spath('M28 72 Q50 80 72 72', 4)
      );
    },
  },
  {
    n: 'V Guard Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Shield marked V — 30 less damage from Pokémon V',
    glyph: () =>
      fpath(shieldD(50, 50, 1)) +
      poly(
        [
          [35, 31],
          [43.5, 31],
          [50, 52],
          [56.5, 31],
          [65, 31],
          [54.5, 62],
          [45.5, 62],
        ],
        B
      ),
  },
  {
    n: 'Regenerative Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'DNA helix — heals 100 when the Pokémon V evolves',
    glyph: () => {
      const strand = (ph) =>
        range(27).map((i) => [
          50 + 13 * Math.sin((i / 26) * Math.PI * 2.4 + ph),
          23 + i * 2.1,
        ]);
      const rungs = range(9)
        .map((i) => {
          const y = 26 + i * 6.1;
          const t = ((y - 23) / 54.6) * Math.PI * 2.4;
          return line(50 + 13 * Math.sin(t), y, 50 - 13 * Math.sin(t), y, 2.4);
        })
        .join('');
      return rungs + pline(strand(0), 4.6) + pline(strand(Math.PI), 4.6);
    },
  },
  {
    n: 'Gift Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Gift box — draw to 7 when Knocked Out',
    glyph: () =>
      rect(29, 46, 42, 30, 2.5) +
      rect(25, 37, 50, 10, 2.5) +
      rect(46, 37, 8, 39, 0, B) +
      rect(47.8, 37, 4.4, 39, 0) +
      line(25, 47, 75, 47, 1.8, B) +
      ring(41.5, 30, 6.5, 3.4) +
      ring(58.5, 30, 6.5, 3.4) +
      circ(50, 33, 3.6),
  },
  {
    n: 'Double Turbo Energy',
    body: 'pearl',
    pips: ['C', 'C'],
    note: 'Turbine — {C}{C} at 20 less damage',
    glyph: () =>
      ring(50, 50, 27, 3.6) +
      circ(50, 50, 6) +
      range(6)
        .map((i) =>
          g(
            fpath('M50 50 C52 40 59 31 71 27 C68 37 60 46 50 50Z'),
            `rotate(${i * 60} 50 50)`
          )
        )
        .join('') +
      circ(50, 50, 2.4, B),
  },
  {
    n: 'Fusion Strike Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Interlocked rings — Fusion Strike, ignores Abilities',
    glyph: (id) =>
      `<clipPath id="${id}-lo"><rect x="0" y="50" width="100" height="50"/></clipPath><clipPath id="${id}-hi"><rect x="0" y="0" width="100" height="50"/></clipPath>` +
      ring(40, 50, 15, 6.4) +
      `<g clip-path="url(#${id}-lo)">${ring(60, 50, 15, 11, B)}${ring(60, 50, 15, 6.4)}</g>` +
      `<g clip-path="url(#${id}-hi)">${ring(60, 50, 15, 6.4)}${ring(40, 50, 15, 11, B)}${ring(40, 50, 15, 6.4)}</g>`,
  },
  // ---------------- Sword & Shield ----------------
  {
    n: 'Treasure Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Treasure chest — attaches straight from a Prize',
    glyph: () =>
      fpath('M25 47 V40 C25 28 75 28 75 40 V47Z') +
      rect(25, 47, 50, 28, 3) +
      line(23, 47, 77, 47, 2.2, B) +
      line(36, 32, 36, 76, 1.8, B) +
      line(64, 32, 64, 76, 1.8, B) +
      rect(44, 42, 12, 14, 2.4, B) +
      circ(50, 47.5, 2.4) +
      rect(49, 48, 2, 5, 0.8),
  },
  {
    n: 'Spiral Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Spiral — Rapid Strike, no Paralysis or Sleep',
    glyph: () => pline(spiralPts(2.3, 2, 28), 5.2),
  },
  {
    n: 'Lucky Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Four-leaf clover — draw a card when damaged',
    glyph: () =>
      [0, 90, 180, 270]
        .map((a) =>
          g(
            circ(44.5, 33, 7.6) +
              circ(55.5, 33, 7.6) +
              poly([
                [37.5, 35.5],
                [62.5, 35.5],
                [50, 50],
              ]),
            `rotate(${a} 50 50)`
          )
        )
        .join('') +
      [45, 135, 225, 315]
        .map((a) => {
          const [x, y] = pol(a, 24);
          return line(50, 50, x, y, 2, B);
        })
        .join('') +
      spath('M53 56 Q62 66 61 79', 3.6),
  },
  {
    n: 'Impact Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Impact burst — Single Strike, no Poison or Burn',
    glyph: () =>
      poly(
        starPts(50, 50, 9, 30, 14, 8).map((p, i) =>
          i % 4 === 0 ? pol(8 + i * 20, 25) : p
        )
      ) +
      pline(
        [
          [50, 50],
          [56, 41],
          [53, 34],
          [60, 25],
        ],
        2,
        B
      ) +
      pline(
        [
          [50, 50],
          [40, 56],
          [38, 66],
        ],
        2,
        B
      ),
  },
  {
    n: 'Single Strike Energy',
    body: ['fighting', 'darkness'],
    pips: ['F|D'],
    note: 'One fist in a strike diamond — +20 damage',
    glyph: () =>
      g(
        rect(27, 27, 46, 46, 4, 'none', `stroke="${W}" stroke-width="4.6"`),
        'rotate(45 50 50)'
      ) + fist(50, 50, 0.52),
  },
  {
    n: 'Rapid Strike Energy',
    body: ['water', 'fighting'],
    pips: ['W|F', 'W|F'],
    note: 'Rapid double punch — 2 Energy, {W}/{F}',
    glyph: () => fist(39, 41, 0.5) + TH('fighting', 61, 60, 0.5, 1.28),
  },
  {
    n: 'Wash {W} Energy',
    body: 'water',
    pips: ['W'],
    note: 'Drop over washing waves — blocks attack effects',
    glyph: () =>
      T('water', 50, 40, 0.62) +
      spath(wave(24, 76, 66, 4, 4), 3.8) +
      spath(wave(30, 70, 75, 3.4, 4), 3.4),
  },
  {
    n: 'Stone {F} Energy',
    body: 'fighting',
    pips: ['F'],
    note: 'Fist carved into a stone — 20 less damage',
    glyph: () =>
      poly([
        [36, 23],
        [64, 23],
        [78, 39],
        [76, 62],
        [62, 77],
        [38, 77],
        [24, 62],
        [22, 39],
      ]) +
      T('fighting', 50, 50, 0.54, true) +
      line(64, 23, 70, 34, 1.6, B) +
      line(70, 34, 78, 39, 1.6, B),
  },
  {
    n: 'Coating {M} Energy',
    body: 'metal',
    pips: ['M'],
    note: 'Metal symbol sealed in a coat — no Weakness',
    glyph: () =>
      poly(range(6).map((i) => pol(i * 60, 31))) +
      poly(
        range(6).map((i) => pol(i * 60, 26.5)),
        B
      ) +
      T('metal', 50, 50, 0.62),
  },
  {
    n: 'Aromatic {G} Energy',
    body: 'grass',
    pips: ['G'],
    note: 'Leaf giving off aroma — Special Condition immunity',
    glyph: () =>
      T('grass', 46, 58, 0.6) +
      [44, 54, 64]
        .map((x, i) =>
          spath(`M${x} ${38 - i} c-4 -4 4 -7 0 -11 c-4 -4 4 -7 0 -11`, 3)
        )
        .join(''),
  },
  {
    n: 'Capture Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Target reticle — benches a Basic Pokémon from the deck',
    glyph: () =>
      ring(50, 50, 21, 4.4) +
      circ(50, 50, 6.5) +
      [0, 90, 180, 270]
        .map((a) => {
          const [x1, y1] = pol(a, 13);
          const [x2, y2] = pol(a, 30);
          return line(x1, y1, x2, y2, 4.4);
        })
        .join(''),
  },
  {
    n: 'Powerful {C} Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Colorless star bursting with power — +20 damage',
    glyph: () =>
      T('colorless', 50, 50, 0.56) +
      range(8)
        .map((i) => {
          const a = i * 45 + 22.5;
          return poly([pol(a, 31), pol(a - 9, 23), pol(a + 9, 23)]);
        })
        .join(''),
  },
  {
    n: 'Hiding {D} Energy',
    body: 'darkness',
    pips: ['D'],
    note: 'Darkness symbol behind blinds — no Retreat Cost',
    glyph: () =>
      T('darkness', 50, 49, 1.05) +
      [44, 52.5, 61].map((y) => rect(18, y, 64, 2.8, 0, B)).join(''),
  },
  {
    n: 'Heat {R} Energy',
    body: 'fire',
    pips: ['R'],
    note: 'Flame inside a heart — +20 HP',
    glyph: () => fpath(heartD(50, 51, 1)) + T('fire', 50, 47, 0.48, true),
  },
  {
    n: 'Twin Energy',
    body: 'pearl',
    pips: ['C', 'C'],
    note: 'Gemini twins — {C}{C} unless on a V or GX',
    glyph: () =>
      rect(35, 33, 7, 34, 1.5) +
      rect(58, 33, 7, 34, 1.5) +
      spath('M26 27 Q50 40 74 27', 5.4) +
      spath('M26 73 Q50 60 74 73', 5.4),
  },
  {
    n: 'Speed {L} Energy',
    body: 'lightning',
    pips: ['L'],
    note: 'Bolt at speed — draw 2 when attached',
    glyph: () =>
      T('lightning', 57, 50, 0.74, false, 12) +
      speedLines(20, [[40, 2], [50], [60, 2]], 15),
  },
  {
    n: 'Horror {P} Energy',
    body: 'psychic',
    pips: ['P'],
    note: 'Eye in a ring of thorns — 2 counters on the attacker',
    glyph: () =>
      T('psychic', 50, 50, 0.6) +
      range(12)
        .map((i) => {
          const a = i * 30 + 15;
          return poly([pol(a, 31), pol(a - 7, 24), pol(a + 7, 24)]);
        })
        .join(''),
  },
  {
    n: 'Aurora Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Aurora ribbons — every type, discard a card to attach',
    glyph: () =>
      [0, 1, 2]
        .map((i) =>
          spath(
            `M${23 + i * 8} ${74 - i * 2} C${30 + i * 8} ${54} ${44 + i * 8} ${66} ${50 + i * 6} ${44} S${66 + i * 4} ${28} ${72 + i * 2} ${26 + i * 4}`,
            4.4 - i * 0.6
          )
        )
        .join('') + sparkle(30, 32, 6),
  },
  // ---------------- Sun & Moon ----------------
  {
    n: 'Draw Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Card and up arrow — draw a card when attached',
    glyph: () =>
      rect(25, 30, 28, 42, 3.5) +
      rect(
        29.5,
        34.5,
        19,
        33,
        1.8,
        'none',
        `stroke="${B}" stroke-width="1.6"`
      ) +
      line(67, 74, 67, 40, 5.2) +
      head(67, 26, 0, 15),
  },
  {
    n: 'Weakness Guard Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Buckler with ×2 struck off — no Weakness',
    glyph: () =>
      circ(50, 50, 27) +
      ring(50, 50, 22.5, 1.6, B) +
      text('×2', 50, 59.5, 25, B) +
      line(33, 67, 67, 33, 3.4, B),
  },
  {
    n: 'Recycle Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Recycling arrows — returns to hand when discarded',
    glyph: () => {
      const v = [pol(0, 27), pol(120, 27), pol(240, 27)];
      return range(3)
        .map((i) => {
          const [a, b] = [v[i], v[(i + 1) % 3]];
          const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const ang = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
          return line(...p(0.14), ...p(0.66), 6) + head(...p(0.88), ang, 13);
        })
        .join('');
    },
  },
  {
    n: 'Triple Acceleration Energy',
    body: 'pearl',
    pips: ['C', 'C', 'C'],
    note: 'Triple chevron — {C}{C}{C} for one turn',
    glyph: () =>
      [28, 43, 58]
        .map((x) =>
          pline(
            [
              [x, 32],
              [x + 14, 50],
              [x, 68],
            ],
            6,
            W,
            'miter'
          )
        )
        .join(''),
  },
  {
    n: 'Memory Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Clock turning back — attacks of previous Evolutions',
    glyph: () =>
      spath(arc(50, 50, 23, 330, 640), 4.2) +
      head(...pol(318, 23), 245, 11) +
      line(50, 50, 50, 35, 4) +
      line(50, 50, 60, 56, 4),
  },
  {
    n: 'Rainbow Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Rainbow arcs — every type, 1 damage counter on attach',
    glyph: () =>
      [27, 20, 13].map((r) => spath(arc(50, 64, r, -90, 90), 5)).join('') +
      circ(50, 64, 3.6),
  },
  {
    n: 'Unit Energy {F}{D}{Y}',
    body: ['fighting', 'darkness', 'fairy'],
    pips: ['F|D|Y'],
    note: 'Three linked symbols — {F}, {D} or {Y}',
    glyph: () => unit(['fighting', 'darkness', 'fairy']),
  },
  {
    n: 'Beast Energy Prism Star',
    body: 'rainbow',
    bezel: 'prism',
    pips: ['any'],
    note: 'Ultra Beast claw marks — +30 damage',
    glyph: () =>
      [-11, 0, 11]
        .map((dx) =>
          fpath(
            `M${30 + dx} ${74} Q${44 + dx} ${52} ${62 + dx} ${24} Q${50 + dx} ${50} ${36 + dx} ${76}Z`
          )
        )
        .join(''),
  },
  {
    n: 'Unit Energy {L}{P}{M}',
    body: ['lightning', 'psychic', 'metal'],
    pips: ['L|P|M'],
    note: 'Three linked symbols — {L}, {P} or {M}',
    glyph: () => unit(['lightning', 'psychic', 'metal']),
  },
  {
    n: 'Unit Energy {G}{R}{W}',
    body: ['grass', 'fire', 'water'],
    pips: ['G|R|W'],
    note: 'Three linked symbols — {G}, {R} or {W}',
    glyph: () => unit(['grass', 'fire', 'water']),
  },
  {
    n: 'Super Boost Energy Prism Star',
    body: 'rainbow',
    bezel: 'prism',
    pips: ['any', 'any', 'any', 'any'],
    note: 'Rocket — 4 of every type with 3 Stage 2s',
    glyph: () =>
      fpath('M50 18 C60 26 63 41 61 60 H39 C37 41 40 26 50 18Z') +
      circ(50, 38, 5.2, B) +
      poly([
        [39, 48],
        [30, 64],
        [39, 61],
      ]) +
      poly([
        [61, 48],
        [70, 64],
        [61, 61],
      ]) +
      poly([
        [43, 63],
        [57, 63],
        [50, 80],
      ]),
  },
  {
    n: 'Warp Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Warp portal — switches the Active Pokémon out',
    glyph: () =>
      `<ellipse cx="50" cy="56" rx="28" ry="12" fill="none" stroke="${W}" stroke-width="4"/><ellipse cx="50" cy="52" rx="19" ry="8" fill="none" stroke="${W}" stroke-width="3.4"/><ellipse cx="50" cy="49.5" rx="10" ry="4" fill="${W}"/>` +
      sparkle(50, 30, 9),
  },
  {
    n: 'Counter Energy',
    body: 'rainbow',
    pips: ['any', 'any'],
    note: 'Crossed swords — 2 of every type when behind',
    glyph: () =>
      g(sword(), 'rotate(-40 50 50)') +
      g(
        sword(B, `stroke="${B}" stroke-width="4.5" stroke-linejoin="round"`) +
          sword(),
        'rotate(40 50 50)'
      ),
  },
  // ---------------- XY / Black & White ----------------
  {
    n: 'Strong Energy',
    body: 'fighting',
    pips: ['F'],
    note: 'Punching fist with impact lines — +20 damage',
    glyph: () =>
      fist(45, 55, 0.66) +
      [
        [66, 26, 72, 18],
        [72, 33, 81, 30],
        [60, 22, 61, 13],
      ]
        .map(([a, b, c, d]) => line(a, b, c, d, 3.6))
        .join(''),
  },
  {
    n: 'Splash Energy',
    body: 'water',
    pips: ['W'],
    note: 'Drop landing in a splash — back to hand when Knocked Out',
    glyph: () =>
      T('water', 50, 40, 0.6) +
      `<ellipse cx="50" cy="69" rx="20" ry="5.5" fill="none" stroke="${W}" stroke-width="3.6"/>` +
      circ(26, 62, 2.8) +
      circ(74, 62, 2.8) +
      circ(33, 55, 2.2) +
      circ(67, 55, 2.2),
  },
  {
    n: 'Burning Energy',
    body: 'fire',
    pips: ['R'],
    note: 'Flame with a return arc — reattaches when discarded',
    glyph: () =>
      T('fire', 50, 50, 0.6) +
      spath(arc(50, 50, 29, 60, 320), 3.4) +
      head(...pol(328, 29), 58, 9),
  },
  {
    n: 'Flash Energy',
    body: 'lightning',
    pips: ['L'],
    note: 'Bolt in a camera flash — no Weakness',
    glyph: () =>
      `<polygon points="${starPts(50, 50, 12, 31, 23)
        .map((p) => p.join(','))
        .join(
          ' '
        )}" fill="none" stroke="${W}" stroke-width="3" stroke-linejoin="round"/>` +
      T('lightning', 50, 50, 0.6),
  },
  {
    n: 'Dangerous Energy',
    body: 'darkness',
    pips: ['D'],
    note: 'Hazard sign — 2 counters on an attacking EX',
    glyph: () =>
      fpath(
        'M50 21 L79 72 Q80 75 77 75 L23 75 Q20 75 21 72 Z',
        W,
        'stroke-linejoin="round"'
      ) + T('darkness', 50, 58, 0.5, true),
  },
  {
    n: 'Double Dragon Energy',
    body: 'dragon',
    pips: ['any', 'any'],
    note: 'Twin Dragon symbols — 2 of every type on {N}',
    glyph: () => T('dragon', 40, 41, 0.58) + TH('dragon', 60, 60, 0.58, 1.25),
  },
  {
    n: 'Double Magma Energy',
    body: 'fighting',
    pips: ['F', 'F'],
    note: 'Twin-peak volcano — {F}{F} for Team Magma',
    glyph: () =>
      twinPeaks() +
      poly(
        [
          [33, 44],
          [36, 36],
          [39, 44],
        ],
        B
      ) +
      poly(
        [
          [61, 44],
          [64, 36],
          [67, 44],
        ],
        B
      ) +
      circ(36, 26, 3.4) +
      circ(64, 26, 3.4) +
      circ(31, 19.5, 2.2) +
      circ(69, 19.5, 2.2),
  },
  {
    n: 'Double Aqua Energy',
    body: 'water',
    pips: ['W', 'W'],
    note: 'Trident — {W}{W} for Team Aqua',
    glyph: () =>
      line(50, 40, 50, 79, 5.4) +
      line(50, 30, 50, 46, 5.4) +
      poly([
        [44, 31],
        [50, 17],
        [56, 31],
      ]) +
      spath('M33 30 V38 Q33 49 50 49 Q67 49 67 38 V30', 5.4) +
      poly([
        [28, 31],
        [33, 20],
        [38, 31],
      ]) +
      poly([
        [62, 31],
        [67, 20],
        [72, 31],
      ]),
  },
  {
    n: 'Wonder Energy',
    body: 'fairy',
    pips: ['Y'],
    note: 'Fairy symbol among sparkles — blocks attack effects',
    glyph: () =>
      T('fairy', 50, 53, 0.64) +
      sparkle(27, 31, 7) +
      sparkle(73, 28, 5.5) +
      sparkle(74, 70, 4.5),
  },
  {
    n: 'Shield Energy',
    body: 'metal',
    pips: ['M'],
    note: 'Shield frame around Metal — 10 less damage',
    glyph: () =>
      fpath(
        shieldD(50, 50, 1.02),
        'none',
        `stroke="${W}" stroke-width="4.6" stroke-linejoin="round"`
      ) + T('metal', 50, 48, 0.48),
  },
  {
    n: 'Mystery Energy',
    body: 'psychic',
    pips: ['P'],
    note: 'Question mark — Retreat Cost {C}{C} less',
    glyph: () => text('?', 50, 73, 64),
  },
  {
    n: 'Herbal Energy',
    body: 'grass',
    pips: ['G'],
    note: 'Leaf with a healing badge — heals 30 on attach',
    glyph: () =>
      T('grass', 44, 55, 0.62) +
      circ(67, 34, 12.5, B) +
      circ(67, 34, 10.5) +
      plusShape(67, 34, 6.5, 3.6, B),
  },
  {
    n: 'Plasma Energy',
    body: '#2a5fc8',
    pips: ['C'],
    note: 'Plasma globe — Team Plasma',
    glyph: () =>
      ring(50, 50, 27, 3.2) +
      circ(50, 50, 7) +
      [20, 95, 160, 230, 300]
        .map((a, i) =>
          pline(
            [
              [50, 50],
              pol(a, 10),
              pol(a + (i % 2 ? 12 : -12), 16),
              pol(a, 21),
              pol(a + 8, 26),
            ],
            2.2
          )
        )
        .join(''),
  },
  {
    n: 'Blend Energy {W}{L}{F}{M}',
    body: ['water', 'lightning', 'metal', 'fighting'],
    pips: ['W|L|F|M'],
    note: 'Four symbols blended — {W}, {L}, {F} or {M}',
    glyph: () => blend(['water', 'lightning', 'metal', 'fighting']),
  },
  {
    n: 'Blend Energy {G}{R}{P}{D}',
    body: ['grass', 'fire', 'darkness', 'psychic'],
    pips: ['G|R|P|D'],
    note: 'Four symbols blended — {G}, {R}, {P} or {D}',
    glyph: () => blend(['grass', 'fire', 'darkness', 'psychic']),
  },
  // ---------------- HGSS / Platinum / DP ----------------
  {
    n: 'Metal Energy',
    body: 'metal',
    pips: ['M'],
    note: 'Metal symbol in a guard ring — 10 less damage (old special Metal)',
    glyph: () => ring(50, 50, 28.5, 5) + T('metal', 50, 50, 0.66),
  },
  {
    n: 'Darkness Energy',
    body: 'darkness',
    pips: ['D'],
    note: 'Darkness symbol with fangs — +10 damage (old special Darkness)',
    glyph: () =>
      T('darkness', 50, 49, 0.78) +
      [0, 90, 180, 270]
        .map((a) => poly([pol(a + 45, 33), pol(a + 34, 25), pol(a + 56, 25)]))
        .join(''),
  },
  {
    n: 'Rescue Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Life ring — Pokémon returns to hand when Knocked Out',
    glyph: () =>
      ring(50, 50, 21, 12) +
      [45, 135, 225, 315]
        .map((a) => g(rect(47.5, 21, 5, 18, 0, B), `rotate(${a} 50 50)`))
        .join(''),
  },
  {
    n: 'Upper Energy',
    body: 'pearl',
    pips: ['C', 'C'],
    note: 'Staircase — {C}{C} when behind on Prizes',
    glyph: () =>
      poly([
        [25, 74],
        [25, 62],
        [38, 62],
        [38, 50],
        [50, 50],
        [50, 38],
        [62, 38],
        [62, 26],
        [75, 26],
        [75, 74],
      ]),
  },
  {
    n: 'SP Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'SP badge — every type on a Pokémon SP',
    glyph: () => rect(23, 34, 54, 32, 7) + text('SP', 50, 61.5, 27, B),
  },
  {
    n: 'Cyclone Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Cyclone — switches the opponent’s Defending Pokémon',
    glyph: () =>
      [
        [26, 50, 25],
        [33, 44, 21],
        [39, 53, 16],
        [47, 48, 12],
        [55, 52, 8.5],
        [63, 50, 5.5],
        [71, 53, 3],
      ]
        .map(([y, cx, hw]) => line(cx - hw, y, cx + hw, y, 5.6))
        .join(''),
  },
  {
    n: 'Recover Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Capsule — removes Special Conditions on attach',
    glyph: () =>
      g(
        rect(39, 21, 22, 58, 11, 'none', `stroke="${W}" stroke-width="4.4"`) +
          fpath('M39 50 V32 A11 11 0 0 1 61 32 V50Z'),
        'rotate(40 50 50)'
      ),
  },
  {
    n: 'Health Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Heart with a plus — removes 1 damage counter on attach',
    glyph: () => fpath(heartD(50, 51, 1)) + plusShape(50, 47, 10.5, 6, B),
  },
  {
    n: 'Call Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Megaphone — calls 2 Basic Pokémon from the Active Spot',
    glyph: () =>
      poly([
        [30, 42],
        [58, 28],
        [58, 72],
        [30, 58],
      ]) +
      rect(22, 41, 9, 18, 2) +
      rect(36, 57, 7, 13, 2) +
      spath(arc(56, 50, 12, 50, 130), 3.4) +
      spath(arc(56, 50, 19, 55, 125), 3.4),
  },
  {
    n: 'Multi Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Six-way hexagon — every type, {C} beside another Special',
    glyph: () => {
      const v = range(6).map((i) => pol(i * 60 + 30, 28));
      return (
        v
          .map((p, i) => (i % 2 ? '' : poly([[50, 50], p, v[(i + 1) % 6]])))
          .join('') +
        `<polygon points="${v.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${W}" stroke-width="3.2" stroke-linejoin="round"/>`
      );
    },
  },
  // ---------------- EX / e-Card / Neo / Legendary Collection ----------------
  {
    n: 'δ Rainbow Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Delta δ — every type on δ Pokémon',
    glyph: () => text('δ', 50, 72, 64),
  },
  {
    n: 'Boost Energy',
    body: 'pearl',
    pips: ['C', 'C', 'C'],
    note: 'Bold up arrow — {C}{C}{C}, can’t retreat',
    glyph: () =>
      poly([
        [50, 21],
        [76, 49],
        [61, 49],
        [61, 78],
        [39, 78],
        [39, 49],
        [24, 49],
      ]),
  },
  {
    n: 'Double Rainbow Energy',
    body: 'rainbow',
    pips: ['any', 'any'],
    note: 'Twin rainbows — 2 of every type, 10 less damage',
    glyph: () =>
      [36, 64]
        .map(
          (cx, i) =>
            (i
              ? [17, 11.5]
                  .map((r) => spath(arc(cx, 60, r, -90, 90), 7.4, B))
                  .join('')
              : '') +
            [17, 11.5, 6]
              .map((r) => spath(arc(cx, 60, r, -90, 90), 3.6))
              .join('')
        )
        .join('') + line(18, 66, 82, 66, 3),
  },
  {
    n: 'Scramble Energy',
    body: 'rainbow',
    pips: ['any', 'any', 'any'],
    note: 'Shuffle arrows — 3 in any combination when behind',
    glyph: () =>
      spath('M22 36 C42 36 54 64 68 64', 5.2) +
      head(80, 64, 90, 13) +
      spath('M22 64 C42 64 54 36 68 36', 10, B) +
      spath('M22 64 C42 64 54 36 68 36', 5.2) +
      head(80, 36, 90, 13),
  },
  {
    n: 'Holon Energy WP',
    body: ['water', 'psychic'],
    pips: ['C'],
    note: 'Holon δ with {W} and {P} — effect immunity / no Retreat',
    glyph: () => holon('water', 'psychic'),
  },
  {
    n: 'Holon Energy GL',
    body: ['grass', 'lightning'],
    pips: ['C'],
    note: 'Holon δ with {G} and {L} — status immunity / damage up',
    glyph: () => holon('grass', 'lightning'),
  },
  {
    n: 'Holon Energy FF',
    body: ['fire', 'fighting'],
    pips: ['C'],
    note: 'Holon δ with {R} and {F} — no Weakness / less damage',
    glyph: () => holon('fire', 'fighting'),
  },
  {
    n: 'Heal Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Bandage — heals 1 counter and Special Conditions',
    glyph: () =>
      g(
        rect(19, 39, 62, 22, 11) +
          rect(40, 41.5, 20, 17, 2, B) +
          [
            [45, 46],
            [55, 46],
            [45, 54],
            [55, 54],
            [50, 50],
          ]
            .map(([x, y]) => circ(x, y, 1.6))
            .join(''),
        'rotate(-40 50 50)'
      ),
  },
  {
    n: 'Dark Metal Energy',
    body: ['darkness', 'metal'],
    pips: ['D|M'],
    note: 'Metal and Darkness symbols fused — {D} or {M}',
    glyph: () => T('metal', 40, 40, 0.56) + TH('darkness', 61, 60, 0.6, 1.2),
  },
  {
    n: 'React Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Atom — provides {C}',
    glyph: () =>
      [0, 60, 120]
        .map(
          (a) =>
            `<ellipse cx="50" cy="50" rx="28" ry="9.5" fill="none" stroke="${W}" stroke-width="3.2" transform="rotate(${a} 50 50)"/>`
        )
        .join('') + circ(50, 50, 5.5),
  },
  {
    n: 'R Energy',
    body: 'darkness',
    pips: ['D', 'D'],
    note: 'Rocket bomb marked R — {D}{D}, +10 damage',
    glyph: () =>
      circ(47, 56, 22) +
      g(rect(56, 28, 12, 9, 2), 'rotate(40 62 32)') +
      spath('M66 28 Q70 20 76 22', 2.6) +
      sparkle(77, 21, 5.5) +
      text('R', 47, 66, 28, B),
  },
  {
    n: 'Magma Energy',
    body: ['fighting', 'darkness'],
    pips: ['F|D', 'F|D'],
    note: 'Erupting volcano — 2 Energy, {F}/{D}, Team Magma',
    glyph: () =>
      poly([
        [20, 76],
        [42, 40],
        [58, 40],
        [80, 76],
      ]) +
      poly(
        [
          [43, 40],
          [57, 40],
          [53, 47],
          [47, 47],
        ],
        B
      ) +
      circ(50, 31, 4) +
      circ(42, 24, 3) +
      circ(58, 23, 3.2) +
      circ(50, 18, 2.4),
  },
  {
    n: 'Aqua Energy',
    body: ['water', 'darkness'],
    pips: ['W|D', 'W|D'],
    note: 'Anchor — 2 Energy, {W}/{D}, Team Aqua',
    glyph: () => anchor(),
  },
  {
    n: 'Retro Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Rewind — devolves and removes 2 counters',
    glyph: () =>
      poly([
        [49, 30],
        [49, 70],
        [22, 50],
      ]) +
      poly([
        [77, 30],
        [77, 70],
        [50, 50],
      ]),
  },
  {
    n: 'Bounce Energy',
    body: 'pearl',
    pips: ['C', 'C'],
    note: 'Spring — {C}{C}, bounces a basic Energy to hand',
    glyph: () =>
      [72, 64, 56, 48, 40]
        .map(
          (y) =>
            `<ellipse cx="50" cy="${y}" rx="15" ry="4.2" fill="none" stroke="${W}" stroke-width="3.4"/>`
        )
        .join('') +
      rect(32, 74, 36, 5, 2) +
      circ(50, 27, 7.5),
  },
  {
    n: 'Crystal Energy',
    body: 'rainbow',
    pips: ['any'],
    note: 'Crystal cluster — 1 of each attached basic type',
    glyph: () =>
      g(
        poly([
          [50, 34],
          [56, 41],
          [56, 74],
          [44, 74],
          [44, 41],
        ]),
        'rotate(-28 50 74)'
      ) +
      g(
        poly([
          [50, 34],
          [56, 41],
          [56, 74],
          [44, 74],
          [44, 41],
        ]),
        'rotate(28 50 74)'
      ) +
      poly(
        [
          [50, 17],
          [58.5, 27],
          [58.5, 76],
          [41.5, 76],
          [41.5, 27],
        ],
        W
      ) +
      line(50, 22, 50, 74, 1.6, B) +
      line(41.5, 27, 58.5, 27, 1.6, B),
  },
  {
    n: 'Potion Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Spray Potion — removes 1 damage counter on attach',
    glyph: () =>
      rect(35, 42, 30, 36, 6) +
      rect(43, 33, 14, 10, 2) +
      rect(39, 23, 24, 10, 2.5) +
      rect(28, 25, 12, 5, 2) +
      rect(35, 52, 30, 15, 0, B) +
      plusShape(50, 59.5, 5.5, 3.2),
  },
  {
    n: 'Full Heal Energy',
    body: 'pearl',
    pips: ['C'],
    note: 'Flask with a sparkle — clears Special Conditions on attach',
    glyph: () =>
      rect(44, 21, 12, 18, 2) +
      circ(50, 57, 21) +
      rect(41, 19, 18, 5, 2) +
      fpath(wave(31, 69, 56, 3, 4) + ' L69 70 L31 70Z', B) +
      sparkle(43, 46, 4.5, W) +
      sparkle(43, 46, 2.5, W),
  },
  {
    n: 'Miracle Energy',
    body: 'rainbow',
    pips: ['any', 'any'],
    note: 'Shining star — counts as every type, 2 at a time',
    glyph: () =>
      sparkle(50, 50, 30) +
      circ(50, 50, 5, B) +
      sparkle(72, 28, 6) +
      sparkle(28, 72, 5),
  },
];

function unit(types) {
  const at = [0, 120, 240].map((a) => pol(a, 17, 50, 52));
  const bars = at
    .map((p, i) => line(p[0], p[1], at[(i + 1) % 3][0], at[(i + 1) % 3][1], 5))
    .join('');
  return (
    bars +
    types
      .map(
        (t, i) =>
          circ(at[i][0], at[i][1], 12.5) + T(t, at[i][0], at[i][1], 0.33, true)
      )
      .join('')
  );
}

function blend(types) {
  const at = [
    [37, 37],
    [63, 37],
    [63, 63],
    [37, 63],
  ];
  return types
    .map(
      (t, i) =>
        circ(at[i][0], at[i][1], 15.5, B) +
        circ(at[i][0], at[i][1], 13.5) +
        T(t, at[i][0], at[i][1], 0.36, true)
    )
    .join('');
}

function holon(a, b) {
  return (
    text('δ', 50, 55, 44) +
    TH(a, 38, 69, 0.28, 1.35) +
    TH(b, 62, 69, 0.28, 1.35)
  );
}
