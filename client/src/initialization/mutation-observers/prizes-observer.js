// Import prizesElement and oppPrizesElement
import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../state.js';

export const initializePrizesObserver = () => {
  const prizesElement = selfContainerDocument.getElementById('prizes');
  const oppPrizesElement = oppContainerDocument.getElementById('prizes');

  const observerConfig = { childList: true, subtree: true };

  // Callback function for the Mutation Observer
  const mutationCallback = (mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList') {
        // Child nodes have been added or removed, adjust image size
        // Function to adjust image size based on the number of images
        const element = mutation.target;
        const images = element.getElementsByTagName('img');
        const numImages = images.length;
        const classList =
          numImages <= 6 ? 'prizes-normal-size' : 'prizes-small-size';

        for (const image of images) {
          image.classList.remove('prizes-normal-size', 'prizes-small-size');
          image.classList.add(classList);
        }
      }
    }
  };

  // Create a Mutation Observer with the specified callback and configuration
  const observer = new MutationObserver(mutationCallback);

  // Start observing the target nodes for configured mutations
  observer.observe(prizesElement, observerConfig);
  observer.observe(oppPrizesElement, observerConfig);
};
