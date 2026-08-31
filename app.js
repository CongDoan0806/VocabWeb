'use strict';

/* ============================================================
   VocabMaster — app.js
   Single-file application logic (client-side only)
   Modules: DB · FSRS · Speech · Router · A–E feature modules
   ============================================================ */

/* ------------------------------------------------------------
   Small DOM / util helpers
   ------------------------------------------------------------ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const DAY_MS = 86400000;

function todayStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function dateFromStr(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function daysBetween(aStr, bStr) { return Math.round((dateFromStr(bStr) - dateFromStr(aStr)) / DAY_MS); }

function formatInterval(ms) {
  if (ms < 60000) return '< 1 phút';
  const min = ms / 60000;
  if (min < 60) return `${Math.round(min)} phút`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr)} giờ`;
  const d = hr / 24;
  if (d < 30) return `${Math.round(d)} ngày`;
  const mo = d / 30;
  if (mo < 12) return `${Math.round(mo)} tháng`;
  return `${(d / 365).toFixed(1)} năm`;
}

/* ============================================================
   DB LAYER — IndexedDB primary, LocalStorage fallback
   Stores: words, cards, decks, user
   ============================================================ */
const DB = (function () {
  const NAME = 'vocabmaster', VER = 1;
  const STORES = ['words', 'cards', 'decks', 'user'];
  let db = null, useLS = false;

  function open() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) { useLS = true; return resolve(); }
      let req;
      try { req = indexedDB.open(NAME, VER); }
      catch (e) { useLS = true; return resolve(); }

      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(); };
      req.onerror = () => { useLS = true; resolve(); };
      req.onblocked = () => { useLS = true; resolve(); };
    });
  }

  const lsKey = (store) => 'vm_' + store;
  const lsGet = (store) => { try { return JSON.parse(localStorage.getItem(lsKey(store)) || '[]'); } catch { return []; } };
  const lsSet = (store, arr) => { try { localStorage.setItem(lsKey(store), JSON.stringify(arr)); } catch (e) { console.warn('LS full', e); } };

  function getAll(store) {
    if (useLS) return Promise.resolve(lsGet(store));
    return new Promise((res, rej) => {
      const r = db.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }

  function put(store, val) {
    if (useLS) {
      const arr = lsGet(store); const i = arr.findIndex(x => x.id === val.id);
      if (i >= 0) arr[i] = val; else arr.push(val); lsSet(store, arr); return Promise.resolve();
    }
    return new Promise((res, rej) => {
      const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(val);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  }

  function bulkPut(store, vals) {
    if (useLS) {
      const arr = lsGet(store);
      vals.forEach(v => { const i = arr.findIndex(x => x.id === v.id); if (i >= 0) arr[i] = v; else arr.push(v); });
      lsSet(store, arr); return Promise.resolve();
    }
    return new Promise((res, rej) => {
      const t = db.transaction(store, 'readwrite'); const os = t.objectStore(store);
      vals.forEach(v => os.put(v));
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  }

  function del(store, id) {
    if (useLS) { lsSet(store, lsGet(store).filter(x => x.id !== id)); return Promise.resolve(); }
    return new Promise((res, rej) => {
      const t = db.transaction(store, 'readwrite'); t.objectStore(store).delete(id);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  }

  function clear(store) {
    if (useLS) { lsSet(store, []); return Promise.resolve(); }
    return new Promise((res, rej) => {
      const t = db.transaction(store, 'readwrite'); t.objectStore(store).clear();
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  }

  return { open, getAll, put, bulkPut, del, clear, get usingFallback() { return useLS; } };
})();

/* ============================================================
   SEED DATA — 50 words across 3 decks
   ============================================================ */
const SEED_DECKS = [
  { id: 'deck1', name: 'Giao tiếp cơ bản', description: 'Chào hỏi và cụm từ thông dụng hằng ngày' },
  { id: 'deck2', name: 'IELTS Academic', description: 'Từ vựng học thuật cho kỳ thi IELTS' },
  { id: 'deck3', name: 'Công nghệ', description: 'Thuật ngữ công nghệ thông tin phổ biến' },
];

const SEED_WORDS = [
  // Deck 1 — Giao tiếp cơ bản (20)
  { word: 'hello', meaning_vi: 'xin chào', ipa: '/həˈloʊ/', example: 'Hello, how are you today?', category: 'deck1' },
  { word: 'goodbye', meaning_vi: 'tạm biệt', ipa: '/ˌɡʊdˈbaɪ/', example: 'Goodbye, see you tomorrow!', category: 'deck1' },
  { word: 'please', meaning_vi: 'làm ơn', ipa: '/pliːz/', example: 'Please pass me the salt.', category: 'deck1' },
  { word: 'thank you', meaning_vi: 'cảm ơn', ipa: '/ˈθæŋk juː/', example: 'Thank you for your help.', category: 'deck1' },
  { word: 'sorry', meaning_vi: 'xin lỗi', ipa: '/ˈsɒri/', example: 'I am sorry for being late.', category: 'deck1' },
  { word: 'yes', meaning_vi: 'vâng, có', ipa: '/jes/', example: 'Yes, I would love to come.', category: 'deck1' },
  { word: 'no', meaning_vi: 'không', ipa: '/noʊ/', example: 'No, thank you.', category: 'deck1' },
  { word: 'friend', meaning_vi: 'bạn bè', ipa: '/frend/', example: 'She is my best friend.', category: 'deck1' },
  { word: 'family', meaning_vi: 'gia đình', ipa: '/ˈfæməli/', example: 'I love spending time with my family.', category: 'deck1' },
  { word: 'water', meaning_vi: 'nước', ipa: '/ˈwɔːtər/', example: 'Can I have a glass of water?', category: 'deck1' },
  { word: 'food', meaning_vi: 'thức ăn', ipa: '/fuːd/', example: 'The food here is delicious.', category: 'deck1' },
  { word: 'morning', meaning_vi: 'buổi sáng', ipa: '/ˈmɔːrnɪŋ/', example: 'Good morning, everyone!', category: 'deck1' },
  { word: 'night', meaning_vi: 'buổi tối, đêm', ipa: '/naɪt/', example: 'Good night, sleep well.', category: 'deck1' },
  { word: 'name', meaning_vi: 'tên', ipa: '/neɪm/', example: 'What is your name?', category: 'deck1' },
  { word: 'house', meaning_vi: 'ngôi nhà', ipa: '/haʊs/', example: 'They live in a big house.', category: 'deck1' },
  { word: 'work', meaning_vi: 'công việc, làm việc', ipa: '/wɜːrk/', example: 'I go to work by bus.', category: 'deck1' },
  { word: 'happy', meaning_vi: 'vui vẻ, hạnh phúc', ipa: '/ˈhæpi/', example: 'I am so happy to see you.', category: 'deck1' },
  { word: 'welcome', meaning_vi: 'chào mừng', ipa: '/ˈwelkəm/', example: 'Welcome to our home!', category: 'deck1' },
  { word: 'excuse', meaning_vi: 'thứ lỗi, xin phép', ipa: '/ɪkˈskjuːz/', example: 'Excuse me, where is the station?', category: 'deck1' },
  { word: 'help', meaning_vi: 'giúp đỡ', ipa: '/help/', example: 'Can you help me, please?', category: 'deck1' },

  // Deck 2 — IELTS Academic (20)
  { word: 'analyze', meaning_vi: 'phân tích', ipa: '/ˈænəlaɪz/', example: 'We need to analyze the data carefully.', category: 'deck2' },
  { word: 'significant', meaning_vi: 'đáng kể, quan trọng', ipa: '/sɪɡˈnɪfɪkənt/', example: 'There was a significant increase in sales.', category: 'deck2' },
  { word: 'evidence', meaning_vi: 'bằng chứng', ipa: '/ˈevɪdəns/', example: 'The evidence supports the theory.', category: 'deck2' },
  { word: 'consequence', meaning_vi: 'hậu quả', ipa: '/ˈkɒnsɪkwəns/', example: 'Every action has a consequence.', category: 'deck2' },
  { word: 'establish', meaning_vi: 'thiết lập, thành lập', ipa: '/ɪˈstæblɪʃ/', example: 'The company was established in 1990.', category: 'deck2' },
  { word: 'approach', meaning_vi: 'phương pháp, cách tiếp cận', ipa: '/əˈproʊtʃ/', example: 'We need a new approach to the problem.', category: 'deck2' },
  { word: 'concept', meaning_vi: 'khái niệm', ipa: '/ˈkɒnsept/', example: 'This is a difficult concept to grasp.', category: 'deck2' },
  { word: 'factor', meaning_vi: 'yếu tố', ipa: '/ˈfæktər/', example: 'Cost is an important factor.', category: 'deck2' },
  { word: 'principle', meaning_vi: 'nguyên tắc', ipa: '/ˈprɪnsəpl/', example: 'He acted on principle.', category: 'deck2' },
  { word: 'sufficient', meaning_vi: 'đủ, đầy đủ', ipa: '/səˈfɪʃnt/', example: 'We have sufficient resources.', category: 'deck2' },
  { word: 'hypothesis', meaning_vi: 'giả thuyết', ipa: '/haɪˈpɒθəsɪs/', example: 'The experiment tested the hypothesis.', category: 'deck2' },
  { word: 'phenomenon', meaning_vi: 'hiện tượng', ipa: '/fəˈnɒmɪnən/', example: 'This is a natural phenomenon.', category: 'deck2' },
  { word: 'emphasize', meaning_vi: 'nhấn mạnh', ipa: '/ˈemfəsaɪz/', example: 'I must emphasize the importance of safety.', category: 'deck2' },
  { word: 'comprehensive', meaning_vi: 'toàn diện', ipa: '/ˌkɒmprɪˈhensɪv/', example: 'We conducted a comprehensive review.', category: 'deck2' },
  { word: 'constitute', meaning_vi: 'cấu thành, tạo thành', ipa: '/ˈkɒnstɪtjuːt/', example: 'These parts constitute the whole.', category: 'deck2' },
  { word: 'derive', meaning_vi: 'bắt nguồn, rút ra', ipa: '/dɪˈraɪv/', example: 'The word derives from Latin.', category: 'deck2' },
  { word: 'subsequent', meaning_vi: 'tiếp theo, sau đó', ipa: '/ˈsʌbsɪkwənt/', example: 'Subsequent events proved him right.', category: 'deck2' },
  { word: 'fundamental', meaning_vi: 'cơ bản, nền tảng', ipa: '/ˌfʌndəˈmentl/', example: 'This is a fundamental principle.', category: 'deck2' },
  { word: 'interpret', meaning_vi: 'diễn giải, phiên dịch', ipa: '/ɪnˈtɜːrprɪt/', example: 'How do you interpret these results?', category: 'deck2' },
  { word: 'demonstrate', meaning_vi: 'chứng minh, thể hiện', ipa: '/ˈdemənstreɪt/', example: 'The study demonstrates a clear trend.', category: 'deck2' },

  // Deck 3 — Công nghệ (10)
  { word: 'software', meaning_vi: 'phần mềm', ipa: '/ˈsɔːftwer/', example: 'This software is easy to use.', category: 'deck3' },
  { word: 'hardware', meaning_vi: 'phần cứng', ipa: '/ˈhɑːrdwer/', example: 'The hardware needs an upgrade.', category: 'deck3' },
  { word: 'database', meaning_vi: 'cơ sở dữ liệu', ipa: '/ˈdeɪtəbeɪs/', example: 'All records are stored in the database.', category: 'deck3' },
  { word: 'algorithm', meaning_vi: 'thuật toán', ipa: '/ˈælɡərɪðəm/', example: 'The algorithm sorts the list quickly.', category: 'deck3' },
  { word: 'network', meaning_vi: 'mạng lưới', ipa: '/ˈnetwɜːrk/', example: 'Connect your device to the network.', category: 'deck3' },
  { word: 'encryption', meaning_vi: 'mã hóa', ipa: '/ɪnˈkrɪpʃn/', example: 'Encryption keeps your data safe.', category: 'deck3' },
  { word: 'server', meaning_vi: 'máy chủ', ipa: '/ˈsɜːrvər/', example: 'The website is hosted on a server.', category: 'deck3' },
  { word: 'browser', meaning_vi: 'trình duyệt', ipa: '/ˈbraʊzər/', example: 'Open the link in your browser.', category: 'deck3' },
  { word: 'download', meaning_vi: 'tải xuống', ipa: '/ˈdaʊnloʊd/', example: 'Please download the latest version.', category: 'deck3' },
  { word: 'interface', meaning_vi: 'giao diện', ipa: '/ˈɪntərfeɪs/', example: 'The interface is clean and modern.', category: 'deck3' },
];

/* ============================================================
   FSRS ENGINE — pure functions (FSRS v4/v5 style)
   ============================================================ */
const FSRS = (function () {
  const w = [0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589,
             1.5330, 0.1544, 0.9898, 1.9876, 0.1100, 0.2900, 2.2700, 0.2500, 2.9898];
  const DECAY = -0.5;
  const FACTOR = 19 / 81;

  // R(t,S) = (1 + FACTOR * t/S)^DECAY
  function calcRetrievability(stability, elapsedDays) {
    if (stability <= 0) return 0;
    return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
  }

  // I(r,S) = S/FACTOR * (r^(1/DECAY) - 1)
  function calcInterval(stability, retention) {
    const iv = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
    return Math.max(1, iv); // at least 1 day for graduated cards
  }

  const initStability = (g) => Math.max(0.1, w[g - 1]);
  const initDifficulty = (g) => clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);

  function nextDifficulty(D, g) {
    const dd = D - w[6] * (g - 3);
    // mean reversion toward D0(Easy=4)
    const reverted = w[7] * initDifficulty(4) + (1 - w[7]) * dd;
    return clamp(reverted, 1, 10);
  }

  function recallStability(D, S, R, g) {
    const hard = g === 2 ? w[15] : 1;
    const easy = g === 4 ? w[16] : 1;
    const inc = Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) *
                (Math.exp(w[10] * (1 - R)) - 1) * hard * easy;
    return S * (1 + inc);
  }

  function forgetStability(D, S, R) {
    return Math.max(0.1, w[11] * Math.pow(D, -w[12]) *
      (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R)));
  }

  return { w, DECAY, FACTOR, calcRetrievability, calcInterval, initStability, initDifficulty, nextDifficulty, recallStability, forgetStability };
})();

/* Learning steps (minutes). Graduate to FSRS after final step or Easy. */
const LEARNING_STEPS = [1, 10, 1440];   // same-session · 10 min · next day
const RELEARN_STEPS = [10];             // 10 min

/* Schedule a card given a grade. Returns { card, intervalMs, wasNew, graduated }.
   Does NOT mutate the input; returns a new card object. */
function scheduleCard(orig, grade, now = Date.now()) {
  const c = Object.assign({}, orig);
  const wasNew = c.state === 'new';
  const retention = State.user.settings.retention;
  let intervalMs;

  c.reps = (c.reps || 0) + 1;
  c.lastReview = now;

  if (c.state === 'new' || c.state === 'learning') {
    if (c.state === 'new') { c.state = 'learning'; c.learningStep = 0; }
    if (grade === 1) {                       // Again
      c.learningStep = 0;
      intervalMs = LEARNING_STEPS[0] * 60000;
    } else if (grade === 2) {                // Hard — repeat current step
      intervalMs = LEARNING_STEPS[Math.min(c.learningStep, LEARNING_STEPS.length - 1)] * 60000;
    } else if (grade === 4) {                // Easy — graduate immediately
      return graduate(c, grade, now, retention, wasNew);
    } else {                                 // Good — advance
      c.learningStep += 1;
      if (c.learningStep >= LEARNING_STEPS.length) return graduate(c, grade, now, retention, wasNew);
      intervalMs = LEARNING_STEPS[c.learningStep] * 60000;
    }
    c.due = now + intervalMs;
    return { card: c, intervalMs, wasNew, graduated: false };
  }

  if (c.state === 'relearning') {
    if (grade === 1) {                       // stay in relearning
      c.learningStep = 0;
      intervalMs = RELEARN_STEPS[0] * 60000;
      c.due = now + intervalMs;
      return { card: c, intervalMs, wasNew, graduated: false };
    }
    // recover to review
    c.state = 'review';
    const days = FSRS.calcInterval(c.stability, retention);
    intervalMs = days * DAY_MS;
    c.due = now + intervalMs;
    return { card: c, intervalMs, wasNew, graduated: false };
  }

  // state === 'review'
  const elapsed = Math.max(0, (now - (orig.lastReview || now)) / DAY_MS);
  const R = FSRS.calcRetrievability(c.stability, elapsed);
  c.difficulty = FSRS.nextDifficulty(c.difficulty, grade);

  if (grade === 1) {                         // Again → relearning
    c.lapses = (c.lapses || 0) + 1;
    c.stability = FSRS.forgetStability(c.difficulty, c.stability, R);
    c.state = 'relearning';
    c.learningStep = 0;
    intervalMs = RELEARN_STEPS[0] * 60000;
    c.due = now + intervalMs;
    return { card: c, intervalMs, wasNew, graduated: false };
  }

  c.stability = FSRS.recallStability(c.difficulty, c.stability, R, grade);
  let days = FSRS.calcInterval(c.stability, retention);
  if (grade === 2) days *= 0.5;              // Hard multiplier (PRD)
  if (grade === 4) days *= 1.3;              // Easy multiplier (PRD)
  days = Math.max(1, days);
  intervalMs = days * DAY_MS;
  c.due = now + intervalMs;
  return { card: c, intervalMs, wasNew, graduated: false };
}

function graduate(c, grade, now, retention, wasNew) {
  c.state = 'review';
  c.difficulty = FSRS.initDifficulty(grade);
  c.stability = FSRS.initStability(grade);
  let days = FSRS.calcInterval(c.stability, retention);
  if (grade === 4) days *= 1.3;
  days = Math.max(1, days);
  const intervalMs = days * DAY_MS;
  c.due = now + intervalMs;
  return { card: c, intervalMs, wasNew, graduated: true };
}

function isMastered(card) { return card.state === 'review' && (card.stability || 0) > 21; }
function displayState(card) {
  if (card.state === 'review' && isMastered(card)) return 'mastered';
  return card.state;
}
const STATE_LABEL = { new: 'Mới', learning: 'Đang học', review: 'Ôn tập', relearning: 'Học lại', mastered: 'Thành thạo' };

/* ============================================================
   SPEECH ENGINE — recognition + synthesis with fallback
   ============================================================ */
const Speech = (function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasRecognition = !!SR;
  const hasSynthesis = 'speechSynthesis' in window;
  let recog = null, listening = false;

  function speak(text) {
    if (!hasSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  function getRecognizer() {
    if (recog) return recog;
    recog = new SR();
    recog.lang = 'en-US';
    recog.interimResults = false;
    recog.maxAlternatives = 3;
    recog.continuous = false;
    return recog;
  }

  function listen(onResult, onError, onEnd) {
    if (!hasRecognition) { onError && onError('unsupported'); return null; }
    try {
      const r = getRecognizer();     // reuse a single instance → prompt permission once
      // rebind handlers for this call
      r.onresult = (e) => {
        const res = e.results[0];
        const alts = [];
        for (let i = 0; i < res.length; i++) alts.push({ transcript: res[i].transcript, confidence: res[i].confidence });
        onResult && onResult(alts);
      };
      r.onerror = (e) => { listening = false; onError && onError(e.error); };
      r.onend = () => { listening = false; onEnd && onEnd(); };
      listening = true;
      r.start();
      return r;
    } catch (e) { listening = false; onError && onError('start-failed'); return null; }
  }

  function stop() { if (recog && listening) { try { recog.stop(); } catch (e) {} } }

  return { hasRecognition, hasSynthesis, speak, listen, stop, get listening() { return listening; } };
})();

/* Levenshtein distance */
function levenshtein(a, b) {
  a = a || ''; b = b || '';
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

const normalize = (s) => String(s || '').toLowerCase().trim().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ');

/* evaluatePronunciation per PRD spec */
function evaluatePronunciation(spoken, target, confidence = 1) {
  const sp = normalize(spoken), tg = normalize(target);
  if (sp === tg) return { correct: true, confidence, spokenWord: spoken, distance: 0 };
  const dist = levenshtein(sp, tg);
  const len = tg.length;
  const allow = len <= 5 ? 1 : (len <= 10 ? 2 : 3);
  const threshold = State.user ? State.user.settings.voiceConfidence : 0.7;
  const fuzzyOk = dist <= allow;
  const confidenceOk = confidence >= threshold;
  return { correct: fuzzyOk && confidenceOk, confidence, spokenWord: spoken, distance: dist };
}

/* ============================================================
   GAMIFICATION — XP, levels, streak, badges
   ============================================================ */
const XP_REWARDS = {
  reviewCorrect: 3, reviewStruggle: 1, learnNew: 5,
  sessionComplete: 20, dailyStreak: 10, dailyChallenge: 50
};

const LEVEL_THRESHOLDS = (function () {
  const base = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 5700];
  const arr = base.slice();
  let diff = arr[arr.length - 1] - arr[arr.length - 2]; // 1500
  while (arr.length < 60) { diff = Math.round(diff * 1.3); arr.push(arr[arr.length - 1] + diff); }
  return arr;
})();

function levelFromXP(xp) {
  let lvl = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if (xp >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
  return lvl;
}
function levelProgress(xp) {
  const lvl = levelFromXP(xp);
  const cur = LEVEL_THRESHOLDS[lvl - 1] || 0;
  const next = LEVEL_THRESHOLDS[lvl] || (cur + 1000);
  return { level: lvl, cur, next, pct: clamp(((xp - cur) / (next - cur)) * 100, 0, 100), toNext: next - xp };
}
function levelTier(lvl) {
  if (lvl <= 2) return 'Người mới';
  if (lvl <= 4) return 'Sơ cấp';
  if (lvl <= 6) return 'Trung cấp';
  if (lvl <= 8) return 'Trung cao cấp';
  if (lvl <= 10) return 'Cao cấp';
  return 'Thành thạo';
}

const BADGES = [
  { id: 'first_word',  icon: '🌱', name: 'Bắt đầu hành trình', desc: 'Học từ đầu tiên của bạn' },
  { id: 'week_streak', icon: '🔥', name: 'Tuần đầu tiên',      desc: 'Duy trì chuỗi 7 ngày' },
  { id: 'century',     icon: '💯', name: 'Trăm từ đầu tiên',   desc: 'Thành thạo 100 từ' },
  { id: 'thousand',    icon: '🏆', name: 'Vượt nghìn từ',       desc: 'Thành thạo 1000 từ' },
  { id: 'perfectday',  icon: '🎯', name: 'Siêu nhớ',            desc: 'Đạt độ chính xác ≥ 95% một phiên' },
  { id: 'phonetic100', icon: '🎤', name: 'Chuyên gia phát âm',  desc: 'Phát âm đúng 100 lần' },
  { id: 'month_streak',icon: '📅', name: 'Tháng kiên trì',      desc: 'Duy trì chuỗi 30 ngày' },
  { id: 'earlybird',   icon: '🦉', name: 'Cú đêm',              desc: 'Học trong khoảng 22h–5h' },
];

function checkBadges(sessionCtx) {
  const u = State.user;
  const mastered = State.cards.filter(isMastered).length;
  const studied = State.cards.filter(c => c.state !== 'new').length;
  const ctx = sessionCtx || {};
  const newly = [];
  const award = (id) => { if (!u.badges.includes(id)) { u.badges.push(id); newly.push(BADGES.find(b => b.id === id)); } };

  if (studied >= 1) award('first_word');
  if (u.streak >= 7) award('week_streak');
  if (mastered >= 100) award('century');
  if (mastered >= 1000) award('thousand');
  if (u.voiceCorrect >= 100) award('phonetic100');
  if (u.streak >= 30) award('month_streak');
  if (ctx.accuracy != null && ctx.accuracy >= 0.95 && ctx.reviewed >= 5) award('perfectday');
  if (ctx.hour != null && (ctx.hour >= 22 || ctx.hour <= 5)) award('earlybird');

  return newly;
}

/* ============================================================
   GLOBAL STATE
   ============================================================ */
const State = {
  words: [], cards: [], decks: [], user: null,
  session: null,
  currentView: 'dashboard',
  library: { search: '', deck: 'all', state: 'all', page: 1, perPage: 15 },
  wordIndex: {},   // wordId -> word
  cardByWord: {},  // wordId -> card
};

function reindex() {
  State.wordIndex = {}; State.cardByWord = {};
  State.words.forEach(w => State.wordIndex[w.id] = w);
  State.cards.forEach(c => State.cardByWord[c.wordId] = c);
}

function defaultUser() {
  return {
    id: 'profile',
    xp: 0, level: 1, streak: 0, longestStreak: 0,
    lastStudyDate: null, streakFreezes: 1, lastFreezeReset: todayStr(),
    badges: [], voiceCorrect: 0,
    dailyLog: {},        // 'YYYY-MM-DD' -> { reviewed, newLearned, again, good, correct, total }
    newIntroduced: {},   // 'YYYY-MM-DD' -> count
    lastBackup: null,
    seeded: false, onboarded: false,
    settings: {
      newPerDay: 10, retention: 0.9, voiceConfidence: 0.7,
      mode: 'flashcard', theme: 'system', streakFreeze: true,
      notifications: true, phonetic: 'ipa'
    }
  };
}

async function saveUser() { await DB.put('user', State.user); }

/* ============================================================
   QUEUE BUILDING
   ============================================================ */
function newAllowedToday() {
  const t = todayStr();
  const intro = State.user.newIntroduced[t] || 0;
  return Math.max(0, State.user.settings.newPerDay - intro);
}

function dueBreakdown() {
  const now = Date.now();
  let review = 0, learning = 0;
  State.cards.forEach(c => {
    if (c.state === 'new') return;
    if (c.due <= now) {
      if (c.state === 'learning' || c.state === 'relearning') learning++;
      else review++;
    }
  });
  return { review, learning, newRemaining: Math.min(newAllowedToday(), State.cards.filter(c => c.state === 'new').length) };
}

function buildQueue() {
  const now = Date.now();
  const due = State.cards.filter(c => c.state !== 'new' && c.due <= now);
  due.sort((a, b) => a.due - b.due);
  const overdue = due.filter(c => c.state === 'review' || c.state === 'relearning');
  const learning = due.filter(c => c.state === 'learning');
  const newCards = State.cards.filter(c => c.state === 'new').slice(0, newAllowedToday());
  let queue = [...overdue, ...learning, ...newCards].slice(0, 100);
  return queue.map(c => c.id);
}

/* ============================================================
   ROUTER
   ============================================================ */
const Router = {
  go(view) {
    if (!['dashboard', 'study', 'library', 'stats', 'settings'].includes(view)) view = 'dashboard';
    State.currentView = view;
    if (location.hash !== '#' + view) location.hash = view;
    $$('.view').forEach(v => v.classList.add('hidden'));
    const target = $('#view-' + view);
    if (target) target.classList.remove('hidden');
    $$('.nav-item, .bottom-nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    Router.render(view);
  },
  render(view) {
    try {
      if (view === 'dashboard') Dashboard.render();
      else if (view === 'study') Study.render();
      else if (view === 'library') Library.render();
      else if (view === 'stats') Stats.render();
      else if (view === 'settings') Settings.render();
    } catch (e) {
      console.error('Render error', view, e);
      const t = $('#view-' + view);
      if (t) t.innerHTML = `<div class="empty-study"><div class="empty-emoji">⚠️</div><div class="empty-title">Đã xảy ra lỗi</div><div class="empty-sub">${esc(e.message)}</div></div>`;
    }
  },
  init() {
    window.addEventListener('hashchange', () => {
      const v = location.hash.replace('#', '') || 'dashboard';
      if (v !== State.currentView) Router.go(v);
    });
  }
};

/* ============================================================
   MODAL
   ============================================================ */
const Modal = {
  open(html) {
    $('#modal-content').innerHTML = html;
    $('#modal-overlay').classList.remove('hidden');
  },
  close() {
    $('#modal-overlay').classList.add('hidden');
    $('#modal-content').innerHTML = '';
  }
};

/* ============================================================
   CONFETTI
   ============================================================ */
const Confetti = {
  burst() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = $('#confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth; canvas.height = innerHeight;
    const colors = ['#0EA5E9', '#F59E0B', '#10B981', '#7C3AED', '#EF4444'];
    const parts = Array.from({ length: 120 }, () => ({
      x: innerWidth / 2, y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 14, vy: Math.random() * -14 - 4,
      size: Math.random() * 8 + 4, color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360, vr: (Math.random() - 0.5) * 20, life: 1
    }));
    let frame = 0;
    (function anim() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach(p => {
        p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.008;
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
      frame++;
      if (frame < 160) requestAnimationFrame(anim);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })();
  }
};

/* ============================================================
   TOAST
   ============================================================ */
function toast(msg, type = 'info') {
  let t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
    padding: '10px 18px', borderRadius: '100px', zIndex: 600, fontSize: '0.85rem',
    fontWeight: '600', boxShadow: 'var(--shadow)', opacity: '0', transition: 'opacity .3s'
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => t.style.opacity = '1');
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2200);
}

/* ============================================================
   MODULE D — DASHBOARD
   ============================================================ */
const Dashboard = {
  render() {
    const u = State.user;
    const lp = levelProgress(u.xp);
    const bd = dueBreakdown();
    const total = State.words.length;
    const mastered = State.cards.filter(isMastered).length;
    const review = State.cards.filter(c => c.state === 'review' && !isMastered(c)).length;
    const learning = State.cards.filter(c => c.state === 'learning' || c.state === 'relearning').length;
    const newCount = State.cards.filter(c => c.state === 'new').length;
    const totalDue = bd.review + bd.learning;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

    const statePct = (n) => total ? (n / total * 100) : 0;

    const badgeHtml = BADGES.map(b => {
      const earned = u.badges.includes(b.id);
      return `<div class="badge-item ${earned ? 'earned' : 'locked'}" title="${esc(b.name)}: ${esc(b.desc)}">${b.icon}</div>`;
    }).join('');

    $('#view-dashboard').innerHTML = `
      <div class="dashboard-header">
        <div>
          <div class="greeting">${greet}! 👋</div>
          <div class="greeting-sub">Sẵn sàng học từ vựng hôm nay chưa?</div>
        </div>
        <div class="flex items-center gap-3">
          <div class="xp-earned-badge" style="margin:0"><span>🔥</span> ${u.streak} ngày</div>
          <div class="xp-earned-badge" style="margin:0"><span>⭐</span> ${u.xp.toLocaleString('vi-VN')} XP</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="flex justify-between items-center mb-4" style="flex-wrap:wrap;gap:12px">
          <div>
            <div class="font-bold" style="font-size:1.1rem">Level ${lp.level} — ${levelTier(lp.level)}</div>
            <div class="text-sm text-muted">Còn ${lp.toNext.toLocaleString('vi-VN')} XP để lên Level ${lp.level + 1}</div>
          </div>
          <div class="text-sm text-muted">${Math.round(lp.pct)}%</div>
        </div>
        <div class="progress-track" style="height:10px"><div class="progress-fill" style="width:${lp.pct}%"></div></div>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-main">
          <div class="study-cta-card">
            <div class="study-cta-header">
              <div>
                <div class="due-count">${totalDue}</div>
                <div class="due-label">Từ cần ôn hôm nay</div>
              </div>
              <div style="text-align:right">
                <div class="due-count" style="color:var(--success)">${bd.newRemaining}/${u.settings.newPerDay}</div>
                <div class="due-label">Từ mới còn lại</div>
              </div>
            </div>
            <div class="study-breakdown">
              <div class="breakdown-item"><span class="dot dot-review"></span> Ôn tập: ${bd.review}</div>
              <div class="breakdown-item"><span class="dot dot-learn"></span> Đang học: ${bd.learning}</div>
              <div class="breakdown-item"><span class="dot dot-new"></span> Mới: ${bd.newRemaining}</div>
            </div>
            <button class="btn btn-primary btn-lg btn-full" id="dash-start-btn">
              ${totalDue + bd.newRemaining > 0 ? '🚀 BẮT ĐẦU HỌC' : '✅ Đã học xong hôm nay — Ôn thêm'}
            </button>
          </div>
        </div>

        <div class="streak-card">
          <div class="flex items-center gap-3">
            <span class="streak-flame">🔥</span>
            <div>
              <div class="streak-number">${u.streak}</div>
              <div class="streak-label">Chuỗi ngày liên tiếp</div>
            </div>
          </div>
          <div class="divider" style="margin:8px 0"></div>
          <div class="text-sm text-muted">Kỷ lục: <span class="font-bold" style="color:var(--accent)">${u.longestStreak} ngày</span></div>
          <div class="text-sm text-muted">❄️ Streak Freeze: <span class="font-bold">${u.streakFreezes}</span> khả dụng</div>
        </div>

        <div class="vocab-breakdown-card">
          <div class="vocab-breakdown-title">Tổng quan từ vựng (${total})</div>
          ${vocabRow('Thành thạo', mastered, statePct(mastered), '#A78BFA')}
          ${vocabRow('Ôn tập', review, statePct(review), 'var(--primary)')}
          ${vocabRow('Đang học', learning, statePct(learning), 'var(--accent)')}
          ${vocabRow('Mới', newCount, statePct(newCount), 'var(--success)')}
        </div>

        <div class="badge-preview">
          <div class="badge-title">Huy hiệu (${u.badges.length}/${BADGES.length})</div>
          <div class="badge-row">${badgeHtml}</div>
        </div>
      </div>
    `;

    $('#dash-start-btn').addEventListener('click', () => Router.go('study'));
    App.refreshChrome();
  }
};
function vocabRow(label, count, pct, color) {
  return `<div class="vocab-state-row">
    <span class="vocab-state-label">${label}</span>
    <span class="vocab-state-bar"><span class="vocab-state-fill" style="width:${pct}%;background:${color}"></span></span>
    <span class="vocab-state-count">${count}</span>
  </div>`;
}

/* ============================================================
   MODULE A + B — STUDY SESSION
   ============================================================ */
const Study = {
  render() {
    if (!State.session) {
      const queue = buildQueue();
      if (queue.length === 0) { this.renderEmpty(); return; }
      State.session = {
        queue, results: [], reviewed: 0, correct: 0, newLearned: 0, xpEarned: 0,
        againCount: 0, startTime: Date.now(), hour: new Date().getHours(),
        mode: State.user.settings.mode || 'flashcard',
        total: queue.length, revealed: false, answered: false, answerCorrect: null,
        introducedThisSession: new Set()
      };
    }
    this.renderCard();
  },

  renderEmpty() {
    const now = Date.now();
    const future = State.cards.filter(c => c.state !== 'new' && c.due > now).sort((a, b) => a.due - b.due)[0];
    let countdown = '';
    if (future) {
      const ms = future.due - now;
      countdown = `<div class="next-review-countdown">⏰ Lần ôn tiếp theo sau: ${formatInterval(ms)}</div>`;
    }
    $('#view-study').innerHTML = `
      <div class="empty-study">
        <div class="empty-emoji">🎉</div>
        <div class="empty-title">Tuyệt vời! Bạn đã học hết rồi</div>
        <div class="empty-sub">Không còn thẻ nào cần ôn ngay bây giờ.</div>
        ${countdown}
        <div class="mt-4 flex gap-3" style="justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="location.hash='library'">📖 Thêm từ mới</button>
          <button class="btn btn-ghost" onclick="location.hash='dashboard'">🏠 Về trang chủ</button>
        </div>
      </div>`;
  },

  currentCard() {
    const s = State.session;
    if (!s || s.queue.length === 0) return null;
    const card = State.cards.find(c => c.id === s.queue[0]);
    return card || null;
  },

  renderCard() {
    const s = State.session;
    const card = this.currentCard();
    if (!card) { this.end(); return; }
    const word = State.wordIndex[card.wordId];
    if (!word) { s.queue.shift(); this.renderCard(); return; }

    s.revealed = false; s.answered = false; s.answerCorrect = null;
    const dst = displayState(card);
    const deck = State.decks.find(d => d.id === word.category);
    const progressPct = s.total ? ((s.reviewed) / s.total * 100) : 0;

    const modes = [
      ['flashcard', 'Thẻ ghi nhớ'], ['listening', 'Nghe'],
      ['multiple', 'Trắc nghiệm'], ['fillblank', 'Điền từ'], ['spelling', 'Đánh vần']
    ];
    const tabs = modes.map(([m, label]) =>
      `<div class="mode-tab ${s.mode === m ? 'active' : ''}" data-mode="${m}">${label}</div>`).join('');

    let bodyHtml = '';
    if (s.mode === 'multiple') bodyHtml = this.renderMultiple(card, word);
    else if (s.mode === 'fillblank') bodyHtml = this.renderFillBlank(card, word);
    else bodyHtml = this.renderFlashcard(card, word, deck, dst);

    $('#view-study').innerHTML = `
      <div class="study-container">
        <div class="study-header">
          <button class="btn btn-icon btn-ghost" id="study-exit" title="Thoát">✕</button>
          <span class="study-progress-label">${s.reviewed}/${s.total}</span>
          <div class="study-progress-track"><div class="study-progress-fill" style="width:${progressPct}%"></div></div>
          <span class="study-progress-label">⭐ ${s.xpEarned}</span>
        </div>
        <div class="study-mode-tabs">${tabs}</div>
        <div id="study-body">${bodyHtml}</div>
        <div id="study-footer"></div>
      </div>`;

    $('#study-exit').addEventListener('click', () => this.confirmExit());
    $$('.mode-tab').forEach(t => t.addEventListener('click', () => {
      s.mode = t.dataset.mode; this.renderCard();
    }));

    this.attachModeHandlers(card, word);
  },

  renderFlashcard(card, word, deck, dst) {
    const s = State.session;
    const audioFirst = s.mode === 'listening' || s.mode === 'spelling';
    const front = audioFirst
      ? `<div class="card-prompt">🔊 Nghe và ${s.mode === 'spelling' ? 'gõ chính tả' : (Speech.hasRecognition ? 'phát âm' : 'gõ')} từ</div>
         <button class="btn btn-primary mt-2" id="listen-play">▶ Phát lại</button>`
      : `<div class="card-prompt">${esc(word.meaning_vi)}</div>
         <div class="card-hint">Hãy ${Speech.hasRecognition ? 'phát âm hoặc gõ' : 'gõ'} từ tiếng Anh</div>`;

    return `
      <div class="flashcard-scene">
        <div class="flashcard" id="flashcard">
          <div class="card-face card-face-front">
            <span class="card-deck-tag">${esc(deck ? deck.name : '')}</span>
            <span class="card-state-tag card-state-${card.state}">${STATE_LABEL[dst]}</span>
            ${front}
          </div>
          <div class="card-face card-face-back">
            <span class="card-deck-tag">${esc(deck ? deck.name : '')}</span>
            <div class="card-word">${esc(word.word)}</div>
            <div class="card-ipa">${esc(word.ipa || '')}</div>
            <div class="card-example">${esc(word.example || '')}</div>
            <div id="reveal-result"></div>
          </div>
        </div>
      </div>`;
  },

  renderMultiple(card, word) {
    const s = State.session;
    // build 4 options (correct meaning + 3 distractors)
    const others = State.words.filter(w => w.id !== word.id);
    shuffle(others);
    const opts = [word.meaning_vi, ...others.slice(0, 3).map(w => w.meaning_vi)];
    shuffle(opts);
    s._mcCorrect = word.meaning_vi;
    const letters = ['A', 'B', 'C', 'D'];
    const optHtml = opts.map((o, i) =>
      `<button class="mc-option" data-value="${esc(o)}">
        <span class="mc-option-label">${letters[i]}</span><span>${esc(o)}</span></button>`).join('');
    return `
      <div class="card">
        <div class="mc-question">${esc(word.word)}</div>
        <div class="text-center text-muted text-sm mb-4">Chọn nghĩa tiếng Việt đúng</div>
        <div class="mc-options">${optHtml}</div>
      </div>`;
  },

  renderFillBlank(card, word) {
    const example = word.example || word.word;
    const re = new RegExp('\\b' + word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    const blanked = example.replace(re, '<span class="fib-blank">_____</span>');
    return `
      <div class="card">
        <div class="text-center text-muted text-sm mb-4">Điền từ còn thiếu vào câu (nghĩa: ${esc(word.meaning_vi)})</div>
        <div class="fib-sentence">${blanked}</div>
        <div class="typing-input-row mt-4">
          <input type="text" id="fib-input" placeholder="Nhập từ tiếng Anh..." autocomplete="off" autocapitalize="off" spellcheck="false">
          <button class="btn btn-primary" id="fib-submit">Kiểm tra</button>
        </div>
      </div>`;
  },

  attachModeHandlers(card, word) {
    const s = State.session;

    if (s.mode === 'listening' || s.mode === 'spelling') { setTimeout(() => Speech.speak(word.word), 300); }
    const lp = $('#listen-play'); if (lp) lp.addEventListener('click', () => Speech.speak(word.word));

    if (s.mode === 'multiple') {
      $$('.mc-option').forEach(btn => btn.addEventListener('click', () => {
        if (s.answered) return;
        const val = btn.dataset.value;
        const correct = val === s._mcCorrect;
        s.answered = true; s.answerCorrect = correct;
        $$('.mc-option').forEach(b => {
          b.disabled = true;
          if (b.dataset.value === s._mcCorrect) b.classList.add('correct');
          else if (b === btn) b.classList.add('wrong');
        });
        Speech.speak(word.word);
        this.showRating(card, word, correct);
      }));
      return;
    }

    if (s.mode === 'fillblank') {
      const submit = () => {
        if (s.answered) return;
        const val = $('#fib-input').value;
        const res = evaluatePronunciation(val, word.word, 1);
        s.answered = true; s.answerCorrect = res.correct;
        this.revealFillBlank(word, res.correct);
        Speech.speak(word.word);
        this.showRating(card, word, res.correct);
      };
      $('#fib-submit').addEventListener('click', submit);
      $('#fib-input').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      setTimeout(() => $('#fib-input').focus(), 100);
      return;
    }

    // flashcard / listening / spelling → input area (voice or typing) then reveal
    this.renderInputArea(card, word);
  },

  revealFillBlank(word, correct) {
    const blank = $('.fib-blank');
    if (blank) { blank.textContent = word.word; blank.style.color = correct ? 'var(--success)' : 'var(--error)'; }
  },

  renderInputArea(card, word) {
    const s = State.session;
    const useVoice = Speech.hasRecognition && s.mode !== 'spelling';
    const footer = $('#study-footer');

    let html = '<div class="study-input-area">';
    if (useVoice) {
      html += `
        <div class="voice-controls">
          <button class="btn-mic" id="mic-btn" title="Nhấn để nói">🎤</button>
          <div class="voice-status" id="voice-status">Nhấn micro rồi phát âm từ tiếng Anh</div>
        </div>
        <div class="text-center text-muted text-xs">— hoặc gõ từ —</div>`;
    }
    html += `
      <div class="typing-input-row">
        <input type="text" id="answer-input" placeholder="${s.mode === 'spelling' ? 'Nghe rồi gõ chính tả...' : 'Gõ từ tiếng Anh...'}" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="btn btn-primary" id="answer-submit">Kiểm tra</button>
      </div>
      <div class="study-actions">
        <button class="btn btn-ghost btn-sm" id="listen-sample">🔊 Nghe mẫu</button>
        <button class="btn btn-ghost btn-sm" id="reveal-btn">👁 Hiện đáp án</button>
      </div>
    </div>`;
    footer.innerHTML = html;

    $('#listen-sample').addEventListener('click', () => Speech.speak(word.word));

    const doSubmit = (spoken, confidence) => {
      if (s.answered) return;
      const res = evaluatePronunciation(spoken, word.word, confidence == null ? 1 : confidence);
      s.answered = true; s.answerCorrect = res.correct;
      if (confidence != null && res.correct) State.user.voiceCorrect++;
      this.flip(card, word, res.correct, spoken);
    };

    $('#answer-submit').addEventListener('click', () => doSubmit($('#answer-input').value, null));
    $('#answer-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit($('#answer-input').value, null); });
    $('#reveal-btn').addEventListener('click', () => this.flip(card, word, null, null));

    if (useVoice) {
      const mic = $('#mic-btn'), status = $('#voice-status');
      mic.addEventListener('click', () => {
        if (Speech.listening) { Speech.stop(); return; }
        mic.classList.add('listening'); status.textContent = '🔴 Đang nghe... hãy nói ngay';
        Speech.listen(
          (alts) => {
            const best = alts[0];
            status.textContent = `Bạn đã nói: "${best.transcript}"`;
            doSubmit(best.transcript, best.confidence || 0.9);
          },
          (err) => {
            mic.classList.remove('listening');
            status.textContent = err === 'no-speech' ? 'Không nghe thấy gì, thử lại nhé' : 'Lỗi micro — hãy gõ đáp án';
          },
          () => { mic.classList.remove('listening'); }
        );
      });
    } else if (s.mode !== 'spelling') {
      // voice unsupported banner handled globally
    }

    setTimeout(() => { const ai = $('#answer-input'); if (ai) ai.focus(); }, 100);
  },

  flip(card, word, correct, spoken) {
    const s = State.session;
    if (!s.answered && correct === null) { s.answered = true; s.answerCorrect = false; } // revealed without answering = treat as struggle
    const fc = $('#flashcard');
    if (fc) fc.classList.add('flipped');
    const rr = $('#reveal-result');
    if (rr && correct !== null) {
      rr.innerHTML = correct
        ? `<div class="card-result correct">✓ Chính xác!</div>`
        : `<div class="card-result wrong">✗ ${spoken ? 'Bạn nói: "' + esc(spoken) + '"' : 'Chưa đúng'}</div>`;
    }
    Speech.speak(word.word);
    this.showRating(card, word, s.answerCorrect);
  },

  showRating(card, word, correct) {
    const s = State.session;
    s.revealed = true;
    // compute interval previews
    const preview = (g) => formatInterval(scheduleCard(card, g, Date.now()).intervalMs);
    const footer = $('#study-footer');
    footer.innerHTML = `
      <div class="rating-row">
        <button class="btn-rating again" data-grade="1">Again<span class="interval-hint">${preview(1)}</span></button>
        <button class="btn-rating hard"  data-grade="2">Hard<span class="interval-hint">${preview(2)}</span></button>
        <button class="btn-rating good"  data-grade="3">Good<span class="interval-hint">${preview(3)}</span></button>
        <button class="btn-rating easy"  data-grade="4">Easy<span class="interval-hint">${preview(4)}</span></button>
      </div>
      <div class="study-actions mt-2">
        <button class="btn btn-ghost btn-sm" id="rating-listen">🔊 Nghe lại</button>
      </div>`;
    $('#rating-listen').addEventListener('click', () => Speech.speak(word.word));
    $$('.btn-rating').forEach(b => b.addEventListener('click', () => this.rate(parseInt(b.dataset.grade, 10))));
  },

  async rate(grade) {
    const s = State.session;
    const card = this.currentCard();
    if (!card) return;
    const now = Date.now();
    const result = scheduleCard(card, grade, now);
    const wasNew = result.wasNew;

    // apply update to state
    const idx = State.cards.findIndex(c => c.id === card.id);
    State.cards[idx] = result.card;
    State.cardByWord[result.card.wordId] = result.card;
    await DB.put('cards', result.card);

    // session stats
    s.reviewed++;
    if (grade >= 3) s.correct++;
    if (grade === 1) s.againCount++;

    // XP
    let xp = grade >= 3 ? XP_REWARDS.reviewCorrect : XP_REWARDS.reviewStruggle;
    if (wasNew && !s.introducedThisSession.has(card.id)) {
      xp += XP_REWARDS.learnNew;
      s.newLearned++;
      s.introducedThisSession.add(card.id);
      const t = todayStr();
      State.user.newIntroduced[t] = (State.user.newIntroduced[t] || 0) + 1;
    }
    s.xpEarned += xp;
    State.user.xp += xp;

    // daily log
    const t = todayStr();
    const log = State.user.dailyLog[t] || { reviewed: 0, newLearned: 0, again: 0, good: 0, correct: 0, total: 0 };
    log.reviewed++; log.total++;
    if (grade === 1) log.again++; else log.good++;
    if (grade >= 3) log.correct++;
    if (wasNew) log.newLearned++;
    State.user.dailyLog[t] = log;

    // queue management: re-insert short (same-day learning/relearning) steps
    s.queue.shift();
    if ((result.card.state === 'learning' || result.card.state === 'relearning') &&
        result.intervalMs < DAY_MS) {
      const pos = Math.min(s.queue.length, 3 + Math.floor(Math.random() * 3));
      s.queue.splice(pos, 0, result.card.id);
      s.total++; // account for the re-review so progress stays ≤ 100%
    }

    await saveUser();
    App.refreshChrome();

    if (s.queue.length === 0) this.end();
    else this.renderCard();
  },

  confirmExit() {
    Modal.open(`
      <div class="text-center">
        <div style="font-size:2.5rem;margin-bottom:12px">🚪</div>
        <div class="modal-title">Kết thúc phiên học?</div>
        <div class="modal-sub">Tiến trình của bạn đã được lưu tự động.</div>
        <div class="form-actions" style="justify-content:center">
          <button class="btn btn-ghost" onclick="Modal.close()">Tiếp tục học</button>
          <button class="btn btn-primary" id="exit-confirm">Kết thúc</button>
        </div>
      </div>`);
    $('#exit-confirm').addEventListener('click', () => { Modal.close(); Study.end(true); });
  },

  async end(early) {
    const s = State.session;
    if (!s) { Router.go('dashboard'); return; }

    const accuracy = s.reviewed > 0 ? s.correct / s.reviewed : 0;
    let bonusXp = 0;
    let leveledUp = false;
    const prevLevel = levelFromXP(State.user.xp);

    if (!early && s.reviewed > 0) {
      bonusXp += XP_REWARDS.sessionComplete;
    }

    // streak update
    const streakInfo = updateStreak(s);
    if (streakInfo.incremented) bonusXp += XP_REWARDS.dailyStreak;

    State.user.xp += bonusXp;
    s.xpEarned += bonusXp;

    const newLevel = levelFromXP(State.user.xp);
    if (newLevel > prevLevel) leveledUp = true;

    // badges
    const newBadges = checkBadges({ accuracy, reviewed: s.reviewed, hour: s.hour });

    State.user.lastBackup = State.user.lastBackup; // no-op
    await saveUser();

    const reviewed = s.reviewed, correct = s.correct, newLearned = s.newLearned, xpEarned = s.xpEarned;
    State.session = null;

    // celebrate
    if (streakInfo.milestone || leveledUp || (accuracy >= 0.95 && reviewed >= 5)) Confetti.burst();

    $('#view-study').innerHTML = `
      <div class="session-end">
        <div class="session-end-emoji">${accuracy >= 0.9 ? '🏆' : accuracy >= 0.7 ? '🎉' : '💪'}</div>
        <div class="session-end-title">Hoàn thành phiên học!</div>
        <div class="session-end-sub">${early ? 'Bạn đã kết thúc sớm — làm tốt lắm!' : 'Làm tốt lắm, tiếp tục duy trì nhé!'}</div>
        <div class="xp-earned-badge">⭐ +${xpEarned} XP</div>
        <div class="session-stats-grid">
          <div class="session-stat"><div class="session-stat-value">${reviewed}</div><div class="session-stat-label">Đã ôn</div></div>
          <div class="session-stat"><div class="session-stat-value">${Math.round(accuracy * 100)}%</div><div class="session-stat-label">Chính xác</div></div>
          <div class="session-stat"><div class="session-stat-value">${newLearned}</div><div class="session-stat-label">Từ mới</div></div>
        </div>
        ${leveledUp ? `<div class="xp-earned-badge" style="background:var(--primary-dim);border-color:var(--primary);color:var(--primary)">🎊 Lên Level ${newLevel}!</div>` : ''}
        ${streakInfo.incremented ? `<div class="xp-earned-badge" style="background:var(--accent-dim);border-color:var(--accent);color:var(--accent)">🔥 Chuỗi ${State.user.streak} ngày!</div>` : ''}
        <div class="mt-4 flex gap-3" style="justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="location.hash='study'">Học tiếp</button>
          <button class="btn btn-ghost" onclick="location.hash='dashboard'">Về trang chủ</button>
        </div>
      </div>`;

    App.refreshChrome();

    // show badge modals sequentially
    if (newBadges.length) setTimeout(() => showBadgeEarned(newBadges), 600);
  }
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* Streak logic */
function updateStreak(s) {
  const u = State.user;
  const today = todayStr();
  const qualifies = s.reviewed >= 5 || s.newLearned >= 3;
  const info = { incremented: false, milestone: false };

  // weekly freeze regeneration (Monday)
  const now = new Date();
  if (now.getDay() === 1 && u.lastFreezeReset !== today) {
    u.streakFreezes = 1; u.lastFreezeReset = today;
  }

  if (!qualifies) return info;
  if (u.lastStudyDate === today) return info; // already counted today

  if (u.lastStudyDate) {
    const gap = daysBetween(u.lastStudyDate, today);
    if (gap === 1) { u.streak += 1; info.incremented = true; }
    else if (gap > 1) {
      // missed day(s)
      if (u.settings.streakFreeze && u.streakFreezes > 0 && gap === 2) {
        u.streakFreezes -= 1; u.streak += 1; info.incremented = true;
        toast('❄️ Đã dùng Streak Freeze để giữ chuỗi!', 'info');
      } else {
        u.streak = 1; info.incremented = true;
      }
    }
  } else {
    u.streak = 1; info.incremented = true;
  }
  u.lastStudyDate = today;
  if (u.streak > u.longestStreak) u.longestStreak = u.streak;
  if ([7, 30, 100, 365].includes(u.streak)) info.milestone = true;
  return info;
}

function showBadgeEarned(badges) {
  const b = badges.shift();
  if (!b) return;
  Confetti.burst();
  Modal.open(`
    <div class="badge-earned">
      <div class="badge-earned-icon">${b.icon}</div>
      <div class="badge-earned-title">Huy hiệu mới!</div>
      <div class="badge-earned-name">${esc(b.name)}</div>
      <div class="badge-earned-desc">${esc(b.desc)}</div>
      <div class="form-actions" style="justify-content:center;margin-top:20px">
        <button class="btn btn-primary" id="badge-next">${badges.length ? 'Tiếp theo' : 'Tuyệt vời!'}</button>
      </div>
    </div>`);
  $('#badge-next').addEventListener('click', () => {
    Modal.close();
    if (badges.length) setTimeout(() => showBadgeEarned(badges), 300);
  });
}

/* ============================================================
   MODULE C — LIBRARY (vocabulary management)
   ============================================================ */
const Library = {
  render() {
    const lib = State.library;
    const deckOpts = ['<option value="all">Tất cả bộ thẻ</option>']
      .concat(State.decks.map(d => `<option value="${d.id}" ${lib.deck === d.id ? 'selected' : ''}>${esc(d.name)}</option>`)).join('');
    const stateOpts = [['all', 'Tất cả trạng thái'], ['new', 'Mới'], ['learning', 'Đang học'], ['review', 'Ôn tập'], ['mastered', 'Thành thạo']]
      .map(([v, l]) => `<option value="${v}" ${lib.state === v ? 'selected' : ''}>${l}</option>`).join('');

    $('#view-library').innerHTML = `
      <div class="dashboard-header">
        <div>
          <div class="greeting">Thư viện từ vựng</div>
          <div class="greeting-sub">Tổng cộng ${State.words.length} từ trong ${State.decks.length} bộ thẻ</div>
        </div>
      </div>
      <div class="library-toolbar">
        <input type="text" class="library-search" id="lib-search" placeholder="Tìm từ tiếng Anh hoặc nghĩa tiếng Việt..." value="${esc(lib.search)}">
        <select class="filter-select" id="lib-deck">${deckOpts}</select>
        <select class="filter-select" id="lib-state">${stateOpts}</select>
        <button class="btn btn-primary btn-sm" id="lib-add">➕ Thêm từ</button>
        <button class="btn btn-ghost btn-sm" id="lib-import">📥 Nhập CSV</button>
        <button class="btn btn-ghost btn-sm" id="lib-export">📤 Xuất CSV</button>
      </div>
      <div id="lib-table-wrap"></div>`;

    $('#lib-search').addEventListener('input', e => { lib.search = e.target.value; lib.page = 1; this.renderTable(); });
    $('#lib-deck').addEventListener('change', e => { lib.deck = e.target.value; lib.page = 1; this.renderTable(); });
    $('#lib-state').addEventListener('change', e => { lib.state = e.target.value; lib.page = 1; this.renderTable(); });
    $('#lib-add').addEventListener('click', () => this.editWord(null));
    $('#lib-import').addEventListener('click', () => this.importDialog());
    $('#lib-export').addEventListener('click', () => this.exportCSV());

    this.renderTable();
  },

  filtered() {
    const lib = State.library;
    const q = normalize(lib.search);
    return State.words.filter(w => {
      if (lib.deck !== 'all' && w.category !== lib.deck) return false;
      const card = State.cardByWord[w.id];
      if (lib.state !== 'all') {
        const dst = card ? displayState(card) : 'new';
        if (lib.state === 'review' && !(dst === 'review')) return false;
        else if (lib.state !== 'review' && dst !== lib.state) return false;
      }
      if (q) {
        return normalize(w.word).includes(q) || normalize(w.meaning_vi).includes(q);
      }
      return true;
    });
  },

  renderTable() {
    const lib = State.library;
    const rows = this.filtered();
    const totalPages = Math.max(1, Math.ceil(rows.length / lib.perPage));
    lib.page = clamp(lib.page, 1, totalPages);
    const pageRows = rows.slice((lib.page - 1) * lib.perPage, lib.page * lib.perPage);

    if (rows.length === 0) {
      $('#lib-table-wrap').innerHTML = `<div class="empty-study"><div class="empty-emoji">🔍</div><div class="empty-title">Không tìm thấy từ nào</div><div class="empty-sub">Thử thay đổi bộ lọc hoặc thêm từ mới.</div></div>`;
      return;
    }

    const body = pageRows.map(w => {
      const card = State.cardByWord[w.id];
      const dst = card ? displayState(card) : 'new';
      const deck = State.decks.find(d => d.id === w.category);
      return `<tr>
        <td class="word-cell">${esc(w.word)}</td>
        <td>${esc(w.meaning_vi)}</td>
        <td class="ipa-cell">${esc(w.ipa || '')}</td>
        <td><span class="text-xs text-muted">${esc(deck ? deck.name : '')}</span></td>
        <td><span class="state-pill state-${dst}">${STATE_LABEL[dst]}</span></td>
        <td>
          <div class="word-actions">
            <button class="btn btn-icon btn-ghost btn-sm" data-act="speak" data-id="${w.id}" title="Nghe">🔊</button>
            <button class="btn btn-icon btn-ghost btn-sm" data-act="edit" data-id="${w.id}" title="Sửa">✏️</button>
            <button class="btn btn-icon btn-ghost btn-sm" data-act="del" data-id="${w.id}" title="Xóa">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    let pag = '';
    if (totalPages > 1) {
      pag = `<div class="pagination">
        <button class="page-btn" data-page="${lib.page - 1}" ${lib.page === 1 ? 'disabled' : ''}>‹</button>
        <span class="page-info">Trang ${lib.page}/${totalPages} · ${rows.length} từ</span>
        <button class="page-btn" data-page="${lib.page + 1}" ${lib.page === totalPages ? 'disabled' : ''}>›</button>
      </div>`;
    }

    $('#lib-table-wrap').innerHTML = `
      <table class="word-table">
        <thead><tr><th>Từ</th><th>Nghĩa</th><th>Phiên âm</th><th>Bộ thẻ</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${body}</tbody>
      </table>${pag}`;

    $$('#lib-table-wrap [data-act]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id, act = b.dataset.act;
      const word = State.wordIndex[id];
      if (act === 'speak') Speech.speak(word.word);
      else if (act === 'edit') this.editWord(word);
      else if (act === 'del') this.deleteWord(word);
    }));
    $$('#lib-table-wrap .page-btn').forEach(b => b.addEventListener('click', () => {
      if (b.disabled) return; lib.page = parseInt(b.dataset.page, 10); this.renderTable();
    }));
  },

  editWord(word) {
    const isNew = !word;
    const deckOpts = State.decks.map(d =>
      `<option value="${d.id}" ${word && word.category === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
    Modal.open(`
      <div class="modal-title">${isNew ? 'Thêm từ mới' : 'Chỉnh sửa từ'}</div>
      <div class="modal-sub">Điền thông tin chi tiết cho từ vựng.</div>
      <div class="form-group"><label class="form-label">Từ tiếng Anh *</label><input class="form-input" id="w-word" value="${esc(word ? word.word : '')}"></div>
      <div class="form-group"><label class="form-label">Nghĩa tiếng Việt *</label><input class="form-input" id="w-meaning" value="${esc(word ? word.meaning_vi : '')}"></div>
      <div class="form-group"><label class="form-label">Phiên âm (IPA)</label><input class="form-input" id="w-ipa" value="${esc(word ? word.ipa : '')}" placeholder="/həˈloʊ/"></div>
      <div class="form-group"><label class="form-label">Câu ví dụ</label><textarea class="form-input" id="w-example">${esc(word ? word.example : '')}</textarea></div>
      <div class="form-group"><label class="form-label">Bộ thẻ</label><select class="form-input" id="w-deck">${deckOpts}</select></div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="Modal.close()">Hủy</button>
        <button class="btn btn-primary" id="w-save">${isNew ? 'Thêm' : 'Lưu'}</button>
      </div>`);
    $('#w-save').addEventListener('click', async () => {
      const wd = $('#w-word').value.trim(), mn = $('#w-meaning').value.trim();
      if (!wd || !mn) { toast('Vui lòng nhập từ và nghĩa', 'error'); return; }
      if (isNew) {
        const id = uid('w_');
        const newWord = { id, word: wd, meaning_vi: mn, ipa: $('#w-ipa').value.trim(), example: $('#w-example').value.trim(), category: $('#w-deck').value, tags: [], imageUrl: '' };
        const card = newCard(id);
        State.words.push(newWord); State.cards.push(card);
        await DB.put('words', newWord); await DB.put('cards', card);
      } else {
        word.word = wd; word.meaning_vi = mn; word.ipa = $('#w-ipa').value.trim();
        word.example = $('#w-example').value.trim(); word.category = $('#w-deck').value;
        await DB.put('words', word);
      }
      reindex(); Modal.close(); this.renderTable(); App.refreshChrome();
      toast(isNew ? 'Đã thêm từ mới' : 'Đã lưu thay đổi', 'success');
    });
    setTimeout(() => $('#w-word').focus(), 100);
  },

  deleteWord(word) {
    Modal.open(`
      <div class="text-center">
        <div style="font-size:2.5rem;margin-bottom:12px">🗑</div>
        <div class="modal-title">Xóa "${esc(word.word)}"?</div>
        <div class="modal-sub">Hành động này không thể hoàn tác.</div>
        <div class="form-actions" style="justify-content:center">
          <button class="btn btn-ghost" onclick="Modal.close()">Hủy</button>
          <button class="btn btn-danger" id="del-confirm">Xóa</button>
        </div>
      </div>`);
    $('#del-confirm').addEventListener('click', async () => {
      const card = State.cardByWord[word.id];
      State.words = State.words.filter(w => w.id !== word.id);
      State.cards = State.cards.filter(c => c.wordId !== word.id);
      await DB.del('words', word.id);
      if (card) await DB.del('cards', card.id);
      reindex(); Modal.close(); this.renderTable(); App.refreshChrome();
      toast('Đã xóa từ', 'success');
    });
  },

  importDialog() {
    Modal.open(`
      <div class="modal-title">Nhập từ vựng từ CSV</div>
      <div class="modal-sub">Cột: word, meaning_vi, example, category, image_url (tùy chọn)</div>
      <div class="drop-zone" id="drop-zone">
        <div style="font-size:2rem;margin-bottom:8px">📄</div>
        <div>Kéo thả file CSV vào đây hoặc bấm để chọn</div>
        <input type="file" id="csv-file" accept=".csv,text/csv" style="display:none">
      </div>
      <div class="mt-4"><button class="btn btn-ghost btn-sm" id="csv-template">⬇ Tải mẫu CSV</button></div>
      <div id="csv-preview-area"></div>`);
    const dz = $('#drop-zone'), fi = $('#csv-file');
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this.parseCSVFile(e.dataTransfer.files[0]);
    });
    fi.addEventListener('change', () => { if (fi.files[0]) this.parseCSVFile(fi.files[0]); });
    $('#csv-template').addEventListener('click', () => downloadFile(
      'word,meaning_vi,example,category,image_url\nhello,xin chào,Hello there!,deck1,\napple,quả táo,I eat an apple.,deck1,',
      'vocabmaster-template.csv', 'text/csv'));
  },

  parseCSVFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(reader.result);
      if (rows.length < 2) { toast('File CSV trống hoặc không hợp lệ', 'error'); return; }
      const header = rows[0].map(h => normalize(h));
      const wi = header.indexOf('word'), mi = header.indexOf('meaning_vi'),
            ei = header.indexOf('example'), ci = header.indexOf('category'), ii = header.indexOf('image_url');
      if (wi < 0 || mi < 0) { toast('CSV cần có cột "word" và "meaning_vi"', 'error'); return; }
      const existing = new Set(State.words.map(w => normalize(w.word)));
      const parsed = [], dups = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const word = (r[wi] || '').trim();
        if (!word) continue;
        const item = {
          word, meaning_vi: (r[mi] || '').trim(),
          example: ei >= 0 ? (r[ei] || '').trim() : '',
          category: ci >= 0 && State.decks.some(d => d.id === (r[ci] || '').trim()) ? (r[ci] || '').trim() : State.decks[0].id,
          image_url: ii >= 0 ? (r[ii] || '').trim() : ''
        };
        if (existing.has(normalize(word))) { dups.push(item); } else { parsed.push(item); existing.add(normalize(word)); }
      }
      this.showCSVPreview(parsed, dups);
    };
    reader.readAsText(file);
  },

  showCSVPreview(parsed, dups) {
    const preview = parsed.slice(0, 8).map(p =>
      `<tr><td>${esc(p.word)}</td><td>${esc(p.meaning_vi)}</td><td>${esc(p.category)}</td></tr>`).join('');
    $('#csv-preview-area').innerHTML = `
      <div class="divider"></div>
      <div class="mb-4"><strong>${parsed.length}</strong> từ mới sẽ được nhập${dups.length ? ` · <span style="color:var(--accent)">${dups.length} từ trùng sẽ bỏ qua</span>` : ''}</div>
      ${parsed.length ? `<div class="csv-preview"><table class="csv-table"><thead><tr><th>Từ</th><th>Nghĩa</th><th>Bộ thẻ</th></tr></thead><tbody>${preview}</tbody></table></div>${parsed.length > 8 ? `<div class="text-xs text-muted">...và ${parsed.length - 8} từ khác</div>` : ''}` : ''}
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="Modal.close()">Hủy</button>
        <button class="btn btn-primary" id="csv-confirm" ${parsed.length ? '' : 'disabled'}>Nhập ${parsed.length} từ</button>
      </div>`;
    if (parsed.length) $('#csv-confirm').addEventListener('click', async () => {
      const newWords = [], newCards = [];
      parsed.forEach(p => {
        const id = uid('w_');
        newWords.push({ id, word: p.word, meaning_vi: p.meaning_vi, ipa: '', example: p.example, category: p.category, tags: [], imageUrl: p.image_url });
        newCards.push(newCard(id));
      });
      State.words.push(...newWords); State.cards.push(...newCards);
      await DB.bulkPut('words', newWords); await DB.bulkPut('cards', newCards);
      reindex(); Modal.close(); this.renderTable(); App.refreshChrome();
      toast(`Đã nhập ${newWords.length} từ`, 'success');
    });
  },

  exportCSV() {
    const rows = [['word', 'meaning_vi', 'ipa', 'example', 'category', 'image_url']];
    State.words.forEach(w => rows.push([w.word, w.meaning_vi, w.ipa || '', w.example || '', w.category, w.imageUrl || '']));
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
    downloadFile(csv, `vocabmaster-words-${Date.now()}.csv`, 'text/csv');
    toast('Đã xuất CSV', 'success');
  }
};

function newCard(wordId) {
  return {
    id: uid('c_'), wordId, state: 'new', due: Date.now(),
    stability: 0, difficulty: 0, reps: 0, lapses: 0, learningStep: 0, lastReview: null
  };
}

/* CSV helpers */
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && !(r.length === 1 && r[0] === ''));
}
function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

/* ============================================================
   MODULE D — STATISTICS
   ============================================================ */
const Stats = {
  charts: {},
  render() {
    $('#view-stats').innerHTML = `
      <div class="stats-header">
        <div class="stats-title">Thống kê & Tiến trình</div>
        <div class="stats-sub">Theo dõi hành trình học từ vựng của bạn</div>
      </div>
      <div class="heatmap-container">
        <div class="heatmap-title">Hoạt động học tập (12 tháng qua)</div>
        <div id="heatmap"></div>
      </div>
      <div class="charts-grid">
        <div class="chart-card"><div class="chart-title">Tỉ lệ ghi nhớ (30 ngày qua)</div><div class="chart-canvas-wrap"><canvas id="retention-chart"></canvas></div></div>
        <div class="chart-card"><div class="chart-title">Dự báo ôn tập (14 ngày tới)</div><div class="chart-canvas-wrap"><canvas id="forecast-chart"></canvas></div></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">🔥 10 từ khó nhất</div>
        <div id="hardest-words"></div>
      </div>`;
    this.renderHeatmap();
    this.renderHardest();
    // charts after layout
    setTimeout(() => { this.renderRetention(); this.renderForecast(); }, 50);
  },

  renderHeatmap() {
    const log = State.user.dailyLog;
    const today = new Date();
    const start = new Date(today); start.setDate(start.getDate() - 363);
    // align to start of week (Sunday)
    start.setDate(start.getDate() - start.getDay());
    const weeks = [];
    let cur = new Date(start);
    let maxVal = 1;
    Object.values(log).forEach(l => { if (l.reviewed > maxVal) maxVal = l.reviewed; });
    while (cur <= today) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const ds = todayStr(cur);
        const val = log[ds] ? log[ds].reviewed : 0;
        let level = 0;
        if (val > 0) level = clamp(Math.ceil(val / maxVal * 4), 1, 4);
        const future = cur > today;
        week.push({ ds, val, level, future });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    const html = weeks.map(w => `<div class="heatmap-week">${w.map(c =>
      c.future ? `<div class="heatmap-cell" style="visibility:hidden"></div>`
      : `<div class="heatmap-cell" data-level="${c.level}" data-tooltip="${c.ds}: ${c.val} từ"></div>`
    ).join('')}</div>`).join('');
    $('#heatmap').innerHTML = `<div class="heatmap-grid">${html}</div>`;
  },

  last30() {
    const days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = todayStr(d);
      const l = State.user.dailyLog[ds];
      days.push({ ds, log: l });
    }
    return days;
  },

  renderRetention() {
    if (typeof Chart === 'undefined') return;
    const days = this.last30();
    const labels = days.map(d => d.ds.slice(5));
    const goodPct = days.map(d => d.log && d.log.total ? Math.round(d.log.good / d.log.total * 100) : null);
    const againPct = days.map(d => d.log && d.log.total ? Math.round(d.log.again / d.log.total * 100) : null);
    const ctx = $('#retention-chart');
    if (this.charts.ret) this.charts.ret.destroy();
    this.charts.ret = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Nhớ tốt %', data: goodPct, borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,.1)', tension: .3, spanGaps: true, fill: true },
        { label: 'Quên (Again) %', data: againPct, borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,.1)', tension: .3, spanGaps: true, fill: true }
      ]},
      options: chartOpts({ yMax: 100 })
    });
  },

  renderForecast() {
    if (typeof Chart === 'undefined') return;
    const now = Date.now();
    const buckets = new Array(14).fill(0);
    State.cards.forEach(c => {
      if (c.state === 'new') return;
      const days = Math.floor((c.due - now) / DAY_MS);
      if (days >= 0 && days < 14) buckets[days]++;
      else if (days < 0) buckets[0]++;
    });
    const labels = buckets.map((_, i) => i === 0 ? 'Hôm nay' : `+${i}`);
    const ctx = $('#forecast-chart');
    if (this.charts.fc) this.charts.fc.destroy();
    this.charts.fc = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Từ đến hạn', data: buckets, backgroundColor: '#0EA5E9', borderRadius: 4 }] },
      options: chartOpts({})
    });
  },

  renderHardest() {
    const scored = State.cards
      .filter(c => c.reps > 0)
      .map(c => ({ card: c, word: State.wordIndex[c.wordId], rate: c.lapses / Math.max(1, c.reps) }))
      .filter(x => x.word && x.card.lapses > 0)
      .sort((a, b) => b.rate - a.rate || b.card.lapses - a.card.lapses)
      .slice(0, 10);
    if (!scored.length) {
      $('#hardest-words').innerHTML = `<div class="text-muted text-sm">Chưa có đủ dữ liệu. Hãy học thêm để xem những từ khó nhất!</div>`;
      return;
    }
    $('#hardest-words').innerHTML = scored.map((x, i) => `
      <div class="hardest-word-item">
        <div class="hw-rank">${i + 1}</div>
        <div>
          <div class="hw-word">${esc(x.word.word)}</div>
          <div class="hw-meaning">${esc(x.word.meaning_vi)}</div>
        </div>
        <div class="hw-again-rate">${Math.round(x.rate * 100)}% quên (${x.card.lapses} lần)</div>
      </div>`).join('');
  }
};

