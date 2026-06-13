// ===================== STATE =====================
const STORAGE_KEY = "tecnicapro_state_v1";

function exById(id){ return EXERCISES.find(e=>e.id===id); }

function defaultState(){
  // deep clone program with runtime fields
  const program = {};
  for(const w of [1,2,3,4]){
    program[w] = PROGRAM_SEED[w].map((day,i)=>({
      ...day,
      day: i+1,
      status: "todo", // todo | progress | done
      adapted: null, // text note if adapted
      readiness: null,
      blocks: day.blocks.map(b=>({...b, status:"todo", rating:null}))
    }));
  }
  return {
    theme:"light",
    currentWeek: 1,
    player: JSON.parse(JSON.stringify(PLAYER_SEED)),
    program,
    history: [], // {date, week, day, title, durata, rating, skillsTrained:[]}
    exerciseFeedback: {}, // exId -> {easy:n, hard:n, just:n}
    todayIndex: { week:1, day:1 }, // pointer to "today"
    activeSession: null // {week,day, blockIdx, timerSec, running, readiness}
  };
}

let state = load();

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return defaultState();
}
function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ===================== UTIL =====================
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2200);
}
function getDay(week, dayNum){ return state.program[week][dayNum-1]; }
function todayDay(){ return getDay(state.todayIndex.week, state.todayIndex.day); }

function openModal(html){
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("overlay").classList.add("show");
}
function closeModal(){
  document.getElementById("overlay").classList.remove("show");
}
document.getElementById("overlay").addEventListener("click",(e)=>{
  if(e.target.id==="overlay") closeModal();
});

function fmtTime(sec){
  const m = Math.floor(sec/60).toString().padStart(2,"0");
  const s = (sec%60).toString().padStart(2,"0");
  return `${m}:${s}`;
}

// ===================== THEME =====================
function applyTheme(){
  document.body.setAttribute("data-theme", state.theme);
  document.getElementById("themeToggle").textContent = state.theme==="dark" ? "☀️" : "🌙";
}
document.getElementById("themeToggle").addEventListener("click",()=>{
  state.theme = state.theme==="dark" ? "light" : "dark";
  applyTheme(); save();
});

// ===================== NAVIGATION =====================
let currentPage = "home";
document.querySelectorAll(".navbtn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".navbtn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentPage = btn.dataset.page;
    render();
  });
});

function goto(page){
  document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active", b.dataset.page===page));
  currentPage = page;
  render();
}

// ===================== ADAPTIVE ENGINE =====================
// Records feedback for exercise and updates global counters
function recordExerciseFeedback(exId, rating){
  if(!state.exerciseFeedback[exId]) state.exerciseFeedback[exId] = {easy:0, hard:0, giusto:0};
  state.exerciseFeedback[exId][rating==="facile"?"easy":rating==="difficile"?"hard":"giusto"]++;
}

// Update skill ratings based on session performance
function updateSkillsFromSession(day, avgDifficulty){
  const skill = day.focus;
  let delta = 1;
  if(avgDifficulty==="facile") delta = 1.5;
  else if(avgDifficulty==="difficile") delta = 0.5;
  state.player.skills[skill] = Math.min(99, Math.round((state.player.skills[skill] + delta)*10)/10);
}

// Generate adaptation notes for next weeks based on history & feedback
function runAdaptiveEngine(){
  const p = state.player;
  let suggestions = [];

  // 1. check exercise feedback -> propose harder/easier variants for future weeks
  for(const exId in state.exerciseFeedback){
    const fb = state.exerciseFeedback[exId];
    const ex = exById(exId);
    if(fb.easy>=2){
      suggestions.push(`"${ex.nome}" è stato segnato facile più volte: nelle prossime sedute proporremo una variante più complessa (es. tempo ridotto o vincolo aggiuntivo).`);
    }
    if(fb.hard>=2){
      suggestions.push(`"${ex.nome}" è stato segnato difficile più volte: verrà semplificato o sostituito con una progressione intermedia.`);
    }
  }

  // 2. streak / missed days check
  if(p.streak===0 && state.history.length>0){
    suggestions.push("Hai saltato gli ultimi giorni: la prossima seduta sarà una versione di rientro più leggera.");
  }

  // 3. skill-based volume adjustment
  const skills = p.skills;
  const lowest = Object.entries(skills).sort((a,b)=>a[1]-b[1])[0];
  const highest = Object.entries(skills).sort((a,b)=>b[1]-a[1])[0];
  if(lowest[1] < 55){
    suggestions.push(`${SKILL_LABELS[lowest[0]]} è la skill con punteggio più basso: aumenteremo il volume di lavoro dedicato nella prossima settimana.`);
  }
  if(highest[1] >= 65){
    suggestions.push(`${SKILL_LABELS[highest[0]]} sta migliorando bene: manterremo varietà alzando la complessità decisionale degli esercizi.`);
  }

  return suggestions;
}

