# VocabMaster — Mô tả sản phẩm

Ứng dụng web học từ vựng tiếng Anh cho người Việt, chạy **100% phía trình duyệt**,
không cần server, không tốn chi phí vận hành, hoạt động **offline hoàn toàn**.

---

## 1. Tổng quan

- **Đối tượng:** người Việt học từ vựng tiếng Anh (giao tiếp, IELTS, TOEIC, chuyên ngành…).
- **Mục tiêu:** ghi nhớ từ vựng lâu dài, hiệu quả, kèm luyện phát âm — với chi phí bằng 0.
- **Nền tảng:** chạy trên Chrome/Edge (đầy đủ tính năng), Firefox/Safari (tự chuyển chế độ gõ khi không hỗ trợ giọng nói). Cài được như ứng dụng (PWA).

---

## 2. Công nghệ & Kiến trúc

- **Thuần HTML5 + CSS3 + JavaScript** (vanilla), không dùng framework, không cần build.
- **Lưu trữ:** IndexedDB (chính) + LocalStorage (dự phòng). 4 kho dữ liệu:
  - `words` — nội dung từ: `word, meaning_vi, ipa, example, category(=setId), partOfSpeech, meaning_en, cefr`
  - `cards` — trạng thái học của từng từ: `state, due, stability, difficulty, reps, lapses…`
  - `decks` — bộ/set từ: `name, topic, description, color, createdAt, source`
  - `user` — hồ sơ: `xp, level, streak, badges, dailyLog, settings…`
- **Service Worker** (`sw.js`): cache toàn bộ file tĩnh → mở lại được khi mất mạng.
- **Icon:** bộ Lucide nhúng thẳng dạng SVG (offline, đổi màu theo theme).
- **Biểu đồ:** Chart.js.
- Điều hướng bằng **hash router** (`#dashboard`, `#study`, `#library`, `#stats`, `#settings`).

Điểm cốt lõi: **"từ vựng" (words) và "tiến trình học" (cards) tách biệt** — sửa nghĩa/ví dụ
không làm mất tiến trình học.

---

## 3. Tính năng theo màn hình

### Trang chủ (Dashboard)
- Lời chào theo giờ, chuỗi ngày 🔥, tổng XP ⭐, cấp độ + thanh tiến trình.
- Số từ cần ôn hôm nay, số từ mới còn lại; nút **Bắt đầu học**.
- Tổng quan kho từ (Thành thạo / Ôn tập / Đang học / Mới) và bộ sưu tập huy hiệu.

### Học bài (Study)
- Hàng đợi thông minh: quá hạn → đang học → từ mới (tối đa 10 từ mới/ngày, 100 thẻ/phiên).
- **5 chế độ học:** Thẻ ghi nhớ, Nghe, Trắc nghiệm, Điền từ, Đánh vần.
- **Luyện phát âm bằng giọng nói** (Web Speech API) + **đọc mẫu** (TTS); tự chuyển sang **gõ chữ** nếu trình duyệt không hỗ trợ.
- Sau mỗi thẻ: tự đánh giá **Again / Hard / Good / Easy** (mỗi nút hiện sẵn thời gian ôn kế tiếp).
- Màn hình tổng kết phiên: số từ, độ chính xác, XP, lên cấp, chuỗi ngày.

### Thư viện (Library)
- **Hai chế độ xem:** "Theo set" (thẻ bộ từ) và "Tất cả từ" (bảng).
- **Quản lý set:** tạo/sửa/xóa, đặt tên–chủ đề–mô tả–màu; sắp xếp theo ngày tạo/tên/nhóm chủ đề.
- **Kho từ vựng có sẵn:** thêm bộ dựng sẵn (Oxford Essential, TOEIC Business…) chỉ 1 lần bấm.
- **Nhập/Xuất CSV**, chọn set đích khi nhập; **chọn nhiều từ** để chuyển set hoặc xóa hàng loạt.
- Tìm kiếm, lọc theo set/trạng thái; sửa/xóa/nghe từng từ.

### Học theo set (2 chế độ)
- **Học ngay:** chạy thuật toán FSRS, cập nhật lịch ôn.
- **Luyện tập:** ôn nhanh toàn bộ từ trong set, **không ảnh hưởng lịch ôn**.

