mod auth;
mod commands;
mod db;
mod exam;
mod export;
mod guard;
mod recorder;
mod seg;
mod sets;
mod tts;
mod vault;

use auth::{license, trial};
use serde::Serialize;

const MAX_FAILED_ATTEMPTS: i64 = 50;

#[derive(Serialize)]
struct LicenseStatus {
    activated: bool,
    /// Chuỗi khách gửi người bán (App ID + tổng ASCII mã máy)
    machine_code: String,
    trial_remaining_seconds: i64,
    /// Số ngày còn lại trong 7 ngày đầu dùng miễn phí không giới hạn (0 = đã hết).
    free_days_left: i64,
    /// Giá mỗi mã kích hoạt, để hiển thị trên hộp thoại (đơn vị: đồng).
    price_vnd: i64,
}

#[tauri::command]
fn license_status() -> LicenseStatus {
    LicenseStatus {
        activated: license::is_activated(),
        machine_code: license::generate_sum(license::APP_ID),
        trial_remaining_seconds: trial::remaining_seconds_today(),
        free_days_left: trial::free_days_left(),
        price_vnd: 10_000,
    }
}

/// Trả về Ok(()) nếu key hợp lệ (và lưu lại), Err(thông báo) nếu sai.
#[tauri::command]
fn activate_license(key: String) -> Result<(), String> {
    // Như bản Python: sai quá 50 lần thì khoá hẳn (đếm lưu cùng nơi với license)
    if license::failed_attempts(license::APP_ID) >= MAX_FAILED_ATTEMPTS {
        return Err(format!("Bạn đã nhập sai mã quá {MAX_FAILED_ATTEMPTS} lần nên không thể tiếp tục thử."));
    }
    if license::verify_key(license::APP_ID, &key) {
        license::save_license(license::APP_ID, key.trim(), &license::generate_sum(license::APP_ID));
        license::reset_failed_attempts(license::APP_ID);
        guard::invalidate();
        Ok(())
    } else {
        let n = license::increment_failed_attempts(license::APP_ID);
        Err(format!("Mã kích hoạt không đúng (lần {n})."))
    }
}

#[tauri::command]
fn trial_add_seconds(seconds: i64) -> i64 {
    trial::add_used_seconds(seconds);
    trial::remaining_seconds_today()
}

/// Đọc `text` bằng Edge TTS, trả mp3 dạng base64. `voice`: "zh" (mặc định) hoặc "vi", hoặc tên giọng đầy đủ.
#[tauri::command]
async fn tts_speak(text: String, voice: Option<String>) -> Result<tts::Audio, String> {
    guard::check()?;
    let voice = match voice.as_deref() {
        None | Some("zh") => tts::VOICE_ZH.to_string(),
        Some("vi") => tts::VOICE_VI.to_string(),
        Some(v) => v.to_string(),
    };
    // Tác vụ mạng chặn luồng -> chạy ở luồng riêng để UI không bị đơ
    tauri::async_runtime::spawn_blocking(move || tts::synthesize_audio(&text, &voice))
        .await
        .map_err(|e| e.to_string())?
}

/// Tách nhiều câu một lượt (Sắp xếp câu cần tách hàng trăm câu — gọi 1 lần cho nhanh).
#[tauri::command]
async fn segment_words(texts: Vec<String>) -> Vec<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || texts.iter().map(|t| seg::segment_words(t)).collect())
        .await
        .unwrap_or_default()
}

/// Tách giữ dấu câu + pinyin từng mảnh (cho tab Đọc hiểu).
#[tauri::command]
async fn segment_with_pinyin(text: String) -> Vec<(String, String)> {
    tauri::async_runtime::spawn_blocking(move || {
        seg::cut_keep_all(&text).into_iter().map(|t| { let p = seg::pinyin_of(&t); (t, p) }).collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
fn rec_start() -> Result<(), String> { recorder::start() }

#[tauri::command]
fn rec_status() -> recorder::Status { recorder::status() }

#[tauri::command]
async fn rec_stop() -> Result<recorder::Recording, String> {
    tauri::async_runtime::spawn_blocking(recorder::stop).await.map_err(|e| e.to_string())?
}

/// Đọc/ghi cài đặt cùng nơi với bản Python (QSettings). Khoá dạng "Grammar/order/HSK1".
#[tauri::command]
fn setting_get(key: String) -> Option<String> {
    auth::qsettings::get(&key)
}

#[tauri::command]
fn setting_set(key: String, value: String) -> bool {
    auth::qsettings::set_str(&key, &value)
}

#[tauri::command]
fn sets_list() -> Vec<sets::SetInfo> { sets::list() }

#[tauri::command]
fn set_read(path: String) -> Result<Vec<db::srs::Word>, String> { sets::read(&path) }

#[tauri::command]
fn set_save(name: String, words: Vec<db::srs::Word>, path: Option<String>) -> Result<String, String> {
    sets::save(&name, &words, path.as_deref())
}

#[tauri::command]
fn set_add_word(path: String, word: db::srs::Word) -> Result<&'static str, String> { sets::add_word(&path, &word) }

#[tauri::command]
fn set_delete(path: String) -> Result<(), String> { sets::delete(&path) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            license_status,
            activate_license,
            trial_add_seconds,
            tts_speak,
            sets_list,
            set_read,
            set_save,
            set_add_word,
            set_delete,
            setting_get,
            setting_set,
            rec_start,
            rec_status,
            rec_stop,
            segment_words,
            segment_with_pinyin,
            commands::progress_overview,
            commands::srs_add_words,
            commands::srs_due_cards,
            commands::srs_get_card,
            commands::srs_due_dates,
            commands::srs_preview,
            commands::srs_review,
            commands::srs_report,
            commands::srs_reset_words,
            commands::srs_adjust_due,
            commands::js_log,
            commands::smoke_enabled,
            commands::exam_scan,
            commands::exam_set_folder,
            commands::exam_load,
            commands::exam_media,
            commands::exam_media_exists,
            commands::exam_progress_get,
            commands::exam_progress_set,
            commands::export_cancel,
            commands::export_anki,
            commands::export_pdf,
            commands::export_video_begin,
            commands::export_video_add,
            commands::export_video_finish,
            commands::export_video_abort
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
