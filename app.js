(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cfg = window.QUIZ_LAB_CONFIG || {cloudEnabled:false};
  const params = new URL(location.href).searchParams;
  const quizId = params.get('quiz');
  let quiz = null;
  let state = null;
  let timerId = null;
  let cloudTimer = null;
  let cloudOkay = false;

  const makeToken = () => globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)});
  const attemptFromUrl = () => new URL(location.href).searchParams.get('attempt');
  const stateKey = token => `familyQuizLab:${quiz.id}:${token}`;
  const activeKey = () => `familyQuizLab:${quiz.id}:active`;
  const localGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const localSet = (key,val) => { try { localStorage.setItem(key,val); } catch {} };
  const localRemove = key => { try { localStorage.removeItem(key); } catch {} };

  function setUrlToken(token){
    const u = new URL(location.href); u.searchParams.set('attempt', token); history.replaceState(null,'',u.href);
  }
  function saveLocal(){
    if(!state?.attemptToken) return;
    localSet(stateKey(state.attemptToken), JSON.stringify(state));
    localSet(activeKey(), state.attemptToken);
  }
  function loadLocal(token){
    try { const raw=localGet(stateKey(token)); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function freshState(token=makeToken()){
    return {attemptToken:token,quizId:quiz.id,name:quiz.studentDefault||'Aya',answers:{},page:0,startAt:null,endAt:null,submitted:false,submittedAt:null};
  }
  function resetLocal(){
    if(state?.attemptToken) localRemove(stateKey(state.attemptToken));
    localRemove(activeKey());
    const u=new URL(location.href);u.searchParams.delete('attempt');history.replaceState(null,'',u.href);
  }
  async function rpc(name, body){
    const r=await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:cfg.supabasePublishableKey,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`Cloud ${r.status}`);
    const t=await r.text(); return t ? JSON.parse(t) : null;
  }
  function scheduleCloud(){ if(!cfg.cloudEnabled || !state?.startAt) return; clearTimeout(cloudTimer); cloudTimer=setTimeout(saveCloud,650); }
  async function saveCloud(){
    if(!cfg.cloudEnabled || !state?.startAt) return;
    $('#cloudStatus').textContent='Bulut · kaydediliyor';
    const g=grade();
    const elapsed=state.submitted?Math.max(0,Math.floor(((state.submittedAt||Date.now())-state.startAt)/1000)):null;
    try{
      await rpc(cfg.saveRpc,{p_attempt_token:state.attemptToken,p_quiz_id:quiz.id,p_student_name:state.name,p_status:state.submitted?'submitted':'in_progress',p_started_at:new Date(state.startAt).toISOString(),p_submitted_at:state.submittedAt?new Date(state.submittedAt).toISOString():null,p_current_page:state.page,p_answers:state.answers,p_total_score:state.submitted?g.total:null,p_percent:state.submitted?Math.round(g.total/quiz.questions.length*100):null,p_elapsed_seconds:elapsed,p_subject_scores:state.submitted?g.subjects:null,p_result_summary:state.submitted?{wrong_count:g.wrong.length,concepts:conceptSummary()}:null});
      cloudOkay=true; $('#cloudStatus').textContent='Bulut ✓'; if($('#cloudNotice')) $('#cloudNotice').textContent='Sonuç ve cevaplar ayrı Quiz Lab bulutunda kayıtlı.';
    }catch(e){ cloudOkay=false; $('#cloudStatus').textContent='Yerel ✓ · bulut bekliyor'; if($('#cloudNotice')) $('#cloudNotice').textContent='Bulut kaydı geçici olarak başarısız; cihazdaki yerel kayıt korunuyor.'; }
  }
  async function loadCloud(token){
    if(!cfg.cloudEnabled) return null;
    try{
      const row=await rpc(cfg.loadRpc,{p_attempt_token:token});
      if(!row || row.quiz_id!==quiz.id) return null;
      cloudOkay=true;
      return {attemptToken:row.attempt_token,quizId:row.quiz_id,name:row.student_name||quiz.studentDefault||'Aya',answers:row.answers||{},page:row.current_page||0,startAt:new Date(row.started_at).getTime(),endAt:new Date(row.started_at).getTime()+quiz.targetMinutes*60000,submitted:row.status==='submitted',submittedAt:row.submitted_at?new Date(row.submitted_at).getTime():null};
    }catch{return null;}
  }
  function save(){ saveLocal(); scheduleCloud(); }
  function question(n){ return quiz.questions.find(q=>q.n===n); }
  function grade(){
    let total=0; const subjects={}; const wrong=[];
    quiz.questions.forEach(q=>{ subjects[q.section] ||= {score:0,max:0}; subjects[q.section].max++; if(state.answers[q.n]===q.a){total++;subjects[q.section].score++;} else wrong.push(q); });
    return {total,subjects,wrong};
  }
  function conceptSummary(){
    const map={}; quiz.questions.forEach(q=>{map[q.skill]||={ok:0,total:0};map[q.skill].total++;if(state.answers[q.n]===q.a)map[q.skill].ok++;}); return map;
  }
  function startTimer(){
    clearInterval(timerId); const tick=()=>{const left=Math.ceil((state.endAt-Date.now())/1000); if(left>0){const m=Math.floor(left/60),s=left%60;$('#timer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;$('#timer').classList.toggle('danger',left<=300);}else{const over=Math.floor((Date.now()-state.endAt)/1000),m=Math.floor(over/60),s=over%60;$('#timer').textContent=`+${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;$('#timer').classList.add('danger');}}; tick(); timerId=setInterval(tick,1000);
  }
  function updateProgress(){ const a=Object.keys(state.answers).length; $('#answered').textContent=`${a}/${quiz.questions.length}`; $('#bar').style.width=`${a/quiz.questions.length*100}%`; }
  function renderStepper(){
    const root=$('#stepper');root.innerHTML='';quiz.pages.forEach((p,i)=>{const b=document.createElement('button');b.className='step'+(i===state.page?' active':'')+(p.nums.every(n=>state.answers[n]!==undefined)?' done':'');b.textContent=i+1;b.onclick=()=>{state.page=i;save();renderStepper();renderPage();scrollTo(0,0)};root.appendChild(b);});
  }
  function renderPage(){
    const p=quiz.pages[state.page];$('#pageTitle').textContent=p.title;$('#pageSub').textContent=p.subtitle||'';$('#pageNo').textContent=`Bölüm ${state.page+1} / ${quiz.pages.length}`;const root=$('#questions');root.innerHTML='';
    p.nums.forEach(n=>{const q=question(n),d=document.createElement('div');d.className='card';d.innerHTML=`<div class="qhead"><div class="qnum">${q.n}</div><div><div class="qtext">${esc(q.q)}</div><div class="skill">${esc(q.skill)}</div></div></div><div class="opts">${q.opts.map((o,i)=>`<label class="option"><input type="radio" name="q${q.n}" value="${i}" ${String(state.answers[q.n])===String(i)?'checked':''}><span><strong>${'ABCD'[i]})</strong> ${esc(o)}</span></label>`).join('')}</div>`;root.appendChild(d);});
    root.querySelectorAll('input[type=radio]').forEach(inp=>inp.onchange=e=>{state.answers[Number(e.target.name.slice(1))]=Number(e.target.value);save();updateProgress();renderStepper();navInfo();});
    $('#prevBtn').disabled=state.page===0;$('#nextBtn').classList.toggle('hidden',state.page===quiz.pages.length-1);$('#finishBtn').classList.toggle('hidden',state.page!==quiz.pages.length-1);navInfo();
  }
  function navInfo(){const p=quiz.pages[state.page],a=p.nums.filter(n=>state.answers[n]!==undefined).length;$('#navTitle').textContent=`Bu bölüm: ${a}/${p.nums.length} cevaplandı`;$('#navSub').textContent=a===p.nums.length?'Bu bölüm tamamlandı.':`${p.nums.length-a} soru boş.`;}
  function enterExam(){ $('#start').classList.add('hidden');$('#results').style.display='none';$('#exam').style.display='block';$('#topbar').classList.remove('hidden');renderStepper();renderPage();updateProgress();startTimer();scrollTo(0,0); }
  function startNew(){ resetLocal(); state=freshState(); state.name=$('#name').value.trim()||quiz.studentDefault||'Aya';state.startAt=Date.now();state.endAt=state.startAt+quiz.targetMinutes*60000;setUrlToken(state.attemptToken);saveLocal();enterExam();saveCloud(); }
  function go(d){state.page=Math.max(0,Math.min(quiz.pages.length-1,state.page+d));save();renderStepper();renderPage();scrollTo(0,0);}
  function askFinish(){const blank=quiz.questions.length-Object.keys(state.answers).length;$('#modalText').textContent=blank?`${blank} soru boş. Yine de teslim edebilirsin.`:'Tüm sorular cevaplandı.';$('#modal').classList.remove('hidden');}
  function submit(){if(state.submitted)return showResults();state.submitted=true;state.submittedAt=Date.now();saveLocal();clearInterval(timerId);$('#modal').classList.add('hidden');showResults();saveCloud();}
  function level(score,max){const p=score/max;return p>=.85?['Güçlü','good']:p>=.65?['Orta · tekrar gerekli','mid']:['Öncelikli tekrar','low'];}
  function showResults(){
    $('#start').classList.add('hidden');$('#exam').style.display='none';$('#topbar').classList.add('hidden');$('#results').style.display='block';const g=grade(),pct=Math.round(g.total/quiz.questions.length*100),elapsed=Math.floor(((state.submittedAt||Date.now())-state.startAt)/1000),mins=Math.floor(elapsed/60),secs=elapsed%60,over=Math.max(0,elapsed-quiz.targetMinutes*60);$('#resultName').textContent=`${state.name} · ${quiz.title}`;$('#bigScore').textContent=`${g.total}/${quiz.questions.length}`;$('#resultMeta').textContent=`Başarı %${pct} · Süre ${mins} dk ${secs} sn${over?` · hedef süreden +${Math.floor(over/60)} dk ${over%60} sn`:''}`;const overall=level(g.total,quiz.questions.length);$('#verdict').textContent=overall[0];$('#verdict').className='verdict '+overall[1];$('#cloudNotice').textContent=cfg.cloudEnabled?(cloudOkay?'Sonuç bulutta kayıtlı.':'Bulut kaydı kontrol ediliyor…'):'Şu anda yalnızca bu cihazda kayıtlı; ayrı Quiz Lab bulutu bağlandıktan sonra bulut senkronu otomatik açılacak.';
    const grid=$('#scoreGrid');grid.innerHTML='';Object.entries(g.subjects).forEach(([s,v])=>{const lv=level(v.score,v.max);grid.innerHTML+=`<div class="scorebox"><span>${esc(s)}</span><strong>${v.score}/${v.max}</strong><span class="verdict ${lv[1]}" style="font-size:.8rem">${lv[0]}</span></div>`;});renderConcepts();renderReport();scrollTo(0,0);
  }
  function renderConcepts(){const c=conceptSummary(),root=$('#concepts');root.innerHTML='';Object.entries(c).sort((a,b)=>(a[1].ok/a[1].total)-(b[1].ok/b[1].total)).forEach(([skill,v])=>{const p=v.ok/v.total,cls=p===1?'good':p>=.5?'mid':'low';root.innerHTML+=`<span class="tag ${cls}">${esc(skill)} · ${v.ok}/${v.total}</span>`;});}
  function renderReport(){const root=$('#report');root.innerHTML='';[...new Set(quiz.questions.map(q=>q.section))].forEach(sec=>{const qs=quiz.questions.filter(q=>q.section===sec),issues=qs.filter(q=>state.answers[q.n]!==q.a),d=document.createElement('details');d.className='acc';d.open=true;d.innerHTML=`<summary>${esc(sec)} · ${issues.length} yanlış/boş</summary>`;const body=document.createElement('div');body.className='accbody';if(!issues.length)body.innerHTML='<span class="verdict good">Bu bölümde yanlış yok.</span>';issues.forEach(q=>{const ans=state.answers[q.n],r=document.createElement('details');r.className='review';r.innerHTML=`<summary>Soru ${q.n} · ${ans===undefined?'Boş':'Yanlış'} · ${esc(q.skill)}</summary><div class="reviewbody"><strong>${esc(q.q)}</strong><div class="abox"><strong>Verilen cevap:</strong> ${ans===undefined?'Boş':`${'ABCD'[ans]}) ${esc(q.opts[ans])}`}</div><div class="abox right"><strong>Doğru cevap:</strong> ${'ABCD'[q.a]}) ${esc(q.opts[q.a])}</div><div class="abox"><strong>Neden?</strong><br>${esc(q.exp)}</div><div class="abox tip"><strong>Tekrar ipucu:</strong><br>${esc(q.tip)}</div></div>`;body.appendChild(r);});d.appendChild(body);root.appendChild(d);});}
  async function copyLink(){try{await navigator.clipboard.writeText(location.href);alert('Özel devam/sonuç bağlantısı kopyalandı.');}catch{prompt('Bu bağlantıyı kopyalayın:',location.href);}}
  async function boot(){
    if(!quizId){$('#loading').innerHTML='<h1>Quiz bulunamadı</h1><p class="muted">Ana sayfaya dönün.</p>';return;}
    try{quiz=await fetch(`quizzes/${encodeURIComponent(quizId)}.json`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json();});}catch{$('#loading').innerHTML='<h1>Quiz yüklenemedi</h1><p class="muted">Quiz kodunu kontrol edin.</p>';return;}
    document.title=`${quiz.studentDefault||''} · ${quiz.title}`;$('#brand').textContent=`${quiz.studentDefault||'Family'} · ${quiz.shortTitle||quiz.title}`;$('#startTitle').textContent=quiz.title;$('#startDescription').textContent=quiz.description||'';$('#name').value=quiz.studentDefault||'Aya';$('#startMeta').innerHTML=`<span class="pill">${quiz.questions.length} soru</span><span class="pill">${quiz.targetMinutes} dk hedef</span><span class="pill">${quiz.pages.length} kısa bölüm</span>`;
    $('#loading').classList.add('hidden');$('#start').classList.remove('hidden');
    const tok=attemptFromUrl()||localGet(activeKey()); if(tok){state=await loadCloud(tok)||loadLocal(tok);if(state){setUrlToken(tok);$('#name').value=state.name||quiz.studentDefault||'Aya';if(state.submitted)showResults();else $('#resumeBox').classList.remove('hidden');}}
    state ||= freshState();
    $('#cloudStatus').textContent=cfg.cloudEnabled?'Bulut hazır':'Yerel kayıt';
  }
  $('#startBtn').onclick=startNew;$('#resumeBtn').onclick=()=>enterExam();$('#resetBtn').onclick=()=>{if(confirm('Yeni deneme başlatılsın mı?')){resetLocal();location.reload();}};$('#copyBtn').onclick=copyLink;$('#copyResult').onclick=copyLink;$('#prevBtn').onclick=()=>go(-1);$('#nextBtn').onclick=()=>go(1);$('#finishBtn').onclick=askFinish;$('#cancel').onclick=()=>$('#modal').classList.add('hidden');$('#confirm').onclick=submit;$('#newBtn').onclick=()=>{if(confirm('Yeni deneme başlatılsın mı? Eski bulut sonucu korunur.')){resetLocal();location.reload();}};
  boot();
})();
