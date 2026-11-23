(function(){
const DEMO = new URLSearchParams(location.search).has("demo");
const $=s=>document.querySelector(s);
const ic=(n,c)=>'<svg class="i '+(c||'')+'"><use href="#'+n+'"/></svg>';
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const panel=$('#panel'),col=$('#col'),scroll=$('#scroll'),ta=$('#ta'),dock=$('#dock'),app=$('#app');
let running=false,tab='conv',sel=null,timers=[];
let dataApi=null,currentSession=null,currentSessionID=null;
let liveSource=null,liveSession=null,liveSeen=new Set(),liveIndex=0,liveMessages=[],liveRoles={},liveRunning=false;
const lineIndexByKey=new Map();

const S={agent:'orchestrator',variant:'max',model:'Tidepool Alpha Free',decision:'Tidepool Alpha Free',vision:'Hy4 Flash Free',ctx:634,tps:52};

/* ---------- Petits utilitaires ---------- */
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2200);}
const ov=$('#ov'),dlg=$('#dlg');
function openDlg(html){dlg.innerHTML=html;ov.classList.add('on');}
function closeDlg(){ov.classList.remove('on');}
ov.addEventListener('mousedown',e=>{if(e.target===ov)closeDlg();});
function openList(title,items,cur,pick,mono){
  openDlg('<h3>'+title+'<kbd>Esc</kbd></h3><div class="'+(mono?'mono':'')+'" id="dl">'+items.map((x,k)=>'<div class="mi" data-k="'+k+'"><b>'+x[0]+'</b><span class="d">'+(x[1]||'')+'</span>'+(x[0]===cur?ic('check','s ck'):'')+'</div>').join('')+'</div>');
  $('#dl').onclick=e=>{const it=e.target.closest('.mi');if(!it)return;const x=items[+it.dataset.k];closeDlg();pick(x[0]);};
}

/* ---------- Mots d'ordre à l'ouverture ---------- */
const MOTTOS=[
 ['Fais-le bien, une étape à la fois.','Un rapport, une preuve, puis on s’arrête.'],['Mesure d’abord, optimise ensuite.','Ce qui n’est pas mesuré n’existe pas.'],
 ['Noir profond, idées claires.','Le vide est le meilleur des fonds.'],['Chaque étoile commence par un point.','Ouvre une session, allume la première.'],
 ['Petit commit, grand sommeil.','Un thème par commit, jamais de force-push.'],['Là où l’idée devient du code.','Dis l’intention, l’agent écrit le reste.'],
 ['Fluide, sobre, précis.','Les bons outils se font oublier.'],['Le silence avant la première ligne.','Prends ton temps, le ciel ne bouge pas.'],
 ['Pas de secret dans Git. Jamais.','Ni dans les logs, ni dans les rapports.'],['Prêt quand tu l’es.','Tout est local, tout est à toi.']
];
function nextIndex(){let i=0;try{i=(parseInt(localStorage.getItem('oc2.motto')||'-1',10)+1)%MOTTOS.length;localStorage.setItem('oc2.motto',String(i));}catch(e){i=Math.floor(Math.random()*MOTTOS.length);}return i;}
function hello(){const d=new Date(),h=d.getHours(),g=h<5?'Bonne nuit':h<12?'Bonjour':h<18?'Bon après-midi':'Bonsoir';
  const J=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],M=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return g+' · '+J[d.getDay()]+' '+d.getDate()+' '+M[d.getMonth()];}
function welcome(){
  closeLiveStream();timers.forEach(clearInterval);timers=[];
  const m=MOTTOS[nextIndex()];let k=0;running=false;setRun();
  $('#welcome').innerHTML='<div class="hello">'+ic('spark','s st')+hello()+'</div><h2 class="motto">'+m[0].split(' ').map(w=>'<span class="w" style="--k:'+(k++)+'">'+w+'</span>').join(' ')+'</h2><div class="rule"></div><p class="sub">'+m[1]+'</p><div class="stamp"><span><kbd>/</kbd>commands</span><span><kbd>@</kbd>files</span><span><kbd>ctrl+p</kbd>palette</span></div>';
  $('#chips').innerHTML='<button class="chip" data-a="res">'+ic('clock','s')+'Resume · Correctif dépôt divergent</button><button class="chip" data-a="/humanizer ">'+ic('spark','s')+'<code>/humanizer</code></button><button class="chip" data-a="/mcps">'+ic('plug','s')+'<code>/mcps</code></button><button class="chip" data-a="@">'+ic('folder','s')+'<code>@</code> files</button>';
  document.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{const a=c.dataset.a;if(a==='res'){openSession(2,0);return;}ta.value=a;ta.focus();renderMenu();});
  $('#title').textContent='New session';$('#goalb').style.opacity=0;$('#work').style.display='none';
  col.innerHTML='';panel.classList.add('is-welcome');setLift();status();
}
function setLift(){const h=panel.clientHeight,dh=dock.offsetHeight;panel.style.setProperty('--lift',panel.classList.contains('is-welcome')?Math.max(0,h/2-dh-30)+'px':'0px');}
addEventListener('resize',setLift);

/* ---------- Barre d'état sous le composeur (comme le CLI) ---------- */
function status(){
  const pct=Math.round(S.ctx/1000*100/1.0)/1;const p=Math.round(S.ctx/10)/1;
  $('#status').innerHTML=(running?'<span><kbd>esc</kbd> interrupt</span><span><kbd>enter</kbd> queue</span><span><kbd>alt+s</kbd> steer</span>':'<span><b>'+S.agent+'</b> · '+S.model+' · '+S.variant+'</span><span>'+S.ctx+'k / 1.0M ('+Math.round(S.ctx/10)+'%)</span>')+'<span class="sp"></span><span>'+(running?S.tps+' tok/s':'')+'</span><button id="stAt">@ tag files</button><button id="stPal">ctrl+p commands</button>';
  $('#stPal').onclick=()=>openPalette('');$('#stAt').onclick=()=>{ta.focus();ta.value+=' @';renderMenu();};
}
function setRun(){const s=$('#send');s.classList.toggle('run',running);$('#work').style.display=running?'flex':'none';}

