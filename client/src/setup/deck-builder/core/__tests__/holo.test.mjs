import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  round,
  clamp,
  computePointerFromCenter,
  computeLightVars,
  driftTilt,
  DRIFT,
  cardEraFromImageUrl,
  foilMaskUrl,
  LIGHT,
  MAX_ROTATE_X,
  Spring,
  resolveHoloEffect,
  buildHoloCard,
  startHoloAnimation,
  stopHoloAnimation,
} from '../holo.mjs';

const ORIGIN = 'http://localhost:3000';
const TCGDEX_URL = 'https://assets.tcgdex.net/en/me/me01/077/high.webp';

// Minimal DOM element: style vars, dataset, children, and listener bookkeeping.
const createFakeElement = (tag = 'div') => {
  const children = [];
  const properties = {};
  const listeners = new Map();
  return {
    tagName: tag.toUpperCase(),
    className: '',
    dataset: {},
    src: '',
    alt: '',
    children,
    properties,
    listeners,
    style: {
      setProperty(name, value) {
        properties[name] = value;
      },
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    append(...nodes) {
      nodes.forEach((n) => children.push(n));
    },
    querySelector() {
      return null;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type, event) {
      listeners.get(type)?.forEach((fn) => fn(event));
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 140 };
    },
  };
};

// Drives requestAnimationFrame by hand so tests control time.
let queuedFrame = null;
const runFrame = (now) => {
  const frame = queuedFrame;
  assert.ok(frame, 'an animation frame was queued');
  queuedFrame = null;
  frame(now);
};
const runFrames = (count, startMs = 0, stepMs = 16) => {
  for (let i = 0; i < count; i += 1) runFrame(startMs + i * stepMs);
};

beforeEach(() => {
  queuedFrame = null;
  global.requestAnimationFrame = (fn) => {
    queuedFrame = fn;
    return 1;
  };
  global.cancelAnimationFrame = () => {
    queuedFrame = null;
  };
  global.document = { createElement: createFakeElement };
});

afterEach(() => {
  delete global.matchMedia;
});

describe('holo math helpers (from simeydotme/pokemon-cards-151)', () => {
  it('round formats to specified precision', () => {
    assert.equal(round(1.23456, 2), 1.23);
    assert.equal(round(1.23456, 3), 1.235);
    assert.equal(round(5.0, 1), 5);
  });

  it('clamp limits values to [min, max]', () => {
    assert.equal(clamp(50, 0, 100), 50);
    assert.equal(clamp(-10, 0, 100), 0);
    assert.equal(clamp(150, 0, 100), 100);
    assert.equal(clamp(0.5, 0, 1), 0.5);
    assert.equal(clamp(1.5, 0, 1), 1);
  });

  it('computePointerFromCenter calculates 2D Euclidean distance from center (50, 50)', () => {
    assert.equal(computePointerFromCenter(50, 50), 0);
    assert.equal(computePointerFromCenter(0, 50), 1);
    assert.equal(computePointerFromCenter(100, 50), 1);
    assert.equal(computePointerFromCenter(50, 0), 1);
    assert.equal(computePointerFromCenter(50, 100), 1);
    assert.equal(computePointerFromCenter(0, 0), 1);
    assert.equal(computePointerFromCenter(100, 100), 1);
    assert.equal(computePointerFromCenter(25, 50), 0.5);
    assert.equal(computePointerFromCenter(50, 75), 0.5);
  });
});

describe('Spring simulation', () => {
  it('converges to target value smoothly over ticks', () => {
    const s = new Spring({ x: 0, y: 0 }, { stiffness: 0.066, damping: 0.25 });
    s.set({ x: 50, y: 100 });

    let ticks = 0;
    while (!s.tick() && ticks < 300) {
      ticks += 1;
    }

    assert.ok(ticks > 0, 'Spring should take several ticks to converge');
    assert.ok(ticks < 300, 'Spring should settle within 300 ticks');
    assert.equal(s.current.x, 50);
    assert.equal(s.current.y, 100);
  });

  it('hard set instantly snaps current to target and stops velocity', () => {
    const s = new Spring({ x: 0 }, { stiffness: 0.066, damping: 0.25 });
    s.set({ x: 100 });
    s.tick();

    s.set({ x: 200 }, { hard: true });
    assert.equal(s.current.x, 200);
    assert.equal(s.target.x, 200);
    assert.equal(s.velocity.x, 0);
  });
});

