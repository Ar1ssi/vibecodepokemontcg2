// Never-throwing serializer for log details: bounded depth/size, cycles, DOM nodes, errors.
import { describeElement } from './describe-element.mjs';

const STACK_CHARS = 4000;
// Values under keys that look like credentials never reach a log (a seat token in a logged
// socket payload would let whoever reads an export take that seat).
const SECRET_KEY = /token|passw|secret|authorization|cookie/i;
export const REDACTED = '[redacted]';
const TRUNCATED_KEYS = 20;

const more = (n) => `…(+${n})`;

function sanitizeList(items, state, depth) {
  const out = items.slice(0, state.maxArray).map((item) => sanitize(item, state, depth + 1));
  if (items.length > state.maxArray) out.push(more(items.length - state.maxArray));
  return out;
}

function sanitizeError(err, state, depth) {
  const out = {
    name: sanitize(err.name, state, depth + 1),
    message: sanitize(err.message, state, depth + 1),
    stack: typeof err.stack === 'string' ? err.stack.slice(0, STACK_CHARS) : undefined,
  };
  if (err.cause !== undefined) out.cause = sanitize(err.cause, state, depth + 1);
  return out;
}

function sanitizeObject(obj, state, depth) {
  const out = {};
  for (const key of Object.keys(obj)) {
    try {
      if (SECRET_KEY.test(key)) {
        out[key] = REDACTED;
        continue;
      }
      const v = sanitize(obj[key], state, depth + 1);
      if (v !== undefined) out[key] = v;
    } catch {
      out[key] = '[Threw]';
    }
  }
  return out;
}

function sanitizeContainer(value, state, depth) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '[Invalid Date]' : value.toISOString();
  }
  if (typeof value.nodeType === 'number') return describeElement(value);
  if (value instanceof Error) return sanitizeError(value, state, depth);
  if (value instanceof Map) return sanitizeList(Array.from(value.entries()), state, depth);
  if (value instanceof Set) return sanitizeList(Array.from(value), state, depth);
  if (Array.isArray(value)) return sanitizeList(value, state, depth);
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return sanitizeList(Array.from(value), state, depth);
  }
  return sanitizeObject(value, state, depth);
}

function sanitize(value, state, depth) {
  switch (typeof value) {
    case 'undefined':
      return undefined;
    case 'string':
      return value.length > state.maxString ? value.slice(0, state.maxString) + more(value.length - state.maxString) : value;
    case 'number':
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'symbol':
      return `[Symbol ${value.description ?? ''}]`;
    case 'function':
      return `[Function ${value.name || 'anonymous'}]`;
    default:
  }
  if (value === null) return null;
  if (state.path.has(value)) return '[Circular]';
  if (depth > state.maxDepth) return '[Depth]';
  state.path.add(value);
  try {
    return sanitizeContainer(value, state, depth);
  } finally {
    state.path.delete(value);
  }
}

function truncationStub(value, bytes) {
  let keys = [];
  try {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = Object.keys(value).slice(0, TRUNCATED_KEYS);
    }
  } catch {
    keys = [];
  }
  return JSON.stringify({ _truncated: true, bytes, keys });
}

export function safeStringify(
  value,
  { maxBytes = 2048, maxDepth = 6, maxArray = 50, maxString = 500 } = {}
) {
  try {
    const state = { maxDepth, maxArray, maxString, path: new Set() };
    const text = JSON.stringify(sanitize(value, state, 0)) ?? 'null';
    return text.length > maxBytes ? truncationStub(value, text.length) : text;
  } catch {
    return '"[Unserializable]"';
  }
}
