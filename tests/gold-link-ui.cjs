const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const ROM=process.env.GOLD_ROM;
test('communication UI runs two actual cores, routes controls, restores paired state and imports/exports the second save',{skip:!ROM,timeout:60000},async()=>{
 const {Window}=await import('happy-dom'),{IDBFactory}=require('fake-indexeddb'),Runtime=require('../web/gold/runtime.js');
 const win=new Window({url:'https://unit.invalid/',settings:{disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}}),errors=[],keys=[],downloads=[],frames=[];
 Object.defineProperty(win,'crypto',{value:webcrypto});win.indexedDB=new IDBFactory();win.GOLD_STANDALONE=true;win.addEventListener('error',e=>errors.push(e.message));win.fetch=()=>{throw Error('Unexpected network');};win.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
 win.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:gold-test-'+downloads.length;};win.URL.revokeObjectURL=()=>{};
 let runtime;win.GoldRuntime={create:async()=>{runtime=await Runtime.create();for(const slot of [0,1]){const d=runtime.device(slot),key=d.key.bind(d);d.key=(name,down)=>{keys.push({slot,name,down});key(name,down);};}return runtime;}};
 win.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return{createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>canvas._pixels=Uint8Array.from(image.data)};};
 win.document.write(fs.readFileSync(path.join(__dirname,'../web/gold/index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
 const read=p=>fs.readFileSync(path.join(__dirname,'../',p),'utf8');for(const p of ['web/gold/rom-schema.js','web/gold/rom-project.js','web/gold/layout-check.js','web/gold/layout-history.js','web/gold/cpu.js','web/gold/scenario.js','web/gold/scenario-panel.js','web/gold/editor-panels.js'])win.eval(read(p));
 win.GOLD_EMBEDDED_ROM=fs.readFileSync(ROM).toString('base64');win.eval(read('web/gold/editor.js'));
 const sleep=()=>new Promise(r=>setTimeout(r,5)),until=async f=>{for(let i=0;i<3000;i++){if(f())return;await sleep();}throw Error('Timeout: '+$('status').textContent);};
 const $=id=>win.document.getElementById(id),click=id=>$(id).dispatchEvent(new win.MouseEvent('click',{bubbles:true}));let clock=0;
 const advance=n=>{for(let i=0;i<n;i++){clock+=1000/59.7275;const fn=frames.shift();assert.ok(fn);fn(clock);}};
 const key=(code,type='keydown')=>win.dispatchEvent(new win.KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
 try{
  await until(()=>!$('link').disabled);assert.equal($('peerScreen').hidden,true);click('link');assert.equal($('linkMenu').open,true);click('bootPeer');await until(()=>win.GoldApp.status().peerLoaded&&win.GoldApp.status().connection==='link');
  assert.equal($('peerScreen').hidden,false);assert.equal($('game').classList.contains('dual'),true);assert.equal(win.GoldApp.status().control,1);assert.equal($('control2').getAttribute('aria-pressed'),'true');assert.equal($('linkMenu').open,false);
  advance(45);assert.ok(win.GoldApp.status().frames>0);assert.ok(win.GoldApp.status().peerFrames>0);assert.equal($('screen2')._pixels.length,160*144*4);
  key('KeyX');key('KeyX','keyup');assert.ok(keys.some(k=>k.slot===1&&k.name==='A'&&k.down));click('control1');key('ArrowLeft');key('ArrowLeft','keyup');assert.ok(keys.some(k=>k.slot===0&&k.name==='left'&&k.down));assert.equal($('control1').getAttribute('aria-pressed'),'true');
  click('pause');click('save');await until(()=>$('status').textContent==='저장했습니다.');const saved=win.GoldApp.status(),pixels=$('screen')._pixels.slice(),pixels2=$('screen2')._pixels.slice();click('pause');advance(24);assert.ok(win.GoldApp.status().frames>saved.frames);click('pause');click('load');await until(()=>$('status').textContent==='이어합니다.');assert.equal(win.GoldApp.status().frames,saved.frames);assert.equal(win.GoldApp.status().peerFrames,saved.peerFrames);assert.deepEqual($('screen')._pixels,pixels);assert.deepEqual($('screen2')._pixels,pixels2);
  click('link');click('disconnectPeer');assert.equal(win.GoldApp.status().connection,null);$('linkMenu').close();click('pause');const dis=win.GoldApp.status();advance(15);assert.ok(win.GoldApp.status().frames>dis.frames);assert.ok(win.GoldApp.status().peerFrames>dis.peerFrames);
  click('link');$('linkMode').value='infrared';click('connectPeer');assert.equal(win.GoldApp.status().connection,'infrared');click('link');$('linkMode').value='both';click('connectPeer');assert.equal(win.GoldApp.status().connection,'both');
  click('pause');click('files');click('exportState');assert.equal(downloads.length,1);const exported=JSON.parse(await downloads[0].text());assert.equal(exported.format,'gold-sameboy-pair-v1');assert.equal(exported.sha256,win.GoldApp.status().romHash);assert.equal(exported.peerSha256,win.GoldApp.status().peerHash);$('fileMenu').close();
  const stateBefore=Buffer.from(runtime.pairState());const invalid={...exported,peerFrame:-1};$('stateFile').files=[new win.File([JSON.stringify(invalid)],'bad-state.json')];$('stateFile').dispatchEvent(new win.Event('change'));await until(()=>$('status').textContent==='2P 상태 정보가 올바르지 않습니다.');assert.equal(Buffer.compare(Buffer.from(runtime.pairState()),stateBefore),0,'invalid pair metadata must not mutate either core');
  click('link');click('exportPeerSave');assert.equal(downloads.length,2);const battery=new Uint8Array(await downloads[1].arrayBuffer());assert.equal(battery.length,32816);
  $('peerSaveFile').files=[new win.File([battery],'second.sav')];$('peerSaveFile').dispatchEvent(new win.Event('change'));await until(()=>$('status').textContent==='2P 세이브를 불러왔습니다.');assert.equal(win.GoldApp.status().peerFrames,0);assert.equal(win.GoldApp.status().connection,'both');assert.deepEqual(runtime.device(1).battery().slice(0,32768),battery.slice(0,32768));
  // A modified 1P can boot an original second cartridge without mixing save keys.
  click('edit');const hp=win.GoldApp.project().getPokemon(152).hp;$('recordForm').querySelector('[name=hp]').value=String(hp+1);$('recordForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));click('apply');await until(()=>!win.GoldApp.status().editing);const primaryHash=win.GoldApp.status().romHash;assert.notEqual(primaryHash,exported.sha256);click('link');$('peerROMSource').value='original';click('bootPeer');await until(()=>win.GoldApp.status().connection==='both');assert.equal(win.GoldApp.status().peerHash,exported.sha256);assert.equal(win.GoldApp.status().romHash,primaryHash);
  assert.deepEqual(errors,[]);
 }finally{runtime?.closeAll();await win.happyDOM.abort();win.close();}
});
