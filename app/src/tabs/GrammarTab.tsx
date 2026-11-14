// Tab "📖 Ngữ pháp" — tra cứu điểm ngữ pháp theo cấp HSK1-6: mẫu câu (có pinyin), giải thích, ví dụ có 🔊, lưu ý.
// Thứ tự bài (nút "chuyển xuống cuối") lưu cùng khoá QSettings `Grammar/order/<cấp>` như bản Python.
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "../components/Icon";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { loadGrammar, loadPatternPinyin, type GrammarPoint } from "../lib/data";
import { usePersistent } from "../lib/storage";
import { OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { LevelChip, useFollowVocabLevel } from "../components/LevelChip";

const LEVELS = ["HSK1", "HSK2", "HSK3", "HSK4", "HSK5", "HSK6"];
const HAN_RUN = /[一-鿿]+/g;
const EXISTING_PINYIN = /^\s*\([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü'\s]+\)/;
const MAX_WORD_LEN = 4;
type PP = { words: Record<string, string>; chars: Record<string, string> };

/** Pinyin của 1 cụm chữ Hán trong công thức: ưu tiên khớp cụm từ (đúng thanh từ ghép) rồi mới từng chữ. */
function pinyinForRun(run: string, pp: PP): string {
  const parts: string[] = [];
  const chars = [...run];
  for (let i = 0; i < chars.length; ) {
    let hit = false;
    for (let len = Math.min(MAX_WORD_LEN, chars.length - i); len > 1; len--) {
      const py = pp.words[chars.slice(i, i + len).join("")];
      if (py) { parts.push(py); i += len; hit = true; break; }
    }
    if (!hit) { parts.push(pp.chars[chars[i]] ?? chars[i]); i++; }
  }
  return parts.join(" ");
}

/** Chèn pinyin nhỏ ngay sau mỗi cụm chữ Hán trong dòng công thức (bỏ qua chỗ đã có chú thích sẵn). */
function annotatePattern(pattern: string, pp: PP): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of pattern.matchAll(HAN_RUN)) {
    const end = m.index! + m[0].length;
    out.push(pattern.slice(last, m.index!), m[0]);
    if (!EXISTING_PINYIN.test(pattern.slice(end, end + 20))) out.push(<span key={m.index} style={{ color: "#6366f1", fontSize: ".78em" }}>({pinyinForRun(m[0], pp)})</span>);
    last = end;
  }
  out.push(pattern.slice(last));
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>);
}

/** Tô màu các cụm chữ Hán trong đoạn văn xuôi. */
const colorHan = (text: string): ReactNode[] => {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of (text || "").matchAll(HAN_RUN)) {
    out.push(text.slice(last, m.index!), <span key={m.index} style={{ color: "#1d4ed8", fontWeight: 600 }}>{m[0]}</span>);
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>);
};

