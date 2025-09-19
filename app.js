// Core application script for Hakka flashcards.
// Refactored for readability (no logic changes).

// ===== Theme toggle =====
(function(){
  const btn=document.getElementById('theme-toggle');
  const saved=localStorage.getItem('theme');
  if(saved==='light') document.body.classList.add('light');
  btn.textContent=document.body.classList.contains('light')? 'Dark Mode':'Light Mode';
  btn.onclick=()=>{
    document.body.classList.toggle('light');
    const isLight=document.body.classList.contains('light');
    localStorage.setItem('theme', isLight? 'light':'dark');
    btn.textContent=isLight? 'Dark Mode':'Light Mode';
  };
})();

// ===== Help modal wiring =====
(function(){
  const modal   = document.getElementById('help-modal');
  const openBtn = document.getElementById('help-btn');
  const closeBtn= modal.querySelector('.modal-close');
  const backdrop= modal.querySelector('.modal-backdrop');
  const open = ()=>{ modal.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; };
  const close= ()=>{ modal.setAttribute('aria-hidden','true');  document.body.style.overflow=''; };
  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && modal.getAttribute('aria-hidden')==='false'){ close(); } });
})();

// ===== SRS scheduling =====
const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
function schedule(card, rating){
  const q = { Again:0, Hard:1, Good:2, Easy:3 }[rating] ?? 2;
  if(card.reps==null) card.reps=0;
  if(card.ease==null) card.ease=2.5;
  if(card.interval==null) card.interval=0;
  if(q===0){
    card.interval = 0.5;
    card.ease     = Math.max(1.3, card.ease-0.2);
    card.reps     = 0;
  } else {
    if(card.reps===0){
      card.interval = q===3 ? 4/24 : q===2 ? 1 : 0.5;
    } else if(card.reps===1){
      card.interval = q===3 ? 3 : q===2 ? 2 : 1;
    } else {
      card.ease = Math.max(1.3, card.ease + (q-1)*0.05 - 0.02);
      const mult = (q===1?0.9 : q===3?1.15 : 1.0);
      card.interval = Math.round(card.interval * card.ease * mult);
    }
    card.reps += 1;
  }
  card.due = now() + card.interval * DAY;
}

// ===== Card stats =====
function updateCardStats(card, ok){
  if(card.firstSeenAt==null) card.firstSeenAt = now();
  card.lastSeenAt = now();
  card.seenCount  = (card.seenCount||0) + 1;
  if(ok===true)  card.correctCount   = (card.correctCount||0) + 1;
  if(ok===false) card.incorrectCount = (card.incorrectCount||0) + 1;
  card.studied = true;
}

// ===== Storage =====
const STORE_KEY = 'srs_decks_v1';
const loadAll = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } };
const saveAll = d => localStorage.setItem(STORE_KEY, JSON.stringify(d));
let decks = loadAll();
let currentDeck = null;
let reviewQueue = [];
let currentIndex = null;
const $ = id => document.getElementById(id);

// ===== Streak & vocab counters =====
function getLife(){ return parseInt(localStorage.getItem('streak_life')||'0',10)||0; }
function setLife(n){ localStorage.setItem('streak_life', String(n)); const el=$('streak-life'); if(el) el.textContent='Lifetime: '+n; }
function getSession(){ const el=$('streak-session'); const m=(el&&el.textContent||'').match(/(\d+)/); return m?parseInt(m[1],10):0; }
function setSession(n){ const el=$('streak-session'); if(el) el.textContent='Session: '+n; }
function bumpStreak(){ setSession(getSession()+1); setLife(getLife()+1);syncVocabCounters(); }
function syncVocabCounters(){ const s=getSession(), l=getLife(); const sv=$('vocab-session'); const lv=$('vocab-life'); if(sv) sv.textContent=s; if(lv) lv.textContent=l; }
function getLifeVocab(){ return getLife(); }
function setLifeVocab(n){ setLife(n); syncVocabCounters(); }
function getSessionVocab(){ return getSession(); }
function setSessionVocab(n){ setSession(n); syncVocabCounters(); }
function bumpVocab(){ syncVocabCounters(); }

