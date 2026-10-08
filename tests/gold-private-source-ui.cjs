// Runs an externally generated private HTML. No ROM, source bundle or asset is
// copied into the repository, and no browser process or network is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const PRIVATE_HTML = process.env.GOLD_PRIVATE_HTML;

test('private standalone HTML boots its embedded ROM and rebuilds its embedded complete source offline', { skip: !PRIVATE_HTML, timeout: 120000 }, async () => {
  const { Window } = await import('happy-dom');
  const { IDBFactory } = require('fake-indexeddb');
  const html = fs.readFileSync(PRIVATE_HTML, 'utf8');
  assert.match(html, /GOLD_EMBEDDED_ROM="/);
  assert.match(html, /GOLD_EMBEDDED_SOURCE="/);
  assert.doesNotMatch(html, /<script\s+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);

  const win = new Window({ url: 'https://unit.invalid/private/index.html', settings: { disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true } });
  Object.defineProperty(win, 'crypto', { value: webcrypto });
  win.indexedDB = new IDBFactory();
  win.WebAssembly = WebAssembly;
  const requests = [], errors = [], frames = [];
  const network = kind => { requests.push(kind); throw Error('Private standalone attempted ' + kind); };
  win.fetch = () => network('fetch');
  win.XMLHttpRequest = class { constructor() { network('XMLHttpRequest'); } };
  win.Worker = class { constructor() { network('external Worker'); } };
  win.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  win.addEventListener('error', event => errors.push(event.message));
  win.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    return { createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData: image => { canvas.pixels = Uint8Array.from(image.data); } };
  };
  const $ = id => win.document.getElementById(id);
  const click = element => element.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const until = async condition => {
    for (let i = 0; i < 20000; i++) {
      if (condition()) return;
      if (errors.length) throw Error(errors.join('\n'));
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw Error('Timeout: ' + $('status')?.textContent);
  };
  let clock = 0, runtime, runtimeWrapped = false;
  const advance = count => {
    for (let i = 0; i < count; i++) {
      clock += 1000 / 59.727500569606;
      const callback = frames.shift(); assert.ok(callback, 'animation loop exists'); callback(clock);
    }
  };
  try {
    win.document.write(html.replace(/<script[\s\S]*?<\/script>/g, ''));
    for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      win.eval(match[1]);
      if (win.GoldRuntime && !runtimeWrapped) {
        const create = win.GoldRuntime.create.bind(win.GoldRuntime);
        win.GoldRuntime.create = async () => { runtime = await create(); return runtime; };
        runtimeWrapped = true;
      }
    }
    assert.equal(win.GOLD_STANDALONE, true);
    await until(() => !$('edit').disabled && frames.length > 0);
    const originalHash = win.GoldApp.status().romHash;
    assert.equal(originalHash, win.GoldProject.schema.sha256);
    advance(90);
    assert.ok(win.GoldApp.status().frames > 80, 'embedded original runs');

    click($('edit'));
    click(win.document.querySelector('[data-tab="source"]'));
    await until(() => win.GoldPanels.source() && $('sourcePaths')?.options.length > 0);
    const source = win.GoldPanels.source();
    assert.ok(source instanceof win.DesignmonSourceProject);
    assert.equal(source.metadata.baseRomSHA256, originalHash);
    assert.equal(source.metadata.fileCount, 7767);
    assert.equal($('sourcePaths').options.length, source.metadata.fileCount);
    assert.equal(win.GOLD_EMBEDDED_SOURCE, null, 'the embedded gzip bundle was consumed by the real source UI');
    assert.equal(source.pending.size, 0);

    // Observe, rather than substitute for, the actual source API/WASM output.
    let result;
    const build = source.build.bind(source);
    source.build = async options => { result = await build(options); return result; };
    click($('sourceBuild'));
    await until(() => result && !win.GoldApp.status().editing && !$('sourceBuild').disabled);
    assert.equal(result.identicalToOriginal, true);
    assert.equal(result.sha256, originalHash);
    assert.equal(result.logs.filter(entry => entry.tool === 'rgbasm').length, 17);
    assert.equal(result.logs.filter(entry => entry.tool === 'rgblink').length, 2);
    assert.equal(result.logs.filter(entry => entry.tool === 'rgbfix').length, 1);
    assert.equal(Object.keys(result.graphicsOutputs).length, 0, 'unchanged cached graphics need no repeated conversion');
    assert.equal(win.GoldApp.status().romHash, originalHash);
    assert.equal(win.GoldApp.status().frames, 0, 'the built ROM was loaded into the actual core');
    assert.match($('status').textContent, /원본과 동일한 빌드/);
    advance(90);
    assert.ok(win.GoldApp.status().frames > 80, 'the rebuilt ROM executes');
    assert.equal($('screen').pixels.length, 160 * 144 * 4);
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
  } finally {
    runtime?.closeAll();
    await win.happyDOM.abort();
    win.close();
  }
});