// Apply adaptation to a specific upcoming day (called when generating "adapted" labels)
function getDayAdaptationLabel(week, day){
  const d = getDay(week, day);
  if(d.status !== "todo") return d.adapted;

  // check if previous 2 days were skipped (status todo and date passed) -- simplified: use streak
  if(state.player.streak===0 && state.history.length>0 && week===state.todayIndex.week && day===state.todayIndex.day){
    return "Versione di rientro (ridotta intensità)";
  }
  // check exercise feedback for blocks in this day
  for(const b of d.blocks){
    const fb = state.exerciseFeedback[b.exId];
    if(fb){
      if(fb.easy>=2) return "Variante avanzata proposta";
      if(fb.hard>=2) return "Progressione semplificata proposta";
    }
  }
  return null;
}

// ===================== RENDER ROOT =====================
function render(){
  applyTheme();
  const app = document.getElementById("app");
  if(currentPage==="home") app.innerHTML = renderHome();
  else if(currentPage==="programma") app.innerHTML = renderProgramma();
  else if(currentPage==="libreria") app.innerHTML = renderLibreria();
  else if(currentPage==="scheda") app.innerHTML = renderScheda();
  else if(currentPage==="progressi") app.innerHTML = renderProgressi();
  bindPageEvents();
}

// ===================== HOME =====================
function renderHome(){
  const p = state.player;
  const tw = state.todayIndex.week, td = state.todayIndex.day;
  const day = getDay(tw, td);
  const statusBadge = day.status==="done" ? `<span class="badge badge-done">✓ Completata</span>`
                    : day.status==="progress" ? `<span class="badge badge-progress">In corso</span>`
                    : `<span class="badge badge-todo">Non iniziata</span>`;

  const adapt = getDayAdaptationLabel(tw, td);
  const weekProgress = computeWeekProgress(tw);
  const suggestions = runAdaptiveEngine();
  const tip = suggestions.length ? suggestions[Math.floor(Date.now()/86400000) % suggestions.length] : "Continua così, ogni sessione costruisce il tuo livello!";

  return `
  <div class="card" style="background:linear-gradient(135deg,var(--accent),var(--blue)); color:#fff; border:none;">
    <div class="row">
      <div>
        <div style="font-size:1.1rem;font-weight:800;">Ciao ${p.nome} 👋</div>
        <div style="opacity:.9; font-size:.85rem; margin-top:2px;">Settimana ${tw} · Giorno ${td}/7 · Livello ${p.livello}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:1.6rem; font-weight:800;">🔥 ${p.streak}</div>
        <div style="font-size:.7rem; opacity:.85;">giorni di streak</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="row" style="margin-bottom:8px;">
      <h3>Seduta di oggi</h3>
      ${statusBadge}
    </div>
    <div style="font-weight:800; font-size:1.05rem;">${day.title}</div>
    <div class="muted" style="margin-top:2px;">Focus: ${SKILL_LABELS[day.focus]} · ${day.durata} min · ${LIVELLO_LABELS[day.livello]}</div>
    ${adapt ? `<div class="coach-msg" style="margin-top:10px;"><span class="ic">🔄</span><span>${adapt}</span></div>` : ""}
    <button class="btn btn-primary btn-block" style="margin-top:12px;" id="btnStartSession">
      ${day.status==="done" ? "Rivedi seduta" : day.status==="progress" ? "Continua allenamento" : "▶ Inizia allenamento"}
    </button>
  </div>

  <div class="card">
    <h3>Andamento settimanale</h3>
    <div class="muted" style="margin-bottom:8px;">${weekProgress.done}/7 sedute completate</div>
    <div class="pbar"><div style="width:${(weekProgress.done/7*100)}%"></div></div>
  </div>

  <div class="section-title">Le tue skill</div>
  <div class="grid4">
    ${Object.keys(SKILL_LABELS).map(k=>skillCard(k)).join("")}
  </div>

  <div class="card">
    <h3>💡 Suggerimento del giorno</h3>
    <div class="muted" style="margin-top:6px; line-height:1.5;">${tip}</div>
  </div>
  `;
}

function skillCard(key){
  const val = state.player.skills[key];
  return `
  <div class="card skillcard">
    <div class="ring" style="--p:${val}"><span>${val}</span></div>
    <div style="font-weight:700; font-size:.8rem;">${SKILL_LABELS[key]}</div>
  </div>`;
}

function computeWeekProgress(week){
  const days = state.program[week];
  return { done: days.filter(d=>d.status==="done").length, total: 7 };
}

// ===================== PROGRAMMA =====================
function renderProgramma(){
  const w = state.currentWeek;
  const days = state.program[w];
  const weekFocusLabels = {
    1:"Pulizia tecnica e primo controllo",
    2:"Cambio di direzione e cambio di passo",
    3:"Decisione tecnica e visione di gioco",
    4:"Consolidamento, densità e test"
  };
  return `
  <h1 class="page-title">Programma mensile</h1>
  <div class="weekstrip">
    ${[1,2,3,4].map(i=>`<button class="weekbtn ${i===w?'active':''}" data-week="${i}">Settimana ${i}</button>`).join("")}
  </div>
  <div class="card">
    <div class="muted">Focus settimana ${w}</div>
    <div style="font-weight:800; margin-top:2px;">${weekFocusLabels[w]}</div>
  </div>
  <div class="daylist">
    ${days.map((d,i)=>renderDayItem(w,d,i+1)).join("")}
  </div>
  `;
}