function chartOpts({ yMax }) {
  const grid = 'rgba(148,163,184,.12)', tick = '#94A3B8';
  const o = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: tick, font: { size: 11 } } } },
    scales: {
      x: { grid: { color: grid }, ticks: { color: tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { grid: { color: grid }, ticks: { color: tick }, beginAtZero: true }
    }
  };
  if (yMax) o.scales.y.max = yMax;
  return o;
}

/* ============================================================
   SETTINGS
   ============================================================ */
const Settings = {
  render() {
    const s = State.user.settings;
    const sel = (id, label, desc, opts, val) => `
      <div class="setting-row">
        <div class="setting-info"><div class="setting-label">${label}</div><div class="setting-desc">${desc}</div></div>
        <div class="setting-control"><select data-setting="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>`;
    const tog = (id, label, desc, val) => `
      <div class="setting-row">
        <div class="setting-info"><div class="setting-label">${label}</div><div class="setting-desc">${desc}</div></div>
        <div class="setting-control"><label class="toggle"><input type="checkbox" data-setting="${id}" ${val ? 'checked' : ''}><span class="toggle-slider"></span></label></div>
      </div>`;

    const daysSince = State.user.lastBackup ? Math.floor((Date.now() - State.user.lastBackup) / DAY_MS) : null;
    const backupWarn = (daysSince == null || daysSince >= 30);

    $('#view-settings').innerHTML = `
      <div class="stats-header"><div class="stats-title">Cài đặt</div><div class="stats-sub">Tùy chỉnh trải nghiệm học tập của bạn</div></div>
      <div class="settings-grid">
        <div class="settings-section">
          <div class="settings-section-title">Học tập</div>
          ${sel('newPerDay', 'Từ mới mỗi ngày', 'Số từ mới tối đa giới thiệu mỗi ngày', [[5,'5'],[10,'10'],[15,'15'],[20,'20'],[30,'30']], s.newPerDay)}
          ${sel('retention', 'Mục tiêu ghi nhớ', 'Tỉ lệ nhớ mong muốn (ảnh hưởng khoảng cách ôn)', [[0.7,'70%'],[0.8,'80%'],[0.9,'90%'],[0.95,'95%']], s.retention)}
          ${sel('mode', 'Chế độ học mặc định', 'Kiểu bài tập khi bắt đầu phiên học', [['flashcard','Thẻ ghi nhớ'],['listening','Nghe'],['multiple','Trắc nghiệm'],['fillblank','Điền từ'],['spelling','Đánh vần']], s.mode)}
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Giọng nói & Phát âm</div>
          ${sel('voiceConfidence', 'Ngưỡng tự tin giọng nói', 'Độ chính xác nhận diện tối thiểu', [[0.5,'0.5'],[0.6,'0.6'],[0.7,'0.7'],[0.8,'0.8'],[0.9,'0.9']], s.voiceConfidence)}
          ${sel('phonetic', 'Kiểu phiên âm', 'Định dạng hiển thị phiên âm', [['ipa','IPA'],['simplified','Đơn giản']], s.phonetic)}
          <div class="setting-row"><div class="setting-info"><div class="setting-label">Nhận diện giọng nói</div><div class="setting-desc">${Speech.hasRecognition ? '✅ Trình duyệt hỗ trợ' : '⚠️ Không hỗ trợ — dùng chế độ gõ'}</div></div></div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Giao diện</div>
          ${sel('theme', 'Chế độ hiển thị', 'Sáng, tối hoặc theo hệ thống', [['system','Theo hệ thống'],['light','Sáng'],['dark','Tối']], s.theme)}
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Chuỗi & Thông báo</div>
          ${tog('streakFreeze', 'Streak Freeze', 'Tự động giữ chuỗi khi lỡ 1 ngày (1 lần/tuần)', s.streakFreeze)}
          ${tog('notifications', 'Thông báo', 'Nhắc nhở học tập hằng ngày', s.notifications)}
        </div>
        <div class="settings-section backup-section">
          <div class="settings-section-title">Sao lưu & Dữ liệu</div>
          ${backupWarn ? `<div class="banner banner-warning" style="border-radius:var(--radius-sm);margin-bottom:16px">⚠️ ${daysSince == null ? 'Bạn chưa sao lưu bao giờ' : 'Đã ' + daysSince + ' ngày kể từ lần sao lưu cuối'} — nên sao lưu định kỳ!</div>` : ''}
          <div class="flex gap-3 mb-4" style="flex-wrap:wrap">
            <button class="btn btn-primary" id="set-export">📤 Xuất dữ liệu (JSON)</button>
            <button class="btn btn-ghost" id="set-import">📥 Nhập dữ liệu</button>
            <input type="file" id="set-import-file" accept=".json,application/json" style="display:none">
          </div>
          <div class="divider"></div>
          <button class="btn btn-danger" id="set-reset">🗑 Đặt lại toàn bộ dữ liệu</button>
        </div>
      </div>`;

    $$('[data-setting]').forEach(el => {
      const key = el.dataset.setting;
      const evt = el.type === 'checkbox' ? 'change' : 'change';
      el.addEventListener(evt, async () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (['retention', 'voiceConfidence'].includes(key)) v = parseFloat(v);
        if (key === 'newPerDay') v = parseInt(v, 10);
        s[key] = v;
        await saveUser();
        if (key === 'theme') App.applyTheme();
        toast('Đã lưu cài đặt', 'success');
      });
    });

    $('#set-export').addEventListener('click', () => App.exportData());
    $('#set-import').addEventListener('click', () => $('#set-import-file').click());
    $('#set-import-file').addEventListener('change', e => { if (e.target.files[0]) App.importData(e.target.files[0]); });
    $('#set-reset').addEventListener('click', () => this.resetDialog());
  },

  resetDialog() {
    Modal.open(`
      <div class="text-center">
        <div style="font-size:2.5rem;margin-bottom:12px">⚠️</div>
        <div class="modal-title">Đặt lại toàn bộ dữ liệu?</div>
        <div class="modal-sub">Tất cả từ vựng, tiến trình, XP và huy hiệu sẽ bị xóa vĩnh viễn. Nên xuất dữ liệu trước!</div>
        <div class="form-actions" style="justify-content:center">
          <button class="btn btn-ghost" onclick="Modal.close()">Hủy</button>
          <button class="btn btn-danger" id="reset-confirm">Xóa tất cả</button>
        </div>
      </div>`);
    $('#reset-confirm').addEventListener('click', async () => {
      await DB.clear('words'); await DB.clear('cards'); await DB.clear('decks'); await DB.clear('user');
      Modal.close();
      location.reload();
    });
  }
};

