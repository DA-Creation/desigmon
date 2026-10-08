/* Original Korean Gold, controller input only: quest, capture, trade, battle.
 * GOLD_ROM points outside this repository. GOLD_LINK_SAVE may reuse the natural
 * trade-ready checkpoint; otherwise the included controller trace prepares it.
 * GOLD_LINK_OUTPUT must remain outside this repository. No game RAM is written.
 */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Runtime=require('../web/gold/runtime'),Gold=require('../web/gold/rom-project'),trace=require('./fixtures/gold-link-inputs.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const expectedReadySRAM='59f04591928b5ae87577e5c660173259db978ab99b33c5a82e1b72d2edf87b87';
function tick(r,n){for(let i=0;i<n;i++)r.frame();}
function press(r,key,frames=12,after=180){r.key(key,true);tick(r,frames);r.key(key,false);tick(r,after);}
function boot(r){tick(r,900);for(const key of ['start','start','A','A'])press(r,key);}
function party(r){return Array.from({length:r.read(0xdb1f)},(_,i)=>r.read(0xdb20+i));}
function stats(b){return {wins:b[0x31fc]*256+b[0x31fd],losses:b[0x31fe]*256+b[0x31ff],draws:b[0x3200]*256+b[0x3201]};}
function snapshot(r){return {party:party(r),group:r.read(0xdafd),map:r.read(0xdafe),x:r.read(0xdb00),y:r.read(0xdaff),battle:r.read(0xd1d3),link:r.read(0xd0fd),hp:r.read(0xcb1c)*256+r.read(0xcb1d)};}
async function prepare(rom,out){
 if(process.env.GOLD_LINK_SAVE)return fs.readFileSync(process.env.GOLD_LINK_SAVE);
 const r=await Runtime.create();r.open(rom,{deterministic:true});
 try{
  for(const {input:s,count}of trace.initial)for(let j=0;j<count;j++){
   if(s.talk||s.battle){const address=s.talk?0xd21c:0xd1d3;let tries=0;while(r.read(address)!==0&&tries++<150)press(r,'A',12,s.talk?90:120);assert.equal(r.read(address),0);}
   else if(s.key)press(r,s.key,s.frames,s.after??20);else tick(r,s.wait||1);
  }
  assert.deepEqual(party(r),[155]);assert.deepEqual([r.read(0xdafd),r.read(0xdafe)],[24,3]);
  // These are actual controller hold durations, with no map/source dependency.
  for(const [key,frames]of trace.quest){if(key)r.key(key,true);tick(r,frames);if(key)r.key(key,false);}
  assert.deepEqual(party(r),[155,161]);assert.deepEqual([r.read(0xdafd),r.read(0xdafe),r.read(0xdb00),r.read(0xdaff)],[26,5,3,3]);
  const battery=r.battery();fs.writeFileSync(path.join(out,'trade-ready.sav'),battery);return battery;
 }finally{r.closeAll();}
}
async function verifyReboot(rom,battery,expected,expectedStats){
 const r=await Runtime.create();r.open(rom,{deterministic:true});r.loadBattery(battery);
 try{boot(r);assert.deepEqual(party(r),expected);assert.equal(r.read(0xd0fd),0);assert.deepEqual([r.read(0xdafd),r.read(0xdafe)],[20,1]);if(expectedStats)assert.deepEqual(stats(r.battery()),expectedStats);return snapshot(r);}finally{r.closeAll();}
}
test('natural original-ROM link trade and full link battle survive paired restore and battery reboot',{skip:!process.env.GOLD_ROM,timeout:720000},async()=>{
 const rom=fs.readFileSync(process.env.GOLD_ROM);await Gold.create(rom);
 const repo=path.resolve(__dirname,'..'),out=path.resolve(process.env.GOLD_LINK_OUTPUT||path.join(os.tmpdir(),'designmon-gold-link-playthrough'));
 assert.ok(out!==repo&&!out.startsWith(repo+path.sep),'Game output belongs outside the repository.');fs.mkdirSync(out,{recursive:true});
 const ready=await prepare(rom,out);assert.equal(sha(ready.subarray(0,32768)),expectedReadySRAM,'Use the naturally prepared trade-ready checkpoint.');
 const r=await Runtime.create(),p=r.device(1),report={romSha256:sha(rom),inputOnly:true,stages:{},checks:{}};
 try{
  r.open(rom,{deterministic:true});r.loadBattery(ready);boot(r);assert.deepEqual(party(r),[155,161]);
  // Match the UI's physical power sequence. Independently frame-locking two
  // identical cold boots creates an artificial, identical LCD scan phase.
  p.open(rom,{deterministic:true});p.loadBattery(ready);r.connect('link');
  for(const [index,s]of trace.pair.entries()){
   const devices=s.slot===0?[r]:s.slot===1?[p]:[r,p];if(s.key)for(const d of devices)d.key(s.key,true);tick(r,s.frames||s.wait||1);if(s.key){for(const d of devices)d.key(s.key,false);tick(r,s.after??30);}
   if(index===55){
    for(const [slot,d]of[r,p].entries()){const expected=slot===0?[161,161]:[155,155];assert.deepEqual(party(d),expected);assert.equal(d.read(0xd0fd),0);const battery=d.battery();fs.writeFileSync(path.join(out,'traded-'+(slot+1)+'p.sav'),battery);report.stages['tradeReboot'+slot]=await verifyReboot(rom,battery,expected);}
    report.checks.realTrade=true;report.checks.tradeBatteryReboot=true;
   }
   if(index===83){
    assert.equal(r.read(0xd1d3),2);assert.equal(p.read(0xd1d3),2);assert.equal(r.read(0xcb1d),15);assert.equal(p.read(0xcb1d),25);
    const state=r.pairState();tick(r,20);const expected=[r.pixels(),p.pixels()],game=[snapshot(r),snapshot(p)];r.restorePairState(state);tick(r,20);assert.deepEqual([snapshot(r),snapshot(p)],game);assert.equal(Buffer.compare(Buffer.from(r.pixels()),Buffer.from(expected[0])),0);assert.equal(Buffer.compare(Buffer.from(p.pixels()),Buffer.from(expected[1])),0);r.restorePairState(state);report.checks.pairedBattleRestore=true;
   }
   if(index===87){const hp=[r.read(0xcb1c)*256+r.read(0xcb1d),p.read(0xcb1c)*256+p.read(0xcb1d)];assert.ok(hp[0]+hp[1]<40,'A completed turn must change actual HP.');assert.equal(r.read(0xd1bc)*256+r.read(0xd1bd),hp[1]);assert.equal(p.read(0xd1bc)*256+p.read(0xd1bd),hp[0]);report.stages.firstTurn=[snapshot(r),snapshot(p)];report.checks.realLinkBattleDamage=true;}
  }
  for(const [slot,d]of[r,p].entries()){
   const expected=slot===0?[161,161]:[155,155],score=slot===0?{wins:0,losses:1,draws:0}:{wins:1,losses:0,draws:0};
   assert.deepEqual(party(d),expected);assert.deepEqual([d.read(0xdafd),d.read(0xdafe),d.read(0xd1d3),d.read(0xd0fd)],[20,1,0,0]);assert.deepEqual(stats(d.battery()),score);
   const battery=d.battery();fs.writeFileSync(path.join(out,'battle-'+(slot+1)+'p.sav'),battery);report.stages['battleReboot'+slot]=await verifyReboot(rom,battery,expected,score);
  }
  report.checks.fullLinkBattle=true;report.checks.battleBatteryReboot=true;fs.writeFileSync(path.join(out,'link-playthrough-report.json'),JSON.stringify(report,null,2));console.log('Original-ROM trade/battle verified:',report.checks);
 }finally{r.closeAll();}
});
