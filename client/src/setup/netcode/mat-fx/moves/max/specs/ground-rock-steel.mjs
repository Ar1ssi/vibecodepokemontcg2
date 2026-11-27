// Design 092 § Work plan, group ground-rock-steel: the Max / G-Max Move specs (tier 'S') of Max
// Quake, Max Rockfall, G-Max Volcalith, G-Max Sandblast, Max Steelspike, G-Max Steelsurge and
// G-Max Meltdown. Each spec is its Appendix M entry's board mapping
// (.agent/designs/092-max-move-animations.md), read from its Sword/Shield clip (Poképédia
// `<Nom>_EB.mp4`); the reference brief heads each spec, hexes sampled from the effect itself.
//
// The board's two Active cards stand 1.17 card heights apart, so nothing travels far: what runs
// along the ground in the games (dust, a line of spikes) runs down the lane here, the spikes on
// both flanks of it so they never stand on a card. In a game the TCG Live impact replaces generic
// contact dressing on the struck card (impact-select.mjs: shards, smoke, rings, splash, flashes
// and particle bursts from contact on), so each move's own matter after contact is drawn with
// pillars, clouds, falling stones, auras, terrain and the falling monolith (`monolith`, design 092
// ground-rock-steel), which Rockfall and Volcalith share; the three spike moves share one spike
// frame. Whiteouts, the raid backdrop and the camera cuts are dropped (house rules); a Dynamax
// move's magenta stays local to the struck card.

/** A palette for a beat's tint (design 065 § New pieces A). */
const tint = (deep, body, hot, core) => Object.freeze({ deep, body, hot, core });

const DYNAMAX = tint('#69122C', '#D5229D', '#F97ACE', '#FFE0F2');
const SPARK_GOLD = tint('#9E7138', '#F1DBBE', '#FFF3D6', '#FFFFFF');
const STONE = tint('#3E2E1E', '#7A6545', '#B89A6A', '#E8D8B0');
const EMBER = tint('#6F413B', '#E1561F', '#FFC571', '#FFF0C8');
const FURNACE = tint('#A24356', '#FF8A2A', '#FFD35A', '#FFF3C0');
const SAND = tint('#4D380A', '#A27033', '#D8B070', '#F2E2B8');
const CHROME = tint('#2A2433', '#8E8A99', '#D9D8E0', '#FFFFFF');
const JADE = tint('#1E3A36', '#4F857B', '#8FD0C6', '#E0FFF8');
const MOLTEN = tint('#962165', '#D0567E', '#FFB870', '#FFE8C8');

const spec = (over) => Object.freeze({ tier: 'S', pad: 1.9, grain: 0.1, ...over });

/** A particle burst (design 063 PARTICLE_PARAMS; every key given). */
const burst = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'attacker',
    count: 12,
    distance: 1.0,
    direction: -90,
    spread: 200,
    size: [0.04, 0.08],
    aspect: 0.6,
    gravity: 1.0,
    maxDelay: 0.12,
    durationMs: 760,
    kind: 'shard',
    ...over,
  });

/** The contact flash (the TCG Live impact replaces it in a game). */
const flash = (at, colour) => ({ at, until: at + 170, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.8, tint: colour } });

/** A puff of dust `dx` h along the lane from `target`, hanging and thinning. */
const dust = (at, until, target, dx, over = {}) => ({
  at,
  until,
  layer: 'front',
  drawer: 'cloud',
  params: { target, dx, count: 4, radius: 0.28, drift: 0.05, alpha: 0.45, ...over },
});

// ---- Ground ------------------------------------------------------------------------------

