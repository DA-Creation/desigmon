'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CPU = require('../web/gold/cpu.js');

let checks = 0;
const bytesEqual = (actual, expected, message) => { assert.deepEqual(Array.from(actual), Array.from(expected), message); checks++; };
const textRoundTrip = (bytes, address = 0) => {
  const instruction = CPU.decode(bytes, 0, address);
  bytesEqual(CPU.assemble(instruction.text, address), instruction.bytes, instruction.text + ' @ ' + address.toString(16));
  return instruction;
};

// Independent instruction lengths, laid out in the conventional 16x16 opcode
// chart. CB needs the following opcode; the eleven illegal bytes remain DB.
const sizes = [
  '1311112131111121', '2311112121111121', '2311112121111121', '2311112121111121',
  '1111111111111111', '1111111111111111', '1111111111111111', '1111111111111111',
  '1111111111111111', '1111111111111111', '1111111111111111', '1111111111111111',
  '1133312111323321', '1131312111313121', '2111112121311121', '2111112121311121',
].join('');
const invalid = [0xD3, 0xDB, 0xDD, 0xE3, 0xE4, 0xEB, 0xEC, 0xED, 0xF4, 0xFC, 0xFD];
assert.equal(sizes.length, 256);
assert.deepEqual(CPU.invalidOpcodes, invalid);
for (let opcode = 0; opcode < 256; opcode++) {
  const decoded = CPU.decode([opcode, 0, 0]);
  assert.equal(decoded.size, Number(sizes[opcode]), 'size of opcode ' + opcode.toString(16));
  assert.equal(decoded.valid, !invalid.includes(opcode));
  assert.equal(decoded.prefixed, opcode === 0xCB);
}

// Every possible following byte for every base opcode, at ROM-bank and CPU
// wrap boundaries. The independent examples below also check actual encodings;
// a codec that consistently maps both directions to a wrong opcode must fail.
for (let opcode = 0; opcode < 256; opcode++) {
  for (const address of [0, 0x3FFF, 0x4000, 0x7FFF, 0xFFFE, 0xFFFF]) {
    for (let operand = 0; operand < 256; operand++) textRoundTrip([opcode, operand, 255 - operand], address);
  }
}
for (let opcode = 0; opcode < 256; opcode++) {
  const decoded = textRoundTrip([0xCB, opcode], 0x7FFF);
  assert.equal(decoded.size, 2);
  assert.equal(decoded.prefixed, true);
  assert.equal(decoded.valid, true);
}

// Exercise all 65,536 values in each distinct 16-bit operand shape, rather than
// only the two bytes being equal or only one byte changing.
for (const opcode of [0x01, 0x08, 0xC2, 0xC3, 0xC4, 0xCD, 0xEA, 0xFA]) {
  for (let immediate = 0; immediate <= 0xFFFF; immediate++) textRoundTrip([opcode, immediate & 255, immediate >> 8], 0x4567);
}

