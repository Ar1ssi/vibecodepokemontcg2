/**
 * @file Stack view info panel (design 074) — StackedCardOverlay_Landscape's CardInfoPanel, the DOM
 * half with no board or browser-only imports, so it renders under node tests. stack-view.mjs mounts
 * it beside the card carousel.
 */

import { isPokemonToolCard } from '../../../../shared/engine/rules/ability-executors.mjs';
import { attachedEnergyUnits } from './attack-ui-model.mjs';
import {
  buildAbilityOption,
  buildAttackOption,
  buildWeakResistBar,
  typeIcon,
} from './attack-options.mjs';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

// NameHPRegion: the name left, "remaining/<b>max</b>" and the type icons right, the HP bar beneath.
const nameHpRegion = (model) => {
  const region = el('div', 'tcgl-stack__namehp');
  region.appendChild(el('span', 'tcgl-stack__name', model.name));
  const right = el('span', 'tcgl-stack__hp');
  const hp = Number(model.hp) || 0;
  const remaining = Math.max(0, hp - (Number(model.damage) || 0));
  const total = el('span', 'tcgl-stack__hp-total', `${remaining}/`);
  total.appendChild(el('b', null, hp));
  right.appendChild(total);
  for (const type of model.types ?? []) right.appendChild(typeIcon(type, true, 'tcgl-icon tcgl-stack__hp-type'));
  region.appendChild(right);
  const bar = el('div', 'tcgl-stack__hpbar');
  const fill = el('div', 'tcgl-stack__hpfill');
  fill.style.width = `${hp > 0 ? (remaining / hp) * 100 : 0}%`;
  bar.appendChild(fill);
  region.appendChild(bar);
  return region;
};

// AttachedEnergyDisplayUI / PokemonToolDisplayUI: a title, the "x<b>count</b>" total and the icons.
const attachedRow = (className, title, count, icons) => {
  const row = el('div', `tcgl-stack__attached ${className}`);
  const info = el('span', 'tcgl-stack__attached-info');
  info.appendChild(el('span', 'tcgl-stack__attached-title', title));
  const total = el('span', 'tcgl-stack__attached-total', 'x');
  total.appendChild(el('b', null, count));
  info.appendChild(total);
  row.appendChild(info);
  const list = el('span', 'tcgl-stack__attached-list');
  list.append(...icons);
  row.appendChild(list);
  return row;
};

const energyIcons = (energyTypes) =>
  attachedEnergyUnits(energyTypes).map((unit) =>
    typeIcon(unit.length > 1 ? 'rainbow' : unit[0] ?? 'colorless', true)
  );

const toolIcons = (tools) =>
  tools.map((tool) => {
    const frame = el('span', 'tcgl-stack__tool');
    const img = el('img', 'tcgl-stack__tool-art');
    img.src = String(tool.src ?? tool.image?.src ?? '');
    img.alt = String(tool.name ?? 'Pokémon Tool');
    img.title = img.alt;
    img.draggable = false;
    frame.appendChild(img);
    return frame;
  });

// Btn_FilterButtonLarge: "Status Effects" with the Buff / Debuff arrows lit when present.
const statusButton = (statuses, onStatus) => {
  const button = el('button', 'tcgl-stack__status');
  button.type = 'button';
  const hasBuffs = statuses.positive.length > 0;
  const hasDebuffs = statuses.negative.length > 0;
  button.disabled = !hasBuffs && !hasDebuffs;
  button.appendChild(el('span', `tcgl-stack__status-icon tcgl-stack__status-icon--buff${hasBuffs ? ' is-on' : ''}`));
  button.appendChild(
    el('span', `tcgl-stack__status-icon tcgl-stack__status-icon--debuff${hasDebuffs ? ' is-on' : ''}`)
  );
  button.appendChild(el('span', 'tcgl-stack__status-text', 'Status Effects'));
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!button.disabled) onStatus();
  });
  return button;
};

/**
 * The CardInfoPanel. `model` is the read-only inspector model (card-inspector `stackViewModelFor`),
 * `energyTypes` its attached Energy entries; `onStatus` opens the status popup.
 *
 * @param {object} options
 * @param {object} options.card
 * @param {object} options.model
 * @param {Array} [options.energyTypes]
 * @param {{ positive: object[], negative: object[] }} [options.statuses]
 * @param {() => void} [options.onStatus]
 * @returns {HTMLElement}
 */
export function buildStackInfoPanel({
  card,
  model,
  energyTypes = [],
  statuses = { positive: [], negative: [] },
  onStatus = () => {},
}) {
  const panel = el('section', 'tcgl-stack__panel');
  const header = el('header', 'tcgl-stack__header');
  header.appendChild(nameHpRegion(model));
  const energy = energyIcons(energyTypes);
  header.appendChild(attachedRow('tcgl-stack__attached--energy', 'Attached Energy', energy.length, energy));
  const tools = (card.attachedCards || []).filter(isPokemonToolCard);
  header.appendChild(attachedRow('tcgl-stack__attached--tools', 'Attached Tools', tools.length, toolIcons(tools)));
  panel.appendChild(header);

  const list = el('div', 'tcgl-stack__list');
  if (model.kind === 'pokemon') {
    if (model.ability) list.appendChild(buildAbilityOption(model.ability, model.type));
    model.attacks.forEach((attack) => list.appendChild(buildAttackOption(attack, model.type)));
  }
  panel.appendChild(list);

  const footer = el('footer', 'tcgl-stack__footer');
  if (model.kind === 'pokemon') footer.appendChild(buildWeakResistBar(model));
  footer.appendChild(statusButton(statuses, onStatus));
  panel.appendChild(footer);
  return panel;
}
