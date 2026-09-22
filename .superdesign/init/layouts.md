# Layouts

Single-page EJS app. Deck builder is a full-screen workspace panel `#nativeDeckBuilderWorkspace.db-live` in `client/index.ejs` (lines 244-360). Toggled open from sidebox header buttons.

## `client/index.ejs:244:360` — deck builder shell (header, My Decks library bar, target bar, search/browse/customize pane, deck side pane, custom-card modal)
```html
    <div id="nativeDeckBuilderWorkspace" class="native-deck-builder-workspace db-live">
        <button id="nativeDeckBuilderEdgeToggle" class="native-deck-builder-edge-toggle" aria-label="Collapse deck builder workspace" title="Collapse deck builder workspace">❮</button>
        <div class="native-deck-builder-inner">
            <div class="native-deck-builder-header">
                <div>
                    <strong>Deck Builder</strong>
                    <div class="native-deck-builder-subtitle">Search cards, build decks, and load them directly into the simulator.</div>
                </div>
                <div class="native-deck-builder-actions">
                    <button id="nativeDeckBuilderThemeToggle" class="native-deck-builder-theme-toggle" type="button" aria-label="Switch to light theme" title="Switch to light theme">☀️</button>
                    <button id="nativeDeckBuilderExportCsv" class="self-color">Export Deck</button>
                    <label for="nativeDeckBuilderCsvImport" id="nativeDeckBuilderImportCsvLabel" class="self-color native-deck-builder-inline-label">Import Deck</label>
                    <input id="nativeDeckBuilderCsvImport" type="file" accept=".csv" style="display:none;" />
                </div>
            </div>
            <div id="nativeDeckBuilderLibraryBar" class="native-deck-builder-library-bar" data-target="self">
                    <div class="native-deck-builder-library-header">
                        <strong class="native-deck-builder-library-title">My Decks</strong>
                        <button id="nativeDeckBuilderNewDeck" class="native-deck-builder-new-deck" type="button">+ New Deck</button>
                        <span id="nativeDeckBuilderLibraryStatus" class="native-deck-builder-library-status" aria-live="polite"></span>
                    </div>
                    <div id="nativeDeckBuilderLibraryList" class="native-deck-builder-library-list"></div>
                </div>
                <div class="native-deck-builder-targetbar">
                <strong class="native-deck-builder-target-label">Current Deck</strong>
                <div class="native-deck-builder-target-controls">
                    <button id="nativeDeckBuilderTargetMain" class="native-target-button native-target-selected">P1</button>
                    <button id="nativeDeckBuilderTargetAlt" class="native-target-button">P2 (Solo only)</button>
                </div>
                <button id="nativeDeckBuilderPlayButton" class="native-deck-builder-play-button" disabled>Play</button>
            </div>
            <div class="native-deck-builder-body">
                <div class="native-deck-builder-pane native-deck-builder-pane-main">
                    <div class="native-deck-builder-mode-tabs">
                            <button id="nativeDeckBuilderTabSearch" class="native-deck-builder-mode-tab active" type="button">Search</button>
                            <button id="nativeDeckBuilderTabBrowse" class="native-deck-builder-mode-tab" type="button">Browse Sets</button>
                            <button id="nativeDeckBuilderTabCustomize" class="native-deck-builder-mode-tab" type="button">Customize</button>
                        </div>
                        <div class="native-deck-builder-pane-main-header">
                        <div class="native-deck-builder-section-title-row">
                            <div class="native-deck-builder-section-title">Search</div>
                            <button id="nativeDeckBuilderAddCustomCard" class="neutral-color native-deck-builder-section-button">+ Custom Card</button>
                        </div>
                        <div class="native-deck-builder-search-row">
                            <input id="nativeDeckBuilderSearchInput" class="native-deck-builder-search-input" type="text" placeholder="Type a card name..." />
                            <select id="nativeDeckBuilderCardTypeFilter" class="native-deck-builder-search-select">
                                <option value="all">All</option>
                                <option value="tcg">TCG</option>
                                <option value="pocket">Pocket</option>
                            </select>
                            <select id="nativeDeckBuilderSortBy" class="native-deck-builder-search-select">
                                <option value="releaseDate">Release Date</option>
                                <option value="name">Name</option>
                            </select>
                            <select id="nativeDeckBuilderSortDirection" class="native-deck-builder-search-select">
                                <option value="desc">Desc</option>
                                <option value="asc">Asc</option>
                            </select>
                            <button id="nativeDeckBuilderSearchButton" class="self-color">Search</button>
                        </div>
                        <div id="nativeDeckBuilderFilterBar" class="native-deck-builder-filter-bar" role="group" aria-label="Card filters"></div>
                        <div id="nativeDeckBuilderSearchStatus" class="native-deck-builder-search-status"></div>
                    </div>
                    <div class="native-deck-builder-results-shell">
                        <div id="nativeDeckBuilderSearchResults" class="native-deck-builder-search-results"></div>
                    </div>
                    <div id="nativeDeckBuilderSetBrowserPanel" class="native-deck-builder-set-browser" hidden>
                    </div>
                    <div id="nativeDeckBuilderCustomizeSwitcher" hidden>
                      <div class="customize-switcher-toggle" role="tablist">
                        <button type="button" data-view="sleeve" class="active">Card Sleeve</button>
                        <button type="button" data-view="coin">Coin</button>
                        <button type="button" data-view="mat">Mat</button>
                      </div>
                      <input id="nativeDeckBuilderCustomizeFilter" type="text"
                        placeholder="Filter sleeves, coins or mats..." aria-label="Filter customize items" />
                    </div>
                    <div id="nativeDeckBuilderSleevePanel" class="native-deck-builder-sleeve-panel" hidden>
                    </div>
    
                    <div id="nativeDeckBuilderCoinPanel" class="native-deck-builder-coin-picker" hidden></div>
                    <div id="nativeDeckBuilderMatPanel" class="native-deck-builder-mat-picker" hidden></div>         </div>
                
                <div class="native-deck-builder-pane native-deck-builder-pane-side">
                        <div class="native-deck-builder-deck-header">
                            <div class="native-deck-builder-deck-title">
                                <div id="nativeDeckBuilderDeckName" class="native-deck-builder-deck-name">Untitled Deck</div>
                                <div id="nativeDeckBuilderDeckSprites" class="native-deck-builder-deck-sprites is-empty"></div>
                                <div id="nativeDeckBuilderSpritePicker" class="native-deck-builder-sprite-picker" role="dialog" aria-label="Choose this deck's Pokémon" hidden></div>
                            </div>
                            <div class="native-deck-builder-deck-header-row">
                                <span id="nativeDeckBuilderValidationDot" class="native-deck-builder-validation-dot invalid" aria-label="Deck invalid" title="Deck invalid"></span>
                                <span id="nativeDeckBuilderDeckStatus" class="native-deck-builder-deck-status"></span>
                                <button id="nativeDeckBuilderSaveDeck" class="native-deck-builder-save-btn" type="button" title="Save this deck's cards, sleeve, coin and mat">Save</button>
                                <button id="nativeDeckBuilderClear" class="neutral-color native-deck-builder-clear-btn">Clear</button>
                            </div>
                        </div>
                        <div id="nativeDeckBuilderCounter" class="native-deck-builder-counter" role="status" aria-live="polite"></div>
                        <div id="nativeDeckBuilderSummaryPanel" class="native-deck-builder-summary"></div>
                        <div id="nativeDeckBuilderCardsPanel" class="native-deck-builder-cards"></div>
                    </div></div>
            </div>
            <div id="nativeDeckBuilderCustomCardModal" class="native-deck-builder-modal" role="dialog" aria-modal="true" aria-label="Add custom card" hidden>
                <div class="native-deck-builder-modal-box">
                    <div class="native-deck-builder-modal-title">Add Custom Card</div>
                    <div class="native-deck-builder-modal-body">
                        <div class="native-deck-builder-modal-fields">
                            <label class="native-deck-builder-modal-label">
                                Quantity
                                <input id="nativeCustomCardQty" class="native-deck-builder-modal-input" type="number" min="1" max="99" value="1" />
                            </label>
                            <label class="native-deck-builder-modal-label">
                                Card Name
                                <input id="nativeCustomCardName" class="native-deck-builder-modal-input" type="text" placeholder="e.g. Charizard" />
                            </label>
                            <label class="native-deck-builder-modal-label">
                                Card Type
```