// ===== Tone coloring & diacritics =====
const TONE_COLORS={'1':'var(--tone1)','2':'var(--tone2)','3':'var(--tone3)','4':'var(--tone4)','5':'var(--tone5)','6':'var(--tone6)'};
const TONE_DIACRITICS={'1':'́','2':'̄','3':'̌','4':'̀','5':'̌','6':'̀'};
const toneSpan = (t,n) => `<span style="color:${TONE_COLORS[n]||'#fff'}">${t}</span>`;
const extractTones = pron => (pron.match(/[1-6]/g)||[]);
function colorizeCharacters(chars, pron){
  const tones = extractTones(pron);
  const out = [];
  for(let i=0;i<chars.length;i++){
    out.push(toneSpan(chars[i], tones[i%tones.length]||'2'));
  }
  return out.join('');
}
function convertToneNumbersToDiacritics(pron){
  return pron.replace(/([A-Za-z]+)([1-6])/g,(m,syl,t)=>{
    const mark = TONE_DIACRITICS[t]||'';
    const vs = [...syl].map((c,i)=>'aeiouAEIOU'.includes(c)?i:-1).filter(i=>i>=0);
    let idx = vs.length>=2 ? vs[vs.length-2] : (vs[0]??-1);
    if(idx>=0){ syl = syl.slice(0,idx+1)+mark+syl.slice(idx+1); }
    return toneSpan(syl,t);
  });
}

// ===== TTS =====
const TTS_API_URL = "https://Chaak2.pythonanywhere.com/TTS/hakka";
function playTTS(pron){ const url = `${TTS_API_URL}/${encodeURIComponent((pron||'').trim())}?voice=male&speed=0.5`; new Audio(url).play().catch(()=>{}); }

// ===== Render helpers =====
function frontHTML(row){
  return `
    <div class="char">${colorizeCharacters(row.hakka_chars,row.pronunciation)}</div>
    <div class="label">Hakka Pronunciation:</div>
    <div class="pron">${convertToneNumbersToDiacritics(row.pronunciation)}</div>`;
}
function backHTML(row){
  const playBtn = `<button id="play-tts" class="btn" style="border-radius:999px;width:56px;height:56px;display:inline-flex;align-items:center;justify-content:center">▶</button>`;
  return `
    <div class="char">${colorizeCharacters(row.hakka_chars,row.pronunciation)}</div>
    <div class="label">Hakka Pronunciation:</div>
    <div class="pron">${convertToneNumbersToDiacritics(row.pronunciation)}</div>
    <div style="font-size:24px;margin:6px 0"><strong>普通中文:</strong> ${row.mandarin||''}</div>
    <div style="font-size:24px;margin:6px 0"><strong>Eng:</strong> ${row.english||''}</div>
    <div style="text-align:center;margin-top:6px">${playBtn}</div>`;
}

// ===== CSV parsing =====
function parseCSV(text){
  const rows=[]; let cur=''; let inQ=false; let cols=[];
  const push=()=>{ cols.push(cur); cur=''; };
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='\r') continue;
    if(ch==='\n'){
      if(inQ){ cur+='\n'; }
      else { push(); rows.push(cols); cols=[]; }
      continue;
    }
    if(ch==='"'){ inQ=!inQ; continue; }
    if(ch===',' && !inQ){ push(); continue; }
    cur+=ch;
  }
  if(cur.length||cols.length){ push(); rows.push(cols); }
  return rows;
}

// ===== Deck bootstrap =====
function rowsToCards(rows){
  return rows.map(row=>({
    id: uid(),
    front: `${row.hakka_chars} || ${row.pronunciation}`,
    back: JSON.stringify(row)
  }));
}
async function loadSeedFromCSV(){
  try{
    const res = await fetch('Hakka%20Vocabulary.csv');
    if(!res.ok) return null;
    const txt = await res.text();
    const rows = parseCSV(txt);
    if(!rows.length) return null;
    const header = rows[0];
    const idx = {
      mandarin: header.indexOf('普通中文'),
      hakka_chars: header.indexOf('客家汉字'),
      pronunciation: header.indexOf('Hakka Pronunciation'),
      english: header.indexOf('English Definition')
    };
    const data = rows.slice(1).map(r=>({
      mandarin: r[idx.mandarin]||'',
      hakka_chars: r[idx.hakka_chars]||'',
      pronunciation: r[idx.pronunciation]||'',
      english: r[idx.english]||''
    })).filter(x=>x.hakka_chars && x.pronunciation);
    return data;
  }catch{
    return null;
  }
}
function loadAllCards(){ const names=Object.keys(decks); if(names.length){ currentDeck = decks[names[0]]; return; } currentDeck=null; }