const examples = [
  ['NOP', [0]], ['LD BC, $1234', [0x01, 0x34, 0x12]],
  ['LD [$C000], SP', [0x08, 0x00, 0xC0]],
  ['LD [HL+], A', [0x22]], ['LD A, [HL-]', [0x3A]],
  ['HALT', [0x76]], ['LD A, [HL]', [0x7E]], ['LD [HL], A', [0x77]],
  ['ADD A, [HL]', [0x86]], ['ADC A, $89', [0xCE, 0x89]],
  ['SUB A, E', [0x93]], ['SBC A, L', [0x9D]], ['AND A, [HL]', [0xA6]],
  ['XOR A, A', [0xAF]], ['OR A, B', [0xB0]], ['CP A, $FE', [0xFE, 0xFE]],
  ['RET NZ', [0xC0]], ['JP NC, $1234', [0xD2, 0x34, 0x12]],
  ['CALL Z, $ABCD', [0xCC, 0xCD, 0xAB]], ['RETI', [0xD9]],
  ['PUSH AF', [0xF5]], ['POP BC', [0xC1]], ['JP HL', [0xE9]],
  ['LDH [$FF80], A', [0xE0, 0x80]], ['LDH A, [$FFFF]', [0xF0, 0xFF]],
  ['LDH [C], A', [0xE2]], ['LDH A, [C]', [0xF2]],
  ['ADD SP, -128', [0xE8, 0x80]], ['LD HL, SP+127', [0xF8, 0x7F]],
  ['LD HL, SP-1', [0xF8, 0xFF]], ['LD SP, HL', [0xF9]],
  ['RST $38', [0xFF]], ['DI', [0xF3]], ['EI', [0xFB]],
  ['RLC A', [0xCB, 0x07]], ['RLCA', [0x07]],
  ['RRC A', [0xCB, 0x0F]], ['RRCA', [0x0F]],
  ['RL A', [0xCB, 0x17]], ['RLA', [0x17]],
  ['RR A', [0xCB, 0x1F]], ['RRA', [0x1F]],
  ['SLA H', [0xCB, 0x24]], ['SRA [HL]', [0xCB, 0x2E]],
  ['SWAP A', [0xCB, 0x37]], ['SRL E', [0xCB, 0x3B]],
  ['BIT 7, H', [0xCB, 0x7C]], ['RES 3, D', [0xCB, 0x9A]], ['SET 0, [HL]', [0xCB, 0xC6]],
  ['STOP $00', [0x10, 0x00]], ['STOP $ED', [0x10, 0xED]], ['DB $ED', [0xED]],
];
for (const [text, bytes] of examples) {
  bytesEqual(CPU.assemble(text), bytes, text);
  assert.equal(CPU.decode(bytes).text, text);
}
bytesEqual(CPU.assemble('stop\nsub c\nxor a\nld [hli], a\njp [hl]\nldh [$40], a\nbit $7, h'),
  [0x10, 0x00, 0x91, 0xAF, 0x22, 0xE9, 0xE0, 0x40, 0xCB, 0x7C]);

// Relative jumps are absolute CPU addresses in the text, including wraparound.
for (const opcode of [0x18, 0x20, 0x28, 0x30, 0x38]) {
  for (const address of [0, 1, 0x7FFF, 0xFFFE, 0xFFFF]) {
    for (let displacement = -128; displacement <= 127; displacement++) {
      const decoded = CPU.decode([opcode, displacement & 255], 0, address);
      assert.equal(decoded.target, (address + 2 + displacement + 0x10000) % 0x10000);
      bytesEqual(CPU.assemble(decoded.text, address), [opcode, displacement & 255]);
    }
  }
}
assert.equal(CPU.decode([0x18, 0xFE], 0, 0xFFFF).text, 'JR $FFFF');
assert.throws(() => CPU.assemble('JR $0082', 0), /JR displacement/);
assert.throws(() => CPU.assemble('JR $FF81', 0), /JR displacement/);
bytesEqual(CPU.assemble('JR $0081', 0), [0x18, 0x7F]);
bytesEqual(CPU.assemble('JR $FF82', 0), [0x18, 0x80]);

// Labels, forward references, data, comments, signed values and address wrap.
const assembled = CPU.assembleDetailed(`
entry: LD SP, $FFFE ; no change to address from comments/empty lines
       CALL next
       JR NZ, entry
       DB %01010101, 0xAA
next:  LD A, $2A
       RET
`, 0x4000);
bytesEqual(assembled.bytes, [0x31, 0xFE, 0xFF, 0xCD, 0x0A, 0x40, 0x20, 0xF8, 0x55, 0xAA, 0x3E, 0x2A, 0xC9]);
assert.deepEqual(assembled.labels, { ENTRY: 0x4000, NEXT: 0x400A });
assert.equal(assembled.records[1].line, 3);
assert.equal(assembled.records[1].address, 0x4003);
const wrapped = CPU.assembleDetailed('first: NOP\nlast: JR first\nJP last', 0xFFFF);
assert.deepEqual(wrapped.labels, { FIRST: 0xFFFF, LAST: 0 });
bytesEqual(wrapped.bytes, [0x00, 0x18, 0xFD, 0xC3, 0x00, 0x00]);
bytesEqual(CPU.assemble('here: LD HL, here+2\nDB here+1', 0x10), [0x21, 0x12, 0, 0x11]);

