//! Đọc tiếng bằng Edge TTS (cùng giọng với bản Python: zh-CN-XiaoxiaoNeural, vi-VN-HoaiMyNeural).
//! Trả về mp3 (base64) để giao diện phát bằng <audio>. Có cache trên đĩa theo (giọng, văn bản)
//! nên từ đã đọc rồi phát lại ngay, không cần mạng.

use base64::{engine::general_purpose::STANDARD, Engine};
use msedge_tts::tts::{client::connect, SpeechConfig};
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::PathBuf,
};

pub const VOICE_ZH: &str = "zh-CN-XiaoxiaoNeural";
pub const VOICE_VI: &str = "vi-VN-HoaiMyNeural";
const RATE_PERCENT: i32 = -5;

fn cache_path(voice: &str, text: &str) -> PathBuf {
    let mut h = DefaultHasher::new(); // SipHash khoá cố định -> ổn định giữa các lần chạy
    (voice, text).hash(&mut h);
    let dir = std::env::temp_dir().join("hskapp_tts_cache");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(format!("{:016x}.mp3", h.finish()))
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Đồng bộ (blocking) — gọi trong spawn_blocking, không gọi thẳng từ luồng UI.
pub fn synthesize(text: &str, voice: &str) -> Result<Vec<u8>, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("văn bản rỗng".into());
    }
    let path = cache_path(voice, text);
    if let Ok(bytes) = std::fs::read(&path) {
        if bytes.len() > 1024 {
            return Ok(bytes);
        }
        let _ = std::fs::remove_file(&path); // cache hỏng/rỗng -> tổng hợp lại
    }
    let config = SpeechConfig {
        voice_name: voice.to_string(),
        audio_format: "audio-24khz-48kbitrate-mono-mp3".into(),
        pitch: 0,
        rate: RATE_PERCENT,
        volume: 0,
    };
    let mut client = connect().map_err(|e| format!("không kết nối được Edge TTS: {e}"))?;
    let audio = client
        .synthesize(&escape_xml(text), &config)
        .map_err(|e| format!("Edge TTS lỗi: {e}"))?;
    if audio.audio_bytes.len() <= 1024 {
        return Err("Edge TTS trả về âm thanh rỗng".into());
    }
    let _ = std::fs::write(&path, &audio.audio_bytes);
    Ok(audio.audio_bytes)
}

/// Âm thanh trả về giao diện: mime + base64.
#[derive(serde::Serialize)]
pub struct Audio {
    pub mime: &'static str,
    pub b64: String,
}

/// Edge TTS (online) trước; lỗi (mất mạng...) thì Windows rơi về SAPI offline cho giọng tiếng Trung.
/// Trả về (nội dung, đuôi file) — SAPI cho .wav, Edge cho .mp3.
pub fn synthesize_any(text: &str, voice: &str) -> Result<(Vec<u8>, &'static str), String> {
    match synthesize(text, voice) {
        Ok(b) => Ok((b, "mp3")),
        Err(e) => {
            if voice.starts_with("zh-") {
                if let Ok(b) = sapi::synthesize_wav(text) {
                    return Ok((b, "wav"));
                }
            }
            Err(e)
        }
    }
}

pub fn synthesize_audio(text: &str, voice: &str) -> Result<Audio, String> {
    let (bytes, ext) = synthesize_any(text, voice)?;
    Ok(Audio { mime: if ext == "wav" { "audio/wav" } else { "audio/mpeg" }, b64: STANDARD.encode(bytes) })
}

/// SAPI offline (chỉ Windows, chỉ khi máy có giọng tiếng Trung — không thì im lặng thay vì đọc lơ lớ sai ngôn ngữ).
mod sapi {
    #[cfg(windows)]
    pub fn synthesize_wav(text: &str) -> Result<Vec<u8>, String> {
        use std::os::windows::process::CommandExt;
        let dir = std::env::temp_dir();
        let id = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        let (txt, wav) = (dir.join(format!("hskapp_sapi_{id}.txt")), dir.join(format!("hskapp_sapi_{id}.wav")));
        std::fs::write(&txt, text.as_bytes()).map_err(|e| e.to_string())?;
        let script = format!(
            "$ErrorActionPreference='Stop';$t=Get-Content -Raw -Encoding UTF8 -Path '{txt}';$v=New-Object -ComObject SAPI.SpVoice;\
$zh=$v.GetVoices()|Where-Object{{$_.GetAttribute('Language') -match '804' -or $_.GetDescription() -match 'Chinese|Mandarin|Yaoyao|Huihui|Kangkang'}}|Select-Object -First 1;\
if($zh){{$v.Voice=$zh;$v.Rate=-1;$f=New-Object -ComObject SAPI.SpAudioFormat;$f.Type=22;$s=New-Object -ComObject SAPI.SpFileStream;$s.Format=$f;$s.Open('{wav}',3,$false);$v.AudioOutputStream=$s;$v.Speak($t)|Out-Null;$s.Close()}}",
            txt = txt.display(), wav = wav.display());
        let status = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .status();
        let _ = std::fs::remove_file(&txt);
        let bytes = std::fs::read(&wav).map_err(|_| "SAPI: máy không có giọng tiếng Trung".to_string());
        let _ = std::fs::remove_file(&wav);
        status.map_err(|e| e.to_string())?;
        bytes.and_then(|b| if b.len() > 1024 { Ok(b) } else { Err("SAPI: âm thanh rỗng".into()) })
    }

    #[cfg(not(windows))]
    pub fn synthesize_wav(_text: &str) -> Result<Vec<u8>, String> {
        Err("SAPI chỉ có trên Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_path_is_stable_and_voice_specific() {
        assert_eq!(cache_path(VOICE_ZH, "你好"), cache_path(VOICE_ZH, "你好"));
        assert_ne!(cache_path(VOICE_ZH, "你好"), cache_path(VOICE_VI, "你好"));
    }

    /// Chạy tay (cần mạng): `cargo test real_tts -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_tts_returns_mp3() {
        let b = synthesize("你好", VOICE_ZH).unwrap();
        println!("mp3 bytes = {}, header = {:02x?}", b.len(), &b[..3]);
        assert!(b.len() > 1024);
    }
}
