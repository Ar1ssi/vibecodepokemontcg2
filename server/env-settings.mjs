// How the server reads its environment: one grammar for on/off flags, one rule for "is this a
// deployment", one parser for millisecond settings. Callers hand in `process.env` (or a stand-in).

const ON = /^(1|true|on|yes)$/i;
const OFF = /^(0|false|off|no)$/i;

export const isOn = (value) => ON.test(String(value ?? '').trim());
export const isOff = (value) => OFF.test(String(value ?? '').trim());

/** True on a host that deploys the site: Render sets `RENDER`; anything else sets NODE_ENV. */
export function isDeployHost(env) {
  return isOn(env?.RENDER) || env?.NODE_ENV === 'production';
}

/**
 * A setting in milliseconds. Unset or blank is `fallback`; anything that is not a finite number
 * of zero or more throws, naming the variable, so a typo stops the boot instead of being ignored.
 * @param {Record<string, string | undefined>} env
 * @param {string} name the variable
 * @param {number} fallback
 */
export function readDurationMs(env, name, fallback) {
  const raw = env?.[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}=${JSON.stringify(raw)} is not a number of milliseconds (0 or more).`);
  }
  return value;
}
