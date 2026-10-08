// Design 063: Ice specs, one per move of the Ice row of the move table. No study notes existed
// for Ice (refs/063-study/notes/g2-water-ice.md stops after Water), so this slice read all nine
// itself (sprite N2B2 + the Scarlet/Violet video, Poképédia; Ice Hammer and Ice Spinner have no
// sprite-era animation); notes in .agent/scratch/moves/ice/g2b-ice.md.
//
// Ice is pale light on the board: straight-edged crystals with a lit facet and a white edge,
// snowflakes, cold mist. Pale ice only reads against something darker, so every move gathers a
// navy vignette round the defender before contact. Physical moves knock the card (weight);
// specials freeze it in place. Either way the struck card is frosted (the ice CSS modifier turns
// the heat sheen cold). The sprite games' dark and storm backdrops, Ice Beam's blue backdrop and
// Blizzard's 3D whiteout become local vignettes and a storm kept round the defender (house rules:
// no backdrop change, no whiteout, one palette). Aurora Beam keeps one palette too: a pastel
// aurora (`aurora` material) instead of the sprite's saturated rainbow.

/** Snowflakes shaken loose by the hit, drifting down slowly. */
const flakes = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 0.9,
    direction: -90,
    spread: 300,
    size: [0.05, 0.09],
    aspect: 1,
    gravity: 0.2,
    maxDelay: 0.15,
    durationMs: 900,
    kind: 'flake',
    ...over,
  });

/** Ice splinters thrown off a shattering hit; they fall. */
const splinters = (over) =>
  flakes({ count: 10, distance: 1.0, spread: 360, size: [0.04, 0.08], aspect: 0.6, gravity: 0.6, maxDelay: 0.1, durationMs: 700, kind: 'shard', ...over });

const spec = (over) => Object.freeze({ vgType: 'ice', material: 'ice', pad: 1.7, grain: 0.1, ...over });

// ---- physical ------------------------------------------------------------------------

export const iceShard = spec({
  id: 'ice-shard',
  name: 'Ice Shard',
  statClass: 'physical',
  tier: 1,
  family: 'punch',
  durationMs: 1000,
  contactMs: 520,
  // Frost mist gathers round the attacker and chunks of ice form in it; it flings them in a
  // quick file down the lane, the last striking at contact, and they shatter on the card.
  attacker: { motion: 'lunge', params: { wind: 0.15, reach: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.22, heat: 0.4 } },
  beats: [
    { at: 0, until: 380, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.25, drift: 0.15, alpha: 0.35 } },
    { at: 0, until: 420, layer: 'back', drawer: 'orbitCharge', params: { count: 3, half: 'back', r0: 0.06, r1: 0.09, tongues: 1, tilt: 0.5 } },
    { at: 0, until: 420, layer: 'front', drawer: 'orbitCharge', params: { count: 3, half: 'front', r0: 0.06, r1: 0.09, tongues: 1, tilt: 0.5 } },
    // Landing at 440, 480 and 520: flight = 240 - 2 x 40 = 160 ms; the last shard lands at contact.
    { at: 280, until: 520, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 40, r0: 0.08, r1: 0.11, bow: 0.15, tongues: 1 } },
    { at: 380, until: 950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.32 } },
    { at: 520, until: 680, layer: 'top', drawer: 'impactFlash', params: { r0: 0.25, r1: 0.75 } },
    // Last at contact: the shards shatter on the card (a punch-family hit).
    { at: 520, until: 800, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.6, spin: 300 } },
  ],
  particles: [splinters({ at: 530, count: 8, distance: 0.8 })],
});

