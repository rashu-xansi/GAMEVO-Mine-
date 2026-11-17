/* village.js — Blocky Village game logic (17 Nov 2026)
 * Split out of village.html so the browser can cache + pre-compile it.  Files:
 *   village-gfx.js     graphics modes SMOOTH / HIGH / ULTRA + auto governor   (loaded first)
 *   village-render.js  chunk-cached renderer, water, clouds, draw()          (loaded second)
 *   village-dict.js    translations (only loaded when the language is not English)
 *   village.js         this file: world, economy, NPCs, input, save
 */
window.addEventListener('error',function(e){var d=document.getElementById('err');d.style.display='block';d.textContent='⚠ '+e.message+' (line '+e.lineno+')'});
// ================= language: the mini app's 7 languages (en default · ar · ru · es · hi · zh · bn) =================
// Every visible text in the game is written in English in the code and goes through tt(); DICT maps it to [ar, ru, es, hi, zh, bn].
// A text with no entry simply stays English. The app sends its language with GAME_LANG (and it is also read from localStorage 'nt_lang').
let tut=0;   // new-player guide: 0 intro · 1 path · 2 house · 3 wait · 4 villager · 5 well · 6 shop · 7 outro · 99 done
const LANGS=['en','ar','ru','es','hi','zh','bn'];
let LANG=(()=>{try{const l=localStorage.getItem('nt_lang');return LANGS.includes(l)?l:'en'}catch(e){return 'en'}})();
let DICT=window.__DICT||{};
function loadDict(cb){if(window.__DICT){DICT=window.__DICT;cb&&cb();return}const e=document.createElement('script');e.src='village-dict.js?v=6';e.onload=()=>{DICT=window.__DICT||{};cb&&cb()};e.onerror=()=>{cb&&cb()};document.head.appendChild(e)}
const TTC=new Map();
function tt(s,...a){let r=s;if(LANG!=='en'&&s){r=TTC.get(s);if(r===undefined){const d=DICT[s];r=d&&d[LANGS.indexOf(LANG)-1]||s;TTC.set(s,r)}}return a.length?r.replace(/\{(\d+)\}/g,(m,i)=>a[i]):r}
const HINT=['🚶 Connect houses and shops with Paths, NPCs only walk on Paths.','🪙 Tap to collect coins · ❗ complaints · press and hold a house to move/rotate','🔄 Rotate the camera 360° with two fingers (also with the ⟲ ⟳ buttons)'];
function setHint(){const h=document.getElementById('hint');if(h)h.innerHTML=tut<99?'':HINT.map(x=>tt(x)).join('<br>')}
function applyLang(l){LANG=l;TTC.clear();document.documentElement.lang=l;document.documentElement.classList.toggle('rtl',l==='ar');try{setHint();refreshBar();subRow();statC='';renderStat();hud();tgRefresh()}catch(e){}}
function setGameLang(l){if(!LANGS.includes(l)||l===LANG)return;if(l!=='en'&&!window.__DICT){loadDict(()=>applyLang(l));return}applyLang(l)}
// ================= helpers =================
const WINTER=(m=>m>=10||m<=1)(new Date().getMonth());
const LS=k=>{try{return localStorage.getItem(k)}catch(e){return null}},LSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const nz=(x,y,k)=>{let h=Math.imul(x+101,374761393)^Math.imul(y+57,668265263)^Math.imul((k|0)+13,1103515245);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295};
const jit=(c,v,x,y,k)=>{const d=(nz(x,y,k)-.5)*v;return[c[0]+d,c[1]+d,c[2]+d]};
const mk16=f=>{const a=[];for(let y=0;y<16;y++)for(let x=0;x<16;x++)a.push(f(x,y));return a};
const flat=(h,v,k)=>{const c=hex(h);return mk16((x,y)=>jit(c,v||14,x,y,k||1))};
// ================= block ids =================
const GR=1,DIRT=2,STONE=3,COB=4,PLK=5,PLKD=6,LOG=7,LEAF=8,SAND=9,WAT=10,GLS=11,BRK=12,PATH=13,HAY=14,CRATE=15,BARREL=16,SHELF=17,PLAS=18,
WRED=19,WBLU=20,WYEL=21,WGRN=22,WORG=23,WWHT=24,ROOFR=25,PUMP=26,MEL=27,LAMP=28,WPUR=29,WPNK=30,DOOR=31,SBRK=32,ROOFB=33,ROOFG=34,ROOFD=35,ROOFO=36,GR2=37,LEAF2=38,PATH2=39,
G_FRUIT=40,G_VEG=41,G_FISH=42,G_BREAD=43,G_GEMS=44,G_POT=45,G_CLOTH=46,G_MEAT=47;
const TEX={};
function plankTex(base,dark){const b=hex(base),d=hex(dark);return mk16((x,y)=>{if(y%4==3)return jit(d,8,x,y,11);if(((x+(y>>2)*5)%9)==0)return jit([b[0]*.86,b[1]*.86,b[2]*.86],8,x,y,12);return jit(b,12,x,y,13)})}
function roofTex(h){const b=hex(h);return mk16((x,y)=>{const row=y>>2;if(y%4==3)return jit([b[0]*.62,b[1]*.62,b[2]*.62],6,x,y,31);if(((x+row*2)%4)==3)return jit([b[0]*.8,b[1]*.8,b[2]*.8],6,x,y,32);return jit(b,16,x,y,33)})}
function woolTex(h){const b=hex(h);return mk16((x,y)=>{const w=((x+y)&1)?0:-8;return jit([b[0]+w,b[1]+w,b[2]+w],10,x,y,34)})}
function goodsTex(cols){return mk16((x,y)=>{const cx=x>>2,cy=y>>2,lx=x&3,ly=y&3;if(lx<3&&ly<3&&!((lx==0||lx==2)&&(ly==0||ly==2)&&nz(cx,cy,50)>.4)){const c=cols[Math.floor(nz(cx,cy,51)*cols.length)];return jit(hex(c),14,x,y,52)}return jit(hex('#9a6a38'),10,x,y,53)})}
function build(){
 const SW=(a,b)=>WINTER?b:a;
 const grassTop=(v)=>mk16((x,y)=>{let c=hex(SW(v?'#7cc04a':'#69ae40',v?'#eef4f7':'#e3ecf1'));if(nz(x,y,2)>.8)c=hex(SW('#58993a','#cfdde6'));else if(nz(x,y,3)>.92)c=hex(SW('#93d25e','#fafdff'));return jit(c,10,x,y,4)});
 const dirt=mk16((x,y)=>{let c=hex('#8b5e3c');if(nz(x,y,8)>.8)c=hex('#74492b');else if(nz(x,y,9)>.92)c=hex('#a37550');return jit(c,8,x,y,10)});
 const grassSide=(v)=>mk16((x,y)=>{const e=3+(nz(x,0,5)>.5?1:0)+(nz(x,0,6)>.8?1:0);return y<e?jit(hex(SW(v?'#7cc04a':'#69ae40',v?'#eef4f7':'#e3ecf1')),12,x,y,7):dirt[y*16+x]});
 TEX[GR]={t:grassTop(0),s:grassSide(0)};TEX[GR2]={t:grassTop(1),s:grassSide(1)};
 TEX[DIRT]={t:dirt,s:dirt};
 const stone=mk16((x,y)=>{let c=hex('#8f8f8f');if(nz(x,y,14)>.8)c=hex('#777');else if(nz(x,y,15)>.9)c=hex('#a8a8a8');return jit(c,8,x,y,16)});
 TEX[STONE]={t:stone,s:stone};
 const cob=mk16((x,y)=>{const sx=(x+((y>>2)&1)*3)%6;if(y%4==0||sx==0)return jit(hex('#5f5f5f'),8,x,y,17);return jit(hex('#8c8c8c'),22,x,y,18)});
 TEX[COB]={t:cob,s:cob};
 const pl=plankTex('#b98c50','#8a6232');TEX[PLK]={t:pl,s:pl};
 const pd=plankTex('#7d5632','#563a20');TEX[PLKD]={t:pd,s:pd};
 TEX[LOG]={t:mk16((x,y)=>{const d=Math.hypot(x-7.5,y-7.5);if(d>7)return jit(hex('#5c4222'),8,x,y,19);return jit(hex(Math.floor(d)%3==0?'#8d6a38':'#b0884c'),8,x,y,20)}),
  s:mk16((x,y)=>jit(hex((x%4==0||x%7==3)?'#5c4222':'#6e5028'),10,x,y,21))};
 const leaf=(a,b,c)=>mk16((x,y)=>{const r=nz(x,y,22);return jit(hex(r>.72?a:r>.35?b:c),6,x,y,23)});
 TEX[LEAF]={t:leaf(...SW(['#2f7d2a','#3f9a34','#52b042'],['#8fae9c','#c3d8cf','#f2f8f8'])),s:leaf(...SW(['#2b7226','#389030','#4a9f3c'],['#86a593','#b9cfc5','#ecf5f5']))};
 TEX[LEAF2]={t:leaf(...SW(['#2a6a3a','#358046','#44965a'],['#7c9c92','#adc7c0','#e9f3f2'])),s:leaf(...SW(['#265f34','#2f7440','#3d8a50'],['#738f87','#a2bcb5','#e1eeed']))};
 const sand=flat('#e3d39b',12,24);TEX[SAND]={t:sand,s:sand};
 const wat=mk16((x,y)=>{const w=Math.sin((x+y*.7)*.9)+Math.sin(y*1.1+x*.3);return jit(hex(w>1.1?'#6fb2ee':'#3f86dc'),8,x,y,25)});TEX[WAT]={t:wat,s:wat};
 const gls=mk16((x,y)=>{if(x==0||y==0||x==15||y==15||x==7||x==8||y==7||y==8)return hex('#5a4630');if(x+y<9&&x>1&&y>1&&(x-y>-2&&x-y<2))return hex('#e8f6ff');return jit(hex('#8fc8e8'),8,x,y,26)});TEX[GLS]={t:gls,s:gls};
 const brk=mk16((x,y)=>{if(y%4==3||((x+((y>>2)&1)*4)%8)==7)return jit(hex('#c9c0b0'),6,x,y,27);return jit(hex('#a8493a'),22,x,y,28)});TEX[BRK]={t:brk,s:brk};
 const sbrk=mk16((x,y)=>{if(y%4==3||((x+((y>>2)&1)*4)%8)==7)return jit(hex('#6f6f6f'),6,x,y,29);return jit(hex('#a2a2a2'),18,x,y,30)});TEX[SBRK]={t:sbrk,s:sbrk};
 const path=mk16((x,y)=>{let c=hex('#c1a26c');if(nz(x,y,35)>.78)c=hex('#a88a58');else if(nz(x,y,36)>.9)c=hex('#d6bd8a');return jit(c,8,x,y,37)});TEX[PATH]={t:path,s:path};
 const path2=mk16((x,y)=>{let c=hex('#b89a64');if(nz(x,y,38)>.75)c=hex('#9e8350');else if(nz(x,y,39)>.9)c=hex('#cdb482');return jit(c,8,x,y,40)});TEX[PATH2]={t:path2,s:path2};
 TEX[HAY]={t:mk16((x,y)=>jit(hex((x+y)%5==0?'#c79a2a':'#e0b83e'),12,x,y,41)),s:mk16((x,y)=>{if(y==4||y==11)return hex('#7a5a2a');return jit(hex(x%3==0?'#c79a2a':'#e0b83e'),10,x,y,42)})};
 const crate=mk16((x,y)=>{if(x<2||y<2||x>13||y>13||Math.abs(x-y)<2||Math.abs(x+y-15)<2)return jit(hex('#8a5e2e'),8,x,y,43);return jit(hex('#c19552'),12,x,y,44)});TEX[CRATE]={t:crate,s:crate};
 TEX[BARREL]={t:mk16((x,y)=>{const d=Math.hypot(x-7.5,y-7.5);return d>7?hex('#555'):jit(hex(d>5?'#7a5028':'#8f6232'),8,x,y,45)}),s:mk16((x,y)=>{if(y==2||y==3||y==12||y==13)return jit(hex('#4a4a4a'),6,x,y,46);return jit(hex(x%4==0?'#6a4522':'#8f6232'),10,x,y,47)})};
 const bc=['#bb3333','#3388bb','#33aa33','#ccbb33','#8833bb','#ee8833'];
 TEX[SHELF]={t:pl,s:mk16((x,y)=>{if(y<2||y>13||(y>=6&&y<=8))return jit(hex('#b98c50'),10,x,y,48);return jit(hex(bc[(((x/3)|0)+(y<6?0:3))%6]),12,x,y,49)})};
 const plas=mk16((x,y)=>jit(hex('#eadfc6'),10,x,y,54));TEX[PLAS]={t:plas,s:plas};
 const W={[WRED]:'#d94a46',[WBLU]:'#4472d4',[WYEL]:'#f2c230',[WGRN]:'#52b04c',[WORG]:'#ee8a2b',[WWHT]:'#f3f0e8',[WPUR]:'#9150c8',[WPNK]:'#ee90b6'};
 for(const k in W){const t=woolTex(W[k]);TEX[k]={t:t,s:t}}
 const R={[ROOFR]:'#b0502e',[ROOFB]:'#456aa8',[ROOFG]:'#4f8f45',[ROOFD]:'#6b4a30',[ROOFO]:'#d9772a'};
 for(const k in R){const t=roofTex(R[k]);TEX[k]={t:t,s:t}}
 TEX[PUMP]={t:mk16((x,y)=>jit(hex(x%4==0?'#c8630f':'#e8851d'),10,x,y,55)),s:mk16((x,y)=>jit(hex(x%4==0?'#c8630f':(x%4==2?'#f0912a':'#e8851d')),8,x,y,56))};
 TEX[MEL]={t:mk16((x,y)=>jit(hex(x%4<2?'#2f8f3a':'#7cc24a'),8,x,y,57)),s:mk16((x,y)=>jit(hex(x%4<2?'#2f8f3a':'#7cc24a'),8,x,y,58))};
 const lamp=mk16((x,y)=>{let c=hex('#ffe9a0');if(nz(x,y,59)>.7)c=hex('#ffcf5a');if(x<1||y<1||x>14||y>14)c=hex('#a87a2a');return jit(c,10,x,y,60)});TEX[LAMP]={t:lamp,s:lamp};
 const door=mk16((x,y)=>{if(x<1||x>14||y<1)return hex('#3a2410');if(x==7||x==8)return hex('#3a2410');if(x==10&&(y==8||y==9))return hex('#f2c94c');const pn=(y>2&&y<7)||(y>8&&y<14);return jit(hex(pn?'#8a5a2e':'#6e4620'),8,x,y,61)});TEX[DOOR]={t:pd.slice(),s:door};
 const sideP=plankTex('#a67a42','#7a5430');
 const G={[G_FRUIT]:['#e03c31','#e03c31','#7bc043','#f2b632'],[G_VEG]:['#ee8a2b','#4aa84a','#8f5aa8','#f2d84a'],[G_FISH]:['#6f8fa8','#9ab6c8','#cfe0ea'],[G_BREAD]:['#c8863a','#e0a85a','#a86a2a'],[G_GEMS]:['#4fe3e0','#b57bff','#e0245e','#ffffff'],[G_POT]:['#c8602a','#e08a4a','#a84a22'],[G_CLOTH]:['#d94a46','#4472d4','#f2c230','#52b04c','#9150c8'],[G_MEAT]:['#d86a6a','#c04a4a','#e8a0a0']};
 for(const k in G)TEX[k]={t:goodsTex(G[k]),s:sideP};
}
build();
const ASPH=48,PARK=49;
{const a=mk16((x,y)=>jit(hex(nz(x,y,90)>.85?'#5a5d62':'#46494e'),8,x,y,91));TEX[ASPH]={t:a,s:a};
 const pk=mk16((x,y)=>{if(x<2||y<1)return hex('#e8e8e8');return jit(hex(nz(x,y,92)>.85?'#62656a':'#50535a'),8,x,y,93)});TEX[PARK]={t:pk,s:pk}}
