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
 else if(it.pen){pen(x,z,b.t);mark(x,z,x+4,z+4);b.front=[x+2,z+4];b.out=b.front;b.cx=x+2.5;b.cz=z+2;b.ih=4;b.cap=b.t=='mine'?0:40}
 else if(b.t=='shop'){const back=b.f%2?1:-1,r=stall(x,back<0?z+1:z,back,b.g);b.mx=r.mx;b.mz=r.mz;b.front=[r.fx,r.fz];b.cx=r.mx;b.cz=r.mz;b.color=r.color;b.ih=5.9;b.cap=60}
 else if(b.t=='tea'){const back=b.f%2?1:-1,r=teaS(x,z,back,b);b.mx=r.mx;b.mz=r.mz;b.front=r.front;mark(r.front[0],r.front[1],r.front[0],r.front[1],1);b.cx=x+1;b.cz=z+2.5;b.color='#e8872b';b.ih=5.9;b.cap=60}
  else if(b.t=='table'){addSet(b,x,z,z+1,z+2);mark(x,z,x+1,z+2);b.front=[x,z+3];b.cx=x+1;b.cz=z+1.5;b.ih=3;b.cap=0}
  else if(b.t=='farm'){farm(x,z);mark(x,z,x+4,z+4);b.front=[x+2,z+4];b.cx=x+2.5;b.cz=z+2;b.ih=4;b.cap=40}
 else if(b.t=='fount'){fount(x,z);mark(x,z,x+3,z+3);b.cx=x+2;b.cz=z+2;b.ih=4;b.cap=0}
 else if(b.t=='dock'||b.t=='port'){const w=it.w,d=it.d;fill(x,1,z,x+w-1,1,z+d-1,PLK);for(const cx of[x,x+w-1])for(const cz of[z,z+d-1])st(cx,2,cz,LOG);if(b.t=='port'){st(x+1,2,z+1,CRATE);st(x+3,2,z+1,BARREL)}mark(x,z,x+w-1,z+d-1);let bd=1e9;for(let zz=z;zz<z+d;zz++){const m=Math.min(x+(w>>1),N-2-x,zz,N-1-zz);if(m<bd){bd=m;b.front=[x+(w>>1),zz]}}b.fd=edgeDir(b.front[0],b.front[1]);b.cx=x+w/2;b.cz=z+d/2;b.ih=3.6;b.cap=b.t=='port'?60:40}
 else if(b.t=='park'){fill(x,1,z,x+it.w-1,1,z+it.d-1,PARK);mark(x,z,x+it.w-1,z+it.d-1);b.cx=x+1.5;b.cz=z+1;b.ih=3;b.cap=40;const old=b.bays||[];b.bays=[];for(let zz=z;zz<z+it.d;zz++)for(let xx=x;xx<x+it.w;xx++)if(D4.some(q=>inb(xx+q[0],zz+q[1])&&rd[(zz+q[1])*N+xx+q[0]]==2))b.bays.push(old.find(o=>o.x==xx&&o.z==zz)||{x:xx,z:zz,car:null})}
 else if(b.t=='camp'){st(x+1,1,z+1,COB);st(x+1,2,z+1,LAMP);st(x,2,z+1,LOG);st(x+2,2,z+1,LOG);mark(x,z,x+2,z+2);b.front=[x+1,z+3];b.spots=[[x+1,z],[x+1,z+2],[x,z],[x+2,z+2],[x,z+2],[x+2,z]];b.cx=x+1.5;b.cz=z+1.5;b.ih=3;b.cap=0}
 else if(b.t=='bus'){fill(x,1,z,x+4,1,z+2,PLK);for(const cx of[x,x+4])for(const cz of[z,z+2])fill(cx,2,cz,cx,3,cz,LOG);fill(x,4,z,x+4,4,z+2,PLKD);mark(x,z,x+4,z+3);b.front=[x+2,z+3];b.cx=x+2.5;b.cz=z+1.5;b.ih=5;b.cap=60}
 else if(b.t=='fence'){mark(x,z,x,z);FNC.set(z*N+x,{x:x+.5,z:z+.5});b.cx=x+.5;b.cz=z+.5;b.ih=2.6;b.cap=0}
 else if(b.t=='well'){st(x,1,z,COB);st(x+1,1,z,COB);st(x,1,z+1,COB);st(x+1,1,z+1,WAT);st(x,2,z,STONE);st(x+1,2,z,STONE);st(x,2,z+1,STONE);st(x,3,z,LOG);st(x+1,3,z,LOG);st(x,4,z,PLKD);st(x+1,4,z,PLKD);mark(x,z,x+1,z+1);b.cx=x+1;b.cz=z+1;b.ih=4.5;b.cap=0}
 else if(b.t=='pole'){st(x,2,z,STONE);st(x,3,z,LOG);st(x,4,z,LOG);st(x,5,z,LOG);st(x,6,z,GLS);mark(x,z,x,z);b.cx=x+.5;b.cz=z+.5;b.ih=6.5;b.cap=0}
 else if(b.t=='lamp'){st(x,2,z,COB);st(x,3,z,COB);st(x,4,z,LAMP);mark(x,z,x,z);b.cap=0}
 else{st(x,2,z,PLK);mark(x,z,x,z);b.cap=0}}
// stampAll() rebuilds the whole block world from the lists; to keep redraws small the old world is remembered and only the tiles that
// really changed mark their chunk dirty (so a new house redraws 1-2 chunks, not the island).
const SB=new Uint8Array(N*N*HM),SO=new Uint8Array(N*N),SF=new Uint8Array(N*N);
function snapWorld(){SB.set(B);SO.set(occ);SF.fill(0);FNC.forEach((v,k)=>{SF[k]=1})}
function diffWorld(){const n2=N*N;for(let y=0;y<HM;y++){const o=y*n2;for(let k=0;k<n2;k++)if(B[o+k]!==SB[o+k])markT(k%N,(k/N)|0)}for(let k=0;k<n2;k++)if(occ[k]!==SO[k]||(FNC.has(k)?1:0)!==SF[k])markT(k%N,(k/N)|0)}
function stampAll(){
 snapWorld();STAMPING=true;B.fill(0);occ.fill(0);rd.fill(0);furn.fill(0);furnL.length=0;FNC.clear();
 for(let x=0;x<N;x++)for(let z=0;z<N;z++){st(x,0,z,DIRT);st(x,1,z,grd(x,z))}
 roads.forEach(k=>{const x=k%N,z=(k/N)|0;st(x,1,z,(x+z)%7==0?PATH2:PATH);rd[k]=1});
 mains.forEach(k=>{const x=k%N,z=(k/N)|0;st(x,1,z,ASPH);rd[k]=2});
 for(const t of trees)tree(t[0],t[1],t[2]);
 for(const b of bl)stampB(b);
 for(const b of bl)if(b.t=='table'&&b.seats){let best=null,bd=99;for(const t of bl)if(t.t=='tea'){const d=Math.max(Math.abs(t.x-b.x),Math.abs(t.z+2-(b.z+1)));if(d<bd){bd=d;best=t}}for(const q of b.seats)q.tea=best}
 for(const p of people)if(p.merch){p.x=p.stall.mx;p.z=p.stall.mz}
 accg.fill(0);for(const b of bl){const it=ITEM[b.t];if(!b.front)continue;if(isH(it)||b.t=='shop'||b.t=='tea'||b.t=='table'||it.pen||b.t=='farm'||b.t=='camp'||b.t=='bus'){accg[b.front[1]*N+b.front[0]]=1;const RR=b.t=='tea'?3:1;if(b.t!='farm')for(let zz=b.z-RR;zz<=b.z+it.d-1+RR;zz++)for(let xx=b.x-RR;xx<=b.x+it.w-1+RR;xx++)if(inb(xx,zz))accg[zz*N+xx]=1}}
 STAMPING=false;diffWorld();refresh()}
function refresh(){
 DECT.clear();DEC.length=0;lights.length=0;for(const p of people){p.sit=false;p.seat=null}
 for(let x=0;x<N;x++)for(let z=0;z<N;z++){const k=z*N+x;tileUpd(x,z);const t=gt(x,1,z);
  if((t==GR||t==GR2)&&!gt(x,2,z)&&!occ[k]&&nz(x,z,80)<.2){const d={x:x+.2+nz(x,z,81)*.6,z:z+.2+nz(x,z,82)*.6,k:Math.floor(nz(x,z,83)*6)};DEC.push(d);if(!DECT.has(k))DECT.set(k,[]);DECT.get(k).push(d)}}
 for(let y=2;y<=9;y++)for(let z=0;z<N;z++)for(let x=0;x<N;x++){const t=B[ix(x,y,z)];if(t==LAMP)lights.push({x:x+.5,z:z+.5,h:y+.5,big:1});else if(t==GLS)lights.push({x:x+.5,z:z+.5,h:y+.5,big:0})}
 for(const p of people)if(!p.hidden&&!p.merch){const sx=Math.floor(p.x),sz=Math.floor(p.z);if(!walk[sz*N+sx]){const n=nearestWalk(sx,sz);p.x=n[0]+.5;p.z=n[1]+.5}p.path=null;p.state='idle';p.t=.5;p.task=null;p.going=false}}
// ================= placement =================
function okRect(x0,z0,x1,z1,strict,noOwn){for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){if(x<1||z<1||x>N-2||z>N-2)return false;if(!noOwn&&!own(x,z))return false;const k=z*N+x;if(occ[k]||(strict&&rd[k]))return false}return true}
function frontOf(it,x0,z0,f){if(isH(it)){const cx=x0+((it.w-1)>>1),cz=z0+((it.d-1)>>1),s=f%4;return s==0?[cx,z0+it.d]:s==2?[cx,z0-1]:s==3?[x0+it.w,cz]:[x0-1,cz]}
 if(it.id=='shop')return f%2?[x0,z0-1]:[x0,z0+2];if(it.id=='tea')return f%2?[x0,z0-1]:[x0,z0+5];if(it.id=='farm'||it.pen)return[x0+2,z0+4];return null}
function tileWhy(x,z,o){if(x<1||z<1||x>N-2||z>N-2)return tt('🌊 Water / outside the map');
 if(!o.noOwn&&!own(x,z))return tt('🔒 Land not bought (buy Land)');
 const k=z*N+x;if(occ[k]==1)return trees.some(t=>t[0]==x&&t[1]==z)?tt('🌳 A tree is here (cut it with 🚜)'):tt('🏠 Something is already here');
 if(o.strict&&rd[k])return tt('🛣 There is a road/Path here');
 if(o.hard&&occ[k]==2)return tt('🟫 Empty space in front of the door');return ''}
function blockers(it,x0,z0,f){const r=[],dk=it.id=='dock'||it.id=='port',add=(x,z,o)=>{const w=tileWhy(x,z,o);if(w)r.push({x:x,z:z,w:w})};
 for(let z=z0;z<z0+it.d;z++)for(let x=x0;x<x0+it.w;x++)add(x,z,{strict:1,hard:!it.one,noOwn:dk});
 if(isH(it)){for(let z=z0-1;z<=z0+it.d;z++)for(let x=x0-1;x<=x0+it.w;x++)if(x<x0||x>=x0+it.w||z<z0||z>=z0+it.d)add(x,z,{noOwn:1})}
 else if(dk){if(!(x0<=5||z0<=5||x0+it.w>=N-5||z0+it.d>=N-5))r.push({x:x0,z:z0,w:tt('🌊 Place it by the water')})}
 else if(it.id=='park'){let ok=false;for(let z=z0;z<z0+it.d;z++)for(let x=x0;x<x0+it.w;x++)for(const q of D4)if(inb(x+q[0],z+q[1])&&rd[(z+q[1])*N+x+q[0]]==2)ok=true;if(!ok)r.push({x:x0,z:z0,w:tt('🛣 Place it next to a big Road')})}
 else if(it.id=='shop'||it.id=='tea'){const fr=frontOf(it,x0,z0,f);if(!inb(fr[0],fr[1])||occ[fr[1]*N+fr[0]]==1)r.push({x:fr[0],z:fr[1],w:tt('🟨 Keep the yellow tile in front empty')})}
 else if(it.id=='table'){if(!bl.some(b=>b.t=='tea'&&Math.max(b.x-(x0+it.w),x0-(b.x+2),0,b.z-(z0+it.d),z0-(b.z+5))<=2))r.push({x:x0,z:z0,w:tt('🍵 Place within 2 tiles of a Cha Dokan')})}
 return r}
function canPlace(it,x0,z0,f){return blockers(it,x0,z0,f).length==0}
const MAXPOP=260;   // hard cap on walking people so a month-old village stays smooth
function spawnRes(b){const n=ITEM[b.t].res;for(let i=0;i<n;i++){if(people.length>=MAXPOP)break;const kid=n>2&&i==n-1;people.push({x:b.out[0]+.5,z:b.out[1]+.5,path:null,pi:0,state:'idle',t:1+i*2+rnd()*2,look:mkLook(kid),home:b,spd:(kid?1.7:1.2)+rnd()*.35,face:{sx:1,sy:1},fr:rnd()*6,alpha:0,ox:(rnd()-.5)*.36,oz:(rnd()-.5)*.36,bub:null,kid:kid,hidden:true,sleep:false,wallet:6+Math.floor(rnd()*10),going:false})}}
function mkMerch(b){const Lk=mkLook(false);Lk.apron=b.color;Lk.hat=b.id%3==0?'cap':'';people.push({x:b.mx,z:b.mz,merch:1,stall:b,look:Lk,face:{sx:b.id%2?1:-1,sy:1},fr:rnd()*6,alpha:1,state:'idle',bub:null,hidden:false})}
function syncCh(){chickens=chickens.filter(c=>bl.includes(c.b));for(const b of bl){if(b.bt>0)continue;const k=(b.t=='farm'||b.t=='cfarm')?'c':b.t=='gfarm'?'g':null;if(!k||chickens.some(c=>c.b===b))continue;const pen=b.t!='farm',n=pen?(k=='g'?3:4):3;for(let i=0;i<n;i++){const t=pen?[b.x+1+i%3,b.z+1+(i>>1)%2]:[b.front[0]+i-1,b.front[1]];chickens.push({b:b,k:k,pen:pen,x:t[0]+.5,z:t[1]+.5,tx:t[0]+.5,tz:t[1]+.5,t:rnd()*2,fr:0,face:{sx:1,sy:1},hx:pen?b.x+2:t[0],hz:pen?b.z+1:t[1]})}}}
function place(it,x0,z0){
 if(it.lv>level){toast(tt('🔒 Level ')+it.lv+tt(' needed'));return false}
 if(bl.filter(b=>b.t==it.id).length>=limOf(it.id)){toast(tt('🚫 Limit ')+limOf(it.id)+tt(' only — level up to raise the limit'));return false}
 if(it.id=='shop'&&GL[shopG]>level){toast(tt('🔒 This product needs Level ')+GL[shopG]);return false}
 if(it.id!='dock'&&it.id!='port'&&!own(x0,z0)){toast(tt('🔒 This land is not bought — press the 🗺️ Land button'));return false}
 {const bk=blockers(it,x0,z0,facing);if(bk.length){toast('✖ '+bk[0].w);return false}}
 if(coins<it.c){toast(tt('Not enough coins 🪙'));return false}
 coins-=it.c;
 if(it.id=='tree'){trees.push([x0,z0,rnd()<.3]);stampAll()}
 else{const b={id:uid++,t:it.id,x:x0,z:z0,f:facing,s:Math.floor(rnd()*13),g:shopG,cash:0,stock:6,rt:5,mst:'run',mt:7200,bank:0};bl.push(b);stampAll();b.bt=it.one?0:bTime(it);if(!b.bt)doneB(b);else{if(++placedN%6==0)setTimeout(()=>autoAd('build'),3000);toast((bl.filter(q=>q.bt>0).indexOf(b)<builders()?tt('🔨 Building… '):tt('⏳ Builder busy, waiting in line… '))+fmtT(b.bt)+tt(' (tap the building to watch an ad and cut 5 minutes)'))}}
 addXp(it.c*.3);hud();save();refreshBar();return true}
