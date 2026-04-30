// Core application script for Hakka flashcards.
// v2: unified card pool deduplicated across CSV-backed sets,
// global set picker, per-card SRS state.

// ===== Vocab Image Config =====
// Set to '' for local dev, or a CDN/hosting URL for production
const IMAGE_BASE_URL = '';
let vocabImageManifest = {};

async function loadVocabImageManifest() {
  try {
    const res = await fetch('src/data/vocab-image-manifest.json');
    if (res.ok) vocabImageManifest = await res.json();
  } catch { /* manifest not available — images will use placeholders */ }
}

function getVocabImageHTML(english) {
  const entry = vocabImageManifest[english];
  if (!entry || !entry.image) return '';
  const src = IMAGE_BASE_URL ? `${IMAGE_BASE_URL}/${entry.image}` : `public/${entry.image}`;
  return `<img class="vocab-img" src="${src}" alt="${english}" onerror="this.style.display='none'">`;
}

// ===== Mobile & Touch Enhancements =====

document.addEventListener('touchstart', {}, { passive: true });

document.addEventListener('touchstart', (e) => {
  if (e.target.closest('.btn, .tabbar button')) {
    e.target.closest('.btn, .tabbar button').style.opacity = '0.7';
  }
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (e.target.closest('.btn, .tabbar button')) {
    setTimeout(() => {
      e.target.closest('.btn, .tabbar button').style.opacity = '';
    }, 150);
  }
}, { passive: true });

function setupMobileKeyboard() {
  const typingInput = document.getElementById('typing-input');
  if (!typingInput) return;
  typingInput.addEventListener('focus', () => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');
  });
  typingInput.addEventListener('blur', () => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.setAttribute('content', 'width=device-width, initial-scale=1');
  });
}

// ===== Theme toggle =====
(function () {
  const btn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('theme');
  if (saved === 'light') document.body.classList.add('light');
  btn.textContent = document.body.classList.contains('light') ? 'Dark Mode' : 'Light Mode';
  btn.onclick = () => {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    btn.textContent = isLight ? 'Dark Mode' : 'Light Mode';
  };
})();

// ===== Help modal wiring =====
(function () {
  const modal = document.getElementById('help-modal');
  const openBtn = document.getElementById('help-btn');
  const closeBtn = modal.querySelector('.modal-close');
  const backdrop = modal.querySelector('.modal-backdrop');
  const open = () => { modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; };
  const close = () => { modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };
  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') close(); });
})();

// ===== SRS scheduling =====
const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
function schedule(card, rating) {
  const q = { Again: 0, Hard: 1, Good: 2, Easy: 3 }[rating] ?? 2;
  if (card.reps == null) card.reps = 0;
  if (card.ease == null) card.ease = 2.5;
  if (card.interval == null) card.interval = 0;
  if (q === 0) {
    card.interval = 0.5;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.reps = 0;
  } else {
    if (card.reps === 0) {
      card.interval = q === 3 ? 4 / 24 : q === 2 ? 1 : 0.5;
    } else if (card.reps === 1) {
      card.interval = q === 3 ? 3 : q === 2 ? 2 : 1;
    } else {
      card.ease = Math.max(1.3, card.ease + (q - 1) * 0.05 - 0.02);
      const mult = (q === 1 ? 0.9 : q === 3 ? 1.15 : 1.0);
      card.interval = Math.round(card.interval * card.ease * mult);
    }
    card.reps += 1;
  }
  card.due = now() + card.interval * DAY;
}

// ===== Card stats =====
function updateCardStats(card, ok) {
  if (card.firstSeenAt == null) card.firstSeenAt = now();
  card.lastSeenAt = now();
  card.seenCount = (card.seenCount || 0) + 1;
  if (ok === true) card.correctCount = (card.correctCount || 0) + 1;
  if (ok === false) card.incorrectCount = (card.incorrectCount || 0) + 1;
  card.studied = true;
}

// ===== Storage =====
// v2: srs_cards_v2 (per-card SRS state, deduplicated across sets)
// v1 (legacy): srs_decks_v1 — read once for migration, preserved as backup.
const STATE_KEY_V2 = 'srs_cards_v2';
const OPFS_FILENAME_V2 = 'srs_cards_v2.json';
const LEGACY_KEY_V1 = 'srs_decks_v1';
const LEGACY_OPFS_V1 = 'srs_decks_v1.json';
const LEGACY_BACKUP_KEY = 'srs_decks_v1_backup';
let _opfsAvailable = false;

async function probeOpfs() {
  try {
    if (typeof navigator?.storage?.getDirectory === 'function') {
      await navigator.storage.getDirectory();
      _opfsAvailable = true;
    }
  } catch { _opfsAvailable = false; }
}

async function readOpfsJson(filename) {
  try {
    if (!_opfsAvailable) return null;
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(filename, { create: false }).catch(() => null);
    if (!fh) return null;
    const file = await fh.getFile();
    const text = await file.text();
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}

async function writeOpfsJson(filename, json) {
  if (!_opfsAvailable) return;
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(json);
    await writable.close();
  } catch {}
}

async function loadStateAsync() {
  let state = await readOpfsJson(OPFS_FILENAME_V2);
  if (!state) {
    try {
      const raw = localStorage.getItem(STATE_KEY_V2);
      if (raw) state = JSON.parse(raw);
    } catch (e) {
      try { localStorage.setItem(STATE_KEY_V2 + '_corrupted_' + Date.now(), localStorage.getItem(STATE_KEY_V2) || ''); } catch {}
      console.warn('srs_cards_v2 corrupted; starting fresh', e);
      state = null;
    }
  }
  if (!state || !state.cards) return null;
  return state;
}

function saveState(state) {
  const json = JSON.stringify(state);
  try { localStorage.setItem(STATE_KEY_V2, json); } catch {}
  if (_opfsAvailable) {
    writeOpfsJson(OPFS_FILENAME_V2, json);
  }
}