const MINEH=50;TEX[MINEH]={t:flat('#120f0c',6,95),s:flat('#2a241c',6,96)};
// ================= texture canvases (any-angle renderer) =================
const TXC={};
function getTex(t,face,lvl,dark){const key=t*32+(face?1+lvl:0)*2+dark;let c=TXC[key];if(c)return c;
 const arr=face?TEX[t].s:TEX[t].t,k=face?(.6+.06*lvl):1;
 c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d'),img=g.createImageData(16,16),d=img.data;
 for(let i=0;i<256;i++){let r=arr[i][0]*k,gg=arr[i][1]*k,b=arr[i][2]*k;if(dark){r=r*.58+7.6;gg=gg*.58+9.2;b=b*.58+16.8}d[i*4]=r;d[i*4+1]=gg;d[i*4+2]=b;d[i*4+3]=255}
 g.putImageData(img,0,0);TXC[key]=c;return c}
const N=104,HM=14,B=new Uint8Array(N*N*HM);
let land=0;const LR=s=>10+3*s,LMAX=12,landReq=s=>Math.round(3.4*s),landCost=s=>Math.round(90*s*s*(1+s/4)+60),own=(x,z)=>{const r=LR(land);return Math.abs(x+.5-N/2)<=r&&Math.abs(z+.5-N/2)<=r},needP=new Map();
const ix=(x,y,z)=>(y*N+z)*N+x;
const inb=(x,z)=>x>=0&&z>=0&&x<N&&z<N;
const gt=(x,y,z)=>(!inb(x,z)||y<0||y>=HM)?0:B[ix(x,y,z)];
const st=(x,y,z,t)=>{if(!inb(x,z)||y<0||y>=HM)return;if(!STAMPING)markT(x,z);B[ix(x,y,z)]=t};
const fill=(x0,y0,z0,x1,y1,z1,t)=>{for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)st(x,y,z,t)};
const occ=new Uint8Array(N*N),furn=new Uint8Array(N*N),furnL=[],TEAP=4;const mark=(x0,z0,x1,z1,soft)=>{for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)if(inb(x,z)){const k=z*N+x;if(!soft)occ[k]=1;else if(!occ[k])occ[k]=2}};
let rs=20261112;const rnd=()=>{rs|=0;rs=rs+0x6D2B79F5|0;let t=Math.imul(rs^rs>>>15,1|rs);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const lights=[],rd=new Uint8Array(N*N);let dirtyW=false,STAMPING=false;
const WALLS=[
 {w:PLAS,c:LOG,r:ROOFR},{w:PLK,c:LOG,r:ROOFB},{w:BRK,c:COB,r:ROOFD},{w:COB,c:LOG,r:ROOFG},{w:PLAS,c:LOG,r:ROOFO},{w:WWHT,c:LOG,r:ROOFB},{w:PLK,c:LOG,r:ROOFR},{w:BRK,c:COB,r:ROOFG},{w:PLAS,c:LOG,r:ROOFD},{w:COB,c:LOG,r:ROOFR},{w:WWHT,c:LOG,r:ROOFO},{w:PLK,c:COB,r:ROOFG},{w:PLAS,c:LOG,r:ROOFB},{w:WBLU,c:COB,r:ROOFB},{w:BRK,c:COB,r:ROOFR},{w:WWHT,c:WRED,r:ROOFR},{w:WYEL,c:COB,r:ROOFD}];
function house(x0,z0,w,d,side,sty,hgt){
 hgt=hgt||3;const S=WALLS[sty%WALLS.length],x1=x0+w-1,z1=z0+d-1,top=1+hgt;
 fill(x0,1,z0,x1,1,z1,PLK);
 fill(x0,2,z0,x1,top,z1,S.w);
 if(w>2&&d>2)fill(x0+1,2,z0+1,x1-1,top,z1-1,0);
 for(let y=2;y<=top;y++){st(x0,y,z0,S.c);st(x1,y,z0,S.c);st(x0,y,z1,S.c);st(x1,y,z1,S.c)}
 // door position
 let dx,dz,ox,oz,nx,nz2;const cx=x0+((w-1)>>1),cz=z0+((d-1)>>1);
 if(side=='S'){dx=cx;dz=z1;ox=0;oz=1}else if(side=='N'){dx=cx;dz=z0;ox=0;oz=-1}else if(side=='E'){dx=x1;dz=cz;ox=1;oz=0}else{dx=x0;dz=cz;ox=-1;oz=0}
 st(dx,2,dz,DOOR);st(dx,3,dz,DOOR);
 // windows
 for(let x=x0+1;x<x1;x+=2){if(!(side=='N'&&x==dx))st(x,3,z0,GLS);if(!(side=='S'&&x==dx))st(x,3,z1,GLS)}
 for(let z=z0+1;z<z1;z+=2){if(!(side=='W'&&z==dz))st(x0,3,z,GLS);if(!(side=='E'&&z==dz))st(x1,3,z,GLS)}
 // door lantern
 const lx=dx+(ox?0:1),lz=dz+(oz?0:1);if(gt(lx,3,lz)&&gt(lx,3,lz)!=S.c)st(lx,3,lz,LAMP);
 // roof (hip roof with overhang)
 let k=0,ry=top+1;while(k<3){const a=x0-1+k,b=x1+1-k,c=z0-1+k,e=z1+1-k;if(a>b||c>e)break;fill(a,ry,c,b,ry,e,S.r);k++;ry++}
 const topY=ry-1;
 // chimney
 const chx=x1-1,chz=z0+1;fill(chx,top+1,chz,chx,topY+1,chz,COB);
 // path stub from door
 let px=dx+ox,pz=dz+oz;for(let i=0;i<3;i++){if(!inb(px,pz)||occ[pz*N+px]||gt(px,1,pz)==PATH||gt(px,1,pz)==PATH2||gt(px,1,pz)==ASPH||gt(px,1,pz)==COB||gt(px,1,pz)==STONE)break;st(px,1,pz,PATH);occ[pz*N+px]=2;px+=ox;pz+=oz}
 mark(x0-1,z0-1,x1+1,z1+1,1);if(ox||oz)mark(Math.min(x0-1,dx+ox*2),Math.min(z0-1,dz+oz*2),Math.max(x1+1,dx+ox*2),Math.max(z1+1,dz+oz*2),1);mark(x0,z0,x1,z1);
 return{door:[dx,dz],out:[dx+ox,dz+oz]}
}
const AWN=[[WRED,WWHT],[WBLU,WWHT],[WYEL,WWHT],[WGRN,WWHT],[WORG,WWHT],[WPUR,WWHT],[WPNK,WWHT],[WRED,WYEL]];
const GOODS=[G_FRUIT,G_VEG,G_BREAD,G_FISH,G_GEMS,G_POT,G_CLOTH,G_MEAT];
function stall(x0,cz,back,gi){// 2x2 small stall
 const aw=AWN[gi%AWN.length],gd=GOODS[gi%GOODS.length],mz=cz+back;
 for(let x=x0;x<=x0+1;x++){st(x,2,cz,gd);st(x,1,mz,(gt(x,1,mz)==COB||gt(x,1,mz)==STONE)?gt(x,1,mz):PLK)}
 st(x0,3,cz,LOG);st(x0+1,2,mz,(gi%2)?BARREL:CRATE);st(x0+1,3,mz,LOG);
 for(const z of [cz,mz])for(let x=x0;x<=x0+1;x++){st(x,4,z,((x-x0)%2==0)?aw[0]:aw[1]);occ[z*N+x]=1}
 return{mx:x0+.5,mz:mz+.5,fx:x0,fz:cz-back,color:aw[0]};
}
// table set: stool row, table row, stool row (2 wide). Table/stools are drawn as 3D props, seats let NPCs sit
function addSet(b,x0,za,zt,zb){const ss=[];furnL.push({k:'tbl',x:x0+1,z:zt+.5,seats:ss});
 for(const zs of[za,zb])for(let x=x0;x<=x0+1;x++){ss.push({x:x,z:zs,dx:0,dz:Math.sign(zt-zs),p:null,tea:b.t=='tea'?b:null});furnL.push({k:'stl',x:x+.5,z:zs+.5})}
 for(let x=x0;x<=x0+1;x++)furn[zt*N+x]=1;b.seats=ss}
function teaS(x0,z0,back,b){const zo=i=>back<0?z0+i:z0+4-i,mr=zo(0),cr=zo(1);
 for(let i=0;i<5;i++)for(let x=x0;x<=x0+1;x++)st(x,1,zo(i),PLK);
 st(x0,2,cr,SHELF);st(x0+1,2,cr,PLKD);st(x0+1,2,mr,COB);st(x0+1,3,mr,LAMP);st(x0,3,cr,LOG);
 for(const z of[mr,cr])for(let x=x0;x<=x0+1;x++)st(x,4,z,((x-x0+(z==mr?1:0))%2)?WWHT:WORG);
 addSet(b,x0,zo(2),zo(3),zo(4));mark(x0,z0,x0+1,z0+4);
 return{mx:x0+.5,mz:mr+.5,front:back<0?[x0,z0+5]:[x0,z0-1]}}

function tree(x,z,pine){const h=3+(nz(x,z,90)>.5?1:0);for(let y=2;y<2+h;y++)st(x,y,z,LOG);const L=pine?LEAF2:LEAF,ty=1+h;
 for(let dy=0;dy<3;dy++){const r=pine?(dy==0?2:1):(dy==2?1:2);
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(Math.abs(dx)==r&&Math.abs(dz)==r&&r>1&&nz(x+dx,z+dz,91+dy)<.45)continue;if(dx==0&&dz==0&&dy==0)continue;if(!gt(x+dx,ty+dy,z+dz)&&gt(x+dx,1,z+dz)!=WAT)st(x+dx,ty+dy,z+dz,L)}}
 st(x,ty+3,z,L);occ[z*N+x]=1}
