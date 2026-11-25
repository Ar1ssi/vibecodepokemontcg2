// Release dates are ISO strings, so they order as text; a missing date is '' and sorts oldest.
/** Comparator for "newest first": a missing date comes last. */
export const compareReleaseDateNewestFirst = (dateA, dateB) =>
  String(dateB || '').localeCompare(String(dateA || ''));