function renderDayItem(week, d, dayNum){
  const badge = d.status==="done" ? `<span class="badge badge-done">✓ Fatto</span>`
              : d.status==="progress" ? `<span class="badge badge-progress">In corso</span>`
              : `<span class="badge badge-todo">Da fare</span>`;
  const adapt = getDayAdaptationLabel(week, dayNum);
  return `
  <div class="dayitem" data-week="${week}" data-day="${dayNum}">
    <div>
      <div class="dname">Giorno ${dayNum} · ${d.title}</div>
      <div class="dfocus">${SKILL_LABELS[d.focus]} · ${d.durata} min · ${LIVELLO_LABELS[d.livello]}</div>
      ${adapt ? `<div class="dfocus" style="color:var(--accent2); margin-top:4px;">🔄 ${adapt}</div>` : ""}
    </div>
    ${badge}
  </div>`;
}

// ===================== SESSION DETAIL =====================
function renderSessionPage(week, dayNum){
  const d = getDay(week, dayNum);
  const totalBlocks = d.blocks.length;
  const doneBlocks = d.blocks.filter(b=>b.status==="done").length;

  return `
  <h1 class="page-title">
    <button class="icon-btn" style="display:inline-flex; margin-right:8px;" id="btnBackProgram">←</button>
    Giorno ${dayNum} · Sett. ${week}
  </h1>
  <div class="card">
    <div style="font-weight:800; font-size:1.1rem;">${d.title}</div>
    <div class="muted" style="margin-top:4px;">Focus: ${SKILL_LABELS[d.focus]} · ${d.durata} min totali · ${LIVELLO_LABELS[d.livello]}</div>
    ${d.adapted ? `<div class="coach-msg" style="margin-top:10px;"><span class="ic">🔄</span><span>${d.adapted}</span></div>` : ""}
    <div class="pbar" style="margin-top:10px;"><div style="width:${(doneBlocks/totalBlocks*100)}%"></div></div>
    <div class="muted" style="margin-top:6px;">${doneBlocks}/${totalBlocks} blocchi completati</div>
    ${d.status!=="done" ? `<button class="btn btn-primary btn-block" style="margin-top:12px;" id="btnReadiness">
      ${d.status==="todo" ? "▶ Inizia seduta" : "Continua seduta"}
    </button>` : `<div class="badge badge-done" style="margin-top:12px;">✓ Seduta completata</div>`}
  </div>

  <div class="section-title">Blocchi esercizio</div>
  ${d.blocks.map((b,i)=>renderExerciseBlock(week,dayNum,b,i)).join("")}

  ${d.status==="progress" && doneBlocks===totalBlocks ? `
  <button class="btn btn-primary btn-block" id="btnFinishSession">Termina seduta e vedi recap</button>` : ""}
  `;
}

function renderExerciseBlock(week, dayNum, b, idx){
  const ex = exById(b.exId);
  const done = b.status==="done";
  const ratingBadge = b.rating ? `<span class="badge ${b.rating==='facile'?'badge-easy':b.rating==='difficile'?'badge-hard':'badge-medium'}">${b.rating}</span>` : "";
  return `
  <div class="exblock ${done?'done':''}">
    <div class="exhead">
      <div>
        <div class="exname">${idx+1}. ${ex.nome}</div>
        <div class="exmeta">${SKILL_LABELS[ex.skill]} · ${ex.durata} min · ${LIVELLO_LABELS[ex.livello]} · ${ex.tipo}</div>
      </div>
      ${done ? `<span class="badge badge-done">✓</span>` : ""}
    </div>
    <div class="exdesc">${ex.descrizione}</div>
    ${b.note ? `<div class="exmeta" style="margin-top:6px;"><b>Nota:</b> ${b.note}</div>` : ""}
    <div class="exmeta" style="margin-top:6px;"><b>Materiale:</b> ${ex.materiale}</div>
    <div class="exfooter">
      <a class="videolink" href="${ex.video}" target="_blank" rel="noopener">▶ Video dimostrativo</a>
    </div>
    <div class="exfooter">
      ${ratingBadge}
      ${!done && state.activeSession ? `<button class="btn btn-primary btn-sm" data-action="startEx" data-week="${week}" data-day="${dayNum}" data-idx="${idx}">Avvia esercizio</button>` : ""}
      ${done ? "" : ""}
    </div>
  </div>`;
}

