// Tab "🧩 Sắp xếp câu" — ghép các thẻ từ (đã xáo) thành câu đúng. Port của games/game_sentence_order.py.
// Tách từ bằng jieba (Rust) vì câu tiếng Trung không có khoảng trắng.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Check, Menu, Score } from "../components/ui";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { shuffle } from "../lib/data";
import { dueDaysSort } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { useReport } from "../lib/toast";
import { useVocab } from "../lib/vocabStore";

const MIN_WORDS = 2, MAX_WORDS = 14, MAX_POOL = 400, WRONG_SHOW_MS = 1000;

type Round = { tokens: string[]; fullCn: string; pySent: string; exVi: string; zh: string };
type Tile = { id: number; word: string }; // id = số hiển thị dưới thẻ (1-based)

export default function SentenceOrderTab() {
  const { items } = useVocab();
  const report = useReport();
  const [readSelected, setReadSelected] = usePersistent("order.readSelected", true);
  const [showPinyin, setShowPinyin] = usePersistent("order.showPinyin", true); // pinyin câu gần như lộ thứ tự — cho phép ẩn
  const pool = useRef<Round[]>([]);
  const queue = useRef<Round[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [bank, setBank] = useState<Tile[]>([]);
  const [answer, setAnswer] = useState<Tile[]>([]);
  const [wrongFrom, setWrongFrom] = useState<number | null>(null); // thẻ từ vị trí này trở đi tô đỏ
  const [locked, setLocked] = useState(false);
  const [awaitingNext, setAwaitingNext] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; good: boolean } | null>(null);
  const [hints, setHints] = useState(0);
  const [score, setScore] = useState({ ok: 0, bad: 0 });
  const [msg, setMsg] = useState("Đang chuẩn bị câu…");
  const roundRef = useRef<Round | null>(null);

  const nextRound = useCallback(() => {
    setLocked(false); setAwaitingNext(false); setFeedback(null); setHints(0); setWrongFrom(null); setAnswer([]);
    if (!pool.current.length) { setRound(null); setMsg("Không tìm thấy câu ví dụ phù hợp (cần câu 2-14 từ). Hãy chọn bộ từ vựng có nhiều câu ví dụ hơn."); return; }
    if (!queue.current.length) queue.current = [...pool.current];
    const r = queue.current.shift()!;
    roundRef.current = r;
    setRound(r);
    // xáo, đảm bảo không trùng thứ tự gốc
    let order = r.tokens.map((_, i) => i);
    do { order = shuffle(order); } while (order.length >= 2 && order.every((v, i) => v === i));
    setBank(order.map((idx, n) => ({ id: n + 1, word: r.tokens[idx] })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMsg("Đang chuẩn bị câu…");
    (async () => {
      // dựng bộ câu: mỗi câu ví dụ duy nhất, 2–14 từ
      const seen = new Set<string>();
      const cand = items.filter((w) => { const e = w.exCn.trim(); if (!e || seen.has(e)) return false; seen.add(e); return true; });
      const tokens = await api.segmentWords(cand.map((w) => w.exCn.trim()));
      const rounds: Round[] = [];
      cand.forEach((w, i) => {
        const t = tokens[i];
        if (t.length < MIN_WORDS || t.length > MAX_WORDS || rounds.length >= MAX_POOL) return;
        rounds.push({ tokens: t, fullCn: w.exCn.trim(), pySent: w.pySent, exVi: w.exVi, zh: w.zh });
      });
      const sorted = await dueDaysSort(rounds, (r) => r.zh); // quá hạn trước
      if (cancelled) return;
      pool.current = sorted;
      queue.current = [...sorted];
      setScore({ ok: 0, bad: 0 });
      nextRound();
    })();
    return () => { cancelled = true; };
  }, [items, nextRound]);
  useEffect(() => () => stopAudio(), []);

  function place(t: Tile) {
    if (locked) return;
    setBank((b) => b.filter((x) => x.id !== t.id));
    setAnswer((a) => [...a, t]);
    setFeedback(null);
    if (readSelected) speak(cleanZh(t.word));
  }
  function unplace(t: Tile) {
    if (locked) return;
    setAnswer((a) => a.filter((x) => x.id !== t.id));
    setBank((b) => [...b, t]);
    setFeedback(null);
  }

  async function check() {
    const r = roundRef.current;
    if (awaitingNext) return nextRound();
    if (locked || !r) return;
    if (bank.length) return setFeedback({ text: "Hãy đặt hết các thẻ vào câu trước khi kiểm tra.", good: false });
    const ok = answer.every((t, i) => t.word === r.tokens[i]);
    if (ok) {
      setLocked(true); setAwaitingNext(true);
      setScore((s) => ({ ...s, ok: s.ok + 1 }));
      setFeedback({ text: "Chính xác!", good: true });
      speak(cleanZh(r.fullCn));
      report(r.zh, true);
    } else {
      setScore((s) => ({ ...s, bad: s.bad + 1 }));
      setFeedback({ text: "Chưa đúng — phần sai (màu đỏ) sẽ được bỏ ra.", good: false });
      report(r.zh, false);
      const first = answer.findIndex((t, i) => t.word !== r.tokens[i]);
      setWrongFrom(first);
      setLocked(true);
      // sau 1s: trả phần sai về kho, tự đặt đúng từ kế tiếp
      setTimeout(() => {
        if (roundRef.current !== r) return;
        const kept = answer.slice(0, first);
        const returned = answer.slice(first);
        const rest = [...bank, ...returned];
        const target = r.tokens[first];
        const m = rest.find((t) => t.word === target);
        setWrongFrom(null);
        setAnswer(m ? [...kept, m] : kept);
        setBank(m ? rest.filter((t) => t.id !== m.id) : rest);
        setLocked(false); setFeedback(null);
      }, WRONG_SHOW_MS);
    }
  }

  function hint() {
    const r = roundRef.current;
    if (locked || !r) return;
    // giữ phần đầu ĐÚNG, trả phần sai về kho rồi đặt đúng từ kế tiếp
    let correct = 0;
    while (correct < answer.length && answer[correct].word === r.tokens[correct]) correct++;
    const kept = answer.slice(0, correct);
    const rest = [...bank, ...answer.slice(correct)];
    if (correct >= r.tokens.length) return;
    const m = rest.find((t) => t.word === r.tokens[correct]);
    if (!m) return;
    setAnswer([...kept, m]);
    setBank(rest.filter((t) => t.id !== m.id));
    setHints((h) => h + 1);
    setFeedback(null);
  }

  const tile = (t: Tile, onClick: () => void, bad = false) => (
    <button key={t.id} className={`chip hanzi ${bad ? "bad" : ""}`} onClick={onClick}>{t.word}</button>
  );

  return (
    <div>
      <div className="toolbar">
        <span className="muted">Gợi ý đã dùng <b className="stat" style={{ color: "var(--text)" }}>{hints}</b></span>
        <span className="grow" />
        <Score ok={score.ok} bad={score.bad} />
        <Menu label="Tuỳ chọn" icon="sliders">
          <Check checked={showPinyin} onChange={setShowPinyin} label="Hiện pinyin của câu (dễ hơn)" />
          <Check checked={readSelected} onChange={setReadSelected} label="Đọc từ vừa chọn" />
        </Menu>
      </div>
      {!round ? <p className="muted">{msg}</p> : (
        <>
          <div className="card prompt-card">
            <button className="ghost icon corner" onClick={() => speak(cleanZh(round.fullCn))} title="Nghe cả câu"><Icon name="volume" /></button>
            <div className="order-vi">{round.exVi || "(chưa có nghĩa tiếng Việt cho câu này)"}</div>
            {showPinyin && round.pySent && <div className="ex-py">{round.pySent}</div>}
          </div>
          <div className={`order-zone ${feedback?.good ? "good" : ""}`}>
            {answer.length ? answer.map((t, i) => tile(t, () => unplace(t), wrongFrom !== null && i >= wrongFrom))
              : <span className="muted small">Bấm các thẻ bên dưới theo đúng thứ tự — bấm lại để bỏ ra</span>}
          </div>
          <div className="order-bank">{bank.map((t) => tile(t, () => place(t)))}</div>
          {feedback && <p style={{ textAlign: "center", fontWeight: 600, margin: ".6rem 0 0" }} className={feedback.good ? "ok" : "err"}>{feedback.text}</p>}
          <div className="nav-row">
            <button onClick={hint} disabled={locked}>Gợi ý</button>
            <button className="primary" onClick={check}>{awaitingNext ? <>Tiếp theo <Icon name="chevR" size={16} /></> : "Kiểm tra"}</button>
          </div>
        </>
      )}
    </div>
  );
}
