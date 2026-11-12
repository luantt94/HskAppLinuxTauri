//! Port của core/stats.py — nhật ký hoạt động học + thống kê cho tab Tiến độ.
//! File `stats.db` RIÊNG, mỗi lượt ôn 1 từ là 1 sự kiện.

use chrono::{Duration, NaiveDate};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};

use super::{hskapp_dir, now_iso, today};

pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            day TEXT NOT NULL,
            source TEXT NOT NULL,
            zh TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL DEFAULT 'review',
            correct INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )?;
    maybe_backfill(conn)
}

fn insert(conn: &Connection, source: &str, zh: &str, action: &str, correct: Option<bool>) -> rusqlite::Result<()> {
    let ts = now_iso();
    conn.execute(
        "INSERT INTO events (ts, day, source, zh, action, correct) VALUES (?1,?2,?3,?4,?5,?6)",
        params![ts, &ts[..10], source, zh, action, correct.map(|c| c as i32)],
    )?;
    Ok(())
}

pub fn log_review(conn: &Connection, source: &str, zh: &str, correct: Option<bool>) -> rusqlite::Result<()> {
    insert(conn, source, zh, "review", correct)
}

/// Lần chạy đầu: "mồi" mỗi thẻ đã ôn thành 1 sự kiện ở ngày ôn gần nhất.
fn maybe_backfill(conn: &Connection) -> rusqlite::Result<()> {
    let done: Option<String> = conn
        .query_row("SELECT value FROM meta WHERE key='backfilled'", [], |r| r.get(0))
        .ok();
    if done.as_deref() == Some("1") {
        return Ok(());
    }
    let _ = seed_from(conn, "srs.db", "srs_cards", "last_reviewed", "srs");
    let _ = seed_from(conn, "memrise.db", "memrise_cards", "last_seen_at", "memrise");
    conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('backfilled', '1')", [])?;
    Ok(())
}

fn seed_from(conn: &Connection, db: &str, table: &str, col: &str, source: &str) -> rusqlite::Result<()> {
    let path = hskapp_dir().join(db);
    if !path.exists() {
        return Ok(());
    }
    let src = Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut st = src.prepare(&format!("SELECT zh, {col} FROM {table} WHERE {col} IS NOT NULL"))?;
    let rows: Vec<(String, String)> = st
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .filter_map(Result::ok)
        .collect();
    for (zh, reviewed) in rows {
        let day: String = reviewed.chars().take(10).collect();
        if NaiveDate::parse_from_str(&day, "%Y-%m-%d").is_err() {
            continue;
        }
        conn.execute(
            "INSERT INTO events (ts, day, source, zh, action, correct) VALUES (?1,?2,?3,?4,'seed',NULL)",
            params![reviewed, day, source, zh],
        )?;
    }
    Ok(())
}

fn d(date: NaiveDate) -> String {
    date.to_string()
}

