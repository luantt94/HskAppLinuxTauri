// Tab "🔲 Ghép cặp" — 8 chữ Hán ở trên, 8 pinyin ở dưới; chọn đúng cặp thì cả hai biến mất, từ mới thế chỗ.
// Port của games/game_grid_quiz.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Score } from "../components/ui";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { shuffle } from "../lib/data";
import { resolveEffectivePool } from "../lib/srsPool";
import { useReport } from "../lib/toast";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";

const BOARD = 8, MATCH_FLASH_MS = 500, WRONG_FLASH_MS = 600;

export default function GridQuizTab() {
  const { items } = useVocab();
  const report = useReport();
  const pool = useRef<Word[]>([]);
  const missed = useRef<Set<string>>(new Set());
  const token = useRef(0);
  const [top, setTop] = useState<Word[]>([]);
  const [bot, setBot] = useState<Word[]>([]);
  const [selTop, setSelTop] = useState(0);
  const [selBot, setSelBot] = useState(0);
  const [touched, setTouched] = useState({ top: false, bot: false });
  const [flash, setFlash] = useState<"" | "good" | "bad">("");
  const [locked, setLocked] = useState(true);
  const [matched, setMatched] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [total, setTotal] = useState(0);
  const [last, setLast] = useState<Word | null>(null);
  const [meaning, setMeaning] = useState<string | null>(null);

  const newRound = useCallback(async () => {
    token.current++;
    stopAudio();
    const p = (await resolveEffectivePool(items)).filter((w) => w.zh.trim() && w.pinyin.trim());
    pool.current = [...p];
    missed.current = new Set();
    const first = pool.current.splice(0, Math.min(BOARD, pool.current.length));
    setTop(first); setBot(shuffle(first));
    setSelTop(0); setSelBot(0); setTouched({ top: false, bot: false });
    setTotal(p.length); setMatched(0); setWrong(0); setLast(null); setMeaning(null); setFlash("");
    setLocked(!first.length);
  }, [items]);
  useEffect(() => { newRound(); }, [newRound]);
  useEffect(() => () => stopAudio(), []);

  function evaluate(st: number, sb: number, t: { top: boolean; bot: boolean }) {
    const a = top[st], b = bot[sb];
    if (!a || !b) return;
    if (a.pinyin.trim() === b.pinyin.trim()) {
      setLocked(true); setFlash("good"); speak(cleanZh(a.zh));
      const my = token.current;
      setTimeout(() => {
        if (my !== token.current) return;
        if (!missed.current.has(a.zh)) report(a.zh, true);
        setMatched((m) => m + 1); setLast(a);
        const nt = top.filter((_, i) => i !== st);
        const nb = bot.filter((_, i) => i !== sb);
        const fresh = pool.current.shift();
        if (fresh) { nt.push(fresh); nb.splice(Math.floor(Math.random() * (nb.length + 1)), 0, fresh); }
        setTop(nt); setBot(nb);
        setSelTop(0); setSelBot(0); setTouched({ top: false, bot: false }); setMeaning(null); setFlash("");
        setLocked(nt.length === 0);
      }, MATCH_FLASH_MS);
    } else if (t.top && t.bot) {
      setWrong((w) => w + 1);
      if (!missed.current.has(a.zh)) { missed.current.add(a.zh); report(a.zh, false); }
      setTouched({ top: false, bot: false });
      setLocked(true); setFlash("bad");
      const my = token.current;
      setTimeout(() => { if (my === token.current) { setLocked(false); setFlash(""); } }, WRONG_FLASH_MS);
    }
  }

  function clickTop(i: number) {
    if (locked || i >= top.length) return;
    const t = { ...touched, top: true };
    setSelTop(i); setTouched(t); setMeaning(top[i].vi || "(chưa có nghĩa)"); setLast(top[i]);
    evaluate(i, selBot, t);
  }
  function clickBot(i: number) {
    if (locked || i >= bot.length) return;
    const t = { ...touched, bot: true };
    setSelBot(i); setTouched(t); setMeaning(bot[i].vi || "(chưa có nghĩa)"); setLast(bot[i]);
    evaluate(selTop, i, t);
  }

  // Ô đang chọn: xanh dương; lúc vừa ghép: xanh lá (đúng) / đỏ (sai)
  const cls = (sel: boolean) => `pair ${sel ? (flash === "good" ? "good" : flash === "bad" ? "bad" : "sel") : ""}`;

  const finished = total > 0 && top.length === 0;
  return (
    <div>
      <div className="toolbar">
        <span className="muted">Đã ghép <b className="stat" style={{ color: "var(--text)" }}>{matched}</b> / {total}</span>
        <div className="pbar grow" style={{ maxWidth: "14rem" }}><div style={{ width: `${total ? (matched / total) * 100 : 0}%` }} /></div>
        <span className="grow" />
        <Score ok={matched} bad={wrong} />
        <button onClick={newRound}><Icon name="rotate" size={16} />Chơi lại</button>
      </div>
      {finished ? (
        <p className="ok" style={{ margin: ".7rem 0", fontWeight: 700 }}>Hoàn thành! Ghép đúng {matched} từ, sai {wrong} lần.</p>
      ) : !top.length ? (
        <p className="muted" style={{ margin: ".7rem 0" }}>Chưa có từ vựng nào (cần có pinyin) — hãy chọn bộ từ ở nút phía trên bên phải.</p>
      ) : null}
      <div className="pair-label">Chữ Hán</div>
      <div className="pair-grid">
        {top.map((w, i) => <button key={w.zh} className={`${cls(i === selTop && (touched.top || !!flash))} hanzi zh`} onClick={() => clickTop(i)}>{w.zh}</button>)}
      </div>
      <div className="pair-meaning">{meaning}</div>
      <div className="pair-label">Pinyin</div>
      <div className="pair-grid">
        {bot.map((w, i) => <button key={w.zh} className={`${cls(i === selBot && (touched.bot || !!flash))} py`} onClick={() => clickBot(i)}>{w.pinyin}</button>)}
      </div>
      {last && (
        <div className="card pair-last">
          <div><span className="hanzi zh">{last.zh}</span> <span className="py">{last.pinyin}</span> <span className="vi">{last.vi || "(chưa có nghĩa)"}</span></div>
          {last.exCn && <div className="ex"><div className="hanzi">{last.exCn}</div><div className="muted small">{last.pySent}</div><div className="muted small">{last.exVi}</div></div>}
        </div>
      )}
    </div>
  );
}
