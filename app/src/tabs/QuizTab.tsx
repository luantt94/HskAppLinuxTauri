// Tab "🅰️ Trắc nghiệm" — 4 đáp án, 12 chế độ (Từ/Câu × 3 cặp trường × 2 chiều). Port của games/game_quiz.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Done, Score } from "../components/ui";
import { OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { shuffle } from "../lib/data";
import { fieldOf } from "../lib/fields";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { useReport } from "../lib/toast";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";
import { Select } from "../components/Select";
import { shortcutBlocked } from "../lib/shortcuts";

const ANSWER_COUNT = 4;
// [khoá, trường hỏi, trường đáp, nhãn thuận, nhãn nghịch] — khoá bắt đầu bằng "w" (từ) hoặc "s" (câu)
const GROUPS: [string, [string, number, number, string, string][]][] = [
  ["Từ vựng", [["wzp", 0, 2, "Hán → Pinyin", "Pinyin → Hán"], ["wzv", 0, 1, "Hán → Nghĩa", "Nghĩa → Hán"], ["wpv", 2, 1, "Pinyin → Nghĩa", "Nghĩa → Pinyin"]]],
  ["Câu", [["szp", 3, 5, "Hán → Pinyin", "Pinyin → Hán"], ["szv", 3, 4, "Hán → Nghĩa", "Nghĩa → Hán"], ["spv", 5, 4, "Pinyin → Nghĩa", "Nghĩa → Pinyin"]]],
];
const TYPES: Record<string, [number, number]> = {};
for (const [, modes] of GROUPS) for (const [k, a, b] of modes) { TYPES[`${k}_fwd`] = [a, b]; TYPES[`${k}_rev`] = [b, a]; }

const detailRows = (w: Word | undefined): [string, string][] =>
  w ? [["Từ", w.zh], ["Pinyin", w.pinyin], ["Nghĩa", w.vi], ["Câu ví dụ", w.exCn], ["Pinyin câu", w.pySent], ["Nghĩa câu", w.exVi]] : [];

export default function QuizTab() {
  const { items } = useVocab();
  const report = useReport();
  const [type, setType] = usePersistent("quiz.type", "wzv_fwd");
  const [autoNext, setAutoNext] = usePersistent("quiz.autoNext", true);
  const [autoRead, setAutoRead] = usePersistent("quiz.autoRead", false);
  const queue = useRef<Word[]>([]);
  const [cur, setCur] = useState<Word | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, "good" | "bad">>({});
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false);
  const [score, setScore] = useState({ ok: 0, bad: 0 });
  const [total, setTotal] = useState(0); // số câu của lượt (để hiện "Câu n / N")
  const hadWrong = useRef(false);
  const recorded = useRef(false);
  const advance = useRef<number | undefined>(undefined);
  const [pf, af] = TYPES[type] ?? [0, 1];

  const next = useCallback(() => {
    window.clearTimeout(advance.current);
    setLocked(false); setStates({}); setDetailFor(null);
    const w = queue.current.shift();
    if (!w) { setCur(null); setDone(true); return; }
    hadWrong.current = false; recorded.current = false;
    const correct = fieldOf(w, af);
    const pool = [...new Set(items.map((x) => fieldOf(x, af)).filter((x) => x && x !== correct))];
    const wrongs = shuffle(pool).slice(0, ANSWER_COUNT - 1);
    while (wrongs.length < ANSWER_COUNT - 1) wrongs.push(correct + "？".repeat(wrongs.length + 1));
    setChoices(shuffle([...wrongs, correct]));
    setCur(w); setDone(false);
    if (autoRead) setTimeout(() => speak(cleanZh(pf < 3 ? w.zh : w.exCn)), 2000);
  }, [items, af, pf, autoRead]);

  const start = useCallback(async () => {
    stopAudio();
    setScore({ ok: 0, bad: 0 });
    const usable = items.filter((w) => w.zh && fieldOf(w, pf) && fieldOf(w, af));
    queue.current = await resolveEffectivePool(usable);
    setTotal(queue.current.length);
    next();
  }, [items, pf, af, next]);

  useEffect(() => { start(); }, [items, type]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { stopAudio(); window.clearTimeout(advance.current); }, []);

  function record(ok: boolean) {
    if (recorded.current || !cur) return;
    recorded.current = true;
    report(cur.zh, ok);
  }

  function click(text: string) {
    if (!cur) return;
    setDetailFor((d) => (d === text ? null : text));
    if (locked) return; // đã đúng: các ô còn lại chỉ để xem chi tiết
    const ok = text === fieldOf(cur, af);
    setStates((s) => ({ ...s, [text]: ok ? "good" : "bad" }));
    if (!ok) {
      if (!hadWrong.current) { setScore((s) => ({ ...s, bad: s.bad + 1 })); record(false); }
      hadWrong.current = true;
      return;
    }
    setLocked(true);
    if (!hadWrong.current) { setScore((s) => ({ ...s, ok: s.ok + 1 })); record(true); }
    if (autoNext) advance.current = window.setTimeout(next, 1200);
  }

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (shortcutBlocked(e)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= choices.length) { if (!e.repeat) click(choices[n - 1]); }
    else if ((e.key === "Enter" || e.key === "ArrowRight") && locked) { e.preventDefault(); next(); }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lookup = (text: string) => (cur && text === fieldOf(cur, af) ? cur : items.find((x) => fieldOf(x, af) === text));

  const pos = total ? Math.min(total, total - queue.current.length) : 0; // câu đang làm (1-based)
  const askLabel = ["Chọn chữ Hán đúng", "Chọn nghĩa đúng", "Chọn pinyin đúng", "Chọn câu đúng", "Chọn nghĩa đúng của câu", "Chọn pinyin đúng của câu"][af] ?? "Chọn đáp án đúng";
  const isZh = (f: number) => f === 0 || f === 3;
  const shownDetail = detailFor ?? (locked && cur ? fieldOf(cur, af) : null); // trả lời đúng rồi thì tự hiện chi tiết đáp án đúng

  return (
    <div>
      {/* Trên cùng: kiểu câu hỏi (Từ/Câu + chiều hỏi) bên trái; tiến độ + điểm bên phải */}
      <div className="study-top">
        <div className="tabs seg">
          {GROUPS.map(([g, modes]) => (
            <button key={g} className={type[0] === modes[0][0][0] ? "active" : ""} onClick={() => setType(modes[0][0][0] + type.slice(1))}>{g}</button>
          ))}
        </div>
        {/* Chiều hỏi → đáp, nhóm theo cặp trường (vd Hán & Nghĩa: Hán → Nghĩa / Nghĩa → Hán) */}
        <Select value={type} onChange={setType} title="Hỏi bằng → chọn đáp án là" className="quiz-type"
          options={(GROUPS.find(([, m]) => m[0][0][0] === type[0]) ?? GROUPS[0])[1].flatMap(([k, , , fwd, rev]) => {
            const group = fwd.replace(" → ", " & ");
            const NAME: Record<string, string> = { "Hán": "chữ Hán", "Pinyin": "pinyin", "Nghĩa": "nghĩa" };
            const hint = (s: string) => { const [q, a] = s.split(" → "); return `Thấy ${NAME[q] ?? q}, chọn ${NAME[a] ?? a}`; };
            return [{ value: `${k}_fwd`, label: fwd, hint: hint(fwd), group }, { value: `${k}_rev`, label: rev, hint: hint(rev), group }];
          })} />
        <span className="muted study-count">Câu <b className="stat">{pos}</b> / {total}</span>
        <div className="study-bar"><i style={{ width: `${total ? (pos / total) * 100 : 0}%` }} /></div>
        <Score ok={score.ok} bad={score.bad} />
      </div>
      <TabOptions>
        <OptSection title="Tự động">
          <OptSwitch checked={autoNext} onChange={setAutoNext} label="Đúng thì tự chuyển câu" />
          <OptSwitch checked={autoRead} onChange={setAutoRead} label="Tự đọc câu hỏi" />
        </OptSection>
        <OptSection title="Phím tắt">
          <span className="muted small"><kbd>1</kbd>–<kbd>4</kbd> chọn đáp án · <kbd>Enter</kbd> câu tiếp theo</span>
          <span className="muted small">Sau khi trả lời, bấm lại các đáp án để xem chi tiết từng từ.</span>
        </OptSection>
      </TabOptions>
      {done && (
        <Done title="Hoàn thành!">
          <p className="muted" style={{ marginBottom: "1rem" }}>Đúng ngay lần đầu {score.ok} · Sai {score.bad}</p>
          <button className="primary" onClick={start}><Icon name="rotate" size={15} />Chơi lại</button>
        </Done>
      )}
      {cur && (
        <>
          <div className="card prompt-card quiz-q">
            <div className="quiz-ask">{askLabel}</div>
            <div className={`quiz-prompt ${isZh(pf) ? "hanzi" : ""} ${pf === 0 ? "big" : pf === 3 ? "sent" : ""}`}>{fieldOf(cur, pf)}</div>
            <button className="ghost icon corner" onClick={() => speak(cleanZh(pf < 3 ? cur.zh : cur.exCn))} title="Nghe phát âm"><Icon name="volume" /></button>
          </div>
          <div className="quiz-opts">
            {choices.map((c, i) => {
              const st = states[c];
              return (
                <button key={c} className={`opt quiz-opt ${st === "good" ? "right" : st === "bad" ? "wrong" : ""} ${detailFor === c ? "peek" : ""}`} onClick={() => click(c)}>
                  <kbd>{i + 1}</kbd>
                  <span className={`grow ${isZh(af) ? "hanzi" : ""}`} style={{ fontSize: af === 0 ? "1.5rem" : "1.05rem" }}>{c}</span>
                  {st && <Icon name={st === "good" ? "checkCircle" : "x"} size={18} />}
                </button>
              );
            })}
          </div>
          <div className="nav-row"><button className="primary" disabled={!locked} onClick={next}>Câu tiếp theo <Icon name="chevR" size={16} /></button></div>
          {shownDetail ? (
            <div className="detail-panel">
              <div className="detail-title">Chi tiết: <span className={isZh(af) ? "hanzi" : ""}>{shownDetail}</span></div>
              {detailRows(lookup(shownDetail)).length ? (
                <dl>{detailRows(lookup(shownDetail)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === "Từ" || k === "Câu ví dụ" ? "hanzi" : ""}>{v || "—"}</dd></div>)}</dl>
              ) : <div className="muted">Không có thông tin cho đáp án này.</div>}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
