import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TCGL_TO_TCGDEX_SETS,
  buildManifest,
  canonicalName,
  legacyShaderName,
  materialName,
  matchSetCards,
  namesMatch,
  normalizeCardKey,
} from '../foil-import-map.mjs';

describe('TCGL_TO_TCGDEX_SETS', () => {
  it('maps main sets to the same id, SV and ME sets to the zero-padded id', () => {
    assert.deepEqual(TCGL_TO_TCGDEX_SETS.bw1, [{ set: 'bw1', prefix: '' }]);
    assert.deepEqual(TCGL_TO_TCGDEX_SETS.swsh12, [{ set: 'swsh12', prefix: '' }]);
    assert.deepEqual(TCGL_TO_TCGDEX_SETS.sv1, [{ set: 'sv01', prefix: '' }]);
    assert.deepEqual(TCGL_TO_TCGDEX_SETS.sv10, [{ set: 'sv10', prefix: '' }]);
    assert.deepEqual(TCGL_TO_TCGDEX_SETS.me2, [{ set: 'me02', prefix: '' }]);
  });

  it('splits subsets into ordered segments with their local-id prefix', () => {
    assert.deepEqual(TCGL_TO_TCGDEX_SETS['swsh4-5'], [
      { set: 'swsh4.5', prefix: '' },
      { set: 'swsh4.5sv', prefix: 'SV' },
    ]);
    assert.deepEqual(TCGL_TO_TCGDEX_SETS['sm11-5'], [
      { set: 'sm115', prefix: '' },
      { set: 'sma', prefix: 'SV' },
    ]);
    assert.deepEqual(TCGL_TO_TCGDEX_SETS['swsh12-5a'], [{ set: 'swsh12.5gg', prefix: 'GG' }]);
    assert.deepEqual(TCGL_TO_TCGDEX_SETS.bwbsp, [{ set: 'bwp', prefix: 'BW' }]);
    assert.deepEqual(TCGL_TO_TCGDEX_SETS['swsh7-5r'], [{ set: 'cel25cc', prefix: 'CC' }]);
  });

  it('maps the two SV 10.5 sets by their last card (Reshiram ex = White Flare, Zekrom ex = Black Bolt)', () => {
    assert.deepEqual(TCGL_TO_TCGDEX_SETS['rsv10-5'], [{ set: 'sv10.5w', prefix: '' }]);
    assert.deepEqual(TCGL_TO_TCGDEX_SETS['zsv10-5'], [{ set: 'sv10.5b', prefix: '' }]);
  });

  it('leaves sets with no confirmed TCGdex set unmapped', () => {
    for (const code of ['me5-5m', 'ec', 'gum', 'smalt', 'xyalt']) {
      assert.equal(TCGL_TO_TCGDEX_SETS[code], undefined, code);
    }
  });
});

// Expected names: WebApp web/data/foil/cards.json rows sv1_258, bw1_113, sv5_141, swsh9_100 (base), whose
// MaterialManifest `_s` / `_f` come from cardart/manifests.jsonl.
describe('legacyShaderName', () => {
  it('passes TPCi/Cards3D names through', () => {
    assert.equal(legacyShaderName('TPCi/Cards3D/HoloFoil/SvUltra'), 'TPCi/Cards3D/HoloFoil/SvUltra');
  });
  it('rewrites the Cards/ manifest names (bw1_113, swsh9_100)', () => {
    assert.equal(legacyShaderName('Cards/Foil/HoloFoil_Rainbow_Amplify_J'), 'TPCi/Cards3D/HoloFoil/Rainbow');
    assert.equal(legacyShaderName('Cards/Standard/Standard_NonFoil_J'), 'TPCi/Cards3D/Standard/NonFoil');
    assert.equal(legacyShaderName('Cards/Foil/HoloFoil_SWSecret_J'), 'TPCi/Cards3D/HoloFoil/SwSecret');
    assert.equal(legacyShaderName('Cards/Foil/HoloFoil_Cracked_Ice_Amplify_J'), 'TPCi/Cards3D/HoloFoil/CrackedIce');
  });
});