// ===================== LIBRERIA =====================
function renderLibreria(){
  const f = state.libFilter || {skill:"", livello:"", tipo:""};
  let list = EXERCISES.filter(e=>{
    if(f.skill && e.skill!==f.skill) return false;
    if(f.livello && e.livello!==f.livello) return false;
    if(f.tipo && e.tipo!==f.tipo) return false;
    return true;
  });
  const tipi = [...new Set(EXERCISES.map(e=>e.tipo))];
  return `
  <h1 class="page-title">Libreria esercizi</h1>
  <div class="filters">
    <select id="filtSkill">
      <option value="">Tutte le skill</option>
      ${Object.entries(SKILL_LABELS).map(([k,v])=>`<option value="${k}" ${f.skill===k?'selected':''}>${v}</option>`).join("")}
    </select>
    <select id="filtLivello">
      <option value="">Tutti i livelli</option>
      ${Object.entries(LIVELLO_LABELS).map(([k,v])=>`<option value="${k}" ${f.livello===k?'selected':''}>${v}</option>`).join("")}
    </select>
    <select id="filtTipo">
      <option value="">Tutti i tipi</option>
      ${tipi.map(t=>`<option value="${t}" ${f.tipo===t?'selected':''}>${t}</option>`).join("")}
    </select>
  </div>
  <div class="muted" style="margin-bottom:10px;">${list.length} esercizi trovati</div>
  ${list.map(ex=>`
    <div class="exblock" data-exid="${ex.id}" style="cursor:pointer;">
      <div class="exhead">
        <div>
          <div class="exname">${ex.nome}</div>
          <div class="exmeta">${SKILL_LABELS[ex.skill]} · ${ex.durata} min · ${ex.tipo}</div>
        </div>
        <span class="badge ${ex.livello==='base'||ex.livello==='facile'?'badge-easy':ex.livello==='medio'?'badge-medium':'badge-hard'}">${LIVELLO_LABELS[ex.livello]}</span>
      </div>
    </div>
  `).join("")}
  `;
}

// ===================== SCHEDA PERSONALE =====================
function renderScheda(){
  const p = state.player;
  const completionRate = computeCompletionRate();
  const { easyEx, hardEx } = computeEasyHardExercises();
  const suggestions = runAdaptiveEngine();

  return `
  <h1 class="page-title">Scheda giocatore</h1>
  <div class="card" style="text-align:center;">
    <div style="width:72px;height:72px;border-radius:50%;background:var(--accent-soft); display:flex; align-items:center; justify-content:center; font-size:2rem; margin:0 auto 10px;">🧑‍🦱</div>
    <div style="font-weight:800; font-size:1.1rem;">${p.nome}</div>
    <div class="muted">${p.eta} anni</div>
    <div style="margin-top:8px;">
      <input type="text" id="ruoloInput" value="${p.ruolo}" style="text-align:center; max-width:240px; margin:0 auto;">
    </div>
    <div class="row" style="margin-top:14px; justify-content:center; gap:24px;">
      <div><div style="font-weight:800; font-size:1.2rem;">${p.livello}</div><div class="muted" style="font-size:.75rem;">Livello</div></div>
      <div><div style="font-weight:800; font-size:1.2rem;">${p.xp}</div><div class="muted" style="font-size:.75rem;">XP tecnico</div></div>
      <div><div style="font-weight:800; font-size:1.2rem;">🔥${p.streak}</div><div class="muted" style="font-size:.75rem;">Streak</div></div>
    </div>
  </div>

  <div class="section-title">Skill rating</div>
  <div class="grid4">${Object.keys(SKILL_LABELS).map(k=>skillCard(k)).join("")}</div>

  <div class="card">
    <h3>Punti forti</h3>
    <div style="margin-top:6px;">
      ${Object.entries(p.skills).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>`<span class="chip">${SKILL_LABELS[k]} (${v})</span>`).join("")}
    </div>
    <h3 style="margin-top:14px;">Aree prioritarie</h3>
    <div style="margin-top:6px;">
      ${Object.entries(p.skills).sort((a,b)=>a[1]-b[1]).slice(0,2).map(([k,v])=>`<span class="chip" style="background:#fde6e2; color:#c0392b;">${SKILL_LABELS[k]} (${v})</span>`).join("")}
    </div>
  </div>

  <div class="card">
    <h3>Statistiche</h3>
    <div class="muted" style="margin-top:6px;">Tasso di completamento sedute: <b>${completionRate}%</b></div>
    <div class="muted" style="margin-top:4px;">Sessioni nello storico: <b>${state.history.length}</b></div>
    <div class="muted" style="margin-top:8px;"><b>Esercizi percepiti facili:</b> ${easyEx.length ? easyEx.join(", ") : "—"}</div>
    <div class="muted" style="margin-top:4px;"><b>Esercizi percepiti difficili:</b> ${hardEx.length ? hardEx.join(", ") : "—"}</div>
  </div>

  <div class="card">
    <h3>🏅 Badge</h3>
    <div style="margin-top:8px;">
      ${p.badges.length ? p.badges.map(b=>`<span class="chip">${b}</span>`).join("") : `<span class="muted">Nessun badge ancora — completa sedute per sbloccarli!</span>`}
    </div>
  </div>

  <div class="card">
    <h3>🤖 Coach AI · Raccomandazioni</h3>
    ${suggestions.length ? suggestions.map(s=>`<div class="coach-msg"><span class="ic">💬</span><span>${s}</span></div>`).join("") : `<div class="muted">Completa qualche seduta per ricevere raccomandazioni personalizzate.</div>`}
  </div>

  <div class="card">
    <h3>Note personali</h3>
    <textarea id="noteUtente" rows="3" placeholder="Scrivi qui le tue note...">${p.noteUtente}</textarea>
    <button class="btn btn-secondary btn-sm" id="btnSaveNote" style="margin-top:8px;">Salva nota</button>
  </div>

  <div class="section-title">Storico sessioni</div>
  ${state.history.length ? state.history.slice().reverse().map(h=>`
    <div class="card">
      <div class="row">
        <div>
          <div style="font-weight:700;">${h.title}</div>
          <div class="muted" style="font-size:.78rem;">${h.date} · Sett. ${h.week} Giorno ${h.day}</div>
        </div>
        <span class="badge ${h.rating==='facile'?'badge-easy':h.rating==='difficile'?'badge-hard':'badge-medium'}">${h.rating}</span>
      </div>
    </div>
  `).join("") : `<div class="empty">Nessuna sessione completata ancora.</div>`}
  `;
}

