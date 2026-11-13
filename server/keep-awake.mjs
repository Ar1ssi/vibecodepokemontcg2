// Keep-awake ping (design 088). A free Render web service is stopped after 15 minutes without an
// inbound request, and the next visitor waits about a minute for it to start. With `KEEP_AWAKE=1`
// the server requests its own public URL every 10 minutes, which counts as inbound traffic.
//
// Off by default: an always-on service uses about 730 of the 750 free instance hours a Render
// workspace gets per month, so it is the owner's call (and only one service can have it).
export const KEEP_AWAKE_PATH = '/healthz';
export const KEEP_AWAKE_INTERVAL_MS = 10 * 60 * 1000;
const PING_TIMEOUT_MS = 10_000;

const isOn = (value) => /^(1|true|on|yes)$/i.test(String(value ?? '').trim());

/**
 * @param {object} [env] `KEEP_AWAKE` turns it on; the address is `KEEP_AWAKE_URL`, else the
 *   `RENDER_EXTERNAL_URL` Render sets on every web service.
 * @returns {{url: string, intervalMs: number}|{error: string}|null} null when switched off.
 */
export function planKeepAwake(env = {}) {
  if (!isOn(env.KEEP_AWAKE)) return null;
  const base = String(env.KEEP_AWAKE_URL || env.RENDER_EXTERNAL_URL || '').trim();
  if (!base) {
    return { error: 'keep-awake: KEEP_AWAKE is on but neither KEEP_AWAKE_URL nor RENDER_EXTERNAL_URL is set; not pinging.' };
  }
  let url;
  try {
    url = new URL(KEEP_AWAKE_PATH, base);
  } catch {
    return { error: `keep-awake: "${base}" is not a URL; not pinging.` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { error: `keep-awake: "${base}" is not an http(s) URL; not pinging.` };
  }
  return { url: url.href, intervalMs: KEEP_AWAKE_INTERVAL_MS };
}

/**
 * Starts the ping loop. A failed ping is reported once, then again only after a success, so a
 * long outage does not fill the log.
 * @param {{url: string, intervalMs: number}} plan
 * @param {{fetchImpl?: typeof fetch, setTimer?: typeof setInterval, clearTimer?: typeof clearInterval, warn?: (message: string) => void}} [deps]
 * @returns {{ping: () => Promise<boolean>, stop: () => void}}
 */
export function startKeepAwake(
  plan,
  { fetchImpl = fetch, setTimer = setInterval, clearTimer = clearInterval, warn = () => {} } = {}
) {
  let failing = false;
  const report = (reason) => {
    if (!failing) warn(`keep-awake: ping to ${plan.url} failed (${reason})`);
    failing = true;
  };
  const ping = async () => {
    try {
      const response = await fetchImpl(plan.url, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
      if (!response.ok) {
        report(`HTTP ${response.status}`);
        return false;
      }
      failing = false;
      return true;
    } catch (error) {
      report(error?.name === 'TimeoutError' ? 'timeout' : (error?.message ?? String(error)));
      return false;
    }
  };
  const timer = setTimer(ping, plan.intervalMs);
  // The ping must never be the thing that keeps the process alive.
  timer?.unref?.();
  return { ping, stop: () => clearTimer(timer) };
}
