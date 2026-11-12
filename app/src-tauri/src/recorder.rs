//! Ghi âm từ micro (port của phần ghi âm trong games/game_pronunciation.py).
//! - Tự dừng sau 6s, hoặc 1,2s im lặng SAU KHI đã nghe thấy tiếng nói.
//! - Cắt khoảng lặng đầu/cuối (chừa 150ms), trả về WAV 16-bit mono + 60 cột sóng âm.
//! Làm ở Rust (cpal) thay vì getUserMedia của webview để không phụ thuộc quyền micro của WebView.

use base64::{engine::general_purpose::STANDARD, Engine};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const MAX_RECORD_MS: u128 = 6000;
const AUTO_STOP_SILENCE_MS: u128 = 1200;
const SILENCE_THRESHOLD: f32 = 0.02;
const SILENCE_PAD_MS: u32 = 150;
const MAX_BARS: usize = 60;

#[derive(Default)]
struct Shared {
    samples: Vec<i16>,
    rate: u32,
    heard: bool,
    last_loud: Option<Instant>,
    level: f32,
    stop: bool,
    done: bool,
    error: Option<String>,
    started: Option<Instant>,
}

static ACTIVE: Mutex<Option<Arc<Mutex<Shared>>>> = Mutex::new(None);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub recording: bool,
    pub level: f32,
    pub elapsed_ms: u128,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recording {
    pub wav_base64: String,
    pub peaks: Vec<f32>,
    pub duration_ms: u32,
}

fn feed<T>(data: &[T], channels: usize, shared: &Arc<Mutex<Shared>>)
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let mut s = shared.lock().unwrap();
    let mut peak = 0f32;
    for frame in data.chunks(channels.max(1)) {
        let mono: f32 = frame.iter().map(|&x| f32::from_sample(x)).sum::<f32>() / frame.len() as f32;
        peak = peak.max(mono.abs());
        s.samples.push((mono.clamp(-1.0, 1.0) * 32767.0) as i16);
    }
    s.level = peak;
    if peak >= SILENCE_THRESHOLD {
        s.heard = true;
        s.last_loud = Some(Instant::now());
    }
}

fn run(shared: Arc<Mutex<Shared>>) {
    let fail = |msg: String| {
        let mut s = shared.lock().unwrap();
        s.error = Some(msg);
        s.done = true;
    };
    let host = cpal::default_host();
    let Some(device) = host.default_input_device() else { return fail("Không tìm thấy micro".into()) };
    let config = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => return fail(format!("Không đọc được cấu hình micro: {e}")),
    };
    let channels = config.channels() as usize;
    shared.lock().unwrap().rate = config.sample_rate() as u32;
    let sh = shared.clone();
    let err_fn = |e| eprintln!("[recorder] lỗi luồng: {e}");
    let cfg = config.clone().into();
    let stream = match config.sample_format() {
        SampleFormat::F32 => device.build_input_stream(cfg, move |d: &[f32], _: &_| feed(d, channels, &sh), err_fn, None),
        SampleFormat::I16 => device.build_input_stream(cfg, move |d: &[i16], _: &_| feed(d, channels, &sh), err_fn, None),
        SampleFormat::I32 => device.build_input_stream(cfg, move |d: &[i32], _: &_| feed(d, channels, &sh), err_fn, None),
        other => return fail(format!("Định dạng âm thanh chưa hỗ trợ: {other}")),
    };
    let stream = match stream {
        Ok(s) => s,
        Err(e) => return fail(format!("Không mở được micro (đã cấp quyền chưa?): {e}")),
    };
    if let Err(e) = stream.play() {
        return fail(format!("Không bắt đầu ghi được: {e}"));
    }
    shared.lock().unwrap().started = Some(Instant::now());
    loop {
        std::thread::sleep(Duration::from_millis(20));
        let s = shared.lock().unwrap();
        let elapsed = s.started.map(|t| t.elapsed().as_millis()).unwrap_or(0);
        let silent_after_speech = s.heard && s.last_loud.is_some_and(|t| t.elapsed().as_millis() >= AUTO_STOP_SILENCE_MS);
        if s.stop || elapsed >= MAX_RECORD_MS || silent_after_speech {
            break;
        }
    }
    drop(stream);
    shared.lock().unwrap().done = true;
}

pub fn start() -> Result<(), String> {
    let mut active = ACTIVE.lock().unwrap();
    if let Some(a) = active.as_ref() {
        if !a.lock().unwrap().done {
            return Err("Đang ghi âm rồi".into());
        }
    }
    let shared = Arc::new(Mutex::new(Shared::default()));
    *active = Some(shared.clone());
    std::thread::spawn(move || run(shared));
    Ok(())
}

