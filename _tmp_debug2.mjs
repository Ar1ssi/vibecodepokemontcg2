const TYPE = 'Grass|Fire|Water|Lightning|Psychic|Fighting|Dark|Metal|Fairy|Dragon|Colorless';
const headerRe = new RegExp('^(' + TYPE + '(?:' + TYPE + ')*)(?:\s*→|\s*->)\s*(.+?)\s*:\s*(\d+)([+×x]?)\s*$', 'i');
console.log('regex:', headerRe);
const test = "GrassGrassGrassGrass → Jungle Dump : 240";
console.log('match:', test.match(headerRe));
// simpler test
const re2 = /^(Grass|Fire|Water|Lightning|Psychic|Fighting|Dark|Metal|Fairy|Dragon|Colorless)+\s*→\s*(.+?)\s*:\s*(\d+)([+×x]?)\s*$/i;
console.log('match2:', test.match(re2));
