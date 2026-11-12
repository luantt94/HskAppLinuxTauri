//! Các lệnh Tauri mà giao diện React gọi qua `invoke("tên_lệnh", {...})`.
//! Mỗi lệnh mở kết nối SQLite riêng (rẻ, và tránh phải giữ khoá chung).

use serde::Serialize;

use crate::db::{self, srs, stats};

type R<T> = Result<T, String>;

fn e<T>(r: rusqlite::Result<T>) -> R<T> {
    r.map_err(|x| x.to_string())
}

fn srs_conn() -> R<rusqlite::Connection> {
    let c = db::open("srs.db")?;
    e(srs::init(&c))?;
    Ok(c)
}

fn stats_conn() -> R<rusqlite::Connection> {
    let c = db::open("stats.db")?;
    e(stats::init(&c))?;
    Ok(c)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressOverview {
    #[serde(flatten)]
    stats: stats::Overview,
    srs: srs::Counts,
    /// Chữ Hán đã thuộc (frontend tự tính % theo từng cấp HSK từ danh sách này)
    known_zh: Vec<String>,
}

#[tauri::command]
pub fn progress_overview() -> R<ProgressOverview> {
    let s = srs_conn()?;
    let st = stats_conn()?;
    Ok(ProgressOverview {
        stats: e(stats::overview(&st))?,
        srs: e(srs::counts(&s))?,
        known_zh: e(srs::known_zh(&s))?,
    })
}

#[tauri::command]
pub fn srs_add_words(words: Vec<srs::Word>) -> R<usize> {
    e(srs::add_words(&srs_conn()?, &words))
}

#[tauri::command]
pub fn srs_due_cards(limit: Option<i64>) -> R<Vec<srs::SrsCard>> {
    e(srs::due_cards(&srs_conn()?, limit.unwrap_or(300)))
}

#[tauri::command]
pub fn srs_get_card(zh: String) -> R<Option<srs::SrsCard>> {
    e(srs::get_card(&srs_conn()?, &zh))
}

#[tauri::command]
pub fn srs_due_dates() -> R<std::collections::HashMap<String, String>> {
    e(srs::due_dates(&srs_conn()?))
}

/// Số ngày sẽ gặp lại nếu chấm `grade` (hiện trên nút Lại/Khó/Tốt/Dễ); None nếu chưa có thẻ.
#[tauri::command]
pub fn srs_preview(zh: String, grade: i32) -> R<Option<f64>> {
    let c = srs_conn()?;
    Ok(e(srs::get_card(&c, &zh))?.map(|card| srs::preview_interval_days(&card, grade)))
}

/// Chấm 1 từ (0=Lại,1=Khó,2=Tốt,3=Dễ). Im lặng bỏ qua nếu từ chưa có thẻ.
#[tauri::command]
pub fn srs_review(zh: String, grade: i32, force_days: Option<f64>) -> R<()> {
    let c = srs_conn()?;
    if e(srs::get_card(&c, &zh))?.is_none() {
        return Ok(());
    }
    e(srs::review(&c, &zh, grade, force_days))?;
    e(stats::log_review(&stats_conn()?, "srs", &zh, Some(grade != srs::AGAIN)))
}

/// Game chỉ có đúng/sai: đúng = Tốt, sai = Lại.
#[tauri::command]
pub fn srs_report(zh: String, correct: bool) -> R<()> {
    srs_review(zh, if correct { srs::GOOD } else { srs::AGAIN }, None)
}

#[tauri::command]
pub fn srs_reset_words(zh_list: Vec<String>) -> R<usize> {
    e(srs::reset_words(&srs_conn()?, &zh_list))
}

#[tauri::command]
pub fn srs_adjust_due(word: srs::Word, delta_days: i64) -> R<Option<i64>> {
    e(srs::adjust_due_date(&srs_conn()?, &word, delta_days))
}

/// Chỉ dùng khi phát triển: đẩy lỗi JavaScript về terminal chạy `tauri dev`.
#[tauri::command]
pub fn js_log(level: String, msg: String) {
    eprintln!("[js:{level}] {msg}");
}

// ---------------- Đề thi ----------------
use crate::exam;

fn exam_root(root: Option<String>) -> Option<String> {
    root.filter(|r| !r.trim().is_empty()).or_else(|| crate::auth::qsettings::get("exam/data_folder"))
}

/// Quét thư mục đề. Không truyền `root` thì dùng thư mục đã lưu (`exam/data_folder`, cùng khoá bản Python).
#[tauri::command]
pub async fn exam_scan(root: Option<String>) -> Result<(String, Vec<exam::ExamInfo>), String> {
    crate::guard::check()?;
    let root = exam_root(root).ok_or("Chưa chọn thư mục chứa bộ đề")?;
    let r2 = root.clone();
    let list = tauri::async_runtime::spawn_blocking(move || exam::scan(std::path::Path::new(&r2)))
        .await
        .map_err(|e| e.to_string())?;
    Ok((root, list))
}

#[tauri::command]
pub async fn exam_set_folder(path: String) -> bool {
    crate::auth::qsettings::set_str("exam/data_folder", &path)
}

/// Nội dung data.json của 1 bộ đề (chuỗi JSON).
#[tauri::command]
pub async fn exam_load(path: String) -> Result<String, String> {
    crate::guard::check()?;
    tauri::async_runtime::spawn_blocking(move || {
        let b = exam::read_file(&path, "data.json")?.ok_or("Thiếu data.json")?;
        String::from_utf8(b).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// File media (base64). `sub` = "audio" | "images". None nếu không có.
#[tauri::command]
pub async fn exam_media(path: String, sub: String, name: String) -> Result<Option<String>, String> {
    crate::guard::check()?;
    if sub != "audio" && sub != "images" {
        return Err("sub không hợp lệ".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        Ok(exam::read_file(&path, &format!("{sub}/{name}"))?.map(|b| exam::b64(&b)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn exam_media_exists(path: String, sub: String, name: String) -> bool {
    exam::media_exists(&path, &format!("{sub}/{name}"))
}

fn exam_progress_path() -> std::path::PathBuf {
    db::hskapp_dir().join("exam_progress.json")
}

#[tauri::command]
pub fn exam_progress_get() -> String {
    std::fs::read_to_string(exam_progress_path()).unwrap_or_else(|_| "{}".into())
}

#[tauri::command]
pub fn exam_progress_set(json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?; // chỉ ghi JSON hợp lệ
    std::fs::write(exam_progress_path(), json).map_err(|e| e.to_string())
}

// ---------------- Xuất flashcard (Anki / PDF / Video) ----------------
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Emitter;

static EXPORT_CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
struct Progress {
    current: usize,
    total: usize,
}

fn decode(b64: &str) -> R<Vec<u8>> {
    B64.decode(b64).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_cancel() {
    EXPORT_CANCEL.store(true, Ordering::SeqCst);
}

/// Giọng đọc cho từ: (nội dung, đuôi file). Edge TTS, rơi về SAPI trên Windows khi mất mạng.
fn audio_for(zh: &str) -> Option<(Vec<u8>, &'static str)> {
    if zh.trim().is_empty() {
        return None;
    }
    crate::tts::synthesize_any(zh, crate::tts::VOICE_ZH).ok()
}

/// Xuất .apkg (Anki) kèm giọng đọc từng từ. Phát sự kiện "export-progress".
#[tauri::command]
pub async fn export_anki(app: tauri::AppHandle, path: String, words: Vec<srs::Word>, scope_label: String) -> R<()> {
    crate::guard::check()?;
    EXPORT_CANCEL.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let total = words.len();
        let mut audio = Vec::with_capacity(total);
        for (i, w) in words.iter().enumerate() {
            if EXPORT_CANCEL.load(Ordering::SeqCst) {
                return Err("Đã huỷ".to_string());
            }
            audio.push(audio_for(&w.zh).map(|(b, ext)| {
                use std::hash::{Hash, Hasher};
                let mut h = std::collections::hash_map::DefaultHasher::new();
                w.zh.hash(&mut h);
                (format!("hskapp_{:016x}.{ext}", h.finish()), b)
            }));
            let _ = app.emit("export-progress", Progress { current: i + 1, total });
        }
        let ts = chrono::Local::now().timestamp();
        crate::export::write_apkg(std::path::Path::new(&path), &words, &scope_label, &audio, ts)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Deserialize)]
pub struct PageImage {
    w: u32,
    h: u32,
    b64: String,
}

/// Ghép các ảnh trang JPEG (giao diện vẽ bằng canvas) thành PDF.
#[tauri::command]
pub async fn export_pdf(path: String, pages: Vec<PageImage>) -> R<()> {
    crate::guard::check()?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut jp = vec![];
        for p in &pages {
            jp.push(crate::export::JpegPage { w: p.w, h: p.h, data: decode(&p.b64)? });
        }
        std::fs::write(&path, crate::export::build_pdf(&jp)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

struct VideoSession {
    dir: std::path::PathBuf,
    segs: Vec<std::path::PathBuf>,
}
static VIDEO: Mutex<Option<VideoSession>> = Mutex::new(None);

#[tauri::command]
pub fn export_video_begin() -> R<()> {
    let dir = std::env::temp_dir().join(format!("hskapp_export_{}", chrono::Local::now().timestamp_millis()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if let Some(old) = VIDEO.lock().unwrap().replace(VideoSession { dir, segs: vec![] }) {
        let _ = std::fs::remove_dir_all(old.dir);
    }
    Ok(())
}

/// Thêm 1 đoạn video: ảnh PNG 1280x720 + đọc `speak` (nếu có). `intro` = đoạn mở đầu (3 giây, không tiếng).
#[tauri::command]
pub async fn export_video_add(png_b64: String, speak: Option<String>, intro: bool) -> R<()> {
    crate::guard::check()?;
    let (dir, idx) = {
        let g = VIDEO.lock().unwrap();
        let s = g.as_ref().ok_or("Chưa bắt đầu xuất video")?;
        (s.dir.clone(), s.segs.len())
    };
    let seg = tauri::async_runtime::spawn_blocking(move || -> R<std::path::PathBuf> {
        let png = dir.join(format!("card_{idx:04}.png"));
        std::fs::write(&png, decode(&png_b64)?).map_err(|e| e.to_string())?;
        let audio = speak.as_deref().and_then(audio_for).map(|(b, ext)| -> R<std::path::PathBuf> {
            let p = dir.join(format!("voice_{idx:04}.{ext}"));
            std::fs::write(&p, b).map_err(|e| e.to_string())?;
            Ok(p)
        }).transpose()?;
        let seg = dir.join(format!("seg_{idx:04}.mp4"));
        crate::export::make_segment(&png, audio.as_deref(), intro, &seg)?;
        Ok(seg)
    })
    .await
    .map_err(|e| e.to_string())??;
    VIDEO.lock().unwrap().as_mut().ok_or("Phiên xuất đã đóng")?.segs.push(seg);
    Ok(())
}

#[tauri::command]
pub async fn export_video_finish(path: String) -> R<()> {
    crate::guard::check()?;
    let session = VIDEO.lock().unwrap().take().ok_or("Chưa bắt đầu xuất video")?;
    tauri::async_runtime::spawn_blocking(move || {
        let r = crate::export::concat_segments(&session.segs, &session.dir.join("list.txt"), std::path::Path::new(&path));
        let _ = std::fs::remove_dir_all(&session.dir);
        r
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn export_video_abort() {
    if let Some(s) = VIDEO.lock().unwrap().take() {
        let _ = std::fs::remove_dir_all(s.dir);
    }
}

/// Dev: bật smoke-test (tự duyệt qua mọi tab) khi chạy với biến môi trường HSK_SMOKE=1.
#[tauri::command]
pub fn smoke_enabled() -> bool {
    cfg!(debug_assertions) && std::env::var("HSK_SMOKE").is_ok()
}
