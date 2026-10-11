// Design 068: translate one D3D10 shader, as `D3DDisassemble` prints it, into GLSL ES 3.00.
// Temporaries are kept as `ivec4` bit patterns, the way the hardware holds them, so a comparison
// mask (0 / 0xFFFFFFFF) and a float survive the same register: float maths goes through
// intBitsToFloat / floatBitsToInt, integer maths does not. Nothing is guessed: an opcode or
// operand this file does not know throws, naming it.

const COMPONENTS = 'xyzw';

/** Split `a, b(c, d), e` on the commas outside parentheses and brackets. */
export function splitOperands(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const literalComponent = (text) => {
  const value = text.trim();
  if (/^-?0x[0-9a-f]+$/i.test(value) || /^-?\d+$/.test(value)) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`immediate out of range: ${value}`);
    return { int: number | 0 };
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`unsupported immediate: ${value}`);
  return { float: number };
};

/**
 * Parse one operand: `r0.xy`, `-v1.xyxx`, `|r2.x|`, `cb0[5].y`, `l(1.0, 2.0, 0, 0)`, `t0.xyzw`,
 * `s1`, `o0.w`, `null`.
 */
export function parseOperand(text) {
  let rest = text.trim();
  let negate = false;
  let absolute = false;
  if (rest.startsWith('-')) {
    negate = true;
    rest = rest.slice(1);
  }
  if (rest.startsWith('|') && rest.endsWith('|')) {
    absolute = true;
    rest = rest.slice(1, -1);
  }
  if (rest === 'null') return { kind: 'null' };
  const literal = /^l\((.*)\)$/.exec(rest);
  if (literal) {
    return { kind: 'literal', values: splitOperands(literal[1]).map(literalComponent), negate, absolute };
  }
  const buffer = /^cb(\d+)\[(\d+)\](?:\.([xyzw]+))?$/.exec(rest);
  if (buffer) {
    return { kind: 'cb', slot: Number(buffer[1]), row: Number(buffer[2]), swizzle: buffer[3] ?? 'xyzw', negate, absolute };
  }
  const register = /^([rvots])(\d+)(?:\.([xyzw]+))?$/.exec(rest);
  if (register) {
    return { kind: register[1], index: Number(register[2]), swizzle: register[3] ?? 'xyzw', negate, absolute };
  }
  throw new Error(`unsupported operand: ${text}`);
}

const floatType = (n) => (n === 1 ? 'float' : `vec${n}`);
const intType = (n) => (n === 1 ? 'int' : `ivec${n}`);
const floatLiteral = (value) => {
  if (Object.is(value, -0)) return '-0.0';
  const text = String(value);
  return /[.e]/.test(text) ? text : `${text}.0`;
};
// A negative literal is spelled through its unsigned bits: `-2147483648` does not parse as an int.
const intLiteral = (value) => (value < 0 ? `int(${value >>> 0}u)` : String(value));

/** The source components a destination mask of `count` components reads, in mask order. */
const pickSwizzle = (swizzle, maskIndexes) => {
  if (swizzle.length === 1) return swizzle.repeat(maskIndexes.length);
  if (swizzle.length === 4) return maskIndexes.map((index) => swizzle[index]).join('');
  throw new Error(`unsupported swizzle width: ${swizzle}`);
};

const SIGNATURE_ROW = /^\/\/\s+(\w+)\s+(\d+)\s+([xyzw ]{1,4}?)\s+(\d+)\s+(\w+)\s+(\w+)\s*([xyzw ]*)$/;

/** The input and output signature tables in the disassembly's header comments. */
export function parseSignatures(asm) {
  const signatures = { input: [], output: [] };
  let section = null;
  for (const line of asm.split('\n')) {
    const text = line.trimEnd();
    if (/^\/\/ Input signature:/.test(text)) section = 'input';
    else if (/^\/\/ Output signature:/.test(text)) section = 'output';
    else if (!text.startsWith('//')) section = null;
    if (!section) continue;
    const row = SIGNATURE_ROW.exec(text);
    if (!row || row[1] === 'Name') continue;
    signatures[section].push({
      semantic: row[1],
      index: Number(row[2]),
      mask: row[3].trim(),
      register: Number(row[4]),
      systemValue: row[5],
      used: row[7].trim(),
    });
  }
  return signatures;
}