// Max Quake (Sismomax_EB, 7.5 s): the attacker stamps; rocks and gold light streaks burst at its
// feet; a wave of olive dust and rock (magenta Dynamax flecks) runs along the ground to the
// target; magenta energy crackles at its feet; a magenta shock dome erupts round it, gold shafts
// and dark rocks thrown up inside; it fades. Dust #493209 #745D39 · rock #280C04 #9E7138 ·
// energy #D5229D #F97ACE · streaks #F1DBBE.
export const maxQuake = spec({
  id: 'max-quake',
  name: 'Max Quake',
  vgType: 'ground',
  statClass: 'physical',
  family: 'quake',
  material: 'ground',
  durationMs: 2400,
  contactMs: 1050,
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'sink', params: { heat: 0.35 } },
  tint: DYNAMAX,
  beats: [
    { at: 0, until: 420, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'dust', radius: 1.0 } },
    { at: 60, until: 460, layer: 'front', drawer: 'shards', params: { target: 'attacker', count: 8, arc: 150, distance: 0.7, spin: 300 } },
    // The dust wave rolls down the lane onto the struck card.
    dust(200, 700, 'attacker', 0.05),
    dust(330, 830, 'attacker', 0.45),
    dust(460, 960, 'defender', -0.3),
    { at: 680, until: 2000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    // Dynamax energy gathers under it; the shock dome swells round it as the earth heaves.
    { at: 680, until: 1120, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 5, alpha: 0.6, r0: 0.7, r1: 1.0, tint: DYNAMAX } },
    { at: 980, until: 1750, layer: 'front', drawer: 'shade', params: { kind: 'sphere', r: 1.0, fill: 'body', fillAlpha: 0.16, rimAlpha: 1, swirl: 40, tint: DYNAMAX } },
    { at: 1000, until: 1700, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 3, alpha: 0.7, r0: 0.9, r1: 1.25, tint: DYNAMAX } },
    flash(1050, SPARK_GOLD),
    { at: 1050, until: 1650, layer: 'back', drawer: 'pillar', params: { height: 1.6, w: 0.6 } },
    { at: 1050, until: 1900, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.0 } },
    { at: 1050, until: 1600, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.05 } },
    dust(1300, 2300, 'defender', 0, { count: 6, radius: 0.32, alpha: 0.45 }),
  ],
  particles: [burst({ at: 80, count: 10, distance: 0.7, spread: 160 })],
});

// G-Max Sandblast (Enlisement_G-Max_EB, 9 s): Sandaconda coils; a sand plume bursts round it and a
// flat sand wave spreads; olive sand with magenta streaks runs to the target; a sand tornado full
// of rocks swirls up round it; the sand settles into a whirlpool that holds it.
// Sand #4D380A #564617 (shade) · #824C29 #A27033 (lit) · streaks #E03682.
export const gMaxSandblast = spec({
  id: 'g-max-sandblast',
  name: 'G-Max Sandblast',
  vgType: 'ground',
  statClass: 'physical',
  family: 'quake',
  material: 'ground',
  durationMs: 2500,
  contactMs: 1050,
  attacker: { motion: 'coil', params: { glow: 0.6 } },
  defender: { motion: 'sink', params: { heat: 0.3 } },
  tint: SAND,
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'dust', radius: 1.1 } },
    dust(40, 700, 'attacker', 0, { count: 5, radius: 0.3, alpha: 0.5 }),
    dust(300, 800, 'attacker', 0.45),
    dust(430, 930, 'defender', -0.3),
    { at: 680, until: 2300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    { at: 700, until: 1100, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 4, alpha: 0.5, r0: 0.7, r1: 1.0, tint: DYNAMAX } },
    // The sand tornado: rocks whirl up round the card inside a rising column of sand.
    { at: 820, until: 2000, layer: 'front', drawer: 'spiral', params: { turns: 2.5, r0: 0.3, r1: 0.95, rpm: 150, tongues: 10, tint: SAND } },
    dust(860, 2200, 'defender', 0, { count: 8, radius: 0.34, drift: 0.5, alpha: 0.5 }),
    flash(1050, SAND),
    { at: 1050, until: 1550, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.04 } },
    // It settles into a whirlpool of sand round the card.
    { at: 1450, until: 2500, layer: 'back', drawer: 'terrain', params: { kind: 'wave', radius: 1.2, tint: SAND } },
    { at: 1450, until: 2500, layer: 'back', drawer: 'terrain', params: { kind: 'dust', radius: 1.2 } },
  ],
  particles: [burst({ at: 60, count: 12, distance: 0.8, spread: 220 })],
});

// ---- Rock --------------------------------------------------------------------------------

/**
 * The monolith's fall (Max Rockfall, G-Max Volcalith): out of a haze over the struck card a slab of
 * stone drops, slowly then fast, lands at contact and sinks back into the ground; `rubble` stones
 * fall on the card after it and dust hangs. `extra` beats join it.
 */
