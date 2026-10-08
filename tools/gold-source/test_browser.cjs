// Uses a private exported game project; never includes game content in the repo.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const repo = path.resolve(__dirname, '../..');
const projectPath = process.argv[2];
const output = path.resolve(process.argv[3] || '/tmp/designmon-source-build-verification');
if (!projectPath || output.startsWith(repo + path.sep)) throw Error('Pass a private project and an external output directory');
fs.mkdirSync(output, {recursive: true});
const json = fs.readFileSync(projectPath, 'utf8');
const scriptFile = pathToFileURL(path.join(repo, 'web/gold/source-build.js')).href;
const html = `<meta charset="utf-8"><script src="${scriptFile}"></script>`;
const fixture = path.join(output, 'source-test.html');
fs.writeFileSync(fixture, html);
const expected = '9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6';
const server = http.createServer((req, res) => {
  if (req.url === '/test') {res.setHeader('Content-Type', 'text/html'); res.end('<meta charset="utf-8"><script src="/web/gold/source-build.js"></script>'); return;}
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(repo, '.' + pathname);
  if (!file.startsWith(repo + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404); res.end(); return;}
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const results = [];
  try {
    await page.goto(pathToFileURL(fixture).href);
    const file = await page.evaluate(async json => {
      const p = await DesignmonSourceProject.import(json); globalThis.sourceProject = p;
      let progress = 0;
      const result = await p.build({onProgress: () => progress++});
      return {mode: 'file-main', sha256: result.sha256, identical: result.identicalToOriginal,
        files: p.list().length, sourceTextReadable: p.read('data/pokemon/names.asm').includes('치코리타'), progress};
    }, json);
    assert.equal(file.sha256, expected); assert.equal(file.progress, 20); assert(file.sourceTextReadable); results.push(file);
    const edit = await page.evaluate(async () => {
      const p = sourceProject, filename = 'data/pokemon/base_stats/chikorita.asm';
      const original = p.read(filename); p.write(filename, original.replace('db  45,  49,  65,  45,  49,  65', 'db  46,  49,  65,  45,  49,  65'));
      const result = await p.build();
      const exported = p.export(), roundtrip = await DesignmonSourceProject.import(exported);
      return {mode: 'edited-source', sha256: result.sha256, identical: result.identicalToOriginal,
        roundtrip: roundtrip.read(filename) === p.read(filename), changed: p.metadata.changedFiles};
    });
    assert.notEqual(edit.sha256, expected); assert(!edit.identical); assert(edit.roundtrip); results.push(edit);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await page.goto(`http://127.0.0.1:${server.address().port}/test`);
    const worker = await page.evaluate(async json => {
      const p = await DesignmonSourceProject.import(json); const r = await p.build();
      return {mode: 'http-worker', sha256: r.sha256, identical: r.identicalToOriginal};
    }, json);
    assert.equal(worker.sha256, expected); results.push(worker); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({passed: true, results, errors}, null, 2));
    console.log(JSON.stringify({passed: true, results, errors}));
  } finally {await browser.close(); server.close();}
})().catch(error => {console.error(error); process.exitCode = 1; server.close();});
