// Tab "🀄 Từ rơi" — port của games/game_falling_words.py (bỏ chế độ Dễ như bản gốc).
// Mỗi từ là một "hàng" rơi dần xuống: câu hỏi ở trên, 2–3 đáp án hàng ngang bên dưới.
// Chọn đúng/sai được ghi vào SRS; từ rơi hết khung mà chưa chọn thì biến mất (không tính điểm).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Check, Menu, Score } from "../components/ui";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { shuffle } from "../lib/data";
import { FALLBACK_VI, FALLBACK_ZH, MODES, fieldOf, thirdField } from "../lib/fields";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { useReport } from "../lib/toast";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";
import { exportWordsPdf } from "../lib/exporter";

type Row = {
  id: number;
  word: Word;
  y: number; // toạ độ mép trên (px) trong khung
  h: number; // chiều cao hàng
  texts: string[]; // N đáp án theo thứ tự hiển thị
  thirds: string[]; // trường "còn lại" dưới từng đáp án (hiện sau khi chọn)
  correctIdx: number;
  picked: number | null;
  autoDone?: boolean;
};

const ROW_H = 150;
const GAP = 40;
const MAX_ROWS = 3;
const BASE_PX_PER_SEC = 60; // tốc độ x1.0 (như velocity=1 px/frame ở 60fps)

