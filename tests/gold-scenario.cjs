'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const S=require('../web/gold/scenario'),P=require('../web/gold/rom-project');
let checks=0;const same=(a,b,msg)=>{assert.deepEqual(Array.from(a),Array.from(b),msg);checks++;};
assert.equal(S.mapCount,365);assert.equal(S.groupCount,26);assert.equal(S.commandCount,163);
for(let opcode=0;opcode<256;opcode++)for(let value=0;value<256;value++){
 const data=Uint8Array.from([opcode,...Array(12).fill(value)]),r=S.decodeScript(data,0);
 same(S.assembleScript(r.text),data.subarray(0,r.size),opcode.toString(16)+' '+value);
 assert.equal(r.valid,opcode<163);
 if(opcode===0x2d)assert.equal(r.size,value?9:5);
}
const scripts=[
 ['scall $4567',[0,0x67,0x45]],['farscall $60:$4567',[1,0x60,0x67,0x45]],
 ['ifequal $02, $4567',[6,2,0x67,0x45]],['givemoney $01, $010203',[0x22,1,1,2,3]],
 ['givepoke $98, $05, $00, $00',[0x2d,152,5,0,0]],
 ['givepoke $98, $05, $00, $01, $4000, $4200',[0x2d,152,5,0,1,0,0x40,0,0x42]],
 ['warp $18, $07, $03, $04',[0x3c,24,7,3,4]],
 ['farwritetext $60:$4567',[0x4c,0x60,0x67,0x45]],
 ['winlosstext $4567, $0000',[0x64,0x67,0x45,0,0]],
 ['applymovement $02, $4234',[0x69,2,0x34,0x42]],['end',[0x91]],
 ['warpfacing $01, $18, $07, $03, $04',[0xa2,1,24,7,3,4]]
];
for(const[text,data]of scripts){same(S.assembleScript(text),data);assert.equal(S.decodeScript(data,0).text,text);}
for(const source of ['scall 65536','givemoney 0, $1000000','givepoke 1,2,0,0,0','givepoke 1,2,0,1','farscall $100:$4000','warp 1,2,3,256','foo 1','db','db -1'])assert.throws(()=>S.assembleScript(source),undefined,source);
for(let opcode=0;opcode<163;opcode++)for(let length=1;length<10;length++){
 const data=Uint8Array.from([opcode,...Array(length-1).fill(1)]),r=S.readScript(data,0,{stopAtEnd:false});same(S.assembleScript(r.text),data.subarray(0,r.size));
}
assert.equal(S.readScript([0x91,0x91],0).size,1);assert.equal(S.readScript([0x91,0x91],0,{stopAtEnd:false}).size,2);
assert.equal(S.decodeScript([0x4d,0,0x42],0,{bank:0x60}).links[0].offset,0x180200);
assert.equal(S.decodeScript([0x69,2,0,0x42],0,{bank:0x60}).links[0].kind,'movement');
assert.equal(S.decodeScript([0x64,0x12,0x45,0,0],0,{bank:0x60}).links.length,1);
assert.equal(S.decodeScript([0x64,0x12,0x45,255,255],0,{bank:0x60}).links.length,1);
assert.equal(S.decodeScript([2,0,0xd0],0,{bank:0x60}).links[0].indirect,true);
assert.equal(S.decodeScript([0,1],0).truncated,true);