function computeCompletionRate(){
  let total=0, done=0;
  for(const w of [1,2,3,4]){
    for(const d of state.program[w]){
      total++; if(d.status==="done") done++;
    }
  }
  return total ? Math.round(done/total*100) : 0;
}

function computeEasyHardExercises(){
  const easyEx=[], hardEx=[];
  for(const exId in state.exerciseFeedback){
    const fb = state.exerciseFeedback[exId];
    const ex = exById(exId);
    if(fb.easy>=2) easyEx.push(ex.nome);
    if(fb.hard>=2) hardEx.push(ex.nome);
  }
  return {easyEx, hardEx};
}

// ===================== PROGRESSI =====================
function renderProgressi(){
  const totalSessions = state.history.length;
  const completionRate = computeCompletionRate();
  const skills = state.player.skills;

  // weekly volume (sum durata of done days per week)
  const weeklyVolume = [1,2,3,4].map(w=>{
    return state.program[w].filter(d=>d.status==="done").reduce((s,d)=>s+d.durata,0);
  });
  const maxVol = Math.max(60, ...weeklyVolume);

  const difficultyCounts = {facile:0, giusto:0, difficile:0};
  state.history.forEach(h=>{ difficultyCounts[h.rating] = (difficultyCounts[h.rating]||0)+1; });
  const maxDiff = Math.max(1, ...Object.values(difficultyCounts));

  const { easyEx, hardEx } = computeEasyHardExercises();

  return `
  <h1 class="page-title">Progressi</h1>
  <div class="grid2">
    <div class="card" style="text-align:center;">
      <div style="font-size:1.6rem; font-weight:800;">${totalSessions}</div>
      <div class="muted">Sessioni completate</div>
    </div>
    <div class="card" style="text-align:center;">
      <div style="font-size:1.6rem; font-weight:800;">${completionRate}%</div>
      <div class="muted">Aderenza programma</div>
    </div>
    <div class="card" style="text-align:center;">
      <div style="font-size:1.6rem; font-weight:800;">🔥${state.player.streak}</div>
      <div class="muted">Streak attuale</div>
    </div>
    <div class="card" style="text-align:center;">
      <div style="font-size:1.6rem; font-weight:800;">${state.player.xp}</div>
      <div class="muted">XP tecnico</div>
    </div>
  </div>

  <div class="section-title">Andamento skill</div>
  <div class="card">
    ${Object.entries(skills).map(([k,v])=>`
      <div style="margin-bottom:10px;">
        <div class="row" style="margin-bottom:4px;"><span style="font-weight:700; font-size:.85rem;">${SKILL_LABELS[k]}</span><span class="muted">${v}/99</span></div>
        <div class="pbar"><div style="width:${v}%"></div></div>
      </div>
    `).join("")}
  </div>

  <div class="section-title">Volume settimanale (minuti completati)</div>
  <div class="card">
    <div style="display:flex; align-items:flex-end; gap:14px; height:120px;">
      ${weeklyVolume.map((v,i)=>`
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;">
          <div style="width:100%; background:linear-gradient(180deg,var(--accent),var(--blue)); border-radius:6px 6px 0 0; height:${Math.max(4,(v/maxVol*90))}px;"></div>
          <div class="muted" style="font-size:.72rem;">Sett.${i+1}</div>
          <div style="font-size:.72rem; font-weight:700;">${v}'</div>
        </div>
      `).join("")}
    </div>
  </div>

  <div class="section-title">Difficoltà percepita sessioni</div>
  <div class="card">
    <div style="display:flex; align-items:flex-end; gap:14px; height:100px;">
      ${["facile","giusto","difficile"].map(k=>`
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;">
          <div style="width:100%; background:${k==='facile'?'#22d98a':k==='giusto'?'#f5a623':'#e6553a'}; border-radius:6px 6px 0 0; height:${Math.max(4,(difficultyCounts[k]/maxDiff*70))}px;"></div>
          <div class="muted" style="font-size:.72rem;">${k}</div>
          <div style="font-size:.72rem; font-weight:700;">${difficultyCounts[k]}</div>
        </div>
      `).join("")}
    </div>
  </div>

  <div class="card">
    <h3>Esercizi più efficaci / problematici</h3>
    <div class="muted" style="margin-top:6px;"><b>Efficaci (facili):</b> ${easyEx.length?easyEx.join(", "):"—"}</div>
    <div class="muted" style="margin-top:4px;"><b>Problematici (difficili):</b> ${hardEx.length?hardEx.join(", "):"—"}</div>
  </div>
  `;
}

