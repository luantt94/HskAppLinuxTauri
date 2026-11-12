//! Port của auth/license_manager.py + auth/license_crypto.py.
//! Key có dạng `<digit-key>.<chữ ký Ed25519 base64url>`; định dạng, payload ký và
//! cách tính mã máy giữ NGUYÊN để key đang bán cho khách vẫn hợp lệ.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use super::qsettings;

pub const APP_ID: i64 = 1101;

/// Public key (hex) — trùng với auth/license_crypto.py. Private key KHÔNG ở đây.
pub const PUBLIC_KEY_HEX: &str = "190838a471216426910ec7527dc077ec22c20132608e44002ed647df70dd5070";

const KEY_MULTIPLIERS: [u32; 8] = [8, 3, 8, 6, 8, 3, 8, 6];

fn decode_hex32(s: &str) -> Option<[u8; 32]> {
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(s.get(i * 2..i * 2 + 2)?, 16).ok()?;
    }
    Some(out)
}

fn payload(app_id: i64, machine_sum: i64) -> String {
    format!("{:04}:{}", app_id, machine_sum)
}

pub fn verify_signature_with(public_key_hex: &str, app_id: i64, machine_sum: i64, signature_b64: &str) -> bool {
    let Some(pk_bytes) = decode_hex32(public_key_hex) else { return false };
    let Ok(pk) = VerifyingKey::from_bytes(&pk_bytes) else { return false };
    let Ok(sig_bytes) = URL_SAFE_NO_PAD.decode(signature_b64.trim_end_matches('=')) else { return false };
    let Ok(sig) = Signature::from_slice(&sig_bytes) else { return false };
    pk.verify(payload(app_id, machine_sum).as_bytes(), &sig).is_ok()
}

pub fn verify_signature(app_id: i64, machine_sum: i64, signature_b64: &str) -> bool {
    verify_signature_with(PUBLIC_KEY_HEX, app_id, machine_sum, signature_b64)
}

/// Định danh máy: macOS IOPlatformUUID, Windows MachineGuid — như bản Python.
pub fn machine_guid() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                if line.contains("IOPlatformUUID") {
                    let parts: Vec<&str> = line.split('"').collect();
                    if parts.len() >= 2 {
                        return parts[parts.len() - 2].to_string();
                    }
                }
            }
        }
        return "UNKNOWN".into();
    }
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_LOCAL_MACHINE, RegKey};
        return RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey("SOFTWARE\\Microsoft\\Cryptography")
            .and_then(|k| k.get_value::<String, _>("MachineGuid"))
            .unwrap_or_else(|_| "UNKNOWN".into());
    }
    #[allow(unreachable_code)]
    "UNKNOWN".into()
}

/// Tổng mã ASCII (Python `ord`, ở đây là điểm mã Unicode — GUID chỉ có ASCII).
pub fn ascii_sum(text: &str) -> i64 {
    text.chars().map(|c| c as i64).sum()
}

/// Chuỗi khách gửi cho người bán: App ID 4 số + tổng ASCII của mã máy.
pub fn generate_sum(app_id: i64) -> String {
    format!("{:04}{}", app_id, ascii_sum(&machine_guid()))
}

pub fn generate_key(app_id: i64, machine_sum: i64) -> String {
    let combined = format!("{:04}{}", app_id, machine_sum);
    combined
        .chars()
        .enumerate()
        .map(|(i, ch)| {
            let d = ch.to_digit(10).unwrap_or(0);
            let v = (d * KEY_MULTIPLIERS[i % KEY_MULTIPLIERS.len()] % 10 + 5) % 10;
            char::from_digit(v, 10).unwrap()
        })
        .collect()
}

pub fn verify_key_for(machine_sum: i64, app_id: i64, input_key: &str) -> bool {
    let input_key = input_key.trim();
    let Some((digit_part, signature_part)) = input_key.split_once('.') else { return false };
    if digit_part != generate_key(app_id, machine_sum) {
        return false;
    }
    verify_signature(app_id, machine_sum, signature_part)
}

pub fn verify_key(app_id: i64, input_key: &str) -> bool {
    verify_key_for(ascii_sum(&machine_guid()), app_id, input_key)
}

// ---- lưu/đọc license (cùng khoá với bản Python) ----

pub fn save_license(app_id: i64, key: &str, guid_sum: &str) {
    qsettings::set_int("license/AppID", app_id);
    qsettings::set_str("license/LicenseKey", key);
    qsettings::set_str("license/GUIDSum", guid_sum);
}

pub fn load_license() -> Option<(i64, String)> {
    let app_id = qsettings::get("license/AppID")?.parse().ok()?;
    let key = qsettings::get("license/LicenseKey")?;
    Some((app_id, key))
}

pub fn failed_attempts(app_id: i64) -> i64 {
    qsettings::get(&format!("license/FailedAttempts_{app_id}"))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}

pub fn increment_failed_attempts(app_id: i64) -> i64 {
    let n = failed_attempts(app_id) + 1;
    qsettings::set_int(&format!("license/FailedAttempts_{app_id}"), n);
    n
}

pub fn reset_failed_attempts(app_id: i64) {
    qsettings::set_int(&format!("license/FailedAttempts_{app_id}"), 0);
}

pub fn is_activated() -> bool {
    match load_license() {
        Some((stored, key)) => stored == APP_ID && verify_key(APP_ID, &key),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Vector sinh bằng Python (cryptography) với seed = bytes(range(32)),
    // ký payload "1101:2023" — chứng minh Rust verify được chữ ký bản Python tạo.
    const TEST_PUB: &str = "03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8";
    const TEST_SIG: &str = "SBY-g8vV8E0PkDcTtdp-3gr_-M_4GgTFtiGSkieognbz0BHMEKYCeZVb2NeQSnIT9tq-b4uDBgq8AehHKPLZCQ";

    #[test]
    fn verifies_python_signature() {
        assert!(verify_signature_with(TEST_PUB, 1101, 2023, TEST_SIG));
    }

    #[test]
    fn rejects_other_machine_or_tampered_sig() {
        assert!(!verify_signature_with(TEST_PUB, 1101, 2024, TEST_SIG));
        assert!(!verify_signature_with(TEST_PUB, 1101, 2023, "AAAA"));
        assert!(!verify_signature_with(TEST_PUB, 1101, 2023, ""));
    }

    #[test]
    fn digit_key_matches_python() {
        // Giá trị do bản Python in ra: LicenseManager.generate_key(1101, 2023)
        assert_eq!(generate_key(1101, 2023), "38511513");
    }

    #[test]
    fn key_without_dot_is_rejected() {
        assert!(!verify_key_for(2023, 1101, &generate_key(1101, 2023)));
    }

    /// Chạy tay: `cargo test real_machine -- --ignored --nocapture`
    /// Đọc license thật bản Python đã lưu trên máy này (chỉ đọc, không in key).
    #[test]
    #[ignore]
    fn real_machine_license_is_recognized() {
        println!("machine_code = {}", generate_sum(APP_ID));
        println!("loaded license = {}", load_license().is_some());
        println!("is_activated = {}", is_activated());
        println!("trial remaining = {}", super::super::trial::remaining_seconds_today());
    }
}
