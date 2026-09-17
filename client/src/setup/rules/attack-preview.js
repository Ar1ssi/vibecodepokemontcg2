// TCG Live-style attack selection overlay (design 008, Component 1).
//
// openAttackPreview() magnifies the active Pokémon through the existing card
// preview (full-view.js), then overlays translucent attack hit-zones and
// Retreat/Pass buttons on top of it. Click wiring (Component 4 — which cards
// this can be opened for) is a later slice; this module only implements the
// overlay itself once something else decides to open it.
import { getZone } from '../zones/get-zone.js';
import { getAuthoritativeStadiumArray } from '../netcode/apply-view.js';
import {
  isAuthoritativeDispatchActive,
  dispatchAuthoritativeUseAbility,
} from '../netcode/authoritative-dispatch.js';
import {
  attachedEnergiesFor,
  stadiumCardFor,
  abilityUsedFor,
} from './attack-preview-sources.mjs';
import {
  rulesState,
  ensureCardData,
  getStadium,
  abilityUsed,
} from '/shared/engine/rules/rules-state.mjs';
import { resolveAttackContext } from '/shared/engine/rules/resolve-attack-context.mjs';
import { listUsableActions } from '/shared/engine/rules/attack-window.mjs';
import { benchCardHasAbility } from '/shared/engine/rules/collect-usable-abilities.mjs';
import { attack, retreat, pass } from '../../actions/chat-buttons/chat-buttons.js';
import { runAbilitySteps } from './rules-bridge.js';
import {
  openFloatingCardPreview,
  closeCardPreview,
  resolvePreviewSleeveSrc,
} from '../image-logic/full-view.js';
import { toHighResCardImageUrl } from '../image-logic/card-image-url.mjs';
import { getEnergyTokenSrcForType } from '../../actions/move-card-bundle/energy-token-assets.mjs';
import { imageAnchor, cardNode } from '../deck-constructor/hydrate-holo.js';
import {
  listAttackZoneBounds,
  abilityZoneBounds,
  computeContentBox,
} from './attack-zone-geometry.js';

// Fallback glyph for a cost symbol that has no token art (ENERGY_TOKEN_FRONT
// covers every TCGdex type, so this is the "data we don't recognise" path).
const ENERGY_SYMBOLS = {
  Colorless: '⚪',
  Fire: '🔥',
  Water: '💧',
  Grass: '🌿',
  Lightning: '⚡',
  Psychic: '🔮',
  Fighting: '🥊',
  Metal: '⚙️',
  Dark: '🌑',
  Dragon: '🐉',
};

// TCG Live paints a printed attack cost as a row of type-symbol circles rather
// than emoji, and the board already ships exactly those circles as energy
// token art — so the cost reuses them (same URL the attached-energy tokens
// draw, hence the browser cache is warm).
const costOrb = (symbol) => {
  const src = getEnergyTokenSrcForType(symbol);
  if (!src) return null;
  const orb = document.createElement('img');
  orb.className = 'attack-cost-orb';
  orb.src = src;
  orb.alt = String(symbol);
  orb.title = String(symbol);
  return orb;
};

const costEl = (cost) => {
  const wrap = document.createElement('span');
  wrap.className = 'attack-zone-cost';
  for (const symbol of cost || []) {
    const orb = costOrb(symbol);
    wrap.appendChild(orb ?? document.createTextNode(String(ENERGY_SYMBOLS[symbol] || symbol)));
  }
  return wrap;
};

// Events that can change payability while the overlay is open (R12). A
// subset of the panel's own refresh list — the pieces that can flip an
// attack from unpayable to payable (or vice versa) mid-preview.
const REFRESH_EVENTS = [
  'rules-energy-attached',
  'rules-card-moved',
  'rules-damage-changed',
  'rules-status-changed',
  'action-processed',
  'rules-mode-changed',
];
const CLOSE_EVENTS = ['rules-turn-began', 'rules-session-reset'];

/** @type {{ card: object, zone: 'active' | 'bench', zonesReady: boolean } | null} */
let previewState = null;

export const isAttackPreviewOpen = () => previewState != null;

const contentBoxFor = (popHost) => {
  const face = popHost.querySelector('.card-preview-face--front');
  const hostRect = popHost.getBoundingClientRect();
  if (!face) return { left: 0, top: 0, width: hostRect.width, height: hostRect.height };

  const holoNode = face.querySelector('.mat-holo.card-preview-card');
  if (holoNode) {
    // Forced to 100%/100% by CSS (R4) — the box already is the content box.
    return { left: 0, top: 0, width: hostRect.width, height: hostRect.height };
  }

  const img = face.querySelector('img.card-preview-card');
  if (!img) return { left: 0, top: 0, width: hostRect.width, height: hostRect.height };

  return computeContentBox({
    boxWidth: hostRect.width,
    boxHeight: hostRect.height,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    fit: 'contain',
  });
};

