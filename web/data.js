(function (root) {
  'use strict';
  const mons = [
    {id:'typo',name:'타이포몽',type:'편집',role:'무너지지 않는 기본기',color:'#d8be83',hp:108,work:19,explain:18,speed:12,accuracy:.98,resist:'revision',weak:'감성',skills:['layout','structure'],desc:'글자와 간격, 흐름을 정리하는 안정형 동료. 수정 요청을 차분하게 받아낸다.'},
    {id:'color',name:'컬러링',type:'브랜딩',role:'첫인상을 만드는 감성',color:'#e8a18f',hp:88,work:24,explain:11,speed:17,accuracy:.91,resist:null,weak:'change',skills:['mood','conceptColor'],desc:'분위기로 설득하는 감성형 동료. 첫 제안에 강하지만 방향이 바뀌면 흔들린다.'},
    {id:'pixel',name:'픽셀러',type:'디지털',role:'빠르게 만들고 고치기',color:'#93c9c7',hp:80,work:19,explain:12,speed:27,accuracy:.92,resist:null,weak:'overtime',skills:['quick','output'],desc:'빠른 실행력이 무기인 동료. 속도만 믿고 달리면 컨디션이 먼저 소진된다.'},
    {id:'wire',name:'와이어드',type:'UI/UX',role:'왜인지 설명하는 논리',color:'#9eafd7',hp:110,work:16,explain:24,speed:12,accuracy:.97,resist:'change',weak:null,skills:['flow','logic'],desc:'사용자의 흐름에서 답을 찾는 동료. 강한 한 방보다 이후의 문제를 줄인다.'},
    {id:'market',name:'마케톤',type:'마케팅',role:'근거로 전하는 설득',color:'#ebb76d',hp:92,work:20,explain:21,speed:17,accuracy:.90,resist:null,weak:'편집',skills:['results','evidence'],desc:'숫자와 성과를 근거로 이야기한다. 구조보다 설득이 필요한 순간에 강하다.'},
    {id:'draw',name:'드로잉',type:'일러스트',role:'감정을 담는 표현력',color:'#bda5d5',hp:90,work:26,explain:13,speed:17,accuracy:.83,resist:null,weak:'revision',skills:['emotion','style'],desc:'개성 있는 표현으로 마음을 움직인다. 기준이 모호하면 수정에 힘이 빠진다.'},
    {id:'concept',name:'컨셉터',type:'브랜딩',role:'먼저 방향을 정하는 기획',color:'#bace98',hp:102,work:16,explain:23,speed:10,accuracy:.99,resist:'change',weak:null,skills:['direction','scope'],desc:'처음에 시간을 쓰고 중반을 편하게 만든다. 방향과 범위를 정하는 데 능하다.'},
    {id:'balance',name:'밸런서',type:'편집',role:'오래 가기 위한 균형',color:'#acbba5',hp:115,work:18,explain:19,speed:17,accuracy:.96,resist:'all',weak:null,skills:['organize','stabilize'],desc:'튀지 않아도 무너지지 않는 동료. 정리와 회복으로 긴 작업을 지탱한다.'}
  ];
  const skills = {
    layout:{name:'레이아웃 정리',kind:'guard',detail:'합의 +18 · 다음 피드백 소모를 줄인다.'},
    structure:{name:'문단 구조화',kind:'scope',detail:'진척 +8 · 3턴간 수정 요청을 예방한다.'},
    mood:{name:'무드 제안',kind:'boost',detail:'진척 +12 · 이후 제출의 진척량 +6.'},
    conceptColor:{name:'컬러 컨셉 강조',kind:'critical',detail:'이번 제안의 진척을 크게 높인다. 방향 변경에 주의.'},
    quick:{name:'빠른 수정 반영',kind:'quick',detail:'수정 요청 해제 · 진척 +22 · 컨디션 -10.'},
    output:{name:'즉시 출력',kind:'rush',detail:'큰 진척을 얻지만 3턴간 야근 상태가 된다.'},
    flow:{name:'사용자 흐름 정리',kind:'guard',detail:'합의 +18 · 다음 피드백 소모를 줄인다.'},
    logic:{name:'논리적 설명',kind:'cleanse',detail:'합의 +20 · 수정 요청·요구사항 변경 해제.'},
    results:{name:'성과 강조',kind:'boost',detail:'진척 +12 · 이후 제출의 진척량 +6.'},
    evidence:{name:'근거 제시',kind:'precision',detail:'합의 +14 · 이후 제출 명중률 +20%.'},
    emotion:{name:'감정 표현',kind:'guard',detail:'합의 +18 · 다음 피드백 소모를 줄인다.'},
    style:{name:'스타일 밀어붙이기',kind:'style',detail:'높은 진척 · 이후 제출 명중률 -10%.'},
    direction:{name:'방향성 설정',kind:'precision',detail:'합의 +14 · 이후 제출 명중률 +20%.'},
    scope:{name:'범위 정의',kind:'scope',detail:'진척 +8 · 3턴간 수정 요청을 예방한다.'},
    organize:{name:'전체 정리',kind:'organize',detail:'진척 +10 · 합의 +10 · 컨디션 +8.'},
    stabilize:{name:'안정 유지',kind:'heal',detail:'컨디션 +28 · 야근·일정 압박 해제.'}
  };
  const statuses = {
    revision:{name:'수정 요청',desc:'매 턴 컨디션이 5 감소합니다.'},
    pressure:{name:'일정 압박',desc:'작업 속도 보너스가 줄어듭니다.'},
    overtime:{name:'야근',desc:'제출 진척 +6, 매 턴 컨디션 -7.'},
    change:{name:'요구사항 변경',desc:'제출 명중률이 20% 감소합니다.'},
    burnout:{name:'번아웃 징후',desc:'낮은 컨디션에서 20% 확률로 제출을 쉬게 됩니다.'}
  };
  const feedback = {
    revision:{line:'“이 부분을 조금 더 다듬어볼 수 있을까요?”',impact:8},
    pressure:{line:'“오픈 날짜가 다가와서, 일정을 다시 확인하고 싶어요.”',impact:9},
    change:{line:'“생각해보니 다른 방향도 보고 싶어요.”',impact:10},
    calm:{line:'“방향이 이해됐어요. 다음 작업도 부탁드릴게요.”',impact:4}
  };
  const projects = [
    {id:'book',name:'책방의 첫 안내서',client:'책방지기 모아',tag:'편집',deadline:12,goal:55,reward:120,brief:'처음 오는 손님도 찾기 쉽게, 작은 책방의 안내서를 정리해 주세요.',need:'정보의 순서와 읽기 편한 구조',intro:'멋진 장식도 좋지만, 손님이 필요한 책을 찾을 수 있으면 좋겠어요.',pattern:['calm','revision','calm','pressure','revision','calm'],recruits:['wire','concept'],badge:'기준의 인장',color:'#dec69a'},
    {id:'cafe',name:'카페의 새로운 인사',client:'카페지기 루',tag:'감성',deadline:12,goal:60,reward:160,brief:'새로 여는 카페가 어떤 곳인지, 첫인상으로 전하고 싶어요.',need:'따뜻한 분위기와 선택의 이유',intro:'막연히 예쁘게 말고요. 사람들이 편하게 들어왔으면 좋겠어요.',pattern:['change','calm','revision','change','pressure','calm'],recruits:['draw','market'],badge:'소통의 인장',color:'#dca898'},
    {id:'guild',name:'함께 쓰는 동네 지도',client:'마을기획자 이음',tag:'UI/UX',deadline:13,goal:65,reward:220,brief:'서로 다른 사람들이 함께 쓸, 마을 안내 화면을 완성해 주세요.',need:'사용자 흐름·합의·지속 가능한 일정',intro:'모두의 의견이 조금씩 달라요. 어디까지 할지 함께 정하고 싶어요.',pattern:['pressure','change','revision','calm','change','pressure'],recruits:['typo','color','pixel','balance'],badge:'회복의 인장',color:'#b0c6bb'}
  ];
  const practice={id:'practice',name:'숲에서 만난 작은 의뢰',client:'여행 중인 편집자',tag:'편집',deadline:10,goal:40,reward:25,brief:'길을 헤매지 않도록 짧은 안내 카드를 같이 만들어봐요.',need:'간단한 정리와 설명',intro:'부담 갖지 말아요. 작은 작업으로 감을 찾아보죠.',pattern:['calm','revision','calm'],recruits:[],color:'#b7c59a'};
  function makeMap(id,w,h,base){return {id,w,h,tiles:Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>x===0||y===0||x===w-1||y===h-1?'t':base)),buildings:[],npcs:[],portals:[]};}
  function road(m,x,y,w,h){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)m.tiles[j][i]='p';}
  const town=makeMap('town',32,24,'.');town.name='시작의 마을';town.subtitle='작은 작업들이 모이는 곳';
  road(town,1,11,30,3);road(town,8,8,3,14);road(town,23,8,3,14);road(town,8,19,18,3);
  town.buildings=[{x:5,y:3,w:8,h:7,door:[9,9],name:'시작 스튜디오',color:'#d88d70'}, {x:20,y:3,w:8,h:7,door:[24,9],name:'쉼표 라운지',color:'#90b5a6'}, {x:20,y:15,w:8,h:6,door:[24,20],name:'클라이언트 공방',color:'#b8a2c7'}, {x:4,y:15,w:7,h:5,door:[8,19],name:'도구 상점',color:'#c6b879'}];
  town.npcs=[{id:'rest',name:'쉼표',x:23,y:11,look:1},{id:'shop',name:'도구지기',x:9,y:20,look:2},{id:'guide',name:'선배 디자이너',x:15,y:12,look:3}];
  town.portals=[{x:9,y:9,to:'studio',tx:10,ty:12},{x:24,y:20,to:'guild',tx:10,ty:12},{x:30,y:12,to:'field',tx:2,ty:12}];
  for(const [x,y] of [[2,5],[2,7],[16,4],[16,5],[16,7],[29,16],[29,18],[13,20],[15,20],[17,20]])town.tiles[y][x]='t';
  for(let y=15;y<18;y++)for(let x=13;x<17;x++)town.tiles[y][x]='w';
  const field=makeMap('field',32,24,'g');field.name='레퍼런스 숲';field.subtitle='정답보다 관점을 수집하는 길';road(field,1,11,30,3);road(field,14,3,3,19);
  for(let y=2;y<22;y++)for(let x=2;x<30;x++)if((x*7+y*11)%29<3&&!(y>=10&&y<=14)&&!(x>=13&&x<=17))field.tiles[y][x]='t';
  for(let y=3;y<8;y++)for(let x=23;x<29;x++)field.tiles[y][x]='w';
  field.portals=[{x:1,y:12,to:'town',tx:29,ty:12}];field.npcs=[{id:'practice',name:'여행 편집자',x:15,y:9,look:2},{id:'fieldGuide',name:'산책하는 디자이너',x:21,y:12,look:3}];
  const studio=makeMap('studio',20,15,'i');studio.name='시작 스튜디오';studio.subtitle='당신의 첫 번째 동료';
  for(let y=0;y<15;y++)for(let x=0;x<20;x++)if(x===0||y<2||x===19||y===14)studio.tiles[y][x]='b';
  studio.portals=[{x:10,y:13,to:'town',tx:9,ty:10}];studio.npcs=[{id:'mentor',name:'스튜디오의 기록자',x:10,y:5,look:0}];
  studio.furniture=[{x:3,y:3,w:3,h:2,kind:'shelf'},{x:14,y:3,w:3,h:2,kind:'shelf'},{x:5,y:8,w:3,h:2,kind:'desk'},{x:13,y:8,w:3,h:2,kind:'desk'}];
  const guild=makeMap('guild',20,15,'i');guild.name='클라이언트 공방';guild.subtitle='다른 언어를 함께 맞추는 곳';
  for(let y=0;y<15;y++)for(let x=0;x<20;x++)if(x===0||y<2||x===19||y===14)guild.tiles[y][x]='b';
  guild.portals=[{x:10,y:13,to:'town',tx:24,ty:21}];guild.npcs=projects.map((p,i)=>({id:p.id,name:p.client,x:5+i*5,y:5,look:4+i}));guild.furniture=[{x:3,y:3,w:3,h:1,kind:'desk'},{x:8,y:3,w:3,h:1,kind:'desk'},{x:13,y:3,w:3,h:1,kind:'desk'}];
  const maps={studio,town,field,guild};
  for(const m of Object.values(maps)){for(let y=1;y<m.h-1;y++)for(let x=1;x<m.w-1;x++)if(m.tiles[y][x]==='.'&&(x*13+y*7)%17===0)m.tiles[y][x]='f';}
  const data={mons,skills,statuses,feedback,projects,practice,maps,starters:['typo','color','pixel'],version:1};
  root.DesignmonData=data;if(typeof module!=='undefined')module.exports=data;
})(typeof globalThis!=='undefined'?globalThis:this);
