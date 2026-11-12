// Tab "🔲 Ghép cặp" — 8 chữ Hán ở trên, 8 pinyin ở dưới; chọn đúng cặp thì cả hai biến mất, từ mới thế chỗ.
// Port của games/game_grid_quiz.py.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Score, StatusRow } from "../components/ui";
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

  const style = (sel: boolean, kind: "top" | "bot", size: number) => ({
    fontSize: `${size / 15}rem`, minHeight: 56, margin: 0,
    background: sel ? (flash === "good" ? "#dcfce7" : flash === "bad" ? "#fee2e2" : "#dbeafe") : undefined,
    borderColor: sel ? (flash === "good" ? "#16a34a" : flash === "bad" ? "#dc2626" : "#2563eb") : undefined,
    fontFamily: kind === "top" ? '"PingFang SC","Microsoft YaHei",sans-serif' : undefined,
  });

  const finished = total > 0 && top.length === 0;
  return (
    <div>
      <StatusRow right={<><Score ok={matched} bad={wrong} /><button onClick={newRound}><Icon name="rotate" size={16} />Chơi lại</button></>}>
        <span className="muted">{total ? <>Đã ghép <b>{matched}</b> / {total}</> : ""}</span>
      </StatusRow>
      <p className={finished ? "ok" : "muted"} style={{ margin: ".7rem 0", fontWeight: finished ? 700 : 400 }}>{finished ? `Hoàn thành! Ghép đúng ${matched} từ, sai ${wrong} lần.` : top.length ? "Chọn 1 chữ Hán ở trên và pinyin tương ứng ở dưới" : "Chưa có từ vựng nào (cần có pinyin) — hãy chọn bộ từ ở panel bên phải."}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {top.map((w, i) => <button key={w.zh} className="hanzi" style={style(i === selTop, "top", 28)} onClick={() => clickTop(i)}>{w.zh}</button>)}
      </div>
      <div style={{ height: 26, textAlign: "center", color: "#475569" }}>{meaning}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {bot.map((w, i) => <button key={w.zh} style={style(i === selBot, "bot", 20)} onClick={() => clickBot(i)}>{w.pinyin}</button>)}
      </div>
      {last && (
        <div className="card" style={{ marginTop: 14 }}>
          <span className="hanzi" style={{ fontSize: "1.6rem", fontWeight: 700 }}>{last.zh}</span>{" "}
          <span className="muted">{last.pinyin}</span> <b style={{ color: "#14532d" }}>— {last.vi || "(chưa có nghĩa)"}</b>
          {last.exCn && <div className="hanzi">{last.exCn}<div className="muted" style={{ fontSize: ".8rem" }}>{last.pySent}</div><div className="muted" style={{ fontSize: ".85rem" }}>{last.exVi}</div></div>}
        </div>
      )}
    </div>
  );
}
