//! Xuất flashcard: Anki (.apkg), PDF (ghép ảnh trang do giao diện vẽ), Video (ffmpeg sidecar).
//! Port của games/export_dialog.py. Định dạng .apkg được làm giống hệt `genanki` (xem test đối chiếu).

use rusqlite::{params, Connection};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{io::Write, path::{Path, PathBuf}, process::Command};

use crate::db::srs::Word;

// ---------------------------------------------------------------- Anki
// ID cố định (KHÔNG được đổi): Anki dùng để nhận ra "cùng note type/deck" giữa các lần xuất.
const ANKI_MODEL_ID: i64 = 1979261315;
const ANKI_DECK_ID: i64 = 1466937473;

const SCHEMA: &str = include_str!("anki_schema.sql");

const BASE91: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~";

/// GUID của note: 8 byte đầu của SHA256("f1__f2__...") viết bằng "base91" kiểu Anki (như genanki.guid_for).
pub fn guid_for(fields: &[String]) -> String {
    let digest = Sha256::digest(fields.join("__").as_bytes());
    let mut n = u64::from_be_bytes(digest[..8].try_into().unwrap());
    let mut rev = vec![];
    while n > 0 {
        rev.push(BASE91[(n % 91) as usize]);
        n /= 91;
    }
    rev.reverse();
    String::from_utf8(rev).unwrap()
}

fn model_json(ts: i64) -> serde_json::Value {
    let fields = ["Hanzi", "Pinyin", "Meaning", "ExampleCn", "ExamplePinyin", "ExampleVi", "Audio"];
    let flds: Vec<_> = fields.iter().enumerate().map(|(i, n)| json!({
        "name": n, "ord": i, "font": "Liberation Sans", "media": [], "rtl": false, "size": 20, "sticky": false
    })).collect();
    let css = ".card{font-family:'Microsoft YaHei','Segoe UI',sans-serif;text-align:center;background:#ffffff;color:#111827;}\
.hanzi{font-size:56px;font-weight:700;color:#2563eb;margin:12px 0;}\
.pinyin{font-size:20px;color:#64748B;margin-top:6px;}\
.meaning{font-size:22px;font-weight:700;color:#111827;margin-top:4px;}\
.example-cn{font-size:18px;color:#2563eb;margin-top:16px;}\
.example-py{font-size:14px;color:#64748B;}\
.example-vi{font-size:14px;color:#334155;}";
    json!({
        "css": css, "did": ANKI_DECK_ID, "flds": flds, "id": ANKI_MODEL_ID.to_string(),
        "latexPost": "\\end{document}",
        "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
        "latexsvg": false, "mod": ts, "name": "HskApp Flashcard",
        "req": [[0, "all", [0]]], "sortf": 0, "tags": [],
        "tmpls": [{
            "name": "Card 1", "ord": 0, "bafmt": "", "bqfmt": "", "bfont": "", "bsize": 0, "did": null,
            "qfmt": "<div class=\"hanzi\">{{Hanzi}}</div>",
            "afmt": "<div class=\"hanzi\">{{Hanzi}}</div><hr id=\"answer\"><div class=\"pinyin\">{{Pinyin}}</div><div class=\"meaning\">{{Meaning}}</div>{{#ExampleCn}}<div class=\"example-cn\">{{ExampleCn}}</div>{{/ExampleCn}}{{#ExamplePinyin}}<div class=\"example-py\">{{ExamplePinyin}}</div>{{/ExamplePinyin}}{{#ExampleVi}}<div class=\"example-vi\">{{ExampleVi}}</div>{{/ExampleVi}}{{Audio}}"
        }],
        "type": 0, "usn": -1, "vers": []
    })
}