function removeB(b,nr){coins+=(nr?0:Math.floor(ITEM[b.t].c/2))+Math.floor(b.cash);bl.splice(bl.indexOf(b),1);for(let i=people.length-1;i>=0;i--)if(people[i].home===b||people[i].stall===b)people.splice(i,1);if(sel===b)sel=null;stampAll();syncCh();hud();save();refreshBar()}
function paint(x,z){if(x<1||z<1||x>N-2||z>N-2)return;const k=z*N+x;
 if(tool.rt){const T=tool.rt;if(!own(x,z)||occ[k]||rd[k]==T)return;if(coins<tool.c){toast(tt('Not enough coins 🪙'));return}coins-=tool.c;if(rd[k]==1)roads.delete(k);if(rd[k]==2)mains.delete(k);(T==1?roads:mains).add(k);rd[k]=T;st(x,1,z,T==1?((x+z)%7==0?PATH2:PATH):ASPH);DECT.delete(k);tileUpd(x,z);hud();return}
 if(rd[k]){roads.delete(k);mains.delete(k);rd[k]=0;st(x,1,z,grd(x,z));tileUpd(x,z);return}
 const b=bl.find(b=>{const it=ITEM[b.t],m=isH(it)?1:0;return x>=b.x-m&&x<=b.x+it.w-1+m&&z>=b.z-m&&z<=b.z+it.d-1+m});if(b)removeB(b)}
// ================= economy =================
function priceOf(g){const n=bl.filter(b=>b.t=='shop'&&b.g==g).length;return Math.max(1,Math.round(GN[g][2]*Math.max(.6,1.2-.12*(n-1))))}
function newDay(){day++;const rm=.7+rep/166;
 needs();for(const b of bl){if(b.bt>0)continue;const it=ITEM[b.t];let g=0;if(it.res)g=it.res*5*rm*lmul();else if(b.t=='farm')g=4;else if(it.inc)g=it.inc;else if(it.pen&&b.t!='mine')g=6;else if(b.t=='fount')rep=Math.min(100,rep+.3);
  if(g&&b.cap){const n=Math.min(b.cap,b.cash+g);gen+=n-b.cash;b.cash=n}}
 hud()}
function decide(p){
 if(p.job&&bl.includes(p.job)&&!p.job.bt&&!(p.job.t=='mine'&&p.job.mst!='run')&&rnd()<.8)return go(p,p.job.front,{k:'work',b:p.job});
 if(p.look&&p.look.kid){const sc=bl.find(b=>b.t=='school'&&!b.bt);if(sc&&rnd()<.75)return go(p,sc.front,{k:'learn',b:sc})}
 if(p.wallet>=TEAP&&rnd()<.45){const fs=[];for(const b of bl)if(b.seats&&!b.bt)for(const q of b.seats)if(!q.p&&q.tea&&bl.includes(q.tea)&&!q.tea.bt)fs.push(q);
   if(fs.length){const q=fs[Math.floor(rnd()*fs.length)];q.p=p;p.seat=q;go(p,[q.x,q.z],{k:'tea',b:q.tea,seat:q});if(p.state!='walk'&&!p.sit){q.p=null;p.seat=null}return}}
  const sh=bl.filter(b=>b.t=='shop'&&!b.bt&&b.stock>0&&priceOf(b.g)<=p.wallet);
 if(sh.length&&rnd()<.7){const b=sh[Math.floor(rnd()*sh.length)];return go(p,b.front,{k:'shop',b:b})}
 {const bs=bl.find(b=>b.t=='bus'&&!b.bt);if(bs&&p.wallet>=3&&rnd()<.12)return go(p,bs.front,{k:'bus',b:bs})}
 if(rnd()<.2){const f=fishSpot();if(f)return go(p,f.t,{k:'fish',b:f.b})}
 const jb=bl.filter(b=>(b.t=='farm'||b.t=='shop')&&!b.bt);
 if(jb.length&&rnd()<.75){const b=jb[Math.floor(rnd()*jb.length)];return go(p,b.front,{k:'work',b:b})}
 const h=p.home.out,c=[];for(let z=h[1]-8;z<=h[1]+8;z++)for(let x=h[0]-8;x<=h[0]+8;x++)if(inb(x,z)&&walk[z*N+x])c.push([x,z]);if(c.length)go(p,c[Math.floor(rnd()*c.length)],{k:'wander'});else p.t=3+rnd()*3}
function go(p,tile,task){p.task=task;let sx=Math.floor(p.x),sz=Math.floor(p.z);if(!walk[sz*N+sx]){const n=nearestWalk(sx,sz);sx=n[0];sz=n[1];p.x=sx+.5;p.z=sz+.5}
 if(sx==tile[0]&&sz==tile[1]){arrive(p);return}
 const path=findPath(sx,sz,tile[0],tile[1]);if(!path||path.length<2){p.state='idle';p.t=2+rnd()*2;p.going=false;p.task=null;if(!p.tmp){const wd=task&&task.k=='wander',nw=performance.now();needP.set(sz*N+sx,{x:sx,z:sz,s:1,t:nw});if(!wd)needP.set(tile[1]*N+tile[0],{x:tile[0],z:tile[1],t:nw});if(!p.bub&&rnd()<.5)p.bub={text:tt('🚧 Connect a Path here'),t:2.5};if(!go.told){go.told=1;toast(tt('🚧 Connect a Path at the 📍 mark (and where 🚶 is stuck) so NPCs can walk'))}}return}needP.delete(tile[1]*N+tile[0]);p.path=path;p.pi=1;p.state='walk'}
function arrive(p){const k=p.task||{};p.state='idle';p.t=1.5+rnd()*2;p.task=null;
 if(k.k=='home'){p.hidden=true;p.sleep=night>.5;p.t=3+rnd()*4;p.going=false}
 else if(k.k=='tea'){const q=k.seat,b=k.b;if(!bl.includes(b)||b.bt||!q||q.p!==p||p.wallet<TEAP){if(q&&q.p===p)q.p=null;p.seat=null;p.bub={text:'😕',t:2};return}
   p.wallet-=TEAP;const n=Math.min(b.cap,b.cash+TEAP*.9*lmul());gen+=n-b.cash;b.cash=n;p.sit=true;p.state='sit';p.t=12+rnd()*10;p.x=q.x+.5;p.z=q.z+.5;p.bub={text:'🍵 Cha!',t:2};const m=people.find(o=>o.stall===b);if(m)m.bub={text:'Cha ready!',t:2}}
 else if(k.k=='shop'){const b=k.b;if(!bl.includes(b))return;const pr=priceOf(b.g),m=people.find(q=>q.stall===b);
  if(b.stock>0&&p.wallet>=pr){b.stock--;p.wallet-=pr;const inc=pr*.9*lmul();const n=Math.min(b.cap,b.cash+inc);gen+=n-b.cash;b.cash=n;p.bub={text:'🛒 '+GN[b.g][0],t:2};if(m)m.bub={text:'Thank you!',t:2}}else p.bub={text:'😕',t:2}}
 else if(k.k=='fish'){p.state='fish';p.wk=k.b;p.t=10+rnd()*8;p.fd=edgeDir(Math.floor(p.x),Math.floor(p.z));p.bub={text:'🎣',t:2}}
 else if(k.k=='car'){if(p.car)p.car.ready=true;const i=people.indexOf(p);if(i>=0)people.splice(i,1)}
 else if(k.k=='chat'){p.state='chat';p.t=14+rnd()*14;p.bub={text:'💬',t:2};const sh=bl.find(b=>b.t=='shop'&&!b.bt&&b.stock>0&&Math.abs(b.x-k.b.x)+Math.abs(b.z-k.b.z)<16&&p.wallet>=priceOf(b.g));if(sh){const pr=priceOf(sh.g);sh.stock--;p.wallet-=pr;const n=Math.min(sh.cap,sh.cash+pr*1.2*lmul());gen+=n-sh.cash;sh.cash=n}}
 else if(k.k=='learn'){p.state='work';p.wk=null;p.t=10+rnd()*8;p.bub={text:'📚',t:2}}
 else if(k.k=='bus'){const b=k.b;if(!bl.includes(b))return;if(p.wallet>=3){p.wallet-=3;const n=Math.min(b.cap,b.cash+4*lmul());gen+=n-b.cash;b.cash=n;p.bub={text:'🚌',t:2};p.hidden=true;p.sleep=false;p.t=8+rnd()*8}}
 else if(k.k=='work'){p.state='work';p.wk=k.b;p.t=8+rnd()*6;p.bub={text:'🔨',t:2}}
 else p.t=2+rnd()*4}
function finishWork(p){const t=p.wk;p.state='idle';p.t=.5+rnd();const w=3+Math.floor(rnd()*3);p.wallet+=w;
 if(t&&bl.includes(t)){if(t.t=='shop')t.stock=Math.min(12,t.stock+3);else if(t.t=='farm'||(ITEM[t.t].pen&&t.t!='mine')){const n=Math.min(t.cap,t.cash+(t.t=='farm'?2.5:4));gen+=n-t.cash;t.cash=n;const gg=t.t=='ffarm'?3:(t.t=='cfarm'||t.t=='gfarm')?7:-1,fs=bl.filter(b=>b.t=='shop'&&b.g==gg&&!b.bt);if(fs.length)fs[0].stock=Math.min(12,fs[0].stock+2)}else if(t.t=='mine'&&t.mst=='run')t.mt=Math.max(0,t.mt-240)}p.bub={text:'+'+w+'🪙',t:1.5}}
// complaints (নালিশ-বিচার)
const CMP=[
{q:tt('Rahim and Karim are quarreling over a fence. What is your ruling?'),o:[[tt('Make them settle'),0,5],[tt('Fine both of them'),30,-4],[tt('Ignore it'),0,-6]]},
{q:tt('A complaint came in that a shopkeeper is overcharging.'),o:[[tt('Order a price cut'),0,6],[tt('Side with the merchant'),25,-5],[tt('Order an investigation'),-15,4]]},
{q:tt('Someone stole a chicken at night!'),o:[[tt('Post a guard'),-20,6],[tt('Fine the thief'),20,2],[tt('Let it go'),0,-5]]},
{q:tt('The road is too muddy to walk. It needs repair.'),o:[[tt('Repair now'),-25,7],[tt('Will check later'),0,-4]]},
{q:tt('Loud music from the neighbour is keeping people awake.'),o:[[tt('Set quiet hours'),0,4],[tt('Issue a fine'),15,-3],[tt('Nothing'),0,-4]]},
{q:tt('A request came in to hold a fair in the village.'),o:[[tt('Allow the fair'),-30,9],[tt('Too expensive, no'),0,-3]]},
{q:tt('Two farmers are quarreling over a land boundary.'),o:[[tt('Order a survey'),-10,6],[tt('Fine both farmers'),30,-5],[tt('Avoid it'),0,-5]]}];
const CMP_L={q:tt('The roads are very dark at night. Lamps needed!'),o:[[tt('Order lamps installed'),-20,8],[tt('Will check later'),0,-5]]},CMP_S={q:tt('There is not a single shop in the village! Where do we buy things?'),o:[[tt('Announce building a market'),0,4],[tt('Not my problem!'),0,-6]]};
let cmps=[],cmpT=35,sv=15,rt2=30;
function newCmp(){const pp=people.filter(p=>!p.merch&&!p.tmp&&!p.hidden&&!p.cmp&&p.alpha>.9);if(!pp.length||cmps.length>=3)return;
 const p=pp[Math.floor(rnd()*pp.length)];let pool=CMP.slice();if(!bl.some(b=>b.t=='shop'||b.t=='tea'))pool=[CMP_S,CMP_S,CMP_S];else if(!bl.some(b=>b.t=='lamp'))pool.push(CMP_L,CMP_L);
 const c={p:p,q:pool[Math.floor(rnd()*pool.length)],t:150};p.cmp=c;p.bub={text:'❗',t:1e9};cmps.push(c);hud()}
function dropCmp(c){cmps=cmps.filter(x=>x!==c);c.p.cmp=null;c.p.bub=null;hud()}
function openCmp(c){$('dq').textContent=c.q.q;const o=$('do');o.innerHTML='';
 c.q.o.forEach(op=>{const b=document.createElement('button');b.textContent=op[0]+'  ['+(op[1]?'🪙'+(op[1]>0?'+':'')+op[1]+' ':'')+'⭐'+(op[2]>0?'+':'')+op[2]+']';
  b.onclick=()=>{coins=Math.max(0,coins+op[1]);rep=Math.max(0,Math.min(100,rep+op[2]));if(op[1]>0)gen+=op[1];dropCmp(c);addXp(15);$('dlg').style.display='none';toast(tt('Verdict given ✔'));save()};o.appendChild(b)});
 const x=document.createElement('button');x.textContent=tt('Later');x.onclick=()=>{$('dlg').style.display='none'};o.appendChild(x);$('dlg').style.display='flex'}
function econ(dt){eAcc+=dt;if(eAcc>=120){eAcc-=120;const d0=day;newDay();day=d0}
 {const act=bl.filter(b=>b.bt>0).slice(0,builders());for(const b of bl){if(b.bt>0){if(act.includes(b)){b.bt-=dt;if(b.bt<=0){b.bt=0;doneB(b);toast('✅ '+ITEM[b.t].n+tt(' construction finished!'));utT=0}}}else if(b.t=='mine')advMine(b,dt)}}
 utT-=dt;if(utT<=0){utT=1.5;calcUtil();renderStat();tutCheck()}
 for(const b of bl)if(b.t=='shop'){b.rt-=dt;if(b.rt<=0){b.rt=12;if(b.stock<12)b.stock++}}
 cmpT-=dt;if(cmpT<=0){cmpT=60+rnd()*60;if(people.length>=2)newCmp()}
 for(const c of cmps.slice()){c.t-=dt;if(c.t<=0){rep=Math.max(0,rep-3);dropCmp(c);toast(tt('Complaint ignored ⭐-3'))}}
 sv-=dt;if(sv<=0){sv=20;saveSoon()}
 rt2-=dt;if(rt2<=0){rt2=30;rate=rate*.6+gen*2*.4;gen=0}}

// ================= pathfinding =================
const D4=[[1,0],[-1,0],[0,1],[0,-1]];
// A* on reused typed arrays (the old version allocated ~100 KB per call and searched the whole island)
const PF_n=N*N,PF_dist=new Float32Array(PF_n),PF_prev=new Int32Array(PF_n),PF_seen=new Uint32Array(PF_n),PF_done=new Uint32Array(PF_n),PF_hk=new Float32Array(70000),PF_hv=new Int32Array(70000);let PF_gen=0,PF_hn=0;
function pfPush(k,v){let i=PF_hn++;while(i>0){const p=(i-1)>>1;if(PF_hk[p]<=k)break;PF_hk[i]=PF_hk[p];PF_hv[i]=PF_hv[p];i=p}PF_hk[i]=k;PF_hv[i]=v}
function pfPop(){const rv=PF_hv[0],lk=PF_hk[--PF_hn],lv=PF_hv[PF_hn];if(PF_hn>0){let i=0;for(;;){let a=i*2+1;if(a>=PF_hn)break;if(a+1<PF_hn&&PF_hk[a+1]<PF_hk[a])a++;if(PF_hk[a]>=lk)break;PF_hk[i]=PF_hk[a];PF_hv[i]=PF_hv[a];i=a}PF_hk[i]=lk;PF_hv[i]=lv}return rv}
function findPath(sx,sz,tx,tz){
 const s=sz*N+sx,t=tz*N+tx;if(++PF_gen>4e9){PF_seen.fill(0);PF_done.fill(0);PF_gen=1}
 const G=PF_gen;PF_dist[s]=0;PF_seen[s]=G;PF_prev[s]=-1;PF_hn=0;pfPush(Math.abs(sx-tx)+Math.abs(sz-tz),s);let steps=0;
 while(PF_hn>0){const u=pfPop();if(PF_done[u]===G)continue;PF_done[u]=G;if(u===t)break;if(++steps>14000||PF_hn>69000)return null;
  const ux=u%N,uz=(u/N)|0,d=PF_dist[u];
  for(let di=0;di<4;di++){const vx=ux+D4[di][0],vz=uz+D4[di][1];if(vx<0||vz<0||vx>=N||vz>=N)continue;const v=vz*N+vx;if(!walk[v]&&v!==t)continue;const nd=d+cost[v];if(PF_seen[v]!==G||nd<PF_dist[v]){PF_seen[v]=G;PF_dist[v]=nd;PF_prev[v]=u;pfPush(nd+Math.abs(vx-tx)+Math.abs(vz-tz),v)}}}
 if(PF_seen[t]!==G||PF_done[t]!==G)return null;
 const path=[];for(let c=t;c!==-1;c=PF_prev[c])path.push([c%N+.5,((c/N)|0)+.5]);path.reverse();return path}

