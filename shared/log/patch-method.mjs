// Replaces `target[name]` with a wrapper around it. The returned uninstall puts the original
// back only while the wrapper is still the current value: a later patch layered on top is not undone.
/**
 * @param {object} target
 * @param {string} name
 * @param {(original: Function) => Function} makeWrapper
 * @returns {() => void} uninstall (a no-op when `target[name]` is not a function)
 */
export function patchMethod(target, name, makeWrapper) {
  const original = target?.[name];
  if (typeof original !== 'function') return () => {};
  const wrapper = makeWrapper(original);
  target[name] = wrapper;
  return () => {
    if (target[name] === wrapper) target[name] = original;
  };
}
