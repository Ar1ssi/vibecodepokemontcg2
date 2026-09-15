import { flipBoard } from '../../../actions/general/flip-board.js';
import { flipCoin } from '../../../actions/general/flip-coin.js';
import { systemState } from '../../../state.js';
import { refreshBoardImages } from '../../../setup/sizing/refresh-board.js';

// Lets the player drag the Pass/Coin/Flip/Refresh/Fullscreen row anywhere
// on screen. Position persists across reloads via localStorage so it stays
// put once the player has parked it somewhere out of the way.
const DRAG_POSITION_KEY = 'boardButtonContainerPosition';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const applyStoredDragPosition = (container) => {
  const stored = localStorage.getItem(DRAG_POSITION_KEY);
  if (!stored) return;
  try {
    const { left, top } = JSON.parse(stored);
    if (typeof left !== 'number' || typeof top !== 'number') return;
    const rect = container.getBoundingClientRect();
    container.style.left = `${clamp(left, 0, window.innerWidth - rect.width)}px`;
    container.style.top = `${clamp(top, 0, window.innerHeight - rect.height)}px`;
    container.style.right = 'auto';
    container.style.transform = 'none';
  } catch {
    // Ignore corrupt stored position; fall back to the CSS default.
  }
};

// Once the row has been dragged, it sits at a fixed pixel position and
// stops tracking the mat's right edge. The side menu (and fullscreen)
// toggles resize #battleMat and fire a 'resize' event 260ms later — reuse
// that to slide the dragged row along with the mat edge instead of leaving
// it stranded on top of the mat or floating in empty space.
const trackMatEdgeForDraggedPosition = (container) => {
  const battleMat = document.getElementById('battleMat');
  if (!battleMat) return;

  let lastMatRight = battleMat.getBoundingClientRect().right;

  window.addEventListener('resize', () => {
    const newMatRight = battleMat.getBoundingClientRect().right;
    const delta = newMatRight - lastMatRight;
    lastMatRight = newMatRight;

    if (!delta || !container.style.left) return;

    const rect = container.getBoundingClientRect();
    const newLeft = clamp(rect.left + delta, 0, window.innerWidth - rect.width);
    container.style.left = `${newLeft}px`;
    localStorage.setItem(
      DRAG_POSITION_KEY,
      JSON.stringify({ left: newLeft, top: parseFloat(container.style.top) })
    );
  });
};

const initializeBoardButtonDrag = () => {
  const container = document.getElementById('boardButtonContainer');
  if (!container) return;

  applyStoredDragPosition(container);
  trackMatEdgeForDraggedPosition(container);

  let dragging = false;
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;

  container.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;

    dragging = true;
    const rect = container.getBoundingClientRect();
    pointerOffsetX = event.clientX - rect.left;
    pointerOffsetY = event.clientY - rect.top;

    container.style.right = 'auto';
    container.style.transform = 'none';
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.setPointerCapture(event.pointerId);
  });

  container.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    const left = clamp(
      event.clientX - pointerOffsetX,
      0,
      window.innerWidth - rect.width
    );
    const top = clamp(
      event.clientY - pointerOffsetY,
      0,
      window.innerHeight - rect.height
    );
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
  });

  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    localStorage.setItem(
      DRAG_POSITION_KEY,
      JSON.stringify({
        left: parseFloat(container.style.left),
        top: parseFloat(container.style.top),
      })
    );
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
  };

  container.addEventListener('pointerup', stopDragging);
  container.addEventListener('pointercancel', stopDragging);
};

export const initializeBoardButtons = () => {
  initializeBoardButtonDrag();

  const flipCoinButton = document.getElementById('flipCoinButton');
  flipCoinButton.addEventListener('click', () =>
    flipCoin(systemState.initiator)
  );

  const flipBoardButton = document.getElementById('flipBoardButton');
  flipBoardButton.addEventListener('click', flipBoard);

  const refreshButton = document.getElementById('refreshButton');
  refreshButton.addEventListener('click', refreshBoardImages);

  const fullscreenPlaymatButton = document.getElementById(
    'fullscreenPlaymatButton'
  );
  fullscreenPlaymatButton.addEventListener('click', () => {
    // Get all sidebox elements and the top button container
    const sideboxes = document.querySelectorAll('.sidebox');
    const topButtonContainer = document.getElementById('topButtonContainer');
    const greyFiller = document.getElementById('greyFiller');

    // Check if sideboxes are currently visible
    const isVisible = sideboxes[0] && sideboxes[0].style.display !== 'none';

    // Toggle the CSS class on body and html for layout adjustments
    document.body.classList.toggle('sidebox-hidden', isVisible);
    document.documentElement.classList.toggle('sidebox-hidden', isVisible);
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 260);

    // Toggle background position based on sidebox visibility
    if (isVisible) {
      // Sidebox is being hidden (going to fullscreen) - normal background position
      document.body.style.backgroundPosition = '';
    } else {
      // Sidebox is being shown - shift background
      document.body.style.backgroundPosition = '-200px 0';
    }

    // Toggle visibility of all sidebox elements
    sideboxes.forEach((sidebox) => {
      sidebox.style.display = isVisible ? 'none' : '';
    });

    // Also toggle the top button container, grey filler, and deck builder
    if (topButtonContainer) {
      topButtonContainer.style.display = isVisible ? 'none' : '';
    }
    if (greyFiller) {
      greyFiller.style.display = isVisible ? 'none' : '';
    }
    const deckBuilderWorkspace = document.getElementById('nativeDeckBuilderWorkspace');
    if (deckBuilderWorkspace) {
      deckBuilderWorkspace.style.display = isVisible ? 'none' : '';
    }
  });

};
