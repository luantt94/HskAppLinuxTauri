// Tab "📝 Điền từ" — câu ví dụ bị khuyết chữ cần điền + 4 đáp án. Port của games/game_cloze.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Done, Score } from "../components/ui";
import { OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { shuffle } from "../lib/data";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { useReport } from "../lib/toast";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";
import { shortcutBlocked } from "../lib/shortcuts";

type Choice = { zh: string; pinyin: string; vi: string };

export default function ClozeTab() {
  const advance = useRef<number | undefined>(undefined); // hẹn giờ tự chuyển câu sau khi đúng
  const { items } = useVocab();
  const report = useReport();
  const [showLinePinyin, setShowLinePinyin] = usePersistent("cloze.showLinePinyin", false);
  const [showLineMeaning, setShowLineMeaning] = usePersistent("cloze.showLineMeaning", true);
  const [showAnsPinyin, setShowAnsPinyin] = usePersistent("cloze.showAnsPinyin", true);
  const [showAnsMeaning, setShowAnsMeaning] = usePersistent("cloze.showAnsMeaning", true);
  const [autoNext, setAutoNext] = usePersistent("cloze.autoNext", true);
  const [autoRead, setAutoRead] = usePersistent("cloze.autoRead", false);

  const queue = useRef<Word[]>([]);
  const poolRef = useRef<Choice[]>([]);
  const [cur, setCur] = useState<Word | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [picked, setPicked] = useState<{ zh: string; good: boolean } | null>(null);
  const [done, setDone] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [score, setScore] = useState({ ok: 0, bad: 0 });
  const [total, setTotal] = useState(0); // số câu của lượt
  const locked = useRef(false);

  const next = useCallback(() => {
    window.clearTimeout(advance.current); // huỷ hẹn giờ tự chuyển câu (nếu đã sang câu bằng tay)
    locked.current = false;
    setPicked(null);
    const w = queue.current.shift();
    if (!w) { setCur(null); setDone(true); return; }
    // 3 đáp án nhiễu khác chữ Hán, khử trùng theo chữ Hán
    const seen = new Set([w.zh]);
    const distractors: Choice[] = [];
    for (const c of shuffle(poolRef.current)) {
      if (!c.zh || seen.has(c.zh)) continue;
      seen.add(c.zh);
      distractors.push(c);
      if (distractors.length >= 3) break;
    }
    while (distractors.length < 3) distractors.push({ zh: "……", pinyin: "", vi: "" });
    setChoices(shuffle([...distractors, { zh: w.zh, pinyin: w.pinyin, vi: w.vi }]));
    setCur(w);
    setDone(false);
    if (autoRead && w.exCn) speak(cleanZh(w.exCn));
  }, [autoRead]);

  const start = useCallback(async () => {
    stopAudio();
    setScore({ ok: 0, bad: 0 });
    const usable = items.filter((w) => w.zh && w.exCn && w.exCn.includes(w.zh));
    poolRef.current = usable.map((w) => ({ zh: w.zh, pinyin: w.pinyin, vi: w.vi }));
    if (!usable.length) { setEmpty(true); setCur(null); return; }
    setEmpty(false);
    queue.current = (await resolveEffectivePool(usable)).filter((w) => w.exCn && w.exCn.includes(w.zh)); // quá hạn trước
    setTotal(queue.current.length);
    next();
  }, [items, next]);

  useEffect(() => { start(); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { stopAudio(); window.clearTimeout(advance.current); }, []);

  async function choose(c: Choice) {
    if (!cur || locked.current) return;
    const good = c.zh === cur.zh;
    speak(c.zh);
    report(cur.zh, good);
    setPicked({ zh: c.zh, good });
    setScore((s) => ({ ok: s.ok + (good ? 1 : 0), bad: s.bad + (good ? 0 : 1) }));
    if (good) {
      locked.current = true;
      if (autoNext) advance.current = window.setTimeout(next, 1200);
    } else {
      setTimeout(() => setPicked(null), 800); // sai: cho chọn lại
    }
  }

  // Phím 1-4 chọn đáp án
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (shortcutBlocked(e)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= choices.length) { if (!e.repeat) choose(choices[n - 1]); }
    else if ((e.key === "Enter" || e.key === "ArrowRight") && picked?.good) { e.preventDefault(); next(); }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Câu bị khuyết: phần trước + ô trống + phần sau (đúng thì ô trống hiện từ cần điền)
  const at = cur ? cur.exCn.indexOf(cur.zh) : -1;
  const solved = !!picked?.good;

  return (
    <div>
      <div className="study-top">
        <span className="muted study-count">Câu <b className="stat">{total ? total - queue.current.length : 0}</b> / {total}</span>
        <div className="study-bar"><i style={{ width: `${total ? ((total - queue.current.length) / total) * 100 : 0}%` }} /></div>
        <Score ok={score.ok} bad={score.bad} />
      </div>
      <TabOptions>
        <OptSection title="Gợi ý trên câu">
          <OptSwitch checked={showLineMeaning} onChange={setShowLineMeaning} label="Nghĩa câu" />
          <OptSwitch checked={showLinePinyin} onChange={setShowLinePinyin} label="Pinyin câu" />
        </OptSection>
        <OptSection title="Gợi ý trên đáp án">
          <OptSwitch checked={showAnsPinyin} onChange={setShowAnsPinyin} label="Pinyin" />
          <OptSwitch checked={showAnsMeaning} onChange={setShowAnsMeaning} label="Nghĩa" />
        </OptSection>
        <OptSection title="Tự động">
          <OptSwitch checked={autoNext} onChange={setAutoNext} label="Đúng thì tự chuyển câu" />
          <OptSwitch checked={autoRead} onChange={setAutoRead} label="Tự đọc câu" />
        </OptSection>
        <OptSection title="Phím tắt">
          <span className="muted small"><kbd>1</kbd>–<kbd>4</kbd> chọn đáp án · <kbd>Enter</kbd> câu tiếp theo</span>
        </OptSection>
      </TabOptions>
      {empty && <div className="empty"><Icon name="pen" size={28} /><p>Không có câu ví dụ phù hợp. Hãy chọn bộ từ có câu ví dụ.</p></div>}
      {done && (
        <Done title="Hoàn thành!">
          <p className="muted" style={{ marginBottom: "1rem" }}>Đúng {score.ok} · Sai {score.bad}</p>
          <button className="primary" onClick={start}><Icon name="rotate" size={15} />Chơi lại</button>
        </Done>
      )}
      {cur && (
        <>
          <div className="card prompt-card quiz-q">
            <div className="quiz-ask">Chọn từ còn thiếu</div>
            <button className="ghost icon corner" onClick={() => speak(cleanZh(cur.exCn))} title="Nghe cả câu"><Icon name="volume" /></button>
            <div className="hanzi cloze-line">
              {cur.exCn.slice(0, at)}
              <span className={`blank ${solved ? "filled" : ""}`} style={{ minWidth: `${cur.zh.length * 1.15 + 0.6}em` }}>{solved ? cur.zh : ""}</span>
              {cur.exCn.slice(at + cur.zh.length)}
            </div>
            {showLinePinyin && <div className="ex-py">{cur.pySent}</div>}
            {showLineMeaning && <div className="ex-vi">{cur.exVi || `Nghĩa: ${cur.vi}`}</div>}
          </div>
          <div className="quiz-opts">
            {choices.map((c, i) => {
              const state = picked && picked.zh === c.zh ? (picked.good ? "right" : "wrong") : "";
              return (
                <button key={c.zh + c.vi} className={`opt quiz-opt ${state}`} onClick={() => choose(c)}>
                  <kbd>{i + 1}</kbd>
                  <span className="grow cloze-ans">
                    <span className="hanzi opt-zh">{c.zh}</span>
                    {(showAnsPinyin && c.pinyin) || (showAnsMeaning && c.vi) ? (
                      <small>{showAnsPinyin && c.pinyin && <span className="opt-py">{c.pinyin}</span>}{showAnsMeaning && c.vi && <span className="opt-vi">{c.vi}</span>}</small>
                    ) : null}
                  </span>
                  {state && <Icon name={state === "right" ? "checkCircle" : "x"} size={18} />}
                </button>
              );
            })}
          </div>
          {solved && !autoNext && <div className="nav-row"><button className="primary" onClick={next}>Câu tiếp theo <Icon name="chevR" size={16} /></button></div>}
        </>
      )}
    </div>
  );
}