function farm(x0,z0){for(let z=z0;z<z0+4;z++)for(let x=x0;x<x0+5;x++){if(x==x0||x==x0+4||z==z0||z==z0+3)st(x,2,z,PLK);else{st(x,1,z,DIRT);st(x,2,z,((x+z)%3==0)?PUMP:((x+z)%3==1)?MEL:0)}}st(x0+2,2,z0+3,0);st(x0+2,1,z0+3,PATH);st(x0+2,1,z0+4,PATH);st(x0+4,2,z0+4,HAY)}
function fount(x0,z0){for(let z=z0;z<z0+4;z++)for(let x=x0;x<x0+4;x++){if(x==x0||x==x0+3||z==z0||z==z0+3){st(x,1,z,((x+z)&1)?COB:STONE);st(x,2,z,STONE)}else st(x,1,z,WAT)}st(x0+1,2,z0+1,STONE);st(x0+1,3,z0+1,STONE);st(x0+1,4,z0+1,LAMP)}
// ================= state =================
let coins=600,rep=50,day=1,gen=0,rate=0,uid=1,facing=0,shopG=0,tool=null,pend=null;
let xp=0,level=1,rline=null,gm=0;let bl=[],trees=[],roads=new Set(),mains=new Set(),cars=[],treeCut=0,sel=null,mv=null,chickens=[];const people=[];
const TOP=new Int8Array(N*N),DECT=new Map(),FNC=new Map(),DEC=[],walk=new Uint8Array(N*N),cwalk=new Uint8Array(N*N),accg=new Uint8Array(N*N),cost=new Float32Array(N*N);
const grd=(x,z)=>(x<2||z<2||x>N-3||z>N-3)?SAND:(nz(x,z,70)>.72?GR2:GR);let decBudget=1;
const topY=(x,z)=>{for(let y=HM-1;y>=0;y--)if(B[ix(x,y,z)])return y;return -1};
const WALKT=new Set([PATH,PATH2,COB,STONE,PLK,ASPH,PARK]);
const GN=[['🍎','Fruit',8],['🥕','Veg',6],['🍞','Bread',5],['🐟','Fish',9],['💎','Gems',40],['🏺','Pottery',14],['🧵','Cloth',18],['🥩','Meat',12]];
const CAT=[{id:'road',e:'🚶',n:'Path',c:2,w:1,d:1,paint:1,rt:1},{id:'main',e:'🛣️',n:'Road',c:6,w:1,d:1,paint:1,rt:2},{id:'dmain',e:'🛤️',n:'Double Rd',c:6,w:1,d:1,paint:1,rt:2,wide:1},{id:'park',e:'🅿️',n:'Parking',c:60,w:3,d:2},{id:'h4',e:'🏠',n:'House',c:120,w:3,d:3,res:2},{id:'h6',e:'🏡',n:'Big House',c:280,w:5,d:5,res:4},{id:'shop',e:'🏪',n:'Shop',c:90,w:2,d:2},{id:'tea',e:'🍵',n:'Cha Dokan',c:110,w:2,d:5},{id:'table',e:'🪑',n:'Table',c:30,w:2,d:3},{id:'well',e:'💧',n:'Well',c:40,w:2,d:2,wcap:4,wr:14},{id:'pole',e:'⚡',n:'Power Pole',c:60,w:1,d:1,pcap:6,pr:12},{id:'fence',e:'🕸',n:'Fence',c:4,w:1,d:1,one:1},{id:'farm',e:'🌾',n:'Farm',c:150,w:5,d:5},{id:'dock',e:'🎣',n:'Pier',c:40,w:3,d:2},{id:'fount',e:'⛲',n:'Fountain',c:220,w:4,d:4},{id:'cfarm',e:'🐔',n:'Chicken',c:200,w:5,d:5,pen:1,wk:1},{id:'gfarm',e:'🐐',n:'Goat',c:320,w:5,d:5,pen:1,wk:1},{id:'mine',e:'⛏️',n:'Mine',c:250,w:5,d:5,pen:1,wk:1},{id:'ffarm',e:'🐟',n:'FishFarm',c:420,w:5,d:5,pen:1,wk:1},{id:'police',e:'🚓',n:'Police',c:700,w:4,d:4,hs:1,sty:13},{id:'gas',e:'⛽',n:'Gas',c:800,w:4,d:4,hs:1,sty:16,inc:10},{id:'fire',e:'🚒',n:'FireStn',c:900,w:4,d:4,hs:1,sty:14},{id:'hosp',e:'🏥',n:'Hospital',c:1200,w:6,d:6,hs:1,sty:15},{id:'bus',e:'🚌',n:'BusStn',c:900,w:5,d:4},{id:'school',e:'🏫',n:'School',c:1500,w:6,d:5,hs:1,sty:5,wk:1,inc:8},{id:'camp',e:'🔥',n:'Campfire',c:150,w:3,d:3},{id:'port',e:'⚓',n:'Port',c:2500,w:5,d:3},{id:'lamp',e:'💡',n:'Lamp',c:15,w:1,d:1,one:1},{id:'bench',e:'🪑',n:'Bench',c:10,w:1,d:1,one:1},{id:'tree',e:'🌳',n:'Tree',c:5,w:1,d:1,one:1},{id:'dozer',e:'🚜',n:'Dozer',c:0,w:1,d:1,paint:1}];
CAT.forEach(i=>{i.n0=i.n;Object.defineProperty(i,'n',{get(){return tt(i.n0)},configurable:true})});   // item names follow the language
const LVL={road:1,main:3,park:6,h4:1,h6:8,shop:1,tea:1,table:1,farm:4,dock:5,fount:9,lamp:3,bench:3,tree:1,dozer:1,cfarm:7,gfarm:11,mine:1,ffarm:15,police:17,gas:19,fire:21,hosp:24,port:22,camp:5,dmain:12,bus:16,school:18};const ITEM={};CAT.forEach(i=>{i.lv=LVL[i.id]||1;ITEM[i.id]=i});
const isH=it=>it.id=='h4'||it.id=='h6'||it.hs;
function tileUpd(x,z){const k=z*N+x,ty=topY(x,z),t=ty>=0?B[ix(x,ty,z)]:0;TOP[k]=Math.max(1,ty);const edge=(x==0||z==0||x==N-1||z==N-1),ok=ty==1&&!edge&&!furn[k]&&(WALKT.has(t)||(accg[k]&&(t==GR||t==GR2||t==SAND)));walk[k]=ok?1:0;cwalk[k]=(ty==1&&!edge&&(t==GR||t==GR2||t==SAND||t==DIRT||t==PATH||t==PATH2))?1:0;cost[k]=t==ASPH?1.3:t==PARK?1.2:(t==PATH||t==PATH2||t==COB||t==STONE)?1:2.6}
function stampB(b){const it=ITEM[b.t],x=b.x,z=b.z;
 if(isH(it)){const i=house(x,z,it.w,it.d,'SWNE'[b.f%4],it.sty!==undefined?it.sty:b.s,3);b.out=i.out;b.front=i.out;b.cx=x+it.w/2;b.cz=z+it.d/2;b.ih=7.5;b.cap=40}
 else if(it.pen){pen(x,z,b.t);mark