const dialogue='text '+JSON.stringify('가나다<LINE>안녕<DONE>');const encoded=S.assembleText(dialogue);const decoded=S.readText(encoded,0);assert.equal(decoded.text,dialogue);assert.equal(decoded.reason,'done');same(S.assembleText(decoded.text),encoded);
const textCases=[
 ['text_ram $D000',[1,0,0xd0]],['text_bcd $D123, $83',[2,0x23,0xd1,0x83]],
 ['text_box $C3A0, $04, $12',[4,0xa0,0xc3,4,18]],['text_decimal $D123, $24',[9,0x23,0xd1,0x24]],
 ['text_far $60:$4567',[22,0x67,0x45,0x60]],['text_end',[0x50]],['text_asm',[8]]
];
for(const[text,data]of textCases){same(S.assembleText(text),data);assert.equal(S.readText(data,0).text,text);}
for(let opcode=1;opcode<23;opcode++)for(const value of [0,1,0x50,0x7f,0x80,0xff]){
 const data=Uint8Array.from([opcode,...Array(8).fill(value)]),r=S.readText(data,0);same(S.assembleText(r.text),data.subarray(0,r.size));
}
for(let byte=0;byte<256;byte++){
 const input=Uint8Array.of(0,byte,0xa3,0x5e),r=S.readText(input,0);same(S.assembleText(r.text),input.subarray(0,r.size));
}
// Prefix bytes followed by $50/$5E are a character, not a string terminator.
for(let prefix=1;prefix<=11;prefix++)for(const next of [0x50,0x5e,0x5f]){
 const input=Uint8Array.of(0,prefix,next,0x80,0x5e),r=S.readText(input,0);assert.equal(r.size,5);same(S.assembleText(r.text),input);
}
same(S.assembleText(S.readText([0,0xe0,0xa3,0x5e],0).text),[0,0xe0,0xa3,0x5e]); // ' + d cannot collapse into contraction byte.
assert.throws(()=>S.assembleText('text "😀<DONE>"'));
assert.throws(()=>S.assembleText('text_end $00'));
assert.throws(()=>S.fixedPatch([0x91],0,1,'end\nend','script'));
const proposal=S.fixedPatch([0x15,1],0,2,'setval $02');same(proposal.before,[0x15,1]);same(proposal.after,[0x15,2]);
assert.equal(S.romOffset(0x60,0x4000),0x180000);assert.equal(S.romOffset(0x60,0x1234),0x1234);assert.deepEqual(S.address(0x180123),{bank:0x60,address:0x4123});
assert.throws(()=>S.romOffset(128,0x4000));assert.throws(()=>S.romOffset(1,0x8000));

