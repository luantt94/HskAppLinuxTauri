//! Lớp SQLite: dùng CHUNG các file `~/HskApp/*.db` với bản Python (cùng schema),
//! nên tiến độ học cũ của người dùng đọc/ghi được ngay.

pub mod srs;
pub mod stats;

use rusqlite::Connection;
use std::path::PathBuf;

/// Thư mục dữ liệu: `%LOCALAPPDATA%\HskApp` (Windows) hoặc `~/HskApp` (macOS/Linux)
/// — giống `_hskapp_dir()` của bản Python. Biến môi trường `HSKAPP_DIR` để ghi đè
/// (dùng cho test, không ảnh hưởng dữ liệu thật).
pub fn hskapp_dir() -> PathBuf {
    let dir = if let Ok(d) = std::env::var("HSKAPP_DIR") {
        PathBuf::from(d)
    } else {
        let base = std::env::var_os("LOCALAPPDATA")
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        base.join("HskApp")
    };
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn open(name: &str) -> Result<Connection, String> {
    Connection::open(hskapp_dir().join(name)).map_err(|e| e.to_string())
}

pub fn today() -> chrono::NaiveDate {
    chrono::Local::now().date_naive()
}

pub fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

#[cfg(test)]
mod real_data_tests {
    //! Chạy tay: `cargo test real_copy -- --ignored --nocapture`
    //! Sao chép DB thật của người dùng sang thư mục tạm rồi đọc thử — KHÔNG đụng bản gốc.
    use super::*;

    #[test]
    #[ignore]
    fn real_copy_of_user_dbs_is_readable() {
        let src = PathBuf::from(std::env::var("HOME").unwrap()).join("HskApp");
        let tmp = std::env::temp_dir().join("hskapp_real_copy_test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        for f in ["srs.db", "stats.db", "memrise.db"] {
            std::fs::copy(src.join(f), tmp.join(f)).unwrap();
        }
        unsafe { std::env::set_var("HSKAPP_DIR", &tmp) }; // edition 2024: set_var là unsafe

        let s = open("srs.db").unwrap();
        srs::init(&s).unwrap();
        let st = open("stats.db").unwrap();
        stats::init(&st).unwrap();
        let counts = srs::counts(&s).unwrap();
        let o = stats::overview(&st).unwrap();
        println!("srs counts = {:?}", counts);
        println!("known = {}", srs::known_zh(&s).unwrap().len());
        println!("streak = {} / longest {}, distinct today = {}, acc30 = {:?}, total = {}",
            o.streak, o.longest_streak, o.distinct_today, o.accuracy_30, o.total_reviews);
        assert!(counts.total > 0);
    }
}
