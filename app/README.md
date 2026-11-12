# HskApp (Tauri + React + TypeScript)

Bản chuyển từ app Python/PySide6 (thư mục gốc `../`). Giữ tương thích: license key, QSettings (plist/Registry),
`~/HskApp/*.db`, kho đề `.hskpack`.

## Chạy
```bash
export PATH="$HOME/.cargo/bin:$PATH"     # nếu terminal chưa nhận cargo
cd app && npm install
npm run tauri dev                         # chạy thử (bỏ qua kiểm tra license như bản Python chạy từ mã nguồn)
HSK_SMOKE=1 npm run tauri dev             # tự duyệt qua mọi tab, ghi kết quả/lỗi vào terminal
npm run tauri build -- --bundles app      # đóng gói .app (macOS)
cd src-tauri && cargo test                # test Rust (26 test)
```
Một lần duy nhất cho ffmpeg (xuất video): `../.venv/bin/python scripts/fetch_ffmpeg.py`.
Sau khi sửa dữ liệu Python (`../data/*.py`): `../.venv/bin/python scripts/export_data.py`.

## Xem giao diện không cần mở app Tauri
```bash
VITE_MOCK=1 npx vite --port 1421          # giả lập các lệnh Rust (src/devMock.ts)
# rồi mở http://localhost:1421/#flash  (đổi flash = id tab trong App.tsx), hoặc chụp ảnh bằng Chrome headless
```
Hệ thống thiết kế (màu, cỡ chữ, nút, thẻ, bảng...) nằm ở `src/App.css`; icon ở `src/components/Icon.tsx`; thành phần dùng chung ở `src/components/ui.tsx`.

## Cấu trúc
| Thư mục | Vai trò | Học gì |
|---|---|---|
| `src/` (React + TS) | Giao diện: `App.tsx` (khung), `tabs/` (mỗi tab 1 file), `components/`, `lib/` | React hooks, TypeScript |
| `src-tauri/src/` (Rust) | Việc nặng/nhạy cảm: license, SQLite, TTS, ghi âm, giải mã đề, xuất file | Rust cơ bản |
| `src/lib/api.ts` | Danh sách lệnh Rust mà giao diện gọi (`invoke`) | Cầu nối JS ↔ Rust |
| `src-tauri/src/commands.rs`, `lib.rs` | Nơi khai báo lệnh (`#[tauri::command]`) | |

Luồng một thao tác: bấm nút (TS) → `api.xxx()` → lệnh Rust → trả kết quả → React vẽ lại.

## Rust ↔ Python (đã đối chiếu)
| Phần | Rust | Kiểm chứng |
|---|---|---|
| License (Ed25519 + digit-key) | `auth/license.rs` | test với chữ ký do Python tạo; đọc license thật của máy |
| QSettings / trial | `auth/qsettings.rs`, `auth/trial.rs` | đọc đúng plist cũ (có dấu tiếng Việt) |
| SRS SM-2, thống kê | `db/srs.rs`, `db/stats.rs` | số liệu khớp 100% trên bản sao DB thật |
| Tách từ (jieba) | `seg.rs` | 0/400 câu khác Python |
| Gói đề `.hskpack` | `vault.rs`, `exam.rs` | giải mã 132 gói do Python tạo |
| Anki `.apkg` | `export.rs` | khớp từng bảng với `genanki` |
| Bộ từ tự tạo (file JSON) | `sets.rs` | cùng định dạng/thư mục `~/Documents/HskApp/BaiHoc` với Python |

## Việc còn lại / lưu ý
- **Windows chưa test** (đọc Registry, `ffmpeg.exe`, SAPI dự phòng TTS offline — code đã viết nhưng chưa biên dịch/chạy trên Windows). Cần thử trên máy Windows.
- **ffmpeg** (libx264) là GPL: phân phối kèm app phải tuân thủ GPL cho riêng binary đó.
- Nét chữ Hán lấy từ CDN jsdelivr (cần mạng), thư viện hanzi-writer đã đóng gói sẵn.
- Dữ liệu từ vựng nằm trong bundle JS (không mã hoá); phần đề thi (có giá trị) mã hoá và được cổng license Rust bảo vệ (`guard.rs`).
- Công cụ người bán (tạo key) vẫn là Python ở `../auth/`.