export const avalanche = spec({
  id: 'avalanche',
  name: 'Avalanche',
  statClass: 'physical',
  tier: 2,
  family: 'quake',
  durationMs: 1400,
  contactMs: 700,
  // The attacker rears and stamps; chunks of ice pour down onto the card from above it, the last
  // and heaviest at contact, pressing it down; they burst up and out and a snow cloud piles
  // round its feet as the table jolts.
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'sink', params: { heat: 0.5 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 1, r0: 0.3, r1: 1.0 } },
    { at: 250, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    // Landing at 550, 600, 650 and 700: flight = 320 - 3 x 50 = 170 ms; the last lands at contact.
    { at: 380, until: 700, layer: 'front', drawer: 'volley', params: { from: 'sky', count: 4, stagger: 50, r0: 0.12, r1: 0.16, bow: 0.1, tongues: 1 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r1: 1.1 } },
    { at: 700, until: 1100, layer: 'front', drawer: 'shards', params: { count: 8, arc: 160, distance: 0.9, spin: 360 } },
    { at: 700, until: 1250, layer: 'front', drawer: 'terrain', params: { kind: 'dust', radius: 1.1 } },
    // Last at contact: the fall shakes the table (the family follows it).
    { at: 700, until: 960, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.025 } },
    { at: 900, until: 1400, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.5 } },
  ],
  particles: [splinters({ at: 710, direction: -90, spread: 200 }), flakes({ at: 760, count: 8 })],
});

export const iceHammer = spec({
  id: 'ice-hammer',
  name: 'Ice Hammer',
  statClass: 'physical',
  tier: 3,
  family: 'quake',
  durationMs: 2000,
  contactMs: 1000,
  // Frost rings spread at the attacker's feet as ice gathers round it; it rears up and two great
  // icicles plunge onto the card from above it, tip first, the first at contact; the ice floor
  // cracks, the hammer shatters into splinters and the table jolts. (A pillar from above stood
  // behind the card with only its flat top showing, three slabs rather than a blow.)
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'knock', params: { strength: 0.48, heat: 0.7 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.4, r1: 1.2, width: 0.04 } },
    { at: 300, until: 850, layer: 'back', drawer: 'orbitCharge', params: { count: 4, half: 'back', r0: 0.08, r1: 0.12, tongues: 1, tilt: 0.45 } },
    { at: 300, until: 850, layer: 'front', drawer: 'orbitCharge', params: { count: 4, half: 'front', r0: 0.08, r1: 0.12, tongues: 1, tilt: 0.45 } },
    { at: 650, until: 1850, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    // Landing at 1000 and 1040: flight = 260 - 40 = 220 ms; the first icicle lands at contact.
    { at: 780, until: 1040, layer: 'front', drawer: 'volley', params: { from: 'sky', count: 2, stagger: 40, r0: 0.24, r1: 0.3, bow: 0.15, tongues: 2 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.0 } },
    { at: 1000, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.4 } },
    { at: 1000, until: 1450, layer: 'front', drawer: 'shards', params: { count: 12, distance: 1.3, spin: 540 } },
    // Last at contact: the slam shakes the table.
    { at: 1000, until: 1300, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.035 } },
    { at: 1200, until: 1900, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.7 } },
  ],
  particles: [splinters({ at: 1010, count: 14, distance: 1.3 }), flakes({ at: 1100, count: 10, durationMs: 1000 })],
});

export const iceSpinner = spec({
  id: 'ice-spinner',
  name: 'Ice Spinner',
  statClass: 'physical',
  tier: 3,
  family: 'burst',
  durationMs: 1700,
  contactMs: 880,
  // The attacker spins twice on a ring of ice, crystals whirling round it; a spinning disc of
  // ice skates down the lane into the card, grinds round it in a whirl of crystals and bursts
  // into splinters.
  attacker: { motion: 'spin', params: { turns: 2 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.6 } },
  beats: [
    { at: 0, until: 650, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.4, r1: 1.0 } },
    { at: 0, until: 700, layer: 'back', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.35, r1: 0.8, rpm: 220, tongues: 8 } },
    { at: 0, until: 700, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.4, r1: 0.85, rpm: 220, tongues: 8 } },
    // The disc: a big snowflake turning as it skates; it reaches the card at contact.
    { at: 560, until: 880, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.26, r1: 0.32, bow: 0, tongues: 0 } },
    { at: 700, until: 1600, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    { at: 880, until: 1060, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 880, until: 1400, layer: 'front', drawer: 'spiral', params: { turns: 1.5, r0: 0.3, r1: 0.9, rpm: 240, tongues: 10 } },
    // Last at contact: the disc bursts into splinters.
    { at: 880, until: 1250, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.2, spin: 540 } },
    { at: 1100, until: 1650, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.6 } },
  ],
  particles: [splinters({ at: 890, count: 12, distance: 1.2 }), flakes({ at: 1000, count: 8 })],
});

