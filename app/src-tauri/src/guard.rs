//! Cổng license phía Rust: các lệnh "có giá trị" (đề thi, xuất file, đọc TTS) chỉ chạy khi máy đã kích hoạt
//! hoặc còn hạn mức dùng thử hôm nay. Kiểm tra ngay trong binary đã biên dịch nên không thể qua mặt bằng cách
//! sửa giao diện JS. Kết quả được nhớ ~30 giây vì kiểm tra gọi `ioreg`/`defaults` khá nặng.
//! Bản debug (`tauri dev`) bỏ qua, như bản Python chạy từ mã nguồn.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::auth::{license, trial};

const TTL: Duration = Duration::from_secs(30);
static CACHE: Mutex<Option<(Instant, bool)>> = Mutex::new(None);

pub fn invalidate() {
    *CACHE.lock().unwrap() = None;
}

fn compute() -> bool {
    license::is_activated() || trial::has_access()
}

pub fn check() -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    let mut c = CACHE.lock().unwrap();
    if let Some((t, ok)) = *c {
        if t.elapsed() < TTL {
            return if ok { Ok(()) } else { Err(DENIED.into()) };
        }
    }
    let ok = compute();
    *c = Some((Instant::now(), ok));
    if ok { Ok(()) } else { Err(DENIED.into()) }
}

const DENIED: &str = "Chưa kích hoạt hoặc đã hết thời gian dùng thử hôm nay.";
