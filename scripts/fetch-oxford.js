#!/usr/bin/env node
/**
 * fetch-oxford.js — tải danh sách từ Oxford (chỉ danh sách từ thô, chưa có nghĩa)
 * từ các repo GitHub mở, lọc trùng, ghi ra scripts/wordlists/oxford-3000-raw.json.
 *
 * Dùng:  node scripts/fetch-oxford.js
 * Sau đó chạy build-wordlist.js để thêm IPA + ví dụ + nghĩa tiếng Việt.
 */
const fs = require('fs');
const path = require('path');

const SOURCES = [
  'https://raw.githubusercontent.com/sapbmw/The-Oxford-3000/master/The_Oxford_3000.txt',
  'https://raw.githubusercontent.com/nihalsimsek/oxford-3000/master/oxford-3000.txt',
  'https://raw.githubusercontent.com/mgrider/oxford-3000/master/oxford-3000.txt'
];

const OUT = path.join('scripts', 'wordlists', 'oxford-3000-raw.json');

function clean(text) {
  return text
    .split(/\r?\n/)
    .map(s => s.trim().toLowerCase())
    // bỏ ghi chú, số thứ tự, ký hiệu loại từ; chỉ giữ từ/cụm từ chữ cái
    .map(s => s.replace(/\s*\(.*?\)\s*/g, '').replace(/[.,;:]+$/, '').trim())
    .filter(s => /^[a-z][a-z\- ]*$/.test(s))
    .filter(s => s.length > 1);
}

(async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  for (const url of SOURCES) {
    try {
      process.stdout.write(`Thử: ${url}\n`);
      const res = await fetch(url);
      if (!res.ok) { console.log(`  → HTTP ${res.status}, bỏ qua`); continue; }
      const text = await res.text();
      const words = Array.from(new Set(clean(text)));
      if (words.length >= 1000) {
        fs.writeFileSync(OUT, JSON.stringify(words));
        console.log(`✅ Lấy được ${words.length} từ → ${OUT}`);
        console.log(`   Mẫu: ${words.slice(0, 8).join(', ')} ...`);
        return;
      }
      console.log(`  → chỉ ${words.length} từ, thử nguồn khác`);
    } catch (e) {
      console.log(`  → lỗi: ${e.message}`);
    }
  }
  console.log('❌ Không tải được từ các nguồn trên. Hãy tải thủ công (xem hướng dẫn).');
  process.exit(1);
})();
