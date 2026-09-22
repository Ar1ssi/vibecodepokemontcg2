import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');

// The board cards, damage counters and status tokens live inside the playmat
// iframes, which cannot see the parent page's `body.fx-off`. Design 022 shipped
// idle motion that therefore kept running with effects "off"; design 024 slice
// 5 mirrors the marker classes onto each iframe's <html> instead.
//
// These tests parse the sheets rather than grepping for a substring: a new
// unguarded idle loop has to actually FAIL them. The check is coverage by
// selector tokens — a guard covers a rule when the guard's own compound is a
// subset of the rule's (`:root.fx-off .self-circle.status-marker` covers
// `.self-circle.status-marker.status-asleep`), which is how the guards are
// written and what makes them win on specificity too.
const IFRAME_SHEETS = ['mat-ambient.css', 'status-marker.css', 'damage-counter.css'];
const GUARDS = [':root.fx-off', ':root.fx-reduced'];

/** Every `selector { ... }` block in a sheet, with @-blocks stripped. */
function rules(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Drop @media/@keyframes bodies so their inner rules are not mistaken for
  // top-level ones (the media query is asserted separately, below).
  const withoutAtBlocks = withoutComments.replace(
    /@[\w-]+[^{]*\{(?:[^{}]*\{[^{}]*\}\s*)*[^{}]*\}/g,
    ''
  );
  return [...withoutAtBlocks.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

/**
 * Split a selector list on top-level commas only. `:has(> img, > .mat-holo)`
 * carries a comma INSIDE its parentheses, which a plain `.split(',')` tears in
 * half — so depth has to be tracked.
 */
function splitSelectorList(selectorList) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of selectorList) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

/** Class/id tokens of a selector, with :where()/:has()/pseudo wrappers removed. */
const tokensOf = (selector) =>
  new Set(selector.replace(/:where\(|:has\([^)]*\)|\)/g, ' ').match(/[.#][\w-]+/g) ?? []);

const isSubset = (a, b) => [...a].every((t) => b.has(t));

/** Selectors (split on commas) that start an infinite animation. */
function idleSelectors(css) {
  const out = [];
  for (const rule of rules(css)) {
    if (!/animation:[^;]*\binfinite\b/.test(rule.body)) continue;
    out.push(...splitSelectorList(rule.selector));
  }
  return out;
}

/** Selectors of rules that switch animation off, per guard prefix. */
function guardSelectors(css, guard) {
  const out = [];
  for (const rule of rules(css)) {
    if (!/animation:\s*none/.test(rule.body)) continue;
    for (const part of splitSelectorList(rule.selector)) {
      if (part.startsWith(guard)) out.push(part.slice(guard.length).trim());
    }
  }
  return out;
}

test('every iframe sheet with idle motion carries both marker guards', () => {
  for (const name of IFRAME_SHEETS) {
    const css = read(name);
    assert.ok(idleSelectors(css).length > 0, `${name} is expected to define idle motion`);
    for (const guard of GUARDS) {
      assert.ok(guardSelectors(css, guard).length > 0, `${name} has no ${guard} rule`);
    }
  }
});

test('every infinite idle loop in the iframes is covered by a guard', () => {
  for (const name of IFRAME_SHEETS) {
    const css = read(name);
    for (const guard of GUARDS) {
      const guarded = guardSelectors(css, guard).map(tokensOf);
      for (const selector of idleSelectors(css)) {
        const tokens = tokensOf(selector);
        const covered = guarded.some((g) => isSubset(g, tokens));
        assert.ok(covered, `${name}: "${selector}" is not covered by any ${guard} rule`);
      }
    }
  }
});

test('the coverage check rejects an unguarded loop', () => {
  // Guards the guard: proves the test above can actually fail. Mirrors the
  // real failure mode — someone adds an idle animation and no :root rule.
  const fake = `
    .foo.bar { animation: spin 1s infinite; }
    :root.fx-off .baz { animation: none; }
  `;
  const guarded = guardSelectors(fake, ':root.fx-off').map(tokensOf);
  const [selector] = idleSelectors(fake);
  assert.equal(selector, '.foo.bar');
  assert.ok(!guarded.some((g) => isSubset(g, tokensOf(selector))), 'must read as uncovered');
});

test('splitSelectorList respects parentheses, so :has() lists survive', () => {
  assert.deepEqual(splitSelectorList('.a, .b'), ['.a', '.b']);
  assert.deepEqual(splitSelectorList(':where(#active:has(> img, > .mat-holo))'), [
    ':where(#active:has(> img, > .mat-holo))',
  ]);
  assert.deepEqual(splitSelectorList(':has(a, b), .c'), [':has(a, b)', '.c']);
});

test('the coverage check accepts a broader guard compound', () => {
  // `.self-circle.status-marker` legitimately covers `....status-asleep`.
  const fake = `
    .a.b.c { animation: x 1s infinite; }
    :root.fx-off .a.b { animation: none; }
  `;
  const guarded = guardSelectors(fake, ':root.fx-off').map(tokensOf);
  assert.ok(isSubset(guarded[0], tokensOf(idleSelectors(fake)[0])));
});

test('iframe stylesheets also keep their prefers-reduced-motion fallback', () => {
  // The class guard is for the in-app toggle; the media query still has to
  // cover a user who never opens Settings at all.
  for (const name of IFRAME_SHEETS) {
    assert.ok(
      read(name).includes('prefers-reduced-motion'),
      `${name} lost its reduced-motion query`
    );
  }
});

test('parent-page overlays are still killed by the body class', () => {
  // mat-fx.css overlays are body children, so they use body.fx-off, not :root.
  assert.ok(read('mat-fx.css').includes('body.fx-off .fx-overlay'));
});