// ===================== EVENT BINDING =====================
function bindPageEvents(){
  // HOME
  const btnStart = document.getElementById("btnStartSession");
  if(btnStart) btnStart.addEventListener("click",()=>{
    goto("programma");
    setTimeout(()=>openSessionPage(state.todayIndex.week, state.todayIndex.day), 0);
  });

  // PROGRAMMA: week switch
  document.querySelectorAll(".weekbtn").forEach(b=>{
    b.addEventListener("click",()=>{
      state.currentWeek = parseInt(b.dataset.week);
      save(); render();
    });
  });
  // day items
  document.querySelectorAll(".dayitem").forEach(it=>{
    it.addEventListener("click",()=>{
      openSessionPage(parseInt(it.dataset.week), parseInt(it.dataset.day));
    });
  });

  // SESSION PAGE controls
  const back = document.getElementById("btnBackProgram");
  if(back) back.addEventListener("click",()=>{ render(); });

  const readinessBtn = document.getElementById("btnReadiness");
  if(readinessBtn) readinessBtn.addEventListener("click", showReadinessModal);

  document.querySelectorAll('[data-action="startEx"]').forEach(b=>{
    b.addEventListener("click",()=>{
      startExercise(parseInt(b.dataset.week), parseInt(b.dataset.day), parseInt(b.dataset.idx));
    });
  });

  const finishBtn = document.getElementById("btnFinishSession");
  if(finishBtn) finishBtn.addEventListener("click",()=>showFeedbackModal(state.activeSession.week, state.activeSession.day));

  // LIBRERIA filters
  ["filtSkill","filtLivello","filtTipo"].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener("change",()=>{
      state.libFilter = state.libFilter || {};
      const key = id==="filtSkill"?"skill":id==="filtLivello"?"livello":"tipo";
      state.libFilter[key] = el.value;
      render();
    });
  });
  document.querySelectorAll(".exblock[data-exid]").forEach(card=>{
    card.addEventListener("click",()=>showExerciseDetail(card.dataset.exid));
  });

  // SCHEDA
  const ruoloInput = document.getElementById("ruoloInput");
  if(ruoloInput) ruoloInput.addEventListener("change",()=>{
    state.player.ruolo = ruoloInput.value; save();
  });
  const saveNoteBtn = document.getElementById("btnSaveNote");
  if(saveNoteBtn) saveNoteBtn.addEventListener("click",()=>{
    state.player.noteUtente = document.getElementById("noteUtente").value;
    save(); toast("Nota salvata");
  });
}

// session page is rendered into #app directly (acts as sub-view of programma)
function openSessionPage(week, day){
  document.getElementById("app").innerHTML = renderSessionPage(week, day);
  bindPageEvents();
}

// ===================== EXERCISE DETAIL MODAL (libreria) =====================
function showExerciseDetail(exId){
  const ex = exById(exId);
  openModal(`
    <h3>${ex.nome}</h3>
    <div class="muted" style="margin-bottom:8px;">${SKILL_LABELS[ex.skill]} · ${ex.durata} min · ${LIVELLO_LABELS[ex.livello]} · ${ex.tipo}</div>
    <div style="line-height:1.5; margin-bottom:10px;">${ex.descrizione}</div>
    <div class="muted" style="margin-bottom:10px;"><b>Materiale:</b> ${ex.materiale}</div>
    <a class="videolink" href="${ex.video}" target="_blank" rel="noopener">▶ Apri video dimostrativo</a>
    <button class="btn btn-outline btn-block" style="margin-top:16px;" onclick="closeModal()">Chiudi</button>
  `);
}

