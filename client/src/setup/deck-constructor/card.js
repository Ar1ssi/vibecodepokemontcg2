import { buildCardImage } from '../image-logic/build-card-image.js';
import { CARD_IMAGE_LISTENERS } from '../image-logic/card-listener-table.js';
import { resetImage } from '../image-logic/reset-image.js';

export class Card {
  name;
  type;
  user;
  image;
  number;
  set;
  id;
  cardId;
  uuid;
  /** Pure data state properties (decoupled from DOM) */
  damage = 0;
  specialCondition = null;
  abilityUsed = false;
  attached = false;
  parentCard = null;
  parentCardId = null;
  attachedCards = [];
  isEvolution = false;

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
    this.uuid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `card_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    /** Unique permanent instance identifier for the card */
    this.cardId = null;
    /** Stable deck-build index for multiplayer sync (same on both clients). */
    this.syncInstance = null;
    this.damage = 0;
    this.specialCondition = null;
    this.abilityUsed = false;
    this.attached = false;
    this.parentCard = null;
    this.parentCardId = null;
    this.attachedCards = [];
    this.isEvolution = false;
    this.imageAttributes = {
      user: user,
      type: type,
      src: imageURL,
      alt: name,
      draggable: true,
      ...CARD_IMAGE_LISTENERS,
    };
    this.buildImage(this.imageAttributes);
  }

  buildImage(imageAttributes) {
    this.image = buildCardImage(document, imageAttributes);
    resetImage(this.image);
    this.image.card = this;
  }
}
