const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Runtime=require('../web/gold/runtime.js'),romPath=process.env.GOLD_ROM;
test('self-contained WASM runtime: boot, input, pixels, audio, snapshots and battery',{skip:!romPath},async()=>{
 const r=await Runtime.create(),rom=fs.readFileSync(romPath);try{r.open(rom,{deterministic:true});let audible=0;for(let i=0;i<900;i++){const f=r.frame();if(f.audio.some(v=>v))audible++;}assert.ok(audible>500);assert.ok(new Set(new Uint32Array(r.pixels().buffer)).size>2);
 r.key('start',true);for(let i=0;i<10;i++)r.frame();r.release();for(let i=0;i<130;i++)r.frame();const snapshot=r.state();let expected;for(let i=0;i<120;i++)expected=r.frame();const pc=r.m._gold_pc();r.restore(snapshot);let actual;for(let i=0;i<120;i++)actual=r.frame();assert.deepEqual(actual.pixels,expected.pixels);assert.equal(r.m._gold_pc(),pc);assert.ok(actual.audio.some(v=>v));
 const before=r.state();assert.throws(()=>r.restore(Uint8Array.of(1,2,3)),/형식/);assert.equal(r.m._gold_pc(),pc);assert.equal(r.state().length,before.length);const battery=r.battery();assert.equal(battery.length,32816);r.loadBattery(battery);assert.deepEqual(r.battery().subarray(0,32768),battery.subarray(0,32768));assert.throws(()=>r.loadBattery(new Uint8Array(7)),/크기/);
 }finally{r.close();}
});
test('WASM and native core match each pixel and audio sample for 1200 consecutive frames',{skip:!romPath||!process.env.GOLD_NATIVE_FRAMES},async()=>{
 const r=await Runtime.create(),data=fs.readFileSync(process.env.GOLD_NATIVE_FRAMES);let offset=0;try{r.open(fs.readFileSync(romPath),{deterministic:true});for(let i=0;i<1200;i++){if(i===900||i===1040)r.key('start',true);if(i===910||i===1050)r.key('start',false);const f=r.frame();assert.equal(Buffer.compare(Buffer.from(f.pixels),data.subarray(offset,offset+92160)),0,'pixels frame '+i);offset+=92160;const n=data.readInt32LE(offset);offset+=4;assert.equal(f.audio.length,n*2);assert.equal(Buffer.compare(Buffer.from(f.audio.buffer),data.subarray(offset,offset+n*4)),0,'audio frame '+i);offset+=n*4;}assert.equal(offset,data.length);}finally{r.close();}
});