describe('computeLightVars (fixed virtual light)', () => {
  it('puts the highlight at the light origin when the card is flat', () => {
    const light = computeLightVars({ tiltX: 0, tiltY: 0 });
    assert.equal(light.pointerX, LIGHT.originX);
    assert.equal(light.pointerY, LIGHT.originY);
    assert.equal(light.backgroundX, 50);
    assert.equal(light.backgroundY, 50);
    assert.equal(light.tiltAmount, 0);
    assert.equal(light.fromLeft, LIGHT.originX / 100);
    assert.equal(light.fromTop, LIGHT.originY / 100);
  });

  it('moves the highlight and foil pan with the card angle', () => {
    const light = computeLightVars({ tiltX: 1, tiltY: -1 });
    assert.equal(light.pointerX, LIGHT.originX + LIGHT.gainX);
    assert.equal(light.pointerY, LIGHT.originY + LIGHT.gainY);
    assert.equal(light.backgroundX, 50 - LIGHT.panX);
    assert.equal(light.backgroundY, 50 - LIGHT.panY);
    assert.equal(light.tiltAmount, 1);
  });

  it('clamps out-of-range and non-finite tilt', () => {
    assert.deepEqual(
      computeLightVars({ tiltX: 5, tiltY: -5 }),
      computeLightVars({ tiltX: 1, tiltY: -1 })
    );
    assert.deepEqual(
      computeLightVars({ tiltX: NaN, tiltY: Infinity }),
      computeLightVars()
    );
    assert.deepEqual(
      computeLightVars(undefined),
      computeLightVars({ tiltX: 0, tiltY: 0 })
    );
  });
});

describe('driftTilt', () => {
  it('stays within the amplitude and moves on both axes over time', () => {
    const a = driftTilt(0);
    const b = driftTilt(3000);
    assert.notEqual(a.tiltX, b.tiltX);
    assert.notEqual(a.tiltY, b.tiltY);
    for (let t = 0; t < 30000; t += 250) {
      const { tiltX, tiltY } = driftTilt(t);
      assert.ok(Math.abs(tiltX) <= DRIFT.amplitude + 1e-9);
      assert.ok(Math.abs(tiltY) <= DRIFT.amplitude + 1e-9);
    }
  });

  it('treats non-finite time as zero', () => {
    assert.deepEqual(driftTilt(NaN), driftTilt(0));
  });
});

describe('foilMaskUrl', () => {
  it('allows hosts verified to send CORS headers', () => {
    assert.equal(foilMaskUrl(TCGDEX_URL, ORIGIN), TCGDEX_URL);
    assert.equal(
      foilMaskUrl('https://images.pokemontcg.io/sv1/1_hires.png', ORIGIN),
      'https://images.pokemontcg.io/sv1/1_hires.png'
    );
  });

  it('allows same-origin, data: and blob: sources', () => {
    assert.equal(
      foilMaskUrl('/src/assets/card.png', ORIGIN),
      `${ORIGIN}/src/assets/card.png`
    );
    assert.equal(
      foilMaskUrl('data:image/png;base64,AAAA', ORIGIN),
      'data:image/png;base64,AAAA'
    );
    assert.equal(
      foilMaskUrl(`blob:${ORIGIN}/abc`, ORIGIN),
      `blob:${ORIGIN}/abc`
    );
  });

  it('rejects hosts without verified CORS and non-http protocols', () => {
    assert.equal(foilMaskUrl('https://unknown.example/card.png', ORIGIN), null);
    assert.equal(foilMaskUrl('ftp://assets.tcgdex.net/card.png', ORIGIN), null);
    assert.equal(foilMaskUrl('javascript:alert(1)', ORIGIN), null);
  });

  it('rejects empty and non-string input', () => {
    assert.equal(foilMaskUrl('', ORIGIN), null);
    assert.equal(foilMaskUrl(undefined, ORIGIN), null);
    assert.equal(foilMaskUrl(42, ORIGIN), null);
    assert.equal(foilMaskUrl('/relative-without-origin.png', undefined), null);
  });

  it('rejects characters unsafe inside url()', () => {
    assert.equal(foilMaskUrl('https://assets.tcgdex.net/a".png', ORIGIN), null);
    assert.equal(
      foilMaskUrl('https://assets.tcgdex.net/a\\b.png', ORIGIN),
      null
    );
    assert.equal(
      foilMaskUrl('https://assets.tcgdex.net/a b.png', ORIGIN),
      null
    );
    assert.equal(
      foilMaskUrl('https://assets.tcgdex.net/a\n.png', ORIGIN),
      null
    );
  });
});

