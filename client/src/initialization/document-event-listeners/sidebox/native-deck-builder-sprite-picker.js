import {
  MAX_DECK_SPRITES,
  addDeckSprite,
  deckSpriteImageUrl,
  deckSpriteLabel,
  hasShinySprite,
  normalizeDeckSprites,
  removeDeckSpriteAt,
  searchPokemon,
  toggleDeckSpriteShinyAt,
} from '../../../setup/deck-builder/core/deck-sprites.mjs';
import { renderSpritePicker } from './native-deck-builder-renderers.js';

const RESULT_LIMIT = 60;

/**
 * The Pokémon sprite picker popover for the deck header (design 024).
 *
 * Owns only the popover's own UI state — whether it is open and what has been
 * typed into its search box. The deck's slots stay with the caller: this
 * module reads them through `getSprites()` and reports every edit through
 * `onChange(sprites)`, so there is one owner of the deck state, not two.
 *
 * @param {object} options
 * @param {HTMLElement} options.pickerEl - the popover host element
 * @param {function(): {slug: string, shiny: boolean}[]} options.getSprites
 * @param {function({slug: string, shiny: boolean}[]): void} options.onChange
 * @returns {{open: function, close: function, toggle: function, isOpen: function}|null}
 */
export const initializeNativeDeckBuilderSpritePicker = ({
  pickerEl,
  getSprites,
  onChange,
}) => {
  if (!pickerEl) return null;

  let query = '';
  let open = false;

  const currentSprites = () => normalizeDeckSprites(getSprites?.() || []);

  const draw = ({ keepFocus = false } = {}) => {
    const searchEl = pickerEl.querySelector('#nativeDeckBuilderSpriteSearch');
    const caret = searchEl?.selectionStart ?? null;

    renderSpritePicker({
      pickerEl,
      sprites: currentSprites(),
      results: searchPokemon(query, RESULT_LIMIT),
      query,
      max: MAX_DECK_SPRITES,
      spriteUrl: deckSpriteImageUrl,
      spriteLabel: deckSpriteLabel,
      canShiny: (sprite) => hasShinySprite(sprite.slug),
    });

    // The popover redraws wholesale on every edit, which would otherwise
    // throw away the caret mid-word while the user is still typing.
    if (!keepFocus) return;
    const nextSearchEl = pickerEl.querySelector(
      '#nativeDeckBuilderSpriteSearch'
    );
    if (!nextSearchEl) return;
    nextSearchEl.focus();
    if (caret !== null) nextSearchEl.setSelectionRange(caret, caret);
  };

  const commit = (sprites) => {
    onChange?.(sprites);
    draw();
  };

  const close = () => {
    if (!open) return;
    open = false;
    pickerEl.hidden = true;
  };

  const show = () => {
    open = true;
    pickerEl.hidden = false;
    query = '';
    draw();
    pickerEl.querySelector('#nativeDeckBuilderSpriteSearch')?.focus();
  };

  pickerEl.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();

    if (target.dataset.spritePickerClose) {
      close();
      return;
    }
    if (target.dataset.spriteAdd) {
      commit(addDeckSprite(currentSprites(), target.dataset.spriteAdd));
      return;
    }
    if (target.dataset.spriteRemove !== undefined) {
      commit(
        removeDeckSpriteAt(
          currentSprites(),
          Number(target.dataset.spriteRemove)
        )
      );
      return;
    }
    if (target.dataset.spriteShiny !== undefined) {
      commit(
        toggleDeckSpriteShinyAt(
          currentSprites(),
          Number(target.dataset.spriteShiny)
        )
      );
    }
  });

  pickerEl.addEventListener('input', (event) => {
    if (event.target.id !== 'nativeDeckBuilderSpriteSearch') return;
    query = event.target.value;
    draw({ keepFocus: true });
  });

  // Clicking anywhere else, or pressing Escape, dismisses the popover — the
  // strip button itself stops propagation, so opening never immediately closes.
  document.addEventListener('click', (event) => {
    if (!open || pickerEl.contains(event.target)) return;
    close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  return {
    open: show,
    close,
    toggle: () => (open ? close() : show()),
    isOpen: () => open,
    refresh: () => {
      if (open) draw();
    },
  };
};
