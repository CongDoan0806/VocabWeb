# Build word lists cho VocabMaster

Script `build-wordlist.js` tự sinh file dữ liệu từ vựng (kèm IPA, ví dụ, nghĩa
tiếng Việt) để bundle sẵn vào app. **User cuối không cần chạy** — chỉ chạy một
lần khi bạn muốn tạo/mở rộng một bộ từ.

## Yêu cầu
- Node.js 18+ (có `fetch` sẵn, không cần cài package)

## Bước 1 — Chuẩn bị danh sách từ

Tạo file JSON là một mảng các từ tiếng Anh, đặt trong `scripts/wordlists/`:

```json
["abandon", "ability", "able", "about", "above", "..."]
```

Nguồn danh sách miễn phí gợi ý:
- **Oxford 3000**: repo GitHub `StoneCypher/oxford_3000` (~3.847 từ, dạng flat array).
- **NGSL / Oxford 5000 / AWL**: nhiều repo mở trên GitHub.

## Bước 2 — Chạy script

```bash
node scripts/build-wordlist.js \
  --in  scripts/wordlists/oxford-3000-raw.json \
  --out data/oxford-3000-vi.json \
  --cefr B1 \
  --email you@example.com
```

Tham số:

| Cờ | Mặc định | Ý nghĩa |
|----|----------|---------|
| `--in`    | `scripts/wordlists/oxford-3000-raw.json` | File danh sách từ (JSON array hoặc 1 từ/dòng) |
| `--out`   | `data/oxford-3000-vi.json` | File kết quả |
| `--cefr`  | *(trống)* | Gán nhãn CEFR cho cả bộ (A1..C2) |
| `--email` | *(trống)* | Email cho MyMemory để nâng hạn dịch |
| `--delay` | `350` | Nghỉ giữa các từ (ms), tránh rate limit |
| `--limit` | `0` | Chỉ xử lý N từ đầu (0 = tất cả) |

Nguồn API dùng (đều miễn phí, không cần API key):
- **Free Dictionary API** — IPA, từ loại, định nghĩa EN, ví dụ.
- **MyMemory API** — dịch định nghĩa EN → tiếng Việt (giới hạn ~5.000 ký tự/ngày,
  có email ~50.000/ngày).

## Bước 3 — Tính năng chống gián đoạn

- Script **tự resume**: nếu chạy lại, nó bỏ qua các từ đã có trong `--out`.
  → Có thể chia làm nhiều ngày để không vượt hạn dịch.
- Ghi file định kỳ mỗi 20 từ, không lo mất tiến trình.

## Bước 4 — Đăng ký bộ mới trong app

Mở `app.js`, thêm một mục vào mảng `BUILTIN_DECKS`:

```js
{
  id: 'oxford-3000',
  name: 'Oxford 3000',
  topic: 'Tổng quát',
  description: '3.000 từ quan trọng nhất tiếng Anh (A1–B2)',
  level: 'A1–B2',
  file: 'data/oxford-3000-vi.json',
  color: '#0EA5E9'
}
```

App sẽ tự đọc `wordCount` khi import, nên không cần khai báo số lượng.

> ⚠️ Nghĩa tiếng Việt do dịch máy — nên rà lại các từ quan trọng/đa nghĩa
> trước khi phát hành.
