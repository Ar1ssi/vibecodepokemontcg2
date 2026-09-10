import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetImage } from '../reset-image.js';

const fakeImage = (overrides = {}) => ({
  style: {},
  dataset: {},
  classList: {
    removed: [],
    remove(...names) {
      this.removed.push(...names);
    },
  },
  ...overrides,
});

describe('resetImage', () => {
  it('restores the original card src and drops the token class for a de-tokenized Energy image', () => {
    const image = fakeImage({
      src: '/src/assets/energy/tokens/fire.png',
      dataset: { energyCardSrc: 'sve-002.png' },
      style: { width: '38px', height: '38px' },
    });

    resetImage(image);

    assert.equal(image.src, 'sve-002.png');
    assert.equal(image.dataset.energyCardSrc, undefined);
    assert.ok(image.classList.removed.includes('energy-token-3d'));
    assert.equal(image.style.width, '');
    assert.equal(image.style.height, '');
  });

  it('is a no-op on the token src/class for an image that was never tokenized', () => {
    const image = fakeImage({ src: 'popplio.png' });

    resetImage(image);

    assert.equal(image.src, 'popplio.png');
  });

  it('still resets normal position/layer state as before', () => {
    const image = fakeImage({ src: 'card.png' });

    resetImage(image);

    assert.equal(image.style.opacity, 1);
    assert.equal(image.style.position, 'relative');
    assert.equal(image.energyLayer, 0);
    assert.equal(image.attached, false);
  });
});
