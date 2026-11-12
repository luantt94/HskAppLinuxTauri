//! Thư viện bộ từ vựng tự tạo ("Bộ từ của bạn") — port của core/self_study_lib.py.
//! Mỗi bộ là 1 file JSON trong `~/Documents/HskApp/BaiHoc` (tên file bỏ đuôi = tên hiển thị), cùng định dạng
//! với bản Python: mảng object {zh, vi, pinyin, example_cn, example_vi, pinyin_sentence}.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};

use crate::db::srs::Word;

pub const FAVORITES_NAME: &str = "Yêu thích";

pub fn lib_dir() -> PathBuf {
    let dir = if let Ok(d) = std::env::var("HSK_SETS_DIR") {
        PathBuf::from(d) // ghi đè khi test
    } else {
        let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from).unwrap_or_default();
        home.join("Documents").join("HskApp").join("BaiHoc")
    };
    let _ = std::fs::create_dir_all(&dir);
    dir
}

#[derive(Serialize)]
pub struct SetInfo {
    pub name: String,
    pub path: String,
    pub count: usize,
}

/// Chỉ cho thao tác với file .json NẰM TRONG thư mục thư viện (chặn `..` và đường dẫn ngoài).
fn checked(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    let dir = lib_dir();
    let ok = p.starts_with(&dir)
        && p.extension().is_some_and(|e| e.eq_ignore_ascii_case("json"))
        && !p.components().any(|c| matches!(c, Component::ParentDir));
    if ok { Ok(p) } else { Err("Đường dẫn không nằm trong thư viện bộ từ".into()) }
}

pub fn word_to_json(w: &Word) -> Value {
    json!({ "zh": w.zh, "vi": w.vi, "pinyin": w.pinyin, "example_cn": w.ex_cn, "example_vi": w.ex_vi, "pinyin_sentence": w.py_sent })
}

pub fn words_from_json(text: &str) -> Result<Vec<Word>, String> {
    let v: Value = serde_json::from_str(text).map_err(|e| format!("JSON không hợp lệ: {e}"))?;
    let arr = v.as_array().ok_or("Dữ liệu gốc phải là một mảng")?;
    let s = |x: Option<&Value>| x.and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let mut out = vec![];
    for e in arr {
        let w = if let Some(o) = e.as_object() {
            let g = |keys: &[&str]| keys.iter().find_map(|k| o.get(*k)).map(|v| s(Some(v))).unwrap_or_default();
            Word { zh: g(&["zh", "hanzi", "word"]), vi: g(&["vi", "meaning", "nghia"]), pinyin: g(&["pinyin", "pinyin_word"]),
                   ex_cn: g(&["example_cn"]), ex_vi: g(&["example_vi"]), py_sent: g(&["pinyin_sentence"]) }
        } else if let Some(a) = e.as_array() {
            Word { zh: s(a.first()), vi: s(a.get(1)), pinyin: s(a.get(2)), ex_cn: s(a.get(3)), ex_vi: s(a.get(4)), py_sent: s(a.get(5)) }
        } else { continue };
        if !w.zh.is_empty() { out.push(w); }
    }
    Ok(out)
}

fn write_words(path: &Path, words: &[Word]) -> Result<(), String> {
    let arr: Vec<Value> = words.iter().map(word_to_json).collect();
    let text = serde_json::to_string_pretty(&arr).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

fn slugify(name: &str) -> String {
    let n: String = name.chars().filter(|c| !r#"\/:*?"<>|"#.contains(*c)).collect::<String>().trim().to_string();
    if n.is_empty() { format!("Bo tu hoc {}", chrono::Local::now().format("%Y%m%d_%H%M%S")) } else { n }
}

fn unique_path(base: &str) -> PathBuf {
    let dir = lib_dir();
    let p = dir.join(format!("{base}.json"));
    if !p.exists() { return p; }
    (2..).map(|i| dir.join(format!("{base} ({i}).json"))).find(|p| !p.exists()).unwrap()
}

/// Tạo bộ "Yêu thích" rỗng đúng 1 lần (cờ QSettings) — xoá đi thì không tự tạo lại.
fn ensure_default() {
    use crate::auth::qsettings as q;
    if q::get("SelfStudy/default_set_created").as_deref() == Some("true") { return; }
    q::set_str("SelfStudy/default_set_created", "true");
    let p = lib_dir().join(format!("{FAVORITES_NAME}.json"));
    if !p.exists() { let _ = std::fs::write(&p, "[]"); }
}

pub fn list() -> Vec<SetInfo> {
    ensure_default();
    let Ok(rd) = std::fs::read_dir(lib_dir()) else { return vec![] };
    let mut v: Vec<SetInfo> = rd.filter_map(|e| e.ok()).map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("json")))
        .map(|p| SetInfo {
            name: p.file_stem().unwrap().to_string_lossy().to_string(),
            count: std::fs::read_to_string(&p).ok().and_then(|t| words_from_json(&t).ok()).map(|w| w.len()).unwrap_or(0),
            path: p.to_string_lossy().to_string(),
        }).collect();
    v.sort_by_key(|s| s.name.to_lowercase());
    v
}

