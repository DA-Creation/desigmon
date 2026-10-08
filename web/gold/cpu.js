/* Lossless SM83 instruction text codec. No ROM content or emulator state is included. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GoldCPU = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const R8 = ['B', 'C', 'D', 'E', 'H', 'L', '[HL]', 'A'];
  const R16 = ['BC', 'DE', 'HL', 'SP'];
  const STACK = ['BC', 'DE', 'HL', 'AF'];
  const MEM = ['[BC]', '[DE]', '[HL+]', '[HL-]'];
  const CONDITIONS = ['NZ', 'Z', 'NC', 'C'];
  const ALU = ['ADD', 'ADC', 'SUB', 'SBC', 'AND', 'XOR', 'OR', 'CP'];
  const ROTATE = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SWAP', 'SRL'];
  const INVALID = [0xD3, 0xDB, 0xDD, 0xE3, 0xE4, 0xEB, 0xEC, 0xED, 0xF4, 0xFC, 0xFD];
  const base = Array(256).fill(null), cb = Array(256).fill(null);
  const hex = (n, width) => '$' + n.toString(16).toUpperCase().padStart(width, '0');
  const signed = n => n < 128 ? n : n - 256;
  const compact = text => text.toUpperCase().replace(/\s+/g, '');
  const escapeRE = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function spec(opcode, mnemonic, operands = '', immediate = null, flow = 'next', conditional = false, prefixed = false) {
    const size = (prefixed ? 2 : 1) + (immediate === 'u16' ? 2 : immediate ? 1 : 0);
    const result = { opcode, mnemonic, operands, immediate, size, flow, conditional, prefixed };
    (prefixed ? cb : base)[opcode] = result;
    return result;
  }

  spec(0x00, 'NOP');
  for (let p = 0; p < 4; p++) {
    const op = p << 4;
    spec(op + 1, 'LD', R16[p] + ', {n}', 'u16');
    spec(op + 2, 'LD', MEM[p] + ', A');
    spec(op + 3, 'INC', R16[p]);
    spec(op + 9, 'ADD', 'HL, ' + R16[p]);
    spec(op + 10, 'LD', 'A, ' + MEM[p]);
    spec(op + 11, 'DEC', R16[p]);
  }
  for (let r = 0; r < 8; r++) {
    spec(4 + r * 8, 'INC', R8[r]);
    spec(5 + r * 8, 'DEC', R8[r]);
    spec(6 + r * 8, 'LD', R8[r] + ', {n}', 'u8');
    spec(7 + r * 8, ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][r]);
  }
  spec(0x08, 'LD', '[{n}], SP', 'u16');
  // STOP's second byte is retained even when nonzero. This is a text codec, not
  // a claim that every possible STOP sequence has identical hardware behavior.
  spec(0x10, 'STOP', '{n}', 'u8', 'stop');
  spec(0x18, 'JR', '{n}', 'rel8', 'jump');
  for (let c = 0; c < 4; c++) spec(0x20 + c * 8, 'JR', CONDITIONS[c] + ', {n}', 'rel8', 'jump', true);
  for (let dest = 0; dest < 8; dest++) {
    for (let src = 0; src < 8; src++) {
      const op = 0x40 + dest * 8 + src;
      if (op === 0x76) spec(op, 'HALT', '', null, 'halt');
      else spec(op, 'LD', R8[dest] + ', ' + R8[src]);
    }
  }
  for (let operation = 0; operation < 8; operation++) {
    for (let r = 0; r < 8; r++) spec(0x80 + operation * 8 + r, ALU[operation], 'A, ' + R8[r]);
    spec(0xC6 + operation * 8, ALU[operation], 'A, {n}', 'u8');
    spec(0xC7 + operation * 8, 'RST', hex(operation * 8, 2), null, 'call');
  }
  for (let c = 0; c < 4; c++) {
    spec(0xC0 + c * 8, 'RET', CONDITIONS[c], null, 'return', true);
    spec(0xC2 + c * 8, 'JP', CONDITIONS[c] + ', {n}', 'u16', 'jump', true);
    spec(0xC4 + c * 8, 'CALL', CONDITIONS[c] + ', {n}', 'u16', 'call', true);
    spec(0xC1 + c * 16, 'POP', STACK[c]);
    spec(0xC5 + c * 16, 'PUSH', STACK[c]);
  }
  spec(0xC3, 'JP', '{n}', 'u16', 'jump');
  spec(0xC9, 'RET', '', null, 'return');
  spec(0xCD, 'CALL', '{n}', 'u16', 'call');
  spec(0xD9, 'RETI', '', null, 'return');
  spec(0xE0, 'LDH', '[{n}], A', 'high8');
  spec(0xE2, 'LDH', '[C], A');
  spec(0xE8, 'ADD', 'SP, {n}', 'signed8');
  spec(0xE9, 'JP', 'HL', null, 'jump');
  spec(0xEA, 'LD', '[{n}], A', 'u16');
  spec(0xF0, 'LDH', 'A, [{n}]', 'high8');
  spec(0xF2, 'LDH', 'A, [C]');
  spec(0xF3, 'DI');
  spec(0xF8, 'LD', 'HL, SP{n}', 'sp8');
  spec(0xF9, 'LD', 'SP, HL');
  spec(0xFA, 'LD', 'A, [{n}]', 'u16');
  spec(0xFB, 'EI');
  for (let opcode = 0; opcode < 256; opcode++) {
    const r = opcode & 7, group = opcode >> 6, index = (opcode >> 3) & 7;
    spec(opcode, group === 0 ? ROTATE[index] : ['BIT', 'RES', 'SET'][group - 1],
      group === 0 ? R8[r] : index + ', ' + R8[r], null, 'next', false, true);
  }

  function byteView(bytes) {
    if (bytes instanceof Uint8Array) return bytes;
    if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
    if (Array.isArray(bytes) && bytes.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) return Uint8Array.from(bytes);
    throw new TypeError('bytes must be a Uint8Array, ArrayBuffer or array of bytes');
  }
  function integer(n, min, max, name) {
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new RangeError(name + ' must be an integer between ' + min + ' and ' + max);
    return n;
  }
  function dataRecord(bytes, offset, address, truncated) {
    const value = bytes[offset];
    return { offset, address, size: 1, bytes: [value], opcode: value, prefixed: false,
      mnemonic: 'DB', operands: hex(value, 2), text: 'DB ' + hex(value, 2),
      valid: false, truncated, kind: 'data', flow: 'unknown', conditional: false, target: null };
  }
  function decodeView(bytes, offset, address, end) {
    const opcode = bytes[offset];
    if (opcode === 0xCB && offset + 1 >= end) return dataRecord(bytes, offset, address, true);
    const def = opcode === 0xCB ? cb[bytes[offset + 1]] : base[opcode];
    if (!def || offset + def.size > end) return dataRecord(bytes, offset, address, !!def);
    let value = null, replacement = '', target = null;
    if (def.immediate) {
      value = bytes[offset + 1];
      if (def.immediate === 'u16') value |= bytes[offset + 2] << 8;
      switch (def.immediate) {
        case 'u16': replacement = hex(value, 4); break;
        case 'rel8': target = (address + 2 + signed(value)) & 0xFFFF; replacement = hex(target, 4); break;
        case 'signed8': value = signed(value); replacement = String(value); break;
        case 'sp8': value = signed(value); replacement = (value >= 0 ? '+' : '') + value; break;
        // LDH uses the effective high-page address to make the memory access clear.
        case 'high8': replacement = hex(0xFF00 + value, 4); break;
        default: replacement = hex(value, 2);
      }
    }
    if ((def.mnemonic === 'JP' || def.mnemonic === 'CALL') && def.immediate === 'u16') target = value;
    if (def.mnemonic === 'RST') target = def.opcode & 0x38;
    const operands = def.operands.replace('{n}', replacement);
    return { offset, address, size: def.size, bytes: Array.from(bytes.subarray(offset, offset + def.size)),
      opcode: def.opcode, prefixed: def.prefixed, mnemonic: def.mnemonic, operands,
      text: def.mnemonic + (operands ? ' ' + operands : ''), valid: true, truncated: false,
      kind: 'instruction', immediate: value, flow: def.flow, conditional: def.conditional, target };
  }

  function decode(input, offset = 0, cpuAddress = offset & 0xFFFF) {
    const bytes = byteView(input);
    integer(offset, 0, bytes.length - 1, 'offset');
    integer(cpuAddress, 0, 0xFFFF, 'cpuAddress');
    return decodeView(bytes, offset, cpuAddress, bytes.length);
  }

  function disassemble(input, options = {}) {
    const bytes = byteView(input);
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('disassemble options must be an object');
    const offset = options.offset === undefined ? 0 : options.offset;
    integer(offset, 0, bytes.length, 'offset');
    const length = options.length === undefined ? bytes.length - offset : options.length;
    integer(length, 0, bytes.length - offset, 'length');
    const address = options.address === undefined ? offset & 0xFFFF : options.address;
    integer(address, 0, 0xFFFF, 'address');
    const end = offset + length, result = [];
    for (let pos = offset; pos < end;) {
      const record = decodeView(bytes, pos, (address + pos - offset) & 0xFFFF, end);
      result.push(record);
      pos += record.size;
    }
    return result;
  }

  const fixed = new Map(), variables = new Map();
  for (const def of base.concat(cb).filter(Boolean)) {
    const template = def.mnemonic + ':' + compact(def.operands);
    if (!def.immediate) fixed.set(template, def);
    else {
      const [before, after] = template.split('{N}');
      def.pattern = new RegExp('^' + escapeRE(before) + '(.+?)' + escapeRE(after) + '$');
      if (!variables.has(def.mnemonic)) variables.set(def.mnemonic, []);
      variables.get(def.mnemonic).push(def);
    }
  }
  class AssemblyError extends Error {
    constructor(message, line, source) {
      super((line ? 'Line ' + line + ': ' : '') + message);
      this.name = 'AssemblyError'; this.line = line || null; this.source = source || '';
    }
  }
  const RESERVED = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L', 'AF', 'BC', 'DE', 'HL', 'SP', 'NZ', 'Z', 'NC']);

  // Only integer literals, labels, and a single +/- offset are accepted. No eval.
  function expression(text, labels, unresolved = false) {
    const input = compact(text);
    const match = /^([+-]?)(\$[0-9A-F]+|0X[0-9A-F]+|%[01]+|[0-9]+|[A-Z_.][A-Z0-9_.$]*)(?:([+-])(\$[0-9A-F]+|0X[0-9A-F]+|%[01]+|[0-9]+))?$/.exec(input);
    if (!match) throw new Error('Invalid integer or label: ' + text);
    const literal = value => value[0] === '$' ? parseInt(value.slice(1), 16)
      : value.startsWith('0X') ? parseInt(value.slice(2), 16)
      : value[0] === '%' ? parseInt(value.slice(1), 2) : Number(value);
    let result;
    if (/^[A-Z_.]/.test(match[2])) {
      if (RESERVED.has(match[2])) throw new Error('Register or condition is not a number: ' + match[2]);
      if (!labels.has(match[2])) {
        if (unresolved) return null;
        throw new Error('Undefined label: ' + match[2]);
      }
      result = labels.get(match[2]);
    } else result = literal(match[2]);
    if (match[1] === '-') result = -result;
    if (match[3]) result += (match[3] === '-' ? -1 : 1) * literal(match[4]);
    if (!Number.isSafeInteger(result)) throw new Error('Integer is outside the exact numeric range');
    return result;
  }

  function instruction(source, labels) {
    const match = /^([A-Z]+)(?:\s+(.*))?$/i.exec(source.trim());
    if (!match) throw new Error('Expected an instruction or DB');
    const mnemonic = match[1].toUpperCase();
    let operands = compact(match[2] || '').replace(/\[HLI\]/g, '[HL+]').replace(/\[HLD\]/g, '[HL-]');
    if (['SUB', 'AND', 'XOR', 'OR', 'CP'].includes(mnemonic) && operands && !operands.includes(',')) operands = 'A,' + operands;
    if (mnemonic === 'JP' && operands === '[HL]') operands = 'HL';
    if (mnemonic === 'STOP' && !operands) operands = '$00';
    if (mnemonic === 'DB') {
      if (!operands) throw new Error('DB needs at least one byte');
      const values = operands.split(',');
      values.forEach(n => expression(n, labels, true));
      return { type: 'data', values, size: values.length };
    }
    if (mnemonic === 'RST') {
      expression(operands, labels, true);
      return { type: 'rst', value: operands, size: 1 };
    }
    if (['BIT', 'RES', 'SET'].includes(mnemonic)) {
      const parts = operands.split(',');
      if (parts.length !== 2 || !R8.includes(parts[1])) throw new Error('Expected bit index and 8-bit register');
      expression(parts[0], labels, true);
      return { type: 'bit', mnemonic, value: parts[0], register: parts[1], size: 2 };
    }
    const key = mnemonic + ':' + operands;
    if (fixed.has(key)) return { type: 'instruction', def: fixed.get(key), size: fixed.get(key).size };
    for (const def of variables.get(mnemonic) || []) {
      const found = def.pattern.exec(key);
      if (!found) continue;
      try { expression(found[1], labels, true); }
      catch (_) { continue; }
      return { type: 'instruction', def, value: found[1], size: def.size };
    }
    throw new Error('Unknown instruction or operands: ' + source.trim());
  }
  function within(value, min, max, name) {
    if (value < min || value > max) throw new Error(name + ' must be ' + min + '..' + max + ', got ' + value);
    return value;
  }
  function encode(node, labels) {
    const evaluate = value => expression(value, labels);
    if (node.type === 'data') return node.values.map(value => within(evaluate(value), 0, 255, 'DB byte'));
    if (node.type === 'rst') {
      const target = within(evaluate(node.value), 0, 0x38, 'RST address');
      if (target % 8) throw new Error('RST address must be a multiple of 8');
      return [0xC7 + target];
    }
    if (node.type === 'bit') {
      const index = within(evaluate(node.value), 0, 7, 'Bit index');
      return [0xCB, { BIT: 0x40, RES: 0x80, SET: 0xC0 }[node.mnemonic] + index * 8 + R8.indexOf(node.register)];
    }
    const def = node.def, result = def.prefixed ? [0xCB, def.opcode] : [def.opcode];
    if (!def.immediate) return result;
    let value = evaluate(node.value);
    switch (def.immediate) {
      case 'u16': within(value, 0, 0xFFFF, '16-bit value'); result.push(value & 255, value >> 8); return result;
      case 'rel8': {
        within(value, 0, 0xFFFF, 'JR destination');
        // Arithmetic is on the CPU's 16-bit address space, including wraparound.
        const wrapped = (value - ((node.address + 2) & 0xFFFF)) & 0xFFFF;
        const displacement = wrapped >= 0x8000 ? wrapped - 0x10000 : wrapped;
        within(displacement, -128, 127, 'JR displacement'); value = displacement & 255; break;
      }
      case 'signed8': case 'sp8': within(value, -128, 127, 'Signed 8-bit value'); value &= 255; break;
      case 'high8':
        if (value >= 0xFF00 && value <= 0xFFFF) value -= 0xFF00;
        within(value, 0, 255, 'LDH address (low byte or $FF00..$FFFF)'); break;
      default: within(value, 0, 255, '8-bit value');
    }
    result.push(value);
    return result;
  }

  function assembleDetailed(text, startAddress = 0) {
    if (typeof text !== 'string') throw new TypeError('Assembly source must be text');
    integer(startAddress, 0, 0xFFFF, 'startAddress');
    const labels = new Map(), nodes = [];
    let size = 0;
    for (const [index, raw] of text.split(/\r?\n/).entries()) {
      let source = raw.replace(/;.*/, '').trim();
      if (!source) continue;
      try {
        let found;
        while ((found = /^([A-Z_.][A-Z0-9_.$]*):\s*/i.exec(source))) {
          const name = found[1].toUpperCase();
          if (RESERVED.has(name)) throw new Error('Label cannot be a register or condition: ' + name);
          if (labels.has(name)) throw new Error('Duplicate label: ' + name);
          labels.set(name, (startAddress + size) & 0xFFFF);
          source = source.slice(found[0].length);
        }
        if (!source) continue;
        const node = instruction(source, labels);
        Object.assign(node, { line: index + 1, source, offset: size, address: (startAddress + size) & 0xFFFF });
        nodes.push(node); size += node.size;
      } catch (error) { throw new AssemblyError(error.message, index + 1, raw); }
    }
    const bytes = new Uint8Array(size), records = [];
    for (const node of nodes) {
      try {
        const encoded = encode(node, labels);
        bytes.set(encoded, node.offset);
        records.push({ line: node.line, source: node.source, offset: node.offset, address: node.address, size: node.size, bytes: encoded });
      } catch (error) { throw new AssemblyError(error.message, node.line, node.source); }
    }
    return { bytes, records, labels: Object.fromEntries(labels), startAddress, size };
  }
  function assemble(text, startAddress = 0) { return assembleDetailed(text, startAddress).bytes; }

  // A fixed-size patch is deliberate: this codec cannot relocate arbitrary ROM
  // pointers, banked calls, text scripts, or data tables when code grows.
  function assemblePatch(input, offset, length, text, cpuAddress = offset & 0xFFFF) {
    const bytes = byteView(input);
    integer(offset, 0, bytes.length, 'offset'); integer(length, 0, bytes.length - offset, 'length');
    const replacement = assemble(text, cpuAddress);
    if (replacement.length !== length) throw new AssemblyError('Patch must remain ' + length + ' bytes; assembled ' + replacement.length + ' bytes');
    return { offset, address: cpuAddress, length, before: bytes.slice(offset, offset + length), after: replacement };
  }

  return Object.freeze({ decode, disassemble, assemble, assembleDetailed, assemblePatch, AssemblyError,
    version: 1, invalidOpcodes: Object.freeze(INVALID.slice()) });
});
