// Duck-typed DOM node description. Attribute reads only: never geometry or text content.
const MAX_CLASSES = 3;
const MAX_DATA_ATTRS = 6;
const MAX_VALUE = 40;
const MAX_HOPS = 4;
const NONE = '[none]';

const isElementLike = (node) => !!node && typeof node === 'object' && typeof node.tagName === 'string';

function classesOf(el) {
  const list = el.classList;
  if (list && typeof list.length === 'number') return Array.from(list);
  return typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean) : [];
}

function kebab(key) {
  return `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function dataPairsOf(el) {
  const attrs = el.attributes;
  if (attrs && typeof attrs.length === 'number') {
    return Array.from(attrs)
      .filter((a) => a && typeof a.name === 'string' && a.name.startsWith('data-'))
      .map((a) => [a.name, a.value]);
  }
  if (el.dataset && typeof el.dataset === 'object') {
    return Object.keys(el.dataset).map((k) => [kebab(k), el.dataset[k]]);
  }
  return [];
}

function parentOf(node) {
  return node.parentElement || node.parentNode || node.host || null;
}

function ancestorWithId(el) {
  let node = el;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let parent = parentOf(node);
    if (parent && !isElementLike(parent) && parent.host) parent = parent.host;
    if (!isElementLike(parent)) return null;
    if (parent.id) return parent;
    node = parent;
  }
  return null;
}

export function describeElement(el) {
  try {
    if (!isElementLike(el)) return NONE;
    let out = el.tagName.toLowerCase();
    if (el.id) out += `#${el.id}`;
    for (const c of classesOf(el).slice(0, MAX_CLASSES)) out += `.${c}`;
    for (const [k, v] of dataPairsOf(el).slice(0, MAX_DATA_ATTRS)) {
      out += `[${k}=${String(v ?? '').slice(0, MAX_VALUE)}]`;
    }
    const anc = ancestorWithId(el);
    if (anc) out += `<${anc.tagName.toLowerCase()}#${anc.id}`;
    return out;
  } catch {
    return NONE;
  }
}
