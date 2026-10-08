const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const G=require('../web/gold/rom-project.js');
const romPath=process.env.GOLD_ROM,rom=romPath?fs.readFileSync(romPath):null;
const projectTest=(name,fn)=>test(name,{skip:!rom&&'Set GOLD_ROM to the externally stored, original Korean Gold ROM.'},async()=>fn(await G.create(rom)));

test('Korean encoding handles every mapped syllable and rejects unsupported input',()=>{
 let count=0;for(const [table,row]of Object.entries(G.schema.koreanTables))Array.from(row).forEach((ch,index)=>{if(ch==='\0')return;const encoded=G.encodeText(ch);assert.deepEqual([...encoded],[Number(table),index]);assert.equal(G.decodeText(encoded),ch);count++;});
 assert.ok(count>2000);assert.equal(G.decodeText(G.encodeText('디자인몬 123')),'디자인몬 123');
 assert.throws(()=>G.encodeText('🙂'));assert.throws(()=>G.encodeText('디자인몬',{length:5}));
 assert.equal(G.decodeText(Uint8Array.of(0x0c)),'{0C}');assert.deepEqual([...G.encodeText('{0C}')],[12]);
});
test('2bpp uses Game Boy bit planes and column-major tile order',()=>{
 const p=new Uint8Array(16*24);p[0]=1;p[1]=2;p[2]=3;p[8*16]=2;p[8]=3;
 const b=G.encode2bpp(p,16,24);assert.equal(b[0],0xa0);assert.equal(b[1],0x60);assert.equal(b[17],0x80);assert.equal(b[48],0x80);assert.equal(b[49],0x80);assert.deepEqual(G.decode2bpp(b,16,24),p);
 assert.throws(()=>G.encode2bpp(new Uint8Array(64).fill(4),8,8));
});
test('LZ decoder covers all seven commands, long lengths and overlapping references',()=>{
 const stream=Uint8Array.from([2,0x12,0x34,0x81,0x22,7,0x43,8,9,0x62,0x82,0,0,0xa2,0,0,0xc2,0,2,0xe3,0, ...new Array(769).fill(4),255]);
 const out=G.decompress(stream).bytes;assert.deepEqual([...out.slice(0,22)],[0x12,0x34,0x81,7,7,7,8,9,8,9,0,0,0,0x12,0x34,0x81,0x48,0x2c,0x81,0x81,0x34,0x12]);assert.equal(out.length,791);assert.equal(out.at(-1),4);
 assert.deepEqual([...G.decompress(Uint8Array.of(0,9,0x83,0x80,255)).bytes],[9,9,9,9,9]);
 for(const bad of [[0],[128,0,0,255],[0xe0],[0xfc,0,255],[0,1]])assert.throws(()=>G.decompress(Uint8Array.from(bad)));
});
test('LZ recompression preserves arbitrary pixels and repeated/reversed sequences',()=>{
 let seed=12;const random=Uint8Array.from({length:784},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24;});
 const samples=[new Uint8Array(784),new Uint8Array(784).fill(0xaa),Uint8Array.from({length:784},(_,i)=>i%2?0x3c:0xc3),random,Uint8Array.from([...random.slice(0,200),...random.slice(0,200),...random.slice(0,200).reverse()])];
 for(const b of samples)assert.deepEqual(G.decompress(G.compress(b)).bytes,b);
});
test('IPS supports literal/RLE records and rejects malformed or out-of-range patches',()=>{
 const a=new Uint8Array(80000),b=new Uint8Array(a);b.fill(4,1,70000);b[79999]=8;assert.deepEqual(G.applyIPS(a,G.makeIPS(a,b)),b);
 assert.deepEqual([...G.applyIPS(new Uint8Array(5),Uint8Array.from([80,65,84,67,72,0,0,1,0,0,0,3,8,69,79,70]))],[0,8,8,8,0]);
 for(const bad of [[],[80,65,84,67,72],[80,65,84,67,72,0],[80,65,84,67,72,0,0,8,0,1,1,69,79,70]])assert.throws(()=>G.applyIPS(a.slice(0,3),Uint8Array.from(bad)));
});
test('Wrong revision and wrong file size are refused before editing',async()=>{
 await assert.rejects(G.create(new Uint8Array(2)));await assert.rejects(G.create(new Uint8Array(G.schema.size)));
});
projectTest('Original ROM rebuild is byte-exact and returned buffers never mutate the source',async p=>{
 assert.deepEqual(p.rebuild(),new Uint8Array(rom));assert.equal(p.dirty,false);assert.deepEqual(p.manifest().changes,[]);
 assert.equal(await G.hash(p.rebuild()),G.schema.sha256);const copy=p.readBytes(0,p.size);copy.fill(0);assert.deepEqual(p.rebuild(),new Uint8Array(rom));
 assert.equal(G.checksum(p.rebuild()).headerValid,true);assert.equal(G.checksum(p.rebuild()).globalValid,true);
});
projectTest('All 251 monster and move records are readable from actual ROM bytes',p=>{
 assert.equal(p.getPokemon(1).name,'이상해씨');assert.equal(p.getPokemon(251).name,'세레비');assert.equal(p.getMove(1).name,'막치기');assert.equal(p.getMove(251).name,'집단구타');
 for(let id=1;id<=251;id++){const m=p.getPokemon(id),move=p.getMove(id);assert.equal(p.readBytes(m.offset,1)[0],id);assert.equal(move.animation,id);assert.ok(!m.name.includes('{'));assert.ok(!move.name.includes('{'));assert.equal(m.tmhm.length,8);}
});
projectTest('Editing is atomic, undoable, redoable, checksum-correct and limited to requested bytes',p=>{
 const before=p.rebuild(),m=p.getPokemon(152);assert.throws(()=>p.setPokemon(152,{hp:99,name:'🙂'}));assert.deepEqual(p.rebuild(),before);
 p.setPokemon(152,{name:'디자인몬',hp:88,attack:100});assert.equal(p.getPokemon(152).name,'디자인몬');assert.equal(p.getPokemon(152).hp,88);assert.equal(p.canUndo,true);
 const modified=p.rebuild();assert.ok(G.checksum(modified).globalValid);assert.ok(G.checksum(modified).headerValid);
 const allowed=new Set([0x14e,0x14f,m.offset+1,m.offset+2,...Array.from({length:10},(_,i)=>m.nameOffset+i)]);for(let i=0;i<before.length;i++)if(before[i]!==modified[i])assert.ok(allowed.has(i));
 p.undo();assert.deepEqual(p.rebuild(),before);p.redo();assert.deepEqual(p.rebuild(),modified);p.reset();assert.deepEqual(p.rebuild(),before);p.undo();assert.deepEqual(p.rebuild(),modified);
});
projectTest('Technique name repacking keeps every later name and all numeric edits exact',p=>{
 const names=Array.from({length:251},(_,i)=>p.getMove(i+1).name);p.setMove(1,{name:'수정',power:72,accuracy:200,pp:20,effect:2,effectChance:128});assert.equal(p.getMove(1).name,'수정');assert.equal(p.getMove(1).power,72);
 for(let i=2;i<=251;i++)assert.equal(p.getMove(i).name,names[i-1]);const before=p.rebuild();assert.throws(()=>p.setMove(1,{name:'가나다라마바사아',pp:99}));assert.deepEqual(p.rebuild(),before);
 p.undo();assert.deepEqual(p.rebuild(),new Uint8Array(rom));
});
projectTest('All 502 species pictures and every Unown form have valid 2bpp round trips',p=>{
 let count=0;for(let id=1;id<=251;id++)for(const side of ['front','back']){const s=p.getSprite(id,side);assert.deepEqual(G.encode2bpp(s.pixels,s.width,s.height),s.tiles);assert.ok(s.compressedLength>0);count++;}
 for(let letter=1;letter<=26;letter++)for(const side of ['front','back']){const s=p.getSprite(201,side,letter);assert.deepEqual(G.encode2bpp(s.pixels,s.width,s.height),s.tiles);}
 assert.equal(count,502);
});
projectTest('Pixel and palette edits affect the genuine compressed sprite and roll back cleanly',p=>{
 const s=p.getSprite(152);assert.equal(p.setSprite(152,'front',s.pixels),false);assert.equal(p.dirty,false);
 const pixels=new Uint8Array(s.pixels);pixels[0]=pixels[0]^1;p.setSprite(152,'front',pixels);assert.deepEqual(p.getSprite(152).pixels,pixels);
 p.setPalette(152,['#ffffff','#ff0000','#0000ff','#000000']);assert.deepEqual(p.getPalette(152),['#ffffff','#ff0000','#0000ff','#000000']);p.undo();p.undo();assert.deepEqual(p.rebuild(),new Uint8Array(rom));
 let seed=123;const noisy=Uint8Array.from(s.pixels,()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>30;}),before=p.rebuild();assert.throws(()=>p.setSprite(152,'front',noisy),/공간 부족/);assert.deepEqual(p.rebuild(),before);
});
projectTest('Manifest and IPS rebuild the entire edited ROM with strict original-byte guards',async p=>{
 p.setPokemon(251,{hp:125,name:'디자인몬'});p.setMove(251,{power:35});p.writeBytes(0x1000,[0,1,2],'explicit script bytes');const modified=p.rebuild(),manifest=JSON.parse(JSON.stringify(p.manifest())),q=await G.create(rom);
 q.applyManifest(manifest);assert.deepEqual(q.rebuild(),modified);assert.deepEqual(G.applyIPS(rom,p.exportIPS()),modified);
 manifest.changes[0].before='ff'.repeat(manifest.changes[0].before.length/2);assert.throws(()=>q.importManifest(manifest));assert.deepEqual(q.rebuild(),modified);
 const duplicate=JSON.parse(JSON.stringify(p.manifest()));duplicate.changes.push(duplicate.changes[0]);assert.throws(()=>q.importManifest(duplicate));
});
projectTest('All evolution/learnset slots preserve original bytes and validate branches',p=>{
 let evolutions=0,moves=0;for(let id=1;id<=251;id++){const s=p.getEvolutionLearnset(id);assert.equal(p.setEvolutionLearnset(id,{evolutions:s.evolutions,learnset:s.learnset}),false);evolutions+=s.evolutions.length;moves+=s.learnset.length;}
 assert.ok(evolutions>100);assert.ok(moves>2000);assert.deepEqual(p.getEvolutionLearnset(1).evolutions,[{method:1,parameter:16,species:2}]);assert.equal(p.getEvolutionLearnset(133).evolutions.length,5);assert.equal(p.getEvolutionLearnset(236).evolutions.filter(e=>e.method===5).length,3);
 const original=p.rebuild(),s=p.getEvolutionLearnset(1);s.evolutions[0].parameter=18;s.learnset[0].move=1;p.setEvolutionLearnset(1,safePatch(s));assert.equal(p.getEvolutionLearnset(1).evolutions[0].parameter,18);assert.equal(p.getEvolutionLearnset(1).learnset[0].move,1);p.undo();assert.deepEqual(p.rebuild(),original);
 assert.throws(()=>p.setEvolutionLearnset(1,{learnset:[{level:101,move:1}]}));assert.throws(()=>p.setEvolutionLearnset(1,{learnset:[...s.learnset,{level:100,move:1}]}));assert.deepEqual(p.rebuild(),original);
 p.setEvolutionLearnset(1,{evolutions:[],learnset:[{level:1,move:1}]});assert.deepEqual(p.getEvolutionLearnset(1).evolutions,[]);assert.deepEqual(p.readBytes(p.getEvolutionLearnset(2).offset,p.getEvolutionLearnset(2).capacity),new Uint8Array(rom.slice(p.getEvolutionLearnset(2).offset,p.getEvolutionLearnset(2).offset+p.getEvolutionLearnset(2).capacity)));p.undo();assert.deepEqual(p.rebuild(),original);
 function safePatch(s){return{evolutions:s.evolutions,learnset:s.learnset};}
});
projectTest('All trainer sprites and map character frame sheets are losslessly editable',p=>{
 for(let id=1;id<=66;id++){const s=p.getTrainerSprite(id);assert.equal(s.width,56);assert.equal(s.height,56);assert.ok(s.name.length);assert.equal(p.setTrainerSprite(id,s.pixels),false);}
 for(let id=1;id<=95;id++){const s=p.getOverworldSprite(id);assert.equal(s.width,16);assert.ok([1,3,6].includes(s.frameCount));assert.equal(p.setOverworldSprite(id,s.pixels),false);}
 assert.equal(p.dirty,false);const original=p.rebuild(),s=p.getTrainerSprite(1),pixels=new Uint8Array(s.pixels);pixels[0]^=1;p.setTrainerSprite(1,pixels);assert.deepEqual(p.getTrainerSprite(1).pixels,pixels);p.undo();assert.deepEqual(p.rebuild(),original);
 const player=p.getOverworldSprite(1),next=new Uint8Array(player.pixels);next[0]^=1;next[next.length-1]^=1;p.setOverworldSprite(1,next);assert.deepEqual(p.getOverworldSprite(1).pixels,next);const out=p.rebuild();for(let i=0;i<out.length;i++)if(out[i]!==original[i])assert.ok((i>=player.offset&&i<player.offset+player.byteLength)||[0x14e,0x14f].includes(i));p.undo();assert.deepEqual(p.rebuild(),original);
});
projectTest('Trainer and all time-of-day map palettes remain in their exact slots',p=>{
 const original=p.rebuild();for(let id=1;id<=66;id++)assert.equal(p.setTrainerPalette(id,p.getTrainerPalette(id)),false);
 for(let t=0;t<=3;t++)for(let id=0;id<=7;id++)assert.equal(p.setOverworldPalette(id,p.getOverworldPalette(id,t),t),false);
 const colors=['#ffffff','#ff0000','#0000ff','#000000'];p.setTrainerPalette(1,colors);assert.deepEqual(p.getTrainerPalette(1),colors);p.setOverworldPalette(0,colors,2);assert.deepEqual(p.getOverworldPalette(0,2),colors);assert.notDeepEqual(p.getOverworldPalette(0,1),colors);p.undo();p.undo();assert.deepEqual(p.rebuild(),original);
});