describe('materialName', () => {
  it('maps manifest materials to MAT_Cards3D names', () => {
    assert.equal(materialName('HoloFoil_Rainbow_Amplify_J'), 'MAT_Cards3D_Rainbow');
    assert.equal(materialName('HoloFoil_SWHolo_J'), 'MAT_Cards3D_SwHolo');
    assert.equal(materialName('SvUltra'), 'MAT_Cards3D_SvUltra');
    assert.equal(materialName('AceFoil'), 'MAT_Cards3D_AceFoil');
    assert.equal(materialName('Standard_NonFoil_J'), 'MAT_Cards3D_NonFoil');
    assert.equal(materialName('HoloFoil_Cracked_Ice_Amplify_J'), 'MAT_Cards3D_CrackedIce');
  });
});

describe('namesMatch', () => {
  it('ignores punctuation, case and accents', () => {
    assert.ok(namesMatch('Pikachu-EX', 'Pikachu EX'));
    assert.ok(namesMatch('Flabébé', 'Flabebe'));
    assert.ok(namesMatch("Professor's Research", 'Professor’s Research'));
  });
  it('spells symbols out', () => {
    assert.equal(canonicalName('Ultra Necrozma ◇'), 'ultranecrozmaprismstar');
    assert.ok(namesMatch('Ultra Necrozma ◇', 'Ultra Necrozma Prism Star'));
  });
  it('reads TCG Live energy and Prism Star symbols', () => {
    assert.ok(namesMatch('Basic {G} Energy', 'Grass Energy'), 'xy1-132');
    assert.ok(namesMatch('Basic {L} Energy', 'Basic Lightning Energy'), 'sv01-257');
    assert.ok(namesMatch('Growing {G} Energy', 'Growing Grass Energy'), 'me03-086');
    assert.ok(namesMatch('Blend Energy {G}{R}{P}{D}', 'Blend Energy Grass Fire Psychic Darkness'), 'bw6-117');
    assert.ok(namesMatch('Giratina {*}', 'Giratina ◇'), 'sm5-58');
  });
  it('accepts a TCGdex qualifier TCG Live leaves out', () => {
    assert.ok(namesMatch("Professor's Research", "Professor's Research (Professor Magnolia)"), 'swsh1-178');
    assert.ok(namesMatch('Luxray GL', 'Luxray GL LV.X'), 'cel25cc-CC017');
    assert.equal(namesMatch('Basic {G} Energy', 'Fire Energy'), false);
  });
  it('rejects different or empty names', () => {
    assert.equal(namesMatch('Snivy', 'Servine'), false);
    assert.equal(namesMatch('', ''), false);
  });
});

describe('matchSetCards', () => {
  const segments = [
    {
      set: 'swsh4.5',
      prefix: '',
      cards: [
        { id: 'swsh4.5-1', localId: '1', name: 'Yanma' },
        { id: 'swsh4.5-2', localId: '2', name: 'Yanmega' },
        { id: 'swsh4.5-3', localId: '3', name: 'Celebi' },
      ],
    },
    {
      set: 'swsh4.5sv',
      prefix: 'SV',
      cards: [
        { id: 'swsh4.5sv-SV001', localId: 'SV001', name: 'Rowlet' },
        { id: 'swsh4.5sv-SV002', localId: 'SV002', name: 'Dartrix' },
      ],
    },
  ];

  it('matches by ordinal across segments', () => {
    const { matched, unmapped } = matchSetCards(
      [
        { tcglId: 'swsh4-5_1', number: 1, name: 'Yanma' },
        { tcglId: 'swsh4-5_4', number: 4, name: 'Rowlet' },
        { tcglId: 'swsh4-5_5', number: 5, name: 'Dartrix' },
      ],
      segments
    );
    assert.equal(matched.get('swsh4-5_1'), 'swsh4.5-1');
    assert.equal(matched.get('swsh4-5_4'), 'swsh4.5sv-SV001');
    assert.equal(matched.get('swsh4-5_5'), 'swsh4.5sv-SV002');
    assert.deepEqual(unmapped, []);
  });

  it('retries by numeric local id when the ordinal name differs', () => {
    // Ordinal #2 is Yanmega (name check fails); the retry finds SV002: numeric run 2, same name.
    const { matched } = matchSetCards([{ tcglId: 'x_2', number: 2, name: 'Dartrix' }], segments);
    assert.equal(matched.get('x_2'), 'swsh4.5sv-SV002');
  });

  it('falls back to a name printed once on both sides (30th Classic Collection order)', () => {
    const tcgl = [
      { tcglId: 'me5-5c_1', number: 1, name: 'Pikachu' },
      { tcglId: 'me5-5c_2', number: 2, name: 'Charizard' },
    ];
    const classic = [
      {
        set: '30th-c',
        prefix: '',
        cards: [
          { id: '30th-c-001', localId: '001', name: 'Charizard' },
          { id: '30th-c-009', localId: '009', name: 'Pikachu' },
        ],
      },
    ];
    const { matched } = matchSetCards(tcgl, classic);
    assert.equal(matched.get('me5-5c_1'), '30th-c-009');
    assert.equal(matched.get('me5-5c_2'), '30th-c-001');
  });

  it('never name-matches a name printed twice in the TCG Live set', () => {
    const tcgl = [
      { tcglId: 'a_7', number: 7, name: 'Yanma' },
      { tcglId: 'a_8', number: 8, name: 'Yanma' },
    ];
    const { unmapped } = matchSetCards(tcgl, segments);
    assert.deepEqual(unmapped, ['a_7', 'a_8']);
  });

  it('reports a card with no name match as unmapped', () => {
    const { matched, unmapped } = matchSetCards([{ tcglId: 'x_3', number: 3, name: 'Snivy' }], segments);
    assert.equal(matched.size, 0);
    assert.deepEqual(unmapped, ['x_3']);
  });
});

