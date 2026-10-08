const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const ROM=process.env.GOLD_ROM;
test('actual DOM wiring: load, run, edits, undo, save/restore, project persistence',{skip:!ROM},async()=>{
 const {Window}=await import('happy-dom'),{indexedDB}=require('fake-indexeddb');
 const win=new Window({url:'https://unit.invalid/',settings:{disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});
 const errors=[];win.addEventListener('error',e=>errors.push(e.message));
 Object.defineProperty(win,'crypto',{value:webcrypto});win.indexedDB=indexedDB;win.GoldRuntime=require('../web/gold/runtime.js');win.GOLD_STANDALONE=true;
 const frames=[];win.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};win.fetch=()=>{throw Error('Unexpected network');};
 win.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return{createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>canvas._pixels=Uint8Array.from(image.data)};};
 win.document.write(fs.readFileSync(path.join(__dirname,'../web/gold/index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
 const read=p=>fs.readFileSync(path.join(__dirname,'../',p),'utf8');
 for(const p of ['web/gold/rom-schema.js','web/gold/rom-project.js','web/gold/layout-check.js','web/gold/layout-history.js','web/gold/cpu.js','web/gold/scenario.js','web/gold/scenario-panel.js','web/gold/editor-panels.js'])win.eval(read(p));
 win.GOLD_EMBEDDED_ROM=fs.readFileSync(ROM).toString('base64');win.eval(read('web/gold/editor.js'));
 const sleep=()=>new Promise(r=>setTimeout(r,5)),until=async f=>{for(let i=0;i<3000;i++){if(f())return;await sleep();}throw Error('Timeout: '+win.document.getElementById('status').textContent);};
 const $=id=>win.document.getElementById(id),click=id=>$(id).dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
 await until(()=>!$('edit').disabled&&frames.length>0);assert.equal($('loader').hidden,true);assert.equal($('editor').hidden,true);
 for(let i=0;i<600;i++)frames.shift()(i*1000/59.7275);assert.ok(win.GoldApp.status().frames>590);assert.ok(new Set($('screen')._pixels).size>1);
 click('pause');assert.equal(win.GoldApp.status().paused,true);click('pause');click('edit');assert.equal(win.GoldApp.status().editing,true);
 const hp=win.GoldApp.project().getPokemon(152).hp;const input=$('recordForm').querySelector('[name=hp]');input.value=String(hp+1);$('recordForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));assert.equal(win.GoldApp.project().getPokemon(152).hp,hp+1);
 click('undo');assert.equal(win.GoldApp.project().getPokemon(152).hp,hp);click('redo');assert.equal(win.GoldApp.project().getPokemon(152).hp,hp+1);
 for(const tab of ['moves','evolution','sprite','scenario','code','bytes','changes']){win.document.querySelector('[data-tab='+tab+']').dispatchEvent(new win.MouseEvent('click'));assert.ok($('panel').textContent.length>0,tab);}
 win.document.querySelector('[data-tab=sprite]').dispatchEvent(new win.MouseEvent('click'));for(const kind of ['trainer','overworld','pokemon']){$('spriteKind').value=kind;$('spriteKind').dispatchEvent(new win.Event('change'));assert.ok($('spriteCanvas')._pixels.length>0);}
 click('apply');await until(()=>!win.GoldApp.status().editing);assert.equal(win.GoldApp.status().paused,false);click('pause');click('save');await until(()=>$('status').textContent==='저장했습니다.');const savedPixels=$('screen')._pixels,savedFrame=win.GoldApp.status().frames;click('pause');for(let i=601;i<680;i++)frames.shift()(i*1000/59.7275);click('pause');click('load');await until(()=>$('status').textContent==='이어합니다.');assert.equal(win.GoldApp.status().frames,savedFrame);assert.deepEqual($('screen')._pixels,savedPixels);
 assert.deepEqual(errors,[]);await win.happyDOM.abort();win.close();
});
