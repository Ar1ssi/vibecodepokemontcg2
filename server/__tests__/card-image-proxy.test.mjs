import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardImageHandler } from '../card-image-proxy.mjs';
import { CARD_ART_PROXY_HOSTS } from '../card-art-proxy-hosts.mjs';

const ART = 'https://assets.tcgdex.net/en/sv/sv1/1/high.png';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function upstream({ status = 200, body = PNG, headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

function fakeFetch(respond) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init, calls.length);
  };
  return { impl, calls };
}

const req = (url) => ({ query: url === undefined ? {} : { url } });

function fakeRes() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

const pngResponse = () => upstream({ headers: { 'content-type': 'image/png' } });

async function run(handler, url) {
  const res = fakeRes();
  await handler(req(url), res);
  return res;
}

test('the proxy host set covers every CORS-verified card art host', () => {
  for (const host of [
    'assets.tcgdex.net',
    'images.pokemontcg.io',
    'limitlesstcg.nyc3.digitaloceanspaces.com',
    'limitlesstcg.nyc3.cdn.digitaloceanspaces.com',
    'ptcgsim.online',
    'pokemon-sleeve-database.com',
  ]) {
    assert.ok(CARD_ART_PROXY_HOSTS.has(host), host);
  }
});

test('a missing or invalid url is a 400 and never fetches', async () => {
  const { impl, calls } = fakeFetch(pngResponse);
  const handler = createCardImageHandler({ fetchImpl: impl, allowedHosts: CARD_ART_PROXY_HOSTS });
  assert.equal((await run(handler)).statusCode, 400);
  assert.equal((await run(handler, 'not a url')).statusCode, 400);
  assert.equal((await run(handler, 'ftp://assets.tcgdex.net/x.png')).statusCode, 400);
  assert.equal(calls.length, 0);
});

test('a host outside the allowed set is a 403 and never fetches', async () => {
  const { impl, calls } = fakeFetch(pngResponse);
  const handler = createCardImageHandler({ fetchImpl: impl, allowedHosts: CARD_ART_PROXY_HOSTS });
  const res = await run(handler, 'https://example.com/x.png');
  assert.equal(res.statusCode, 403);
  assert.equal(calls.length, 0);
});

test('an upstream 404 is a 502', async () => {
  const { impl } = fakeFetch(() => upstream({ status: 404 }));
  const handler = createCardImageHandler({ fetchImpl: impl, allowedHosts: CARD_ART_PROXY_HOSTS });
  assert.equal((await run(handler, ART)).statusCode, 502);
});

test('a fetch aborted by the timeout is a 504', async () => {
  const { impl } = fakeFetch(() => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  });
  const handler = createCardImageHandler({ fetchImpl: impl, allowedHosts: CARD_ART_PROXY_HOSTS });
  assert.equal((await run(handler, ART)).statusCode, 504);
});

test('the timeout aborts a hanging fetch', async () => {
  const impl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  const handler = createCardImageHandler({ fetchImpl: impl, allowedHosts: CARD_ART_PROXY_HOSTS, timeoutMs: 5 });
  assert.equal((await run(handler, ART)).statusCode, 504);
});

test('a body over the cap is a 413, by declared length or by bytes read', async () => {
  const big = Buffer.alloc(32, 1);
  const declared = fakeFetch(() =>
    upstream({ body: big, headers: { 'content-type': 'image/png', 'content-length': '32' } })
  );
  const byHeader = createCardImageHandler({
    fetchImpl: declared.impl,
    allowedHosts: CARD_ART_PROXY_HOSTS,
    maxBodyBytes: 16,
  });
  assert.equal((await run(byHeader, ART)).statusCode, 413);

  const undeclared = fakeFetch(() => upstream({ body: big, headers: { 'content-type': 'image/png' } }));
  const byBytes = createCardImageHandler({
    fetchImpl: undeclared.impl,
    allowedHosts: CARD_ART_PROXY_HOSTS,
    maxBodyBytes: 16,
  });
  assert.equal((await run(byBytes, ART)).statusCode, 413);
});

test('a non-image upstream body is a 502', async () => {
  const { impl } = fakeFetch(() => upstream({ headers: { 'content-type': 'text/html' } }));
  const handler = createCardImageHandler({ fetchImpl: impl, allowedHosts: CARD_ART_PROXY_HOSTS });
  assert.equal((await run(handler, ART)).statusCode, 502);
});

test('success sends the body with type, cache and CORS headers; the repeat comes from memory', async () => {
  const { impl, calls } = fakeFetch(pngResponse);
  const handler = createCardImageHandler({ fetchImpl: impl, allowedHosts: CARD_ART_PROXY_HOSTS });
  for (let i = 0; i < 2; i += 1) {
    const res = await run(handler, ART);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, PNG);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.equal(res.headers['cache-control'], 'public, max-age=86400');
    assert.equal(res.headers['access-control-allow-origin'], '*');
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ART);
  assert.equal(calls[0].init.redirect, 'manual');
});

test('the LRU keeps maxEntries bodies and entries expire after a day', async () => {
  let clock = 0;
  const { impl, calls } = fakeFetch(pngResponse);
  const handler = createCardImageHandler({
    fetchImpl: impl,
    allowedHosts: CARD_ART_PROXY_HOSTS,
    maxEntries: 1,
    now: () => clock,
  });
  const other = 'https://images.pokemontcg.io/sv1/1_hires.png';
  await run(handler, ART);
  await run(handler, other);
  await run(handler, ART);
  assert.equal(calls.length, 3);
  clock = 24 * 60 * 60 * 1000 + 1;
  await run(handler, ART);
  assert.equal(calls.length, 4);
});

test('a redirect is followed only within the allowed hosts', async () => {
  const ok = fakeFetch((_url, _init, n) =>
    n === 1
      ? upstream({ status: 302, headers: { location: 'https://images.pokemontcg.io/a.png' } })
      : pngResponse()
  );
  const follows = createCardImageHandler({ fetchImpl: ok.impl, allowedHosts: CARD_ART_PROXY_HOSTS });
  assert.equal((await run(follows, ART)).statusCode, 200);
  assert.equal(ok.calls[1].url, 'https://images.pokemontcg.io/a.png');

  const away = fakeFetch(() => upstream({ status: 302, headers: { location: 'https://example.com/a.png' } }));
  const refuses = createCardImageHandler({ fetchImpl: away.impl, allowedHosts: CARD_ART_PROXY_HOSTS });
  assert.equal((await run(refuses, ART)).statusCode, 403);
  assert.equal(away.calls.length, 1);
});
