import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  round,
  clamp,
  adjust,
  computePointerFromCenter,
  Spring,
  resolveHoloEffect,
  buildHoloCard,
  startHoloAnimation,
  stopHoloAnimation,
} from '../holo.mjs';

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

  it('adjust maps from input range to output range', () => {
    // 0..100 -> 37..63 (simey background-x)
    assert.equal(adjust(0, 0, 100, 37, 63), 37);
    assert.equal(adjust(50, 0, 100, 37, 63), 50);
    assert.equal(adjust(100, 0, 100, 37, 63), 63);

    // 0..100 -> 33..67 (simey background-y)
    assert.equal(adjust(0, 0, 100, 33, 67), 33);
    assert.equal(adjust(50, 0, 100, 33, 67), 50);
    assert.equal(adjust(100, 0, 100, 33, 67), 67);
  });

  it('computePointerFromCenter calculates 2D Euclidean distance from center (50, 50)', () => {
    // At center: distance is exactly 0
    assert.equal(computePointerFromCenter(50, 50), 0);

    // At edge midpoints: distance is 50/50 = 1.0
    assert.equal(computePointerFromCenter(0, 50), 1);
    assert.equal(computePointerFromCenter(100, 50), 1);
    assert.equal(computePointerFromCenter(50, 0), 1);
    assert.equal(computePointerFromCenter(50, 100), 1);

    // In corners: sqrt(50^2 + 50^2) / 50 > 1, clamped to 1.0
    assert.equal(computePointerFromCenter(0, 0), 1);
    assert.equal(computePointerFromCenter(100, 100), 1);

    // Halfway between center and edge
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
    s.tick(); // build some velocity

    s.set({ x: 200 }, { hard: true });
    assert.equal(s.current.x, 200);
    assert.equal(s.target.x, 200);
    assert.equal(s.velocity.x, 0);
  });
});

describe('resolveHoloEffect', () => {
  it('maps known TCGdex rarities to simey holo datasets', () => {
    assert.equal(resolveHoloEffect({ rarity: 'Holo Rare' }), 'rare holo');
    assert.equal(resolveHoloEffect({ rarity: 'Double rare' }), 'double rare');
    assert.equal(resolveHoloEffect({ rarity: 'Ultra Rare' }), 'ultra rare');
    assert.equal(resolveHoloEffect({ rarity: 'Hyper Rare' }), 'hyper rare');
    assert.equal(resolveHoloEffect({ rarity: 'Special Illustration rare' }), 'special illustration rare');
    assert.equal(resolveHoloEffect({ rarity: 'Illustration rare' }), 'illustration rare');
    assert.equal(resolveHoloEffect({ rarity: 'Reverse Holo' }), 'reverse holo');
    assert.equal(resolveHoloEffect({ rarity: 'Radiant Rare' }), 'radiant rare');
    assert.equal(resolveHoloEffect({ rarity: 'Common' }), null);
  });
});

describe('buildHoloCard', () => {
  it('creates full DOM tree including glare2', () => {
    if (typeof document === 'undefined') {
      const createElement = (tag) => {
        const children = [];
        return {
          tagName: tag.toUpperCase(),
          className: '',
          dataset: {},
          src: '',
          alt: '',
          children,
          appendChild(child) {
            children.push(child);
            return child;
          },
          append(...nodes) {
            nodes.forEach((n) => children.push(n));
          },
          querySelector(sel) {
            const cls = sel.replace('.', '');
            return children.find((c) => c.className === cls) || null;
          },
        };
      };
      global.document = { createElement };
    }

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
});

describe('startHoloAnimation tilt behavior', () => {
  it('does not tilt when tilt is false (defaults to !auto for auto sweeps)', () => {
    let queuedRaf = null;
    global.requestAnimationFrame = (fn) => {
      queuedRaf = fn;
      return 1;
    };
    global.cancelAnimationFrame = () => {
      queuedRaf = null;
    };

    const properties = {};
    const mockCard = {
      style: {
        setProperty(name, value) {
          properties[name] = value;
        },
      },
      querySelector() {
        return null;
      },
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 100, height: 140 };
      },
    };

    startHoloAnimation(mockCard, { auto: true, tilt: false });
    assert.ok(queuedRaf, 'animation tick was queued');
    queuedRaf(1000);

    assert.equal(properties['--rotate-x'], '0.00deg');
    assert.equal(properties['--rotate-y'], '0.00deg');
    // Glare and pointer sweep variables should still be applied
    assert.ok(properties['--pointer-x']);
    assert.ok(properties['--background-x']);

    stopHoloAnimation(mockCard);
  });
});

