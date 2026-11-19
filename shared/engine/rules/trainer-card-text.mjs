// The printed text of a Trainer or Stadium card as one string. Card rows carry it as `text`,
// `effect` or `cardText`, and some sources split it into an array of lines; the first
// non-empty form wins and an array is joined with spaces.

export function cardPrintedText(card) {
  for (const value of [card?.text, card?.effect, card?.cardText]) {
    const text = Array.isArray(value) ? value.join(' ') : value;
    if (typeof text === 'string' && text.trim()) return text;
  }
  return '';
}
