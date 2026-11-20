// Change the justify-content property based on the overflow
export const adjustAlignment = (element) => {
  // Check if there's an overflow
  if (element.scrollWidth > element.clientWidth) {
    element.style.justifyContent = 'flex-start';
  } else {
    element.style.justifyContent = 'center';
  }
};
