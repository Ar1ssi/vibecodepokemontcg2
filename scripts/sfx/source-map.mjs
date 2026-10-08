/**
 * Design 064 § Contract: which TCG Live extract file becomes which sampled-SFX cue key.
 * Pure data + lookup; import-tcgl-sfx.mjs refuses to run when a file is neither mapped nor excluded.
 * Keys are the names the client cue table (mat-fx/sfx-cues.mjs) uses; files sharing a key are
 * variants of one cue (design O8).
 */

const STATUS_CONDITIONS = ['burn', 'poison', 'sleep', 'paralyze', 'confusion'];
const STATUS_PHASES = ['intro', 'loop', 'outro'];
const ATTACK_SIZES = ['small', 'medium', 'large'];
const POKEMON_TYPES = [
  'colorless',
  'dark',
  'dragon',
  'electric',
  'fairy',
  'fighting',
  'fire',
  'grass',
  'metal',
  'psychic',
  'water',
];

/** Extract file name (with .wav) → cue key, one file per cue. */
const SINGLE_FILES = {
  'sfx_coin_flip_metal_loop.wav': 'coin-spin-metal',
  'sfx_coin_flip_plastic_loop.wav': 'coin-spin-plastic',
  'sfx_rain_card_no_match.wav': 'card-no-match',
  'sfx_rain_card_slot_drop.wav': 'card-slot-drop',
  'sfx_rain_coin_appear.wav': 'coin-appear',
  'sfx_rain_coin_flip_loss.wav': 'coin-loss',
  'sfx_rain_coin_flip_metal.wav': 'coin-toss-metal',
  'sfx_rain_coin_flip_plastic.wav': 'coin-toss-plastic',
  'sfx_rain_coin_flip_win.wav': 'coin-win',
  'sfx_rain_crowd_amb_large.wav': 'crowd-amb-large',
  'sfx_rain_crowd_amb_small_rev.wav': 'crowd-amb-small',
  'sfx_rain_crowd_crazy_lp.wav': 'crowd-crazy',
  'sfx_rain_darkrai_ex_card_entrance.wav': 'darkrai-ex-entrance',
  'sfx_rain_deck_search_hand_to_slot.wav': 'search-to-hand',
  'sfx_rain_defeat.wav': 'defeat',
  'sfx_rain_doom_curse_pt1.wav': 'doom-curse-1',
  'sfx_rain_doom_curse_pt2.wav': 'doom-curse-2',
  'sfx_rain_evolve_card.wav': 'evolve-card',
  'sfx_rain_heal_card.wav': 'heal-card',
  'sfx_rain_instantKO_impact.wav': 'instant-ko-impact',
  'sfx_rain_instantKO_player_activate.wav': 'instant-ko-activate',
  'sfx_rain_itchy_pollen_activate.wav': 'itchy-pollen-activate',
  'sfx_rain_itchy_pollen_hand.wav': 'itchy-pollen-hand',
  'sfx_rain_itchy_pollen_hand_card.wav': 'itchy-pollen-hand-card',
  'sfx_rain_knocked_out.wav': 'knocked-out',
  'sfx_rain_opponent_deck_to_hand.wav': 'opp-deck-to-hand',
  'sfx_rain_opponent_pending_to_discard.wav': 'opp-pending-discard',
  'sfx_rain_opponent_placing_active.wav': 'opp-place-active',
  'sfx_rain_player_places_active_opening.wav': 'place-active-opening',
  'sfx_rain_retreat_lock_flare.wav': 'retreat-lock-flare',
  'sfx_rain_retreat_lock_intro.wav': 'retreat-lock-intro',
  'sfx_rain_rivals_KO_ding.wav': 'rival-ko-ding',
  'sfx_rain_rivals_KO_whistle.wav': 'rival-ko-whistle',
  'sfx_rain_tool_too_bench.wav': 'tool-attach',
  'sfx_rain_trainer_to_board-002.wav': 'trainer-to-board',
  'sfx_rain_ui_card_movement_swoosh_01.wav': 'card-swoosh',
  'sfx_rain_v_union.wav': 'v-union',
  'sfx_rain_victory.wav': 'victory',
  'sfx_rainier_card_flip_over_01.wav': 'card-flip',
  'sfx_rainier_card_from_hand.wav': 'card-from-hand',
  'sfx_rainier_default_button_click.wav': 'button-click',
  'sfx_rainier_deck_to_hand.wav': 'deck-to-hand',
  'sfx_rainier_menu_pop_in.wav': 'menu-pop-in',
  'sfx_rainier_pikachu_enter_V3.wav': 'pikachu-enter',
  'sfx_rainier_setup_phase.wav': 'setup-phase',
  'sfx_ui_rain_attach_energy.wav': 'attach-energy',
  'sfx_ui_rain_attack_button_click.wav': 'attack-button',
  'sfx_ui_rain_card to board.wav': 'card-to-board',
  'sfx_ui_rain_card view.wav': 'card-view',
  'sfx_ui_rain_card_drawn_from_deck.wav': 'card-drawn',
  'sfx_ui_rain_card_place_active.wav': 'place-active',
  'sfx_ui_rain_card_reveal.wav': 'card-reveal',
  'sfx_ui_rain_choose_1st_or_2nd.wav': 'choose-first-second',
  'sfx_ui_rain_end_turn.wav': 'end-turn',
  'sfx_ui_rain_opponent_attach_energy.wav': 'attach-energy-opp',
  'sfx_ui_rain_opponent_turn_prompt.wav': 'opp-turn',
  'sfx_ui_rain_pile search.wav': 'pile-search',
  'sfx_ui_rain_prize_card.wav': 'prize-card',
  'sfx_ui_rain_shuffle_deck.wav': 'shuffle-deck',
  'sfx_ui_rain_your_turn_prompt.wav': 'your-turn',
  'ui_rain_big_card_view_in.wav': 'big-card-in',
  'ui_rain_big_card_view_out.wav': 'big-card-out',
  'ui_rain_card_discard_deposit.wav': 'discard-deposit',
  'ui_rain_card_discard_finished.wav': 'discard-finished',
  'ui_rain_card_discard_whoosh.wav': 'discard-whoosh',
};

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Numbered families: `<prefix>_<NN>.wav` for each listed number, all variants of `key`. */
const VARIANT_GROUPS = [
  { prefix: 'sfx_rain_crowd_additional_reactions', key: 'additional-reactions', numbers: range(1, 11), pad: 2 },
  { prefix: 'sfx_rain_crowd_cheer_disappoint', key: 'cheer-disappoint', numbers: range(1, 8), pad: 2 },
  { prefix: 'sfx_rain_crowd_cheer_large', key: 'cheer-large', numbers: range(1, 6), pad: 2 },
  { prefix: 'sfx_rain_crowd_cheer_medium', key: 'cheer-medium', numbers: range(1, 6), pad: 2 },
  { prefix: 'sfx_rain_crowd_cheer_small', key: 'cheer-small', numbers: range(1, 7), pad: 2 },
  { prefix: 'sfx_rain_crowd_surprise', key: 'surprise', numbers: range(1, 11), pad: 2 },
  { prefix: 'sfx_rain_crowd_to_large', key: 'to-large', numbers: range(1, 4), pad: 2 },
  { prefix: 'sfx_rain_crowd_to_medium', key: 'to-medium', numbers: [3, 4], pad: 2 },
  { prefix: 'sfx_rain_crowd_to_moderate', key: 'to-moderate', numbers: [1, 2], pad: 2 },
  { prefix: 'sfx_rain_small_crowd_reactions', key: 'small-reactions', numbers: [2, 4, 5, 6, 7, 8, 9], pad: 2 },
  { prefix: 'sfx_rain_place_bench', key: 'place-bench', numbers: [1, 2], pad: 1 },
  { prefix: 'sfx_rain_rivals_card_played_fin', key: 'opp-card-played', numbers: [1, 2], pad: 2 },
  { prefix: 'sfx_rainier_card_place', key: 'card-place', numbers: [1, 2], pad: 2 },
  { prefix: 'sfx_rainier_cards_to_prize_pile', key: 'cards-to-prizes', numbers: [1, 2], pad: 2 },
  { prefix: 'sfx_rainier_shuffle', key: 'shuffle', numbers: [1, 2], pad: 2 },
];