// Synthetic map records use original-format layouts, not copyrighted payloads.
const rom=new Uint8Array(2097152),word=(o,v)=>{rom[o]=v&255;rom[o+1]=v>>8;};
const counts=[14,7,82,9,10,8,17,7,6,17,22,13,6,8,9,8,13,14,4,4,26,9,13,13,15,11];
let head=0x94121;for(let group=0;group<26;group++){word(0x940ed+group*2,0x4000+head%0x4000);for(let i=0;i<counts[group];i++,head+=9)rom.set([2,1,3,0,0x40,1,2,0x11,3],head);}
rom.set([0,4,5,3,0,0x40,4,0,0x40,0,0x41,3],0x8000); // two map connections
rom.set([24,7,0,0x40,0,0xc0,5,4,255,254,0,0xc1],0x800c);
rom.set([24,6,0,0x40,0,0xc0,5,4,1,2,0,0xc1],0x8018);
rom.set([1,0,0x42,0,0,1,2,0x10,0x42],0x10000); // scene + callback
const ev=[0,0,1,4,3,1,24,7,1,255,6,5,0,0x20,0x42,0,0,1,8,7,5,0,0x43,1,4,14,13,6,0x32,255,255,0x82,3,0x10,0x43,0x34,0x12];rom.set(ev,0x10100);
rom.set([0x56,0x04,0x30,0x42],0x10300); // conditional background
rom.set([0x34,0x04,12,3,0,0x44,0x10,0x44,0,0,0x40,0x42],0x10310); // trainer
for(const off of [0x10200,0x10210,0x10220,0x10230,0x10240])rom[off]=0x91;
rom.set(S.assembleText('text "가<DONE>"'),0x10400);rom.set(S.assembleText('text "나<DONE>"'),0x10410);
const maps=S.listMaps(rom);assert.equal(maps.length,365);assert.equal(maps.find(m=>m.name==='PlayersHouse2F').group,24);assert.equal(maps.find(m=>m.name==='PlayersHouse2F').id,7);
const map=S.readMap(rom,24,7);assert.equal(map.attributes.fields.width,5);assert.equal(map.connections.length,2);assert.equal(map.connections[0].direction,'west');assert.equal(map.connections[0].fields.yOffset,-1);assert.equal(map.scenes.length,1);assert.equal(map.callbacks.length,1);assert.equal(map.warps[0].fields.x,3);assert.equal(map.coords[0].fields.scene,255);assert.equal(map.backgrounds[0].condition.fields.eventFlag,0x456);assert.equal(map.objects[0].fields.x,9);assert.equal(map.objects[0].fields.y,10);assert.equal(map.objects[0].fields.palette,8);assert.equal(map.objects[0].fields.radiusX,2);assert.equal(map.objects[0].fields.radiusY,3);assert.equal(map.objects[0].trainer.fields.group,12);assert.equal(map.objects[0].trainer.links.length,3);
const records=[map.header,map.attributes,...map.connections,...map.scenes,...map.callbacks,...map.warps,...map.coords,...map.backgrounds,...map.objects,map.backgrounds[0].condition,map.objects[0].trainer];
for(const r of records){const p=S.patchRecord(rom,r,r.fields);same(p.before,p.after);same(p.after,r.bytes);}
const changed=S.patchRecord(rom,map.objects[0],{x:20,radiusX:5,palette:2});assert.equal(changed.after[2],24);assert.equal(changed.after[4],0x35);assert.equal(changed.after[7],0x22);assert.equal(rom[map.objects[0].offset+2],13);
assert.throws(()=>S.patchRecord(rom,map.objects[0],{radiusX:16}));assert.throws(()=>S.patchRecord(rom,map.objects[0],{x:252}));assert.throws(()=>S.patchRecord(rom,map.objects[0],{unknown:1}));
const stale=rom.slice();stale[map.objects[0].offset]++;assert.throws(()=>S.patchRecord(stale,map.objects[0],{x:1}),/다시 읽으세요/);
const trace=S.traceScripts(rom,map.links);assert.equal(trace.scripts.length,5);assert.equal(trace.texts.length,2);assert.equal(trace.unresolved.length,0);assert.equal(trace.truncated,false);

// Node-only control-flow test for the editor panel. A minimal DOM double throws
// on any innerHTML write, proving user/ROM text stays in text/value properties.
const Panel=require('../web/gold/scenario-panel');
class Element {
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.attributes={};this.value='';}
 set textContent(value){this.text=String(value);this.children=[];}get textContent(){return this.text||'';}
 set innerHTML(value){throw Error('Unsafe HTML interpolation: '+value);}
 appendChild(child){this.children.push(child);return child;}
 setAttribute(name,value){this.attributes[name]=String(value);}
}
const documentDouble={createElement(tag){return new Element(tag,this);}},panel=new Element('div',documentDouble);
const find=(node,predicate)=>predicate(node)?node:node.children.map(child=>find(child,predicate)).find(Boolean);
const backing=rom.slice(),writes=[],messages=[];let changedCount=0;
const project={readBytes:(offset,length)=>backing.slice(offset,offset+length),writeBytes:(offset,data,label)=>{writes.push({offset,data:Array.from(data),label});backing.set(data,offset);}};
Panel.render(project,panel,{changed:()=>changedCount++,message:message=>messages.push(message)});
let form=find(panel,n=>n.tagName==='FORM'),tileset=find(form,n=>n.name==='tileset');tileset.value='9';form.onsubmit({preventDefault(){}});assert.equal(writes.length,1);assert.equal(changedCount,1);assert.equal(S.readMap(backing,24,7).header.fields.tileset,9);
let eventSelect=find(panel,n=>n.attributes['aria-label']==='이벤트');eventSelect.value='4';eventSelect.onchange();
find(panel,n=>n.tagName==='BUTTON'&&n.textContent==='스크립트 04:4200').onclick();
let textarea=find(panel,n=>n.tagName==='TEXTAREA');assert.equal(textarea.value,'end');textarea.value='endall';
find(panel,n=>n.tagName==='BUTTON'&&n.textContent==='같은 길이로 적용').onclick();assert.equal(backing[0x10200],0x93);assert.equal(changedCount,2);
find(panel,n=>n.tagName==='BUTTON'&&n.textContent==='맵').onclick();find(panel,n=>n.tagName==='BUTTON'&&n.textContent==='대사 04:4400').onclick();
textarea=find(panel,n=>n.tagName==='TEXTAREA');assert.match(textarea.value,/가/);textarea.value='text "나<DONE>"';find(panel,n=>n.tagName==='BUTTON'&&n.textContent==='같은 길이로 적용').onclick();assert.match(S.readText(backing,0x10400).text,/나/);assert.equal(changedCount,3);
textarea=find(panel,n=>n.tagName==='TEXTAREA');textarea.value='text "<PLAYER><DONE>"';find(panel,n=>n.tagName==='BUTTON'&&n.textContent==='같은 길이로 적용').onclick();assert.equal(writes.length,3);assert.match(messages.at(-1),/바이트를 유지/);
backing[0x10401]^=1;find(panel,n=>n.tagName==='BUTTON'&&n.textContent==='같은 길이로 적용').onclick();assert.equal(writes.length,3);assert.match(messages.at(-1),/다시 읽으세요/);

