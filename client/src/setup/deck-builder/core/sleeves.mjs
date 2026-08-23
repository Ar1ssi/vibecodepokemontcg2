// Card sleeves for the deck builder. Sleeve metadata is sourced from the
    // Pokémon Sleeve Database (pokemon-sleeve-database.com), Mega Evolution
    // series. Images stay on the original CDN and are referenced by URL.
    
    const SLEEVE_IMAGE_BASE = 'https://pokemon-sleeve-database.com';
    
    const MEGA_EVOLUTION_SLEEVES = [
  {
    "id": "56f86004-ae18-4b31-bac1-40299c3d4076",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/56f86004-ae18-4b31-bac1-40299c3d4076.jpg",
    "name": "Zorua & Zoroark Good Night Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "July 2026"
  },
  {
    "id": "24fd026c-2665-4d35-8b0d-cbc809a021df",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/24fd026c-2665-4d35-8b0d-cbc809a021df.jpg",
    "name": "Sprigatito & Meowscarada Good Night Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "July 2026"
  },
  {
    "id": "66d8d9f6-745f-42fa-9031-9a4cc3b82943",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/66d8d9f6-745f-42fa-9031-9a4cc3b82943.jpg",
    "name": "Mega Rayquaza Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "July 2026"
  },
  {
    "id": "107eed03-a877-4a1d-be8c-41517ffbdc35",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/107eed03-a877-4a1d-be8c-41517ffbdc35.jpg",
    "name": "Jirachi Star Connection Pokémon Center - Yellow",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "July 2026"
  },
  {
    "id": "4e2e6432-2e51-44b5-860d-30b0777c22cb",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/4e2e6432-2e51-44b5-860d-30b0777c22cb.jpg",
    "name": "Flying Pikachu & Surfing Pikachu Pokémon Center - Orange",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "July 2026"
  },
  {
    "id": "b442d202-76ef-4191-9197-558e44d32388",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/b442d202-76ef-4191-9197-558e44d32388.jpg",
    "name": "Fletchling & Talonflame Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "July 2026"
  },
  {
    "id": "f9d550b2-238f-4293-88fd-94f456e0b328",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f9d550b2-238f-4293-88fd-94f456e0b328.jpg",
    "name": "Eevee Good Night Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "July 2026"
  },
  {
    "id": "ff75f742-e59e-4b5a-9f65-a27283de35fb",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/ff75f742-e59e-4b5a-9f65-a27283de35fb.jpg",
    "name": "Battle Start! Pokémon Center - Red",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "July 2026"
  },
  {
    "id": "bc3a5392-e2b8-4c57-b582-dd3578d79668",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/bc3a5392-e2b8-4c57-b582-dd3578d79668.jpg",
    "name": "Pitch Black Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "July 2026"
  },
  {
    "id": "1829b0fb-9a6c-493e-a418-8aedce7045da",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/1829b0fb-9a6c-493e-a418-8aedce7045da.jpg",
    "name": "Mewtwo & Mew DNA Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "July 2026"
  },
  {
    "id": "8513691a-3d42-4d31-8116-1c8fdf4780b1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/8513691a-3d42-4d31-8116-1c8fdf4780b1.jpg",
    "name": "Transform! Ditto Pokémon Center - Yellow",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "June 2026"
  },
  {
    "id": "79af4c10-8eb8-4048-9c6a-5bb77e62b803",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/79af4c10-8eb8-4048-9c6a-5bb77e62b803.jpg",
    "name": "Snorlax Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "June 2026"
  },
  {
    "id": "9ffb63e8-f599-4c58-9f81-9b46a872e399",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/9ffb63e8-f599-4c58-9f81-9b46a872e399.jpg",
    "name": "Latias & Latios Assist Pokémon Center - Red",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "June 2026"
  },
  {
    "id": "c5138810-f681-472c-83b1-5940864b215a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/c5138810-f681-472c-83b1-5940864b215a.jpg",
    "name": "HOPPE DAISHŪGO Pokémon Center - Green",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "June 2026"
  },
  {
    "id": "a9ceee2e-7d93-471b-8fc6-1288313553ac",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/a9ceee2e-7d93-471b-8fc6-1288313553ac.jpg",
    "name": "Mega Charizard Y",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "May 2026"
  },
  {
    "id": "5f123df1-82c9-4fae-998c-9e5ce1d7eb9a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/5f123df1-82c9-4fae-998c-9e5ce1d7eb9a.jpg",
    "name": "Mega Charizard X",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "May 2026"
  },
  {
    "id": "70481dab-57a2-4309-acdf-68e3fb05b2ed",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/70481dab-57a2-4309-acdf-68e3fb05b2ed.jpg",
    "name": "Spiritomb Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "dfcf3980-2c0c-4601-a4b1-adafd3196e3e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/dfcf3980-2c0c-4601-a4b1-adafd3196e3e.jpg",
    "name": "Silvally & Gladion Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "5d75197a-ce94-41e7-badc-c857cfa87ae3",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/5d75197a-ce94-41e7-badc-c857cfa87ae3.jpg",
    "name": "Pokémon Fossil Museum Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "98ded315-f6a1-463d-bc8b-362da8a47fd8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/98ded315-f6a1-463d-bc8b-362da8a47fd8.jpg",
    "name": "Playroom Pokémon Center - Green",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "a343d838-c8cb-4a28-b804-bb2e2ab469e5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/a343d838-c8cb-4a28-b804-bb2e2ab469e5.jpg",
    "name": "Morpeko Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "52a78878-0457-4619-bc4a-6cba7853998e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/52a78878-0457-4619-bc4a-6cba7853998e.jpg",
    "name": "Mega Darkrai Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "262d0a45-cab2-4b1c-ade8-8eac31d9e595",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/262d0a45-cab2-4b1c-ade8-8eac31d9e595.jpg",
    "name": "Gwynn & Mega Chandelure Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "01a98177-6eb3-47bb-86e2-f7f46980e003",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/01a98177-6eb3-47bb-86e2-f7f46980e003.jpg",
    "name": "Gift of the Forest Pokémon Center - Yellow",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "c6eeb276-7a87-4556-8f07-b072d14ea4df",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/c6eeb276-7a87-4556-8f07-b072d14ea4df.jpg",
    "name": "Gengar Pokémon Center - Orange",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "264d7998-44a1-4449-bcc4-c56fafa36d1d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/264d7998-44a1-4449-bcc4-c56fafa36d1d.jpg",
    "name": "Flying Charizard Pokémon Center - Purple",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "65aaeaa8-18f4-461c-ab51-dc21dae9a18b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/65aaeaa8-18f4-461c-ab51-dc21dae9a18b.jpg",
    "name": "Exhausted Pokémon Center - Blue",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "e0de0eff-14c6-4629-91df-5388168759bc",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/e0de0eff-14c6-4629-91df-5388168759bc.jpg",
    "name": "Evolution line Chandelure Pokémon Center - Black",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "63d8ada8-e577-4da6-bc20-db54a0911e27",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/63d8ada8-e577-4da6-bc20-db54a0911e27.jpg",
    "name": "DOWASURE Pokémon Center - Pink",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "a9476d13-5d95-4e84-9161-b6671fdcaecc",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/a9476d13-5d95-4e84-9161-b6671fdcaecc.jpg",
    "name": "Crayon Mimikyu Pokémon Center - Green",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "50bf100f-90cf-45c5-a110-c7fbe5d59900",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/50bf100f-90cf-45c5-a110-c7fbe5d59900.jpg",
    "name": "COOL×METAL Lucario Pokémon Center - Blue",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "12d74380-3b12-4615-bd31-1d9eb0c0a1df",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/12d74380-3b12-4615-bd31-1d9eb0c0a1df.jpg",
    "name": "Chaos Rising Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "May 2026"
  },
  {
    "id": "3df9bbb7-2a09-4493-917a-a54e461fe20e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/3df9bbb7-2a09-4493-917a-a54e461fe20e.jpg",
    "name": "Pokémon Soda Pop Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "cac89435-960a-46e5-9487-9c5b0eaa7073",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/cac89435-960a-46e5-9487-9c5b0eaa7073.jpg",
    "name": "Ogerpon Festival Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "4f9e0089-50ee-4c06-bd19-45f746eb71e8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/4f9e0089-50ee-4c06-bd19-45f746eb71e8.jpg",
    "name": "Hawlucha Libre Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "7297d4fb-b141-4d94-9c67-b6cf283455e8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/7297d4fb-b141-4d94-9c67-b6cf283455e8.jpg",
    "name": "Greninja Slashing Waves Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "4ae54f2a-191c-40d0-adf0-eca303bfc58e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/4ae54f2a-191c-40d0-adf0-eca303bfc58e.jpg",
    "name": "Gardevoir Majesty Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "fcc66189-7c76-4e36-9528-3fe056e2766b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/fcc66189-7c76-4e36-9528-3fe056e2766b.jpg",
    "name": "Gallade Majesty Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "58649448-7b82-4d78-8412-21a30dde1042",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/58649448-7b82-4d78-8412-21a30dde1042.jpg",
    "name": "Celadon Game Corner Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "6458b8b8-cad8-4a3f-83c3-c3cb3313443a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/6458b8b8-cad8-4a3f-83c3-c3cb3313443a.jpg",
    "name": "Belibolt Hugs Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "May 2026"
  },
  {
    "id": "500b0c3e-fbd8-4e7d-a4fd-baff635de6f5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/500b0c3e-fbd8-4e7d-a4fd-baff635de6f5.jpg",
    "name": "Perfect Order Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "March 2026"
  },
  {
    "id": "57c328bd-008b-4bb8-b3a9-c9f3ae77d396",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/57c328bd-008b-4bb8-b3a9-c9f3ae77d396.jpg",
    "name": "Explore Pokémon - Unova Liberty Garden Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "0670cdb1-67b5-4a54-bf35-faec9ff0916a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/0670cdb1-67b5-4a54-bf35-faec9ff0916a.jpg",
    "name": "Explore Pokémon - Sinnoh Mt. Coronet Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "bbc0d24b-7dbc-4022-ae83-f4f9c9334264",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/bbc0d24b-7dbc-4022-ae83-f4f9c9334264.jpg",
    "name": "Explore Pokémon - Paldea Area Zero Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "4909f075-7318-4152-aa2d-6cee680dc168",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/4909f075-7318-4152-aa2d-6cee680dc168.jpg",
    "name": "Explore Pokémon - Kanto Viridian Forest Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "73a167a6-7efd-4a66-881a-17798e61ddc6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/73a167a6-7efd-4a66-881a-17798e61ddc6.jpg",
    "name": "Explore Pokémon - Kalos Laverre City Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "984ec7ca-4a45-4b65-b4af-18ed6b4ceb25",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/984ec7ca-4a45-4b65-b4af-18ed6b4ceb25.jpg",
    "name": "Explore Pokémon - Johto National Park Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "1b34e9b5-08b7-4d06-aaf2-1470d3d2e3e2",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/1b34e9b5-08b7-4d06-aaf2-1470d3d2e3e2.jpg",
    "name": "Explore Pokémon - Hoenn Southern Island Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "c82ccf50-b1c4-4ab9-822f-1c21800dabf0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/c82ccf50-b1c4-4ab9-822f-1c21800dabf0.jpg",
    "name": "Explore Pokémon - Galar Glimwood Tangle Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "766506ea-6fbd-4960-86f6-d4ca5c3cf980",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/766506ea-6fbd-4960-86f6-d4ca5c3cf980.jpg",
    "name": "Explore Pokémon - Alola Exeggutor Island Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "b8c304ae-73bb-426d-8c41-b173c10a318d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/b8c304ae-73bb-426d-8c41-b173c10a318d.jpg",
    "name": "Energy Type - Water",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "1d43022a-b4bd-4d00-9098-e65b1879ea64",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/1d43022a-b4bd-4d00-9098-e65b1879ea64.jpg",
    "name": "Energy Type - Psychic",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "0d226ca1-9235-450e-82ad-6458afe1d87a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/0d226ca1-9235-450e-82ad-6458afe1d87a.jpg",
    "name": "Energy Type - Metal",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "8f035ee1-1096-4db5-a63f-9338d30bd07c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/8f035ee1-1096-4db5-a63f-9338d30bd07c.jpg",
    "name": "Energy Type - Lightning",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "dcbdefdc-d733-4342-a75c-d3eefbdf425e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/dcbdefdc-d733-4342-a75c-d3eefbdf425e.jpg",
    "name": "Energy Type - Grass",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "b52817dc-aba8-4a21-a354-b8913e310e7a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/b52817dc-aba8-4a21-a354-b8913e310e7a.jpg",
    "name": "Energy Type - Fire",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "d4f9b338-1032-4c67-92a2-4364cdbdddfc",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/d4f9b338-1032-4c67-92a2-4364cdbdddfc.jpg",
    "name": "Energy Type - Fighting",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "95c266dd-85a5-4a11-b49b-8b1387dde709",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/95c266dd-85a5-4a11-b49b-8b1387dde709.jpg",
    "name": "Energy Type - Dragon",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "b7bc9387-5ba1-40ca-ad37-86316463e7cb",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/b7bc9387-5ba1-40ca-ad37-86316463e7cb.jpg",
    "name": "Energy Type - Darkness",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "fb213952-fd55-466e-b9ae-c8ec954237b6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/fb213952-fd55-466e-b9ae-c8ec954237b6.jpg",
    "name": "Energy Type - Colorless",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "March 2026"
  },
  {
    "id": "fd024f5b-7633-4848-afd6-1a87d21c259a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/fd024f5b-7633-4848-afd6-1a87d21c259a.jpg",
    "name": "Roxie & Crobat Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "4d84f6a6-e9f2-493e-9ba8-23e707cb611b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/4d84f6a6-e9f2-493e-9ba8-23e707cb611b.jpg",
    "name": "Pikachu and Heart Pokémon Center - Orange",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "bec989c4-e344-495f-96e8-52fc35dcf083",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/bec989c4-e344-495f-96e8-52fc35dcf083.jpg",
    "name": "Patrat Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "b4952582-3bc4-4bb8-87f6-07dd88f771ff",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/b4952582-3bc4-4bb8-87f6-07dd88f771ff.jpg",
    "name": "Mega Greninja Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "d92570dc-bbd5-43a4-b7d6-9094993ba975",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/d92570dc-bbd5-43a4-b7d6-9094993ba975.jpg",
    "name": "Mega Gengar Pokémon Center - Purple",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "a85cae77-f308-483c-86dc-11234329fa17",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/a85cae77-f308-483c-86dc-11234329fa17.jpg",
    "name": "Mega Floette Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "746f4ccd-7de6-4296-b99c-f3c5f4c55433",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/746f4ccd-7de6-4296-b99c-f3c5f4c55433.jpg",
    "name": "Goomy & Sliggoo Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "98084382-67aa-478a-a559-3f46cd62515b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/98084382-67aa-478a-a559-3f46cd62515b.jpg",
    "name": "Cinccino & Minccino Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "March 2026"
  },
  {
    "id": "ac4e17b1-4401-4e7d-bc90-6d51d60431ad",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/ac4e17b1-4401-4e7d-bc90-6d51d60431ad.jpg",
    "name": "Opening Scene Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "February 2026"
  },
  {
    "id": "a3102251-614b-4198-8ebd-ac2f57162c0e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/a3102251-614b-4198-8ebd-ac2f57162c0e.jpg",
    "name": "Ascended Heroes Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "February 2026"
  },
  {
    "id": "795a0edd-ef48-4598-b401-2f1997746794",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/795a0edd-ef48-4598-b401-2f1997746794.jpg",
    "name": "30th Anniversary Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "February 2026"
  },
  {
    "id": "8b4c16c5-00ea-490d-b571-0cec55091a74",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/8b4c16c5-00ea-490d-b571-0cec55091a74.jpg",
    "name": "Meowth Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "January 2026"
  },
  {
    "id": "f0522afd-c6bb-454a-ac97-1d353354886f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f0522afd-c6bb-454a-ac97-1d353354886f.jpg",
    "name": "Mega Zygarde Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "January 2026"
  },
  {
    "id": "7b1dae82-7857-436a-a138-301b480d8173",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/7b1dae82-7857-436a-a138-301b480d8173.jpg",
    "name": "Mega Starmie Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "January 2026"
  },
  {
    "id": "1856db40-a44f-4204-b563-9cca081ff912",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/1856db40-a44f-4204-b563-9cca081ff912.jpg",
    "name": "Mega Clefable Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "January 2026"
  },
  {
    "id": "e4d74649-24f6-4643-9c71-293b4ad0984d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/e4d74649-24f6-4643-9c71-293b4ad0984d.jpg",
    "name": "Canari & Mega Eelektross Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "January 2026"
  },
  {
    "id": "50147454-c114-41e9-a037-2e2dc6c3cc23",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/50147454-c114-41e9-a037-2e2dc6c3cc23.jpg",
    "name": "OTENKI TEAM Pokémon Center - Yellow",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "December 2025"
  },
  {
    "id": "d4e346a9-c0e1-49f4-81a3-7550cf8e0701",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/d4e346a9-c0e1-49f4-81a3-7550cf8e0701.jpg",
    "name": "Pikachu & Thunder Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "November 2025"
  },
  {
    "id": "d6d790de-0ec2-4d0d-b9f8-d4acf9b7ba6a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/d6d790de-0ec2-4d0d-b9f8-d4acf9b7ba6a.jpg",
    "name": "N & Reshiram & Zekrom Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "November 2025"
  },
  {
    "id": "86456fdb-d9b2-4990-94c6-5ac3657b8260",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/86456fdb-d9b2-4990-94c6-5ac3657b8260.jpg",
    "name": "Mega Dragonite Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "November 2025"
  },
  {
    "id": "84bd3617-2d2f-4894-9993-631ec42911f5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/84bd3617-2d2f-4894-9993-631ec42911f5.jpg",
    "name": "Iris & Haxorus Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "November 2025"
  },
  {
    "id": "a399a4af-41af-4128-b09f-3819e09c406c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/a399a4af-41af-4128-b09f-3819e09c406c.jpg",
    "name": "Budew Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "November 2025"
  },
  {
    "id": "fd256ded-c248-4146-9d19-d1c6fbbc767c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-premium-collection/fd256ded-c248-4146-9d19-d1c6fbbc767c.jpg",
    "name": "Mega Charizard X ex Ultra Premium Collection",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Premium Collection",
    "releaseDate": "November 2025"
  },
  {
    "id": "8f3315fe-dd1d-478d-9a77-93032ff20c68",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/8f3315fe-dd1d-478d-9a77-93032ff20c68.jpg",
    "name": "Neon Kanto APEX - Venusaur",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "November 2025"
  },
  {
    "id": "a22baf13-4272-42ca-ad97-5144e966f3be",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/a22baf13-4272-42ca-ad97-5144e966f3be.jpg",
    "name": "Neon Kanto APEX - Charizard",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "November 2025"
  },
  {
    "id": "e9e12437-8c88-4ad1-a84a-c9b88829b88c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/e9e12437-8c88-4ad1-a84a-c9b88829b88c.jpg",
    "name": "Neon Kanto APEX - Blastoise",
    "brand": "Ultra Pro",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "November 2025"
  },
  {
    "id": "08266b9d-1d37-4ddb-a458-9adc302edb62",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/08266b9d-1d37-4ddb-a458-9adc302edb62.jpg",
    "name": "Phantasmal Flames Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "November 2025"
  },
  {
    "id": "715493e0-61dc-4a19-a60c-b75e2085017e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/715493e0-61dc-4a19-a60c-b75e2085017e.jpg",
    "name": "Evolution line Chandelure Pokémon Center - Grey",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "October 2025"
  },
  {
    "id": "c5a7364c-b951-4303-8ea4-84ec4e724036",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/c5a7364c-b951-4303-8ea4-84ec4e724036.jpg",
    "name": "Kagawa Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "October 2025"
  },
  {
    "id": "7181108e-dbd4-43da-ad0a-a9f51f1f13d2",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/trainer-toolkit/7181108e-dbd4-43da-ad0a-a9f51f1f13d2.jpg",
    "name": "2025 Trainer Toolkit",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Trainer Toolkit",
    "releaseDate": "October 2025"
  },
  {
    "id": "af50e6b2-88c3-4a11-9a4f-bd67123ef7f8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/af50e6b2-88c3-4a11-9a4f-bd67123ef7f8.jpg",
    "name": "Teahouse Poltchageist Pokémon Center - White",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "October 2025"
  },
  {
    "id": "6c19951d-f44a-447c-8ab0-72748344ca12",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/6c19951d-f44a-447c-8ab0-72748344ca12.jpg",
    "name": "Snowy Gathering Pokémon Center - Blue",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "October 2025"
  },
  {
    "id": "afa61d91-5362-4bdf-a750-577adb115136",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/afa61d91-5362-4bdf-a750-577adb115136.jpg",
    "name": "Relaxed Teasing Pokémon Center - Light Blue",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "October 2025"
  },
  {
    "id": "ec80ca43-8141-4bdc-9793-7edb2c2f2aa9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/ec80ca43-8141-4bdc-9793-7edb2c2f2aa9.jpg",
    "name": "Milotic Pokémon Center - Pink",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "October 2025"
  },
  {
    "id": "fa8fb07d-4e0a-48f2-8ae0-1265fc85d7aa",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/fa8fb07d-4e0a-48f2-8ae0-1265fc85d7aa.jpg",
    "name": "Always slow, totally clueless, huh? Pokémon Center - Yellow",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "October 2025"
  },
  {
    "id": "d0ccbad0-c113-48e9-86ae-bf0b0430d392",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/d0ccbad0-c113-48e9-86ae-bf0b0430d392.jpg",
    "name": "Celestial Umbreon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "October 2025"
  },
  {
    "id": "beeb0ad5-2757-4e9d-9627-f4e75b206da8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/beeb0ad5-2757-4e9d-9627-f4e75b206da8.jpg",
    "name": "Celestial Espeon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "October 2025"
  },
  {
    "id": "07166608-76fb-4ebc-b81c-74d75b353aff",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/07166608-76fb-4ebc-b81c-74d75b353aff.jpg",
    "name": "Togedemaru & Yamper Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "September 2025"
  },
  {
    "id": "5535be91-fb9d-4400-9f96-749b3821b9de",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/5535be91-fb9d-4400-9f96-749b3821b9de.jpg",
    "name": "Piplup & Prinplup & Empoleon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "September 2025"
  },
  {
    "id": "4999d1c2-1392-4ccc-b194-ee15898b5984",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/4999d1c2-1392-4ccc-b194-ee15898b5984.jpg",
    "name": "Pikachu & Berries Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "September 2025"
  },
  {
    "id": "bd1b5dcf-1d21-4d21-b257-c95a89a0879a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/bd1b5dcf-1d21-4d21-b257-c95a89a0879a.jpg",
    "name": "Mismagius Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "September 2025"
  },
  {
    "id": "5341801a-a512-4842-ae15-bd8ce8748f8d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/5341801a-a512-4842-ae15-bd8ce8748f8d.jpg",
    "name": "Mega Evolution Elite Trainer Box - Mega Lucario",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "September 2025"
  },
  {
    "id": "00b68849-fd1f-4908-a8d8-b44ac392e455",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/00b68849-fd1f-4908-a8d8-b44ac392e455.jpg",
    "name": "Mega Evolution Elite Trainer Box - Mega Gardevoir",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "September 2025"
  },
  {
    "id": "baef4a03-e4d3-46f2-b4c7-fcdd282fbe17",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/baef4a03-e4d3-46f2-b4c7-fcdd282fbe17.jpg",
    "name": "Mega Charizard X Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "September 2025"
  },
  {
    "id": "358b2218-58bf-4562-86d5-a314cea15833",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/358b2218-58bf-4562-86d5-a314cea15833.jpg",
    "name": "Mega Charizard X Castle Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "September 2025"
  },
  {
    "id": "8de0463a-847b-4835-9139-204e9df6bc2b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/premium-figure-collection/8de0463a-847b-4835-9139-204e9df6bc2b.jpg",
    "name": "Espeon & Umbreon Premium Figure Collection",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Premium Figure Collection",
    "releaseDate": "September 2025"
  },
  {
    "id": "f15661f8-4947-44a5-bcf0-be71d7eadb8a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f15661f8-4947-44a5-bcf0-be71d7eadb8a.jpg",
    "name": "Dawn Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "September 2025"
  }
];
    
    export function getSleeves() {
      return MEGA_EVOLUTION_SLEEVES.map((sleeve) => ({ ...sleeve }));
    }
    
    export function getSleeveById(id) {
      const sleeve = MEGA_EVOLUTION_SLEEVES.find((entry) => entry.id === id);
      return sleeve ? { ...sleeve } : null;
    }
    
    export function filterSleevesByName(sleeves = [], term = '') {
      const needle = String(term || '').trim().toLowerCase();
      if (!needle) return [...sleeves];
      return sleeves.filter((sleeve) => String(sleeve.name || '').toLowerCase().includes(needle));
    }
    