describe('buildManifest', () => {
  const entries = [
    {
      tcgdexId: 'sv01-258',
      tcglId: 'sv1_258',
      foil: true,
      shader: 'TPCi/Cards3D/HoloFoil/SvUltra',
      material: 'MAT_Cards3D_SvUltra',
      front: 'sv1_en_258',
      etch: 'sv1_etch_en_258',
      wp: 'sv1_wp_en_258',
    },
    {
      tcgdexId: 'bw1-113',
      tcglId: 'bw1_113',
      foil: true,
      shader: 'TPCi/Cards3D/HoloFoil/Rainbow',
      material: 'MAT_Cards3D_Rainbow',
      front: 'bw1_en_113',
      etch: 'bw1_etch_en_113',
      wp: 'bw1_wp_std_en_113',
    },
    { tcgdexId: 'swsh9-100', tcglId: 'swsh9_100', foil: false },
  ];

  it('indexes shaders and materials and lists non-foil cards as flat', () => {
    const manifest = buildManifest(entries);
    assert.equal(manifest.v, 1);
    assert.deepEqual(manifest.shaders, ['TPCi/Cards3D/HoloFoil/Rainbow', 'TPCi/Cards3D/HoloFoil/SvUltra']);
    assert.deepEqual(manifest.materials, ['MAT_Cards3D_Rainbow', 'MAT_Cards3D_SvUltra']);
    assert.deepEqual(manifest.cards['sv01-258'], ['sv1_258', 1, 1, 'sv1_en_258', 'sv1_etch_en_258', 'sv1_wp_en_258', '', '']);
    assert.deepEqual(manifest.cards['bw1-113'], ['bw1_113', 0, 0, 'bw1_en_113', 'bw1_etch_en_113', 'bw1_wp_std_en_113', '', '']);
    assert.deepEqual(manifest.flat, ['swsh9-100']);
  });

  it('is byte-identical regardless of input order', () => {
    const a = JSON.stringify(buildManifest(entries));
    const b = JSON.stringify(buildManifest([...entries].reverse()));
    assert.equal(a, b);
  });

  it('keeps a card foil when a flat printing shares its key', () => {
    const manifest = buildManifest([...entries, { tcgdexId: 'sv01-258', tcglId: 'dup', foil: false }]);
    assert.ok(manifest.cards['sv01-258']);
    assert.equal(manifest.flat.includes('sv01-258'), false);
  });

  it('uses the same key as the client', () => {
    assert.equal(normalizeCardKey('swsh12.5-GG01'), 'swsh12.5-gg1');
  });
});