function nearestWalk(x,z){for(let r=0;r<12;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){const a=x+dx,b=z+dz;if(inb(a,b)&&walk[b*N+a])return[a,b]}for(let i=0;i<N*N;i++)if(walk[i])return[i%N,(i/N)|0];return[1,1]}
const SKIN=['#f1c27d','#e0ac69','#c68642','#8d5524','#ffdbac'],HAIR=['#2b1b10','#5a3a1a','#8a5a2a','#d9b25a','#1a1a1a','#a83a1a','#e8e0d0'],SHIRT=['#d94a46','#4472d4','#52b04c','#f2c230','#9150c8','#ee8a2b','#3aa6a6','#ee90b6','#e8e0d0','#6a7a3a'],PANT=['#3a4a8a','#5a4028','#4a4a4a','#2a3a5a','#6a5a3a'];
const pick=a=>a[Math.floor(rnd()*a.length)];
const PHR=['Hello!','Nice day!','To the market!','Fresh bread, mmm','I love this village','Look, the fountain!','Going shopping','See you!','So many stalls!','Hi there!'],MPHR=['Fresh goods!','Best price!','Come, buy!','Shiny gems here!','Warm bread!','Thank you!'];
function mkLook(kid){return{skin:pick(SKIN),hair:pick(HAIR),shirt:pick(SHIRT),pants:pick(PANT),hat:(!kid&&rnd()<.22)?(rnd()<.6?'straw':'cap'):'',kid:kid}}

function updPeople(dt){decBudget=1;
 for(const p of people){
  if(p.bub){p.bub.t-=dt;if(p.bub.t<=0)p.bub=p.cmp?{text:'❗',t:1e9}:null}
  if(p.merch){const tgt=night>.88?0:1;p.alpha+=(tgt-p.alpha)*Math.min(1,dt*2);p.fr+=dt;continue}
  if(p.hidden){if(p.sleep){if(night<.35){p.sleep=false;p.t=0}}else{p.t-=dt}
   if(!p.sleep&&p.t<=0&&night<.5){p.hidden=false;p.alpha=0;p.x=p.home.out[0]+.5;p.z=p.home.out[1]+.5;p.state='idle';p.t=.5+rnd()*2}continue}
  if(p.alpha<1)p.alpha=Math.min(1,p.alpha+dt*3);
  if(p.state=='idle'){p.fr+=dt*.5;p.t-=dt;
   if(p.tmp){if(p.t<=0)go(p,[p.car.bay?p.car.bay.x:0,p.car.bay?p.car.bay.z:0],{k:'car'})}
   else if(night>.55&&!p.going){p.going=true;const cp=!p.job&&p.cn!==day&&bl.find(b=>b.t=='camp'&&!b.bt&&b.spots);if(cp&&rnd()<.6){p.cn=day;go(p,cp.spots[Math.floor(rnd()*cp.spots.length)],{k:'chat',b:cp})}else go(p,p.home.out,{k:'home'})}
   else if(p.t<=0){if(night<.5){if(decBudget>0){decBudget--;p.going=false;decide(p)}else p.t=.05}else p.t=2}}
  else if(p.state=='work'){p.fr+=dt*.8;p.t-=dt;if(p.t<=0||night>.55)finishWork(p)}
  else if(p.state=='chat'){p.t-=dt;if(!p.bub&&rnd()<dt*.35)p.bub={text:['😄','💬','🍢','🎶','🔥'][Math.floor(rnd()*5)],t:2};if(p.t<=0){p.state='idle';p.going=false;p.t=.2}}
  else if(p.state=='fish'){p.fr+=dt*.5;p.t-=dt;if(p.t<=0||night>.55)finishFish(p)}
  else if(p.state=='sit'){p.fr+=dt*.5;p.t-=dt;if(!p.bub&&rnd()<dt*.2)p.bub={text:['🍵','💬','😄'][Math.floor(rnd()*3)],t:2};if(p.t<=0||night>.55){if(p.seat)p.seat.p=null;p.seat=null;p.sit=false;p.state='idle';p.t=.5+rnd();p.going=false}}
  else if(p.state=='walk'){const wp=p.path[p.pi];let tx=wp[0]+p.ox,tz=wp[1]+p.oz;const dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz),step=p.spd*dt;p.fr+=dt*10;
   if(d<=step){p.x=tx;p.z=tz;p.pi++;if(p.pi>=p.path.length)arrive(p)}
   else{p.x+=dx/d*step;p.z+=dz/d*step;p.fdx=dx;p.fdz=dz}}
 }
 for(const c of chickens){c.t-=dt;const dx=c.tx-c.x,dz=c.tz-c.z,d=Math.hypot(dx,dz);
  if(d>.05){const s=Math.min(d,.7*dt);c.x+=dx/d*s;c.z+=dz/d*s;c.fr+=dt*14;c.fdx=dx;c.fdz=dz}
  else if(c.t<=0){c.t=1+rnd()*3;const a=c.pen?c.hx+Math.floor(rnd()*3)-1:c.hx+Math.floor(rnd()*7)-3,b=c.pen?c.hz+Math.floor(rnd()*2):c.hz+Math.floor(rnd()*7)-3;if(inb(a,b)&&cwalk[b*N+a]){c.tx=a+.2+rnd()*.6;c.tz=b+.2+rnd()*.6}}}
}

// ================= camera / view =================
const cv=document.getElementById('cv'),ctx=cv.getContext('2d',{alpha:false});
let VW=innerWidth,VH=innerHeight,DPR=1;
const cam={fx:N/2,fz:N/2,zoom:.55,ang:0};
function defZoom(){return VW<700?.42:.75}
cam.zoom=defZoom();
function resize(){DPR=Math.max(.75,Math.min(window.devicePixelRatio||1,GFX.q.dpr));VW=innerWidth||360;VH=innerHeight||640;cv.width=Math.round(VW*DPR);cv.height=Math.round(VH*DPR)}
addEventListener('resize',resize);resize();
let _ra=NaN,_rc=1,_rs=0;function _tg(a){if(a!==_ra){_ra=a;_rc=Math.cos(a);_rs=Math.sin(a)}}
function rot(x,z,r){_tg(r);const dx=x-N/2,dz=z-N/2;return[dx*_rc-dz*_rs+N/2,dx*_rs+dz*_rc+N/2]}
function unrot(x,z,r){_tg(r);const dx=x-N/2,dz=z-N/2;return[dx*_rc+dz*_rs+N/2,-dx*_rs+dz*_rc+N/2]}
function projXY(fx,fz,fh){const q=rot(fx,fz,cam.ang);return[(q[0]-q[1])*32,(q[0]+q[1])*16-(fh-1)*32]}
let cX=0,cY=0;
function toScr(fx,fz,fh){const p=projXY(fx,fz,fh);return[(p[0]-cX)*cam.zoom+VW/2,(p[1]-cY)*cam.zoom+VH/2]}
function setFocusFromProj(X,Y){Y+=32;const rx=(X/32+Y/16)/2,rz=(Y/16-X/32)/2,w=unrot(rx,rz,cam.ang);cam.fx=Math.max(-6,Math.min(N+6,w[0]));cam.fz=Math.max(-6,Math.min(N+6,w[1]))}
// ================= time of day =================
const CYC=600;   // 600s = 10 min full day: 5 min day -> night, 5 min night -> day
let tod=.42,tmode=0,night=0,light=1;
function updTime(dt){if(tmode==0){const t0=tod;tod=(tod+dt/CYC)%1;if(tod<t0)day++}else{   // tmode 1 = ad-skip: fast-forward (forward only) to bright morning, then back to normal time
  const tg=.33,d=(tg-tod+1)%1,stp=Math.min(d,dt*.2),t0=tod;tod=(tod+stp)%1;if(tod<t0)day++;if(d-stp<1e-4){tod=tg;tmode=0}}
 const br=.5-.5*Math.cos(tod*Math.PI*2);light=Math.max(0,Math.min(1,(br-.18)/.5));night=1-light}
// ================= drawing people =================
function drawHuman(c,X,Y,p,moving){
 if(LITE){const L=p.look,u=(L.kid?.72:1)*.82*2.1;c.globalAlpha=p.alpha;c.fillStyle=L.pants;c.fillRect(X-4*u,Y-11*u,8*u,11*u);c.fillStyle=L.shirt;c.fillRect(X-4*u,Y-23*u,8*u,12*u);c.fillStyle=L.skin;c.fillRect(X-4*u,Y-31*u,8*u,8*u);c.fillStyle=L.hair;c.fillRect(X-4*u,Y-31*u,8*u,2.5*u);c.globalAlpha=1;return}
 const L=p.look,sc=(L.kid?.72:1)*.82,u=2.1*sc,front=p.face.sy>=0,sh=p.face.sx<0?-1:1,sw=moving?Math.sin(p.fr):0,bob=moving?Math.abs(Math.cos(p.fr))*.8:Math.sin(p.fr*2)*.25;
 c.globalAlpha=p.alpha;
 if(GFX.q.shadow){c.fillStyle='rgba(0,0,0,.28)';c.beginPath();c.ellipse(X,Y,6.5*sc*1.7,3*sc*1.7,0,0,6.3);c.fill()}
 const dr=p.sit?5:0,R=(gx,gy,w,h,col)=>{c.fillStyle=col;c.fillRect(X+gx*u,Y-(gy+h+bob-dr)*u,w*u,h*u)};
 const sk=L.skin,shirt=L.shirt;
 // legs (lift alternately)
 const ll=Math.max(0,sw)*3,rl=Math.max(0,-sw)*3;
 if(p.sit){R(-4,5,4,6,L.pants);R(0,5,4,6,L.pants);R(-4,4.99,4,2,'#2a2018');R(0,4.99,4,2,'#2a2018')}else{R(-4,ll,4,11,L.pants);R(0,rl,4,11,L.pants);R(-4,ll-.01,4,2,'#2a2018');R(0,rl-.01,4,2,'#2a2018')}
 // body
 R(-4,11,8,12,shirt);
 if(L.apron){R(-3,8.5,6,13,L.apron);R(-3,19,6,2,'#fff');}
 else if(front){R(-4,11,8,1.5,'rgba(0,0,0,.18)')}
 // arms
 const al=-sw*2,ar=sw*2;
 R(-7,11+al,3,12,sk);R(-7,18+al,3,5,shirt);R(4,11+ar,3,12,sk);R(4,18+ar,3,5,shirt);
 // head
 R(-4,23,8,8,sk);
 if(front){R(-4,28.5,8,2.5,L.hair);R(-4,25,1,5,L.hair);R(3,25,1,5,L.hair);
  R(-2.5+sh*.7,26,1.4,1.6,'#222');R(1.1+sh*.7,26,1.4,1.6,'#222');R(-1+sh*.7,24,2,.9,'#a05a4a')}
 else{R(-4,23,8,8,L.hair);R(-4,23,8,2,'rgba(0,0,0,.2)')}
 if(L.hat=='straw'){R(-8,30,16,1.6,'#e8c85a');R(-4,31.4,8,3,'#d9b040');R(-4,31.4,8,.9,'#a8581f')}
 else if(L.hat=='cap'){R(-4.5,30,9,2.5,'#c0392b');if(front)R(-4.5,29.5,9,1,'#8a2a20')}
 c.globalAlpha=1}
function drawChicken(c,X,Y,k){const b=Math.abs(Math.sin(k.fr))*.8,u=2.1,sh=k.face.sx<0?-1:1;
 c.fillStyle='rgba(0,0,0,.25)';c.beginPath();c.ellipse(X,Y,5,2.2,0,0,6.3);c.fill();
 const R=(gx,gy,w,h,col)=>{c.fillStyle=col;c.fillRect(X+gx*sh*u-(sh<0?w*u:0),Y-(gy+h+b)*u,w*u,h*u)};
 R(-1,0,1,3,'#e8a030');R(1.5,0,1,3,'#e8a030');R(-3,3,7,5,'#f5f2ea');R(-3.5,5,2,3,'#e6e2d8');R(3,6,3,5,'#f5f2ea');R(4,10,2,1.4,'#d33');R(6,7.5,1.5,1.4,'#f0a020');R(4.5,8.5,.9,.9,'#111')}
function drawGoat(c,X,Y,k){const b=Math.abs(Math.sin(k.fr))*.6,u=2.1,sh=k.face.sx<0?-1:1;c.fillStyle='rgba(0,0,0,.25)';c.beginPath();c.ellipse(X,Y,8,3,0,0,6.3);c.fill();
 const R=(gx,gy,w,h,col)=>{c.fillStyle=col;c.fillRect(X+gx*sh*u-(sh<0?w*u:0),Y-(gy+h+b)*u,w*u,h*u)};
 R(-4,0,1.4,4,'#cfc8b8');R(-1,0,1.4,4,'#bdb5a4');R(2,0,1.4,4,'#cfc8b8');R(4.5,0,1.4,4,'#bdb5a4');R(-5,4,11,5,'#f2eee4');R(5,7,4,5,'#f2eee4');R(8,9,2,2,'#ddd5c4');R(5.5,12,1,2,'#8a7a5a');R(7.5,12,1,2,'#8a7a5a');R(8.5,10,.8,.8,'#111');R(-6,6,1.4,2,'#f2eee4')}
// ================= scene draw =================
const decC=['#e8434a','#f5d03a','#ffffff','#b070f0','#ff9ac8','#5ac8f0'];
function drawDecor(c,d){const p=projXY(d.x,d.z,2),X=p[0],Y=p[1];
 if(d.k<4){c.fillStyle='#3d8a2c';c.fillRect(X-.5,Y-5,1.4,5);const col=decC[(d.k*2+Math.floor(d.x*3))%decC.length];c.fillStyle=col;c.fillRect(X-2.4,Y-8,4.8,3.4);c.fillStyle='#f6d24a';c.fillRect(X-.8,Y-6.8,1.6,1.4)}
 else if(d.k==4){c.fillStyle='#3d8a2c';c.fillRect(X-3,Y-4,1.2,4);c.fillRect(X-.6,Y-6,1.2,6);c.fillRect(X+1.8,Y-4,1.2,4)}
 else{c.fillStyle='#e8e0cc';c.fillRect(X-.8,Y-3,1.8,3);c.fillStyle='#d33';c.fillRect(X-2.6,Y-5.4,5.4,2.6);c.fillStyle='#fff';c.fillRect(X-1,Y-4.8,1,1)}}
function faceOf(dx,dz){const a=cam.ang,c=Math.cos(a),s2=Math.sin(a),v0=dx*c-dz*s2,v1=dx*s2+dz*c;return{sx:v0-v1,sy:(v0+v1)*.5}}
const screens=[];// for tap picking

// ================= water / world cache / draw =================
const WP0=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;for(let i=0;i<46;i++){const x=r()*120,y=r()*124,w=8+r()*22;g.fillStyle='rgba(255,255,255,'+(.1+r()*.14)+')';g.fillRect(x,y,w,1.6);g.fillRect(x+2,y+3,w*.6,1.2)}return c})();
let WPa=null,WPb=null;
function drawEnt(g,it){const e=it[0],k=it[1];
 if(k=='p'){const m=e.merch?false:e.state=='walk';if(m&&e.fdx!==undefined)e.face=faceOf(e.fdx,e.fdz);const fs=e.state=='fish'&&e.fd;if(fs)e.face=faceOf(e.fd[0],e.fd[1]);if(e.sit&&e.seat)e.face=faceOf(e.seat.dx,e.seat.dz);const pp=projXY(e.x,e.z,e.sit?2.5:2);drawHuman(g,pp[0],pp[1],e,m);if(fs)drawRod(g,e);screens.push({e:e,kind:'p',x:pp[0],y:pp[1]})}
 else if(k=='v')drawCar(g,e);
  else if(k=='f')drawFurn(g,e);
 else{if(e.fdx!==undefined)e.face=faceOf(e.fdx,e.fdz);const pp=projXY(e.x,e.z,2);(e.k=='g'?drawGoat:drawChicken)(g,pp[0],pp[1],e)}}
function drawLand(){const r=LR(land),a=N/2-r,b=N/2+r,P=(x,z)=>projXY(x,z,1.1),ex=[[0,0],[N,0],[N,N],[0,N]].map(q=>P(q[0],q[1])),iq=[[a,a],[b,a],[b,b],[a,b]].map(q=>P(q[0],q[1]));
 ctx.save();ctx.beginPath();ex.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();iq.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.fillStyle='rgba(18,22,40,.4)';ctx.fill('evenodd');
 ctx.beginPath();iq.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.setLineDash([12,8]);ctx.lineWidth=3;ctx.strokeStyle='#ffd54a';ctx.stroke();ctx.restore()}
