//! Port của core/srs.py — SM-2 rút gọn, 4 mức Lại/Khó/Tốt/Dễ như Anki.

use chrono::Duration;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::{now_iso, today};

pub const AGAIN: i32 = 0;
pub const HARD: i32 = 1;
pub const GOOD: i32 = 2;
pub const EASY: i32 = 3;

const DEFAULT_EASE: f64 = 2.5;
const MIN_EASE: f64 = 1.3;
const MAX_INTERVAL_DAYS: f64 = 60.0;

const COLUMNS: &str = "zh, vi, pinyin, example_cn, example_vi, pinyin_sentence, \
ease_factor, interval_days, repetitions, due_date, last_reviewed, created_at";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub zh: String,
    #[serde(default)]
    pub vi: String,
    #[serde(default)]
    pub pinyin: String,
    #[serde(default)]
    pub ex_cn: String,
    #[serde(default)]
    pub ex_vi: String,
    #[serde(default)]
    pub py_sent: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SrsCard {
    pub zh: String,
    pub vi: String,
    pub pinyin: String,
    pub ex_cn: String,
    pub ex_vi: String,
    pub py_sent: String,
    pub ease_factor: f64,
    pub interval_days: f64,
    pub repetitions: i64,
    pub due_date: String,
    pub last_reviewed: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Counts {
    pub total: i64,
    pub due: i64,
    pub new: i64,
    pub learned: i64,
}

pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS srs_cards (
            zh TEXT PRIMARY KEY,
            vi TEXT NOT NULL DEFAULT '',
            pinyin TEXT NOT NULL DEFAULT '',
            example_cn TEXT NOT NULL DEFAULT '',
            example_vi TEXT NOT NULL DEFAULT '',
            pinyin_sentence TEXT NOT NULL DEFAULT '',
            ease_factor REAL NOT NULL DEFAULT 2.5,
            interval_days REAL NOT NULL DEFAULT 0,
            repetitions INTEGER NOT NULL DEFAULT 0,
            due_date TEXT NOT NULL,
            last_reviewed TEXT,
            created_at TEXT NOT NULL
        )",
    )
}

fn row_to_card(r: &rusqlite::Row) -> rusqlite::Result<SrsCard> {
    Ok(SrsCard {
        zh: r.get(0)?,
        vi: r.get(1)?,
        pinyin: r.get(2)?,
        ex_cn: r.get(3)?,
        ex_vi: r.get(4)?,
        py_sent: r.get(5)?,
        ease_factor: r.get(6)?,
        interval_days: r.get(7)?,
        repetitions: r.get(8)?,
        due_date: r.get(9)?,
        last_reviewed: r.get(10)?,
        created_at: r.get(11)?,
    })
}

/// Thêm các từ CHƯA có (theo chữ Hán), không reset tiến độ từ cũ. Trả về số từ mới.
pub fn add_words(conn: &Connection, words: &[Word]) -> rusqlite::Result<usize> {
    let today = today().to_string();
    let now = now_iso();
    let mut added = 0;
    for w in words {
        let zh = w.zh.trim();
        if zh.is_empty() {
            continue;
        }
        let n = conn.execute(
            "INSERT OR IGNORE INTO srs_cards (zh, vi, pinyin, example_cn, example_vi, pinyin_sentence, \
             ease_factor, interval_days, repetitions, due_date, last_reviewed, created_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,0,0,?8,NULL,?9)",
            params![zh, w.vi.trim(), w.pinyin.trim(), w.ex_cn.trim(), w.ex_vi.trim(), w.py_sent.trim(),
                    DEFAULT_EASE, today, now],
        )?;
        added += n;
    }
    Ok(added)
}

pub fn get_card(conn: &Connection, zh: &str) -> rusqlite::Result<Option<SrsCard>> {
    conn.query_row(&format!("SELECT {COLUMNS} FROM srs_cards WHERE zh = ?1"), [zh], row_to_card)
        .optional()
}

pub fn due_dates(conn: &Connection) -> rusqlite::Result<HashMap<String, String>> {
    let mut st = conn.prepare("SELECT zh, due_date FROM srs_cards")?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    rows.collect()
}

pub fn due_cards(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<SrsCard>> {
    let mut st = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM srs_cards WHERE due_date <= ?1 ORDER BY due_date ASC LIMIT ?2"
    ))?;
    let rows = st.query_map(params![today().to_string(), limit], row_to_card)?;
    rows.collect()
}

/// Từ "đã thuộc": đã ôn ít nhất 1 lần VÀ chưa quá hạn.
pub fn known_zh(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut st = conn.prepare("SELECT zh FROM srs_cards WHERE repetitions > 0 AND due_date >= ?1")?;
    let rows = st.query_map([today().to_string()], |r| r.get(0))?;
    rows.collect()
}

pub fn counts(conn: &Connection) -> rusqlite::Result<Counts> {
    let t = today().to_string();
    let q = |sql: &str, p: &[&dyn rusqlite::ToSql]| conn.query_row(sql, p, |r| r.get::<_, i64>(0));
    Ok(Counts {
        total: q("SELECT COUNT(*) FROM srs_cards", &[])?,
        due: q("SELECT COUNT(*) FROM srs_cards WHERE due_date <= ?1", &[&t])?,
        new: q("SELECT COUNT(*) FROM srs_cards WHERE repetitions = 0", &[])?,
        learned: q("SELECT COUNT(*) FROM srs_cards WHERE repetitions > 0", &[])?,
    })
}

