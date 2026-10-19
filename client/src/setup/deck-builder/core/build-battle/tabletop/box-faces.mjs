// Where each Build & Battle box render's faces lie (design 073 § Deviations, box faces): the
// front's and the visible side's corners in render pixels (`BOX_ART[key].render`), clockwise from
// top-left. Measured from each render's silhouette — its top, bottom and side edges fitted as lines,
// the side/front fold found where the top dips or, under a white top, as the first strong vertical
// edge in from the back — then checked by eye by rectifying every face. Three renders show the front
// alone (no side); Sun & Moon and Ultra Prism show the right side instead of the left.

const q = (...points) =>
  Object.freeze(points.map(([x, y]) => Object.freeze({ x, y })));

export const BOX_FACE_QUADS = Object.freeze({
  'astral-radiance': Object.freeze({
    size: [893, 1200],
    front: q([182.5, 5], [893.5, 28], [848, 1055.5], [213.5, 1197]),
    left: q([-2, 25], [183, 21], [213.5, 1202.5], [41.5, 1010]),
  }),
  'battle-styles': Object.freeze({
    size: [963, 1293],
    front: q([197, 66], [962.5, 35], [917.5, 1137.5], [230.5, 1291]),
    left: q([-2, 24.5], [197, 66], [230.5, 1291], [45.5, 1089]),
  }),
  'brilliant-stars': Object.freeze({
    size: [893, 1200],
    front: q([182, 3.5], [893, 26], [853, 1055.5], [214, 1197]),
    left: q([-3, 23.5], [182, 19.5], [214.5, 1206.5], [40.5, 1011]),
  }),
  'burning-shadows': Object.freeze({
    size: [694, 1000],
    front: q([5.5, 7], [687.5, 10], [666, 996], [13.5, 994.5]),
  }),
  'celestial-storm': Object.freeze({
    size: [958, 1284],
    front: q([196, 65.5], [955, 34.5], [912.5, 1129], [230, 1282]),
    left: q([-2.5, 24.5], [196, 65.5], [230, 1282], [45, 1082]),
  }),
  'chaos-rising': Object.freeze({
    size: [1041, 1400],
    front: q([212, 69.5], [1040.5, 36], [993.5, 1231.5], [249, 1398.5]),
    left: q([-3.5, 24.5], [212, 69.5], [249, 1398.5], [48, 1179]),
  }),
  'chilling-reign': Object.freeze({
    size: [966, 1280],
    front: q([174.5, 67], [966, 35], [912, 1127.5], [204.5, 1279]),
    left: q([4, 24], [174.5, 67], [204.5, 1279], [50, 1078]),
  }),
  'cosmic-eclipse': Object.freeze({
    size: [964, 1281],
    front: q([199, 67], [967, 35], [911, 1128], [229.5, 1280.5]),
    left: q([2, 23.5], [199, 67], [229.5, 1280.5], [49, 1082]),
  }),
  'crimson-invasion': Object.freeze({
    size: [706, 998],
    front: q([7, 5], [705, 11.5], [684.5, 997], [19, 997]),
  }),
  'darkness-ablaze': Object.freeze({
    size: [963, 1292],
    front: q([198.5, 65], [961.5, 34], [919, 1136], [233, 1290]),
    left: q([-1.5, 23.5], [198.5, 65], [233, 1290], [45.5, 1088]),
  }),
  'destined-rivals': Object.freeze({
    size: [1000, 1330],
    front: q([201.5, 68], [1002.5, 35.5], [946.5, 1171], [233.5, 1329]),
    left: q([1.5, 24], [201.5, 68], [233.5, 1329], [50, 1121]),
  }),
  evolutions: Object.freeze({
    size: [600, 899],
    front: q([3.5, 5.5], [596.5, 5.5], [596.5, 893.5], [3.5, 893.5]),
  }),
  'evolving-skies': Object.freeze({
    size: [371, 498],
    front: q([75.5, 24], [371, 12.5], [354, 438], [88.5, 497]),
    left: q([-1, 8], [75.5, 24], [88.5, 497], [17, 419.5]),
  }),
  'fates-collide': Object.freeze({
    size: [293, 400],
    front: q([76.5, 1], [297, 12.5], [262, 330.5], [83.5, 399.5]),
    left: q([-2.5, 11], [76.5, 10.5], [84, 401.5], [18, 328]),
  }),
  'forbidden-light': Object.freeze({
    size: [971, 1280],
    front: q([208, 75.5], [948.5, 45], [906.5, 1114.5], [240.5, 1264]),
    left: q([14, 35], [208, 75.5], [240.5, 1264], [59.5, 1067.5]),
  }),
  'fusion-strike': Object.freeze({
    size: [895, 1202],
    front: q([185, 60], [894.5, 31], [853, 1057], [216, 1200]),
    left: q([-2.5, 21.5], [185, 60], [216, 1200], [41.5, 1012.5]),
  }),
  'guardians-rising': Object.freeze({
    size: [451, 610],
    front: q([75.5, 91.5], [449, 7], [421, 535.5], [88, 608.5]),
    left: q([-0.5, 12.5], [75.5, 91.5], [88, 608.5], [19, 509.5]),
  }),
  'journey-together': Object.freeze({
    size: [1041, 1400],
    front: q([211, 70.5], [1040.5, 36.5], [993.5, 1232], [248, 1398.5]),
    left: q([-3.5, 25], [211, 70.5], [248, 1398.5], [47.5, 1179]),
  }),
  'lost-origin': Object.freeze({
    size: [893, 1200],
    front: q([179, 4], [892, 26.5], [850.5, 1054], [213, 1196.5]),
    left: q([-2.5, 25], [179.5, 21.5], [213.5, 1204], [43, 1007.5]),
  }),
  'lost-thunder': Object.freeze({
    size: [976, 1300],
    front: q([204.5, 73], [964.5, 42], [921.5, 1137], [238, 1290]),
    left: q([7, 32.5], [204.5, 73], [238, 1290], [53.5, 1090]),
  }),
  'mega-evolution': Object.freeze({
    size: [1041, 1400],
    front: q([213, 69.5], [1040.5, 36], [993.5, 1231.5], [250, 1398.5]),
    left: q([-3.5, 24.5], [213, 69.5], [250, 1398.5], [48, 1179]),
  }),
  'obsidian-flames': Object.freeze({
    size: [1041, 1400],
    front: q([213, 64.5], [1042.5, 31], [993.5, 1233], [249.5, 1399.5]),
    left: q([-4, 30.5], [213, 64.5], [249.5, 1399.5], [47.5, 1179.5]),
  }),
  'paldea-evolved': Object.freeze({
    size: [1041, 1400],
    front: q([213, 65], [1042.5, 31], [993, 1233], [249.5, 1399]),
    left: q([-4, 30], [213, 65], [249.5, 1399], [47.5, 1179.5]),
  }),
  'paradox-rift': Object.freeze({
    size: [1041, 1400],
    front: q([212, 64.5], [1042, 31], [992.5, 1232.5], [248.5, 1399]),
    left: q([-4, 30.5], [212, 64.5], [248.5, 1399], [47.5, 1179]),
  }),
  'perfect-order': Object.freeze({
    size: [1041, 1400],
    front: q([213, 69.5], [1040, 36], [993.5, 1231.5], [250, 1398.5]),
    left: q([-3.5, 24.5], [213, 69.5], [250, 1398.5], [48, 1179]),
  }),
  'phantasmal-flames': Object.freeze({
    size: [1041, 1400],
    front: q([213, 69.5], [1040, 36], [993.5, 1231.5], [250, 1398.5]),
    left: q([-3.5, 24.5], [213, 69.5], [250, 1398.5], [48, 1179]),
  }),
  'pitch-black': Object.freeze({
    size: [1041, 1400],
    front: q([212, 69.5], [1040.5, 36], [993.5, 1231.5], [249, 1398.5]),
    left: q([-3.5, 24.5], [212, 69.5], [249, 1398.5], [48, 1179]),
  }),
  'rebel-clash': Object.freeze({
    size: [1007, 1350],
    front: q([207, 67.5], [1005, 35.5], [959.5, 1187.5], [242.5, 1348]),
    left: q([-1.5, 24.5], [207, 67.5], [242.5, 1348], [48, 1137]),
  }),
  'scarlet-violet': Object.freeze({
    size: [877, 1152],
    front: q([185, 53.5], [868.5, 26], [828, 1014.5], [214.5, 1151.5]),
    left: q([7, 24.5], [185, 53.5], [214.5, 1151.5], [49, 970.5]),
  }),
  'silver-tempest': Object.freeze({
    size: [1042, 1400],
    front: q([212, 7], [1041, 27], [993.5, 1230.5], [250, 1396]),
    left: q([-3, 28], [212.5, 23.5], [250, 1404.5], [48.5, 1178.5]),
  }),
  'steam-siege': Object.freeze({
    size: [503, 700],
    front: q([125, 7], [509.5, 8.5], [445.5, 585], [127, 698]),
    left: q([-5, 21], [125, 19], [127, 698], [18, 568]),
  }),
  'stellar-crown': Object.freeze({
    size: [1041, 1400],
    front: q([212, 52], [1041.5, 20], [994.5, 1232], [250, 1399]),
    left: q([-4, 31], [212, 52], [250, 1399], [47.5, 1179]),
  }),
  'sun-moon': Object.freeze({
    size: [735, 1000],
    front: q([0, 22], [493, 54], [491, 999], [28.5, 875.5]),
    right: q([493, 54], [736, 33.5], [721, 877], [491, 999]),
  }),
  'surging-sparks': Object.freeze({
    size: [1041, 1400],
    front: q([212, 50], [1040, 18.5], [993.5, 1232.5], [250, 1399]),
    left: q([-4, 31], [212, 50], [250, 1399], [47.5, 1179.5]),
  }),
  'sword-shield': Object.freeze({
    size: [970, 1280],
    front: q([199.5, 68], [953.5, 38], [912, 1123], [233.5, 1274]),
    left: q([5, 27.5], [199.5, 68], [233.5, 1274], [51.5, 1075.5]),
  }),
  'team-up': Object.freeze({
    size: [963, 1280],
    front: q([202, 75], [952.5, 44.5], [910.5, 1127.5], [235, 1278]),
    left: q([7.5, 34], [202, 75], [235, 1278], [53.5, 1080]),
  }),
  'temporal-forces': Object.freeze({
    size: [1041, 1400],
    front: q([211.5, 52.5], [1040.5, 20.5], [994.5, 1232.5], [250, 1399]),
    left: q([-4, 31], [211.5, 52.5], [250, 1399], [47.5, 1179.5]),
  }),
  'twilight-masquerade': Object.freeze({
    size: [1041, 1400],
    front: q([213, 52.5], [1041.5, 20.5], [994.5, 1232.5], [250.5, 1399]),
    left: q([-4, 31], [213, 52.5], [250.5, 1399], [47.5, 1179]),
  }),
  'ultra-prism': Object.freeze({
    size: [752, 1000],
    front: q([1.5, 27], [555.5, 47.5], [551, 1000.5], [15, 901.5]),
    right: q([555.5, 47.5], [751, 24.5], [740.5, 888.5], [551, 1000.5]),
  }),
  'unbroken-bonds': Object.freeze({
    size: [964, 1280],
    front: q([203, 74.5], [958, 43.5], [905, 1118.5], [234, 1269]),
    left: q([9.5, 32.5], [203, 74.5], [234, 1269], [55.5, 1073.5]),
  }),
  'unified-minds': Object.freeze({
    size: [947, 1259],
    front: q([188.5, 65], [949, 34], [896.5, 1108], [218.5, 1258]),
    left: q([2.5, 23], [188.5, 65], [218.5, 1258], [48, 1062.5]),
  }),
  'vivid-voltage': Object.freeze({
    size: [959, 1280],
    front: q([197, 67.5], [948.5, 37], [907, 1122.5], [230.5, 1274]),
    left: q([0, 26.5], [197, 67.5], [230.5, 1274], [46.5, 1075]),
  }),
});

/**
 * @param {string} boxKey a catalog box key
 * @returns {{size: number[], front: object[], left?: object[], right?: object[]}|null}
 */
export function boxFaceQuads(boxKey) {
  return typeof boxKey === 'string' && Object.hasOwn(BOX_FACE_QUADS, boxKey)
    ? BOX_FACE_QUADS[boxKey]
    : null;
}
