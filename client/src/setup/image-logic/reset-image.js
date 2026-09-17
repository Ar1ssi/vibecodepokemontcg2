export const resetImage = (image, zoneId = '') => {
  if (!['active', 'bench'].includes(zoneId)) {
    // Board zones (active/bench) size cards via inline px snapshots (energy
    // stacking, evolve/attach layering). Leaving those on an <img> that
    // returns to a non-board zone overrides that zone's own CSS sizing.
    image.style.width = '';
    image.style.height = '';
    // Evolving/attaching (evolve-card.js, attach-card.js, decrease-card-layer.js)
    // also stamps an inline px width on the stack's play-container to fit the
    // widest attached card. That container is reused by whatever card ends up
    // there next — clear it too, or a card that inherits this slot after an
    // evolution/attachment chain keeps the old stack's inflated width.
    const container = image.parentElement?.closest?.('.play-container');
    if (container) {
      container.style.width = '';
      container.style.height = '';
    }
  }
  if (image.dataset?.energyCardSrc) {
    image.src = image.dataset.energyCardSrc;
    delete image.dataset.energyCardSrc;
    image.classList.remove('energy-token-3d');
  }
  image.style.opacity = 1;
  image.style.position = 'relative';
  image.style.bottom = '0%';
  image.style.zIndex = '0';
  image.energyLayer = 0;
  image.layer = 0;
  image.relative = 0;
  image.style.left = 0;
  image.attached = false;
  image.target = 'off';
  if (image.PokémonBreak && ['active', 'bench'].includes(zoneId)) {
    image.style.transform = 'rotate(90deg)';
  } else {
    image.style.transform = 'rotate(0deg)';
    image.PokémonBreak = false;
  }
  image.classList.remove(
    'default-rotation',
    'prizes-normal-size',
    'prizes-small-size'
  );
};
