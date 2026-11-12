# HskApp — bản Windows (Tauri)

Bản sao của `../hskAppMacTauri/app`. **Chỉ sửa code ở bản Mac**, rồi đồng bộ sang đây (xem cuối file).
Code riêng cho Windows đã nằm sẵn trong `app/` (`#[cfg(windows)]`): đọc Registry cho license/cài đặt, `ffmpeg.exe`, phát âm offline SAPI.

## Chuẩn bị máy Windows (một lần)
1. **Visual Studio Build Tools** (chọn workload "Desktop development with C++").
2. **Rust**: https://rustup.rs (toolchain `stable-x86_64-pc-windows-msvc`).
3. **Node.js 18+** (đã thử với 18.17; dùng Vite 6).
4. **WebView2 Runtime** (Windows 10/11 mới thường có sẵn).
5. **ffmpeg cho xuất video:** tải `ffmpeg.exe` (bản có libx264), đặt tên
   `app\src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe`
   (hoặc `pip install imageio-ffmpeg` rồi chạy `python app\scripts\fetch_ffmpeg.py`).
   Lưu ý: ffmpeg có libx264 là GPL — phân phối kèm app phải tuân thủ GPL cho riêng file đó.

## Chạy / build
```powershell
cd app
npm install
npm run tauri dev                          # chạy thử (bỏ qua kiểm tra license)
npm run tauri build -- --bundles nsis      # bộ cài .exe (đơn giản nhất)
# hoặc: --bundles msi  (cần WiX, Tauri tự tải)
cd src-tauri; cargo test                   # test Rust
```
Kết quả nằm ở `app\src-tauri\target\release\bundle\`.

## Việc cần kiểm tra lần đầu trên Windows (chưa ai chạy thử)
- License: mã máy lấy từ `MachineGuid` (Registry) — thử với một key thật của khách; lưu ở `HKCU\Software\HskApp\HskApp`.
- Phát âm offline SAPI khi mất mạng; xuất video (ffmpeg.exe); ghi âm micro.
- Thư mục dữ liệu: `%LOCALAPPDATA%\HskApp` (các file `*.db`), bộ từ tự tạo: `Documents\HskApp\BaiHoc`.
- Kho đề: chọn thư mục chứa `.hskpack` ở tab Giải đề.
- Chưa ký code nên SmartScreen sẽ cảnh báo.

## Đồng bộ từ bản Mac (sau khi sửa xong ở Mac)
```bash
cd /Users/luantran/project/finalapp
rsync -a --delete \
  --exclude node_modules --exclude 'src-tauri/target' --exclude 'src-tauri/binaries' \
  --exclude '/dist' --exclude '.DS_Store' \
  hskAppMacTauri/app/ hskAppWinTauri/app/
```
`--delete` xoá file ở bản Windows mà bản Mac không còn; `--exclude` giữ nguyên `node_modules`, `target` và ffmpeg của Windows.