/* ---------- Barre latérale ---------- */
const WS=DEMO?[
 {n:'joachim',t:'14h',open:false,s:[],more:159},
 {n:'Music-player',t:'3d',open:false,s:[{t:'B-Music3, historique et lien',m:'17/11'},{t:'B-Music1, lecteur',m:'14/11'}]},
 {n:'opencodev2web',t:'5m',open:true,s:[
  {t:'Correctif dépôt divergent',m:'5m',busy:1},{t:'Ciel étoilé, Worker et canvas',m:'33m'},{t:'Verre sobre, repli opaque',m:'1h'},
  {t:'Garde-fous mémoire du démon',m:'2h'},{t:'API Git locale, jeton',m:'4h'},{t:'Panneau Ressources',m:'1d'},
  {t:'Banc de mesure et budgets',m:'1d'},{t:'Lanceur Arch Linux',m:'3d'},{t:'Architecture opencodev2',m:'3d'}],more:30},
 {n:'traducteur-appinventor',t:'1d',open:false,s:[]}
]:[];
const tree=$('#tree'),sf=$('#sfilter');
function renderTree(){
  tree.innerHTML='';const q=sf.value.trim().toLowerCase();
  WS.forEach((w,wi)=>{
    if(q&&!w.n.toLowerCase().includes(q)&&!w.s.some(s=>s.t.toLowerCase().includes(q)))return;
    const f=document.createElement('div');f.className='fold'+(w.open||q?' open':'');
    f.innerHTML=(w.s.length?ic('down','chev'):'<span class="chev"></span>')+ic('folder')+'<b>'+w.n+'</b><em>'+(w.more&&!w.s.length?w.more:w.t)+'</em>';
    f.onclick=()=>{w.open=!w.open;renderTree();};tree.append(f);
    if(w.open||q){
      w.s.forEach((s,si)=>{
        if(q&&!s.t.toLowerCase().includes(q)&&!w.n.toLowerCase().includes(q))return;
        const d=document.createElement('div');d.className='sess'+(sel&&sel[0]===wi&&sel[1]===si?' act':'');d.tabIndex=0;
        d.innerHTML='<span>'+s.t+'</span>'+(s.busy?'<i class="busy"></i>':'')+'<em>'+s.m+'</em>';
        d.onclick=()=>openSession(wi,si);tree.append(d);
      });
      if(w.more&&w.s.length){const m=document.createElement('div');m.className='more';m.textContent='read more ('+w.more+')';tree.append(m);}
    }
  });
}
function disableArchived(){
  document.querySelectorAll('.fold').forEach(f=>{
    if(!f.textContent.includes('Archived'))return;
    f.title='bientôt';f.setAttribute('aria-disabled','true');
    f.onclick=e=>{e.preventDefault();e.stopPropagation();toast('bientôt');};
  });
}
sf.addEventListener('input',renderTree);
$('#bSearch').onclick=()=>{sf.classList.toggle('on');if(sf.classList.contains('on'))sf.focus();else{sf.value='';renderTree();}};
$('#bHist').onclick=()=>H.sessions();
function findMaquetteSession(id){
  for(let wi=0;wi<WS.length;wi++){const si=WS[wi].s.findIndex(s=>s.id===id);if(si>=0)return [wi,si];}
  return null;
}
function conversationStamp(i,line){
  if(line?.ts&&Number.isFinite(line.ts))return new Date(line.ts).toISOString().slice(11,19);
  return stamp(i);
}
function upsertConversationLine(line){
  if(!line)return;
  const key=String(line.key||`line:${liveIndex}`);line.key=key;
  let index=lineIndexByKey.get(key);
  if(index===undefined){index=liveIndex++;lineIndexByKey.set(key,index);}
  line.i=index;
  const html=dataApi.renderLine(line,{icon:ic,stamp:conversationStamp});
  if(!html)return;
  const old=[...col.querySelectorAll('[data-line]')].find(el=>el.dataset.line===key);
  if(old){
    const companion=old.nextElementSibling;
    old.insertAdjacentHTML('beforebegin',html);old.remove();
    if(companion&&(companion.classList.contains('tt')||companion.classList.contains('out')))companion.remove();
  }else col.insertAdjacentHTML('beforeend',html);
  tick();scroll.scrollTop=1e6;sbar();
}
function renderConversation(lines){
  col.innerHTML='';lineIndexByKey.clear();liveIndex=0;
  for(const line of (lines||[]))upsertConversationLine(line);
  scroll.scrollTop=1e6;sbar();
}
function applyGoal(goal){
  if(!goal)return;
  GOAL.st=goal.st||'pending';GOAL.dod=Array.isArray(goal.dod)?goal.dod:[];GOAL.oos=Array.isArray(goal.oos)?goal.oos:[];rp();
}
function updateSessionBusy(sessionID,busy){
  const found=findMaquetteSession(sessionID);if(!found)return;
  WS[found[0]].s[found[1]].busy=busy?1:0;renderTree();
}
function handleLiveEvent(ev,sessionID){
  const p=ev.properties||{};
  if(p.sessionID&&p.sessionID!==sessionID)return;
  if(ev.type==='session.status'){
    const busy=dataApi.statusFromEvent(ev);
    if(busy!==undefined){running=busy;liveRunning=busy;setRun();status();updateSessionBusy(sessionID,busy);}
    return;
  }
  if(ev.type==='session.updated'){
    const info=p.info||{};
    if(info.title){
      currentSession={...(currentSession||{}),...info};$('#title').textContent=info.title;
      const found=findMaquetteSession(sessionID);if(found){WS[found[0]].s[found[1]].t=info.title;renderTree();}
    }
    return;
  }
  if(ev.type==='todo.updated'){applyGoal(dataApi.goalFromSession(currentSession,p.todos||[]));return;}
  if(ev.type==='message.updated'){
    const info=p.info||{};
    if(info.id){
      liveRoles[info.id]=info.role;
      const idx=liveMessages.findIndex(m=>m.info?.id===info.id);
      if(idx>=0)liveMessages[idx]={...liveMessages[idx],info};else liveMessages.push({info,parts:[]});
    }
    return;
  }
  if(ev.type==='message.part.updated'){
    const part=p.part||{};
    if(part.messageID&&!liveRoles[part.messageID])liveRoles[part.messageID]='assistant';
    const queued=dataApi.queuedUserIDs(liveMessages,running);
    for(const line of dataApi.eventToLines(ev,{sessionID,roles:liveRoles,queued}))upsertConversationLine(line);
    return;
  }
  if(ev.type==='session.diff'||ev.type==='file.edited'){
    for(const line of dataApi.eventToLines(ev,{sessionID,roles:liveRoles}))upsertConversationLine(line);
  }
}
function closeLiveStream(){if(liveSource){liveSource.close();liveSource=null;}liveSession=null;}
function openLiveStream(sessionID){
  closeLiveStream();if(!sessionID||!dataApi)return;
  liveSession=sessionID;
  try{
    liveSource=new EventSource('/global/event');
    liveSource.onmessage=e=>{let raw;try{raw=JSON.parse(e.data);}catch{return;}
      const ev=dataApi.unwrapGlobalEvent(raw);if(ev)handleLiveEvent(ev,sessionID);};
  }catch(e){console.error(e);}
}
function applyConversation(loaded){
  currentSession=loaded.session;currentSessionID=loaded.session?.id||currentSessionID;
  $('#title').textContent=loaded.session?.title||loaded.session?.slug||'Session';
  applyGoal(loaded.goal);
  running=!!loaded.busy;liveRunning=running;setRun();status();
  liveMessages=Array.isArray(loaded.messages)?[...loaded.messages]:[];
  liveRoles={...(loaded.roles||{})};
  renderConversation(loaded.lines||[]);
  timers.forEach(clearInterval);timers=[];
  tick();timers.push(setInterval(tick,1000));
  openLiveStream(currentSessionID);
}
async function openRealSession(wi,si){
  const s=WS[wi]?.s[si];if(!s?.id||!dataApi)return;
  try{
    const loaded=await dataApi.loadConversation(s.id);
    applyConversation(loaded);
  }catch(e){console.error(e);toast('Session indisponible');}
}
function openSession(wi,si){sel=[wi,si];panel.classList.remove('is-welcome');setLift();$('#title').textContent=WS[wi].s[si].t;$('#goalb').style.opacity=1;renderTree();switchTab('conv',true);if(!DEMO&&WS[wi].s[si].id)void openRealSession(wi,si);else loadThread(wi===2&&si===0);}