### Thống kê (Stats)
- **Heatmap** hoạt động 12 tháng (kiểu GitHub).
- **Biểu đồ ghi nhớ** 30 ngày (tỉ lệ nhớ tốt vs quên).
- **Dự báo** số từ đến hạn trong 14 ngày tới.
- **Top 10 từ khó nhất** (tỉ lệ quên cao).

### Cài đặt (Settings)
- Từ mới/ngày, mục tiêu ghi nhớ, ngưỡng giọng nói, chế độ học mặc định, giao diện (Sáng/Tối/Theo hệ thống), Streak Freeze, thông báo, kiểu phiên âm.
- **Sao lưu/khôi phục** toàn bộ dữ liệu ra/từ file JSON; đặt lại dữ liệu.

---

## 4. Cơ chế lặp lại ngắt quãng (FSRS)

Ứng dụng dùng **FSRS** (Free Spaced Repetition Scheduler) — thuật toán hiện đại hơn SM-2:

- Mỗi thẻ có **độ ổn định (stability)** và **độ khó (difficulty)** riêng.
- Sau mỗi lần trả lời, hệ thống tính **xác suất còn nhớ** rồi cập nhật stability/difficulty và
  suy ra **ngày ôn kế tiếp** theo mục tiêu ghi nhớ (mặc định 90%, chỉnh được).
- **Vòng đời thẻ:** Mới → Đang học → Ôn tập → (Học lại nếu quên) → **Thành thạo** (stability > 21 ngày).
- **Learning steps** cho từ mới: hiện lại trong phiên → 10 phút → 1 ngày → giao cho FSRS.
- Tác động của nút đánh giá:
  - **Again** → đưa về học lại, giảm độ ổn định.
  - **Hard** → khoảng cách ×0.5.
  - **Good** → khoảng cách chuẩn.
  - **Easy** → khoảng cách ×1.3 + thưởng độ ổn định.

Nguyên lý: ôn một từ **ngay trước khi sắp quên** cho hiệu quả ghi nhớ cao nhất với ít công sức nhất
(dựa trên đường cong quên). App tự điều chỉnh lịch cho **từng từ riêng biệt** dựa trên cách bạn bấm nút.

---

## 5. Phương pháp & Trải nghiệm học

- **Đánh giá phát âm:** chuẩn hóa chuỗi → so khớp chính xác → nếu lệch thì đo khoảng cách Levenshtein
  (cho phép sai 1–3 ký tự tùy độ dài), kết hợp ngưỡng độ tin cậy của micro.
- **Đa dạng dạng bài** (nhìn nghĩa nói từ, nghe gõ từ, trắc nghiệm, điền câu, đánh vần) để ôn từ ở nhiều giác quan.
- **Game hóa tạo động lực:**
  - **XP:** đúng +3, sai +1, từ mới +5, hoàn thành phiên +20, giữ chuỗi +10.
  - **Cấp độ:** theo ngưỡng XP lũy tiến, có tên bậc (Người mới → Thành thạo).
  - **Chuỗi ngày:** tăng nếu ôn ≥5 thẻ hoặc học ≥3 từ mới/ngày; **Streak Freeze** tự cứu 1 lần/tuần.
  - **8 huy hiệu** + hiệu ứng pháo giấy ở các mốc.

---

## 6. Công cụ tạo dữ liệu từ vựng

- `scripts/build-wordlist.js`: sinh bộ từ (IPA + ví dụ + nghĩa tiếng Việt) từ danh sách từ tiếng Anh,
  dùng Free Dictionary API + MyMemory (dịch), có tính năng **resume** để chạy nhiều ngày.
- File kết quả đặt trong `data/*.json`, khai báo vào `BUILTIN_DECKS` để xuất hiện trong "Kho từ vựng".
- Dữ liệu dịch máy nên cần rà soát lại các từ quan trọng.

---

## 7. Luồng dữ liệu tổng quát

```
Người dùng thao tác → cập nhật State (RAM) → ghi IndexedDB (bền vững)
                    → render lại giao diện + cập nhật sidebar
```

Dữ liệu luôn nằm trên máy người dùng, không gửi đi đâu (trừ các API tra cứu/dịch khi *chủ động*
chạy script tạo bộ từ — không xảy ra trong lúc dùng app).