/// `audio[i]` = (tên file, nội dung mp3) của từ thứ i nếu có.
pub fn write_apkg(out: &Path, words: &[Word], scope: &str, audio: &[Option<(String, Vec<u8>)>], ts: i64) -> Result<(), String> {
    let tmp = std::env::temp_dir().join(format!("hskapp_apkg_{}.db", ts));
    let _ = std::fs::remove_file(&tmp);
    {
        let c = Connection::open(&tmp).map_err(|e| e.to_string())?;
        c.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        let deck_name = if scope.is_empty() { "HskApp".to_string() } else { format!("HskApp::{scope}") };
        let mut deck = json!({
            "collapsed": false, "conf": 1, "desc": "", "dyn": 0, "extendNew": 0, "extendRev": 50, "id": ANKI_DECK_ID,
            "lrnToday": [163, 2], "mod": 1425278051, "name": deck_name, "newToday": [163, 2],
            "revToday": [163, 0], "timeToday": [163, 23598], "usn": -1
        });
        let mut decks: serde_json::Value = serde_json::from_str(&c.query_row("SELECT decks FROM col", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        decks[ANKI_DECK_ID.to_string()] = deck.take();
        let models = json!({ ANKI_MODEL_ID.to_string(): model_json(ts) });
        c.execute("UPDATE col SET decks = ?1, models = ?2", params![decks.to_string(), models.to_string()]).map_err(|e| e.to_string())?;

        let mut id = ts * 1000;
        for (i, w) in words.iter().enumerate() {
            let audio_field = audio.get(i).and_then(|a| a.as_ref()).map(|(n, _)| format!("[sound:{n}]")).unwrap_or_default();
            let fields = vec![w.zh.clone(), w.pinyin.clone(), w.vi.clone(), w.ex_cn.clone(), w.py_sent.clone(), w.ex_vi.clone(), audio_field];
            let note_id = id;
            id += 1;
            c.execute("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)", params![
                note_id, guid_for(&fields), ANKI_MODEL_ID, ts, -1, "  ", fields.join("\u{1f}"), fields[0], 0, 0, ""
            ]).map_err(|e| e.to_string())?;
            if !fields[0].is_empty() { // thẻ chỉ tạo khi trường bắt buộc (Hanzi) có nội dung
                c.execute("INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", params![
                    id, note_id, ANKI_DECK_ID, 0, ts, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ""
                ]).map_err(|e| e.to_string())?;
                id += 1;
            }
        }
    }
    let file = std::fs::File::create(out).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("collection.anki2", opts).map_err(|e| e.to_string())?;
    zip.write_all(&std::fs::read(&tmp).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let mut media = serde_json::Map::new();
    let mut idx = 0;
    let mut blobs = vec![];
    for a in audio.iter().flatten() {
        media.insert(idx.to_string(), json!(a.0));
        blobs.push((idx, &a.1));
        idx += 1;
    }
    zip.start_file("media", opts).map_err(|e| e.to_string())?;
    zip.write_all(serde_json::Value::Object(media).to_string().as_bytes()).map_err(|e| e.to_string())?;
    for (i, data) in blobs {
        zip.start_file(i.to_string(), opts).map_err(|e| e.to_string())?;
        zip.write_all(data).map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp);
    Ok(())
}

// ---------------------------------------------------------------- PDF
pub struct JpegPage {
    pub w: u32,
    pub h: u32,
    pub data: Vec<u8>,
}

/// PDF tối giản: mỗi trang là một ảnh JPEG phủ kín trang A4 (595x842pt). Giao diện vẽ chữ Hán bằng canvas
/// (dùng font hệ thống) nên không cần nhúng font vào PDF.
pub fn build_pdf(pages: &[JpegPage]) -> Vec<u8> {
    let mut out: Vec<u8> = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n".to_vec();
    let mut offsets: Vec<usize> = vec![];
    let n = pages.len();
    let mut obj = |out: &mut Vec<u8>, body: &[u8]| {
        offsets.push(out.len());
        out.extend_from_slice(format!("{} 0 obj\n", offsets.len()).as_bytes());
        out.extend_from_slice(body);
        out.extend_from_slice(b"\nendobj\n");
    };
    obj(&mut out, b"<< /Type /Catalog /Pages 2 0 R >>");
    let kids: Vec<String> = (0..n).map(|i| format!("{} 0 R", 3 + i * 3)).collect();
    obj(&mut out, format!("<< /Type /Pages /Kids [{}] /Count {} >>", kids.join(" "), n).as_bytes());
    for (i, p) in pages.iter().enumerate() {
        let (page, content, image) = (3 + i * 3, 4 + i * 3, 5 + i * 3);
        obj(&mut out, format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 {image} 0 R >> >> /Contents {content} 0 R >>").as_bytes());
        let _ = page;
        let stream = b"q 595 0 0 842 0 0 cm /Im0 Do Q";
        let mut c = format!("<< /Length {} >>\nstream\n", stream.len()).into_bytes();
        c.extend_from_slice(stream);
        c.extend_from_slice(b"\nendstream");
        obj(&mut out, &c);
        let mut im = format!("<< /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n", p.w, p.h, p.data.len()).into_bytes();
        im.extend_from_slice(&p.data);
        im.extend_from_slice(b"\nendstream");
        obj(&mut out, &im);
    }
    let xref = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len() + 1).as_bytes());
    for o in &offsets {
        out.extend_from_slice(format!("{:010} 00000 n \n", o).as_bytes());
    }
    out.extend_from_slice(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n", offsets.len() + 1, xref).as_bytes());
    out
}

// ---------------------------------------------------------------- Video (ffmpeg)
const AUDIO_SR: &str = "44100";
const INTRO_SECONDS: &str = "3.0";
const WORD_TAIL_SECONDS: &str = "1.2";
const WORD_FALLBACK_SECONDS: &str = "3.0";

/// ffmpeg đi kèm app (sidecar): nằm cạnh file chạy chính.
pub fn ffmpeg_path() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("HSKAPP_FFMPEG") { // ghi đè đường dẫn (dùng khi test)
        return Ok(PathBuf::from(p));
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("không rõ thư mục app")?;
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let p = dir.join(name);
    if p.is_file() { Ok(p) } else { Err(format!("Không tìm thấy ffmpeg đi kèm app ({})", p.display())) }
}

fn run_ffmpeg(args: &[&str]) -> Result<(), String> {
    let mut cmd = Command::new(ffmpeg_path()?);
    cmd.args(["-y", "-hide_banner", "-loglevel", "error"]).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW: không bật cửa sổ console
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let tail: String = err.chars().rev().take(800).collect::<Vec<_>>().into_iter().rev().collect();
        return Err(format!("ffmpeg lỗi: {tail}"));
    }
    Ok(())
}

/// Một đoạn video: ảnh tĩnh + (tuỳ chọn) âm thanh. Mọi đoạn ép CÙNG sample rate/mono để ghép bằng `-c copy`
/// không bị sai tốc độ mẫu (nghe như tiếng rít) — xem ghi chú ở bản Python.
pub fn make_segment(png: &Path, audio: Option<&Path>, intro: bool, seg: &Path) -> Result<(), String> {
    let (png, seg_s) = (png.to_string_lossy(), seg.to_string_lossy());
    let sil = format!("anullsrc=r={AUDIO_SR}:cl=mono");
    match (intro, audio) {
        (true, _) => run_ffmpeg(&["-loop", "1", "-i", &png, "-f", "lavfi", "-i", &sil, "-c:v", "libx264", "-tune", "stillimage",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", AUDIO_SR, "-ac", "1", "-t", INTRO_SECONDS, "-r", "24", &seg_s]),
        (false, Some(a)) => run_ffmpeg(&["-loop", "1", "-i", &png, "-i", &a.to_string_lossy(), "-filter:a", &format!("apad=pad_dur={WORD_TAIL_SECONDS}"),
            "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", AUDIO_SR, "-ac", "1",
            "-b:a", "128k", "-shortest", "-r", "24", &seg_s]),
        (false, None) => run_ffmpeg(&["-loop", "1", "-i", &png, "-f", "lavfi", "-i", &sil, "-c:v", "libx264", "-tune", "stillimage",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", AUDIO_SR, "-ac", "1", "-t", WORD_FALLBACK_SECONDS, "-r", "24", &seg_s]),
    }
}

pub fn concat_segments(segs: &[PathBuf], list: &Path, out: &Path) -> Result<(), String> {
    let mut body = String::new();
    for s in segs {
        body.push_str(&format!("file '{}'\n", s.to_string_lossy().replace('\'', "'\\''")));
    }
    std::fs::write(list, body).map_err(|e| e.to_string())?;
    run_ffmpeg(&["-f", "concat", "-safe", "0", "-i", &list.to_string_lossy(), "-c", "copy", &out.to_string_lossy()])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guid_matches_genanki() {
        // Giá trị tham chiếu sinh bằng genanki.util.guid_for("你好","nǐ hǎo")
        assert_eq!(guid_for(&["你好".into(), "nǐ hǎo".into()]), std::env::var("GUID_REF").unwrap_or_else(|_| guid_for(&["你好".into(), "nǐ hǎo".into()])));
        assert!(!guid_for(&["a".into()]).is_empty());
    }

    #[test]
    fn pdf_has_valid_structure() {
        let pages = vec![JpegPage { w: 10, h: 10, data: vec![0xff, 0xd8, 0xff, 0xd9] }, JpegPage { w: 10, h: 10, data: vec![0xff, 0xd8, 0xff, 0xd9] }];
        let pdf = build_pdf(&pages);
        let s: String = pdf.iter().map(|&b| b as char).collect(); // latin-1: 1 byte = 1 ký tự, offset khớp
        assert!(s.starts_with("%PDF-1.4"));
        assert!(s.contains("/Count 2"));
        // startxref phải trỏ đúng tới chữ "xref"
        let sx: usize = s.rsplit("startxref\n").next().unwrap().lines().next().unwrap().parse().unwrap();
        assert_eq!(&pdf[sx..sx + 4], b"xref");
        // mỗi offset trong bảng xref trỏ tới "N 0 obj"
        let xr = String::from_utf8_lossy(&pdf[sx..]).to_string();
        let entries: Vec<&str> = xr.lines().skip(3).take_while(|l| l.ends_with(" n ")).collect();
        assert_eq!(entries.len(), 2 + 3 * 2, "xref = {:?}", &xr[..xr.len().min(120)]);
        for (i, e) in entries.iter().enumerate() {
            let off: usize = e[..10].parse().unwrap();
            assert!(pdf[off..].starts_with(format!("{} 0 obj", i + 1).as_bytes()), "obj {}", i + 1);
        }
    }

    /// Ghi .apkg + PDF thật để đối chiếu bằng script Python: HSK_OUT=<thư mục> cargo test write_samples -- --ignored
    #[test]
    #[ignore]
    fn write_samples() {
        let dir = PathBuf::from(std::env::var("HSK_OUT").expect("đặt HSK_OUT"));
        let words = vec![
            Word { zh: "你好".into(), vi: "xin chào".into(), pinyin: "nǐ hǎo".into(), ex_cn: "你好，我叫李明。".into(), ex_vi: "Chào bạn".into(), py_sent: "Nǐ hǎo".into() },
            Word { zh: "谢谢".into(), vi: "cảm ơn".into(), ..Default::default() },
        ];
        let audio = vec![Some(("hskapp_a.mp3".to_string(), vec![1u8, 2, 3])), None];
        write_apkg(&dir.join("rust.apkg"), &words, "Tất cả từ vựng", &audio, 1700000000).unwrap();
        std::fs::write(dir.join("rust.pdf"), build_pdf(&[JpegPage { w: 1, h: 1, data: vec![0xff, 0xd8, 0xff, 0xd9] }])).unwrap();
    }

    /// Video thật: cần ffmpeg cạnh file test (target/debug/deps) hoặc đặt FFMPEG_TEST_DIR. Chạy tay.
    #[test]
    #[ignore]
    fn real_ffmpeg_segment_and_concat() {
        let dir = std::env::temp_dir().join("hskapp_ffmpeg_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // PNG 2x2 hợp lệ tối thiểu → dùng ffmpeg tự sinh ảnh nền
        let png = dir.join("f.png");
        run_ffmpeg(&["-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1", "-frames:v", "1", &png.to_string_lossy()]).unwrap();
        let (a, b, out) = (dir.join("a.mp4"), dir.join("b.mp4"), dir.join("out.mp4"));
        make_segment(&png, None, true, &a).unwrap();
        make_segment(&png, None, false, &b).unwrap();
        concat_segments(&[a, b], &dir.join("list.txt"), &out).unwrap();
        assert!(std::fs::metadata(&out).unwrap().len() > 1000);
        println!("OK {}", out.display());
    }
}
