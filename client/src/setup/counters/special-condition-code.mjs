export function getSpecialConditionCode(el) {
  if (!el) return '';
  const codeEl = el.querySelector('.status-marker-code');
  return (codeEl ? codeEl.textContent : el.textContent).trim();
}

export function setSpecialConditionCode(el, text) {
  if (!el) return;
  const codeEl = el.querySelector('.status-marker-code');
  if (codeEl) {
    codeEl.textContent = text;
  } else {
    el.textContent = text;
  }
}
