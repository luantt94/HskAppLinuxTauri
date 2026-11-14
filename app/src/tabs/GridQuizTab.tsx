// Tab "🔲 Ghép cặp" — 8 chữ Hán ở trên, 8 pinyin ở dưới; chọn đúng cặp thì cả hai biến mất, từ mới thế chỗ.
// Port của games/game_grid_quiz.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Done, Score } from "../components/ui";
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
      <div className="study-top">
        <span className="muted study-count">Đã ghép <b className="stat">{matched}</b> / {total}</span>
        <div className="study-bar"><i style={{ width: `${total ? (matched / total) * 100 : 0}%` }} /></div>
        <Score ok={matched} bad={wrong} />
        <button className="icon" onClick={newRound} title="Chơi lại từ đầu"><Icon name="rotate" size={16} /></button>
      </div>
      {finished ? (
        <Done title="Hoàn thành!">
          <p className="muted" style={{ marginBottom: "1rem" }}>Ghép đúng {matched} từ, sai {wrong} lần.</p>
          <button className="primary" onClick={newRound}><Icon name="rotate" size={15} />Chơi lại</button>
        </Done>
      ) : !top.length ? (
        <div className="empty"><Icon name="grid" size={28} /><p>Chưa có từ vựng nào (cần có pinyin) — hãy chọn bộ từ ở nút bộ từ trên thanh tiêu đề.</p></div>
      ) : (
        <>
          <section className="pair-board">
            <div className="pair-label"><span className="step">1</span>Chọn chữ Hán</div>
            <div className="pair-grid">
              {top.map((w, i) => <button key={w.zh} className={`${cls(i === selTop && (touched.top || !!flash))} hanzi zh`} onClick={() => clickTop(i)}>{w.zh}</button>)}
            </div>
          </section>
          {/* Nghĩa của ô vừa chọn — nằm giữa 2 bảng */}
          <div className={`pair-meaning ${flash}`}>{meaning ?? <span className="muted">Chọn 1 chữ Hán và 1 pinyin cùng một từ</span>}</div>
          <section className="pair-board">
            <div className="pair-label"><span className="step">2</span>Chọn pinyin tương ứng</div>
            <div className="pair-grid">
              {bot.map((w, i) => <button key={w.zh} className={`${cls(i === selBot && (touched.bot || !!flash))} py`} onClick={() => clickBot(i)}>{w.pinyin}</button>)}
            </div>
          </section>
          {last && (
            <div className="pair-last">
              <div className="pair-last-word">
                <span className="hanzi zh">{last.zh}</span><span className="py">{last.pinyin}</span><span className="vi">{last.vi || "(chưa có nghĩa)"}</span>
                <button className="ghost icon" onClick={() => speak(cleanZh(last.zh))} title="Nghe"><Icon name="volume" size={16} /></button>
              </div>
              {last.exCn && <div className="ex"><div className="hanzi">{last.exCn}</div><div className="ex-py">{last.pySent}</div><div className="muted small">{last.exVi}</div></div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
