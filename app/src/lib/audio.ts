// Phát âm: gọi Rust (Edge TTS) lấy mp3, phát bằng thẻ <audio> của webview.
// Nếu Edge TTS lỗi (mất mạng...) thì rơi về giọng có sẵn của hệ điều hành (speechSynthesis).
import { invoke } from "@tauri-apps/api/core";
import { getVolume } from "./settings";

let current: HTMLAudioElement | null = null;
let token = 0; // mỗi lần speak/stop tăng lên để bỏ qua kết quả của lần gọi cũ

export function stopAudio() {
  token++;
  if (current) {
    current.pause();
    current = null;
  }
  window.speechSynthesis?.cancel();
}

function playUrl(url: string, myToken: number): Promise<void> {
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, getVolume()));
    current = a;
    const done = () => {
      if (current === a) current = null;
      resolve();
    };
    a.onended = done;
    a.onerror = done;
    a.onpause = () => { if (token !== myToken) done(); }; // stopAudio() -> kết thúc sớm
    a.play().catch(done);
  });
}

function speakFallback(text: string, lang: string, myToken: number): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth || token !== myToken) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.volume = getVolume();
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

/** Đọc `text` (giọng "zh" hoặc "vi"); Promise xong khi đọc xong (hoặc bị stopAudio()). */
export async function speak(text: string, voice: string = "zh"): Promise<void> {
  const t = text.trim();
  if (!t) return;
  stopAudio();
  const myToken = token;
  try {
    const a = await invoke<{ mime: string; b64: string }>("tts_speak", { text: t, voice });
    if (token !== myToken) return;
    await playUrl(`data:${a.mime};base64,${a.b64}`, myToken);
  } catch (e) {
    console.warn("Edge TTS thất bại, dùng giọng hệ thống:", e);
    await speakFallback(t, voice === "zh" ? "zh-CN" : "vi-VN", myToken);
  }
}

/** Phát mp3/wav có sẵn (vd bản ghi âm của người dùng) với hệ số khuếch đại (1x–10x) qua Web Audio. */
export async function playBlobUrl(url: string, gain = 1): Promise<void> {
  stopAudio();
  const myToken = token;
  if (gain <= 1) return playUrl(url, myToken);
  const ctx = new AudioContext();
  const buf = await (await fetch(url)).arrayBuffer();
  const audio = await ctx.decodeAudioData(buf);
  const src = ctx.createBufferSource();
  src.buffer = audio;
  const g = ctx.createGain();
  g.gain.value = Math.min(10, gain) * getVolume();
  src.connect(g).connect(ctx.destination);
  return new Promise((resolve) => {
    src.onended = () => { ctx.close(); resolve(); };
    src.start();
  });
}

/** Chỉ giữ các cụm chữ Hán, nối bằng "，" — như clean_zh() của bản Python (bỏ dấu "..." , "A/B", ký hiệu). */
export function cleanZh(text: string): string {
  const runs = (text || "").match(/[一-鿿]+/g);
  return runs ? runs.join("，") : text || "";
}
