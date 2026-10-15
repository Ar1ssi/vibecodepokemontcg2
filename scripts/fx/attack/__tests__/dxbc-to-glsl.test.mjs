import assert from 'node:assert/strict';
import { test } from 'node:test';
import { constantReads, parseOperand, parseSignatures, splitOperands, transpile } from '../lib/dxbc-to-glsl.mjs';

// A cut of TPCi/VFX/Gameplay/Moves/Fire_Attack_Medium_Trail's pixel shader (attack_fire bundle),
// with lines added for the opcodes its neighbours use.
const FRAGMENT = `
//
// Input signature:
//
// Name                 Index   Mask Register SysValue  Format   Used
// -------------------- ----- ------ -------- -------- ------- ------
// SV_POSITION              0   xyzw        0      POS   float
// TEXCOORD                 0   xy          1     NONE   float   xy
// TEXCOORD                 1   xyzw        2     NONE   float     zw
// COLOR                    0   xyzw        5     NONE   float   xyz
//
//
// Output signature:
//
// Name                 Index   Mask Register SysValue  Format   Used
// -------------------- ----- ------ -------- -------- ------- ------
// SV_Target                0   xyzw        0   TARGET   float   xyzw
//
ps_4_0
dcl_constantbuffer CB0[7], immediateIndexed
dcl_constantbuffer CB1[1], immediateIndexed
dcl_sampler s0, mode_default
dcl_sampler s1, mode_default
dcl_resource_texture2d (float,float,float,float) t0
dcl_resource_texture2d (float,float,float,float) t1
dcl_input_ps linear v1.xy
dcl_input_ps linear v2.zw
dcl_input_ps linear v5.xyz
dcl_output o0.xyzw
dcl_temps 2
mul r0.xy, v1.xyxx, l(2.000000, 0.150000, 0.000000, 0.000000)
mad r0.xy, cb1[0].yyyy, l(0.000000, -0.150000, 0.000000, 0.000000), r0.xyxx
sample r0.xyzw, r0.xyxx, t0.xyzw, s1
add r0.z, v2.w, cb0[5].y
mad r1.y, v1.y, cb0[4].z, r0.z
lt r1.x, r0.y, l(0.500000)
lt r1.zw, r0.xxxy, l(0.250000, 0.250000, 0.250000, 0.250000)
and r1.x, r1.x, l(0x3f800000)
and r1.z, r1.z, l(0x80000000)
movc r0.xy, r1.zwzz, r0.xyxx, l(0,0,0,0)
dp3 r0.w, r0.xyzx, -v5.xyzx
discard_nz r1.x
if_nz r1.w
  mov_sat r0.w, |r0.w|
else
  rsq r0.w, r0.w
endif
mul_sat o0.xyz, r0.xyzx, cb0[5].zzzz
mov o0.w, r0.w
ret
// Approximately 0 instruction slots used
`;

const VERTEX = `
//
// Input signature:
//
// Name                 Index   Mask Register SysValue  Format   Used
// -------------------- ----- ------ -------- -------- ------- ------
// POSITION                 0   xyzw        0     NONE   float   xyzw
// NORMAL                   0   xyz         2     NONE   float   xyz
// TEXCOORD                 0   xyzw        3     NONE   float   xyzw
// COLOR                    0   xyzw        7     NONE   float   xyzw
//
//
// Output signature:
//
// Name                 Index   Mask Register SysValue  Format   Used
// -------------------- ----- ------ -------- -------- ------- ------
// SV_POSITION              0   xyzw        0      POS   float   xyzw
// TEXCOORD                 0   xy          1     NONE   float   xy
// TEXCOORD                 1   xyzw        2     NONE   float   xyzw
//
vs_4_0
dcl_constantbuffer CB0[9], immediateIndexed
dcl_input v0.xyzw
dcl_input v3.xyzw
dcl_output_siv o0.xyzw, position
dcl_output o1.xy
dcl_output o2.xyzw
dcl_temps 1
mov o0.xyzw, v0.xyzw
mad o1.xy, v3.xyxx, cb0[7].xyxx, cb0[7].zwzz
mov o2.zw, v3.zzzw
ret
`;

