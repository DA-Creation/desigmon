/* Scenario editor controls. All ROM-derived/user text enters through textContent
 * or input.value; no ROM text is interpolated into HTML. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.GoldScenarioPanel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const sessions=new WeakMap();
const labels={header:'맵 헤더',attributes:'맵 속성',connections:'연결',scenes:'시작 이벤트',callbacks:'콜백',warps:'워프',coords:'좌표 이벤트',backgrounds:'배경 이벤트',objects:'캐릭터',trainer:'트레이너',condition:'조건',item:'아이템'};
const fields={attributesBank:'속성 뱅크',tileset:'타일셋',environment:'환경',attributesAddress:'속성 주소',landmark:'지역',music:'음악',phoneBlocked:'전화 차단',palette:'팔레트',fishingGroup:'낚시 그룹',borderBlock:'경계 블록',height:'높이',width:'너비',blocksBank:'블록 뱅크',blocksAddress:'블록 주소',scriptsBank:'스크립트 뱅크',scriptsAddress:'스크립트 주소',eventsAddress:'이벤트 주소',connectionFlags:'연결 플래그',group:'그룹',map:'맵 번호',destinationWarp:'도착 워프',scene:'장면',script:'스크립트 주소',type:'종류',pointer:'참조 주소',sprite:'스프라이트',movement:'움직임',radiusX:'가로 반경',radiusY:'세로 반경',hour1:'시작 시간',hour2:'끝 시간',sightRange:'시야 거리',eventFlag:'이벤트 플래그',item:'아이템',quantity:'수량',seenText:'조우 대사',beatenText:'승리 대사',lostScript:'패배 스크립트',afterScript:'이후 스크립트'};
const kindLabels={script:'스크립트',text:'대사',cpu:'CPU',movement:'움직임',string:'문자열','map-blocks':'맵 블록','map-scripts':'맵 시작 이벤트','map-events':'맵 이벤트','map-attributes':'맵 속성','conditional-event':'조건','item-ball':'아이템','hidden-item':'숨긴 아이템',trainer:'트레이너'};
const hex=(n,width=4)=>n.toString(16).toUpperCase().padStart(width,'0');
function render(project,panel,{changed=()=>{},message=()=>{}}={}){
 const S=root.GoldScenario||(typeof require==='function'?require('./scenario.js'):null),CPU=root.GoldCPU||(typeof require==='function'?require('./cpu.js'):null),doc=panel.ownerDocument||root.document;
 if(!S||!doc)throw Error('시나리오 편집기를 불러올 수 없습니다.');
 let session=sessions.get(project);if(!session){session={group:24,id:7,record:0,view:null,history:[]};sessions.set(project,session);}
 const getROM=()=>project.readBytes(0,2097152);
 const el=(tag,text,props={})=>{const node=doc.createElement(tag);if(text!==null&&text!==undefined)node.textContent=text;Object.assign(node,props);return node;};
 const button=(text,fn,primary=false)=>{const b=el('button',text,{type:'button',className:primary?'primary':''});b.onclick=()=>safe(fn);return b;};
 const safe=fn=>{try{const out=fn();if(out&&typeof out.then==='function')out.catch(e=>message(e.message));}catch(e){message(e.message);}};
 const clear=()=>{panel.textContent='';};
 const note=text=>el('p',text,{className:'note'});
 const select=(name,options,value)=>{const node=el('select',null);node.setAttribute('aria-label',name);for(const o of options){const opt=el('option',o.label,{value:String(o.value)});node.appendChild(opt);}node.value=String(value);return node;};
 const showMap=()=>{session.view=null;session.history=[];drawMap();};
 function navigate(view){if(session.view)session.history.push(session.view);session.view=view;drawCode();}
 function showLinks(links){
  const container=el('div',null,{className:'row'}),seen=new Set();for(const l of links){const key=l.kind+':'+l.offset;if(seen.has(key))continue;seen.add(key);const title=(kindLabels[l.kind]||l.kind)+' '+hex(l.bank,2)+':'+hex(l.address);
   if(l.offset!==null&&!l.indirect&&['script','text','cpu'].includes(l.kind)){container.appendChild(button(title,()=>navigate({kind:l.kind,offset:l.offset})));}
   else container.appendChild(el('span',title+(l.indirect?' · 간접 참조':''),{className:'note'}));
  }return container;
 }
 function drawMap(){
  const rom=getROM(),maps=S.listMaps(rom),map=S.readMap(rom,session.group,session.id),recordOptions=[];
  const add=(name,record)=>{recordOptions.push({name,record});for(const nested of ['condition','trainer','item'])if(record[nested])recordOptions.push({name:name+' / '+labels[nested],record:record[nested]});};
  add(labels.header,map.header);add(labels.attributes,map.attributes);for(const category of ['connections','scenes','callbacks','warps','coords','backgrounds','objects'])map[category].forEach((r,i)=>add(labels[category]+' '+(r.direction||i+1),r));
  session.record=Math.min(session.record,recordOptions.length-1);clear();
  const top=el('div',null,{className:'row'}),mapSelect=select('맵',maps.map(m=>({value:m.group+':'+m.id,label:m.group+'.'+m.id+' '+m.name})),session.group+':'+session.id);
  mapSelect.onchange=()=>safe(()=>{[session.group,session.id]=mapSelect.value.split(':').map(Number);session.record=0;drawMap();});top.appendChild(mapSelect);panel.appendChild(top);
  const pick=select('이벤트',recordOptions.map((r,i)=>({value:i,label:r.name})),session.record);pick.onchange=()=>{session.record=Number(pick.value);safe(drawMap);};const row=el('div',null,{className:'row'});row.appendChild(pick);panel.appendChild(row);
  const selected=recordOptions[session.record].record,form=el('form',null,{className:'fields'}),inputs=[];
  for(const descriptor of selected.fieldDescriptors){const key=descriptor.name,label=el('label',fields[key]||key),input=el('input',null,{type:'number',value:String(selected.fields[key]),step:'1'});input.name=key;input.min=String(descriptor.signed?-128:-(descriptor.adjust||0));input.max=String(descriptor.signed?127:descriptor.mask??((descriptor.size===2?65535:255)-(descriptor.adjust||0)));label.appendChild(input);form.appendChild(label);inputs.push(input);}
  const submit=el('button','적용',{type:'submit',className:'primary'});form.appendChild(submit);
  form.onsubmit=e=>{e.preventDefault();safe(()=>{const patch={};for(const input of inputs)patch[input.name]=Number(input.value);const proposal=S.patchRecord(getROM(),selected,patch);project.writeBytes(proposal.offset,proposal.after,recordOptions[session.record].name+' 편집');changed();message('적용했습니다. 실행 반영 버튼으로 다시 시작하세요.');drawMap();});};panel.appendChild(form);
  panel.appendChild(note('ROM '+hex(selected.offset,6)+' · '+selected.size+' bytes'));
  if(selected.warning)panel.appendChild(note(selected.warning));panel.appendChild(showLinks(selected.links));
  // Map-wide script/text destinations are useful even when the header is selected.
  const allLinks=map.links.filter(l=>['script','text'].includes(l.kind)&&l.offset!==null);
  if(allLinks.length){const details=el('details'),summary=el('summary','이 맵의 스크립트·대사');details.appendChild(summary);details.appendChild(showLinks(allLinks));panel.appendChild(details);}
 }
 function drawCode(){
  if(!session.view)return drawMap();const rom=getROM(),view=session.view,offset=view.offset;let decoded;
  if(view.kind==='script')decoded=S.readScript(rom,offset,{maxBytes:16384,maxCommands:4096});
  else if(view.kind==='text')decoded=S.readText(rom,offset,{maxBytes:16384,maxCommands:1024});
  else{const length=Math.min(128,0x4000-offset%0x4000,rom.length-offset),records=CPU.disassemble(rom,{offset,length,address:S.address(offset).address});decoded={offset,size:length,text:records.map(r=>r.text).join('\n'),records,links:[]};}
  const before=rom.slice(offset,offset+decoded.size);clear();const top=el('div',null,{className:'row'});
  top.appendChild(button('맵',showMap));if(session.history.length)top.appendChild(button('이전',()=>{session.view=session.history.pop();drawCode();}));
  const a=S.address(offset);top.appendChild(el('span',(kindLabels[view.kind]||view.kind)+' '+hex(a.bank,2)+':'+hex(a.address)));panel.appendChild(top);
  const input=el('textarea',null,{value:decoded.text,spellcheck:false});input.setAttribute('aria-label',view.kind==='text'?'대사 명령 편집':view.kind==='cpu'?'CPU 명령 편집':'시나리오 명령 편집');panel.appendChild(input);
  const controls=el('div',null,{className:'row'});controls.appendChild(button('같은 길이로 적용',()=>{
   const current=getROM();if(before.some((v,i)=>current[offset+i]!==v))throw Error('읽은 뒤 내용이 변경되었습니다. 다시 읽으세요.');
   const patch=view.kind==='cpu'?CPU.assemblePatch(current,offset,decoded.size,input.value,a.address):S.fixedPatch(current,offset,decoded.size,input.value,view.kind);
   project.writeBytes(patch.offset,patch.after,(kindLabels[view.kind]||view.kind)+' 편집');changed();message('적용했습니다. 실행 반영 버튼으로 다시 시작하세요.');drawCode();
  },true));controls.appendChild(button('다시 읽기',drawCode));panel.appendChild(controls);panel.appendChild(note('ROM '+hex(offset,6)+' · '+decoded.size+' bytes'));
  panel.appendChild(showLinks(decoded.links));
  const handlers=decoded.records.map(r=>r.handler).filter(Boolean);
  if(handlers.length){const details=el('details'),summary=el('summary','엔진 명령 처리 코드');details.appendChild(summary);details.appendChild(showLinks(handlers));panel.appendChild(details);}
 }
 safe(()=>session.view?drawCode():drawMap());
}
return Object.freeze({render});
});
