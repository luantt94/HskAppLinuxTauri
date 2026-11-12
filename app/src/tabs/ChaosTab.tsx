// Tab "🌀 Hỗn mang" — lưới 2×2 ô từ vựng, mỗi ô có 3 nút 🟡/⚪/🟢 chọn mức ôn lại.
// Chọn xong có ~1,5s "đổi ý" rồi mới chốt vào SRS. Port của games/game_chaos.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { EASY, GOOD, HARD, type Grade, type Word } from "../lib/types";
import { useProgress } from "../lib/progress";
import { useVocab } from "../lib/vocabStore";

const CONFIRM_MS = 1500;
const NEW_WORD_DAYS = [1, 2, 4];
// Chế độ hiển thị: z = chữ Hán, p = pinyin, m = nghĩa (phần ẩn là phần cần tự nhớ)
const DISPLAY_MODES: [string, string][] = [
  ["Chữ Hán", "z"], ["Pinyin", "p"], ["Nghĩa", "m"], ["Chữ Hán + Pinyin", "zp"], ["Chữ Hán + Nghĩa", "zm"], ["Pinyin + Nghĩa", "pm"],
];
const COLORS = ["#f59e0b", "#ffffff", "#18a957"];
const fmtDays = (d: number) => `${Math.max(1, Math.round(d))} ngày`;

type Box = { word: Word | null; labels: [string, string, string]; pending: number | null; revealed: boolean; token: number };

export default function ChaosTab() {
  const { items } = useVocab();
  const { refresh } = useProgress();
  const [mode, setMode] = usePersistent("chaos.mode", 0);
  const [sound, setSound] = usePersistent("chaos.sound", true);
  const queue = useRef<Word[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [counts, setCounts] = useState([0, 0, 0]);
  const [total, setTotal] = useState(0);
  const timers = useRef<Map<number, number>>(new Map());

  const labelsFor = useCallback(async (w: Word): Promise<[string, string, string]> => {
    const card = await api.srsGetCard(w.zh);
    if (card && card.repetitions === 0) return NEW_WORD_DAYS.map(fmtDays) as [string, string, string];
    const [g, e] = await Promise.all([api.srsPreview(w.zh, GOOD), api.srsPreview(w.zh, EASY)]);
    return [fmtDays(1), fmtDays(g ?? 1), fmtDays(e ?? 1)];
  }, []);

  const fill = useCallback(async (): Promise<Box> => {
    const w = queue.current.shift() ?? null;
    return { word: w, labels: w ? await labelsFor(w) : ["", "", ""], pending: null, revealed: false, token: Math.random() };
  }, [labelsFor]);

  const start = useCallback(async () => {
    stopAudio();
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    const pool = (await resolveEffectivePool(items)).filter((w) => w.zh);
    queue.current = [...pool];
    setTotal(pool.length);
    setCounts([0, 0, 0]);
    setBoxes(await Promise.all([0, 1, 2, 3].map(() => fill())));
  }, [items, fill]);

  useEffect(() => { start(); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { stopAudio(); timers.current.forEach((t) => clearTimeout(t)); }, []);

  function reveal(i: number) {
    const b = boxes[i];
    if (!b.word || b.revealed) return;
    setBoxes((bs) => bs.map((x, k) => (k === i ? { ...x, revealed: true } : x)));
    if (sound) speak(cleanZh(b.word.zh));
  }

  function choose(i: number, option: number) {
    const b = boxes[i];
    if (!b.word) return;
    setBoxes((bs) => bs.map((x, k) => (k === i ? { ...x, pending: option, revealed: true } : x)));
    if (!b.revealed && sound) speak(cleanZh(b.word.zh));
    const w = b.word;
    window.clearTimeout(timers.current.get(i));
    // sau khoảng đổi ý: chốt vào SRS rồi lấy từ mới thế chỗ
    timers.current.set(i, window.setTimeout(async () => {
      try {
        if (option === 0) await api.srsReview(w.zh, HARD as Grade, 1);
        else {
          const card = await api.srsGetCard(w.zh);
          const isNew = card?.repetitions === 0;
          await api.srsReview(w.zh, (option === 1 ? GOOD : EASY) as Grade, isNew ? NEW_WORD_DAYS[option] : undefined);
        }
      } catch (e) { console.error(e); }
      refresh();
      setCounts((c) => c.map((n, k) => (k === option ? n + 1 : n)));
      const nb = await fill();
      setBoxes((bs) => bs.map((x, k) => (k === i ? nb : x)));
    }, CONFIRM_MS));
  }

  const done = total > 0 && !queue.current.length && boxes.length > 0 && boxes.every((b) => !b.word);
  const decided = counts[0] + counts[1] + counts[2];
  const parts = DISPLAY_MODES[mode]?.[1] ?? "z";

  return (
    <div>
      <div className="toolbar">
        <b className="grow">Đã xét {decided} / {total} <span className="muted" style={{ fontWeight: 400 }}>· 🟡 {counts[0]} ⚪ {counts[1]} 🟢 {counts[2]}</span></b>
        <span>Hiện:</span>
        <select value={mode} onChange={(e) => setMode(Number(e.target.value))}>{DISPLAY_MODES.map(([l], i) => <option key={l} value={i}>{l}</option>)}</select>
        <label><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> {sound ? "🔊" : "🔇"} Tự phát âm</label>
        <button onClick={start}><Icon name="rotate" size={16} />Làm lại</button>
      </div>
      {done ? (
        <p style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1rem" }}>
          🎉 Đã xét hết {total} từ — 🟡 {counts[0]} gặp lại sau 1 ngày, ⚪ {counts[1]} mức vừa, 🟢 {counts[2]} mức xa.<br />Bấm "Làm lại" để làm lại.
        </p>
      ) : total === 0 ? <p className="muted">Bộ từ đang chọn chưa có từ nào để xét.</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {boxes.map((b, i) => {
            const shown = b.revealed || !b.word ? "zpm" : parts;
            const w = b.word;
            return (
              <div key={i} className="card" style={{ minHeight: 190, padding: ".7rem .8rem", display: "flex", flexDirection: "column", background: "#f1f5f9", cursor: "pointer" }} onClick={() => reveal(i)}>
                <div className="hanzi" style={{ fontSize: "2rem", fontWeight: 700, textAlign: "center", minHeight: "2.6rem", lineHeight: 1.3 }}>{w && shown.includes("z") ? w.zh : ""}</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 600, color: "#2563eb", textAlign: "center", minHeight: "1.7rem" }}>{w && shown.includes("p") ? w.pinyin : ""}</div>
                <div style={{ fontSize: "1rem", color: "#475569", textAlign: "center", minHeight: "2.6rem", lineHeight: 1.35 }}>{w && shown.includes("m") ? w.vi : ""}</div>
                <div className="grow" />
                {w && (
                  <div className="row" style={{ flexWrap: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                    {[0, 1, 2].map((o) => (
                      <button key={o} className="grow" style={{ height: 46, minHeight: 0, background: COLORS[o], borderWidth: b.pending === o ? 3 : 1, borderColor: b.pending === o ? "#0f172a" : undefined, color: o === 2 ? "#fff" : "#0f172a" }}
                        onClick={() => choose(i, o)}>{o === 0 ? "🟡" : o === 1 ? "⚪" : "🟢"}<br />{b.labels[o]}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
