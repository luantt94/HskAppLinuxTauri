// Tab "⌨️ Gõ tiếng Trung" — gõ pinyin KHÔNG dấu bằng bàn phím thường, app "gõ ra" chữ Hán bằng cách
// so khớp với chính bộ từ đang học (như bộ gõ mini; từ đồng âm thì hiện danh sách ứng viên để chọn).
// Port của games/game_typing.py.
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Done } from "../components/ui";
import { OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { normalizePinyin } from "../lib/data";
import { dueDaysSort } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { useReport } from "../lib/toast";
import { useVocab } from "../lib/vocabStore";
import { WordList, useWordListOpen } from "../components/WordList";

const MAX_CANDIDATES = 6;
const WRONG_HIGHLIGHT_MS = 900;

type Entry = { zh: string; vi: string; py: string; srsZh: string };

export default function TypingTab() {
  const advance = useRef<number | undefined>(undefined); // hẹn giờ sang từ kế sau khi gõ đúng
  const [wlOpen, setWlOpen] = useWordListOpen(); // cột danh sách từ
  const { items } = useVocab();
  const report = useReport();
  const [sound, setSound] = usePersistent("typing.sound", true);
  const [sentence, setSentence] = usePersistent("typing.sentence", false);
  const [showSound, setShowSound] = usePersistent("typing.promptSound", false);
  const [showPy, setShowPy] = usePersistent("typing.pinyinHint", false);
  const [showVi, setShowVi] = usePersistent("typing.meaning", true);
  const [showZh, setShowZh] = usePersistent("typing.hanzi", false);

  const [order, setOrder] = useState<Entry[]>([]);
  const [all, setAll] = useState<Entry[]>([]);
  const [pos, setPos] = useState(0);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<{ t: string; c: string } | null>(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [wrongFrom, setWrongFrom] = useState<number | null>(null); // bôi đỏ từ vị trí này
  const fixToken = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bộ đề: từ hoặc câu ví dụ (khử trùng), kèm chữ Hán của TỪ GỐC để ghi SRS
  useEffect(() => {
    const seen = new Set<string>();
    const list: Entry[] = [];
    for (const w of items) {
      const e: Entry = sentence
        ? { zh: w.exCn.trim(), vi: w.exVi.trim(), py: w.pySent.trim(), srsZh: w.zh.trim() }
        : { zh: w.zh.trim(), vi: w.vi.trim(), py: w.pinyin.trim(), srsZh: w.zh.trim() };
      if (!e.zh || !e.srsZh || (sentence && !e.py) || seen.has(e.zh)) continue;
      seen.add(e.zh);
      list.push(e);
    }
    setAll(list);
    dueDaysSort(list, (e) => e.srsZh).then((o) => { setOrder(o); setPos(0); setText(""); setFeedback(null); });
  }, [items, sentence]);
  useEffect(() => () => stopAudio(), []);

  const cur = order[pos];
  const pinyinMap = useMemo(() => {
    const m = new Map<string, number[]>();
    all.forEach((e, i) => { const k = normalizePinyin(e.py); if (k) m.set(k, [...(m.get(k) ?? []), i]); });
    return m;
  }, [all]);

  useEffect(() => {
    if (!cur) return;
    setText(""); setFeedback(null); setWrongFrom(null); fixToken.current++;
    if (showSound) speak(cleanZh(cur.zh));
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.zh]);

  // Ứng viên theo từng phím gõ: khớp chính xác trước, rồi khớp tiền tố
  const { exact, live, canCommit } = useMemo(() => {
    const key = normalizePinyin(text);
    if (!key) return { exact: [] as number[], live: [] as number[], canCommit: false };
    const ex: number[] = [], pre: number[] = [];
    for (const [k, idxs] of pinyinMap) {
      if (k === key) idxs.forEach((i) => !ex.includes(i) && ex.push(i));
      else if (k.startsWith(key)) idxs.forEach((i) => !ex.includes(i) && !pre.includes(i) && pre.push(i));
    }
    return { exact: ex, live: [...ex, ...pre].slice(0, MAX_CANDIDATES), canCommit: ex.length > 0 && pre.length === 0 };
  }, [text, pinyinMap]);

  const targetIdx = cur ? all.findIndex((e) => e.zh === cur.zh) : -1;

  function showFix() {
    const target = normalizePinyin(cur?.py ?? "");
    const typed = normalizePinyin(text);
    let common = 0;
    while (common < Math.min(typed.length, target.length) && typed[common] === target[common]) common++;
    if (!target || !typed || (common === target.length && typed.length === target.length)) { setText(""); return; }
    const token = ++fixToken.current;
    setText(typed);
    if (typed.length > common) setWrongFrom(common);
    setTimeout(() => {
      if (token !== fixToken.current) return;
      setWrongFrom(null);
      setText(target.slice(0, common + 1)); // gõ sẵn phần đúng + ký tự đúng kế tiếp
      inputRef.current?.focus();
    }, WRONG_HIGHLIGHT_MS);
  }

  function resolve(typedIdx: number) {
    if (!cur) return;
    if (normalizePinyin(text) !== normalizePinyin(all[typedIdx].py)) {
      setFeedback({ t: "✏️ Chưa nhập đủ — hãy gõ hết pinyin của cả từ/câu rồi mới chọn.", c: "#b45309" });
      return;
    }
    const ok = typedIdx === targetIdx;
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
    report(cur.srsZh, ok);
    if (ok) {
      setFeedback({ t: `✅ Đúng rồi — ${all[typedIdx].zh}`, c: "#18a957" });
      if (sound && !showSound) speak(cleanZh(all[typedIdx].zh));
      advance.current = window.setTimeout(() => setPos((p) => p + 1), 700);
    } else {
      setFeedback({ t: `❌ Bạn gõ ra: ${all[typedIdx].zh} — chưa đúng, thử lại nhé.`, c: "#e74c3c" });
      showFix();
    }
  }

  function commitGeneric() {
    const pool = exact.length ? exact : live;
    if (!pool.length) {
      if (text.trim()) { setFeedback({ t: `❓ Không nhận ra pinyin "${text}" trong bộ từ đang học — thử lại nhé.`, c: "#e74c3c" }); showFix(); }
      return;
    }
    resolve(pool.includes(targetIdx) ? targetIdx : pool[0]); // ưu tiên đúng từ đang hỏi dù có đồng âm
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (/^[1-9]$/.test(e.key) && live.length) { e.preventDefault(); const i = Number(e.key) - 1; if (i < live.length) resolve(live[i]); }
    else if (e.key === " " && canCommit) { e.preventDefault(); commitGeneric(); }
    else if (e.key === "Enter") { e.preventDefault(); commitGeneric(); }
  }

  return (
    <div>
      <div className="study-top">
        <div className="tabs seg">
          <button className={!sentence ? "active" : ""} onClick={() => setSentence(false)}>Từ vựng</button>
          <button className={sentence ? "active" : ""} onClick={() => setSentence(true)}>Câu</button>
        </div>
        <span className="muted study-count">{sentence ? "Câu" : "Từ"} <b className="stat">{order.length ? Math.min(pos + 1, order.length) : 0}</b> / {order.length}</span>
        <div className="study-bar"><i style={{ width: `${order.length ? (Math.min(pos + 1, order.length) / order.length) * 100 : 0}%` }} /></div>
        <span className="score"><span className="s good" title="Gõ đúng / đã làm"><Icon name="checkCircle" size={16} />{score.ok} / {score.total}</span></span>
      </div>
      <WordList open={wlOpen} onClose={() => setWlOpen(false)} index={pos} unit={sentence ? "câu" : "từ"} onPick={(n) => { window.clearTimeout(advance.current); setPos(n); setText(""); setFeedback(null); }}
        // chưa làm: chỉ hiện nghĩa (không lộ chữ Hán / pinyin cần gõ); đã làm qua: hiện đủ
        words={order.map((e, i) => (i < pos ? { zh: e.zh, py: e.py, vi: e.vi, done: true } : { zh: e.vi }))} />
      <TabOptions>
        <OptSection title="Danh sách">
          <OptSwitch checked={wlOpen} onChange={setWlOpen} label="Hiện danh sách từ" hint="Cột bên trái: các từ đang học, bấm để nhảy tới" />
        </OptSection>
        <OptSection title="Gợi ý trên đề">
          <OptSwitch checked={showVi} onChange={setShowVi} label="Nghĩa" />
          <OptSwitch checked={showZh} onChange={setShowZh} label="Chữ Hán" />
          <OptSwitch checked={showPy} onChange={setShowPy} label="Pinyin" />
          <OptSwitch checked={showSound} onChange={setShowSound} label="Nút nghe lại" />
        </OptSection>
        <OptSection title="Âm thanh">
          <OptSwitch checked={sound} onChange={setSound} label="Đọc khi gõ đúng" />
        </OptSection>
        <OptSection title="Cách gõ">
          <span className="muted small">Gõ đủ pinyin không dấu rồi bấm phím số <kbd>1</kbd>–<kbd>6</kbd> để chọn chữ. <kbd>Space</kbd> chỉ chọn khi đã gõ đúng 1 từ.</span>
        </OptSection>
      </TabOptions>

      {!all.length ? <p className="muted">{sentence ? "Bộ từ vựng này chưa có câu ví dụ nào để luyện." : "Chưa có từ vựng nào — hãy chọn bộ từ vựng ở panel bên phải."}</p>
        : !cur ? <Done title="Đã luyện hết danh sách!"><button className="primary" onClick={() => setPos(0)}>Luyện lại</button></Done>
        : (
          <>
            <div className="card prompt-card quiz-q">
              <div className="quiz-ask">{sentence ? "Gõ pinyin của câu" : "Gõ pinyin của từ"}</div>
              {showSound && <button className="ghost icon corner" onClick={() => speak(cleanZh(cur.zh))} title="Nghe lại"><Icon name="volume" /></button>}
              {showZh && <div className="hanzi" style={{ fontSize: sentence ? "1.6rem" : "2.2rem", fontWeight: 800 }}>{cur.zh}</div>}
              {showVi && <div style={{ fontSize: sentence ? "1.2rem" : "1.5rem", fontWeight: 700 }}>{cur.vi}</div>}
              {!showZh && !showVi && <div className="muted"><i>Nghe và gõ pinyin của từ bạn nghe được</i></div>}
              {showPy && <div className="muted" style={{ marginTop: 6 }}>{cur.py}</div>}
            </div>
            <div style={{ position: "relative", margin: "12px 0" }}>
              <input ref={inputRef} className={`typing-input ${wrongFrom !== null ? "bad" : ""}`}
                value={text} onChange={(e) => { fixToken.current++; setWrongFrom(null); setText(e.target.value); }}
                onKeyDown={onKeyDown} placeholder="Gõ pinyin không dấu…" autoFocus />
              {wrongFrom !== null && <div className="err" style={{ fontSize: ".8rem" }}>Phần sai từ ký tự thứ {wrongFrom + 1}</div>}
            </div>
            {live.length > 0 && (
              <div className="ime-list" role="listbox">
                {live.map((i, n) => (
                  <button key={i} className="ime-item" role="option" onClick={() => resolve(i)}>
                    <kbd>{n + 1}</kbd><span className="hanzi">{all[i].zh}</span><span className="muted">{all[i].py}</span>
                  </button>
                ))}
              </div>
            )}
            {feedback && <p style={{ color: feedback.c, fontWeight: 600 }}>{feedback.t}</p>}
            <div className="row" style={{ justifyContent: "center" }}>
              <button onClick={() => { window.clearTimeout(advance.current); setPos((p) => Math.max(0, p - 1)); }}><Icon name="chevL" size={16} /> Trước</button>
              <button onClick={() => setFeedback({ t: `Đáp án: ${cur.zh} (${cur.py})`, c: "#64748b" })}>Xem đáp án</button>
              <button onClick={() => { window.clearTimeout(advance.current); setPos((p) => p + 1); }}>Bỏ qua <Icon name="chevR" size={16} /></button>
            </div>
          </>
        )}
    </div>
  );
}
