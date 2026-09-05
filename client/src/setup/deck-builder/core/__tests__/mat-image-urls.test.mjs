import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matImageProxyUrl,
  matThumbFallbackChain,
  resolveMatBoardUrl,
  resolveMatThumbUrl,
  toAbsoluteClientPath,
} from '../mat-image-urls.mjs';

describe('mat-image-urls', () => {
  it('toAbsoluteClientPath prefixes client-relative asset paths', () => {
    assert.equal(
      toAbsoluteClientPath('src/assets/playmats/thumbs/foo.webp'),
      '/src/assets/playmats/thumbs/foo.webp'
    );
    assert.equal(
      toAbsoluteClientPath('/src/assets/playmats/thumbs/foo.webp'),
      '/src/assets/playmats/thumbs/foo.webp'
    );
  });

  it('matImageProxyUrl wraps allowed CDN hosts', () => {
    const remote = 'https://cdn.artofpkm.com/abc123';
    assert.equal(
      matImageProxyUrl(remote),
      '/api/mat-image?url=' + encodeURIComponent(remote)
    );
  });

  it('matImageProxyUrl rejects unknown hosts', () => {
    assert.equal(
      matImageProxyUrl('https://evil.example/mat.png'),
      'https://evil.example/mat.png'
    );
  });

  it('resolveMatThumbUrl prefers committed thumbs over CDN', () => {
    const mat = {
      thumb: 'src/assets/playmats/thumbs/a.webp',
      imageUrl: 'https://cdn.artofpkm.com/abc',
    };
    assert.equal(
      resolveMatThumbUrl(mat),
      '/src/assets/playmats/thumbs/a.webp'
    );
  });

  it('matThumbFallbackChain uses proxy for CDN fallback, never raw CDN', () => {
    const mat = {
      thumb: 'src/assets/playmats/thumbs/a.webp',
      imageUrl: 'https://cdn.artofpkm.com/abc',
      image: 'src/assets/playmats/png/a.png',
    };
    const chain = matThumbFallbackChain(mat);
    assert.equal(chain.primary, '/src/assets/playmats/thumbs/a.webp');
    assert.equal(
      chain.fallback,
      '/api/mat-image?url=' + encodeURIComponent(mat.imageUrl)
    );
    assert.notEqual(chain.fallback, mat.imageUrl);
  });

  it('resolveMatBoardUrl uses proxy for remote board art', () => {
    const mat = {
      image: 'src/assets/playmats/png/a.png',
      imageUrl: 'https://cdn.artofpkm.com/abc',
    };
    assert.equal(
      resolveMatBoardUrl(mat),
      '/api/mat-image?url=' + encodeURIComponent(mat.imageUrl)
    );
  });
});
