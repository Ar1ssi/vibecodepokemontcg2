/**
 * @file TCG Live attack option rows (design 074) — the DOM half.
 *
 * One builder per prefab: AttackActionOption_L, AbilityActionOption_L and the BottomBorderInfo
 * Weakness / Resistance / Retreat bar (WeakResistRetreatBar). The AttackOverlay (card-focus) and the
 * stack view's info panel both draw these, as the game reuses the same prefabs in both. Geometry,
 * sprites, colours and type sizes live in css/attack-options.css; this module only picks the
 * variant classes the game's SetupCustom methods pick and fills in the text.
 *
 * Click routing stays with the caller: rows carry `data-ptcg-attack`, `data-ptcg-ability` and
 * `data-ptcg-retreat` exactly as the 013 panels did.
 */

import { ENERGY_SYMBOL_TO_TYPE } from '../../../../shared/engine/rules/energy-effects.mjs';
import { normalizeEnergyType } from '../../actions/move-card-bundle/energy-token-assets.mjs';
import { TYPE_GLOW } from './card-glow-colors.mjs';
import { formatWeakResist } from './card-inspector-model.mjs';

const ICON_DIR = '/src/assets/attack-ui/';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

// AttackEntryAssetRegistry indexes its sprites by the card's first type; a type it has no sprites
// for falls back to Colorless, as the game's NONE entry does.
export const typeKeyFor = (type) => {
  const key = normalizeEnergyType(type);
  return Object.hasOwn(TYPE_GLOW, key) ? key : 'colorless';
};

const ICON_KEYS = new Set([...Object.keys(TYPE_GLOW), 'rainbow', 'plus', 'empty']);

/** One EnergyCostDisplay icon: the filled type texture, or its empty outline. */
export const typeIcon = (type, filled = true, className = 'tcgl-icon') => {
  const key = ICON_KEYS.has(type) ? type : typeKeyFor(type);
  const img = el('img', className);
  img.src = `${ICON_DIR}type-${key}${filled || key === 'empty' ? '' : '-empty'}.png`;
  img.alt = key;
  img.draggable = false;
  if (!filled) img.classList.add(`${className}--empty`);
  return img;
};

// Card text writes Energy as {R}, {W}, …; the game swaps those for its icon sprites inline.
const textWithIcons = (target, text) => {
  for (const part of String(text ?? '').split(/(\{[a-z]\})/gi)) {
    const match = /^\{([a-z])\}$/i.exec(part);
    if (!match) {
      if (part) target.appendChild(document.createTextNode(part));
      continue;
    }
    const named = ENERGY_SYMBOL_TO_TYPE[match[1].toLowerCase()];
    if (named) target.appendChild(typeIcon(named, true, 'tcgl-icon tcgl-icon--inline'));
    else target.appendChild(document.createTextNode(part));
  }
};

const description = (text) => {
  const body = el('p', 'tcgl-opt__text');
  textWithIcons(body, text);
  return body;
};

// VPowerBar: the "VSTAR Power" strip over a VSTAR entry's titlebar (end sprites around a centre tile).
const vpowerStrip = () => {
  const strip = el('div', 'tcgl-opt__vpower');
  strip.appendChild(el('span', 'tcgl-opt__vpower-title', 'VSTAR Power'));
  return strip;
};

// AttackDamageModIndicator: the up arrow on its tab for a buffed hit, the down arrow for a debuffed one.
const damageMod = (mod) => {
  const indicator = el('span', `tcgl-opt__mod tcgl-opt__mod--${mod}`);
  indicator.appendChild(el('span', 'tcgl-opt__mod-bg'));
  indicator.appendChild(el('span', 'tcgl-opt__mod-icon'));
  return indicator;
};

const shell = (classes, type) => {
  const row = el('section', ['tcgl-opt', ...classes].join(' '));
  row.dataset.ptcgType = typeKeyFor(type);
  const content = el('div', 'tcgl-opt__content');
  row.appendChild(content);
  return { row, content };
};

/**
 * AttackOption.SetupCustom. `attack` is a card-inspector-model attack entry. The registry's canUse
 * look (the type titlebar and filled tab, or the bare tile and empty tab) follows `recede`, not
 * `usable`: a benched or read-only entry is inert but keeps its colours, as the model decides.
 *
 * @param {object} attack
 * @param {string|null} cardType the Pokémon's first type
 */
