import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_ART_CORS_HOSTS, isCorsVerifiedHost, textureUrlFor } from '../card-art-hosts.mjs';

test('the five hosts verified to send CORS headers', () => {
  assert.deepEqual([...CARD_ART_CORS_HOSTS].sort(), [
    'assets.tcgdex.net',
    'images.pokemontcg.io',
    'limitlesstcg.nyc3.cdn.digitaloceanspaces.com',
    'limitlesstcg.nyc3.digitaloceanspaces.com',
    'ptcgsim.online',
  ]);
});

test('verified hosts load directly', () => {
  for (const host of CARD_ART_CORS_HOSTS) {
    const src = `https://${host}/set/1/high.webp`;
    assert.equal(isCorsVerifiedHost(src), true, host);
    assert.equal(textureUrlFor(src), src, host);
  }
});

test('any other remote host goes through the proxy with the url encoded', () => {
  assert.equal(isCorsVerifiedHost('https://example.com/x.png'), false);
  assert.equal(
    textureUrlFor('https://example.com/x.png'),
    '/api/card-image?url=https%3A%2F%2Fexample.com%2Fx.png'
  );
  assert.equal(
    textureUrlFor('https://example.com/a b.png?q=1&r=2', { proxyPath: '/p' }),
    '/p?url=https%3A%2F%2Fexample.com%2Fa%20b.png%3Fq%3D1%26r%3D2'
  );
});

test('relative, data: and blob: urls are unchanged', () => {
  assert.equal(textureUrlFor('/src/assets/cardback.png'), '/src/assets/cardback.png');
  assert.equal(textureUrlFor('assets/x.png'), 'assets/x.png');
  const data = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(textureUrlFor(data), data);
  const blob = 'blob:http://localhost/1234';
  assert.equal(textureUrlFor(blob), blob);
  assert.equal(isCorsVerifiedHost('/src/assets/cardback.png'), false);
});

test('protocol-relative urls follow the host rule; empty input passes through', () => {
  assert.equal(textureUrlFor('//assets.tcgdex.net/x.webp'), '//assets.tcgdex.net/x.webp');
  assert.equal(textureUrlFor('//example.com/x.png'), '/api/card-image?url=https%3A%2F%2Fexample.com%2Fx.png');
  assert.equal(textureUrlFor(''), '');
  assert.equal(textureUrlFor(undefined), undefined);
});
