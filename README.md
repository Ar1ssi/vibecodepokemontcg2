# PTCG-sim

PTCG-sim is an open-source Pokémon Trading Card Game tabletop simulator that runs in the browser.
Two players get a full playmat, either hot-seat on one machine in Solo mode or online in
Multiplayer, with drag-and-drop card handling, a deck builder that pulls card data and art from
TCGdex, and an optional rules engine called "TCG Live mode" that enforces turn structure, costs,
card effects, knockouts, and prizes.

The front end is plain ES modules served straight to the browser. There is no bundler and no build
step.

```bash
pnpm install
pnpm start          # http://localhost:4000
```

This is an unofficial fan project. Pokémon and the Pokémon TCG are trademarks of Nintendo,
Creatures, and GAME FREAK. The repo ships no card images; art is loaded from community card
databases at runtime. MIT licensed.

## Contents

- [Highlights](#highlights)
- [Quick start](#quick-start)
- [Your first game](#your-first-game)
- [Features](#features)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [Commands](#commands)
- [Configuration](#configuration)
- [Testing](#testing)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Highlights

A single page holds both halves of a 3D-tilted playmat with the standard zones: deck, hand, Prize
cards, Active, Bench, discard, Lost Zone, and a board area, plus one shared Stadium slot. Cards
move by drag and drop or by clicking to select and then clicking a destination; a right-click menu
covers everything else. Undo works because every game action is recorded in a command log.

Play both decks yourself, or share a room code and play a friend over Socket.IO with spectators
allowed. In online play the server owns the game state and sends each player only what they are
allowed to see, so your hand, deck, and face-down Prizes never reach the opponent. Reconnect
recovery and desync detection use that same command log.

TCG Live mode is optional and on by default. It validates each action, explains refusals, highlights
legal cards, and walks through card effects with pickers instead of asking you to track costs and
counters by hand.

The deck builder searches TCGdex, browses sets through generation tabs and an Energy tab, validates
60-card TCG and 20-card Pocket decks, and keeps a local library of up to 60 decks that import and
export as text or CSV. Cards render per-rarity holofoil under a virtual light, attached Energy
appears as 3D tokens, and playmats, sleeves, and coins come from bundled catalogs. The engine is
covered by a few thousand headless unit tests, browser-level Playwright checks, corpus-wide card
parsing audits, and a bot soak runner.

## Quick start

### Requirements

Node.js (developed on Node 24) and pnpm. The repo is a pnpm workspace with two packages, `client`
and `server`. npm can start the server, but the scripts assume pnpm.

### Install and run

```bash
pnpm install
pnpm start                  # nodemon dev server on http://localhost:4000
```

For a plain run without nodemon:

```bash
node server/server.js       # PORT selects the port, default 4000
```

The SQLite database directory is created on boot, so the server also runs on ephemeral hosts such
as Render. There is no build, bundle, or migration step.

### Playwright tests

The two-browser harnesses need Chromium once:

```bash
npx playwright install chromium
```

## Your first game

1. Load a deck. Open the Deck tab and paste a decklist, browse the sample decks, pick a random
   deck, or open the deck builder (Search / Browse Sets / Customize).
2. Set up. Press Set Up. In Solo mode two decks are loaded (P1 and P2) into the two mats; in
   Multiplayer each player loads their own deck and both press Set Up before the opening deal.
3. Play. Drag cards between zones, or click a card and then a destination; hold Shift to see the
   keybind hints. The buttons above the battle log announce common actions (Attack, Retreat, Heal,
   Switch, Attach, Search, Ability, Stadium, Redirect), and right-clicking a card opens its menu.
4. Rules. TCG Live mode is on by default in multiplayer and toggleable in Solo under Settings,
   labelled "Rules enforced (TCG Live mode)". With it on, illegal moves are refused with a reason,
   legal cards glow, and effects run through guided pickers.

## Features

### Deck building

The deck builder opens as a full-width workspace over the board with three panes. Search looks up
card names on TCGdex, filters between TCG and Pocket cards, and sorts by release date or name in
either direction; you can also add a custom card by name, type, and image URL and see a preview.
Browse Sets walks the current Standard-legal sets, an aggregated Energy tab, and one tab per
generation from Gen 9 down to Gen 1, using TCGdex's own series groupings; sets and card details
load lazily and are cached. Customize picks the sleeve, coin, and playmat for the deck from bundled
and scraped catalogs.

My Decks keeps up to 60 named decks in browser localStorage. Adding or removing a card autosaves
into the open deck, and the editor binding is session-only, so reloading the page never overwrites
a saved deck. Rename and delete are available from the same bar.

Deck import and export handles plain decklists (separate P1 and P2 inputs in Solo), Limitless and
CubeKoga syntax, and CSV. Card language switches among English, French, German, Italian, Portuguese,
and Spanish. A summary and validation indicator update as you build.

Validation recognizes TCG decks (60 cards, four copies per card) and TCG Pocket decks (20 cards,
two copies), and checks Ace Spec, Prism Star, Radiant, and rule-box limits.

Card backs can be uploaded. Modern basic Energy cards, which TCGdex has no art for, resolve through
a dedicated Scarlet & Violet lookup.

### The table

Cards move between zones by drag and drop, or by clicking to select and clicking a destination.
The zones are deck, hand, Prize cards, Active, Bench, discard, Lost Zone, and board, with one
shared Stadium slot. Right-clicking a card opens a menu for the rest: moving it to a zone, putting
it on the top or bottom of the deck, shuffling, taking or returning Prizes, revealing, hiding,
covering, rotating, changing its type among Energy, Tool, and Pokémon, toggling the ability marker,
and placing damage counters or special conditions. Holding Shift shows the keybind list.

Counters cover damage, the five special conditions (Poison, Burn, Asleep, Confused, Paralyzed),
abilities, and the once-per-game marks for GX and VSTAR. Attached Energy renders as per-type 3D
tokens.

The match controls are Undo, Set Up, Reset, Reset Both, Restart, take-turn, flip board, flip coin,
refresh images, and fullscreen; the button row can be dragged to a new position. A playmat can be a
one-player design drawn once per half, with the far side oriented toward its player, or a full-size
two-player sheet. Each half can be resized, the mat can be zoomed, and a custom image can be used
instead. Settings holds the dark themes, container and hand visibility, the Lost Zone rail, the
background choice, and the rules toggle.

The battle log gives each side its own message stream, and the buttons above it post one-click
announcements for Attack, Retreat, Heal, Switch, Attach, Search, Ability, Stadium, and Energy
Redirect, plus free text.

### Card inspection and attack preview

Double-clicking a board Pokémon, or the in-play Stadium, opens the card inspector: HP, printed
attacks, abilities, retreat cost, and a slide for each attached Energy. With rules on, the attack
and ability panels are interactive; usable options are highlighted and unusable ones state the
reason. The attack preview shows what an attack would cost and deal before you commit, including
cost discounts, special Energy, weakness, resistance, and tools.

Wherever the game needs a choice (searches, discards, Prize picks, deck peeks, heals, snipes) it
uses the carousel card picker, which supports drag and swipe and previews holofoil. A separate
full-view viewer shows any card at full size.

### Rules mode

Rules mode is on by default, always on in multiplayer, and switchable in Solo; a solo session can
force it off with `?norules`. It runs on a pure, DOM-free engine under `shared/engine/` that the
server and the tests share, with a thin client bridge. Coverage includes:

- Turn structure: setup, main, attack, and end phases; the once-per-turn draw, Energy attach,
  Supporter, and Stadium limits; retreat costs; passing; the between-turns checkup and Stadium
  damage.
- Legality: every action is checked before it happens and refused with a reason, and legal cards
  glow.
- Attacks: cost payment including discounts and special-energy providers, damage after weakness,
  resistance, and tools, and printed-text clause families such as scaling damage, coin flips, bench
  spread and snipes, damage counters, conditional KOs, healing, self-damage, damage prevention, and
  next-turn locks and bonuses.
- Trainer cards: text is parsed into ordered steps and run through guided UI, with discard costs
  paid before the search, draw, switch, heal, or attach that follows. Deterministic steps such as
  "draw 3" execute on their own.
- Abilities: a parser and classifier produce ordered step plans. Passive abilities (damage bonuses
  and reductions, HP bonuses, retreat modifiers, prize changes, KO prevention, attack inheritance,
  tool caps) apply automatically; activated abilities open their own pickers; Ancient Traits are
  recognized as non-Abilities.
- Stadiums: once-per-turn activation with usability gating, passive effects, overwrite rules, the
  no-Stadium-in-play rule, and Stadiums that grant extra or inherited attacks.
- Special Energy: text parses into typed descriptors and triggers for attach, discard, knockout,
  and end of turn, including once-per-game and takeover effects.
- Evolution: stage-sequence validation, the turn-1 and same-turn bans, Rare Candy line tracing,
  Grand Tree's chained search-evolve, and spirit links.
- Knockouts and prizes: rule-box-aware prize counts (ex and GX give 2; VMAX, TAG TEAM, V-UNION, and
  modern Mega ex give 3; legacy Mega-EX and LEGEND give 2), Active promotion choices, prize
  entitlements and pickers, deck-out and empty-board losses, and a sudden-death tiebreak for
  genuine simultaneous knockouts. A knocked-out Pokémon's Energy and Tools are discarded for you.
- Coin flips and mulligans: a seeded PRNG (`mulberry32`) makes every flip replayable, the opening
  turn order comes from a server-owned coin call with a full-screen 3D ceremony, and mulligans
  reshuffle and redraw automatically and grant the opponent bonus draws.
- Deck peeking: "look at the top or bottom N cards" requests are answered by the server to the
  asking player only, without changing the game state.

Rules coverage is audit-driven across the Standard card corpus. Text the engine recognizes but
cannot fully execute is announced and left for manual play rather than guessed; the audit scripts
under `scripts/` and the root `*-audit.mjs` files report parse coverage.

### Visuals and presentation

Card art uses per-rarity holofoil sheets (18 of them) driven by a virtual light model, with
pointer-tracked tilt on previews, idle drift on the board, and a luminance ink mask that keeps
printed ink black. Mat effects animate draws, knockouts, and shuffles, and add ambient motion, status
marker animation, and a per-player coin on the mat. The table gets its depth from a 3D tilt, a 3D
deck stack with a raised cover, a fan or stack layout for the hand, and resizable playmat halves.
Seven dark themes are available, with light-mode overrides per component. Ambient effects respect
`prefers-reduced-motion`; the holofoil drift is deliberately exempt, since it is the product's look.

### Online multiplayer

- Rooms are identified by a code you enter or generate. Join as a player or as a spectator; two
  names hold the seats, and there are no accounts.
- The opening deal runs only when both seated players have loaded decks and pressed Set Up.
- With `SERVER_AUTHORITATIVE=1`, the Express and Socket.IO server owns one `GameState`, validates
  and applies commands, and broadcasts a per-player redacted view. Turn player, turn number, and
  per-turn flags are reconciled from the server, so both clients agree.
- Every command is appended to a deterministic log with a seeded RNG cursor, which powers undo
  (replay minus the tail), the replay harnesses, and state hashing.
- A reconnecting player rejoins by name and catches up through a bounded peer action-log replay. If
  that fails it says so and asks for a reload and rejoin rather than guessing.
- A periodic heartbeat compares per-zone hashes. When they diverge the server names the first
  differing zone, and recovery routes into the same catch-up path.
- The server emits advisory events for attacks, knockouts, and trainer plays, and each client
  phrases them for its own side in the battle log.
- Without the flag the server is a relay and the clients sync through an action log. Rules mode
  still works, but a few server-side behaviors listed under [Known limitations](#known-limitations)
  are not enforced on this path.

### Game state import, export, and replay

The Options menu exports the current game state, imports a state (or a link to one), replays a
recorded game, and exports or clears the battle log. Exported states can be stored server-side
under a short key and reopened with `/import?key=...`; SQLite holds them for 30 days, and nothing
else is persisted. Two diagnostics loggers, enabled with `?syncLog=1` and `?decisionLog=1`, record
sync and decision traces for tracking down desyncs.

## Architecture

```
Browser (player 1)                    Browser (player 2)
   |  index.ejs: parent page with two iframes (self / opp playmats)
   |  client/src/**: plain ES modules, no bundler
   |
   +--------- Socket.IO ---------+
                                 v
                    server/server.js  (Express + Socket.IO)
                      |-- static files, EJS render, /import
                      |-- server/game/room.mjs: authoritative GameRoom
                      |     per-player views, pending choices,
                      |     turn-order coin call, reconnect, reset
                      |-- server/game/shadow.mjs: legacy shadow mode + sync telemetry
                      +-- SQLite (server/database/db.sqlite): state export/import only
                                 |
                    shared/engine/**: pure, DOM-free, headless-tested
                      state, cards, rng, view, commands, reduce
                      rules/**: attacks, trainers, abilities, stadiums,
                      special energy, evolution, KO/prize flow
```

The client is the whole front end: `index.ejs` as the page shell, two iframe documents for the
playmats, around 36 stylesheets, and `src/` organized by area (`setup/`, `actions/`,
`initialization/`). The server handles statics and EJS rendering through Express, transport through
Socket.IO, the authoritative `GameRoom`, a shadow/legacy translator, and SQLite through `sqlite3`.
Between them sits `shared/engine/`, the pure rules and game engine of about 90 modules with no DOM
or browser APIs: `state.mjs` for zones and hashing, `cards.mjs`, `rng.mjs`, `view.mjs` for
redaction, `commands.mjs` with roughly 70 command schemas, `reduce.mjs` for validation, reduction,
and the knockout, prize, and win flow, and `rules/` plus `effects/` for parsing and executing
attacks, trainers, abilities, stadiums, and special energy. It is served to the client at
`/shared`.

Card data comes from the TCGdex API (`api.tcgdex.net/v2/en`) at runtime for search, set browsing,
and art. No card database is bundled. With `SERVER_AUTHORITATIVE=1` the server is the authority;
without it, the server is a relay and clients own the game state, which is the historical mode kept
for local development.

## Project layout

```
client/                 Front end (EJS shell, iframes, ES modules, CSS, assets)
server/                 Express + Socket.IO server, GameRoom, shadow mode
  game/                 room.mjs, shadow.mjs, sync-check.mjs, tests
  database/             SQLite file (created at boot, gitignored)
shared/engine/          Pure game + rules engine shared by server, client and tests
bot/                    Headless bot brains (heuristic + coverage scorers)
scripts/                Asset pipelines and card-corpus audit scripts
tools/                  Dev utilities (sync-log comparison, mappings)
docs/                   Deep reference docs (taxonomy, netcode audit, parsing guide)
.agent/                 Agent harness: state, workflows, designs, journal, decisions, issues
                        (+ root-level *-audit.mjs / *-test.mjs harnesses and test scripts)
```

## Commands

| Command                                    | What it does                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `pnpm install`                             | Install workspace dependencies.                                             |
| `pnpm start`                               | Start the dev server with nodemon on `http://localhost:4000`.               |
| `node server/server.js`                    | Start the server without nodemon (production-style).                        |
| `pnpm test`                                | Run the full headless unit-test suite (`node --test`).                      |
| `node --test <glob>`                       | Run a subset, e.g. `node --test "shared/**/*.test.mjs"`.                    |
| `pnpm lint`                                | ESLint 9 over the repo.                                                     |
| `pnpm format`                              | Prettier over `**/*.{js,json,md}`.                                          |
| `pnpm test:2p`                             | Playwright two-browser sync/room harness (server on `:4000`).               |
| `pnpm test:flip`                           | Server-authoritative full-game "flip gate" (`:4100`, authoritative server). |
| `pnpm test:inspector`                      | Card-inspector UI end-to-end (`:4100`, authoritative server).               |
| `node playtest-bot.mjs --games=N --seed=S` | Bot-vs-bot soak; writes replayable dumps to `out/playtest/` on failure.     |
| `node integration-test.mjs`                | jsdom integration test of the deck builder (no server needed).              |

Other one-off harnesses live at the repo root: `two-player-sync-test.mjs`, `flip-gate-test.mjs`,
`test-card-inspector-e2e.mjs`, `coin-flip-visual-test.mjs`, `room-change-reset-test.mjs`,
`room-rejoin-reset-test.mjs`, `join-deck-sync-test.mjs`, `browser-test.mjs`, `explore-ui.mjs`,
`fullview-test.mjs`, and the `*-audit.mjs` corpus audits.

## Configuration

Environment variables:

| Variable               | Default                        | Purpose                                                                           |
| ---------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `PORT`                 | `4000`                         | HTTP port.                                                                        |
| `SERVER_AUTHORITATIVE` | off (on in the deploy config)  | Enable the server-authoritative command/view protocol.                            |
| `PTCG_E2E`             | off                            | Arm the `?e2e=1` test bridge; also armed whenever `NODE_ENV` is not `production`. |
| `NODE_ENV`             | none                           | `production` closes the `?e2e=1` test bridge (also set on the deploy config).     |
| `SHADOW_MODE`          | follows `SERVER_AUTHORITATIVE` | Run the legacy shadow simulation and sync telemetry.                              |
| `ROOM_GRACE_MS`        | 30 minutes                     | How long an empty room is kept before the sweep.                                  |
| `ADMIN_PASSWORD`       | `defaultPassword`              | Password for the Socket.IO admin UI; change it on any public deploy.              |

Browser flags:

| Flag                           | Effect                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `?e2e=1`                       | Install the `window.__ptcg` scripting bridge (requires the server gate to allow it). |
| `?norules`, `?debug`           | Force rules off for the current solo session.                                        |
| `?syncLog=1`, `?decisionLog=1` | Enable sync / decision diagnostic logging in the browser.                            |

Client-persisted `localStorage` keys include `ptcg-sim.deck-library.v1` (saved decks),
`ptcg-sim.last-session.v1`, `ptcg-sim.playmat.v1`, `ptcg-sim.rules-enforced.v1`,
`ptcg-sim.show-lost-zone`, `ptcg-sim.side-menu-collapsed`, and the logger and e2e flags.

## Testing

Unit tests run on plain `node --test` with stub card objects. There is no jsdom and no browser
involved. They cover the pure engine (state, reducer, commands, attacks, trainers, abilities,
stadiums, special energy, zones, hashing, redaction), the `GameRoom`, the client's pure modules
(deck builder, netcode adapters, models, image logic), and the bot.

Four Playwright harnesses drive real browsers against a manually started server:
`two-player-sync-test.mjs` for legacy sync, `flip-gate-test.mjs` and `test-card-inspector-e2e.mjs`
for server-authoritative full-game gates, and `coin-flip-visual-test.mjs` for the turn-order
ceremony.

The corpus audits, `scripts/audit-*.mjs` and the root `*-audit.mjs` files, classify and parse every
card in the scraped corpus and report coverage gaps and false positives for abilities, attacks,
trainers, stadiums, and special energy. `playtest-bot.mjs` runs the headless bot against itself
through the real UI with per-turn invariants and replay dumps on failure.

Current status of the unit suite: 2,844 tests, 2,843 passing. The single known failure is a
pre-existing assertion in `client/src/setup/rules/__tests__/card-inspector-model.test.mjs`
("retreat greys only when the cost is unpaid").

## Deployment

`render.yaml` defines two services. `ptcg-sim` is production, with `NODE_ENV=production` and
`SERVER_AUTHORITATIVE=1`. `ptcg-sim-staging` is a clone with `PTCG_E2E=1` so the Playwright bot can
drive a real deploy:

```bash
PTCG_URL=https://ptcg-sim-staging.onrender.com node playtest-bot.mjs --games=10
```

Both build with `pnpm install --frozen-lockfile`, start with `node server/server.js`, and health
check `/`. The SQLite file lives on the instance's ephemeral disk. It is created at boot and used
only for the 30-day state-export feature, so a restart drops exported links but no live games.

## Known limitations

- Desktop only. The layout targets desktop browsers; phones get an alert and a degraded experience.
- No accounts or user authentication. Players identify by name and hold a seat by name match, and
  rooms cap at two players plus spectators.
- Small-scale by design. No clustering, rate limiting, or durable game persistence, so an
  in-progress game is lost if the server restarts.
- Legacy parity gaps. Without `SERVER_AUTHORITATIVE`, GX once-per-game and Fossil Item bench
  placement are not enforced client-side. Further engine-level gaps are tracked in
  `.agent/ISSUES.md`.
- Long-tail card effects. A small number of exotic printed effects are recognized and announced but
  must be played manually.

## Documentation

- `docs/card-parsing-and-audit-guide.md`: how the card-text parsers are structured and extended.
- `docs/card-types-taxonomy.md`: parse-versus-needed gap catalog across card types.
- `docs/server-netcode-audit.md`: the netcode audit that drove the server-authoritative design.
- `docs/stadium-deep-mechanics-log.md`: Stadium coverage log.
- `docs/pkmncards-trainer-parse-and-lost-zone.md`: Trainer parsing and Lost Zone notes.
- `.agent/`: the repository's agent and contributor harness, with `PROJECT.md` for stable facts,
  `MAP.md` for where things live, `STATE.md` for current focus, `DECISIONS.md` for binding choices,
  `ISSUES.md` for the backlog, `designs/` for feature designs, and `journal/` for session history.
- `CLAUDE.md`: the operating manual for working in this repo. Read it before contributing.

## Contributing

1. Read `CLAUDE.md`. It defines the change workflow (scope, design, build, verify, review, record)
   and the project's constraints: no bundler, no new dependencies without a recorded decision, and
   a test for every behavior change.
2. Run the full suite before and after your change: `pnpm test`.
3. For browser-facing changes, exercise the feature end-to-end with the Playwright harnesses and
   record what you observed.

## License

MIT © Xiao Xiao Long. See [LICENSE](LICENSE).