const FLOAT_BINARY = { add: '+', mul: '*', div: '/' };
const FLOAT_CALL_2 = { min: 'min', max: 'max' };
const FLOAT_CALL_1 = {
  sqrt: 'sqrt',
  rsq: 'inversesqrt',
  frc: 'fract',
  exp: 'exp2',
  log: 'log2',
  round_ni: 'floor',
  round_pi: 'ceil',
  round_z: 'trunc',
  round_ne: 'roundEven',
};
const COMPARE = { lt: ['lessThan', '<'], ge: ['greaterThanEqual', '>='], eq: ['equal', '=='], ne: ['notEqual', '!='] };
const INT_COMPARE = { ilt: ['lessThan', '<'], ige: ['greaterThanEqual', '>='], ieq: ['equal', '=='], ine: ['notEqual', '!='] };
const INT_BINARY = { and: '&', or: '|', xor: '^', iadd: '+' };
const DOT = { dp2: 2, dp3: 3, dp4: 4 };
const SAMPLER_TYPES = { texture2d: 'sampler2D', texturecube: 'samplerCube', texture3d: 'sampler3D' };
const COORD_WIDTH = { sampler2D: 2, samplerCube: 3, sampler3D: 3 };

/**
 * @param {string} asm a `vs_4_0` / `ps_4_0` disassembly
 * @param {{stage: 'vertex'|'fragment', prefix?: string}} options `prefix` keeps the two stages'
 *   uniforms apart (a program's stages may size the same buffer slot differently)
 * @returns {{glsl: string, inputs: object[], outputs: object[], buffers: {slot:number, length:number, uniform:string}[],
 *   textures: {slot:number, type:string, uniform:string}[], usesFragCoord: boolean}}
 */
