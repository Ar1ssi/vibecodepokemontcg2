// Card sleeves for the deck builder. Sleeve metadata is sourced from the
    // Pokémon Sleeve Database (pokemon-sleeve-database.com), Mega Evolution
    // series. Images stay on the original CDN and are referenced by URL.
    
    const SLEEVE_IMAGE_BASE = 'https://pokemon-sleeve-database.com';
    
    const MEGA_EVOLUTION_SLEEVES = [
  {
    "id": "primal-groudon-etb-sleeve",
    "image": "src/assets/sleeves/Primal_Groudon_ETB_Sleeve.jpg",
    "name": "Primal Groudon ETB Sleeve",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "May 2015"
  },
  {
    "id": "primal-kyogre-etb-sleeve",
    "image": "src/assets/sleeves/Primal_Kyogre_ETB_Sleeve.jpg",
    "name": "Primal Kyogre ETB Sleeve",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "May 2015"
  },
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
,
  {
    "id": "967b4390-68ff-4182-9b94-7fadc35f79fc",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/967b4390-68ff-4182-9b94-7fadc35f79fc.jpg",
    "name": "Umbreon 30th CELEBRATION Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "69d4f14a-cc16-4105-8806-4a73767e3d10",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/69d4f14a-cc16-4105-8806-4a73767e3d10.jpg",
    "name": "No. 30 Nidorina 30th CELEBRATION Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "ca67affc-5e21-4551-9e38-e62e930bd61a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/ca67affc-5e21-4551-9e38-e62e930bd61a.jpg",
    "name": "Morpeko Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "3f0fe14e-4823-420f-a1f8-c9bd266cefc0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/3f0fe14e-4823-420f-a1f8-c9bd266cefc0.jpg",
    "name": "First Partner Pokémon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "bf87efb9-a69b-49f2-8511-68f2a02085a5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/bf87efb9-a69b-49f2-8511-68f2a02085a5.jpg",
    "name": "Espeon 30th CELEBRATION Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b718b479-568f-4fe5-9a47-70d9ad6a0efe",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/b718b479-568f-4fe5-9a47-70d9ad6a0efe.jpg",
    "name": "Embroidered Design Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "487b084d-2d47-4486-abd2-d4c09f4fec0a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/487b084d-2d47-4486-abd2-d4c09f4fec0a.jpg",
    "name": "30th CELEBRATION Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b305fed8-5d12-4e87-ac18-81f455034478",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/b305fed8-5d12-4e87-ac18-81f455034478.jpg",
    "name": "30th Anniversary Design Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "a594285e-7a44-4eb0-8d89-684f99a62b41",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/a594285e-7a44-4eb0-8d89-684f99a62b41.jpg",
    "name": "Terapagos (Terastal Form) Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "31751aca-a12c-4034-afb9-28bf179f6446",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/31751aca-a12c-4034-afb9-28bf179f6446.jpg",
    "name": "Tatsugiri, To the usual place Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "af6c1df4-7b61-49c2-925a-ac221032b456",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/af6c1df4-7b61-49c2-925a-ac221032b456.jpg",
    "name": "Ogerpon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "bb8413d4-f0a4-48e3-975a-5bb064675bba",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/bb8413d4-f0a4-48e3-975a-5bb064675bba.jpg",
    "name": "Kitakami Village Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "8dccf403-194d-4f67-a603-3bfcc7e7c4a3",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/8dccf403-194d-4f67-a603-3bfcc7e7c4a3.jpg",
    "name": "Eevee Evolutions Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "90db0c95-9ce1-4cc6-a008-99636a16c2d9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/90db0c95-9ce1-4cc6-a008-99636a16c2d9.jpg",
    "name": "Unova Adventure - Reshiram & Amoonguss Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f90406ba-e17b-49aa-851f-5d4194440e20",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f90406ba-e17b-49aa-851f-5d4194440e20.jpg",
    "name": "Sinnoh Adventure - Dialga & Lucario Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "0826a056-a579-469e-853f-81c45f825558",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/0826a056-a579-469e-853f-81c45f825558.jpg",
    "name": "Paldea Adventure - Koraidon & Paldean Clodsire Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "29672613-a78d-44bd-9d2b-0885ae3c16ec",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/29672613-a78d-44bd-9d2b-0885ae3c16ec.jpg",
    "name": "Kanto Adventure - Pikachu & Snorlax Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "25e67537-eaa3-4e13-b72b-fdef3b65efad",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/25e67537-eaa3-4e13-b72b-fdef3b65efad.jpg",
    "name": "Kalos Adventure - Xerneas & Noivern Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "fea3419f-8ddd-4483-89aa-eced5090c580",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/fea3419f-8ddd-4483-89aa-eced5090c580.jpg",
    "name": "Shiny Tinkaton Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "518444ec-42c7-4890-99d6-3c0ddb0efe8b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/518444ec-42c7-4890-99d6-3c0ddb0efe8b.jpg",
    "name": "Shiny Kingambit Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f8f2981e-107a-4d23-8cdb-f5555deeff81",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f8f2981e-107a-4d23-8cdb-f5555deeff81.jpg",
    "name": "Palafin Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "dd8f0e5c-3abe-49de-8198-2e0f22c1f206",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/dd8f0e5c-3abe-49de-8198-2e0f22c1f206.jpg",
    "name": "Order Up Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "af6ca4ef-3e48-420a-bcaa-604943132b9b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/af6ca4ef-3e48-420a-bcaa-604943132b9b.jpg",
    "name": "Nemona Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "5c356897-7e22-476c-90b0-760d2592b1a5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/5c356897-7e22-476c-90b0-760d2592b1a5.jpg",
    "name": "Iono Zone Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b76c3ba7-dc95-4836-8c27-cca86808dbf0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/b76c3ba7-dc95-4836-8c27-cca86808dbf0.jpg",
    "name": "Connecting World Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "5104bd23-8bbb-4fac-b097-f8fdb78af490",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/5104bd23-8bbb-4fac-b097-f8fdb78af490.jpg",
    "name": "Ceruledge & Armarouge Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "6f8b7ad2-ba5a-4ba0-a72e-287fdd8760b5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/6f8b7ad2-ba5a-4ba0-a72e-287fdd8760b5.jpg",
    "name": "POKÉMON TRAINERS Rika & Clodsire Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f5b7e9b1-d658-4e41-a17d-b2dba63f2f9e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f5b7e9b1-d658-4e41-a17d-b2dba63f2f9e.jpg",
    "name": "POKÉMON TRAINERS Penny & Umbreon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "3e563356-90fe-4704-9f10-850143a42a08",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/3e563356-90fe-4704-9f10-850143a42a08.jpg",
    "name": "Sinnoh Legend Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b88db692-d0b8-44c8-87db-59fa7ee077b9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/b88db692-d0b8-44c8-87db-59fa7ee077b9.jpg",
    "name": "Rei & Akari Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f5591f99-bc24-4c6d-9391-0cc9cb9f665a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f5591f99-bc24-4c6d-9391-0cc9cb9f665a.jpg",
    "name": "Radiant Eternatus Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b594bdba-6d05-40b0-89af-215a05929d32",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/b594bdba-6d05-40b0-89af-215a05929d32.jpg",
    "name": "Radiant Charjabug Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "1924e8f8-0cc7-4db4-b78b-a0c0cac9144a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/1924e8f8-0cc7-4db4-b78b-a0c0cac9144a.jpg",
    "name": "Mew & Manaphy & Diancie Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "265fd4f8-9f9d-4101-b155-87b400a18b5b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/265fd4f8-9f9d-4101-b155-87b400a18b5b.jpg",
    "name": "Lucas & Dawn Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "fdb5fc49-70d4-4ce0-b94f-ab7898431b52",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/fdb5fc49-70d4-4ce0-b94f-ab7898431b52.jpg",
    "name": "Entei & Raikou & Suicune Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "634290b0-4fb6-491c-896a-ca68f365b517",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/634290b0-4fb6-491c-896a-ca68f365b517.jpg",
    "name": "Saiko Soda Refresh Full Pattern Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "e023df0d-a0fd-4042-bbbd-586efaf8c18f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/e023df0d-a0fd-4042-bbbd-586efaf8c18f.jpg",
    "name": "Pokémon and Tools STEPLADDER Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "13369f06-c021-47b1-8879-d74cae8a7fc3",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/13369f06-c021-47b1-8879-d74cae8a7fc3.jpg",
    "name": "Playroom Pokémon Center - Orange",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "6e9ebebc-4ca1-4192-9074-3527c32b94bb",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/6e9ebebc-4ca1-4192-9074-3527c32b94bb.jpg",
    "name": "POKÉMON TRAINERS Off Shot! Raihan Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "9d5ef442-b928-4162-b84c-f13894b02278",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/9d5ef442-b928-4162-b84c-f13894b02278.jpg",
    "name": "POKÉMON TRAINERS Off Shot! Nessa Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "3c8f1dd4-75c3-455d-8a1a-a6f6b51721de",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/3c8f1dd4-75c3-455d-8a1a-a6f6b51721de.jpg",
    "name": "POKÉMON TRAINERS Off Shot! Leon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "bae5f01d-1fc5-4bf4-9f96-75a7a33d3102",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/bae5f01d-1fc5-4bf4-9f96-75a7a33d3102.jpg",
    "name": "POKÉMON TRAINERS Off Shot! Gloria & Marnie Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "16547b06-69f4-45d7-a1d2-4287dd4d7187",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/16547b06-69f4-45d7-a1d2-4287dd4d7187.jpg",
    "name": "POKÉMON TRAINERS Off Shot! Bede, Victor & Hop Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "d144f7d8-a50e-4f5d-819c-394e4059fc0f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/d144f7d8-a50e-4f5d-819c-394e4059fc0f.jpg",
    "name": "Pikachu Forest Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "a73716e0-eb5d-40d6-b932-3f0de7b8a735",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/a73716e0-eb5d-40d6-b932-3f0de7b8a735.jpg",
    "name": "Dash! Eeveelutions Pokémon Center - Yellow",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "3351fbaf-9682-49e9-8907-d72cf9f5339b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/3351fbaf-9682-49e9-8907-d72cf9f5339b.jpg",
    "name": "Soft and Elegant Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "78aac8d7-02f3-4aaa-b1f3-68671580e1e4",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/78aac8d7-02f3-4aaa-b1f3-68671580e1e4.jpg",
    "name": "Red & Green Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "0a4d0801-93b4-48c7-9351-ca200f6daf61",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/0a4d0801-93b4-48c7-9351-ca200f6daf61.jpg",
    "name": "Poke Ball Design Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "090bab61-d181-4986-bd36-a515afedefad",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/090bab61-d181-4986-bd36-a515afedefad.jpg",
    "name": "Zacian / Zamazenta / Eternatus Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "c9651952-11b3-40b2-8b13-94380e2c5a0a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/c9651952-11b3-40b2-8b13-94380e2c5a0a.jpg",
    "name": "The ball is really profound, isn't it? Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "bc8bb3bb-60e4-493d-b6a4-9062d7ac9a2e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/bc8bb3bb-60e4-493d-b6a4-9062d7ac9a2e.jpg",
    "name": "Shiny Charizard Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "85406f6a-2759-47af-ac2c-fb99ce89bec8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/85406f6a-2759-47af-ac2c-fb99ce89bec8.jpg",
    "name": "Let Me Show You My Strength Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "7555b163-9bd3-40f2-9bf2-922aaacb80fe",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/7555b163-9bd3-40f2-9bf2-922aaacb80fe.jpg",
    "name": "Go! Go! Ditto Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "601b55b9-7bfc-40d7-9030-784544340ccd",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/601b55b9-7bfc-40d7-9030-784544340ccd.jpg",
    "name": "As Expected of You! Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "eb6b0dc9-b48c-423d-9d70-d50dddea9adc",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/eb6b0dc9-b48c-423d-9d70-d50dddea9adc.jpg",
    "name": "Three Green Onions Corps Story - Sirfetch'd Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "c7e4ea84-f4b9-4bcd-ae33-21e6a96553e8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/c7e4ea84-f4b9-4bcd-ae33-21e6a96553e8.jpg",
    "name": "Three Green Onions Corps Story - Galarian Farfetch'd Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "08890303-677d-413a-8496-2cc13f6d0626",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/08890303-677d-413a-8496-2cc13f6d0626.jpg",
    "name": "Three Green Onions Corps Story - Farfetch'd Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "97b92d70-2224-4a5f-b554-535b1179c679",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/97b92d70-2224-4a5f-b554-535b1179c679.jpg",
    "name": "Psyduck is carefree Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b1cf2cb8-4686-4533-834c-13ff234a6802",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/b1cf2cb8-4686-4533-834c-13ff234a6802.jpg",
    "name": "NeonColor Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "a7b8d945-f166-4f0d-b60e-42bb91ab5fb9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/a7b8d945-f166-4f0d-b60e-42bb91ab5fb9.jpg",
    "name": "Berry's Forest Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f80cdbc9-ff19-466c-a2e3-e948c1446520",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f80cdbc9-ff19-466c-a2e3-e948c1446520.jpg",
    "name": "Zacian & Zamazenta Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "77f9468e-48a9-4367-91ff-a45ab1359cdc",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/77f9468e-48a9-4367-91ff-a45ab1359cdc.jpg",
    "name": "Type Fighters Water Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "0db647a6-39b5-4723-a5d0-5284428caf73",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/0db647a6-39b5-4723-a5d0-5284428caf73.jpg",
    "name": "Type Fighters Grass Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "ca41b0e1-cc6f-4250-b11a-130aa32b5276",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/ca41b0e1-cc6f-4250-b11a-130aa32b5276.jpg",
    "name": "Type Fighters Fire Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "255bd93a-ee87-4648-bdf4-3a31aa406a7e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/255bd93a-ee87-4648-bdf4-3a31aa406a7e.jpg",
    "name": "Grookey & Scorbunny & Sobble Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "555d18ae-cadd-4514-9f02-d5854a48414f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/555d18ae-cadd-4514-9f02-d5854a48414f.jpg",
    "name": "Sun & Moon Umbreon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "a0a63700-2e12-49e0-be4e-c89c6bd2dbb6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/a0a63700-2e12-49e0-be4e-c89c6bd2dbb6.jpg",
    "name": "Sun & Moon Espeon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "4ece4cc2-5f40-4b1e-b1a4-f247cdd13907",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/4ece4cc2-5f40-4b1e-b1a4-f247cdd13907.jpg",
    "name": "Porygon Maker Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "3b9b0dc0-1e39-4306-b1c4-32b5285a818f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/3b9b0dc0-1e39-4306-b1c4-32b5285a818f.jpg",
    "name": "Super Nerd's Robo-Pikachu Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "ab5a92b9-8e95-45d1-b91a-500c5a828d70",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/ab5a92b9-8e95-45d1-b91a-500c5a828d70.jpg",
    "name": "Super Nerd's Experiment Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "d918e198-ba19-4f99-a443-0fa7c1884bb1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/d918e198-ba19-4f99-a443-0fa7c1884bb1.jpg",
    "name": "Pikachu & Zekrom TAG TEAM GX WCS Illustration Version Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "26c4bff0-edd6-4def-81d1-fdef6bab4719",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/26c4bff0-edd6-4def-81d1-fdef6bab4719.jpg",
    "name": "Pikachu & Zekrom TAG TEAM GX Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "c4c86a4c-3133-44e5-973f-d31a8bcb3d05",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/c4c86a4c-3133-44e5-973f-d31a8bcb3d05.jpg",
    "name": "Magikarp & Wailord TAG TEAM GX Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "1225bc99-2a3d-4554-9323-9d520c274993",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/1225bc99-2a3d-4554-9323-9d520c274993.jpg",
    "name": "Gengar & Mimikyu TAG TEAM GX Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "85855340-d353-4f8d-9f32-671652a7067f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/85855340-d353-4f8d-9f32-671652a7067f.jpg",
    "name": "Eevee Friends Sticking Together Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "08374095-8adf-4fcf-85e7-164c4f247727",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/08374095-8adf-4fcf-85e7-164c4f247727.jpg",
    "name": "Ultra Sun & Ultra Moon Pokémon Center - Blue",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "c8a61962-6ada-457c-b3ce-2904b52386fa",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/c8a61962-6ada-457c-b3ce-2904b52386fa.jpg",
    "name": "Transform! Ditto Pokémon Center - Blue",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "8990e86e-a6a7-46a5-b207-239087233437",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/8990e86e-a6a7-46a5-b207-239087233437.jpg",
    "name": "Sumi-e Series Rayquaza Ver. 2 Pokémon Center - Green",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f7f9eaa7-0ff3-481a-99df-608bdc9fa52f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f7f9eaa7-0ff3-481a-99df-608bdc9fa52f.jpg",
    "name": "Volkner Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "6184cf7a-926b-4184-b313-b56ff1f4c8c1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/6184cf7a-926b-4184-b313-b56ff1f4c8c1.jpg",
    "name": "Ultra Moon & Ultra Sun Pokémon Center - Black",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "e2ab5bde-ef5c-4d5a-b5af-b2d4a0c5dd52",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/e2ab5bde-ef5c-4d5a-b5af-b2d4a0c5dd52.jpg",
    "name": "Pyukumuku Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "ab391f27-92ea-4bed-b58b-4ca7b817eeff",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/ab391f27-92ea-4bed-b58b-4ca7b817eeff.jpg",
    "name": "Lucario's Aura Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "39afbd71-0a80-49db-8191-99456d1aec61",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/39afbd71-0a80-49db-8191-99456d1aec61.jpg",
    "name": "Good Luck Lillie Pokémon Center - White",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b7686c46-dd53-4f2e-ae37-d73c4b8a49b4",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/b7686c46-dd53-4f2e-ae37-d73c4b8a49b4.jpg",
    "name": "Espeon & Umbreon Flower Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "fb922fa3-7efb-4599-a06b-fc5771b86325",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/fb922fa3-7efb-4599-a06b-fc5771b86325.jpg",
    "name": "Cynthia Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f8723431-16f0-45df-aa95-c7f4746e5311",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f8723431-16f0-45df-aa95-c7f4746e5311.jpg",
    "name": "Ultra Alola Adventure Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "29ab9091-8936-46fb-a541-303bd3eaa80c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/29ab9091-8936-46fb-a541-303bd3eaa80c.jpg",
    "name": "Eevee Capes: Vaporeon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f2f8af178-3f22-4270-af10-6d1aa855df9f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/japan/pokemon-center/f2f8af178-3f22-4270-af10-6d1aa855df9f.jpg",
    "name": "Eevee Capes: Umbreon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Japan",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "252c488b-4d6c-4d7e-8b6f-f23103a630ba",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/252c488b-4d6c-4d7e-8b6f-f23103a630ba.jpg",
    "name": "30th Celebration Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "98ca77f6-cd93-4194-8351-2d2e1056982d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/98ca77f6-cd93-4194-8351-2d2e1056982d.jpg",
    "name": "White Flare Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "b36d710d-ca30-46ed-b585-003c364f1dc1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/b36d710d-ca30-46ed-b585-003c364f1dc1.jpg",
    "name": "Black Bolt Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "1480660c-d1ca-4618-8eb6-24987b7edf5a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/1480660c-d1ca-4618-8eb6-24987b7edf5a.jpg",
    "name": "Destined Rivals Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "deb3117d-6c75-4e07-9cb3-3febeb52af75",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/deb3117d-6c75-4e07-9cb3-3febeb52af75.jpg",
    "name": "Journey Together Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "ba1fbc21-baea-4330-90d5-03e9b6f500d7",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/ba1fbc21-baea-4330-90d5-03e9b6f500d7.jpg",
    "name": "Prismatic Evolutions Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "9f319eef-029a-47bb-b935-0423b5e99fc6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/9f319eef-029a-47bb-b935-0423b5e99fc6.jpg",
    "name": "Surging Sparks Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "88a8eb1d-bbb8-4d60-921b-8f6610365de4",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/88a8eb1d-bbb8-4d60-921b-8f6610365de4.jpg",
    "name": "Stellar Crown Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "3533fed0-b6c1-408d-b072-fbdf181fdbdd",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/3533fed0-b6c1-408d-b072-fbdf181fdbdd.jpg",
    "name": "Shrouded Fable Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "a9f37e13-21aa-4fa4-a9e9-98c1070e271b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/a9f37e13-21aa-4fa4-a9e9-98c1070e271b.jpg",
    "name": "Twilight Masquerade Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "d85b6a7d-d040-40d5-8ece-b04165adc7dd",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/d85b6a7d-d040-40d5-8ece-b04165adc7dd.jpg",
    "name": "Temporal Forces Elite Trainer Box - Iron Walking Wake",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "17e0c631-695f-46d5-ba36-a5703d4bd5c6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/17e0c631-695f-46d5-ba36-a5703d4bd5c6.jpg",
    "name": "Temporal Forces Elite Trainer Box - Iron Leaves",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "6dcd344c-bf83-4900-8de8-0e5bc10bf631",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/6dcd344c-bf83-4900-8de8-0e5bc10bf631.jpg",
    "name": "Paldean Fates Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "20084d00-3ad4-461e-80e2-4e79602d49f5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/20084d00-3ad4-461e-80e2-4e79602d49f5.jpg",
    "name": "Paradox Rift Elite Trainer Box - Roaring Moon",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "1657bbcd-a838-42d5-9546-1d84541c9734",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/1657bbcd-a838-42d5-9546-1d84541c9734.jpg",
    "name": "Paradox Rift Elite Trainer Box - Iron Valiant",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "417d03cf-6953-41db-9502-899831eaf469",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/417d03cf-6953-41db-9502-899831eaf469.jpg",
    "name": "151 Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "5490aed1-d4f0-4c06-8aba-a4edffb29091",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/5490aed1-d4f0-4c06-8aba-a4edffb29091.jpg",
    "name": "Obsidian Flames Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "64cabf8f-1fd0-4cb1-8190-95180505bf56",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/64cabf8f-1fd0-4cb1-8190-95180505bf56.jpg",
    "name": "Paldea Evolved Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "455b4d0c-197e-429a-a7ee-c9ebd1185da4",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/455b4d0c-197e-429a-a7ee-c9ebd1185da4.jpg",
    "name": "Scarlet & Violet Elite Trainer Box - miraidon",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "4f80aa49-202f-42cf-a147-e91d16adc724",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/4f80aa49-202f-42cf-a147-e91d16adc724.jpg",
    "name": "Scarlet & Violet Elite Trainer Box - Koraidon",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "0c681179-bdbd-42b4-9d5e-c38d25651fdf",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/0c681179-bdbd-42b4-9d5e-c38d25651fdf.jpg",
    "name": "Crown Zenith Elite Trainer Box (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "814f2a46-0397-45b5-8cc5-b9650ee2ced1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/814f2a46-0397-45b5-8cc5-b9650ee2ced1.jpg",
    "name": "Crown Zenith Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "7682b6f3-f2a7-435c-a521-25af49e45a88",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/7682b6f3-f2a7-435c-a521-25af49e45a88.jpg",
    "name": "Silver Tempest Elite Trainer Box - Vulpix (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "002ccddb-2c92-43f3-a765-92297c701a55",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/002ccddb-2c92-43f3-a765-92297c701a55.jpg",
    "name": "Silver Tempest Elite Trainer Box - Lugia (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "9106bb31-aeff-460f-9032-c7ff64e3e375",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/9106bb31-aeff-460f-9032-c7ff64e3e375.jpg",
    "name": "Silver Tempest Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "7c24621e-b3d8-4fb7-876b-e72b2bba512d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/7c24621e-b3d8-4fb7-876b-e72b2bba512d.jpg",
    "name": "Lost Origin Elite Trainer Box (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "ee0572d5-0915-498c-92c6-e212cd7d434e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/ee0572d5-0915-498c-92c6-e212cd7d434e.jpg",
    "name": "Lost Origin Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "5e4867b7-0f0d-456a-b58f-cc805d9dcb70",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/5e4867b7-0f0d-456a-b58f-cc805d9dcb70.jpg",
    "name": "Pokémon Go Elite Trainer Box (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "b3005b7b-7ddd-4857-a154-53ea5825702c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/b3005b7b-7ddd-4857-a154-53ea5825702c.jpg",
    "name": "Pokémon Go Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "95560d12-c359-4d2f-95e0-6d31ab17ff15",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/95560d12-c359-4d2f-95e0-6d31ab17ff15.jpg",
    "name": "Astral Radiance Elite Trainer Box (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "f1577a03-8e3a-40b4-8500-e27b6b19da89",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/f1577a03-8e3a-40b4-8500-e27b6b19da89.jpg",
    "name": "Astral Radiance Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "b8b9560f-ffa5-4119-b53b-ec218ba2f1b9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/b8b9560f-ffa5-4119-b53b-ec218ba2f1b9.jpg",
    "name": "Brilliant Stars Elite Trainer Box (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "af537620-68a2-4595-8d58-cec6167fdfec",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/af537620-68a2-4595-8d58-cec6167fdfec.jpg",
    "name": "Brilliant Stars Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "8f1947af-d5b1-4ea2-be89-9a37ae59e492",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/8f1947af-d5b1-4ea2-be89-9a37ae59e492.jpg",
    "name": "Fusion Strike Elite Trainer Box - Mew (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "0a13ab9b-4191-47d9-835b-de949b1ea59f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/0a13ab9b-4191-47d9-835b-de949b1ea59f.jpg",
    "name": "Fusion Strike Elite Trainer Box - Genesect (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "27c24443-b51e-4e81-8a51-ea71bf0fe77a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/27c24443-b51e-4e81-8a51-ea71bf0fe77a.jpg",
    "name": "Fusion Strike Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "111c6d83-87d5-40c5-b506-90adb47c12ea",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/111c6d83-87d5-40c5-b506-90adb47c12ea.jpg",
    "name": "Celebrations Elite Trainer Box (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "62af3af3-8433-4898-8f86-c359f9ad124d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/62af3af3-8433-4898-8f86-c359f9ad124d.jpg",
    "name": "Celebrations Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "9738d766-0cbd-4309-a014-abcd10dc24f8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/9738d766-0cbd-4309-a014-abcd10dc24f8.jpg",
    "name": "Evolving Skies Elite Trainer Box - Vaporeon",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "97e1ff08-672a-4eea-be4b-6ca0cf818e24",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/97e1ff08-672a-4eea-be4b-6ca0cf818e24.jpg",
    "name": "Evolving Skies Elite Trainer Box - Flareon (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "3084e19e-a014-4eaf-8832-4f1d0b26bf75",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/3084e19e-a014-4eaf-8832-4f1d0b26bf75.jpg",
    "name": "Evolving Skies Elite Trainer Box - Flareon",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "3240c45d-cb69-475f-9bf9-117f94cea557",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/3240c45d-cb69-475f-9bf9-117f94cea557.jpg",
    "name": "Evolving Skies Elite Trainer Box  - Vaporeon (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "7042e9fd-e561-477b-b024-564adde21cdf",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/7042e9fd-e561-477b-b024-564adde21cdf.jpg",
    "name": "Chilling Reign Elite Trainer Box - Calyrex Shadow Rider (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "5121793c-0469-42ab-a0ff-89ecfd41b8eb",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/5121793c-0469-42ab-a0ff-89ecfd41b8eb.jpg",
    "name": "Chilling Reign Elite Trainer Box - Calyrex Ice Rider (Pokémon Center)",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "920429e7-3c04-4548-97dc-ffb31f291c56",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/920429e7-3c04-4548-97dc-ffb31f291c56.jpg",
    "name": "Chilling Reign Elite Trainer Box - Calyrex Ice Rider",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "e4c4e394-e2f0-4b7f-a2be-e97ad25c2823",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/e4c4e394-e2f0-4b7f-a2be-e97ad25c2823.jpg",
    "name": "Chilling Reign Elite Trainer Box - Calyrex Shadow Rider",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "372b2c4a-99b2-402f-976b-ef67a0df846f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/372b2c4a-99b2-402f-976b-ef67a0df846f.jpg",
    "name": "Battle Styles Elite Trainer Box - Urshifu Single Strike Style",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "20bc17a1-a3b5-43df-9c11-dacd85d129a6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/20bc17a1-a3b5-43df-9c11-dacd85d129a6.jpg",
    "name": "Battle Styles Elite Trainer Box - Urshifu Rapid Strike Style",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "b543defd-64b0-4871-a75f-24a8f698a750",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/b543defd-64b0-4871-a75f-24a8f698a750.jpg",
    "name": "Shining Fates Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "48d17d6c-9072-4055-a23b-d4e7d3c8cef6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/48d17d6c-9072-4055-a23b-d4e7d3c8cef6.jpg",
    "name": "Vivid Voltage Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "ca7b63bf-d49e-4dfb-b1b5-847e2d7c1739",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/ca7b63bf-d49e-4dfb-b1b5-847e2d7c1739.jpg",
    "name": "Champion's Path Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "8236068f-3845-42e0-90c7-72e15b537473",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/8236068f-3845-42e0-90c7-72e15b537473.jpg",
    "name": "Darkness Ablaze Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "fd21a751-b8fa-4faa-8ba6-0fcfc7310fb7",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/fd21a751-b8fa-4faa-8ba6-0fcfc7310fb7.jpg",
    "name": "Rebel Clash Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "828b0ae6-236a-48c5-94ff-65f324620964",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/828b0ae6-236a-48c5-94ff-65f324620964.jpg",
    "name": "Sword & Shield Elite Trainer Box - Zamazenta",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "4744758d-3b36-45ba-9110-48dd6c01df92",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/4744758d-3b36-45ba-9110-48dd6c01df92.jpg",
    "name": "Sword & Shield Elite Trainer Box - Zacian",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "00c60ce4-02af-4dd6-811c-e1fde33a8a5a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/00c60ce4-02af-4dd6-811c-e1fde33a8a5a.jpg",
    "name": "Cosmic Eclipse Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "343402aa-4aaa-4fa9-bd22-5db8dbcaf52d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/343402aa-4aaa-4fa9-bd22-5db8dbcaf52d.jpg",
    "name": "Hidden Fates Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "83f2d9e3-f69a-4a79-a900-a1c261892778",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/83f2d9e3-f69a-4a79-a900-a1c261892778.jpg",
    "name": "Unified Minds Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "af7c036f-e959-4d92-a829-c9fdd95bd12c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/af7c036f-e959-4d92-a829-c9fdd95bd12c.jpg",
    "name": "Unbroken Bonds Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "a04a7b7a-d6e8-4196-a12d-6bd344540037",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/a04a7b7a-d6e8-4196-a12d-6bd344540037.jpg",
    "name": "Team Up Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "f16ac767-fa1a-48e8-91ed-b53b08cb70f5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/f16ac767-fa1a-48e8-91ed-b53b08cb70f5.jpg",
    "name": "Lost Thunder Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "cf184a3a-e12e-4d5c-bbff-cdf6da37e5c0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/cf184a3a-e12e-4d5c-bbff-cdf6da37e5c0.jpg",
    "name": "Dragon Majesty Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "cd44d634-163d-4bae-8d64-89bda1cd3ff6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/cd44d634-163d-4bae-8d64-89bda1cd3ff6.jpg",
    "name": "Celestial Storm Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "12e1ff4e-8d58-4bf4-b37d-27b1da8cfea2",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/12e1ff4e-8d58-4bf4-b37d-27b1da8cfea2.jpg",
    "name": "Forbidden Light Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "94ad6e12-ea1c-4240-ac31-b6cc15d726db",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/94ad6e12-ea1c-4240-ac31-b6cc15d726db.jpg",
    "name": "Ultra Prism Elite Trainer Box - Dusk Mane Necrozma",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "b60f546a-7a8f-472b-8e03-92b6bd235f52",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/b60f546a-7a8f-472b-8e03-92b6bd235f52.jpg",
    "name": "Ultra Prism Elite Trainer Box - Dawn Wings Necrozma",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "37a22bf4-03c3-4302-9dff-53268ebe1009",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/37a22bf4-03c3-4302-9dff-53268ebe1009.jpg",
    "name": "Crimson Invasion Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "b09f16a6-21a8-4ebd-b430-6b692b12cfd8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/b09f16a6-21a8-4ebd-b430-6b692b12cfd8.jpg",
    "name": "Shining Legends Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "50229635-08fc-4eeb-a823-3e4b64e48b19",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/50229635-08fc-4eeb-a823-3e4b64e48b19.jpg",
    "name": "Burning Shadows Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "92ea5e03-8e64-4036-a220-d4ec1dcbb54e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/92ea5e03-8e64-4036-a220-d4ec1dcbb54e.jpg",
    "name": "Guardians Rising Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "ca7694e5-f3af-4a1a-bd64-628030f090df",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/ca7694e5-f3af-4a1a-bd64-628030f090df.jpg",
    "name": "Sun & Moon Elite Trainer Box - Solgaleo",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "03bb38cd-e0cb-4b34-a62e-089ea44b3a6a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/03bb38cd-e0cb-4b34-a62e-089ea44b3a6a.jpg",
    "name": "Sun & Moon Elite Trainer Box - Lunala",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "c318f324-7222-4214-9e0b-fdee1401ff58",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/c318f324-7222-4214-9e0b-fdee1401ff58.jpg",
    "name": "Evolutions Elite Trainer Box - Mega Charizard",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "9f3bc2c4-184a-4a4b-a500-c73c5b60c23d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/9f3bc2c4-184a-4a4b-a500-c73c5b60c23d.jpg",
    "name": "Evolutions Elite Trainer Box - Mega Blastoise",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "c39dd362-9040-456e-ac71-a94895beb44b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/c39dd362-9040-456e-ac71-a94895beb44b.jpg",
    "name": "Steam Siege Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "39da5ea0-b718-456f-95ff-e90727a0b58b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/39da5ea0-b718-456f-95ff-e90727a0b58b.jpg",
    "name": "Generations Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "db03935b-c45a-4f80-adf8-9cb4111cb1bd",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/db03935b-c45a-4f80-adf8-9cb4111cb1bd.jpg",
    "name": "Fates Collide Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "493d63aa-c5db-45c6-bac6-379adc81506c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/493d63aa-c5db-45c6-bac6-379adc81506c.jpg",
    "name": "BREAKpoint Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "2ce5540e-e3ce-4178-a222-ff180bc5b770",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/2ce5540e-e3ce-4178-a222-ff180bc5b770.jpg",
    "name": "BREAKthrough Elite Trainer Box - Mega Mewtwo Y",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "52569bc9-3894-449b-839b-fb88431bbcd1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/52569bc9-3894-449b-839b-fb88431bbcd1.jpg",
    "name": "BREAKthrough Elite Trainer Box - Mega Mewtwo X",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "421c1717-a284-4091-80fd-73926c5d9d80",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/421c1717-a284-4091-80fd-73926c5d9d80.jpg",
    "name": "Ancient Origins Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "99d7c9da-5d92-4312-9b42-761fd020040f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/99d7c9da-5d92-4312-9b42-761fd020040f.jpg",
    "name": "Roaring Skies Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "899cbd30-3afd-4ddd-ae58-81c1e5071f4d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/899cbd30-3afd-4ddd-ae58-81c1e5071f4d.jpg",
    "name": "Primal Clash Elite Trainer Box - Kyogre",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "77898c5a-63e1-4d8b-a9e9-5eb557f801e8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/77898c5a-63e1-4d8b-a9e9-5eb557f801e8.jpg",
    "name": "Primal Clash Elite Trainer Box - Groudon",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "c05bf231-2fa9-40f6-aee9-df358619816d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/c05bf231-2fa9-40f6-aee9-df358619816d.jpg",
    "name": "Phatom Forces Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "c470e829-6eec-4051-90cd-164ae63b2e8e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/c470e829-6eec-4051-90cd-164ae63b2e8e.jpg",
    "name": "Furious Fists Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "71beafd3-d8b6-44b7-8f8c-3e4542e8aace",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/71beafd3-d8b6-44b7-8f8c-3e4542e8aace.jpg",
    "name": "X & Y Elite Trainer Box - Yveltal",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "7c213c23-8da2-4c9b-aa25-f37b6cad1bfd",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/7c213c23-8da2-4c9b-aa25-f37b6cad1bfd.jpg",
    "name": "X & Y Elite Trainer Box - Xerneas",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "1dd57156-5bf4-440b-94e0-75136a097cd8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/elite-trainer-box/1dd57156-5bf4-440b-94e0-75136a097cd8.jpg",
    "name": "Plasma Blast Elite Trainer Box",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Elite Trainer Box",
    "releaseDate": "Unknown"
  },
  {
    "id": "f9c398f6-361c-4b67-8b02-694081ad505b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/f9c398f6-361c-4b67-8b02-694081ad505b.jpg",
    "name": "Terapagos (Terastal Form) Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "7b7fe4fc-50d5-4e31-a35f-db2f56f0c927",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/7b7fe4fc-50d5-4e31-a35f-db2f56f0c927.jpg",
    "name": "Teatime Delights Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "9b6382e4-d675-401c-8af2-7f95f902f972",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/9b6382e4-d675-401c-8af2-7f95f902f972.jpg",
    "name": "Tandemaus & Maushold Household Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "fd42d28d-757c-4bce-b470-219a4ee7c6e7",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/fd42d28d-757c-4bce-b470-219a4ee7c6e7.jpg",
    "name": "Sylveon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "4c6582e0-163b-4432-ba34-db462892460a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/4c6582e0-163b-4432-ba34-db462892460a.jpg",
    "name": "Paldea Pokémon Trainers Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "4b6ea200-1103-4d01-9afa-c771cdbf3956",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/4b6ea200-1103-4d01-9afa-c771cdbf3956.jpg",
    "name": "Koffing & Weezing Sunset Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "cb0edf60-3910-4e48-bcb0-97a9adafa136",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/cb0edf60-3910-4e48-bcb0-97a9adafa136.jpg",
    "name": "Diglett's Cave Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b9e0a7bd-4ba1-4a4a-8f10-32440c033c6b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/b9e0a7bd-4ba1-4a4a-8f10-32440c033c6b.jpg",
    "name": "Charming & Ghostly Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b71ed2ae-a6cd-4d16-b845-60e659243fa7",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/b71ed2ae-a6cd-4d16-b845-60e659243fa7.jpg",
    "name": "Slither Wing & Iron Moth Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "65d5300e-9041-424b-aa99-72536770bab9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/65d5300e-9041-424b-aa99-72536770bab9.jpg",
    "name": "Powerhouse Pokémon Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "8affd29b-ef77-483e-b491-0d320922a969",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/8affd29b-ef77-483e-b491-0d320922a969.jpg",
    "name": "Moomoo Milk Medley Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f7f23341-5328-48d3-909b-73dd200ffe40",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/f7f23341-5328-48d3-909b-73dd200ffe40.jpg",
    "name": "Dreamy Dragonite Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "35461f82-207b-40d9-945a-f878b6f7c6cd",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/35461f82-207b-40d9-945a-f878b6f7c6cd.jpg",
    "name": "Ditto Quartet Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "0798c0ea-5fa9-45f6-a607-a312e5dd2746",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/0798c0ea-5fa9-45f6-a607-a312e5dd2746.jpg",
    "name": "Scorching Charizard Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "1606b408-c818-492d-b908-320db04ae26e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/1606b408-c818-492d-b908-320db04ae26e.jpg",
    "name": "Pikachu Neon Charge Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "7af17794-2095-4926-924a-eacea0d66771",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/7af17794-2095-4926-924a-eacea0d66771.jpg",
    "name": "Haunted Ruins Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "9611f671-7fe7-4b8b-a725-158e3f74adfd",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/9611f671-7fe7-4b8b-a725-158e3f74adfd.jpg",
    "name": "Ghostly Gathering Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "4edfd7b7-d436-4f37-9936-ab77bec56089",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/4edfd7b7-d436-4f37-9936-ab77bec56089.jpg",
    "name": "Flowing Steel Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "963fdb04-920c-4a7c-991c-c6469d2f0856",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/963fdb04-920c-4a7c-991c-c6469d2f0856.jpg",
    "name": "Sunflora Inspired by Sunflowers Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "39743ea9-c056-45fb-b79d-ae13159b630b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/39743ea9-c056-45fb-b79d-ae13159b630b.jpg",
    "name": "Smeargle Inspired by Self-Portrait as a Painter Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "23bf9cfc-b2c1-4e5d-a98e-b593e3a96f90",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/23bf9cfc-b2c1-4e5d-a98e-b593e3a96f90.jpg",
    "name": "Pikachu Inspired by Self-Portrait with Grey Felt Hat Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "96eb97c8-982f-4b7a-8428-d3a6283ec7f8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/96eb97c8-982f-4b7a-8428-d3a6283ec7f8.jpg",
    "name": "Munchlax & Snorlax Inspired by The Bedroom Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "69fadf99-dc79-4d4b-95ac-45a39d4c84c0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/69fadf99-dc79-4d4b-95ac-45a39d4c84c0.jpg",
    "name": "Eevee Inspired by Self-Portrait with Straw Hat Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "19a0263a-5720-4fe3-b185-f4bb49a1253a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/19a0263a-5720-4fe3-b185-f4bb49a1253a.jpg",
    "name": "Corviknight Inspired by Wheatfield with Crows Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "81be8680-35b3-4478-926b-7c2de9e2acb6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/81be8680-35b3-4478-926b-7c2de9e2acb6.jpg",
    "name": "Rayquaza Among the Stars Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "71a9c437-f6fb-4b7f-9b07-ab130dee2eef",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/71a9c437-f6fb-4b7f-9b07-ab130dee2eef.jpg",
    "name": "Rapidash Flames & Fairies Pokémon Center - Rapidash",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "9cde2be7-e5e0-4eaf-8bc2-b7388d5c4528",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/9cde2be7-e5e0-4eaf-8bc2-b7388d5c4528.jpg",
    "name": "Rapidash Flames & Fairies Pokémon Center - Galarian Rapidash",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "029e90d7-0aa4-44f9-8bbd-b546f647815a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/029e90d7-0aa4-44f9-8bbd-b546f647815a.jpg",
    "name": "Luxray Limitless Lightning Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "27bddcb3-52a7-4ac4-b125-9bc9e10a8cda",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/27bddcb3-52a7-4ac4-b125-9bc9e10a8cda.jpg",
    "name": "Vulpix Seasons Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "0b290a23-3418-4d80-b29b-582da4b9d781",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/0b290a23-3418-4d80-b29b-582da4b9d781.jpg",
    "name": "Pokémon Trainers Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "546c04de-00c7-4c47-a57a-14dc8d6b22b1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/546c04de-00c7-4c47-a57a-14dc8d6b22b1.jpg",
    "name": "Pikachu Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "6b7285f1-e112-49bd-80cd-4eee2354218f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/6b7285f1-e112-49bd-80cd-4eee2354218f.jpg",
    "name": "Pikachu Comic-Style Attack 2022 Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "41b5028d-c2ed-4740-ae57-8987dcb3e02d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/41b5028d-c2ed-4740-ae57-8987dcb3e02d.jpg",
    "name": "Pikachu Comic-Style 2022 Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "d52a4f69-ba6e-4b13-9403-6a563fb006b6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/d52a4f69-ba6e-4b13-9403-6a563fb006b6.jpg",
    "name": "Pikachu Allover Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "a15cd099-2849-4581-9585-38873589c09b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/a15cd099-2849-4581-9585-38873589c09b.jpg",
    "name": "Trubbish & Garbodor Crossing Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "a7a59b3e-4093-4cd7-9b9f-e3d0e9c8a476",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/a7a59b3e-4093-4cd7-9b9f-e3d0e9c8a476.jpg",
    "name": "Shinx Evolution Electro-Stack Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "309ccf48-a0ae-4aaf-9c4a-947367bc1b77",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/309ccf48-a0ae-4aaf-9c4a-947367bc1b77.jpg",
    "name": "Rayquaza Legendary Lights Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "2cab4cd7-fd97-4f73-b729-7e717902d7f1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/2cab4cd7-fd97-4f73-b729-7e717902d7f1.jpg",
    "name": "Lucario Focused Fighter Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "1aef73fd-32ee-48d1-a8fd-ce22a7669845",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/1aef73fd-32ee-48d1-a8fd-ce22a7669845.jpg",
    "name": "Venusaur Tropical Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "8bb0e485-3b82-4b1d-9998-205e91d95739",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/8bb0e485-3b82-4b1d-9998-205e91d95739.jpg",
    "name": "Pokémon Sunny Sea Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "dfd13ea0-e2a2-44bf-875e-cf8db89669c3",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/dfd13ea0-e2a2-44bf-875e-cf8db89669c3.jpg",
    "name": "Wooloo Fluffy Flock Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "98223391-5b1c-442b-a443-a67d838fb791",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/98223391-5b1c-442b-a443-a67d838fb791.jpg",
    "name": "Pokémon Cool Friends Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "ed72f871-9117-4167-9013-aa47758eea94",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/ed72f871-9117-4167-9013-aa47758eea94.jpg",
    "name": "Sirfetch'd Strike Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "6fd38ca6-bdf0-4cdf-aa9d-bb0dbcb48081",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/6fd38ca6-bdf0-4cdf-aa9d-bb0dbcb48081.jpg",
    "name": "Morpeko Moods Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "4bacff3e-24ec-4abc-a0bb-87b8e690a1dd",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/4bacff3e-24ec-4abc-a0bb-87b8e690a1dd.jpg",
    "name": "Eevee Prismatic Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "9dce3235-dad6-4477-a00e-f892e8d83193",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/9dce3235-dad6-4477-a00e-f892e8d83193.jpg",
    "name": "Ball Guy Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "fd27fc31-17ee-4f3e-85d3-9403bee6c10c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/fd27fc31-17ee-4f3e-85d3-9403bee6c10c.jpg",
    "name": "Pokémon Celebration Pokémon Center - White",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "1a17b663-4a98-45e7-b496-517cfe52e370",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/1a17b663-4a98-45e7-b496-517cfe52e370.jpg",
    "name": "Pokémon Celebration Pokémon Center - Black",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "bcc74014-91f7-4b7f-813b-22234cc79861",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/bcc74014-91f7-4b7f-813b-22234cc79861.jpg",
    "name": "Psyduck Bewildered Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "1db84594-9811-4bf8-83b7-c4560538f225",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/1db84594-9811-4bf8-83b7-c4560538f225.jpg",
    "name": "Pikachu Adventure Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "670a7479-d150-401b-808c-457b2a01a05f",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/670a7479-d150-401b-808c-457b2a01a05f.jpg",
    "name": "Mimikyu Scribbles Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "663f0135-ec0e-415b-a323-3d3de3d4eb0b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/663f0135-ec0e-415b-a323-3d3de3d4eb0b.jpg",
    "name": "Mew Celestial Circles Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "8b20e215-7607-4a2c-b114-721f126948de",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/8b20e215-7607-4a2c-b114-721f126948de.jpg",
    "name": "Island Guardian Stained Glass Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "844aec19-839d-4388-a3ec-af9b9010c85d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/844aec19-839d-4388-a3ec-af9b9010c85d.jpg",
    "name": "Gigantamax Pikachu & Gigantamax Eevee Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "24b38d6c-dd63-448c-99c6-43af524e9467",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/24b38d6c-dd63-448c-99c6-43af524e9467.jpg",
    "name": "Gigantamax Charizard Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "d031025b-66df-4215-a7be-960ca5a1144d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/d031025b-66df-4215-a7be-960ca5a1144d.jpg",
    "name": "Galarian Ponyta Gradient Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "a0f2877c-a162-4ebd-b5eb-a660d4d203da",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/a0f2877c-a162-4ebd-b5eb-a660d4d203da.jpg",
    "name": "Pikachu Chalk Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "f27fcd3c-c06c-4a0f-a394-86c3a41594a1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/f27fcd3c-c06c-4a0f-a394-86c3a41594a1.jpg",
    "name": "London City Pikachu Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "0102f710-e3f3-4ca7-870a-a9e1aebeb61d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/0102f710-e3f3-4ca7-870a-a9e1aebeb61d.jpg",
    "name": "Eevee Friendship Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "7d9e6374-9ad1-483a-84bd-4f518963a4a0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/7d9e6374-9ad1-483a-84bd-4f518963a4a0.jpg",
    "name": "Charizard Fury Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "4fea7008-d979-4946-a516-9d610af42cec",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/4fea7008-d979-4946-a516-9d610af42cec.jpg",
    "name": "Eevee Pixel Collection Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "e78176bc-c6ef-4525-a798-fd2ba17967e2",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/e78176bc-c6ef-4525-a798-fd2ba17967e2.jpg",
    "name": "Raichu Art Nouveau Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "c2871934-99fc-4660-bf34-0b339d9f19b7",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/c2871934-99fc-4660-bf34-0b339d9f19b7.jpg",
    "name": "Look Upon The Stars Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "2a005b5d-8713-4d17-b163-e21f58013a1b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/2a005b5d-8713-4d17-b163-e21f58013a1b.jpg",
    "name": "Poké Ball Pattern Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "fd63ffb4-6f84-4d6a-ba40-6b3d34ce6cd6",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/fd63ffb4-6f84-4d6a-ba40-6b3d34ce6cd6.jpg",
    "name": "Mimikyu Day by Day Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "5145174c-5898-463a-b08f-cdeca030e5de",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/5145174c-5898-463a-b08f-cdeca030e5de.jpg",
    "name": "Eevee Capes Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "30817d79-49d7-41f3-8754-b4ffe04224d8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/30817d79-49d7-41f3-8754-b4ffe04224d8.jpg",
    "name": "Alolan Exeggutor Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "09338dd5-3932-4e90-b129-1a3baf3e3ab5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/09338dd5-3932-4e90-b129-1a3baf3e3ab5.jpg",
    "name": "Espeon & Umbreon Starry Constellations Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "730debd1-192b-4d9d-8943-f283f8fb570c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/730debd1-192b-4d9d-8943-f283f8fb570c.jpg",
    "name": "Pumpkin Pikachu Halloween Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "e4c55529-ce6d-46d0-b982-9cb2104c1c98",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/e4c55529-ce6d-46d0-b982-9cb2104c1c98.jpg",
    "name": "Pikachu Pixel Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b4c8e1c0-288d-4bbc-8e3a-c0297b889404",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/b4c8e1c0-288d-4bbc-8e3a-c0297b889404.jpg",
    "name": "Ditto As Raichu Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "2e573900-4aa5-41e9-bc8b-b7331d1b26a0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/2e573900-4aa5-41e9-bc8b-b7331d1b26a0.jpg",
    "name": "Charizard Crimson Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "e99d2b4a-3b83-4980-b2e3-a59c308acaeb",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/e99d2b4a-3b83-4980-b2e3-a59c308acaeb.jpg",
    "name": "Berry Snorlax Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b79350e6-188c-4105-a981-174ab54230ae",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/b79350e6-188c-4105-a981-174ab54230ae.jpg",
    "name": "Gengar Smirk Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "2eba6677-3f3f-4e48-acff-153922e3d45b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/2eba6677-3f3f-4e48-acff-153922e3d45b.jpg",
    "name": "Lapras Surf Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "bfacb873-2a6f-4098-af90-63fe2a224845",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/bfacb873-2a6f-4098-af90-63fe2a224845.jpg",
    "name": "Pokémon-Amie Substitute Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "d3c47e1e-28fd-41db-863c-cbd0be54f92c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/d3c47e1e-28fd-41db-863c-cbd0be54f92c.jpg",
    "name": "Mythical Mania Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "3aa4ff85-d6f8-4d40-9bfd-780d769952c9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/3aa4ff85-d6f8-4d40-9bfd-780d769952c9.jpg",
    "name": "Shiny Mega Gyarados Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "83cf5a67-f620-495b-8410-04b19322d1dc",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/83cf5a67-f620-495b-8410-04b19322d1dc.jpg",
    "name": "Mega Mewtwo X and Mega Mewtwo Y Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "62ae4d55-ffd4-4d83-995d-ec0a84d12d49",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/62ae4d55-ffd4-4d83-995d-ec0a84d12d49.jpg",
    "name": "Mega Lucario Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "6a8401f3-a72d-47e9-b338-4b5ee5995e1c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/6a8401f3-a72d-47e9-b338-4b5ee5995e1c.jpg",
    "name": "Mega Gengar Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "de31b7c1-e5b5-4e8c-8335-3508c22656e8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/de31b7c1-e5b5-4e8c-8335-3508c22656e8.jpg",
    "name": "Just My Type Pokémon Center - Water",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "5e17d012-076f-4698-b90d-899a81530024",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/5e17d012-076f-4698-b90d-899a81530024.jpg",
    "name": "Just My Type Pokémon Center - Grass",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "a1a32994-2ca8-4435-9ac1-8674b5e94852",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/a1a32994-2ca8-4435-9ac1-8674b5e94852.jpg",
    "name": "Just My Type Pokémon Center - Fire",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "699e591b-2b69-4482-98f3-aa0d0e7f6b58",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/699e591b-2b69-4482-98f3-aa0d0e7f6b58.jpg",
    "name": "Bellossom Tropics Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "e9d29bbd-5210-4936-a274-3e8a1d5af0dd",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/e9d29bbd-5210-4936-a274-3e8a1d5af0dd.jpg",
    "name": "Pokémon 20th Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "d9c662cf-c640-420f-8c0e-2d8c7be52482",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/d9c662cf-c640-420f-8c0e-2d8c7be52482.jpg",
    "name": "Pikachu Comic-Style 2016 Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "d887a5ef-14be-4f4b-a364-517b9bca7ade",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/d887a5ef-14be-4f4b-a364-517b9bca7ade.jpg",
    "name": "Shiny Mega Rayquaza Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "7f043aaa-e1b9-424a-9c99-274945d8897e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/7f043aaa-e1b9-424a-9c99-274945d8897e.jpg",
    "name": "Mega Charizard Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "5a634ebd-4a98-4ab1-971f-6b6ae247826c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/pokemon-center/5a634ebd-4a98-4ab1-971f-6b6ae247826c.jpg",
    "name": "Hoopa Unbound Pokémon Center",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Pokémon Center",
    "releaseDate": "Unknown"
  },
  {
    "id": "b26f0a05-db8d-4a35-a0b9-dee5349bcc40",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/premium-figure-collection/b26f0a05-db8d-4a35-a0b9-dee5349bcc40.jpg",
    "name": "Crown Zenith Premium Figure Collection",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Premium Figure Collection",
    "releaseDate": "Unknown"
  },
  {
    "id": "584c9c31-91a5-4fad-be3b-7c0387180f8e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/trainer-toolkit/584c9c31-91a5-4fad-be3b-7c0387180f8e.jpg",
    "name": "2024 Trainer Toolkit",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Trainer Toolkit",
    "releaseDate": "Unknown"
  },
  {
    "id": "f1f4814f-eb1f-46e7-b7ad-f44952976191",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/trainer-toolkit/f1f4814f-eb1f-46e7-b7ad-f44952976191.jpg",
    "name": "2023 Trainer Toolkit",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Trainer Toolkit",
    "releaseDate": "Unknown"
  },
  {
    "id": "d74dd9d3-7f7f-4b82-919c-1571250fb640",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/trainer-toolkit/d74dd9d3-7f7f-4b82-919c-1571250fb640.jpg",
    "name": "2022 Trainer Toolkit",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Trainer Toolkit",
    "releaseDate": "Unknown"
  },
  {
    "id": "0762eba7-daad-4ef4-8c33-287445c9d663",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/trainer-toolkit/0762eba7-daad-4ef4-8c33-287445c9d663.jpg",
    "name": "2021 Trainer Toolkit",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Trainer Toolkit",
    "releaseDate": "Unknown"
  },
  {
    "id": "41602152-2cbe-4a20-bfa5-fa4ed65c741e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/trainer-toolkit/41602152-2cbe-4a20-bfa5-fa4ed65c741e.jpg",
    "name": "2020 Trainer Toolkit",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Trainer Toolkit",
    "releaseDate": "Unknown"
  },
  {
    "id": "e91cae6d-9ea9-4052-af72-357203ae49a0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-premium-collection/e91cae6d-9ea9-4052-af72-357203ae49a0.jpg",
    "name": "Sword & Shield Ultra Premium Collection - Charizard",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Premium Collection",
    "releaseDate": "Unknown"
  },
  {
    "id": "fa4a88de-60a7-46d6-a9ee-61b43e5fde73",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-premium-collection/fa4a88de-60a7-46d6-a9ee-61b43e5fde73.jpg",
    "name": "Sword & Shield Ultra Premium Collection - Zamazenta",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Premium Collection",
    "releaseDate": "Unknown"
  },
  {
    "id": "d6307ea5-81ad-4b51-92c4-3e76144b4c09",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-premium-collection/d6307ea5-81ad-4b51-92c4-3e76144b4c09.jpg",
    "name": "Sword & Shield Ultra Premium Collection - Zacian",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Premium Collection",
    "releaseDate": "Unknown"
  },
  {
    "id": "a2c5b94c-78a6-409d-b3ba-ea909dcb45ca",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/a2c5b94c-78a6-409d-b3ba-ea909dcb45ca.jpg",
    "name": "Lillie and Clefairy",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "faa520e4-67e1-44da-9741-bea6488a2329",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/faa520e4-67e1-44da-9741-bea6488a2329.jpg",
    "name": "Iono and Bellibolt Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "3deaef2d-538c-456d-8f86-40f3fa1a25a8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/3deaef2d-538c-456d-8f86-40f3fa1a25a8.jpg",
    "name": "Gengar Apex Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "ce0d4a1b-88a1-4f81-b21b-ff60c36af089",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/ce0d4a1b-88a1-4f81-b21b-ff60c36af089.jpg",
    "name": "Charmander 2025 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "c1c7aab1-8158-4358-9a2b-bd0094abdecf",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/c1c7aab1-8158-4358-9a2b-bd0094abdecf.jpg",
    "name": "Pikachu 2025 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "be873267-104a-4ed3-99d4-197838d9a698",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/be873267-104a-4ed3-99d4-197838d9a698.jpg",
    "name": "Tinkaton 2025 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "1d8d2638-2514-467d-a4dd-77328eca5938",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/1d8d2638-2514-467d-a4dd-77328eca5938.jpg",
    "name": "Togepi APEX Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "22a26c0a-d113-4c4b-8ecf-e6f2d41d0855",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/22a26c0a-d113-4c4b-8ecf-e6f2d41d0855.jpg",
    "name": "Gallery Series Morning Meadow Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "42458c5b-a56d-4072-882c-3b3a39afa7ea",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/42458c5b-a56d-4072-882c-3b3a39afa7ea.jpg",
    "name": "Ceruledge 2024 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "e8b2ca4a-0e27-47d8-b1ed-6703f47d83ba",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/e8b2ca4a-0e27-47d8-b1ed-6703f47d83ba.jpg",
    "name": "Armarouge 2024 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "f15e1a0f-f137-4c14-8af1-cd5f7ccda354",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/f15e1a0f-f137-4c14-8af1-cd5f7ccda354.jpg",
    "name": "Gallery Series Trick Room Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "add4921f-e236-48bc-87d0-459dd66f7680",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/add4921f-e236-48bc-87d0-459dd66f7680.jpg",
    "name": "Greninja 2024 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "159ea977-9d8d-497f-a5ef-6617b653e8da",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/159ea977-9d8d-497f-a5ef-6617b653e8da.jpg",
    "name": "Gallery Series Shimmering Skyline Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "a5698571-6176-405a-812a-02759bee71a0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/a5698571-6176-405a-812a-02759bee71a0.jpg",
    "name": "Paldea Region Bundle Ultra Pro - Limite Edition",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "a198f108-2d21-419b-bee0-024d19b52f45",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/a198f108-2d21-419b-bee0-024d19b52f45.jpg",
    "name": "Paldea Region Bundle Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "6a4240eb-f9a3-4cd6-88f3-38f0c5e525d0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/6a4240eb-f9a3-4cd6-88f3-38f0c5e525d0.jpg",
    "name": "Miraidon 2023 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "c99e1eff-6d14-4d48-8c61-442f7e72ad13",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/c99e1eff-6d14-4d48-8c61-442f7e72ad13.jpg",
    "name": "Koraidon 2023 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "0127e298-9957-4951-b3ef-26d9efe8960c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/0127e298-9957-4951-b3ef-26d9efe8960c.jpg",
    "name": "Eevee Evolutions",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "875f7c33-3edd-457a-96ac-47148a2969e3",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/875f7c33-3edd-457a-96ac-47148a2969e3.jpg",
    "name": "Gallery Series Scorching Summit Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "f3524289-2780-4e9f-b5fc-2c3f79a3495b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/f3524289-2780-4e9f-b5fc-2c3f79a3495b.jpg",
    "name": "Pikachu & Mimikyu Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "a24728e3-0ef5-42cc-8ff6-1457dbd6fbfa",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/a24728e3-0ef5-42cc-8ff6-1457dbd6fbfa.jpg",
    "name": "Snorlax & Munchlax Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "bf4edf06-c7a6-495a-8332-7dea2fac28b1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/bf4edf06-c7a6-495a-8332-7dea2fac28b1.jpg",
    "name": "Gallery Series Frosted Forest Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "76cef7e1-d28e-4992-9a93-344c89030ed9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/76cef7e1-d28e-4992-9a93-344c89030ed9.jpg",
    "name": "First Partner Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "58bcd7f1-b44a-44f1-9fe1-0467077ee5f0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/58bcd7f1-b44a-44f1-9fe1-0467077ee5f0.jpg",
    "name": "Gallery Series Enchanted Glade Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "08c48c88-6ee7-4a64-a67c-64923c4008d7",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/08c48c88-6ee7-4a64-a67c-64923c4008d7.jpg",
    "name": "Lucario 2022 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "b40e747a-bdad-4b59-b962-35bbc0dc4f16",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/b40e747a-bdad-4b59-b962-35bbc0dc4f16.jpg",
    "name": "Gallery Series Haunted Hollow Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "af0d67de-4d01-4613-a810-0aee8c197eb4",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/af0d67de-4d01-4613-a810-0aee8c197eb4.jpg",
    "name": "Gallery Series Seaside Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "fba9cae0-32df-4c90-a9f5-cfcc2c6b2250",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/fba9cae0-32df-4c90-a9f5-cfcc2c6b2250.jpg",
    "name": "Mew 2021 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "5c2d2b5d-5a51-426c-b3de-6abb1f9d5ba1",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/5c2d2b5d-5a51-426c-b3de-6abb1f9d5ba1.jpg",
    "name": "Charmander 2021 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "a61c4ee9-184a-40fb-9354-06899268545b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/a61c4ee9-184a-40fb-9354-06899268545b.jpg",
    "name": "Master Ball Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "c2e59bb5-d926-4895-9f6a-96b65ff6c100",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/c2e59bb5-d926-4895-9f6a-96b65ff6c100.jpg",
    "name": "Mewtwo 2020 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "2935c74f-c5bc-40ef-8846-26e661db2a3b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/2935c74f-c5bc-40ef-8846-26e661db2a3b.jpg",
    "name": "Bulbasaur 2020 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "a269834d-19c8-4b2c-86b1-2f41cef3d2e8",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/a269834d-19c8-4b2c-86b1-2f41cef3d2e8.jpg",
    "name": "Squirtle 2020 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "7a1ee2c7-961e-42ba-9c7a-280fb2083180",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/7a1ee2c7-961e-42ba-9c7a-280fb2083180.jpg",
    "name": "Galar First Partner Ultra Pro - Sobble",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "5da4f5ec-ce18-4385-a211-a1239076e689",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/5da4f5ec-ce18-4385-a211-a1239076e689.jpg",
    "name": "Galar First Partner Ultra Pro - Scorbunny",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "613c8416-1ca3-4915-a239-410f6102e74d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/613c8416-1ca3-4915-a239-410f6102e74d.jpg",
    "name": "Galar First Partner Ultra Pro - Grookey",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "518cb93e-3360-4d53-a973-6073e1ed4281",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/518cb93e-3360-4d53-a973-6073e1ed4281.jpg",
    "name": "Charizard 2020 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "6651235e-b88e-4539-9090-16162f8ca51a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/6651235e-b88e-4539-9090-16162f8ca51a.jpg",
    "name": "Great Ball Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "bc394fd8-2f98-4d6e-a452-f184c26e7e61",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/bc394fd8-2f98-4d6e-a452-f184c26e7e61.jpg",
    "name": "Pokémon Detective Pikachu Ultra Pro - Pikachu",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "3618161a-9601-4410-876d-c5da7122e3d5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/3618161a-9601-4410-876d-c5da7122e3d5.jpg",
    "name": "Pokémon Detective Pikachu Ultra Pro - Mr. Mime",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "2caefcaa-5089-4615-ba5a-daacdfafd373",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/2caefcaa-5089-4615-ba5a-daacdfafd373.jpg",
    "name": "Pikachu 2019 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "0d1d5974-42cd-4c7c-bd1f-adb68acc733d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/0d1d5974-42cd-4c7c-bd1f-adb68acc733d.jpg",
    "name": "Eevee 2019 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "c9e4d9d7-3831-4815-9dc3-ca5c414d9d2d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/c9e4d9d7-3831-4815-9dc3-ca5c414d9d2d.jpg",
    "name": "Ultra Ball Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "d861c6bc-c589-40bf-9430-074c7f8d239a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/d861c6bc-c589-40bf-9430-074c7f8d239a.jpg",
    "name": "Snorlax 2018 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "bd3ea0de-02da-4d88-a4c5-486b288f2b5a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/bd3ea0de-02da-4d88-a4c5-486b288f2b5a.jpg",
    "name": "Poké Ball Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "ba0c33f3-3e1c-4d6f-9b91-4c3ee01774b0",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/ba0c33f3-3e1c-4d6f-9b91-4c3ee01774b0.jpg",
    "name": "Eevee #133 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "9d6e1f1e-8fa9-4d2a-8c06-9863aa1e5a8a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/9d6e1f1e-8fa9-4d2a-8c06-9863aa1e5a8a.jpg",
    "name": "Charizard 2015 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "efa20573-04cb-4271-ab61-6516107a8ba5",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/efa20573-04cb-4271-ab61-6516107a8ba5.jpg",
    "name": "Pikachu 2015 Ultra Pro - Grey",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "4c30d0c1-d6bc-4500-abdf-b6005c793c53",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/4c30d0c1-d6bc-4500-abdf-b6005c793c53.jpg",
    "name": "Pikachu 2015 Ultra Pro - Yellow",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "7de5ee56-eb81-4c40-a839-059fba1752d9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/7de5ee56-eb81-4c40-a839-059fba1752d9.jpg",
    "name": "Froakie 2014 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "e2c0e294-5ea3-4ae4-ac27-65ffa13a2fbc",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/e2c0e294-5ea3-4ae4-ac27-65ffa13a2fbc.jpg",
    "name": "Fennekin 2014 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "620ebdfd-e271-4ef9-a572-37958dfdb147",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/620ebdfd-e271-4ef9-a572-37958dfdb147.jpg",
    "name": "Chespin 2014 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "82f32d10-f6b5-41e5-b54e-4427551778ab",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/82f32d10-f6b5-41e5-b54e-4427551778ab.jpg",
    "name": "X & Y Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "d047e4ae-08d3-415e-b73f-ad69fe97ae8c",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/d047e4ae-08d3-415e-b73f-ad69fe97ae8c.jpg",
    "name": "Victini 2012 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "f8929669-7428-4355-9573-9093c3370f6a",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/f8929669-7428-4355-9573-9093c3370f6a.jpg",
    "name": "Black & White 2012 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "5622ea8a-bc49-49a4-b51d-aeee57a673b2",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/5622ea8a-bc49-49a4-b51d-aeee57a673b2.jpg",
    "name": "Black & White 2011 Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "98515b8c-ed95-449c-8876-055ee43ed76d",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/98515b8c-ed95-449c-8876-055ee43ed76d.jpg",
    "name": "Tyranitar & Friends",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "c4a05131-7bb8-4c67-8d2b-9425cfac432b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/c4a05131-7bb8-4c67-8d2b-9425cfac432b.jpg",
    "name": "Platinum Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "deef9bd9-be57-49cc-abb0-456dc8bbf2f9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/deef9bd9-be57-49cc-abb0-456dc8bbf2f9.jpg",
    "name": "Diamond & Pearl Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "f49551c4-b3cf-4ef0-8d71-ba3c6ac063cb",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/f49551c4-b3cf-4ef0-8d71-ba3c6ac063cb.jpg",
    "name": "Nidoking Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "eec1c92e-362e-4629-891e-13e047f4ab8e",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/eec1c92e-362e-4629-891e-13e047f4ab8e.jpg",
    "name": "Arcanine Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "78ed9df5-87fe-4c5a-bd1c-bc05833a5f33",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/78ed9df5-87fe-4c5a-bd1c-bc05833a5f33.jpg",
    "name": "Team Aqua Vs Team Magma Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "d1e2d379-93c1-4e5d-a70e-ee84f0c1cab9",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/d1e2d379-93c1-4e5d-a70e-ee84f0c1cab9.jpg",
    "name": "Rulers of the Heavens Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
  },
  {
    "id": "96f76f9a-f307-4cbb-b6a0-fb32ebc5838b",
    "image": "https://pokemon-sleeve-database.com/images/sleeves/western/ultra-pro/96f76f9a-f307-4cbb-b6a0-fb32ebc5838b.jpg",
    "name": "Flight of Legends Ultra Pro",
    "brand": "The Pokémon Company",
    "region": "Western",
    "category": "Ultra Pro",
    "releaseDate": "Unknown"
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
    