/** @type {Record<string, { key: string, variant?: number }>} */
export const SOURCE_MAP = {};

for (const [name, key] of Object.entries(SINGLE_FILES)) SOURCE_MAP[name] = { key };
for (const condition of STATUS_CONDITIONS)
  for (const phase of STATUS_PHASES)
    SOURCE_MAP[`sfx_rain_${condition}_${phase}.wav`] = { key: `${condition}-${phase}` };
for (const type of POKEMON_TYPES)
  SOURCE_MAP[`sfx_rain_${type}_pokemon_active.wav`] = { key: `active-${type}` };
// Design 064 Addendum A: the attack hits and the signature sting. The jumbotron files name
// Lightning `lightning`; the keys use `electric` like every other per-type key.
for (const type of POKEMON_TYPES)
  for (const size of ATTACK_SIZES)
    SOURCE_MAP[`sfx_rain_${type}_attack_${size}.wav`] = { key: `attack-${type}-${size}` };
for (const type of POKEMON_TYPES) {
  const fileType = type === 'electric' ? 'lightning' : type;
  SOURCE_MAP[`sfx_rain_${fileType}_jumbotron_reduced.wav`] = { key: `sting-${type}` };
}
for (const { prefix, key, numbers, pad } of VARIANT_GROUPS)
  for (const variant of numbers)
    SOURCE_MAP[`${prefix}_${String(variant).padStart(pad, '0')}.wav`] = { key, variant };

/**
 * Files the importer skips on purpose. The jumbotron's long-form parts score an arena cinematic
 * this game has no scene for (design 064 Addendum A); the four named files have no confident game
 * hook (design 064 § Card signatures).
 */
export const EXCLUDED = [
  /_jumbotron_(intro|loop|outro|flash_\d+)\.wav$/,
  /^sfx_rain_cant_draw_that\.wav$/,
  /^sfx_rain_cards_match\.wav$/,
  /^sfx_rain_marne_special\.wav$/,
  /^sfx_rainier_lightning\.wav$/,
];

export const isExcluded = (name) => EXCLUDED.some((pattern) => pattern.test(name));

/** @returns {{ key: string, variant?: number }|null} null for excluded or unknown files. */
export function keyForFile(name) {
  if (isExcluded(name)) return null;
  return Object.hasOwn(SOURCE_MAP, name) ? SOURCE_MAP[name] : null;
}
