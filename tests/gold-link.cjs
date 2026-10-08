// SPDX-License-Identifier: CC0-1.0
// Original synthetic test cartridge/bootstrap. No commercial ROM or boot data.
const test=require('node:test'),assert=require('node:assert/strict');
const Runtime=require('../web/gold/runtime.js');
function cartridge(doubleSpeed=false){
 const rom=new Uint8Array(32768),boot=new Uint8Array(256);
 boot.set([0xc3,0xfc,0x00]);boot.set([0x3e,0x01,0xe0,0x50],252);
 rom.set(doubleSpeed?[0x3e,1,0xe0,0x4d,0x10,0x00,0xc3,0x50,0x01]:[0xc3,0x50,0x01],0x100);rom[0x143]=0xc0;
 // DI; SP; LCD off; clear command/done; wait command; SB/SC; wait; store result.
 rom.set([0xf3,0x31,0xff,0xdf,0xaf,0xe0,0x40,0xea,0x00,0xc0,0xea,0x04,0xc0,
  0xfa,0x00,0xc0,0xa7,0x28,0xfa,0xaf,0xea,0x00,0xc0,0xfa,0x01,0xc0,0xe0,0x01,
  0xfa,0x02,0xc0,0xe0,0x02,0xf0,0x02,0xcb,0x7f,0x20,0xfa,0xf0,0x01,0xea,0x03,0xc0,
  0x3e,0x01,0xea,0x04,0xc0,0xc3,0x5d,0x01],0x150);
 return {rom,boot};
}
async function pair(doubleSpeedPeer=false){const r=await Runtime.create(),p=r.device(1);for(const d of [r,p]){const {rom,boot}=cartridge(d===p&&doubleSpeedPeer);d.boot=boot;d.open(rom,{deterministic:true});d.frame();}return [r,p];}
function arm(d,byte,clock){d.write(0xc004,0);d.write(0xc001,byte);d.write(0xc002,clock);d.write(0xc000,1);}
function ready(r,slave){for(let i=0;i<32&&!(slave.read(0xff02)&0x80);i++)r.runLinkedTicks(128);assert.equal(slave.read(0xff02)&0x80,0x80);}
function checkTransfer(a,b,fromA,fromB){assert.equal(a.read(0xc004),1);assert.equal(b.read(0xc004),1);assert.equal(a.read(0xc003),fromB);assert.equal(b.read(0xc003),fromA);for(const d of[a,b]){assert.equal(d.read(0xff02)&0x80,0);assert.equal(d.read(0xff0f)&8,8);}}
function initializeScreen(d,lo,hi){d.write(0xff40,0);d.write(0xff4f,0);for(let i=0;i<16;i++)d.write(0x8000+i,0);for(let i=0;i<1024;i++)d.write(0x9800+i,0);d.write(0xff68,0x80);d.write(0xff69,lo);d.write(0xff69,hi);d.write(0xff40,0x91);}
function tone(d){for(const [a,v] of [[0x26,0x80],[0x24,0x77],[0x25,0x11],[0x11,0x80],[0x12,0xf0],[0x13,0x40],[0x14,0x87]])d.write(0xff00+a,v);}
test('two CPU programs exchange all byte values, either clock master and both serial rates',async()=>{
 const [r,p]=await pair();try{r.connect('link');for(const master of[r,p])for(const speed of[0x81,0x83])for(let value=0;value<256;value++){
  const slave=master===r?p:r,other=value^0xa5;
  arm(slave,other,0x80);ready(r,slave);arm(master,value,speed);r.frame();checkTransfer(master,slave,value,other);
  assert.ok(Math.abs(r.ticks-p.ticks)<=128);
 }assert.equal(r.frameNumber,1025);assert.equal(p.frameNumber,1025);assert.equal(r.connection,'link');}finally{r.closeAll();}
});
test('normal and double-speed CPUs exchange serial bytes on the same 8MHz timeline',async()=>{
 const [r,p]=await pair(true);try{assert.equal(r.read(0xff4d)&0x80,0);assert.equal(p.read(0xff4d)&0x80,0x80);r.connect('link');
 for(const master of[r,p])for(const speed of[0x81,0x83])for(const value of[0,1,0x55,0x80,0xaa,0xff]){const slave=master===r?p:r;arm(slave,value^0xff,0x80);ready(r,slave);arm(master,value,speed);r.frame();checkTransfer(master,slave,value,value^0xff);assert.ok(Math.abs(r.ticks-p.ticks)<=128);}
 }finally{r.closeAll();}
});
test('paired state resumes a partial byte, pixels and audio; damaged pair leaves both unchanged',async()=>{
 const [r,p]=await pair();try{initializeScreen(r,0x1f,0);initializeScreen(p,0,0x7c);tone(r);tone(p);r.connect('both');arm(p,0x35,0x80);ready(r,p);arm(r,0xa7,0x81);r.runLinkedTicks(2400);
 assert.equal(r.read(0xff02)&0x80,0x80);assert.equal(p.read(0xff02)&0x80,0x80);
 const snapshot=r.pairState(),ticks=[r.ticks,p.ticks],frames=[r.frameNumber,p.frameNumber];
 const expectedFrame=r.frame();checkTransfer(r,p,0xa7,0x35);const expected=r.pairState(),expectedPC=[r.pc,p.pc];
 r.restorePairState(snapshot);assert.equal(r.connection,'both');assert.deepEqual([r.ticks,p.ticks],ticks);assert.deepEqual([r.frameNumber,p.frameNumber],frames);
 const actualFrame=r.frame();checkTransfer(r,p,0xa7,0x35);assert.deepEqual([r.pc,p.pc],expectedPC);assert.deepEqual(r.pairState(),expected);assert.deepEqual(actualFrame,expectedFrame);
 const bad=r.pairState(),before=r.pairState(),header=new DataView(bad.buffer,bad.byteOffset),second=64+header.getUint32(52,true);bad[second]^=0xff;
 assert.throws(()=>r.restorePairState(bad),/형식/);assert.deepEqual(r.pairState(),before);
 assert.throws(()=>r.restore(r.state()),/함께/);assert.throws(()=>p.loadBattery(new Uint8Array(32768)),/해제/);
 r.disconnect();r.restorePairState(snapshot);assert.equal(r.connection,'both');r.frame();checkTransfer(r,p,0xa7,0x35);
 }finally{r.closeAll();}
});
test('separate pixels/audio, per-slot input and disconnected independent progress',async()=>{
 const [r,p]=await pair();try{initializeScreen(r,0x1f,0);initializeScreen(p,0,0x7c);tone(r);r.connect('link');r.frame();const f=r.frame();
 assert.equal(f.pixels.length,92160);assert.equal(f.peer.pixels.length,92160);assert.notDeepEqual(f.pixels,f.peer.pixels);
 assert.ok(f.audio.some(x=>x));assert.ok(f.peer.audio.every(x=>x===0));assert.equal(f.frameNumber,r.frameNumber);assert.equal(f.peer.frameNumber,p.frameNumber);
 for(const d of[r,p])d.write(0xff00,0x10);p.key('A',true);assert.equal(p.read(0xff00)&1,0);assert.equal(r.read(0xff00)&1,1);p.release();
 r.disconnect();const peerFrame=p.frameNumber;r.frame();assert.equal(p.frameNumber,peerFrame);assert.equal(r.frame().peer,undefined);p.frame();assert.equal(p.frameNumber,peerFrame+1);
 r.frameNumber=42;p.frameNumber=31;const state=r.pairState();r.connect('infrared');r.frame();r.restorePairState(state);assert.equal(r.connection,null);assert.equal(r.frameNumber,42);assert.equal(p.frameNumber,31);
 p.close();assert.equal(r.loaded,true);assert.equal(p.loaded,false);assert.throws(()=>r.connect(),/두 기기/);assert.throws(()=>r.pairState(),/두 기기/);
 }finally{r.closeAll();}
});
test('infrared pulses cross the selected connection and survive a mid-pulse snapshot',async()=>{
 const [r,p]=await pair();try{r.connect('infrared');r.write(0xff56,0xc0);p.write(0xff56,0xc0);r.runLinkedTicks(50000);assert.equal(p.read(0xff56)&2,2);
 r.write(0xff56,0xc1);r.runLinkedTicks(512);assert.equal(p.read(0xff56)&2,0);const state=r.pairState();
 r.write(0xff56,0xc0);r.runLinkedTicks(1024);assert.equal(p.read(0xff56)&2,2);r.restorePairState(state);assert.equal(r.connection,'infrared');assert.equal(p.read(0xff56)&2,0);
 r.write(0xff56,0xc0);r.runLinkedTicks(1024);assert.equal(p.read(0xff56)&2,2);
 r.disconnect();r.write(0xff56,0xc1);r.connect('infrared');r.runLinkedTicks(1024);assert.equal(p.read(0xff56)&2,0);
 }finally{r.closeAll();}
});