// ===== Queue =====
function shuffle(a){
  return a.slice().sort(()=>Math.random()-0.5);
}
function buildQueue(){
  if(!currentDeck){
    reviewQueue=[]; currentIndex=null; $('queue-info').textContent='0 due';
    summarizeStats();
    return;
  }
  const nowt=now();
  const dueIdx = currentDeck.cards
    .map((c,i)=>({i,due:c.due||0,reps:c.reps||0}))
    .filter(x=>x.due<=nowt)
    .map(x=>x.i);
  reviewQueue = shuffle(dueIdx);
  currentIndex = reviewQueue.length? 0 : null;
  $('queue-info').textContent = `${reviewQueue.length} due`;
  summarizeStats();
}

function summarizeStats(){
  if(!currentDeck){
    $('stat-due').textContent='0';
    $('stat-new').textContent='0';
    $('stat-review').textContent='0';
    $('stat-total').textContent='0';
    if($('vocab-session')) $('vocab-session').textContent = getSessionVocab();
    if($('vocab-life')) $('vocab-life').textContent = getLifeVocab();
    return;
  }
  const cs=currentDeck.cards;
  const total=cs.length;
  const nowt=now();
  const due=cs.filter(c=>!c.due||c.due<=nowt).length;
  const newc=cs.filter(c=>!c.reps).length;
  const review=Math.max(0, due-newc);
  $('stat-due').textContent=due;
  $('stat-new').textContent=newc;
  $('stat-review').textContent=review;
  $('stat-total').textContent=total;
  if($('vocab-session')) $('vocab-session').textContent = getSessionVocab();
  if($('vocab-life')) $('vocab-life').textContent = getLifeVocab();
}

function timeUntil(ts){
  if(!ts) return '—';
  const d = ts - now();
  if(d <= 0) return 'due now';
  const mins = Math.round(d/60000);
  if(mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins/60);
  if(hrs < 48) return `in ${hrs}h`;
  const days = Math.round(hrs/24);
  return `in ${days}d`;
}

