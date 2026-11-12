//! Dùng thử: 7 ngày đầu (tính từ lần chạy đầu tiên) học KHÔNG giới hạn, sau đó mỗi
//! ngày tối đa 30 phút nếu vẫn chưa kích hoạt. Cùng khoá `trial/TrialDate`,
//! `trial/TrialUsedSeconds` như bản Python; thêm `trial/FirstRunDate` để tính 7 ngày.

use chrono::{Local, NaiveDate};

use super::qsettings;

pub const DAILY_LIMIT_SECONDS: i64 = 30 * 60;
pub const FREE_DAYS: i64 = 7;

fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

/// Ngày chạy đầu tiên (ghi lại ngay lần đọc đầu, không cần job cài đặt riêng).
fn first_run_date() -> String {
    if let Some(d) = qsettings::get("trial/FirstRunDate") {
        if parse_date(&d).is_some() {
            return d;
        }
    }
    let d = today();
    qsettings::set_str("trial/FirstRunDate", &d);
    d
}

/// Số ngày miễn phí đầy đủ còn lại (0 nếu đã hết 7 ngày đầu).
pub fn free_days_left() -> i64 {
    let Some(start) = parse_date(&first_run_date()) else { return FREE_DAYS };
    let Some(now) = parse_date(&today()) else { return FREE_DAYS };
    let elapsed = (now - start).num_days().max(0);
    (FREE_DAYS - elapsed).max(0)
}

pub fn in_free_period() -> bool {
    free_days_left() > 0
}

/// Còn được dùng app không: trong 7 ngày đầu (không giới hạn) hoặc đã kích hoạt
/// hoặc còn hạn mức 30 phút/ngày.
pub fn has_access() -> bool {
    in_free_period() || remaining_seconds_today() > 0
}

pub fn used_seconds_today() -> i64 {
    let date = qsettings::get("trial/TrialDate").unwrap_or_default();
    if date != today() {
        return 0;
    }
    qsettings::get("trial/TrialUsedSeconds")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
        .max(0)
}

pub fn remaining_seconds_today() -> i64 {
    (DAILY_LIMIT_SECONDS - used_seconds_today()).max(0)
}

pub fn add_used_seconds(seconds: i64) {
    if seconds <= 0 {
        return;
    }
    let used = used_seconds_today() + seconds;
    qsettings::set_str("trial/TrialDate", &today());
    qsettings::set_int("trial/TrialUsedSeconds", used.max(0));
}
