// Design 063 § Pinned contracts B: the generic parameter checker shared by drawer params
// (move-spec.mjs) and card-motion params (card-motion.mjs). A schema is
// `{ key: [kind, ...] }` with
//   'num'    [min, max, default]        'int'  [min, max, default]
//   'enum'   [values, default]          'deg'  [default]   (screen degrees, any finite)
//   'arms'   [default]                  'target' [default] ('attacker' | 'defender')
//   'pair'   [min, max, [d0, d1]]       (two numbers, d0 <= d1)
//   'palette' [default]                 (design 065: an object whose keys are a subset of
//                                         PALETTE_KEYS, each a '#RRGGBB' string)
//   'hexes'  [min, max, default]        (design 065: min..max '#RRGGBB' strings)
// DOM-free.

export const ARM_PRESETS = Object.freeze(['dai', 'cross', 'ring']);
export const TARGETS = Object.freeze(['attacker', 'defender']);
/** Design 065: the palette keys a beat `tint` may replace. */
export const PALETTE_KEYS = Object.freeze(['deep', 'body', 'hot', 'core']);

const HEX = /^#[0-9a-fA-F]{6}$/;
const isHex = (v) => typeof v === 'string' && HEX.test(v);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The default a schema entry declares. */
export function defaultOf(entry) {
  const [kind] = entry;
  if (kind === 'num' || kind === 'int' || kind === 'pair' || kind === 'hexes') return entry[3];
  if (kind === 'enum') return entry[2];
  return entry[1];
}

const checkArms = (value) => {
  if (typeof value === 'string') return ARM_PRESETS.includes(value) ? null : 'a known arms preset';
  if (!Array.isArray(value) || value.length === 0) return "'dai', 'cross', 'ring' or a non-empty array";
  return value.every((arm) => isObject(arm) && isNum(arm.angle) && isNum(arm.reach) && arm.reach > 0)
    ? null
    : 'arms of { angle, reach > 0 }';
};

/** The error for one value against one schema entry, or null. */
function checkEntry(entry, value) {
  const [kind] = entry;
  if (kind === 'num') return isNum(value) && value >= entry[1] && value <= entry[2] ? null : `a number in [${entry[1]}, ${entry[2]}]`;
  if (kind === 'int') return Number.isInteger(value) && value >= entry[1] && value <= entry[2] ? null : `an integer in [${entry[1]}, ${entry[2]}]`;
  if (kind === 'enum') return entry[1].includes(value) ? null : `one of ${entry[1].join('/')}`;
  if (kind === 'deg') return isNum(value) ? null : 'a finite number of degrees';
  if (kind === 'target') return TARGETS.includes(value) ? null : 'attacker or defender';
  if (kind === 'arms') return checkArms(value);
  // `null` is the 'none' default of both colour kinds.
  if ((kind === 'palette' || kind === 'hexes') && value === null) return null;
  if (kind === 'palette') {
    const ok = isObject(value) && Object.entries(value).every(([k, v]) => PALETTE_KEYS.includes(k) && isHex(v));
    return ok ? null : `an object of ${PALETTE_KEYS.join('/')} '#RRGGBB' colours`;
  }
  if (kind === 'hexes') {
    const ok = Array.isArray(value) && value.length >= entry[1] && value.length <= entry[2] && value.every(isHex);
    return ok ? null : `${entry[1]}-${entry[2]} '#RRGGBB' colours`;
  }
  if (kind === 'pair') {
    const ok =
      Array.isArray(value) &&
      value.length === 2 &&
      value.every((v) => isNum(v) && v >= entry[1] && v <= entry[2]) &&
      value[0] <= value[1];
    return ok ? null : `a pair [a <= b] in [${entry[1]}, ${entry[2]}]`;
  }
  return `a known kind (${kind})`;
}

/**
 * Errors for `params` against `schema`: unknown key, wrong type, out of range.
 * `label` prefixes every message.
 * @returns {string[]}
 */
export function checkAgainst(schema, params, label) {
  if (params === undefined || params === null) return [];
  if (!isObject(params)) return [`${label}: params must be an object`];
  const errors = [];
  for (const [key, value] of Object.entries(params)) {
    if (!Object.hasOwn(schema, key)) {
      errors.push(`${label}: unknown param '${key}'`);
      continue;
    }
    const expected = checkEntry(schema[key], value);
    if (expected) errors.push(`${label}: param '${key}' must be ${expected}`);
  }
  return errors;
}

/** `params` with every missing key filled from the schema's defaults (a fresh object). */
export function fillDefaults(schema, params) {
  const out = {};
  for (const [key, entry] of Object.entries(schema)) {
    const given = params?.[key];
    const fallback = defaultOf(entry);
    out[key] = given === undefined ? (Array.isArray(fallback) ? [...fallback] : fallback) : given;
  }
  return out;
}