describe('resolveHoloEffect', () => {
  it('maps known TCGdex rarities to simey holo datasets', () => {
    assert.equal(resolveHoloEffect({ rarity: 'Holo Rare' }), 'rare holo');
    assert.equal(resolveHoloEffect({ rarity: 'Double rare' }), 'double rare');
    assert.equal(resolveHoloEffect({ rarity: 'Ultra Rare' }), 'ultra rare');
    assert.equal(resolveHoloEffect({ rarity: 'Hyper Rare' }), 'hyper rare');
    assert.equal(
      resolveHoloEffect({ rarity: 'Special Illustration rare' }),
      'special illustration rare'
    );
    assert.equal(
      resolveHoloEffect({ rarity: 'Illustration rare' }),
      'illustration rare'
    );
    assert.equal(resolveHoloEffect({ rarity: 'Reverse Holo' }), 'reverse holo');
    assert.equal(resolveHoloEffect({ rarity: 'Radiant Rare' }), 'radiant rare');
    assert.equal(resolveHoloEffect({ rarity: 'Common' }), null);
  });
});

describe('buildHoloCard', () => {
  it('creates full DOM tree including glare2', () => {
    const card = buildHoloCard('https://example.com/card.png', 'rare holo');
    assert.equal(card.className, 'card');
    assert.equal(card.dataset.rarity, 'rare holo');

    const translater = card.children[0];
    assert.equal(translater.className, 'card__translater');

    const rotator = translater.children[0];
    assert.equal(rotator.className, 'card__rotator');

    const classes = rotator.children.map((c) => c.className);
    assert.ok(classes.includes('card__shine'));
    assert.ok(classes.includes('card__glitter'));
    assert.ok(classes.includes('card__glare'));
    assert.ok(classes.includes('card__glare2'));
  });

  it('uses the card image as the ink mask for a CORS-verified host', () => {
    const card = buildHoloCard(TCGDEX_URL, 'hyper rare');
    assert.equal(card.dataset.inkMask, 'true');
    assert.equal(card.properties['--card-ink-mask'], `url("${TCGDEX_URL}")`);
  });

  it('leaves the foil unmasked for an unverified host', () => {
    const card = buildHoloCard(
      'https://unknown.example/card.png',
      'hyper rare'
    );
    assert.equal(card.dataset.inkMask, undefined);
    assert.equal(card.properties['--card-ink-mask'], undefined);
  });
});

