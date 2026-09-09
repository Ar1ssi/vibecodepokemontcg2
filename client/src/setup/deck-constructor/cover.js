import { buildCardImage } from '../image-logic/build-card-image.js';
import { COVER_IMAGE_LISTENERS } from '../image-logic/cover-listener-table.js';
import { resetImage } from '../image-logic/reset-image.js';

export class Cover {
  user;
  image;

  constructor(user, id, imageURL) {
    this.user = user;
    this.imageAttributes = {
      user: user,
      id: id,
      src: imageURL,
      alt: id,
      draggable: true,
      ...COVER_IMAGE_LISTENERS,
    };
    this.buildImage(this.imageAttributes);
  }

  buildImage(imageAttributes) {
    this.image = buildCardImage(document, imageAttributes);
    resetImage(this.image);
  }
}
