export const resetImage = (image, zoneId = '') => {
  // hydrateHolo() takes a one-time px snapshot of the wrapper's width/height
  // at hydration time (board sizing, possibly inflated by energyLayer
  // stacking). Off the board, each zone has its own `.mat-holo` CSS sizing
  // rule — clear the inline snapshot so that rule wins instead of a stale
  // board-size px value following the card around.
  if (!['active', 'bench'].includes(zoneId)) {
    const wrapper = image.closest?.('.mat-holo');
    if (wrapper) {
      wrapper.style.width = '';
      wrapper.style.height = '';
    }
  }
  if (image.dataset?.energyCardSrc) {
    image.src = image.dataset.energyCardSrc;
    delete image.dataset.energyCardSrc;
    image.classList.remove('energy-token-3d');
    image.style.width = '';
    image.style.height = '';
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
