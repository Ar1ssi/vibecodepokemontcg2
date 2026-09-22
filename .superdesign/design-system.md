# Design System — Deck Builder ("Colorful Dark")

## Product context
Web Pokémon TCG simulator. Deck builder = full-screen workspace: My Decks library strip, P1/P2 target + Play, left pane (Search / Browse Sets / Customize tabs, search row, filter pills, image-first card grid), right pane (deck name + up to 3 Pokémon sprites, Save/Clear, big "x / 60" counter with fill bar, Pokémon/Trainers/Energy segmented summary, deck list rows with qty, thumb, name, +/−).
JTBD: find cards fast, build a legal 60-card deck, feel excited to play.

## Strategy
- Artifact: pro-tool app surface (medium-high density), but playful consumer brand.
- Adjectives: welcoming, energetic, collectible, confident, crisp.
- Essence: "Saturday-morning card table".
- Inspiration: pokemon.com (bold primary red/yellow/blue blocks, confident color, friendly copy) + Pokémon TCG Live (dark stage, card art is the hero, gold primary action, filter chips).

## Color (near-black neutral stage; color from yellow/red accents and energy types — NOT navy, NOT indigo/violet)
- bg: #131315 (warm near-black, not pure black) · stage #0c0c0e
- surface: #1b1b1e · surface-2: #242428 · raised: #2f2f34
- border: rgba(255,255,255,.10)
- text: #f2f2ef · text-dim: #a8a8ad
- primary action (Play, Save, Search): Pikachu yellow #ffcb05, text #1a1a1a
- brand accent: Poké red #e3350d (header band, active tab, New Deck)
- secondary: sky blue #3aa0ff (selection, focus rings)
- Energy type colors used as real signal on filter pills and deck-type tags:
  Grass #5fbd58 · Fire #f0612e · Water #3aa0ff · Lightning #ffcb05 · Psychic #e46fb3 · Fighting #d8743e · Darkness #4a4f63 · Metal #9fb3c8 · Dragon #c9a227 · Colorless #e8e3d3
- Supertype colors: Pokémon = red #e3350d, Trainer = blue #3aa0ff, Energy = green #5fbd58
- success #43c46a · warning #ffb020 · error #ff5a5f
- Ratio ~60 black stage / 30 surfaces / 10 yellow+red accents.

## Typography
- Display/labels: "Barlow Semi Condensed" 600/700 — sharp, sporty, game-UI feel (TCG Live-like). Uppercase only for small section labels, tracking .04em.
- Body/UI: "IBM Plex Sans" 400/500/600. Numbers tabular.
- NO rounded or bubbly fonts (no Fredoka, Nunito, Poppins, Baloo). No Inter/Roboto.
- Compact scale, ratio 1.2, base 13px: 11 / 13 / 15.6 / 18.7 / 22.5 / 27 (counter number max). Headings small and confident, not huge.

## Shape, spacing, depth
- DENSE pro-tool layout. Spacing base 4px; groups 4-8px, sections 12-16px. Controls 28-32px tall, rows 36px.
- Radius: 4px (panels, inputs, buttons, chips) and 2px (badges). No pills, no circles except sprite avatars. Card scans keep natural card corner (~3%).
- Depth: flat solid fills + 1px borders. Subtle 1px lighter top edge on raised surfaces. No soft drop shadows, no glow.

## Signature move
Thin 3px Poké-red rule under the header and colored type stripes: every deck row, filter chip and summary segment carries a 3px left/bottom color stripe in its energy/supertype color — color comes from data, not decoration. Card scans lift 2px on hover.

## Components
- Buttons ranked: primary (yellow, flat, 4px radius), secondary (surface-2 fill, white text), ghost (text only). States: hover lift 1px, active press down, focus 2px sky ring, disabled 45% opacity.
- Filter chips (4px radius): energy-colored square swatch + label; selected = filled with type color.
- Deck rows: qty badge in supertype color, card thumb, name, small type tag, +/− 24px square buttons.
- Library chips: compact 32px chips with sprites, active = yellow 2px outline.
- Empty states friendly copy ("No cards yet — search above to start your deck!").

## Motion
ease-out 150-220ms, transform/opacity only, respect prefers-reduced-motion. No bounce.

## Accessibility
WCAG AA contrast, visible focus, 24px+ targets, color never sole signal (type tags carry text).