/* ---------- Conversation (libellés d'origine en anglais) ---------- */
let TS=0;const stamp=i=>{const s=12*3600+3*60+24+i*9;return String(Math.floor(s/3600)%24).padStart(2,'0')+':'+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
const cls=r=>(r.l?' late':'');
const R={
 edit:(p,r)=>'<div class="row'+cls(r)+'" data-ts="'+stamp(r.i)+'" style="--i:'+r.i+'"><span class="ico">'+ic('pencil','s')+'</span><span class="vb">edits</span><span class="nm">'+p+'</span><span class="rt"><span class="add">'+r.a+'</span><span class="del">'+r.d+'</span><span>done</span><span class="x">'+r.t+'</span></span></div>',
 th:r=>'<div class="row th'+cls(r)+'" data-ts="'+stamp(r.i)+'" style="--i:'+r.i+'"><span class="ico">'+ic('brain','s')+'</span><span class="vb">Thought<small>'+r.s+'</small></span><span class="rt"><span>'+r.c+' characters</span></span></div><div class="tt">'+(r.x||'Je vérifie d’abord l’état réel du dépôt, puis je relis le test qui échoue avant de toucher au code.')+'</div>',
 run:(p,r)=>'<div class="row run'+cls(r)+'" data-ts="'+stamp(r.i)+'" style="--i:'+r.i+'"><span class="ico">'+ic('term','s')+'</span><span class="vb">runs</span><span class="nm sans">'+p+'</span><span class="rt"><span>done</span><span class="x">'+r.t+'</span></span></div><div class="out">'+(r.o||'$ git log --oneline -3\n5c0793a fix(depot): état divergent\n9b5e8ca fix: path.join\n3321a1b feat(webui): wordmark')+'<i>Click to collapse</i></div>',
 del:(p,r)=>'<div class="row'+cls(r)+'" data-ts="'+stamp(r.i)+'" style="--i:'+r.i+'"><span class="ico">'+ic('box','s')+'</span><span class="vb">delegates</span><span class="nm sans">'+p+'</span><span class="rt">'+(r.run?'<span class="live" data-s="'+r.s0+'">running</span>':'<span>done</span><span>'+r.t+'</span>')+'</span></div>',
 sk:(p,r)=>'<div class="row'+cls(r)+'" data-ts="'+stamp(r.i)+'" style="--i:'+r.i+'"><span class="ico">'+ic('spark','s')+'</span><span class="vb">skill</span><span class="nm">'+p+'</span><span class="rt"><span>done</span><span>'+r.t+'</span></span></div>',
 mcp:(p,r)=>'<div class="row'+cls(r)+'" data-ts="'+stamp(r.i)+'" style="--i:'+r.i+'"><span class="ico">'+ic('plug','s')+'</span><span class="vb">mcp</span><span class="nm">'+p+'</span><span class="rt"><span>done</span><span>'+r.t+'</span></span></div>',
 p:(h,r)=>'<div class="p'+cls(r)+'" data-ts="'+stamp(r.i)+'" style="--i:'+r.i+'">'+h+'</div>'
};
const MAIN=()=>[
 R.edit('docs\\design\\20-ciel-etoile.md',{i:0,a:'+1',d:'-1',t:'5ms'}),R.th({i:1,s:'11s',c:'5203'}),
 R.edit('docs\\design\\21-verre-sobre.md',{i:2,a:'+14',d:'-1',t:'7ms'}),R.th({i:3,s:'16s',c:'5418'}),
 R.p('L’état <code>divergent</code> est corrigé. Le panneau affiche maintenant « Récupérer » au lieu de « Chargement du dépôt… ». Je délègue les tests : les six états doivent être couverts, et aucun nouveau test ne doit casser.',{i:4}),
 R.del('Tests du panneau Dépôt',{i:5,t:'4m 12s'}),R.th({i:6,s:'6s',c:'2998'}),
 R.p('Le correctif <code>5c0793a3e</code> est commité, mais le typecheck n’a pas encore été rejoué. Je vérifie le commit, puis je mesure le cas qui échouait : état <code>divergent</code> après un <code>fetch</code>.',{i:7}),
 R.run('Vérifie le commit',{i:8,t:'15ms'}),R.run('État du dépôt après le correctif',{i:9,t:'7ms',o:'$ git status --short\n(clean)'}),R.run('Derniers commits',{i:10,t:'6ms'}),R.th({i:11,s:'6s',c:'3046'}),
 R.p('Le correctif est sur disque. Je rejoue les tests avec deux portes explicites : <code>états = 6</code> au premier rendu et <code>divergent</code> sans texte de chargement.',{i:12}),
 R.del('Tests webui, état divergent',{i:13,t:'9m 53s'}),R.th({i:14,s:'21s',c:'10164'}),
 R.p('Les tests s’arrêtent sur la première porte : <code>états=5/6</code>. Cause trouvée : <code>ready</code> devient vrai dès que le corps existe, donc le premier <code>read()</code> ne réinitialise pas <code>kept</code>. Je corrige ce seul point, puis je rejoue les deux portes.',{i:15}),
 R.del('Corriger la réinitialisation initiale',{i:16,run:1,s0:Date.now()-455000})
].join('');
function loadThread(main){
  col.innerHTML=main?MAIN():R.p('Session sans activité récente. Écris une consigne pour la reprendre.',{i:0})+R.run('Session summary',{i:1,t:'3ms'});
  timers.forEach(clearInterval);timers=[];running=!!main;setRun();status();
  tick();timers.push(setInterval(tick,1000));scroll.scrollTop=1e6;sbar();
}
function fmt(ms){const s=Math.floor(ms/1000);return Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s';}
function tick(){document.querySelectorAll('.live').forEach(e=>e.textContent='running '+fmt(Date.now()-(+e.dataset.s)));}
function sbar(){const u=$('#up'),t=$('#thumb'),can=scroll.scrollHeight>scroll.clientHeight+4&&tab==='conv';u.style.opacity=can?1:0;t.style.opacity=can?1:0;
  if(can){const r=scroll.scrollTop/(scroll.scrollHeight-scroll.clientHeight);t.style.top=(34+r*(scroll.clientHeight-100))+'px';}}
scroll.addEventListener('scroll',sbar);
col.addEventListener('click',e=>{
  const r=e.target.closest('.row.run');if(r&&r.nextElementSibling){r.nextElementSibling.classList.toggle('open');return;}
  const t=e.target.closest('.row.th');if(t&&t.nextElementSibling?.classList.contains('tt')){
    const tt=t.nextElementSibling;tt.style.display=tt.style.display==='block'?'':'block';
  }
});
function append(html){col.insertAdjacentHTML('beforeend',html);scroll.scrollTop=1e6;sbar();}

/* ---------- Onglets Conversation / Config / Logs ---------- */
function switchTab(t,silent){tab=t;document.querySelectorAll('.tab[data-t]').forEach(x=>x.classList.toggle('on',x.dataset.t===t));
  if(silent)return;if(panel.classList.contains('is-welcome')){panel.classList.remove('is-welcome');setLift();}
  if(t==='logs')col.innerHTML='<div class="logline">'+['12:03:24 <i>info</i>  opencodev2 server listening on http://127.0.0.1:4097','12:03:25 <i>info</i>  daemon: autostart disabled','12:03:41 <i>mcp</i>   github connected (12 tools)','12:03:41 <i>mcp</i>   context7 connected (2 tools)','12:04:02 <i>git</i>   fetch origin: 2 commits behind','12:06:19 <i>skill</i> humanizer loaded','12:07:55 <i>agent</i> '+S.agent+' · '+S.model+' · 48.7s'].join('\n')+'</div>';
  else if(t==='config')col.innerHTML='<div class="cfgh"><span>opencodev2.config.json</span><span>read-only preview</span></div><div class="cfg">{\n  <b>"repo"</b>: "Neoxff/opencodev2",\n  <b>"branch"</b>: "main",\n  <b>"autoGit"</b>: <u>false</u>,\n  <b>"daemon"</b>: { <b>"autostart"</b>: <u>false</u> },\n  <b>"sky"</b>: "static",\n  <b>"glass"</b>: "off",\n  <b>"mcp"</b>: { <b>"max_sessions"</b>: 1 }\n}</div>';
  else if(!DEMO&&sel&&WS[sel[0]]?.s[sel[1]]?.id)void openRealSession(sel[0],sel[1]);
  else loadThread(sel&&sel[0]===2&&sel[1]===0);
  sbar();}
document.querySelectorAll('.tab[data-t]').forEach(b=>b.onclick=()=>switchTab(b.dataset.t));

/* ---------- Panneau droit : Goal, Context, MCP, LSP, Todo ---------- */
const GOAL={st:'pending',dod:['Six états du panneau Dépôt testés','Aucun nouveau test en échec','Fond noir pur partout','Verre limité à 2 surfaces','Rapport avec preuves'],oos:['Thème clair','Rust pour le ciel','Synchronisation automatique amont','Rendu markdown en Rust']};
const MCPS=[['chrome-devtools',1],['context7',1],['file-system',1],['firecrawl',1],['git',1],['github',1],['kubernetes',1],['mcp-control',1],['memory',1],['openapi',1],['postgres',1],['puppeteer',0],['sandbox',1],['sequential-thinking',1],['shell',1],['sqlite',1],['video-analyzer',1],['web-browser',0],['web-search',1]].map(x=>({n:x[0],on:!!x[1]}));
const TODO=[['[RESEARCH] Research uncertainties; load applicable skills before acting.','dn'],['Lot sûr : valider + fusionner #8 docs/prerequis-design-v2','ip'],['Lot sûr : valider + fusionner #9 fix/depot-divergent',''],['Lot sûr : valider + fusionner #10 feat/tokens',''],['Lot sûr : valider + fusionner #11 feat/mouvement',''],['Lot sûr : valider + fusionner #18 feat/garde-fous-memoire',''],['Rapport final : hash main, ruleset, PR fusionnées, exclusions justifiées',''],['[CLOSE] Verify quality; retain','']];
const shut={};
function rp(){
  const sec=(id,h,n,body)=>'<div class="rs'+(shut[id]?' shut':'')+'" data-id="'+id+'"><div class="rh">'+ic('down','s c')+'<b>'+h+'</b>'+(n?'<span class="n">'+n+'</span>':'')+'</div><div class="rb">'+body+'</div></div>';
  const g=GOAL;
  const goalBody=(g.st==='pending'?'':'<div class="kv"><span>Status</span><b>'+g.st+'</b></div>')+'<div class="gh">Definition of done</div>'+g.dod.map(x=>'<div class="gl">'+x+'</div>').join('')+'<div class="gh">Out of scope</div>'+g.oos.map(x=>'<div class="gl">'+x+'</div>').join('')+'<div class="ga"><button class="gb" data-g="approve">Approve</button><button class="gb" data-g="edit">Edit</button><button class="gb" data-g="regenerate">Regenerate</button><button class="gb" data-g="skip">Skip</button></div>';
  const mc=MCPS.filter(m=>m.on).length;
  $('#rpanel').innerHTML=
   sec('goal','Goal definition','<span class="pill">DOD('+g.dod.length+')</span> <span class="pill">OOS('+g.oos.length+')</span>',goalBody)+
   sec('ctx','Context','',
     '<div class="kv"><span>'+S.ctx+'k tokens</span><b>'+Math.round(S.ctx/10)+'% used</b></div><div class="bar"><i style="transform:scaleX('+Math.min(1,S.ctx/1000)+')"></i></div><div class="kv"><span>Cost</span><b>$0.00 (estimated)</b></div>')+
   sec('mcp','MCP',mc+'/'+MCPS.length,MCPS.map(m=>'<div class="mcpr'+(m.on?'':' off')+'">'+m.n+'<em>'+(m.on?'Connected':'Disabled')+'</em></div>').join(''))+
   sec('lsp','LSP','','<div class="mcpr off">LSPs are disabled</div>')+
   sec('todo','Todo','',TODO.map(t=>'<div class="todo '+t[1]+'"><span class="bx"></span><span>'+t[0]+'</span></div>').join(''))+
   '<div class="rfoot"><div><b>~/Documents/</b>opencodev2web:main</div><div>• Opencodev2 2.4.31</div></div>';
  document.querySelectorAll('.rh').forEach(h=>h.onclick=()=>{const id=h.parentNode.dataset.id;shut[id]=!shut[id];rp();});
  document.querySelectorAll('.gb').forEach(b=>b.onclick=()=>H['goal-'+b.dataset.g]());
}
$('#rpT').onclick=()=>{app.classList.toggle('rp');setLift();};
$('#goalb').onclick=()=>{app.classList.add('rp');shut.goal=false;rp();};

/* ---------- Sélecteurs de la barre du composeur ---------- */
const AG=[['orchestrator','Coordonne les autres agents'],['plan','Lecture seule, enquête et plan'],['build','Écrit le code, une étape à la fois'],['designer','Documents de design'],['lean','Budgets et mesures'],['security','Audit et verdicts'],['product-manager','Critères et recette'],['release','Branches, PR, fusions']];
const VA=[['max',''],['high',''],['medium',''],['low','']];
const MO=[['Tidepool Alpha Free','OpenCode'],['Hy4 Flash Free','OpenCode'],['DeepSeek V4.1 Flash','OpenCode Go']];
function setAgent(v){S.agent=v;$('#vA').textContent=v;pops();status();}
function setVar(v){S.variant=v;$('#vV').textContent=v;pops();status();}
function setModel(v){S.model=v;$('#vM').textContent=v;pops();status();}
function fillPop(pop,list,cur,set){pop.innerHTML=list.map(x=>'<div class="mi" data-v="'+x[0]+'"><b>'+x[0]+'</b><span class="d">'+(x[1]||'')+'</span>'+(x[0]===cur?ic('check','s ck'):'')+'</div>').join('');
  pop.onclick=e=>{const it=e.target.closest('.mi');if(!it)return;e.stopPropagation();set(it.dataset.v);closePops();};}
function pops(){fillPop($('#popA'),AG,S.agent,setAgent);fillPop($('#popV'),VA,S.variant,setVar);fillPop($('#popM'),MO,S.model,setModel);}
function closePops(){document.querySelectorAll('.pop').forEach(p=>p.classList.remove('on'));document.querySelectorAll('.sel').forEach(s=>s.classList.remove('open'));}
[['#selA','#popA'],['#selV','#popV'],['#selM','#popM']].forEach(([b,p])=>$(b).onclick=e=>{e.stopPropagation();const was=$(p).classList.contains('on');closePops();if(!was){$(p).classList.add('on');$(b).classList.add('open');}});
document.addEventListener('click',closePops);pops();

/* ---------- LES COMMANDES : la liste complète du CLI ---------- */
const CMD=[
['agents','Switch agent'],['compact','Compact session'],['config','Open config editor'],['connect','Connect provider'],['copy','Copy session transcript'],
['decision-model','Set the decision model (all Jev features and scoring passes)'],['diff','Open diff viewer'],['editor','Open editor'],['exit','Exit the app'],['export','Export session transcript'],
['fork','Fork session'],['git:git_wrapup:mcp','Orchestrates a full git wrap-up: loads the project-aware acceptance-criteria protocol from git…','mcp'],
['goal-approve','Goal: Approve'],['goal-edit','Goal: Edit'],['goal-generate','Goal: Generate'],['goal-regenerate','Goal: Regenerate'],['goal-skip','Goal: Skip'],
['help','Help'],['humanizer','Humanize AI-sounding text so it reads like a person wrote it, without changing what it says','skill'],
['image-analysis','Analyze an image or screenshot — UI review, OCR text extraction, error diagnosis, chart reading…','skill'],['init','guided AGENTS.md setup'],
['kubernetes:k8s-diagnose:mcp','Diagnose Kubernetes Resources.','mcp'],['logs','Open session logs'],['mcps','Toggle MCPs'],
['mod-development','Develop a game mod or plugin — Minecraft (Fabric, NeoForge, Forge, Paper), datapacks, resource packs…','skill'],
['models','Switch model'],['new','New session'],['rename','Rename session'],['review','review changes [commit|branch|pr], defaults to uncommitted'],
['sessions','Switch session'],['share','Share session'],['skills','Skills'],['status','View status'],
['subagent','List the available subagents and explain what each one does'],['themes','Switch theme'],['thinking','Expand thinking'],['timeline','Jump to message'],
['timestamps','Show timestamps'],['token-efficiency','Work efficiently and spend fewer tokens — index before reading, extract slices, compress output…','skill'],
['undo','Undo previous message'],['variants','Switch model variant'],['video-analysis','Analyze a video — YouTube or any platform URL, direct link, or local file — with transcript…','skill'],
['vision-model','Set image fallback (vision) model']
].map(x=>({n:'/'+x[0],k:x[0],d:x[1],tag:x[2]||''}));
const lst=a=>a.map(x=>[x,'']);
const H={
 agents:()=>openList('Switch agent',AG,S.agent,setAgent),
 compact:()=>{S.ctx=18;append(R.run('Compacting context',{i:0,l:1,t:'1.8s',o:'context 634k → 18k tokens'})+R.p('Contexte réduit de <code>634k</code> à <code>18k</code> tokens.',{l:1,i:1}));rp();status();},
 config:()=>switchTab('config'),
 connect:()=>openList('Connect provider',[['OpenCode','free models'],['OpenCode Go','subscription'],['GitHub Copilot','device login'],['Anthropic','API key'],['OpenAI','API key'],['OpenRouter','API key'],['Ollama','local']],null,n=>toast(n+' : connexion simulée')),
 copy:()=>toast('Transcript copié dans le presse-papiers (simulé)'),
 'decision-model':()=>openList('Decision model',MO,S.decision,v=>{S.decision=v;toast('Decision model : '+v);}),
 diff:()=>openDlg('<h3>Diff viewer<kbd>Esc</kbd></h3><div class="diff"><div class="h">packages/webui/src/git-panel.tsx</div><div class="h">@@ -41,7 +41,9 @@</div><div> if (state() === "behind") return &lt;Behind /&gt;</div><div class="r">-if (!ready()) return &lt;Loading /&gt;</div><div class="a">+if (state() === "divergent") {</div><div class="a">+  return &lt;DivergentNotice onRetry={refresh} /&gt;</div><div class="a">+}</div><div class="a">+if (!ready()) return &lt;Loading /&gt;</div><div> return &lt;Clean /&gt;</div></div>'),
 editor:()=>toast('Ouverture de $EDITOR (simulé)'),
 exit:()=>toast('Exit : ferme l’onglet dans l’app réelle'),
 export:()=>toast('Transcript exporté en Markdown (simulé)'),
 fork:()=>{const w=WS[2];w.s.unshift({t:'Correctif dépôt divergent (fork)',m:'now'});w.open=true;openSession(2,0);toast('Session forked');},
 'goal-approve':()=>{GOAL.st='approved';app.classList.add('rp');rp();toast('Goal approved');},
 'goal-edit':()=>{GOAL.st='editing';app.classList.add('rp');rp();toast('Goal : édition');},
 'goal-generate':()=>{GOAL.st='generated';app.classList.add('rp');rp();toast('Goal generated');},
 'goal-regenerate':()=>{GOAL.st='regenerated';app.classList.add('rp');rp();toast('Goal regenerated');},
 'goal-skip':()=>{GOAL.st='skipped';app.classList.add('rp');rp();toast('Goal skipped');},
 help:()=>openDlg('<h3>Help<kbd>Esc</kbd></h3>'+[['/','commands'],['@','tag files or sessions'],['ctrl+p','command palette'],['alt+n','new session'],['ctrl+r','rename session'],['ctrl+d','delete session'],['esc','interrupt'],['enter','queue (while running)'],['alt+s','steer']].map(x=>'<div class="krow"><span>'+x[1]+'</span><kbd>'+x[0]+'</kbd></div>').join('')),
 init:()=>append(R.edit('AGENTS.md',{i:0,l:1,a:'+42',d:'-0',t:'4ms'})+R.p('<code>AGENTS.md</code> créé : conventions, commandes de test et règles du dépôt.',{l:1,i:1})),
 logs:()=>switchTab('logs'),
 mcps:()=>{const draw=()=>openDlg('<h3>Toggle MCPs<kbd>Esc</kbd></h3><div id="ml">'+MCPS.map((m,k)=>'<div class="mi" data-k="'+k+'"><b>'+m.n+'</b><span class="d">'+(m.on?'Connected':'Disabled')+'</span><span class="sw'+(m.on?' on':'')+'"></span></div>').join('')+'</div>');
   draw();$('#ml').onclick=e=>{const it=e.target.closest('.mi');if(!it)return;const m=MCPS[+it.dataset.k];m.on=!m.on;rp();const t=$('#dlg').scrollTop;draw();$('#dlg').scrollTop=t;$('#ml').onclick=arguments.callee;};
   },
 models:()=>openList('Switch model',MO,S.model,setModel),
 new:async()=>{
  if(DEMO){sel=null;renderTree();ta.value='';welcome();ta.focus();return;}
  if(!dataApi)return;
  try{
    const created=await dataApi.createSession();
    const workspaces=await dataApi.loadSidebarData();
    WS.splice(0,WS.length,...workspaces);renderTree();
    for(let wi=0;wi<WS.length;wi++){const si=WS[wi].s.findIndex(s=>s.id===created.id);if(si>=0){openSession(wi,si);break;}}
  }catch(e){console.error(e);toast('Création impossible');}
},
 rename:()=>{openDlg('<h3>Rename session<kbd>Esc</kbd></h3><input class="in" id="rn" value="'+$('#title').textContent.replace(/"/g,'')+'"><div class="ga"><button class="gb" id="rok">Rename</button></div>');setTimeout(()=>$('#rn').select(),30);
   const ok=()=>{const v=$('#rn').value.trim();if(v&&sel){WS[sel[0]].s[sel[1]].t=v;$('#title').textContent=v;renderTree();}closeDlg();};$('#rok').onclick=ok;$('#rn').onkeydown=e=>{if(e.key==='Enter')ok();};},
 review:()=>append(R.del('Review uncommitted changes',{i:0,l:1,t:'12s'})+R.p('Revue terminée : <code>2</code> fichiers modifiés, aucun secret détecté, <code>1</code> remarque sur <code>git-panel.tsx</code>.',{l:1,i:1})),
 sessions:()=>{const all=[];WS.forEach((w,wi)=>w.s.forEach((s,si)=>all.push([s.t,w.n+' · '+s.m,wi,si])));openList('Switch session',all.map(x=>[x[0],x[1]]),$('#title').textContent,n=>{const x=all.find(y=>y[0]===n);openSession(x[2],x[3]);});},
 share:()=>toast('Lien de partage local copié (simulé)'),
 skills:()=>openDlg('<h3>Skills<kbd>Esc</kbd></h3>'+CMD.filter(c=>c.tag==='skill').map(c=>'<div class="krow"><span><b style="font-family:var(--mono);color:var(--tx)">'+c.n+'</b></span><span style="max-width:60%;text-align:right;color:var(--tx-3)">'+c.d+'</span></div>').join('')),
 status:()=>openDlg('<h3>Status<kbd>Esc</kbd></h3>'+[['Version','OpenCodev2 2.4.31'],['Server','http://127.0.0.1:4097'],['Repo','Neoxff/opencodev2 · main'],['Agent',S.agent],['Model',S.model+' · '+S.variant],['Context',S.ctx+'k / 1.0M'],['MCP',MCPS.filter(m=>m.on).length+'/'+MCPS.length+' connected'],['LSP','disabled']].map(x=>'<div class="krow"><span>'+x[0]+'</span><b style="font-weight:500;color:var(--tx)">'+x[1]+'</b></div>').join('')),
 subagent:()=>openDlg('<h3>Subagents<kbd>Esc</kbd></h3>'+AG.map(a=>'<div class="krow"><span><b style="color:var(--tx);font-weight:500">'+a[0]+'</b></span><span style="color:var(--tx-3)">'+a[1]+'</span></div>').join('')),
 themes:()=>openList('Switch theme',[['Noir pur','default'],['Noir contraste élevé',''],['Noir chaud','accent ambre']],null,n=>{document.documentElement.dataset.th=n.includes('contraste')?'contrast':n.includes('chaud')?'warm':'';toast('Theme : '+n);}),
 thinking:()=>{col.classList.toggle('think');toast(col.classList.contains('think')?'Thinking expanded':'Thinking collapsed');},
 timeline:()=>{const ms=[...col.querySelectorAll('.me,.p')];openList('Jump to message',ms.map((m,k)=>[m.textContent.slice(0,64),'#'+(k+1)]),null,n=>{const m=ms.find(x=>x.textContent.slice(0,64)===n);if(m)m.scrollIntoView({block:'center',behavior:'smooth'});});},
 timestamps:()=>{col.classList.toggle('stamps');toast(col.classList.contains('stamps')?'Timestamps shown':'Timestamps hidden');},
 undo:()=>{const m=[...col.querySelectorAll('.me')].pop();if(!m){toast('Rien à annuler');return;}let n=m;while(n){const x=n.nextSibling;n.remove();n=x;}toast('Dernier message annulé');sbar();},
 variants:()=>openList('Switch model variant',VA,S.variant,setVar),
 'vision-model':()=>openList('Vision model (image fallback)',MO,S.vision,v=>{S.vision=v;toast('Vision model : '+v);})
};
function skillOrMcp(c,args){const t=c.tag;const i={i:0,l:1,t:'0.4s'};
  if(t==='skill')append(R.sk(c.k,i)+R.p('Skill <code>'+c.k+'</code> chargé'+(args?' avec « '+args+' »':'')+'. Je l’applique et je te rends le résultat.',{l:1,i:1}));
  else append(R.mcp(c.k+(args?' · '+args:''),{i:0,l:1,t:'212ms'})+R.p('Prompt MCP <code>'+c.k+'</code> exécuté. Résultat ajouté au contexte.',{l:1,i:1}));}
function runCmd(c,args){
  if(panel.classList.contains('is-welcome')&&(c.tag||['compact','init','review','undo','thinking','timestamps'].includes(c.k))){panel.classList.remove('is-welcome');setLift();$('#title').textContent='New session';$('#goalb').style.opacity=1;col.innerHTML='';}
  if(c.tag)return skillOrMcp(c,args);const f=H[c.k];if(f)f(args);}

/* ---------- Menu slash (liste complète, défilante) ---------- */
const AT=[['@packages/webui/src/app.tsx','file'],['@packages/webui/src/git-panel.tsx','file'],['@docs/design/20-ciel-etoile.md','file'],['@Ciel étoilé, Worker et canvas','session · 33m']];
const menu=$('#menu');let items=[],ai=0;
function menuFor(v){const m=/(^|\s)([\/@])([^\s]*)$/.exec(v);if(!m)return null;const q=(m[2]+m[3]).toLowerCase();
  return m[2]==='/'?CMD.filter(x=>x.n.toLowerCase().includes(q)):AT.map(x=>({n:x[0],d:x[1],k:null})).filter(x=>x.n.toLowerCase().includes(q));}
function renderMenu(){
  const r=menuFor(ta.value);if(!r){menu.classList.remove('on');items=[];return;}
  items=r;ai=Math.min(ai,Math.max(0,items.length-1));
  menu.innerHTML=items.length?items.map((x,k)=>'<div class="mi'+(k===ai?' act':'')+'" data-k="'+k+'" role="option"><b>'+x.n+'</b><span class="d">'+x.d+'</span>'+(x.tag?'<em class="tag '+(x.tag==='mcp'?'mcp':'')+'">'+(x.tag==='mcp'?'MCP':'Skill')+'</em>':'')+'</div>').join(''):'<div class="empty">No matching command.</div>';
  menu.classList.add('on');const a=menu.querySelector('.act');if(a)a.scrollIntoView({block:'nearest'});
}
function pick(k){const x=items[k];if(!x)return;ta.value=ta.value.replace(/([\/@])[^\s]*$/,x.n+' ');menu.classList.remove('on');ta.focus();}
menu.addEventListener('mousedown',e=>{const t=e.target.closest('.mi');if(t){e.preventDefault();pick(+t.dataset.k);}});
ta.addEventListener('input',()=>{ai=0;renderMenu();});
ta.addEventListener('keydown',e=>{
  if(menu.classList.contains('on')&&items.length){
    if(e.key==='ArrowDown'){e.preventDefault();ai=(ai+1)%items.length;renderMenu();return;}
    if(e.key==='ArrowUp'){e.preventDefault();ai=(ai-1+items.length)%items.length;renderMenu();return;}
    if(e.key==='Tab'){e.preventDefault();pick(ai);return;}
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const x=items[ai];if(x&&x.k){ta.value='';menu.classList.remove('on');runCmd(x,'');return;}pick(ai);return;}
    if(e.key==='Escape'){menu.classList.remove('on');return;}
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}
});
$('#hint').onclick=()=>{ta.focus();ta.value='/';renderMenu();};

/* ---------- Palette ctrl+p ---------- */
function openPalette(q){
  openDlg('<h3>Commands<kbd>ctrl+p</kbd></h3><input class="in" id="pq" placeholder="Search commands…" value="'+(q||'')+'"><div id="pl" class="mono"></div>');
  let k=0,L=[];const draw=()=>{const v=$('#pq').value.toLowerCase();L=CMD.filter(c=>c.n.includes(v));k=Math.min(k,Math.max(0,L.length-1));
    $('#pl').innerHTML=L.map((c,i)=>'<div class="mi'+(i===k?' act':'')+'" data-i="'+i+'"><b>'+c.n+'</b><span class="d">'+c.d+'</span></div>').join('')||'<div class="empty">No matching command.</div>';const a=$('#pl .act');if(a)a.scrollIntoView({block:'nearest'});};
  const go=i=>{const c=L[i];if(!c)return;closeDlg();runCmd(c,'');};
  draw();$('#pq').focus();$('#pq').oninput=()=>{k=0;draw();};
  $('#pq').onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();k=(k+1)%L.length;draw();}else if(e.key==='ArrowUp'){e.preventDefault();k=(k-1+L.length)%L.length;draw();}else if(e.key==='Enter'){e.preventDefault();go(k);}};
  $('#pl').onclick=e=>{const it=e.target.closest('.mi');if(it)go(+it.dataset.i);};
}
$('#pal').onclick=()=>openPalette('');

/* ---------- Envoi (file d'attente si l'agent travaille) ---------- */
function send(){
  const v=ta.value.trim();if(running&&!v){running=false;setRun();status();toast('Interrupted');return;}
  if(!v)return;ta.value='';menu.classList.remove('on');
  const first=v.split(/\s+/)[0],c=CMD.find(x=>x.n===first);
  if(c){runCmd(c,v.slice(first.length).trim());return;}
  if(!DEMO){
    if(!currentSessionID){toast('Ouvre ou crée une session');return;}
    void dataApi.sendPrompt(currentSessionID,v).then(()=>{
      running=true;liveRunning=true;setRun();status();
    }).catch(e=>{console.error(e);toast('Envoi impossible');});
    return;
  }
  if(panel.classList.contains('is-welcome')){panel.classList.remove('is-welcome');setLift();$('#title').textContent=v.length>46?v.slice(0,46)+'…':v;$('#goalb').style.opacity=1;col.innerHTML='';}
  if(tab!=='conv')switchTab('conv',true);
  const me=document.createElement('div');me.className='me';me.textContent=v;if(running){const q=document.createElement('span');q.className='q';q.textContent='queued';me.append(q);}col.append(me);
  setTimeout(()=>append(R.th({l:1,i:0,s:'4s',c:'812'})+R.p('Compris. Je lance l’étape et je te fais un rapport avec les preuves.',{l:1,i:1})),400);
  scroll.scrollTop=1e6;sbar();
}
$('#send').onclick=()=>{if(running&&!ta.value.trim()){running=false;setRun();status();toast('Interrupted');}else send();};
$('#newbtn').onclick=()=>H.new();
$('#reopen').onclick=()=>{sel=null;renderTree();welcome();};

/* ---------- Raccourcis clavier ---------- */
addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();openPalette('');return;}
  if(e.altKey&&e.key.toLowerCase()==='n'){e.preventDefault();H.new();return;}
  if(e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();toast('Steer : consigne injectée dans le tour en cours');return;}
  if((e.ctrlKey)&&e.key.toLowerCase()==='r'&&sel){e.preventDefault();H.rename();return;}
  if((e.ctrlKey)&&e.key.toLowerCase()==='d'&&sel){e.preventDefault();const w=WS[sel[0]];w.s.splice(sel[1],1);sel=null;renderTree();welcome();toast('Session supprimée');return;}
  if(e.key==='Escape'){if(ov.classList.contains('on'))closeDlg();else if(running&&!menu.classList.contains('on')){running=false;setRun();status();toast('Interrupted');}}
});