function drawNeed(){if(!needP.size)return;const now=performance.now(),pu=.5+.5*Math.sin(now/260);
 for(const [k,v] of needP){if(now-v.t>45000){needP.delete(k);continue}
  const p=projXY(v.x+.5,v.z+.5,2),X=p[0],Y=p[1];ctx.fillStyle='rgba('+(v.s?'255,150,40':'255,214,0')+','+(.35+.3*pu)+')';ctx.beginPath();ctx.moveTo(X,Y-16);ctx.lineTo(X+32,Y);ctx.lineTo(X,Y+16);ctx.lineTo(X-32,Y);ctx.closePath();ctx.fill();
  ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillStyle='#000';ctx.fillText(v.s?'🚶':'📍',X,Y-18-pu*6)}}
// ================= clouds over the locked land · fences =================
// Land you have not unlocked is covered by soft clouds (and is not even drawn, which makes the game lighter). Unlock land and the clouds roll back.
// smooth mesh garden fence: silver posts, top rail and a fine diamond net; connects to the next fence tile by itself
function drawFence(g,f){const k=Math.floor(f.z)*N+Math.floor(f.x),H0=2.02,H1=2.5,c0=projXY(f.x,f.z,H0),c1=projXY(f.x,f.z,H1);g.lineCap='round';
 for(const q of D4){if(!FNC.has(k+q[1]*N+q[0]))continue;const mx=f.x+q[0]*.5,mz=f.z+q[1]*.5,b1=projXY(mx,mz,H0),t1=projXY(mx,mz,H1);
  g.fillStyle='rgba(225,238,250,.2)';g.beginPath();g.moveTo(c0[0],c0[1]);g.lineTo(b1[0],b1[1]);g.lineTo(t1[0],t1[1]);g.lineTo(c1[0],c1[1]);g.closePath();g.fill();
  g.strokeStyle='rgba(246,250,254,.9)';g.lineWidth=.6;g.beginPath();
  for(let i=0;i<3;i++){const a=i/3,b=(i+1)/3,bx=t=>[c0[0]+(b1[0]-c0[0])*t,c0[1]+(b1[1]-c0[1])*t],tx=t=>[c1[0]+(t1[0]-c1[0])*t,c1[1]+(t1[1]-c1[1])*t];let p=bx(a),r=tx(b);g.moveTo(p[0],p[1]);g.lineTo(r[0],r[1]);p=bx(b);r=tx(a);g.moveTo(p[0],p[1]);g.lineTo(r[0],r[1])}g.stroke();
  g.strokeStyle='#f8fafc';g.lineWidth=1.3;g.beginPath();g.moveTo(c1[0],c1[1]);g.lineTo(t1[0],t1[1]);g.stroke();
  g.strokeStyle='#a9b4c2';g.lineWidth=.9;g.beginPath();g.moveTo(c0[0],c0[1]);g.lineTo(b1[0],b1[1]);g.stroke()}
 g.strokeStyle='#8c97a6';g.lineWidth=2.1;g.beginPath();g.moveTo(c0[0],c0[1]);g.lineTo(c1[0],c1[1]);g.stroke();g.fillStyle='#eef2f7';g.beginPath();g.arc(c1[0],c1[1]-.8,1.5,0,6.3);g.fill()}
let fenceDirty=false;
// drag with the Fence tool: places tile after tile without rebuilding the whole world each time
function placeFence(x,z){const it=ITEM.fence,k=z*N+x;if(x<1||z<1||x>N-2||z>N-2||!own(x,z)||occ[k]||rd[k]||it.lv>level)return false;
 const warn=m=>{if(!placeFence.w||Date.now()-placeFence.w>2500){placeFence.w=Date.now();toast(m)}};
 if(bl.filter(b=>b.t=='fence').length>=limOf('fence')){warn(tt('🚫 Limit ')+limOf('fence')+tt(' only — level up to raise the limit'));return false}
 if(coins<it.c){warn(tt('Not enough coins 🪙'));return false}
 coins-=it.c;const b={id:uid++,t:'fence',x:x,z:z,f:0,s:0,g:0,cash:0,stock:6,rt:5,mst:'run',mt:7200,bank:0,bt:0,cx:x+.5,cz:z+.5,ih:2.6,cap:0};bl.push(b);occ[k]=1;FNC.set(k,{x:x+.5,z:z+.5});markT(x,z);addXp(it.c*.3);hud();fenceDirty=true;return true}
const GLOWS={};function glowSpr(big){const k=big?1:0;if(GLOWS[k])return GLOWS[k];const R=big?90:34,c=document.createElement('canvas');c.width=c.height=R*2;const g=c.getContext('2d'),gr=g.createRadialGradient(R,R,0,R,R,R);gr.addColorStop(0,'rgba(255,200,110,1)');gr.addColorStop(1,'rgba(255,170,70,0)');g.fillStyle=gr;g.fillRect(0,0,R*2,R*2);return GLOWS[k]=c}

