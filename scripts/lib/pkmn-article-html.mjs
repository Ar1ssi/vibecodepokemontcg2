/**
 * Shared HTML helpers for the pkmncards scrapers.
 *
 * The article name span may contain nested markup — energy symbols render as
 * `<abbr …><span class="vh">{</span>L<span class="vh">}</span></abbr>` — so a
 * non-greedy `([\s\S]*?)</span>` stops at the first inner span (yielding
 * "Fairy Charm {") and matching through to `</span></div>` swallows the next
 * sibling span ("Unidentified Fossil · 60 HP"). Bal-scan the span instead.
 */

/** Inner HTML of the first `<span class="<classMarker>">`, nested spans included. */
export function extractSpanInnerHtml(html, classMarker) {
  const source = String(html ?? '');
  const marker = `class="${classMarker}"`;
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) return '';
  const openAt = source.lastIndexOf('<span', markerAt);
  if (openAt < 0) return '';
  const openEnd = source.indexOf('>', markerAt);
  if (openEnd < 0) return '';
  let depth = 1;
  let i = openEnd + 1;
  while (i < source.length && depth > 0) {
    const nextOpen = source.indexOf('<span', i);
    const nextClose = source.indexOf('</span>', i);
    if (nextClose < 0) return '';
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + '<span'.length;
    } else {
      depth--;
      if (depth === 0) return source.slice(openEnd + 1, nextClose);
      i = nextClose + '</span>'.length;
    }
  }
  return '';
}