async function loadLegacyV1Async() {
  let data = await readOpfsJson(LEGACY_OPFS_V1);
  if (!data) {
    try { data = JSON.parse(localStorage.getItem(LEGACY_KEY_V1) || 'null'); } catch { data = null; }
  }
  return data || null;
}

// ===== Identity & normalization =====
function nfcTrim(s) {
  return (s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}
function cardKeyOf(row) {
  return nfcTrim(row.hakka_chars) + '|' + nfcTrim((row.pronunciation || '').toLowerCase());
}
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ===== Migration =====
function migrateV1ToV2(oldDecks) {
  const out = { version: 2, cards: {} };
  if (!oldDecks || typeof oldDecks !== 'object') return out;
  for (const deckName of Object.keys(oldDecks)) {
    const deck = oldDecks[deckName];
    if (!deck || !Array.isArray(deck.cards)) continue;
    for (const card of deck.cards) {
      let row;
      try { row = JSON.parse(card.back); } catch { continue; }
      if (!row || !row.hakka_chars || !row.pronunciation) continue;
      const key = cardKeyOf(row);
      const existing = out.cards[key];
      const cardLastSeen = card.lastSeenAt || 0;
      if (!existing || cardLastSeen > (existing.lastSeenAt || 0)) {
        out.cards[key] = {
          id: card.id || uid(),
          hakka_chars: row.hakka_chars,
          pronunciation: row.pronunciation,
          mandarin: row.mandarin || '',
          chinese_def: row.chinese_def || '',
          english: row.english || '',
          sources: [],
          due: card.due,
          reps: card.reps,
          ease: card.ease,
          interval: card.interval,
          firstSeenAt: card.firstSeenAt,
          lastSeenAt: card.lastSeenAt,
          seenCount: card.seenCount,
          correctCount: card.correctCount,
          incorrectCount: card.incorrectCount,
          studied: card.studied
        };
      }
    }
  }
  return out;
}

// ===== Streak & vocab counters =====
const $ = id => document.getElementById(id);
function getLife() { return parseInt(localStorage.getItem('streak_life') || '0', 10) || 0; }
function setLife(n) { localStorage.setItem('streak_life', String(n)); const el = $('streak-life'); if (el) el.textContent = 'Lifetime: ' + n; }
function getSession() { const el = $('streak-session'); const m = (el && el.textContent || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; }
function setSession(n) { const el = $('streak-session'); if (el) el.textContent = 'Session: ' + n; }
function bumpStreak() { setSession(getSession() + 1); setLife(getLife() + 1); syncVocabCounters(); }
function syncVocabCounters() { const s = getSession(), l = getLife(); const sv = $('vocab-session'); const lv = $('vocab-life'); if (sv) sv.textContent = s; if (lv) lv.textContent = l; }
function getLifeVocab() { return getLife(); }
function setLifeVocab(n) { setLife(n); syncVocabCounters(); }
function getSessionVocab() { return getSession(); }
function setSessionVocab(n) { setSession(n); syncVocabCounters(); }

// ===== Tone coloring & diacritics =====
const TONE_COLORS = { '1': 'var(--tone1)', '2': 'var(--tone2)', '3': 'var(--tone3)', '4': 'var(--tone4)', '5': 'var(--tone5)', '6': 'var(--tone6)' };
const TONE_DIACRITICS = { '1': '́', '2': '̄', '3': '̌', '4': '̀', '5': '̌', '6': '̀' };
const toneSpan = (t, n) => `<span style="color:${TONE_COLORS[n] || '#fff'}">${t}</span>`;
const extractTones = pron => (pron.match(/[1-6]/g) || []);
function colorizeCharacters(chars, pron) {
  const tones = extractTones(pron);
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    out.push(toneSpan(chars[i], tones[i % tones.length] || '2'));
  }
  return out.join('');
}
function convertToneNumbersToDiacritics(pron) {
  return pron.replace(/([A-Za-z]+)([1-6])/g, (m, syl, t) => {
    const mark = TONE_DIACRITICS[t] || '';
    const vs = [...syl].map((c, i) => 'aeiouAEIOU'.includes(c) ? i : -1).filter(i => i >= 0);
    let idx = vs.length >= 2 ? vs[vs.length - 2] : (vs[0] ?? -1);
    if (idx >= 0) { syl = syl.slice(0, idx + 1) + mark + syl.slice(idx + 1); }
    return toneSpan(syl, t);
  });
}

// ===== TTS =====
const TTS_API_URL = "https://Chaak2.pythonanywhere.com/TTS/hakka";
function playTTS(pron) { const url = `${TTS_API_URL}/${encodeURIComponent((pron || '').trim())}?voice=male&speed=1`; new Audio(url).play().catch(() => {}); }

// ===== Render helpers =====
function chineseLineHTML(card) {
  if (card.mandarin) return `<div style="font-size:24px;margin:6px 0"><strong>普通中文:</strong> ${card.mandarin}</div>`;
  if (card.chinese_def) return `<div style="font-size:18px;margin:6px 0;line-height:1.4"><strong>中文釋義:</strong> ${card.chinese_def}</div>`;
  return '';
}
function frontHTML(card) {
  return `
    <div class="char">${colorizeCharacters(card.hakka_chars, card.pronunciation)}</div>
    <div class="label">Hakka Pronunciation:</div>
    <div class="pron">${convertToneNumbersToDiacritics(card.pronunciation)}</div>`;
}
function backHTML(card) {
  const playBtn = `<button id="play-tts" class="btn" style="border-radius:999px;width:56px;height:56px;display:inline-flex;align-items:center;justify-content:center">▶</button>`;
  const imgHTML = getVocabImageHTML(card.english);
  return `
    <div class="char">${colorizeCharacters(card.hakka_chars, card.pronunciation)}</div>
    <div class="label">Hakka Pronunciation:</div>
    <div class="pron">${convertToneNumbersToDiacritics(card.pronunciation)}</div>
    ${imgHTML}
    ${chineseLineHTML(card)}
    <div style="font-size:24px;margin:6px 0"><strong>Eng:</strong> ${card.english || ''}</div>
    <div style="text-align:center;margin-top:6px">${playBtn}</div>`;
}

// ===== CSV parsing =====
function parseCSV(text) {
  const rows = []; let cur = ''; let inQ = false; let cols = [];
  const push = () => { cols.push(cur); cur = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\r') continue;
    if (ch === '\n') {
      if (inQ) { cur += '\n'; }
      else { push(); rows.push(cols); cols = []; }
      continue;
    }
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { push(); continue; }
    cur += ch;
  }
  if (cur.length || cols.length) { push(); rows.push(cols); }
  return rows;
}

function stripBom(s) { return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

// ===== Sets manifest & loading =====
const BUILTIN_SETS_FALLBACK = [
  { id: 'core',    displayName: 'Core Vocabulary',                file: 'Hakka Vocabulary.csv',          schema: 'main',  isDefault: true },
  { id: 'idiom-2', displayName: '2 Character Idioms (兩字熟語)',    file: 'flashcards-兩字熟語.csv',         schema: 'idiom' },
  { id: 'idiom-3', displayName: '3 Character Idioms (三字熟語)',    file: 'flashcards-三字熟語.csv',         schema: 'idiom' },
  { id: 'idiom-4', displayName: '4 Character Idioms (四字熟語)',    file: 'flashcards-四字熟語.csv',         schema: 'idiom' },
  { id: 'idiom-5', displayName: '5+ Character Phrases (五字以上)',  file: 'flashcards-五字以上.csv',         schema: 'idiom' },
  { id: 'riddles', displayName: 'Slang & Riddles (歇後語謎語)',     file: 'flashcards-歇後語謎語.csv',       schema: 'idiom' }
];
const ALL_SET_ID = 'all';

async function loadSetsManifest() {
  try {
    const res = await fetch('Hakka%20Dictionary/manifest.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.sets) && data.sets.length) return data.sets;
    }
  } catch {}
  return BUILTIN_SETS_FALLBACK.slice();
}

function normalizeRow(rawRow, header) {
  const idx = {
    mandarin: header.indexOf('普通中文'),
    hakka_chars: header.indexOf('客家汉字'),
    pronunciation: header.indexOf('Hakka Pronunciation'),
    chinese_def: header.indexOf('Chinese definition'),
    english: header.indexOf('English Definition')
  };
  if (idx.chinese_def < 0) idx.chinese_def = header.indexOf('Chinese Definition');
  return {
    mandarin: idx.mandarin >= 0 ? (rawRow[idx.mandarin] || '') : '',
    hakka_chars: idx.hakka_chars >= 0 ? (rawRow[idx.hakka_chars] || '') : '',
    pronunciation: idx.pronunciation >= 0 ? (rawRow[idx.pronunciation] || '') : '',
    chinese_def: idx.chinese_def >= 0 ? (rawRow[idx.chinese_def] || '') : '',
    english: idx.english >= 0 ? (rawRow[idx.english] || '') : ''
  };
}

async function loadCsvForSet(meta) {
  try {
    const res = await fetch('Hakka%20Dictionary/' + encodeURIComponent(meta.file), { cache: 'no-cache' });
    if (!res.ok) return [];
    const txt = stripBom(await res.text());
    const rows = parseCSV(txt);
    if (!rows.length) return [];
    const header = rows[0].map(h => (h || '').trim());
    return rows.slice(1)
      .map(r => normalizeRow(r, header))
      .filter(x => x.hakka_chars && x.pronunciation);
  } catch {
    return [];
  }
}

async function loadAllSets(sets) {
  const results = await Promise.all(sets.map(async s => ({ meta: s, rows: await loadCsvForSet(s) })));
  return results;
}

// ===== Card pool =====
let cardPool = { cards: new Map(), setsIndex: new Map() };
let manifestSets = [];
let activeSetId = null;
let reviewQueue = [];
let currentIndex = null;

const ACTIVE_SET_KEY = 'active_set_v1';

function getActiveSetId() { return localStorage.getItem(ACTIVE_SET_KEY); }
function setActiveSetId(id) {
  activeSetId = id;
  localStorage.setItem(ACTIVE_SET_KEY, id);
}

function buildCardPool(loadedSets, state) {
  const cards = new Map();
  const setsIndex = new Map();

  if (state && state.cards) {
    for (const [key, c] of Object.entries(state.cards)) {
      cards.set(key, { ...c, sources: [] });
    }
  }

  for (const { meta, rows } of loadedSets) {
    const keysForSet = new Set();
    setsIndex.set(meta.file, keysForSet);
    for (const row of rows) {
      const key = cardKeyOf(row);
      let card = cards.get(key);
      if (!card) {
        card = {
          id: uid(),
          hakka_chars: row.hakka_chars,
          pronunciation: row.pronunciation,
          mandarin: row.mandarin || '',
          chinese_def: row.chinese_def || '',
          english: row.english || '',
          sources: []
        };
        cards.set(key, card);
      } else {
        if (!card.hakka_chars && row.hakka_chars) card.hakka_chars = row.hakka_chars;
        if (!card.pronunciation && row.pronunciation) card.pronunciation = row.pronunciation;
        if (!card.mandarin && row.mandarin) card.mandarin = row.mandarin;
        if (!card.chinese_def && row.chinese_def) card.chinese_def = row.chinese_def;
        if (!card.english && row.english) card.english = row.english;
      }
      if (!card.sources.includes(meta.file)) card.sources.push(meta.file);
      keysForSet.add(key);
    }
  }

  return { cards, setsIndex };
}

function snapshotState() {
  const cardsObj = {};
  for (const [k, c] of cardPool.cards) {
    cardsObj[k] = {
      id: c.id,
      hakka_chars: c.hakka_chars,
      pronunciation: c.pronunciation,
      mandarin: c.mandarin || '',
      chinese_def: c.chinese_def || '',
      english: c.english || '',
      sources: c.sources || [],
      due: c.due,
      reps: c.reps,
      ease: c.ease,
      interval: c.interval,
      firstSeenAt: c.firstSeenAt,
      lastSeenAt: c.lastSeenAt,
      seenCount: c.seenCount,
      correctCount: c.correctCount,
      incorrectCount: c.incorrectCount,
      studied: c.studied
    };
  }
  return { version: 2, cards: cardsObj };
}
function persistState() { saveState(snapshotState()); }

// ===== Set helpers =====
function activeSetMeta() {
  if (!activeSetId || activeSetId === ALL_SET_ID) return null;
  return manifestSets.find(s => s.id === activeSetId) || null;
}
function activeSetSchema() {
  const meta = activeSetMeta();
  if (!meta) return 'mixed';
  return meta.schema || 'main';
}
function currentSetEntries() {
  const meta = activeSetMeta();
  if (!meta) {
    return Array.from(cardPool.cards.entries());
  }
  const keys = cardPool.setsIndex.get(meta.file);
  if (!keys) return [];
  const out = [];
  for (const k of keys) {
    const c = cardPool.cards.get(k);
    if (c) out.push([k, c]);
  }
  return out;
}
function currentSetCards() { return currentSetEntries().map(([_, c]) => c); }
function setMembershipBadges(card) {
  if (!card.sources || !card.sources.length) return '';
  return card.sources.map(file => {
    const meta = manifestSets.find(s => s.file === file);
    const label = meta ? meta.displayName : file.replace(/\.csv$/, '');
    return `<span class="badge-pill" title="${label}">${escapeHTML(label)}</span>`;
  }).join('');
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== Queue =====
function shuffle(a) { return a.slice().sort(() => Math.random() - 0.5); }

function buildQueue() {
  const entries = currentSetEntries();
  if (!entries.length) {
    reviewQueue = [];
    currentIndex = null;
    if ($('queue-info')) $('queue-info').textContent = '0 due';
    showEmptyFlashState(true);
    summarizeStats();
    return;
  }
  const nowt = now();
  const dueKeys = entries.filter(([_, c]) => !c.due || c.due <= nowt).map(([k]) => k);
  let queue = dueKeys;
  if (!queue.length) {
    const newKeys = entries.filter(([_, c]) => !c.reps).map(([k]) => k);
    queue = newKeys;
  }
  reviewQueue = shuffle(queue);
  currentIndex = reviewQueue.length ? 0 : null;
  if ($('queue-info')) $('queue-info').textContent = `${reviewQueue.length} due`;
  showEmptyFlashState(reviewQueue.length === 0);
  summarizeStats();
}

function showEmptyFlashState(empty) {
  const emptyEl = $('flash-empty');
  if (!emptyEl) return;
  emptyEl.hidden = !empty;
  // hide the rating buttons and show button when empty
  if (empty) {
    ['btn-show', 'btn-again', 'btn-hard', 'btn-good', 'btn-easy', 'flash-next'].forEach(id => {
      const el = $(id); if (el) el.style.display = 'none';
    });
    $('flash-front').textContent = '';
    $('flash-back').style.display = 'none';
  }
}

function summarizeStats() {
  const cards = currentSetCards();
  const total = cards.length;
  const nowt = now();
  const due = cards.filter(c => !c.due || c.due <= nowt).length;
  const newc = cards.filter(c => !c.reps).length;
  const review = Math.max(0, due - newc);
  const learned = cards.filter(c => (c.reps || 0) > 0).length;
  if ($('stat-due')) $('stat-due').textContent = due;
  if ($('stat-new')) $('stat-new').textContent = newc;
  if ($('stat-review')) $('stat-review').textContent = review;
  if ($('stat-total')) $('stat-total').textContent = total;
  if ($('vocab-session')) $('vocab-session').textContent = getSessionVocab();
  if ($('vocab-life')) $('vocab-life').textContent = getLifeVocab();
  // picker row
  if ($('set-total')) $('set-total').textContent = total;
  if ($('set-due')) $('set-due').textContent = due;
  if ($('set-learned')) $('set-learned').textContent = learned;
}

function timeUntil(ts) {
  if (!ts) return '—';
  const d = ts - now();
  if (d <= 0) return 'due now';
  const mins = Math.round(d / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return `in ${days}d`;
}

// ===== Reviewing =====
function renderReview() {
  const list = $('rev-list');
  if (!list) return;
  const cs = currentSetCards();
  const nowt = now();
  const due = cs.filter(c => (c.reps || 0) > 0 && (c.due || 0) <= nowt);
  const learned = cs.filter(c => (c.reps || 0) > 0);
  const mistakes = cs.filter(c => (c.incorrectCount || 0) > 0);
  $('rev-due-count').textContent = due.length;
  $('rev-learned-count').textContent = learned.length;
  $('rev-mistake-count').textContent = mistakes.length;

  const filter = $('rev-filter').value;
  let rows = filter === 'due' ? due : (filter === 'learned' ? learned : mistakes);
  rows = rows.slice().sort((a, b) => {
    if (filter === 'due') return (a.due || 0) - (b.due || 0);
    return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
  });
  if (!rows.length) {
    list.innerHTML = '<div class="small">Nothing here yet.</div>';
    return;
  }
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    let html = '<div class="mobile-card-list">';
    html += rows.map(card => `
      <div class="mobile-review-card">
        <div class="char-row">
          <div class="hakka-chars">${colorizeCharacters(card.hakka_chars, card.pronunciation)}</div>
          <button class="btn play play-btn" data-pron="${encodeURIComponent(card.pronunciation)}" title="Play audio">▶</button>
        </div>
        <div class="pronunciation">${convertToneNumbersToDiacritics(card.pronunciation)}</div>
        <div class="translations">
          ${card.mandarin ? `<div class="mandarin"><strong>普通中文:</strong> ${card.mandarin}</div>` : ''}
          ${card.chinese_def ? `<div class="mandarin"><strong>中文釋義:</strong> ${card.chinese_def}</div>` : ''}
          <div class="english"><strong>English:</strong> ${card.english || ''}</div>
        </div>
        <div class="stats-row">
          <div class="accuracy">${(card.correctCount || 0)} ✓ / ${(card.incorrectCount || 0)} ✗</div>
          <div class="due-info">${timeUntil(card.due)}</div>
        </div>
      </div>`).join('');
    html += '</div>';
    list.innerHTML = html;
  } else {
    let html = `
      <table>
        <thead><tr>
          <th>普通中文 / 中文釋義</th>
          <th>客家汉字</th>
          <th>Hakka Pronunciation</th>
          <th>English Definition</th>
          <th class="rev-acc">✓ / ✗</th>
          <th class="rev-due">Due in</th>
        </tr></thead><tbody>`;
    html += rows.map(card => {
      const charHTML = `<div class="rev-hakka">${colorizeCharacters(card.hakka_chars, card.pronunciation)}</div>`;
      const pronHTML = `
        <div class="rev-pron">
          ${convertToneNumbersToDiacritics(card.pronunciation)}
          <button class="btn play" data-pron="${encodeURIComponent(card.pronunciation)}" title="Play audio">▶</button>
        </div>`;
      const chineseCell = card.mandarin || card.chinese_def || '';
      return `
        <tr>
          <td>${chineseCell}</td>
          <td>${charHTML}</td>
          <td>${pronHTML}</td>
          <td>${card.english || ''}</td>
          <td class="rev-acc">${(card.correctCount || 0)}&nbsp;✓&nbsp;/&nbsp;${(card.incorrectCount || 0)}&nbsp;✗</td>
          <td class="rev-due">${timeUntil(card.due)}</td>
        </tr>`;
    }).join('');
    html += `</tbody></table>`;
    list.innerHTML = html;
  }
  list.onclick = (e) => {
    const btn = e.target.closest('button.play');
    if (!btn) return;
    const raw = decodeURIComponent(btn.getAttribute('data-pron') || '');
    if (raw) playTTS(raw);
  };
}

// ===== Vocabulary (always full pool) =====
function renderVocabInStats() {
  const box = $('vocab-list');
  if (!box) return;
  const all = Array.from(cardPool.cards.values());
  if (!all.length) {
    box.innerHTML = '<div class="small">No vocabulary loaded.</div>';
    return;
  }
  const q = ($('vocab-search')?.value || '').trim().toLowerCase();
  let list = all;
  if (q) {
    list = all.filter(c => `${c.mandarin || ''} ${c.chinese_def || ''} ${c.hakka_chars || ''} ${c.pronunciation || ''} ${c.english || ''}`.toLowerCase().includes(q));
  }
  if (!list.length) {
    box.innerHTML = '<div class="small">No matches</div>';
    return;
  }
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    let html = '<div class="mobile-card-list">';
    html += list.map(card => `
      <div class="mobile-vocab-card">
        <div class="char-row">
          <div class="hakka-chars">${colorizeCharacters(card.hakka_chars, card.pronunciation)}</div>
          <button class="btn play play-btn" data-pron="${encodeURIComponent(card.pronunciation || '')}" title="Play audio">▶</button>
        </div>
        <div class="pronunciation">${convertToneNumbersToDiacritics(card.pronunciation)}</div>
        <div class="translations">
          ${card.mandarin ? `<div class="mandarin"><strong>普通中文:</strong> ${card.mandarin}</div>` : ''}
          ${card.chinese_def ? `<div class="mandarin"><strong>中文釋義:</strong> ${card.chinese_def}</div>` : ''}
          <div class="english"><strong>English:</strong> ${card.english || ''}</div>
        </div>
        <div style="margin-top:8px">${setMembershipBadges(card)}</div>
      </div>`).join('');
    html += '</div>';
    box.innerHTML = html;
  } else {
    let html = `
      <table>
        <thead><tr>
          <th>普通中文 / 中文釋義</th>
          <th>客家汉字</th>
          <th>Hakka Pronunciation</th>
          <th>English Definition</th>
          <th>Sets</th>
        </tr></thead><tbody>`;
    html += list.map(card => {
      const charHTML = `<div class="rev-hakka">${colorizeCharacters(card.hakka_chars, card.pronunciation)}</div>`;
      const pronHTML = `
        <div class="rev-pron">
          ${convertToneNumbersToDiacritics(card.pronunciation)}
          <button class="btn play" data-pron="${encodeURIComponent(card.pronunciation || '')}" title="Play audio">▶</button>
        </div>`;
      const chineseCell = card.mandarin || card.chinese_def || '';
      return `
        <tr>
          <td>${chineseCell}</td>
          <td>${charHTML}</td>
          <td>${pronHTML}</td>
          <td>${card.english || ''}</td>
          <td>${setMembershipBadges(card)}</td>
        </tr>`;
    }).join('');
    html += `</tbody></table>`;
    box.innerHTML = html;
  }
}

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
function currentFlashCard() {
  if (currentIndex == null) return null;
  const key = reviewQueue[currentIndex];
  return cardPool.cards.get(key) || null;
}

function showFlash() {
  const btnShow = $('btn-show');
  const btnNext = $('flash-next');
  const rateIds = ['btn-again', 'btn-hard', 'btn-good', 'btn-easy'];
  const card = currentFlashCard();
  if (!card) {
    showEmptyFlashState(true);
    return;
  }
  showEmptyFlashState(false);
  $('flash-front').innerHTML = frontHTML(card);
  $('flash-back').style.display = 'none';
  btnShow.style.display = 'inline-block';
  btnNext.style.display = 'none';
  btnNext.textContent = 'Skip';
  btnNext.onclick = skipFlash;
  rateIds.forEach(id => $(id).style.display = 'none');
  $('queue-info').textContent = `Card ${currentIndex + 1} of ${reviewQueue.length} due`;
}

function revealFlash() {
  const card = currentFlashCard();
  if (!card) return;
  const btnShow = $('btn-show');
  const btnNext = $('flash-next');
  const rateIds = ['btn-again', 'btn-hard', 'btn-good', 'btn-easy'];
  $('flash-front').innerHTML = backHTML(card);
  const pb = $('play-tts');
  if (pb) pb.onclick = () => playTTS(card.pronunciation);
  playTTS(card.pronunciation);
  $('flash-back').style.display = 'none';
  btnShow.style.display = 'none';
  btnNext.style.display = 'inline-block';
  rateIds.forEach(id => $(id).style.display = 'inline-block');
}

function rateFlash(rating) {
  const card = currentFlashCard();
  if (!card) return;
  schedule(card, rating);
  updateCardStats(card, rating !== 'Again');
  if (rating !== 'Again') bumpStreak();
  reviewQueue.splice(currentIndex, 1);
  currentIndex = reviewQueue.length ? Math.min(currentIndex, reviewQueue.length - 1) : null;
  persistState();
  buildQueue();
  showFlash();
}

function skipFlash() {
  if (currentIndex == null) return;
  reviewQueue.splice(currentIndex, 1);
  currentIndex = reviewQueue.length ? Math.min(currentIndex, reviewQueue.length - 1) : null;
  showFlash();
}

$('btn-show').onclick = revealFlash;
$('btn-again').onclick = () => rateFlash('Again');
$('btn-hard').onclick = () => rateFlash('Hard');
$('btn-good').onclick = () => rateFlash('Good');
$('btn-easy').onclick = () => rateFlash('Easy');

document.addEventListener('keydown', (e) => {
  const panelVisible = document.getElementById('panel-flash')?.getAttribute('aria-hidden') === 'false';
  if (!panelVisible || currentIndex == null) return;
  if (e.key === ' ' || e.key === 'Enter') {
    if ($('btn-show').style.display !== 'none') { e.preventDefault(); revealFlash(); }
    return;
  }
  const ratedVisible = $('btn-again').style.display !== 'none';
  if (!ratedVisible) return;
  if (e.key === '1') { e.preventDefault(); rateFlash('Again'); }
  if (e.key === '2') { e.preventDefault(); rateFlash('Hard'); }
  if (e.key === '3') { e.preventDefault(); rateFlash('Good'); }
  if (e.key === '4') { e.preventDefault(); rateFlash('Easy'); }
});

// ===== Multiple Choice =====
function nextMC() {
  const cards = currentSetCards();
  if (!cards.length) {
    $('mc-question').textContent = 'No cards in this set';
    $('mc-options').innerHTML = '';
    $('mc-feedback').innerHTML = '';
    $('mc-next').style.display = 'none';
    return;
  }
  const hasDue = reviewQueue.length > 0;
  let correct;
  if (hasDue) {
    correct = currentFlashCard();
  }
  if (!correct) {
    correct = cards[Math.floor(Math.random() * cards.length)];
  }
  $('mc-question').innerHTML = frontHTML(correct);
  const pool = cards.filter(c => c !== correct);
  const distractors = shuffle(pool).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  const box = $('mc-options');
  box.innerHTML = '';
  $('mc-feedback').innerHTML = hasDue ? '' : '<span style="color:var(--muted)">All due cards reviewed — practising from the full set.</span>';
  const btnNext = $('mc-next');
  btnNext.style.display = 'none';
  box.style.display = 'flex';

  let locked = false;
  const lockButtons = () => {
    locked = true;
    [...box.querySelectorAll('button')].forEach(b => b.disabled = true);
  };

  options.forEach(opt => {
    const label = opt.english || opt.mandarin || opt.chinese_def || opt.hakka_chars;
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.onclick = () => {
      if (locked) return;
      const ok = (opt === correct);
      b.style.borderColor = ok ? '#16a34a' : '#ef4444';
      const tag = `<div class="result-tag ${ok ? 'correct' : 'incorrect'}" aria-live="polite">${ok ? 'Correct' : 'Incorrect'}</div>`;
      $('mc-question').innerHTML = tag + backHTML(correct);
      const pb = $('play-tts');
      if (pb) pb.onclick = () => playTTS(correct.pronunciation);
      playTTS(correct.pronunciation);
      lockButtons();
      box.style.display = 'none';
      schedule(correct, ok ? 'Good' : 'Again');
      updateCardStats(correct, ok);
      if (ok) bumpStreak();
      buildQueue();
      persistState();
      btnNext.style.display = 'inline-block';
    };
    box.appendChild(b);
  });

  btnNext.onclick = () => { nextMC(); };
}

// ===== Typing =====
let typingMode = 'eng';

function typingPlaceholderFor(mode) {
  return mode === 'eng' ? 'Type English and press Enter' :
    (mode === 'mandarin' ? '輸入普通中文...' : 'Use Hakka pinyim number tone. e.g. lui4 zui4 ');
}
function applyTypingMode(mode) {
  typingMode = mode;
  localStorage.setItem('typingMode', mode);
  const inp = document.getElementById('typing-input');
  if (inp) inp.placeholder = typingPlaceholderFor(mode);
}
document.getElementById('typing-mode').onchange = e => applyTypingMode(e.target.value);
(function () {
  const saved = localStorage.getItem('typingMode');
  if (saved) {
    typingMode = saved;
    document.getElementById('typing-mode').value = saved;
  }
})();

function syncTypingModeOptions() {
  const sel = $('typing-mode');
  if (!sel) return;
  const mandarinOpt = sel.querySelector('option[value="mandarin"]');
  if (!mandarinOpt) return;
  const schema = activeSetSchema();
  if (schema === 'idiom') {
    mandarinOpt.hidden = true;
    mandarinOpt.disabled = true;
    if (sel.value === 'mandarin') {
      sel.value = 'eng';
      applyTypingMode('eng');
    }
  } else {
    mandarinOpt.hidden = false;
    mandarinOpt.disabled = false;
  }
}

function nextTyping() {
  const qEl = document.getElementById('typing-question');
  const inp = document.getElementById('typing-input');
  const fb = document.getElementById('typing-feedback');
  const nxt = document.getElementById('typing-next');
  if (!qEl || !inp || !fb || !nxt) return;
  const cards = currentSetCards();
  if (!cards.length) {
    qEl.textContent = 'No cards in this set';
    inp.value = '';
    fb.textContent = '';
    nxt.style.display = 'none';
    return;
  }
  const hasDue = reviewQueue.length > 0;
  let card;
  if (hasDue) card = currentFlashCard();
  if (!card) card = cards[Math.floor(Math.random() * cards.length)];

  // Auto-skip if "Mandarin" mode but card lacks mandarin (only happens in All / mixed)
  let skipGuard = 0;
  while (typingMode === 'mandarin' && !card.mandarin && skipGuard < 50) {
    card = cards[Math.floor(Math.random() * cards.length)];
    skipGuard++;
  }

  qEl.innerHTML = frontHTML(card);
  fb.innerHTML = hasDue ? '' : '<span style="color:var(--muted)">All due cards reviewed — practising from the full set.</span>';
  nxt.style.display = 'none';
  inp.disabled = false;
  inp.value = '';
  setTimeout(() => inp.focus(), 0);

  const expected =
    typingMode === 'eng' ? (card.english || '') :
    typingMode === 'mandarin' ? (card.mandarin || '') :
    (card.pronunciation || '');

  inp.onkeydown = (e) => {
    if (e.isComposing) return;
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const ans = inp.value.trim();
    const ok = ans.toLowerCase() === String(expected || '').toLowerCase();
    updateCardStats(card, ok);
    const tag = `<div class="result-tag ${ok ? 'correct' : 'incorrect'}" aria-live="polite">${ok ? 'Correct' : 'Incorrect'}</div>`;
    qEl.innerHTML = tag + backHTML(card);
    const pb = document.getElementById('play-tts');
    if (pb) pb.onclick = () => playTTS(card.pronunciation);
    playTTS(card.pronunciation);
    inp.disabled = true;
    nxt.style.display = 'inline-block';
    schedule(card, ok ? 'Good' : 'Again');
    if (ok) bumpStreak();
    buildQueue();
    persistState();
  };

  nxt.onclick = () => {
    inp.disabled = false;
    nextTyping();
  };
}

document.getElementById('tab-typing')?.addEventListener('click', () => { nextTyping(); });

// ===== Backup (JSON export/import) =====
document.getElementById('export-json')?.addEventListener('click', () => {
  const data = JSON.stringify(snapshotState(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'flashcards-progress.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-json')?.addEventListener('click', () => {
  const f = $('import-json-file').files[0];
  if (!f) return alert('Choose a file.');
  f.text().then(txt => {
    try {
      const incoming = JSON.parse(txt);
      let next;
      if (incoming && incoming.version === 2 && incoming.cards) {
        next = incoming;
      } else if (incoming && typeof incoming === 'object') {
        // Old shape — try migration
        next = migrateV1ToV2(incoming);
      } else {
        return alert('Invalid JSON.');
      }
      // Merge into current pool by replacing SRS state for matching keys
      for (const [key, c] of Object.entries(next.cards || {})) {
        const existing = cardPool.cards.get(key);
        if (existing) {
          Object.assign(existing, {
            due: c.due, reps: c.reps, ease: c.ease, interval: c.interval,
            firstSeenAt: c.firstSeenAt, lastSeenAt: c.lastSeenAt,
            seenCount: c.seenCount, correctCount: c.correctCount,
            incorrectCount: c.incorrectCount, studied: c.studied
          });
        } else {
          cardPool.cards.set(key, { ...c, sources: c.sources || [] });
        }
      }
      persistState();
      buildQueue();
      summarizeStats();
      renderSetPicker();
      alert('Imported.');
    } catch (e) {
      alert('Invalid JSON.');
    }
  });
});

// ===== Set picker UI =====
function renderSetPicker() {
  const meta = activeSetMeta();
  const name = meta ? meta.displayName : 'All Sets';
  if ($('set-picker-name')) $('set-picker-name').textContent = name;
  summarizeStats();
}

function setListForPicker() {
  return [
    ...manifestSets,
    { id: ALL_SET_ID, displayName: 'All Sets', file: null, schema: 'mixed' }
  ];
}

function buildPickerGrid(targetEl, onPick, opts = {}) {
  if (!targetEl) return;
  targetEl.innerHTML = '';
  const list = setListForPicker();
  for (const meta of list) {
    const b = document.createElement('button');
    b.className = 'btn';
    if (meta.id === activeSetId) b.classList.add('active');
    if (opts.recommended && meta.id === opts.recommended) b.classList.add('recommended');
    let count;
    if (meta.id === ALL_SET_ID) {
      count = cardPool.cards.size;
    } else {
      const keys = cardPool.setsIndex.get(meta.file);
      count = keys ? keys.size : 0;
    }
    b.innerHTML = `${escapeHTML(meta.displayName)}<span class="set-meta">${count} cards</span>`;
    b.onclick = () => onPick(meta.id);
    targetEl.appendChild(b);
  }
}

function openSetPickerMenu() {
  const modal = $('set-picker-modal');
  if (!modal) return;
  buildPickerGrid($('set-picker-grid'), (id) => {
    switchSet(id);
    closeModal(modal);
  });
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeModal(modal) {
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function bindModalCloseHandlers(modal) {
  modal.querySelector('.modal-close')?.addEventListener('click', () => closeModal(modal));
  modal.querySelector('.modal-backdrop')?.addEventListener('click', () => closeModal(modal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeModal(modal);
  });
}

function switchSet(id) {
  // Hard cut: clear in-flight UI, no rating recorded
  ['btn-show', 'btn-again', 'btn-hard', 'btn-good', 'btn-easy', 'flash-next'].forEach(idx => {
    const el = $(idx); if (el) el.style.display = 'none';
  });
  $('flash-front').textContent = '';
  $('flash-back').style.display = 'none';
  $('mc-feedback').innerHTML = '';
  $('mc-options').innerHTML = '';
  $('mc-question').innerHTML = '';
  $('mc-next').style.display = 'none';
  $('typing-feedback').textContent = '';
  $('typing-input') && ($('typing-input').value = '');
  $('typing-question').innerHTML = '';
  $('typing-next').style.display = 'none';

  setActiveSetId(id);
  syncTypingModeOptions();
  buildQueue();
  renderSetPicker();
  // Re-render the active panel
  const activePanel = document.querySelector('.tabpanel[aria-hidden="false"]');
  if (!activePanel) return;
  if (activePanel.id === 'panel-flash') showFlash();
  else if (activePanel.id === 'panel-mc') nextMC();
  else if (activePanel.id === 'panel-typing') nextTyping();
  else if (activePanel.id === 'panel-review') renderReview();
  else if (activePanel.id === 'panel-stats') { summarizeStats(); renderVocabInStats(); }
}

// ===== Welcome modal =====
function showWelcomeModal() {
  const modal = $('welcome-modal');
  if (!modal) return;
  buildPickerGrid($('welcome-grid'), (id) => {
    switchSet(id);
    closeModal(modal);
  }, { recommended: 'core' });
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

// ===== Tabs wiring =====
function updatePickerVisibility(panelId) {
  const row = $('set-picker-row');
  const note = $('set-picker-note');
  if (panelId === 'stats') {
    if (row) row.hidden = true;
    if (note) note.hidden = false;
  } else {
    if (row) row.hidden = false;
    if (note) note.hidden = true;
  }
}

document.querySelectorAll('[role="tab"]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tabpanel').forEach(p => p.setAttribute('aria-hidden', 'true'));
    document.getElementById('panel-' + tab.dataset.panel).setAttribute('aria-hidden', 'false');
    document.querySelectorAll('[role="tab"]').forEach(t => t.setAttribute('aria-selected', 'false'));
    tab.setAttribute('aria-selected', 'true');
    updatePickerVisibility(tab.dataset.panel);
    if (tab.dataset.panel === 'mc') nextMC();
    if (tab.dataset.panel === 'typing') nextTyping();
    if (tab.dataset.panel === 'flash') showFlash();
    if (tab.dataset.panel === 'stats') { summarizeStats(); renderVocabInStats(); }
    if (tab.dataset.panel === 'review') renderReview();
  });
});

let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    const activePanel = document.querySelector('.tabpanel[aria-hidden="false"]');
    if (!activePanel) return;
    if (activePanel.id === 'panel-stats') renderVocabInStats();
    else if (activePanel.id === 'panel-review') renderReview();
  }, 150);
});