/* ---------- Ciel étoilé : noir, discret, sans étoile filante ---------- */
const cv=$('#sky'),cx=cv.getContext('2d');let W,H2,dpr,stars=[],on=!reduce,raf=0,last=0;
const rnd=(a,b)=>a+Math.random()*(b-a);const hues=['255,255,255','255,255,255','255,252,245','245,248,255','255,236,210'];
function build(){const n=Math.round(Math.min(1300,1100*Math.max(.5,W*H2/2073600)));stars=[];
  for(let i=0;i<n;i++){const l=i<n*.62?0:i<n*.92?1:2;stars.push({x:Math.random()*W,y:Math.random()*H2,r:l?l===1?rnd(.8,1.3):rnd(1.3,2):rnd(.4,.8),v:[1,2,4][l]*rnd(.8,1.2),a:rnd(.3,.9),tw:rnd(3,7),ph:rnd(0,6.28),amp:rnd(.2,.5),c:hues[(Math.random()*5)|0]});}}
function size(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H2=innerHeight;cv.width=W*dpr;cv.height=H2*dpr;cx.setTransform(dpr,0,0,dpr,0,0);build();if(!on)draw(0,0);}
function draw(t,dt){cx.clearRect(0,0,W,H2);for(const s of stars){if(on){s.x-=s.v*dt;if(s.x<-3)s.x=W+3;}const a=s.a*(on?1-s.amp*(.5+.5*Math.sin(t/1000*6.283/s.tw+s.ph)):1);cx.fillStyle='rgba('+s.c+','+a.toFixed(3)+')';cx.beginPath();cx.arc(s.x,s.y,s.r,0,6.283);cx.fill();}}
function loop(ts){raf=requestAnimationFrame(loop);const dt=Math.min(.05,(ts-last)/1000||0);last=ts;draw(ts,dt);}
function start(){cancelAnimationFrame(raf);if(on){last=performance.now();raf=requestAnimationFrame(loop);}else draw(0,0);}
$('#skyb').onclick=e=>{on=!on;e.target.classList.toggle('on',on);cv.style.opacity=on?1:.35;start();};
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else if(on&&!raf)start();});
addEventListener('resize',size);size();start();

if(innerWidth<1360)app.classList.remove('rp');
async function bootData(){
  if(DEMO)return true;
  try{
    dataApi=await import('/ui/data.js');
    const workspaces=await dataApi.loadSidebarData();
    WS.splice(0,WS.length,...workspaces);
    disableArchived();
    return true;
  }catch(e){console.error(e);toast('Données indisponibles');return false;}
}
if(DEMO){renderTree();rp();welcome();}
else void bootData().then(()=>{
  renderTree();rp();welcome();
  const wanted=new URLSearchParams(location.search).get('session');
  if(wanted){const found=findMaquetteSession(wanted);if(found)openSession(found[0],found[1]);}
});
})();