const coinSpots=[],floaters=[],gmSpots=[];
function mixA(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
function mixC(a,b,t){const m=mixA(a,b,t);return'rgb('+(m[0]|0)+','+(m[1]|0)+','+(m[2]|0)+')'}


// ================= cars & parking =================
const CARC=['#d94a46','#4472d4','#f2c230','#52b04c','#e8e0d0','#9150c8','#ee8a2b','#3aa6a6'];let cs=1;
function carBusy(k,me){for(const c of cars)if(c!==me&&(c.ck==k||c.nk==k)){if(me&&c.ck==k&&c.nk==me.ck)continue;return true}return false}
function carPath(sk,tk){const prev=new Int32Array(N*N).fill(-2),q=[sk];prev[sk]=-1;for(let h=0;h<q.length;h++){const u=q[h];if(u==tk)break;const ux=u%N,uz=(u/N)|0;for(const d of D4){const vx=ux+d[0],vz=uz+d[1];if(!inb(vx,vz))continue;const v=vz*N+vx;if(prev[v]!=-2)continue;if(rd[v]!=2&&v!=tk)continue;prev[v]=u;q.push(v)}}if(prev[tk]==-2)return null;const pth=[];for(let c=tk;c!=sk;c=prev[c])pth.push(c);pth.reverse();return pth}
function killCar(c){const i=cars.indexOf(c);if(i>=0)cars.splice(i,1);if(c.bay&&c.bay.car===c)c.bay.car=null;for(let j=people.length-1;j>=0;j--)if(people[j].car===c)people.splice(j,1)}
function parkCar(c){c.st='park';c.t=18+rnd()*15;c.ready=true;const l=c.lot,n=Math.min(l.cap,l.cash+3);gen+=n-l.cash;l.cash=n;
 const sh=bl.filter(b=>b.t=='shop'&&b.stock>0);if(sh.length){c.ready=false;const b=sh[Math.floor(rnd()*sh.length)],p={x:c.bay.x+.5,z:c.bay.z+.5,path:null,pi:0,state:'idle',t:1,look:mkLook(false),home:l,spd:1.3,face:{sx:1,sy:1},fr:0,alpha:1,ox:0,oz:0,bub:null,hidden:false,sleep:false,wallet:20,tmp:1,car:c};people.push(p);go(p,b.front,{k:'shop',b:b})}}
function updCars(dt){
 cs-=dt;if(cs<=0){cs=2;let m=0;for(let i=0;i<N*N;i++)if(rd[i]==2)m++;const want=Math.min(GFX.q.cars,Math.floor(m/6));
  if(cars.length<want){const ml=[];for(let q=0;q<N*N;q++)if(rd[q]==2)ml.push(q);for(let t=0;t<12;t++){const k=ml[Math.floor(rnd()*ml.length)];if(!carBusy(k,null)){cars.push({x:k%N+.5,z:((k/N)|0)+.5,ck:k,nk:-1,dx:1,dz:0,st:'drive',col:CARC[Math.floor(rnd()*CARC.length)],path:null,wait:0,cool:rnd()*10,spd:1.9+rnd()*.6});break}}}
  else if(cars.length>want){const c=cars.find(c=>c.st=='drive'&&!c.bay&&!c.resp&&!c.bus);if(c)killCar(c)}}
 for(let i=cars.length-1;i>=0;i--){const c=cars[i];c.cool-=dt;
  if(c.st=='park'){c.t-=dt;if(!bl.includes(c.lot)||!c.lot.bays.includes(c.bay)){killCar(c);continue}
   if(c.t<=0&&(c.ready||c.t<-30)){const bk=c.bay.z*N+c.bay.x,nb=D4.map(d=>[inb(c.bay.x+d[0],c.bay.z+d[1]),(c.bay.z+d[1])*N+c.bay.x+d[0]]).filter(a=>a[0]&&rd[a[1]]==2&&!carBusy(a[1],c));
    if(nb.length){c.nk=nb[Math.floor(rnd()*nb.length)][1];c.ck=bk;c.bay.car=null;c.bay=null;c.lot=null;c.st='drive';c.cool=40;c.path=null;for(let j=people.length-1;j>=0;j--)if(people[j].car===c)people.splice(j,1)}}
   continue}
  if(c.nk<0){
   if(rd[c.ck]!=2){killCar(c);continue}
   let nk=-1;
   if(c.path&&c.path.length)nk=c.path[0];
   else{const cx=c.ck%N,cz=(c.ck/N)|0,cand=D4.map(d=>[d,(cz+d[1])*N+cx+d[0],inb(cx+d[0],cz+d[1])]).filter(a=>a[2]&&rd[a[1]]==2),fw=cand.filter(a=>a[0][0]==c.dx&&a[0][1]==c.dz),nr=cand.filter(a=>!(a[0][0]==-c.dx&&a[0][1]==-c.dz)),pool=(fw.length&&rnd()<.7)?fw:(nr.length?nr:cand);
    if(pool.length)nk=pool[Math.floor(rnd()*pool.length)][1];
    if(c.cool<=0&&nk>=0){c.cool=15;const lots=bl.filter(b=>b.t=='park'&&b.bays.some(y=>!y.car));if(lots.length&&rnd()<.5){const lot=lots[Math.floor(rnd()*lots.length)],fb=lot.bays.filter(y=>!y.car),bay=fb[Math.floor(rnd()*fb.length)],pth=carPath(c.ck,bay.z*N+bay.x);if(pth&&pth.length){c.path=pth;c.bay=bay;c.lot=lot;bay.car=c;nk=pth[0]}}}}
   if(nk>=0){if(carBusy(nk,c)){c.wait+=dt;if(c.wait>1.5){c.nk=nk;c.wait=0}}else{c.nk=nk;c.wait=0}}}
  if(c.nk>=0){const tx=c.nk%N+.5,tz=((c.nk/N)|0)+.5,dx=tx-c.x,dz=tz-c.z,d=Math.hypot(dx,dz),step=c.spd*dt;
   if(Math.abs(dx)>Math.abs(dz)){if(Math.abs(dx)>.01){c.dx=Math.sign(dx);c.dz=0}}else if(Math.abs(dz)>.01){c.dx=0;c.dz=Math.sign(dz)}
   if(d<=step){c.x=tx;c.z=tz;c.ck=c.nk;c.nk=-1;if(c.path){c.path.shift();if(!c.path.length){c.path=null;if(c.bay)parkCar(c);else if(c.resp)resolveInc(c.resp)}}}else{c.x+=dx/d*step;c.z+=dz/d*step}}}}
function carCol(h,k){const c=hex(h);return'rgb('+(c[0]*k|0)+','+(c[1]*k|0)+','+(c[2]*k|0)+')'}
function pris(g,cx,cz,pts,h0,h1,col,tc){const b=pts.map(o=>projXY(cx+o[0],cz+o[1],h0)),t=pts.map(o=>projXY(cx+o[0],cz+o[1],h1)),fs=[];
 const poly=q=>{g.beginPath();q.forEach((a,i)=>i?g.lineTo(a[0],a[1]):g.moveTo(a[0],a[1]));g.closePath();g.fill()};
 for(let i=0;i<4;i++){const j=(i+1)%4;fs.push({q:[b[i],b[j],t[j],t[i]],y:(b[i][1]+b[j][1])/2,k:[.82,.66,.74,.58][i]})}
 fs.sort((a,b)=>a.y-b.y);for(const f of fs){g.fillStyle=carCol(col,f.k);poly(f.q)}g.fillStyle=carCol(tc||col,1.08);poly(t)}
function drawFurn(g,e){const sq=h=>[[h,h],[h,-h],[-h,-h],[-h,h]];
 if(e.k=='stl'){const S=projXY(e.x,e.z,2);g.fillStyle='rgba(0,0,0,.2)';g.beginPath();g.ellipse(S[0],S[1],10,4.5,0,0,6.3);g.fill();pris(g,e.x,e.z,sq(.17),2,2.42,'#7a4f26','#a8743c');return}
 const hx=.92,hz=.36,S=projXY(e.x,e.z,2);g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(S[0],S[1],38,14,0,0,6.3);g.fill();
 for(const q of [[-.8,-.26],[-.8,.26],[.8,-.26],[.8,.26]].sort((a,b)=>(a[0]+a[1])-(b[0]+b[1])))pris(g,e.x+q[0],e.z+q[1],sq(.05),2,2.55,'#5a3a1a');
 pris(g,e.x,e.z,[[hx,hz],[hx,-hz],[-hx,-hz],[-hx,hz]],2.55,2.68,'#8a5e2e','#d6a560');
 for(const q of e.seats)if(q.p&&q.p.sit)pris(g,q.x+.5,e.z-q.dz*.2,sq(.07),2.68,2.82,'#f4efe2','#8a4a1a')}
function drawCar(g,v0){const lo=v0.st=='park'?0:.18,x=v0.x-v0.dz*lo,z=v0.z+v0.dx*lo,hx=v0.dx,hz=v0.dz,pt=(u,w)=>[hx*u-hz*w,hz*u+hx*w],S=projXY(x,z,2);
 g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(S[0],S[1],22,9,0,0,6.3);g.fill();
 pris(g,x,z,[pt(.4,.2),pt(.4,-.2),pt(-.4,-.2),pt(-.4,.2)],2,2.3,v0.col);
 pris(g,x,z,[pt(.12,.16),pt(.12,-.16),pt(-.24,-.16),pt(-.24,.16)],2.3,2.55,'#9cc8e0',v0.col)}
// ---- boats & ships sailing around the island
const vess=[],BCOL=['#ffffff','#2a7de1','#e8453c'];
function vR(d){const a=N/2+d,r=5;return(8*(a-r)+2*Math.PI*r)/(2*Math.PI)}
function vpos(th,d){const a=N/2+d,r=5,m=a-r,L=2*m,A=Math.PI*r/2,P=4*L+4*A,R=P/(2*Math.PI);let u=((th*R)%P+P)%P,x,z;
 if(u<L){x=a;z=-m+u}else{u-=L;
 if(u<A){const f=u/r;x=m+r*Math.cos(f);z=m+r*Math.sin(f)}else{u-=A;
 if(u<L){x=m-u;z=a}else{u-=L;
 if(u<A){const f=Math.PI/2+u/r;x=-m+r*Math.cos(f);z=m+r*Math.sin(f)}else{u-=A;
 if(u<L){x=-a;z=m-u}else{u-=L;
 if(u<A){const f=Math.PI+u/r;x=-m+r*Math.cos(f);z=-m+r*Math.sin(f)}else{u-=A;
 if(u<L){x=-m+u;z=-a}else{u-=L;const f=1.5*Math.PI+u/r;x=m+r*Math.cos(f);z=-m+r*Math.sin(f)}}}}}}}
 return[N/2+x,N/2+z]}
function mkV(k,d,dir,th){vess.push({k:k,d:d,dir:dir,th:th,v:k=='ship'?.9:3.2,col:BCOL[vess.length%3]})}
function initVess(){vess.length=0;const n=GFX.q.vess;mkV('ship',11,1,.5);mkV('boat',6,1,2);mkV('boat',8,-1,4.5);if(n>=4)mkV('boat',5,1,5.6);if(n>=5)mkV('ship',15,-1,3.6);updVess(0)}
function updVess(dt){for(const v of vess){v.th+=v.dir*v.v/vR(v.d)*dt;const p=vpos(v.th,v.d),q=vpos(v.th+v.dir*.02,v.d),hx=q[0]-p[0],hz=q[1]-p[1],l=Math.hypot(hx,hz)||1;v.x=p[0];v.z=p[1];v.dx=hx/l;v.dz=hz/l}}
function drawV(g,v){const hx=v.dx,hz=v.dz,pt=(u,w)=>[hx*u-hz*w,hz*u+hx*w],sh=v.k=='ship',L=sh?1.4:.55,W=sh?.5:.22;
 const wk=[pt(-L,W*.8),pt(-L,-W*.8),pt(-L-(sh?3:2.2),0)].map(o=>projXY(v.x+o[0],v.z+o[1],1.3));
 g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.moveTo(wk[0][0],wk[0][1]);g.lineTo(wk[1][0],wk[1][1]);g.lineTo(wk[2][0],wk[2][1]);g.closePath();g.fill();
 if(sh){pris(g,v.x,v.z,[pt(L,W),pt(L,-W),pt(-L,-W),pt(-L,W)],1.3,1.65,'#8a3030');pris(g,v.x,v.z,[pt(.5,.34),pt(.5,-.34),pt(-.7,-.34),pt(-.7,.34)],1.65,2.05,'#f2f2f2');pris(g,v.x,v.z,[pt(-.1,.15),pt(-.1,-.15),pt(-.4,-.15),pt(-.4,.15)],2.05,2.45,'#c0392b')}
 else{pris(g,v.x,v.z,[pt(L,W),pt(L,-W),pt(-L,-W),pt(-L,W)],1.3,1.5,v.col);pris(g,v.x,v.z,[pt(.1,.15),pt(.1,-.15),pt(-.25,-.15),pt(-.25,.15)],1.5,1.78,'#9cc8e0',v.col)}}
function drawVess(front,z){for(const v of vess){if(v.x===undefined)continue;const q=rot(v.x,v.z,cam.ang);if(((q[0]+q[1])>=N)!==front)continue;const s=projXY(v.x,v.z,1.4);if(s[0]<cX-VW/2/z-120||s[0]>cX+VW/2/z+120||s[1]<cY-VH/2/z-120||s[1]>cY+VH/2/z+120)continue;drawV(ctx,v)}}
// ---- fishing
function edgeDir(x,z){const d=[[x,[-1,0]],[N-1-x,[1,0]],[z,[0,-1]],[N-1-z,[0,1]]];d.sort((a,b)=>a[0]-b[0]);return d[0][1]}
function fishSpot(){const ds=bl.filter(b=>b.t=='dock');if(!ds.length)return null;{const b=ds[Math.floor(rnd()*ds.length)];return{t:b.front,b:b}}const s=Math.floor(rnd()*4),t=3+Math.floor(rnd()*(N-6)),q=s==0?[t,1]:s==1?[t,N-2]:s==2?[1,t]:[N-2,t];return{t:nearestWalk(q[0],q[1]),b:null}}
function finishFish(p){p.state='idle';p.t=1+rnd();p.fd=null;
 if(rnd()<.85){const w=4+Math.floor(rnd()*4);p.wallet+=w;const fs=bl.filter(b=>b.t=='shop'&&b.g==3);if(fs.length){const s=fs[Math.floor(rnd()*fs.length)];s.stock=Math.min(12,s.stock+1)}const d=p.wk;if(d&&bl.includes(d)){const n=Math.min(d.cap,d.cash+1.5);gen+=n-d.cash;d.cash=n}p.bub={text:'🐟 +'+w,t:2}}else p.bub={text:'🎣 ...',t:2}}
function drawRod(g,e){const dx=e.fd[0],dz=e.fd[1],h=projXY(e.x,e.z,2.6),tip=projXY(e.x+dx*.7,e.z+dz*.7,3.1),w=projXY(e.x+dx*1.8,e.z+dz*1.8,1.45),bob=Math.sin(performance.now()/300+e.x)*1.2;
 g.strokeStyle='#6b4a22';g.lineWidth=1.6;g.beginPath();g.moveTo(h[0],h[1]);g.lineTo(tip[0],tip[1]);g.stroke();
 g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=.6;g.beginPath();g.moveTo(tip[0],tip[1]);g.lineTo(w[0],w[1]+bob);g.stroke();
 g.fillStyle='#e33';g.beginPath();g.arc(w[0],w[1]+bob,1.6,0,6.3);g.fill()}
// ---- 4-view rotation with smooth transition (sprite renderer = 4 sides)
let angT=0,prevAng=0;
function rotateView(dir){angT+=dir*Math.PI/4}
// ================= trees (cut for gold) =================
function ask(q,opts){$('dq').textContent=q;const o=$('do');o.innerHTML='';opts.forEach(op=>{const b=document.createElement('button');b.textContent=op[0];b.onclick=()=>{$('dlg').style.display='none';if(op[1])op[1]()};o.appendChild(b)});$('dlg').style.display='flex'}
const treeCost=()=>8+treeCut*3;
function askTree(i){const t=trees[i],c=treeCost();if(!own(t[0],t[1])){toast(tt('🔒 This land is not bought — first buy 🗺️ Land (more land as you level up), then you can cut trees'));return}ask(tt('🌳 Cut this tree?\nCost: 🪙')+c+tt('\n(the more trees you cut, the higher the price)'),[[tt('Cut 🪙')+c,()=>{if(coins<c){toast(tt('Not enough coins 🪙'));return}const k=trees.indexOf(t);if(k<0)return;coins-=c;treeCut++;trees.splice(k,1);stampAll();hud();save()}],[tt('Never mind'),null]])}
function bAt(x,y){for(let h=0;h<=224;h+=16){const t=tileAt(x,y+h*cam.zoom);if(t[0]<0||t[1]<0||t[0]>=N||t[1]>=N)continue;const b=bl.find(b=>{const it=ITEM[b.t],m=isH(it)?1:0;return t[0]>=b.x-m&&t[0]<=b.x+it.w-1+m&&t[1]>=b.z-m&&t[1]<=b.z+it.d-1+m});if(b)return b}return null}
function treeAtScr(x,y){for(let h=0;h<=224;h+=16){const t=tileAt(x,y+h*cam.zoom),i=trees.findIndex(q=>q[0]==t[0]&&q[1]==t[1]);if(i>=0)return i}return -1}
// ================= move / rotate =================
function startMove(b){const it=ITEM[b.t];mv={b:b,i:bl.indexOf(b),x:b.x,z:b.z,f:b.f};bl.splice(mv.i,1);people.forEach(p=>{if(p.stall===b)p.hidden=true});stampAll();facing=b.f;pend={it:it,x:b.x,z:b.z,mv:b};sel=null;updCf()}
function endMove(ok){const m=mv;if(!m)return;const b=m.b;if(ok){b.x=pend.x;b.z=pend.z;b.f=facing}else{b.x=m.x;b.z=m.z;b.f=m.f}bl.splice(m.i,0,b);people.forEach(p=>{if(p.stall===b)p.hidden=false});mv=null;pend=null;stampAll();syncCh();updCf();save()}
function rotateSel(){const b=sel,it=ITEM[b.t];if(!(isH(it)||b.t=='shop'||b.t=='tea')){toast(tt('This cannot be rotated'));return}const f=(b.f+1)%(isH(it)?4:2),i=bl.indexOf(b);bl.splice(i,1);stampAll();const ok=canPlace(it,b.x,b.z,f);if(ok)b.f=f;bl.splice(i,0,b);stampAll();if(!ok)toast(tt('No room to rotate ✖'));save()}
// ================= build time, pens, mine, needs, incidents =================
const bTime=it=>Math.min(7200,Math.round(20*Math.pow(1.32,it.lv-1)*(1+.03*(level-1))));   // min 20s; grows with the item's level + your level; max 2h
function fmtT(s){s=Math.ceil(s);return s<60?s+'s':s<3600?Math.floor(s/60)+'m '+(s%60)+'s':Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'m'}
function doneB(b){const it=ITEM[b.t];if(it.res)spawnRes(b);if(b.t=='shop'||b.t=='tea')mkMerch(b);if(it.wk)spawnWk(b,b.t=='mine'?2:1);if(b.t=='bus')spawnBus(b);syncCh()}
function spawnWk(b,n){for(let i=0;i<n;i++){if(people.length>=MAXPOP+40)break;const Lk=mkLook(false);Lk.apron=b.t=='mine'?'#777':'#3a8a4a';people.push({x:b.front[0]+.5,z:b.front[1]+.5,path:null,pi:0,state:'idle',t:1+i*2+rnd()*2,look:Lk,home:b,job:b,spd:1.2+rnd()*.3,face:{sx:1,sy:1},fr:rnd()*6,alpha:0,ox:(rnd()-.5)*.36,oz:(rnd()-.5)*.36,bub:null,hidden:true,sleep:false,wallet:6,going:false})}}
function pen(x0,z0,t){const f=t=='ffarm',m=t=='mine';
 for(let z=z0;z<z0+4;z++)for(let x=x0;x<x0+5;x++){const e=x==x0||x==x0+4||z==z0||z==z0+3;
  if(m){st(x,1,z,e?COB:MINEH);if(e)st(x,2,z,STONE)}
  else if(f){if(e){st(x,1,z,PLK);if((x==x0||x==x0+4)&&(z==z0||z==z0+3))st(x,2,z,LOG)}else st(x,1,z,WAT)}
  else{st(x,1,z,DIRT);if(e)st(x,2,z,PLK)}}
 st(x0+2,2,z0+3,0);st(x0+2,1,z0+3,f?PLK:PATH);st(x0+2,1,z0+4,PATH);st(x0+4,2,z0+4,t=='gfarm'?CRATE:HAY);if(m){st(x0,3,z0,LOG);st(x0+4,3,z0,LOG);st(x0,3,z0+3,LOG);st(x0+4,3,z0+3,LOG)}}

// ================= ads for time/build skips (Adsgram init ad, else GigaPub — chosen by the app, index.html) =================
// Only game-side perks (night->morning, -5 min build time). Limits keep ads from being too many: cooldown + daily cap.
const AD_CD=90000,AD_DAY_MAX=12,AUTO_CD=240000,AUTO_MAX=6;let adReq=null,placedN=0;   // skips: 12/day + 90s gap · auto (natural-break) ads: 6/day + 4 min gap — the SERVER enforces the same numbers
function adQuota(){const d=new Date().toISOString().slice(0,10);let o=null;try{o=JSON.parse(LS('bv_adq'))}catch(e){}if(!o||o.d!==d)o={d:d,n:0,t:0,an:0,at:0};return o}
function gameAd(kind,onOk){const q=adQuota(),now=Date.now();
 if(adReq){toast(tt('📺 Loading ad…'));return}
 if(q.n>=AD_DAY_MAX){toast(tt('📺 Ad skips for today are used up (')+AD_DAY_MAX+tt(') — come back tomorrow'));return}
 if(now-q.t<AD_CD){toast(tt('⏳ Next ad in ')+Math.ceil((AD_CD-(now-q.t))/1000)+tt(' seconds'));return}
 const id=now+'_'+Math.random().toString(36).slice(2,7);adReq={id:id,kind:kind,ok:onOk};toast(tt('📺 Loading ad…'));
 try{parent.postMessage({type:'GAME_AD_REQUEST',id:id,kind:kind},location.origin)}catch(e){adReq=null;toast(tt('Ads are not available right now'));return}
 setTimeout(()=>{if(adReq&&adReq.id===id)adReq=null},150000)}
function autoAd(why){if(adReq||tmode||level<3||document.hidden)return;const q=adQuota(),now=Date.now();if((q.an|0)>=AUTO_MAX||now-(q.at|0)<AUTO_CD||now-(q.t|0)<30000)return;
 const id=now+'_a'+Math.random().toString(36).slice(2,6);adReq={id:id,kind:'auto',ok:()=>{}};
 try{parent.postMessage({type:'GAME_AD_REQUEST',id:id,kind:'auto',why:why},location.origin)}catch(e){adReq=null;return}
 setTimeout(()=>{if(adReq&&adReq.id===id)adReq=null},150000)}
function skipNightAsk(){if(tmode)return;
 if(night>.5)ask(tt('🌙 It is night.\n📺 Watch one ad and morning comes right away.\n(If you do not watch, morning will come by itself)'),[[tt('📺 Watch an ad for morning'),()=>gameAd('night',()=>{tmode=1;toast(tt('🌅 Morning is coming…'))})],[tt('I will wait'),null]]);
 else{const left=Math.max(0,Math.round((.7722-tod)*CYC/60));toast(tt('☀ It is day — night comes in about ')+left+tt(' minutes (when it is night you can watch an ad to make it morning)'))}}
let adBusy=0,claimB=null;
function advMine(b,d){if(b.t!='mine'||b.bt>0)return;if(!b.mst||b.mst=='off'&&!(b.bank>0)){b.mst='run';b.mt=7200}if(b.mt===undefined)b.mt=7200;if(b.bank===undefined)b.bank=0;
 while(d>0&&b.mst=='run'){if(d<b.mt){b.mt-=d;d=0}else{d-=b.mt;b.bank=1;b.mst='ready';b.mt=0}}}
function claimMine(b){if(!(b.bank>0)){toast(tt('⛏ Mining in progress, remaining ')+fmtT(b.mt));return}if(adBusy)return;adBusy=1;claimB=b;toast(tt('📺 Loading ad…'));
 try{parent.postMessage({type:'GAME_MINE_CLAIM'},location.origin)}catch(e){adBusy=0;claimB=null;return}
 setTimeout(()=>{if(adBusy&&claimB===b){adBusy=0;claimB=null}},120000)}
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent)return;const d=e.data;if(!d||typeof d!=='object')return;
 if(d.type==='GAME_GM'){gm=+d.balance||0;hud();const L=(+d.mineLeftMs||0)/1000;if(L>0)bl.forEach(b=>{if(b.t=='mine'&&!(b.bt>0)&&(b.mst=='ready'||b.mt<L)){b.bank=0;b.mst='run';b.mt=L}})}
 else if(d.type==='GAME_SAVE_NOW'){save()}
  else if(d.type==='GAME_LANG'){setGameLang(d.lang)}
  else if(d.type==='GAME_AD_RESULT'){const r=adReq;if(!r||r.id!==d.id)return;adReq=null;if(d.ok){const q=adQuota();if(r.kind=='auto'){q.an=(q.an|0)+1;q.at=Date.now()}else{q.n++;q.t=Date.now()}LSet('bv_adq',JSON.stringify(q));r.ok()}else if(r.kind!='auto')toast(d.msg||tt('Ad not available, please try again a bit later'))}
 else if(d.type==='GAME_MINE_RESULT'){adBusy=0;const b=claimB;claimB=null;
  if(d.ok){gm=+d.balance||gm;if(b&&bl.includes(b)){b.bank=0;b.mst='run';b.mt=7200}hud();save();toast('💠 +'+d.amount+tt(' GM$ claimed! Mining restarted'))}
  else if(d.retryAfterMs&&b&&bl.includes(b)){b.bank=0;b.mst='run';b.mt=Math.max(1,Math.ceil(d.retryAfterMs/1000));toast(tt('⛏ Mining in progress, remaining ')+fmtT(b.mt))}
  else toast(d.msg||tt('Claim failed, please try again'))}});
function bInfo(b){if(b.bt>0){const c=Math.max(5,Math.ceil(b.bt/6));ask('🔨 '+ITEM[b.t].n+tt(' is being built\nRemaining: ')+fmtT(b.bt),[[tt('📺 Watch an ad to cut 5 minutes'),()=>gameAd('build',()=>{if(bl.includes(b)&&b.bt>0){b.bt=Math.max(.01,b.bt-300);toast(tt('⏩ 5 minutes saved'));save()}})],[tt('⏩ Finish now 🪙')+c,()=>{if(coins<c){toast(tt('Not enough coins 🪙'));return}coins-=c;b.bt=.01;hud()}],[tt('I will wait'),null]])}
 else{const t=b.mst=='run'?tt('Mining in progress, batch finishes in ')+fmtT(b.mt):tt('✅ Mining done! 💠 GM$ ready — watch an ad to claim and restart');ask(tt('⛏ Mine\n')+t+tt('\nEvery 2 hours 20–40 GM$ (the exact number is decided by the server).'),[b.bank>0?[tt('📺 Watch an ad and claim'),()=>claimMine(b)]:[tt('OK'),null],[tt('Close'),null]])}}
