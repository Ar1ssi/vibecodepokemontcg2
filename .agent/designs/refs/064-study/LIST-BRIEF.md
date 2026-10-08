# Signature moves of legendary Pokémon — brief for the list agent

You build the list of signature moves that design 064 (signature move animations for a Pokémon
TCG simulator) will animate, then fetch their reference videos with the provided script. You do
NOT touch the repository. Work only inside this folder (`sig/`); put your own scripts and caches
in `sig/tools/`.

## Scope (the user's decision)
- **Legendaries**, including sub-legendaries: PokéAPI `pokemon-species` with `is_legendary: true`
  (box legends, birds, beasts, Regis, lake trio, Swords of Justice, Forces of Nature, Tapus,
  Cosmog line, Type: Null/Silvally, Kubfu/Urshifu, Treasures of Ruin, Loyal Three, Ogerpon,
  Terapagos, Koraidon, Miraidon, …).
- **Mythicals**: `is_mythical: true`.
- **Paradox legend-tier** (not flagged by PokéAPI; add them by name): `walking-wake`,
  `iron-leaves`, `raging-bolt`, `gouging-fire`, `iron-crown`, `iron-boulder`.
- Games up to and including **Pokémon Legends: Z-A** (2025) and its DLC.
- NOT in scope: Ultra Beasts, other Paradox Pokémon, regular Pokémon (e.g. Floette's Light of
  Ruin is out), Z-Moves, Max Moves, G-Max Moves.

## Definition of a signature move
A move is a signature move of the scope when every Pokémon that can learn it (PokéAPI
`/api/v2/move/<slug>` → `learned_by_pokemon`, every form) belongs to the scope AND either
(a) all learners are forms/evolutions of ONE species line (e.g. Cosmog → Solgaleo, Kubfu →
Urshifu, Meltan → Melmetal, Type: Null → Silvally), or (b) all learners belong to ONE recognised
legendary group (lake trio, Swords of Justice + Keldeo, Forces of Nature, Tapus, Treasures of
Ruin, Kyurem/Reshiram/Zekrom, the Eon duo, the Galarian birds, …). Status moves count; mark them.
An empty `learned_by_pokemon` means a Z-/Max move or an unlearnable move: exclude it.

## Procedure
1. Fetch every species once (`/api/v2/pokemon-species?limit=2000`, then each species) and build:
   the in-scope species set with its group label (`legendary | mythical | paradox`), and a map
   from every pokemon/form name (`varieties[].pokemon.name`) to its species. Cache the JSON in
   `tools/cache/` so a re-run does not refetch. Be polite: ≤ 6 requests in flight.
2. Fetch every move (`/api/v2/move?limit=2000`, then each move); keep `learned_by_pokemon`,
   English and French names (`names[]`, language `en` / `fr`), `type`, `damage_class`,
   `power`, `generation`.
3. Apply the definition. For each hit record the owner species (all of them, comma-separated).
4. **Near misses** (list separately; do NOT put them in move-list.txt): moves where at least one
   learner is in scope and at most 3 learner species are outside it (e.g. Sacred Sword, which
   Gallade and others can also learn), and moves that were signature moves when introduced but
   are no longer exclusive. Give the outside learners.
5. **Legends Z-A**: PokéAPI may not cover it yet. Find the new moves Legends Z-A (and its DLC)
   introduced and decide which are signature moves of in-scope species. Sources, in this order:
   Poképédia (`https://www.pokepedia.fr/Légendes_Pokémon_:_Z-A` and the pages it links for
   moves; Poképédia's search API `https://www.pokepedia.fr/api.php?action=opensearch&search=<text>`),
   then a web search. Give the French name exactly as Poképédia titles the move page, its type and
   class. Mark these rows `source: Z-A (Poképédia)`.
6. **Cross-check** your result against this list written from memory (it may be wrong in both
   directions; it is a checklist, not a source). For each name in it that is NOT in your result,
   say why (not exclusive: who else learns it; not in scope; not found). For each move in your
   result that is NOT in it, keep it — your data wins.
   aeroblast, sacred-fire, mist-ball, luster-purge, origin-pulse, precipice-blades,
   dragon-ascent, doom-desire, psycho-boost, roar-of-time, spacial-rend, shadow-force,
   magma-storm, crush-grip, lunar-dance, lunar-blessing, dark-void, seed-flare, heart-swap,
   judgment, v-create, blue-flare, fusion-flare, bolt-strike, fusion-bolt, glaciate, freeze-shock,
   ice-burn, secret-sword, relic-song, techno-blast, sacred-sword, geomancy, oblivion-wing,
   thousand-arrows, thousand-waves, lands-wrath, core-enforcer, diamond-storm, hyperspace-hole,
   hyperspace-fury, steam-eruption, natures-madness, multi-attack, sunsteel-strike,
   moongeist-beam, photon-geyser, prismatic-laser, spectral-thief, plasma-fists, fleur-cannon,
   double-iron-bash, behemoth-blade, behemoth-bash, dynamax-cannon, eternabeam, wicked-blow,
   surging-strikes, thunder-cage, dragon-energy, freezing-glare, thunderous-kick, fiery-wrath,
   glacial-lance, astral-barrage, jungle-healing, mystical-power, bleakwind-storm,
   wildbolt-storm, sandsear-storm, springtide-storm, collision-course, electro-drift, ruination,
   ivy-cudgel, tera-starstorm, malignant-chain, hydro-steam, psyblade, thunderclap,
   burning-bulwark, tachyon-cutter, mighty-cleave, psystrike.
7. Write the outputs (below). Then run the fetch: `node fetch-sig.mjs` from this folder. It is
   resumable and prints one line per move; it can take 10–20 minutes for ~90 moves, so run it in
   chunks with `timeout 540 node fetch-sig.mjs` repeated until the last line reads `done` with
   nothing pending. Then `RETRY=1 timeout 540 node fetch-sig.mjs` once for any `error` rows.
   For a row that still fails because the French name is wrong, find the right Poképédia title
   (search API above), fix `move-list.txt`, delete that slug from `moves/manifest.json`, re-run.
   Never edit `fetch-sig.mjs`.

## Outputs (in `sig/`)
- `signature-list.tsv` — header then one row per move, columns:
  `slug  english  french  type  class  power  owners  group  generation  source  notes`
  (`owners` = species slugs comma-separated; `group` = legendary|mythical|paradox|mixed;
  `source` = `PokéAPI` or `Z-A (Poképédia)`; `notes` = e.g. "status move", "form-only: zacian-crowned").
  Sort by type, then slug.
- `move-list.txt` — one line per move: `slug|French name|type|class` (French name exactly as
  the Poképédia page title, with spaces; type/class lowercase PokéAPI words).
- `list-report.md` — counts per group and per type; the near-miss table; the cross-check
  results; every species in scope that ends up with NO signature move (one line, comma-separated);
  any uncertainty.

## Return to the caller
The three output paths, the number of moves, the fetch summary (the script's last two lines),
and the list of moves whose reference is not an EV video (with the tag used or "none").
Nothing else.
