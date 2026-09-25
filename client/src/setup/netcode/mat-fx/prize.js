// Design 024 slice 3: the prize-claim burst. Taking a Prize is how the game is
// won and it had no effect at all; this fires a halo plus one spark per card
// at the claiming side's prize zone. Like every other effect here it draws as
// a detached parent-page overlay and no-ops when its anchor cannot be found.
import { oppContainerDocument, selfContainerDocument } from '../../../state.js';
import { runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { visualRectOf } from '../../image-logic/iframe-rect.mjs';
import { docForSide } from './side-doc.mjs';
import {
  PRIZE_CLAIM_MS,
  prizeHaloPose,
  prizeSparkAngles,
  prizeSparkCount,
  prizeSparkPose,
} from './prize-pose.mjs';

// Same shape as knockout-flight's discard lookup: the zone lives inside the
// side's playmat iframe, and visualRectOf maps it onto the parent viewport.
const prizeRectFor = (user) => {
  const doc = docForSide(user, selfContainerDocument, oppContainerDocument);
  const zone = doc?.getElementById('prizes');
  if (!zone) return null;
  const rect = visualRectOf(zone);
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
};

export const prizeClaim = (plan) => {
  const sparkCount = prizeSparkCount(plan.count ?? plan.cards?.length);
  if (sparkCount === 0) return 0;
  const zoneRect = prizeRectFor(plan.user);
  if (!zoneRect) return 0;

  // A square centred on the zone, so sparks throw outward symmetrically.
  const size = Math.max(40, Math.min(zoneRect.width, zoneRect.height));
  const rect = {
    left: zoneRect.left + (zoneRect.width - size) / 2,
    top: zoneRect.top + (zoneRect.height - size) / 2,
    width: size,
    height: size,
  };

  const host = spawnOverlay({ rect, className: `fx-overlay fx-prize-claim fx-prize-claim--${plan.user || 'neutral'}` });
  const halo = document.createElement('div');
  halo.className = 'fx-prize-claim__halo';
  host.appendChild(halo);

  const angles = prizeSparkAngles(sparkCount);
  const sparks = angles.map(() => {
    const spark = document.createElement('i');
    host.appendChild(spark);
    return spark;
  });

  runPose(host, PRIZE_CLAIM_MS, (t) => {
    const haloPose = prizeHaloPose(t);
    halo.style.transform = `scale(${haloPose.scale})`;
    halo.style.opacity = String(haloPose.opacity);
    angles.forEach((angle, i) => {
      const pose = prizeSparkPose(angle, t, { distance: size * 0.55 });
      const spark = sparks[i];
      spark.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.scale})`;
      spark.style.opacity = String(pose.opacity);
    });
  });
};
