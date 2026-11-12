// Pure helpers that keep typed text out of the log.
const EDITABLE_TAGS = new Set(['input', 'textarea', 'select']);
const PASS_KEYS = new Set(['Enter', 'Escape', 'Tab']);

export function isEditable(target) {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  return typeof target.tagName === 'string' && EDITABLE_TAGS.has(target.tagName.toLowerCase());
}

export function eventTarget(event) {
  return event.composedPath?.()[0] ?? event.target;
}

export function describeKey(event) {
  const mods =
    (event.ctrlKey ? 'c' : '') + (event.altKey ? 'a' : '') + (event.shiftKey ? 's' : '') + (event.metaKey ? 'm' : '');
  const hidden = isEditable(eventTarget(event)) && !PASS_KEYS.has(event.key);
  return { key: hidden ? '[text]' : event.key, mods };
}

export function describeChange(target) {
  const type = String(target?.type ?? '').toLowerCase();
  if (type === 'checkbox' || type === 'radio') return { checked: Boolean(target.checked) };
  const tag = String(target?.tagName ?? '').toLowerCase();
  if (tag === 'select' || type === 'range' || type === 'number' || type === 'color') {
    return { value: String(target.value).slice(0, 80) };
  }
  return { length: String(target?.value ?? '').length };
}