export default function FallingTab() {
  const { items } = useVocab();
  const report = useReport();
  const [mode, setMode] = usePersistent<string>("fall.mode", "1,0");
  const [answerCount, setAnswerCount] = usePersistent<number>("fall.answers", 2);
  const [auto, setAuto] = usePersistent("fall.auto", false);
  const [step, setStep] = useState(5); // tốc độ = step/5 (0.2x … 5.0x)
  const [paused, setPaused] = useState(false);
  const [, force] = useState(0);
  const [score, setScore] = useState({ ok: 0, bad: 0 });
  const [round, setRound] = useState(1);

  const [q, a] = useMemo(() => mode.split(",").map(Number) as [number, number], [mode]);
  const zoneRef = useRef<HTMLDivElement>(null);
  const rows = useRef<Row[]>([]);
  const queue = useRef<Word[]>([]);
  const wrong = useRef<Map<string, Word>>(new Map());
  const nextId = useRef(1);
  const speaking = useRef(false);
  const live = useRef({ paused, step, auto, answerCount, q, a, items });
  live.current = { paused, step, auto, answerCount, q, a, items };

  const playable = useCallback((w: Word) => !!(w.zh && fieldOf(w, q) && fieldOf(w, a)), [q, a]);

  // ----- tạo hàng mới -----
  const pickWrongs = useCallback((correct: string, k: number): string[] => {
    const pool = [...new Set(live.current.items.map((w) => fieldOf(w, a)).filter(Boolean))];
    const out: string[] = [];
    for (const x of shuffle(pool)) { if (x !== correct && !out.includes(x)) out.push(x); if (out.length >= k) break; }
    const fb = shuffle((a === 0 ? FALLBACK_ZH : a === 1 ? FALLBACK_VI : []).filter((x) => x !== correct && !out.includes(x)));
    while (out.length < k && fb.length) out.push(fb.pop()!);
    while (out.length < k) out.push(correct + "？".repeat(out.length + 1));
    return out;
  }, [a]);

  const thirdFor = useCallback((text: string): string => {
    const t = thirdField(q, a);
    return live.current.items.find((w) => fieldOf(w, a) === text && fieldOf(w, t))?.[["zh", "vi", "pinyin", "exCn", "exVi", "pySent"][t] as keyof Word] ?? "";
  }, [q, a]);

  const makeRow = useCallback((w: Word, topY: number): Row => {
    const n = live.current.answerCount;
    const wrongs = pickWrongs(fieldOf(w, a), n - 1);
    const correctIdx = Math.floor(Math.random() * n);
    const texts = [...wrongs];
    texts.splice(correctIdx, 0, fieldOf(w, a));
    const t = thirdField(q, a);
    const thirds = texts.map((tx, i) => (i === correctIdx ? fieldOf(w, t) : thirdFor(tx)));
    return { id: nextId.current++, word: w, y: topY, h: ROW_H, texts, thirds, correctIdx, picked: null };
  }, [pickWrongs, thirdFor, q, a]);

  const spawnAbove = useCallback(() => {
    if (!queue.current.length) return;
    const minTop = rows.current.length ? Math.min(...rows.current.map((r) => r.y)) : 0;
    const bottom = Math.min(minTop - GAP, -10);
    rows.current.push(makeRow(queue.current.shift()!, bottom - ROW_H));
  }, [makeRow]);

  const startRound = useCallback(async () => {
    const pool = await resolveEffectivePool(live.current.items); // sắp theo hạn ôn: quá hạn lâu nhất trước
    queue.current = pool.filter(playable);
    rows.current = [];
    for (let i = 0; i < MAX_ROWS; i++) spawnAbove();
    force((n) => n + 1);
  }, [playable, spawnAbove]);

  const resetGame = useCallback(() => {
    setScore({ ok: 0, bad: 0 });
    setRound(1);
    stopAudio();
    speaking.current = false;
    startRound();
  }, [startRound]);

  useEffect(() => { resetGame(); }, [items, mode, answerCount]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAudio(), []);

  // ----- trả lời -----
  const speakText = (w: Word) => (q >= 3 && w.exCn ? w.exCn : w.zh);

  function answer(row: Row, idx: number | "again") {
    if (row.picked !== null) return;
    const good = idx !== "again" && idx === row.correctIdx;
    row.picked = idx === "again" ? row.correctIdx : idx;
    if (idx !== "again") setScore((s) => ({ ok: s.ok + (good ? 1 : 0), bad: s.bad + (good ? 0 : 1) }));
    speak(cleanZh(speakText(row.word)));
    report(row.word.zh, good);
    if (!good) {
      wrong.current.set(row.word.zh, row.word);
      if (idx === "again") queue.current.push(row.word); // "Again": cho từ quay lại sớm
    }
    force((n) => n + 1);
  }

  // ----- vòng lặp rơi -----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = live.current;
      const H = zoneRef.current?.clientHeight ?? 420;
      if (!L.paused) {
        const dy = BASE_PX_PER_SEC * (L.step / 5) * dt;
        for (const r of rows.current) r.y += dy;
        // hàng rơi khỏi đáy -> bỏ (không tính điểm)
        rows.current = rows.current.filter((r) => r.y + r.h < H + 20);
        // chế độ Tự động: tới ~30% tự chọn đúng và đọc; quá ~70% chọn luôn không đọc
        if (L.auto) {
          for (const r of rows.current) {
            if (r.picked !== null) continue;
            const pct = (r.y + r.h) / H;
            if (pct >= 0.7) { r.picked = r.correctIdx; setScore((s) => ({ ...s, ok: s.ok + 1 })); }
            else if (pct >= 0.3 && !speaking.current) {
              r.picked = r.correctIdx;
              setScore((s) => ({ ...s, ok: s.ok + 1 }));
              speaking.current = true;
              speak(cleanZh(speakText(r.word))).finally(() => { speaking.current = false; });
            }
          }
        }
        while (rows.current.length < MAX_ROWS && queue.current.length) spawnAbove();
        if (!queue.current.length && !rows.current.length) {
          // hết lượt -> sang lượt mới sau 0.5s
          rows.current = [];
          setRound((n) => n + 1);
          window.setTimeout(() => startRound(), 500);
          queue.current = [];
          last = now + 600;
        }
        force((n) => (n + 1) % 1000000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawnAbove, startRound]);

  const wrongCount = wrong.current.size;
  const clr = (r: Row, i: number) =>
    r.picked === null ? undefined : i === r.correctIdx ? { background: "var(--good-soft)", borderColor: "var(--good)" } : i === r.picked ? { background: "var(--bad-soft)", borderColor: "var(--bad)" } : undefined;
  // Chế độ: nhóm Từ (trường 0–2) hoặc Câu (3–5); đổi nhóm giữ nguyên chiều hỏi → đáp
  const isSent = q >= 3;
  const setGroup = (sent: boolean) => sent !== isSent && setMode(`${q + (sent ? 3 : -3)},${a + (sent ? 3 : -3)}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Hay chỉnh khi đang chơi (tạm dừng, tốc độ) để ngoài; chế độ chơi gom vào menu */}
      <div className="toolbar" style={{ marginTop: 0 }}>
        <Score ok={score.ok} bad={score.bad} />
        <span className="muted">Lượt <b className="stat" style={{ color: "var(--text)" }}>{round}</b></span>
        <span className="grow" />
        <span className="muted">Tốc độ</span>
        <div className="stepper">
          <button disabled={step <= 1} onClick={() => setStep((s) => s - 1)} title="Chậm hơn">−</button>
          <b className="stat" style={{ minWidth: "3rem" }}>{(step / 5).toFixed(1)}x</b>
          <button disabled={step >= 25} onClick={() => setStep((s) => s + 1)} title="Nhanh hơn">+</button>
        </div>
        <button className={paused ? "primary" : ""} onClick={() => setPaused((p) => !p)}><Icon name={paused ? "play" : "pause"} size={15} />{paused ? "Tiếp tục" : "Tạm dừng"}</button>
        <Menu label="Chế độ" icon="sliders">
          <div className="tabs seg">
            <button className={!isSent ? "active" : ""} onClick={() => setGroup(false)}>Từ vựng</button>
            <button className={isSent ? "active" : ""} onClick={() => setGroup(true)}>Câu</button>
          </div>
          {MODES.filter(([mq]) => (mq >= 3) === isSent).map(([mq, ma, label]) => (
            <label key={label}><input type="radio" checked={mode === `${mq},${ma}`} onChange={() => setMode(`${mq},${ma}`)} />{label.split(": ")[1]}</label>
          ))}
          <div className="menu-row"><span className="grow">Số đáp án</span>
            <div className="tabs seg">{[2, 3].map((n) => <button key={n} className={answerCount === n ? "active" : ""} onClick={() => setAnswerCount(n)}>{n}</button>)}</div>
          </div>
          <Check checked={auto} onChange={setAuto} label="Tự động chọn đúng (chỉ nghe)" />
          <hr className="menu-sep" />
          <button disabled={!wrongCount} onClick={() => exportWordsPdf([...wrong.current.values()], "Các từ đã trả lời sai (Từ rơi)", "HskApp — Từ trả lời sai")}>
            <Icon name="download" size={16} />Xuất PDF từ sai{wrongCount ? ` (${wrongCount})` : ""}
          </button>
        </Menu>
      </div>
      <div className="fallzone grow" ref={zoneRef} style={{ minHeight: 260 }}>
        {rows.current.map((r) => (
          <div key={r.id} style={{ position: "absolute", left: 0, right: 0, top: 0, transform: `translateY(${r.y}px)`, textAlign: "center" }}>
            <div className="faller hanzi" style={{ position: "static", display: "inline-block", fontSize: "1.5rem", fontWeight: q === 0 || q === 3 ? 700 : 500 }}>
              {fieldOf(r.word, q)}
            </div>
            <div className="row" style={{ justifyContent: "center", alignItems: "flex-start", marginTop: 10, gap: 14 }}>
              {r.texts.map((t, i) => (
                <Fragment key={i}>
                  {i === Math.ceil(r.texts.length / 2) && (
                    // nút "Again" (chỉ icon) nằm chính giữa các đáp án; vẫn giữ chỗ khi đã chọn để đáp án không bị xê dịch
                    <button className="icon" style={{ visibility: r.picked === null ? "visible" : "hidden" }} title="Hiện đáp án (tính là chưa thuộc)" onClick={() => answer(r, "again")}><Icon name="rotate" size={16} /></button>
                  )}
                  <div style={{ maxWidth: 300 }}>
                    <button className="hanzi" style={{ fontSize: "1.15rem", ...clr(r, i) }} onClick={() => answer(r, i)}>{t}</button>
                    {r.picked !== null && r.thirds[i] && <div className="muted" style={{ fontSize: ".8rem" }}>{r.thirds[i]}</div>}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
        {!rows.current.length && !queue.current.length && <p className="muted" style={{ padding: 16 }}>Không có từ nào phù hợp với chế độ này.</p>}
      </div>
    </div>
  );
}