// Any selected slice remains byte-identical, including truncated operand/prefix
// endings and embedded data that only happens to resemble machine code.
for (let opcode = 0; opcode < 256; opcode++) {
  const bytes = Uint8Array.of(opcode, 0xCB, 0x10, 0x34, 0x12);
  for (let length = 0; length <= bytes.length; length++) {
    const records = CPU.disassemble(bytes, { offset: 0, length, address: 0xFFFF });
    bytesEqual(CPU.assemble(records.map(r => r.text).join('\n'), 0xFFFF), bytes.subarray(0, length));
    assert.equal(records.reduce((n, r) => n + r.size, 0), length);
    records.forEach(r => assert.equal(r.address, (0xFFFF + r.offset) & 0xFFFF));
  }
}
assert.equal(CPU.decode([0xCB]).truncated, true);
assert.equal(CPU.decode([0x01, 0x34]).text, 'DB $01');
assert.equal(CPU.decode([0xD3]).truncated, false);
bytesEqual(CPU.assemble(CPU.disassemble([0xC3, 0x34]).map(r => r.text).join('\n')), [0xC3, 0x34]);
const ranged = CPU.disassemble([0xFF, 0x18, 0xFC, 0x00, 0xFA], { offset: 1, length: 3, address: 0x4000 });
assert.deepEqual(ranged.map(r => r.offset), [1, 3]);
assert.deepEqual(ranged.map(r => r.text), ['JR $3FFE', 'NOP']);
assert.deepEqual(CPU.disassemble([], { offset: 0, length: 0 }), []);

// Fuzz deterministic ROM-like data, each time decoding/reassembling all bytes.
let seed = 0xFEED1234;
for (let iteration = 0; iteration < 80; iteration++) {
  const bytes = new Uint8Array(1 + iteration * 53);
  for (let i = 0; i < bytes.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; bytes[i] = seed >>> 24;
  }
  const start = (iteration * 877) & 0xFFFF;
  bytesEqual(CPU.assemble(CPU.disassemble(bytes, { address: start }).map(r => r.text).join('\n'), start), bytes);
}

// Errors fail closed, report source lines and never silently truncate numbers.
for (const source of [
  'LD A, 256', 'LD BC, 65536', 'LD A, -1', 'ADD SP, 128', 'LD HL, SP-129',
  'LDH [$FEFF], A', 'RST 9', 'BIT 8, A', 'SET -1, [HL]', 'DB 256', 'DB -1',
  'LD A, missing', 'hello: NOP\nhello: NOP', 'A: NOP', 'JP 1+2+3',
  'DB globalThis.secret', 'DB (function(){})()', 'LD [HL], [HL]', 'CB $00',
  'LD A,', 'DB', 'DB $1,', 'IM 1', 'EXX', 'OUT [$40], A', 'RST -8',
]) assert.throws(() => CPU.assemble(source), CPU.AssemblyError, source);
try { CPU.assemble('NOP\n\nLD A, 256'); assert.fail('must throw'); }
catch (error) { assert.equal(error.line, 3); assert.match(error.message, /Line 3:/); }
for (const input of [[-1], [256], [1.5], 'not bytes', null, {}]) assert.throws(() => CPU.decode(input));
assert.throws(() => CPU.decode([]), RangeError);
assert.throws(() => CPU.decode([0], 1), RangeError);
assert.throws(() => CPU.decode([0], -1), RangeError);
assert.throws(() => CPU.decode([0], 0, 0x10000), RangeError);
assert.throws(() => CPU.disassemble([0], { length: 2 }), RangeError);
assert.throws(() => CPU.disassemble([0], { address: -1 }), RangeError);
assert.throws(() => CPU.disassemble([0], 0), TypeError);
assert.throws(() => CPU.assemble('NOP', -1), RangeError);

