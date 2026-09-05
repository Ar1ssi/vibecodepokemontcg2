import { rotateCard } from '../../actions/general/rotate-card.js';
import { getZone } from '../zones/get-zone.js';
import { adjustCards } from './resizer.js';

/** Reorder zone.array to match DOM iteration order without running moveCard. */
const reorderZoneFromDom = (user, zoneId) => {
  const zone = getZone(user, zoneId);
  const ordered = [];

  zone.element.querySelectorAll('div').forEach((playContainer) => {
    playContainer.querySelectorAll('img').forEach((image) => {
      if (image.attached || image.relative) return;
      const card = zone.array.find((c) => c.image === image);
      if (card && !ordered.includes(card)) ordered.push(card);
    });
  });

  if (!ordered.length) return;

  const attachedTail = zone.array.filter(
    (c) => c.image?.attached || !ordered.includes(c)
  );
  zone.array.length = 0;
  zone.array.push(...ordered, ...attachedTail);

  ordered.forEach((card) => {
    const image = card.image;
    const img = new Image();
    img.src = image.src;
    document.body.appendChild(img);
    document.body.removeChild(img);

    let currentRotation;
    if (image.PokémonBreak) {
      currentRotation =
        (parseInt(image.style.transform.replace(/[^0-9-]/g, ''), 10) || 0) - 90;
    } else {
      currentRotation =
        parseInt(image.style.transform.replace(/[^0-9-]/g, ''), 10) || 0;
    }
    const numberRotations = currentRotation / 90;
    const index = zone.array.findIndex((c) => c.image === image);
    if (index === -1) return;
    for (let i = 0; i < numberRotations; i++) {
      rotateCard(user, zoneId, index, false, false);
    }
  });
};

export const refreshBoard = () => {
  const zones = [
    ['self', 'active'],
    ['self', 'bench'],
    ['opp', 'active'],
    ['opp', 'bench'],
  ];
  zones.forEach(([user, zoneId]) => {
    reorderZoneFromDom(user, zoneId);
    adjustCards(user, zoneId, 1);
  });
};

export const refreshBoardImages = () => {
  document.getElementById('refreshIcon').style.display = 'none';
  document.getElementById('loadingCircle').style.display = 'block';
  const zones = [
    ['self', 'active'],
    ['self', 'bench'],
    ['opp', 'active'],
    ['opp', 'bench'],
    ['self', 'deck'],
    ['self', 'prizes'],
    ['opp', 'deck'],
    ['opp', 'prizes'],
  ];

  const reloadImages = (images) => {
    const imagesArray = Array.from(images);
    return Promise.all(
      imagesArray.map((image) => {
        return new Promise((resolve) => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
          // eslint-disable-next-line no-self-assign
          image.src = image.src;
        });
      })
    );
  };

  const loadImagesForZone = ([user, zoneId]) => {
    const promises = [];
    const zone = getZone(user, zoneId);
    if (zoneId === 'deck') {
      const images = zone.elementCover.querySelectorAll('img');
      promises.push(reloadImages(images));
    } else if (zoneId === 'prizes') {
      const images = zone.element.querySelectorAll('img');
      promises.push(reloadImages(images));
    } else {
      const playContainers = zone.element.querySelectorAll('div');
      playContainers.forEach((playContainer) => {
        const images = playContainer.querySelectorAll('img');
        promises.push(reloadImages(images));
      });
    }
    return Promise.all(promises);
  };

  Promise.all(zones.map((zone) => loadImagesForZone(zone))).finally(() => {
    document.getElementById('refreshIcon').style.display = 'block';
    document.getElementById('loadingCircle').style.display = 'none';
    refreshBoard();
  });
};