// Picker button + empty-state buttons
$('set-picker-btn')?.addEventListener('click', openSetPickerMenu);
$('empty-switch-set')?.addEventListener('click', openSetPickerMenu);
$('empty-go-all')?.addEventListener('click', () => switchSet(ALL_SET_ID));

// ===== Bootstrap =====
(async function () {
  await probeOpfs();

  // Modal close handlers
  const setPickerModal = $('set-picker-modal');
  if (setPickerModal) bindModalCloseHandlers(setPickerModal);
  const welcomeModal = $('welcome-modal');
  if (welcomeModal) bindModalCloseHandlers(welcomeModal);

  // Load v2 state, or migrate from v1.
  let state = await loadStateAsync();
  if (!state) {
    const legacy = await loadLegacyV1Async();
    if (legacy && Object.keys(legacy).length) {
      state = migrateV1ToV2(legacy);
      saveState(state);
      // Preserve old data as backup (don't delete OPFS file; rename localStorage key)
      try {
        const lsRaw = localStorage.getItem(LEGACY_KEY_V1);
        if (lsRaw && !localStorage.getItem(LEGACY_BACKUP_KEY)) {
          localStorage.setItem(LEGACY_BACKUP_KEY, lsRaw);
        }
      } catch {}
    }
  }

  // Vocab images — fire and forget
  loadVocabImageManifest();

  // Sets manifest + CSV pool
  manifestSets = await loadSetsManifest();
  const loaded = await loadAllSets(manifestSets);
  cardPool = buildCardPool(loaded, state);

  // Persist if pool added new cards (sources won't be in saved state otherwise)
  persistState();

  // Counters
  setLife(getLife());
  setSession(0);
  setLifeVocab(getLifeVocab());
  setSessionVocab(0);

  // Active set
  let saved = getActiveSetId();
  const validIds = new Set([...manifestSets.map(s => s.id), ALL_SET_ID]);
  if (saved && validIds.has(saved)) {
    activeSetId = saved;
  } else if (saved) {
    activeSetId = 'core';
    setActiveSetId('core');
  }
  // First-load welcome (no persisted choice). Persist 'core' immediately so a
  // dismissed modal doesn't reappear forever.
  if (!saved) {
    activeSetId = 'core';
    setActiveSetId('core');
    showWelcomeModal();
  }

  syncTypingModeOptions();
  renderSetPicker();
  buildQueue();
  showFlash();
  summarizeStats();

  setupMobileKeyboard();
})();