export default function GrammarTab() {
  const [data, setData] = useState<Record<string, GrammarPoint[]> | null>(null);
  const [pp, setPp] = useState<PP | null>(null);
  const [level, setLevel] = usePersistent("grammar.level", "HSK1");
  const [idx, setIdx] = usePersistent("grammar.idx", 0);
  const [readEx, setReadEx] = usePersistent("grammar.readExamples", false);
  const [autoNext, setAutoNext] = usePersistent("grammar.autoNext", false);
  const run = useRef(0);
  const [query, setQuery] = useState(""); // lọc danh sách bài
  const [exPlaying, setExPlaying] = useState(false); // đang "Nghe tất cả" ví dụ
  const [exActive, setExActive] = useState(-1); // ví dụ đang đọc (tô sáng)

  // Nạp dữ liệu và áp thứ tự đã lưu (bài chưa từng xếp đứng trước = chưa xem)
  useEffect(() => {
    (async () => {
      const g = await loadGrammar();
      const ordered: Record<string, GrammarPoint[]> = {};
      for (const lv of LEVELS) {
        const pts = [...(g[lv] ?? [])];
        try {
          const saved = JSON.parse((await api.settingGet(`Grammar/order/${lv}`)) ?? "[]") as string[];
          const pos = new Map(saved.map((t, i) => [t, i]));
          pts.sort((a, b) => (pos.get(a.title) ?? -1) - (pos.get(b.title) ?? -1));
        } catch { /* thứ tự mặc định */ }
        ordered[lv] = pts;
      }
      setData(ordered);
      setPp(await loadPatternPinyin());
    })();
  }, []);

  const pickLevel = (n: number) => { run.current++; stopAudio(); setLevel(`HSK${n}`); setIdx(0); setQuery(""); };
  useFollowVocabLevel("grammar", pickLevel);
  const points = data?.[level] ?? [];
  const q = query.trim().toLowerCase();
  const i = Math.min(idx, Math.max(0, points.length - 1));
  const p = points[i];

  const neighbor = useCallback((step: number): [string, number] | null => {
    if (!data) return null;
    const lvIdx = LEVELS.indexOf(level);
    const ni = i + step;
    if (ni >= 0 && ni < (data[level]?.length ?? 0)) return [level, ni];
    const nl = lvIdx + step;
    if (nl < 0 || nl >= LEVELS.length) return null;
    const pts = data[LEVELS[nl]] ?? [];
    return pts.length ? [LEVELS[nl], step > 0 ? 0 : pts.length - 1] : null;
  }, [data, level, i]);

  const go = (t: [string, number] | null) => { if (t) { run.current++; stopAudio(); setLevel(t[0]); setIdx(t[1]); } };

  // Tự đọc lần lượt các ví dụ (và tự qua bài kế khi bật)
  useEffect(() => {
    if (!p || !readEx) return;
    const my = ++run.current;
    (async () => {
      for (const [zh] of p.examples) {
        if (run.current !== my) return;
        await speak(cleanZh(zh));
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (run.current === my && autoNext) go(neighbor(1));
    })();
    return () => { run.current++; stopAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.title, level, readEx, autoNext]);

  // Nghe lần lượt mọi ví dụ của bài (bấm lại để dừng)
  async function playExamples() {
    if (!p) return;
    if (exPlaying) { run.current++; stopAudio(); setExPlaying(false); setExActive(-1); return; }
    const my = ++run.current;
    setExPlaying(true);
    for (let n = 0; n < p.examples.length; n++) {
      if (run.current !== my) return;
      setExActive(n);
      await speak(cleanZh(p.examples[n][0]));
      await new Promise((r) => setTimeout(r, 600));
    }
    if (run.current === my) { setExPlaying(false); setExActive(-1); }
  }
  useEffect(() => { setExPlaying(false); setExActive(-1); }, [p?.title]);

  async function moveToEnd() {
    if (!data || i >= points.length - 1) return;
    const next = [...points];
    next.push(next.splice(i, 1)[0]);
    setData({ ...data, [level]: next });
    await api.settingSet(`Grammar/order/${level}`, JSON.stringify(next.map((x) => x.title)));
  }

  if (!data || !pp) return <p>Đang tải…</p>;
  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      <TabOptions>
        <OptSection title="Âm thanh">
          <OptSwitch checked={readEx} onChange={setReadEx} label="Đọc ví dụ khi mở bài" />
          <OptSwitch checked={autoNext} onChange={setAutoNext} label="Đọc xong tự sang bài mới" disabled={!readEx} />
        </OptSection>
      </TabOptions>
      <aside className="side-list">
        <LevelChip value={Number(level.replace("HSK", ""))} onChange={pickLevel} unit="bài"
          counts={Object.fromEntries(LEVELS.map((lv) => [Number(lv.replace("HSK", "")), data?.[lv]?.length]).filter(([, c]) => c !== undefined))} />
        <div className="side-card">
          <div className="side-search">
            <Icon name="search" size={15} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Tìm trong ${points.length} điểm ngữ pháp…`} />
          </div>
          <div className="side-items">
            {/* Tên bài dạng "是 — Động từ 'là'": phần trước dấu — (mẫu/chữ Hán) đậm ở trên, phần giải thích nhỏ ở dưới */}
            {points.map((x, n) => {
              if (q && !x.title.toLowerCase().includes(q)) return null;
              const [key, ...rest] = x.title.split(" — ");
              return (
                <button key={x.title} className={n === i ? "active" : ""} onClick={() => { run.current++; stopAudio(); setIdx(n); }}>
                  <span className="n">{n + 1}</span>
                  <span className="t">{rest.length ? <><b>{colorHan(key)}</b><small>{rest.join(" — ")}</small></> : <b className="plain">{colorHan(key)}</b>}</span>
                </button>
              );
            })}
            {q && !points.some((x) => x.title.toLowerCase().includes(q)) && <p className="muted small side-none">Không tìm thấy “{query}”.</p>}
          </div>
        </div>
      </aside>
      <div className="grow lesson">
        {!p ? <div className="empty"><Icon name="book" size={28} /><p>Chưa có bài.</p></div> : (
          <>
            {/* Đầu bài: cấp + số bài, tiêu đề, cấu trúc câu, giải thích */}
            <header className="lesson-head">
              <div className="lesson-meta">
                <span className="pill accent">{level}</span>
                <span className="muted">Bài <b className="stat">{i + 1}</b> / {points.length}</span>
                <span className="grow" />
                <button className="lesson-done" disabled={i >= points.length - 1} onClick={moveToEnd} title="Đã học bài này — chuyển xuống cuối danh sách"><Icon name="check" size={15} />Đã học</button>
              </div>
              <h2 className="lesson-title">{colorHan(p.title)}</h2>
              {p.pattern && <div className="lesson-pattern"><span className="lbl">Cấu trúc</span><code>{annotatePattern(p.pattern, pp)}</code></div>}
              <p className="lesson-explain">{colorHan(p.explain)}</p>
            </header>

            <section className="lesson-sec">
              <div className="lesson-h">
                <h3>Ví dụ <span className="cnt">{p.examples.length}</span></h3>
                {!!p.examples.length && <button className={exPlaying ? "active" : ""} onClick={playExamples}><Icon name={exPlaying ? "pause" : "play"} size={14} />{exPlaying ? "Dừng" : "Nghe tất cả"}</button>}
              </div>
              {p.examples.length ? (
                <div className="ex-list">
                  {p.examples.map(([zh, py, vi], n) => (
                    <div key={n} className={`ex-card ${exActive === n ? "on" : ""}`} onClick={() => { run.current++; setExPlaying(false); setExActive(n); speak(cleanZh(zh)).finally(() => setExActive((a) => (a === n ? -1 : a))); }} title="Bấm để nghe">
                      <span className="ex-n">{n + 1}</span>
                      <div className="grow">
                        <div className="hanzi ex-zh">{zh}</div>
                        <div className="ex-py">{py}</div>
                        <div className="ex-vi">{vi}</div>
                      </div>
                      <span className="ex-play"><Icon name="volume" size={16} /></span>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">Chưa có ví dụ.</p>}
            </section>

            {!!p.notes?.length && (
              <section className="lesson-sec">
                <div className="lesson-h"><h3>Lưu ý</h3></div>
                <ul className="lesson-notes">{p.notes.map((n, k) => <li key={k}>{colorHan(n)}</li>)}</ul>
              </section>
            )}

            {/* Chuyển bài: hiện tên bài trước / sau */}
            <nav className="lesson-nav">
              {(() => { const t = neighbor(-1); const q = t && data?.[t[0]]?.[t[1]]; return (
                <button disabled={!q} onClick={() => go(t)}><Icon name="chevL" size={18} /><span><small>Bài trước{t && t[0] !== level ? ` · ${t[0]}` : ""}</small>{q ? q.title : "—"}</span></button>
              ); })()}
              {(() => { const t = neighbor(1); const q = t && data?.[t[0]]?.[t[1]]; return (
                <button className="next" disabled={!q} onClick={() => go(t)}><span><small>Bài sau{t && t[0] !== level ? ` · ${t[0]}` : ""}</small>{q ? q.title : "—"}</span><Icon name="chevR" size={18} /></button>
              ); })()}
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