test('splitOperands keeps a parenthesised literal whole', () => {
  assert.deepEqual(splitOperands('r0.xy, l(1.0, 2.0, 0, 0), cb0[4].x'), ['r0.xy', 'l(1.0, 2.0, 0, 0)', 'cb0[4].x']);
});

test('parseOperand reads registers, buffers, literals and their modifiers', () => {
  assert.deepEqual(parseOperand('-r2.xyzx'), { kind: 'r', index: 2, swizzle: 'xyzx', negate: true, absolute: false });
  assert.deepEqual(parseOperand('|v1.x|'), { kind: 'v', index: 1, swizzle: 'x', negate: false, absolute: true });
  assert.deepEqual(parseOperand('cb1[0].yyyy'), { kind: 'cb', slot: 1, row: 0, swizzle: 'yyyy', negate: false, absolute: false });
  assert.deepEqual(parseOperand('l(0x3f800000)').values, [{ int: 0x3f800000 }]);
  assert.deepEqual(parseOperand('l(2.000000, 0, 0, 0)').values[0], { float: 2 });
  assert.equal(parseOperand('null').kind, 'null');
  assert.throws(() => parseOperand('icb[r0.x + 1].x'), /unsupported operand/);
});

test('parseSignatures reads semantics, registers and masks', () => {
  const { input, output } = parseSignatures(VERTEX);
  assert.deepEqual(input.map((row) => `${row.semantic}${row.index}@${row.register}`), ['POSITION0@0', 'NORMAL0@2', 'TEXCOORD0@3', 'COLOR0@7']);
  assert.deepEqual(output.map((row) => `${row.semantic}${row.index}@${row.register}:${row.mask}`), ['SV_POSITION0@0:xyzw', 'TEXCOORD0@1:xy', 'TEXCOORD1@2:xyzw']);
});

test('a fragment shader keeps registers as bit patterns', () => {
  const { glsl, buffers, textures, inputs } = transpile(FRAGMENT, { stage: 'fragment' });
  const has = (line) => assert.ok(glsl.includes(line), `missing: ${line}\n${glsl}`);
  has('uniform vec4 fcb0[7];');
  has('uniform sampler2D ftex1;');
  has('in vec4 io5;');
  // A 4-wide source swizzle is positional under the destination mask.
  has('r0.xy = floatBitsToInt(v1.xy * vec2(2.0, 0.15));');
  has('r0.xy = floatBitsToInt(fcb1[0].yy * vec2(0.0, -0.15) + intBitsToFloat(r0.xy));');
  has('r0.xyzw = floatBitsToInt(texture(ftex0, intBitsToFloat(r0.xy)).xyzw);');
  // A 1-wide source swizzle is that one component.
  has('r1.y = floatBitsToInt(v1.y * fcb0[4].z + intBitsToFloat(r0.z));');
  // Comparisons write 0 / -1 masks, never floats.
  has('r1.x = -int(intBitsToFloat(r0.y) < 0.5);');
  has('r1.zw = -ivec2(lessThan(intBitsToFloat(r0.xy), vec2(0.25, 0.25)));');
  has('r1.x = r1.x & 1065353216;');
  has('r1.z = r1.z & int(2147483648u);');
  has('r0.xy = ivec2(notEqual(r1.zw, ivec2(0))) * r0.xy + ivec2(equal(r1.zw, ivec2(0))) * ivec2(0, 0);');
  has('r0.w = floatBitsToInt(dot(intBitsToFloat(r0.xyz), (-v5.xyz)));');
  has('if (r1.x != 0) discard;');
  has('if (r1.w != 0) {');
  has('    r0.w = floatBitsToInt(clamp(abs(intBitsToFloat(r0.w)), 0.0, 1.0));');
  has('    r0.w = floatBitsToInt(inversesqrt(intBitsToFloat(r0.w)));');
  has('o0.xyz = clamp(intBitsToFloat(r0.xyz) * fcb0[5].zzz, 0.0, 1.0);');
  has('o0.w = intBitsToFloat(r0.w);');
  has('fragColor = o0;');
  assert.deepEqual(buffers.map((buffer) => [buffer.slot, buffer.length, buffer.uniform]), [[0, 7, 'fcb0'], [1, 1, 'fcb1']]);
  assert.deepEqual(textures.map((texture) => texture.uniform), ['ftex0', 'ftex1']);
  assert.deepEqual(inputs.map((input) => input.register), [1, 2, 5]);
});

