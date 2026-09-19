// Host-level Lost Zone rail.
//
// The Lost Zone (shared `lostZone` zone) is rendered inside the playmat
// iframes, which are clipped to the battle mat (75.5% of the screen). This
// module adds a presentation rail docked to the right edge of the screen,
// outside the mat: it mirrors both players' Lost Zone piles, opens the existing
// full zone display on click, and accepts drag/drop by handing the event to the
// board's own handlers (an explicit `[data-drop-zone]` target in drag.js) — so a
// rail drop is exactly an in-mat drop onto lostZone, same gating and same
// moveCardBundle path. The zone arrays and netcode are untouched.
import { oppContainerDocument, selfContainerDocument } from '../../state.js';
import { dragLeave, dragOver, drop } from '../../setup/image-logic/drag.js';
import { occupiedZoneCount } from '/shared/engine/rules/ko-flow.mjs';
import { getZone } from '../../setup/zones/get-zone.js';

const RAIL_ID = 'lostZoneRail';
const MAX_THUMBS = 14;

function buildRail() {
  let rail = document.getElementById(RAIL_ID);
  if (rail) return rail;

  rail = document.createElement('div');
  rail.id = RAIL_ID;
  rail.innerHTML = `
    <button id="lostZoneRailToggle" type="button" title="Collapse the Lost Zone rail">LZ</button>
    <div class="lost-zone-rail-side" data-lost-user="opp" data-drop-zone="lostZone" data-drop-user="opp">
      <div class="lost-zone-rail-label">Opponent <span class="lost-zone-rail-count" data-lost-count="opp">0</span></div>
      <div class="lost-zone-rail-cards" data-lost-cards="opp"></div>
    </div>
    <div class="lost-zone-rail-side" data-lost-user="self" data-drop-zone="lostZone" data-drop-user="self">
      <div class="lost-zone-rail-label">Lost Zone <span class="lost-zone-rail-count" data-lost-count="self">0</span></div>
      <div class="lost-zone-rail-cards" data-lost-cards="self"></div>
    </div>`;
  document.body.appendChild(rail);

  rail.querySelector('#lostZoneRailToggle')?.addEventListener('click', (event) => {
    event.stopPropagation();
    rail.classList.toggle('collapsed');
  });

  for (const side of rail.querySelectorAll('.lost-zone-rail-side')) {
    // Reuse the board's own drag predicates/drop so a rail drop is exactly an
    // in-mat drop onto lostZone — same gating, same moveCardBundle path.
    side.addEventListener('dragover', dragOver);
    side.addEventListener('dragleave', dragLeave);
    side.addEventListener('drop', drop);
    side.addEventListener('click', () => {
      const zone = getZone(side.dataset.lostUser, 'lostZone');
      if (zone?.element) zone.element.style.display = 'block';
    });
  }

  return rail;
}

function renderSide(rail, user) {
  const cards = rail.querySelector(`[data-lost-cards="${user}"]`);
  const countEl = rail.querySelector(`[data-lost-count="${user}"]`);
  if (!cards) return;

  const zone = getZone(user, 'lostZone');
  const source = zone?.element ? [...zone.element.querySelectorAll('img')] : [];
  const srcs = source.map((img) => img.getAttribute('src')).filter(Boolean);
  // Legacy zone arrays are never populated under server-authoritative rendering
  // (design 002 I24), so derive the count from whatever the zone actually
  // renders, exactly like the KO/win-condition checks do.
  const count = occupiedZoneCount({
    arrayCount: zone?.getCount ? zone.getCount() : 0,
    renderedCount: source.length,
  });

  if (countEl) countEl.textContent = String(count);

  const shown = srcs.slice(-MAX_THUMBS);
  cards.replaceChildren(
    ...shown.map((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      return img;
    })
  );
}

export const initializeLostZonePanel = () => {
  const rail = buildRail();
  const render = () => {
    renderSide(rail, 'self');
    renderSide(rail, 'opp');
  };
  render();

  const config = { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] };
  const observer = new MutationObserver(render);
  const selfZone = selfContainerDocument.getElementById('lostZone');
  const oppZone = oppContainerDocument.getElementById('lostZone');
  if (selfZone) observer.observe(selfZone, config);
  if (oppZone) observer.observe(oppZone, config);
};
