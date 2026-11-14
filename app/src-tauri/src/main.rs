// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Linux: WebKitGTK ≥ 2.46 vẽ chữ bằng GPU (Skia) — trên màn hình có scale (HiDPI) chữ bị mờ.
/// Ép vẽ bằng CPU cho chữ sắc nét. Đặt sẵn biến môi trường thì giữ nguyên (để tự so sánh / tắt).
#[cfg(target_os = "linux")]
fn crisp_text() {
    if std::env::var_os("WEBKIT_SKIA_ENABLE_CPU_RENDERING").is_none() {
        // edition 2024: set_var là unsafe — an toàn vì gọi trước khi tạo luồng nào khác
        unsafe { std::env::set_var("WEBKIT_SKIA_ENABLE_CPU_RENDERING", "1") };
    }
}

#[cfg(not(target_os = "linux"))]
fn crisp_text() {}

fn main() {
    crisp_text();
    app_lib::run()
}