pub fn status() -> Status {
    match ACTIVE.lock().unwrap().as_ref() {
        Some(a) => {
            let s = a.lock().unwrap();
            Status {
                recording: !s.done,
                level: s.level,
                elapsed_ms: s.started.map(|t| t.elapsed().as_millis()).unwrap_or(0),
                error: s.error.clone(),
            }
        }
        None => Status { recording: false, level: 0.0, elapsed_ms: 0, error: None },
    }
}

/// Dừng (nếu đang ghi) và trả về bản ghi đã cắt khoảng lặng.
pub fn stop() -> Result<Recording, String> {
    let shared = ACTIVE.lock().unwrap().take().ok_or("Chưa ghi âm")?;
    shared.lock().unwrap().stop = true;
    for _ in 0..100 {
        if shared.lock().unwrap().done {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let s = shared.lock().unwrap();
    if let Some(e) = &s.error {
        return Err(e.clone());
    }
    if s.samples.is_empty() {
        return Err("Không ghi được âm thanh".into());
    }
    let trimmed = trim_silence(&s.samples, s.rate);
    Ok(Recording {
        wav_base64: STANDARD.encode(wav_bytes(trimmed, s.rate)),
        peaks: peaks(trimmed, MAX_BARS),
        duration_ms: (trimmed.len() as u64 * 1000 / s.rate.max(1) as u64) as u32,
    })
}

/// Chỉ giữ phần có tiếng nói (biên độ vượt ngưỡng) + chừa 150ms hai bên; cả đoạn im lặng thì giữ nguyên.
pub fn trim_silence(samples: &[i16], rate: u32) -> &[i16] {
    let thresh = SILENCE_THRESHOLD * 32768.0;
    let loud = |s: &i16| (*s as f32).abs() >= thresh;
    let Some(start) = samples.iter().position(loud) else { return samples };
    let end = samples.iter().rposition(loud).unwrap();
    let pad = (rate as u64 * SILENCE_PAD_MS as u64 / 1000) as usize;
    let start = start.saturating_sub(pad);
    let end = (end + pad).min(samples.len() - 1);
    if start >= end { samples } else { &samples[start..=end] }
}

/// Chia đều thành `bars` phần, mỗi phần lấy biên độ đỉnh (0..1) — để vẽ sóng âm tĩnh.
pub fn peaks(samples: &[i16], bars: usize) -> Vec<f32> {
    if samples.is_empty() || bars == 0 {
        return vec![];
    }
    let chunk = samples.len().div_ceil(bars);
    samples
        .chunks(chunk)
        .map(|c| c.iter().map(|s| (*s as f32).abs() / 32768.0).fold(0.0, f32::max))
        .collect()
}

pub fn wav_bytes(samples: &[i16], rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut v = Vec::with_capacity(44 + data_len as usize);
    v.extend_from_slice(b"RIFF");
    v.extend_from_slice(&(36 + data_len).to_le_bytes());
    v.extend_from_slice(b"WAVEfmt ");
    v.extend_from_slice(&16u32.to_le_bytes()); // kích thước khối fmt
    v.extend_from_slice(&1u16.to_le_bytes()); // PCM
    v.extend_from_slice(&1u16.to_le_bytes()); // mono
    v.extend_from_slice(&rate.to_le_bytes());
    v.extend_from_slice(&(rate * 2).to_le_bytes()); // byte rate
    v.extend_from_slice(&2u16.to_le_bytes()); // block align
    v.extend_from_slice(&16u16.to_le_bytes()); // bit/mẫu
    v.extend_from_slice(b"data");
    v.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        v.extend_from_slice(&s.to_le_bytes());
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_leading_and_trailing_silence_with_padding() {
        let mut s = vec![0i16; 16000];
        s.extend(std::iter::repeat(10000).take(800)); // 50ms tiếng nói ở 16k
        s.extend(vec![0i16; 16000]);
        let t = trim_silence(&s, 16000);
        let pad = 16000 * 150 / 1000;
        assert_eq!(t.len(), 800 + 2 * pad);
    }

    #[test]
    fn all_silent_is_kept() {
        let s = vec![0i16; 1000];
        assert_eq!(trim_silence(&s, 16000).len(), 1000);
    }

    #[test]
    fn wav_header_is_valid() {
        let w = wav_bytes(&[1, -1, 2], 16000);
        assert_eq!(&w[0..4], b"RIFF");
        assert_eq!(&w[8..16], b"WAVEfmt ");
        assert_eq!(u32::from_le_bytes(w[40..44].try_into().unwrap()), 6);
        assert_eq!(w.len(), 44 + 6);
    }

    #[test]
    fn peaks_split_evenly() {
        let s: Vec<i16> = (0..100).map(|i| if i == 50 { 16384 } else { 0 }).collect();
        let p = peaks(&s, 10);
        assert_eq!(p.len(), 10);
        assert!((p[5] - 0.5).abs() < 0.01 && p[0] == 0.0);
    }
}
