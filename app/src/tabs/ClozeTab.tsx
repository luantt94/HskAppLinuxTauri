// Tab "📝 Điền từ" — câu ví dụ bị khuyết chữ cần điền + 4 đáp án. Port của games/game_cloze.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Check, Done, Score } from "../components/ui";
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

  const cloze = cur ? cur.exCn.replace(cur.zh, "____") : "";
  const T = (b: boolean, set: (v: boolean) => void, label: string) => <Check checked={b} onChange={set} label={label} />;

  return (
    <div>
      <div className="toolbar">
        {T(showLineMeaning, setShowLineMeaning, "Nghĩa câu")}
        {T(showLinePinyin, setShowLinePinyin, "Pinyin câu")}
        {T(showAnsPinyin, setShowAnsPinyin, "Pinyin đáp án")}
        {T(showAnsMeaning, setShowAnsMeaning, "Nghĩa đáp án")}
        {T(autoNext, setAutoNext, "Tự chuyển câu")}
        {T(autoRead, setAutoRead, "Tự đọc câu")}
        <span className="grow" />
        <Score ok={score.ok} bad={score.bad} />
      </div>
      {empty && <div className="hint-box">Không có câu ví dụ phù hợp. Hãy chọn bộ từ có câu ví dụ.</div>}
      {done && <Done title="Hoàn thành!"><button className="primary" onClick={start}>Chơi lại</button></Done>}
      {cur && (
        <>
          <div className="card prompt-card">
            {showLineMeaning && <div style={{ color: "#c2410c" }}>{cur.exVi || `Nghĩa: ${cur.vi}`}</div>}
            {showLinePinyin && <div style={{ color: "#0e7490" }}>{cur.pySent}</div>}
            <div className="hanzi" style={{ fontSize: "2.1rem", margin: ".7rem 0 1rem", lineHeight: 1.5 }}>{cloze}</div>
            <button onClick={() => speak(cleanZh(cur.exCn))}><Icon name="volume" size={16} /> Đọc câu</button>
          </div>
          <div style={{ marginTop: 10 }}>
            {choices.map((c) => {
              const state = picked && picked.zh === c.zh ? (picked.good ? "right" : "wrong") : "";
              return (
                <button key={c.zh + c.vi} className={`opt ${state}`} onClick={() => choose(c)}>
                  <span className="hanzi" style={{ fontSize: "1.3rem", fontWeight: 600 }}>{c.zh}</span>
                  {showAnsPinyin && c.pinyin && <span style={{ color: "#7c3aed", marginLeft: 12 }}>{c.pinyin}</span>}
                  {showAnsMeaning && c.vi && <span className="muted" style={{ marginLeft: 12 }}>{c.vi}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
