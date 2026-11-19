// Reading `window.localStorage` itself throws when site data is blocked.
export const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
