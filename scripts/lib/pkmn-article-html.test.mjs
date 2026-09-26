import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSpanInnerHtml } from './pkmn-article-html.mjs';

// Real pkmncards shapes: a symbol name (nested .vh spans), a name followed by a
// sibling HP span, and a plain name. The old non-greedy regex truncated the
// first and swallowed the sibling in the second.
test('extractSpanInnerHtml: nested symbol spans stay whole', () => {
  const html =
    '<div class="name-hp-color"><span class="name" title="Name">Fairy Charm ' +
    '<abbr title="Lightning" class="ptcg-font ptcg-symbol-name">' +
    '<span class="vh">{</span>L<span class="vh">}</span></abbr></span></div>';
  assert.equal(extractSpanInnerHtml(html, 'name'), 'Fairy Charm <abbr title="Lightning" class="ptcg-font ptcg-symbol-name"><span class="vh">{</span>L<span class="vh">}</span></abbr>');
});

test('extractSpanInnerHtml: a following sibling span is not captured', () => {
  const html =
    '<div class="name-hp-color"><span class="name" title="Name">Unidentified Fossil</span>' +
    '<span class="hp" title="HP">60 HP</span></div>';
  assert.equal(extractSpanInnerHtml(html, 'name'), 'Unidentified Fossil');
});

test('extractSpanInnerHtml: plain name, missing marker and unclosed markup', () => {
  assert.equal(
    extractSpanInnerHtml('<span class="name">Clefairy Doll</span></div>', 'name'),
    'Clefairy Doll'
  );
  assert.equal(extractSpanInnerHtml('<span class="other">X</span>', 'name'), '');
  assert.equal(extractSpanInnerHtml('<span class="name">X', 'name'), '');
});
