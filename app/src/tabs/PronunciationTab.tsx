// Tab "🎤 Luyện phát âm" — nghe mẫu, ghi âm giọng mình (tự cắt khoảng lặng), xem sóng âm, nghe lại có tăng âm 1x–10x.
// Không chấm điểm tự động. Port của games/game_pronunciation.py; ghi âm làm ở Rust (recorder.rs).
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Check, StatusRow } from "../components/ui";
import { api } from "../lib/api";
import { cleanZh, playBlobUrl, speak, stopAudio } from "../lib/audio";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";

type Rec = { url: string; peaks: number[] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PronunciationTab() {
  const { items } = useVocab();
  const [words, setWords] = useState<Word[]>([]);
  const [pos, setPos] = useState(0);
  const [hint, setHint] = usePersistent("pron.hint", true);
  const [autoPlayback, setAutoPlayback] = usePersistent("pron.autoPlayback", false);
  const [autoMode, setAutoMode] = usePersistent("pron.autoMode", false);
  const [gain, setGain] = usePersistent("pron.gain", 1);
  const [recording, setRecording] = useState(false);
  const [rec, setRec] = useState<Rec | null>(null);
  const [status, setStatus] = useState<{ t: string; c: string } | null>(null);
  const runRef = useRef(0); // huỷ vòng tự động
  const cur = words[pos];

  useEffect(() => {
    resolveEffectivePool(items).then((p) => {
      const seen = new Set<string>();
      setWords(p.filter((w) => w.zh.trim() && !seen.has(w.zh) && seen.add(w.zh)));
      setPos(0); setRec(null); setStatus(null);
    });
  }, [items]);
  useEffect(() => () => { runRef.current++; stopAudio(); }, []);

  /** Ghi âm cho tới khi tự dừng (im lặng/6s) hoặc bị `cancel`; trả về bản ghi. */
  const recordOnce = useCallback(async (cancelled: () => boolean): Promise<Rec | null> => {
    stopAudio();
    setRec(null);
    await api.recStart();
    setRecording(true);
    setStatus({ t: "🔴 Đang ghi âm — đọc to từ lên nào...", c: "#e74c3c" });
    try {
      for (;;) {
        await sleep(100);
        const s = await api.recStatus();
        if (s.error) throw new Error(s.error);
        if (!s.recording || cancelled()) break;
      }
      const r = await api.recStop();
      const out = { url: `data:audio/wav;base64,${r.wavBase64}`, peaks: r.peaks };
      setRec(out);
      return out;
    } catch (e) {
      setStatus({ t: `❓ ${e instanceof Error ? e.message : e}`, c: "#e74c3c" });
      return null;
    } finally {
      setRecording(false);
    }
  }, []);

  async function toggleRecord() {
    if (recording) { await api.recStop().then((r) => setRec({ url: `data:audio/wav;base64,${r.wavBase64}`, peaks: r.peaks })).catch(() => {}); setRecording(false); return; }
    runRef.current++;
    const r = await recordOnce(() => false);
    if (!r) return;
    if (autoPlayback) { setStatus({ t: "Đã ghi âm xong — đang tự động phát lại...", c: "#18a957" }); await playBlobUrl(r.url, gain); }
    else setStatus({ t: '✅ Đã ghi âm xong — bấm "Nghe lại giọng bạn" để tự kiểm tra.', c: "#18a957" });
  }

  // Tự động toàn bộ: nghe mẫu (Hán → nghĩa) → ghi âm → nghe lại → từ kế
  async function autoCycle(from: number) {
    const my = ++runRef.current;
    const alive = () => runRef.current === my;
    for (let i = from; i < words.length && alive(); i++) {
      setPos(i);
      const w = words[i];
      await speak(cleanZh(w.zh)); if (!alive()) return;
      if (w.vi) { await speak(w.vi, "vi"); if (!alive()) return; }
      const r = await recordOnce(() => !alive()); if (!alive()) return;
      if (r) { setStatus({ t: "Đã ghi âm xong — đang tự động phát lại...", c: "#18a957" }); await playBlobUrl(r.url, gain); }
      await sleep(900);
    }
    if (alive()) { setStatus({ t: '🎉 Đã luyện hết danh sách! Bỏ chọn rồi chọn lại "Tự động toàn bộ" để luyện lại.', c: "#18a957" }); setAutoMode(false); }
  }

  function toggleAuto(on: boolean) {
    setAutoMode(on);
    if (on) autoCycle(pos);
    else { runRef.current++; stopAudio(); if (recording) api.recStop().catch(() => {}); setRecording(false); }
  }

  function go(d: number) {
    runRef.current++; stopAudio();
    setAutoMode(false);
    setPos((p) => Math.min(Math.max(p + d, 0), Math.max(0, words.length - 1)));
    setRec(null); setStatus(null);
  }

  const peaks = rec?.peaks ?? [];
  return (
    <div style={{ textAlign: "center" }}>
      <StatusRow><span className="muted">Từ <b>{words.length ? pos + 1 : 0}</b> / {words.length}</span></StatusRow>
      <div className="toolbar" style={{ justifyContent: "center" }}>
        <Check checked={hint} onChange={setHint} label="Hiện pinyin" />
        <Check checked={autoPlayback} onChange={setAutoPlayback} label="Tự động nghe lại" />
        <Check checked={autoMode} onChange={toggleAuto} label="Tự động toàn bộ" />
      </div>
      {!cur ? <p className="muted">Chưa có từ vựng — hãy chọn bộ từ ở panel bên phải.</p> : (
        <div className="card prompt-card">
          <div className="hanzi" style={{ fontSize: "4.5rem", fontWeight: 700, color: "var(--zh)" }}>{cur.zh}</div>
          <div style={{ color: "#7c3aed", fontSize: "1.4rem", minHeight: "1.8rem" }}>{hint ? cur.pinyin : ""}</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 600, color: "#047857" }}>{cur.vi}</div>
        </div>
      )}
      <div className="nav-row" style={{ margin: "1.1rem 0" }}>
        <button disabled={!cur} onClick={() => cur && speak(cleanZh(cur.zh))}><Icon name="volume" size={16} /> Nghe mẫu</button>
        <button className={recording ? "active" : "primary"} disabled={!cur || autoMode} onClick={toggleRecord}>{recording ? "Dừng ghi âm" : "Bắt đầu ghi âm"}</button>
        <button disabled={!rec} onClick={() => rec && playBlobUrl(rec.url, gain)}>Nghe lại giọng bạn</button>
        <label>Tăng âm{" "}
          <select value={gain} onChange={(e) => setGain(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{g}x</option>)}
          </select>
        </label>
      </div>
      <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
        {peaks.map((p, i) => <div key={i} style={{ width: 6, height: `${Math.max(4, p * 100)}%`, background: "#2563eb", borderRadius: 2 }} />)}
      </div>
      {status && <p style={{ color: status.c, fontWeight: 600 }}>{status.t}</p>}
      <div className="row" style={{ justifyContent: "center" }}>
        <button disabled={pos === 0} onClick={() => go(-1)}><Icon name="chevL" size={16} /> Trước</button>
        <button disabled={pos >= words.length - 1} onClick={() => go(1)}>Từ tiếp <Icon name="chevR" size={16} /></button>
      </div>
    </div>
  );
}