// ===================== READINESS CHECK =====================
function showReadinessModal(){
  openModal(`
    <h3>Come ti senti oggi?</h3>
    <div class="readiness-row">
      <label>Livello di energia (1-5)</label>
      <div class="scale" id="scaleEnergia">${[1,2,3,4,5].map(n=>`<button data-val="${n}">${n}</button>`).join("")}</div>
    </div>
    <div class="readiness-row">
      <label>Concentrazione (1-5)</label>
      <div class="scale" id="scaleConcentrazione">${[1,2,3,4,5].map(n=>`<button data-val="${n}">${n}</button>`).join("")}</div>
    </div>
    <div class="readiness-row">
      <label>Gambe pesanti?</label>
      <div class="scale" id="scaleGambe">
        <button data-val="si">Sì</button>
        <button data-val="no">No</button>
      </div>
    </div>
    <button class="btn btn-primary btn-block" id="btnConfirmReadiness" disabled>Avvia seduta</button>
  `);

  const readiness = {energia:null, concentrazione:null, gambe:null};
  function setupScale(id, key){
    document.querySelectorAll(`#${id} button`).forEach(btn=>{
      btn.addEventListener("click",()=>{
        document.querySelectorAll(`#${id} button`).forEach(b=>b.classList.remove("sel"));
        btn.classList.add("sel");
        readiness[key] = btn.dataset.val;
        checkReady();
      });
    });
  }
  setupScale("scaleEnergia","energia");
  setupScale("scaleConcentrazione","concentrazione");
  setupScale("scaleGambe","gambe");
  function checkReady(){
    const btn = document.getElementById("btnConfirmReadiness");
    btn.disabled = !(readiness.energia && readiness.concentrazione && readiness.gambe);
  }
  document.getElementById("btnConfirmReadiness").addEventListener("click",()=>{
    closeModal();
    beginSession(readiness);
  });
}

function beginSession(readiness){
  const week = state.todayIndex.week, day = state.todayIndex.day;
  const d = getDay(week,day);
  d.status = "progress";
  d.readiness = readiness;

  // micro-adaptation message
  let adaptMsg = null;
  if(readiness.energia<=2 || readiness.gambe==="si"){
    adaptMsg = "Versione leggera: riduci leggermente l'intensità e i recuperi più lunghi tra i blocchi.";
  } else if(readiness.concentrazione<=2){
    adaptMsg = "Versione focus qualità: meno ripetizioni, più attenzione alla precisione del gesto.";
  } else {
    adaptMsg = "Versione standard: procedi con il programma come pianificato.";
  }
  d.adapted = adaptMsg;

  state.activeSession = { week, day, startTime: Date.now() };
  save();
  openSessionPage(week, day);
  toast("Seduta avviata!");
}

// ===================== EXERCISE TIMER =====================
function startExercise(week, day, idx){
  const d = getDay(week,day);
  const b = d.blocks[idx];
  const ex = exById(b.exId);
  let remaining = ex.durata*60;
  let running = true;
  let timerInt = null;

  function renderTimerModal(){
    openModal(`
      <h3>${ex.nome}</h3>
      <div class="muted">${ex.descrizione}</div>
      <div class="timer-display" id="timerDisplay">${fmtTime(remaining)}</div>
      <div class="row" style="gap:8px;">
        <button class="btn btn-outline btn-block" id="btnPauseTimer">${running?'⏸ Pausa':'▶ Riprendi'}</button>
        <button class="btn btn-primary btn-block" id="btnDoneExercise">✓ Termina esercizio</button>
      </div>
    `);
    document.getElementById("btnPauseTimer").addEventListener("click",()=>{
      running = !running;
      document.getElementById("btnPauseTimer").textContent = running?'⏸ Pausa':'▶ Riprendi';
    });
    document.getElementById("btnDoneExercise").addEventListener("click",()=>{
      clearInterval(timerInt);
      closeModal();
      showRatingModal(week,day,idx);
    });
  }
  renderTimerModal();
  timerInt = setInterval(()=>{
    if(running && remaining>0){
      remaining--;
      const disp = document.getElementById("timerDisplay");
      if(disp) disp.textContent = fmtTime(remaining);
      if(remaining===0){
        clearInterval(timerInt);
        toast("Tempo terminato!");
      }
    }
  },1000);
}

function showRatingModal(week, day, idx){
  openModal(`
    <h3>Come è andato l'esercizio?</h3>
    <div class="rating-row" id="ratingRow">
      <button class="rating-btn" data-val="facile">😊 Facile</button>
      <button class="rating-btn" data-val="giusto">👍 Giusto</button>
      <button class="rating-btn" data-val="difficile">😓 Difficile</button>
    </div>
    <button class="btn btn-primary btn-block" id="btnConfirmRating" disabled>Conferma</button>
  `);
  let chosen = null;
  document.querySelectorAll("#ratingRow .rating-btn").forEach(b=>{
    b.addEventListener("click",()=>{
      document.querySelectorAll("#ratingRow .rating-btn").forEach(x=>x.classList.remove("sel"));
      b.classList.add("sel");
      chosen = b.dataset.val;
      document.getElementById("btnConfirmRating").disabled=false;
    });
  });
  document.getElementById("btnConfirmRating").addEventListener("click",()=>{
    const d = getDay(week,day);
    const b = d.blocks[idx];
    b.status = "done";
    b.rating = chosen;
    recordExerciseFeedback(b.exId, chosen);
    state.player.xp += 10;
    checkLevelUp();
    save();
    closeModal();
    openSessionPage(week,day);
  });
}

function checkLevelUp(){
  const p = state.player;
  const newLevel = Math.floor(p.xp/100)+1;
  if(newLevel>p.livello){
    p.livello = newLevel;
    toast(`🎉 Livello ${newLevel} raggiunto!`);
  }
}

