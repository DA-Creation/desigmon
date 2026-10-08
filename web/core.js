(function(root){
  'use strict';
  const D=root.DesignmonData||(typeof require==='function'?require('./data.js'):null);
  const copy=x=>JSON.parse(JSON.stringify(x)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mon=id=>D.mons.find(m=>m.id===id),project=id=>id==='practice'?D.practice:D.projects.find(p=>p.id===id);
  function fresh(seed=92731){return {version:1,seed:seed>>>0,map:'studio',x:10,y:7,dir:'up',team:[],owned:[],levels:{},xp:{},condition:{},coins:60,items:{coffee:3,snack:2,notebook:2,break:1},completed:[],flags:{},steps:0,battle:null,settings:{sound:false},playTurns:0};}
  function recruit(s,id){if(s.owned.includes(id))return false;s.owned.push(id);s.levels[id]=1;s.xp[id]=0;s.condition[id]=mon(id).hp;if(s.team.length<3)s.team.push(id);return true;}
  function start(id,seed){if(!D.starters.includes(id))throw Error('Unknown starter');const s=fresh(seed);recruit(s,id);s.flags.started=true;return s;}
  function maxHp(s,id){return mon(id).hp+((s.levels[id]||1)-1)*5;}
  function blocked(m,x,y){if(x<0||y<0||x>=m.w||y>=m.h)return true;if(['t','w','b'].includes(m.tiles[y][x]))return true;
    if(m.npcs.some(n=>n.x===x&&n.y===y))return true;
    if((m.furniture||[]).some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h))return true;
    return m.buildings.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h&&!(x===b.door[0]&&y===b.door[1]));}
  function move(state,dir){if(state.battle)return state;const s=copy(state),v={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[dir];if(!v)return state;s.dir=dir;const m=D.maps[s.map],x=s.x+v[0],y=s.y+v[1];if(blocked(m,x,y))return s;s.x=x;s.y=y;s.steps++;const p=m.portals.find(p=>p.x===x&&p.y===y);if(p&&s.team.length){s.map=p.to;s.x=p.tx;s.y=p.ty;s.dir=p.to==='studio'||p.to==='guild'?'up':'down';}return s;}
  function nearby(s){const v={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[s.dir];return D.maps[s.map].npcs.find(n=>n.x===s.x+v[0]&&n.y===s.y+v[1]);}
  function heal(state){const s=copy(state);for(const id of s.owned)s.condition[id]=maxHp(s,id);return s;}
  function nextProject(s){return D.projects.find(p=>!s.completed.includes(p.id));}
  function begin(state,id){if(state.battle)return state;const p=project(id);if(!p)throw Error('Unknown project');if(id!=='practice'&&nextProject(state)?.id!==id)throw Error('Project is not available');const s=copy(state);const active=s.team.find(t=>s.condition[t]>0);if(!active)throw Error('라운지에서 쉬고 다시 시작해 주세요.');s.battle={project:id,turn:1,progress:0,agreement:25,active,status:{},guard:0,scope:0,boost:0,precision:0,result:null,log:[p.intro],previous:null};return s;}
  function random(s){s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296;}
  function affinity(m,p){if(m.type===p.tag)return 1.2;if(p.tag==='감성'&&['브랜딩','일러스트'].includes(m.type))return 1.25;if(p.tag==='감성'&&m.type==='편집')return .85;if(p.tag==='편집'&&m.type==='마케팅')return .9;return 1;}
  function reward(s,b,p){if(b.result)return;b.result='won';const first=!s.completed.includes(p.id);if(p.id==='practice'||first){s.coins+=p.reward;for(const id of s.team){s.xp[id]+=35;if(s.xp[id]>=s.levels[id]*50){s.xp[id]-=s.levels[id]*50;s.levels[id]++;s.condition[id]=Math.min(maxHp(s,id),s.condition[id]+18);}}}
    if(p.id!=='practice'&&first){s.completed.push(p.id);for(const id of p.recruits)recruit(s,id);s.items.coffee+=2;s.items.notebook++;}else if(p.id==='practice'){s.flags.practice=(s.flags.practice||0)+1;if(s.flags.practice===2)recruit(s,'balance');}
    b.log.push('납품 완료. '+p.reward+' 코인과 다음 작업을 위한 경험을 얻었다.');}
  function act(state,action){const s=copy(state),b=s.battle;if(!b||b.result)return state;const p=project(b.project),m=mon(b.active),id=b.active,hp=()=>s.condition[id];let used=true;const lines=[];
    const submit=(mult=1)=>{const acc=clamp(m.accuracy+b.precision-(b.status.change?.remaining > 0 ? .2 : 0),.4,1);if((hp()<20&&random(s)<.2)||random(s)>acc){lines.push('잠깐 방향을 놓쳤다. 설명이나 휴식으로 흐름을 되찾자.');return;}
      const speed=b.status.pressure?0:m.speed/5;let gain=Math.round((m.work+speed+b.boost+(b.status.overtime?6:0)+(s.levels[id]-1)*2)*affinity(m,p)*mult);if(m.id==='color'&&b.turn<=2)gain+=6;if(m.id==='draw'&&p.tag==='감성')gain+=3;b.progress=clamp(b.progress+gain,0,100);b.agreement=clamp(b.agreement+5,0,100);s.condition[id]=Math.max(0,hp()-5);lines.push(m.name+'의 작업물 제출. 진척 +'+gain+'.');};
    if(action.type==='submit')submit();
    else if(action.type==='explain'){const value=Math.round(m.explain*.9)+5;b.agreement=clamp(b.agreement+value,0,100);b.guard=2;delete b.status.change;lines.push('선택한 이유를 설명했다. 합의 +'+value+'. 다음 피드백의 부담이 줄어든다.');}
    else if(action.type==='scope'){b.scope=4;b.precision=Math.max(b.precision,.1);delete b.status.revision;delete b.status.change;b.agreement=clamp(b.agreement+12,0,100);lines.push('이번 작업의 범위를 함께 확인했다. 3턴 동안 수정·방향 변경을 예방한다.');}
    else if(action.type==='rest'){s.condition[id]=Math.min(maxHp(s,id),hp()+27);delete b.status.overtime;delete b.status.burnout;b.guard=1;lines.push('한 템포 쉬며 집중력을 되찾았다. 컨디션 +27.');}
    else if(action.type==='switch'){if(!s.team.includes(action.id)||action.id===id||s.condition[action.id]<=0)return state;b.active=action.id;lines.push(mon(action.id).name+'의 관점으로 작업을 이어간다.');}
    else if(action.type==='item'){
      if(!['coffee','snack','notebook','break'].includes(action.id)||s.items[action.id]<=0)return state;s.items[action.id]--;
      if(action.id==='coffee'){s.condition[id]=Math.min(maxHp(s,id),hp()+35);lines.push('따뜻한 커피로 컨디션 +35.');}
      if(action.id==='snack'){for(const t of s.team)s.condition[t]=Math.min(maxHp(s,t),s.condition[t]+18);lines.push('간식을 나누며 팀 전체 컨디션 +18.');}
      if(action.id==='notebook'){b.status={};b.scope=3;b.agreement=clamp(b.agreement+10,0,100);lines.push('합의 노트를 다시 펼쳤다. 상태이상 해제, 합의 +10.');}
      if(action.id==='break'){s.condition[id]=maxHp(s,id);b.status={};lines.push('휴식권으로 충분히 쉬었다. 컨디션 완전 회복.');}
    }else if(action.type==='skill'){
      if(!m.skills.includes(action.id))return state;const skill=D.skills[action.id];lines.push(m.name+' · '+skill.name);
      switch(skill.kind){
        case 'guard':b.guard=3;b.agreement+=18;break;
        case 'scope':b.scope=4;b.progress+=8;delete b.status.revision;delete b.status.change;break;
        case 'boost':b.progress+=12;b.boost=Math.min(12,b.boost+6);break;
        case 'critical':submit(1.45);break;
        case 'quick':delete b.status.revision;b.progress+=22;s.condition[id]=Math.max(0,hp()-10);break;
        case 'rush':submit(1.75);b.status.overtime={remaining:4};break;
        case 'cleanse':b.agreement+=20;delete b.status.revision;delete b.status.change;break;
        case 'precision':b.agreement+=14;b.precision=Math.min(.3,b.precision+.2);break;
        case 'style':submit(1.7);b.precision=Math.max(-.2,b.precision-.1);break;
        case 'organize':b.progress+=10;b.agreement+=10;s.condition[id]=Math.min(maxHp(s,id),hp()+8);break;
        case 'heal':s.condition[id]=Math.min(maxHp(s,id),hp()+28);delete b.status.overtime;delete b.status.pressure;break;
      }
    }else if(action.type==='withdraw'){b.result='withdrawn';lines.push('일단 거리를 두기로 했다. 쉬고 나면 다시 도전할 수 있다.');}
    else used=false;
    if(!used)return state;b.progress=clamp(b.progress,0,100);b.agreement=clamp(b.agreement,0,100);s.playTurns++;
    if(!b.result&&b.progress>=100&&b.agreement>=p.goal){b.log.push(...lines);reward(s,b,p);return s;}
    if(!b.result){
      const active=mon(b.active),event=p.pattern[(b.turn-1)%p.pattern.length],f=D.feedback[event];let loss=f.impact;
      if(b.guard>0)loss=Math.ceil(loss*.4);if(active.resist==='all')loss=Math.max(1,loss-2);if(active.id==='draw'&&random(s)<.2)loss=0;
      s.condition[b.active]=Math.max(0,s.condition[b.active]-loss);lines.push(f.line+' 컨디션 -'+loss+'.');
      if(event!=='calm'&&!(b.scope>0&&['revision','change'].includes(event))&&active.resist!==event&&active.resist!=='all'){b.status[event]={remaining:3};}
      for(const [key,status] of Object.entries(b.status)){if(key==='revision'||key==='overtime'){let cost=key==='revision'?5:7;if(active.weak===key)cost+=3;if(active.resist===key||active.resist==='all')cost=Math.ceil(cost*.5);s.condition[b.active]=Math.max(0,s.condition[b.active]-cost);lines.push(D.statuses[key].name+' · 컨디션 -'+cost+'.');}status.remaining--;if(status.remaining<=0)delete b.status[key];}
      b.scope=Math.max(0,b.scope-1);b.guard=Math.max(0,b.guard-1);
      if(s.condition[b.active]>0&&s.condition[b.active]<20)b.status.burnout={remaining:2};
      if(!s.team.some(t=>s.condition[t]>0)){b.result='lost';lines.push('번아웃. 끝이 아니라 회복이 필요한 순간이다.');}
      else if(b.turn>=p.deadline){b.result='lost';lines.push('약속한 일정이 끝났다. 범위와 순서를 다시 계획해보자.');}
      else {b.turn++;if(s.condition[b.active]===0){b.active=s.team.find(t=>s.condition[t]>0);lines.push(mon(b.active).name+'이 작업을 이어받았다.');}}
    }
    b.previous=action.type;b.log.push(...lines);b.log=b.log.slice(-40);return s;
  }
  function finish(state){if(!state.battle?.result)return state;let s=copy(state);const result=s.battle.result;s.battle=null;if(result!=='won'){s=heal(s);s.map='town';s.x=22;s.y=12;s.dir='up';}return s;}
  function swap(state,id,slot){if(state.battle||!state.owned.includes(id)||slot<0||slot>=3)return state;const s=copy(state);if(s.team.includes(id)){const i=s.team.indexOf(id);if(slot>=s.team.length)return state;[s.team[i],s.team[slot]]=[s.team[slot],s.team[i]];}else if(slot<=s.team.length)s.team[slot]=id;return s;}
  function buy(state,id){const prices={coffee:25,snack:30,notebook:35,break:65};if(state.battle||!prices[id]||state.coins<prices[id])return state;const s=copy(state);s.coins-=prices[id];s.items[id]++;return s;}
  function validate(v){if(!v||v.version!==1)throw Error('지원하지 않는 저장 형식입니다.');if(v.battle)throw Error('진행 중인 의뢰 저장은 지원하지 않습니다.');if(!D.maps[v.map]||!Number.isInteger(v.x)||!Number.isInteger(v.y)||blocked(D.maps[v.map],v.x,v.y))throw Error('저장된 위치가 올바르지 않습니다.');if(!['up','down','left','right'].includes(v.dir))throw Error('방향 정보가 올바르지 않습니다.');
    if(!Array.isArray(v.owned)||v.owned.length<1||v.owned.length>8||new Set(v.owned).size!==v.owned.length||v.owned.some(id=>!mon(id)))throw Error('동료 기록이 올바르지 않습니다.');
    if(!Array.isArray(v.team)||v.team.length<1||v.team.length>3||new Set(v.team).size!==v.team.length||v.team.some(id=>!v.owned.includes(id)))throw Error('팀 기록이 올바르지 않습니다.');
    for(const id of v.owned)if(!Number.isInteger(v.levels?.[id])||v.levels[id]<1||v.levels[id]>999||!Number.isInteger(v.xp?.[id])||v.xp[id]<0||!Number.isFinite(v.condition?.[id])||v.condition[id]<0||v.condition[id]>maxHp(v,id))throw Error('성장 기록이 올바르지 않습니다.');
    for(const key of ['coins','seed','steps','playTurns'])if(!Number.isSafeInteger(v[key])||v[key]<0)throw Error('수치 기록이 올바르지 않습니다.');
    for(const id of ['coffee','snack','notebook','break'])if(!Number.isSafeInteger(v.items?.[id])||v.items[id]<0)throw Error('도구 기록이 올바르지 않습니다.');
    if(!Array.isArray(v.completed)||v.completed.length>3||v.completed.some((id,i)=>id!==D.projects[i].id)||!v.flags||typeof v.flags!=='object'||typeof v.settings?.sound!=='boolean')throw Error('의뢰 기록이 올바르지 않습니다.');return copy(v);}
  function save(state,storage){try{if(state.battle)throw Error('의뢰를 마친 뒤 저장할 수 있습니다.');const clean=validate(state);storage.setItem('designmon-adventure-v1',JSON.stringify(clean));return {ok:true};}catch(e){return {ok:false,error:e.message};}}
  function load(storage){try{const raw=storage.getItem('designmon-adventure-v1');return raw?{ok:true,state:validate(JSON.parse(raw))}:{ok:false,empty:true};}catch(e){return {ok:false,error:e.message};}}
  const core={fresh,start,mon,project,maxHp,blocked,move,nearby,heal,nextProject,begin,act,finish,swap,buy,validate,save,load,recruit};root.DesignmonCore=core;if(typeof module!=='undefined')module.exports=core;
})(typeof globalThis!=='undefined'?globalThis:this);
