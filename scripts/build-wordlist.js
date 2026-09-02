#!/usr/bin/env node
/**
 * build-wordlist.js — chạy OFFLINE (một lần trước khi release) để tạo file
 * data/<name>.json cho VocabMaster. User KHÔNG cần chạy cái này.
 *
 * Quy trình:
 *   danh sách từ tiếng Anh  →  Free Dictionary API (IPA + ví dụ + nghĩa EN)
 *                           →  MyMemory API (dịch nghĩa sang tiếng Việt)
 *                           →  ghi ra data/<name>.json
 *
 * Cách dùng:
 *   1) Chuẩn bị 1 file danh sách từ, mỗi từ 1 dòng hoặc 1 mảng JSON. Ví dụ:
 *        scripts/wordlists/oxford-3000-raw.json  = ["abandon","ability", ...]
 *   2) node scripts/build-wordlist.js --in scripts/wordlists/oxford-3000-raw.json --out data/oxford-3000-vi.json --cefr B1
 *
 * Tính năng:
 *   - Tự động RESUME: nếu file --out đã có, bỏ qua các từ đã xử lý (chạy nhiều ngày được).
 *   - Tôn trọng rate limit (mặc định 350ms/từ). MyMemory free ~5000 ký tự/ngày;
 *     thêm email qua --email để nâng hạn (~50000 ký tự/ngày).
 *
 * Yêu cầu: Node 18+ (có sẵn global fetch). Không cần cài package nào.
 */

const fs = require('fs');
const path = require('path');

/* ---------- Parse arguments ---------- */
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const IN_FILE   = arg('in', 'scripts/wordlists/oxford-3000-raw.json');
const OUT_FILE  = arg('out', 'data/oxford-3000-vi.json');
const CEFR      = arg('cefr', '');
const EMAIL     = arg('email', '');                 // MyMemory: nâng hạn dịch
const DELAY_MS  = parseInt(arg('delay', '350'), 10);
const LIMIT     = parseInt(arg('limit', '0'), 10);  // 0 = không giới hạn

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- Load word list (JSON array hoặc text 1 từ/dòng) ---------- */
function loadWords(file) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (raw.startsWith('[')) return JSON.parse(raw);
  return raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

/* ---------- Fetch helpers ---------- */
async function getDictionary(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const entry = Array.isArray(data) ? data[0] : null;
    if (!entry) return null;
    const ipa = entry.phonetic
      || (entry.phonetics || []).map(p => p.text).find(Boolean)
      || '';
    const meaning = (entry.meanings || [])[0] || {};
    const def = (meaning.definitions || [])[0] || {};
    return {
      ipa,
      partOfSpeech: meaning.partOfSpeech || '',
      meaning_en: def.definition || '',
      example: def.example || ''
    };
  } catch { return null; }
}

async function translateVI(text) {
  if (!text) return '';
  try {
    let url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`;
    if (EMAIL) url += `&de=${encodeURIComponent(EMAIL)}`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.responseData && data.responseData.translatedText) || '';
  } catch { return ''; }
}

/* ---------- Main ---------- */
(async function main() {
  if (!fs.existsSync(IN_FILE)) {
    console.error(`❌ Không tìm thấy file danh sách: ${IN_FILE}`);
    console.error('   Tạo 1 file JSON mảng các từ, ví dụ: ["abandon","ability",...]');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  let words = loadWords(IN_FILE);
  if (LIMIT > 0) words = words.slice(0, LIMIT);

  // Resume: đọc kết quả đã có
  let result = [];
  const done = new Set();
  if (fs.existsSync(OUT_FILE)) {
    try {
      result = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      result.forEach(r => done.add(r.word.toLowerCase()));
      console.log(`↩ Resume: đã có ${result.length} từ, tiếp tục...`);
    } catch { result = []; }
  }

  let processed = 0;
  for (const raw of words) {
    const word = String(raw).trim().toLowerCase();
    if (!word || done.has(word)) continue;

    const dict = await getDictionary(word);
    const meaningEN = dict ? dict.meaning_en : '';
    const meaningVI = await translateVI(meaningEN || word);

    result.push({
      word,
      ipa: dict ? dict.ipa : '',
      partOfSpeech: dict ? dict.partOfSpeech : '',
      meaning_vi: meaningVI,
      meaning_en: meaningEN,
      example: dict ? dict.example : '',
      cefr: CEFR
    });
    done.add(word);
    processed++;

    // Hiển thị tiến trình TỪNG TỪ để biết script vẫn đang chạy
    const flag = meaningVI ? '✓' : '⚠ chưa dịch được';
    console.log(`  [${result.length}/${words.length}] ${word}  ${flag}`);

    // Ghi định kỳ để không mất tiến trình nếu dừng giữa chừng
    if (processed % 20 === 0) {
      fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
      console.log(`  💾 Đã lưu ${result.length} từ...`);
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`✅ Hoàn tất: ${result.length} từ → ${OUT_FILE}`);
  console.log('   Nhớ kiểm tra lại vài nghĩa tiếng Việt do dịch máy có thể sai ngữ cảnh.');
})();
