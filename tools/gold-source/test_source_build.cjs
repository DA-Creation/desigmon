// Node/WASM integration: full source, actual PNG changes, export and import.
'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const assert = require('node:assert/strict');
const SourceProject = require('../../web/gold/source-build.js');
const expected = '9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6';
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {c ^= byte; for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;}
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const header = Buffer.alloc(8); header.writeUInt32BE(bytes.length); header.write(type, 4);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), bytes])));
  return Buffer.concat([header, bytes, crc]);
}
// Mutate only a private in-memory compiler fixture. This is not a shipped art edit.
function mutatePixel(png) {
  png = Buffer.from(png); const chunks = [], idat = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off), type = png.toString('ascii', off + 4, off + 8), data = png.subarray(off + 8, off + 8 + len);
    chunks.push({type, data}); if (type === 'IDAT') idat.push(data); off += len + 12;
  }
  const header = chunks.find(c => c.type === 'IHDR').data;
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  assert.equal(header[8], 8); assert.equal(header[9], 3); assert.equal(header[12], 0);
  const raw = zlib.inflateSync(Buffer.concat(idat)), pixels = Buffer.alloc(width * height);
  function paeth(a,b,c) {const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const f=raw[y*(width+1)],v=raw[y*(width+1)+1+x],a=x?pixels[y*width+x-1]:0,b=y?pixels[(y-1)*width+x]:0,c=x&&y?pixels[(y-1)*width+x-1]:0;
    pixels[y*width+x]=(v+(f===1?a:f===2?b:f===3?Math.floor((a+b)/2):f===4?paeth(a,b,c):0))&255;
  }
  const index=Math.floor(height/2)*width+Math.floor(width/2), colors=chunks.find(c=>c.type==='PLTE').data.length/3;
  pixels[index]=(pixels[index]+1)%colors;
  const encoded=Buffer.alloc((width+1)*height);for(let y=0;y<height;y++)pixels.copy(encoded,y*(width+1)+1,y*width,(y+1)*width);
  let emitted=false; const output=[png.subarray(0,8)];
  for(const c of chunks){if(c.type==='IDAT'){if(!emitted)output.push(chunk('IDAT',zlib.deflateSync(encoded)));emitted=true;}else output.push(chunk(c.type,c.data));}
  return new Uint8Array(Buffer.concat(output));
}
(async()=>{
  const input=process.argv[2], output=path.resolve(process.argv[3]||'/tmp/designmon-source-integration');
  if(!input)throw Error('Pass a private source project JSON');
  const repo=path.resolve(__dirname,'../..');if(output.startsWith(repo+path.sep))throw Error('Output must be external');
  fs.mkdirSync(output,{recursive:true});const json=fs.readFileSync(input,'utf8');
  const project=await SourceProject.import(json);const started=Date.now();
  const baseline=await project.build();assert.equal(baseline.sha256,expected);
  const filename='gfx/pokemon/chikorita/front_gold.png',before=project.read(filename);
  project.write(filename,before);const noop=await project.build();assert.equal(noop.sha256,expected);
  project.write(filename,mutatePixel(before));
  // Export before any build: the pending PNG conversion must survive import.
  const pending=await SourceProject.import(project.export());const edited=await pending.build();assert.notEqual(edited.sha256,expected);
  assert(Object.keys(edited.graphicsOutputs).includes('gfx/pokemon/chikorita/front_gold.2bpp.lz'));
  const restored=await SourceProject.import(pending.export());const rebuilt=await restored.build();assert.equal(rebuilt.sha256,edited.sha256);
  const report={passed:true,baseline:baseline.sha256,unchangedPng:noop.sha256,editedPng:edited.sha256,
    roundtrip:rebuilt.sha256,graphicsOutputs:Object.keys(edited.graphicsOutputs),seconds:(Date.now()-started)/1000};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
