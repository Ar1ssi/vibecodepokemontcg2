import {
  STATUS_MARKER_TYPES,
  getSpecialConditionClass,
} from './special-condition-style.mjs';
import {
  STATUS_TOKEN_BACK,
  STATUS_TOKEN_FRONT,
  isStatusTokenType,
} from './status-token-assets.mjs';
import { setSpecialConditionCode } from './special-condition-code.mjs';

const buildStatusTokenCoin = (doc, className) => {
  const wrap = doc.createElement('div');
  wrap.className = 'coin-3d coin-mat-cardboard status-token-coin';

  const front = doc.createElement('div');
  front.className = 'coin-face coin-front';
  const frontImg = doc.createElement('img');
  frontImg.src = STATUS_TOKEN_FRONT[className];
  frontImg.alt = '';
  front.appendChild(frontImg);

  const back = doc.createElement('div');
  back.className = 'coin-face coin-backc';
  const backImg = doc.createElement('img');
  backImg.src = STATUS_TOKEN_BACK;
  backImg.alt = '';
  back.appendChild(backImg);

  wrap.append(front, back);
  return wrap;
};

const updateTokenFront = (specialCondition, className) => {
  const img = specialCondition.querySelector('.status-token-coin .coin-front img');
  if (img && STATUS_TOKEN_FRONT[className]) {
    img.src = STATUS_TOKEN_FRONT[className];
  }
};

export const applySpecialConditionStyle = (specialCondition, textContent) => {
  const className = getSpecialConditionClass(textContent);
  const doc = specialCondition.ownerDocument;

  specialCondition.classList.add('status-marker');
  specialCondition.classList.remove(...STATUS_MARKER_TYPES);
  specialCondition.classList.add(className);
  specialCondition.style.backgroundColor = '';
  specialCondition.style.color = '';

  if (isStatusTokenType(className)) {
    specialCondition.classList.add('status-token-wrap');
    let coin = specialCondition.querySelector('.status-token-coin');
    if (!coin) {
      specialCondition.textContent = '';
      specialCondition.contentEditable = 'false';
      coin = buildStatusTokenCoin(doc, className);
      const code = doc.createElement('span');
      code.className = 'status-marker-code';
      code.setAttribute('aria-hidden', 'true');
      specialCondition.append(coin, code);
    } else {
      updateTokenFront(specialCondition, className);
    }
    setSpecialConditionCode(specialCondition, textContent);
    return;
  }

  specialCondition.classList.remove('status-token-wrap');
  const coin = specialCondition.querySelector('.status-token-coin');
  if (coin) coin.remove();
  const codeEl = specialCondition.querySelector('.status-marker-code');
  if (codeEl) codeEl.remove();
  if (specialCondition.contentEditable !== 'true') {
    specialCondition.contentEditable = 'true';
  }
  setSpecialConditionCode(specialCondition, textContent);
};
