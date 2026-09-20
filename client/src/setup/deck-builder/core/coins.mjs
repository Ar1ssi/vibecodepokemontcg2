// Coin catalog: 202 launch-era (Gen IX) + 737 historical (Gens I-VIII).
// Generated from a Bulbapedia scrape; normalize/rewrite with
// `node scripts/normalize-coin-catalog.mjs`.

const COIN_BACK_URL = "src/assets/coins/coin-back.png";

const COIN_CATALOG = [
 {
  "id": "PRC_Red_Primal_Groudon_Coin",
  "url": "src/assets/coins/PRC_Red_Primal_Groudon_Coin.png",
  "thumb": "src/assets/coins/PRC_Red_Primal_Groudon_Coin.png",
  "name": "Primal Groudon Coin",
  "material": "enamel"
 },
 {
  "id": "PRC_Blue_Primal_Kyogre_Coin",
  "url": "src/assets/coins/PRC_Blue_Primal_Kyogre_Coin.png",
  "thumb": "src/assets/coins/PRC_Blue_Primal_Kyogre_Coin.png",
  "name": "Primal Kyogre Coin",
  "material": "enamel"
 },
 {
  "id": "SVAM_Green_Sprigatito_Coin",
  "url": "src/assets/coins/SVAM_Green_Sprigatito_Coin.png",
  "thumb": "src/assets/coins/SVAM_Green_Sprigatito_Coin.png",
  "name": "SVAM Green Sprigatito",
  "material": "enamel"
 },
 {
  "id": "SVAL_Red_Fuecoco_Coin",
  "url": "src/assets/coins/SVAL_Red_Fuecoco_Coin.png",
  "thumb": "src/assets/coins/SVAL_Red_Fuecoco_Coin.png",
  "name": "SVAL Red Fuecoco",
  "material": "enamel"
 },
 {
  "id": "SVAW_Blue_Quaxly_Coin",
  "url": "src/assets/coins/SVAW_Blue_Quaxly_Coin.png",
  "thumb": "src/assets/coins/SVAW_Blue_Quaxly_Coin.png",
  "name": "SVAW Blue Quaxly",
  "material": "enamel"
 },
 {
  "id": "SVB_Aqua_ex_Coin",
  "url": "src/assets/coins/SVB_Aqua_ex_Coin.png",
  "thumb": "src/assets/coins/SVB_Aqua_ex_Coin.png",
  "name": "SVB Aqua ex",
  "material": "enamel"
 },
 {
  "id": "ECS_Silver_Poke_Ball_Coin",
  "url": "src/assets/coins/ECS_Silver_Poke_Ball_Coin.png",
  "thumb": "src/assets/coins/ECS_Silver_Poke_Ball_Coin.png",
  "name": "ECS Silver Poke Ball",
  "material": "silver"
 },
 {
  "id": "FEC_Silver_Poke_Ball_Coin",
  "url": "src/assets/coins/FEC_Silver_Poke_Ball_Coin.png",
  "thumb": "src/assets/coins/FEC_Silver_Poke_Ball_Coin.png",
  "name": "FEC Silver Poke Ball",
  "material": "silver"
 },
 {
  "id": "SVC_Gold_Pikachu_Coin",
  "url": "src/assets/coins/SVC_Gold_Pikachu_Coin.png",
  "thumb": "src/assets/coins/SVC_Gold_Pikachu_Coin.png",
  "name": "SVC Gold Pikachu",
  "material": "gold"
 },
 {
  "id": "SVC_Silver_Pikachu_Coin",
  "url": "src/assets/coins/SVC_Silver_Pikachu_Coin.png",
  "thumb": "src/assets/coins/SVC_Silver_Pikachu_Coin.png",
  "name": "SVC Silver Pikachu",
  "material": "silver"
 },
 {
  "id": "SVIBL_Gold_Fuecoco_Coin",
  "url": "src/assets/coins/SVIBL_Gold_Fuecoco_Coin.jpg",
  "thumb": "src/assets/coins/SVIBL_Gold_Fuecoco_Coin.jpg",
  "name": "SVIBL Gold Fuecoco",
  "material": "gold"
 },
 {
  "id": "ExBD_White_ex_Coin",
  "url": "src/assets/coins/ExBD_White_ex_Coin.jpg",
  "thumb": "src/assets/coins/ExBD_White_ex_Coin.jpg",
  "name": "ExBD White ex",
  "material": "silver"
 },
 {
  "id": "PALBL_Gold_Quaxly_Coin",
  "url": "src/assets/coins/PALBL_Gold_Quaxly_Coin.jpg",
  "thumb": "src/assets/coins/PALBL_Gold_Quaxly_Coin.jpg",
  "name": "PALBL Gold Quaxly",
  "material": "gold"
 },
 {
  "id": "SVD_Silver_Pikachu_Coin",
  "url": "src/assets/coins/SVD_Silver_Pikachu_Coin.png",
  "thumb": "src/assets/coins/SVD_Silver_Pikachu_Coin.png",
  "name": "SVD Silver Pikachu",
  "material": "silver"
 },
 {
  "id": "CTVM_Purple_Ditto_Coin",
  "url": "src/assets/coins/CTVM_Purple_Ditto_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Purple_Ditto_Coin.jpg",
  "name": "CTVM Purple Ditto",
  "material": "enamel"
 },
 {
  "id": "CTVM_Yellow_Psyduck_Coin",
  "url": "src/assets/coins/CTVM_Yellow_Psyduck_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Yellow_Psyduck_Coin.jpg",
  "name": "CTVM Yellow Psyduck",
  "material": "enamel"
 },
 {
  "id": "CTVM_Pink_Slowpoke_Coin",
  "url": "src/assets/coins/CTVM_Pink_Slowpoke_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Pink_Slowpoke_Coin.jpg",
  "name": "CTVM Pink Slowpoke",
  "material": "enamel"
 },
 {
  "id": "CTVM_Silver_Alakazam_Coin",
  "url": "src/assets/coins/CTVM_Silver_Alakazam_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Silver_Alakazam_Coin.jpg",
  "name": "CTVM Silver Alakazam",
  "material": "silver"
 },
 {
  "id": "CTVM_Gold_Dragonite_Coin",
  "url": "src/assets/coins/CTVM_Gold_Dragonite_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Gold_Dragonite_Coin.jpg",
  "name": "CTVM Gold Dragonite",
  "material": "gold"
 },
 {
  "id": "CTVM_Gold_Fidough_Coin",
  "url": "src/assets/coins/CTVM_Gold_Fidough_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Gold_Fidough_Coin.jpg",
  "name": "CTVM Gold Fidough",
  "material": "gold"
 },
 {
  "id": "CTVM_Silver_Tandemaus_Coin",
  "url": "src/assets/coins/CTVM_Silver_Tandemaus_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Silver_Tandemaus_Coin.jpg",
  "name": "CTVM Silver Tandemaus",
  "material": "silver"
 },
 {
  "id": "CTVM_Blue_Baxcalibur_Coin",
  "url": "src/assets/coins/CTVM_Blue_Baxcalibur_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Blue_Baxcalibur_Coin.jpg",
  "name": "CTVM Blue Baxcalibur",
  "material": "enamel"
 },
 {
  "id": "CTVM_Brown_Greedent_Coin",
  "url": "src/assets/coins/CTVM_Brown_Greedent_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Brown_Greedent_Coin.jpg",
  "name": "CTVM Brown Greedent",
  "material": "enamel"
 },
 {
  "id": "CTVM_Gold_Meltan_Coin",
  "url": "src/assets/coins/CTVM_Gold_Meltan_Coin.jpg",
  "thumb": "src/assets/coins/CTVM_Gold_Meltan_Coin.jpg",
  "name": "CTVM Gold Meltan",
  "material": "gold"
 },
 {
  "id": "ExBD_Aqua_ex_Coin",
  "url": "src/assets/coins/ExBD_Aqua_ex_Coin.jpg",
  "thumb": "src/assets/coins/ExBD_Aqua_ex_Coin.jpg",
  "name": "ExBD Aqua ex",
  "material": "enamel"
 },
 {
  "id": "WCS23_Gold_Pikachu_Coin",
  "url": "src/assets/coins/WCS23_Gold_Pikachu_Coin.jpg",
  "thumb": "src/assets/coins/WCS23_Gold_Pikachu_Coin.jpg",
  "name": "WCS23 Gold Pikachu",
  "material": "gold"
 },
 {
  "id": "S2023CC_Red_Koraidon_Coin",
  "url": "src/assets/coins/S2023CC_Red_Koraidon_Coin.jpg",
  "thumb": "src/assets/coins/S2023CC_Red_Koraidon_Coin.jpg",
  "name": "S2023CC Red Koraidon",
  "material": "enamel"
 },
 {
  "id": "S2023CC_Blue_Miraidon_Coin",
  "url": "src/assets/coins/S2023CC_Blue_Miraidon_Coin.jpg",
  "thumb": "src/assets/coins/S2023CC_Blue_Miraidon_Coin.jpg",
  "name": "S2023CC Blue Miraidon",
  "material": "enamel"
 },
 {
  "id": "ARHBL_Silver_Fuecoco_Coin",
  "url": "src/assets/coins/ARHBL_Silver_Fuecoco_Coin.jpg",
  "thumb": "src/assets/coins/ARHBL_Silver_Fuecoco_Coin.jpg",
  "name": "ARHBL Silver Fuecoco",
  "material": "silver"
 },
 {
  "id": "WCS23_Metal_Pikachu_Coin",
  "url": "src/assets/coins/WCS23_Metal_Pikachu_Coin.jpg",
  "thumb": "src/assets/coins/WCS23_Metal_Pikachu_Coin.jpg",
  "name": "WCS23 Metal Pikachu",
  "material": "metal"
 },
 {
  "id": "WCS23_Yokohama_Pikachu_Coin",
  "url": "src/assets/coins/WCS23_Yokohama_Pikachu_Coin.jpg",
  "thumb": "src/assets/coins/WCS23_Yokohama_Pikachu_Coin.jpg",
  "name": "WCS23 Yokohama Pikachu",
  "material": "enamel"
 },
 {
  "id": "WCS23_Staff_Fuecoco_Coin",
  "url": "src/assets/coins/WCS23_Staff_Fuecoco_Coin.jpg",
  "thumb": "src/assets/coins/WCS23_Staff_Fuecoco_Coin.jpg",
  "name": "WCS23 Staff Fuecoco",
  "material": "enamel"
 },
 {
  "id": "OBFBL_Gold_Sprigatito_Coin",
  "url": "src/assets/coins/OBFBL_Gold_Sprigatito_Coin.jpg",
  "thumb": "src/assets/coins/OBFBL_Gold_Sprigatito_Coin.jpg",
  "name": "OBFBL Gold Sprigatito",
  "material": "gold"
 },
 {
  "id": "DBD_Green_Meowscarada_Coin",
  "url": "src/assets/coins/DBD_Green_Meowscarada_Coin.jpg",
  "thumb": "src/assets/coins/DBD_Green_Meowscarada_Coin.jpg",
  "name": "DBD Green Meowscarada",
  "material": "enamel"
 },
 {
  "id": "DBD_Blue_Quaquaval_Coin",
  "url": "src/assets/coins/DBD_Blue_Quaquaval_Coin.jpg",
  "thumb": "src/assets/coins/DBD_Blue_Quaquaval_Coin.jpg",
  "name": "DBD Blue Quaquaval",
  "material": "enamel"
 },
 {
  "id": "HC2023_Blue_Snom_Coin",
  "url": "src/assets/coins/HC2023_Blue_Snom_Coin.png",
  "thumb": "src/assets/coins/HC2023_Blue_Snom_Coin.png",
  "name": "HC2023 Blue Snom",
  "material": "enamel"
 },
 {
  "id": "HC2023_Blue_Alolan_Vulpix_Coin",
  "url": "src/assets/coins/HC2023_Blue_Alolan_Vulpix_Coin.png",
  "thumb": "src/assets/coins/HC2023_Blue_Alolan_Vulpix_Coin.png",
  "name": "HC2023 Blue Alolan Vulpix",
  "material": "enamel"
 },
 {
  "id": "SVEM_Silver_Mewtwo_Coin",
  "url": "src/assets/coins/SVEM_Silver_Mewtwo_Coin.png",
  "thumb": "src/assets/coins/SVEM_Silver_Mewtwo_Coin.png",
  "name": "SVEM Silver Mewtwo",
  "material": "silver"
 },
 {
  "id": "SVEL_Silver_Skeledirge_Coin",
  "url": "src/assets/coins/SVEL_Silver_Skeledirge_Coin.png",
  "thumb": "src/assets/coins/SVEL_Silver_Skeledirge_Coin.png",
  "name": "SVEL Silver Skeledirge",
  "material": "silver"
 },
 {
  "id": "MFB_Bulbasaur_Pikachu_Coin",
  "url": "src/assets/coins/MFB_Bulbasaur_Pikachu_Coin.jpg",
  "thumb": "src/assets/coins/MFB_Bulbasaur_Pikachu_Coin.jpg",
  "name": "MFB Bulbasaur Pikachu",
  "material": "enamel"
 },
 {
  "id": "MFB_Charmander_Squirtle_Coin",
  "url": "src/assets/coins/MFB_Charmander_Squirtle_Coin.jpg",
  "thumb": "src/assets/coins/MFB_Charmander_Squirtle_Coin.jpg",
  "name": "MFB Charmander Squirtle",
  "material": "enamel"
 },
 {
  "id": "151UPC_Pink_Mew_Coin",
  "url": "src/assets/coins/151UPC_Pink_Mew_Coin.jpg",
  "thumb": "src/assets/coins/151UPC_Pink_Mew_Coin.jpg",
  "name": "151UPC Pink Mew",
  "material": "enamel"
 },
 {
  "id": "151MT_Green_Grass_Coin",
  "url": "src/assets/coins/151MT_Green_Grass_Coin.jpg",
  "thumb": "src/assets/coins/151MT_Green_Grass_Coin.jpg",
  "name": "151MT Green Grass",
  "material": "enamel"
 },
 {
  "id": "151MT_Red_Fire_Coin",
  "url": "src/assets/coins/151MT_Red_Fire_Coin.jpg",
  "thumb": "src/assets/coins/151MT_Red_Fire_Coin.jpg",
  "name": "151MT Red Fire",
  "material": "enamel"
 },
 {
  "id": "151MT_Blue_Water_Coin",
  "url": "src/assets/coins/151MT_Blue_Water_Coin.jpg",
  "thumb": "src/assets/coins/151MT_Blue_Water_Coin.jpg",
  "name": "151MT Blue Water",
  "material": "enamel"
 },
 {
  "id": "151MT_Yellow_Lightning_Coin",
  "url": "src/assets/coins/151MT_Yellow_Lightning_Coin.jpg",
  "thumb": "src/assets/coins/151MT_Yellow_Lightning_Coin.jpg",
  "name": "151MT Yellow Lightning",
  "material": "enamel"
 },
 {
  "id": "151MT_Purple_Psychic_Coin",
  "url": "src/assets/coins/151MT_Purple_Psychic_Coin.jpg",
  "thumb": "src/assets/coins/151MT_Purple_Psychic_Coin.jpg",
  "name": "151MT Purple Psychic",
  "material": "enamel"
 },
 {
  "id": "151MT_Brown_Fighting_Coin",
  "url": "src/assets/coins/151MT_Brown_Fighting_Coin.jpg",
  "thumb": "src/assets/coins/151MT_Brown_Fighting_Coin.jpg",
  "name": "151MT Brown Fighting",
  "material": "enamel"
 },
 {
  "id": "151MT_Black_Darkness_Coin",
  "url": "src/assets/coins/151MT_Black_Darkness_Coin.jpg",
  "thumb": "src/assets/coins/151MT_Black_Darkness_Coin.jpg",
  "name": "151MT Black Darkness",
  "material": "enamel"
 },
 {
  "id": "151MT_Gray_Metal_Coin",
  "url": "src/assets/coins/151MT_Gray_Metal_Coin.jpg",
  "thumb": "src/assets/coins/151MT_Gray_Metal_Coin.jpg",
  "name": "151MT Gray Metal",
  "material": "metal"
 },
 {
  "id": "151MT_Gold_Dragon_Coin",
  "url": "src/assets/coins/151MT_Gold_Dragon_Coin.jpg",
  "thumb": "src/assets/coins/151MT_Gold_Dragon_Coin.jpg",
  "name": "151MT Gold Dragon",
  "material": "gold"
 },
 {
  "id": "151MT_White_Colorless_Coin",
  "url": "src/assets/coins/151MT_White_Colorless_Coin.jpg",
  "thumb": "src/assets/coins/151MT_White_Colorless_Coin.jpg",
  "name": "151MT White Colorless",
  "material": "silver"
 },
 {
  "id": "PARBL_Gold_Pikachu_Coin",
  "url": "src/assets/coins/PARBL_Gold_Pikachu_Coin.jpg",
  "thumb": "src/assets/coins/PARBL_Gold_Pikachu_Coin.jpg",
  "name": "PARBL Gold Pikachu",
  "material": "gold"
 },
 {
  "id": "SVG_Green_Venusaur_Coin",
  "url": "src/assets/coins/SVG_Green_Venusaur_Coin.png",
  "thumb": "src/assets/coins/SVG_Green_Venusaur_Coin.png",
  "name": "SVG Green Venusaur",
  "material": "enamel"
 },
 {
  "id": "SVG_Orange_Charizard_Coin",
  "url": "src/assets/coins/SVG_Orange_Charizard_Coin.png",
  "thumb": "src/assets/coins/SVG_Orange_Charizard_Coin.png",
  "name": "SVG Orange Charizard",
  "material": "enamel"
 },
 {
  "id": "SVG_Blue_Blastoise_Coin",
  "url": "src/assets/coins/SVG_Blue_Blastoise_Coin.png",
  "thumb": "src/assets/coins/SVG_Blue_Blastoise_Coin.png",
  "name": "SVG Blue Blastoise",
  "material": "enamel"
 },
 {
  "id": "F2023CC_Silver_Charizard_Coin",
  "url": "src/assets/coins/F2023CC_Silver_Charizard_Coin.jpg",
  "thumb": "src/assets/coins/F2023CC_Silver_Charizard_Coin.jpg",
  "name": "F2023CC Silver Charizard",
  "material": "silver"
 },
 {
  "id": "PBL_Silver_Quaxly_Coin",
  "url": "src/assets/coins/PBL_Silver_Quaxly_Coin.jpg",
  "thumb": "src/assets/coins/PBL_Silver_Quaxly_Coin.jpg",
  "name": "PBL Silver Quaxly",
  "material": "silver"
 },
 {
  "id": "SVHK_Red_Koraidon_Coin",
  "url": "src/assets/coins/SVHK_Red_Koraidon_Coin.png",
  "thumb": "src/assets/coins/SVHK_Red_Koraidon_Coin.png",
  "name": "SVHK Red Koraidon",
  "material": "enamel"
 },
 {
  "id": "SVHM_Purple_Miraidon_Coin",
  "url": "src/assets/coins/SVHM_Purple_Miraidon_Coin.png",
  "thumb": "src/assets/coins/SVHM_Purple_Miraidon_Coin.png",
  "name": "SVHM Purple Miraidon",
  "material": "enamel"
 },
 {
  "id": "WCS2023_Silver_Pikachu_Coin",
  "url": "src/assets/coins/WCS2023_Silver_Pikachu_Coin.jpg",
  "thumb": "src/assets/coins/WCS2023_Silver_Pikachu_Coin.jpg",
  "name": "WCS2023 Silver Pikachu",
  "material": "silver"
 },
 {
  "id": "SVI_Silver_Pikachu_Coin",
  "url": "src/assets/coins/SVI_Silver_Pikachu_Coin.png",
  "thumb": "src/assets/coins/SVI_Silver_Pikachu_Coin.png",
  "name": "SVI Silver Pikachu",
  "material": "silver"
 },
 {
  "id": "ADCS_Silver_ex_Coin",
  "url": "src/assets/coins/ADCS_Silver_ex_Coin.png",
  "thumb": "src/assets/coins/ADCS_Silver_ex_Coin.png",
  "name": "ADCS Silver ex",
  "material": "silver"
 },
 {
  "id": "TEFBL_Gold_Pawmi_Coin",
  "url": "src/assets/coins/TEFBL_Gold_Pawmi_Coin.jpg",
  "thumb": "src/assets/coins/TEFBL_Gold_Pawmi_Coin.jpg",
  "name": "TEFBL Gold Pawmi",
  "material": "gold"
 },
 {
  "id": "DBD_Red_Ninetales_Coin",
  "url": "src/assets/coins/DBD_Red_Ninetales_Coin.jpg",
  "thumb": "src/assets/coins/DBD_Red_Ninetales_Coin.jpg",
  "name": "DBD Red Ninetales",
  "material": "enamel"
 },
 {
  "id": "DBD_Yellow_Zapdos_Coin",
  "url": "src/assets/coins/DBD_Yellow_Zapdos_Coin.jpg",
  "thumb": "src/assets/coins/DBD_Yellow_Zapdos_Coin.jpg",
  "name": "DBD Yellow Zapdos",
  "material": "enamel"
 },
 {
  "id": "IC24_Metal_Armarouge_Ceruledge_Coin",
  "url": "src/assets/coins/IC24_Metal_Armarouge_Ceruledge_Coin.jpg",
  "thumb": "src/assets/coins/IC24_Metal_Armarouge_Ceruledge_Coin.jpg",
  "name": "IC24 Metal Armarouge Ceruledge",
  "material": "metal"
 },
 {
  "id": "IPTC_Pink_Iono_Coin",
  "url": "src/assets/coins/IPTC_Pink_Iono_Coin.png",
  "thumb": "src/assets/coins/IPTC_Pink_Iono_Coin.png",
  "name": "IPTC Pink Iono",
  "material": "enamel"
 },
 {
  "id": "PBGBL_Silver_Pikachu_Coin",
  "url": "src/assets/coins/PBGBL_Silver_Pikachu_Coin.jpg",
  "thumb": "src/assets/coins/PBGBL_Silver_Pikachu_Coin.jpg",
  "name": "PBGBL Silver Pikachu",
  "material": "silver"
 },
 {
  "id": "PC_Green_Ogerpon_Coin",
  "url": "src/assets/coins/PC_Green_Ogerpon_Coin.png",
  "thumb": "src/assets/coins/PC_Green_Ogerpon_Coin.png",
  "name": "PC Green Ogerpon",
  "material": "enamel"
 },
 {
  "id": "SVJL_Silver_Charizard_Coin",
  "url": "src/assets/coins/SVJL_Silver_Charizard_Coin.png",
  "thumb": "src/assets/coins/SVJL_Silver_Charizard_Coin.png",
  "name": "SVJL Silver Charizard",
  "material": "silver"
 },
 {
  "id": "SVJP_Silver_Chien-Pao_Coin",
  "url": "src/assets/coins/SVJP_Silver_Chien-Pao_Coin.png",
  "thumb": "src/assets/coins/SVJP_Silver_Chien-Pao_Coin.png",
  "name": "SVJP Silver Chien-Pao",
  "material": "silver"
 },
 {
  "id": "TWMBL_Gold_Lechonk_Coin",
  "url": "src/assets/coins/TWMBL_Gold_Lechonk_Coin.jpg",
  "thumb": "src/assets/coins/TWMBL_Gold_Lechonk_Coin.jpg",
  "name": "TWMBL Gold Lechonk",
  "material": "gold"
 },
 {
  "id": "TCGBA_Gold_Pikachu_Darkrai_Armarouge_Coin",
  "url": "src/assets/coins/TCGBA_Gold_Pikachu_Darkrai_Armarouge_Coin.jpg",
  "thumb": "src/assets/coins/TCGBA_Gold_Pikachu_Darkrai_Armarouge_Coin.jpg",
  "name": "TCGBA Gold Pikachu Darkrai Armarouge",
  "material": "gold"
 },
 {
  "id": "BTSCC_Pink_Scream_Tail_Coin",
  "url": "src/assets/coins/BTSCC_Pink_Scream_Tail_Coin.jpg",
  "thumb": "src/assets/coins/BTSCC_Pink_Scream_Tail_Coin.jpg",
  "name": "BTSCC Pink Scream Tail",
  "material": "enamel"
 },
 {
  "id": "BTSCC_Blue_Iron_Valiant_Coin",
  "url": "src/assets/coins/BTSCC_Blue_Iron_Valiant_Coin.jpg",
  "thumb": "src/assets/coins/BTSCC_Blue_Iron_Valiant_Coin.jpg",
  "name": "BTSCC Blue Iron Valiant",
  "material": "enamel"
 },
 {
  "id": "EBL_Silver_Sprigatito_Coin",
  "url": "src/assets/coins/EBL_Silver_Sprigatito_Coin.jpg",
  "thumb": "src/assets/coins/EBL_Silver_Sprigatito_Coin.jpg",
  "name": "EBL Silver Sprigatito",
  "material": "silver"
 },
 {
  "id": "WCS24_Metal_Pikachu_Coin",
  "url": "src/assets/coins/WCS24_Metal_Pikachu_Coin.png",
  "thumb": "src/assets/coins/WCS24_Metal_Pikachu_Coin.png",
  "name": "WCS24 Metal Pikachu",
  "material": "metal"
 },
 {
  "id": "WCS24_Metal_Munchlax_Coin",
  "url": "src/assets/coins/WCS24_Metal_Munchlax_Coin.jpg",
  "thumb": "src/assets/coins/WCS24_Metal_Munchlax_Coin.jpg",
  "name": "WCS24 Metal Munchlax",
  "material": "metal"
 },
 {
  "id": "WCS24_Gift_Pikachu_Coin",
  "url": "src/assets/coins/WCS24_Gift_Pikachu_Coin.png",
  "thumb": "src/assets/coins/WCS24_Gift_Pikachu_Coin.png",
  "name": "WCS24 Gift Pikachu",
  "material": "enamel"
 },
 {
  "id": "WCS24_Metal_Squirtle_Coin",
  "url": "src/assets/coins/WCS24_Metal_Squirtle_Coin.png",
  "thumb": "src/assets/coins/WCS24_Metal_Squirtle_Coin.png",
  "name": "WCS24 Metal Squirtle",
  "material": "metal"
 },
 {
  "id": "HC2024_Blue_Chien-Pao_Coin",
  "url": "src/assets/coins/HC2024_Blue_Chien-Pao_Coin.png",
  "thumb": "src/assets/coins/HC2024_Blue_Chien-Pao_Coin.png",
  "name": "HC2024 Blue Chien-Pao",
  "material": "enamel"
 },
 {
  "id": "HC2024_Silver_Cetoddle_Coin",
  "url": "src/assets/coins/HC2024_Silver_Cetoddle_Coin.jpg",
  "thumb": "src/assets/coins/HC2024_Silver_Cetoddle_Coin.jpg",
  "name": "HC2024 Silver Cetoddle",
  "material": "silver"
 },
 {
  "id": "SVLN_Silver_Sylveon_Coin",
  "url": "src/assets/coins/SVLN_Silver_Sylveon_Coin.png",
  "thumb": "src/assets/coins/SVLN_Silver_Sylveon_Coin.png",
  "name": "SVLN Silver Sylveon",
  "material": "silver"
 },
 {
  "id": "SVLS_Silver_Ceruledge_Coin",
  "url": "src/assets/coins/SVLS_Silver_Ceruledge_Coin.png",
  "thumb": "src/assets/coins/SVLS_Silver_Ceruledge_Coin.png",
  "name": "SVLS Silver Ceruledge",
  "material": "silver"
 },
 {
  "id": "SCR_Gold_Dragonite_Coin",
  "url": "src/assets/coins/SCR_Gold_Dragonite_Coin.jpg",
  "thumb": "src/assets/coins/SCR_Gold_Dragonite_Coin.jpg",
  "name": "SCR Gold Dragonite",
  "material": "gold"
 },
 {
  "id": "ZLPBL_Silver_Palkia_Coin",
  "url": "src/assets/coins/ZLPBL_Silver_Palkia_Coin.jpg",
  "thumb": "src/assets/coins/ZLPBL_Silver_Palkia_Coin.jpg",
  "name": "ZLPBL Silver Palkia",
  "material": "silver"
 },
 {
  "id": "GUPC_Blue_Greninja_Coin",
  "url": "src/assets/coins/GUPC_Blue_Greninja_Coin.jpg",
  "thumb": "src/assets/coins/GUPC_Blue_Greninja_Coin.jpg",
  "name": "GUPC Blue Greninja",
  "material": "enamel"
 },
 {
  "id": "CC2024_Blue_Terapagos_Coin",
  "url": "src/assets/coins/CC2024_Blue_Terapagos_Coin.jpg",
  "thumb": "src/assets/coins/CC2024_Blue_Terapagos_Coin.jpg",
  "name": "CC2024 Blue Terapagos",
  "material": "enamel"
 },
 {
  "id": "TUPC_Blue_Terapagos_Coin",
  "url": "src/assets/coins/TUPC_Blue_Terapagos_Coin.jpg",
  "thumb": "src/assets/coins/TUPC_Blue_Terapagos_Coin.jpg",
  "name": "TUPC Blue Terapagos",
  "material": "enamel"
 },
 {
  "id": "CTVM_2024_Pikachu_Coin",
  "url": "src/assets/coins/CTVM_2024_Pikachu_Coin.png",
  "thumb": "src/assets/coins/CTVM_2024_Pikachu_Coin.png",
  "name": "CTVM 2024 Pikachu",
  "material": "enamel"
 },
 {
  "id": "CTVM_Blue_Snorlax_Coin",
  "url": "src/assets/coins/CTVM_Blue_Snorlax_Coin.png",
  "thumb": "src/assets/coins/CTVM_Blue_Snorlax_Coin.png",
  "name": "CTVM Blue Snorlax",
  "material": "enamel"
 },
 {
  "id": "CTVM_Silver_Lugia_Coin",
  "url": "src/assets/coins/CTVM_Silver_Lugia_Coin.png",
  "thumb": "src/assets/coins/CTVM_Silver_Lugia_Coin.png",
  "name": "CTVM Silver Lugia",
  "material": "silver"
 },
 {
  "id": "CTVM_Red_Blaziken_Coin",
  "url": "src/assets/coins/CTVM_Red_Blaziken_Coin.png",
  "thumb": "src/assets/coins/CTVM_Red_Blaziken_Coin.png",
  "name": "CTVM Red Blaziken",
  "material": "enamel"
 },
 {
  "id": "CTVM_Blue_Lucario_Coin",
  "url": "src/assets/coins/CTVM_Blue_Lucario_Coin.png",
  "thumb": "src/assets/coins/CTVM_Blue_Lucario_Coin.png",
  "name": "CTVM Blue Lucario",
  "material": "enamel"
 },
 {
  "id": "CTVM_Red_Reshiram_Coin",
  "url": "src/assets/coins/CTVM_Red_Reshiram_Coin.png",
  "thumb": "src/assets/coins/CTVM_Red_Reshiram_Coin.png",
  "name": "CTVM Red Reshiram",
  "material": "enamel"
 },
 {
  "id": "CTVM_Green_Noivern_Coin",
  "url": "src/assets/coins/CTVM_Green_Noivern_Coin.png",
  "thumb": "src/assets/coins/CTVM_Green_Noivern_Coin.png",
  "name": "CTVM Green Noivern",
  "material": "enamel"
 },
 {
  "id": "CTVM_Gold_Mimikyu_Coin",
  "url": "src/assets/coins/CTVM_Gold_Mimikyu_Coin.png",
  "thumb": "src/assets/coins/CTVM_Gold_Mimikyu_Coin.png",
  "name": "CTVM Gold Mimikyu",
  "material": "gold"
 },
 {
  "id": "CTVM_Pink_Alcremie_Coin",
  "url": "src/assets/coins/CTVM_Pink_Alcremie_Coin.png",
  "thumb": "src/assets/coins/CTVM_Pink_Alcremie_Coin.png",
  "name": "CTVM Pink Alcremie",
  "material": "enamel"
 },
 {
  "id": "CTVM_Silver_Clodsire_Coin",
  "url": "src/assets/coins/CTVM_Silver_Clodsire_Coin.png",
  "thumb": "src/assets/coins/CTVM_Silver_Clodsire_Coin.png",
  "name": "CTVM Silver Clodsire",
  "material": "silver"
 },
 {
  "id": "SVM_Silver_Pikachu_Coin",
  "url": "src/assets/coins/SVM_Silver_Pikachu_Coin.png",
  "thumb": "src/assets/coins/SVM_Silver_Pikachu_Coin.png",
  "name": "SVM Silver Pikachu",
  "material": "silver"
 },
 {
  "id": "SVM_Pikachu_Snorlax_Coin",
  "url": "src/assets/coins/SVM_Pikachu_Snorlax_Coin.png",
  "thumb": "src/assets/coins/SVM_Pikachu_Snorlax_Coin.png",
  "name": "SVM Pikachu Snorlax",
  "material": "enamel"
 },
 {
  "id": "SVM_Clodsire_Koraidon_Coin",
  "url": "src/assets/coins/SVM_Clodsire_Koraidon_Coin.png",
  "thumb": "src/assets/coins/SVM_Clodsire_Koraidon_Coin.png",
  "name": "SVM Clodsire Koraidon",
  "material": "enamel"
 },
 {
  "id": "CTVM_2024_Eevee_Coin",
  "url": "src/assets/coins/CTVM_2024_Eevee_Coin.png",
  "thumb": "src/assets/coins/CTVM_2024_Eevee_Coin.png",
  "name": "CTVM 2024 Eevee",
  "material": "enamel"
 },
 {
  "id": "CTVM_Blue_Vaporeon_Coin",
  "url": "src/assets/coins/CTVM_Blue_Vaporeon_Coin.png",
  "thumb": "src/assets/coins/CTVM_Blue_Vaporeon_Coin.png",
  "name": "CTVM Blue Vaporeon",
  "material": "enamel"
 },
 {
  "id": "CTVM_Yellow_Jolteon_Coin",
  "url": "src/assets/coins/CTVM_Yellow_Jolteon_Coin.png",
  "thumb": "src/assets/coins/CTVM_Yellow_Jolteon_Coin.png",
  "name": "CTVM Yellow Jolteon",
  "material": "enamel"
 },
 {
  "id": "CTVM_Red_Flareon_Coin",
  "url": "src/assets/coins/CTVM_Red_Flareon_Coin.png",
  "thumb": "src/assets/coins/CTVM_Red_Flareon_Coin.png",
  "name": "CTVM Red Flareon",
  "material": "enamel"
 },
 {
  "id": "CTVM_Purple_Espeon_Coin",
  "url": "src/assets/coins/CTVM_Purple_Espeon_Coin.png",
  "thumb": "src/assets/coins/CTVM_Purple_Espeon_Coin.png",
  "name": "CTVM Purple Espeon",
  "material": "enamel"
 },
 {
  "id": "CTVM_Gray_Umbreon_Coin",
  "url": "src/assets/coins/CTVM_Gray_Umbreon_Coin.png",
  "thumb": "src/assets/coins/CTVM_Gray_Umbreon_Coin.png",
  "name": "CTVM Gray Umbreon",
  "material": "enamel"
 },
 {
  "id": "CTVM_Green_Leafeon_Coin",
  "url": "src/assets/coins/CTVM_Green_Leafeon_Coin.png",
  "thumb": "src/assets/coins/CTVM_Green_Leafeon_Coin.png",
  "name": "CTVM Green Leafeon",
  "material": "enamel"
 },
 {
  "id": "CTVM_Blue_Glaceon_Coin",
  "url": "src/assets/coins/CTVM_Blue_Glaceon_Coin.png",
  "thumb": "src/assets/coins/CTVM_Blue_Glaceon_Coin.png",
  "name": "CTVM Blue Glaceon",
  "material": "enamel"
 },
 {
  "id": "CTVM_2024_Sylveon_Coin",
  "url": "src/assets/coins/CTVM_2024_Sylveon_Coin.png",
  "thumb": "src/assets/coins/CTVM_2024_Sylveon_Coin.png",
  "name": "CTVM 2024 Sylveon",
  "material": "enamel"
 },
 {
  "id": "ABL_Silver_Dragonite_Coin",
  "url": "src/assets/coins/ABL_Silver_Dragonite_Coin.jpg",
  "thumb": "src/assets/coins/ABL_Silver_Dragonite_Coin.jpg",
  "name": "ABL Silver Dragonite",
  "material": "silver"
 },
 {
  "id": "CSVH1_Cardboard_ex_Coin",
  "url": "src/assets/coins/CSVH1_Cardboard_ex_Coin.png",
  "thumb": "src/assets/coins/CSVH1_Cardboard_ex_Coin.png",
  "name": "CSVH1 Cardboard ex",
  "material": "cardboard"
 },
 {
  "id": "CFS_Green_N_Coin",
  "url": "src/assets/coins/CFS_Green_N_Coin.png",
  "thumb": "src/assets/coins/CFS_Green_N_Coin.png",
  "name": "CFS Green N",
  "material": "enamel"
 },
 {
  "id": "CFS_White_Lillie_Coin",
  "url": "src/assets/coins/CFS_White_Lillie_Coin.png",
  "thumb": "src/assets/coins/CFS_White_Lillie_Coin.png",
  "name": "CFS White Lillie",
  "material": "silver"
 },
 {
  "id": "PREMT_Blue_Eevee_Coin",
  "url": "src/assets/coins/PREMT_Blue_Eevee_Coin.jpg",
  "thumb": "src/assets/coins/PREMT_Blue_Eevee_Coin.jpg",
  "name": "PREMT Blue Eevee",
  "material": "enamel"
 },
 {
  "id": "PREMT_Yellow_Eevee_Coin",
  "url": "src/assets/coins/PREMT_Yellow_Eevee_Coin.jpg",
  "thumb": "src/assets/coins/PREMT_Yellow_Eevee_Coin.jpg",
  "name": "PREMT Yellow Eevee",
  "material": "enamel"
 },
 {
  "id": "PREMT_Red_Eevee_Coin",
  "url": "src/assets/coins/PREMT_Red_Eevee_Coin.jpg",
  "thumb": "src/assets/coins/PREMT_Red_Eevee_Coin.jpg",
  "name": "PREMT Red Eevee",
  "material": "enamel"
 },
 {
  "id": "PREMT_Purple_Eevee_Coin",
  "url": "src/assets/coins/PREMT_Purple_Eevee_Coin.jpg",
  "thumb": "src/assets/coins/PREMT_Purple_Eevee_Coin.jpg",
  "name": "PREMT Purple Eevee",
  "material": "enamel"
 },
 {
  "id": "PREMT_Gray_Eevee_Coin",
  "url": "src/assets/coins/PREMT_Gray_Eevee_Coin.jpg",
  "thumb": "src/assets/coins/PREMT_Gray_Eevee_Coin.jpg",
  "name": "PREMT Gray Eevee",
  "material": "enamel"
 },
 {
  "id": "PREMT_Green_Eevee_Coin",
  "url": "src/assets/coins/PREMT_Green_Eevee_Coin.jpg",
  "thumb": "src/assets/coins/PREMT_Green_Eevee_Coin.jpg",
  "name": "PREMT Green Eevee",
  "material": "enamel"
 },
 {
  "id": "PREMT_Teal_Eevee_Coin",
  "url": "src/assets/coins/PREMT_Teal_Eevee_Coin.jpg",
  "thumb": "src/assets/coins/PREMT_Teal_Eevee_Coin.jpg",
  "name": "PREMT Teal Eevee",
  "material": "enamel"
 },
 {
  "id": "PREMT_Pink_Eevee_Coin",
  "url": "src/assets/coins/PREMT_Pink_Eevee_Coin.jpg",
  "thumb": "src/assets/coins/PREMT_Pink_Eevee_Coin.jpg",
  "name": "PREMT Pink Eevee",
  "material": "enamel"
 },
 {
  "id": "EUIC_Metal_Ogerpon_Coin",
  "url": "src/assets/coins/EUIC_Metal_Ogerpon_Coin.png",
  "thumb": "src/assets/coins/EUIC_Metal_Ogerpon_Coin.png",
  "name": "EUIC Metal Ogerpon",
  "material": "metal"
 },
 {
  "id": "PREBL_Gold_Eevee_Coin",
  "url": "src/assets/coins/PREBL_Gold_Eevee_Coin.jpg",
  "thumb": "src/assets/coins/PREBL_Gold_Eevee_Coin.jpg",
  "name": "PREBL Gold Eevee",
  "material": "gold"
 },
 {
  "id": "WCS2024_Silver_Pikachu_Coin",
  "url": "src/assets/coins/WCS2024_Silver_Pikachu_Coin.png",
  "thumb": "src/assets/coins/WCS2024_Silver_Pikachu_Coin.png",
  "name": "WCS2024 Silver Pikachu",
  "material": "silver"
 },
 {
  "id": "JTGBL_Gold_Greedent_Coin",
  "url": "src/assets/coins/JTGBL_Gold_Greedent_Coin.jpg",
  "thumb": "src/assets/coins/JTGBL_Gold_Greedent_Coin.jpg",
  "name": "JTGBL Gold Greedent",
  "material": "gold"
 },
 {
  "id": "C151_Water_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Water_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Water_Bulbasaur_Coin.png",
  "name": "C151 Water Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "C151_Colorless_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Colorless_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Colorless_Bulbasaur_Coin.png",
  "name": "C151 Colorless Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "C151_Dragon_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Dragon_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Dragon_Bulbasaur_Coin.png",
  "name": "C151 Dragon Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "C151_Secret_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Secret_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Secret_Bulbasaur_Coin.png",
  "name": "C151 Secret Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "LPTC_Green_Lillie_Coin",
  "url": "src/assets/coins/LPTC_Green_Lillie_Coin.png",
  "thumb": "src/assets/coins/LPTC_Green_Lillie_Coin.png",
  "name": "LPTC Green Lillie",
  "material": "enamel"
 },
 {
  "id": "RBD_Pink_Marnie_Coin",
  "url": "src/assets/coins/RBD_Pink_Marnie_Coin.png",
  "thumb": "src/assets/coins/RBD_Pink_Marnie_Coin.png",
  "name": "RBD Pink Marnie",
  "material": "enamel"
 },
 {
  "id": "RBD_Gray_Steven_Coin",
  "url": "src/assets/coins/RBD_Gray_Steven_Coin.png",
  "thumb": "src/assets/coins/RBD_Gray_Steven_Coin.png",
  "name": "RBD Gray Steven",
  "material": "enamel"
 },
 {
  "id": "DRIBL_Gold_Fidough_Coin",
  "url": "src/assets/coins/DRIBL_Gold_Fidough_Coin.png",
  "thumb": "src/assets/coins/DRIBL_Gold_Fidough_Coin.png",
  "name": "DRIBL Gold Fidough",
  "material": "gold"
 },
 {
  "id": "C151_Grass_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Grass_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Grass_Bulbasaur_Coin.png",
  "name": "C151 Grass Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "C151_Psychic_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Psychic_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Psychic_Bulbasaur_Coin.png",
  "name": "C151 Psychic Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "C151_Darkness_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Darkness_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Darkness_Bulbasaur_Coin.png",
  "name": "C151 Darkness Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "WCS25_Gift_Pikachu_Coin",
  "url": "src/assets/coins/WCS25_Gift_Pikachu_Coin.png",
  "thumb": "src/assets/coins/WCS25_Gift_Pikachu_Coin.png",
  "name": "WCS25 Gift Pikachu",
  "material": "enamel"
 },
 {
  "id": "WCS25_Letterman_Pikachu_Coin",
  "url": "src/assets/coins/WCS25_Letterman_Pikachu_Coin.png",
  "thumb": "src/assets/coins/WCS25_Letterman_Pikachu_Coin.png",
  "name": "WCS25 Letterman Pikachu",
  "material": "enamel"
 },
 {
  "id": "WCS23_Sunglasses_Pikachu_Coin",
  "url": "src/assets/coins/WCS23_Sunglasses_Pikachu_Coin.png",
  "thumb": "src/assets/coins/WCS23_Sunglasses_Pikachu_Coin.png",
  "name": "WCS23 Sunglasses Pikachu",
  "material": "enamel"
 },
 {
  "id": "WCS25_Metal_Jigglypuff_Coin",
  "url": "src/assets/coins/WCS25_Metal_Jigglypuff_Coin.png",
  "thumb": "src/assets/coins/WCS25_Metal_Jigglypuff_Coin.png",
  "name": "WCS25 Metal Jigglypuff",
  "material": "metal"
 },
 {
  "id": "WCS25_Staff_Toedscool_Coin",
  "url": "src/assets/coins/WCS25_Staff_Toedscool_Coin.png",
  "thumb": "src/assets/coins/WCS25_Staff_Toedscool_Coin.png",
  "name": "WCS25 Staff Toedscool",
  "material": "enamel"
 },
 {
  "id": "HC2025_Gold_Pikachu_Coin",
  "url": "src/assets/coins/HC2025_Gold_Pikachu_Coin.png",
  "thumb": "src/assets/coins/HC2025_Gold_Pikachu_Coin.png",
  "name": "HC2025 Gold Pikachu",
  "material": "gold"
 },
 {
  "id": "HC2025_Pink_Alcremie_Coin",
  "url": "src/assets/coins/HC2025_Pink_Alcremie_Coin.png",
  "thumb": "src/assets/coins/HC2025_Pink_Alcremie_Coin.png",
  "name": "HC2025 Pink Alcremie",
  "material": "enamel"
 },
 {
  "id": "MBG_Purple_Mega_Gengar_Coin",
  "url": "src/assets/coins/MBG_Purple_Mega_Gengar_Coin.png",
  "thumb": "src/assets/coins/MBG_Purple_Mega_Gengar_Coin.png",
  "name": "MBG Purple Mega Gengar",
  "material": "enamel"
 },
 {
  "id": "MBD_Magenta_Mega_Diancie_Coin",
  "url": "src/assets/coins/MBD_Magenta_Mega_Diancie_Coin.png",
  "thumb": "src/assets/coins/MBD_Magenta_Mega_Diancie_Coin.png",
  "name": "MBD Magenta Mega Diancie",
  "material": "enamel"
 },
 {
  "id": "BeijingMasters_Metal_Gholdengo_Coin",
  "url": "src/assets/coins/BeijingMasters_Metal_Gholdengo_Coin.png",
  "thumb": "src/assets/coins/BeijingMasters_Metal_Gholdengo_Coin.png",
  "name": "BeijingMasters Metal Gholdengo",
  "material": "metal"
 },
 {
  "id": "BeijingMasters_Metal_Pikachu_Coin",
  "url": "src/assets/coins/BeijingMasters_Metal_Pikachu_Coin.png",
  "thumb": "src/assets/coins/BeijingMasters_Metal_Pikachu_Coin.png",
  "name": "BeijingMasters Metal Pikachu",
  "material": "metal"
 },
 {
  "id": "BeijingMasters_Metal_Garganacl_Coin",
  "url": "src/assets/coins/BeijingMasters_Metal_Garganacl_Coin.png",
  "thumb": "src/assets/coins/BeijingMasters_Metal_Garganacl_Coin.png",
  "name": "BeijingMasters Metal Garganacl",
  "material": "metal"
 },
 {
  "id": "MEGETB_Blue_Mega_Lucario_Coin",
  "url": "src/assets/coins/MEGETB_Blue_Mega_Lucario_Coin.png",
  "thumb": "src/assets/coins/MEGETB_Blue_Mega_Lucario_Coin.png",
  "name": "MEGETB Blue Mega Lucario",
  "material": "enamel"
 },
 {
  "id": "MEGETB_Silver_Mega_Gardevoir_Coin",
  "url": "src/assets/coins/MEGETB_Silver_Mega_Gardevoir_Coin.png",
  "thumb": "src/assets/coins/MEGETB_Silver_Mega_Gardevoir_Coin.png",
  "name": "MEGETB Silver Mega Gardevoir",
  "material": "silver"
 },
 {
  "id": "MEGBL_Gold_Mega_Lucario_Coin",
  "url": "src/assets/coins/MEGBL_Gold_Mega_Lucario_Coin.png",
  "thumb": "src/assets/coins/MEGBL_Gold_Mega_Lucario_Coin.png",
  "name": "MEGBL Gold Mega Lucario",
  "material": "gold"
 },
 {
  "id": "TRBL_Silver_Zapdos_Coin",
  "url": "src/assets/coins/TRBL_Silver_Zapdos_Coin.png",
  "thumb": "src/assets/coins/TRBL_Silver_Zapdos_Coin.png",
  "name": "TRBL Silver Zapdos",
  "material": "silver"
 },
 {
  "id": "C151_Fire_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Fire_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Fire_Bulbasaur_Coin.png",
  "name": "C151 Fire Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "C151_Lightning_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Lightning_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Lightning_Bulbasaur_Coin.png",
  "name": "C151 Lightning Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "C151_Fighting_Bulbasaur_Coin",
  "url": "src/assets/coins/C151_Fighting_Bulbasaur_Coin.png",
  "thumb": "src/assets/coins/C151_Fighting_Bulbasaur_Coin.png",
  "name": "C151 Fighting Bulbasaur",
  "material": "enamel"
 },
 {
  "id": "MBD_Purple_Mega_Gengar_Coin",
  "url": "src/assets/coins/MBD_Purple_Mega_Gengar_Coin.png",
  "thumb": "src/assets/coins/MBD_Purple_Mega_Gengar_Coin.png",
  "name": "MBD Purple Mega Gengar",
  "material": "enamel"
 },
 {
  "id": "MBD_Pink_Mega_Diancie_Coin",
  "url": "src/assets/coins/MBD_Pink_Mega_Diancie_Coin.png",
  "thumb": "src/assets/coins/MBD_Pink_Mega_Diancie_Coin.png",
  "name": "MBD Pink Mega Diancie",
  "material": "enamel"
 },
 {
  "id": "UPC_Red_Fire_Coin",
  "url": "src/assets/coins/UPC_Red_Fire_Coin.png",
  "thumb": "src/assets/coins/UPC_Red_Fire_Coin.png",
  "name": "UPC Red Fire",
  "material": "enamel"
 },
 {
  "id": "PFLETB_Mega_Charizard_X_Coin",
  "url": "src/assets/coins/PFLETB_Mega_Charizard_X_Coin.png",
  "thumb": "src/assets/coins/PFLETB_Mega_Charizard_X_Coin.png",
  "name": "PFLETB Mega Charizard X",
  "material": "enamel"
 },
 {
  "id": "PFLBL_Gold_Mega_Diancie_Coin",
  "url": "src/assets/coins/PFLBL_Gold_Mega_Diancie_Coin.png",
  "thumb": "src/assets/coins/PFLBL_Gold_Mega_Diancie_Coin.png",
  "name": "PFLBL Gold Mega Diancie",
  "material": "gold"
 },
 {
  "id": "UPC_Metal_Mega_Charizard_X_Coin",
  "url": "src/assets/coins/UPC_Metal_Mega_Charizard_X_Coin.png",
  "thumb": "src/assets/coins/UPC_Metal_Mega_Charizard_X_Coin.png",
  "name": "UPC Metal Mega Charizard X",
  "material": "metal"
 },
 {
  "id": "F2025CC_Silver_Mega_Lucario_Coin",
  "url": "src/assets/coins/F2025CC_Silver_Mega_Lucario_Coin.png",
  "thumb": "src/assets/coins/F2025CC_Silver_Mega_Lucario_Coin.png",
  "name": "F2025CC Silver Mega Lucario",
  "material": "silver"
 },
 {
  "id": "ShenzhenMasters_Metal_Dragapult_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Dragapult_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Dragapult_Coin.png",
  "name": "ShenzhenMasters Metal Dragapult",
  "material": "metal"
 },
 {
  "id": "ShenzhenMasters_Metal_Mewtwo_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Mewtwo_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Mewtwo_Coin.png",
  "name": "ShenzhenMasters Metal Mewtwo",
  "material": "metal"
 },
 {
  "id": "ShenzhenMasters_Metal_Porygon_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Porygon_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Porygon_Coin.png",
  "name": "ShenzhenMasters Metal Porygon",
  "material": "metal"
 },
 {
  "id": "ShenzhenMasters_Metal_Zapdos_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Zapdos_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Zapdos_Coin.png",
  "name": "ShenzhenMasters Metal Zapdos",
  "material": "metal"
 },
 {
  "id": "ShenzhenMasters_Metal_Pikachu_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Pikachu_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Pikachu_Coin.png",
  "name": "ShenzhenMasters Metal Pikachu",
  "material": "metal"
 },
 {
  "id": "ShenzhenMasters_Metal_Ampharos_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Ampharos_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Ampharos_Coin.png",
  "name": "ShenzhenMasters Metal Ampharos",
  "material": "metal"
 },
 {
  "id": "CTVM_Orange_Mega_Charizard_Y_Coin",
  "url": "src/assets/coins/CTVM_Orange_Mega_Charizard_Y_Coin.png",
  "thumb": "src/assets/coins/CTVM_Orange_Mega_Charizard_Y_Coin.png",
  "name": "CTVM Orange Mega Charizard Y",
  "material": "enamel"
 },
 {
  "id": "CTVM_Pink_Mega_Audino_Coin",
  "url": "src/assets/coins/CTVM_Pink_Mega_Audino_Coin.png",
  "thumb": "src/assets/coins/CTVM_Pink_Mega_Audino_Coin.png",
  "name": "CTVM Pink Mega Audino",
  "material": "enamel"
 },
 {
  "id": "CTVM_Green_Chikorita_Coin",
  "url": "src/assets/coins/CTVM_Green_Chikorita_Coin.png",
  "thumb": "src/assets/coins/CTVM_Green_Chikorita_Coin.png",
  "name": "CTVM Green Chikorita",
  "material": "enamel"
 },
 {
  "id": "CTVM_Red_Tepig_Coin",
  "url": "src/assets/coins/CTVM_Red_Tepig_Coin.png",
  "thumb": "src/assets/coins/CTVM_Red_Tepig_Coin.png",
  "name": "CTVM Red Tepig",
  "material": "enamel"
 },
 {
  "id": "CTVM_Teal_Totodile_Coin",
  "url": "src/assets/coins/CTVM_Teal_Totodile_Coin.png",
  "thumb": "src/assets/coins/CTVM_Teal_Totodile_Coin.png",
  "name": "CTVM Teal Totodile",
  "material": "enamel"
 },
 {
  "id": "CTVM_Yellow_Pikachu_Coin",
  "url": "src/assets/coins/CTVM_Yellow_Pikachu_Coin.png",
  "thumb": "src/assets/coins/CTVM_Yellow_Pikachu_Coin.png",
  "name": "CTVM Yellow Pikachu",
  "material": "enamel"
 },
 {
  "id": "CTVM_Pink_Clefairy_Coin",
  "url": "src/assets/coins/CTVM_Pink_Clefairy_Coin.png",
  "thumb": "src/assets/coins/CTVM_Pink_Clefairy_Coin.png",
  "name": "CTVM Pink Clefairy",
  "material": "enamel"
 },
 {
  "id": "CTVM_Blue_Azumarill_Coin",
  "url": "src/assets/coins/CTVM_Blue_Azumarill_Coin.png",
  "thumb": "src/assets/coins/CTVM_Blue_Azumarill_Coin.png",
  "name": "CTVM Blue Azumarill",
  "material": "enamel"
 },
 {
  "id": "CTVM_Brown_Stunfisk_Coin",
  "url": "src/assets/coins/CTVM_Brown_Stunfisk_Coin.png",
  "thumb": "src/assets/coins/CTVM_Brown_Stunfisk_Coin.png",
  "name": "CTVM Brown Stunfisk",
  "material": "enamel"
 },
 {
  "id": "CTVM_Red_Armarouge_Coin",
  "url": "src/assets/coins/CTVM_Red_Armarouge_Coin.png",
  "thumb": "src/assets/coins/CTVM_Red_Armarouge_Coin.png",
  "name": "CTVM Red Armarouge",
  "material": "enamel"
 },
 {
  "id": "MC_Gold_Mega_Charizard_Y_Coin",
  "url": "src/assets/coins/MC_Gold_Mega_Charizard_Y_Coin.png",
  "thumb": "src/assets/coins/MC_Gold_Mega_Charizard_Y_Coin.png",
  "name": "MC Gold Mega Charizard Y",
  "material": "gold"
 },
 {
  "id": "RBL_Silver_Raikou_Coin",
  "url": "src/assets/coins/RBL_Silver_Raikou_Coin.png",
  "thumb": "src/assets/coins/RBL_Silver_Raikou_Coin.png",
  "name": "RBL Silver Raikou",
  "material": "silver"
 },
 {
  "id": "MC_Silver_Mega_Audino_Coin",
  "url": "src/assets/coins/MC_Silver_Mega_Audino_Coin.png",
  "thumb": "src/assets/coins/MC_Silver_Mega_Audino_Coin.png",
  "name": "MC Silver Mega Audino",
  "material": "silver"
 },
 {
  "id": "SCS_Green_Mega_Gallade_Coin",
  "url": "src/assets/coins/SCS_Green_Mega_Gallade_Coin.png",
  "thumb": "src/assets/coins/SCS_Green_Mega_Gallade_Coin.png",
  "name": "SCS Green Mega Gallade",
  "material": "enamel"
 },
 {
  "id": "PD2026C_Gold_Logo_Coin",
  "url": "src/assets/coins/PD2026C_Gold_Logo_Coin.png",
  "thumb": "src/assets/coins/PD2026C_Gold_Logo_Coin.png",
  "name": "PD2026C Gold Logo",
  "material": "gold"
 },
 {
  "id": "ASCC_Green_Erika_Coin",
  "url": "src/assets/coins/ASCC_Green_Erika_Coin.png",
  "thumb": "src/assets/coins/ASCC_Green_Erika_Coin.png",
  "name": "ASCC Green Erika",
  "material": "enamel"
 },
 {
  "id": "ASCC_Gold_Larry_Coin",
  "url": "src/assets/coins/ASCC_Gold_Larry_Coin.png",
  "thumb": "src/assets/coins/ASCC_Gold_Larry_Coin.png",
  "name": "ASCC Gold Larry",
  "material": "gold"
 },
 {
  "id": "EUIC_Metal_Mega_Charizard_X_Coin",
  "url": "src/assets/coins/EUIC_Metal_Mega_Charizard_X_Coin.png",
  "thumb": "src/assets/coins/EUIC_Metal_Mega_Charizard_X_Coin.png",
  "name": "EUIC Metal Mega Charizard X",
  "material": "metal"
 },
 {
  "id": "ASCETB_Yellow_Mega_Dragonite_Coin",
  "url": "src/assets/coins/ASCETB_Yellow_Mega_Dragonite_Coin.png",
  "thumb": "src/assets/coins/ASCETB_Yellow_Mega_Dragonite_Coin.png",
  "name": "ASCETB Yellow Mega Dragonite",
  "material": "enamel"
 },
 {
  "id": "PORETB_Green_Zygarde_Core_Coin",
  "url": "src/assets/coins/PORETB_Green_Zygarde_Core_Coin.png",
  "thumb": "src/assets/coins/PORETB_Green_Zygarde_Core_Coin.png",
  "name": "PORETB Green Zygarde Core",
  "material": "enamel"
 },
 {
  "id": "PORBL_Gold_Snorlax_Coin",
  "url": "src/assets/coins/PORBL_Gold_Snorlax_Coin.png",
  "thumb": "src/assets/coins/PORBL_Gold_Snorlax_Coin.png",
  "name": "PORBL Gold Snorlax",
  "material": "gold"
 },
 {
  "id": "EBL_Silver_Diancie_Coin",
  "url": "src/assets/coins/EBL_Silver_Diancie_Coin.png",
  "thumb": "src/assets/coins/EBL_Silver_Diancie_Coin.png",
  "name": "EBL Silver Diancie",
  "material": "silver"
 },
 {
  "id": "M4_Gold_Pikachu_Coin",
  "url": "src/assets/coins/M4_Gold_Pikachu_Coin.png",
  "thumb": "src/assets/coins/M4_Gold_Pikachu_Coin.png",
  "name": "M4 Gold Pikachu",
  "material": "gold"
 },
 {
  "id": "M4_Blue_Greninja_Coin",
  "url": "src/assets/coins/M4_Blue_Greninja_Coin.png",
  "thumb": "src/assets/coins/M4_Blue_Greninja_Coin.png",
  "name": "M4 Blue Greninja",
  "material": "enamel"
 },
 {
  "id": "M4_Orange_Eevee_Coin",
  "url": "src/assets/coins/M4_Orange_Eevee_Coin.png",
  "thumb": "src/assets/coins/M4_Orange_Eevee_Coin.png",
  "name": "M4 Orange Eevee",
  "material": "enamel"
 },
 {
  "id": "WCS2025_Worlds_Pikachu_Coin",
  "url": "src/assets/coins/WCS2025_Worlds_Pikachu_Coin.png",
  "thumb": "src/assets/coins/WCS2025_Worlds_Pikachu_Coin.png",
  "name": "WCS2025 Worlds Pikachu",
  "material": "enamel"
 },
 {
  "id": "CRIETB_Blue_Froakie_Coin",
  "url": "src/assets/coins/CRIETB_Blue_Froakie_Coin.png",
  "thumb": "src/assets/coins/CRIETB_Blue_Froakie_Coin.png",
  "name": "CRIETB Blue Froakie",
  "material": "enamel"
 },
 {
  "id": "CRIBL_Gold_Chikorita_Coin",
  "url": "src/assets/coins/CRIBL_Gold_Chikorita_Coin.png",
  "thumb": "src/assets/coins/CRIBL_Gold_Chikorita_Coin.png",
  "name": "CRIBL Gold Chikorita",
  "material": "gold"
 },
 {
  "id": "MEE_Brown_Eevee_Coin",
  "url": "src/assets/coins/MEE_Brown_Eevee_Coin.png",
  "thumb": "src/assets/coins/MEE_Brown_Eevee_Coin.png",
  "name": "MEE Brown Eevee",
  "material": "enamel"
 },
 {
  "id": "MEZ_Red_Zoroark_Coin",
  "url": "src/assets/coins/MEZ_Red_Zoroark_Coin.png",
  "thumb": "src/assets/coins/MEZ_Red_Zoroark_Coin.png",
  "name": "MEZ Red Zoroark",
  "material": "enamel"
 },
 {
  "id": "MEM_Aqua_Meowscarada_Coin",
  "url": "src/assets/coins/MEM_Aqua_Meowscarada_Coin.png",
  "thumb": "src/assets/coins/MEM_Aqua_Meowscarada_Coin.png",
  "name": "MEM Aqua Meowscarada",
  "material": "enamel"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_SILVER",
  "url": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "name": "Regular-sized, Silver Splotch Holofoil, C/G/M",
  "material": "silver",
  "release": "October 20, 1996",
  "releaseDate": "October 20, 1996",
  "region": "Japan",
  "description": "Regular-sized, Silver Splotch Holofoil, C/G/M Trademark Black-backed Coin featuring Chansey released within the Japanese Starter Deck October 20, 1996; later included in the Gift Pack December 12, 199"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_SILVER_19961020",
  "url": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "name": "Regular-sized, Silver Splotch Holofoil, C/G",
  "material": "silver",
  "release": "October 20, 1996",
  "releaseDate": "October 20, 1996",
  "region": "Japan",
  "description": "Regular-sized, Silver Splotch Holofoil, C/G Trademark Black-backed Coin featuring Chansey released within later shipments of the Japanese Starter Deck October 20, 1996; later included in later shipmen"
 },
 {
  "id": "DATE_JUNE_REGULARSIZED_GOLD",
  "url": "https://archives.bulbagarden.net/media/upload/e/e2/PCG_Gold_Chansey_Coin.png/PCG_Gold_Chansey_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/e/e2/PCG_Gold_Chansey_Coin.png/PCG_Gold_Chansey_Coin.png",
  "name": "Regular-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "June 14, 1997",
  "releaseDate": "June 14, 1997",
  "region": "Japan",
  "description": "Regular-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Chansey released for participating in the Japanese Pokémon Card Game Official Tournament held on June 14-15, 1997 in Chiba"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_BROWN",
  "url": "https://archives.bulbagarden.net/media/upload/d/da/NCG_Brown_Onix_Coin.png/NCG_Brown_Onix_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/d/da/NCG_Brown_Onix_Coin.png/NCG_Brown_Onix_Coin.png",
  "name": "Regular-sized, Brown Circles Holofoil, C/G/M",
  "material": "enamel",
  "release": "April 26, 1998",
  "releaseDate": "April 26, 1998",
  "region": "Japan",
  "description": "Regular-sized, Brown Circles Holofoil, C/G/M Trademark Black-backed Coin featuring Onix released within the Japanese Nivi City Gym April 26, 1998"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_BROWN_19980426",
  "url": "https://archives.bulbagarden.net/media/upload/d/da/NCG_Brown_Onix_Coin.png/NCG_Brown_Onix_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/d/da/NCG_Brown_Onix_Coin.png/NCG_Brown_Onix_Coin.png",
  "name": "Regular-sized, Brown Circles Holofoil, C/G",
  "material": "enamel",
  "release": "April 26, 1998",
  "releaseDate": "April 26, 1998",
  "region": "Japan",
  "description": "Regular-sized, Brown Circles Holofoil, C/G Trademark Black-backed Coin featuring Onix released within later shipments of the Japanese Nivi City Gym April 26, 1998"
 },
 {
  "id": "NIVI_CITY_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/NIVI_CITY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/NIVI_CITY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Confetti Holofoil, C/G/M",
  "material": "enamel",
  "release": "Nivi City Gym",
  "releaseDate": "April 26, 1998",
  "region": "Japan",
  "description": "Regular-sized, Blue Confetti Holofoil, C/G/M Trademark Black-backed Coin featuring Starmie released within the Japanese Hanada City Gym April 26, 1998"
 },
 {
  "id": "HANADA_CITY_REGULARSIZED_BLUE",
  "url": "https://archives.bulbagarden.net/media/upload/f/f0/HCG_Blue_Starmie_Coin.png/HCG_Blue_Starmie_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/f/f0/HCG_Blue_Starmie_Coin.png/HCG_Blue_Starmie_Coin.png",
  "name": "Regular-sized, Blue Confetti Holofoil, C/G",
  "material": "enamel",
  "release": "Hanada City Gym",
  "releaseDate": "April 26, 1998",
  "region": "Japan",
  "description": "Regular-sized, Blue Confetti Holofoil, C/G Trademark Black-backed Coin featuring Starmie released within later shipments of the Japanese Hanada City Gym April 26, 1998"
 },
 {
  "id": "HANADA_CITY_REGULARSIZED_YELLOW",
  "url": "src/assets/coins/bulbapedia/HANADA_CITY_REGULARSIZED_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/HANADA_CITY_REGULARSIZED_YELLOW.jpg",
  "name": "Regular-sized, Yellow Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Hanada City Gym",
  "releaseDate": "July 25, 1998",
  "region": "Japan",
  "description": "Regular-sized, Yellow Cracked Ice Holofoil, C/G/M Trademark Black-backed Coin featuring Raichu released within the Japanese Kuchiba City Gym July 25, 1998"
 },
 {
  "id": "KUCHIBA_CITY_REGULARSIZED_YELLOW",
  "url": "https://archives.bulbagarden.net/media/upload/0/0f/KCG_Yellow_Raichu_Coin.png/KCG_Yellow_Raichu_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/0/0f/KCG_Yellow_Raichu_Coin.png/KCG_Yellow_Raichu_Coin.png",
  "name": "Regular-sized, Yellow Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Kuchiba City Gym",
  "releaseDate": "July 25, 1998",
  "region": "Japan",
  "description": "Regular-sized, Yellow Cracked Ice Holofoil, C/G Trademark Black-backed Coin featuring Raichu released within later shipments of the Japanese Kuchiba City Gym July 25, 1998"
 },
 {
  "id": "KUCHIBA_CITY_REGULARSIZED_GREEN",
  "url": "https://archives.bulbagarden.net/media/upload/8/89/TCG_Green_Gloom_Coin.png/TCG_Green_Gloom_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/8/89/TCG_Green_Gloom_Coin.png/TCG_Green_Gloom_Coin.png",
  "name": "Regular-sized, Green Pixel Holofoil, C/G/M",
  "material": "enamel",
  "release": "Kuchiba City Gym",
  "releaseDate": "July 25, 1998",
  "region": "Japan",
  "description": "Regular-sized, Green Pixel Holofoil, C/G/M Trademark Black-backed Coin featuring Gloom released within the Japanese Tamamushi City Gym July 25, 1998"
 },
 {
  "id": "TAMAMUSHI_CITY_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/TAMAMUSHI_CITY_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/TAMAMUSHI_CITY_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Pixel Holofoil, C/G",
  "material": "enamel",
  "release": "Tamamushi City Gym",
  "releaseDate": "July 25, 1998",
  "region": "Japan",
  "description": "Regular-sized, Green Pixel Holofoil, C/G Trademark Black-backed Coin featuring Gloom released within later shipments of the Japanese Tamamushi City Gym July 25, 1998"
 },
 {
  "id": "TAMAMUSHI_CITY_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/TAMAMUSHI_CITY_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/TAMAMUSHI_CITY_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Tamamushi City Gym",
  "releaseDate": "December 4, 1998",
  "region": "Japan",
  "description": "Regular-sized, Pink Rainbow Holofoil, Black-backed Coin featuring Chansey released as one of two coins available within the Japanese Quick Starter Gift Set December 4, 1998"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 4, 1998",
  "releaseDate": "December 4, 1998",
  "region": "Japan",
  "description": "Regular-sized, Green Rainbow Holofoil, Black-backed Coin featuring Chansey released as one of two coins available within the Japanese Quick Starter Gift Set December 4, 1998"
 },
 {
  "id": "DATE_JANUARY_CARDBOARD_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_CARDBOARD_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_CARDBOARD_SILVER.jpg",
  "name": "Cardboard Silver Coin featuring Chansey",
  "material": "cardboard",
  "release": "January 9, 1999",
  "releaseDate": "January 9, 1999",
  "region": "North America",
  "description": "Cardboard Silver Coin featuring Chansey released within the Base Set Theme Decks Blackout, Brushfire, Overgrowth, and Zap! January 9, 1999; comes in six varieties, three with the original Wizards back"
 },
 {
  "id": "DATE_JANUARY_CARDBOARD_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_CARDBOARD_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_CARDBOARD_COIN.jpg",
  "name": "Cardboard Coin featuring Pikachu awarded",
  "material": "cardboard",
  "release": "January 9, 1999",
  "releaseDate": "January 9, 1999",
  "region": "North America",
  "description": "Cardboard Coin featuring Pikachu awarded to those who participated in Pokémon League during the first League Cycle held starting after the release of Base Set in 1999."
 },
 {
  "id": "TOYS_R_REGULARSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/TOYS_R_REGULARSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/TOYS_R_REGULARSIZED_PURPLE.jpg",
  "name": "Regular-sized, Purple Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Toys R Us League",
  "releaseDate": "February 26, 1999",
  "region": "Japan",
  "description": "Regular-sized, Purple Cracked Ice Holofoil, Black-backed Coin featuring Alakazam released within the Japanese Yamabuki City Gym February 26, 1999"
 },
 {
  "id": "YAMABUKI_CITY_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/YAMABUKI_CITY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/YAMABUKI_CITY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Yamabuki City Gym",
  "releaseDate": "February 26, 1999",
  "region": "Japan",
  "description": "Regular-sized, Red Mirror Holofoil, Black-backed Coin featuring Arcanine released within the Japanese Guren Town Gym February 26, 1999"
 },
 {
  "id": "GUREN_TOWN_CARDBOARD_GREEN",
  "url": "src/assets/coins/bulbapedia/GUREN_TOWN_CARDBOARD_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/GUREN_TOWN_CARDBOARD_GREEN.jpg",
  "name": "Cardboard Green Coin featuring Vileplume",
  "material": "cardboard",
  "release": "Guren Town Gym",
  "releaseDate": "June 16, 1999",
  "region": "Japan",
  "description": "Cardboard Green Coin featuring Vileplume released within the Jungle Theme Decks Power Reserve and Water Blast June 16, 1999; comes in three varieties, one as a Confetti Holofoil, one as a Starlight Ho"
 },
 {
  "id": "DATE_JUNE_REGULARSIZED_BROWN",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_BROWN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_BROWN.jpg",
  "name": "Regular-sized, Brown Pixel Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 25, 1999",
  "releaseDate": "June 25, 1999",
  "region": "Japan",
  "description": "Regular-sized, Brown Pixel Holofoil, Black-backed Coin featuring Doduo available to those who earned 400 points via the Pokémon Card Fan Club GET Point System starting June 25, 1999 with the release o"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 1999",
  "releaseDate": "July 10, 1999",
  "region": "Japan",
  "description": "Regular-sized, Green Mirror Holofoil, Black-backed Coin featuring Exeggutor released as one of two coins available for earning 5 Play Points in events at the Japanese Challenge Road '99 held on June 1"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PURPLE.jpg",
  "name": "Regular-sized, Purple Glitter Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 1999",
  "releaseDate": "July 10, 1999",
  "region": "Japan",
  "description": "Regular-sized, Purple Glitter Holofoil, Black-backed Coin featuring Mewtwo released as one of two coins available for earning 5 Play Points in events at the Japanese Challenge Road '99 held on June 10"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_BROWN",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BROWN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BROWN.jpg",
  "name": "Regular-sized, Brown Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 1999",
  "releaseDate": "July 10, 1999",
  "region": "Japan",
  "description": "Regular-sized, Brown Mirror Holofoil, Black-backed Coin featuring Doduo awarded to those who won three matches in a row in the Doduo Tag side event at Japanese Challenge Road '99 held on June 10-11, 1"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Mirror Holofoil, C/G",
  "material": "enamel",
  "release": "July 30, 1999",
  "releaseDate": "July 30, 1999",
  "region": "Japan",
  "description": "Regular-sized, Pink Mirror Holofoil, C/G Trademark Black-backed Coin featuring Chansey released within the Japanese Intro Pack July 30, 1999"
 },
 {
  "id": "DATE_JULY_CARDBOARD_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_CARDBOARD_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_CARDBOARD_SILVER.jpg",
  "name": "Cardboard Silver Coin featuring Eevee",
  "material": "cardboard",
  "release": "July 30, 1999",
  "releaseDate": "July 30, 1999",
  "region": "Japan",
  "description": "Cardboard Silver Coin featuring Eevee released within the Starter Gift Set in between the release of Jungle and Fossil Autumn 1999; comes in two varieties, Mirror Holofoil and Starlight Holofoil"
 },
 {
  "id": "DATE_OCTOBER_CARDBOARD_BROWN",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_CARDBOARD_BROWN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_CARDBOARD_BROWN.jpg",
  "name": "Cardboard Brown Coin featuring Aerodactyl",
  "material": "cardboard",
  "release": "October 10, 1999",
  "releaseDate": "October 10, 1999",
  "region": "North America",
  "description": "Cardboard Brown Coin featuring Aerodactyl released within the Fossil Theme Decks BodyGuard and LockDown October 10, 1999; comes in four varieties, Light-Brown Mirror Holofoil, Light-Brown Starlight Ho"
 },
 {
  "id": "DATE_FEBRUARY_CARDBOARD_YELLOW",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_CARDBOARD_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_CARDBOARD_YELLOW.jpg",
  "name": "Cardboard Yellow Coin featuring Pikachu",
  "material": "cardboard",
  "release": "February 24, 2000",
  "releaseDate": "February 24, 2000",
  "region": "North America",
  "description": "Cardboard Yellow Coin featuring Pikachu released within the Base Set 2 Theme Decks 2-Player CD-ROM Starter Set, Grass Chopper, Hot Water, Lightning Bug, and Psych Out February 24, 2000; comes in two v"
 },
 {
  "id": "DATE_APRIL_CARDBOARD_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_CARDBOARD_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_CARDBOARD_SILVER.jpg",
  "name": "Cardboard Silver Coin featuring Meowth",
  "material": "cardboard",
  "release": "April 24, 2000",
  "releaseDate": "April 24, 2000",
  "region": "North America",
  "description": "Cardboard Silver Coin featuring Meowth released within the Team Rocket Theme Decks Trouble and Devastation April 24, 2000; comes in two varieties, one as a Cosmos Holofoil and one as a Starlight Holof"
 },
 {
  "id": "DATE_AUGUST_CARDBOARD_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_CARDBOARD_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_CARDBOARD_BLUE.jpg",
  "name": "Cardboard Blue Coin featuring Starmie",
  "material": "cardboard",
  "release": "August 14, 2000",
  "releaseDate": "August 14, 2000",
  "region": "North America",
  "description": "Cardboard Blue Coin featuring Starmie released within the Gym Heroes Theme Decks Brock, Misty, Lt. Surge, and Erika August 14, 2000; comes in two varieties, one as a Cosmos Holofoil and one as a Starl"
 },
 {
  "id": "DATE_AUTUMN_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_AUTUMN_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUTUMN_METAL_COIN.jpg",
  "name": "Metal Coin featuring Pikachu released",
  "material": "metal",
  "release": "Autumn 2000",
  "releaseDate": "Autumn 2000",
  "region": "North America",
  "description": "Metal Coin featuring Pikachu released within the Thunderstorm Gift Set Autumn 2000 in between the release of Gym Heroes and Gym Challenge"
 },
 {
  "id": "THUNDERSTORM_GIFT_CARDBOARD_PURPLE",
  "url": "src/assets/coins/bulbapedia/THUNDERSTORM_GIFT_CARDBOARD_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/THUNDERSTORM_GIFT_CARDBOARD_PURPLE.jpg",
  "name": "Cardboard Purple Cosmos Holofoil Coin",
  "material": "cardboard",
  "release": "Thunderstorm Gift Set",
  "releaseDate": "October 16, 2000",
  "region": "North America",
  "description": "Cardboard Purple Cosmos Holofoil Coin featuring Alakazam released within the Gym Challenge Theme Decks Sabrina, Koga, Blaine, and Giovanni October 16, 2000"
 },
 {
  "id": "GYM_CHALLENGE_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/GYM_CHALLENGE_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/GYM_CHALLENGE_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Gym Challenge Theme Decks",
  "releaseDate": "February 4, 2000",
  "region": "Japan",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Lugia released within the Japanese Neo Starter Deck February 4, 2000"
 },
 {
  "id": "NEO_STARTER_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/NEO_STARTER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/NEO_STARTER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Neo Starter Deck",
  "releaseDate": "July 1, 2000",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Pikachu given to those who traded in a voucher available via CoroCoro at the Pokémon World Challenge tournament held on July 1-2, 2000 "
 },
 {
  "id": "DATE_JULY_REGULARSIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BRONZE.jpg",
  "name": "Regular-sized, Bronze Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 1, 2000",
  "releaseDate": "July 1, 2000",
  "region": "Japan",
  "description": "Regular-sized, Bronze Mirror Holofoil, Black-backed Coin featuring Xatu released as one of two coins given to those who participated in events at the Pokémon World Challenge tournament held on July 1-"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_YELLOW",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_YELLOW.jpg",
  "name": "Regular-sized, Yellow Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 1, 2000",
  "releaseDate": "July 1, 2000",
  "region": "Japan",
  "description": "Regular-sized, Yellow Non Holofoil, Black-backed Coin featuring Pichu released as one of two coins given to those who participated in events at the Pokémon World Challenge tournament held on July 1-2,"
 },
 {
  "id": "DATE_DECEMBER_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_METAL_COIN.jpg",
  "name": "Metal Coin featuring Lugia released",
  "material": "metal",
  "release": "December 16, 2000",
  "releaseDate": "December 16, 2000",
  "region": "North America",
  "description": "Metal Coin featuring Lugia released within each Theme Deck starting from Neo Genesis December 16, 2000 until Aquapolis January 15, 2003; comes in two varieties: one with a 2001 Wizards Copyright and o"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Mirror Holofoil, Pokémon",
  "material": "enamel",
  "release": "April 6, 2001",
  "releaseDate": "April 6, 2001",
  "region": "Japan",
  "description": "Regular-sized, Pink Mirror Holofoil, Pokémon Card Game Black-backed Coin featuring Chansey released within the Japanese Intro Pack Neo April 6, 2001"
 },
 {
  "id": "INTRO_PACK_REGULARSIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/INTRO_PACK_REGULARSIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/INTRO_PACK_REGULARSIZED_ORANGE.jpg",
  "name": "Regular-sized, Orange Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Intro Pack Neo",
  "releaseDate": "July 20, 2001",
  "region": "Japan",
  "description": "Regular-sized, Orange Rainbow Holofoil, Black-backed Coin featuring Ho-Oh given to those who traded in a voucher available via CoroCoro at the Neo Summer Road tournament held on July 20, 2001 in Sappo"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 20, 2001",
  "releaseDate": "July 20, 2001",
  "region": "Japan",
  "description": "Regular-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Lugia released as one of two coins given to those who participated in events at the Neo Summer Road tournament held on July 20, 2001 i"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "July 20, 2001",
  "releaseDate": "July 20, 2001",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring the Pokémon Trading Card Game emblem released as one of two coins given to those who participated in events at the Neo Summer Road tou"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_AQUA",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_AQUA.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_AQUA.jpg",
  "name": "Regular-sized, Aqua Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 7, 2001",
  "releaseDate": "July 7, 2001",
  "region": "Japan",
  "description": "Regular-sized, Aqua Rainbow Holofoil, Black-backed Coin featuring Celebi released within the Japanese Leaders Pokémon Theater Limited Edition July 7, 2001"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, White-backed",
  "material": "enamel",
  "release": "August 19, 2001",
  "releaseDate": "August 19, 2001",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, White-backed Coin featuring the Pokémon VS emblem given to those who participated in events at the Pokémon VS release tournaments held starting August 19, 2001"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Mirror Holofoil, Pokémon",
  "material": "enamel",
  "release": "December 1, 2001",
  "releaseDate": "December 1, 2001",
  "region": "Japan",
  "description": "Regular-sized, Pink Mirror Holofoil, Pokémon Card Game Black-backed Coin featuring Blissey released within the Japanese Pokémon-e Starter Deck December 1, 2001"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Splotch Holofoil, Black-backed",
  "material": "silver",
  "release": "January 3, 2002",
  "releaseDate": "January 3, 2002",
  "region": "Japan",
  "description": "Regular-sized, Silver Splotch Holofoil, Black-backed Coin featuring the Pokémon Center emblem released together with the P Promo Pokémon Center Tokyo given to those who made any purchase at the Tokyo "
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_CARDBOARD",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_CARDBOARD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_CARDBOARD.jpg",
  "name": "Regular-sized, Cardboard Coin featuring Pikachu",
  "material": "cardboard",
  "release": "January 26, 2002",
  "releaseDate": "January 26, 2002",
  "region": "Japan",
  "description": "Regular-sized, Cardboard Coin featuring Pikachu released as an insert within the Japanese McDonald's Pokémon-e Minimum Pack starting January 26, 2002"
 },
 {
  "id": "MCDONALDS_POKMONE_REGULARSIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/MCDONALDS_POKMONE_REGULARSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/MCDONALDS_POKMONE_REGULARSIZED_BRONZE.jpg",
  "name": "Regular-sized, Bronze Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "McDonald's Pokémon-e Minimum Pack",
  "releaseDate": "July 13, 2002",
  "region": "Japan",
  "description": "Regular-sized, Bronze Rainbow Holofoil, Black-backed Coin featuring Latias and Latios released within the Japanese Theater Limited VS Pack July 13, 2002"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 31, 2003",
  "releaseDate": "January 31, 2003",
  "region": "Japan",
  "description": "Regular-sized, Green Mirror Holofoil, Black-backed Coin featuring Treecko released within the Japanese Treecko Constructed Starter Deck January 31, 2003"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_ORANGE.jpg",
  "name": "Regular-sized, Orange Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 31, 2003",
  "releaseDate": "January 31, 2003",
  "region": "Japan",
  "description": "Regular-sized, Orange Mirror Holofoil, Black-backed Coin featuring Torchic released within the Japanese Torchic Constructed Starter Deck January 31, 2003; later released within the Dark Blast Theme De"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 31, 2003",
  "releaseDate": "January 31, 2003",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Mudkip released within the Japanese Mudkip Constructed Starter Deck January 31, 2003"
 },
 {
  "id": "MUDKIP_CONSTRUCTED_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/MUDKIP_CONSTRUCTED_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/MUDKIP_CONSTRUCTED_METAL_COIN.jpg",
  "name": "Metal Coin featuring Rayquaza distributed",
  "material": "metal",
  "release": "Mudkip Constructed Starter Deck",
  "releaseDate": "March 23, 2003",
  "region": "Japan",
  "description": "Metal Coin featuring Rayquaza distributed during Spring Battle Roads 2003 held in Ito-Yokado Tonden, Sapporo on March 23, 2003; Ito-Yokado Kasai, Tokyo on March 23, 2003; Daiei Deyashiki, Amagasaki on"
 },
 {
  "id": "DATE_APRIL_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_METAL_COIN.jpg",
  "name": "Metal Coin featuring Latios given",
  "material": "metal",
  "release": "April 18, 2003",
  "releaseDate": "April 18, 2003",
  "region": "Japan",
  "description": "Metal Coin featuring Latios given to those who traded in a voucher available via CoroCoro at the Spring 2003 Gym Official Tournaments held starting April 18, 2003"
 },
 {
  "id": "SPRING_2003_REGULARSIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/SPRING_2003_REGULARSIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/SPRING_2003_REGULARSIZED_ORANGE.jpg",
  "name": "Regular-sized, Orange Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Spring 2003 Gym Official Tournaments",
  "releaseDate": "June 18, 2003",
  "region": "North America",
  "description": "Regular-sized, Orange Non Holofoil, Black-backed Coin featuring Torchic released within the English Ruby Theme Deck June 18, 2003"
 },
 {
  "id": "DATE_JUNE_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 18, 2003",
  "releaseDate": "June 18, 2003",
  "region": "North America",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Mudkip released within the English Sapphire Theme Deck June 18, 2003"
 },
 {
  "id": "SAPPHIRE_REGULARSIZED_GREEN_MIRROR",
  "url": "src/assets/coins/bulbapedia/SAPPHIRE_REGULARSIZED_GREEN_MIRROR.jpg",
  "thumb": "src/assets/coins/bulbapedia/SAPPHIRE_REGULARSIZED_GREEN_MIRROR.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Sapphire",
  "releaseDate": "June 25, 2003",
  "region": "North America",
  "description": "Regular-sized, Green Mirror Holofoil, Black-backed Coin featuring Flygon released within the Japanese Flygon Constructed Starter Deck June 25, 2003; later released in the English WindBlast Theme Deck "
 },
 {
  "id": "DATE_JUNE_REGULARSIZED_BLUE_20030625",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 25, 2003",
  "releaseDate": "June 25, 2003",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Salamence released within the Japanese Salamence Constructed Starter Deck June 25, 2003; later released in the English FireFang Theme D"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD_20030719",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "July 19, 2003",
  "releaseDate": "July 19, 2003",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Jirachi released within the Japanese Movie Commemoration VS Pack July 19, 2003"
 },
 {
  "id": "MOVIE_COMMEMORATION_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/MOVIE_COMMEMORATION_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/MOVIE_COMMEMORATION_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "Movie Commemoration VS Pack",
  "releaseDate": "September 17, 2003",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Treecko released within the English Caravan Theme Deck September 17, 2003"
 },
 {
  "id": "DATE_SEPTEMBER_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 17, 2003",
  "releaseDate": "September 17, 2003",
  "region": "North America",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Treecko released within the English Oasis Theme Deck September 17, 2003"
 },
 {
  "id": "DATE_SEPTEMBER_REGULARSIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_ORANGE.jpg",
  "name": "Regular-sized, Orange Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 17, 2003",
  "releaseDate": "September 17, 2003",
  "region": "North America",
  "description": "Regular-sized, Orange Non Holofoil, Black-backed Coin featuring the Team Magma emblem released within the Japanese Magma Deck Kit October 24, 2003; later released in the English Team Magma Theme Deck "
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 24, 2003",
  "releaseDate": "October 24, 2003",
  "region": "Japan",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring the Team Aqua emblem released within the Japanese Aqua Deck Kit October 24, 2003; later released in the English Team Aqua Theme Deck March"
 },
 {
  "id": "DATE_OCTOBER_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_METAL_COIN.jpg",
  "name": "Metal Coin featuring Latias given",
  "material": "metal",
  "release": "October 24, 2003",
  "releaseDate": "October 24, 2003",
  "region": "Japan",
  "description": "Metal Coin featuring Latias given to those who traded in a voucher available via CoroCoro at the Autumn 2003 Gym Official Tournaments held starting October 24, 2003"
 },
 {
  "id": "AUTUMN_2003_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/AUTUMN_2003_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/AUTUMN_2003_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "Autumn 2003 Gym Official Tournaments",
  "releaseDate": "November 17, 2003",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Pikachu released within the Japanese Gift Box November 17, 2003; later included as one of three possible coins within the English HS Train"
 },
 {
  "id": "DATE_JANUARY_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_METAL_COIN.jpg",
  "name": "Metal Coin featuring Absol distributed",
  "material": "metal",
  "release": "January 2004",
  "releaseDate": "January 2004",
  "region": "Japan",
  "description": "Metal Coin featuring Absol distributed within the Official Player's Kit rewarded to returning players of the PLAY Promotional EXP Program for season 2 in January 2004 and season 3 in January 2005"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_SILVER_20040116",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "January 16, 2004",
  "releaseDate": "January 16, 2004",
  "region": "Japan",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring Metagross released within the Japanese Metagross Constructed Starter Deck January 16, 2004"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 19, 2004",
  "releaseDate": "March 19, 2004",
  "region": "Japan",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Bulbasaur released within the Japanese Venusaur Random Constructed Starter Deck March 19, 2004; later released within the English LeafGre"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 19, 2004",
  "releaseDate": "March 19, 2004",
  "region": "Japan",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring Charmander released within the Japanese Charizard Random Constructed Starter Deck March 19, 2004; later released within the English FireRed"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 19, 2004",
  "releaseDate": "March 19, 2004",
  "region": "Japan",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Squirtle released within the Japanese Blastoise Random Constructed Starter Deck March 19, 2004"
 },
 {
  "id": "BLASTOISE_RANDOM_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/BLASTOISE_RANDOM_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/BLASTOISE_RANDOM_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Blastoise Random Constructed Starter Deck",
  "releaseDate": "June 2004",
  "region": "North America",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Pikachu released within the English EX Trainer Kit June 2004"
 },
 {
  "id": "DATE_JUNE_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 2004",
  "releaseDate": "June 2004",
  "region": "North America",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Celebi released within the English Forest Guardian Theme Deck June 14, 2004"
 },
 {
  "id": "FOREST_GUARDIAN_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/FOREST_GUARDIAN_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/FOREST_GUARDIAN_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Forest Guardian",
  "releaseDate": "June 14, 2004",
  "region": "North America",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Jirachi released within the English Wish Maker Theme Deck June 14, 2004"
 },
 {
  "id": "WISH_MAKER_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/WISH_MAKER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/WISH_MAKER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Psychedelic Holofoil, Black-backed",
  "material": "silver",
  "release": "Wish Maker",
  "releaseDate": "July 1, 2004",
  "region": "North America",
  "description": "Regular-sized, Silver Psychedelic Holofoil, Black-backed Coin featuring Deoxys released within the Japanese Deoxys Constructed Starter Deck July 1, 2004; later released within the English Starcharge T"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "July 1, 2004",
  "releaseDate": "July 1, 2004",
  "region": "Japan",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Rayquaza released within the Japanese Rayquaza Constructed Starter Deck July 1, 2004; later released within the English Jetstream Th"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_SILVER_20040717",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "July 17, 2004",
  "releaseDate": "July 17, 2004",
  "region": "Japan",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring Munchlax released within the Japanese Movie Commemoration VS Pack: Sky-Splitting Deoxys July 17, 2004"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_SILVER_20041015",
  "url": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "October 15, 2004",
  "releaseDate": "October 15, 2004",
  "region": "Japan",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring the Team Rocket emblem released within the Japanese Black Deck Kit October 15, 2004; later released within the English Jessie Th"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "silver",
  "release": "October 15, 2004",
  "releaseDate": "October 15, 2004",
  "region": "Japan",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring the Team Rocket emblem released within the Japanese Silver Deck Kit October 15, 2004; later released within the English James Theme Deck No"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 18, 2004",
  "releaseDate": "October 18, 2004",
  "region": "North America",
  "description": "Regular-sized, Pink Mirror Holofoil, Black-backed Coin featuring Blissey released within the English EX Battle Stadium October 18, 2004"
 },
 {
  "id": "EX_BATTLE_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/EX_BATTLE_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/EX_BATTLE_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "EX Battle Stadium",
  "releaseDate": "November 19, 2004",
  "region": "North America",
  "description": "Regular-sized, Silver Pixel Holofoil, Black-backed Coin featuring Pikachu released within the Japanese Gift Box Emerald November 19, 2004"
 },
 {
  "id": "GIFT_BOX_REGULARSIZED_LIME",
  "url": "src/assets/coins/bulbapedia/GIFT_BOX_REGULARSIZED_LIME.jpg",
  "thumb": "src/assets/coins/bulbapedia/GIFT_BOX_REGULARSIZED_LIME.jpg",
  "name": "Regular-sized, Lime Green Non Holofoil,",
  "material": "enamel",
  "release": "Gift Box Emerald",
  "releaseDate": "January 16, 2005",
  "region": "Japan",
  "description": "Regular-sized, Lime Green Non Holofoil, Black-backed Coin featuring Energy symbols released within the Japanese Grass Quick Construction Pack January 16, 2005"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 16, 2005",
  "releaseDate": "January 16, 2005",
  "region": "Japan",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring Energy symbols released within the Japanese Fire Quick Construction Pack January 16, 2005"
 },
 {
  "id": "FIRE_QUICK_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/FIRE_QUICK_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/FIRE_QUICK_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Fire Quick Construction Pack",
  "releaseDate": "January 16, 2005",
  "region": "Japan",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Energy symbols released within the Japanese Water Quick Construction Pack January 16, 2005"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_YELLOW",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_YELLOW.jpg",
  "name": "Regular-sized, Yellow Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 16, 2005",
  "releaseDate": "January 16, 2005",
  "region": "Japan",
  "description": "Regular-sized, Yellow Non Holofoil, Black-backed Coin featuring Energy symbols released within the Japanese Lightning Quick Construction Pack January 16, 2005"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_PURPLE.jpg",
  "name": "Regular-sized, Purple Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 16, 2005",
  "releaseDate": "January 16, 2005",
  "region": "Japan",
  "description": "Regular-sized, Purple Non Holofoil, Black-backed Coin featuring Energy symbols released within the Japanese Psychic Quick Construction Pack January 16, 2005"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_ORANGE_20050116",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_ORANGE.jpg",
  "name": "Regular-sized, Orange Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 16, 2005",
  "releaseDate": "January 16, 2005",
  "region": "Japan",
  "description": "Regular-sized, Orange Non Holofoil, Black-backed Coin featuring Energy symbols released within the Japanese Fighting Quick Construction Pack January 16, 2005"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_GREEN_20050305",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 5, 2005",
  "releaseDate": "March 5, 2005",
  "region": "Japan",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Chikorita released within the Japanese Meganium Constructed Starter Deck March 5, 2005"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_RED_20050305",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 5, 2005",
  "releaseDate": "March 5, 2005",
  "region": "Japan",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring Cyndaquil released within the Japanese Typhlosion Constructed Starter Deck March 5, 2005; later released within the English Shadow Blaze Th"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_BLUE_20050305",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 5, 2005",
  "releaseDate": "March 5, 2005",
  "region": "Japan",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Totodile released within the Japanese Feraligatr Constructed Starter Deck March 5, 2005; later released within the English Power Wave Them"
 },
 {
  "id": "DATE_MAY_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_METAL_COIN.jpg",
  "name": "Metal Coin featuring Rayquaza awarded",
  "material": "metal",
  "release": "May 2005",
  "releaseDate": "May 2005",
  "region": "North America",
  "description": "Metal Coin featuring Rayquaza awarded through Player Rewards May 2005; later awarded via subsequent Play! Pokémon events"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 2005",
  "releaseDate": "May 2005",
  "region": "North America",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring the Energy symbols released within the English Hydrobloom Theme Deck May 9, 2005 and as one of four possible coins included in the EX T"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "May 9, 2005",
  "releaseDate": "May 9, 2005",
  "region": "North America",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring the Energy symbols released within the English Wildfire Theme Deck May 9, 2005, as one of four possible coins included in the EX Traine"
 },
 {
  "id": "DATE_JUNE_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 30, 2005",
  "releaseDate": "June 30, 2005",
  "region": "Japan",
  "description": "Regular-sized, Pink Non Holofoil, Black-backed Coin featuring Mew released within the Japanese Mirage's Mew Constructed Starter Deck June 30, 2005"
 },
 {
  "id": "MIRAGES_MEW_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/MIRAGES_MEW_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/MIRAGES_MEW_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "Mirage's Mew Constructed Starter Deck",
  "releaseDate": "July 15, 2005",
  "region": "Japan",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring the Energy symbols released within the Japanese Master Kit July 15, 2005; later released in the EX Power Keepers Blisters February 14, 2"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_BLUE_20050716",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 16, 2005",
  "releaseDate": "July 16, 2005",
  "region": "Japan",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Lucario released within the Japanese Movie Commemoration VS Pack: Aura's Lucario July 16, 2005"
 },
 {
  "id": "DATE_AUGUST_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_METAL_COIN.jpg",
  "name": "Metal Coin featuring Charizard awarded",
  "material": "metal",
  "release": "August 19, 2005",
  "releaseDate": "August 19, 2005",
  "region": "North America",
  "description": "Metal Coin featuring Charizard awarded at the 2005 World Championships August 19-21, 2005"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_ORANGE.jpg",
  "name": "Regular-sized, Orange Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "August 19, 2005",
  "releaseDate": "August 19, 2005",
  "region": "North America",
  "description": "Regular-sized, Orange Mirror Holofoil, Black-backed Coin featuring the Energy symbols released within the English Golden Sky Theme Deck August 22, 2005"
 },
 {
  "id": "GOLDEN_SKY_REGULARSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/GOLDEN_SKY_REGULARSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/GOLDEN_SKY_REGULARSIZED_PURPLE.jpg",
  "name": "Regular-sized, Purple Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "Golden Sky",
  "releaseDate": "August 22, 2005",
  "region": "North America",
  "description": "Regular-sized, Purple Mirror Holofoil, Black-backed Coin featuring the Energy symbols released within the English Silvery Ocean Theme Deck August 22, 2005"
 },
 {
  "id": "SILVERY_OCEAN_REGULARSIZED_LIME",
  "url": "src/assets/coins/bulbapedia/SILVERY_OCEAN_REGULARSIZED_LIME.jpg",
  "thumb": "src/assets/coins/bulbapedia/SILVERY_OCEAN_REGULARSIZED_LIME.jpg",
  "name": "Regular-sized, Lime Green Mirror Holofoil,",
  "material": "enamel",
  "release": "Silvery Ocean",
  "releaseDate": "October 31, 2005",
  "region": "North America",
  "description": "Regular-sized, Lime Green Mirror Holofoil, Black-backed Coin featuring the Energy symbols released within the English Breakthrough Theme Deck October 31, 2005"
 },
 {
  "id": "BREAKTHROUGH_REGULARSIZED_RED_MIRROR",
  "url": "src/assets/coins/bulbapedia/BREAKTHROUGH_REGULARSIZED_RED_MIRROR.jpg",
  "thumb": "src/assets/coins/bulbapedia/BREAKTHROUGH_REGULARSIZED_RED_MIRROR.jpg",
  "name": "Regular-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Breakthrough",
  "releaseDate": "October 31, 2005",
  "region": "North America",
  "description": "Regular-sized, Red Mirror Holofoil, Black-backed Coin featuring the Energy symbols released within the English Steeplechase Theme Deck October 31, 2005"
 },
 {
  "id": "STEEPLECHASE_REGULARSIZED_SILVER_NON",
  "url": "src/assets/coins/bulbapedia/STEEPLECHASE_REGULARSIZED_SILVER_NON.jpg",
  "thumb": "src/assets/coins/bulbapedia/STEEPLECHASE_REGULARSIZED_SILVER_NON.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "Steeplechase",
  "releaseDate": "November 2005",
  "region": "North America",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring Pikachu released in the English EX Unseen Forces Blisters November 2005; later released as one of three possible coins within the Englis"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BRONZE.jpg",
  "name": "Regular-sized, Bronze Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 16, 2005",
  "releaseDate": "November 16, 2005",
  "region": "Japan",
  "description": "Regular-sized, Bronze Non Holofoil, Black-backed Coin featuring Pikachu released within the Japanese Gift Box Mew • Lucario November 16, 2005"
 },
 {
  "id": "GIFT_BOX_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/GIFT_BOX_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/GIFT_BOX_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "Gift Box Mew • Lucario",
  "releaseDate": "February 13, 2006",
  "region": "Japan",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Mew released within the English Groundbreaker Theme Deck February 13, 2006"
 },
 {
  "id": "GROUNDBREAKER_REGULARSIZED_PINK_MIRROR",
  "url": "src/assets/coins/bulbapedia/GROUNDBREAKER_REGULARSIZED_PINK_MIRROR.jpg",
  "thumb": "src/assets/coins/bulbapedia/GROUNDBREAKER_REGULARSIZED_PINK_MIRROR.jpg",
  "name": "Regular-sized, Pink Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Groundbreaker",
  "releaseDate": "February 13, 2006",
  "region": "North America",
  "description": "Regular-sized, Pink Mirror Holofoil, Black-backed Coin featuring Mew released within the English Shadowquake Theme Deck February 13, 2006"
 },
 {
  "id": "SHADOWQUAKE_REGULARSIZED_RED_NON",
  "url": "src/assets/coins/bulbapedia/SHADOWQUAKE_REGULARSIZED_RED_NON.jpg",
  "thumb": "src/assets/coins/bulbapedia/SHADOWQUAKE_REGULARSIZED_RED_NON.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Shadowquake",
  "releaseDate": "March 3, 2006",
  "region": "North America",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring Groudon released within the Japanese Earth's Groudon ex Constructed Starter Deck March 3, 2006 exclusively at Pokémon Centers, with a gener"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_BLUE_20060303",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 3, 2006",
  "releaseDate": "March 3, 2006",
  "region": "Japan",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Kyogre released within the Japanese Ocean's Kyogre ex Constructed Starter Deck March 3, 2006 exclusively at Pokémon Centers, with a genera"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_GOLD_20060503",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "May 3, 2006",
  "releaseDate": "May 3, 2006",
  "region": "North America",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Flygon released within the English FireMist Theme Deck May 3, 2006"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "May 3, 2006",
  "releaseDate": "May 3, 2006",
  "region": "North America",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring Rayquaza released within the English FloodRush Theme Deck May 3, 2006"
 },
 {
  "id": "FLOODRUSH_REGULARSIZED_GOLD_BAR",
  "url": "src/assets/coins/bulbapedia/FLOODRUSH_REGULARSIZED_GOLD_BAR.jpg",
  "thumb": "src/assets/coins/bulbapedia/FLOODRUSH_REGULARSIZED_GOLD_BAR.jpg",
  "name": "Regular-sized, Gold Bar Holofoil, Black-backed",
  "material": "gold",
  "release": "FloodRush",
  "releaseDate": "June 29, 2006",
  "region": "North America",
  "description": "Regular-sized, Gold Bar Holofoil, Black-backed Coin featuring Tyranitar released within the Japanese Shockwave! Tyranitar ex Constructed Standard Deck June 29, 2006; later included in the English EX D"
 },
 {
  "id": "DATE_JUNE_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Smoke Holofoil, Black-backed",
  "material": "silver",
  "release": "June 29, 2006",
  "releaseDate": "June 29, 2006",
  "region": "Japan",
  "description": "Regular-sized, Silver Smoke Holofoil, Black-backed Coin featuring Gardevoir released within the Japanese Imprison! Gardevoir ex Constructed Standard Deck June 29, 2006; later included in the English E"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_BLUE_20060715",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 15, 2006",
  "releaseDate": "July 15, 2006",
  "region": "Japan",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Manaphy released within the Japanese Movie Commemoration VS Pack: Sea's Manaphy July 15, 2006"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "August 30, 2006",
  "releaseDate": "August 30, 2006",
  "region": "North America",
  "description": "Regular-sized, Silver Mirror Holofoil, Black-backed Coin featuring Metagross released within the English EX Crystal Guardians Blisters August 30, 2006"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BRONZE.jpg",
  "name": "Regular-sized, Bronze Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 30, 2006",
  "releaseDate": "August 30, 2006",
  "region": "North America",
  "description": "Regular-sized, Bronze Mirror Holofoil, Black-backed Coin featuring Pikachu released within the English EX Crystal Guardians Blisters August 30, 2006"
 },
 {
  "id": "EX_CRYSTAL_REGULARSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/EX_CRYSTAL_REGULARSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/EX_CRYSTAL_REGULARSIZED_PURPLE.jpg",
  "name": "Regular-sized, Purple Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "EX Crystal Guardians Blisters",
  "releaseDate": "February 14, 2007",
  "region": "North America",
  "description": "Regular-sized, Purple Non Holofoil, Black-backed Coin featuring Gardevoir released within the English Mind Game Theme Deck February 14, 2007"
 },
 {
  "id": "MIND_GAME_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/MIND_GAME_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/MIND_GAME_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "Mind Game",
  "releaseDate": "March 2007",
  "region": "North America",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring the Energy symbols released within the EX Value Set March 2007 and the Epic Collection Decks May 9, 2007"
 },
 {
  "id": "EX_VALUE_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/EX_VALUE_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/EX_VALUE_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "EX Value Set",
  "releaseDate": "October 27, 2006",
  "region": "Japan",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the Japanese Entry Pack October 27, 2006"
 },
 {
  "id": "ENTRY_PACK_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/ENTRY_PACK_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/ENTRY_PACK_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Entry Pack",
  "releaseDate": "November 30, 2006",
  "region": "Japan",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Palkia released within the Japanese Random Construction Starter Deck November 30, 2006; later released within the English Diamon"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Mirror Cracked Ice",
  "material": "silver",
  "release": "November 30, 2006",
  "releaseDate": "November 30, 2006",
  "region": "Japan",
  "description": "Regular-sized, Silver Mirror Cracked Ice Holofoil, Black-backed Coin featuring right-facing Dialga released within the Japanese Random Construction Starter Deck November 30, 2006"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "November 30, 2006",
  "releaseDate": "November 30, 2006",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Dialga awarded to those who won Japanese Battle Road tournaments starting after November 30, 2006"
 },
 {
  "id": "SPACETIME_CREATION_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/SPACETIME_CREATION_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/SPACETIME_CREATION_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Crosshatch Holofoil, Black-backed",
  "material": "silver",
  "release": "Space-Time Creation Battle Roads",
  "releaseDate": "March 2, 2007",
  "region": "Japan",
  "description": "Regular-sized, Silver Crosshatch Holofoil, Black-backed Coin featuring Shieldon released within the Japanese Bastiodon the Defender March 2, 2007; later included in the English Armor Fortress Theme De"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_BROWN",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_BROWN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_BROWN.jpg",
  "name": "Regular-sized, Brown Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 2, 2007",
  "releaseDate": "March 2, 2007",
  "region": "Japan",
  "description": "Regular-sized, Brown Mirror Holofoil, Black-backed Coin featuring Cranidos released within the Japanese Rampardos the Attacker March 2, 2007; later included in the English Skull Charge Theme Deck Augu"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "March 2, 2007",
  "releaseDate": "March 2, 2007",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Palkia awarded to those who won Japanese Battle Road tournaments starting after March 2, 2007"
 },
 {
  "id": "SECRET_OF_REGULARSIZED_PASTEL",
  "url": "src/assets/coins/bulbapedia/SECRET_OF_REGULARSIZED_PASTEL.jpg",
  "thumb": "src/assets/coins/bulbapedia/SECRET_OF_REGULARSIZED_PASTEL.jpg",
  "name": "Regular-sized, Pastel Green Non Holofoil,",
  "material": "enamel",
  "release": "Secret of the Lakes Battle Roads",
  "releaseDate": "May 23, 2007",
  "region": "North America",
  "description": "Regular-sized, Pastel Green Non Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the English Terra Firma Theme Deck May 23, 2007"
 },
 {
  "id": "TERRA_FIRMA_REGULARSIZED_PASTEL",
  "url": "src/assets/coins/bulbapedia/TERRA_FIRMA_REGULARSIZED_PASTEL.jpg",
  "thumb": "src/assets/coins/bulbapedia/TERRA_FIRMA_REGULARSIZED_PASTEL.jpg",
  "name": "Regular-sized, Pastel Red Non Holofoil,",
  "material": "enamel",
  "release": "Terra Firma",
  "releaseDate": "May 23, 2007",
  "region": "North America",
  "description": "Regular-sized, Pastel Red Non Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the English Inferno Zone Theme Deck May 23, 2007"
 },
 {
  "id": "INFERNO_ZONE_REGULARSIZED_PASTEL",
  "url": "src/assets/coins/bulbapedia/INFERNO_ZONE_REGULARSIZED_PASTEL.jpg",
  "thumb": "src/assets/coins/bulbapedia/INFERNO_ZONE_REGULARSIZED_PASTEL.jpg",
  "name": "Regular-sized, Pastel Blue Non Holofoil,",
  "material": "enamel",
  "release": "Inferno Zone",
  "releaseDate": "May 23, 2007",
  "region": "North America",
  "description": "Regular-sized, Pastel Blue Non Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the English Royal Frost Theme Deck May 23, 2007"
 },
 {
  "id": "ROYAL_FROST_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/ROYAL_FROST_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/ROYAL_FROST_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Royal Frost",
  "releaseDate": "May 23, 2007",
  "region": "North America",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring left-facing Dialga released within the English Diamond & Pearl Blister Packs May 23, 2007"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER_20070523",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Cracked Ice",
  "material": "silver",
  "release": "May 23, 2007",
  "releaseDate": "May 23, 2007",
  "region": "North America",
  "description": "Regular-sized, Silver Rainbow Cracked Ice Holofoil, Black-backed Coin featuring right-facing Dialga released within the English Diamond & Pearl Blister Packs May 23, 2007; later awarded to those who p"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER_20070523_2",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "May 23, 2007",
  "releaseDate": "May 23, 2007",
  "region": "North America",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Palkia released within the English Diamond & Pearl Blister Packs May 23, 2007"
 },
 {
  "id": "DIAMOND__REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DIAMOND__REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DIAMOND__REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "Diamond & Pearl Blister Packs",
  "releaseDate": "June 2007",
  "region": "North America",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Energy symbols released within the English Special Edition Blisters June 2007"
 },
 {
  "id": "SPECIAL_EDITION_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/SPECIAL_EDITION_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/SPECIAL_EDITION_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Special Edition Blisters",
  "releaseDate": "July 5, 2007",
  "region": "Japan",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Dialga released within the Japanese Dialga LV.X Constructed Standard Deck July 5, 2007; later included in the English Eternal Time Theme D"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_PINK_20070705",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 5, 2007",
  "releaseDate": "July 5, 2007",
  "region": "Japan",
  "description": "Regular-sized, Pink Non Holofoil, Black-backed Coin featuring Palkia released within the Japanese Palkia LV.X Constructed Standard Deck July 5, 2007; later included in the English Infinite Space Theme"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD_20070705",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "July 5, 2007",
  "releaseDate": "July 5, 2007",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Lucario awarded to those who won Japanese Battle Road tournaments starting after July 5, 2007"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "August 22, 2007",
  "releaseDate": "August 22, 2007",
  "region": "North America",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Shieldon released within the English Mysterious Treasures Blister Packs August 22, 2007"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_BLUE_20070822",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 22, 2007",
  "releaseDate": "August 22, 2007",
  "region": "North America",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Cranidos released within the English Mysterious Treasures Blister Packs August 22, 2007"
 },
 {
  "id": "DATE_SEPTEMBER_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "September 2007",
  "releaseDate": "September 2007",
  "region": "North America",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Manaphy released within the English Diamond & Pearl Trainer Kit September 2007"
 },
 {
  "id": "DIAMOND__REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DIAMOND__REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DIAMOND__REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Bubble Ice Holofoil,",
  "material": "silver",
  "release": "Diamond & Pearl Trainer Kit",
  "releaseDate": "October 26, 2007",
  "region": "Japan",
  "description": "Regular-sized, Silver Bubble Ice Holofoil, Black-backed Coin featuring Magmortar and Electivire released within the Japanese Magmortar vs Electivire Deck Kit October 26, 2007"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "October 26, 2007",
  "releaseDate": "October 26, 2007",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Magmortar and Electivire awarded to those who won Japanese Battle Road tournaments starting after October 26, 2007"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_GOLD_20071107",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "November 7, 2007",
  "releaseDate": "November 7, 2007",
  "region": "North America",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Munchlax released within the English Powerhouse Theme Deck November 7, 2007"
 },
 {
  "id": "POWERHOUSE_REGULARSIZED_SILVER_RAINBOW",
  "url": "src/assets/coins/bulbapedia/POWERHOUSE_REGULARSIZED_SILVER_RAINBOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/POWERHOUSE_REGULARSIZED_SILVER_RAINBOW.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Powerhouse",
  "releaseDate": "November 7, 2007",
  "region": "North America",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Munchlax released within the English Lavaflow Theme Deck November 7, 2007"
 },
 {
  "id": "LAVAFLOW_REGULARSIZED_RED_CONFETTI",
  "url": "src/assets/coins/bulbapedia/LAVAFLOW_REGULARSIZED_RED_CONFETTI.jpg",
  "thumb": "src/assets/coins/bulbapedia/LAVAFLOW_REGULARSIZED_RED_CONFETTI.jpg",
  "name": "Regular-sized, Red Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "Lavaflow",
  "releaseDate": "November 7, 2007",
  "region": "North America",
  "description": "Regular-sized, Red Confetti Holofoil, Black-backed Coin featuring Magmortar and Electivire released within the English Secret Wonders Blister Packs November 7, 2007"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_GOLD_20071107_2",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Confetti Holofoil, Black-backed",
  "material": "gold",
  "release": "November 7, 2007",
  "releaseDate": "November 7, 2007",
  "region": "North America",
  "description": "Regular-sized, Gold Confetti Holofoil, Black-backed Coin featuring Magmortar and Electivire released within the English Secret Wonders Blister Packs November 7, 2007"
 },
 {
  "id": "SECRET_WONDERS_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/SECRET_WONDERS_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/SECRET_WONDERS_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "Secret Wonders Blister Packs",
  "releaseDate": "November 30, 2007",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the Japanese Entry Pack '08 November 30, 2007"
 },
 {
  "id": "ENTRY_PACK_REGULARSIZED_SILVER_20080213",
  "url": "src/assets/coins/bulbapedia/ENTRY_PACK_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/ENTRY_PACK_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "Entry Pack '08",
  "releaseDate": "February 13, 2008",
  "region": "North America",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Dialga released within the English Great Encounters Blister Packs February 13, 2008"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "February 13, 2008",
  "releaseDate": "February 13, 2008",
  "region": "North America",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Palkia released within the English Great Encounters Blister Packs February 13, 2008"
 },
 {
  "id": "GREAT_ENCOUNTERS_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/GREAT_ENCOUNTERS_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/GREAT_ENCOUNTERS_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Smoke Holofoil, Black-backed",
  "material": "silver",
  "release": "Great Encounters Blister Packs",
  "releaseDate": "March 14, 2008",
  "region": "Japan",
  "description": "Regular-sized, Silver Smoke Holofoil, Black-backed Coin featuring Gliscor and Mewtwo released within the Japanese Heatran vs Regigigas Deck Kit March 14, 2008"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_GOLD_20080314",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "March 14, 2008",
  "releaseDate": "March 14, 2008",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Mewtwo and Gliscor awarded to those who won Japanese Battle Road tournaments starting after March 14, 2008"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_GOLD_20080521",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "May 21, 2008",
  "releaseDate": "May 21, 2008",
  "region": "North America",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the English Polar Frost Theme Deck May 21, 2008"
 },
 {
  "id": "POLAR_FROST_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/POLAR_FROST_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/POLAR_FROST_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "Polar Frost",
  "releaseDate": "May 21, 2008",
  "region": "North America",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the English Forest Force Theme Deck May 21, 2008"
 },
 {
  "id": "FOREST_FORCE_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/FOREST_FORCE_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/FOREST_FORCE_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Forest Force",
  "releaseDate": "May 21, 2008",
  "region": "North America",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Lucario released within the English Majestic Dawn Blister Packs May 21, 2008"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD_20080710",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "July 10, 2008",
  "releaseDate": "July 10, 2008",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Kyogre awarded to those who won Japanese Battle Road tournaments starting after July 10, 2008"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GREEN_20080710",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 2008",
  "releaseDate": "July 10, 2008",
  "region": "Japan",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Shaymin released within the Japanese Giratina vs Dialga Deck Kit July 10, 2008; later included in the English Flourish Theme Deck Februar"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_SILVER_200808",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Speckle Holofoil, Black-backed",
  "material": "silver",
  "release": "August 2008",
  "releaseDate": "August 2008",
  "region": "Japan",
  "description": "Regular-sized, Silver Speckle Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup awarded upon reaching the Second Stage of the Summer Break Competition Campaign 2008 held in August 20"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_SILVER_20080820",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "August 20, 2008",
  "releaseDate": "August 20, 2008",
  "region": "North America",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Gliscor and Mewtwo released within the English Bombardment Theme Deck August 20, 2008"
 },
 {
  "id": "BOMBARDMENT_REGULARSIZED_BROWN_NON",
  "url": "src/assets/coins/bulbapedia/BOMBARDMENT_REGULARSIZED_BROWN_NON.jpg",
  "thumb": "src/assets/coins/bulbapedia/BOMBARDMENT_REGULARSIZED_BROWN_NON.jpg",
  "name": "Regular-sized, Brown Non Holofoil, Black-backed",
  "material": "metal",
  "release": "Bombardment",
  "releaseDate": "August 20, 2008",
  "region": "North America",
  "description": "Regular-sized, Brown Non Holofoil, Black-backed Coin featuring Gliscor and Mewtwo released within the English Metal Surge Theme Deck August 20, 2008"
 },
 {
  "id": "METAL_SURGE_REGULARSIZED_EMERALD",
  "url": "src/assets/coins/bulbapedia/METAL_SURGE_REGULARSIZED_EMERALD.jpg",
  "thumb": "src/assets/coins/bulbapedia/METAL_SURGE_REGULARSIZED_EMERALD.jpg",
  "name": "Regular-sized, Emerald Green Non Holofoil,",
  "material": "enamel",
  "release": "Metal Surge",
  "releaseDate": "August 20, 2008",
  "region": "North America",
  "description": "Regular-sized, Emerald Green Non Holofoil, Black-backed Coin featuring Rayquaza released within the English Legends Awakened Blisters August 20, 2008"
 },
 {
  "id": "LEGENDS_AWAKENED_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/LEGENDS_AWAKENED_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/LEGENDS_AWAKENED_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Legends Awakened Blisters",
  "releaseDate": "October 10, 2008",
  "region": "North America",
  "description": "Regular-sized, Red Rainbow Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the Japanese Entry Pack DPt October 10, 2008"
 },
 {
  "id": "ENTRY_PACK_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/ENTRY_PACK_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/ENTRY_PACK_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "Entry Pack DPt",
  "releaseDate": "October 10, 2008",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Groudon awarded to those who won Japanese Battle Road tournaments starting after October 10, 2008"
 },
 {
  "id": "GALACTICS_CONQUEST_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/GALACTICS_CONQUEST_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/GALACTICS_CONQUEST_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Galactic's Conquest Battle Roads",
  "releaseDate": "November 5, 2008",
  "region": "North America",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Energy symbols released within the English Raging Sea Theme Deck November 5, 2008"
 },
 {
  "id": "RAGING_SEA_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/RAGING_SEA_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/RAGING_SEA_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Raging Sea",
  "releaseDate": "November 5, 2008",
  "region": "North America",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Energy symbols released within the English Dark Rampage Theme Deck November 5, 2008"
 },
 {
  "id": "DARK_RAMPAGE_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DARK_RAMPAGE_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DARK_RAMPAGE_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "Dark Rampage",
  "releaseDate": "December 26, 2008",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Jirachi awarded to those who won Japanese Battle Road tournaments starting after December 26, 2008"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "December 26, 2008",
  "releaseDate": "December 26, 2008",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Infernape and Gallade released within the Japanese Infernape vs Gallade SP Deck Kit December 26, 2008 ; later included in the English "
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_SILVER_20090211",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "February 11, 2009",
  "releaseDate": "February 11, 2009",
  "region": "North America",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Shaymin released within the English Rebellion Theme Deck February 11, 2009"
 },
 {
  "id": "REBELLION_REGULARSIZED_GOLD_NON",
  "url": "src/assets/coins/bulbapedia/REBELLION_REGULARSIZED_GOLD_NON.jpg",
  "thumb": "src/assets/coins/bulbapedia/REBELLION_REGULARSIZED_GOLD_NON.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "Rebellion",
  "releaseDate": "March 6, 2009",
  "region": "North America",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Rayquaza awarded to those who won Japanese Battle Road tournaments starting after March 6, 2009"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "March 6, 2009",
  "releaseDate": "March 6, 2009",
  "region": "Japan",
  "description": "Regular-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Garchomp and Charizard released within the Japanese Garchomp vs Charizard SP Deck Kit March 6, 2009; later included in the English"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Splotch Holofoil, Black-backed",
  "material": "silver",
  "release": "April 4, 2009",
  "releaseDate": "April 4, 2009",
  "region": "Japan",
  "description": "Regular-sized, Silver Splotch Holofoil, Black-backed Coin featuring Charmander released during the fourth distribution of commemorative promotional cards during the Pokémon 10th Anniversary celebratio"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER_20090520",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Confetti Holofoil, Black-backed",
  "material": "silver",
  "release": "May 20, 2009",
  "releaseDate": "May 20, 2009",
  "region": "North America",
  "description": "Regular-sized, Silver Confetti Holofoil, Black-backed Coin featuring Infernape and Gallade released within the English Drill Point Theme Deck May 20, 2009"
 },
 {
  "id": "DRILL_POINT_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DRILL_POINT_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DRILL_POINT_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Drill Point",
  "releaseDate": "July 8, 2009",
  "region": "North America",
  "description": "Regular-sized, Green Mirror Holofoil, Black-backed Coin featuring Arceus released within the Japanese Arceus LV.X Deck: Grass & Fire Theme Deck July 8, 2009"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_SILVER_20090708",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Smoke Holofoil, Black-backed",
  "material": "silver",
  "release": "July 8, 2009",
  "releaseDate": "July 8, 2009",
  "region": "Japan",
  "description": "Regular-sized, Silver Smoke Holofoil, Black-backed Coin featuring Arceus released within the Japanese Arceus LV.X Deck: Lightning & Psychic Theme Deck July 8, 2009"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD_20090708",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Glitter Holofoil, ®",
  "material": "gold",
  "release": "July 8, 2009",
  "releaseDate": "July 8, 2009",
  "region": "Japan",
  "description": "Regular-sized, Gold Glitter Holofoil, ® Trademark Black-backed Coin featuring Arceus awarded to those who won Japanese Battle Road tournaments starting after July 8, 2009"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD_20090711",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Glitter Holofoil, Black-backed",
  "material": "gold",
  "release": "July 11, 2009",
  "releaseDate": "July 11, 2009",
  "region": "Japan",
  "description": "Regular-sized, Gold Glitter Holofoil, Black-backed Coin featuring Arceus awarded to those who participated in the Japanese Battle Tour 09 starting July 11, 2009"
 },
 {
  "id": "POKMON_BATTLE_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/POKMON_BATTLE_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/POKMON_BATTLE_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Confetti Holofoil, Black-backed",
  "material": "silver",
  "release": "Pokémon Battle Tour 09",
  "releaseDate": "August 19, 2009",
  "region": "Japan",
  "description": "Regular-sized, Silver Confetti Holofoil, Black-backed Coin featuring Garchomp and Charizard released within the English Overflow Theme Deck August 19, 2009"
 },
 {
  "id": "OVERFLOW_REGULARSIZED_SILVER_SPLOTCH",
  "url": "src/assets/coins/bulbapedia/OVERFLOW_REGULARSIZED_SILVER_SPLOTCH.jpg",
  "thumb": "src/assets/coins/bulbapedia/OVERFLOW_REGULARSIZED_SILVER_SPLOTCH.jpg",
  "name": "Regular-sized, Silver Splotch Holofoil, Black-backed",
  "material": "silver",
  "release": "Overflow",
  "releaseDate": "October 9, 2009",
  "region": "North America",
  "description": "Regular-sized, Silver Splotch Holofoil, Black-backed Coin featuring Energy symbols released within the Japanese Official Damage Counter Case October 9, 2009"
 },
 {
  "id": "OFFICIAL_DAMAGE_REGULARSIZED_CRIMSON",
  "url": "src/assets/coins/bulbapedia/OFFICIAL_DAMAGE_REGULARSIZED_CRIMSON.jpg",
  "thumb": "src/assets/coins/bulbapedia/OFFICIAL_DAMAGE_REGULARSIZED_CRIMSON.jpg",
  "name": "Regular-sized, Crimson Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Official Damage Counter Case",
  "releaseDate": "November 4, 2009",
  "region": "North America",
  "description": "Regular-sized, Crimson Mirror Holofoil, Black-backed Coin featuring Arceus released within the English Flamemaster Theme Deck November 4, 2009"
 },
 {
  "id": "FLAMEMASTER_REGULARSIZED_GOLD_MIRROR",
  "url": "src/assets/coins/bulbapedia/FLAMEMASTER_REGULARSIZED_GOLD_MIRROR.jpg",
  "thumb": "src/assets/coins/bulbapedia/FLAMEMASTER_REGULARSIZED_GOLD_MIRROR.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Flamemaster",
  "releaseDate": "November 4, 2009",
  "region": "North America",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Arceus released within the English Stormshaper Theme Deck November 4, 2009"
 },
 {
  "id": "STORMSHAPER_REGULARSIZED_SILVER_GLITTER",
  "url": "src/assets/coins/bulbapedia/STORMSHAPER_REGULARSIZED_SILVER_GLITTER.jpg",
  "thumb": "src/assets/coins/bulbapedia/STORMSHAPER_REGULARSIZED_SILVER_GLITTER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "Stormshaper",
  "releaseDate": "November 4, 2009",
  "region": "North America",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Arceus released within the English Arceus Three Pack Blisters November 4, 2009"
 },
 {
  "id": "ARCEUS_THREE_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/ARCEUS_THREE_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/ARCEUS_THREE_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Tinsel Holofoil, Black-backed",
  "material": "silver",
  "release": "Arceus Three Pack Blisters",
  "releaseDate": "November 20, 2009",
  "region": "Japan",
  "description": "Regular-sized, Silver Tinsel Holofoil, Black-backed Coin featuring Jirachi and Shaymin released within the English Unleashed Three-Pack Blisters May 12, 2010"
 },
 {
  "id": "LEAFEON_VS_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/LEAFEON_VS_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/LEAFEON_VS_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Leafeon vs Metagross Expert Deck",
  "releaseDate": "February 10, 2010",
  "region": "North America",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Chikorita released within the English Growth Clash Theme Deck February 10, 2010"
 },
 {
  "id": "GROWTH_CLASH_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/GROWTH_CLASH_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/GROWTH_CLASH_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Growth Clash",
  "releaseDate": "February 10, 2010",
  "region": "North America",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring Cyndaquil released within the English Ember Spark Theme Deck February 10, 2010"
 },
 {
  "id": "EMBER_SPARK_REGULARSIZED_TEAL",
  "url": "src/assets/coins/bulbapedia/EMBER_SPARK_REGULARSIZED_TEAL.jpg",
  "thumb": "src/assets/coins/bulbapedia/EMBER_SPARK_REGULARSIZED_TEAL.jpg",
  "name": "Regular-sized, Teal Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Ember Spark",
  "releaseDate": "February 10, 2010",
  "region": "North America",
  "description": "Regular-sized, Teal Non Holofoil, Black-backed Coin featuring Totodile released within the English Mind Flood Theme Deck February 10, 2010"
 },
 {
  "id": "MIND_FLOOD_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/MIND_FLOOD_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/MIND_FLOOD_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Mind Flood",
  "releaseDate": "February 11, 2010",
  "region": "North America",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Steelix released within the Japanese Steelix Constructed Standard Deck February 11, 2010; later included within the English Stee"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "February 11, 2010",
  "releaseDate": "February 11, 2010",
  "region": "Japan",
  "description": "Regular-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Tyranitar released within the Japanese Tyranitar Constructed Standard Deck February 11, 2010; later included within the English Ch"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER_201005",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Speckle Holofoil, Black-backed",
  "material": "silver",
  "release": "May 2010",
  "releaseDate": "May 2010",
  "region": "North America",
  "description": "Regular-sized, Silver Speckle Holofoil, Black-backed Coin featuring Pikachu released as one of three possible coins within the English HS Trainer Kit May 2010"
 },
 {
  "id": "HS_TRAINER_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/HS_TRAINER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/HS_TRAINER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "HS Trainer Kit",
  "releaseDate": "May 13, 2010",
  "region": "South Korea",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the Korean Start of an Adventure Blister Packs May 13, 2010"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 13, 2010",
  "releaseDate": "May 13, 2010",
  "region": "South Korea",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the Korean Start of an Adventure Blister Packs May 13, 2010"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_BLUE_20100513",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 13, 2010",
  "releaseDate": "May 13, 2010",
  "region": "South Korea",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Turtwig, Chimchar, and Piplup released within the Korean Start of an Adventure Blister Packs May 13, 2010"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_GOLD_20100818",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "August 18, 2010",
  "releaseDate": "August 18, 2010",
  "region": "North America",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Cyndaquil released within the English Daybreak Theme Deck August 18, 2010"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_SILVER_20100818",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "August 18, 2010",
  "releaseDate": "August 18, 2010",
  "region": "North America",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring Chikorita released within the English Nightfall Theme Deck August 18, 2010"
 },
 {
  "id": "NIGHTFALL_REGULARSIZED_BLUE_NON",
  "url": "src/assets/coins/bulbapedia/NIGHTFALL_REGULARSIZED_BLUE_NON.jpg",
  "thumb": "src/assets/coins/bulbapedia/NIGHTFALL_REGULARSIZED_BLUE_NON.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Nightfall",
  "releaseDate": "August 18, 2010",
  "region": "North America",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Totodile released within the English Undaunted Blisters August 18, 2010"
 },
 {
  "id": "UNDAUNTED_BLISTERS_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/UNDAUNTED_BLISTERS_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/UNDAUNTED_BLISTERS_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Undaunted Blisters",
  "releaseDate": "August 19, 2010",
  "region": "North America",
  "description": "Regular-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Dialga released within the Korean Space-Time Clash Blister Packs August 19, 2010"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "August 19, 2010",
  "releaseDate": "August 19, 2010",
  "region": "South Korea",
  "description": "Regular-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Palkia released within the Korean Space-Time Clash Blister Packs August 19, 2010"
 },
 {
  "id": "SPACETIME_CLASH_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/SPACETIME_CLASH_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/SPACETIME_CLASH_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "Space-Time Clash Blister Packs",
  "releaseDate": "November 23, 2010",
  "region": "North America",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring Dialga released within the English Royal Guard Theme Deck November 23, 2010"
 },
 {
  "id": "ROYAL_GUARD_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/ROYAL_GUARD_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/ROYAL_GUARD_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "Royal Guard",
  "releaseDate": "November 23, 2010",
  "region": "North America",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Palkia released within the English Verdant Frost Theme Deck November 23, 2010"
 },
 {
  "id": "VERDANT_FROST_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/VERDANT_FROST_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/VERDANT_FROST_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Verdant Frost",
  "releaseDate": "February 9, 2011",
  "region": "North America",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Lucario released within the English Retort Theme Deck February 9, 2011"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 9, 2011",
  "releaseDate": "February 9, 2011",
  "region": "North America",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Rayquaza released within the English Recon Theme Deck February 9, 2011"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_SILVER_20101029",
  "url": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "October 29, 2010",
  "releaseDate": "October 29, 2010",
  "region": "Japan",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Japanese Beginning Set October 29, 2010"
 },
 {
  "id": "BEGINNING_SET_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/BEGINNING_SET_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/BEGINNING_SET_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Beginning Set",
  "releaseDate": "October 29, 2010",
  "region": "Japan",
  "description": "Regular-sized, Pink Non Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Japanese Beginning Set for Girls October 29, 2010"
 },
 {
  "id": "BEGINNING_SET_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/BEGINNING_SET_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/BEGINNING_SET_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Star-Imprint Holofoil, Black-backed",
  "material": "silver",
  "release": "Beginning Set for Girls",
  "releaseDate": "November 20, 2010",
  "region": "Japan",
  "description": "Regular-sized, Silver Star-Imprint Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Japanese Beginning Set DX November 20, 2010"
 },
 {
  "id": "BEGINNING_SET_REGULARSIZED_PINK_20101120",
  "url": "src/assets/coins/bulbapedia/BEGINNING_SET_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/BEGINNING_SET_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Beginning Set DX",
  "releaseDate": "November 20, 2010",
  "region": "Japan",
  "description": "Regular-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Japanese Beginning Set DX for Girls November 20, 2010"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_GREEN_20110101",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, Japanese",
  "material": "enamel",
  "release": "January 1, 2011",
  "releaseDate": "January 1, 2011",
  "region": "Japan",
  "description": "Regular-sized, Green Mirror Holofoil, Japanese ® Trademark Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Japanese Lawson Original Coin Set January 1, 2011"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_RED_20110101",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Mirror Holofoil, Japanese",
  "material": "enamel",
  "release": "January 1, 2011",
  "releaseDate": "January 1, 2011",
  "region": "Japan",
  "description": "Regular-sized, Red Mirror Holofoil, Japanese ® Trademark Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Japanese Lawson Original Coin Set January 1, 2011"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, English",
  "material": "enamel",
  "release": "April 6, 2011",
  "releaseDate": "April 6, 2011",
  "region": "North America",
  "description": "Regular-sized, Green Mirror Holofoil, English ™ Trademark Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the English Green Tornado Theme Deck April 6, 2011"
 },
 {
  "id": "GREEN_TORNADO_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/GREEN_TORNADO_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/GREEN_TORNADO_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Mirror Holofoil, English",
  "material": "enamel",
  "release": "Green Tornado",
  "releaseDate": "April 6, 2011",
  "region": "North America",
  "description": "Regular-sized, Red Mirror Holofoil, English ™ Trademark Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the English Red Frenzy Theme Deck April 6, 2011"
 },
 {
  "id": "RED_FRENZY_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/RED_FRENZY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/RED_FRENZY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Red Frenzy",
  "releaseDate": "April 6, 2011",
  "region": "North America",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the English Blue Assault Theme Deck April 6, 2011"
 },
 {
  "id": "BLUE_ASSAULT_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/BLUE_ASSAULT_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/BLUE_ASSAULT_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Confetti Holofoil, Black-backed",
  "material": "silver",
  "release": "Blue Assault",
  "releaseDate": "April 25, 2011",
  "region": "North America",
  "description": "Regular-sized, Silver Confetti Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the English Black & White Blisters April 25, 2011"
 },
 {
  "id": "BLACK__REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/BLACK__REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/BLACK__REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Black & White Blisters",
  "releaseDate": "May 3, 2011",
  "region": "South Korea",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Korean Evolution of Grass Half Deck May 3, 2011"
 },
 {
  "id": "EVOLUTION_OF_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Evolution of Grass",
  "releaseDate": "May 3, 2011",
  "region": "South Korea",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Korean Evolution of Fire Half Deck May 3, 2011"
 },
 {
  "id": "EVOLUTION_OF_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Evolution of Fire",
  "releaseDate": "May 3, 2011",
  "region": "South Korea",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Korean Evolution of Water Half Deck May 3, 2011"
 },
 {
  "id": "EVOLUTION_OF_REGULARSIZED_RED_20110617",
  "url": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Confetti Holofoil, Japanese",
  "material": "enamel",
  "release": "Evolution of Water",
  "releaseDate": "June 17, 2011",
  "region": "Japan",
  "description": "Regular-sized, Red Confetti Holofoil, Japanese ® Trademark Black-backed Coin featuring Victini released within the Battle Theme Deck: Victini in Japan June 17, 2011 and in South Korea November 10, 201"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_SILVER_20110805",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "August 5, 2011",
  "releaseDate": "August 5, 2011",
  "region": "Japan",
  "description": "Regular-sized, Silver Pixel Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Japanese Beginning Set + August 5, 2011"
 },
 {
  "id": "BEGINNING_SET_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/BEGINNING_SET_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/BEGINNING_SET_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "Beginning Set +",
  "releaseDate": "August 17, 2011",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Reshiram and Zekrom released within the Toxic Tricks Theme Deck August 17, 2011"
 },
 {
  "id": "TOXIC_TRICKS_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/TOXIC_TRICKS_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/TOXIC_TRICKS_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Toxic Tricks",
  "releaseDate": "August 17, 2011",
  "region": "North America",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Reshiram and Zekrom released within the Power Play Theme Deck August 17, 2011"
 },
 {
  "id": "POWER_PLAY_REGULARSIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/POWER_PLAY_REGULARSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/POWER_PLAY_REGULARSIZED_BRONZE.jpg",
  "name": "Regular-sized, Bronze Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Power Play",
  "releaseDate": "August 31, 2011",
  "region": "North America",
  "description": "Regular-sized, Bronze Rainbow Holofoil, Black-backed Coin featuring Reshiram and Zekrom released within the English Emerging Powers Blisters August 31, 2011"
 },
 {
  "id": "EMERGING_POWERS_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/EMERGING_POWERS_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/EMERGING_POWERS_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Confetti Holofoil, Black-backed",
  "material": "silver",
  "release": "Emerging Powers Blisters",
  "releaseDate": "September 2011",
  "region": "North America",
  "description": "Regular-sized, Silver Confetti Holofoil, Black-backed Coin featuring Energy symbols released within the English Black & White Trainer Kit September 2011"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_GOLD_20111020",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "October 20, 2011",
  "releaseDate": "October 20, 2011",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring the 15th Anniversary released within the Japanese Pokémon Card Game 15th Anniversary Premium Box October 20, 2011"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_GOLD_20111021",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "October 21, 2011",
  "releaseDate": "October 21, 2011",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Reshiram released within the Japanese Reshiram-EX Battle Strength Deck October 21, 2011"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_GOLD_20111021_2",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Speckle Holofoil, Black-backed",
  "material": "gold",
  "release": "October 21, 2011",
  "releaseDate": "October 21, 2011",
  "region": "Japan",
  "description": "Regular-sized, Gold Speckle Holofoil, Black-backed Coin featuring Zekrom released within the Japanese Zekrom-EX Battle Strength Deck October 21, 2011"
 },
 {
  "id": "ZEKROMEX_BATTLE_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/ZEKROMEX_BATTLE_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/ZEKROMEX_BATTLE_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Glitter Holofoil, Black-backed",
  "material": "enamel",
  "release": "Zekrom-EX Battle Strength Deck",
  "releaseDate": "November 2, 2011",
  "region": "Japan",
  "description": "Regular-sized, Blue Glitter Holofoil, Black-backed Coin featuring Escavalier and Accelgor released within the Fast Daze Theme Deck November 2, 2011"
 },
 {
  "id": "FAST_DAZE_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/FAST_DAZE_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/FAST_DAZE_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "Fast Daze",
  "releaseDate": "November 2, 2011",
  "region": "North America",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Escavalier and Accelgor released within the Furious Knights Theme Deck November 2, 2011"
 },
 {
  "id": "FURIOUS_KNIGHTS_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/FURIOUS_KNIGHTS_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/FURIOUS_KNIGHTS_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Confetti Holofoil, English",
  "material": "enamel",
  "release": "Furious Knights",
  "releaseDate": "November 16, 2011",
  "region": "North America",
  "description": "Regular-sized, Red Confetti Holofoil, English ™ Trademark Black-backed Coin featuring Victini released within the English Noble Victories Blisters November 16, 2011; later included in XY Two Pack Blis"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_SILVER_20111105",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Non Holofoil, Black-backed",
  "material": "silver",
  "release": "November 5, 2011",
  "releaseDate": "November 5, 2011",
  "region": "Japan",
  "description": "Regular-sized, Silver Non Holofoil, Black-backed Coin featuring the 15th Anniversary released for participating in the Japanese Battle Carnival Autumn 2011 held on November 5-6, 2011 in Osaka, and Nov"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_SILVER_20111118",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Crosshatch Holofoil, Black-backed",
  "material": "silver",
  "release": "November 18, 2011",
  "releaseDate": "November 18, 2011",
  "region": "Japan",
  "description": "Regular-sized, Silver Crosshatch Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Japanese Beginning Set Pikachu Version November 18, 2011"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_SILVER_20111118_2",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Sheen Holofoil, Black-backed",
  "material": "silver",
  "release": "November 18, 2011",
  "releaseDate": "November 18, 2011",
  "region": "Japan",
  "description": "Regular-sized, Silver Sheen Holofoil, Black-backed Coin featuring a VS design released within the Japanese Battle Gift Set: Thundurus vs Tornadus November 18, 2011"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 23, 2011",
  "releaseDate": "December 23, 2011",
  "region": "Japan",
  "description": "Regular-sized, Red Mirror Holofoil, Black-backed Coin featuring Reshiram released within the Japanese Dark Rush Lawson Original Coin Set December 23, 2011"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 23, 2011",
  "releaseDate": "December 23, 2011",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Zekrom released within the Japanese Dark Rush Lawson Original Coin Set December 23, 2011"
 },
 {
  "id": "DARK_RUSH_REGULARSIZED_BLACK",
  "url": "src/assets/coins/bulbapedia/DARK_RUSH_REGULARSIZED_BLACK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DARK_RUSH_REGULARSIZED_BLACK.jpg",
  "name": "Regular-sized, Black Non Holofoil, White-backed",
  "material": "enamel",
  "release": "Dark Rush Lawson Original Coin Set",
  "releaseDate": "February 8, 2012",
  "region": "North America",
  "description": "Regular-sized, Black Non Holofoil, White-backed Coin featuring Reshiram and Zekrom released within the Explosive Edge Theme Deck February 8, 2012; later included in XY Two Pack Blisters February 5, 20"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_WHITE",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_WHITE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_WHITE.jpg",
  "name": "Regular-sized, White Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 8, 2012",
  "releaseDate": "February 8, 2012",
  "region": "North America",
  "description": "Regular-sized, White Non Holofoil, Black-backed Coin featuring Reshiram and Zekrom released within the Voltage Vortex Theme Deck February 8, 2012"
 },
 {
  "id": "VOLTAGE_VORTEX_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/VOLTAGE_VORTEX_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/VOLTAGE_VORTEX_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Mirror Holofoil, Maroon-backed",
  "material": "silver",
  "release": "Voltage Vortex",
  "releaseDate": "February 8, 2012",
  "region": "North America",
  "description": "Regular-sized, Silver Mirror Holofoil, Maroon-backed Coin featuring Munna released within the Meowth and Luxio Blister Packs of the English Next Destinies Blisters February 8, 2012"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_GREEN_20120208",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 8, 2012",
  "releaseDate": "February 8, 2012",
  "region": "North America",
  "description": "Regular-sized, Green Speckle Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Klinklang and Gigalith Blister Packs of the English Next Destinies Blisters February 8"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 8, 2012",
  "releaseDate": "February 8, 2012",
  "region": "North America",
  "description": "Regular-sized, Red Speckle Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Klinklang and Gigalith Blister Packs of the English Next Destinies Blisters February 8, "
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_BLUE_20120208",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 8, 2012",
  "releaseDate": "February 8, 2012",
  "region": "North America",
  "description": "Regular-sized, Blue Speckle Holofoil, Black-backed Coin featuring Snivy, Tepig, and Oshawott released within the Klinklang and Gigalith Blister Packs of the English Next Destinies Blisters February 8,"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_TEAL",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_TEAL.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_TEAL.jpg",
  "name": "Regular-sized, Teal Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "April 2012",
  "releaseDate": "April 2012",
  "region": "Japan",
  "description": "Regular-sized, Teal Non Holofoil, Black-backed Coin featuring Rayquaza released for participating in the Japanese Garchomp & Hydreigon Cup held in April 2012"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_SILVER_20120412",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Tinsel Holofoil, Black-backed",
  "material": "silver",
  "release": "April 12, 2012",
  "releaseDate": "April 12, 2012",
  "region": "South Korea",
  "description": "Regular-sized, Silver Tinsel Holofoil, Black-backed Coin featuring Reshiram released within the Korean Reshiram-EX Battle Strength Deck April 12, 2012"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_SILVER_20120412_2",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Tinsel Holofoil, Black-backed",
  "material": "silver",
  "release": "April 12, 2012",
  "releaseDate": "April 12, 2012",
  "region": "South Korea",
  "description": "Regular-sized, Silver Tinsel Holofoil, Black-backed Coin featuring Zekrom released within the Korean Zekrom-EX Battle Strength Deck April 12, 2012"
 },
 {
  "id": "ZEKROMEX_BATTLE_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/ZEKROMEX_BATTLE_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/ZEKROMEX_BATTLE_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Speckle Holofoil, Black-backed",
  "material": "gold",
  "release": "Zekrom-EX Battle Strength Deck",
  "releaseDate": "April 20, 2012",
  "region": "Japan",
  "description": "Regular-sized, Gold Speckle Holofoil, Black-backed Coin featuring Pikachu released within the Japanese National Beginning Set April 20, 2012"
 },
 {
  "id": "NATIONAL_BEGINNING_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/NATIONAL_BEGINNING_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/NATIONAL_BEGINNING_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Tinsel Holofoil, Black-backed",
  "material": "silver",
  "release": "National Beginning Set",
  "releaseDate": "May 3, 2012",
  "region": "Japan",
  "description": "Regular-sized, Silver Tinsel Holofoil, Black-backed Coin featuring Rayquaza released for participating in the Japanese Battle Carnival Spring 2012 held on May 3, 2012 in Sendai, May 12–13 in Yokohama,"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER_20120509",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Red-backed",
  "material": "silver",
  "release": "May 9, 2012",
  "releaseDate": "May 9, 2012",
  "region": "North America",
  "description": "Regular-sized, Silver Rainbow Holofoil, Red-backed Coin featuring Zoroark released within the Raiders Theme Deck May 9, 2012; later released within Boundaries Crossed Three Pack Blisters November 7, 2"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_RED_20120509",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 9, 2012",
  "releaseDate": "May 9, 2012",
  "region": "North America",
  "description": "Regular-sized, Red Mirror Holofoil, Black-backed Coin featuring Zoroark released within the Shadows Theme Deck May 9, 2012; later included in XY Three Pack Blisters February 5, 2014"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER_20120509_2",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Mirror Holofoil, White-backed",
  "material": "silver",
  "release": "May 9, 2012",
  "releaseDate": "May 9, 2012",
  "region": "North America",
  "description": "Regular-sized, Silver Mirror Holofoil, White-backed Coin featuring Reshiram and Zekrom released within the Dark Explorers Three Pack Blisters May 9, 2012"
 },
 {
  "id": "DARK_EXPLORERS_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DARK_EXPLORERS_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DARK_EXPLORERS_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Dark Explorers Blisters",
  "releaseDate": "May 9, 2012",
  "region": "North America",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Reshiram and Zekrom released within the Dark Explorers Stage 2 Blisters May 9, 2012"
 },
 {
  "id": "DARK_EXPLORERS_REGULARSIZED_EMERALD",
  "url": "src/assets/coins/bulbapedia/DARK_EXPLORERS_REGULARSIZED_EMERALD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DARK_EXPLORERS_REGULARSIZED_EMERALD.jpg",
  "name": "Regular-sized, Emerald Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Dark Explorers Blisters",
  "releaseDate": "August 15, 2012",
  "region": "North America",
  "description": "Regular-sized, Emerald Rainbow Holofoil, Black-backed Coin featuring Rayquaza released within the DragonSpeed Theme Deck August 15, 2012"
 },
 {
  "id": "DRAGONSPEED_REGULARSIZED_EMERALD_CRACKED",
  "url": "src/assets/coins/bulbapedia/DRAGONSPEED_REGULARSIZED_EMERALD_CRACKED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DRAGONSPEED_REGULARSIZED_EMERALD_CRACKED.jpg",
  "name": "Regular-sized, Emerald Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "DragonSpeed",
  "releaseDate": "August 15, 2012",
  "region": "North America",
  "description": "Regular-sized, Emerald Cracked Ice Holofoil, Black-backed Coin featuring Rayquaza released within the DragonSnarl Theme Deck August 15, 2012"
 },
 {
  "id": "DRAGONSNARL_REGULARSIZED_BLUE_SPECKLE",
  "url": "src/assets/coins/bulbapedia/DRAGONSNARL_REGULARSIZED_BLUE_SPECKLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DRAGONSNARL_REGULARSIZED_BLUE_SPECKLE.jpg",
  "name": "Regular-sized, Blue Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "DragonSnarl",
  "releaseDate": "October 19, 2012",
  "region": "North America",
  "description": "Regular-sized, Blue Speckle Holofoil, Black-backed Coin featuring Black Kyurem released within the Black Kyurem-EX Battle Strength Deck in Japan October 19, 2012 and in South Korea April 4, 2013"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_RED_20121019",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 19, 2012",
  "releaseDate": "October 19, 2012",
  "region": "Japan",
  "description": "Regular-sized, Red Speckle Holofoil, Black-backed Coin featuring White Kyurem released within the White Kyurem-EX Battle Strength Deck in Japan October 19, 2012 and in South Korea April 4, 2013"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Sheen Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 4, 2012",
  "releaseDate": "November 4, 2012",
  "region": "Japan",
  "description": "Regular-sized, Blue Sheen Holofoil, Black-backed Coin featuring the Team Plasma emblem released for participating in the Japanese Battle Carnival Autumn 2012 held on November 4, 2012 in Sapporo, Novem"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_BLUE_20121107",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "November 7, 2012",
  "releaseDate": "November 7, 2012",
  "region": "North America",
  "description": "Regular-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Black Kyurem released within the Ice Shock Theme Deck November 7, 2012"
 },
 {
  "id": "ICE_SHOCK_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/ICE_SHOCK_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/ICE_SHOCK_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Ice Shock",
  "releaseDate": "November 7, 2012",
  "region": "North America",
  "description": "Regular-sized, Red Cracked Ice Holofoil, Black-backed Coin featuring White Kyurem released within the Cold Fire Theme Deck November 7, 2012"
 },
 {
  "id": "COLD_FIRE_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/COLD_FIRE_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/COLD_FIRE_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Tinsel Holofoil, Black-backed",
  "material": "silver",
  "release": "Cold Fire",
  "releaseDate": "November 16, 2012",
  "region": "North America",
  "description": "Regular-sized, Silver Tinsel Holofoil, Black-backed Coin featuring the Team Plasma emblem released within the Japanese Team Plasma Battle Gift Set November 16, 2012"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 16, 2012",
  "releaseDate": "November 16, 2012",
  "region": "Japan",
  "description": "Regular-sized, Pink Speckle Holofoil, Black-backed Coin featuring Audino released within the Japanese Everyone's Exciting Battle November 16, 2012"
 },
 {
  "id": "EVERYONES_EXCITING_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/EVERYONES_EXCITING_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/EVERYONES_EXCITING_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "Everyone's Exciting Battle",
  "releaseDate": "December 2012",
  "region": "Japan",
  "description": "Regular-sized, Blue Speckle Holofoil, Black-backed Coin featuring the Team Plasma emblem released within the Japanese Expansion Pack Team Plasma Set December 2012"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_BLUE_20121215",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Sheen Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 15, 2012",
  "releaseDate": "December 15, 2012",
  "region": "Japan",
  "description": "Regular-sized, Blue Sheen Holofoil, Black-backed Coin featuring Deoxys awarded upon winning 1 battle during the Team Plasma Control events held in commemoration of the release of the Spiral Force & Th"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_BLUE_20130206",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 6, 2013",
  "releaseDate": "February 6, 2013",
  "region": "North America",
  "description": "Regular-sized, Blue Rainbow Holofoil, Black-backed Coin featuring the Team Plasma emblem released within the Plasma Claw Theme Deck February 6, 2013"
 },
 {
  "id": "PLASMA_CLAW_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/PLASMA_CLAW_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/PLASMA_CLAW_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Dark",
  "material": "silver",
  "release": "Plasma Claw",
  "releaseDate": "February 6, 2013",
  "region": "North America",
  "description": "Regular-sized, Silver Rainbow Holofoil, Dark Blue-backed Coin featuring the Team Plasma emblem released within the Plasma Shadow Theme Deck February 6, 2013"
 },
 {
  "id": "PLASMA_SHADOW_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/PLASMA_SHADOW_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/PLASMA_SHADOW_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "Plasma Shadow",
  "releaseDate": "March 15, 2013",
  "region": "Japan",
  "description": "Regular-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Blastoise released within the Japanese Blastoise + Kyurem-EX Combo Deck March 15, 2013"
 },
 {
  "id": "BLASTOISE__REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/BLASTOISE__REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/BLASTOISE__REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Blastoise + Kyurem-EX Combo Deck",
  "releaseDate": "May 4, 2013",
  "region": "Japan",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Blastoise released for participating in the Japanese Battle Carnival Spring 2013 held on May 4, 2013 in Fukuoka, May 12 in Nagoy"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Sheen Holofoil, Orange-backed",
  "material": "silver",
  "release": "May 8, 2013",
  "releaseDate": "May 8, 2013",
  "region": "North America",
  "description": "Large-sized, Silver Sheen Holofoil, Orange-backed Coin featuring Deoxys released within the Frost Ray Theme Deck May 8, 2013"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER_20130508",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Blue-backed",
  "material": "silver",
  "release": "May 8, 2013",
  "releaseDate": "May 8, 2013",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Blue-backed Coin featuring Deoxys released within the Psy Crusher Theme Deck May 8, 2013"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_BLUE_20130508",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, White-backed",
  "material": "enamel",
  "release": "May 8, 2013",
  "releaseDate": "May 8, 2013",
  "region": "North America",
  "description": "Regular-sized, Blue Mirror Holofoil, White-backed Coin featuring the Team Plasma emblem released within the Team Plasma Box May 29, 2013"
 },
 {
  "id": "TEAM_PLASMA_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/TEAM_PLASMA_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/TEAM_PLASMA_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Mirror Holofoil, Blue-backed",
  "material": "silver",
  "release": "Team Plasma Box",
  "releaseDate": "May 29, 2013",
  "region": "North America",
  "description": "Regular-sized, Silver Mirror Holofoil, Blue-backed Coin featuring the Team Plasma emblem released within the Team Plasma Box May 29, 2013"
 },
 {
  "id": "TEAM_PLASMA_REGULARSIZED_SILVER_20130613",
  "url": "src/assets/coins/bulbapedia/TEAM_PLASMA_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/TEAM_PLASMA_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Confetti Holofoil, Black-backed",
  "material": "silver",
  "release": "Team Plasma Box",
  "releaseDate": "June 13, 2013",
  "region": "North America",
  "description": "Regular-sized, Silver Confetti Holofoil, Black-backed Coin featuring Pikachu released within the Korean BW Master Guide I on June 13, 2013"
 },
 {
  "id": "BW_MASTER_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/BW_MASTER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/BW_MASTER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "BW Master Guide I",
  "releaseDate": "July 13, 2013",
  "region": "South Korea",
  "description": "Regular-sized, Red Speckle Holofoil, Black-backed Coin featuring Genesect released within the Mewtwo vs Genesect Deck Kit in Japan July 13, 2013 and in South Korea December 16, 2013"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 14, 2013",
  "releaseDate": "August 14, 2013",
  "region": "North America",
  "description": "Large-sized, Purple Mirror Holofoil, Black-backed Coin featuring Genesect released within the Mind Wipe Theme Deck August 14, 2013"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Ovals Holofoil, Black-backed",
  "material": "silver",
  "release": "August 14, 2013",
  "releaseDate": "August 14, 2013",
  "region": "North America",
  "description": "Large-sized, Silver Ovals Holofoil, Black-backed Coin featuring Genesect released within the Solar Strike Theme Deck August 14, 2013"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_GOLD_20130814",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Japanese",
  "material": "gold",
  "release": "August 14, 2013",
  "releaseDate": "August 14, 2013",
  "region": "North America",
  "description": "Regular-sized, Gold Non Holofoil, Japanese ® Trademark Black-backed Coin featuring Pikachu released for winning three matches in a row in the Japanese Pokémon Game Show TCG tournament held on August 1"
 },
 {
  "id": "DATE_SEPTEMBER_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 25, 2013",
  "releaseDate": "September 25, 2013",
  "region": "North America",
  "description": "Large-sized, Red Mirror Holofoil, Black-backed Coin featuring Genesect released within the Red Genesect Collection Theme Deck September 25, 2013"
 },
 {
  "id": "RED_GENESECT_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/RED_GENESECT_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/RED_GENESECT_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Confetti Holofoil, Black-backed",
  "material": "silver",
  "release": "Red Genesect Collection",
  "releaseDate": "December 30, 2013",
  "region": "South Korea",
  "description": "Regular-sized, Silver Confetti Holofoil, Black-backed Coin featuring Genesect released within the Korean BW Master Guide III on December 30, 2013"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 8, 2013",
  "releaseDate": "November 8, 2013",
  "region": "North America",
  "description": "Large-sized, Green Rainbow Holofoil, Black-backed Coin featuring Chespin released within the Chespin Deck of the Kalos Starter Set November 8, 2013; later released within Chespin Kalos Starter Collect"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 8, 2013",
  "releaseDate": "November 8, 2013",
  "region": "North America",
  "description": "Large-sized, Red Rainbow Holofoil, Black-backed Coin featuring Fennekin released within the Fennekin Deck of the Kalos Starter Set November 8, 2013; later released within Fennekin Kalos Starter Collec"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 8, 2013",
  "releaseDate": "November 8, 2013",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Froakie released within the Froakie Deck of the Kalos Starter Set November 8, 2013; later released within Froakie Kalos Starter Collecti"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_SILVER_20131108",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Sheen Holofoil, Black-backed",
  "material": "silver",
  "release": "November 8, 2013",
  "releaseDate": "November 8, 2013",
  "region": "Japan",
  "description": "Regular-sized, Silver Sheen Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the XY Beginning Set November 8, 2013"
 },
 {
  "id": "XY_BEGINNING_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/XY_BEGINNING_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/XY_BEGINNING_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "XY Beginning Set",
  "releaseDate": "November 8, 2013",
  "region": "Japan",
  "description": "Regular-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the XY Beginning Set for Girls November 8, 2013"
 },
 {
  "id": "XY_BEGINNING_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/XY_BEGINNING_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/XY_BEGINNING_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "XY Beginning Set for Girls",
  "releaseDate": "November 15, 2013",
  "region": "Japan",
  "description": "Regular-sized, Red Mirror Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the XY Beginning Set DX November 15, 2013"
 },
 {
  "id": "XY_BEGINNING_REGULARSIZED_PINK_20131115",
  "url": "src/assets/coins/bulbapedia/XY_BEGINNING_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/XY_BEGINNING_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "XY Beginning Set DX",
  "releaseDate": "November 15, 2013",
  "region": "Japan",
  "description": "Regular-sized, Pink Speckle Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the XY Beginning Set DX for Girls November 15, 2013"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_RED_20131213",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 13, 2013",
  "releaseDate": "December 13, 2013",
  "region": "Japan",
  "description": "Regular-sized, Red Speckle Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the Lawson Limited Pokémon Coin Set December 13, 2013"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_BLUE_20131213",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 13, 2013",
  "releaseDate": "December 13, 2013",
  "region": "Japan",
  "description": "Regular-sized, Blue Speckle Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the Lawson Limited Pokémon Coin Set December 13, 2013"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "February 5, 2014",
  "releaseDate": "February 5, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Blue-backed Coin featuring Xerneas released within the Resilient Life Theme Deck February 5, 2014"
 },
 {
  "id": "RESILIENT_LIFE_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/RESILIENT_LIFE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/RESILIENT_LIFE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Resilient Life",
  "releaseDate": "February 5, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Red-backed Coin featuring Yveltal released within the Destruction Rush Theme Deck February 5, 2014"
 },
 {
  "id": "DESTRUCTION_RUSH_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DESTRUCTION_RUSH_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DESTRUCTION_RUSH_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Destruction Rush",
  "releaseDate": "March 4, 2014",
  "region": "North America",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the Korean Evolution of Chespin Half Deck March 4, 2014"
 },
 {
  "id": "EVOLUTION_OF_REGULARSIZED_RED_20140304",
  "url": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Evolution of Chespin",
  "releaseDate": "March 4, 2014",
  "region": "South Korea",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the Korean Evolution of Fennekin Half Deck March 4, 2014"
 },
 {
  "id": "EVOLUTION_OF_REGULARSIZED_BLUE_20140304",
  "url": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/EVOLUTION_OF_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Evolution of Fennekin",
  "releaseDate": "March 4, 2014",
  "region": "South Korea",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the Korean Evolution of Froakie Half Deck March 4, 2014"
 },
 {
  "id": "EVOLUTION_OF_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/EVOLUTION_OF_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/EVOLUTION_OF_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Evolution of Froakie",
  "releaseDate": "March 12, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within the XY Trainer Kit March 12, 2014"
 },
 {
  "id": "XY_TRAINER_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/XY_TRAINER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/XY_TRAINER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "XY Trainer Kit",
  "releaseDate": "March 15, 2014",
  "region": "North America",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Mega Charizard Y released within the M Charizard-EX Mega Battle Deck in Japan March 15, 2014 and in South Korea June 3, 2014"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "April 1, 2014",
  "releaseDate": "April 1, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Xerneas released within limited later shipments of the XY Blisters April 1, 2014; given a wider release within the Flashfire Blist"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_SILVER_20140401",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "April 1, 2014",
  "releaseDate": "April 1, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Yveltal released within limited later shipments of the XY Blisters April 1, 2014; given a wider release within the Flashfire Blist"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "April 1, 2014",
  "releaseDate": "April 1, 2014",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Pikachu released within later shipments of the XY Blisters April 1, 2014; later released as one of several coins randomly included within"
 },
 {
  "id": "DATE_MAY_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 3, 2014",
  "releaseDate": "May 3, 2014",
  "region": "North America",
  "description": "Large-sized, Red Mirror Holofoil, Black-backed Coin featuring the Pokémon Professor symbol released upon participation at the Professor Cup of the International 2014 National Championships, starting i"
 },
 {
  "id": "DATE_MAY_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 7, 2014",
  "releaseDate": "May 7, 2014",
  "region": "North America",
  "description": "Large-sized, Orange Rainbow Holofoil, Black-backed Coin featuring Mega Charizard Y released within the Brilliant Thunder Theme Deck May 7, 2014"
 },
 {
  "id": "BRILLIANT_THUNDER_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/BRILLIANT_THUNDER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/BRILLIANT_THUNDER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Smoke Holofoil, Black-backed",
  "material": "silver",
  "release": "Brilliant Thunder",
  "releaseDate": "May 7, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Smoke Holofoil, Black-backed Coin featuring Mega Charizard Y released within the Mystic Typhoon Theme Deck May 7, 2014"
 },
 {
  "id": "MYSTIC_TYPHOON_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/MYSTIC_TYPHOON_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/MYSTIC_TYPHOON_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "Mystic Typhoon",
  "releaseDate": "May 7, 2014",
  "region": "North America",
  "description": "Large-sized, Gold Non Holofoil, Black-backed Coin featuring Mega Charizard Y released within the Flashfire Blisters May 7, 2014"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER_20140507",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "May 7, 2014",
  "releaseDate": "May 7, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Deoxys released within later shipments of the Kanto First Partner Evolutions XY Blisters May 7, 2014"
 },
 {
  "id": "XY_BLISTERS_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/XY_BLISTERS_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/XY_BLISTERS_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "XY Blisters",
  "releaseDate": "May 7, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Genesect released within later shipments of the Dragon-type XY Blisters May 7, 2014"
 },
 {
  "id": "XY_BLISTERS_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/XY_BLISTERS_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/XY_BLISTERS_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "XY Blisters",
  "releaseDate": "June 12, 2014",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Xerneas released within later shipments of the XY Single Pack Blisters June 12, 2014"
 },
 {
  "id": "XY_SINGLE_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/XY_SINGLE_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/XY_SINGLE_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "XY Single Pack Blisters",
  "releaseDate": "June 12, 2014",
  "region": "North America",
  "description": "Large-sized, Red Rainbow Holofoil, Black-backed Coin featuring Yveltal released within later shipments of the XY Single Pack Blisters June 12, 2014; later released within the Battle Arena Decks: Xerne"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Yellow-backed",
  "material": "silver",
  "release": "June 12, 2014",
  "releaseDate": "June 12, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Yellow-backed Coin featuring Pikachu released within later shipments of the Flashfire Three Pack Blisters June 12, 2014; released again in later shipments of the E"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Sheen Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 12, 2014",
  "releaseDate": "June 12, 2014",
  "region": "North America",
  "description": "Large-sized, Blue Sheen Holofoil, Black-backed Coin featuring Xerneas released within later shipments of the XY Single Pack Blisters June 12, 2014"
 },
 {
  "id": "XY_SINGLE_LARGESIZED_RED_20140612",
  "url": "src/assets/coins/bulbapedia/XY_SINGLE_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/XY_SINGLE_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Smoke Holofoil, Black-backed",
  "material": "enamel",
  "release": "XY Single Pack Blisters",
  "releaseDate": "June 12, 2014",
  "region": "North America",
  "description": "Large-sized, Red Smoke Holofoil, Black-backed Coin featuring Yveltal released within later shipments of the XY Single Pack Blisters June 12, 2014; subsequently released as one of several coins randoml"
 },
 {
  "id": "DATE_JULY_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "July 2014",
  "releaseDate": "July 2014",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Chespin, Fennekin, and Froakie released within later shipments of the XY Trainer Kit during July 2014; later released as one of several c"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_SILVER_20140813",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Confetti Holofoil, Black-backed",
  "material": "silver",
  "release": "August 13, 2014",
  "releaseDate": "August 13, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Confetti Holofoil, Black-backed Coin featuring Mega Lucario released within the Enchanted Echo Theme Deck August 13, 2014"
 },
 {
  "id": "ENCHANTED_ECHO_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/ENCHANTED_ECHO_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/ENCHANTED_ECHO_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Sheen Holofoil, Black-backed",
  "material": "enamel",
  "release": "Enchanted Echo",
  "releaseDate": "August 13, 2014",
  "region": "North America",
  "description": "Large-sized, Blue Sheen Holofoil, Black-backed Coin featuring Mega Lucario released within later shipments of the Dark Hammer Theme Deck August 13, 2014"
 },
 {
  "id": "DARK_HAMMER_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DARK_HAMMER_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DARK_HAMMER_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Dark Hammer",
  "releaseDate": "August 13, 2014",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Mega Lucario released within the Dark Hammer Theme Deck August 13, 2014"
 },
 {
  "id": "DARK_HAMMER_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DARK_HAMMER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DARK_HAMMER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "Dark Hammer",
  "releaseDate": "August 13, 2014",
  "region": "North America",
  "description": "Large-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Deoxys released within the Furious Fists Blisters August 13, 2014"
 },
 {
  "id": "FURIOUS_FISTS_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/FURIOUS_FISTS_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/FURIOUS_FISTS_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Furious Fists Blisters",
  "releaseDate": "August 13, 2014",
  "region": "North America",
  "description": "Large-sized, Purple Cracked Ice Holofoil, Black-backed Coin featuring Genesect released within the Furious Fists Blisters August 13, 2014"
 },
 {
  "id": "FURIOUS_FISTS_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/FURIOUS_FISTS_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/FURIOUS_FISTS_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Sheen Holofoil, Black-backed",
  "material": "silver",
  "release": "Furious Fists Blisters",
  "releaseDate": "August 13, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Sheen Holofoil, Black-backed Coin featuring Pikachu released within later shipments of the Flashfire Single Pack Blisters August 13, 2014; released again as a possible coin within "
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 22, 2014",
  "releaseDate": "October 22, 2014",
  "region": "North America",
  "description": "Large-sized, Blue Confetti Holofoil, Black-backed Coin featuring Xerneas released within the Battle Arena Decks: Xerneas vs. Yveltal October 22, 2014"
 },
 {
  "id": "BATTLE_ARENA_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/BATTLE_ARENA_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/BATTLE_ARENA_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "Battle Arena Decks: Xerneas vs. Yveltal",
  "releaseDate": "October 26, 2014",
  "region": "Japan",
  "description": "Regular-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Dialga released for participating in the Japanese 2014 Battle Festa held on October 26, 2014 in Shizuoka; November 1–2, 2014 in To"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "November 5, 2014",
  "releaseDate": "November 5, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Gengar released within the Burning Winds Theme Deck November 5, 2014"
 },
 {
  "id": "BURNING_WINDS_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/BURNING_WINDS_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/BURNING_WINDS_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Burning Winds",
  "releaseDate": "November 5, 2014",
  "region": "North America",
  "description": "Large-sized, Purple Non Holofoil, Black-backed Coin featuring Mega Gengar released within the Bolt Twister Theme Deck November 5, 2014"
 },
 {
  "id": "BOLT_TWISTER_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/BOLT_TWISTER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/BOLT_TWISTER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "Bolt Twister",
  "releaseDate": "November 14, 2014",
  "region": "North America",
  "description": "Regular-sized, Silver Pixel Holofoil, Black-backed Coin featuring Xerneas and Yveltal released within the Super Legend Set: Xerneas-EX & Yveltal-EX November 14, 2014"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER_20141124",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "November 24, 2014",
  "releaseDate": "November 24, 2014",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Metagross released within the Mega Metagross-EX Premium Collection November 24, 2014"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_BLUE_20141213",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 13, 2014",
  "releaseDate": "December 13, 2014",
  "region": "Japan",
  "description": "Regular-sized, Blue Speckle Holofoil, Black-backed Coin featuring Kyogre released within the Lawson Limited Pokémon Coin Set Groudon & Kyogre December 13, 2014"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_RED_20141213",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 13, 2014",
  "releaseDate": "December 13, 2014",
  "region": "Japan",
  "description": "Regular-sized, Red Speckle Holofoil, Black-backed Coin featuring Groudon released within the Lawson Limited Pokémon Coin Set Groudon & Kyogre December 13, 2014"
 },
 {
  "id": "DATE_JANUARY_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "January 5, 2015",
  "releaseDate": "January 5, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Diancie released within the Mega Diancie-EX Premium Collection January 5, 2015"
 },
 {
  "id": "MEGA_DIANCIEEX_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/MEGA_DIANCIEEX_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/MEGA_DIANCIEEX_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Mega Diancie-EX Premium Collection",
  "releaseDate": "February 4, 2015",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Primal Kyogre released within the Ocean's Core Theme Deck February 4, 2015"
 },
 {
  "id": "OCEANS_CORE_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/OCEANS_CORE_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/OCEANS_CORE_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Ocean's Core",
  "releaseDate": "February 4, 2015",
  "region": "North America",
  "description": "Large-sized, Red Mirror Holofoil, Black-backed Coin featuring Primal Groudon released within the Earth's Pulse Theme Deck February 4, 2015"
 },
 {
  "id": "EARTHS_PULSE_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/EARTHS_PULSE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/EARTHS_PULSE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Earth's Pulse",
  "releaseDate": "February 4, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Chespin released within the Primal Clash Blisters February 4, 2015; later included in the Roaring Skies Blisters May 6, 2015 and A"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_SILVER_20150204",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "February 4, 2015",
  "releaseDate": "February 4, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Fennekin released within the Primal Clash Blisters February 4, 2015; later included in the Roaring Skies Blisters May 6, 2015 and "
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_SILVER_20150204_2",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "February 4, 2015",
  "releaseDate": "February 4, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Froakie released within the Primal Clash Blisters February 4, 2015; later included in the Roaring Skies Blisters May 6, 2015 and A"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_GOLD_20150314",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "March 14, 2015",
  "releaseDate": "March 14, 2015",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Mega Rayquaza released within the M Rayquaza-EX Mega Battle Deck in Japan March 14, 2015 and in South Korea June 4, 2015"
 },
 {
  "id": "DATE_MARCH_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 25, 2015",
  "releaseDate": "March 25, 2015",
  "region": "North America",
  "description": "Large-sized, Blue Mirror Holofoil, Black-backed Coin featuring the Team Aqua emblem released within the Double Crisis Blisters March 25, 2015"
 },
 {
  "id": "DOUBLE_CRISIS_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/DOUBLE_CRISIS_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DOUBLE_CRISIS_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Double Crisis Blisters",
  "releaseDate": "March 25, 2015",
  "region": "North America",
  "description": "Large-sized, Red Mirror Holofoil, Black-backed Coin featuring the Team Magma emblem released within the Double Crisis Blisters March 25, 2015"
 },
 {
  "id": "DOUBLE_CRISIS_LARGESIZED_TEAL",
  "url": "src/assets/coins/bulbapedia/DOUBLE_CRISIS_LARGESIZED_TEAL.jpg",
  "thumb": "src/assets/coins/bulbapedia/DOUBLE_CRISIS_LARGESIZED_TEAL.jpg",
  "name": "Large-sized, Teal Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Double Crisis Blisters",
  "releaseDate": "April 2015",
  "region": "North America",
  "description": "Large-sized, Teal Non Holofoil, Black-backed Coin featuring Metagross released within later shipments of the Mega Metagross-EX Premium Collection starting April 2015"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_SILVER_20150429",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "April 29, 2015",
  "releaseDate": "April 29, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Treecko, Torchic, and Mudkip released within the XY Trainer Kit: Latias & Latios April 29, 2015"
 },
 {
  "id": "XY_TRAINER_REGULARSIZED_GOLD_20150505",
  "url": "src/assets/coins/bulbapedia/XY_TRAINER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/XY_TRAINER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "XY Trainer Kit: Latias & Latios",
  "releaseDate": "May 5, 2015",
  "region": "Japan",
  "description": "Regular-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Mega Rayquaza released for participating in the Japanese Rayquaza Mega Battle held on May 5, 2015 in Nagoya, May 9-10 in Chiba, Ma"
 },
 {
  "id": "DATE_MAY_LARGESIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 6, 2015",
  "releaseDate": "May 6, 2015",
  "region": "North America",
  "description": "Large-sized, Green Mirror Holofoil, Black-backed Coin featuring Mega Rayquaza released within the Aurora Blast Theme Deck May 6, 2015; subsequently released within later shipments of the Roaring Skies"
 },
 {
  "id": "DATE_MAY_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "May 6, 2015",
  "releaseDate": "May 6, 2015",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Mega Rayquaza released within the Storm Rider Theme Deck May 6, 2015; subsequently released within later shipments of the Roaring Skies S"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER_20150529",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "May 29, 2015",
  "releaseDate": "May 29, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Absol released within the Mega Absol-EX Premium Collection May 29, 2015"
 },
 {
  "id": "MEGA_ABSOLEX_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/MEGA_ABSOLEX_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/MEGA_ABSOLEX_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Pixel Holofoil Coin",
  "material": "silver",
  "release": "Mega Absol-EX Premium Collection",
  "releaseDate": "July 18, 2015",
  "region": "Japan",
  "description": "Regular-sized, Silver Pixel Holofoil Coin featuring Pikachu released within the Emboar-EX vs Togekiss-EX Deck Kit in Japan July 18, 2015 and in South Korea September 8, 2015"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "August 1, 2015",
  "releaseDate": "August 1, 2015",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Treecko, Torchic, and Mudkip released within later shipments of the XY Trainer Kit: Latias & Latios starting August 1, 2015"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_SILVER_20150812",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "August 12, 2015",
  "releaseDate": "August 12, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Primal Kyogre released as one of three coins randomly included within the Iron Tide and Stone Heart Theme Decks August 12, 2015"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_SILVER_20150812_2",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "August 12, 2015",
  "releaseDate": "August 12, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Primal Groudon released as one of three coins randomly included within the Iron Tide and Stone Heart Theme Decks August 12, 2015"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_SILVER_20150812_3",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "August 12, 2015",
  "releaseDate": "August 12, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Mega Rayquaza released as one of three coins randomly included within the Iron Tide and Stone Heart Theme Decks August 12, 2015"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 19, 2015",
  "releaseDate": "August 19, 2015",
  "region": "North America",
  "description": "Large-sized, Blue Confetti Holofoil, Black-backed Coin featuring the Team Aqua emblem within later shipments of the Double Crisis Blisters August 19, 2015"
 },
 {
  "id": "DOUBLE_CRISIS_LARGESIZED_RED_20150819",
  "url": "src/assets/coins/bulbapedia/DOUBLE_CRISIS_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DOUBLE_CRISIS_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Double Crisis Blisters",
  "releaseDate": "August 19, 2015",
  "region": "North America",
  "description": "Large-sized, Red Cracked Ice Holofoil, Black-backed Coin featuring the Team Magma emblem within later shipments of the Double Crisis Blisters August 19, 2015"
 },
 {
  "id": "DATE_OCTOBER_REGULARSIZED_SILVER_20151009",
  "url": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png/SP_Silver_Chansey_Coin.png",
  "name": "Regular-sized, Silver Prism Holofoil Coin",
  "material": "gold",
  "release": "October 9, 2015",
  "releaseDate": "October 9, 2015",
  "region": "Japan",
  "description": "Regular-sized, Silver Prism Holofoil Coin featuring Golduck and Palkia released within the Golduck BREAK + Palkia-EX Combo Deck in Japan October 9, 2015 and in South Korea November 19, 2015"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 19, 2015",
  "releaseDate": "October 19, 2015",
  "region": "North America",
  "description": "Large-sized, Orange Rainbow Holofoil, Black-backed Coin featuring Mega Blaziken released within the Mega Blaziken-EX Premium Collection October 19, 2015"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_BLUE_20151019",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 19, 2015",
  "releaseDate": "October 19, 2015",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Mega Swampert released within the Mega Swampert-EX Premium Collection October 19, 2015"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Pixel Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 21, 2015",
  "releaseDate": "October 21, 2015",
  "region": "North America",
  "description": "Large-sized, Red Pixel Holofoil, Black-backed Coin featuring Zoroark released as one of two coins available within the Battle Arena Decks: Mewtwo vs. Darkrai October 21, 2015; subsequently released wi"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "October 21, 2015",
  "releaseDate": "October 21, 2015",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Zoroark released as one of two coins available within the Battle Arena Decks: Mewtwo vs. Darkrai October 21, 2015"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_PINK.jpg",
  "name": "Large-sized, Pink Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 4, 2015",
  "releaseDate": "November 4, 2015",
  "region": "North America",
  "description": "Large-sized, Pink Rainbow Holofoil, Black-backed Coin featuring Mega Mewtwo Y released within the Burning Spark Theme Deck November 4, 2015"
 },
 {
  "id": "BURNING_SPARK_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/BURNING_SPARK_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/BURNING_SPARK_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Burning Spark",
  "releaseDate": "November 4, 2015",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Mega Mewtwo X released within the Night Striker Theme Deck November 4, 2015"
 },
 {
  "id": "NIGHT_STRIKER_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/NIGHT_STRIKER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/NIGHT_STRIKER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Night Striker",
  "releaseDate": "November 18, 2015",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Hoopa Confined released within the BREAKthrough Collector Chest November 18, 2015"
 },
 {
  "id": "BREAKTHROUGH_COLLECTOR_REGULARSIZED_RAINBOW",
  "url": "src/assets/coins/bulbapedia/BREAKTHROUGH_COLLECTOR_REGULARSIZED_RAINBOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/BREAKTHROUGH_COLLECTOR_REGULARSIZED_RAINBOW.jpg",
  "name": "Regular-sized, Rainbow Cracked Ice Holofoil",
  "material": "enamel",
  "release": "BREAKthrough Collector Chest",
  "releaseDate": "December 26, 2015",
  "region": "Japan",
  "description": "Regular-sized, Rainbow Cracked Ice Holofoil Coin featuring Pikachu released as a free gift until supplies lasted for spending at least ¥2000 at the Pokémon Centers for the Japanese 2016 Start Dash Cam"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_BLUE_20151226",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Speckle Holofoil Coin",
  "material": "enamel",
  "release": "December 26, 2015",
  "releaseDate": "December 26, 2015",
  "region": "Japan",
  "description": "Regular-sized, Blue Speckle Holofoil Coin featuring Manaphy released as a free gift until supplies lasted for spending at least ¥2000 at the Pokémon Centers for the Japanese 2016 Start Dash Campaign s"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GREEN_20151226",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Speckle Holofoil Coin",
  "material": "enamel",
  "release": "December 26, 2015",
  "releaseDate": "December 26, 2015",
  "region": "Japan",
  "description": "Regular-sized, Green Speckle Holofoil Coin featuring Shaymin released as a free gift until supplies lasted for spending at least ¥2000 at the Pokémon Centers for the Japanese 2016 Start Dash Campaign "
 },
 {
  "id": "DATE_JANUARY_LARGESIZED_SILVER_20160103",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "January 3, 2016",
  "releaseDate": "January 3, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Aerodactyl released within the Mega Aerodactyl-EX Premium Collection January 3, 2016; later released within some copies of th"
 },
 {
  "id": "DATE_JANUARY_LARGESIZED_SILVER_201601",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "January 2016",
  "releaseDate": "January 2016",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Mewtwo Y released within later shipments of the Burning Spark Theme Deck January 2016"
 },
 {
  "id": "BURNING_SPARK_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/BURNING_SPARK_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/BURNING_SPARK_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "Burning Spark",
  "releaseDate": "January 2016",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Mega Mewtwo X released within later shipments of the Night Striker Theme Deck January 2016"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_RED_20160116",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil Coin",
  "material": "enamel",
  "release": "January 16, 2016",
  "releaseDate": "January 16, 2016",
  "region": "Japan",
  "description": "Regular-sized, Red Speckle Holofoil Coin featuring Charmander released as a prize for earning 3 points at the Pokémon Center Mega Battle + Creatures Challenge held in Pokémon Centers across Japan duri"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 3, 2016",
  "releaseDate": "February 3, 2016",
  "region": "North America",
  "description": "Large-sized, Red Non Holofoil, Black-backed Coin featuring Mega Gyarados released within the Wave Slasher Theme Deck February 3, 2016"
 },
 {
  "id": "WAVE_SLASHER_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/WAVE_SLASHER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/WAVE_SLASHER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "Wave Slasher",
  "releaseDate": "February 3, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Mega Gyarados released within the Electric Eye Theme Deck February 3, 2016"
 },
 {
  "id": "ELECTRIC_EYE_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/ELECTRIC_EYE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/ELECTRIC_EYE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "Electric Eye",
  "releaseDate": "February 3, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Pikachu released within the BREAKpoint Blisters February 3, 2016"
 },
 {
  "id": "BREAKPOINT_BLISTERS_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/BREAKPOINT_BLISTERS_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/BREAKPOINT_BLISTERS_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "BREAKpoint Blisters",
  "releaseDate": "February 3, 2016",
  "region": "North America",
  "description": "Large-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Deoxys released within the BREAKpoint Blisters February 3, 2016"
 },
 {
  "id": "BREAKPOINT_BLISTERS_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/BREAKPOINT_BLISTERS_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/BREAKPOINT_BLISTERS_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "BREAKpoint Blisters",
  "releaseDate": "February 3, 2016",
  "region": "North America",
  "description": "Large-sized, Orange Rainbow Holofoil, Black-backed Coin featuring Victini released within the BREAKpoint Blisters February 3, 2016; subsequently released within later shipments of the Steam Siege Blis"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_SILVER_20160203",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, error",
  "material": "silver",
  "release": "February 3, 2016",
  "releaseDate": "February 3, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, error upside-down back, Black-backed Coin featuring Genesect released within the BREAKpoint Blisters February 3, 2016"
 },
 {
  "id": "BREAKPOINT_BLISTERS_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/BREAKPOINT_BLISTERS_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/BREAKPOINT_BLISTERS_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Splotch Holofoil, ®",
  "material": "silver",
  "release": "BREAKpoint Blisters",
  "releaseDate": "February 27, 2016",
  "region": "North America",
  "description": "Regular-sized, Silver Splotch Holofoil, ® Trademark Black-backed Coin featuring Chansey released within the Japanese BREAK Starter Pack February 27, 2016"
 },
 {
  "id": "BREAK_STARTER_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/BREAK_STARTER_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/BREAK_STARTER_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "BREAK Starter Pack",
  "releaseDate": "March 1, 2016",
  "region": "North America",
  "description": "Large-sized, Blue Confetti Holofoil, Black-backed Coin featuring Primal Kyogre released within later shipments of the BREAKpoint Single Pack Blisters March 1, 2016; later released as one of several co"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Crosshatch Holofoil Coin",
  "material": "silver",
  "release": "March 18, 2016",
  "releaseDate": "March 18, 2016",
  "region": "Japan",
  "description": "Regular-sized, Silver Crosshatch Holofoil Coin featuring Zygarde Complete Forme released within the Zygarde-EX Perfect Battle Deck in Japan March 18, 2016 and in South Korea April 5, 2016"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_SILVER_20160318",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Speckle Holofoil Coin",
  "material": "silver",
  "release": "March 18, 2016",
  "releaseDate": "March 18, 2016",
  "region": "Japan",
  "description": "Regular-sized, Silver Speckle Holofoil Coin featuring Mega Audino released within the M Audino-EX Mega Battle Deck in Japan March 18, 2016 and in South Korea June 22, 2016"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_SILVER_20160427",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "April 27, 2016",
  "releaseDate": "April 27, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Pikachu released within the XY Trainer Kit: Pikachu Libre & Suicune April 27, 2016"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER_20160502",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "May 2, 2016",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Mawile released within the Mega Mawile-EX Premium Collection May 2, 2016"
 },
 {
  "id": "MEGA_MAWILEEX_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/MEGA_MAWILEEX_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/MEGA_MAWILEEX_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "Mega Mawile-EX Premium Collection",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Red Confetti Holofoil, Black-backed Coin featuring Mega Gyarados released within later shipments of the Wave Slasher Theme Deck May 2, 2016"
 },
 {
  "id": "WAVE_SLASHER_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/WAVE_SLASHER_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/WAVE_SLASHER_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Wave Slasher",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Red Cracked Ice Holofoil, Black-backed Coin featuring Mega Gyarados released within later shipments of the Wave Slasher Theme Deck May 2, 2016"
 },
 {
  "id": "WAVE_SLASHER_LARGESIZED_SILVER_20160502",
  "url": "src/assets/coins/bulbapedia/WAVE_SLASHER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/WAVE_SLASHER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Wave Slasher",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Gyarados released within later shipments of the Electric Eye Theme Deck May 2, 2016"
 },
 {
  "id": "ELECTRIC_EYE_LARGESIZED_SILVER_20160502",
  "url": "src/assets/coins/bulbapedia/ELECTRIC_EYE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/ELECTRIC_EYE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "Electric Eye",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Mega Gyarados released within later shipments of the Electric Eye Theme Deck May 2, 2016"
 },
 {
  "id": "ELECTRIC_EYE_LARGESIZED_SILVER_20160502_2",
  "url": "src/assets/coins/bulbapedia/ELECTRIC_EYE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/ELECTRIC_EYE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Electric Eye",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Blue-backed Coin featuring Lugia released within the Sky Guardian Theme Deck May 2, 2016"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER_20160502_2",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "May 2, 2016",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Green-backed Coin featuring Zygarde released within the Battle Ruler Theme Deck May 2, 2016"
 },
 {
  "id": "BATTLE_RULER_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/BATTLE_RULER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/BATTLE_RULER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Battle Ruler",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Chespin released within the Fates Collide Single Pack Blisters May 2, 2016; later released as one of three coins randomly included in XY "
 },
 {
  "id": "DATE_MAY_LARGESIZED_GOLD_20160502",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "May 2, 2016",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Fennekin released within the Fates Collide Single Pack Blisters May 2, 2016; later released as one of three coins randomly included in XY"
 },
 {
  "id": "DATE_MAY_LARGESIZED_GOLD_20160502_2",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "May 2, 2016",
  "releaseDate": "May 2, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Froakie released within the Fates Collide Single Pack Blisters May 2, 2016; later released as one of three coins randomly included in XY "
 },
 {
  "id": "DATE_MAY_REGULARSIZED_GOLD_20160505",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "May 5, 2016",
  "releaseDate": "May 5, 2016",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Squirtle released for participating in the Japanese Kamex Mega Battle held on May 5, 2016 in Nagoya; May 15 in Osaka; May 21-22 in Chib"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_GOLD_20160505_2",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "May 5, 2016",
  "releaseDate": "May 5, 2016",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Blastoise released for participating in the Japanese Kamex Mega Battle held on May 5, 2016 in Nagoya; May 15 in Osaka; May 21-22 in Chi"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD_20160723",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "July 23, 2016",
  "releaseDate": "July 23, 2016",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Pikachu released as one of three coins for earning 6 Play Points in the Japanese Pokémon Center Mega Battle held at participating Poké"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GREEN_20160723",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 23, 2016",
  "releaseDate": "July 23, 2016",
  "region": "Japan",
  "description": "Regular-sized, Green Speckle Holofoil, Black-backed Coin featuring Gardevoir released as one of three coins for earning 6 Play Points in the Japanese Pokémon Center Mega Battle held at participating P"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_GOLD_20160803",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "August 3, 2016",
  "releaseDate": "August 3, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Non Holofoil, Black-backed Coin featuring Hoopa Unbound released within the Ring of Lightning Theme Deck August 3, 2016"
 },
 {
  "id": "RING_OF_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/RING_OF_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/RING_OF_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Ring of Lightning",
  "releaseDate": "August 3, 2016",
  "region": "North America",
  "description": "Large-sized, Red Rainbow Holofoil, Black-backed Coin featuring Volcanion released within the Gears of Fire Theme Deck August 3, 2016"
 },
 {
  "id": "GEARS_OF_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/GEARS_OF_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/GEARS_OF_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Gears of Fire",
  "releaseDate": "September 16, 2016",
  "region": "North America",
  "description": "Regular-sized, Pink Non Holofoil, Black-backed Coin featuring Chansey released as one of three coins for purchasing an Expansion Pack 20th Anniversary Booster Box starting September 16, 2016"
 },
 {
  "id": "DATE_SEPTEMBER_REGULARSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "September 16, 2016",
  "releaseDate": "September 16, 2016",
  "region": "Japan",
  "description": "Regular-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Mew released as one of three coins for purchasing an Expansion Pack 20th Anniversary Booster Box starting September 16, 2016"
 },
 {
  "id": "DATE_SEPTEMBER_REGULARSIZED_GREEN_20160916",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 16, 2016",
  "releaseDate": "September 16, 2016",
  "region": "Japan",
  "description": "Regular-sized, Green Mirror Holofoil, Black-backed Coin featuring Bulbasaur released as one of three coins for purchasing an Expansion Pack 20th Anniversary Booster Box starting September 16, 2016"
 },
 {
  "id": "DATE_SEPTEMBER_LARGESIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 21, 2016",
  "releaseDate": "September 21, 2016",
  "region": "North America",
  "description": "Large-sized, Green Mirror Holofoil, Black-backed Coin featuring Rayquaza released within the Battle Arena Decks: Rayquaza vs. Keldeo September 21, 2016"
 },
 {
  "id": "DATE_SEPTEMBER_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 21, 2016",
  "releaseDate": "September 21, 2016",
  "region": "North America",
  "description": "Large-sized, Blue Mirror Holofoil, Black-backed Coin featuring Blastoise released within the Battle Arena Decks: Rayquaza vs. Keldeo September 21, 2016; later released within the Blastoise-GX Premium "
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER_20161001",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "October 1, 2016",
  "releaseDate": "October 1, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Xerneas released within later shipments of the Steam Siege Single Pack Blisters October 1, 2016; released again as one of several coins"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER_20161001_2",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "October 1, 2016",
  "releaseDate": "October 1, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Yveltal released within later shipments of the Steam Siege Single Pack Blisters October 1, 2016; released again as one of several coins"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_RED_20161001",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Pixel Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 1, 2016",
  "releaseDate": "October 1, 2016",
  "region": "North America",
  "description": "Large-sized, Red Pixel Holofoil, Black-backed Coin featuring Deoxys released as one of several coins randomly included within later shipments of the Steam Siege Blisters October 1, 2016; subsequently "
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER_20161001_3",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Corrected",
  "material": "silver",
  "release": "October 1, 2016",
  "releaseDate": "October 1, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Corrected Black-backed Coin featuring Genesect released within later shipments of the Steam Siege Blisters October 1, 2016, as one of several coins randomly include"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BRONZE.jpg",
  "name": "Large-sized, Bronze Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 5, 2016",
  "releaseDate": "October 5, 2016",
  "region": "North America",
  "description": "Large-sized, Bronze Mirror Holofoil, Black-backed Coin featuring Pikachu released within the Dragon Single Pack Blisters October 5, 2016"
 },
 {
  "id": "DRAGON_SINGLE_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DRAGON_SINGLE_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DRAGON_SINGLE_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Dragon Single Pack Blisters",
  "releaseDate": "October 5, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Pikachu released within later shipments of the XY Trainer Kit: Pikachu Libre & Suicune October 5, 2016; later released within the Sun & M"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "October 5, 2016",
  "releaseDate": "October 5, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Hoopa Unbound released within later shipments of the Ring of Lightning Theme Deck October 5, 2016"
 },
 {
  "id": "RING_OF_LARGESIZED_RED_20161005",
  "url": "src/assets/coins/bulbapedia/RING_OF_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/RING_OF_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Ring of Lightning",
  "releaseDate": "October 5, 2016",
  "region": "North America",
  "description": "Large-sized, Red Cracked Ice Holofoil, Black-backed Coin featuring Volcanion released within later shipments of the Gears of Fire Theme Deck October 5, 2016"
 },
 {
  "id": "GEARS_OF_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/GEARS_OF_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/GEARS_OF_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Pixel Holofoil, Black-backed",
  "material": "enamel",
  "release": "Gears of Fire",
  "releaseDate": "October 5, 2016",
  "region": "North America",
  "description": "Large-sized, Red Pixel Holofoil, Black-backed Coin featuring Volcanion released within later shipments of the Gears of Fire Theme Deck October 5, 2016"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER_20161025",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "October 25, 2016",
  "releaseDate": "October 25, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring the Team Plasma emblem released within the Articuno Legendary Battle Deck, Zapdos Legendary Battle Deck, and Moltres Legendary Battle D"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_PINK.jpg",
  "name": "Large-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "October 30, 2016",
  "releaseDate": "October 30, 2016",
  "region": "North America",
  "description": "Large-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Chansey released within the Mewtwo Mayhem Theme Deck at Toys \"R\" Us October 30, 2016, elsewhere on November 2, 2016"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER_20161030",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Starlight Holofoil, Black-backed",
  "material": "silver",
  "release": "October 30, 2016",
  "releaseDate": "October 30, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Starlight Holofoil, Black-backed Coin featuring Chansey released within the Pikachu Power Theme Deck at Toys \"R\" Us October 30, 2016"
 },
 {
  "id": "PIKACHU_POWER_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/PIKACHU_POWER_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/PIKACHU_POWER_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Pikachu Power",
  "releaseDate": "October 30, 2016",
  "region": "North America",
  "description": "Large-sized, Red Rainbow Holofoil, Black-backed Coin featuring Deoxys released as one of several coins randomly included within the Evolutions Blisters October 30, 2016"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_BRONZE_20161030",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BRONZE.jpg",
  "name": "Large-sized, Bronze Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 30, 2016",
  "releaseDate": "October 30, 2016",
  "region": "North America",
  "description": "Large-sized, Bronze Non Holofoil, Black-backed Coin featuring Victini released as one of several coins randomly included within the Evolutions Blisters October 30, 2016; later released within the seco"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Pixel Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 30, 2016",
  "releaseDate": "October 30, 2016",
  "region": "North America",
  "description": "Large-sized, Purple Pixel Holofoil, Black-backed Coin featuring Genesect released as one of several coins randomly included within the Evolutions Blisters October 30, 2016"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER_20161030_2",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "October 30, 2016",
  "releaseDate": "October 30, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Chespin released as one of several coins randomly included within the Evolutions Blisters October 30, 2016"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER_20161030_3",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "October 30, 2016",
  "releaseDate": "October 30, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Fennekin released as one of several coins randomly included within the Evolutions Blisters October 30, 2016"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER_20161030_4",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "October 30, 2016",
  "releaseDate": "October 30, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Froakie released as one of several coins randomly included within the Evolutions Blisters October 30, 2016; later included as one of f"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER_20161101",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "November 1, 2016",
  "releaseDate": "November 1, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Beedrill released within the Mega Beedrill-EX Premium Collection November 1, 2016"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER_20161101_2",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "November 1, 2016",
  "releaseDate": "November 1, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Mega Beedrill released within the Mega Beedrill-EX Premium Collection November 1, 2016"
 },
 {
  "id": "MEGA_BEEDRILLEX_LARGESIZED_PINK",
  "url": "src/assets/coins/bulbapedia/MEGA_BEEDRILLEX_LARGESIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/MEGA_BEEDRILLEX_LARGESIZED_PINK.jpg",
  "name": "Large-sized, Pink Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Mega Beedrill-EX Premium Collection",
  "releaseDate": "November 2, 2016",
  "region": "North America",
  "description": "Large-sized, Pink Rainbow Holofoil, Black-backed Coin featuring Chansey released within later shipments of the Mewtwo Mayhem Theme Deck on November 2, 2016"
 },
 {
  "id": "MEWTWO_MAYHEM_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/MEWTWO_MAYHEM_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/MEWTWO_MAYHEM_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Mewtwo Mayhem",
  "releaseDate": "November 2, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Chansey released within later shipments of the Pikachu Power Theme Deck on November 2, 2016"
 },
 {
  "id": "PIKACHU_POWER_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/PIKACHU_POWER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/PIKACHU_POWER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "Pikachu Power",
  "releaseDate": "November 3, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Mega Absol released within later shipments of the Mega Absol-EX Premium Collection November 3, 2016"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER_20161118",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "November 18, 2016",
  "releaseDate": "November 18, 2016",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Mega Gengar released within the Collector Chest 2016 November 18, 2016"
 },
 {
  "id": "COLLECTOR_CHEST_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/COLLECTOR_CHEST_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/COLLECTOR_CHEST_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Collector Chest 2016",
  "releaseDate": "November 18, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Mega Salamence released within the Mega Salamence-EX Premium Collection November 18, 2016"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "November 18, 2016",
  "releaseDate": "November 18, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Mega Garchomp released within the Mega Garchomp-EX Premium Collection November 18, 2016"
 },
 {
  "id": "DATE_DECEMBER_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "December 1, 2016",
  "releaseDate": "December 1, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Primal Groudon released within the Giratina Three Pack Blister December 1, 2016"
 },
 {
  "id": "GIRATINA_THREE_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/GIRATINA_THREE_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/GIRATINA_THREE_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Giratina Three Pack Blister",
  "releaseDate": "December 1, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Primal Kyogre released within the Giratina Three Pack Blister December 1, 2016"
 },
 {
  "id": "GIRATINA_THREE_LARGESIZED_GOLD_20161201",
  "url": "src/assets/coins/bulbapedia/GIRATINA_THREE_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/GIRATINA_THREE_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "Giratina Three Pack Blister",
  "releaseDate": "December 1, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Pikachu released within the Giratina Three Pack Blister December 1, 2016; later released within the Xerneas and Yveltal Three Pack B"
 },
 {
  "id": "DATE_FEBRUARY_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_METAL_COIN.jpg",
  "name": "Metal Coin featuring the Team",
  "material": "metal",
  "release": "February 2017",
  "releaseDate": "February 2017",
  "region": "Japan",
  "description": "Metal Coin featuring the Team Rocket emblem on the obverse and a Poké Ball on the reverse, released within the 20th Anniversary Team Rocket Special Case February 2017"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GREEN_20161209",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 9, 2016",
  "releaseDate": "December 9, 2016",
  "region": "Japan",
  "description": "Regular-sized, Green Speckle Holofoil, Black-backed Coin featuring Rowlet, Litten, and Popplio released within the Decidueye-GX Starter Set Grass in Japan December 9, 2016 and in South Korea January 1"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_RED_20161209",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 9, 2016",
  "releaseDate": "December 9, 2016",
  "region": "Japan",
  "description": "Regular-sized, Red Speckle Holofoil, Black-backed Coin featuring Rowlet, Litten, and Popplio released within the Incineroar-GX Starter Set Fire in Japan December 9, 2016 and in South Korea January 12,"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_BLUE_20161209",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 9, 2016",
  "releaseDate": "December 9, 2016",
  "region": "Japan",
  "description": "Regular-sized, Blue Speckle Holofoil, Black-backed Coin featuring Rowlet, Litten, and Popplio released within the Primarina-GX Starter Set Water in Japan December 9, 2016 and in South Korea January 12"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "December 9, 2016",
  "releaseDate": "December 9, 2016",
  "region": "Japan",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring an octagonal Poké Ball design released within the Japanese Premium Trainer Box December 9, 2016; later released within the Korean Ly"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GOLD_20161223",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Speckle Holofoil, Black-backed",
  "material": "gold",
  "release": "December 23, 2016",
  "releaseDate": "December 23, 2016",
  "region": "Japan",
  "description": "Regular-sized, Gold Speckle Holofoil, Black-backed Coin featuring Rowlet, Litten, and Popplio given to participants who battled with all three of the Decidueye-GX, Incineroar-GX, and the Primarina-GX "
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 3, 2017",
  "releaseDate": "February 3, 2017",
  "region": "North America",
  "description": "Large-sized, Green Rainbow Holofoil, Black-backed Coin featuring Rowlet released within the Forest Shadow Theme Deck February 3, 2017; later released within the Celestial Storm Two Pack Blister August"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_RED_20170203",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 3, 2017",
  "releaseDate": "February 3, 2017",
  "region": "North America",
  "description": "Large-sized, Red Rainbow Holofoil, Black-backed Coin featuring Litten released within the Roaring Heat Theme Deck February 3, 2017"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 3, 2017",
  "releaseDate": "February 3, 2017",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Popplio released within the Bright Tide Theme Deck February 3, 2017; later included as one of four possible coins within the Mini Collec"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_SILVER_20170317",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Lath Holofoil, Black-backed",
  "material": "silver",
  "release": "March 17, 2017",
  "releaseDate": "March 17, 2017",
  "region": "Japan",
  "description": "Regular-sized, Silver Lath Holofoil, Black-backed Coin featuring Tapu Bulu released within the Tapu Bulu-GX Enhanced Starter Set in Japan March 17, 2017 and in South Korea April 27, 2017"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_SILVER_20170407",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "April 7, 2017",
  "releaseDate": "April 7, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Rowlet, Litten, and Popplio released within the Spring 2017 Collector Chest April 7, 2017"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_SILVER_20170407_2",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "April 7, 2017",
  "releaseDate": "April 7, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Camerupt released within the Mega Camerupt-EX Premium Collection April 7, 2017"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_SILVER_20170407_3",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "April 7, 2017",
  "releaseDate": "April 7, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Sharpedo released within the Mega Sharpedo-EX Premium Collection April 7, 2017"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_GOLD_20160417",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "April 17, 2016",
  "releaseDate": "April 17, 2016",
  "region": "North America",
  "description": "Large-sized, Gold Non Holofoil, Black-backed Coin featuring Victini included as one of three possible coins within the Sun & Moon Two Pack Blister April 17, 2017; later released as one of two coins wi"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_SILVER_20170421",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Speckle Holofoil, Black-backed",
  "material": "silver",
  "release": "April 21, 2017",
  "releaseDate": "April 21, 2017",
  "region": "Japan",
  "description": "Regular-sized, Silver Speckle Holofoil, Black-backed Coin featuring Rotom Pokédex released within the Ash vs Team Rocket Deck Kit in Japan April 21, 2017 and in South Korea September 28, 2017"
 },
 {
  "id": "DATE_APRIL_LARGESIZED_SILVER_20170421",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "April 21, 2017",
  "releaseDate": "April 21, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Alolan Raichu released within the Sun & Moon Trainer Kit: Lycanroc & Alolan Raichu April 21, 2017; later released as one of two coins "
 },
 {
  "id": "DATE_MAY_LARGESIZED_ORANGE_20170505",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 5, 2017",
  "releaseDate": "May 5, 2017",
  "region": "North America",
  "description": "Large-sized, Orange Rainbow Holofoil, Black-backed Coin featuring Solgaleo released within the Steel Sun Theme Deck May 5, 2017; later released as a possible coin within early 2020 shipments of the Ka"
 },
 {
  "id": "DATE_MAY_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 5, 2017",
  "releaseDate": "May 5, 2017",
  "region": "North America",
  "description": "Large-sized, Purple Rainbow Holofoil, Black-backed Coin featuring Lunala released within the Hidden Moon Theme Deck May 5, 2017; later released as a possible coin within the fourth series of Poké Ball"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER_20170505",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "May 5, 2017",
  "releaseDate": "May 5, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Metagross released within the Guardians Rising Blisters May 5, 2017; later released within some versions of Burning Shadows Three Pack"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER_20170505_2",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "May 5, 2017",
  "releaseDate": "May 5, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Lugia released within the Lugia Legendary Battle Deck May 5, 2017"
 },
 {
  "id": "LUGIA_LEGENDARY_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/LUGIA_LEGENDARY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/LUGIA_LEGENDARY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Lugia Legendary Battle Deck",
  "releaseDate": "May 5, 2017",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Ho-Oh released within the Ho-Oh Legendary Battle Deck May 5, 2017"
 },
 {
  "id": "HOOH_LEGENDARY_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/HOOH_LEGENDARY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/HOOH_LEGENDARY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Ho-Oh Legendary Battle Deck",
  "releaseDate": "May 13, 2017",
  "region": "North America",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Eevee given to customers who purchased 5 booster packs as part of the Eevee and Colorful Friends campaign at all Pokémon Centers and Po"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_SILVER_20170602",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "June 2, 2017",
  "releaseDate": "June 2, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Mega Tyranitar released within the Mega Tyranitar-EX Premium Collection June 2, 2017; later released as a possible coin within the"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "June 16, 2017",
  "releaseDate": "June 16, 2017",
  "region": "North America",
  "description": "Large-sized, Green Cracked Ice Holofoil, Black-backed Coin featuring Decidueye released within the Decidueye-GX Premium Collection June 16, 2017"
 },
 {
  "id": "DECIDUEYEGX_PREMIUM_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/DECIDUEYEGX_PREMIUM_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DECIDUEYEGX_PREMIUM_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Decidueye-GX Premium Collection",
  "releaseDate": "June 16, 2017",
  "region": "North America",
  "description": "Large-sized, Red Cracked Ice Holofoil, Black-backed Coin featuring Incineroar released within the Incineroar-GX Premium Collection June 16, 2017"
 },
 {
  "id": "INCINEROARGX_PREMIUM_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/INCINEROARGX_PREMIUM_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/INCINEROARGX_PREMIUM_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Incineroar-GX Premium Collection",
  "releaseDate": "June 16, 2017",
  "region": "North America",
  "description": "Large-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Primarina released within the Primarina-GX Premium Collection June 16, 2017"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_BLUE_20170616",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 16, 2017",
  "releaseDate": "June 16, 2017",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Black Kyurem released within the Battle Arena Decks: Black Kyurem vs. White Kyurem June 16, 2017"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 16, 2017",
  "releaseDate": "June 16, 2017",
  "region": "North America",
  "description": "Large-sized, Red Rainbow Holofoil, Black-backed Coin featuring White Kyurem released within the Battle Arena Decks: Black Kyurem vs. White Kyurem June 16, 2017"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_SILVER_201706",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "June 2017",
  "releaseDate": "June 2017",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Genesect released within the XY Premium Checklane Blisters June 2017; later released as one of two coins within the Kanto Friends Mini"
 },
 {
  "id": "DATE_JUNE_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_METAL_COIN.jpg",
  "name": "Metal Coin featuring Lillie on",
  "material": "metal",
  "release": "June 17, 2017",
  "releaseDate": "June 17, 2017",
  "region": "Japan",
  "description": "Metal Coin featuring Lillie on the obverse and Cosmog on the reverse, released within the Lillie & Cosmog Special Box in Japan June 16, 2017"
 },
 {
  "id": "LILLIE__LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/LILLIE__LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/LILLIE__LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "Lillie & Cosmog Special Box",
  "releaseDate": "July 3, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Zoroark released within some copies of the Guardians Rising Two Pack Blister July 3, 2017; later released within the Guardians Rising S"
 },
 {
  "id": "DATE_JULY_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 14, 2017",
  "releaseDate": "July 14, 2017",
  "region": "North America",
  "description": "Large-sized, Purple Rainbow Holofoil, Black-backed Coin featuring Espeon released within the Espeon-GX Premium Collection July 14, 2017; later released as one of several coins randomly included within"
 },
 {
  "id": "DATE_JULY_LARGESIZED_GRAY",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_GRAY.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_GRAY.jpg",
  "name": "Large-sized, Gray Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 14, 2017",
  "releaseDate": "July 14, 2017",
  "region": "North America",
  "description": "Large-sized, Gray Rainbow Holofoil, Black-backed Coin featuring Umbreon released within the Umbreon-GX Premium Collection July 14, 2017; later released as one of several coins randomly included within"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Frosted Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 4, 2017",
  "releaseDate": "August 4, 2017",
  "region": "North America",
  "description": "Large-sized, Orange Frosted Holofoil, Black-backed Coin featuring Lycanroc released within the Rock Steady Theme Deck August 4, 2017; later included as one of four possible coins within the Mini Colle"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_BLUE_20170804",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Bubbled Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 4, 2017",
  "releaseDate": "August 4, 2017",
  "region": "North America",
  "description": "Large-sized, Blue Bubbled Holofoil, Black-backed Coin featuring Alolan Ninetales released within the Luminous Frost Theme Deck August 4, 2017; later released within the Team Up Three Pack Blisters Feb"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_BLUE_20170804_2",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 4, 2017",
  "releaseDate": "August 4, 2017",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Lucario released within the Burning Shadows Blisters August 4, 2017; later released within the Cosmic Eclipse Single Pack Blisters Novem"
 },
 {
  "id": "DATE_SEPTEMBER_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 24, 2017",
  "releaseDate": "September 24, 2017",
  "region": "North America",
  "description": "Large-sized, Orange Mirror Holofoil, Black-backed Coin featuring Charizard released within the Charizard-GX Premium Collection September 24, 2017 at Target stores and at other retailers starting Octob"
 },
 {
  "id": "DATE_OCTOBER_METAL_COIN_20171021",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_METAL_COIN.jpg",
  "name": "Metal Coin featuring Vulpix on",
  "material": "metal",
  "release": "October 21, 2017",
  "releaseDate": "October 21, 2017",
  "region": "Japan",
  "description": "Metal Coin featuring Vulpix on the obverse and Alolan Vulpix on the reverse, released within the Vulpix's Crystal Season Special Box in Japan September 24, 2017"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER_20171103",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "November 3, 2017",
  "releaseDate": "November 3, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Hydreigon released within the Destruction Fang Theme Deck November 3, 2017; later released within the Unbroken Bonds Three Pack Blister"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_GOLD_20171103",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "November 3, 2017",
  "releaseDate": "November 3, 2017",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Kommo-o released within the Clanging Thunder Theme Deck November 3, 2017; later released within the Cosmic Eclipse Three Pack Blisters No"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_GREEN_20171103",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 3, 2017",
  "releaseDate": "November 3, 2017",
  "region": "North America",
  "description": "Large-sized, Green Rainbow Holofoil, Black-backed Coin featuring Shaymin released within the Crimson Invasion Three Pack Blisters November 3, 2017; later released as a possible coin within the Jirachi"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER_20171103_2",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Sheen Holofoil, Black-backed",
  "material": "silver",
  "release": "November 3, 2017",
  "releaseDate": "November 3, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Sheen Holofoil, Black-backed Coin featuring Deoxys released within the Crimson Invasion Single Pack Blisters November 3, 2017; later released as a possible coin within the first se"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_TEAL",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_TEAL.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_TEAL.jpg",
  "name": "Large-sized, Teal Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 3, 2017",
  "releaseDate": "November 3, 2017",
  "region": "North America",
  "description": "Large-sized, Teal Mirror Holofoil, Black-backed Coin featuring Manaphy released within the Crimson Invasion Single Pack Blisters November 3, 2017; later released as a possible coin within the first se"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER_20171103_3",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "November 3, 2017",
  "releaseDate": "November 3, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Zoroark released within the Shining Legends Special Collection—Zoroark-GX November 3, 2017; later released as a possible coin within t"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_RED_20171103",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 3, 2017",
  "releaseDate": "November 3, 2017",
  "region": "North America",
  "description": "Large-sized, Red Mirror Holofoil, Black-backed Coin featuring Buzzwole released within the Ultra Beasts GX Premium Collection—Buzzwole & Xurkitree November 3, 2017"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER_20171103_4",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "November 3, 2017",
  "releaseDate": "November 3, 2017",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Pheromosa released within the Ultra Beasts GX Premium Collection—Pheromosa & Celesteela November 3, 2017"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_SILVER_20171110",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "November 10, 2017",
  "releaseDate": "November 10, 2017",
  "region": "Japan",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Cosmog released within the Solgaleo-GX & Lunala-GX Legendary Starter Set in Japan November 10, 2017 and in South Korea February 9, 2"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_LIGHT",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_LIGHT.jpg",
  "name": "Large-sized, Light Blue Mirror Holofoil,",
  "material": "enamel",
  "release": "November 17, 2017",
  "releaseDate": "November 17, 2017",
  "region": "North America",
  "description": "Large-sized, Light Blue Mirror Holofoil, Black-backed Coin featuring Mew released within the Shining Legends Collector Chest November 17, 2017"
 },
 {
  "id": "DATE_NOVEMBER_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_METAL_COIN.jpg",
  "name": "Metal Coin featuring Pikachu's face",
  "material": "metal",
  "release": "November 17, 2017",
  "releaseDate": "November 17, 2017",
  "region": "North America",
  "description": "Metal Coin featuring Pikachu's face on the obverse and its tail on the reverse, released within the Premium Trainer's XY Collection November 17, 2017"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_GOLD_20171126",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "November 26, 2017",
  "releaseDate": "November 26, 2017",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring a VS design that could be redeemed for 1 Play Point by participating in side events held at the 1st Certified Champion's League 2018 To"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_SILVER_20171208",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "December 8, 2017",
  "releaseDate": "December 8, 2017",
  "region": "Japan",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring an octagonal Poké Ball design released within the Ultra Sun & Ultra Moon Premium Trainer Box December 8, 2017"
 },
 {
  "id": "DATE_JANUARY_LARGESIZED_YELLOW",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_LARGESIZED_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_LARGESIZED_YELLOW.jpg",
  "name": "Large-sized, Yellow Pixel Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 5, 2018",
  "releaseDate": "January 5, 2018",
  "region": "North America",
  "description": "Large-sized, Yellow Pixel Holofoil, Black-backed Coin featuring Raichu released within the Shining Legends Special Collection—Raichu-GX January 5, 2018"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_YELLOW",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_YELLOW.jpg",
  "name": "Large-sized, Yellow Gold Mirror Holofoil,",
  "material": "gold",
  "release": "February 2, 2018",
  "releaseDate": "February 2, 2018",
  "region": "North America",
  "description": "Large-sized, Yellow Gold Mirror Holofoil, Black-backed Coin featuring Garchomp released within the Mach Strike Theme Deck February 2, 2018"
 },
 {
  "id": "MACH_STRIKE_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/MACH_STRIKE_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/MACH_STRIKE_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Mach Strike",
  "releaseDate": "February 2, 2018",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Empoleon released within the Imperial Command Theme Deck February 2, 2018"
 },
 {
  "id": "IMPERIAL_COMMAND_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/IMPERIAL_COMMAND_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/IMPERIAL_COMMAND_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Imperial Command",
  "releaseDate": "February 2, 2018",
  "region": "North America",
  "description": "Large-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Dialga released within the Ultra Prism Three Pack Blisters February 2, 2018; later released within the second series of Poké Ball Ti"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_PINK.jpg",
  "name": "Large-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "February 2, 2018",
  "releaseDate": "February 2, 2018",
  "region": "North America",
  "description": "Large-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Palkia released within the Ultra Prism Single Pack Blisters February 2, 2018; later released within 2020 shipments of the Kanto Frie"
 },
 {
  "id": "DATE_FEBRUARY_METAL_COIN_20180210",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_METAL_COIN.jpg",
  "name": "Metal Coin featuring Mimikyu in",
  "material": "metal",
  "release": "February 10, 2018",
  "releaseDate": "February 10, 2018",
  "region": "Japan",
  "description": "Metal Coin featuring Mimikyu in its Disguised Form on the obverse and its Busted Form on the reverse, released within the It's Mimikyu Special Box February 10, 2018"
 },
 {
  "id": "DATE_MARCH_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "March 23, 2018",
  "releaseDate": "March 23, 2018",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Lycanroc released within the Spring 2018 Collector Chest March 23, 2018"
 },
 {
  "id": "SPRING_2018_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/SPRING_2018_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/SPRING_2018_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Spring 2018 Collector Chest",
  "releaseDate": "April 6, 2018",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Suicune released within the Legends of Johto GX Premium Collection April 6, 2018"
 },
 {
  "id": "LEGENDS_OF_LARGESIZED_LIGHT",
  "url": "src/assets/coins/bulbapedia/LEGENDS_OF_LARGESIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/LEGENDS_OF_LARGESIZED_LIGHT.jpg",
  "name": "Large-sized, Light Gold Mirror Holofoil,",
  "material": "gold",
  "release": "Legends of Johto GX Premium Collection",
  "releaseDate": "May 4, 2018",
  "region": "North America",
  "description": "Large-sized, Light Gold Mirror Holofoil, Black-backed Coin featuring Alolan Exeggutor released within the Tropical Takedown Theme Deck May 4, 2018; later released within the Unbroken Bonds Single Pack"
 },
 {
  "id": "DATE_MAY_LARGESIZED_LIGHT",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_LIGHT.jpg",
  "name": "Large-sized, Light Gold Mirror Holofoil,",
  "material": "gold",
  "release": "May 4, 2018",
  "releaseDate": "May 4, 2018",
  "region": "North America",
  "description": "Large-sized, Light Gold Mirror Holofoil, Black-backed Coin featuring Lycanroc released within the Twilight Rogue Theme Deck May 4, 2018; later released as one of several coins randomly included within"
 },
 {
  "id": "DATE_MAY_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 4, 2018",
  "releaseDate": "May 4, 2018",
  "region": "North America",
  "description": "Large-sized, Blue Mirror Holofoil, Black-backed Coin featuring Xerneas released within the Forbidden Light Three Pack Blisters May 4, 2018; subsequently released within late 2020 shipments of the Kant"
 },
 {
  "id": "DATE_MAY_LARGESIZED_RED_20180504",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 4, 2018",
  "releaseDate": "May 4, 2018",
  "region": "North America",
  "description": "Large-sized, Red Mirror Holofoil, Black-backed Coin featuring Yveltal released within the Forbidden Light Single Pack Blisters May 4, 2018"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_SILVER_20180601",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "June 1, 2018",
  "releaseDate": "June 1, 2018",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Rotom Pokédex released within the Sun & Moon Trainer Kit: Alolan Sandslash & Alolan Ninetales June 1, 2018"
 },
 {
  "id": "DATE_JULY_LARGESIZED_GOLD_20180706",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "July 6, 2018",
  "releaseDate": "July 6, 2018",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Landorus released within the Forces of Nature GX Premium Collection July 6, 2018"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_BLUE_20180713",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 13, 2018",
  "releaseDate": "July 13, 2018",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Metagross released as part of the TSUTAYA Pokémon Card Step Up Campaign in Japan starting July 13, 2018"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_INDIGO",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_INDIGO.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_INDIGO.jpg",
  "name": "Regular-sized, Indigo Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 13, 2018",
  "releaseDate": "July 13, 2018",
  "region": "Japan",
  "description": "Regular-sized, Indigo Mirror Holofoil, Black-backed Coin featuring Energy symbols awarded to those who purchased one of the nine GX Starter Decks at participating stores as part of the Pokémon Card Fr"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 3, 2018",
  "releaseDate": "August 3, 2018",
  "region": "North America",
  "description": "Large-sized, Green Rainbow Holofoil, Black-backed Coin featuring Sceptile released within the Leaf Charge Theme Deck August 3, 2018; later released as one of several coins randomly included within the"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_BLUE_20180803",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 3, 2018",
  "releaseDate": "August 3, 2018",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Swampert released within the Hydro Fury Theme Deck August 3, 2018; released again as one of five posible coins within the Galar Pals Min"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 3, 2018",
  "releaseDate": "August 3, 2018",
  "region": "North America",
  "description": "Large-sized, Red Mirror Holofoil, Black-backed Coin featuring Groudon released within the Celestial Storm Single Pack Blisters August 3, 2018"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_BLUE_20180803_2",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 3, 2018",
  "releaseDate": "August 3, 2018",
  "region": "North America",
  "description": "Large-sized, Blue Mirror Holofoil, Black-backed Coin featuring Kyogre released within the Celestial Storm Three Pack Blisters August 3, 2018"
 },
 {
  "id": "CELESTIAL_STORM_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/CELESTIAL_STORM_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/CELESTIAL_STORM_METAL_COIN.jpg",
  "name": "Metal Coin featuring Pikachu available",
  "material": "metal",
  "release": "Celestial Storm Three Pack Blisters",
  "releaseDate": "August 24, 2018",
  "region": "North America",
  "description": "Metal Coin featuring Pikachu available for purchase at the 2018 World Championships starting August 24, 2018"
 },
 {
  "id": "2018_WORLD_LARGESIZED_GRAY",
  "url": "src/assets/coins/bulbapedia/2018_WORLD_LARGESIZED_GRAY.jpg",
  "thumb": "src/assets/coins/bulbapedia/2018_WORLD_LARGESIZED_GRAY.jpg",
  "name": "Large-sized, Gray Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "2018 World Championships",
  "releaseDate": "September 7, 2018",
  "region": "North America",
  "description": "Large-sized, Gray Rainbow Holofoil, Black-backed Coin featuring Mega Charizard X released within the Battle Arena Deck—Mega Charizard X September 7, 2018"
 },
 {
  "id": "DATE_SEPTEMBER_LARGESIZED_BLUE_20180907",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 7, 2018",
  "releaseDate": "September 7, 2018",
  "region": "North America",
  "description": "Large-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Mega Blastoise released within the Battle Arena Deck—Mega Blastoise September 7, 2018"
 },
 {
  "id": "DATE_SEPTEMBER_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 2018",
  "releaseDate": "September 2018",
  "region": "Japan",
  "description": "Regular-sized, Red Rainbow Holofoil, Black-backed Coin featuring Lucario available as a Championship Point redemption prize in Japan following the culmination of the 2017-2018 season"
 },
 {
  "id": "DATE_SEPTEMBER_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "September 2018",
  "releaseDate": "September 2018",
  "region": "Japan",
  "description": "Regular-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Manaphy available as a Championship Point redemption prize in Japan following the culmination of the 2017-2018 season"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_PALE",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_PALE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_PALE.jpg",
  "name": "Large-sized, Pale Blue Rainbow Holofoil,",
  "material": "enamel",
  "release": "October 26, 2018",
  "releaseDate": "October 26, 2018",
  "region": "North America",
  "description": "Large-sized, Pale Blue Rainbow Holofoil, Black-backed Coin featuring Kyurem released within the Dragon Majesty Legends of Unova GX Premium Collection October 26, 2018"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_BRONZE_20181102",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BRONZE.jpg",
  "name": "Regular-sized, Bronze Gold Rainbow Holofoil,",
  "material": "gold",
  "release": "November 2, 2018",
  "releaseDate": "November 2, 2018",
  "region": "Japan",
  "description": "Regular-sized, Bronze Gold Rainbow Holofoil, ® Trademark Black-backed Coin featuring Pikachu awarded as one of two coins available to those who participated in the GX Ultra Shiny Battle events from No"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_BLUE_20181102",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Sheen Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 2, 2018",
  "releaseDate": "November 2, 2018",
  "region": "Japan",
  "description": "Regular-sized, Blue Sheen Holofoil, Black-backed Coin featuring Zekrom awarded as one of two coins available to those who participated in the GX Ultra Shiny Battle events from November 2, 2018 to Dece"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_RED_20181102",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 2, 2018",
  "releaseDate": "November 2, 2018",
  "region": "North America",
  "description": "Large-sized, Red Mirror Holofoil, Black-backed Coin featuring Entei released within the Blazing Volcano Theme Deck November 2, 2018; subsequently released within late 2020 shipments of the Kanto Power"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_LIGHT_20181102",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_LIGHT.jpg",
  "name": "Large-sized, Light Gold Mirror Holofoil,",
  "material": "gold",
  "release": "November 2, 2018",
  "releaseDate": "November 2, 2018",
  "region": "North America",
  "description": "Large-sized, Light Gold Mirror Holofoil, Black-backed Coin featuring Raikou released within the Storm Caller Theme Deck November 2, 2018; later released as one of four posible coins within the Galar P"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_SILVER_20181102",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "November 2, 2018",
  "releaseDate": "November 2, 2018",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Lugia released within the Lost Thunder Single Pack Blisters November 2, 2018; later released as a possible coin within the Vivid V"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_GOLD_20181102",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "November 2, 2018",
  "releaseDate": "November 2, 2018",
  "region": "North America",
  "description": "Large-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Ho-Oh released within the Lost Thunder Three Pack Blisters November 2, 2018"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_PINK_20181102",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_PINK.jpg",
  "name": "Large-sized, Pink Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 2, 2018",
  "releaseDate": "November 2, 2018",
  "region": "North America",
  "description": "Large-sized, Pink Mirror Holofoil, Black-backed Coin featuring Tapu Lele released within the Island Guardians GX Premium Collection November 2, 2018; later released as a possible coin within the fourt"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 6, 2018",
  "releaseDate": "November 6, 2018",
  "region": "North America",
  "description": "Large-sized, Purple Rainbow Holofoil, Black-backed Coin featuring Tapu Fini released within the Island Guardians GX Premium Pin Collection November 6, 2018"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_GOLD_20181116",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "November 16, 2018",
  "releaseDate": "November 16, 2018",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Eevee released within the Fall 2018 Collector Chest November 16, 2018"
 },
 {
  "id": "FALL_2018_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/FALL_2018_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/FALL_2018_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Fall 2018 Collector Chest",
  "releaseDate": "November 16, 2018",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Salamence released within the Dragon Majesty Special Collection—Salamence-GX November 16, 2018"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_GOLD_20181116_2",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "November 16, 2018",
  "releaseDate": "November 16, 2018",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring White Kyurem released within the Dragon Majesty Special Collection—White Kyurem-GX November 16, 2018"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "November 16, 2018",
  "releaseDate": "November 16, 2018",
  "region": "North America",
  "description": "Large-sized, Orange Cracked Ice Holofoil, Black-backed Coin featuring Solgaleo released as a possible coin within the second series of Poké Ball Tins November 16, 2018"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 23, 2018",
  "releaseDate": "November 23, 2018",
  "region": "Japan",
  "description": "Regular-sized, Red Speckle Holofoil, Black-backed Coin featuring Eevee released within the Flareon-GX Starter Set Fire in Japan November 23, 2018 and in South Korea November 29, 2018"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_BLUE_20181123",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 23, 2018",
  "releaseDate": "November 23, 2018",
  "region": "Japan",
  "description": "Regular-sized, Blue Speckle Holofoil, Black-backed Coin featuring Eevee released within the Vaporeon-GX Starter Set Water in Japan November 23, 2018 and in South Korea November 29, 2018"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_YELLOW",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_YELLOW.jpg",
  "name": "Regular-sized, Yellow Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 23, 2018",
  "releaseDate": "November 23, 2018",
  "region": "Japan",
  "description": "Regular-sized, Yellow Speckle Holofoil, Black-backed Coin featuring Eevee released within the Jolteon-GX Starter Set Lightning in Japan November 23, 2018 and in South Korea November 29, 2018"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GOLD_20181207",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "December 7, 2018",
  "releaseDate": "December 7, 2018",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring an octagonal Poké Ball design released within the TAG TEAM GX Premium Trainer Box December 7, 2018"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_BROWN",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_BROWN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_BROWN.jpg",
  "name": "Regular-sized, Brown Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 25, 2019",
  "releaseDate": "January 25, 2019",
  "region": "Japan",
  "description": "Regular-sized, Brown Mirror Holofoil, Black-backed Coin featuring Brock released within the Japanese Brock of Pewter City Gym Trainer Battle Deck January 25, 2019; later released within the Korean Oni"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_BLUE_20190125",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 25, 2019",
  "releaseDate": "January 25, 2019",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Misty released within the Japanese Misty of Cerulean City Gym Trainer Battle Deck January 25, 2019; later released within the Korean St"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "February 1, 2019",
  "releaseDate": "February 1, 2019",
  "region": "North America",
  "description": "Large-sized, Orange Cracked Ice Holofoil, Black-backed Coin featuring Charizard released within the Relentless Flame Theme Deck February 1, 2019; subsequently released as a possible coin in Trade and "
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_BLUE_20190201",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "February 1, 2019",
  "releaseDate": "February 1, 2019",
  "region": "North America",
  "description": "Large-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Blastoise released within the Torrential Cannon Theme Deck February 1, 2019; subsequently released within late 2020 shipments of the"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_RED_20190201",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "February 1, 2019",
  "releaseDate": "February 1, 2019",
  "region": "North America",
  "description": "Large-sized, Red Cracked Ice Holofoil, Black-backed Coin featuring Litten released within the Team Up Single Pack Blisters February 1, 2019 and later Team Up Stage 1 Blisters; subsequently released as"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_GREEN_20190223",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "February 23, 2019",
  "releaseDate": "February 23, 2019",
  "region": "North America",
  "description": "Large-sized, Green Cracked Ice Holofoil, Black-backed Coin featuring Rowlet released as a possible coin in Trade & Play Day Kits from February 23, 2019; later released within the Unified Minds Three P"
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "February 23, 2019",
  "releaseDate": "February 23, 2019",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Garchomp released as a possible coin in Trade & Play Day Kits from February 23, 2019; later released within Sword & Shield Three Pack Bli"
 },
 {
  "id": "DATE_MARCH_EXTRALARGESIZED_CARDBOARD",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_EXTRALARGESIZED_CARDBOARD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_EXTRALARGESIZED_CARDBOARD.jpg",
  "name": "Extra-large-sized, cardboard Coin featuring Pikachu",
  "material": "cardboard",
  "release": "March 15, 2019",
  "releaseDate": "March 15, 2019",
  "region": "Japan",
  "description": "Extra-large-sized, cardboard Coin featuring Pikachu released within the Sun & Moon Family Pokémon Card Game set in Japan March 15, 2019 and in South Korea May 3, 2019"
 },
 {
  "id": "DATE_MARCH_LARGESIZED_SILVER_20190329",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "March 29, 2019",
  "releaseDate": "March 29, 2019",
  "region": "Europe",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Detective Pikachu's hat released within the Detective Pikachu Collector Chest March 29, 2019 (Europe) or April 6, 2019 (North America), "
 },
 {
  "id": "DATE_APRIL_METAL_COIN_20190406",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_METAL_COIN.jpg",
  "name": "Metal Coin featuring Detective Pikachu's",
  "material": "metal",
  "release": "April 6, 2019",
  "releaseDate": "April 6, 2019",
  "region": "North America",
  "description": "Metal Coin featuring Detective Pikachu's hat on the obverse and a Pikachu tail-themed magnifying glass on the reverse, released within the Detective Pikachu Charizard-GX Special Case File April 6, 201"
 },
 {
  "id": "DATE_MAY_LARGESIZED_PURPLE_20190503",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 3, 2019",
  "releaseDate": "May 3, 2019",
  "region": "North America",
  "description": "Large-sized, Purple Mirror Holofoil, Black-backed Coin featuring Mewtwo released within the Battle Mind Theme Deck May 3, 2019; later released as one of several coins randomly included within the Rebe"
 },
 {
  "id": "DATE_MAY_LARGESIZED_LIGHT_20190503",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_LIGHT.jpg",
  "name": "Large-sized, Light Gold Mirror Holofoil,",
  "material": "gold",
  "release": "May 3, 2019",
  "releaseDate": "May 3, 2019",
  "region": "North America",
  "description": "Large-sized, Light Gold Mirror Holofoil, Black-backed Coin featuring Zeraora released within the Lightning Loop Theme Deck May 3, 2019; later released as one of several coins randomly included within "
 },
 {
  "id": "DATE_MAY_LARGESIZED_BLUE_20190503",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "May 3, 2019",
  "releaseDate": "May 3, 2019",
  "region": "North America",
  "description": "Large-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Popplio released within the Unbroken Bonds Single Pack Blisters May 3, 2019 and later Unbroken Bonds Stage 1 Blisters; released agai"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER_20190503",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "May 3, 2019",
  "releaseDate": "May 3, 2019",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Pikachu released within the Let's Play, Pikachu! Theme Deck May 3, 2019"
 },
 {
  "id": "LETS_PLAY_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/LETS_PLAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/LETS_PLAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "Let's Play, Pikachu!",
  "releaseDate": "May 3, 2019",
  "region": "North America",
  "description": "Large-sized, Silver Pixel Holofoil, Black-backed Coin featuring Eevee released within the Let's Play, Eevee! Theme Deck May 3, 2019"
 },
 {
  "id": "LETS_PLAY_LARGESIZED_SILVER_20190503",
  "url": "src/assets/coins/bulbapedia/LETS_PLAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/LETS_PLAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Let's Play, Eevee!",
  "releaseDate": "May 3, 2019",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Eevee released within later shipments of the Let's Play, Eevee! Theme Deck May 3, 2019"
 },
 {
  "id": "LETS_PLAY_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/LETS_PLAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/LETS_PLAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Psychedelic Holofoil, ®",
  "material": "silver",
  "release": "Let's Play, Eevee!",
  "releaseDate": "May 31, 2019",
  "region": "Japan",
  "description": "Regular-sized, Silver Psychedelic Holofoil, ® Trademark Black-backed Coin featuring Espeon and Deoxys released within the Espeon & Deoxys-GX TAG TEAM GX Starter Set in Japan May 31, 2019"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER_20190531",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "May 31, 2019",
  "releaseDate": "May 31, 2019",
  "region": "Japan",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, ® Trademark Black-backed Coin featuring Umbreon and Darkrai released within the Umbreon & Darkrai-GX TAG TEAM GX Starter Set in Japan May 31, 2019"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD_20190713",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, ™",
  "material": "gold",
  "release": "July 13, 2019",
  "releaseDate": "July 13, 2019",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, ™ Trademark Black-backed Coin featuring Energy symbols awarded to participants of the Pokémon Card Game Battle Event held nationwide in Japan starting July 13 to Augu"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_SILVER_20190718",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Psychedelic Holofoil, ™",
  "material": "silver",
  "release": "July 18, 2019",
  "releaseDate": "July 18, 2019",
  "region": "South Korea",
  "description": "Regular-sized, Silver Psychedelic Holofoil, ™ Trademark Black-backed Coin featuring Espeon and Deoxys released within the Korean Espeon & Deoxys-GX TAG TEAM GX Starter Set in South Korea July 18, 2019"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_SILVER_20190718_2",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "July 18, 2019",
  "releaseDate": "July 18, 2019",
  "region": "South Korea",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, ™ Trademark Black-backed Coin featuring Umbreon and Darkrai released within the Korean Umbreon & Darkrai-GX TAG TEAM GX Starter Set in South Korea July 18, "
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_BLUE_20190802",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "August 2, 2019",
  "releaseDate": "August 2, 2019",
  "region": "Japan",
  "description": "Regular-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Cosmog released in special Dream League box sets sold through Amazon starting August 2, 2019"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_SILVER_20190802",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "August 2, 2019",
  "releaseDate": "August 2, 2019",
  "region": "Japan",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Reshiram given to customers who purchased ¥2000 worth of Pokémon Trading Card Game merchandise as part of the Yamada Denki Pokémon C"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_GRAY",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GRAY.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GRAY.jpg",
  "name": "Large-sized, Gray Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 2, 2019",
  "releaseDate": "August 2, 2019",
  "region": "North America",
  "description": "Large-sized, Gray Rainbow Holofoil, Black-backed Coin featuring Necrozma released within the Laser Focus Theme Deck August 2, 2019"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_GOLD_20190802",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "August 2, 2019",
  "releaseDate": "August 2, 2019",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Dragonite released within the Soaring Storm Theme Deck August 2, 2019"
 },
 {
  "id": "SOARING_STORM_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/SOARING_STORM_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/SOARING_STORM_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Sheen Holofoil, Black-backed",
  "material": "enamel",
  "release": "Soaring Storm",
  "releaseDate": "August 2, 2019",
  "region": "North America",
  "description": "Large-sized, Blue Sheen Holofoil, Black-backed Coin featuring Empoleon released within the Unified Minds Single Pack Blisters August 2, 2019 and subsequent Unified Minds Stage 1 Blisters; released aga"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 8, 2019",
  "releaseDate": "August 8, 2019",
  "region": "Indonesia",
  "description": "Regular-sized, Green Confetti Holofoil, Black-backed Coin featuring Bulbasaur awarded to those who attended the First Impact Grand Launch Event was held in Jakarta, Indonesia from August 8 to August 1"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 8, 2019",
  "releaseDate": "August 8, 2019",
  "region": "Indonesia",
  "description": "Regular-sized, Red Confetti Holofoil, Black-backed Coin featuring Charmander awarded to those who attended the First Impact Grand Launch Event was held in Jakarta, Indonesia from August 8 to August 11"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_BLUE_20190808",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 8, 2019",
  "releaseDate": "August 8, 2019",
  "region": "Indonesia",
  "description": "Regular-sized, Blue Confetti Holofoil, Black-backed Coin featuring Squirtle awarded to those who attended the First Impact Grand Launch Event was held in Jakarta, Indonesia from August 8 to August 11,"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_GOLD_20190808",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Confetti Holofoil, Black-backed",
  "material": "gold",
  "release": "August 8, 2019",
  "releaseDate": "August 8, 2019",
  "region": "Indonesia",
  "description": "Regular-sized, Gold Confetti Holofoil, Black-backed Coin featuring Pikachu awarded to those who attended the First Impact Grand Launch Event was held in Jakarta, Indonesia from August 8 to August 11, "
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_PINK_20190808",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 8, 2019",
  "releaseDate": "August 8, 2019",
  "region": "Indonesia",
  "description": "Regular-sized, Pink Confetti Holofoil, Black-backed Coin featuring Mew awarded to those who attended the First Impact Grand Launch Event was held in Jakarta, Indonesia from August 8 to August 11, 2019"
 },
 {
  "id": "DATE_AUGUST_REGULARSIZED_SILVER_20190816",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "August 16, 2019",
  "releaseDate": "August 16, 2019",
  "region": "Japan",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring a Poké Ball design released within the Limited Collection Master Battle Set August 16, 2019"
 },
 {
  "id": "DATE_AUGUST_METAL_COIN_20190816",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_METAL_COIN.jpg",
  "name": "Metal Coin featuring Pikachu available",
  "material": "metal",
  "release": "August 16, 2019",
  "releaseDate": "August 16, 2019",
  "region": "North America",
  "description": "Metal Coin featuring Pikachu available for purchase at the 2019 World Championships starting August 16, 2019"
 },
 {
  "id": "2019_WORLD_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/2019_WORLD_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/2019_WORLD_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "2019 World Championships",
  "releaseDate": "September 6, 2019",
  "region": "North America",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Arceus given to customers who purchased ¥2000 worth of Pokémon Trading Card Game merchandise as part of the Yamada Denki Pokémon Coin "
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "October 4, 2019",
  "releaseDate": "October 4, 2019",
  "region": "North America",
  "description": "Large-sized, Green Cracked Ice Holofoil, Black-backed Coin featuring Rayquaza released within the Battle Arena Deck—Rayquaza-GX October 4, 2019"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_GOLD_20191004",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "October 4, 2019",
  "releaseDate": "October 4, 2019",
  "region": "North America",
  "description": "Large-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Ultra Necrozma released within the Battle Arena Deck—Ultra Necrozma-GX October 4, 2019"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_RED_20191101",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_RED.jpg",
  "name": "Large-sized, Red Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "November 1, 2019",
  "releaseDate": "November 1, 2019",
  "region": "North America",
  "description": "Large-sized, Red Cracked Ice Holofoil, Black-backed Coin featuring Groudon released within the Towering Heights Theme Deck November 1, 2019; later released within 2021 shipments of the Kanto Power Min"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_LIGHT_20191101",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_LIGHT.jpg",
  "name": "Large-sized, Light Blue Cracked Ice",
  "material": "enamel",
  "release": "November 1, 2019",
  "releaseDate": "November 1, 2019",
  "region": "North America",
  "description": "Large-sized, Light Blue Cracked Ice Holofoil, Black-backed Coin featuring Kyogre released within the Unseen Depths Theme Deck November 1, 2019"
 },
 {
  "id": "UNSEEN_DEPTHS_LARGESIZED_PINK",
  "url": "src/assets/coins/bulbapedia/UNSEEN_DEPTHS_LARGESIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/UNSEEN_DEPTHS_LARGESIZED_PINK.jpg",
  "name": "Large-sized, Pink Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Unseen Depths",
  "releaseDate": "November 22, 2019",
  "region": "North America",
  "description": "Large-sized, Pink Rainbow Holofoil, Black-backed Coin featuring Mew released within the Fall 2019 Collector Chest November 22, 2019; later released as a possible coin within the sixth series of Poké B"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_ORANGE_20191122",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "November 22, 2019",
  "releaseDate": "November 22, 2019",
  "region": "North America",
  "description": "Large-sized, Orange Cracked Ice Holofoil, Black-backed Coin featuring Charizard and Braixen released within the Tag Team Generations Premium Collection November 22, 2019"
 },
 {
  "id": "DATE_DECEMBER_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Starlight Holofoil, Black-backed",
  "material": "silver",
  "release": "December 6, 2019",
  "releaseDate": "December 6, 2019",
  "region": "North America",
  "description": "Large-sized, Silver Starlight Holofoil, Black-backed Coin featuring Pikachu released within the Let's Play Pokémon Box December 6, 2019"
 },
 {
  "id": "LETS_PLAY_LARGESIZED_SILVER_20191206",
  "url": "src/assets/coins/bulbapedia/LETS_PLAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/LETS_PLAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Starlight Holofoil, Black-backed",
  "material": "silver",
  "release": "Let's Play Pokémon Box",
  "releaseDate": "December 6, 2019",
  "region": "North America",
  "description": "Large-sized, Silver Starlight Holofoil, Black-backed Coin featuring Eevee released within the Let's Play Pokémon Box December 6, 2019"
 },
 {
  "id": "LETS_PLAY_REGULARSIZED_SILVER_20191129",
  "url": "src/assets/coins/bulbapedia/LETS_PLAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/LETS_PLAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Let's Play Pokémon Box",
  "releaseDate": "November 29, 2019",
  "region": "North America",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Grookey released within the V Starter Set Grass November 29, 2019"
 },
 {
  "id": "V_STARTER_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Smoke Holofoil, Black-backed",
  "material": "silver",
  "release": "V Starter Set Grass",
  "releaseDate": "November 29, 2019",
  "region": "Japan",
  "description": "Regular-sized, Silver Smoke Holofoil, Black-backed Coin featuring Scorbunny released within the V Starter Set Fire November 29, 2019"
 },
 {
  "id": "V_STARTER_REGULARSIZED_SILVER_20191129",
  "url": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "V Starter Set Fire",
  "releaseDate": "November 29, 2019",
  "region": "Japan",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Sobble released within the V Starter Set Water November 29, 2019"
 },
 {
  "id": "V_STARTER_REGULARSIZED_SILVER_20191129_2",
  "url": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Lightning Holofoil, Black-backed",
  "material": "silver",
  "release": "V Starter Set Water",
  "releaseDate": "November 29, 2019",
  "region": "Japan",
  "description": "Regular-sized, Silver Lightning Holofoil, Black-backed Coin featuring Morpeko released within the V Starter Set Lightning November 29, 2019"
 },
 {
  "id": "V_STARTER_REGULARSIZED_SILVER_20191129_3",
  "url": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Pixel Holofoil, Black-backed",
  "material": "silver",
  "release": "V Starter Set Lightning",
  "releaseDate": "November 29, 2019",
  "region": "Japan",
  "description": "Regular-sized, Silver Pixel Holofoil, Black-backed Coin featuring Stonjourner released within the V Starter Set Fighting November 29, 2019"
 },
 {
  "id": "V_STARTER_REGULARSIZED_SILVER_20191206",
  "url": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/V_STARTER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "V Starter Set Fighting",
  "releaseDate": "December 6, 2019",
  "region": "Japan",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring the Pokémon V symbol released within the Sword & Shield Premium Trainer Box December 6, 2019"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_YELLOW_20200104",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_YELLOW.jpg",
  "name": "Regular-sized, Yellow Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 4, 2020",
  "releaseDate": "January 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Yellow Speckle Holofoil, Black-backed Coin featuring Victini given away with the purchase of at least ¥1,500 worth of eligible TCG products at participating Yamada Denki stores from Jan"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "February 7, 2020",
  "releaseDate": "February 7, 2020",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Grookey, Scorbunny, and Sobble included in copies of Sword & Shield Coin Albums given away with the purchase of at least 2 VMAX Rising "
 },
 {
  "id": "DATE_FEBRUARY_LARGESIZED_GREEN_20200207",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 7, 2020",
  "releaseDate": "February 7, 2020",
  "region": "North America",
  "description": "Large-sized, Green Mirror Holofoil, Black-backed Coin featuring Grookey released within the Rillaboom Theme Deck February 7, 2020"
 },
 {
  "id": "RILLABOOM_THEME_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/RILLABOOM_THEME_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/RILLABOOM_THEME_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Rillaboom Theme Deck",
  "releaseDate": "February 7, 2020",
  "region": "North America",
  "description": "Large-sized, Orange Mirror Holofoil, Black-backed Coin featuring Scorbunny released within the Cinderace Theme Deck February 7, 2020"
 },
 {
  "id": "CINDERACE_THEME_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/CINDERACE_THEME_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/CINDERACE_THEME_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Cinderace Theme Deck",
  "releaseDate": "February 7, 2020",
  "region": "North America",
  "description": "Large-sized, Blue Mirror Holofoil, Black-backed Coin featuring Sobble released within the Inteleon Theme Deck February 7, 2020"
 },
 {
  "id": "INTELEON_THEME_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/INTELEON_THEME_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/INTELEON_THEME_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "Inteleon Theme Deck",
  "releaseDate": "March 27, 2020",
  "region": "North America",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Gigantamax Charizard released within the Charizard VMAX Starter Set March 27, 2020; later available in a second version of the set i"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_SILVER_20200327",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Glitter Holofoil, Black-backed",
  "material": "silver",
  "release": "March 27, 2020",
  "releaseDate": "March 27, 2020",
  "region": "Japan",
  "description": "Regular-sized, Silver Glitter Holofoil, Black-backed Coin featuring Gigantamax Grimmsnarl released within the Grimmsnarl VMAX Starter Set March 27, 2020"
 },
 {
  "id": "GRIMMSNARL_VMAX_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/GRIMMSNARL_VMAX_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/GRIMMSNARL_VMAX_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Grimmsnarl VMAX Starter Set",
  "releaseDate": "April 3, 2020",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Grookey, Scorbunny, and Sobble released within the Spring 2020 Collector Chest April 3, 2020"
 },
 {
  "id": "SPRING_2020_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/SPRING_2020_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/SPRING_2020_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Spring 2020 Collector Chest",
  "releaseDate": "April 3, 2020",
  "region": "North America",
  "description": "Large-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Kyogre released as a possible coin within the Galar Pals Mini Tins April 3, 2020"
 },
 {
  "id": "UNSEEN_DEPTHS_LARGESIZED_LIGHT",
  "url": "src/assets/coins/bulbapedia/UNSEEN_DEPTHS_LARGESIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/UNSEEN_DEPTHS_LARGESIZED_LIGHT.jpg",
  "name": "Large-sized, Light Purple Rainbow Holofoil,",
  "material": "enamel",
  "release": "Unseen Depths",
  "releaseDate": "April 3, 2020",
  "region": "North America",
  "description": "Large-sized, Light Purple Rainbow Holofoil, Black-backed Coin featuring Genesect released within early 2020 shipments of the Kanto Power Mini Tins"
 },
 {
  "id": "KANTO_POWER_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/KANTO_POWER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/KANTO_POWER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Kanto Power Mini Tins",
  "releaseDate": "May 1, 2020",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Zacian released within the Zacian Theme Deck May 1, 2020"
 },
 {
  "id": "DATE_MAY_LARGESIZED_GOLD_20200501",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "May 1, 2020",
  "releaseDate": "May 1, 2020",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Zamazenta released within the Zamazenta Theme Deck May 1, 2020"
 },
 {
  "id": "ZAMAZENTA_THEME_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/ZAMAZENTA_THEME_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/ZAMAZENTA_THEME_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Zamazenta Theme Deck",
  "releaseDate": "May 1, 2020",
  "region": "North America",
  "description": "Large-sized, Orange Mirror Holofoil, Black-backed Coin featuring Therian Forme Landorus released within the French Rebel Clash Three Pack Blisters May 1, 2020"
 },
 {
  "id": "DATE_MAY_LARGESIZED_GOLD_20200501_2",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "May 1, 2020",
  "releaseDate": "May 1, 2020",
  "region": "North America",
  "description": "Large-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Raichu released within the Rebel Clash Three Pack Blisters May 1, 2020; later released as a possible coin within the fifth series of"
 },
 {
  "id": "DATE_JUNE_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "June 21, 2020",
  "releaseDate": "June 21, 2020",
  "region": "North America",
  "description": "Jumbo-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Pikachu, Charizard, and Mewtwo released within the Battle Academy 2020 June 21, 2020"
 },
 {
  "id": "BATTLE_ACADEMY_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/BATTLE_ACADEMY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/BATTLE_ACADEMY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "Battle Academy 2020",
  "releaseDate": "July 3, 2020",
  "region": "North America",
  "description": "Large-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Zeraora released within the fifth series of Poké Ball Tins July 3, 2020; subsequently released within late 2020 shipments of the Gal"
 },
 {
  "id": "DATE_JULY_LARGESIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_LARGESIZED_ORANGE.jpg",
  "name": "Large-sized, Orange Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 3, 2020",
  "releaseDate": "July 3, 2020",
  "region": "North America",
  "description": "Large-sized, Orange Rainbow Holofoil, Black-backed Coin featuring Volcanion released as a possible coin within the fifth series of Poké Ball Tins July 3, 2020; later released as a possible coin within"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_PINK_20200710",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 2020",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, Pink Mirror Holofoil, Black-backed Coin featuring Marnie released within the Legendary Heartbeat Pokémon Card Gym Set July 10, 2020"
 },
 {
  "id": "LEGENDARY_HEARTBEAT_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/LEGENDARY_HEARTBEAT_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/LEGENDARY_HEARTBEAT_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Legendary Heartbeat Pokémon Card Gym Set",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, Green Non Holofoil, Black-backed Coin featuring Eevee; one of nine randomly included in playmat and coin sets given away with the purchase of any two V Starter Decks in one transaction "
 },
 {
  "id": "DATE_JULY_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 2020",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, Red Non Holofoil, Black-backed Coin featuring Eevee; one of nine randomly included in playmat and coin sets given away with the purchase of any two V Starter Decks in one transaction at"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_BLUE_20200710",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 2020",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, Blue Non Holofoil, Black-backed Coin featuring Eevee; one of nine randomly included in playmat and coin sets given away with the purchase of any two V Starter Decks in one transaction a"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_YELLOW_20200710",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_YELLOW.jpg",
  "name": "Regular-sized, Yellow Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 2020",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, Yellow Non Holofoil, Black-backed Coin featuring Eevee; one of nine randomly included in playmat and coin sets given away with the purchase of any two V Starter Decks in one transaction"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_PURPLE_20200710",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_PURPLE.jpg",
  "name": "Regular-sized, Purple Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 2020",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, Purple Non Holofoil, Black-backed Coin featuring Eevee; one of nine randomly included in playmat and coin sets given away with the purchase of any two V Starter Decks in one transaction"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_BROWN_20200710",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BROWN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_BROWN.jpg",
  "name": "Regular-sized, Brown Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 2020",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, Brown Non Holofoil, Black-backed Coin featuring Eevee; one of nine randomly included in playmat and coin sets given away with the purchase of any two V Starter Decks in one transaction "
 },
 {
  "id": "DATE_JULY_REGULARSIZED_DARK",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_DARK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_DARK.jpg",
  "name": "Regular-sized, Dark Gray Non Holofoil,",
  "material": "enamel",
  "release": "July 10, 2020",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, Dark Gray Non Holofoil, Black-backed Coin featuring Eevee; one of nine randomly included in playmat and coin sets given away with the purchase of any two V Starter Decks in one transact"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GRAY",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GRAY.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GRAY.jpg",
  "name": "Regular-sized, Gray Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 2020",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, Gray Non Holofoil, Black-backed Coin featuring Eevee; one of nine randomly included in playmat and coin sets given away with the purchase of any two V Starter Decks in one transaction a"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_WHITE",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_WHITE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_WHITE.jpg",
  "name": "Regular-sized, White Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 10, 2020",
  "releaseDate": "July 10, 2020",
  "region": "Japan",
  "description": "Regular-sized, White Non Holofoil, Black-backed Coin featuring Eevee; one of nine randomly included in playmat and coin sets given away with the purchase of any two V Starter Decks in one transaction "
 },
 {
  "id": "DATE_JULY_REGULARSIZED_RED_20200714",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 14, 2020",
  "releaseDate": "July 14, 2020",
  "region": "Japan",
  "description": "Regular-sized, Red Speckle Holofoil, Black-backed Coin featuring Pikachu included in special Pokémon Lotte Candy Assortment bags July 14, 2020"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_BLUE_20200814",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 14, 2020",
  "releaseDate": "August 14, 2020",
  "region": "North America",
  "description": "Large-sized, Blue Mirror Holofoil, Black-backed Coin featuring Galarian Darmanitan included in the Galarian Darmanitan Theme Deck August 14, 2020"
 },
 {
  "id": "GALARIAN_DARMANITAN_LARGESIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/GALARIAN_DARMANITAN_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/GALARIAN_DARMANITAN_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Galarian Darmanitan Theme Deck",
  "releaseDate": "August 14, 2020",
  "region": "North America",
  "description": "Large-sized, Green Mirror Holofoil, Black-backed Coin featuring Sirfetch'd included in the Galarian Sirfetch'd Theme Deck August 14, 2020; later released as a possible coin within the Evolving Skies T"
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_EMERALD",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_EMERALD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_EMERALD.jpg",
  "name": "Large-sized, Emerald Green Rainbow Holofoil,",
  "material": "enamel",
  "release": "August 14, 2020",
  "releaseDate": "August 14, 2020",
  "region": "North America",
  "description": "Large-sized, Emerald Green Rainbow Holofoil, Black-backed Coin featuring Shaymin released within the Darkness Ablaze Single Pack and Premium Checklane Blisters August 14, 2020 and subsequent Darkness "
 },
 {
  "id": "DATE_AUGUST_LARGESIZED_TEAL",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_TEAL.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_LARGESIZED_TEAL.jpg",
  "name": "Large-sized, Teal Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 14, 2020",
  "releaseDate": "August 14, 2020",
  "region": "North America",
  "description": "Large-sized, Teal Rainbow Holofoil, Black-backed Coin featuring Manaphy released within the Darkness Ablaze Three Pack Blisters August 14, 2020; later released within the Shining Fates Mini Tins March"
 },
 {
  "id": "DATE_EARLY_REGULARSIZED_WHITE",
  "url": "src/assets/coins/bulbapedia/DATE_EARLY_REGULARSIZED_WHITE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_EARLY_REGULARSIZED_WHITE.jpg",
  "name": "Regular-sized, White Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Early November 2020",
  "releaseDate": "Early November 2020",
  "region": "Japan",
  "description": "Regular-sized, White Non Holofoil, Black-backed Coin featuring Pikachu included with every Pokémon Card Game ZOZOTOWN Collection order from the ZOZOTOWN online store. Items could be ordered between Au"
 },
 {
  "id": "DATE_EARLY_REGULARSIZED_WHITE_2020",
  "url": "src/assets/coins/bulbapedia/DATE_EARLY_REGULARSIZED_WHITE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_EARLY_REGULARSIZED_WHITE.jpg",
  "name": "Regular-sized, White Non Holofoil, Black-backed",
  "material": "enamel",
  "release": "Early November 2020",
  "releaseDate": "Early November 2020",
  "region": "Japan",
  "description": "Regular-sized, White Non Holofoil, Black-backed Coin featuring Mew included with every Pokémon Card Game ZOZOTOWN Collection order from the ZOZOTOWN online store. Items could be ordered between August"
 },
 {
  "id": "DATE_SEPTEMBER_REGULARSIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_BRONZE.jpg",
  "name": "Regular-sized, Bronze Gold Rainbow Holofoil,",
  "material": "gold",
  "release": "September 18, 2020",
  "releaseDate": "September 18, 2020",
  "region": "Japan",
  "description": "Regular-sized, Bronze Gold Rainbow Holofoil, ™ Trademark Black-backed Coin featuring Pikachu released within the Amazing Volt Tackle Gigantic Pack Set September 18, 2020"
 },
 {
  "id": "DATE_SEPTEMBER_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "September 4, 2020",
  "releaseDate": "September 4, 2020",
  "region": "North America",
  "description": "Jumbo-sized, Silver Mirror Holofoil, Black-backed Coin featuring Eternatus included in North American versions of the Eternatus VMAX Premium Collection September 4, 2020"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_BLUE_20201002",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Sheen Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 2, 2020",
  "releaseDate": "October 2, 2020",
  "region": "North America",
  "description": "Large-sized, Blue Sheen Holofoil, Black-backed Coin featuring Blastoise released as one of three possible coins within the Galar Power Mini Tins October 2, 2020"
 },
 {
  "id": "GALAR_POWER_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/GALAR_POWER_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/GALAR_POWER_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Galar Power Mini Tins",
  "releaseDate": "October 2, 2020",
  "region": "North America",
  "description": "Large-sized, Purple Rainbow Holofoil, Black-backed Coin featuring Mewtwo released as one of three possible coins within the Galar Power Mini Tins October 2, 2020; later released within the Shining Fat"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_PINK_20201101",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_PINK.jpg",
  "name": "Large-sized, Pink Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 1, 2020",
  "releaseDate": "November 1, 2020",
  "region": "North America",
  "description": "Large-sized, Pink Mirror Holofoil, Black-backed Coin featuring Togepi, Cleffa, and Igglybuff included in the Small but Mighty Premium Collection November 1, 2020"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_GOLD_20201113",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "November 13, 2020",
  "releaseDate": "November 13, 2020",
  "region": "North America",
  "description": "Large-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Charizard included in the Charizard Theme Deck November 13, 2020"
 },
 {
  "id": "CHARIZARD_THEME_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/CHARIZARD_THEME_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/CHARIZARD_THEME_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Charizard Theme Deck",
  "releaseDate": "November 13, 2020",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Drednaw included in the Drednaw Theme Deck November 13, 2020"
 },
 {
  "id": "DREDNAW_THEME_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DREDNAW_THEME_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DREDNAW_THEME_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Drednaw Theme Deck",
  "releaseDate": "November 13, 2020",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Kommo-o released as a possible coin within the Vivid Voltage Three Pack Blisters November 13, 2020"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_GOLD_20201113_2",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "November 13, 2020",
  "releaseDate": "November 13, 2020",
  "region": "North America",
  "description": "Large-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Gigantamax Charizard included in the Fall 2020 Collector Chest November 13, 2020"
 },
 {
  "id": "FALL_2020_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/FALL_2020_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/FALL_2020_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "Fall 2020 Collector Chest",
  "releaseDate": "November 20, 2020",
  "region": "Japan",
  "description": "Regular-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Nessa released within the Nessa Shiny Star V Set November 20, 2020"
 },
 {
  "id": "DATE_NOVEMBER_METAL_COIN_20201120",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_METAL_COIN.jpg",
  "name": "Metal Coin featuring Zacian released",
  "material": "metal",
  "release": "November 20, 2020",
  "releaseDate": "November 20, 2020",
  "region": "North America",
  "description": "Metal Coin featuring Zacian released within the Sword & Shield Ultra-Premium Collection—Zacian & Zamazenta November 20, 2020; later available in the Sword & Shield Elite Trainer Box Plus—Zacian outsid"
 },
 {
  "id": "DATE_NOVEMBER_METAL_COIN_20201120_2",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_METAL_COIN.jpg",
  "name": "Metal Coin featuring Zamazenta released",
  "material": "metal",
  "release": "November 20, 2020",
  "releaseDate": "November 20, 2020",
  "region": "North America",
  "description": "Metal Coin featuring Zamazenta released within the Sword & Shield Ultra-Premium Collection—Zacian & Zamazenta November 20, 2020; later available in the Sword & Shield Elite Trainer Box Plus—Zamazenta "
 },
 {
  "id": "DATE_NOVEMBER_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "November 20, 2020",
  "releaseDate": "November 20, 2020",
  "region": "North America",
  "description": "Jumbo-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Grookey, Scorbunny, and Sobble released within the Galar Sidekicks Premium Collection November 20, 2020"
 },
 {
  "id": "DATE_LATE_LARGESIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_LATE_LARGESIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_LATE_LARGESIZED_BLUE.jpg",
  "name": "Large-sized, Blue Bubbled Holofoil, Black-backed",
  "material": "enamel",
  "release": "Late November 2020",
  "releaseDate": "Late November 2020",
  "region": "North America",
  "description": "Large-sized, Blue Bubbled Holofoil, Black-backed Coin featuring Manaphy released as a possible coin within the Vivid Voltage Stage 1 Blisters late November 2020"
 },
 {
  "id": "DATE_DECEMBER_LARGESIZED_SILVER_202012",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Starlight Holofoil, Black-backed",
  "material": "silver",
  "release": "December 2020",
  "releaseDate": "December 2020",
  "region": "North America",
  "description": "Large-sized, Silver Starlight Holofoil, Black-backed Coin featuring Grookey, Scorbunny, and Sobble released within the Spring 2020 Collector Chest of the Poké Ball Tin & Collector Chest 2-Pack repacka"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GREEN_20201204",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Green Speckle Holofoil, Black-backed Coin featuring Gigantamax Venusaur released within the Venusaur VMAX Starter Set December 4, 2020"
 },
 {
  "id": "VENUSAUR_VMAX_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/VENUSAUR_VMAX_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/VENUSAUR_VMAX_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "Venusaur VMAX Starter Set",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Blue Speckle Holofoil, Black-backed Coin featuring Gigantamax Blastoise released within the Blastoise VMAX Starter Set December 4, 2020"
 },
 {
  "id": "BLASTOISE_VMAX_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/BLASTOISE_VMAX_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/BLASTOISE_VMAX_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "Blastoise VMAX Starter Set",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Pikachu; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_PINK_20201204",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Pink Confetti Holofoil, Black-backed Coin featuring Galarian Ponyta; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GREEN_20201204_2",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Green Mirror Holofoil, Black-backed Coin featuring Rillaboom; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_RED_20201204",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Red Mirror Holofoil, Black-backed Coin featuring Cinderace; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_BLUE_20201204",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Inteleon; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_SILVER_20201204",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Speckle Holofoil, Black-backed",
  "material": "silver",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Silver Speckle Holofoil, Black-backed Coin featuring Wooloo; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_YELLOW",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_YELLOW.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_YELLOW.jpg",
  "name": "Regular-sized, Yellow Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Yellow Cracked Ice Holofoil, Black-backed Coin featuring Yamper; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_SILVER_20201204_2",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Zacian; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_SILVER_20201204_3",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Zamazenta; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_PINK_20201204_2",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "December 4, 2020",
  "releaseDate": "December 4, 2020",
  "region": "Japan",
  "description": "Regular-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Eternatus; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 4, 2020"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GOLD_20201205",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Speckle Holofoil, Black-backed",
  "material": "gold",
  "release": "December 5, 2020",
  "releaseDate": "December 5, 2020",
  "region": "Japan",
  "description": "Regular-sized, Gold Speckle Holofoil, Black-backed Coin featuring Eevee given to participants of V Starter Deck Beginner Enhanced Battle events held at participating Pokémon Card Gym venues from Decem"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_PINK_20201218",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "December 18, 2020",
  "releaseDate": "December 18, 2020",
  "region": "Japan",
  "description": "Regular-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Celebi released within the Forest of Okoya Celebi & Zarude Special Advance Ticket 7-Eleven Set December 18, 2020"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_RED_20210122",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Speckle Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 22, 2021",
  "releaseDate": "January 22, 2021",
  "region": "Japan",
  "description": "Regular-sized, Red Speckle Holofoil, Black-backed Coin featuring the Pokémon V symbol released within the Single Strike Premium Trainer Box January 22, 2021"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_BLUE_20210122",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "January 22, 2021",
  "releaseDate": "January 22, 2021",
  "region": "Japan",
  "description": "Regular-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring the Pokémon V symbol released within the Rapid Strike Premium Trainer Box January 22, 2021"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_RED_20210129",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "January 29, 2021",
  "releaseDate": "January 29, 2021",
  "region": "Hong Kong/Taiwan",
  "description": "Regular-sized, Red Mirror Holofoil, Black-backed Coin featuring a Poké Ball design included in the Traditional Chinese Premium Strength Box in Hong Kong and Taiwan January 29, 2021"
 },
 {
  "id": "DATE_JANUARY_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Confetti Holofoil, Black-backed",
  "material": "gold",
  "release": "January 29, 2021",
  "releaseDate": "January 29, 2021",
  "region": "Hong Kong/Taiwan",
  "description": "Regular-sized, Gold Confetti Holofoil, Black-backed Coin featuring Pikachu included in the Traditional Chinese Premium Strength Box in Hong Kong and Taiwan January 29, 2021"
 },
 {
  "id": "DATE_FEBRUARY_JUMBOSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_GREEN.jpg",
  "name": "Jumbo-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 5, 2021",
  "releaseDate": "February 5, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Green Mirror Holofoil, Black-backed Coin featuring Venusaur included in the Venusaur V Battle Deck and V Battle Deck—Venusaur vs. Blastoise February 5, 2021"
 },
 {
  "id": "DATE_FEBRUARY_JUMBOSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_BLUE.jpg",
  "name": "Jumbo-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 5, 2021",
  "releaseDate": "February 5, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Blue Mirror Holofoil, Black-backed Coin featuring Blastoise included in the Blastoise V Battle Deck and V Battle Deck—Venusaur vs. Blastoise February 5, 2021"
 },
 {
  "id": "DATE_MARCH_LARGESIZED_SILVER_20210305",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Starlight Holofoil, Black-backed",
  "material": "silver",
  "release": "March 5, 2021",
  "releaseDate": "March 5, 2021",
  "region": "North America",
  "description": "Large-sized, Silver Starlight Holofoil, Black-backed Coin featuring Hydreigon released within the Shining Fates Mini Tins March 5, 2021; later released within 2021 shipments of the Kanto Power Mini Ti"
 },
 {
  "id": "DATE_MARCH_LARGESIZED_SILVER_20210305_2",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "March 5, 2021",
  "releaseDate": "March 5, 2021",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Entei released within the Shining Fates Mini Tins March 5, 2021; later released as a possible coin within the Fusion Strike Three Pack"
 },
 {
  "id": "DATE_MARCH_JUMBOSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_PINK.jpg",
  "name": "Jumbo-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "March 5, 2021",
  "releaseDate": "March 5, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Crobat included in the Shining Fates Premium Collection—Shiny Crobat VMAX March 5, 2021"
 },
 {
  "id": "DATE_MARCH_JUMBOSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_BLUE.jpg",
  "name": "Jumbo-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "March 5, 2021",
  "releaseDate": "March 5, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Dragapult included in the Shining Fates Premium Collection—Shiny Dragapult VMAX March 5, 2021"
 },
 {
  "id": "DATE_MARCH_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "March 19, 2021",
  "releaseDate": "March 19, 2021",
  "region": "North America",
  "description": "Large-sized, Purple Cracked Ice Holofoil, Black-backed Coin featuring Mewtwo released as a possible coin within the Battle Styles Single Pack Blisters March 19, 2021"
 },
 {
  "id": "DATE_MARCH_JUMBOSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_RED.jpg",
  "name": "Jumbo-sized, Red Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "March 19, 2021",
  "releaseDate": "March 19, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Red Cracked Ice Holofoil, Black-backed Coin featuring Gigantamax Single Strike Style Urshifu included in the Spring 2021 Collector Chest March 19, 2021"
 },
 {
  "id": "DATE_MARCH_JUMBOSIZED_BLUE_20210319",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_BLUE.jpg",
  "name": "Jumbo-sized, Blue Wave Holofoil, Black-backed",
  "material": "enamel",
  "release": "March 19, 2021",
  "releaseDate": "March 19, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Blue Wave Holofoil, Black-backed Coin featuring Gigantamax Rapid Strike Style Urshifu included in the Spring 2021 Collector Chest March 19, 2021"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "April 23, 2021",
  "releaseDate": "April 23, 2021",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Calyrex released as one of two coins randomly included within the Silver Lance & Jet-Black Spirit Jumbo Pack Set April 23, 2021"
 },
 {
  "id": "DATE_APRIL_REGULARSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_APRIL_REGULARSIZED_PURPLE.jpg",
  "name": "Regular-sized, Purple Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "April 23, 2021",
  "releaseDate": "April 23, 2021",
  "region": "Japan",
  "description": "Regular-sized, Purple Mirror Holofoil, Black-backed Coin featuring Calyrex released as one of two coins randomly included within the Silver Lance & Jet-Black Spirit Jumbo Pack Set April 23, 2021"
 },
 {
  "id": "DATE_MAY_JUMBOSIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_ORANGE.jpg",
  "name": "Jumbo-sized, Orange Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 7, 2021",
  "releaseDate": "May 7, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Orange Mirror Holofoil, Black-backed Coin featuring Victini included in the Victini V Battle Deck and V Battle Deck—Victini vs. Gardevoir May 7, 2021"
 },
 {
  "id": "DATE_MAY_JUMBOSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_PURPLE.jpg",
  "name": "Jumbo-sized, Purple Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 7, 2021",
  "releaseDate": "May 7, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Purple Mirror Holofoil, Black-backed Coin featuring Gardevoir included in the Gardevoir V Battle Deck and V Battle Deck—Victini vs. Gardevoir May 7, 2021"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER_20210528",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "May 28, 2021",
  "releaseDate": "May 28, 2021",
  "region": "Japan",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Gigantamax Gengar included in the Gengar High-Class Decks May 28, 2021"
 },
 {
  "id": "DATE_MAY_REGULARSIZED_SILVER_20210528_2",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Psychedelic Holofoil, Black-backed",
  "material": "silver",
  "release": "May 28, 2021",
  "releaseDate": "May 28, 2021",
  "region": "Japan",
  "description": "Regular-sized, Silver Psychedelic Holofoil, Black-backed Coin featuring Gigantamax Inteleon included in the Inteleon High-Class Decks May 28, 2021"
 },
 {
  "id": "DATE_JUNE_JUMBOSIZED_SILVER_20210618",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "June 18, 2021",
  "releaseDate": "June 18, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Silver Cracked Ice Holofoil, Blue-backed Coin featuring Calyrex released within the Chilling Reign Pokémon Center Elite Trainer Box June 18, 2021"
 },
 {
  "id": "DATE_JUNE_JUMBOSIZED_SILVER_20210618_2",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "June 18, 2021",
  "releaseDate": "June 18, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Silver Cracked Ice Holofoil, Purple-backed Coin featuring Calyrex released within the Chilling Reign Pokémon Center Elite Trainer Box June 18, 2021"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_PURPLE.jpg",
  "name": "Large-sized, Purple Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 18, 2021",
  "releaseDate": "June 18, 2021",
  "region": "North America",
  "description": "Large-sized, Purple Rainbow Holofoil, Black-backed Coin featuring Genesect released as a possible coin within the three Chilling Reign Blister variants available June 18, 2021 and subsequent Chilling "
 },
 {
  "id": "DATE_JUNE_LARGESIZED_GREEN_20210618",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_GREEN.jpg",
  "name": "Large-sized, Green Sheen Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 18, 2021",
  "releaseDate": "June 18, 2021",
  "region": "North America",
  "description": "Large-sized, Green Sheen Holofoil, Black-backed Coin featuring Rayquaza released as a possible coin within the Chilling Reign Three Pack and Single Pack June 18, 2021 and subsequent Chilling Reign Sta"
 },
 {
  "id": "DATE_JUNE_LARGESIZED_SILVER_20210618",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "June 18, 2021",
  "releaseDate": "June 18, 2021",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Lucario released as a possible coin within the Chilling Reign Three Pack Blisters June 18, 2021; later released as a possible coin wit"
 },
 {
  "id": "DATE_JULY_CARDBOARD_CONFETTI",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_CARDBOARD_CONFETTI.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_CARDBOARD_CONFETTI.jpg",
  "name": "Cardboard Confetti Non-Holofoil Coin featuring",
  "material": "cardboard",
  "release": "July 9, 2021",
  "releaseDate": "July 9, 2021",
  "region": "Japan",
  "description": "Cardboard Confetti Non-Holofoil Coin featuring Pikachu released within the Sword & Shield Family Pokémon Card Game July 9, 2021"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD_20210709",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-Sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "July 9, 2021",
  "releaseDate": "July 9, 2021",
  "region": "Japan",
  "description": "Regular-Sized, Gold Cracked Ice Holofoil, Black-Backed Coin featuring Pikachu released within the Sword & Shield Family Pokémon Card Game Anytime, Anywhere Version July 9, 2021"
 },
 {
  "id": "DATE_MIDJULY_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_MIDJULY_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MIDJULY_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Mid-July 2021",
  "releaseDate": "Mid-July 2021",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Alolan Raichu released as a possible coin within Chilling Reign Two Pack Blisters in mid-July 2021"
 },
 {
  "id": "DATE_AUGUST_JUMBOSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_PINK.jpg",
  "name": "Jumbo-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "August 6, 2021",
  "releaseDate": "August 6, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Marnie included in the Marnie Premium Tournament Collection August 6, 2021"
 },
 {
  "id": "MARNIE_PREMIUM_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/MARNIE_PREMIUM_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/MARNIE_PREMIUM_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Marnie Premium Tournament Collection",
  "releaseDate": "August 23, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Eevee included in the Eevee 2021 Collector Chest August 23, 2021, 2021"
 },
 {
  "id": "EEVEE_2021_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/EEVEE_2021_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/EEVEE_2021_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "Eevee 2021 Collector Chest",
  "releaseDate": "August 27, 2021",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Suicune released as a possible coin within the Evolving Skies Three Pack and Single Pack Blisters August 27, 2021; later released as a"
 },
 {
  "id": "DATE_AUGUST_JUMBOSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "August 27, 2021",
  "releaseDate": "August 27, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Jolteon, Flareon, Umbreon, and Leafeon released within the Evolving Skies Pokémon Center Elite Trainer Box August 27, 2021"
 },
 {
  "id": "DATE_AUGUST_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "August 27, 2021",
  "releaseDate": "August 27, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Vaporeon, Espeon, Glaceon, and Sylveon released within the Evolving Skies Pokémon Center Elite Trainer Box August 27, 2021"
 },
 {
  "id": "DATE_OCTOBER_LARGESIZED_SILVER_20211008",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "October 8, 2021",
  "releaseDate": "October 8, 2021",
  "region": "North America",
  "description": "Large-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Alolan Ninetales released within later shipments of the Chilling Reign Premium Checklane Blisters starting October 8, 2021; later rele"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_BRONZE.jpg",
  "name": "Jumbo-sized, Bronze Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 8, 2021",
  "releaseDate": "October 8, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Bronze Mirror Holofoil, Black-backed Coin featuring Noivern released within the Noivern V Battle Deck and V Battle Deck—Rayquaza vs. Noivern October 8, 2021"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_BRONZE_20211008",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_BRONZE.jpg",
  "name": "Jumbo-sized, Bronze Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 8, 2021",
  "releaseDate": "October 8, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Bronze Mirror Holofoil, Black-backed Coin featuring Rayquaza released within the Rayquaza V Battle Deck and V Battle Deck—Rayquaza vs. Noivern October 8, 2021"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Pixel Holofoil, Black-backed",
  "material": "gold",
  "release": "October 8, 2021",
  "releaseDate": "October 8, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Gold Pixel Holofoil, Black-backed Coin featuring Charizard released within the Celebrations Special Collection—V Memories October 8, 2021"
 },
 {
  "id": "DATE_OCTOBER_METAL_COIN_20211008",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_METAL_COIN.jpg",
  "name": "Metal Coin featuring the Pikachu",
  "material": "metal",
  "release": "October 8, 2021",
  "releaseDate": "October 8, 2021",
  "region": "North America",
  "description": "Metal Coin featuring the Pikachu 25th Anniversary emblem released within the Celebrations Pokémon Center Elite Trainer Box and the Celebrations Ultra-Premium Collection October 8, 2021"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_GOLD_20211008",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Sheen Holofoil, Black-backed",
  "material": "gold",
  "release": "October 8, 2021",
  "releaseDate": "October 8, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Gold Sheen Holofoil, Black-backed Coin featuring the Pikachu 25th Anniversary emblem released within the Celebrations Collection—Dragapult Prime October 8, 2021"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_GOLD_20211008_2",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Starlight Holofoil, Black-backed",
  "material": "gold",
  "release": "October 8, 2021",
  "releaseDate": "October 8, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Gold Starlight Holofoil, Black-backed Coin featuring the Pikachu 25th Anniversary emblem released within the Celebrations Collector Chest October 8, 2021"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Starlight Holofoil, Black-backed",
  "material": "silver",
  "release": "October 8, 2021",
  "releaseDate": "October 8, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Silver Starlight Holofoil, Black-backed Coin featuring the Pikachu 25th Anniversary emblem released within the Celebrations Mini Tins October 8, 2021"
 },
 {
  "id": "CELEBRATIONS_MINI_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/CELEBRATIONS_MINI_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/CELEBRATIONS_MINI_REGULARSIZED_GOLD.jpg",
  "name": "Regular-Sized, Gold Non Holofoil, Tan-backed",
  "material": "gold",
  "release": "Celebrations Mini Tins",
  "releaseDate": "October 22, 2021",
  "region": "Japan",
  "description": "Regular-Sized, Gold Non Holofoil, Tan-backed Coin featuring Pikachu released within the 25th Anniversary Golden Box October 22, 2021"
 },
 {
  "id": "25TH_ANNIVERSARY_REGULARSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/25TH_ANNIVERSARY_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/25TH_ANNIVERSARY_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Splotch Holofoil, ™",
  "material": "silver",
  "release": "25th Anniversary Golden Box",
  "releaseDate": "October 22, 2021",
  "region": "Japan",
  "description": "Regular-sized, Silver Splotch Holofoil, ™ Trademark Black-backed Coin featuring Chansey released within the Japanese 25th Anniversary Collection Special Set October 22, 2021"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_BLUE_20211105",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 5, 2021",
  "releaseDate": "November 5, 2021",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Zacian included in the Zacian & Zamazenta vs Eternatus Special Deck Set November 5, 2021"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_PINK_20211105",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 5, 2021",
  "releaseDate": "November 5, 2021",
  "region": "Japan",
  "description": "Regular-sized, Pink Mirror Holofoil, Black-backed Coin featuring Zamazenta included in the Zacian & Zamazenta vs Eternatus Special Deck Set November 5, 2021"
 },
 {
  "id": "DATE_NOVEMBER_LARGESIZED_LIGHT_20211112",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_LARGESIZED_LIGHT.jpg",
  "name": "Large-sized, Light Gold Mirror Holofoil,",
  "material": "gold",
  "release": "November 12, 2021",
  "releaseDate": "November 12, 2021",
  "region": "North America",
  "description": "Large-sized, Light Gold Mirror Holofoil, Black-backed Coin featuring Dragonite released within the Fusion Strike Three Pack and Single Pack Blisters November 12, 2021; later released in 2021 shipments"
 },
 {
  "id": "DATE_NOVEMBER_JUMBOSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_JUMBOSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_JUMBOSIZED_PINK.jpg",
  "name": "Jumbo-sized, Pink Smoke Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 12, 2021",
  "releaseDate": "November 12, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Pink Smoke Holofoil, Black-backed Coin featuring Mew released within the Fusion Strike Pokémon Center Elite Trainer Box November 12, 2021"
 },
 {
  "id": "DATE_DECEMBER_JUMBOSIZED_LIGHT",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_JUMBOSIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_JUMBOSIZED_LIGHT.jpg",
  "name": "Jumbo-sized, Light Gold Rainbow Holofoil,",
  "material": "gold",
  "release": "December 3, 2021",
  "releaseDate": "December 3, 2021",
  "region": "North America",
  "description": "Jumbo-sized, Light Gold Rainbow Holofoil, Black-backed Coin featuring Vaporeon, Jolteon, and Flareon released within the Vaporeon VMAX Premium Collection, Jolteon VMAX Premium Collection, and Flareon "
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GOLD_20211216",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Eevee; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 and on the"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_PINK_20211216",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Pink Confetti Holofoil, Black-backed Coin featuring Morpeko; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 and on"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GREEN_20211216",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Green Mirror Holofoil, Black-backed Coin featuring Turtwig; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 and on "
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_ORANGE",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_ORANGE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_ORANGE.jpg",
  "name": "Regular-sized, Orange Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Orange Mirror Holofoil, Black-backed Coin featuring Chimchar; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 and o"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_BLUE_20211216",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Piplup; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 and on th"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_PINK_20211216_2",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Pink Mirror Holofoil, Black-backed Coin featuring Sylveon; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 and on t"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GREEN_20211216_2",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Green Cracked Ice Holofoil, Black-backed Coin featuring Rayquaza; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 a"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_BLUE_20211216_2",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Dialga; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 and "
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_PINK_20211216_3",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_PINK.jpg",
  "name": "Regular-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Palkia; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 and "
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_SILVER_20211216",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "December 16, 2021",
  "releaseDate": "December 16, 2021",
  "region": "Japan",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Arceus; one of ten available from capsule toy vending machines present at Pokémon Centers across Japan from December 16, 2021 an"
 },
 {
  "id": "DATE_DECEMBER_REGULARSIZED_GOLD_20211217",
  "url": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_DECEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Japanese",
  "material": "gold",
  "release": "December 17, 2021",
  "releaseDate": "December 17, 2021",
  "region": "Japan",
  "description": "Regular-sized, Gold Non Holofoil, Japanese ™ Trademark Black-backed Coin featuring Pikachu available within a sealed paper playmat given away at Pokémon Centers to promote the Start Deck 100 until sup"
 },
 {
  "id": "DATE_JANUARY_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "January 11, 2022",
  "releaseDate": "January 11, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Mirror Holofoil, Black-backed Coin featuring Blastoise released within the Fusion Strike Two Pack Blisters January 11, 2022; later released within the Brilliant Stars Three Pack Bl"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_GOLD_20220204",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "February 4, 2022",
  "releaseDate": "February 4, 2022",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Chansey released within the Pokémon Coin Album February 5, 2022"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_GOLD_20220204_2",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "February 4, 2022",
  "releaseDate": "February 4, 2022",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Eevee released within the Pokémon Coin Album February 5, 2022"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_GOLD_20220204_3",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "February 4, 2022",
  "releaseDate": "February 4, 2022",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Gardevoir released within the Pokémon Coin Album February 5, 2022"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_GOLD_20220204_4",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "February 4, 2022",
  "releaseDate": "February 4, 2022",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Umbreon and Darkrai released within the Pokémon Coin Album February 5, 2022"
 },
 {
  "id": "POKMON_COIN_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/POKMON_COIN_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/POKMON_COIN_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Pokémon Coin Album",
  "releaseDate": "February 4, 2022",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Mew released within the Pokémon Coin Album February 5, 2022"
 },
 {
  "id": "DATE_FEBRUARY_REGULARSIZED_GOLD_20220204_5",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Speckle Holofoil, Black-backed",
  "material": "gold",
  "release": "February 4, 2022",
  "releaseDate": "February 4, 2022",
  "region": "Japan",
  "description": "Regular-sized, Gold Speckle Holofoil, Black-backed Coin featuring the Pokémon V symbol released within the VSTAR Premium Trainer Box January 14, 2022"
 },
 {
  "id": "DATE_JANUARY_JUMBOSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "January 21, 2022",
  "releaseDate": "January 21, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Gold Mirror Holofoil, Black-backed Coin featuring Venusaur released within the Sword & Shield Knock Out Collection January 21, 2022; later released within the Brilliant Stars Single Pack,"
 },
 {
  "id": "DATE_FEBRUARY_JUMBOSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "February 25, 2022",
  "releaseDate": "February 25, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Gold Mirror Holofoil, Black-backed Coin featuring Pikachu released within the Brilliant Stars Three Pack and Single Pack Blisters, as well as the Lightning Stacking Tin February 25, 2022;"
 },
 {
  "id": "DATE_FEBRUARY_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "February 25, 2022",
  "releaseDate": "February 25, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Mirror Holofoil, Black-backed Coin featuring Eevee included within the Brilliant Stars Single Pack Blisters February 25, 2022; later released within the eighth series of Poké Ball "
 },
 {
  "id": "DATE_FEBRUARY_JUMBOSIZED_SILVER_20220225",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Rainbow Holofoil, Black-backed",
  "material": "silver",
  "release": "February 25, 2022",
  "releaseDate": "February 25, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Rainbow Holofoil, Black-backed Coin featuring Arceus released within the Brilliant Stars Pokémon Center Elite Trainer Box February 25, 2022"
 },
 {
  "id": "DATE_FEBRUARY_JUMBOSIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_BRONZE.jpg",
  "name": "Jumbo-sized, Bronze Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "February 25, 2022",
  "releaseDate": "February 25, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Bronze Mirror Holofoil, Black-backed Coin featuring Lycanroc released within the Lycanroc V Battle Deck and V Battle Deck—Lycanroc vs. Corviknight February 25, 2022"
 },
 {
  "id": "DATE_FEBRUARY_JUMBOSIZED_SILVER_20220225_2",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "February 25, 2022",
  "releaseDate": "February 25, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Mirror Holofoil, Black-backed Coin featuring Corviknight released within the Corviknight V Battle Deck and V Battle Deck—Lycanroc vs. Corviknight February 25, 2022"
 },
 {
  "id": "DATE_FEBRUARY_JUMBOSIZED_SILVER_20220225_3",
  "url": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_FEBRUARY_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "February 25, 2022",
  "releaseDate": "February 25, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Mirror Holofoil, Black-backed Coin featuring Grookey released within the Grass Stacking Tin February 25, 2022"
 },
 {
  "id": "GRASS_STACKING_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/GRASS_STACKING_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/GRASS_STACKING_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "Grass Stacking Tin",
  "releaseDate": "February 25, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Mirror Holofoil, Black-backed Coin featuring Sobble released within the Water Stacking Tin February 25, 2022"
 },
 {
  "id": "WATER_STACKING_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/WATER_STACKING_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/WATER_STACKING_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Water Stacking Tin",
  "releaseDate": "February 25, 2022",
  "region": "North America",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Lucario released within the Lucario VSTAR Starter Set February 25, 2022"
 },
 {
  "id": "LUCARIO_VSTAR_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/LUCARIO_VSTAR_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/LUCARIO_VSTAR_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Lucario VSTAR Starter Set",
  "releaseDate": "February 25, 2022",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Darkrai released within the Darkrai VSTAR Starter Set February 25, 2022"
 },
 {
  "id": "DARKRAI_VSTAR_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DARKRAI_VSTAR_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DARKRAI_VSTAR_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "Darkrai VSTAR Starter Set",
  "releaseDate": "March 2022",
  "region": "Japan",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Suicune released as a possible coin within later shipments of the Galar Power Mini Tins March 2022"
 },
 {
  "id": "GALAR_POWER_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/GALAR_POWER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/GALAR_POWER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "Galar Power Mini Tins",
  "releaseDate": "March 2022",
  "region": "North America",
  "description": "Large-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Suicune released as a possible coin within later shipments of the Galar Power Mini Tins March 2022"
 },
 {
  "id": "DATE_MARCH_REGULARSIZED_SILVER_202203",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_REGULARSIZED_SILVER.jpg",
  "name": "Regular-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "March 2022",
  "releaseDate": "March 2022",
  "region": "Japan",
  "description": "Regular-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring the Pokémon V symbol released within the Start Deck 100 CoroCoro Comic Version March 2022"
 },
 {
  "id": "DATE_MARCH_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Speckle Holofoil, White-backed",
  "material": "silver",
  "release": "March 25, 2022",
  "releaseDate": "March 25, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Speckle Holofoil, White-backed Coin featuring Arceus released within the Collector Bundle March 25, 2022"
 },
 {
  "id": "COLLECTOR_BUNDLE_JUMBOSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/COLLECTOR_BUNDLE_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/COLLECTOR_BUNDLE_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "Collector Bundle",
  "releaseDate": "March 25, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Pikachu, Cinderace, and Eevee released within the Battle Academy 2022 March 25, 2022"
 },
 {
  "id": "BATTLE_ACADEMY_JUMBOSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/BATTLE_ACADEMY_JUMBOSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/BATTLE_ACADEMY_JUMBOSIZED_BLUE.jpg",
  "name": "Jumbo-sized, Blue Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Battle Academy 2022",
  "releaseDate": "April 8, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Blue Rainbow Holofoil, Black-backed Coin featuring Lucario included in North American versions of the Lucario VSTAR Premium Collection April 8, 2022"
 },
 {
  "id": "DATE_MAY_LARGESIZED_SILVER_20220506",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Speckle Holofoil, White-backed",
  "material": "silver",
  "release": "May 6, 2022",
  "releaseDate": "May 6, 2022",
  "region": "North America",
  "description": "Large-sized, Silver Speckle Holofoil, White-backed Coin featuring Arceus released within the Spring 2022 Collector Chest May 6, 2022"
 },
 {
  "id": "SPRING_2022_JUMBOSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/SPRING_2022_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/SPRING_2022_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Spring 2022 Collector Chest",
  "releaseDate": "May 27, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Gold Mirror Holofoil, Black-backed Coin featuring Charizard released within the Astral Radiance Three Pack Blisters May 27, 2022; later released within the Lost Origin Single Pack and Pre"
 },
 {
  "id": "DATE_MAY_JUMBOSIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "May 27, 2022",
  "releaseDate": "May 27, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Mirror Holofoil, Black-backed Coin featuring Zeraora released within the Astral Radiance Single Pack, Premium Checklane, and Stage 1 Blisters May 27, 2022; later released within th"
 },
 {
  "id": "DATE_MAY_JUMBOSIZED_SILVER_20220527",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Spray Holofoil, Black-backed",
  "material": "silver",
  "release": "May 27, 2022",
  "releaseDate": "May 27, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Spray Holofoil, Black-backed Coin featuring Darkrai released within the Astral Radiance Pokémon Center Elite Trainer Box May 27, 2022"
 },
 {
  "id": "DATE_MAY_JUMBOSIZED_BRONZE",
  "url": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_BRONZE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MAY_JUMBOSIZED_BRONZE.jpg",
  "name": "Jumbo-sized, Bronze Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "May 27, 2022",
  "releaseDate": "May 27, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Bronze Rainbow Holofoil, Black-backed Coin featuring Kleavor included in North American versions of the Kleavor VSTAR Premium Collection May 27, 2022"
 },
 {
  "id": "DATE_MIDJUNE_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_MIDJUNE_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MIDJUNE_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "Mid-June 2022",
  "releaseDate": "Mid-June 2022",
  "region": "North America",
  "description": "Large-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Raikou released as a possible coin within the Poké Ball Tin 5-Pack mid-June 2022; later released within the Lucario V & Tyranitar V "
 },
 {
  "id": "DATE_JUNE_REGULARSIZED_GOLD_20220617",
  "url": "https://archives.bulbagarden.net/media/upload/e/e2/PCG_Gold_Chansey_Coin.png/PCG_Gold_Chansey_Coin.png",
  "thumb": "https://archives.bulbagarden.net/media/upload/e/e2/PCG_Gold_Chansey_Coin.png/PCG_Gold_Chansey_Coin.png",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "June 17, 2022",
  "releaseDate": "June 17, 2022",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring a PokéCoin design included within the Pokémon GO Special Set June 17, 2022"
 },
 {
  "id": "DATE_JUNE_JUMBOSIZED_EMERALD",
  "url": "src/assets/coins/bulbapedia/DATE_JUNE_JUMBOSIZED_EMERALD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JUNE_JUMBOSIZED_EMERALD.jpg",
  "name": "Jumbo-sized, Emerald Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "June 17, 2022",
  "releaseDate": "June 17, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Emerald Rainbow Holofoil, Black-backed Coin featuring Professor Juniper included in the Professor Juniper Premium Tournament Collection June 17, 2022"
 },
 {
  "id": "DATE_JULY_METAL_COIN",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_METAL_COIN.jpg",
  "name": "Metal Coin featuring Mewtwo released",
  "material": "metal",
  "release": "July 1, 2022",
  "releaseDate": "July 1, 2022",
  "region": "North America",
  "description": "Metal Coin featuring Mewtwo released within the Pokémon GO Pokémon Center Elite Trainer Box Plus July 1, 2022"
 },
 {
  "id": "DATE_JULY_JUMBOSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_JUMBOSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_JUMBOSIZED_PURPLE.jpg",
  "name": "Jumbo-sized, Purple Rainbow Holofoil, White-backed",
  "material": "silver",
  "release": "July 1, 2022",
  "releaseDate": "July 1, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Purple Rainbow Holofoil, White-backed Coin featuring Mewtwo released within the Pokémon GO Mewtwo V Battle Deck and Pokémon GO V Battle Deck—Mewtwo vs. Melmetal July 1, 2022"
 },
 {
  "id": "DATE_JULY_JUMBOSIZED_GRAY",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_JUMBOSIZED_GRAY.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_JUMBOSIZED_GRAY.jpg",
  "name": "Jumbo-sized, Gray Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "July 1, 2022",
  "releaseDate": "July 1, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Gray Rainbow Holofoil, Black-backed Coin featuring Melmetal released within the Pokémon GO Melmetal V Battle Deck and Pokémon GO V Battle Deck—Mewtwo vs. Melmetal July 1, 2022"
 },
 {
  "id": "DATE_JULY_REGULARSIZED_GOLD_20220715",
  "url": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JULY_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "July 15, 2022",
  "releaseDate": "July 15, 2022",
  "region": "Japan",
  "description": "Regular-sized, Gold Mirror Holofoil, Black-backed Coin featuring Zeraora included in the Zeraora VSTAR & VMAX High-Class Deck July 15, 2022"
 },
 {
  "id": "ZERAORA_VSTAR_REGULARSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/ZERAORA_VSTAR_REGULARSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/ZERAORA_VSTAR_REGULARSIZED_PURPLE.jpg",
  "name": "Regular-sized, Purple Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "Zeraora VSTAR & VMAX High-Class Deck",
  "releaseDate": "July 15, 2022",
  "region": "Japan",
  "description": "Regular-sized, Purple Mirror Holofoil, Black-backed Coin featuring Deoxys included in the Deoxys VSTAR & VMAX High-Class Deck July 15, 2022"
 },
 {
  "id": "DEOXYS_VSTAR_REGULARSIZED_CARDBOARD",
  "url": "src/assets/coins/bulbapedia/DEOXYS_VSTAR_REGULARSIZED_CARDBOARD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DEOXYS_VSTAR_REGULARSIZED_CARDBOARD.jpg",
  "name": "Regular-sized, Cardboard Coin featuring Rowlet",
  "material": "cardboard",
  "release": "Deoxys VSTAR & VMAX High-Class Deck",
  "releaseDate": "August 3, 2022",
  "region": "North America",
  "description": "Regular-sized, Cardboard Coin featuring Rowlet included as one of six coins available for the McDonald's Collection 2022 starting August 3, 2022"
 },
 {
  "id": "MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD",
  "url": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "thumb": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "name": "Regular-sized, Cardboard Coin featuring Smeargle",
  "material": "cardboard",
  "release": "McDonald's Collection 2022",
  "releaseDate": "August 3, 2022",
  "region": "North America",
  "description": "Regular-sized, Cardboard Coin featuring Smeargle included as one of six coins available for the McDonald's Collection 2022 starting August 3, 2022"
 },
 {
  "id": "MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD_20220803",
  "url": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "thumb": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "name": "Regular-sized, Cardboard Coin featuring Pikachu",
  "material": "cardboard",
  "release": "McDonald's Collection 2022",
  "releaseDate": "August 3, 2022",
  "region": "North America",
  "description": "Regular-sized, Cardboard Coin featuring Pikachu included as one of six coins available for the McDonald's Collection 2022 starting August 3, 2022"
 },
 {
  "id": "MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD_20220803_2",
  "url": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "thumb": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "name": "Regular-sized, Cardboard Coin featuring Victini",
  "material": "cardboard",
  "release": "McDonald's Collection 2022",
  "releaseDate": "August 3, 2022",
  "region": "North America",
  "description": "Regular-sized, Cardboard Coin featuring Victini included as one of six coins available for the McDonald's Collection 2022 starting August 3, 2022"
 },
 {
  "id": "MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD_20220803_3",
  "url": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "thumb": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "name": "Regular-sized, Cardboard Coin featuring Gossifleur",
  "material": "cardboard",
  "release": "McDonald's Collection 2022",
  "releaseDate": "August 3, 2022",
  "region": "North America",
  "description": "Regular-sized, Cardboard Coin featuring Gossifleur included as one of six coins available for the McDonald's Collection 2022 starting August 3, 2022"
 },
 {
  "id": "MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD_20220803_4",
  "url": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "thumb": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_REGULARSIZED_CARDBOARD.jpg",
  "name": "Regular-sized, Cardboard Coin featuring Growlithe",
  "material": "cardboard",
  "release": "McDonald's Collection 2022",
  "releaseDate": "August 3, 2022",
  "region": "North America",
  "description": "Regular-sized, Cardboard Coin featuring Growlithe included as one of six coins available for the McDonald's Collection 2022 starting August 3, 2022"
 },
 {
  "id": "MCDONALDS_COLLECTION_JUMBOSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/MCDONALDS_COLLECTION_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "McDonald's Collection 2022",
  "releaseDate": "August 5, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Gold Rainbow Holofoil, Black-backed Coin featuring a PokéCoin design included within the Pokémon GO Mini Tins August 5, 2022"
 },
 {
  "id": "POKMON_GO_JUMBOSIZED_LIGHT",
  "url": "src/assets/coins/bulbapedia/POKMON_GO_JUMBOSIZED_LIGHT.jpg",
  "thumb": "src/assets/coins/bulbapedia/POKMON_GO_JUMBOSIZED_LIGHT.jpg",
  "name": "Jumbo-sized, Light Gold Mirror Holofoil,",
  "material": "gold",
  "release": "Pokémon GO Mini Tins",
  "releaseDate": "August 8, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Light Gold Mirror Holofoil, Black-backed Coin featuring Sirfetch'd released within the Astral Radiance Two Pack Blister August 8, 2022; later released within the Lost Origin Three Pack Bl"
 },
 {
  "id": "DATE_AUGUST_METAL_COIN_20220818",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_METAL_COIN.jpg",
  "name": "Metal Coin featuring Pikachu available",
  "material": "metal",
  "release": "August 18, 2022",
  "releaseDate": "August 18, 2022",
  "region": "Europe",
  "description": "Metal Coin featuring Pikachu available for purchase at the 2022 World Championships starting August 18, 2022"
 },
 {
  "id": "DATE_AUGUST_METAL_COIN_20220818_2",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_METAL_COIN.jpg",
  "name": "Metal Coin featuring Roserade available",
  "material": "metal",
  "release": "August 18, 2022",
  "releaseDate": "August 18, 2022",
  "region": "Europe",
  "description": "Metal Coin featuring Roserade available to staff of the 2022 World Championships starting August 18, 2022"
 },
 {
  "id": "DATE_AUGUST_JUMBOSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_BLUE.jpg",
  "name": "Jumbo-sized, Blue Bubbled Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 18, 2022",
  "releaseDate": "August 18, 2022",
  "region": "Europe",
  "description": "Jumbo-sized, Blue Bubbled Holofoil, Black-backed Coin featuring Eiscue released within the Holiday Calendar 2022 September 1, 2022"
 },
 {
  "id": "HOLIDAY_CALENDAR_JUMBOSIZED_RED",
  "url": "src/assets/coins/bulbapedia/HOLIDAY_CALENDAR_JUMBOSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/HOLIDAY_CALENDAR_JUMBOSIZED_RED.jpg",
  "name": "Jumbo-sized, Red Rainbow Holofoil, Black-backed",
  "material": "enamel",
  "release": "Holiday Calendar 2022",
  "releaseDate": "September 1, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Red Rainbow Holofoil, Black-backed Coin featuring Delibird released within the Holiday Calendar 2022 September 1, 2022"
 },
 {
  "id": "HOLIDAY_CALENDAR_JUMBOSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/HOLIDAY_CALENDAR_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/HOLIDAY_CALENDAR_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Rainbow Holofoil, Black-backed",
  "material": "gold",
  "release": "Holiday Calendar 2022",
  "releaseDate": "September 9, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Gold Rainbow Holofoil, Black-backed Coin featuring Origin Forme Giratina released within the Lost Origin Pokémon Center Elite Trainer Box September 9, 2022"
 },
 {
  "id": "DATE_SEPTEMBER_LARGESIZED_SILVER",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_SILVER.jpg",
  "name": "Large-sized, Silver Mirror Holofoil, Black-backed",
  "material": "silver",
  "release": "September 13, 2022",
  "releaseDate": "September 13, 2022",
  "region": "North America",
  "description": "Large-sized, Silver Mirror Holofoil, Black-backed Coin featuring Lucario released within the Lucario V & Tyranitar V Heavy Hitters Premium Collection September 13, 2022"
 },
 {
  "id": "DATE_SEPTEMBER_LARGESIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_LARGESIZED_GOLD.jpg",
  "name": "Large-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "September 13, 2022",
  "releaseDate": "September 13, 2022",
  "region": "North America",
  "description": "Large-sized, Gold Mirror Holofoil, Black-backed Coin featuring Tyranitar released within the Lucario V & Tyranitar V Heavy Hitters Premium Collection September 13, 2022"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_SILVER_20221007",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Rainbow Holofoil, Blue-backed",
  "material": "silver",
  "release": "October 7, 2022",
  "releaseDate": "October 7, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Rainbow Holofoil, Blue-backed Coin featuring Origin Forme Dialga released within the North American Origin Forme Dialga VSTAR Premium Collection October 7, 2022; later included in "
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_SILVER_20221007_2",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Rainbow Holofoil, Pink-backed",
  "material": "silver",
  "release": "October 7, 2022",
  "releaseDate": "October 7, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Rainbow Holofoil, Pink-backed Coin featuring Origin Forme Palkia released within the North American Origin Forme Palkia VSTAR Premium Collection October 7, 2022; subsequently inclu"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_GOLD_20221014",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Cracked Ice Holofoil,",
  "material": "gold",
  "release": "October 14, 2022",
  "releaseDate": "October 14, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Gold Cracked Ice Holofoil, Black-backed Coin featuring Zeraora released within the Zeraora V Battle Deck and V Battle Deck—Zeraora vs. Deoxys October 14, 2022"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_RED",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_RED.jpg",
  "name": "Jumbo-sized, Red Mirror Holofoil, Black-backed",
  "material": "enamel",
  "release": "October 14, 2022",
  "releaseDate": "October 14, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Red Mirror Holofoil, Black-backed Coin featuring Deoxys released within the Deoxys V Battle Deck and V Battle Deck—Zeraora vs. Deoxys October 14, 2022"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_SILVER_20221028",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Smoke Holofoil, Black-backed",
  "material": "silver",
  "release": "October 28, 2022",
  "releaseDate": "October 28, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Silver Smoke Holofoil, Black-backed Coin featuring Hisuian Zoroark released within the North American Hisuian Zoroark VSTAR Premium Collection October 28, 2022"
 },
 {
  "id": "DATE_OCTOBER_JUMBOSIZED_GOLD_20221028",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_JUMBOSIZED_GOLD.jpg",
  "name": "Jumbo-sized, Gold Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "October 28, 2022",
  "releaseDate": "October 28, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Gold Mirror Holofoil, Black-backed Coin featuring Scorbunny released within the Fire Stacking Tin October 28, 2022; later released as a possible coin within the Galar Pals Mini Tin 5-Pack"
 },
 {
  "id": "DATE_OCTOBER_METAL_COIN_20221028",
  "url": "src/assets/coins/bulbapedia/DATE_OCTOBER_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_OCTOBER_METAL_COIN.jpg",
  "name": "Metal Coin featuring Charizard released",
  "material": "metal",
  "release": "October 28, 2022",
  "releaseDate": "October 28, 2022",
  "region": "North America",
  "description": "Metal Coin featuring Charizard released within the Sword & Shield Ultra-Premium Collection—Charizard October 28, 2022"
 },
 {
  "id": "SWORD__METAL_COIN",
  "url": "src/assets/coins/bulbapedia/SWORD__METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/SWORD__METAL_COIN.jpg",
  "name": "Metal Coin featuring Arceus released",
  "material": "metal",
  "release": "Sword & Shield Ultra-Premium Collection—Charizard",
  "releaseDate": "November 4, 2022",
  "region": "North America",
  "description": "Metal Coin featuring Arceus released within the Arceus VSTAR Ultra-Premium Collection November 4, 2022"
 },
 {
  "id": "ARCEUS_VSTAR_REGULARSIZED_RED",
  "url": "src/assets/coins/bulbapedia/ARCEUS_VSTAR_REGULARSIZED_RED.jpg",
  "thumb": "src/assets/coins/bulbapedia/ARCEUS_VSTAR_REGULARSIZED_RED.jpg",
  "name": "Regular-sized, Red Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "Arceus VSTAR Ultra-Premium Collection",
  "releaseDate": "November 5, 2022",
  "region": "North America",
  "description": "Regular-sized, Red Confetti Holofoil, Black-backed Coin featuring Charizard included in the Charizard VSTAR vs Rayquaza VMAX Special Deck Set Novmber 5, 2022"
 },
 {
  "id": "DATE_NOVEMBER_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Confetti Holofoil, Black-backed",
  "material": "enamel",
  "release": "November 5, 2022",
  "releaseDate": "November 5, 2022",
  "region": "Japan",
  "description": "Regular-sized, Green Confetti Holofoil, Black-backed Coin featuring Rayquaza included in the Charizard VSTAR vs Rayquaza VMAX Special Deck Set Novmber 5, 2022"
 },
 {
  "id": "DATE_NOVEMBER_JUMBOSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/DATE_NOVEMBER_JUMBOSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_NOVEMBER_JUMBOSIZED_BLUE.jpg",
  "name": "Jumbo-sized, Blue Cracked Ice Holofoil,",
  "material": "silver",
  "release": "November 11, 2022",
  "releaseDate": "November 11, 2022",
  "region": "North America",
  "description": "Jumbo-sized, Blue Cracked Ice Holofoil, Black-backed Coin featuring Alolan Vulpix released within the Silver Tempest Pokémon Center Elite Trainer Box November 11, 2022"
 },
 {
  "id": "DATE_JANUARY_METAL_COIN_20230120",
  "url": "src/assets/coins/bulbapedia/DATE_JANUARY_METAL_COIN.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_JANUARY_METAL_COIN.jpg",
  "name": "Metal Coin featuring Lucario released",
  "material": "metal",
  "release": "January 20, 2023",
  "releaseDate": "January 20, 2023",
  "region": "North America",
  "description": "Metal Coin featuring Lucario released within the Crown Zenith Pokémon Center Elite Trainer Box Plus January 20, 2023"
 },
 {
  "id": "CROWN_ZENITH_JUMBOSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/CROWN_ZENITH_JUMBOSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/CROWN_ZENITH_JUMBOSIZED_BLUE.jpg",
  "name": "Jumbo-sized, Blue Rainbow Holofoil, Blue-backed",
  "material": "enamel",
  "release": "Crown Zenith Pokémon Center Elite Trainer Box Plus",
  "releaseDate": "March 3, 2023",
  "region": "North America",
  "description": "Jumbo-sized, Blue Rainbow Holofoil, Blue-backed Coin featuring Pikachu released within the 2022 World Championships Decks March 3, 2023"
 },
 {
  "id": "2022_WORLD_JUMBOSIZED_PINK",
  "url": "src/assets/coins/bulbapedia/2022_WORLD_JUMBOSIZED_PINK.jpg",
  "thumb": "src/assets/coins/bulbapedia/2022_WORLD_JUMBOSIZED_PINK.jpg",
  "name": "Jumbo-sized, Pink Cracked Ice Holofoil,",
  "material": "enamel",
  "release": "2022 World Championships Decks",
  "releaseDate": "March 24, 2023",
  "region": "North America",
  "description": "Jumbo-sized, Pink Cracked Ice Holofoil, Black-backed Coin featuring Klara included in the Klara Premium Tournament Collection March 24, 2023"
 },
 {
  "id": "DATE_MARCH_JUMBOSIZED_SILVER_20230324",
  "url": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_SILVER.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_MARCH_JUMBOSIZED_SILVER.jpg",
  "name": "Jumbo-sized, Silver Cracked Ice Holofoil,",
  "material": "silver",
  "release": "March 24, 2023",
  "releaseDate": "March 24, 2023",
  "region": "North America",
  "description": "Jumbo-sized, Silver Cracked Ice Holofoil, Black-backed Coin featuring Cyrus included in the Cyrus Premium Tournament Collection March 24, 2023"
 },
 {
  "id": "DATE_AUGUST_JUMBOSIZED_BLUE_20230804",
  "url": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_AUGUST_JUMBOSIZED_BLUE.jpg",
  "name": "Jumbo-sized, Blue Wave Holofoil, Black-backed",
  "material": "enamel",
  "release": "August 4, 2023",
  "releaseDate": "August 4, 2023",
  "region": "North America",
  "description": "Jumbo-sized, Blue Wave Holofoil, Black-backed Coin featuring Lugia included in the Crown Zenith Special Collection—Unown V & Lugia V August 4, 2023"
 },
 {
  "id": "DATE_SEPTEMBER_REGULARSIZED_GOLD",
  "url": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_GOLD.jpg",
  "thumb": "src/assets/coins/bulbapedia/DATE_SEPTEMBER_REGULARSIZED_GOLD.jpg",
  "name": "Regular-sized, Gold Non Holofoil, Black-backed",
  "material": "gold",
  "release": "September 9, 2023",
  "releaseDate": "September 9, 2023",
  "region": "Mainland China",
  "description": "Regular-sized, Gold Non Holofoil, Black-backed Coin featuring Rayquaza released within the Golden Energy Theme Pack starting September 9, 2023"
 },
 {
  "id": "GOLDEN_ENERGY_REGULARSIZED_GREEN",
  "url": "src/assets/coins/bulbapedia/GOLDEN_ENERGY_REGULARSIZED_GREEN.jpg",
  "thumb": "src/assets/coins/bulbapedia/GOLDEN_ENERGY_REGULARSIZED_GREEN.jpg",
  "name": "Regular-sized, Green Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Golden Energy",
  "releaseDate": "September 9, 2023",
  "region": "Mainland China",
  "description": "Regular-sized, Green Mirror Holofoil, Black-backed Coin featuring Rayquaza released within the Golden Energy Theme Pack starting September 9, 2023"
 },
 {
  "id": "GOLDEN_ENERGY_REGULARSIZED_BLUE",
  "url": "src/assets/coins/bulbapedia/GOLDEN_ENERGY_REGULARSIZED_BLUE.jpg",
  "thumb": "src/assets/coins/bulbapedia/GOLDEN_ENERGY_REGULARSIZED_BLUE.jpg",
  "name": "Regular-sized, Blue Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Golden Energy",
  "releaseDate": "September 9, 2023",
  "region": "Mainland China",
  "description": "Regular-sized, Blue Mirror Holofoil, Black-backed Coin featuring Rayquaza released within the Golden Energy Theme Pack starting September 9, 2023"
 },
 {
  "id": "GOLDEN_ENERGY_REGULARSIZED_PURPLE",
  "url": "src/assets/coins/bulbapedia/GOLDEN_ENERGY_REGULARSIZED_PURPLE.jpg",
  "thumb": "src/assets/coins/bulbapedia/GOLDEN_ENERGY_REGULARSIZED_PURPLE.jpg",
  "name": "Regular-sized, Purple Mirror Holofoil, Black-backed",
  "material": "gold",
  "release": "Golden Energy",
  "releaseDate": "September 9, 2023",
  "region": "Mainland China",
  "description": "Regular-sized, Purple Mirror Holofoil, Black-backed Coin featuring Rayquaza released within the Golden Energy Theme Pack starting September 9, 2023"
 }
];

export const COIN_MATERIALS = ['gold', 'silver', 'metal', 'enamel', 'cardboard'];

export function getCoins() {
  return COIN_CATALOG.map((c) => ({ ...c }));
}

export function getCoinById(id) {
  const coin = COIN_CATALOG.find((c) => c.id === id);
  return coin ? { ...coin } : null;
}

/** True when the coin's art is only a placeholder path (no downloaded scan). */
export function isPlaceholderCoin(coin) {
  return /\/coins\/bulbapedia\//.test(String(coin?.url ?? ''));
}

export function filterCoinsByName(coins = [], term = '') {
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) return [...coins];
  return coins.filter((c) => String(c.name ?? '').toLowerCase().includes(needle));
}

/**
 * Faceted filter over a coin list. Every facet is optional; omitted/`'all'`
 * facets are ignored. Matching is case-insensitive for `material`/`region`.
 */
export function filterCoins(coins = [], { term = '', material = 'all', region = 'all', hasImage = false } = {}) {
  const needle = String(term || '').trim().toLowerCase();
  const mat = String(material || 'all').toLowerCase();
  const reg = String(region || 'all').toLowerCase();

  return coins.filter((coin) => {
    if (needle && !String(coin.name ?? '').toLowerCase().includes(needle)) return false;
    if (mat !== 'all' && String(coin.material ?? '').toLowerCase() !== mat) return false;
    if (reg !== 'all' && String(coin.region ?? '').toLowerCase() !== reg) return false;
    if (hasImage && isPlaceholderCoin(coin)) return false;
    return true;
  });
}

/**
 * Group coins that share a release into variant clusters.
 * Coins without a release are omitted. Sorted by variant count desc, then release.
 */
export function groupCoinsByRelease(coins = []) {
  const groups = new Map();
  for (const coin of coins) {
    const release = String(coin.release ?? '').trim();
    if (!release) continue;
    if (!groups.has(release)) {
      groups.set(release, {
        release,
        region: coin.region ?? '',
        releaseDate: coin.releaseDate ?? '',
        count: 0,
        coinIds: [],
      });
    }
    const group = groups.get(release);
    group.count += 1;
    group.coinIds.push(coin.id);
    if (!group.region && coin.region) group.region = coin.region;
    if (!group.releaseDate && coin.releaseDate) group.releaseDate = coin.releaseDate;
  }

  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.release.localeCompare(b.release)
  );
}

/** Aggregate counts for the catalog or a filtered subset. */
export function getCoinStats(coins = []) {
  const byMaterial = {};
  const byRegion = {};
  let placeholders = 0;

  for (const coin of coins) {
    const material = String(coin?.material ?? 'unknown');
    const region = String(coin?.region ?? 'unknown');
    byMaterial[material] = (byMaterial[material] ?? 0) + 1;
    byRegion[region] = (byRegion[region] ?? 0) + 1;
    if (isPlaceholderCoin(coin)) placeholders += 1;
  }

  return {
    total: coins.length,
    byMaterial,
    byRegion,
    releaseGroups: groupCoinsByRelease(coins).length,
    withImage: coins.length - placeholders,
    placeholders,
  };
}