const LIMT={fence:[24,8],well:[2,.6],pole:[2,.6],h4:[3,.8],h6:[0,.4],shop:[1,.5],tea:[1,.2],table:[2,.6],farm:[1,.3],cfarm:[1,.2],gfarm:[1,.2],ffarm:[1,.15],mine:[1,0],dock:[1,.15],fount:[1,.1],park:[1,.2],police:[1,.05],gas:[1,.05],fire:[1,.05],hosp:[1,.05],port:[1,0],camp:[1,.15],bus:[1,.08],school:[1,.06],lamp:[4,1.5],bench:[3,1]};
const limOf=id=>LIMT[id]?LIMT[id][0]+Math.floor(level*LIMT[id][1]):1e9,limTxt=it=>it.id=='road'?'<br>'+roads.size+'/'+PATHLIM():LIMT[it.id]?'<br>'+bl.filter(b=>b.t==it.id).length+'/'+limOf(it.id):'';
let portV=null;
function portTick(dt){const pt=bl.find(b=>b.t=='port'&&!b.bt);if(!pt){if(portV){const i=vess.indexOf(portV);if(i>=0)vess.splice(i,1);portV=null}return}
 if(!portV||!vess.includes(portV)){portV={k:'ship',d:3,dir:1,th:0,v:.9,col:'#fff',done:0};vess.push(portV);updVess(0)}
 if(portV.x===undefined)return;if(Math.hypot(portV.x-pt.cx,portV.z-pt.cz)<7){if(!portV.done){portV.done=1;for(const q of bl)if(q.t=='shop'&&!q.bt)q.stock=Math.min(18,q.stock+5);const n=Math.min(pt.cap,pt.cash+10+level);gen+=n-pt.cash;pt.cash=n;toast(tt('🚢 Imported goods arrived by ship! All shop stocks increased, port duty collected'))}}else portV.done=0}
// ================= builders · water · electricity · NPC status =================
// BUILDERS: 1 free builder at the start, 2nd at Lv10, 3rd at Lv20, 4th at Lv40. Each builder works on one building at a time;
// extra buildings wait in line (oldest first) and their timer only runs once a builder is free.
const builders=()=>1+(level>=10)+(level>=20)+(level>=40);
function buildSim(g,fin){const G=g,idle=bl.filter(b=>!(b.bt>0));let n=0;while(g>1e-6&&n++<600){const q=bl.filter(b=>b.bt>0).slice(0,builders());if(!q.length)break;const st=Math.min(g,...q.map(b=>b.bt));q.forEach(b=>{b.bt-=st});g-=st;q.forEach(b=>{if(b.bt<=1e-6){b.bt=0;fin(b,g)}})}idle.forEach(b=>advMine(b,G))}
// UTILITIES: a Well serves up to 4 houses within 14 tiles, a Power Pole up to 6 houses within 12 tiles (houses are served nearest-first until the capacity is used).
let U={houses:0,pop:0,water:0,power:0,health:0,needs:100,lack:[],wells:0,poles:0,sick:0};
function takeSrc(src,h,R){let best=null,bd=1e9;for(const s of src){if(s.left<=0||s.b.cx===undefined||h.cx===undefined)continue;const d=Math.hypot(s.b.cx-h.cx,s.b.cz-h.cz);if(d<=R&&d<bd){bd=d;best=s}}if(best){best.left--;return true}return false}
function calcUtil(){const hs=bl.filter(b=>ITEM[b.t].res&&!b.bt),ws=bl.filter(b=>b.t=='well'&&!b.bt).map(b=>({b:b,left:ITEM.well.wcap})),ps=bl.filter(b=>b.t=='pole'&&!b.bt).map(b=>({b:b,left:ITEM.pole.pcap}));
 const sick=new Set(incs.filter(c=>c.k=='sick').map(c=>c.b)),hosp=bl.some(b=>b.t=='hosp'&&!b.bt),needPow=level>=3;let pop=0,wp=0,pp=0,hp=0;
 for(const h of hs){const n=ITEM[h.t].res,w=takeSrc(ws,h,ITEM.well.wr),p=takeSrc(ps,h,ITEM.pole.pr);pop+=n;if(w)wp+=n;if(p)pp+=n;hp+=n*Math.max(0,Math.min(100,100-(w?0:35)-(needPow&&!p?10:0)-(sick.has(h)?30:0)+(hosp?8:0)))}
 U.houses=hs.length;U.pop=pop;U.water=pop?Math.round(100*wp/pop):0;U.power=pop?Math.round(100*pp/pop):0;U.health=pop?Math.round(hp/pop):0;U.wells=ws.length;U.poles=ps.length;U.sick=sick.size;
 const L=needList();U.needs=L.length?Math.round(100*L.filter(n=>n.ok).length/L.length):100;U.lack=L.filter(n=>!n.ok).map(n=>n.l)}
function needList(){const c=t=>bl.filter(b=>b.t==t&&!b.bt).length,hs=U.houses,pop=people.filter(p=>!p.merch&&!p.tmp&&!p.job).length;
 return [{l:tt('🏪 Shops'),ok:(c('shop')+c('tea'))*5>=pop},{l:tt('💧 Water (build a Well)'),ok:U.water>=90},level>=3&&{l:tt('💡 Lamps'),ok:c('lamp')>=hs},level>=3&&{l:tt('⚡ Electricity (build a Power Pole)'),ok:U.power>=90},level>=5&&{l:tt('🪑 Benches / ⛲ Fountain'),ok:c('bench')+c('fount')*3>=Math.ceil(hs/2)},level>=7&&{l:tt('🥚 Farm'),ok:!!(c('cfarm')||c('gfarm'))}].filter(Boolean)}
function needs(){calcUtil();if(!U.houses)return;const w=U.lack;rep=Math.max(0,Math.min(100,rep+(w.length?-1.5*w.length:.8)+.4*bl.filter(b=>b.t=='school'&&!b.bt).length));if(w.length)toast(tt('😟 NPCs want: ')+w.join(', '))}
// the small status panel (top-left) + builder pill
const STATROWS=[['❤️',tt('Health')],['😊',tt('Happy')],['📋',tt('Needs')],['💧',tt('Water')],['⚡',tt('Power')]];let statC='',utT=0;
(function(){const s=document.getElementById('stat');STATROWS.forEach(r=>{const d=document.createElement('div');d.className='sr';d.innerHTML='<i>'+r[0]+'</i><u><s></s></u><em>--</em>';s.appendChild(d)})})();
function renderStat(){const has=U.houses>0,v=[has?U.health:null,Math.round(rep),has?U.needs:null,has?U.water:null,has?U.power:null],key=v.join(',')+'|'+builders()+'|'+bl.filter(b=>b.bt>0).length;if(key==statC)return;statC=key;
 const rows=$('stat').children;v.forEach((x,i)=>{const r=rows[i],f=r.children[1].firstChild,t=r.children[2];if(x===null){f.style.width='0%';t.textContent='--';return}f.style.width=x+'%';f.style.background=x>=66?'#5cc85c':x>=33?'#e8c030':'#e05050';t.textContent=x+'%'});
 const nb=bl.filter(b=>b.bt>0).length,nB=builders();$('bld').textContent='👷 '+Math.min(nb,nB)+'/'+nB+(nb>nB?'  ⏳'+(nb-nB):'')}
function statInfo(){calcUtil();const L=needList();ask(tt('🏝 Island status\n👥 NPCs: ')+U.pop+tt(' · 🏠 Houses: ')+U.houses+tt('\n❤️ Average health: ')+(U.houses?U.health+'%':'--')+(U.sick?' (🤒 '+U.sick+tt(' sick)'):'')+tt('\n😊 Happy: ')+Math.round(rep)+tt('%\n📋 Needs met: ')+(U.houses?U.needs+'%':'--')+tt('\n💧 Water: ')+(U.houses?U.water+'%':'--')+tt(' (💧 Wells: ')+U.wells+tt(' — each serves 4 houses)\n⚡ Electricity: ')+(U.houses?U.power+'%':'--')+tt(' (⚡ Poles: ')+U.poles+tt(' — each serves 6 houses)')+(U.houses&&U.lack.length?tt('\n\n😟 Missing: ')+U.lack.join(', '):U.houses?tt('\n\n✅ All needs met!'):tt('\n\nBuild houses first')),[[tt('OK'),null]])}
function builderInfo(){const nb=bl.filter(b=>b.bt>0).length,nB=builders(),nx=[10,20,40].find(L=>level<L);ask(tt('👷 Builders: ')+nB+tt(' (busy ')+Math.min(nb,nB)+')'+(nb>nB?tt('\n⏳ Waiting in line: ')+(nb-nB)+tt(' building(s)'):'')+tt('\n\nEach builder works on one building at a time.\n1st: from the start · 2nd: Lv10 · 3rd: Lv20 · 4th: Lv40')+(nx?tt('\n\nNext builder: Level ')+nx+'':tt('\n\n🏆 All builders unlocked!')),[[tt('OK'),null]])}
const INC_LV={thief:17,fire:21,sick:24},SVC={thief:['police','#2a5de0'],fire:['fire','#e02020'],sick:['hosp','#ffffff']};let incs=[],incT=90;
function nearRd(x,z){let best=-1,bd=1e9;for(let k=0;k<N*N;k++)if(rd[k]==2){const d=Math.abs(k%N-x)+Math.abs((k/N|0)-z);if(d<bd){bd=d;best=k}}return best}
function sendResp(c,sv){c.fb=16;const a=nearRd(sv.front[0],sv.front[1]),t=nearRd(c.b.out[0],c.b.out[1]);if(a<0||t<0||a==t)return;const p=carPath(a,t);if(!p||!p.length)return;cars.push({x:a%N+.5,z:(a/N|0)+.5,ck:a,nk:-1,dx:1,dz:0,st:'drive',col:SVC[c.k][1],path:p,wait:0,cool:99,spd:2.8,resp:c})}
function resolveInc(c){const i=incs.indexOf(c);if(i<0)return;incs.splice(i,1);cars.filter(v=>v.resp===c).forEach(killCar);rep=Math.min(100,rep+3);addXp(20);hud();toast({thief:tt('👮 The police caught the thief!'),fire:tt('🚒 The fire is out!'),sick:tt('🚑 The patient is at the hospital, recovering!')}[c.k])}
function failInc(c){const l=Math.min(Math.floor(coins),Math.round((60+level*12)*(c.k=='fire'?2:1)));coins-=l;rep=Math.max(0,rep-(c.k=='sick'?5:8));hud();toast({thief:tt('🦹 A thief stole 🪙')+l+tt(' and escaped! ⭐ dropped (build a Police Station)'),fire:tt('🔥 A house burned down! 🪙-')+l+tt(' (build a Fire Station)'),sick:tt('🤒 A patient is suffering! ⭐ dropped (build a Hospital)')}[c.k])}
function incTick(dt){incT-=dt;
 if(incT<=0){incT=80+rnd()*80;if(rep<65&&incs.length<2){const ks=Object.keys(INC_LV).filter(k=>level>=INC_LV[k]),hs=bl.filter(b=>ITEM[b.t].res&&!b.bt);if(ks.length&&hs.length&&rnd()<(70-rep)/45){const k=ks[Math.floor(rnd()*ks.length)];incs.push({k:k,b:hs[Math.floor(rnd()*hs.length)],t:70,go:0,fb:16});toast({thief:tt('🦹 A thief broke into a house!'),fire:tt('🔥 A house is on fire!'),sick:tt('🤒 Someone has fallen sick!')}[k])}}}
 for(const c of incs.slice()){if(!bl.includes(c.b)){incs.splice(incs.indexOf(c),1);continue}c.t-=dt;
  if(!c.go){const sv=bl.find(b=>b.t==SVC[c.k][0]&&!b.bt);if(sv){c.go=1;sendResp(c,sv)}}
  else{c.fb-=dt;if(c.fb<=0){resolveInc(c);continue}}
  if(c.t<=0){incs.splice(incs.indexOf(c),1);failInc(c)}}}
let eAcc=0,busT=0;
function spawnBus(b){if(cars.some(c=>c.bus===b))return;const a=nearRd(b.front[0],b.front[1]);if(a<0)return;cars.push({x:a%N+.5,z:(a/N|0)+.5,ck:a,nk:-1,dx:1,dz:0,st:'drive',col:'#f5c518',path:null,wait:0,cool:1e9,spd:2.2,bus:b})}
function busTick(dt){busT-=dt;if(busT>0)return;busT=10;cars.filter(c=>c.bus&&!bl.includes(c.bus)).forEach(killCar);for(const b of bl)if(b.t=='bus'&&!b.bt)spawnBus(b)}
// ================= levels (1-60) =================
// 17 Nov 2026: the game is meant to last a MONTH or more — levels go to 60 and every level needs more XP than before (about 5x slower at Lv30).
const MAXLV=60,OLDLVX=L=>250*(L-1)*(L-1),LVX=L=>Math.round(250*(L-1)*(L-1)*(1+.15*(L-1))),GL=[1,2,4,6,22,16,12,9],lmul=()=>1+.03*(level-1);
function lvOf(x){let l=1;while(l<MAXLV&&x>=LVX(l+1))l++;return l}
function addXp(n){if(level>=MAXLV||n<=0)return;xp+=n;const nl=lvOf(xp);if(nl>level){const old=level;level=nl;onLevel(old)}hud()}
function onLevel(old){const un=[];[10,20,40].forEach(L=>{if(L>old&&L<=level)un.push(tt('👷 New builder (')+builders()+tt(' total)'))});CAT.forEach(i=>{if(i.lv>old&&i.lv<=level)un.push(i.e+' '+i.n)});GL.forEach((g,i)=>{if(g>old&&g<=level)un.push(GN[i][0]+' '+tt(GN[i][1])+tt(' shop'))});if(land<LMAX&&landReq(land+1)>old&&landReq(land+1)<=level)un.push(tt('🗺️ New land (Land button)'));
 const rw=100*level;coins+=rw;refreshBar();hud();save();
 ask(tt('🎉 Level ')+level+'!\n'+(un.length?tt('Unlocked: ')+un.join(', ')+'\n':'')+'🪙 +'+rw+tt(' reward\n📈 Income +')+(3*(level-1))+'%'+(level>=MAXLV?tt('\n🏆 Max level!'):''),[[tt('Awesome!'),()=>setTimeout(()=>autoAd('level'),400)]])}
// ================= roads: drag line, pay, bulldozer =================
function lineTiles(a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=[];if(Math.abs(dx)>=Math.abs(dz)){const s=Math.sign(dx)||1;for(let x=a[0];x!=b[0]+s;x+=s)t.push([x,a[1]])}else{const s=Math.sign(dz);for(let z=a[1];z!=b[1]+s;z+=s)t.push([a[0],z])}return t}
function wideTiles(a,b){const t=lineTiles(a,b),h=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1]);return t.concat(t.map(q=>h?[q[0],q[1]+1]:[q[0]+1,q[1]]))}
function setRline(a,b){const T=tool.rt,ts=(tool.wide?wideTiles(a,b):lineTiles(a,b)).map(q=>{const k=q[1]*N+q[0],w=tileWhy(q[0],q[1],{});return{x:q[0],z:q[1],ok:!w,same:!w&&rd[k]==T,why:w}});
 rline={t:tool,tiles:ts,cost:ts.filter(q=>q.ok&&!q.same).length*tool.c};updCf()}
function putRoad(x,z,T){const k=z*N+x;if(rd[k]==1)roads.delete(k);if(rd[k]==2)mains.delete(k);(T==1?roads:mains).add(k);rd[k]=T;st(x,1,z,T==1?((x+z)%7==0?PATH2:PATH):ASPH);DECT.delete(k);tileUpd(x,z)}
const PATHLIM=()=>40+level*15;
function buyLine(){const r=rline;if(!r)return;const n=r.tiles.filter(q=>q.ok&&!q.same);if(!n.length){toast(tt('Nothing to buy here'));return}if(r.t.rt==1){const lim=PATHLIM(),cur=roads.size;if(cur+n.length>lim){toast(tt('🚫 Walking Path limit ')+lim+tt(' tiles (now ')+cur+tt(') — level up to raise the limit'));return}}
 if(coins<r.cost){toast(tt('Not enough coins 🪙 need ')+r.cost);return}
 coins-=r.cost;n.forEach(q=>putRoad(q.x,q.z,r.t.rt));addXp(r.cost*.3);rline=null;hud();save();updCf();toast(tt('Road bought ✔')+((m=>m?' · 🔴 '+m+tt(' red tiles were skipped'):tt(' (no refund, 🚜 needed to demolish)'))(r.tiles.filter(q=>!q.ok).length)))}
