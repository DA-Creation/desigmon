'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../web/gold/rom-project.js'),Layout=require('../web/gold/layout-check.js'),History=require('../web/gold/layout-history.js');
const ROM=process.env.GOLD_ROM;
const expectedSymbols=Object.entries(Layout.expected).map(([name,offset])=>{
  const bank=Math.floor(offset/0x4000),address=bank?0x4000+offset%0x4000:offset;
  return bank.toString(16).padStart(2,'0')+':'+address.toString(16).padStart(4,'0')+' '+name;
}).join('\n');
async function fixture(){const original=new Uint8Array(fs.readFileSync(ROM)),project=await P.create(original);return{original,project,history:History.create(project,original)};}
function allQuick(tabs,enabled){for(const name of ['pokemon','moves','evolution','sprite','scenario'])assert.equal(tabs[name].enabled,enabled,name);}
function freeEditors(tabs){for(const name of ['source','code','bytes','changes'])assert.equal(tabs[name].enabled,true,name);}

test('layout history persists only the schema anchors needed for compatibility',()=>{
  const all=expectedSymbols+'\n01:4567 OtherPrivateFunction\nthis is not a symbol\n00:c000 NotROM';
  assert.equal(History.compactSymbols(all),expectedSymbols);
  assert.equal(History.compactSymbols(null),'');
});

test('layout history tracks quick edits, source builds, undo/redo and exported metadata',{skip:!ROM},async()=>{
  const{original,project,history}=await fixture();allQuick(history.tabs(),true);
  assert.deepEqual(history.status(),{kind:'fixed',undoDepth:0,redoDepth:0});
  const hp=project.getPokemon(152).hp;
  project.setPokemon(152,{hp:hp+1});history.changed();history.changed();
  assert.deepEqual(history.status(),{kind:'fixed',undoDepth:1,redoDepth:0});
  const source=await P.create(original);source.setPokemon(152,{hp:hp+2});const built=source.rebuild();
  history.applyBuild({rom:built,symbols:expectedSymbols+'\n00:1234 Unneeded'});history.changed();
  assert.deepEqual(history.status(),{kind:'source',undoDepth:2,redoDepth:0});allQuick(history.tabs(),true);
  assert(history.undo());assert.equal(project.getPokemon(152).hp,hp+1);assert.equal(history.status().kind,'fixed');
  assert(history.redo());assert.equal(project.getPokemon(152).hp,hp+2);assert.equal(history.status().kind,'source');
  const manifest=JSON.parse(JSON.stringify(history.manifest()));assert.equal(manifest.editorLayout.symbols,expectedSymbols);
  const restored=await P.create(original),restoredHistory=History.create(restored,original);restoredHistory.import(manifest);
  assert.deepEqual(restored.rebuild(),built);assert.equal(restoredHistory.status().kind,'source');allQuick(restoredHistory.tabs(),true);
  assert(restoredHistory.undo());assert.deepEqual(restored.rebuild(),original);allQuick(restoredHistory.tabs(),true);
  assert(restoredHistory.redo());assert.deepEqual(restored.rebuild(),built);assert.equal(restoredHistory.status().kind,'source');
});

test('relocated source firmware blocks affected quick editors through reload and undo/redo',{skip:!ROM},async()=>{
  const{original,project,history}=await fixture(),other=await P.create(original);
  other.setPokemon(152,{hp:47});const built=other.rebuild();
  const relocated=expectedSymbols.replace('14:5bdf BaseData','14:5be0 BaseData');
  const tabs=history.applyBuild({rom:built,symbols:relocated});
  assert.equal(tabs.pokemon.enabled,false);assert.equal(tabs.sprite.enabled,false);assert.equal(tabs.moves.enabled,true);freeEditors(tabs);
  const saved=history.manifest(),restored=await P.create(original),again=History.create(restored,original);again.import(saved);
  assert.equal(again.tabs().pokemon.enabled,false);freeEditors(again.tabs());
  assert(history.undo());allQuick(history.tabs(),true);assert(history.redo());assert.equal(history.tabs().pokemon.enabled,false);
  assert.equal(project.getPokemon(152).hp,47);
});

test('legacy or unknown edited manifests fail closed while complete source stays editable',{skip:!ROM},async()=>{
  const{original,project,history}=await fixture();const modified=await P.create(original);modified.setPokemon(152,{hp:46});
  const legacy=modified.manifest();assert.equal(legacy.editorLayout,undefined);
  history.import(legacy);allQuick(history.tabs(),false);freeEditors(history.tabs());assert.equal(history.status().kind,'unknown');
  history.changed();assert.equal(history.status().undoDepth,1);
  const exported=history.manifest();assert.equal(exported.editorLayout.kind,'unknown');
  const restored=await P.create(original),again=History.create(restored,original);again.import(exported);allQuick(again.tabs(),false);freeEditors(again.tabs());
  assert(history.undo());assert.deepEqual(project.rebuild(),original);allQuick(history.tabs(),true);
  assert(history.redo());allQuick(history.tabs(),false);
});

test('no-op and duplicate change notifications create no phantom history entries',{skip:!ROM},async()=>{
  const{original,project,history}=await fixture();history.changed();history.changed();
  project.writeBytes(0,original);history.changed();history.applyBuild({rom:original,symbols:expectedSymbols});
  assert.deepEqual(history.status(),{kind:'fixed',undoDepth:0,redoDepth:0});assert.equal(history.undo(),false);
  project.setPokemon(152,{hp:46});history.changed();history.changed();
  const bytes=project.readBytes(0,project.size);history.applyBuild({rom:bytes,symbols:expectedSymbols});history.changed();
  assert.equal(history.status().undoDepth,1);assert(history.undo());assert.equal(history.undo(),false);assert(history.redo());assert.equal(history.redo(),false);
  assert.equal(project.getPokemon(152).hp,46);
});

test('failed manifest imports leave bytes and layout history untouched',{skip:!ROM},async()=>{
  const{project,history}=await fixture();project.setPokemon(152,{hp:46});history.changed();
  const before=project.rebuild(),state=history.status(),bad=history.manifest();bad.changes[0].before='ff'.repeat(bad.changes[0].before.length/2);
  assert.throws(()=>history.import(bad),/원본 바이트/);assert.deepEqual(project.rebuild(),before);assert.deepEqual(history.status(),state);
  assert.throws(()=>history.applyBuild({rom:Uint8Array.of(1,2,3),symbols:expectedSymbols}),/전체 크기/);
  assert.deepEqual(project.rebuild(),before);assert.deepEqual(history.status(),state);
});
