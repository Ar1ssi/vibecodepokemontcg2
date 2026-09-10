export const shuffleIndices = (length) => {
  let indices = Array.from({ length }, (_, i) => i);

  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
};

/**
 * Reorders `array` in place: position i takes the card at `indices[i]`.
 * A relayed permutation built for a different-length zone (a peer's mirror that
 * drifted) must not drop cards or leave undefined holes, so out-of-range and
 * repeated indices are skipped and every card no index named keeps its place
 * after the permuted ones.
 * @returns {boolean} true when `indices` was an exact permutation of `array`
 */
export const rearrangeArray = (array, indices) => {
  const taken = new Set();
  const rearrangedArray = [];
  for (const oldIndex of indices) {
    const inRange = Number.isInteger(oldIndex) && oldIndex >= 0 && oldIndex < array.length;
    if (!inRange || taken.has(oldIndex)) continue;
    taken.add(oldIndex);
    rearrangedArray.push(array[oldIndex]);
  }
  const isExactPermutation = indices.length === array.length && taken.size === array.length;
  array.forEach((card, oldIndex) => {
    if (!taken.has(oldIndex)) rearrangedArray.push(card);
  });
  array.length = 0;
  array.push(...rearrangedArray);
  return isExactPermutation;
};