pub fn read(path: &str) -> Result<Vec<Word>, String> {
    words_from_json(&std::fs::read_to_string(checked(path)?).map_err(|e| e.to_string())?)
}

/// Lưu bộ mới (tên trùng thì thêm " (2)") hoặc ghi đè `path`. Trả về đường dẫn file.
pub fn save(name: &str, words: &[Word], path: Option<&str>) -> Result<String, String> {
    let p = match path { Some(p) => checked(p)?, None => unique_path(&slugify(name)) };
    write_words(&p, words)?;
    Ok(p.to_string_lossy().to_string())
}

/// "added" | "exists" | "error". Không ghi đè file hỏng (đọc không ra mà không phải mảng rỗng).
pub fn add_word(path: &str, word: &Word) -> Result<&'static str, String> {
    let p = checked(path)?;
    let mut items = vec![];
    if p.exists() {
        let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
        match words_from_json(&text) {
            Ok(w) => items = w,
            Err(_) => return Ok("error"),
        }
        if items.is_empty() && serde_json::from_str::<Value>(&text).ok() != Some(json!([])) { return Ok("error"); }
    }
    if items.iter().any(|w| w.zh == word.zh) { return Ok("exists"); }
    items.push(word.clone());
    write_words(&p, &items)?;
    Ok("added")
}

pub fn delete(path: &str) -> Result<(), String> {
    std::fs::remove_file(checked(path)?).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(zh: &str) -> Word { Word { zh: zh.into(), vi: "x".into(), ..Default::default() } }

    /// Một test duy nhất vì dùng biến môi trường chung cho cả tiến trình.
    #[test]
    fn library_roundtrip_and_safety() {
        let dir = std::env::temp_dir().join(format!("hsk_sets_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        unsafe { std::env::set_var("HSK_SETS_DIR", &dir) };

        let p = save("Bộ thử/nghiệm:1", &[w("爱")], None).unwrap();
        assert!(p.ends_with("Bộ thửnghiệm1.json"), "{p}");
        let p2 = save("Bộ thử/nghiệm:1", &[w("好")], None).unwrap();
        assert!(p2.ends_with("Bộ thửnghiệm1 (2).json"));
        assert_eq!(read(&p).unwrap()[0].zh, "爱");
        assert_eq!(add_word(&p, &w("你")).unwrap(), "added");
        assert_eq!(add_word(&p, &w("你")).unwrap(), "exists");
        assert_eq!(read(&p).unwrap().len(), 2);
        // file hỏng không bị ghi đè
        let bad = dir.join("hong.json");
        std::fs::write(&bad, "khong phai json").unwrap();
        assert_eq!(add_word(bad.to_str().unwrap(), &w("a")).unwrap(), "error");
        assert_eq!(std::fs::read_to_string(&bad).unwrap(), "khong phai json");
        // định dạng khớp bản Python (khoá snake_case)
        let text = std::fs::read_to_string(&p).unwrap();
        assert!(text.contains("\"example_cn\"") && text.contains("\"pinyin_sentence\""));
        // chặn đường dẫn ngoài thư viện / thoát bằng ..
        assert!(read("/etc/passwd").is_err());
        assert!(read(&format!("{}/../x.json", dir.display())).is_err());
        assert!(delete("/tmp/whatever.json").is_err());
        assert_eq!(list().iter().filter(|s| s.name.starts_with("Bộ thử")).count(), 2);
        delete(&p2).unwrap();
        assert!(!Path::new(&p2).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_python_style_and_list_style() {
        let v = words_from_json(r#"[{"zh":"你好","vi":"chào","pinyin":"nǐ hǎo","example_cn":"你好。"},["谢谢","cảm ơn","xièxie"],{"hanzi":"再见"},{"vi":"thiếu zh"}]"#).unwrap();
        assert_eq!(v.len(), 3);
        assert_eq!((v[0].ex_cn.as_str(), v[1].pinyin.as_str(), v[2].zh.as_str()), ("你好。", "xièxie", "再见"));
    }
}