test('a vertex shader names its attributes by semantic and its varyings by register', () => {
  const { glsl, inputs } = transpile(VERTEX, { stage: 'vertex' });
  assert.deepEqual(inputs, [
    { register: 0, semantic: 'POSITION', index: 0, attribute: 'aPOSITION0' },
    { register: 3, semantic: 'TEXCOORD', index: 0, attribute: 'aTEXCOORD0' },
  ]);
  assert.ok(glsl.includes('in vec4 aPOSITION0;'));
  assert.ok(glsl.includes('out vec4 io2;'));
  assert.ok(glsl.includes('o1.xy = v3.xy * vcb0[7].xy + vcb0[7].zw;'));
  // Destination .zw takes the 3rd and 4th components of the source swizzle.
  assert.ok(glsl.includes('o2.zw = intBitsToFloat(floatBitsToInt(v3.zw));'));
  assert.ok(glsl.includes('gl_Position = o0;'));
});

test('mov and movc read a negate or abs as float; integer opcodes negate as integers', () => {
  const body = (lines) => FRAGMENT.replace('rsq r0.w, r0.w', lines.join('\n'));
  const { glsl } = transpile(body(['mov r0.w, -r0.x', 'mov r0.z, |r0.y|', 'movc r0.y, r0.y, -r0.z, r0.z', 'iadd r0.x, r0.x, -r1.x', 'add r0.x, r0.x, -l(-0.500000)']), { stage: 'fragment' });
  const has = (line) => assert.ok(glsl.includes(line), `missing: ${line}\n${glsl}`);
  // Colorless_Rainbow_Nova's `movc r0.y, r0.y, -r0.z, r0.z` flips a sign bit: 0 − bits is another number.
  has('r0.w = floatBitsToInt((-intBitsToFloat(r0.x)));');
  has('r0.z = floatBitsToInt(abs(intBitsToFloat(r0.y)));');
  has('r0.y = (r0.y != 0) ? floatBitsToInt((-intBitsToFloat(r0.z))) : r0.z;');
  has('r0.x = r0.x + (-r1.x);');
  // A signed literal under a negate keeps its parentheses (`--0.5` would not parse).
  has('(-(-0.5))');
});

test('derivative opcodes map onto dFdx and dFdy, coarse and fine alike', () => {
  const body = (lines) => FRAGMENT.replace('rsq r0.w, r0.w', lines.join('\n'));
  const { glsl } = transpile(body(['deriv_rtx r0.w, r0.x', 'deriv_rty_fine r0.z, r0.y']), { stage: 'fragment' });
  assert.ok(glsl.includes('dFdx(intBitsToFloat(r0.x))'), glsl);
  assert.ok(glsl.includes('dFdy(intBitsToFloat(r0.y))'), glsl);
});

test('an opcode the translator does not know throws, naming it', () => {
  const asm = FRAGMENT.replace('rsq r0.w, r0.w', 'bfrev r0.w, r0.w');
  assert.throws(() => transpile(asm, { stage: 'fragment' }), /unsupported opcode: bfrev/);
});

test('a stage mismatch and an open if are refused', () => {
  assert.throws(() => transpile(VERTEX, { stage: 'fragment' }), /expected a fragment shader/);
  assert.throws(() => transpile(FRAGMENT.replace('endif', ''), { stage: 'fragment' }), /unbalanced if/);
});

test('constantReads lists every constant-buffer register a program reads', () => {
  const reads = constantReads(FRAGMENT);
  const key = (read) => `${read.slot}:${read.row}:${read.components.join('')}`;
  assert.deepEqual(reads.map(key).sort(), ['0:4:2', '0:5:12', '1:0:1']);
});
