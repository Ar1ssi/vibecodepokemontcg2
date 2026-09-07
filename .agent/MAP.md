# Map — where things live. First stop when locating code; grep comes after, wholesale reading never.
<!-- One line per module: `path — what it is; entry: <file>`. Update on any structure change.
     Cap 120 lines: when over, collapse a subtree into .agent/areas/<x>.md and keep one line here
     pointing at it. `(?)` marks unverified bootstrap guesses — verify on first visit, then remove. -->

.agent/ — agent harness: state, workflows, designs, journal (human manual: .agent/README.md)
client/ — client application (EJS layout, CSS styles, client JS, deck builder, rules engine); entry: client/src/front-end.js
server/ — backend server (Express HTTP server, Socket.IO multiplayer sync, SQLite DB); entry: server/server.js
docs/ — project documentation (card types taxonomy, rule specs); entry: docs/card-types-taxonomy.md
scripts/ — admin and asset utility scripts (stadium audit, mat generator, scraper)
tools/ — internal dev tools, sync log comparison, asset mappings

