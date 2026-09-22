// Design 024 slice 4: the in-attack coin flip. Design 013's coin ceremony
// covers the opening turn-order call only; every `coinFlipped` the engine
// emits during an attack or ability landed silently. This is a small chip that
// pops at the acting side's Active Pokemon and names the face.
import { getCardRegistry } from '../apply-view.js';
import { rectForInstance, runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { oppContainerDocument, selfContainerDocument } from '../../../state.js';
import { visualRectOf } from '../../image-logic/iframe-rect.mjs';
import { docForSide } from './side-doc.mjs';
import { COIN_CHIP_MS, coinChipPose, coinFaceLabel } from './coin-pose.mjs';

// Anchored on the flipping side's Active slot: that is where the player is
// already looking during an attack.
const activeRectFor = (user) => {
  const doc = docForSide(user, selfContainerDocument, oppContainerDocument);
  const active = doc?.getElementById('active');
  if (!active) return null;
  const rect = visualRectOf(active);
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
};

export const coinFlip = (plan) => {
  const label = coinFaceLabel(plan.face);
  if (!label) return 0;
  const anchor =
    rectForInstance(plan.instanceId, getCardRegistry()) || activeRectFor(plan.user);
  if (!anchor) return 0;

  const size = Math.max(28, anchor.width * 0.45);
  const rect = {
    left: anchor.left + (anchor.width - size) / 2,
    top: anchor.top + (anchor.height - size) / 2,
    width: size,
    height: size,
  };
  const host = spawnOverlay({
    rect,
    className: `fx-overlay fx-coin-chip fx-coin-chip--${plan.face === 'heads' ? 'heads' : 'tails'}`,
  });
  host.style.fontSize = `${Math.max(9, size * 0.26)}px`;
  const chip = document.createElement('div');
  chip.className = 'fx-coin-chip__face';
  chip.textContent = label;
  host.appendChild(chip);

  runPose(host, COIN_CHIP_MS, (t) => {
    const pose = coinChipPose(t);
    host.style.transform = `translate3d(0, ${pose.y}px, 0)`;
    host.style.opacity = String(pose.opacity);
    // scaleX alone reads as a coin turning edge-on, without a 3D context.
    chip.style.transform = `scale(${pose.scale}) scaleX(${pose.spin})`;
  });
};
