// The Mega entry on the three.js board: draws mega-entry.mjs's timeline in the FX layer round one
// card. The shell is a lit ball of energy (the `shell` element) the card is seen through; its
// pieces are glassy stones (`debris`) and its spent energy thin smoke; comets, motes and sparkles
// are sprites at real heights. The ball throws a shadow and a pool of its colour on the cloth,
// and the card's mesh carries its own motion and rim light (`scene.drive`, `scene.cardFx`).
import { getBoardScene } from '../../board3d/board3d.js';
import { cardHalo, playStageFx, shownId, sprite, stageCard } from './board-fx.js';
import { brighten } from './fx-colors.mjs';
import {
  MEGA_COMET_TAIL,
  MEGA_ENTRY_MS,
  MEGA_HOLD_MS,
  MEGA_PALETTE,
  buildMegaScene,
  megaCardPose,
  megaCometPose,
  megaMotePose,
  megaPiecePose,
  megaPoolPose,
  megaShellPose,
  megaSparklePose,
  megaWispPose,
} from './mega-entry.mjs';
import { emit, rgb01 } from './moves/elements/_emit.js';

const TEXTURES = Object.freeze({
  glow: 'TEX_VFX_Gradient_Radial.webp',
  sparkle: 'TEX_VFX_Sparkle_2x2.webp',
});
const { deep: DEEP, body: BODY, hot: HOT, rim: RIM } = MEGA_PALETTE;

/** The ball's shadow on the cloth, pushed away from the light (up-left) as it rides higher. */
function ballShadow(ctx, x, y, radius, lift, alpha) {
  if (!(alpha > 0) || !(radius > 0)) return;
  const cx = x + lift * 0.35;
  const cy = y + lift * 0.55;
  const shade = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.15);
  shade.addColorStop(0, `rgba(6, 2, 16, ${(0.42 * alpha).toFixed(3)})`);
  shade.addColorStop(1, 'rgba(6, 2, 16, 0)');
  ctx.save();
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Plays the Mega entry on the card `instanceId`. Returns the hold the queue waits (ms), or false
 * when no scene draws the card.
 */
export function playMegaEntry(instanceId) {
  const scene = getBoardScene();
  const id = shownId(instanceId);
  const card = scene?.fx ? stageCard(scene, id) : null;
  if (!card) return false;
  const h = card.h;
  const seed = Number(instanceId) || 1;
  const mega = buildMegaScene(seed);
  const at = (x, y, z) => ({ x: card.x + x * h, y: card.y + y * h, z: z * h });

  scene.fx.warm(Object.values(TEXTURES));
  scene.drive(
    id,
    (ms) => {
      const pose = megaCardPose(ms);
      return { dx: pose.x * h, dy: pose.y * h, dz: pose.lift * h, yawDeg: pose.yawDeg, scale: pose.scale, scaleAlong: 1, scaleAcross: 1, laneAngleDeg: 0 };
    },
    MEGA_ENTRY_MS
  );
  scene.cardFx(id, { at: (ms) => ({ rim: megaCardPose(ms).rim }), ms: MEGA_ENTRY_MS, rimRgb: brighten(BODY, 0.25) });

  const played = playStageFx(scene, {
    ms: MEGA_ENTRY_MS,
    unit: h,
    seed,
    draw({ back, top }, _t, ms) {
      const pool = megaPoolPose(ms);
      const shell = megaShellPose(ms);
      back((ctx) => {
        cardHalo(ctx, card, BODY, pool.alpha, pool.scale);
        if (shell) ballShadow(ctx, card.x, card.y, shell.radius * h, shell.z * h, shell.alpha * (1 - shell.dissolve));
      });
      top(card.z, (ctx) => {
        // Comets draw under the shell (sprites come first in the FX pass): where a ring crosses
        // the ball's disc it passes behind it. The head burns; the tail is its colour thinning out.
        for (const comet of mega.comets) {
          for (let k = 0; k < MEGA_COMET_TAIL; k += 1) {
            const pose = megaCometPose(comet, k, ms);
            if (pose) sprite(ctx, TEXTURES.glow, at(pose.x, pose.y, pose.z), pose.size * h, comet.warm ? HOT : RIM, k === 0 ? 2.2 : 0.9, pose.alpha);
          }
        }
        if (shell) {
          emit(ctx, 'shell', {
            at: at(shell.x, shell.y, shell.z),
            radius: shell.radius * h,
            alpha: shell.alpha,
            seed: mega.seed,
            colour: rgb01(BODY),
            deep: rgb01(DEEP),
            hot: rgb01(HOT),
            rim: rgb01(RIM),
            crack: shell.crack,
            dissolve: shell.dissolve,
            turn: shell.turn,
            heat: shell.heat,
            thickness: shell.thickness,
            bend: 0.3,
          });
        }
        for (const mote of mega.motes) {
          const pose = megaMotePose(mote, ms);
          if (pose) sprite(ctx, TEXTURES.glow, at(pose.x, pose.y, pose.z), pose.size * h, mote.warm ? HOT : BODY, 1.6, pose.alpha, { aspect: 0.3, alignDeg: pose.headingDeg });
        }
        for (const wisp of mega.wisps) {
          const pose = megaWispPose(wisp, ms);
          if (pose) emit(ctx, 'smoke', { at: at(pose.x, pose.y, pose.z), radius: pose.radius * h, alpha: pose.alpha, seed: wisp.seed, tint: rgb01(DEEP, 1.1), light: rgb01(BODY, 1.2), density: 0.45, rise: 0.5, glow: 0.25, dissolve: pose.dissolve });
        }
        for (const piece of mega.pieces) {
          const pose = megaPiecePose(piece, ms);
          if (!pose) continue;
          emit(ctx, 'debris', {
            at: at(pose.x, pose.y, pose.z),
            size: pose.size * h,
            seed: piece.seed,
            colour: rgb01(piece.deep ? DEEP : BODY),
            light: rgb01(piece.deep ? RIM : brighten(BODY, 0.4)),
            stretch: piece.stretch,
            headingDeg: pose.headingDeg,
            spin: pose.spin,
            dissolve: pose.dissolve,
            gloss: 0.9,
          });
        }
        for (const sparkle of mega.sparkles) {
          const pose = megaSparklePose(sparkle, ms);
          if (pose) sprite(ctx, TEXTURES.sparkle, at(pose.x, pose.y, pose.z), pose.size * h, sparkle.warm ? brighten(HOT, 0.35) : brighten(RIM, 0.35), 1.7, pose.alpha, { frame: sparkle.frame });
        }
      });
    },
  });
  return played ? MEGA_HOLD_MS : false;
}
