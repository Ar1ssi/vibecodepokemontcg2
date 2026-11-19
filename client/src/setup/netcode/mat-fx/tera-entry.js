// The Tera entry on the three.js board: draws tera-entry.mjs's timeline in the FX layer round one
// card. The crystals are real gems (the `crystal` element) rooted under the card's edge, so the
// card hides where they leave the cloth and they hide one another; light is the halo behind the
// card, one ring on the cloth, and sprites at real heights (TCG Live's own Tera sign, hex bokeh
// and prismatic streak). The card's mesh carries its own motion (`scene.drive`), and its crystal
// coat forms on the scene's clock (tera-skin.js `formTeraSkinAt`).
import { getBoardScene } from '../../board3d/board3d.js';
import { cardHalo, playStageFx, shownId, sprite, stageCard } from './board-fx.js';
import { emit, rgb01 } from './moves/elements/_emit.js';
import {
  TERA_COAT_AT_MS,
  TERA_ENTRY_MS,
  TERA_HOLD_MS,
  TERA_RIM_GLINTS,
  buildTeraCluster,
  teraBokehPose,
  teraCardPose,
  teraLightPose,
  teraMotePose,
  teraPointPose,
  teraRimGlintPose,
  teraShardPose,
  teraSparkPose,
  teraStreakPose,
} from './tera-entry.mjs';
import { teraGemColours, teraPaletteForCard } from './tera-palette.mjs';
import { formTeraSkinAt } from './tera-skin.js';

const TEXTURES = Object.freeze({
  sign: 'T_VFX_Tera_Sign.webp',
  signLines: 'T_VFX_Tera_Sign_Mask.webp',
  bokeh: 'T_VFX_hex_prismatic_blur_set2x1.webp',
  streak: 'T_VFX_Tera_Prism_Shine.webp',
  sparkle: 'TEX_VFX_Sparkle_2x2.webp',
  stars: 'TEX_VFX_Star_Variants_SubUV_2x2.webp',
  glint: 'TEX_VFX_Star_FourPoint_Light.webp',
});
const DEG = Math.PI / 180;
/** The sign's texture keeps a glow margin round the jewel: this much of it is the jewel itself. */
const SIGN_FILL = 0.7;
/** The jewel's height over the card, in card heights (the prefab's sign is 12.4 units on a 13-unit card). */
const SIGN_HEIGHT = 0.95;

