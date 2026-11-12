//! Tách từ tiếng Trung (port của core/segmentation.py và phần tách trong core/reading_lexicon.py).
//! `jieba-rs` dùng cùng từ điển/thuật toán với `jieba` của Python nên kết quả gần như giống hệt.

use jieba_rs::Jieba;
use std::sync::OnceLock;

fn jieba() -> &'static Jieba {
    static J: OnceLock<Jieba> = OnceLock::new();
    J.get_or_init(Jieba::new) // nạp từ điển nhúng sẵn, lần đầu mất ~nửa giây
}

fn is_punct_only(s: &str) -> bool {
    const P: &str = "，。！？、；：“”‘’（）《》【】…—-,.!?;:()\"'[] \t\r\n";
    s.chars().all(|c| P.contains(c))
}

/// Tách câu thành các từ có nghĩa, bỏ dấu câu và khoảng trắng.
pub fn segment_words(text: &str) -> Vec<String> {
    jieba()
        .cut(text.trim(), true)
        .into_iter()
        .map(|t| t.word.trim())
        .filter(|t| !t.is_empty() && !is_punct_only(t))
        .map(String::from)
        .collect()
}

/// Tách nhưng GIỮ dấu câu (để dựng lại đoạn văn khi hiển thị chú giải từng từ).
pub fn cut_keep_all(text: &str) -> Vec<String> {
    jieba().cut(text, true).into_iter().map(|t| t.word.to_string()).collect()
}

/// Pinyin có dấu thanh của một từ, vd "你好" -> "nǐ hǎo".
pub fn pinyin_of(text: &str) -> String {
    use pinyin::ToPinyin;
    text.to_pinyin()
        .flatten()
        .map(|p| p.with_tone())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segments_and_drops_punctuation() {
        let w = segment_words("我今天去学校，你呢？");
        assert!(w.contains(&"学校".to_string()), "{w:?}");
        assert!(w.iter().all(|t| !is_punct_only(t)), "{w:?}");
    }

    #[test]
    fn pinyin_has_tone_marks() {
        assert_eq!(pinyin_of("你好"), "nǐ hǎo");
    }

    /// So khớp với jieba của Python: SEG_CASES=<file json [[câu,[từ...]],...]> cargo test seg_parity -- --ignored --nocapture
    #[test]
    #[ignore]
    fn seg_parity_with_python() {
        let path = std::env::var("SEG_CASES").expect("đặt SEG_CASES");
        let cases: Vec<(String, Vec<String>)> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let mut diff = 0;
        for (s, expect) in &cases {
            let got = segment_words(s);
            if &got != expect {
                diff += 1;
                if diff <= 5 { println!("KHÁC: {s}\n  py: {expect:?}\n  rs: {got:?}"); }
            }
        }
        println!("khác {diff}/{}", cases.len());
    }
}