export function buildAttackOption(attack, cardType) {
  const canUse = !attack.recede;
  const hasText = Boolean(attack.text);
  const classes = ['tcgl-opt--attack'];
  if (hasText) classes.push('tcgl-opt--text');
  if (attack.gx) classes.push('tcgl-opt--gx');
  if (attack.vstar) classes.push('tcgl-opt--vstar');
  classes.push(canUse ? 'tcgl-opt--on' : 'tcgl-opt--off');
  const readout = attack.readout ?? { text: '', tone: 'plain', mod: null, showTab: false };
  if (readout.showTab) classes.push('tcgl-opt--damage');
  const { row, content } = shell(classes, cardType);
  row.dataset.ptcgAttack = String(attack.index);

  const bar = el('div', 'tcgl-opt__bar');
  if (attack.vstar) bar.appendChild(vpowerStrip());
  const info = el('div', 'tcgl-opt__info');
  info.appendChild(el('span', 'tcgl-opt__name', attack.name));
  const cost = el('span', 'tcgl-opt__cost');
  for (const icon of attack.costIcons ?? []) cost.appendChild(typeIcon(icon.type, icon.filled));
  info.appendChild(cost);
  bar.appendChild(info);

  const tab = el('span', 'tcgl-opt__tab');
  const damage = el('span', `tcgl-opt__dmg tcgl-opt__dmg--${readout.tone}`, readout.text);
  if (readout.text.length > 4) damage.classList.add('tcgl-opt__dmg--long');
  tab.appendChild(damage);
  bar.appendChild(tab);
  if (readout.mod) bar.appendChild(damageMod(readout.mod));
  if (hasText) bar.appendChild(el('span', 'tcgl-opt__divider'));
  content.appendChild(bar);

  if (attack.from) content.appendChild(el('p', 'tcgl-opt__from', `from ${attack.from}`));
  if (hasText) content.appendChild(description(attack.text));
  if (attack.reason) row.title = attack.reason;
  return row;
}

/**
 * AbilityOption.SetupCustom with GetAssetForAbilityEntry's three looks: usable (short type
 * titlebar, tag on), passive (the ability header tinted with the type colour, tag on — a passive
 * ability is never activated, so never "usable"), otherwise a spent or blocked one: the bare tile
 * with the tag off.
 */
export function buildAbilityOption(ability, cardType) {
  const look = ability.passive ? 'passive' : ability.recede ? 'off' : 'on';
  const classes = ['tcgl-opt--ability', `tcgl-opt--${look}`];
  if (ability.text) classes.push('tcgl-opt--text');
  if (ability.vstar) classes.push('tcgl-opt--vstar');
  const { row, content } = shell(classes, cardType);
  row.dataset.ptcgAbility = '1';

  const bar = el('div', 'tcgl-opt__bar');
  if (ability.vstar) bar.appendChild(vpowerStrip());
  const info = el('div', 'tcgl-opt__info');
  info.appendChild(el('span', 'tcgl-opt__name', ability.name));
  const tag = el('span', `tcgl-opt__tag tcgl-opt__tag--${look === 'off' ? 'off' : 'on'}`);
  tag.setAttribute('aria-label', 'Ability');
  info.appendChild(tag);
  bar.appendChild(info);
  if (ability.text) bar.appendChild(el('span', 'tcgl-opt__divider'));
  content.appendChild(bar);
  if (ability.text) content.appendChild(description(ability.text));
  if (ability.reason) row.title = ability.reason;
  return row;
}

// WeakResistInfo: a label, up to three type icons and the amount, right-aligned in its half.
const weakResistRow = (label, kind, typeValue) => {
  const row = el('div', `tcgl-wr__row tcgl-wr__row--${kind}`);
  row.appendChild(el('span', 'tcgl-wr__label', label));
  const icons = el('span', 'tcgl-wr__icons');
  const amount = el('span', 'tcgl-wr__amount');
  const text = formatWeakResist(kind, typeValue);
  if (typeValue?.type && text) {
    icons.appendChild(typeIcon(typeValue.type, true));
    amount.textContent = kind === 'resistance' ? text.replace('−', '-') : text.replace('×', 'x');
  }
  row.append(icons, amount);
  return row;
};

/**
 * WeakResistRetreatBar: Weakness / Resistance on the left half, the Retreat button on the right.
 * The button wears the type's retreat sprite and shadow unless the model recedes it (cost unpaid,
 * already retreated), then the disabled sprite. Past four Energy the cost reads "attached/needed"
 * (ShortRetreatCostDisplay).
 */
export function buildWeakResistBar(model) {
  const bar = el('footer', 'tcgl-wr');
  const info = el('div', 'tcgl-wr__info');
  info.appendChild(weakResistRow('Weakness', 'weakness', model.weakness));
  info.appendChild(weakResistRow('Resistance', 'resistance', model.resistance));
  bar.appendChild(info);

  const region = el('div', 'tcgl-wr__retreat-region');
  const button = el(
    'div',
    `tcgl-retreat ${model.retreatRecede ? 'tcgl-retreat--off' : 'tcgl-retreat--on'}`
  );
  button.dataset.ptcgRetreat = '1';
  button.dataset.ptcgType = typeKeyFor(model.type);
  const content = el('div', 'tcgl-retreat__content');
  content.appendChild(el('span', 'tcgl-retreat__label', 'Retreat'));
  if (model.retreatIcons) {
    const cost = el('span', 'tcgl-retreat__cost');
    for (const icon of model.retreatIcons) cost.appendChild(typeIcon(icon.type, icon.filled));
    content.appendChild(cost);
  } else {
    const short = el('span', 'tcgl-retreat__short');
    const { attached, needed } = model.retreatCount ?? { attached: 0, needed: 0 };
    short.appendChild(typeIcon('colorless', attached > 0));
    const count = el('span', 'tcgl-retreat__count', `${attached}/`);
    count.appendChild(el('b', null, needed));
    short.appendChild(count);
    content.appendChild(short);
  }
  button.appendChild(content);
  if (!model.retreatUsable && model.retreatReason) button.title = model.retreatReason;
  region.appendChild(button);
  bar.appendChild(region);
  return bar;
}
