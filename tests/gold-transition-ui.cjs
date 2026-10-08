// Only the caller's local GOLD_ROM is read; no game data is distributed here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const ROM = process.env.GOLD_ROM;

async function harness() {
  const { Window } = await import('happy-dom');
  const { IDBFactory } = require('fake-indexeddb');
  const Runtime = require('../web/gold/runtime.js');
  const win = new Window({ url: 'https://unit.invalid/', settings: { disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true } });
  const writes = [], errors = [], frames = [];
  Object.defineProperty(win, 'crypto', { value: webcrypto });
  const indexedDB = new IDBFactory(), open = indexedDB.open.bind(indexedDB);
  // Observe actual IndexedDB writes without replacing the editor's persistence code.
  indexedDB.open = (...args) => {
    const request = open(...args);
    request.addEventListener('success', () => {
      const db = request.result, transaction = db.transaction.bind(db);
      db.transaction = (...args) => {
        const tx = transaction(...args), objectStore = tx.objectStore.bind(tx);
        tx.objectStore = (...args) => {
          const store = objectStore(...args), put = store.put.bind(store);
          store.put = (value, key) => { writes.push(key); return put(value, key); };
          return store;
        };
        return tx;
      };
    });
    return request;
  };
  win.indexedDB = indexedDB;
  win.GOLD_STANDALONE = true;
  win.fetch = () => { throw Error('Unexpected network'); };
  win.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  win.addEventListener('error', e => errors.push(e.message));
  let runtime;
  win.GoldRuntime = { create: async () => {
    runtime = await Runtime.create();
    for (const slot of [0, 1]) {
      const device = runtime.device(slot), open = device.open.bind(device);
      device.open = (bytes, options) => open(bytes, { ...options, deterministic: true });
    }
    return runtime;
  } };
  win.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    return { createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData: image => { canvas._pixels = Uint8Array.from(image.data); } };
  };
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  win.document.write(read('web/gold/index.html').replace(/<script[\s\S]*?<\/script>/g, ''));
  for (const file of ['rom-schema', 'rom-project', 'layout-check', 'layout-history', 'cpu', 'scenario', 'scenario-panel', 'editor-panels']) win.eval(read('web/gold/' + file + '.js'));
  win.GOLD_EMBEDDED_ROM = fs.readFileSync(ROM).toString('base64');
  win.eval(read('web/gold/editor.js'));
  const $ = id => win.document.getElementById(id);
  const click = id => $(id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const settle = () => new Promise(resolve => setTimeout(resolve, 5));
  const until = async condition => { for (let i = 0; i < 3000; i++) { if (condition()) return; await settle(); } throw Error('Timeout: ' + $('status').textContent); };
  await until(() => !$('link').disabled);
  const hash = win.GoldProject.hash;
  const holdHash = () => {
    const gate = { called: false };
    win.GoldProject.hash = bytes => {
      gate.called = true;
      const copy = Uint8Array.from(bytes);
      return new Promise((resolve, reject) => { gate.resolve = () => hash(copy).then(resolve, reject); gate.reject = reject; });
    };
    return gate;
  };
  const editHP = () => {
    click('edit');
    const input = $('recordForm').querySelector('[name=hp]');
    input.value = String(Number(input.value) + 1);
    $('recordForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  };
  const attemptSaveDuringTransition = async () => {
    writes.length = 0;
    click('save');
    win.dispatchEvent(new win.Event('pagehide'));
    Object.defineProperty(win.document, 'hidden', { configurable: true, value: true });
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    Object.defineProperty(win.document, 'hidden', { configurable: true, value: false });
    await settle();
    assert.deepEqual(writes, [], 'manual save, pagehide and visibility autosave must all be suppressed');
  };
  return { win, runtime, $, click, until, writes, holdHash, editHP, attemptSaveDuringTransition, restoreHash: () => { win.GoldProject.hash = hash; }, close: async () => { runtime?.closeAll(); await win.happyDOM.abort(); win.close(); assert.deepEqual(errors, []); } };
}

test('ROM transition awaits its hash before replacing the core and never writes the old save key', { skip: !ROM, timeout: 60000 }, async () => {
  const h = await harness();
  try {
    h.runtime.loadBattery(new Uint8Array(32768).fill(0xaa));
    const originalHash = h.win.GoldApp.status().romHash;
    h.editHP();
    const gate = h.holdHash(); h.click('apply'); await h.until(() => gate.called);
    const before = h.runtime.state();
    await h.attemptSaveDuringTransition();
    assert.deepEqual(h.runtime.state(), before);
    assert.equal(h.runtime.battery()[0], 0xaa, 'old SRAM stays loaded while hashing');
    assert.equal(h.win.GoldApp.status().romHash, originalHash);
    gate.resolve(); await h.until(() => !h.win.GoldApp.status().editing);
    const nextHash = h.win.GoldApp.status().romHash;
    assert.notEqual(nextHash, originalHash);
    assert.equal(h.runtime.battery()[0], 0xaa, 'explicit save migration completes with the ROM switch');
    h.writes.length = 0; h.click('save'); await h.until(() => h.$('status').textContent === '저장했습니다.');
    assert.deepEqual(h.writes, ['state:' + nextHash, 'battery:' + nextHash]);
    h.editHP();
    const failed = h.holdHash(); h.click('apply'); await h.until(() => failed.called);
    const previous = h.runtime.state();
    await h.attemptSaveDuringTransition();
    failed.reject(Error('injected hash failure')); await h.until(() => h.$('status').textContent === 'injected hash failure');
    assert.deepEqual(h.runtime.state(), previous, 'hash failure cannot reset the running core');
    assert.equal(h.win.GoldApp.status().romHash, nextHash);
    h.writes.length = 0; h.click('save'); await h.until(() => h.$('status').textContent === '저장했습니다.');
    assert.deepEqual(h.writes, ['state:' + nextHash, 'battery:' + nextHash], 'failed transition releases the save guard');
  } finally { await h.close(); }
});

test('failed second-ROM transition preserves both linked cores and restores saving', { skip: !ROM, timeout: 60000 }, async () => {
  const h = await harness();
  try {
    h.click('link'); h.click('bootPeer'); await h.until(() => h.win.GoldApp.status().connection === 'link');
    h.runtime.write(0xc123, 33); h.runtime.device(1).write(0xc123, 44);
    const status = h.win.GoldApp.status();
    h.click('link'); const gate = h.holdHash(); h.click('bootPeer'); await h.until(() => gate.called);
    const previous = h.runtime.pairState();
    await h.attemptSaveDuringTransition();
    assert.deepEqual(h.runtime.pairState(), previous);
    gate.reject(Error('injected peer hash failure')); await h.until(() => h.$('status').textContent === 'injected peer hash failure');
    assert.deepEqual(h.runtime.pairState(), previous, 'neither connected core may be reset on failed peer hashing');
    assert.equal(h.win.GoldApp.status().connection, 'link');
    assert.equal(h.win.GoldApp.status().romHash, status.romHash);
    assert.equal(h.win.GoldApp.status().peerHash, status.peerHash);
    h.writes.length = 0; h.click('save'); await h.until(() => h.$('status').textContent === '저장했습니다.');
    assert.deepEqual(h.writes, ['pair-state:' + status.romHash + ':' + status.peerHash, 'battery:' + status.romHash, 'peer-battery:' + status.peerHash]);
  } finally { await h.close(); }
});