const stoneFall = (contactMs, rubble, extra = []) => {
  const start = 150;
  const until = contactMs + 450;
  return [
    { at: 0, until: 900, layer: 'back', drawer: 'cloud', params: { target: 'sky', count: 5, radius: 0.45, drift: 0.1, direction: 90, alpha: 0.3 } },
    { at: 300, until: contactMs + 900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    {
      at: start,
      until,
      layer: 'back',
      drawer: 'monolith',
      params: { back: 0.25, w: 0.7, tall: 1.25, drop: 2.5, land: (contactMs - start) / (until - start), hold: 0.08, lean: 6, tint: STONE },
    },
    flash(contactMs, SPARK_GOLD),
    { at: contactMs, until: contactMs + 900, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.2 } },
    { at: contactMs + 80, until: contactMs + 980, layer: 'front', drawer: 'volley', params: { from: 'sky', count: 6, stagger: 100, r0: 0.13, r1: 0.2, bow: 0.4, tongues: 2, tint: rubble } },
    ...extra,
    { at: contactMs, until: contactMs + 550, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.06 } },
    dust(contactMs + 100, contactMs + 1200, 'defender', 0, { count: 6, radius: 0.34, alpha: 0.5 }),
  ];
};

// Max Rockfall (Lithomax_EB, 9.5 s): the attacker raises its arms to a dark vortex; a giant
// olive-brown monolith descends out of the haze, slowly then fast, onto the target; it lands in a
// sheet of white-gold sparks and a burst of rubble and pale dust; rocks rain down, a crater is
// left. Stone #533728 #6D5C43 #9D7D65 · dust #CFB288 · sparks #F1DBBE.
export const maxRockfall = spec({
  id: 'max-rockfall',
  name: 'Max Rockfall',
  vgType: 'rock',
  statClass: 'physical',
  family: 'quake',
  material: 'rock',
  durationMs: 2400,
  contactMs: 1100,
  attacker: { motion: 'channel', params: { glow: 0.5 } },
  defender: { motion: 'sink', params: { heat: 0.3 } },
  tint: STONE,
  beats: stoneFall(1100, STONE),
});

// G-Max Volcalith (Téphra_G-Max_EB, 12 s): Coalossal's furnace glows yellow; the same monolith
// falls on the target and bursts; burning rocks rain round it and lie smouldering, the ground
// glowing, as the smoke clears. Ash rock #6F413B · embers #A24356 #E1561F #FFC571.
export const gMaxVolcalith = spec({
  id: 'g-max-volcalith',
  name: 'G-Max Volcalith',
  vgType: 'rock',
  statClass: 'physical',
  family: 'quake',
  material: 'rock',
  durationMs: 2500,
  contactMs: 1100,
  attacker: { motion: 'channel', params: { glow: 0.8 } },
  defender: { motion: 'sink', params: { heat: 0.45 } },
  tint: EMBER,
  beats: [
    { at: 0, until: 750, layer: 'front', drawer: 'coreCharge', params: { r0: 0.1, r1: 0.3, from: 0.1, tint: FURNACE } },
    ...stoneFall(1100, EMBER, [
      // Burning rocks jut up round the card and the ground under them glows as they smoulder.
      { at: 1220, until: 2100, layer: 'back', drawer: 'pillar', params: { count: 4, spread: 1.6, stagger: 70, height: 0.8, w: 0.22, tint: EMBER } },
      { at: 1200, until: 2450, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 2, alpha: 0.75, r0: 0.85, r1: 1.2, tint: EMBER } },
    ]),
  ],
});

// ---- Steel -------------------------------------------------------------------------------

/**
 * The spike frame (Max Steelspike, G-Max Steelsurge, G-Max Meltdown): a burst of metal at the
 * attacker's feet; spikes erupt in turn down both flanks of the lane, growing toward the struck
 * card; at contact tall spikes burst up round it and short ones flank it, and they break up as the
 * move ends. `metal` is the spikes' palette; `extra` beats join it.
 */
