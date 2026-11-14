// Tab "🅰️ Trắc nghiệm" — 4 đáp án, 12 chế độ (Từ/Câu × 3 cặp trường × 2 chiều). Port của games/game_quiz.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Check, Done, Menu, Score } from "../components/ui";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { shuffle } from "../lib/data";
import { fieldOf } from "../lib/fields";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { useReport } from "../lib/toast";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";

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

  const lookup = (text: string) => (cur && text === fieldOf(cur, af) ? cur : items.find((x) => fieldOf(x, af) === text));

  return (
    <div>
      {/* Kiểu câu hỏi: chọn Từ/Câu rồi chọn chiều hỏi → đáp */}
      <div className="toolbar">
        <div className="tabs seg">
          {GROUPS.map(([g, modes]) => (
            <button key={g} className={type[0] === modes[0][0][0] ? "active" : ""} onClick={() => setType(modes[0][0][0] + type.slice(1))}>{g}</button>
          ))}
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} title="Hỏi bằng → chọn đáp án là">
          {(GROUPS.find(([, m]) => m[0][0][0] === type[0]) ?? GROUPS[0])[1].flatMap(([k, , , fwd, rev]) => [
            <option key={`${k}f`} value={`${k}_fwd`}>{fwd}</option>, <option key={`${k}r`} value={`${k}_rev`}>{rev}</option>,
          ])}
        </select>
        <span className="grow" />
        <Score ok={score.ok} bad={score.bad} />
        <Menu label="Tuỳ chọn" icon="sliders">
          <Check checked={autoNext} onChange={setAutoNext} label="Đúng thì tự chuyển câu" />
          <Check checked={autoRead} onChange={setAutoRead} label="Tự đọc câu hỏi" />
        </Menu>
      </div>
      {done && <Done title="Hoàn thành!"><button className="primary" onClick={start}>Chơi lại</button></Done>}
      {cur && (
        <>
          <div className="card prompt-card" style={{ fontSize: pf === 0 ? "2.6rem" : "1.5rem" }}>
            <span className={pf === 0 || pf === 3 ? "hanzi" : ""}>{fieldOf(cur, pf)}</span>
            <button className="ghost icon corner" onClick={() => speak(cleanZh(pf < 3 ? cur.zh : cur.exCn))} title="Nghe phát âm"><Icon name="volume" /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            {choices.map((c) => (
              <button key={c} className={`opt ${states[c] === "good" ? "right" : states[c] === "bad" ? "wrong" : ""} ${detailFor === c ? "peek" : ""}`} style={{ margin: 0, minHeight: 60 }} onClick={() => click(c)}>
                <span className={af === 0 || af === 3 ? "hanzi" : ""} style={{ fontSize: af === 0 ? "1.5rem" : "1.05rem" }}>{c}</span>
              </button>
            ))}
          </div>
          <div className="nav-row"><button className="primary" disabled={!locked} onClick={next}>Tiếp theo <Icon name="chevR" size={16} /></button></div>
          <div className="detail-panel">
            {detailFor ? (
              <>
                <div className="detail-title">Chi tiết đáp án: <span className={af === 0 || af === 3 ? "hanzi" : ""}>{detailFor}</span></div>
                {detailRows(lookup(detailFor)).length ? (
                  <dl>{detailRows(lookup(detailFor)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === "Từ" || k === "Câu ví dụ" ? "hanzi" : ""}>{v || "—"}</dd></div>)}</dl>
                ) : <div className="muted">Không có thông tin cho đáp án này.</div>}
              </>
            ) : <div className="muted">Bấm vào một đáp án để xem chi tiết (từ, pinyin, nghĩa, câu ví dụ).</div>}
          </div>
        </>
      )}
    </div>
  );
}