const browser=vm.createContext({});for(const file of ['rom-schema.js','rom-project.js','scenario.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/gold',file),'utf8'),browser);assert.equal(vm.runInContext('GoldScenario.readScript(Uint8Array.of(0x91),0).text',browser),'end');

if(process.env.GOLD_SCENARIO_REFERENCE){const source=fs.readFileSync(path.join(process.env.GOLD_SCENARIO_REFERENCE,'macros/scripts/events.asm'),'utf8');let total=0;for(const m of source.matchAll(/const (\w+)_command ; \$([0-9a-f]+)/g)){const r=S.decodeScript([parseInt(m[2],16),...Array(12).fill(1)],0);assert.equal(r.name,m[1]);total++;}assert.equal(total,163);console.log('Reference script command names: 163 matched.');}
if((process.env.GOLD_ROM||process.env.GOLD_ROM_PATH)){const original=fs.readFileSync((process.env.GOLD_ROM||process.env.GOLD_ROM_PATH)),all=S.listMaps(original).map(m=>S.readMap(original,m.group,m.id)),total={};for(const map of all){for(const kind of ['scenes','callbacks','warps','coords','backgrounds','objects','connections'])total[kind]=(total[kind]||0)+map[kind].length;const recs=[map.header,map.attributes,...map.connections,...map.scenes,...map.callbacks,...map.warps,...map.coords,...map.backgrounds,...map.objects];for(const r of recs){same(S.patchRecord(original,r,r.fields).after,r.bytes);for(const nested of ['trainer','condition','item'])if(r[nested])same(S.patchRecord(original,r[nested],r[nested].fields).after,r[nested].bytes);}}
 assert.deepEqual(total,{scenes:129,callbacks:81,warps:1235,coords:103,backgrounds:757,objects:1335,connections:142});
 const traced=S.traceScripts(original,all.flatMap(m=>m.links),{maxScripts:10000});assert.equal(traced.truncated,false);assert.equal(traced.unresolved.length,0);assert.equal(traced.scripts.length,3306);assert.equal(traced.texts.length,2862);for(const s of traced.scripts){assert.equal(s.reason,'terminal');same(S.assembleScript(s.text),original.subarray(s.offset,s.offset+s.size));}for(const t of traced.texts){assert.ok(['done','end'].includes(t.reason));same(S.assembleText(t.text),original.subarray(t.offset,t.offset+t.size));}
 console.log(JSON.stringify({maps:all.length,...total,scripts:traced.scripts.length,texts:traced.texts.length,roundtripFailures:0}));
}
console.log('Gold scenario passed: '+checks.toLocaleString('en-US')+' byte-equality checks.');