// ---- special -------------------------------------------------------------------------

export const powderSnow = spec({
  id: 'powder-snow',
  name: 'Powder Snow',
  statClass: 'special',
  tier: 1,
  family: 'wind',
  durationMs: 1050,
  contactMs: 480,
  // A puff of cold mist at the attacker; a stream of snowflakes arcs down the lane, the head
  // reaching the card at contact; a gust of snow wraps it and flakes cling and drift off.
  attacker: { motion: 'brace', params: { rear: 0.08, scale: 1.04, glow: 0.5 } },
  // A light frost (heat 0.18 so it has thawed when the short scene ends).
  defender: { motion: 'freeze', params: { heat: 0.18 } },
  beats: [
    { at: 0, until: 420, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.22, drift: 0.15, alpha: 0.3 } },
    // The stream's head reaches the card 40 % into the beat: 240 + 0.4 x 600 = 480.
    { at: 240, until: 840, layer: 'front', drawer: 'beam', params: { kind: 'pulse-train', w: 0.22, gap: 0.3, speed: 2.5, growIn: 0.4 } },
    { at: 300, until: 1000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 480, until: 620, layer: 'top', drawer: 'impactFlash', params: { r0: 0.25, r1: 0.75 } },
    // Last at contact: the gust of snow (a wind-family hit).
    { at: 480, until: 1000, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.3, drift: 0.2, alpha: 0.4 } },
  ],
  particles: [flakes({ at: 490, count: 10, distance: 0.7, durationMs: 800 })],
});

export const auroraBeam = spec({
  id: 'aurora-beam',
  name: 'Aurora Beam',
  statClass: 'special',
  tier: 2,
  family: 'beam',
  material: 'aurora',
  grain: 0,
  durationMs: 1400,
  contactMs: 700,
  // Halo rings pulse at the attacker's chest as an aurora ring builds at its front; a train of
  // aurora rings (cyan, mint, lilac, breathing) streams down the lane into the card; rings spread
  // round it and frost crystals glint off it.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 0.8 } },
  defender: { motion: 'freeze', params: { heat: 0.3 } },
  beats: [
    { at: 0, until: 450, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.2, r1: 0.7, width: 0.04 } },
    { at: 0, until: 460, layer: 'front', drawer: 'coreCharge', params: { r0: 0.06, r1: 0.22, from: 0.2 } },
    // The train's head reaches the card 40 % into the beat: 420 + 0.4 x 700 = 700.
    { at: 420, until: 1120, layer: 'front', drawer: 'beam', params: { kind: 'pulse-train', w: 0.45, gap: 0.28, speed: 2, growIn: 0.4 } },
    { at: 500, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 700, until: 1250, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.25, r1: 0.9, width: 0.04 } },
    { at: 760, until: 1300, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.7, spin: 240 } },
  ],
  particles: [flakes({ at: 710, count: 12, distance: 1.0, spread: 360, gravity: 0, size: [0.04, 0.08], kind: 'twinkle' })],
});

export const icyWind = spec({
  id: 'icy-wind',
  name: 'Icy Wind',
  statClass: 'special',
  tier: 2,
  family: 'wind',
  durationMs: 1400,
  contactMs: 700,
  // Cold mist billows at the attacker; gusts of snow sweep down the lane on wide curves, the
  // last at contact; crystals whirl round the card behind and in front and a cold fog rolls
  // over it.
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.25, glow: 0.6 } },
  defender: { motion: 'freeze', params: { heat: 0.3 } },
  beats: [
    { at: 0, until: 450, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 5, radius: 0.28, drift: 0.25, alpha: 0.35 } },
    // Landing at 550, 600, 650 and 700: flight = 340 - 3 x 50 = 190 ms; the last gust lands at contact.
    { at: 360, until: 700, layer: 'front', drawer: 'volley', params: { count: 4, stagger: 50, r0: 0.14, r1: 0.2, bow: 0.45, tongues: 0 } },
    { at: 400, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 600, until: 1300, layer: 'back', drawer: 'spiral', params: { turns: 1.5, r0: 0.35, r1: 1.0, rpm: 160, tongues: 8 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
    { at: 700, until: 1300, layer: 'front', drawer: 'spiral', params: { turns: 1.5, r0: 0.3, r1: 0.95, rpm: 200, tongues: 8 } },
    // Last at contact: the fog rolls over the card (a wind-family hit).
    { at: 700, until: 1350, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.32, drift: 0.25, alpha: 0.4 } },
  ],
  particles: [flakes({ at: 710, count: 12, distance: 0.9, spread: 360, gravity: 0.15 })],
});

