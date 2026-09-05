// Gen IX coin catalog from Bulbapedia's Coin_(TCG) archive.
    // Materials classified from product names: gold/silver/white are metallic
    // finishes (strong specular sheen); everything else is colored enamel
    // (softer sheen). TCG Live look: circular metal discs, moving specular
    // highlight + tilt, flip reveals the TM back.
    
    const COIN_BACK_URL = "src/assets/coins/coin-back.png";
    
    const GEN_IX_COINS = [
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
  "material": "enamel"
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
  "material": "enamel"
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
  "material": "enamel"
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
  "material": "enamel"
 },
 {
  "id": "WCS24_Metal_Munchlax_Coin",
  "url": "src/assets/coins/WCS24_Metal_Munchlax_Coin.jpg",
  "thumb": "src/assets/coins/WCS24_Metal_Munchlax_Coin.jpg",
  "name": "WCS24 Metal Munchlax",
  "material": "enamel"
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
  "material": "enamel"
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
  "material": "enamel"
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
  "material": "enamel"
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
  "material": "enamel"
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
  "material": "enamel"
 },
 {
  "id": "BeijingMasters_Metal_Pikachu_Coin",
  "url": "src/assets/coins/BeijingMasters_Metal_Pikachu_Coin.png",
  "thumb": "src/assets/coins/BeijingMasters_Metal_Pikachu_Coin.png",
  "name": "BeijingMasters Metal Pikachu",
  "material": "enamel"
 },
 {
  "id": "BeijingMasters_Metal_Garganacl_Coin",
  "url": "src/assets/coins/BeijingMasters_Metal_Garganacl_Coin.png",
  "thumb": "src/assets/coins/BeijingMasters_Metal_Garganacl_Coin.png",
  "name": "BeijingMasters Metal Garganacl",
  "material": "enamel"
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
  "material": "enamel"
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
  "material": "enamel"
 },
 {
  "id": "ShenzhenMasters_Metal_Mewtwo_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Mewtwo_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Mewtwo_Coin.png",
  "name": "ShenzhenMasters Metal Mewtwo",
  "material": "enamel"
 },
 {
  "id": "ShenzhenMasters_Metal_Porygon_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Porygon_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Porygon_Coin.png",
  "name": "ShenzhenMasters Metal Porygon",
  "material": "enamel"
 },
 {
  "id": "ShenzhenMasters_Metal_Zapdos_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Zapdos_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Zapdos_Coin.png",
  "name": "ShenzhenMasters Metal Zapdos",
  "material": "enamel"
 },
 {
  "id": "ShenzhenMasters_Metal_Pikachu_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Pikachu_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Pikachu_Coin.png",
  "name": "ShenzhenMasters Metal Pikachu",
  "material": "enamel"
 },
 {
  "id": "ShenzhenMasters_Metal_Ampharos_Coin",
  "url": "src/assets/coins/ShenzhenMasters_Metal_Ampharos_Coin.png",
  "thumb": "src/assets/coins/ShenzhenMasters_Metal_Ampharos_Coin.png",
  "name": "ShenzhenMasters Metal Ampharos",
  "material": "enamel"
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
  "material": "enamel"
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
 }
];
    
    export function getCoins() {
      return GEN_IX_COINS.map((c) => ({ ...c }));
    }
    
    export function getCoinById(id) {
      const coin = GEN_IX_COINS.find((c) => c.id === id);
      return coin ? { ...coin } : null;
    }
    
    export function filterCoinsByName(coins = [], term = '') {
      const needle = String(term || '').trim().toLowerCase();
      if (!needle) return [...coins];
      return coins.filter((c) => c.name.toLowerCase().includes(needle));
    }
    
