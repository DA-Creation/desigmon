'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../../web/gold/rom-project.js'),L=require('../../web/gold/layout-check.js');
(async()=>{
  const [romPath,symbolsPath]=process.argv.slice(2);if(!romPath||!symbolsPath)throw Error('Pass private original ROM and linked symbols');
  const original=new Uint8Array(fs.readFileSync(romPath)),symbols=fs.readFileSync(symbolsPath,'utf8');
  assert(L.checkQuickEditorLayout(symbols,{rom:original,original}).compatible);
  const shifted=symbols.replace('14:5bdf BaseData','14:5be0 BaseData');
  assert(!L.checkQuickEditorLayout(shifted,{rom:original,original}).tabs.pokemon.enabled);
  assert(!L.checkQuickEditorLayout(symbols).compatible);
  for(const kind of ['pokemon','trainer','evolution']){
    const p=await P.create(original);let fn;
    if(kind==='pokemon'){
      const a=p.getSprite(1);let b;
      for(let id=2;id<=251;id++){const candidate=p.getSprite(id);if(candidate.width===a.width&&candidate.height===a.height){b=candidate;break;}}
      assert(b);p.writeBytes(a.pointerOffset,p.readBytes(b.pointerOffset,3));
      const current=p.getSprite(1);fn=()=>p.setSprite(1,'front',current.pixels);
    }else if(kind==='trainer'){
      const a=p.getTrainerSprite(1),b=p.getTrainerSprite(2);p.writeBytes(a.pointerOffset,p.readBytes(b.pointerOffset,3));
      const current=p.getTrainerSprite(1);fn=()=>p.setTrainerSprite(1,current.pixels);
    }else{
      const a=p.getEvolutionLearnset(1),b=p.getEvolutionLearnset(2);p.writeBytes(a.pointerOffset,p.readBytes(b.pointerOffset,2));
      const current=p.getEvolutionLearnset(1);fn=()=>p.setEvolutionLearnset(1,{evolutions:current.evolutions,learnset:current.learnset});
    }
    const before=P.hex(p.rebuild());assert.throws(fn,/원본 포인터|원본 슬롯/);assert.equal(P.hex(p.rebuild()),before);
    assert(!L.checkQuickEditorLayout(symbols,{rom:p.rebuild(),original}).tabs[kind==='evolution'?'evolution':'sprite'].enabled);
  }
  for(const kind of ['pokemon','trainer']){
    const p=await P.create(original),s=kind==='pokemon'?p.getSprite(1):p.getTrainerSprite(1);
    p.writeBytes(s.offset,P.compress(new Uint8Array(s.tiles.length)));
    const changed=kind==='pokemon'?p.getSprite(1):p.getTrainerSprite(1),before=P.hex(p.rebuild());
    assert.throws(()=>kind==='pokemon'?p.setSprite(1,'front',changed.pixels):p.setTrainerSprite(1,changed.pixels),/슬롯 길이/);
    assert.equal(P.hex(p.rebuild()),before);
    assert(!L.checkQuickEditorLayout(symbols,{rom:p.rebuild(),original}).tabs.sprite.enabled);
  }
  console.log('PASS baseline layout, shifted anchors, missing metadata, three relocated pointer setters, two resized sprite slots');
})().catch(e=>{console.error(e);process.exitCode=1});