const spikeFrame = (contactMs, metal, extra = []) => {
  const line = [];
  [
    [0.1, 0.6],
    [0.45, 0.64],
    [0.8, 0.68],
  ].forEach(([dx, dy], step) => {
    for (const side of [1, -1]) {
      const at = 220 + step * 150 + (side < 0 ? 70 : 0);
      line.push({ at, until: at + 420, layer: 'back', drawer: 'pillar', params: { target: 'attacker', dx, dy: side * dy, height: 0.8, w: 0.2 + 0.03 * step, tint: metal } });
    }
  });
  return [
    { at: 0, until: 380, layer: 'front', drawer: 'shards', params: { target: 'attacker', count: 8, arc: 300, distance: 0.6, spin: 300, tint: metal } },
    ...line,
    { at: 500, until: contactMs + 1000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    ...extra,
    flash(contactMs, metal),
    { at: contactMs - 110, until: contactMs + 650, layer: 'back', drawer: 'pillar', params: { count: 3, spread: 1.2, stagger: 50, height: 1.4, w: 0.42, tint: metal } },
    { at: contactMs - 60, until: contactMs + 750, layer: 'back', drawer: 'pillar', params: { count: 2, spread: 1.5, stagger: 40, height: 0.8, w: 0.26, tint: metal } },
    { at: contactMs, until: contactMs + 450, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.04 } },
  ];
};

const STEEL_SPARKS = burst({ at: 40, count: 12, distance: 0.8, spread: 300, kind: 'streak', aspect: 0.25, gravity: 0, durationMs: 600 });

// Max Steelspike (Métallomax_EB, 8 s): rainbow-silver sparks burst round the attacker, chrome
// spikes jut at its feet; a line of chrome spikes erupts along the ground to the target under blue
// streaks; giant crossing chrome spikes erupt round it; they shatter into a ring of shards.
// Chrome #22172D #65556B (shade) · #B1AEB9 #E8E9ED (lit).
export const maxSteelspike = spec({
  id: 'max-steelspike',
  name: 'Max Steelspike',
  vgType: 'steel',
  statClass: 'physical',
  family: 'quake',
  material: 'steel',
  durationMs: 2300,
  contactMs: 1000,
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.3 } },
  tint: CHROME,
  beats: spikeFrame(1000, CHROME),
  particles: [STEEL_SPARKS],
});

// G-Max Steelsurge (Percée_G-Max_EB, 5.8 s): Copperajah's spikes in jade-teal metal: a line of
// jade spikes runs to the target, a cluster of crossing jade spikes edged in cyan light erupts
// round it and crumbles into a ring of jade shards. Jade #060B0F #3E5E57 #4F857B #7EBEB6.
export const gMaxSteelsurge = spec({
  id: 'g-max-steelsurge',
  name: 'G-Max Steelsurge',
  vgType: 'steel',
  statClass: 'physical',
  family: 'quake',
  material: 'steel',
  durationMs: 2300,
  contactMs: 1000,
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.3 } },
  tint: JADE,
  beats: spikeFrame(1000, JADE),
  particles: [STEEL_SPARKS],
});

// G-Max Meltdown (Fonte_G-Max_EB, 6.5 s): Melmetal's chrome arms flash; a line of chrome spikes
// runs to the target, which is engulfed in a sphere of molten metal, pink outside and orange
// within; giant chrome spikes erupt through it. Chrome as Steelspike · molten #962165 #C25E7E
// #BF8373 #CEB893.
export const gMaxMeltdown = spec({
  id: 'g-max-meltdown',
  name: 'G-Max Meltdown',
  vgType: 'steel',
  statClass: 'physical',
  family: 'quake',
  material: 'steel',
  durationMs: 2300,
  contactMs: 1050,
  attacker: { motion: 'brace', params: { glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.45 } },
  tint: MOLTEN,
  beats: spikeFrame(1050, CHROME, [
    // The molten sphere swells round the struck card before the spikes break through it.
    { at: 600, until: 1400, layer: 'front', drawer: 'shade', params: { kind: 'sphere', r: 0.85, fill: 'hot', fillAlpha: 0.32, rimAlpha: 1, swirl: 60, tint: MOLTEN } },
    { at: 650, until: 1500, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 2, alpha: 0.7, r0: 0.8, r1: 1.1, tint: MOLTEN } },
  ]),
  particles: [STEEL_SPARKS],
});

export const GROUND_ROCK_STEEL_MAX_SPECS = Object.freeze({
  'max-quake': maxQuake,
  'max-rockfall': maxRockfall,
  'g-max-volcalith': gMaxVolcalith,
  'g-max-sandblast': gMaxSandblast,
  'max-steelspike': maxSteelspike,
  'g-max-steelsurge': gMaxSteelsurge,
  'g-max-meltdown': gMaxMeltdown,
});