/* ============================================================
   APP — bootstrap, chrome, backup, SW
   ============================================================ */
const App = {
  swReg: null,

  async init() {
    await DB.open();
    if (DB.usingFallback) $('#offline-banner').textContent = '';

    await this.load();

    if (!State.user.seeded) await this.seed();

    reindex();
    this.applyTheme();
    this.bindChrome();
    this.detectVoice();
    this.bindConnectivity();
    this.bindKeyboard();
    Router.init();

    const startView = location.hash.replace('#', '') || 'dashboard';
    Router.go(startView);
    this.refreshChrome();

    this.registerSW();

    if (!State.user.onboarded) setTimeout(() => this.onboarding(), 400);
  },

  async load() {
    const [words, cards, decks, users] = await Promise.all([
      DB.getAll('words'), DB.getAll('cards'), DB.getAll('decks'), DB.getAll('user')
    ]);
    State.words = words; State.cards = cards; State.decks = decks;
    State.user = users[0] || defaultUser();
    // migrate missing fields
    State.user = Object.assign(defaultUser(), State.user);
    State.user.settings = Object.assign(defaultUser().settings, State.user.settings || {});
  },

  async seed() {
    State.decks = SEED_DECKS.slice();
    State.words = SEED_WORDS.map((w, i) => ({
      id: 'w_seed_' + i, word: w.word, meaning_vi: w.meaning_vi, ipa: w.ipa,
      example: w.example, category: w.category, tags: [], imageUrl: ''
    }));
    State.cards = State.words.map(w => newCard(w.id));
    State.user.seeded = true;
    await DB.bulkPut('decks', State.decks);
    await DB.bulkPut('words', State.words);
    await DB.bulkPut('cards', State.cards);
    await saveUser();
  },

  onboarding() {
    Modal.open(`
      <div class="onboarding">
        <div class="onboarding-emoji">📚</div>
        <div class="onboarding-title">Chào mừng đến VocabMaster!</div>
        <div class="onboarding-desc">Học từ vựng tiếng Anh hiệu quả với phương pháp lặp lại ngắt quãng (FSRS) và luyện phát âm bằng giọng nói.</div>
        <div class="feature-list">
          <div class="feature-item"><span class="feature-icon">🧠</span> Lịch ôn tập thông minh giúp nhớ lâu</div>
          <div class="feature-item"><span class="feature-icon">🎤</span> Luyện phát âm với nhận diện giọng nói</div>
          <div class="feature-item"><span class="feature-icon">🔥</span> Chuỗi ngày, XP và huy hiệu tạo động lực</div>
          <div class="feature-item"><span class="feature-icon">📴</span> Hoạt động hoàn toàn offline</div>
        </div>
        <div class="form-actions" style="justify-content:center;flex-direction:column;gap:10px">
          <button class="btn btn-primary btn-lg btn-full" id="onb-start">🚀 Bắt đầu học ngay</button>
          <button class="btn btn-ghost btn-full" id="onb-config">Cài đặt mục tiêu</button>
        </div>
      </div>`);
    const finish = async (goStudy) => {
      State.user.onboarded = true; await saveUser();
      Modal.close();
      Router.go(goStudy ? 'study' : 'settings');
    };
    $('#onb-start').addEventListener('click', () => finish(true));
    $('#onb-config').addEventListener('click', () => finish(false));
  },

  applyTheme() {
    const t = State.user.settings.theme;
    let theme = t;
    if (t === 'system') {
      theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', theme);
  },

  bindChrome() {
    $$('.nav-item, .bottom-nav-item').forEach(n => n.addEventListener('click', () => Router.go(n.dataset.view)));
    $('#modal-close-btn').addEventListener('click', () => Modal.close());
    $('#modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') Modal.close(); });
    // react to system theme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (State.user.settings.theme === 'system') this.applyTheme();
      });
    }
  },

  refreshChrome() {
    const u = State.user;
    const lp = levelProgress(u.xp);
    $('#sidebar-level').textContent = 'Level ' + lp.level;
    $('#sidebar-xp').textContent = u.xp.toLocaleString('vi-VN') + ' XP';
    $('#sidebar-xp-bar').style.width = lp.pct + '%';
    $('#sidebar-streak-count').textContent = u.streak;
    const bd = dueBreakdown();
    const badge = $('#study-badge');
    const count = bd.review + bd.learning + bd.newRemaining;
    badge.textContent = count;
    badge.setAttribute('data-count', count);
  },

  detectVoice() {
    if (!Speech.hasRecognition) $('#voice-banner').classList.remove('hidden');
  },

  bindConnectivity() {
    const update = () => $('#offline-banner').classList.toggle('hidden', navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  },

  bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.key === '?') { $('#shortcut-help').classList.toggle('hidden'); return; }
      if (State.currentView !== 'study' || !State.session) return;
      const s = State.session;
      if ((e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        if (!s.revealed && (s.mode === 'flashcard' || s.mode === 'listening' || s.mode === 'spelling')) {
          const rb = $('#reveal-btn'); if (rb) rb.click();
        }
        return;
      }
      if (s.revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const b = $(`.btn-rating[data-grade="${e.key}"]`); if (b) b.click();
      }
      if (e.key.toLowerCase() === 'p') { const w = State.wordIndex[(Study.currentCard() || {}).wordId]; if (w) Speech.speak(w.word); }
      if (e.key.toLowerCase() === 's' && !s.revealed) { s.queue.push(s.queue.shift()); Study.renderCard(); }
    });
  },

  /* ---- Backup ---- */
  exportData() {
    const backup = {
      version: 1, exportDate: new Date().toISOString(),
      words: State.words, cards: State.cards, decks: State.decks, user: State.user
    };
    downloadFile(JSON.stringify(backup, null, 2), `vocabmaster-backup-${Date.now()}.json`, 'application/json');
    State.user.lastBackup = Date.now(); saveUser();
    toast('Đã xuất dữ liệu', 'success');
  },

  importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.version || !Array.isArray(data.words)) throw new Error('File không hợp lệ');
        Modal.open(`
          <div class="modal-title">Nhập dữ liệu sao lưu</div>
          <div class="modal-sub">File chứa ${data.words.length} từ, ${(data.decks || []).length} bộ thẻ. Chọn cách nhập:</div>
          <div class="form-actions" style="flex-direction:column;gap:10px">
            <button class="btn btn-primary btn-full" id="imp-overwrite">Ghi đè (thay thế toàn bộ)</button>
            <button class="btn btn-ghost btn-full" id="imp-merge">Gộp (giữ dữ liệu hiện tại)</button>
            <button class="btn btn-ghost btn-full" onclick="Modal.close()">Hủy</button>
          </div>`);
        $('#imp-overwrite').addEventListener('click', async () => {
          await DB.clear('words'); await DB.clear('cards'); await DB.clear('decks'); await DB.clear('user');
          State.decks = data.decks || []; State.words = data.words || []; State.cards = data.cards || [];
          State.user = Object.assign(defaultUser(), data.user || {});
          await DB.bulkPut('decks', State.decks); await DB.bulkPut('words', State.words);
          await DB.bulkPut('cards', State.cards); await saveUser();
          reindex(); Modal.close(); Router.go('dashboard'); this.refreshChrome();
          toast('Đã nhập dữ liệu (ghi đè)', 'success');
        });
        $('#imp-merge').addEventListener('click', async () => {
          const existWords = new Set(State.words.map(w => normalize(w.word)));
          const addWords = [], addCards = [];
          (data.words || []).forEach(w => {
            if (!existWords.has(normalize(w.word))) {
              const nid = uid('w_'); const nw = Object.assign({}, w, { id: nid });
              addWords.push(nw); addCards.push(newCard(nid));
            }
          });
          (data.decks || []).forEach(d => { if (!State.decks.some(x => x.id === d.id)) State.decks.push(d); });
          State.words.push(...addWords); State.cards.push(...addCards);
          await DB.bulkPut('decks', State.decks); await DB.bulkPut('words', addWords); await DB.bulkPut('cards', addCards);
          reindex(); Modal.close(); Router.go('dashboard'); this.refreshChrome();
          toast(`Đã gộp ${addWords.length} từ mới`, 'success');
        });
      } catch (e) { toast('Lỗi: ' + e.message, 'error'); }
    };
    reader.readAsText(file);
  },

  /* ---- Service Worker ---- */
  registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return; // SW needs http(s)
    navigator.serviceWorker.register('sw.js').then(reg => {
      this.swReg = reg;
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            $('#update-banner').classList.remove('hidden');
          }
        });
      });
    }).catch(() => {});
  },

  updateSW() {
    $('#update-banner').classList.add('hidden');
    if (this.swReg && this.swReg.waiting) this.swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => location.reload(), 300);
  }
};

/* ---- Download helper ---- */
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============================================================
   BOOT
   ============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