export const iceBeam = spec({
  id: 'ice-beam',
  name: 'Ice Beam',
  statClass: 'special',
  tier: 3,
  family: 'beam',
  durationMs: 1900,
  contactMs: 1000,
  // Snowflakes circle the attacker as a great flake builds at its front; rings flash off it as
  // it fires a lance of ice down the lane into the card; the floor frosts round the card, ice
  // crystals burst off it and it stands frozen while cold mist rises.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.35, glow: 1 } },
  defender: { motion: 'freeze', params: { heat: 0.8 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', r0: 0.1, r1: 0.14, tongues: 0, tilt: 0.5 } },
    { at: 0, until: 720, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.3, from: 0.25 } },
    { at: 0, until: 700, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', r0: 0.1, r1: 0.14, tongues: 0, tilt: 0.5 } },
    { at: 620, until: 980, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.1 } },
    // The lance's tip reaches the card 40 % into the beat: 760 + 0.4 x 600 = 1000.
    { at: 760, until: 1360, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.28, growIn: 0.4, retract: 0.25 } },
    { at: 850, until: 1800, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.25 } },
    { at: 1000, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.35, r1: 1.3, width: 0.05 } },
    // Just after contact, so the lance carries the family: the crystals burst off the card.
    { at: 1030, until: 1500, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.1, spin: 300 } },
    { at: 1100, until: 1800, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.6 } },
  ],
  particles: [splinters({ at: 1030, count: 12, gravity: 0.4 }), flakes({ at: 1150, count: 10, durationMs: 1000 })],
});

export const blizzard = spec({
  id: 'blizzard',
  name: 'Blizzard',
  statClass: 'special',
  tier: 3,
  family: 'wind',
  durationMs: 2000,
  contactMs: 1000,
  // Cold mist gathers at the attacker; rings flash off it as gusts of snow sweep down
  // the lane; the storm closes round the card (a whirl behind and in front, hail falling, fog
  // rolling over it) and holds it frozen until the snow thins.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 0.9 } },
  defender: { motion: 'freeze', params: { heat: 0.8 } },
  beats: [
    { at: 0, until: 700, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 6, radius: 0.3, drift: 0.2, alpha: 0.35 } },
    { at: 600, until: 950, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.1 } },
    // Landing at 820, 880, 940 and 1000: flight = 350 - 3 x 60 = 170 ms; the last gust lands at contact.
    { at: 650, until: 1000, layer: 'front', drawer: 'volley', params: { count: 4, stagger: 60, r0: 0.16, r1: 0.22, bow: 0.4, tongues: 0 } },
    { at: 800, until: 1900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.5 } },
    { at: 900, until: 1850, layer: 'back', drawer: 'spiral', params: { turns: 2.5, r0: 0.3, r1: 1.15, rpm: 200, tongues: 10 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 1000, until: 1700, layer: 'front', drawer: 'rain', params: { count: 8, height: 1.4, spread: 1.1 } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.35, r1: 1.05, rpm: 240, tongues: 10 } },
    // Last at contact: the fog of the storm (a wind-family hit).
    { at: 1000, until: 1900, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.35, drift: 0.3, alpha: 0.45 } },
  ],
  particles: [flakes({ at: 1010, count: 14, distance: 1.2, spread: 360, gravity: 0.15, maxDelay: 0.3, durationMs: 1100 }), flakes({ at: 1300, count: 10, distance: 0.9 })],
});

export const ICE_SPECS = Object.freeze(
  Object.fromEntries([iceShard, avalanche, iceHammer, iceSpinner, powderSnow, auroraBeam, icyWind, iceBeam, blizzard].map((s) => [s.id, s]))
);