describe('startHoloAnimation', () => {
  it('does not tilt when tilt is false (defaults to !auto for auto sweeps)', () => {
    const card = createFakeElement();
    startHoloAnimation(card, { auto: true, tilt: false });
    runFrame(1000);

    assert.equal(card.properties['--rotate-x'], '0.00deg');
    assert.equal(card.properties['--rotate-y'], '0.00deg');
    assert.equal(card.properties['--tilt-amount'], '0.000');
    assert.ok(card.properties['--pointer-x']);
    assert.ok(card.properties['--background-x']);

    stopHoloAnimation(card);
  });

  it('auto drift moves the light on both axes without rotating the card', () => {
    const card = createFakeElement();
    startHoloAnimation(card, { auto: true, tilt: false });
    runFrame(0);
    const first = {
      x: card.properties['--pointer-x'],
      y: card.properties['--pointer-y'],
    };
    runFrame(3000);

    assert.notEqual(card.properties['--pointer-x'], first.x);
    assert.notEqual(card.properties['--pointer-y'], first.y);
    assert.equal(card.properties['--rotate-x'], '0.00deg');
    stopHoloAnimation(card);
  });

  it('reduced motion freezes the board drift', () => {
    global.matchMedia = () => ({ matches: true });
    const card = createFakeElement();
    startHoloAnimation(card, { auto: true, tilt: false });
    runFrame(0);
    const first = card.properties['--pointer-x'];
    runFrame(3000);

    assert.equal(card.properties['--pointer-x'], first);
    assert.equal(first, `${LIGHT.originX.toFixed(2)}%`);
    stopHoloAnimation(card);
  });

  it('interactive pointer movement never moves the light when tilt is off', () => {
    const card = createFakeElement();
    startHoloAnimation(card, { tilt: false });
    card.dispatch('pointermove', { clientX: 0, clientY: 0 });
    runFrames(200);

    // The cursor cannot drive the light without tilt, so it stays on the drift.
    const drifted = computeLightVars(driftTilt(199 * 16));
    assert.equal(
      card.properties['--pointer-x'],
      `${drifted.pointerX.toFixed(2)}%`
    );
    assert.equal(
      card.properties['--pointer-y'],
      `${drifted.pointerY.toFixed(2)}%`
    );
    assert.equal(card.properties['--rotate-x'], '0.00deg');
    stopHoloAnimation(card);
  });

  it('an unhovered interactive card (preview) drifts the light', () => {
    const card = createFakeElement();
    startHoloAnimation(card);
    runFrame(0);
    const first = card.properties['--pointer-x'];
    runFrame(3000);

    assert.notEqual(card.properties['--pointer-x'], first);
    assert.notEqual(card.properties['--background-x'], '50.00%');
    // Drift moves the light only — it never tilts the card.
    assert.equal(card.properties['--rotate-x'], '0.00deg');
    assert.equal(card.properties['--rotate-y'], '0.00deg');
    stopHoloAnimation(card);
  });

  it('the cursor holds the light and the drift resumes once the card is flat', () => {
    const realSetTimeout = global.setTimeout;
    let leaveTimer = null;
    global.setTimeout = (fn) => {
      leaveTimer = fn;
      return 1;
    };
    try {
      const card = createFakeElement();
      startHoloAnimation(card);
      card.dispatch('pointerenter', { clientX: 100, clientY: 70 });
      card.dispatch('pointermove', { clientX: 100, clientY: 70 });
      runFrames(600);

      const held = computeLightVars({ tiltX: -1, tiltY: 0 });
      assert.equal(
        card.properties['--pointer-x'],
        `${held.pointerX.toFixed(2)}%`
      );

      card.dispatch('pointerleave', {});
      assert.ok(leaveTimer, 'leaving arms the spring-back snap');
      leaveTimer();
      // The spring-back is deliberately gentle — run it out so the card is flat
      // again, then the idle drift owns the light (never the flat pose).
      const frames = 300;
      const lastFrame = 700 + (frames - 1) * 16;
      for (let i = 0; i < frames; i += 1) runFrame(700 + i * 16);

      const flat = computeLightVars({ tiltX: 0, tiltY: 0 });
      const drifted = computeLightVars(driftTilt(lastFrame));
      assert.notEqual(drifted.pointerX, flat.pointerX);
      assert.equal(
        card.properties['--pointer-x'],
        `${drifted.pointerX.toFixed(2)}%`
      );
      assert.equal(card.properties['--rotate-x'], '0.00deg');
      stopHoloAnimation(card);
    } finally {
      global.setTimeout = realSetTimeout;
    }
  });

  it('reduced motion stills the interactive drift too', () => {
    global.matchMedia = () => ({ matches: true });
    const card = createFakeElement();
    startHoloAnimation(card);
    runFrame(0);
    const first = card.properties['--pointer-x'];
    runFrame(3000);

    assert.equal(card.properties['--pointer-x'], first);
    assert.equal(first, `${LIGHT.originX.toFixed(2)}%`);
    stopHoloAnimation(card);
  });

  it('interactive light follows card rotation, not cursor position', () => {
    const card = createFakeElement();
    startHoloAnimation(card);
    // Cursor at the card's right edge, vertical center (rect is 100x140).
    card.dispatch('pointermove', { clientX: 100, clientY: 70 });
    runFrames(600);

    const rotateX = parseFloat(card.properties['--rotate-x']);
    assert.ok(
      Math.abs(rotateX + MAX_ROTATE_X) < 0.01,
      `card tilted fully (${rotateX})`
    );
    const expected = computeLightVars({ tiltX: -1, tiltY: 0 });
    assert.equal(
      card.properties['--pointer-x'],
      `${expected.pointerX.toFixed(2)}%`
    );
    assert.notEqual(card.properties['--pointer-x'], '100.00%');
    assert.equal(
      card.properties['--tilt-amount'],
      expected.tiltAmount.toFixed(3)
    );
    stopHoloAnimation(card);
  });

  it('interactive highlight moves away from the cursor side, never toward it', () => {
    const card = createFakeElement();
    startHoloAnimation(card);
    // Cursor at the bottom-right corner (rect is 100x140).
    card.dispatch('pointermove', { clientX: 100, clientY: 140 });
    runFrames(600);

    const highlightX = parseFloat(card.properties['--pointer-x']);
    const highlightY = parseFloat(card.properties['--pointer-y']);
    assert.ok(
      highlightX < LIGHT.originX,
      `highlight x ${highlightX} moved left`
    );
    assert.ok(highlightY < LIGHT.originY, `highlight y ${highlightY} moved up`);
    stopHoloAnimation(card);
  });

  it('restarting replaces the previous loop and its listeners', () => {
    const card = createFakeElement();
    startHoloAnimation(card);
    startHoloAnimation(card);

    assert.equal(card.listeners.get('pointermove').size, 1);
    assert.equal(card.listeners.get('pointerenter').size, 1);
    assert.equal(card.listeners.get('pointerleave').size, 1);
    stopHoloAnimation(card);
    assert.equal(card.listeners.get('pointermove').size, 0);
  });
});