// Render the review tab with card statistics and tables
function renderReview() {
  // Handle case when no deck is loaded
  if (!currentDeck) {
    $('rev-list').innerHTML = '<div class="small">No deck</div>';
    $('rev-due-count').textContent = '0';
    $('rev-learned-count').textContent = '0';
    $('rev-mistake-count').textContent = '0';
    return;
  }

  // Get cards and current time
  const cs = currentDeck.cards;
  const nowt = now();
  
  // Filter cards into different categories
  const due = cs.filter(c => (c.reps || 0) > 0 && (c.due || 0) <= nowt);
  const learned = cs.filter(c => (c.reps || 0) > 0);
  const mistakes = cs.filter(c => (c.incorrectCount || 0) > 0);
  
  // Update counters in the UI
  $('rev-due-count').textContent = due.length;
  $('rev-learned-count').textContent = learned.length;
  $('rev-mistake-count').textContent = mistakes.length;
  
  // Get current filter and select appropriate list
  const filter = $('rev-filter').value;
  let list = filter === 'due' ? due : (filter === 'learned' ? learned : mistakes);
  
  // Sort the list based on filter type
  list = list.slice().sort((a, b) => {
    const ad = a.due || 0, bd = b.due || 0;
    if (filter === 'due') return ad - bd;
    return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
  });
  
  // Handle empty list case
  if (list.length === 0) {
    $('rev-list').innerHTML = '<div class="small">Nothing here yet.</div>';
    return;
  }
  
  // Build HTML table
  let html = `
    <table>
      <thead>
        <tr>
          <th>普通中文</th>
          <th>客家汉字</th>
          <th>Hakka Pronunciation</th>
          <th>English Definition</th>
          <th class="rev-acc">✓ / ✗</th>
          <th class="rev-due">Due in</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  // Generate table rows for each card
  html += list.map(card => {
    let row;
    try {
      row = JSON.parse(card.back);
    } catch {
      row = null;
    }
    
    if (!row) return '';
    
    // Format the character display with tone colors
    const charHTML = `<div class="rev-hakka">${colorizeCharacters(row.hakka_chars, row.pronunciation)}</div>`;
    
    // Format pronunciation with play button
    const pronHTML = `
      <div class="rev-pron">
        ${convertToneNumbersToDiacritics(row.pronunciation)}
        <button class="btn play" data-pron="${encodeURIComponent(row.pronunciation)}" title="Play audio">▶</button>
      </div>`;
    
    // Return complete table row
    return `
      <tr>
        <td>${row.mandarin || ''}</td>
        <td>${charHTML}</td>
        <td>${pronHTML}</td>
        <td>${row.english || ''}</td>
        <td class="rev-acc">${(card.correctCount || 0)}&nbsp;✓&nbsp;/&nbsp;${(card.incorrectCount || 0)}&nbsp;✗</td>
        <td class="rev-due">${timeUntil(card.due)}</td>
      </tr>
    `;
  }).join('');
  
  html += `</tbody></table>`;
  
  // Set the HTML and add click handler for play buttons
  $('rev-list').innerHTML = html;
  $('rev-list').onclick = (e) => {
    const btn = e.target.closest('button.play');
    if (!btn) return;
    const raw = decodeURIComponent(btn.getAttribute('data-pron') || '');
    if (raw) playTTS(raw);
  };
}

// Render vocabulary list in the stats tab with search functionality
function renderVocabInStats() {
  const box = document.getElementById('vocab-list');
  if (!box) {
    return;
  }

  // Handle case when no deck is loaded or empty
  if (!currentDeck || !Array.isArray(currentDeck.cards) || currentDeck.cards.length === 0) {
    box.innerHTML = '<div class="small">No deck</div>';
    return;
  }

  // Start with all cards
  let list = currentDeck.cards.slice();
  
  // Apply search filter if there's a search query
  const q = (document.getElementById('vocab-search')?.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter(card => {
      let row;
      try {
        row = JSON.parse(card.back);
      } catch {
        row = null;
      }
      
      if (!row) return false;
      
      // Search across all fields
      const hay = `${row.mandarin || ''} ${row.hakka_chars || ''} ${row.pronunciation || ''} ${row.english || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // Handle no matches case
  if (list.length === 0) {
    box.innerHTML = '<div class="small">No matches</div>';
    return;
  }

  // Build HTML table structure
  let html = `
    <table>
      <thead>
        <tr>
          <th>普通中文</th>
          <th>客家汉字</th>
          <th>Hakka Pronunciation</th>
          <th>English Definition</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  // Generate rows for each card
  html += list.map(card => {
    let row;
    try {
      row = JSON.parse(card.back);
    } catch {
      row = null;
    }
    
    if (!row) return '';
    
    // Format characters with tone coloring
    const charHTML = `<div class="rev-hakka">${colorizeCharacters(row.hakka_chars, row.pronunciation)}</div>`;
    
    // Format pronunciation with play button
    const pronHTML = `
      <div class="rev-pron">
        ${convertToneNumbersToDiacritics(row.pronunciation)}
        <button class="btn play" data-pron="${encodeURIComponent(row.pronunciation || '')}" title="Play audio">▶</button>
      </div>`;
    
    return `
      <tr>
        <td>${row.mandarin || ''}</td>
        <td>${charHTML}</td>
        <td>${pronHTML}</td>
        <td>${row.english || ''}</td>
      </tr>
    `;
  }).join('');
  
  html += `</tbody></table>`;
  box.innerHTML = html;
}

// Event listeners for vocabulary and review functionality
document.getElementById('vocab-search')?.addEventListener('input', renderVocabInStats);

document.getElementById('vocab-list')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button.play');
  if (!btn) return;
  const raw = decodeURIComponent(btn.getAttribute('data-pron') || '');
  if (raw) playTTS(raw);
});

document.getElementById('tab-stats')?.addEventListener('click', () => {
  summarizeStats();
  renderVocabInStats();
});

$('rev-filter').addEventListener('change', renderReview);
document.getElementById('tab-review')?.addEventListener('click', renderReview);

// ===== Flashcards =====

// Show the front of a flashcard
function showFlash() {
  const btnShow = $('btn-show');
  const btnNext = $('flash-next');
  const rateIds = ['btn-again', 'btn-hard', 'btn-good', 'btn-easy'];
  
  // Handle case when no cards available or queue empty
  if (currentIndex == null || !currentDeck || !currentDeck.cards?.length) {
    $('flash-front').textContent = 'All done!';
    $('flash-back').style.display = 'none';
    btnShow.style.display = 'inline-block';
    btnNext.style.display = 'none';
    rateIds.forEach(id => $(id).style.display = 'none');
    return;
  }
  
  // Get the current card and parse its data
  const card = currentDeck.cards[reviewQueue[currentIndex]];
  let row;
  try {
    row = JSON.parse(card.back);
  } catch {
    row = null;
  }
  
  // Show the front content
  $('flash-front').innerHTML = row ? frontHTML(row) : (card.front || '');
  
  // Hide back content and rating buttons
  $('flash-back').style.display = 'none';
  btnShow.style.display = 'inline-block';
  btnNext.style.display = 'none';
  rateIds.forEach(id => $(id).style.display = 'none');
}

// Reveal the back of a flashcard with pronunciation
function revealFlash() {
  if (currentIndex == null) return;
  
  const btnShow = $('btn-show');
  const btnNext = $('flash-next');
  const rateIds = ['btn-again', 'btn-hard', 'btn-good', 'btn-easy'];
  
  // Get current card and parse data
  const card = currentDeck.cards[reviewQueue[currentIndex]];
  let row;
  try {
    row = JSON.parse(card.back);
  } catch {
    row = null;
  }
  
  // Show back content with pronunciation
  if (row) {
    $('flash-front').innerHTML = backHTML(row);
    const pb = $('play-tts');
    if (pb) {
      pb.onclick = () => playTTS(row.pronunciation);
    }
    playTTS(row.pronunciation);
  } else {
    $('flash-front').textContent = card.back || '(no back)';
  }
  
  // Hide show button, show rating buttons
  $('flash-back').style.display = 'none';
  btnShow.style.display = 'none';
  btnNext.style.display = 'none';
  rateIds.forEach(id => $(id).style.display = 'inline-block');
}

// Rate a flashcard and move to next
function rateFlash(rating) {
  if (currentIndex == null) return;
  
  const idx = reviewQueue[currentIndex];
  const card = currentDeck.cards[idx];
  
  // Schedule the card and update stats
  schedule(card, rating);
  updateCardStats(card, rating === 'Again' ? false : true);
  
  // Update streak if not marked as "Again"
  if (rating !== 'Again') bumpStreak();
  
  // Remove card from queue and update index
  reviewQueue.splice(currentIndex, 1);
  currentIndex = reviewQueue.length ? Math.min(currentIndex, reviewQueue.length - 1) : null;
  
  // Save and refresh
  saveAll(decks);
  buildQueue();
  summarizeStats();
  showFlash();
}

// Button event handlers for flashcards
$('btn-show').onclick = revealFlash;
$('btn-again').onclick = () => rateFlash('Again');
$('btn-hard').onclick = () => rateFlash('Hard');
$('btn-good').onclick = () => rateFlash('Good');
$('btn-easy').onclick = () => rateFlash('Easy');

// Keyboard shortcuts for flashcards
document.addEventListener('keydown', (e) => {
  const panelVisible = document.getElementById('panel-flash')?.getAttribute('aria-hidden') === 'false';
  if (!panelVisible || currentIndex == null) return;
  
  // Space or Enter to reveal card
  if (e.key === ' ' || e.key === 'Enter') {
    const showVisible = $('btn-show').style.display !== 'none';
    if (showVisible) {
      e.preventDefault();
      revealFlash();
    }
    return;
  }
  
  // Number keys for rating (only when rating buttons are visible)
  const ratedVisible = $('btn-again').style.display !== 'none';
  if (!ratedVisible) return;
  
  if (e.key === '1') {
    e.preventDefault();
    rateFlash('Again');
  }
  if (e.key === '2') {
    e.preventDefault();
    rateFlash('Hard');
  }
  if (e.key === '3') {
    e.preventDefault();
    rateFlash('Good');
  }
  if (e.key === '4') {
    e.preventDefault();
    rateFlash('Easy');
  }
});

// ===== Multiple Choice =====

// Set up next multiple choice question
function nextMC() {
  // Handle no deck case
  if (!currentDeck || !currentDeck.cards.length) {
    $('mc-question').textContent = 'No deck';
    $('mc-options').innerHTML = '';
    $('mc-feedback').innerHTML = '';
    $('mc-next').style.display = 'none';
    return;
  }
  
  // Select card (prioritize due cards, fall back to random)
  const dueIdx = (reviewQueue.length ? (currentIndex ?? 0) : Math.floor(Math.random() * currentDeck.cards.length));
  const cardIdx = reviewQueue.length ? reviewQueue[dueIdx] : dueIdx;
  const correct = currentDeck.cards[cardIdx];
  
  // Parse correct answer data
  let row;
  try {
    row = JSON.parse(correct.back);
  } catch {
    row = null;
  }
  
  // Show question
  $('mc-question').innerHTML = row ? frontHTML(row) : correct.front;
  
  // Create distractors (wrong answers)
  const pool = currentDeck.cards.filter(c => c !== correct);
  const distractors = shuffle(pool).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  
  // Set up UI elements
  const box = $('mc-options');
  box.innerHTML = '';
  $('mc-feedback').innerHTML = '';
  const btnNext = $('mc-next');
  btnNext.style.display = 'none';
  box.style.display = 'flex';
  
  let locked = false;
  
  // Helper to disable all buttons after answer
  function lockButtons() {
    locked = true;
    [...box.querySelectorAll('button')].forEach(b => b.disabled = true);
  }
  
  // Create option buttons
  options.forEach(opt => {
    let oRow;
    try {
      oRow = JSON.parse(opt.back);
    } catch {
      oRow = null;
    }
    
    // Use English or fallback to other fields for button label
    const label = oRow ? (oRow.english || oRow.mandarin || opt.back) : opt.back;
    
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    
    b.onclick = () => {
      if (locked) return;
      
      const ok = (opt === correct);
      
      // Visual feedback on button
      b.style.borderColor = ok ? '#16a34a' : '#ef4444';
      
      // Show result and correct answer
      const tag = `<div class="result-tag ${ok ? 'correct' : 'incorrect'}" aria-live="polite">${ok ? 'Correct' : 'Incorrect'}</div>`;
      
      if (row) {
        $('mc-question').innerHTML = tag + backHTML(row);
        const pb = $('play-tts');
        if (pb) {
          pb.onclick = () => playTTS(row.pronunciation);
        }
        playTTS(row.pronunciation);
      } else {
        $('mc-question').innerHTML = tag + (correct.back || '(no back)');
      }
      
      // Lock buttons and show next button
      lockButtons();
      box.style.display = 'none';
      
      // Update card scheduling and stats
      schedule(correct, ok ? 'Good' : 'Again');
      updateCardStats(correct, ok);
      if (ok) bumpStreak();
      
      // Save and refresh
      buildQueue();
      saveAll(decks);
      btnNext.style.display = 'inline-block';
    };
    
    box.appendChild(b);
  });
  
  // Next button handler
  btnNext.onclick = () => {
    if (reviewQueue.length) {
      currentIndex = Math.min(currentIndex ?? 0, Math.max(0, reviewQueue.length - 1));
    } else {
      currentIndex = null;
    }
    nextMC();
  };
}

// ===== Typing =====

let typingMode = 'eng';

// Handle typing mode changes
document.getElementById('typing-mode').onchange = e => {
  typingMode = e.target.value;
  localStorage.setItem('typingMode', typingMode);
  
  const inp = document.getElementById('typing-input');
  inp.placeholder = typingMode === 'eng' ? 'Type English and press Enter' : 
                   (typingMode === 'mandarin' ? '輸入普通中文...' : 'Use Hakka pinyim number tone. e.g. lui4 zui4 ');
};

// Restore saved typing mode on load
(function() {
  const saved = localStorage.getItem('typingMode');
  if (saved) {
    typingMode = saved;
    document.getElementById('typing-mode').value = saved;
  }
})();

// Helper to check if deck is available
function hasDeck() {
  return (typeof currentDeck !== 'undefined' && currentDeck && Array.isArray(currentDeck.cards));
}

// Set up next typing exercise
function nextTyping() {
  const qEl = document.getElementById('typing-question');
  const inp = document.getElementById('typing-input');
  const fb = document.getElementById('typing-feedback');
  const nxt = document.getElementById('typing-next');
  
  // Handle no deck case
  if (!hasDeck() || !currentDeck.cards.length) {
    qEl.textContent = 'No deck';
    inp.value = '';
    fb.textContent = '';
    nxt.style.display = 'none';
    return;
  }
  
  // Select card (prioritize due cards, fall back to random)
  const dueIdx = (Array.isArray(reviewQueue) && reviewQueue.length ? (currentIndex ?? 0) : Math.floor(Math.random() * currentDeck.cards.length));
  const cardIdx = (Array.isArray(reviewQueue) && reviewQueue.length) ? reviewQueue[dueIdx] : dueIdx;
  const card = currentDeck.cards[cardIdx];
  
  // Parse card data
  let row;
  try {
    row = JSON.parse(card.back);
  } catch {
    row = null;
  }
  
  // Show question
  qEl.innerHTML = row ? frontHTML(row) : (card.front || '');
  
  // Reset UI
  fb.innerHTML = '';
  nxt.style.display = 'none';
  inp.disabled = false;
  inp.value = '';
  setTimeout(() => inp.focus(), 0);
  
  // Determine expected answer based on typing mode
  const expected = row ? 
    (typingMode === 'eng' ? (row.english || '') : 
     typingMode === 'mandarin' ? (row.mandarin || '') : 
     (row.pronunciation || '')) : 
    (card.back || '');
  
  // Handle Enter key for answer submission
  inp.onkeydown = (e) => {
    if (e.isComposing) return;
    if (e.key !== 'Enter') return;
    
    e.preventDefault();
    const ans = inp.value.trim();
    const ok = ans.toLowerCase() === String(expected || '').toLowerCase();
    
    // Update card stats
    updateCardStats(card, ok);
    
    // Show result
    const tag = `<div class="result-tag ${ok ? 'correct' : 'incorrect'}" aria-live="polite">${ok ? 'Correct' : 'Incorrect'}</div>`;
    
    if (row) {
      qEl.innerHTML = tag + backHTML(row);
      const pb = document.getElementById('play-tts');
      if (pb) {
        pb.onclick = () => playTTS(row.pronunciation);
      }
      playTTS(row.pronunciation);
    } else {
      qEl.innerHTML = tag + (card.back || '(no back)');
    }
    
    // Disable input and show next button
    inp.disabled = true;
    nxt.style.display = 'inline-block';
    
    // Update scheduling and stats
    if (typeof schedule === 'function') schedule(card, ok ? 'Good' : 'Again');
    if (ok && typeof bumpStreak === 'function') bumpStreak();
    if (typeof buildQueue === 'function') buildQueue();
    saveAll(decks);
  };
  
  // Next button handler
  nxt.onclick = () => {
    if (Array.isArray(reviewQueue) && reviewQueue.length) {
      currentIndex = Math.min(currentIndex ?? 0, Math.max(0, reviewQueue.length - 1));
    } else {
      currentIndex = null;
    }
    inp.disabled = false;
    nextTyping();
  };
}

// Initialize typing mode on page load
document.addEventListener('DOMContentLoaded', () => {
  try {
    nextTyping();
  } catch {}
});

// Set up typing when tab is clicked
document.getElementById('tab-typing')?.addEventListener('click', () => {
  nextTyping();
});

// ===== Helpers =====

// Generate unique ID for cards
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ===== Import/Export =====

// Import cards from CSV
document.getElementById('import-csv')?.addEventListener('click', async () => {
  if (!currentDeck) {
    alert('No deck loaded.');
    return;
  }
  
  // Get CSV text from textarea or file input
  let text = $('csv-text').value.trim();
  if (!text && $('csv-file').files[0]) {
    text = await $('csv-file').files[0].text();
  }
  
  if (!text) return alert('Paste CSV or choose a file.');
  
  // Parse CSV data
  const rows = parseCSV(text);
  if (!rows.length) return alert('No rows detected.');
  
  // Map column headers to data indices
  const header = rows[0];
  const idx = {
    mandarin: header.indexOf('普通中文'),
    hakka_chars: header.indexOf('客家汉字'),
    pronunciation: header.indexOf('Hakka Pronunciation'),
    english: header.indexOf('English Definition')
  };
  
  // Convert rows to card data
  const data = rows.slice(1).map(r => ({
    mandarin: r[idx.mandarin] || '',
    hakka_chars: r[idx.hakka_chars] || '',
    pronunciation: r[idx.pronunciation] || '',
    english: r[idx.english] || ''
  })).filter(x => x.hakka_chars && x.pronunciation);
  
  // Create cards from data
  const added = data.map(row => ({
    id: uid(),
    front: `${row.hakka_chars} || ${row.pronunciation}`,
    back: JSON.stringify(row)
  }));
  
  // Add to current deck
  currentDeck.cards.push(...added);
  saveAll(decks);
  buildQueue();
  summarizeStats();
  alert(`Imported ${added.length} cards.`);
});

// Export deck data as JSON
document.getElementById('export-json')?.addEventListener('click', () => {
  const data = JSON.stringify(decks, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'flashcards-progress.json';
  a.click();
  URL.revokeObjectURL(url);
});

// Import deck data from JSON
document.getElementById('import-json')?.addEventListener('click', () => {
  const f = $('import-json-file').files[0];
  if (!f) return alert('Choose a file.');
  
  f.text().then(txt => {
    try {
      decks = JSON.parse(txt);
      saveAll(decks);
      loadAllCards();
      buildQueue();
      showFlash();
      summarizeStats();
      alert('Imported!');
    } catch (e) {
      alert('Invalid JSON.');
    }
  });
});

// ===== Tabs wiring =====

// Set up tab navigation system
document.querySelectorAll('[role="tab"]').forEach(tab => {
  tab.addEventListener('click', () => {
    // Hide all tab panels
    document.querySelectorAll('.tabpanel').forEach(p => p.setAttribute('aria-hidden', 'true'));
    
    // Show selected panel
    document.getElementById('panel-' + tab.dataset.panel).setAttribute('aria-hidden', 'false');
    
    // Update tab selection states
    document.querySelectorAll('[role="tab"]').forEach(t => t.setAttribute('aria-selected', 'false'));
    tab.setAttribute('aria-selected', 'true');
    
    // Initialize content for specific tabs
    if (tab.dataset.panel === 'mc') nextMC();
    if (tab.dataset.panel === 'typing') nextTyping();
    if (tab.dataset.panel === 'flash') showFlash();
    if (tab.dataset.panel === 'stats') summarizeStats();
    if (tab.dataset.panel === 'review') renderReview();
  });
});

// ===== Bootstrap =====

// Initialize the application
(async function() {
  // Load seed data if no decks exist
  if (Object.keys(decks).length === 0) {
    const seed = await loadSeedFromCSV();
    if (seed && seed.length) {
      const name = 'Hakka Basics (seed)';
      decks[name] = {
        name,
        createdAt: Date.now(),
        cards: rowsToCards(seed)
      };
      saveAll(decks);
    }
  }
  
  // Initialize counters and stats
  setLife(getLife());
  setSession(0);
  setLifeVocab(getLifeVocab());
  setSessionVocab(0);
  
  // Set up the application state
  loadAllCards();
  buildQueue();
  showFlash();
  summarizeStats();
})();
