// Tab "📝 Điền từ" — câu ví dụ bị khuyết chữ cần điền + 4 đáp án. Port của games/game_cloze.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Check, Done, Menu, Score } from "../components/ui";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { shuffle } from "../lib/data";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { useReport } from "../lib/toast";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";

type Choice = { zh: string; pinyin: string; vi: string };

export default function ClozeTab() {
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
  const locked = useRef(false);

  const next = useCallback(() => {
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
    next();
  }, [items, next]);

  useEffect(() => { start(); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAudio(), []);

  async function choose(c: Choice) {
    if (!cur || locked.current) return;
    const good = c.zh === cur.zh;
    speak(c.zh);
    report(cur.zh, good);
    setPicked({ zh: c.zh, good });
    setScore((s) => ({ ok: s.ok + (good ? 1 : 0), bad: s.bad + (good ? 0 : 1) }));
    if (good) {
      locked.current = true;
      if (autoNext) setTimeout(next, 1200);
    } else {
      setTimeout(() => setPicked(null), 800); // sai: cho chọn lại
    }
  }

  // Câu bị khuyết: phần trước + ô trống + phần sau (đúng thì ô trống hiện từ cần điền)
  const at = cur ? cur.exCn.indexOf(cur.zh) : -1;
  const solved = !!picked?.good;
  const T = (b: boolean, set: (v: boolean) => void, label: string) => <Check checked={b} onChange={set} label={label} />;

  return (
    <div>
      <div className="toolbar">
        <span className="muted">Còn <b className="stat" style={{ color: "var(--text)" }}>{queue.current.length + (cur ? 1 : 0)}</b> câu</span>
        <span className="grow" />
        <Score ok={score.ok} bad={score.bad} />
        <Menu label="Tuỳ chọn" icon="sliders">
          <div className="menu-head">Gợi ý trên câu</div>
          {T(showLineMeaning, setShowLineMeaning, "Nghĩa câu")}
          {T(showLinePinyin, setShowLinePinyin, "Pinyin câu")}
          <div className="menu-head">Gợi ý trên đáp án</div>
          {T(showAnsPinyin, setShowAnsPinyin, "Pinyin")}
          {T(showAnsMeaning, setShowAnsMeaning, "Nghĩa")}
          <div className="menu-head">Tự động</div>
          {T(autoNext, setAutoNext, "Đúng thì tự chuyển câu")}
          {T(autoRead, setAutoRead, "Tự đọc câu")}
        </Menu>
      </div>
      {empty && <div className="hint-box">Không có câu ví dụ phù hợp. Hãy chọn bộ từ có câu ví dụ.</div>}
      {done && <Done title="Hoàn thành!"><button className="primary" onClick={start}>Chơi lại</button></Done>}
      {cur && (
        <>
          <div className="card prompt-card">
            <button className="ghost icon corner" onClick={() => speak(cleanZh(cur.exCn))} title="Nghe cả câu"><Icon name="volume" /></button>
            <div className="hanzi cloze-line">
              {cur.exCn.slice(0, at)}
              <span className={`blank ${solved ? "filled" : ""}`} style={{ minWidth: `${cur.zh.length * 1.15 + 0.6}em` }}>{solved ? cur.zh : ""}</span>
              {cur.exCn.slice(at + cur.zh.length)}
            </div>
            {showLinePinyin && <div className="ex-py">{cur.pySent}</div>}
            {showLineMeaning && <div className="ex-vi">{cur.exVi || `Nghĩa: ${cur.vi}`}</div>}
          </div>
          <div style={{ marginTop: ".8rem" }}>
            {choices.map((c) => {
              const state = picked && picked.zh === c.zh ? (picked.good ? "right" : "wrong") : "";
              return (
                <button key={c.zh + c.vi} className={`opt ${state}`} onClick={() => choose(c)}>
                  <span className="hanzi opt-zh">{c.zh}</span>
                  {showAnsPinyin && c.pinyin && <span className="opt-py">{c.pinyin}</span>}
                  {showAnsMeaning && c.vi && <span className="opt-vi">{c.vi}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