describe('cardEraFromImageUrl', () => {
  it('reads the series from tcgdex URLs', () => {
    const tcgdex = (series, set) =>
      `https://assets.tcgdex.net/en/${series}/${set}/91/high.webp`;
    assert.equal(cardEraFromImageUrl(tcgdex('sv', 'sv01')), 'sv');
    assert.equal(cardEraFromImageUrl(tcgdex('me', 'me02')), 'sv');
    assert.equal(cardEraFromImageUrl(tcgdex('swsh', 'swsh3')), 'swsh');
    assert.equal(cardEraFromImageUrl(tcgdex('sm', 'sm12')), 'sm');
    assert.equal(cardEraFromImageUrl(tcgdex('xy', 'xy5')), 'xy');
    assert.equal(cardEraFromImageUrl(tcgdex('bw', 'bw1')), 'xy');
    assert.equal(cardEraFromImageUrl(tcgdex('hgss', 'hgss1')), 'classic');
  });

  it('reads the set id from pokemontcg.io URLs', () => {
    const ptcgio = (set) => `https://images.pokemontcg.io/${set}/1_hires.png`;
    assert.equal(cardEraFromImageUrl(ptcgio('sv1')), 'sv');
    assert.equal(cardEraFromImageUrl(ptcgio('swsh12pt5')), 'swsh');
    assert.equal(cardEraFromImageUrl(ptcgio('sm115')), 'sm');
    assert.equal(cardEraFromImageUrl(ptcgio('xy12')), 'xy');
    assert.equal(cardEraFromImageUrl(ptcgio('base1')), 'classic');
  });

  it('returns null for unknown hosts, sets and bad input', () => {
    assert.equal(cardEraFromImageUrl('https://example.com/sv/sv1/1.png'), null);
    assert.equal(
      cardEraFromImageUrl('https://images.pokemontcg.io/zz9/1.png'),
      null
    );
    assert.equal(cardEraFromImageUrl('/relative/card.png'), null);
    assert.equal(cardEraFromImageUrl(''), null);
    assert.equal(cardEraFromImageUrl(undefined), null);
  });
});

