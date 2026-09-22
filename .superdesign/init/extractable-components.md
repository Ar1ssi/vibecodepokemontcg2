# Extractable components

## DeckBuilderHeader
- Source: `client/index.ejs:247-258`
- Category: layout
- Description: Top bar with title, subtitle, theme toggle, Export/Import deck
- Extractable props: none

## DeckLibraryBar
- Source: `client/index.ejs:259-266` + `client/src/initialization/document-event-listeners/sidebox/native-deck-builder-library.js`
- Category: layout
- Description: My Decks strip of deck chips (sprites + name + rename/delete), + New Deck
- Extractable props: activeDeck (string)