function dozeRoad(x,z){if(!inb(x,z))return;const k=z*N+x;if(!rd[k])return;const fee=rd[k]==2?10:4;if(coins<fee){toast(tt('Not enough coins 🪙'));return}coins-=fee;roads.delete(k);mains.delete(k);rd[k]=0;st(x,1,z,grd(x,z));tileUpd(x,z);hud();save()}
function dozeAsk(b){const it=ITEM[b.t],fee=Math.max(5,Math.round(it.c*.25));ask('🚜 '+it.e+' '+it.n+tt(' demolish?\nCost 🪙')+fee+tt(' (no refund at all)'),[[tt('Demolish 🪙')+fee,()=>{if(coins<fee){toast(tt('Not enough coins 🪙'));return}coins-=fee;removeB(b,1)}],[tt('Never mind'),null]])}
// ================= UI / coins / save =================
const $=id=>document.getElementById(id),cEl=$('coins');
function toast(m){const t=$('toast');t.textContent=m;t.style.opacity=1;clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.opacity=0,2800)}
function clockTxt(){const y=1+Math.floor((day-1)/360),m=1+Math.floor((day-1)%360/30),d=1+(day-1)%30;const hh=Math.floor(tod*24),mi=Math.floor(tod*1440%60);return(WINTER?'❄':'🌞')+(night>.6?'🌙':light>.85?'☀':(tod<.5?'🌅':'🌇'))+' '+String(hh).padStart(2,'0')+':'+String(mi).padStart(2,'0')+' M'+m+' D'+d+(tmode?' ⏩':'')}
function updQBtn(){const b=$('bQ');if(!b)return;b.textContent=GFX.q.icon;b.setAttribute('data-m',GFX.mode);b.classList.toggle('on',GFX.mode!=='auto')}
GFX.onChange((t,why)=>{resize();initVess();chunksDirtyAll();if(why==='slow'||why==='manual'||why==='idle')chunksFreeAll();updQBtn();if(why==='slow')toast(tt('⚡ Slow device — graphics changed to ')+t.toUpperCase())});
function hud(){cEl.textContent='🪙 '+Math.floor(coins);$('gm').textContent='💠 GM$ '+(Math.round(gm*100)/100);{const lv=$('lv'),a=LVX(level),b=LVX(level+1),pc=level>=MAXLV?100:Math.max(0,Math.min(100,Math.round((xp-a)/(b-a)*100)));lv.textContent='🏅 Lv '+level+(level>=MAXLV?' MAX':'  '+pc+'%');lv.style.background='linear-gradient(90deg,rgba(255,213,74,.5) '+pc+'%,rgba(24,18,10,.7) '+pc+'%)'}$('pop').textContent='👥 '+people.filter(p=>!p.merch&&!p.tmp).length+'  ⭐ '+Math.round(rep);const b=$('bC');if(b)b.innerHTML='<b>📜</b>'+(cmps.length||'')}
function earn(n,x,y){if(n<=0)return;coins+=n;addXp(n*.25);hud();floaters.push({s:'+'+n,x:x,y:y,t:1.2});}
function saveSoon(){if(window.requestIdleCallback)requestIdleCallback(()=>save(),{timeout:3000});else setTimeout(save,60)}
function save(){LSet('bv2',JSON.stringify({v:2,lv:level,tut:tut,c:coins,rep:rep,day:day,tod:tod,rate:rate,t:Date.now(),trees:trees,roads:[...roads],mains:[...mains],tc:treeCut,land:land,xp:xp,n:N,bl:bl.map(b=>({t:b.t,x:b.x,z:b.z,f:b.f,s:b.s,g:b.g,cash:b.cash,stock:b.stock,bt:b.bt,mst:b.mst,mt:b.mt,bank:b.bank}))}))}
addEventListener('pagehide',save);addEventListener('visibilitychange',()=>{if(document.hidden)save()});
function loadGame(){let s=null;try{s=JSON.parse(LS('bv2'))}catch(e){}
 if(s&&s.bl){tut=s.tut!==undefined?s.tut:99;coins=s.c;rep=s.rep;day=s.day;tod=s.tod;rate=s.rate||0;const o0=s.n||80,mg=o0!==N,O=(N-o0)>>1,mk=k=>mg?(((k/o0|0)+O)*N+(k%o0)+O):k;trees=(s.trees||[]).map(t=>mg?[t[0]+O,t[1]+O,t[2]]:t);roads=new Set((s.roads||[]).map(mk));mains=new Set((s.mains||[]).map(mk));if(mg)for(let i=0;i<320;i++){const x=6+Math.floor(rnd()*(N-12)),z=6+Math.floor(rnd()*(N-12));if(x>=O-1&&x<O+o0+1&&z>=O-1&&z<O+o0+1)continue;if(!trees.some(t=>Math.abs(t[0]-x)<2&&Math.abs(t[1]-z)<2))trees.push([x,z,rnd()<.3])}treeCut=s.tc||0;bl=s.bl.map(o=>Object.assign({id:uid++,cash:0,stock:6,rt:5,g:0,f:0,s:0},mg?Object.assign({},o,{x:o.x+O,z:o.z+O}):o));
  if(s.land!==undefined)land=s.land;else{let d=0;const ex=b=>{const it=ITEM[b.t];if(b.t=='dock'||b.t=='port')return;d=Math.max(d,Math.abs(b.x-N/2),Math.abs(b.x+it.w-N/2),Math.abs(b.z-N/2),Math.abs(b.z+it.d-N/2))};bl.forEach(ex);[...roads,...mains].forEach(k=>{d=Math.max(d,Math.abs(k%N+.5-N/2)+1,Math.abs(((k/N)|0)+.5-N/2)+1)});land=Math.max(0,Math.min(LMAX,Math.ceil((d-10)/3)))}
  xp=s.xp!==undefined?s.xp:bl.reduce((a,b)=>a+ITEM[b.t].c*.3,0)+roads.size*.6+mains.size*1.8;
  if(s.v!==2){let ol=1;while(ol<30&&xp>=OLDLVX(ol+1))ol++;const fr=ol>=30?0:Math.max(0,Math.min(1,(xp-OLDLVX(ol))/(OLDLVX(ol+1)-OLDLVX(ol))));xp=LVX(ol)+fr*(LVX(ol+1)-LVX(ol))}   // old saves keep their level
  level=lvOf(xp);const away=Math.min((Date.now()-s.t)/1000,28800),aw7=Math.min((Date.now()-s.t)/1000,604800);buildSim(aw7,(b,l)=>advMine(b,l));if(away>120&&rate>0){const g=Math.floor(away/60*rate*.4);if(g>0){coins+=g;toast(tt('Offline income while away +')+g+' 🪙')}}}
 else{for(let i=0;i<420;i++){const x=6+Math.floor(rnd()*(N-12)),z=6+Math.floor(rnd()*(N-12)),inner=Math.abs(x-N/2)<14&&Math.abs(z-N/2)<14;if(inner&&rnd()<.93)continue;if(!trees.some(t=>Math.abs(t[0]-x)<2&&Math.abs(t[1]-z)<2))trees.push([x,z,rnd()<.3])}
  tut=0}
 stampAll();for(const b of bl)if(!b.bt)doneB(b);initVess();refreshBar();hud()}
// build bar
const bar=$('bar');
function mkBtn(h,c){const b=document.createElement('button');b.className='it'+(c?' '+c:'');b.innerHTML=h;return b}
const bC=mkBtn('<b>📜</b>');bC.id='bC';bC.onclick=()=>{if(cmps[0])openCmp(cmps[0]);else toast(tt('No complaints right now 🙂'))};bar.appendChild(bC);
CAT.forEach(it=>{const b=mkBtn('<b>'+it.e+'</b>'+it.n+(it.c?' '+it.c:''));b.dataset.id=it.id;b.onclick=()=>setTool(it.id);bar.appendChild(b)});
const bLd=mkBtn('');bLd.id='bLd';bar.insertBefore(bLd,bC.nextSibling);
function updLandBtn(){const s=land+1;if(land>=LMAX){bLd.innerHTML='<b>🗺️</b>'+tt('Land MAX');bLd.style.opacity=.7}else if(level<landReq(s)){bLd.innerHTML='<b>🔒</b>'+tt('Land Lv')+landReq(s);bLd.style.opacity=.55}else{bLd.innerHTML='<b>🗺️</b>'+tt('Land')+' '+landCost(s);bLd.style.opacity=1}}
function landAsk(){if(land>=LMAX){toast(tt('🏆 The whole island is yours!'));return}const s=land+1,c=landCost(s),r=LR(s)*2,r0=LR(land)*2;
 if(level<landReq(s)){ask(tt('🔒 The next land unlocks at Level ')+landReq(s)+tt('\n(you are now Level ')+level+tt(')\nLand size: ')+r0+'×'+r0+' → '+r+'×'+r,[[tt('OK'),null]]);return}
 ask(tt('🗺️ Expand your land?\nSize: ')+r0+'×'+r0+' → '+r+'×'+r+tt('\nCost: 🪙')+c+tt('\n(you will be able to cut trees on the new land too)'),[[tt('Buy 🪙')+c,()=>{if(coins<c){toast(tt('Not enough coins 🪙'));return}coins-=c;land=s;chunksDirtyAll();addXp(c*.15);hud();refreshBar();save();toast(tt('🗺️ New land bought!'));setTimeout(()=>autoAd('land'),2500)}],[tt('Never mind'),null]])}
bLd.onclick=landAsk;
function refreshBar(){updLandBtn();for(const b of bar.children){const it=ITEM[b.dataset.id];if(!it)continue;const lk=it.lv>level;b.innerHTML=lk?'<b>🔒</b>'+it.n+' Lv'+it.lv:'<b>'+it.e+'</b>'+it.n+(it.c?' '+it.c:'')+limTxt(it);b.style.opacity=lk?.55:1}}refreshBar();
function subRow(){const s=$('sub');s.innerHTML='';if(!tool||tool.id!='shop'){s.style.display='none';return}s.style.display='flex';GN.forEach((g,i)=>{const lk=GL[i]>level,b=mkBtn('<b>'+(lk?'🔒':g[0])+'</b>'+(lk?'Lv'+GL[i]:'🪙'+priceOf(i)),i==shopG?'on':'');b.onclick=()=>{if(lk){toast(tt('🔒 Level ')+GL[i]+tt(' needed to unlock'));return}shopG=i;subRow()};s.appendChild(b)})}
function setTool(id){if(mv)endMove(false);if(ITEM[id].lv>level){toast(tt('🔒 Level ')+ITEM[id].lv+tt(' needed to unlock'));return}sel=null;rline=null;tool=(tool&&tool.id==id)?null:ITEM[id];pend=null;for(const b of bar.children)b.classList.toggle('on',!!tool&&b.dataset.id==tool.id);subRow();updCf();if(tool)toast(tool.rt?tt('Drag to set the road direction, then press ✔ (a bought road cannot be refunded)'):tool.id=='dozer'?tt('Tap/drag on a road to demolish it (fee applies); tap a house and it will ask'):tt('Tap the land to choose a spot, then press ✔'))}
function updCf(){const c=$('cf');c.innerHTML='';
 const add=(t,f)=>{const b=mkBtn(t);b.onclick=f;c.appendChild(b)},sp=t=>{const s=document.createElement('span');s.textContent=t;c.appendChild(s)};
 if(pend){const it=pend.it,bk=blockers(it,pend.x,pend.z,facing),ok=!bk.length;sp((pend.mv?'✥ ':it.e+' ')+it.n+(pend.mv?'':' 🪙'+it.c)+(ok?'':' ✖ '+bk[0].w));
  add('⟳',()=>{facing=(facing+1)%(isH(it)?4:2);updCf()});
  add('✔',()=>{if(pend.mv){if(canPlace(it,pend.x,pend.z,facing))endMove(true);else toast(tt('No room here ✖'))}else if(place(it,pend.x,pend.z)){pend=null;updCf()}});
  add('✖',()=>{if(pend.mv)endMove(false);else{pend=null;updCf()}})}
 else if(rline){const n=rline.tiles.filter(q=>q.ok&&!q.same).length,bad=rline.tiles.some(q=>!q.ok);sp(tool.e+' '+tool.n+' · '+n+tt(' tiles · 🪙')+rline.cost+(bad?' ⚠ 🔴='+rline.tiles.find(q=>!q.ok).why:''));add('✔',buyLine);add('✖',()=>{rline=null;updCf()})}
 else if(sel){const it=ITEM[sel.t];sp(it.e+' '+it.n);add('⟳',rotateSel);add('✥',()=>startMove(sel));add('🗑',()=>{removeB(sel);updCf()});add('✖',()=>{sel=null;updCf()})}
 else{c.style.display='none';return}
 c.style.display='flex'}
function tileAt(sx,sy){const X=(sx-VW/2)/cam.zoom+cX,Y=(sy-VH/2)/cam.zoom+cY,w=unrot((X/32+(Y+32)/16)/2,((Y+32)/16-X/32)/2,cam.ang);return[Math.floor(w[0]),Math.floor(w[1])]}
// ================= input =================
const pts=new Map(),vel={x:0,y:0};let moved=0,downT=0,pinch0=0,zoom0=1,lastMid=[0,0],lastT=0,lastMv=0,lastTile=-1,st0=null;
function clampZoom(z){return Math.max(.22,Math.min(2.4,z))}
function pan(dx,dy){const P=projXY(cam.fx,cam.fz,2);setFocusFromProj(P[0]-dx/cam.zoom,P[1]-dy/cam.zoom)}
function mid(){const a=[...pts.values()];return[(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2]}
function tapAt(x,y){for(const c of gmSpots){if(Math.hypot(x-c.x,y-c.y)<Math.max(28,c.r+12)){claimMine(c.b);return}}
 for(const c of coinSpots){if(Math.hypot(x-c.x,y-c.y)<Math.max(26,c.r+12)){const b=c.s,v=Math.floor(b.cash);b.cash-=v;earn(v,c.x,c.y-20);const m=people.find(p=>p.stall===b);if(m)m.bub={text:'Thank you!',t:2};return}}
 let best=null,bd=1e9;for(const it of screens){const s=toScr(it.e.x,it.e.z,2),h=(it.e.look&&it.e.look.kid?40:56)*cam.zoom,dx=Math.abs(x-s[0]),dy=y-(s[1]-h/2);if(dx<22*Math.max(.7,cam.zoom*1.2)&&Math.abs(dy)<h/2+14){const d=dx+Math.abs(dy);if(d<bd){bd=d;best=it.e}}}
 if(best&&best.cmp){openCmp(best.cmp);return}
 if(pend&&pend.mv){const t=tileAt(x,y);pend.x=t[0]-(pend.it.w>>1);pend.z=t[1]-(pend.it.d>>1);updCf();return}
 if(tool){const t=tileAt(x,y),ok=t[0]>=0&&t[1]>=0&&t[0]<N&&t[1]<N;
  if(tool.id=='dozer'){if(ok&&rd[t[1]*N+t[0]]){dozeRoad(t[0],t[1]);return}const i=treeAtScr(x,y);if(i>=0){askTree(i);return}const b=bAt(x,y);if(b)dozeAsk(b);return}
  if(!ok)return;if(tool.rt){setRline(t,t)}else if(tool.one)place(tool,t[0],t[1]);else{pend={it:tool,x:t[0]-(tool.w>>1),z:t[1]-(tool.d>>1)};updCf()}return}
 if(sel){const b=bAt(x,y);sel=(b&&b!==sel)?b:null;updCf();return}
 if(!best){const mb=bAt(x,y);if(mb&&(mb.bt>0||mb.t=='mine')){bInfo(mb);return}}
 if(best){best.bub={text:best.merch?MPHR[Math.floor(Math.random()*MPHR.length)]:PHR[Math.floor(Math.random()*PHR.length)],t:2.6};return}
 const ti=treeAtScr(x,y);if(ti>=0)askTree(ti)}
let lpT=0,lpDone=false,ang0=0,tw=0,twOn=false;const smp=[];let dragging=false,acc={x:0,y:0},zT=null,zM=[0,0];
function zoomAt(mx,my,z2){const z=cam.zoom,P=projXY(cam.fx,cam.fz,2),cx=P[0],cy=P[1]-20,X=(mx-VW/2)/z+cx,Y=(my-VH/2)/z+cy;cam.zoom=z2;setFocusFromProj(X-(mx-VW/2)/z2,Y-(my-VH/2)/z2+20)}
cv.addEventListener('pointerdown',e=>{e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch(_){}
 if(pts.size>=2)pts.clear();
 pts.set(e.pointerId,{x:e.clientX,y:e.clientY});vel.x=vel.y=0;smp.length=0;zT=null;
 if(pts.size==1){moved=0;dragging=false;acc.x=acc.y=0;downT=performance.now();lastTile=-1;st0=tileAt(e.clientX,e.clientY);clearTimeout(lpT);lpDone=false;if(!tool&&!pend){const sx=e.clientX,sy=e.clientY;lpT=setTimeout(()=>{if(pts.size==1&&moved<=8){const b=bAt(sx,sy);if(b){lpDone=true;sel=b;updCf();try{navigator.vibrate(20)}catch(_){}}}},480)}}
 else{clearTimeout(lpT);const a=[...pts.values()];pinch0=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);zoom0=cam.zoom;ang0=Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x);tw=0;twOn=false;moved=99;dragging=true;lastMid=mid();zM=lastMid}});