/**
 * D5/D6/R10: a card's ability, whether or not it's usable right now — an
 * already-used once-per-turn ability still renders (plain/inert per D4)
 * rather than being hidden, so `collectUsableAbilityCandidates`'s
 * pre-filtered list can't be reused here (R10).
 */
const abilityInfoFor = (card) => {
  if (!benchCardHasAbility(card)) return null;
  const used = abilityUsedFor(card, abilityUsed('self', card), rulesState.flags?.self?.abilitiesUsed);
  return {
    name: card.ability?.name || 'Ability',
    usable: !used,
    reason: used ? 'Already used this turn' : null,
  };
};

const buildAbilityZoneEl = (abilityInfo, bounds, contentBox, card) => {
  const el = document.createElement('div');
  el.className = `ability-zone ${abilityInfo.usable ? 'ability-zone--usable' : 'ability-zone--unusable'}`;
  el.style.left = `${contentBox.left}px`;
  el.style.width = `${contentBox.width}px`;
  el.style.top = `${contentBox.top + (bounds.topPct / 100) * contentBox.height}px`;
  el.style.height = `${(bounds.heightPct / 100) * contentBox.height}px`;
  if (abilityInfo.reason) el.title = abilityInfo.reason;

  const label = document.createElement('div');
  label.className = 'attack-zone-label';
  label.textContent = `Ability: ${abilityInfo.name}`;
  el.appendChild(label);

  if (abilityInfo.usable) {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // D5/R12: using an ability does not end the turn — the overlay stays
      // open and re-renders itself once the resulting board event fires.
      // Multiplayer: the server runs the ability (and asks for any picks
      // through a pendingChoice); the local step runner would mutate legacy
      // zone arrays the server never sees.
      if (card.instanceId != null && isAuthoritativeDispatchActive()) {
        dispatchAuthoritativeUseAbility({
          user: 'self',
          emit: true,
          oInitiator: 'opp',
          zoneId: previewState?.zone || 'active',
          index: 0,
          authoritativeId: card.instanceId,
        });
        return;
      }
      runAbilitySteps('self', card);
    });
  }
  return el;
};

const buildAttackZoneEl = (zoneAction, bounds, contentBox) => {
  const el = document.createElement('div');
  el.className = `attack-zone ${zoneAction.usable ? 'attack-zone--usable' : 'attack-zone--unusable'}`;
  el.style.left = `${contentBox.left}px`;
  el.style.width = `${contentBox.width}px`;
  el.style.top = `${contentBox.top + (bounds.topPct / 100) * contentBox.height}px`;
  el.style.height = `${(bounds.heightPct / 100) * contentBox.height}px`;
  if (zoneAction.reason) el.title = zoneAction.reason;

  const label = document.createElement('div');
  label.className = 'attack-zone-label';
  const cost = zoneAction.effectiveCost || [];
  const dmg = zoneAction.damage != null ? ` · ${zoneAction.damage} dmg` : '';
  label.appendChild(document.createTextNode(`${zoneAction.name} `));
  if (cost.length) label.appendChild(costEl(cost));
  if (dmg) label.appendChild(document.createTextNode(dmg));
  el.appendChild(label);

  if (zoneAction.usable) {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeAttackPreview();
      attack(rulesState.turnPlayer, true, zoneAction.index);
    });
  }
  return el;
};

const buildActionButtons = (popHost) => {
  const container = document.createElement('div');
  container.className = 'attack-preview-actions';

  const retreatBtn = document.createElement('button');
  retreatBtn.type = 'button';
  retreatBtn.className = 'attack-preview-btn attack-preview-btn--retreat';
  retreatBtn.textContent = 'Retreat';
  retreatBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeAttackPreview();
    retreat('self');
  });

  const passBtn = document.createElement('button');
  passBtn.type = 'button';
  passBtn.className = 'attack-preview-btn attack-preview-btn--pass';
  passBtn.textContent = 'Pass Turn';
  passBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeAttackPreview();
    pass('self');
  });

  container.append(retreatBtn, passBtn);

  const rect = popHost.getBoundingClientRect();
  container.style.left = `${rect.left}px`;
  container.style.top = `${rect.bottom + 8}px`;
  container.style.width = `${rect.width}px`;

  return container;
};

const emptyStateEl = (card) => {
  const el = document.createElement('div');
  el.className = 'attack-zone-label attack-preview-empty';
  if (typeof console !== 'undefined') {
    console.warn('[rules] attack preview: no attacks resolved', {
      name: card.name,
      hasId: !!card.id,
      attacks: Array.isArray(card.attacks) ? card.attacks.length : typeof card.attacks,
    });
  }
  const notLoaded = Array.isArray(card.attacks) ? '' : ' · data not loaded (check network / TCGdex)';
  el.textContent = `No attacks defined. id=${card.id || '—'}${notLoaded}`;
  return el;
};

