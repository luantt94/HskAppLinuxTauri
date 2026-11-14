// Tab "🎤 Luyện phát âm" — nghe mẫu, ghi âm giọng mình (tự cắt khoảng lặng), xem sóng âm, nghe lại có tăng âm 1x–10x.
// Không chấm điểm tự động. Port của games/game_pronunciation.py; ghi âm làm ở Rust (recorder.rs).
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { OptRow, OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { api } from "../lib/api";
import { cleanZh, playBlobUrl, speak, stopAudio } from "../lib/audio";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";
import { Select } from "../components/Select";
import { WordList, useWordListOpen } from "../components/WordList";

type Rec = { url: string; peaks: number[] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PronunciationTab() {
  const [wlOpen, setWlOpen] = useWordListOpen(); // cột danh sách từ
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
      if (cancelled()) return null; // đã chuyển sang từ khác: bỏ bản ghi, không gắn vào từ mới
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
    const my = ++runRef.current;
    const r = await recordOnce(() => runRef.current !== my); // chuyển từ (runRef đổi) thì dừng ghi
    if (!r || runRef.current !== my) return;
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

  // Chuyển tới từ thứ i: dừng âm thanh / ghi âm đang chạy (runRef đổi → vòng ghi âm tự dừng), tắt chế độ tự động
  function jump(i: number) {
    runRef.current++; stopAudio();
    setAutoMode(false);
    setPos(Math.min(Math.max(i, 0), Math.max(0, words.length - 1)));
    setRec(null); setStatus(null);
  }
  const go = (d: number) => jump(pos + d);

  const peaks = rec?.peaks ?? [];
  return (
    <div style={{ textAlign: "center" }}>
      <div className="study-top">
        <span className="muted study-count">Từ <b className="stat">{words.length ? pos + 1 : 0}</b> / {words.length}</span>
        <div className="study-bar"><i style={{ width: `${words.length ? ((pos + 1) / words.length) * 100 : 0}%` }} /></div>
        <button className="icon" disabled={pos === 0} onClick={() => go(-1)} title="Từ trước"><Icon name="chevL" size={16} /></button>
        <button className="icon" disabled={pos >= words.length - 1} onClick={() => go(1)} title="Từ tiếp"><Icon name="chevR" size={16} /></button>
      </div>
      <WordList open={wlOpen} onClose={() => setWlOpen(false)} index={pos} onPick={jump} words={words.map((w) => ({ zh: w.zh, py: w.pinyin, vi: w.vi }))} />
      <TabOptions>
        <OptSection title="Danh sách">
          <OptSwitch checked={wlOpen} onChange={setWlOpen} label="Hiện danh sách từ" hint="Cột bên trái: các từ đang học, bấm để nhảy tới" />
        </OptSection>
        <OptSection title="Hiển thị">
          <OptSwitch checked={hint} onChange={setHint} label="Hiện pinyin" />
        </OptSection>
        <OptSection title="Tự động">
          <OptSwitch checked={autoPlayback} onChange={setAutoPlayback} label="Tự nghe lại sau khi ghi" />
          <OptSwitch checked={autoMode} onChange={toggleAuto} label="Tự động toàn bộ" hint="Nghe mẫu → ghi âm → nghe lại → sang từ kế" />
        </OptSection>
        <OptSection title="Ghi âm">
          <OptRow label="Tăng âm khi nghe lại">
            <Select value={gain} onChange={setGain} options={Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: `${i + 1}x` }))} />
          </OptRow>
        </OptSection>
      </TabOptions>
      {!cur ? <div className="empty"><Icon name="mic" size={28} /><p>Chưa có từ vựng — hãy chọn bộ từ ở nút bộ từ trên thanh tiêu đề.</p></div> : (
        <div className="card prompt-card quiz-q">
          <div className="quiz-ask">Nghe mẫu rồi đọc theo</div>
          <div className="hanzi" style={{ fontSize: "4.5rem", fontWeight: 700, color: "var(--zh)" }}>{cur.zh}</div>
          <div style={{ color: "var(--py)", fontSize: "1.4rem", minHeight: "1.8rem" }}>{hint ? cur.pinyin : ""}</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 600, color: "var(--vi)" }}>{cur.vi}</div>
        </div>
      )}
      <div className="nav-row" style={{ margin: "1.1rem 0" }}>
        <button disabled={!cur} onClick={() => cur && speak(cleanZh(cur.zh))}><Icon name="volume" size={16} />1. Nghe mẫu</button>
        <button className={`pron-rec ${recording ? "on" : "primary"}`} disabled={!cur || autoMode} onClick={toggleRecord}><Icon name={recording ? "pause" : "mic"} size={16} />{recording ? "Dừng ghi âm" : "2. Ghi âm"}</button>
        <button disabled={!rec} onClick={() => rec && playBlobUrl(rec.url, gain)}><Icon name="play" size={15} />3. Nghe lại giọng bạn</button>
      </div>
      {/* Sóng âm giọng vừa ghi */}
      <div className={`pron-wave ${recording ? "rec" : ""}`}>
        {peaks.length ? peaks.map((p, i) => <i key={i} style={{ height: `${Math.max(4, p * 100)}%` }} />)
          : <span className="muted small">{recording ? "Đang ghi âm…" : "Sóng âm giọng bạn sẽ hiện ở đây"}</span>}
      </div>
      {status && <p style={{ color: status.c, fontWeight: 600 }}>{status.t}</p>}
    </div>
  );
}
