import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardArtProxyHandler, createCardArtProxy, parseCardArtUrl } from '../card-art-proxy.mjs';

const ART = 'https://assets.tcgdex.net/en/me/me02/088/high.webp';

function fakeFetch(responder) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = responder(url);
    if (next instanceof Error) throw next;
    const headers = new Map(Object.entries(next.headers || { 'content-type': 'image/webp' }));
    const body = next.body ?? Buffer.from('RIFFwebp');
    return {
      status: next.status ?? 200,
      headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
    };
  };
  return { impl, calls };
}

test('parseCardArtUrl takes TCGdex card art and nothing else', () => {
  assert.equal(parseCardArtUrl(ART), ART);
  assert.equal(parseCardArtUrl('https://assets.tcgdex.net/en/sv/sv06/logo.png'), 'https://assets.tcgdex.net/en/sv/sv06/logo.png');
  for (const raw of [
    undefined,
    ['x'],
    'not a url',
    'http://assets.tcgdex.net/en/me/me02/088/high.webp',
    'https://assets.tcgdex.net.evil.example/en/a.webp',
    'https://evil.example/en/a.webp',
    'https://assets.tcgdex.net:8443/en/a.webp',
    'https://user@assets.tcgdex.net/en/a.webp',
    'https://assets.tcgdex.net/en/me/me02/088/high.webp?x=1',
    'https://assets.tcgdex.net/en/me/me02/088/high.svg',
    'https://assets.tcgdex.net/en/me/me02/088/',
    'https://assets.tcgdex.net//etc/a.png',
    `https://assets.tcgdex.net/${'a'.repeat(400)}.png`,
  ]) {
    assert.equal(parseCardArtUrl(raw), null, String(raw));
  }
});

test('a card is fetched upstream once however many ask, without following redirects', async () => {
  const { impl, calls } = fakeFetch(() => ({}));
  const proxy = createCardArtProxy({ fetchImpl: impl });
  const results = await Promise.all(Array.from({ length: 4 }, () => proxy.get(ART)));
  await proxy.get(ART);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, 'manual');
  for (const result of results) {
    assert.equal(result.status, 200);
    assert.equal(result.type, 'image/webp');
    assert.equal(result.body.toString(), 'RIFFwebp');
  }
});

test('non-images, oversized images, redirects, errors and timeouts are refused and not cached', async () => {
  const cases = [
    [{ headers: { 'content-type': 'text/html' } }, 502],
    [{ headers: { 'content-type': 'image/webp', 'content-length': String(9 * 1024 * 1024) } }, 502],
    [{ body: Buffer.alloc(2048) }, 502],
    [{ status: 302, headers: { location: 'https://evil.example/' } }, 502],
    [{ status: 404 }, 404],
    [new Error('socket hang up'), 502],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 504],
  ];
  for (const [response, status] of cases) {
    const { impl, calls } = fakeFetch(() => response);
    const proxy = createCardArtProxy({ fetchImpl: impl, maxImageBytes: 1024 });
    assert.equal((await proxy.get(ART)).status, status);
    await proxy.get(ART);
    assert.equal(calls.length, 2, `${status} is not cached`);
    assert.equal(proxy.size(), 0);
  }
});

test('the cache keeps to its byte budget, dropping the least recently used card', async () => {
  const { impl } = fakeFetch(() => ({ body: Buffer.alloc(400, 1) }));
  const proxy = createCardArtProxy({ fetchImpl: impl, maxBytes: 1000 });
  const url = (n) => `https://assets.tcgdex.net/en/me/me02/${n}/high.webp`;
  await proxy.get(url(1));
  await proxy.get(url(2));
  await proxy.get(url(1)); // 1 is now the most recent
  await proxy.get(url(3)); // over budget: 2 goes
  assert.equal(proxy.size(), 2);
  assert.ok(proxy.bytes() <= 1000);
  const { impl: counting, calls } = fakeFetch(() => ({ body: Buffer.alloc(400, 1) }));
  const second = createCardArtProxy({ fetchImpl: counting, maxBytes: 1000 });
  await second.get(url(1));
  await second.get(url(2));
  await second.get(url(1));
  await second.get(url(3));
  await second.get(url(1));
  assert.equal(calls.length, 3, 'card 1 stayed cached');
});

test('upstream requests in flight are capped', async () => {
  let active = 0;
  let peak = 0;
  const impl = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    const body = Buffer.from('img');
    return {
      status: 200,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'image/png' : null) },
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
    };
  };
  const proxy = createCardArtProxy({ fetchImpl: impl, concurrency: 2 });
  await Promise.all(
    Array.from({ length: 7 }, (_, n) => proxy.get(`https://assets.tcgdex.net/en/me/me02/${n}/high.png`))
  );
  assert.equal(peak, 2);
});

function fakeResponse() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
  };
  res.type = (type) => {
    res.headers['content-type'] = type;
    return res;
  };
  res.send = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test('the handler serves allowed art with long caching and refuses anything else', async () => {
  const { impl, calls } = fakeFetch(() => ({}));
  const handler = cardArtProxyHandler(createCardArtProxy({ fetchImpl: impl }));
  const ok = fakeResponse();
  await handler({ query: { url: ART } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['content-type'], 'image/webp');
  assert.match(ok.headers['cache-control'], /immutable/);
  assert.equal(ok.headers['x-content-type-options'], 'nosniff');

  const refused = fakeResponse();
  await handler({ query: { url: 'https://evil.example/a.png' } }, refused);
  assert.equal(refused.statusCode, 400);
  assert.equal(calls.length, 1, 'a refused url never reaches upstream');
});