export function transpile(asm, { stage, prefix = stage === 'vertex' ? 'v' : 'f' }) {
  const signatures = parseSignatures(asm);
  const buffers = [];
  const textures = [];
  const inputs = [];
  const outputs = [];
  const body = [];
  let temps = 0;
  let indent = 1;
  let usesFragCoord = false;
  let program = null;

  const pad = () => '  '.repeat(indent);
  const emit = (line) => body.push(`${pad()}${line}`);
  const bufferName = (slot) => `${prefix}cb${slot}`;
  const textureName = (slot) => `${prefix}tex${slot}`;

  /** A float expression of `count` components for a source operand. */
  const readFloat = (operand, maskIndexes) => {
    const count = maskIndexes.length;
    let expr;
    if (operand.kind === 'literal') {
      const picks = operand.values.length === 1 ? maskIndexes.map(() => operand.values[0]) : maskIndexes.map((index) => operand.values[index]);
      const parts = picks.map((value) => ('float' in value ? floatLiteral(value.float) : `intBitsToFloat(${intLiteral(value.int)})`));
      expr = count === 1 ? parts[0] : `${floatType(count)}(${parts.join(', ')})`;
    } else if (operand.kind === 'r') {
      expr = `intBitsToFloat(r${operand.index}.${pickSwizzle(operand.swizzle, maskIndexes)})`;
    } else if (operand.kind === 'v') {
      expr = `v${operand.index}.${pickSwizzle(operand.swizzle, maskIndexes)}`;
    } else if (operand.kind === 'cb') {
      expr = `${bufferName(operand.slot)}[${operand.row}].${pickSwizzle(operand.swizzle, maskIndexes)}`;
    } else {
      throw new Error(`operand is not a value: ${operand.kind}`);
    }
    if (operand.absolute) expr = `abs(${expr})`;
    if (operand.negate) expr = `(-${expr})`;
    return expr;
  };

  /** An integer (bit pattern) expression of `count` components for a source operand. */
  const readInt = (operand, maskIndexes) => {
    const count = maskIndexes.length;
    if (operand.absolute) throw new Error('abs on an integer operand');
    let expr;
    if (operand.kind === 'literal') {
      const picks = operand.values.length === 1 ? maskIndexes.map(() => operand.values[0]) : maskIndexes.map((index) => operand.values[index]);
      const parts = picks.map((value) => ('int' in value ? intLiteral(value.int) : `floatBitsToInt(${floatLiteral(value.float)})`));
      expr = count === 1 ? parts[0] : `${intType(count)}(${parts.join(', ')})`;
    } else if (operand.kind === 'r') {
      expr = `r${operand.index}.${pickSwizzle(operand.swizzle, maskIndexes)}`;
    } else if (operand.kind === 'v' || operand.kind === 'cb') {
      expr = `floatBitsToInt(${readFloat({ ...operand, negate: false }, maskIndexes)})`;
    } else {
      throw new Error(`operand is not a value: ${operand.kind}`);
    }
    return operand.negate ? `(-${expr})` : expr;
  };

  const maskOf = (operand) => ({ swizzle: operand.swizzle, indexes: [...operand.swizzle].map((c) => COMPONENTS.indexOf(c)) });

  const writeFloat = (dest, expr) => {
    if (dest.kind === 'null') return;
    const { swizzle } = maskOf(dest);
    if (dest.kind === 'r') emit(`r${dest.index}.${swizzle} = floatBitsToInt(${expr});`);
    else if (dest.kind === 'o') emit(`o${dest.index}.${swizzle} = ${expr};`);
    else throw new Error(`cannot write to ${dest.kind}`);
  };

  const writeInt = (dest, expr) => {
    if (dest.kind === 'null') return;
    const { swizzle } = maskOf(dest);
    if (dest.kind === 'r') emit(`r${dest.index}.${swizzle} = ${expr};`);
    else if (dest.kind === 'o') emit(`o${dest.index}.${swizzle} = intBitsToFloat(${expr});`);
    else throw new Error(`cannot write to ${dest.kind}`);
  };

  const saturate = (expr, saturated) => (saturated ? `clamp(${expr}, 0.0, 1.0)` : expr);
  const replicate = (scalar, count) => (count === 1 ? scalar : `${floatType(count)}(${scalar})`);
  const firstIndexes = (count) => Array.from({ length: count }, (_, index) => index);

  const sample = (opcode, operands, saturated) => {
    const [dest, coord, texture] = operands;
    const info = textures.find((entry) => entry.slot === texture.index);
    if (!info) throw new Error(`sample from an undeclared texture t${texture.index}`);
    const uv = readFloat(coord, firstIndexes(COORD_WIDTH[info.type]));
    let call;
    if (opcode === 'sample') call = `texture(${info.uniform}, ${uv})`;
    else if (opcode === 'sample_l') call = `textureLod(${info.uniform}, ${uv}, ${readFloat(operands[4], [0])})`;
    else if (opcode === 'sample_b') call = `texture(${info.uniform}, ${uv}, ${readFloat(operands[4], [0])})`;
    else throw new Error(`unsupported sample form: ${opcode}`);
    const { indexes } = maskOf(dest);
    writeFloat(dest, saturate(`${call}.${pickSwizzle(texture.swizzle, indexes)}`, saturated));
  };

  const instruction = (opcodeText, operands) => {
    const saturated = opcodeText.endsWith('_sat');
    const opcode = saturated ? opcodeText.slice(0, -4) : opcodeText;
    const dest = operands[0];
    const mask = dest && dest.kind !== 'null' && (dest.kind === 'r' || dest.kind === 'o') ? maskOf(dest) : null;
    const count = mask?.indexes.length ?? 0;
    const f = (index) => readFloat(operands[index], mask.indexes);
    const i = (index) => readInt(operands[index], mask.indexes);

    if (opcode in FLOAT_BINARY) return writeFloat(dest, saturate(`${f(1)} ${FLOAT_BINARY[opcode]} ${f(2)}`, saturated));
    if (opcode in FLOAT_CALL_2) return writeFloat(dest, saturate(`${FLOAT_CALL_2[opcode]}(${f(1)}, ${f(2)})`, saturated));
    if (opcode in FLOAT_CALL_1) return writeFloat(dest, saturate(`${FLOAT_CALL_1[opcode]}(${f(1)})`, saturated));
    if (opcode === 'mad') return writeFloat(dest, saturate(`${f(1)} * ${f(2)} + ${f(3)}`, saturated));
    if (opcode === 'mov') return saturated ? writeFloat(dest, saturate(f(1), true)) : writeInt(dest, i(1));
    if (opcode in DOT) {
      const width = firstIndexes(DOT[opcode]);
      const dot = `dot(${readFloat(operands[1], width)}, ${readFloat(operands[2], width)})`;
      return writeFloat(dest, replicate(saturate(dot, saturated), count));
    }
    if (opcode in COMPARE) {
      const [fn, op] = COMPARE[opcode];
      return writeInt(dest, count === 1 ? `-int(${f(1)} ${op} ${f(2)})` : `-${intType(count)}(${fn}(${f(1)}, ${f(2)}))`);
    }
    if (opcode in INT_COMPARE) {
      const [fn, op] = INT_COMPARE[opcode];
      return writeInt(dest, count === 1 ? `-int(${i(1)} ${op} ${i(2)})` : `-${intType(count)}(${fn}(${i(1)}, ${i(2)}))`);
    }
    if (opcode in INT_BINARY) return writeInt(dest, `${i(1)} ${INT_BINARY[opcode]} ${i(2)}`);
    if (opcode === 'not') return writeInt(dest, `~${i(1)}`);
    if (opcode === 'ineg') return writeInt(dest, `-${i(1)}`);
    if (opcode === 'ishl') return writeInt(dest, `${i(1)} << (${i(2)} & 31)`);
    if (opcode === 'ishr') return writeInt(dest, `${i(1)} >> (${i(2)} & 31)`);
    if (opcode === 'itof') return writeFloat(dest, `${floatType(count)}(${i(1)})`);
    if (opcode === 'ftoi') return writeInt(dest, `${intType(count)}(${f(1)})`);
    if (opcode === 'movc') {
      if (count === 1) return writeInt(dest, `(${i(1)} != 0) ? ${i(2)} : ${i(3)}`);
      const zero = `${intType(count)}(0)`;
      return writeInt(dest, `${intType(count)}(notEqual(${i(1)}, ${zero})) * ${i(2)} + ${intType(count)}(equal(${i(1)}, ${zero})) * ${i(3)}`);
    }
    if (opcode === 'sincos') {
      const [sinDest, cosDest, source] = operands;
      for (const [target, fn] of [[sinDest, 'sin'], [cosDest, 'cos']]) {
        if (target.kind === 'null') continue;
        writeFloat(target, saturate(`${fn}(${readFloat(source, maskOf(target).indexes)})`, saturated));
      }
      return undefined;
    }
    if (opcode.startsWith('sample')) return sample(opcode, operands, saturated);
    if (opcode === 'discard_nz' || opcode === 'discard_z') {
      return emit(`if (${readInt(operands[0], [COMPONENTS.indexOf(operands[0].swizzle[0])])} ${opcode === 'discard_nz' ? '!=' : '=='} 0) discard;`);
    }
    if (opcode === 'if_nz' || opcode === 'if_z') {
      emit(`if (${readInt(operands[0], [COMPONENTS.indexOf(operands[0].swizzle[0])])} ${opcode === 'if_nz' ? '!=' : '=='} 0) {`);
      indent += 1;
      return undefined;
    }
    if (opcode === 'else') {
      indent -= 1;
      emit('} else {');
      indent += 1;
      return undefined;
    }
    if (opcode === 'endif') {
      indent -= 1;
      return emit('}');
    }
    if (opcode === 'ret') return emit('return;');
    throw new Error(`unsupported opcode: ${opcodeText}`);
  };

  const declare = (opcode, rest) => {
    if (opcode === 'dcl_constantbuffer') {
      const match = /^CB(\d+)\[(\d+)\]/i.exec(rest);
      if (!match) throw new Error(`unsupported constant buffer: ${rest}`);
      buffers.push({ slot: Number(match[1]), length: Number(match[2]), uniform: bufferName(Number(match[1])) });
    } else if (opcode.startsWith('dcl_resource_')) {
      const type = SAMPLER_TYPES[opcode.slice('dcl_resource_'.length)];
      const match = /t(\d+)$/.exec(rest);
      if (!type || !match) throw new Error(`unsupported resource: ${opcode} ${rest}`);
      textures.push({ slot: Number(match[1]), type, uniform: textureName(Number(match[1])) });
    } else if (opcode === 'dcl_input' || opcode === 'dcl_input_ps') {
      const match = /v(\d+)(?:\.([xyzw]+))?$/.exec(rest);
      if (!match) throw new Error(`unsupported input: ${rest}`);
      inputs.push({ register: Number(match[1]), flat: /\bconstant\b/.test(rest), system: null });
    } else if (opcode === 'dcl_input_ps_siv' || opcode === 'dcl_input_ps_sgv' || opcode === 'dcl_input_sgv' || opcode === 'dcl_input_siv') {
      const match = /v(\d+)(?:\.([xyzw]+))?,\s*(\w+)$/.exec(rest);
      if (!match) throw new Error(`unsupported system input: ${rest}`);
      inputs.push({ register: Number(match[1]), flat: false, system: match[3] });
    } else if (opcode === 'dcl_output') {
      const match = /o(\d+)/.exec(rest);
      outputs.push({ register: Number(match[1]), system: null });
    } else if (opcode === 'dcl_output_siv') {
      const match = /o(\d+)(?:\.[xyzw]+)?,\s*(\w+)$/.exec(rest);
      outputs.push({ register: Number(match[1]), system: match[2] });
    } else if (opcode === 'dcl_temps') {
      temps = Number(rest);
    } else if (opcode !== 'dcl_sampler' && opcode !== 'dcl_globalFlags') {
      throw new Error(`unsupported declaration: ${opcode} ${rest}`);
    }
  };

  for (const rawLine of asm.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    if (/^[vp]s_\d_\d$/.test(line)) {
      program = line;
      continue;
    }
    const space = line.search(/\s/);
    const opcode = space < 0 ? line : line.slice(0, space);
    const rest = space < 0 ? '' : line.slice(space + 1).trim();
    if (opcode.startsWith('dcl_')) declare(opcode, rest);
    else instruction(opcode, splitOperands(rest).map(parseOperand));
  }
  if (!program || program[0] !== (stage === 'vertex' ? 'v' : 'p')) {
    throw new Error(`expected a ${stage} shader, found ${program ?? 'no program'}`);
  }
  if (indent !== 1) throw new Error('unbalanced if / endif');

  const semanticOf = (table, register) => table.filter((row) => row.register === register);
  const header = ['#version 300 es', 'precision highp float;', 'precision highp int;', 'precision highp sampler2D;', 'precision highp samplerCube;', 'precision highp sampler3D;'];
  for (const buffer of buffers) header.push(`uniform vec4 ${buffer.uniform}[${buffer.length}];`);
  for (const texture of textures) header.push(`uniform ${texture.type} ${texture.uniform};`);

  const setup = [];
  const finish = [];
  const describedInputs = [];
  for (const input of inputs) {
    const rows = semanticOf(signatures.input, input.register);
    if (input.system === 'position') {
      usesFragCoord = true;
      header.push('uniform float uTargetHeight;');
      // D3D pixel centres count down from the top; w carries the interpolated 1 / w.
      setup.push(`vec4 v${input.register} = vec4(gl_FragCoord.x, uTargetHeight - gl_FragCoord.y, gl_FragCoord.z, 1.0 / gl_FragCoord.w);`);
    } else if (input.system === 'is_front_face') {
      setup.push(`vec4 v${input.register} = vec4(intBitsToFloat(gl_FrontFacing ? -1 : 0));`);
    } else if (input.system === 'vertex_id') {
      setup.push(`vec4 v${input.register} = vec4(intBitsToFloat(gl_VertexID));`);
    } else if (input.system) {
      throw new Error(`unsupported system value: ${input.system}`);
    } else if (stage === 'vertex') {
      if (rows.length !== 1) throw new Error(`vertex input v${input.register} has ${rows.length} semantics`);
      const name = `a${rows[0].semantic}${rows[0].index}`;
      header.push(`in vec4 ${name};`);
      setup.push(`vec4 v${input.register} = ${name};`);
      describedInputs.push({ register: input.register, semantic: rows[0].semantic, index: rows[0].index, attribute: name });
    } else {
      header.push(`${input.flat ? 'flat ' : ''}in vec4 io${input.register};`);
      setup.push(`vec4 v${input.register} = io${input.register};`);
      describedInputs.push({ register: input.register });
    }
  }
  const describedOutputs = [];
  for (const output of outputs) {
    setup.push(`o${output.register} = vec4(0.0);`);
    if (stage === 'vertex') {
      if (output.system === 'position') {
        finish.push(`gl_Position = o${output.register};`);
      } else if (output.system) {
        throw new Error(`unsupported system output: ${output.system}`);
      } else {
        header.push(`out vec4 io${output.register};`);
        finish.push(`io${output.register} = o${output.register};`);
      }
    } else {
      if (output.register !== 0) throw new Error('multiple render targets are not supported');
      header.push('out vec4 fragColor;');
      finish.push('fragColor = o0;');
    }
    describedOutputs.push({ register: output.register, system: output.system });
  }
  const globals = outputs.map((output) => `vec4 o${output.register};`);
  for (let index = 0; index < temps; index += 1) globals.push(`ivec4 r${index};`);
  // Inputs are locals of main; the body reads them, so they are passed as globals too.
  const inputGlobals = setup.filter((line) => line.startsWith('vec4 v')).map((line) => `${line.slice(0, line.indexOf(' ='))};`);
  const assigns = setup.map((line) => (line.startsWith('vec4 v') ? line.slice(5) : line));

  const glsl = [
    ...header,
    ...globals,
    ...inputGlobals,
    'void body() {',
    ...Array.from({ length: temps }, (_, index) => `  r${index} = ivec4(0);`),
    ...body,
    '}',
    'void main() {',
    ...assigns.map((line) => `  ${line}`),
    '  body();',
    ...finish.map((line) => `  ${line}`),
    '}',
    '',
  ].join('\n');

  return { glsl, inputs: describedInputs, outputs: describedOutputs, buffers, textures, usesFragCoord };
}

/**
 * Every `cbN[row].components` the program reads, as `{slot, row, components}` (components a
 * sorted set of 0–3), so the caller can check each against the reflection tables.
 */
export function constantReads(asm) {
  const reads = new Map();
  for (const rawLine of asm.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('dcl_')) continue;
    for (const match of line.matchAll(/cb(\d+)\[(\d+)\](?:\.([xyzw]+))?/g)) {
      const key = `${match[1]}:${match[2]}`;
      const set = reads.get(key) ?? new Set();
      for (const char of match[3] ?? 'xyzw') set.add(COMPONENTS.indexOf(char));
      reads.set(key, set);
    }
  }
  return [...reads].map(([key, set]) => {
    const [slot, row] = key.split(':').map(Number);
    return { slot, row, components: [...set].sort() };
  });
}
