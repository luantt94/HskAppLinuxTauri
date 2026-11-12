//! Đọc/ghi cùng nơi lưu mà QSettings("HskApp", "HskApp") của bản Python đang dùng,
//! để license, thời gian dùng thử và cài đặt cũ của khách vẫn dùng được sau khi
//! chuyển sang Tauri.
//!
//! - macOS: `~/Library/Preferences/com.hskapp.HskApp.plist`, Qt đổi `/` thành `.`
//!   trong tên key (vd `license/AppID` -> `license.AppID`). Đi qua lệnh `defaults`
//!   để không bị lệch với bộ nhớ đệm cfprefsd.
//! - Windows: Registry `HKCU\Software\HskApp\HskApp`, `/` thành `\` (subkey).

#[cfg(target_os = "macos")]
mod imp {
    use std::process::Command;

    const DOMAIN: &str = "com.hskapp.HskApp";

    fn plist_key(key: &str) -> String {
        key.replace('/', ".")
    }

    /// Đọc qua `defaults export` (XML plist) thay vì `defaults read` — `read` làm hỏng
    /// chuỗi có dấu tiếng Việt (thoát mã bát phân), còn plist thì đúng UTF-8.
    pub fn get(key: &str) -> Option<String> {
        let out = Command::new("defaults").args(["export", DOMAIN, "-"]).output().ok()?;
        if !out.status.success() {
            return None;
        }
        parse_value(&out.stdout, &plist_key(key))
    }

    pub fn parse_value(xml: &[u8], plist_key: &str) -> Option<String> {
        let dict = plist::Value::from_reader_xml(std::io::Cursor::new(xml)).ok()?.into_dictionary()?;
        match dict.get(plist_key)? {
            plist::Value::String(s) => Some(s.clone()),
            plist::Value::Integer(i) => Some(i.to_string()),
            plist::Value::Real(r) => Some(r.to_string()),
            plist::Value::Boolean(b) => Some(b.to_string()),
            _ => None,
        }
    }

    pub fn set_int(key: &str, value: i64) -> bool {
        run_write(key, "-int", &value.to_string())
    }

    pub fn set_str(key: &str, value: &str) -> bool {
        run_write(key, "-string", value)
    }

    fn run_write(key: &str, kind: &str, value: &str) -> bool {
        Command::new("defaults")
            .args(["write", DOMAIN, &plist_key(key), kind, value])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

#[cfg(windows)]
mod imp {
    use winreg::enums::*;
    use winreg::RegKey;

    fn open(key: &str, write: bool) -> Option<(RegKey, String)> {
        let root = RegKey::predef(HKEY_CURRENT_USER);
        let (path, name) = match key.rsplit_once('/') {
            Some((dir, name)) => (format!("Software\\HskApp\\HskApp\\{}", dir.replace('/', "\\")), name),
            None => ("Software\\HskApp\\HskApp".to_string(), key),
        };
        let sub = if write {
            root.create_subkey(&path).ok()?.0
        } else {
            root.open_subkey(&path).ok()?
        };
        Some((sub, name.to_string()))
    }

    pub fn get(key: &str) -> Option<String> {
        let (sub, name) = open(key, false)?;
        // Qt ghi số nguyên là REG_DWORD, chuỗi là REG_SZ
        if let Ok(v) = sub.get_value::<u32, _>(&name) {
            return Some(v.to_string());
        }
        sub.get_value::<String, _>(&name).ok()
    }

    pub fn set_int(key: &str, value: i64) -> bool {
        open(key, true)
            .map(|(sub, name)| sub.set_value(&name, &(value as u32)).is_ok())
            .unwrap_or(false)
    }

    pub fn set_str(key: &str, value: &str) -> bool {
        open(key, true)
            .map(|(sub, name)| sub.set_value(&name, &value.to_string()).is_ok())
            .unwrap_or(false)
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    pub fn get(_key: &str) -> Option<String> { None }
    pub fn set_int(_key: &str, _value: i64) -> bool { false }
    pub fn set_str(_key: &str, _value: &str) -> bool { false }
}

pub use imp::{get, set_int, set_str};

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::imp::parse_value;

    #[test]
    fn parses_unicode_string_int_and_bool() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>a</key><string>["在 + V — Đang làm gì"]</string>
<key>n</key><integer>1101</integer>
<key>b</key><true/>
</dict></plist>"#;
        assert_eq!(parse_value(xml.as_bytes(), "a").as_deref(), Some("[\"在 + V — Đang làm gì\"]"));
        assert_eq!(parse_value(xml.as_bytes(), "n").as_deref(), Some("1101"));
        assert_eq!(parse_value(xml.as_bytes(), "b").as_deref(), Some("true"));
        assert_eq!(parse_value(xml.as_bytes(), "zz"), None);
    }

    /// cargo test real_unicode -- --ignored --nocapture
    #[test]
    #[ignore]
    fn real_unicode_setting_is_readable() {
        let v = super::get("Grammar/order/HSK2").expect("không đọc được");
        println!("{}", &v.chars().take(80).collect::<String>());
        assert!(v.contains("Đang làm gì"));
    }
}
