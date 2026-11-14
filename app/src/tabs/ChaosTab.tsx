// Tab "Ôn nhanh" (trước đây "Hỗn mang") — lưới 2×2 ô từ vựng, mỗi ô có 3 nút Khó / Vừa / Dễ chọn mức ôn lại.
// Chọn xong có ~1,5s "đổi ý" rồi mới chốt vào SRS. Port của games/game_chaos.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Done } from "../components/ui";
import { OptRadio, OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
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
const GRADES = ["Khó", "Vừa", "Dễ"]; // tên 3 mức tự đánh giá, theo thứ tự nút
const fmtDays = (d: number) => `${Math.max(1, Math.round(d))} ngày`;

// pendAt: lúc bấm chọn mức (để chạy lại vạch đếm ngược khi đổi ý)
type Box = { word: Word | null; labels: [string, string, string]; pending: number | null; pendAt: number; revealed: boolean; token: number };

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
    return { word: w, labels: w ? await labelsFor(w) : ["", "", ""], pending: null, pendAt: 0, revealed: false, token: Math.random() };
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
    setBoxes((bs) => bs.map((x, k) => (k === i ? { ...x, pending: option, pendAt: Date.now(), revealed: true } : x)));
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

  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  const say = (e: React.MouseEvent, w: Word) => { e.stopPropagation(); speak(cleanZh(w.zh)); };

  return (
    <div>
      {/* Tiến độ: thanh chia màu theo số từ đã chấm Khó / Vừa / Dễ */}
      <div className="chaos-top">
        <span className="muted">Đã xét <b className="stat" style={{ color: "var(--text)" }}>{decided}</b> / {total}</span>
        <div className="chaos-bar" title={`Khó ${counts[0]} · Vừa ${counts[1]} · Dễ ${counts[2]}`}>
          {counts.map((n, k) => <i key={k} className={`g${k}`} style={{ width: pct(n) }} />)}
        </div>
        <div className="chaos-legend">
          {GRADES.map((g, k) => <span key={g} className={`g${k}`}><i />{g} <b className="stat">{counts[k]}</b></span>)}
        </div>
        <button className="icon" onClick={start} title="Làm lại từ đầu"><Icon name="rotate" size={16} /></button>
      </div>
      <TabOptions>
        <OptSection title="Phần hiện trên thẻ">
          <span className="muted small">Phần còn lại tự nhớ, bấm thẻ để xem đủ.</span>
          <OptRadio value={mode} onChange={setMode} options={DISPLAY_MODES.map(([l], i) => [i, l] as [number, string])} />
        </OptSection>
        <OptSection title="Âm thanh">
          <OptSwitch checked={sound} onChange={setSound} label="Tự phát âm khi lật thẻ" />
        </OptSection>
        <OptSection title="Cách chấm">
          <span className="muted small">Chọn Khó / Vừa / Dễ theo mức bạn nhớ từ đó. Sau khi chọn có {CONFIRM_MS / 1000} giây để đổi ý, rồi từ mới sẽ thế chỗ.</span>
        </OptSection>
      </TabOptions>
      {done ? (
        <Done title={`Đã xét hết ${total} từ`}>
          <p className="muted" style={{ marginBottom: "1rem" }}>Khó {counts[0]} (gặp lại sau 1 ngày) · Vừa {counts[1]} · Dễ {counts[2]}</p>
          <button className="primary" onClick={start}><Icon name="rotate" size={16} />Làm lại</button>
        </Done>
      ) : total === 0 ? (
        <div className="empty"><Icon name="layers" size={28} /><p>Bộ từ đang chọn chưa có từ nào để xét.</p></div>
      ) : (
        <div className="chaos-grid">
          {boxes.map((b, i) => {
            const shown = b.revealed || !b.word ? "zpm" : parts;
            const w = b.word;
            if (!w) return <div key={i} className="chaos-card empty-slot"><span className="muted small">Hết từ</span></div>;
            // Phần đang ẩn hiện thành ô gạch đứt "Pinyin ?" để biết cần tự nhớ phần nào
            const field = (k: "z" | "p" | "m", cls: string, text: string, name: string) =>
              shown.includes(k) ? <div className={cls}>{text}</div> : <div className={`${cls} ask`}>{name} ?</div>;
            return (
              <div key={b.token} className={`chaos-card ${b.revealed ? "open" : ""} ${b.pending !== null ? `picked p${b.pending}` : ""}`} onClick={() => reveal(i)}>
                <button className="icon round ghost chaos-say" onClick={(e) => say(e, w)} title="Phát âm"><Icon name="volume" size={16} /></button>
                <div className="chaos-body">
                  {field("z", "hanzi zh", w.zh, "Chữ Hán")}
                  {field("p", "py", w.pinyin, "Pinyin")}
                  {field("m", "vi", w.vi, "Nghĩa")}
                </div>
                <div className="chaos-foot" onClick={(e) => e.stopPropagation()}>
                  {b.pending !== null ? (
                    <div className="chaos-note">
                      Gặp lại sau <b>{b.labels[b.pending]}</b> · bấm mức khác để đổi
                      <i key={b.pendAt} className="chaos-timer" style={{ animationDuration: `${CONFIRM_MS}ms` }} />
                    </div>
                  ) : !b.revealed ? <div className="chaos-hint">Bấm thẻ để xem đủ, hoặc chấm luôn</div> : <div className="chaos-hint">Bạn nhớ từ này thế nào?</div>}
                  <div className="grades">
                    {GRADES.map((g, o) => (
                      <button key={g} className={`grade g${o} ${b.pending === o ? "on" : ""}`} onClick={() => choose(i, o)} title={`${g} — gặp lại sau ${b.labels[o]}`}>
                        <b>{g}</b><small>{b.labels[o]}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
