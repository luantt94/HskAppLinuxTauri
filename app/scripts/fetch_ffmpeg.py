"""Chép ffmpeg tĩnh (từ gói imageio-ffmpeg của bản Python) vào src-tauri/binaries/ với tên theo target triple
mà Tauri yêu cầu cho sidecar. Chạy từ thư mục gốc:  .venv/bin/python app/scripts/fetch_ffmpeg.py
Windows: tải ffmpeg.exe (bản có libx264) rồi đặt tên  ffmpeg-x86_64-pc-windows-msvc.exe  trong cùng thư mục.
LƯU Ý GIẤY PHÉP: bản có libx264 là GPL — nếu phân phối kèm app phải tuân thủ GPL cho riêng binary ffmpeg (cung cấp nguồn)."""
import glob, os, platform, shutil, sys
import imageio_ffmpeg

src = imageio_ffmpeg.get_ffmpeg_exe()
triples = {("Darwin", "arm64"): "aarch64-apple-darwin", ("Darwin", "x86_64"): "x86_64-apple-darwin",
           ("Windows", "AMD64"): "x86_64-pc-windows-msvc", ("Linux", "x86_64"): "x86_64-unknown-linux-gnu"}
triple = triples[(platform.system(), platform.machine())]
ext = ".exe" if platform.system() == "Windows" else ""
dst_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src-tauri", "binaries")
os.makedirs(dst_dir, exist_ok=True)
dst = os.path.join(dst_dir, f"ffmpeg-{triple}{ext}")
shutil.copy2(src, dst)
os.chmod(dst, 0o755)
print("OK", dst, os.path.getsize(dst) // 1024 // 1024, "MB")
