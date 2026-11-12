//! Đọc gói đề thi mã hoá `.hskpack` (port của core/exam_vault.py; tương thích các gói đã tạo bằng Python).
//! Cấu trúc: MAGIC(8) | salt(16) | index_len(4, big-endian) | index_blob | các blob dữ liệu...
//! blob = nonce(12) + ciphertext + tag(16); AAD = đường dẫn tương đối của mục.
//! Khoá gói = HKDF-SHA256(khoá gốc, salt, info="hskpack-v1"). Khoá gốc nằm trong binary đã biên dịch
//! (khó dịch ngược hơn nhiều so với bytecode Python, nhưng vẫn chỉ là lớp rào cản, không tuyệt đối).

use aes_gcm::{aead::{Aead, KeyInit, Payload}, Aes256Gcm, Nonce};
use hkdf::Hkdf;
use serde::Deserialize;
use sha2::Sha256;
use std::{collections::HashMap, fs::File, io::{Read, Seek, SeekFrom}, path::Path};

pub const PACK_EXT: &str = ".hskpack";
const MAGIC: &[u8; 8] = b"HSKPACK1";
const NONCE_LEN: usize = 12;
const SALT_LEN: usize = 16;

const A: [[u8; 8]; 4] = [
    [0xbd, 0x20, 0x0f, 0x2a, 0x53, 0xa1, 0x92, 0x6f], [0xa0, 0x44, 0xff, 0xfb, 0x70, 0x61, 0x49, 0x7e],
    [0xa8, 0xf4, 0x38, 0xf8, 0x1a, 0xf5, 0xb1, 0xc2], [0x0d, 0x50, 0xb6, 0xbb, 0x70, 0x3e, 0xf1, 0x0f],
];
const B: [[u8; 8]; 4] = [
    [0x9c, 0xa8, 0x04, 0xad, 0x07, 0x19, 0xb8, 0x1e], [0x5d, 0xc9, 0x4a, 0x7c, 0x0c, 0x92, 0x6b, 0xf0],
    [0x75, 0x3d, 0xa0, 0x17, 0x68, 0x20, 0xf4, 0xd5], [0xa8, 0x44, 0x62, 0x5b, 0x64, 0x0c, 0x52, 0xd1],
];

fn master_key() -> [u8; 32] {
    let mut k = [0u8; 32];
    for i in 0..4 {
        for j in 0..8 {
            k[i * 8 + j] = A[i][j] ^ B[i][j];
        }
    }
    k
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct Meta {
    pub name: Option<String>,
    pub title: Option<String>,
    pub level: Option<i64>,
}

#[derive(Deserialize)]
struct RawIndex {
    #[serde(default)]
    meta: Meta,
    #[serde(default)]
    files: HashMap<String, (u64, u64)>,
}

pub struct Pack {
    path: std::path::PathBuf,
    aes: Aes256Gcm,
    data_start: u64,
    pub meta: Meta,
    files: HashMap<String, (u64, u64)>,
}

fn open_blob(aes: &Aes256Gcm, blob: &[u8], aad: &str) -> Result<Vec<u8>, String> {
    if blob.len() < NONCE_LEN + 16 {
        return Err(format!("Gói đề bị hỏng ({aad})"));
    }
    let nonce = Nonce::try_from(&blob[..NONCE_LEN]).map_err(|_| format!("Gói đề bị hỏng ({aad})"))?;
    aes.decrypt(&nonce, Payload { msg: &blob[NONCE_LEN..], aad: aad.as_bytes() })
        .map_err(|_| format!("Gói đề bị hỏng hoặc sai khoá ({aad})"))
}

impl Pack {
    pub fn open(path: &Path) -> Result<Pack, String> {
        let mut f = File::open(path).map_err(|e| e.to_string())?;
        let mut head = [0u8; 8 + SALT_LEN + 4];
        f.read_exact(&mut head).map_err(|_| "Không phải gói đề hợp lệ".to_string())?;
        if &head[..8] != MAGIC {
            return Err("Không phải gói đề hợp lệ".into());
        }
        let salt = &head[8..8 + SALT_LEN];
        let index_len = u32::from_be_bytes(head[head.len() - 4..].try_into().unwrap()) as usize;
        let mut index_blob = vec![0u8; index_len];
        f.read_exact(&mut index_blob).map_err(|e| e.to_string())?;
        let data_start = f.stream_position().map_err(|e| e.to_string())?;

        let mut key = [0u8; 32];
        Hkdf::<Sha256>::new(Some(salt), &master_key()).expand(b"hskpack-v1", &mut key).map_err(|e| e.to_string())?;
        let aes = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
        let raw: RawIndex = serde_json::from_slice(&open_blob(&aes, &index_blob, "__index__")?).map_err(|e| e.to_string())?;
        Ok(Pack { path: path.to_path_buf(), aes, data_start, meta: raw.meta, files: raw.files })
    }

    pub fn has(&self, rel: &str) -> bool {
        self.files.contains_key(rel)
    }

    pub fn read(&self, rel: &str) -> Result<Option<Vec<u8>>, String> {
        let Some(&(offset, length)) = self.files.get(rel) else { return Ok(None) };
        let mut f = File::open(&self.path).map_err(|e| e.to_string())?;
        f.seek(SeekFrom::Start(self.data_start + offset)).map_err(|e| e.to_string())?;
        let mut blob = vec![0u8; length as usize];
        f.read_exact(&mut blob).map_err(|e| e.to_string())?;
        open_blob(&self.aes, &blob, rel).map(Some)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Chạy tay: HSK_PACK=<đường dẫn .hskpack> cargo test real_pack -- --ignored --nocapture
    /// Mở một gói do bản Python tạo, giải mã data.json và một file media.
    #[test]
    #[ignore]
    fn real_pack_opens_and_decrypts() {
        let p = Pack::open(Path::new(&std::env::var("HSK_PACK").expect("đặt HSK_PACK"))).unwrap();
        println!("meta = {:?}", p.meta);
        let data = p.read("data.json").unwrap().expect("thiếu data.json");
        let v: serde_json::Value = serde_json::from_slice(&data).unwrap();
        println!("title = {}, sections = {}", v["title"], v["sections"].as_array().map(|a| a.len()).unwrap_or(0));
        assert!(v["sections"].is_array());
        let mp3 = p.files.keys().find(|k| k.ends_with(".mp3")).cloned();
        if let Some(k) = mp3 {
            let b = p.read(&k).unwrap().unwrap();
            println!("{k}: {} bytes, đầu = {:02x?}", b.len(), &b[..3]);
        }
        assert!(p.read("khong_ton_tai").unwrap().is_none());
    }

    #[test]
    fn rejects_garbage() {
        let dir = std::env::temp_dir().join("hskpack_garbage.bin");
        std::fs::write(&dir, b"this is not a pack at all, definitely not").unwrap();
        assert!(Pack::open(&dir).is_err());
    }
}