/// Số ngày sẽ áp dụng nếu chấm `grade` (không lưu gì) — hiện trên nút bấm.
pub fn preview_interval_days(card: &SrsCard, grade: i32) -> f64 {
    if grade == AGAIN {
        return 0.0;
    }
    let mut v = match card.repetitions {
        0 => 1.0,
        1 => 6.0,
        _ => card.interval_days * card.ease_factor,
    };
    if grade == HARD {
        v = (v * 0.8).max(1.0);
    } else if grade == EASY {
        v *= 1.3;
    }
    (v.min(MAX_INTERVAL_DAYS) * 10.0).round() / 10.0
}

pub fn review(conn: &Connection, zh: &str, grade: i32, force_days: Option<f64>) -> rusqlite::Result<()> {
    let Some(card) = get_card(conn, zh)? else { return Ok(()) };
    let (ease, reps, interval, due) = if grade == AGAIN {
        // "Lại": đến hạn ngay hôm nay để ôn lại trong cùng phiên
        ((card.ease_factor - 0.2).max(MIN_EASE), 0, 0.0, today())
    } else {
        let interval = force_days.unwrap_or_else(|| preview_interval_days(&card, grade));
        let ease = match grade {
            HARD => (card.ease_factor - 0.15).max(MIN_EASE),
            EASY => card.ease_factor + 0.15,
            _ => card.ease_factor,
        };
        // Python: today + timedelta(days=float) — timedelta cắt về micro giây, ở đây làm tròn ngày
        let due = today() + Duration::seconds((interval * 86400.0) as i64);
        (ease, card.repetitions + 1, interval, due)
    };
    conn.execute(
        "UPDATE srs_cards SET ease_factor=?1, interval_days=?2, repetitions=?3, due_date=?4, last_reviewed=?5 WHERE zh=?6",
        params![ease, interval, reps, due.to_string(), now_iso(), zh],
    )?;
    Ok(())
}

pub fn reset_words(conn: &Connection, zh_list: &[String]) -> rusqlite::Result<usize> {
    let mut removed = 0;
    for zh in zh_list {
        removed += conn.execute("DELETE FROM srs_cards WHERE zh = ?1", [zh.trim()])?;
    }
    Ok(removed)
}

/// Dời hạn ôn `delta_days` ngày; từ chưa có thẻ thì thêm trước. Trả về số ngày còn lại mới.
pub fn adjust_due_date(conn: &Connection, word: &Word, delta_days: i64) -> rusqlite::Result<Option<i64>> {
    if word.zh.trim().is_empty() {
        return Ok(None);
    }
    add_words(conn, std::slice::from_ref(word))?;
    let Some(card) = get_card(conn, word.zh.trim())? else { return Ok(None) };
    let cur = chrono::NaiveDate::parse_from_str(&card.due_date, "%Y-%m-%d").unwrap_or_else(|_| today());
    let new_due = cur + Duration::days(delta_days);
    conn.execute("UPDATE srs_cards SET due_date=?1 WHERE zh=?2", params![new_due.to_string(), card.zh])?;
    Ok(Some((new_due - today()).num_days()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init(&c).unwrap();
        c
    }
    fn w(zh: &str) -> Word {
        Word { zh: zh.into(), vi: "x".into(), ..Default::default() }
    }

    #[test]
    fn add_is_idempotent() {
        let c = mem();
        assert_eq!(add_words(&c, &[w("爱"), w("你"), w("爱")]).unwrap(), 2);
        assert_eq!(add_words(&c, &[w("爱")]).unwrap(), 0);
        assert_eq!(counts(&c).unwrap(), Counts { total: 2, due: 2, new: 2, learned: 0 });
    }

    #[test]
    fn sm2_progression_matches_python() {
        let c = mem();
        add_words(&c, &[w("爱")]).unwrap();
        // lần 1 Tốt -> 1 ngày; lần 2 Tốt -> 6 ngày; lần 3 Tốt -> 6*2.5 = 15
        for expected in [1.0, 6.0, 15.0] {
            let card = get_card(&c, "爱").unwrap().unwrap();
            assert_eq!(preview_interval_days(&card, GOOD), expected);
            review(&c, "爱", GOOD, None).unwrap();
        }
        let card = get_card(&c, "爱").unwrap().unwrap();
        assert_eq!(card.repetitions, 3);
        // Dễ: 15*2.5*1.3 = 48.75 -> 48.8 (làm tròn 1 chữ số, như Python round)
        assert_eq!(preview_interval_days(&card, EASY), 48.8);
        // Khó: max(1, 37.5*0.8)=30
        assert_eq!(preview_interval_days(&card, HARD), 30.0);
    }

    #[test]
    fn again_resets_and_is_due_today() {
        let c = mem();
        add_words(&c, &[w("爱")]).unwrap();
        review(&c, "爱", GOOD, None).unwrap();
        review(&c, "爱", AGAIN, None).unwrap();
        let card = get_card(&c, "爱").unwrap().unwrap();
        assert_eq!((card.repetitions, card.interval_days), (0, 0.0));
        assert_eq!(card.due_date, today().to_string());
        assert!((card.ease_factor - 2.3).abs() < 1e-9);
    }

    #[test]
    fn known_excludes_overdue() {
        let c = mem();
        add_words(&c, &[w("a"), w("b")]).unwrap();
        review(&c, "a", GOOD, None).unwrap(); // đến hạn mai -> thuộc
        review(&c, "b", GOOD, None).unwrap();
        c.execute("UPDATE srs_cards SET due_date='2000-01-01' WHERE zh='b'", []).unwrap();
        assert_eq!(known_zh(&c).unwrap(), vec!["a".to_string()]);
    }

    #[test]
    fn adjust_due_adds_missing_card() {
        let c = mem();
        assert_eq!(adjust_due_date(&c, &w("新"), 3).unwrap(), Some(3));
        assert_eq!(adjust_due_date(&c, &w("新"), -1).unwrap(), Some(2));
    }
}
