(function(root){
  'use strict';
  const D=root.DesignmonData,cache={};
  const shapes={
    typo:['................','....aaaaaaa.....','...abbbbbba.....','...abccccba.....','...abbbbbba.....','...abccccba.....','...abbdbdba.....','...abbbbbba.....','..aabccccbaa....','..aabbbbbbaa....','...abbbbbba.....','...aaaaaaa......','....ee.ee.......','...eee.eee......','................','................'],
    color:['......cc........','...ccccc.cc.....','..cbbbbbbc......','.cbbebbbbbc.....','.cbbbbbbbbbc....','cbbddbbddbbc....','cbbbbbbbbbbc....','.cbbbbbbbcc.....','..cbebebbc......','...cbbbbc.......','....cccc........','...a....a.......','..aaa..aaa......','................','................','................'],
    pixel:['......aa........','......ae........','...aaaaaaaa.....','..abbbbbbbba....','..abccccccba....','..abcdcdccba....','..abccccccba....','..abbbebbbba....','aaabbbbbbbbaaa..','a..aaaaaaa...a..','....bb..bb......','...aab..baa.....','..aaaa..aaaa....','................','................','................'],
    wire:['...a.......a....','..abaaaaaaba....','..abbbbbbbba....','..abccccccba....','..abcdccd cba...','..abccccccba....','...abeeeeba.....','....abbbba......','...acaaaaca.....','..acbbbbbbca....','..acbbccbbca....','...aaaaaaa......','....aa.aa.......','...aaa.aaa......','................','................'],
    market:['........aaa.....','.....aaabca.....','..aaabbbbca.....','.abbbbbbbca.....','.abddbdbbca.....','.abbbbbbbca.....','..aaaaabbca.....','....abbbaca.....','...abebbaaa.....','...abbba........','....aaa.........','...aa.aa........','..aaa.aaa.......','................','................','................'],
    draw:['......a.........','.....aba........','....abbba.......','....aaaaa.......','....accca.......','...accccca......','..acbccbcca.....','..acdccdcca.....','..accccccca.....','...accecca......','....accca.......','...acaaaca......','...aa...aa......','..aaa...aaa.....','................','................'],
    concept:['.....aaaa.......','...aabbbbaa.....','..abbbbbbbba....','..abebbbebba....','..abdbbbdbba....','..abbbbbbbba....','...abbebba......','...abbbbba......','....accca.......','....accca.......','....aaaaa.......','...aa...aa......','..aaa...aaa.....','................','................','................'],
    balance:['.......a........','...aaaaaaaaa....','..abbbbabbbba...','..abbaaaaabba...','...aaabaaa......','...accbccca.....','..accbd bcca....','..acccccc ca....','...acccc ca.....','....aaaaa.......','...aaaaaaa......','..abbbbbbbba....','..aaaaaaaaaa....','................','................','................']
  };
  function sprite(id){if(cache[id])return cache[id];const m=D.mons.find(m=>m.id===id),c=document.createElement('canvas');c.width=16;c.height=16;const ctx=c.getContext('2d'),pal={a:'#202828',b:m.color,c:'#f8f8e8',d:'#202828',e:m.color};shapes[id].forEach((row,y)=>[...row.padEnd(16,'.').slice(0,16)].forEach((p,x)=>{if(pal[p]){ctx.fillStyle=pal[p];ctx.fillRect(x,y,1,1);}}));return cache[id]=c;}
  function icon(id){return sprite(id).toDataURL();}
  function mon(ctx,id,x,y,size=24,flip=false,time=0){ctx.save();ctx.translate(Math.round(x),Math.round(y));if(flip)ctx.scale(-1,1);ctx.imageSmoothingEnabled=false;ctx.drawImage(sprite(id),-size/2,-size,size,size);ctx.restore();}
  // Original pixel art: opaque four-colour palettes, aligned to the 16px tile grid.
  const INK='#202828',WHITE='#f8f8e8',GREEN='#70b848',DARK='#387838';
  function stamp(ctx,rows,pal,x,y){rows.forEach((row,j)=>[...row].forEach((c,i)=>{if(pal[c]){ctx.fillStyle=pal[c];ctx.fillRect(x+i,y+j,1,1);}}));}
  function person(ctx,x,y,dir='down',look=0,step=0){
    const coats=['#d85838','#48a880','#e8a838','#7070c8','#c878a8','#58a8c0','#a87840'];
    const front=['.....kkkkkk.....','....kcccccck....','...kcccccccck...','...kccwwwwcck...','...kkkkkkkkkk...','....kwkwkwk.....','....kwwwwwk.....','.....kwwwk......','....kkccckk.....','...kwkccckwk....','...kwkccckwk....','....kccccck.....','....kkkkkkk.....','.....kk.kk......','....kkk.kkk.....','................'];
    const back=['.....kkkkkk.....','....kcccccck....','...kcccccccck...','...kcccccccck...','...kkcccccckk...','....kkkkkkk.....','....kwwwwwk.....','.....kwwwk......','....kkccckk.....','...kwkccckwk....','...kwkccckwk....','....kccccck.....','....kkkkkkk.....','.....kk.kk......','....kkk.kkk.....','................'];
    const side=['.....kkkkk......','....kccccck.....','...kccccccck....','...kcccccccck...','...kkkkkkkkkk...','....kwwwkwk.....','....kwwwwwk.....','.....kwwwk......','.....kccck......','....kccwcck.....','....kccwwck.....','....kccccck.....','.....kkkkk......','.....kk.kk......','....kkk.kkk.....','................'];
    const rows=(dir==='up'?back:dir==='down'?front:side).slice();if(step){rows[13]='....kk...kk.....';rows[14]='...kkk...kkk....';}
    ctx.save();ctx.translate(Math.round(x)-8,Math.round(y)-14);if(dir==='left'){ctx.translate(16,0);ctx.scale(-1,1);}stamp(ctx,rows,{k:INK,c:coats[look%7],w:WHITE},0,0);ctx.restore();
  }
  function portrait(id){const c=document.createElement('canvas');c.width=40;c.height=40;const k=c.getContext('2d');k.scale(2,2);person(k,10,17,'down',({book:4,cafe:5,guild:6,practice:2})[id]||0);return c.toDataURL();}
  function backIcon(id){const c=document.createElement('canvas');c.width=c.height=16;const k=c.getContext('2d'),m=D.mons.find(m=>m.id===id);stamp(k,shapes[id].map(r=>r.replaceAll('d','b').replaceAll('e','b')),{a:INK,b:m.color,c:WHITE},0,0);return c.toDataURL();}
  function tree(ctx,x,y){stamp(ctx,[
    '......kkkk......','.....kllllk.....','....klgllglk....','...klgggggglk...','..klgglgglgglk..','..kggggggggggk..','.klgggglggggglk.','.kgglgggggglggk.','klgggggggggggglk','kgggglgggglggggk','kgglgggggggglggk','.kggggggggggggk.','.kggglgggglgggk.','..kggggggggggk..','...kkkkkkkkkk...','.....kggggk.....','.....kggggk.....','....kkkkkkkk....'
  ],{k:INK,l:'#b8e080',g:GREEN},x,y-3);}
  function building(ctx,b){const x=b.x*16,y=b.y*16,w=b.w*16,h=b.h*16,f=(c,a,z,ww,hh)=>{ctx.fillStyle=c;ctx.fillRect(x+a,y+z,ww,hh);};
    const roof=b.name.includes('공방')?'#9080c8':b.name.includes('라운지')?'#58a8a0':b.name.includes('상점')?'#d8a840':'#d86848';
    f(INK,0,0,w,h);f(WHITE,2,2,w-4,h-4);f('#c8c8a8',2,36,w-4,h-38);
    for(let yy=38;yy<h-8;yy+=8){f('#989878',2,yy,w-4,1);for(let xx=2+(yy%16?8:0);xx<w-3;xx+=16)f('#989878',xx,yy,1,8);}
    f(INK,0,0,w,35);f(roof,2,2,w-4,29);
    for(let yy=3;yy<30;yy+=6){f(INK,2,yy+4,w-4,1);for(let xx=2+(yy%12?4:0);xx<w-3;xx+=8){f(WHITE,xx,yy,5,1);f(INK,xx+6,yy,1,4);}}
    f(WHITE,0,33,w,2);f(INK,0,35,w,2);
    for(const xx of [12,w-28]){f(INK,xx,43,16,19);f(WHITE,xx+1,44,14,16);f('#68a8b8',xx+3,46,10,12);f(WHITE,xx+7,45,2,14);f(WHITE,xx+2,51,12,2);f(INK,xx-1,62,18,2);}
    const dx=b.door[0]*16-x;f(INK,dx-1,h-23,18,23);f('#907048',dx+1,h-21,14,20);f(WHITE,dx+3,h-19,10,1);f(INK,dx+11,h-11,2,2);f(WHITE,dx-2,h-2,20,2);
    // A pictographic sign stays crisp without rasterising vector text into tiny tiles.
    f(INK,dx+23,h-20,13,12);f(WHITE,dx+24,h-19,11,10);f(INK,dx+26,h-16,7,1);f(INK,dx+26,h-13,5,1);
  }
  function world(ctx,state,cam,time){const m=D.maps[state.map];ctx.fillStyle='#202828';ctx.fillRect(0,0,160,144);ctx.save();ctx.translate(-Math.round(cam.x),-Math.round(cam.y));for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){const t=m.tiles[y][x],xx=x*16,yy=y*16;ctx.fillStyle=t==='i'?'#f8e8b0':t==='p'?'#f8f0c8':t==='w'?'#5898e0':t==='b'?'#686858':'#c8e898';ctx.fillRect(xx,yy,16,16);if(t==='p'){ctx.fillStyle='#b8b080';ctx.fillRect(xx+(x*7+y)%13,yy+(y*3+x)%14,2,1);}if(t==='i'){ctx.fillStyle='#d0b878';ctx.fillRect(xx,yy+15,16,1);ctx.fillRect(xx+((y%2)*8),yy,1,16);}if(t==='w'){ctx.fillStyle='#e8f8f8';ctx.fillRect(xx+((Math.floor(time/700)+x*3)%10),yy+6,6,1);ctx.fillStyle='#3868b0';ctx.fillRect(xx,yy+15,16,1);}if(t==='g'){ctx.fillStyle='#58a840';ctx.fillRect(xx+3,yy+10,1,3);ctx.fillRect(xx+2,yy+9,1,2);ctx.fillRect(xx+10,yy+5,1,3);}if(t==='f'){ctx.fillStyle='#58a840';ctx.fillRect(xx+7,yy+7,1,5);ctx.fillStyle=(x+y)%2?'#f8e860':'#e87878';ctx.fillRect(xx+5,yy+6,5,3);ctx.fillStyle='#efeee0';ctx.fillRect(xx+7,yy+5,1,5);}}
    for(const b of m.buildings)building(ctx,b);
    for(const b of m.furniture||[]){ctx.fillStyle='#776647';ctx.fillRect(b.x*16,b.y*16,b.w*16,b.h*16);ctx.fillStyle='#b49363';ctx.fillRect(b.x*16+2,b.y*16+2,b.w*16-4,b.h*16-5);if(b.kind==='shelf'){for(let i=4;i<b.w*16-4;i+=6){ctx.fillStyle=['#72988f','#b77761','#d5bd7c'][i%3];ctx.fillRect(b.x*16+i,b.y*16+4,4,12);ctx.fillRect(b.x*16+i,b.y*16+20,4,8);}}else{ctx.fillStyle='#f0e9d2';ctx.fillRect(b.x*16+8,b.y*16+4,15,9);ctx.fillStyle='#628780';ctx.fillRect(b.x*16+b.w*16-12,b.y*16+4,6,6);}}
    for(const p of m.portals){ctx.fillStyle='#f4df9c';ctx.globalAlpha=1;ctx.fillRect(p.x*16+3,p.y*16+11,10,3);ctx.globalAlpha=1;}
    const objects=[];for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++)if(m.tiles[y][x]==='t')objects.push({y:y*16+12,draw:()=>tree(ctx,x*16,y*16)});
    for(const n of m.npcs)objects.push({y:n.y*16+12,draw:()=>{person(ctx,n.x*16+8,n.y*16+12,'down',n.look);if(Math.abs(state.x-n.x)+Math.abs(state.y-n.y)<=2){stamp(ctx,['kkkkk','kwwwk','kwkwk','kwkwk','kwwwk','kwkwk','kkkkk'],{k:INK,w:WHITE},n.x*16+6,n.y*16-13);}}});
    objects.push({y:state.y*16+12,draw:()=>person(ctx,state.x*16+8,state.y*16+12,state.dir,0,Math.floor(time/170)%2&&state.walking)});
    if(state.team.length)objects.push({y:state.y*16+18,draw:()=>mon(ctx,state.team[0],state.x*16-3,state.y*16+20,14,false,time)});
    objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());ctx.restore();
  }
  root.DesignmonArt={sprite,icon,backIcon,portrait,mon,person,world};
})(globalThis);