cv.addEventListener('pointermove',e=>{const p=pts.get(e.pointerId);if(!p)return;e.preventDefault();
 if(pts.size==1){const dx=e.clientX-p.x,dy=e.clientY-p.y;moved+=Math.abs(dx)+Math.abs(dy);p.x=e.clientX;p.y=e.clientY;
  if(tool&&tool.rt){if(moved>6){const t=tileAt(e.clientX,e.clientY);let en=Math.abs(t[0]-st0[0])>=Math.abs(t[1]-st0[1])?[t[0],st0[1]]:[st0[0],t[1]];if(Math.abs(en[0]-st0[0])>39)en[0]=st0[0]+Math.sign(en[0]-st0[0])*39;if(Math.abs(en[1]-st0[1])>39)en[1]=st0[1]+Math.sign(en[1]-st0[1])*39;const k=en[1]*N+en[0];if(k!=lastTile){lastTile=k;setRline(st0,en)}}}else if(tool&&tool.id=='fence'){if(moved>6){const t=tileAt(e.clientX,e.clientY),k=t[1]*N+t[0];if(lastTile==-1&&st0&&inb(st0[0],st0[1]))placeFence(st0[0],st0[1]);if(inb(t[0],t[1])&&k!=lastTile){lastTile=k;placeFence(t[0],t[1])}}}else if(tool&&tool.id=='dozer'){if(moved>6){const t=tileAt(e.clientX,e.clientY),k=t[1]*N+t[0];if(inb(t[0],t[1])&&k!=lastTile){lastTile=k;dozeRoad(t[0],t[1])}}}
  else{if(!dragging){acc.x+=dx;acc.y+=dy;if(moved>8){dragging=true;pan(acc.x,acc.y);smp.length=0}}
   else{pan(dx,dy);const n=performance.now();smp.push([n,dx,dy]);while(smp.length&&n-smp[0][0]>100)smp.shift()}}}
 else{p.x=e.clientX;p.y=e.clientY;const a=[...pts.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),m=mid();
  if(pinch0>10)zoomAt(m[0],m[1],Math.max(.17,Math.min(3.2,zoom0*d/pinch0)));
  const jx=m[0]-lastMid[0],jy=m[1]-lastMid[1];if(Math.hypot(jx,jy)<150)pan(jx,jy);
  {const ang=Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x);let da=ang-ang0;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;ang0=ang;if(!twOn){tw+=da;if(Math.abs(tw)>.16){twOn=true;cam.ang+=tw}}else cam.ang+=da;angT=cam.ang;dirtyW=dirtyW}
  lastMid=m;zM=m}});
const up=e=>{const had=pts.has(e.pointerId);pts.delete(e.pointerId);clearTimeout(lpT);if(!had)return;
 if(pts.size==0){
  if(fenceDirty){fenceDirty=false;save();refreshBar()}
  if(lpDone){lpDone=false}
  else if(moved<=8&&performance.now()-downT<500&&e.type=='pointerup')tapAt(e.clientX,e.clientY);
  else if(dragging&&!(tool&&tool.paint)){const n=performance.now();while(smp.length&&n-smp[0][0]>100)smp.shift();
   if(smp.length>1){const t=Math.max(40,n-smp[0][0]);let sx=0,sy=0;smp.forEach(s=>{sx+=s[1];sy+=s[2]});vel.x=Math.max(-3,Math.min(3,sx/t));vel.y=Math.max(-3,Math.min(3,sy/t))}}
  if(cam.zoom<.22||cam.zoom>2.4)zT=clampZoom(cam.zoom)}
 else if(pts.size==1){dragging=true;vel.x=vel.y=0;smp.length=0}};
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);

cv.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});cv.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
cv.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,clampZoom(cam.zoom*(e.deltaY<0?1.12:.89)))},{passive:false});
cv.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{if(e.key=='q')angT-=Math.PI/4;if(e.key=='e')angT+=Math.PI/4;if(e.key=='+'||e.key=='=')cam.zoom=clampZoom(cam.zoom*1.2);if(e.key=='-')cam.zoom=clampZoom(cam.zoom/1.2);const s=.8;if(e.key=='ArrowLeft'||e.key=='a'){const P=projXY(cam.fx,cam.fz,2);setFocusFromProj(P[0]-s*32,P[1])}if(e.key=='ArrowRight'||e.key=='d'){const P=projXY(cam.fx,cam.fz,2);setFocusFromProj(P[0]+s*32,P[1])}if(e.key=='ArrowUp'||e.key=='w'){const P=projXY(cam.fx,cam.fz,2);setFocusFromProj(P[0],P[1]-s*16)}if(e.key=='ArrowDown'||e.key=='s'){const P=projXY(cam.fx,cam.fz,2);setFocusFromProj(P[0],P[1]+s*16)}});
cv.addEventListener('touchend',e=>{if(e.touches.length==0)pts.clear()});cv.addEventListener('touchcancel',()=>pts.clear());addEventListener('blur',()=>pts.clear());cv.addEventListener('lostpointercapture',e=>{pts.delete(e.pointerId)});

const tap=(id,f)=>{$(id).addEventListener('click',e=>{e.preventDefault();f()})};
tap('bR',()=>rotateView(1));tap('bL',()=>rotateView(-1));tap('bld',builderInfo);$('stat').onclick=statInfo;tap('bQ',()=>{GFX.cycle();updQBtn();const m=GFX.mode,t=GFX.tier;toast(m==='auto'?tt('🤖 AUTO — the game picks the best mode for your phone')+' · '+t.toUpperCase():t==='smooth'?tt('🔋 SMOOTH — lightest mode for weak phones'):t==='high'?tt('✨ HIGH — balanced quality'):tt('🚀 ULTRA — best graphics'))});tap('bI',()=>zoomAt(VW/2,VH/2,clampZoom(cam.zoom*1.25)));tap('bO',()=>zoomAt(VW/2,VH/2,clampZoom(cam.zoom/1.25)));
tap('bH',()=>{cam.fx=N/2;cam.fz=N/2;cam.zoom=defZoom()});tap('bT',skipNightAsk);
// ================= guide for new players: the Chief welcomes you, then step by step (path -> house -> villager says Namaste -> well -> shop) =================
const TG_C1="Hello! I am the Chief of this village. 👴\nWelcome to GameVo Mine village!";
const TG_C2="This little piece of land is yours. Build roads, houses and shops, and your villagers will work and earn 🪙 coins for you.";
const TG_C3="No worry, I will guide you step by step. Let us build your first Path!";
const TG_S1="Step 1 · Build a Path 🛣\nPick 🛣 Path in the bottom bar, drag your finger on the ground to draw a line, then press ✔.";
const TG_S2="Step 2 · Build a House 🏠\nPick 🏠 House, tap a spot next to your Path, then press ✔.";
const TG_S3="👷 Your builder is building the house.\nWatch the timer above it. Tap the house to watch an ad and cut 5 minutes.";
const TG_V1="Namaste! 🙏 I am your first villager. Thank you for my new home!";
const TG_V2="Here is how to run this village:\n💧 give us water (Well)\n⚡ give us power (Power Pole)\n🏪 build shops where we can buy things\nHappy villagers pay you more 🪙.";
const TG_V3="Tap the 🪙 coins above houses and shops to collect them. Look at ❤️ 😊 📋 💧 ⚡ in the status panel to see how we feel.";
const TG_S5="Step 3 · Build a Well 💧\nMy family needs water. Pick 💧 Well and place it near the houses.";
const TG_S6="Step 4 · Build a Shop 🏪\nWe want to buy things! Pick 🏪 Shop and place it next to a Path (keep the yellow tile in front empty).";
const TG_O1="Wonderful! Your village is alive! 🎉\nHere is a welcome gift: +300 🪙";
const TG_O2="Level up to unlock more land (the ☁ clouds will clear), new buildings and more builders. At night, watch an ad to skip to morning. Have fun!";
const TGAV={chief:'<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#8fd0f0"/><rect x="3" y="1" width="10" height="3" fill="#6b3f1d"/><rect x="2" y="4" width="12" height="2" fill="#8a5222"/><rect x="2" y="4" width="12" height="1" fill="#ffd54a"/><rect x="4" y="6" width="8" height="5" fill="#f1c27d"/><rect x="5" y="7" width="2" height="2" fill="#fff"/><rect x="9" y="7" width="2" height="2" fill="#fff"/><rect x="6" y="8" width="1" height="1" fill="#222"/><rect x="10" y="8" width="1" height="1" fill="#222"/><rect x="3" y="10" width="10" height="5" fill="#f2f2f2"/><rect x="6" y="12" width="4" height="1" fill="#d8d8d8"/><rect x="7" y="10" width="2" height="1" fill="#e8a8a0"/><rect x="2" y="14" width="12" height="2" fill="#2a5de0"/></svg>',
 vill:'<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#8fd0f0"/><rect x="4" y="2" width="8" height="3" fill="#3a2a1a"/><rect x="3" y="4" width="10" height="2" fill="#3a2a1a"/><rect x="4" y="5" width="8" height="6" fill="#f1c27d"/><rect x="5" y="7" width="2" height="2" fill="#fff"/><rect x="9" y="7" width="2" height="2" fill="#fff"/><rect x="6" y="8" width="1" height="1" fill="#222"/><rect x="10" y="8" width="1" height="1" fill="#222"/><rect x="6" y="10" width="4" height="1" fill="#c0564a"/><rect x="2" y="11" width="12" height="5" fill="#2a5de0"/><rect x="7" y="11" width="2" height="2" fill="#f1c27d"/></svg>'};
let tgTm=0,tgKey='',tgTyping=false,tgWho='chief',tgFn=null;
function tgText(key,instant){tgKey=key;const el=$('tgt'),t=tt(key),ch=Array.from(t);clearInterval(tgTm);if(instant){el.textContent=t;tgTyping=false;return}let i=0;tgTyping=true;el.textContent='';tgTm=setInterval(()=>{i+=2;el.textContent=ch.slice(0,i).join('');if(i>=ch.length){clearInterval(tgTm);tgTyping=false}},22)}
function tgOpen(who,modal){tgWho=who;$('tg').className='on'+(modal?' m':'');$('tgav').innerHTML=TGAV[who];$('tgn').textContent=tt(who=='chief'?'Chief':'Villager');$('tgs').textContent=tt('Skip tutorial')}
function tgClose(){clearInterval(tgTm);tgTyping=false;tgKey='';$('tg').className='';tgHl(null)}
function tgHl(id){for(const b of bar.children)b.classList.toggle('hl',!!id&&b.dataset.id==id);if(id){const b=[...bar.children].find(x=>x.dataset.id==id);if(b&&b.scrollIntoView)try{b.scrollIntoView({inline:'center',block:'nearest'})}catch(e){}}}
function tgPages(who,pages,done,last){let i=0;const show=()=>{tgOpen(who,true);tgText(pages[i]);$('tgx').style.display='';$('tgx').textContent=tt(i<pages.length-1?'Next ▶':(last||'Got it!'))};
 $('tgx').onclick=()=>{if(tgTyping){tgText(tgKey,true);return}if(i<pages.length-1){i++;show()}else{tgClose();done()}};show()}
function tgBanner(key,hl){tgOpen('chief',false);tgText(key);$('tgx').style.display='none';tgHl(hl)}
function tutRun(){if(tut>=99)return;
 if(tut==0)tgPages('chief',[TG_C1,TG_C2,TG_C3],()=>{tut=1;save();tutRun()},'Let us start!');
 else if(tut==1)tgBanner(TG_S1,'road');
 else if(tut==2)tgBanner(TG_S2,'h4');
 else if(tut==3)tgBanner(TG_S3,null);
 else if(tut==4)tgPages('vill',[TG_V1,TG_V2,TG_V3],()=>{tut=5;save();tutRun()});
 else if(tut==5)tgBanner(TG_S5,'well');
 else if(tut==6)tgBanner(TG_S6,'shop');
 else if(tut==7)tgPages('chief',[TG_O1,TG_O2],()=>{tut=99;save();setHint()},'Finish')}
function tutCheck(){if(tut<1||tut>=99)return;const adv=n=>{tut=n;save();tutRun()};
 if(tut==1&&roads.size>=3)adv(2);
 else if(tut==2&&bl.some(b=>b.t=='h4'))adv(3);
 else if(tut==3&&bl.some(b=>b.t=='h4'&&!b.bt)){const p=people.find(q=>q.home&&!q.merch);if(p)p.bub={text:'Namaste! 🙏',t:5};tgClose();tut=4;save();setTimeout(tutRun,1500)}
 else if(tut==5&&bl.some(b=>b.t=='well'))adv(6);
 else if(tut==6&&bl.some(b=>b.t=='shop'||b.t=='tea')){coins+=300;hud();adv(7)}}
function tutSkip(){tut=99;tgClose();save();setHint()}
function tgRefresh(){if(!$('tg').classList.contains('on'))return;$('tgn').textContent=tt(tgWho=='chief'?'Chief':'Villager');$('tgs').textContent=tt('Skip tutorial');if(tgKey)tgText(tgKey,true)}
$('tgs').onclick=tutSkip;
setTimeout(()=>{if(tut<99)tutRun()},1800);
setTimeout(()=>{$('hint').style.opacity=0},12000);
// ================= main loop =================
function catchUp(g){g=Math.min(g,604800);buildSim(g,(b,l)=>{doneB(b);advMine(b,l)});
 if(g>120&&rate>0){const a=Math.min(g,28800),c=Math.floor(a/60*rate*.4);if(c>0){coins+=c;hud();toast(tt('Income while away +')+c+' 🪙')}}}
let last=performance.now(),acc2=0,ema=16;const T_START=performance.now();
function frame(now){
 {const gp=(now-last)/1000;if(gp>3)catchUp(gp)}
 const iv=GFX.q.fps?1000/GFX.q.fps-2:0;
 if(iv&&now-last<iv)return;   // frame-rate cap: SMOOTH 30 fps · HIGH 60 fps · ULTRA = screen rate (saves battery on 90/120 Hz phones)
 const raw=Math.max((now-last)/1000,0);let dt=Math.min(raw,.1);last=now;ema=ema*.95+dt*1000*.05;const t0=performance.now();
 const rotating=Math.abs(angT-cam.ang)>.0004;
 {const df=angT-cam.ang;if(Math.abs(df)>.0004)cam.ang+=df*Math.min(1,dt*9);else cam.ang=angT;if(Math.abs(cam.ang)>12.57){const k=Math.round(cam.ang/6.283185307)*6.283185307;cam.ang-=k;angT-=k}}
 updTime(dt);updPeople(dt);updCars(dt);updVess(dt);econ(dt);incTick(dt);portTick(dt);busTick(dt);
 if(!pts.size&&(Math.abs(vel.x)>.03||Math.abs(vel.y)>.03)){pan(vel.x*dt*1000,vel.y*dt*1000);const f=Math.exp(-dt*4.5);vel.x*=f;vel.y*=f}
 if(zT!=null&&!pts.size){const z2=cam.zoom+(zT-cam.zoom)*Math.min(1,dt*10);if(Math.abs(z2-zT)<.004){zoomAt(zM[0]||VW/2,zM[1]||VH/2,zT);zT=null}else zoomAt(zM[0]||VW/2,zM[1]||VH/2,z2)}
 acc2+=dt;if(acc2>.5){acc2=0;$('clock').textContent=clockTxt()}
 draw();
 GFX.tick(raw*1000,performance.now()-t0,rotating||document.hidden||raw>.4||t0-T_START<3500)}
function loop(now){requestAnimationFrame(loop);try{frame(now)}catch(e){const d=$('err');d.style.display='block';d.textContent='⚠ '+e.message}}
setHint();document.documentElement.classList.toggle('rtl',LANG==='ar');loadGame();updQBtn();
last=performance.now();requestAnimationFrame(loop);
try{parent.postMessage({type:'GAME_READY'},location.origin)}catch(e){}
window.__bv={cam:cam,people:people,bl:bl,GFX:GFX,rotate:d=>rotateView(d),ck:()=>CK,N:N};