import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../state.js';
import { cardBackSrcForUser } from '../deck-constructor/hydrate-holo.js';
import { mapIframeLocalToViewport, readFrameTransform } from './iframe-rect.mjs';
import {
  SHUFFLE_DURATION_MS,
  shuffleFlightPlan,
  visualCardCount,
} from './shuffle-pose.mjs';

const DEFAULT_SLEEVE = 'https://ptcgsim.online/src/assets/cardback.png';

const activeByUser = { self: null, opp: null };

const visualRectOf = (el) => {
  const local = el.getBoundingClientRect();
  const frame = el.ownerDocument?.defaultView?.frameElement;
  if (!frame) {
    return {
      left: local.left,
      top: local.top,
      width: local.width,
      height: local.height,
    };
  }
  const { frameRect, matrix, origin } = readFrameTransform(frame);
  return mapIframeLocalToViewport(local, frameRect, matrix, origin);
};

const zoneOriginEl = (user, zoneId) => {
  const doc = user === 'self' ? selfContainerDocument : oppContainerDocument;
  if (!doc) return null;
  if (['deck', 'discard', 'lostZone'].includes(zoneId)) {
    const cover = doc.getElementById(`${zoneId}Cover`);
    return cover?.querySelector('img') || cover;
  }
  return doc.getElementById(zoneId);
};

const boardRectOf = () => {
  const mat = document.getElementById('battleMat');
  if (mat) return mat.getBoundingClientRect();
  const self = document.getElementById('selfContainer');
  const opp = document.getElementById('oppContainer');
  const a = self?.getBoundingClientRect();
  const b = opp?.getBoundingClientRect();
  if (a && b) {
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    return {
      left,
      top,
      width: Math.max(a.right, b.right) - left,
      height: Math.max(a.bottom, b.bottom) - top,
    };
  }
  return {
    left: 0,
    top: 0,
    width: globalThis.innerWidth || 0,
    height: globalThis.innerHeight || 0,
  };
};

const cancelShuffle = (user) => {
  const run = activeByUser[user];
  if (!run) return;
  if (run.rafId != null) cancelAnimationFrame(run.rafId);
  run.hosts.forEach((host) => host.remove());
  activeByUser[user] = null;
};

const applyPose = (host, pose) => {
  host.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.rotate}deg) scale(${pose.scale})`;
  host.style.zIndex = String(2300 + Math.round((pose.z + 1) * 8));
};

const buildCard = (deckRect, sleeveSrc) => {
  const host = document.createElement('div');
  host.className = 'card-shuffle-flight';
  host.style.left = `${deckRect.left}px`;
  host.style.top = `${deckRect.top}px`;
  host.style.width = `${deckRect.width}px`;
  host.style.height = `${deckRect.height}px`;
  const img = document.createElement('img');
  img.src = sleeveSrc;
  img.alt = '';
  img.draggable = false;
  host.appendChild(img);
  return host;
};

export const playShuffleFlight = (user, zoneId, zoneCount) => {
  if (typeof document === 'undefined') return;
  const count = visualCardCount(zoneCount);
  const originEl = zoneOriginEl(user, zoneId);
  if (!count || !originEl) return;

  const deckRect = visualRectOf(originEl);
  if (deckRect.width < 2 || deckRect.height < 2) return;

  cancelShuffle(user);

  const sleeveSrc = cardBackSrcForUser(user) || DEFAULT_SLEEVE;
  const boardRect = boardRectOf();
  const hosts = Array.from({ length: count }, () => {
    const host = buildCard(deckRect, sleeveSrc);
    document.body.appendChild(host);
    return host;
  });

  const run = { hosts, rafId: null, started: null };
  activeByUser[user] = run;

  const tick = (now) => {
    if (activeByUser[user] !== run) return;
    if (run.started == null) run.started = now;
    const t = Math.min(1, (now - run.started) / SHUFFLE_DURATION_MS);
    const plan = shuffleFlightPlan({
      deckRect,
      boardRect,
      cardCount: count,
      t,
    });
    plan.forEach((pose, i) => applyPose(hosts[i], pose));
    if (t < 1) {
      run.rafId = requestAnimationFrame(tick);
      return;
    }
    hosts.forEach((host) => host.remove());
    if (activeByUser[user] === run) activeByUser[user] = null;
  };

  const initial = shuffleFlightPlan({
    deckRect,
    boardRect,
    cardCount: count,
    t: 0,
  });
  initial.forEach((pose, i) => applyPose(hosts[i], pose));
  run.rafId = requestAnimationFrame(tick);
};