async function renderZones({ popHost, overlay, card }) {
  if (!previewState) return;

  popHost
    .querySelectorAll('.attack-zone, .ability-zone, .attack-preview-empty')
    .forEach((el) => el.remove());
  overlay.querySelectorAll('.attack-preview-actions').forEach((el) => el.remove());

  const face = popHost.querySelector('.card-preview-face--front');
  const contentBox = contentBoxFor(popHost);
  const abilityInfo = abilityInfoFor(card);
  const abilityCount = abilityInfo ? 1 : 0;

  const renderAbilityZone = () => {
    if (!abilityInfo) return;
    const bounds = abilityZoneBounds({ abilityCount });
    if (!bounds) return;
    face.appendChild(buildAbilityZoneEl(abilityInfo, bounds, contentBox, card));
  };

  // A benched Pokémon cannot attack (D6) — its overlay gets ability zones
  // only.
  if (previewState.zone === 'bench') {
    renderAbilityZone();
    return;
  }

  renderAbilityZone();

  try {
    await ensureCardData(card);
  } catch {
    /* card data may not be ready yet — falls through to the empty state below */
  }
  if (!previewState) return; // closed while awaiting

  const attachedEnergies = attachedEnergiesFor(card, getZone('self', 'active').array);
  const stadiumCard = stadiumCardFor(getStadium(), getAuthoritativeStadiumArray());
  const { energyTypes, stadiumCostModifier, abilityUsedFlag, priorAttacks } =
    await resolveAttackContext({
      activeCard: card,
      attachedEnergyCards: attachedEnergies,
      ensureCardData,
      stadiumCard,
      abilityUsed: (c) => abilityUsedFor(c, abilityUsed('self', c), rulesState.flags?.self?.abilitiesUsed),
    });
  if (!previewState) return;

  const { attacks: atkList } = listUsableActions(card, {
    energyTypes,
    stadiumCostModifier,
    abilityUsed: abilityUsedFlag,
    rulesEnabled: true,
    priorAttacks,
  });

  const bounds = listAttackZoneBounds({ attackCount: atkList.length, abilityCount });

  if (!atkList.length) {
    face.appendChild(emptyStateEl(card));
  } else {
    atkList.forEach((zoneAction, i) => {
      face.appendChild(buildAttackZoneEl(zoneAction, bounds[i], contentBox));
    });
  }

  overlay.appendChild(buildActionButtons(popHost));
}

/**
 * Open the TCG Live-style attack preview for the given card.
 *
 * @param {object} card - the active Pokémon card (must carry `.image`)
 * @param {HTMLImageElement} targetImage - the mat image element clicked
 * @param {{ zone: 'active' | 'bench' }} [opts]
 */
export function openAttackPreview(card, targetImage, { zone = 'active' } = {}) {
  if (!card || !targetImage) return;
  closeAttackPreview();

  const anchor = cardNode(card) ?? imageAnchor(targetImage);
  if (!anchor) return;

  let cleanup = () => {};

  openFloatingCardPreview({
    sourceEl: anchor,
    imageUrl: toHighResCardImageUrl(targetImage.currentSrc || targetImage.src),
    card,
    sleeveSrc: resolvePreviewSleeveSrc(card, targetImage),
    cloneFrom: card?.wrapper ?? (anchor.classList?.contains('mat-holo') ? anchor : null),
    hideSource: true,
    interactive: true,
    onOpened: ({ popHost, overlay, whenOpened }) => {
      previewState = { card, zone, zonesReady: false };

      whenOpened.then(() => {
        if (!previewState) return; // closed mid-animation (R6)
        previewState.zonesReady = true;
        renderZones({ popHost, overlay, card });
      });

      const rerenderIfReady = () => {
        if (!previewState?.zonesReady) return;
        renderZones({ popHost, overlay, card });
      };
      const closeOnBoundary = () => closeAttackPreview();

      REFRESH_EVENTS.forEach((name) => document.addEventListener(name, rerenderIfReady));
      CLOSE_EVENTS.forEach((name) => document.addEventListener(name, closeOnBoundary));

      cleanup = () => {
        REFRESH_EVENTS.forEach((name) => document.removeEventListener(name, rerenderIfReady));
        CLOSE_EVENTS.forEach((name) => document.removeEventListener(name, closeOnBoundary));
      };
    },
    onClosed: () => {
      cleanup();
      previewState = null;
    },
  });
}

export function closeAttackPreview() {
  if (!previewState) return;
  closeCardPreview(null, true);
}