// ===================== SESSION FEEDBACK / RECAP =====================
function showFeedbackModal(week, day){
  openModal(`
    <h3>Feedback finale seduta</h3>
    <div class="readiness-row">
      <label>Difficoltà percepita complessiva</label>
      <div class="scale" id="scaleFinal">
        <button data-val="facile">Facile</button>
        <button data-val="giusto">Giusto</button>
        <button data-val="difficile">Difficile</button>
      </div>
    </div>
    <div class="readiness-row">
      <label>Nota del giorno (opzionale)</label>
      <textarea id="noteGiorno" rows="2" placeholder="Come ti sei sentito oggi?"></textarea>
    </div>
    <button class="btn btn-primary btn-block" id="btnConfirmFinal" disabled>Vedi recap</button>
  `);
  let chosen = null;
  document.querySelectorAll("#scaleFinal button").forEach(b=>{
    b.addEventListener("click",()=>{
      document.querySelectorAll("#scaleFinal button").forEach(x=>x.classList.remove("sel"));
      b.classList.add("sel");
      chosen = b.dataset.val;
      document.getElementById("btnConfirmFinal").disabled=false;
    });
  });
  document.getElementById("btnConfirmFinal").addEventListener("click",()=>{
    const note = document.getElementById("noteGiorno").value;
    completeSession(week, day, chosen, note);
  });
}

function completeSession(week, day, finalRating, note){
  const d = getDay(week,day);
  d.status = "done";

  // history entry
  state.history.push({
    date: new Date().toLocaleDateString("it-IT"),
    week, day, title:d.title, durata:d.durata, rating:finalRating, note,
    skillsTrained:[d.focus]
  });

  // skill update
  updateSkillsFromSession(d, finalRating);

  // streak update
  state.player.streak += 1;
  state.player.xp += 30;
  checkLevelUp();

  // badges
  awardBadges();

  // advance todayIndex
  advanceToday(week, day);

  state.activeSession = null;
  save();

  // build recap
  const totalEx = d.blocks.length;
  const skillsTrained = [...new Set(d.blocks.map(b=>SKILL_LABELS[exById(b.exId).skill]))];
  const tomorrow = nextDayPreview();
  const advice = generateTomorrowAdvice(finalRating);

  openModal(`
    <h3>🎉 Seduta completata!</h3>
    <div class="card" style="margin-top:10px;">
      <div class="row"><span class="muted">Durata totale</span><b>${d.durata} min</b></div>
      <div class="row" style="margin-top:6px;"><span class="muted">Esercizi completati</span><b>${totalEx}/${totalEx}</b></div>
      <div class="row" style="margin-top:6px;"><span class="muted">Difficoltà percepita</span><b>${finalRating}</b></div>
      <div class="row" style="margin-top:6px;"><span class="muted">Skill allenate</span><b>${skillsTrained.join(", ")}</b></div>
    </div>
    <div class="coach-msg" style="margin-top:10px;"><span class="ic">💡</span><span>${advice}</span></div>
    ${tomorrow ? `<div class="muted" style="margin-top:8px;">Prossima seduta: <b>${tomorrow.title}</b> (Sett.${tomorrow.week}, Giorno ${tomorrow.day})</div>` : ""}
    <button class="btn btn-primary btn-block" style="margin-top:16px;" onclick="closeModal(); goto('home');">Torna alla home</button>
  `);
  render();
}

function advanceToday(week, day){
  if(day<7){ state.todayIndex = {week, day:day+1}; }
  else if(week<4){ state.todayIndex = {week:week+1, day:1}; }
  // week 4 day 7 = program complete, leave as is
}

function nextDayPreview(){
  const {week,day} = state.todayIndex;
  if(week>4) return null;
  const d = getDay(week,day);
  return {title:d.title, week, day};
}

function generateTomorrowAdvice(rating){
  if(rating==="difficile") return "Sessione impegnativa: domani recupero attivo o intensità leggermente ridotta.";
  if(rating==="facile") return "Tutto fluido! Domani possiamo alzare leggermente la complessità.";
  return "Buon equilibrio. Domani continuiamo con la progressione pianificata.";
}

function awardBadges(){
  const p = state.player;
  const has = b=>p.badges.includes(b);
  if(p.streak>=3 && !has("🔥 Costanza x3")) p.badges.push("🔥 Costanza x3");
  if(p.streak>=7 && !has("🏆 Settimana perfetta")) p.badges.push("🏆 Settimana perfetta");
  if(state.history.length>=1 && !has("⚽ Prima seduta")) p.badges.push("⚽ Prima seduta");
  // weak foot badge: check if any session focus controllo done 3 times
  const controlloCount = state.history.filter(h=>h.skillsTrained.includes("controllo")||h.skillsTrained.includes(SKILL_LABELS.controllo)).length;
  if(controlloCount>=3 && !has("🦶 Piede debole")) p.badges.push("🦶 Piede debole");
  const scanCount = state.history.filter(h=>h.skillsTrained.includes(SKILL_LABELS.visione)).length;
  if(scanCount>=3 && !has("👀 Maestro scansione")) p.badges.push("👀 Maestro scansione");
}

// ===================== INIT =====================
applyTheme();
render();