/** A gem's shadow on the cloth under it, and the light it throws past its tip. */
function gemGround(ctx, x, y, headingDeg, reach, width, rgb, alpha) {
  const heading = headingDeg * DEG;
  const cx = x + Math.cos(heading) * reach * 0.55;
  const cy = y + Math.sin(heading) * reach * 0.55;
  const radius = Math.max(reach * 0.6, width);
  ctx.save();
  const shade = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  shade.addColorStop(0, `rgba(4, 6, 18, ${(0.34 * alpha).toFixed(3)})`);
  shade.addColorStop(1, 'rgba(4, 6, 18, 0)');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  const tx = x + Math.cos(heading) * reach * 1.05;
  const ty = y + Math.sin(heading) * reach * 1.05;
  const caustic = ctx.createRadialGradient(tx, ty, 0, tx, ty, width * 1.6);
  caustic.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.3 * alpha).toFixed(3)})`);
  caustic.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = caustic;
  ctx.beginPath();
  ctx.arc(tx, ty, width * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Plays the Tera entry on the card `instanceId`. Returns the hold the queue waits (ms), or false
 * when no scene draws the card.
 * @param {number} instanceId the entering Pokémon
 * @param {object} cardData its card (the crystal takes its type's colour)
 */
export function playTeraEntry(instanceId, cardData) {
  const scene = getBoardScene();
  const id = shownId(instanceId);
  const card = scene?.fx ? stageCard(scene, id) : null;
  if (!card) return false;
  const h = card.h;
  const seed = Number(instanceId) || 1;
  const cluster = buildTeraCluster(seed);
  const gem = teraGemColours(teraPaletteForCard(cardData));
  const at = (x, y, z) => ({ x: card.x + x * h, y: card.y + y * h, z: z * h });

  scene.fx.warm(Object.values(TEXTURES));
  formTeraSkinAt(instanceId, scene.clock.now() + TERA_COAT_AT_MS);
  scene.drive(
    id,
    (ms) => {
      const pose = teraCardPose(ms);
      return { dx: 0, dy: 0, dz: pose.lift * h, yawDeg: pose.yawDeg, scale: pose.scale, scaleAlong: 1, scaleAcross: 1, laneAngleDeg: 0 };
    },
    TERA_ENTRY_MS
  );

  const drawGem = (ctx, point, pose, extra) =>
    emit(ctx, 'crystal', {
      seed: point.seed,
      shoulder: point.shoulder,
      colour: rgb01(gem.body, 1 + 0.2 * (extra.glow ?? 0)),
      deep: rgb01(gem.deep),
      light: rgb01(gem.hot, 1 + 0.8 * (extra.glow ?? 0)),
      bend: h * 0.1,
      ...pose,
      ...extra,
    });

  const played = playStageFx(scene, {
    ms: TERA_ENTRY_MS,
    unit: h,
    seed,
    draw({ back, top }, _t, ms) {
      const light = teraLightPose(ms);
      const points = cluster.points.map((point) => ({ point, pose: teraPointPose(point, ms) }));
      back((ctx) => {
        cardHalo(ctx, card, gem.body, light.pool.alpha, light.pool.scale);
        for (const { point, pose } of points) {
          if (!pose) continue;
          const reach = pose.length * Math.cos(point.elevationDeg * DEG) * h;
          gemGround(ctx, card.x + point.root.x * h, card.y + point.root.y * h, pose.headingDeg, reach, pose.width * h, gem.body, 1);
        }
      });
      top(card.z, (ctx) => {
        for (const { point, pose } of points) {
          if (pose) {
            drawGem(ctx, point, { at: at(point.root.x, point.root.y, 0), length: pose.length * h, width: pose.width * h, headingDeg: pose.headingDeg, elevationDeg: point.elevationDeg, rollDeg: point.rollDeg }, { glow: pose.glow });
            continue;
          }
          for (const shard of point.shards) {
            const flying = teraShardPose(point, shard, ms);
            if (!flying) continue;
            drawGem(ctx, { ...point, seed: shard.seed }, { at: at(flying.x, flying.y, flying.z), length: flying.length * h, width: flying.width * h, headingDeg: flying.headingDeg, elevationDeg: flying.elevationDeg, rollDeg: flying.rollDeg }, { dissolve: flying.dissolve, shoulder: 0.5 });
          }
        }
        for (const bokeh of cluster.bokeh) {
          const pose = teraBokehPose(bokeh, ms);
          if (pose) sprite(ctx, TEXTURES.bokeh, at(pose.x, pose.y, pose.z), pose.size * h, gem.hot, 1.5, pose.alpha, { frame: bokeh.frame, rotation: pose.rotation });
        }
        for (const mote of cluster.motes) {
          const pose = teraMotePose(mote, ms);
          if (pose) sprite(ctx, TEXTURES.sparkle, at(pose.x, pose.y, pose.z), pose.size * h, gem.hot, 1.5, pose.alpha, { frame: mote.frame });
        }
        const streak = teraStreakPose(ms);
        if (streak) {
          for (const point of cluster.points) {
            if (point.tier !== 'main' || point.seed % 2 === 0) continue;
            const heading = point.headingDeg * DEG;
            const out = (point.length * Math.cos(point.elevationDeg * DEG) + streak.at * streak.length);
            const tip = at(point.root.x + Math.cos(heading) * out, point.root.y + Math.sin(heading) * out, point.length * Math.sin(point.elevationDeg * DEG));
            sprite(ctx, TEXTURES.streak, tip, streak.length * h, [255, 255, 255], 1.25, streak.alpha * 0.8, { channel: 'rgba', aspect: 0.3, alignDeg: point.headingDeg });
          }
        }
        for (const spark of cluster.sparks) {
          const pose = teraSparkPose(spark, ms);
          if (pose) sprite(ctx, TEXTURES.stars, at(pose.x, pose.y, pose.z), pose.size * h, gem.hot, 1.8, pose.alpha, { frame: spark.frame });
        }
        if (light.sign.alpha > 0) {
          // The jewel is matter: light alone vanishes over bright card art. Its shadow on the card
          // below, its body in the type's colour, then its cut lines as light.
          const size = (SIGN_HEIGHT / SIGN_FILL) * h * light.sign.scale;
          const over = at(0, 0, light.sign.rise);
          const shadow = { x: over.x + h * 0.035, y: over.y + h * 0.05, z: card.z + 1 };
          sprite(ctx, TEXTURES.sign, shadow, size, gem.deep, 0.25, light.sign.alpha * 0.5, { channel: 'a', blend: 'over' });
          sprite(ctx, TEXTURES.sign, over, size, gem.body, 0.95, light.sign.alpha * 0.92, { channel: 'a', blend: 'over' });
          sprite(ctx, TEXTURES.signLines, { ...over, z: over.z + 1 }, size * 1.06, gem.hot, 1 + 1.4 * light.sign.heat, light.sign.alpha);
        }
        for (const [gx, gy, lag] of TERA_RIM_GLINTS) {
          const pose = teraRimGlintPose(lag, ms);
          if (pose) sprite(ctx, TEXTURES.glint, { x: card.x + gx * card.w, y: card.y + gy * h, z: card.z + 2 }, pose.size * h, gem.hot, 1.7, pose.alpha, { channel: 'a', rotation: pose.rotation });
        }
      });
    },
  });
  return played ? TERA_HOLD_MS : false;
}