pub fn daily_counts(conn: &Connection, days: i64) -> rusqlite::Result<HashMap<String, i64>> {
    let start = d(today() - Duration::days(days - 1));
    let mut st = conn.prepare(
        "SELECT day, COUNT(*) FROM events WHERE action IN ('review','seed') AND day >= ?1 GROUP BY day",
    )?;
    let rows = st.query_map([start], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
    rows.collect()
}

fn active_days(conn: &Connection) -> rusqlite::Result<BTreeSet<NaiveDate>> {
    let mut st = conn.prepare("SELECT DISTINCT day FROM events WHERE action IN ('review','seed')")?;
    let rows = st.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows
        .filter_map(Result::ok)
        .filter_map(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
        .collect())
}

/// (chuỗi hiện tại, chuỗi dài nhất). Chuỗi hiện tại tính lùi từ hôm nay, hoặc
/// từ hôm qua nếu hôm nay chưa học (chưa mất chuỗi cho tới hết ngày).
pub fn streak(conn: &Connection) -> rusqlite::Result<(i64, i64)> {
    streak_of(&active_days(conn)?, today())
}

pub fn streak_of(days: &BTreeSet<NaiveDate>, today: NaiveDate) -> rusqlite::Result<(i64, i64)> {
    if days.is_empty() {
        return Ok((0, 0));
    }
    let mut cur = 0;
    let mut day = today;
    if !days.contains(&day) {
        day -= Duration::days(1);
    }
    while days.contains(&day) {
        cur += 1;
        day -= Duration::days(1);
    }
    let (mut longest, mut run) = (0, 0);
    let mut prev: Option<NaiveDate> = None;
    for &cd in days {
        run = if prev.is_some_and(|p| (cd - p).num_days() == 1) { run + 1 } else { 1 };
        longest = longest.max(run);
        prev = Some(cd);
    }
    Ok((cur, longest))
}

/// (số lượt ôn, số từ khác nhau) trong ngày.
pub fn reviewed_on(conn: &Connection, day: NaiveDate) -> rusqlite::Result<(i64, i64)> {
    let day = d(day);
    let total = conn.query_row("SELECT COUNT(*) FROM events WHERE action='review' AND day=?1", [&day], |r| r.get(0))?;
    let distinct = conn.query_row(
        "SELECT COUNT(DISTINCT zh) FROM events WHERE action='review' AND day=?1", [&day], |r| r.get(0))?;
    Ok((total, distinct))
}

pub fn accuracy(conn: &Connection, days: i64) -> rusqlite::Result<Option<f64>> {
    let start = d(today() - Duration::days(days - 1));
    let (tot, ok): (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN correct=1 THEN 1 ELSE 0 END),0) \
         FROM events WHERE action='review' AND correct IS NOT NULL AND day >= ?1",
        [start],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    Ok(if tot > 0 { Some(ok as f64 / tot as f64 * 100.0) } else { None })
}

pub fn total_reviews(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM events WHERE action='review'", [], |r| r.get(0))
}

#[derive(Serialize)]
pub struct DayCount {
    pub day: String,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub streak: i64,
    pub longest_streak: i64,
    pub distinct_today: i64,
    pub accuracy_30: Option<f64>,
    pub total_reviews: i64,
    pub daily_counts: HashMap<String, i64>,
    /// 14 ngày gần nhất, cũ -> mới, đủ mọi ngày
    pub last_14: Vec<DayCount>,
}

pub fn overview(conn: &Connection) -> rusqlite::Result<Overview> {
    let (streak, longest_streak) = streak(conn)?;
    let counts = daily_counts(conn, 133)?;
    let t = today();
    let last_14 = (0..14)
        .rev()
        .map(|i| {
            let day = d(t - Duration::days(i));
            DayCount { count: counts.get(&day).copied().unwrap_or(0), day }
        })
        .collect();
    Ok(Overview {
        streak,
        longest_streak,
        distinct_today: reviewed_on(conn, t)?.1,
        accuracy_30: accuracy(conn, 30)?,
        total_reviews: total_reviews(conn)?,
        daily_counts: counts,
        last_14,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn streak_counts_from_yesterday_if_today_empty() {
        let days: BTreeSet<_> = ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-01", "2026-10-02"]
            .iter().map(|s| date(s)).collect();
        assert_eq!(streak_of(&days, date("2026-10-21")).unwrap(), (4, 4));
        assert_eq!(streak_of(&days, date("2026-10-23")).unwrap(), (0, 4)); // đứt chuỗi
        assert_eq!(streak_of(&BTreeSet::new(), date("2026-10-21")).unwrap(), (0, 0));
    }

    #[test]
    fn accuracy_ignores_seed_and_null() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);").unwrap();
        c.execute_batch("INSERT INTO meta VALUES ('backfilled','1')").unwrap();
        init(&c).unwrap();
        assert_eq!(accuracy(&c, 30).unwrap(), None);
        log_review(&c, "srs", "a", Some(true)).unwrap();
        log_review(&c, "srs", "b", Some(false)).unwrap();
        log_review(&c, "srs", "c", Some(true)).unwrap();
        insert(&c, "srs", "s", "seed", None).unwrap();
        let a = accuracy(&c, 30).unwrap().unwrap();
        assert!((a - 66.6667).abs() < 0.01);
        assert_eq!(reviewed_on(&c, today()).unwrap(), (3, 3));
        let o = overview(&c).unwrap();
        assert_eq!(o.last_14.len(), 14);
        assert_eq!(o.last_14[13].count, 4); // 3 review + 1 seed cùng hôm nay
    }
}