// Fixed-size editing returns a patch proposal and never mutates the input ROM.
const original = Uint8Array.of(0xFF, 0x3E, 0x01, 0xC9);
const patch = CPU.assemblePatch(original, 1, 2, 'LD A, $2A', 0x4000);
bytesEqual(patch.before, [0x3E, 0x01]); bytesEqual(patch.after, [0x3E, 0x2A]);
bytesEqual(original, [0xFF, 0x3E, 0x01, 0xC9]);
patch.before[0] = 0; assert.equal(original[1], 0x3E);
assert.throws(() => CPU.assemblePatch(original, 1, 2, 'NOP', 0x4000), /must remain 2 bytes/);
assert.throws(() => CPU.assemblePatch(original, 3, 2, 'NOP\nNOP'), RangeError);

// Browser IIFE export is independently usable without Node require or a module
// loader. Execute the assertions inside that realm to include its typed arrays.
const browser = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/gold/cpu.js'), 'utf8'), browser);
assert.equal(vm.runInContext(`GoldCPU.decode(Uint8Array.of(0xCB, 0x7E)).text`, browser), 'BIT 7, [HL]');
assert.equal(vm.runInContext(`Array.from(GoldCPU.assemble('loop: JR loop', 0x4000)).join(',')`, browser), '24,254');

// Optional independently maintained opcode oracle (development verification).
// Downloaded outside the repository, never needed for normal offline testing.
if (process.env.GOLD_OPCODE_ORACLE) {
  const reference = JSON.parse(fs.readFileSync(process.env.GOLD_OPCODE_ORACLE, 'utf8'));
  const hex = (n, width) => '$' + n.toString(16).toUpperCase().padStart(width, '0');
  for (const [prefix, table] of Object.entries(reference)) {
    for (const [code, entry] of Object.entries(table)) {
      const opcode = Number(code);
      if (prefix === 'unprefixed' && opcode === 0xCB) continue;
      for (const operand of [0, 0x5A, 0x80, 0xFF]) {
        const decoded = CPU.decode(prefix === 'cbprefixed' ? [0xCB, opcode] : [opcode, operand, 0xA5]);
        const context = prefix + ' ' + code;
        assert.equal(decoded.size, entry.bytes, context);
        const expectedMnemonic = entry.mnemonic.startsWith('ILLEGAL') ? 'DB' : entry.mnemonic;
        assert.equal(decoded.mnemonic, expectedMnemonic, context);
        const operands = entry.operands.map(item => {
          let value = item.name;
          if (value === 'n8') value = hex(operand, 2);
          if (value === 'n16' || value === 'a16') value = hex(0xA500 | operand, 4);
          if (value === 'a8') value = hex(0xFF00 | operand, 4);
          if (value === 'e8') {
            const signed = operand >= 128 ? operand - 256 : operand;
            value = entry.mnemonic === 'JR' ? hex((2 + signed) & 0xFFFF, 4) : String(signed);
          }
          if (item.increment) value += '+';
          if (item.decrement) value += '-';
          return item.immediate ? value : '[' + value + ']';
        });
        let expectedOperands = operands.join(', ');
        if (prefix === 'unprefixed' && opcode === 0xF8) expectedOperands = 'HL, SP' + (operand >= 128 ? operand - 256 : '+' + operand);
        if (expectedMnemonic === 'DB') expectedOperands = hex(opcode, 2);
        assert.equal(decoded.operands, expectedOperands, context + ' operands');
      }
    }
  }
  console.log('Independent gbdev opcode table: 511 entries matched (mnemonics, lengths, registers, immediates).');
}

// Optional real-ROM round trip by 16 KiB bank. No ROM bytes are printed/written.
if ((process.env.GOLD_ROM||process.env.GOLD_ROM_PATH)) {
  const rom = fs.readFileSync((process.env.GOLD_ROM||process.env.GOLD_ROM_PATH));
  for (let offset = 0; offset < rom.length; offset += 0x4000) {
    const bank = rom.subarray(offset, Math.min(offset + 0x4000, rom.length));
    const address = offset === 0 ? 0 : 0x4000;
    const records = CPU.disassemble(bank, { address });
    bytesEqual(CPU.assemble(records.map(r => r.text).join('\n'), address), bank, 'ROM bank ' + offset / 0x4000);
  }
  console.log('ROM round trip: ' + rom.length + ' bytes matched.');
}
console.log('Gold CPU codec passed: ' + checks.toLocaleString('en-US') + ' byte-equality checks.');
