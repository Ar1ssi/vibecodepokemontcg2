import { isEnergy } from '../../../../shared/engine/cards.mjs';
import { planSpecialEnergyTriggers } from '../../../../shared/engine/rules/special-energy-parse.mjs';

/**
 * Where a discarded attached Energy actually goes when its own text overrides the discard
 * (Recycle Energy: "put it into your hand instead"; Boomerang / Burning / Nitro Fire Energy:
 * "attach this card from your discard pile to that Pokémon after attacking").
 *
 * Returns null when the discard stands. Otherwise the whole redirect in one value — the
 * destination zone, the host to re-attach to (reattach only), and the log line — so the mover
 * adopts one destination instead of patching some of its destination variables.
 *
 * @param {object} args
 * @param {object} args.movingCard the Energy being discarded
 * @param {string} args.oZoneId 'active' | 'bench'; Energy attached elsewhere is not redirected
 * @param {string} args.dZoneId the requested destination; only 'discard' is redirected
 * @param {object[]} args.zoneArray the origin zone array (host and attached Energy live in it)
 * @param {boolean} args.attackExecuting whether an attack's own discard is running
 */
export function planSpecialEnergyDiscardRedirect({
  movingCard,
  oZoneId,
  dZoneId,
  zoneArray,
  attackExecuting,
}) {
  if (
    !isEnergy(movingCard) ||
    dZoneId !== 'discard' ||
    !['active', 'bench'].includes(oZoneId) ||
    !movingCard.image?.relative
  ) {
    return null;
  }
  const host = zoneArray.find(
    (c) => c.type === 'Pokémon' && c.image === movingCard.image.relative
  );
  const plans = planSpecialEnergyTriggers(movingCard, {
    trigger: 'discard',
    host,
    zoneArray,
    attackExecuting: !!attackExecuting,
  });
  if (plans.some((p) => p.action === 'returnToHand')) {
    return {
      destZoneId: 'hand',
      host: null,
      message: `♻️ ${movingCard.name} returns to your hand.`,
    };
  }
  if (host && plans.some((p) => p.action === 'reattach')) {
    return {
      destZoneId: oZoneId,
      host,
      message: `🔥 ${movingCard.name} stays attached to ${host.name || 'its Pokémon'} (its attack discard returns it).`,
    };
  }
  return null;
}