describe('buildHoloCard card era', () => {
  it('tags the card with the era from its image URL', () => {
    const card = buildHoloCard(TCGDEX_URL, 'reverse holo');
    assert.equal(card.dataset.cardEra, cardEraFromImageUrl(TCGDEX_URL));
    assert.ok(card.dataset.cardEra);
    // TCGDEX_URL is /en/me/me01/077/..., so the set-specific foil can key on it.
    assert.equal(card.dataset.cardSet, 'me01');
  });

  it('leaves the era unset when it is unknown', () => {
    const card = buildHoloCard('https://example.com/card.png', 'reverse holo');
    assert.equal(card.dataset.cardEra, undefined);
  });
});

describe('resolveHoloEffect energy', () => {
  it('gives reverse holo energy its own effect', () => {
    assert.equal(
      resolveHoloEffect({
        rarity: 'Reverse Holo',
        supertype: 'Energy',
        name: 'Grass Energy',
      }),
      'energy reverse holo'
    );
    assert.equal(
      resolveHoloEffect({ rarity: 'Reverse Holo', name: 'Grass Energy' }),
      'energy reverse holo'
    );
  });

  it('leaves non-energy reverse holos and other energy rarities alone', () => {
    assert.equal(
      resolveHoloEffect({ rarity: 'Reverse Holo', name: 'Beedrill' }),
      'reverse holo'
    );
    assert.equal(
      resolveHoloEffect({ rarity: 'Holo Rare', name: 'Grass Energy' }),
      'rare holo'
    );
  });
});

describe('resolveHoloEffect per-generation rarities', () => {
  it('foils old rarities that used to get no effect', () => {
    for (const rarity of ['Full Art Trainer', 'Rare Ultra']) {
      assert.equal(resolveHoloEffect({ rarity }), 'ultra rare', rarity);
    }
    assert.equal(resolveHoloEffect({ rarity: 'Crown' }), 'hyper rare');
  });

  it('gives shiny cards the silver shiny effect instead of gold', () => {
    for (const rarity of ['Shiny Rare', 'Shiny rare', 'Shiny rare VMAX', 'Shiny Ultra Rare', 'Rare Shiny GX', 'Rare Shining']) {
      assert.equal(resolveHoloEffect({ rarity }), 'shiny rare', rarity);
    }
    assert.equal(resolveHoloEffect({ rarity: 'Rare Secret' }), 'hyper rare');
  });

  it('foils rule-box holo rares across the whole card', () => {
    assert.equal(resolveHoloEffect({ rarity: 'Rare Holo', name: 'Eternatus VMAX' }), 'vmax rare');
    for (const name of ['Mewtwo-EX', 'Pikachu GX', 'Zacian V', 'Arceus VSTAR', 'Blaziken ex']) {
      assert.equal(resolveHoloEffect({ rarity: 'Rare Holo', name }), 'double rare', name);
    }
    assert.equal(resolveHoloEffect({ rarity: 'Rare Holo', name: 'Vespiquen' }), 'rare holo');
    assert.equal(resolveHoloEffect({ rarity: 'Reverse Holo', name: 'Zacian V' }), 'reverse holo');
  });
});
