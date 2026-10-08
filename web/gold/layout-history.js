/* Track fixed-format compatibility with byte edits and project undo history. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./layout-check.js'):root.GoldLayout);if(typeof module==='object'&&module.exports)module.exports=api;root.GoldLayoutHistory=api;})(globalThis,function(Layout){'use strict';
const quick=['pokemon','moves','evolution','sprite','scenario'],free=['source','code','bytes','changes'];
const fixed=()=>({kind:'fixed',symbols:''}),unknown=()=>({kind:'unknown',symbols:''});
function same(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function compactSymbols(text){return String(text||'').split(/\r?\n/).filter(line=>{const m=/^[0-9a-f]{2}:[0-9a-f]{4} (\S+)$/i.exec(line);return m&&Object.hasOwn(Layout.expected,m[1]);}).join('\n');}
function stateFromManifest(m){const v=m?.editorLayout;if(v?.version===1&&v.kind==='fixed')return fixed();if(v?.version===1&&v.kind==='source'&&typeof v.symbols==='string')return{kind:'source',symbols:compactSymbols(v.symbols)};return m?.changes?.length?unknown():fixed();}
function create(project,original){
 const base=Uint8Array.from(original);let state=project.dirty?unknown():fixed(),last=project.readBytes(0,project.size),past=[],future=[],cached=null;
 function changed(next=state){const bytes=project.readBytes(0,project.size);if(!same(bytes,last)){past.push(state);future=[];}state=next;last=bytes;cached=null;return state;}
 function tabs(){if(cached)return cached;if(same(last,base)){state=fixed();}if(state.kind==='source')cached=Layout.checkQuickEditorLayout(state.symbols,{rom:last,original:base}).tabs;else{cached={};for(const tab of quick)cached[tab]={enabled:state.kind==='fixed',reasons:state.kind==='fixed'?[]:['편집 배치 정보가 없습니다. 전체 소스 또는 바이트 탭을 사용하세요.']};for(const tab of free)cached[tab]={enabled:true,reasons:[]};}return cached;}
 return{
  changed:()=>changed(),
  applyBuild(result){if(!result?.rom||result.rom.length!==project.size||typeof result.symbols!=='string')throw Error('전체 크기의 빌드 ROM과 심벌이 필요합니다.');const next={kind:'source',symbols:compactSymbols(result.symbols)};project.writeBytes(0,result.rom,'전체 소스 빌드');changed(next);return tabs();},
  import(manifest){const next=stateFromManifest(manifest);project.importManifest(manifest);changed(next);return tabs();},
  undo(){const before=state;if(!project.undo())return false;state=past.pop()||unknown();future.push(before);last=project.readBytes(0,project.size);cached=null;return true;},
  redo(){const before=state;if(!project.redo())return false;state=future.pop()||unknown();past.push(before);last=project.readBytes(0,project.size);cached=null;return true;},
  manifest(){return{...project.manifest(),editorLayout:{version:1,kind:state.kind,symbols:state.symbols}};},
  tabs,
  status:()=>({kind:state.kind,undoDepth:past.length,redoDepth:future.length})
 };
}
return{create,compactSymbols};
});
