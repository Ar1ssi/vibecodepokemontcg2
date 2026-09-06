import {
  doubleClick,
  imageClick,
  openCardContextMenu,
} from '../image-logic/click-events.js';
import {
  dragEnd,
  dragLeave,
  dragOver,
  dragStart,
} from '../image-logic/drag.js';
import { resetImage } from '../image-logic/reset-image.js';

export class Card {
  name;
  type;
  user;
  image;
  number;
  set;
  id;

  constructor(user, name, type, imageURL, number = null, set = null, id = null) {
    this.user = user;
    this.name = name;
    this.type = type;
    // Printed collector number, set code, and TCGdex id from the decklist /
    // deck-builder when known. Kept alongside `name` so the rules engine can
    // disambiguate cards that share an identical name across many different
    // printings/sets (see resolveCardId and ensureCardData in
    // rules-state.mjs) instead of guessing from a name-only search.
    this.number = number || null;
    this.set = set || null;
    this.id = id || null;
    /** Stable deck-build index for multiplayer sync (same on both clients). */
    this.syncInstance = null;
    this.imageAttributes = {
      user: user,
      type: type,
      src: imageURL,
      alt: name,
      draggable: true,
      click: imageClick,
      dblclick: doubleClick,
      dragstart: dragStart,
      dragover: dragOver,
      dragleave: dragLeave,
      dragend: dragEnd,
      contextmenu: openCardContextMenu,
    };
    this.buildImage(this.imageAttributes);
  }

  buildImage(imageAttributes) {
    this.image = document.createElement('img');
    for (const attr in imageAttributes) {
      if (typeof imageAttributes[attr] === 'function') {
        this.image.addEventListener(attr, imageAttributes[attr]);
      } else if (attr === 'user') {
        this.image.user = imageAttributes[attr];
      } else if (attr === 'type') {
        this.image.type = imageAttributes[attr];
      } else {
        this.image.setAttribute(attr, imageAttributes[attr]);
      }
    }
    resetImage(this.image);
  }
}
