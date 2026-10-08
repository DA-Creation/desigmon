/* Fail-closed compatibility checks for fixed-format editors after source builds. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./rom-project.js'):root.GoldProject);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.GoldLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const expected={
    BaseData:0x51bdf,BetaMonPicBanks:0x53b3f,PokemonNames:0x1b0c4a,MoveNames:0x1b164a,
    Moves:0x4172e,EvolvePokemon:0x41e0b,MoveDescriptions:0x1b4000,
    EvosAttacksPointers:0x423ed,BulbasaurEvosAttacks:0x425e3,
    PokemonPicPointers:0x48000,UnownPicPointers:0x7c000,PokemonPalettes:0xad0d,
    TrainerPicPointers:0x80000,TrainerPalettes:0xb50d,TrainerClassNames:0x1b09a1,
    OverworldSprites:0x147de,CheckWarpCollision:0x14a18,MapObjectPals:0xb87e,RoofPals:0xb97e,
    MapGroupPointers:0x940ed,ScriptCommandTable:0x96be4,TextCommands:0x12c3,
    StdScripts:0x100000,SpecialsPointers:0xc239
  };
  const required={
    pokemon:['BaseData','BetaMonPicBanks','PokemonNames','MoveNames'],
    moves:['Moves','EvolvePokemon','MoveNames','MoveDescriptions'],
    evolution:['EvosAttacksPointers','BulbasaurEvosAttacks','PokemonNames','MoveNames'],
    sprite:['BaseData','BetaMonPicBanks','PokemonNames','MoveNames','PokemonPicPointers','UnownPicPointers',
      'PokemonPalettes','TrainerPicPointers','TrainerPalettes','TrainerClassNames','OverworldSprites',
      'CheckWarpCollision','MapObjectPals','RoofPals'],
    scenario:['MapGroupPointers','ScriptCommandTable','TextCommands','StdScripts','SpecialsPointers']
  };
  function symbols(text){
    const result={};
    for(const line of String(text||'').split(/\r?\n/)){
      const m=/^([\da-fA-F]{2}):([\da-fA-F]{4}) (\S+)$/.exec(line);if(!m)continue;
      const bank=parseInt(m[1],16),address=parseInt(m[2],16);
      if(bank>127||address>=(bank?0x8000:0x4000)||address<(bank?0x4000:0))continue;
      result[m[3]]=bank*0x4000+(bank?address-0x4000:address);
    }
    return result;
  }
  function equal(a,b,start,length){for(let i=start;i<start+length;i++)if(a[i]!==b[i])return false;return true;}
  function word(b,p){return b[p]|b[p+1]<<8;}
  function spriteOffset(b,p){const raw=b[p],bank=P.schema.picBankMap[raw]??raw,address=word(b,p+1);return P.offset(bank,address);}
  function nameEnd(b){let p=0x1b164a;for(let n=0;n<251;n++){const start=p;while(p<b.length&&b[p]!==0x50){p+=b[p]>=1&&b[p]<=11?2:1;if(p-start>16)throw Error('기술 이름 레코드 손상');}if(p>=b.length)throw Error('기술 이름 종료 누락');p++;}return p;}
  function evolutionLength(b,id){const pointer=0x423ed+id*2;let p=P.offset(0x10,word(b,pointer)),start=p;
    for(let n=0;n<1000;n++){const method=b[p++];if(method===0)break;if(method<1||method>5)throw Error('진화 방식 변경');p+=method===5?3:2;if(p>=0x44000)throw Error('진화 목록 범위 오류');}
    for(let n=0;n<1000;n++){if(b[p++]===0)return p-start;p++;if(p>=0x44000)throw Error('레벨 기술 범위 오류');}throw Error('레벨 기술 종료 누락');
  }
  function checkQuickEditorLayout(text,{rom,original}={}){
    const actual=symbols(text),anchors={};
    for(const[name,offset]of Object.entries(expected))anchors[name]={expected:offset,actual:actual[name]??null,ok:actual[name]===offset};
    const tabs={};for(const[tab,names]of Object.entries(required))tabs[tab]={enabled:true,reasons:names.filter(n=>!anchors[n].ok).map(n=>n+' 위치 변경 또는 심벌 누락')};
    function fail(tab,reason){tabs[tab].reasons.push(reason);}
    const byteProof=rom instanceof Uint8Array&&original instanceof Uint8Array&&rom.length===P.schema.size&&original.length===P.schema.size;
    if(!byteProof){for(const tab of Object.keys(tabs))fail(tab,'원본 및 빌드 ROM 바이트 검증 필요');}
    else {
      for(let id=1;id<=251;id++)if(rom[0x51bdf+(id-1)*32]!==id){fail('pokemon','32바이트 종 데이터 레코드 순서 변경');fail('sprite','종 데이터 레코드 구조 변경');break;}
      try{if(nameEnd(rom)!==nameEnd(original))fail('moves','기술 이름 테이블 용량 변경');}catch(e){fail('moves',e.message);}
      if(!equal(rom,original,0x423ed,251*2))fail('evolution','진화 목록 포인터 재배치');
      else try{for(let id=0;id<251;id++)if(evolutionLength(rom,id)!==evolutionLength(original,id)){fail('evolution','진화/레벨 기술 원본 슬롯 길이 변경');break;}}catch(e){fail('evolution',e.message);}
      for(const[at,count,label]of [[0x48000,251*2,'몬스터'],[0x7c000,26*2,'안농'],[0x80000,66,'트레이너']]){
        if(!equal(rom,original,at,count*3)){fail('sprite',label+' 그림 포인터 재배치');continue;}
        try{for(let i=0;i<count;i++){
          // Species 201 uses UnownPicPointers; its ordinary pair is a sentinel.
          if(at===0x48000&&(i===400||i===401))continue;
          const p=at+i*3,offset=spriteOffset(rom,p),before=P.decompress(original,offset),after=P.decompress(rom,offset);
          if(before.consumed!==after.consumed||before.bytes.length!==after.bytes.length){fail('sprite',label+' 그림 원본 압축 슬롯 크기 변경');break;}
        }}catch(e){fail('sprite',label+' 그림 용량 검증 실패: '+e.message);}
      }
      for(let id=0;id<251;id++)if(rom[0x51bdf+id*32+17]!==original[0x51bdf+id*32+17]){fail('sprite','몬스터 그림 치수 변경');break;}
      // Map parsing also depends on opcode and standard-script table formats.
      // A changed handler vector can mean a changed command grammar, so leave
      // that version to the complete source editor rather than guessing operands.
      for(const[at,length,label]of [[0x96be4,163*2,'이벤트 명령'],[0x12c3,23*2,'텍스트 명령']])
        if(!equal(rom,original,at,length))fail('scenario',label+' 테이블 변경: 원본 문법을 보증할 수 없음');
    }
    for(const tab of Object.values(tabs))tab.enabled=tab.reasons.length===0;
    for(const tab of ['source','code','bytes','changes'])tabs[tab]={enabled:true,reasons:[]};
    return{compatible:Object.values(tabs).every(v=>v.enabled),tabs,anchors,
      limitations:'Pinned schema and fixed slot compatibility only. Arbitrary engine semantic changes cannot be certified by addresses alone.'};
  }
  return{checkQuickEditorLayout,symbols,expected};
});
