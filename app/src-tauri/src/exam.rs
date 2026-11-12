//! Kho đề thi HSK: quét thư mục (.hskpack mã hoá hoặc thư mục thô), đọc data.json, media, và tiến độ đã làm.
//! Port của core/exam_bank.py. Thư mục đề do người dùng chọn (`exam/data_folder` trong QSettings, như bản Python)
//! — không đóng gói kèm app vì rất nặng (~2GB).

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use crate::vault::{Pack, PACK_EXT};

#[derive(Serialize, Clone, Debug)]
pub struct ExamInfo {
    pub level: i64,
    pub name: String,
    pub title: String,
    pub path: String,
}

static PACKS: Mutex<Option<HashMap<PathBuf, Arc<Pack>>>> = Mutex::new(None);

fn pack(path: &Path) -> Result<Arc<Pack>, String> {
    let mut guard = PACKS.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    if let Some(p) = map.get(path) {
        return Ok(p.clone());
    }
    let p = Arc::new(Pack::open(path)?);
    map.insert(path.to_path_buf(), p.clone());
    Ok(p)
}

/// Bỏ nhãn nguồn "(STUDY4)" khỏi tiêu đề hiển thị.
pub fn clean_title(title: &str) -> String {
    let t = title.replace("(STUDY4)", "").replace("( STUDY4 )", "");
    t.trim().to_string()
}

fn level_from(text: &str) -> Option<i64> {
    let i = text.to_uppercase().find("HSK")?;
    text[i + 3..].trim_start().chars().next()?.to_digit(10).filter(|d| (1..=6).contains(d)).map(|d| d as i64)
}

fn sort_key(info: &ExamInfo) -> (i64, String) {
    let n = info.name.rsplit(|c: char| !c.is_ascii_digit()).find(|s| !s.is_empty()).and_then(|s| s.parse().ok()).unwrap_or(0);
    (n, info.name.clone())
}

pub fn scan(root: &Path) -> Vec<ExamInfo> {
    let Ok(rd) = std::fs::read_dir(root) else { return vec![] };
    let mut names: Vec<_> = rd.filter_map(|e| e.ok()).map(|e| e.path()).collect();
    names.sort();
    let mut out = vec![];
    for full in names {
        let file_name = full.file_name().unwrap().to_string_lossy().to_string();
        if file_name.ends_with(PACK_EXT) {
            let Ok(p) = pack(&full) else { continue };
            let name = p.meta.name.clone().unwrap_or_else(|| file_name[..file_name.len() - PACK_EXT.len()].to_string());
            let title = clean_title(p.meta.title.as_deref().unwrap_or(&name));
            let Some(level) = p.meta.level else { continue };
            out.push(ExamInfo { level, name, title, path: full.to_string_lossy().to_string() });
            continue;
        }
        let data = full.join("data.json");
        if !data.is_file() {
            continue;
        }
        let mut title = file_name.clone();
        let mut level = level_from(&file_name);
        if let Ok(v) = std::fs::read_to_string(&data).and_then(|s| serde_json::from_str::<serde_json::Value>(&s).map_err(Into::into)) {
            if let Some(t) = v["title"].as_str().filter(|t| !t.trim().is_empty()) {
                title = clean_title(t);
                level = level.or_else(|| level_from(&title));
            }
        }
        if let Some(level) = level {
            out.push(ExamInfo { level, name: file_name, title, path: full.to_string_lossy().to_string() });
        }
    }
    out.sort_by(|a, b| (a.level, sort_key(a)).cmp(&(b.level, sort_key(b))));
    out
}

/// Đọc 1 file (vd "data.json", "audio/q1.mp3") từ gói mã hoá (giải mã trong bộ nhớ) hoặc thư mục thô.
pub fn read_file(exam_path: &str, rel: &str) -> Result<Option<Vec<u8>>, String> {
    // chặn đường dẫn thoát khỏi thư mục đề
    if rel.contains("..") || rel.starts_with('/') || rel.contains('\\') {
        return Err("Đường dẫn không hợp lệ".into());
    }
    let p = Path::new(exam_path);
    if exam_path.ends_with(PACK_EXT) {
        return pack(p)?.read(rel);
    }
    match std::fs::read(p.join(rel)) {
        Ok(b) => Ok(Some(b)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn media_exists(exam_path: &str, rel: &str) -> bool {
    if exam_path.ends_with(PACK_EXT) {
        return pack(Path::new(exam_path)).map(|p| p.has(rel)).unwrap_or(false);
    }
    Path::new(exam_path).join(rel).is_file()
}

pub fn b64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_and_levels() {
        assert_eq!(clean_title("HSK 1 - Practice Test 1 (STUDY4)"), "HSK 1 - Practice Test 1");
        assert_eq!(level_from("HSK3_Practice_Test_4"), Some(3));
        assert_eq!(level_from("HSK 5 - X"), Some(5));
        assert_eq!(level_from("HSK9"), None);
    }

    #[test]
    fn rejects_path_escape() {
        assert!(read_file("/tmp", "../etc/passwd").is_err());
    }

    /// EXAM_DIR=<thư mục gói> cargo test real_scan -- --ignored --nocapture
    #[test]
    #[ignore]
    fn real_scan_lists_all_packs() {
        let v = scan(Path::new(&std::env::var("EXAM_DIR").expect("đặt EXAM_DIR")));
        println!("{} bộ đề; đầu: {:?}", v.len(), v.first());
        let mut per = std::collections::BTreeMap::new();
        for i in &v { *per.entry(i.level).or_insert(0) += 1; }
        println!("theo cấp: {per:?}");
        assert!(!v.is_empty());
    }
}
