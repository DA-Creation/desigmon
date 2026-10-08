// Original synthetic ASM only; checks real WASM linker allocation boundaries.
const test = require('node:test');
const assert = require('node:assert/strict');
const SourceProject = require('../web/gold/source-build.js');

function project(opaqueBytes, payloadAddress = 0x4001) {
  const text = data => ({ encoding: 'utf8', data });
  return JSON.stringify({
    format: 'designmon-gold-build-project-v1', rgbds_version: '1.0.3',
    assembly_units: [{ source: 'main.asm', object: 'main.o' }],
    graphics_steps: [], build_state: { pendingFiles: [] },
    files: {
      'includes.asm': text(''), 'layout.link': text(''),
      'main.asm': text('SECTION "Synthetic payload", ROMX[$' + payloadAddress.toString(16) + '], BANK[1]\n db $44\n'),
      'opaque.asm': text('SECTION "Preserved opaque slot", ROMX[$4000], BANK[1]\n db ' + opaqueBytes + '\n' +
        'SECTION "Trailing padding", ROMX[$4000], BANK[127]\n ds $4000, 0\n')
    }
  });
}

test('source growth cannot overwrite nonzero opaque data or the zero bytes in its allocation', async () => {
  for (const address of [0x4000, 0x4001]) {
    const source = await SourceProject.import(project('$33, $00', address));
    await assert.rejects(() => source.build(), /overlaps preserved opaque data/);
    assert.equal(source.building, false, 'a rejected build can be corrected and retried');
  }
});

test('source growth can consume an all-zero opaque padding section', async () => {
  const source = await SourceProject.import(project('$00, $00'));
  const result = await source.build();
  assert.equal(result.rom.length, 2097152);
  assert.equal(result.rom[0x4000], 0);
  assert.equal(result.rom[0x4001], 0x44);
});

test('explicitly moving the opaque allocation permits replacing it with decoded source', async () => {
  const source = await SourceProject.import(project('$33, $00'));
  source.write('opaque.asm', source.read('opaque.asm').replace('ROMX[$4000], BANK[1]', 'ROMX[$4002], BANK[1]'));
  const result = await source.build();
  assert.equal(result.rom[0x4001], 0x44);
  assert.equal(result.rom[0x4002], 0x33);
});
