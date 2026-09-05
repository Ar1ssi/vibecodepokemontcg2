import {
  STATUS_MARKER_TYPES,
  getSpecialConditionClass,
} from '../../setup/counters/special-condition-style.mjs';

export const applySpecialConditionStyle = (specialCondition, textContent) => {
  specialCondition.classList.add('status-marker');
  specialCondition.classList.remove(...STATUS_MARKER_TYPES);
  specialCondition.classList.add(getSpecialConditionClass(textContent));
  specialCondition.style.backgroundColor = '';
  specialCondition.style.color = '';
};
