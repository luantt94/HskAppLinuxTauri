// Tab "📖 Ngữ pháp" — tra cứu điểm ngữ pháp theo cấp HSK1-6: mẫu câu (có pinyin), giải thích, ví dụ có 🔊, lưu ý.
// Thứ tự bài (nút "chuyển xuống cuối") lưu cùng khoá QSettings `Grammar/order/<cấp>` như bản Python.
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "../components/Icon";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { loadGrammar, loadPatternPinyin, type GrammarPoint } from "../lib/data";
import { usePersistent } from "../lib/storage";

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

  const points = data?.[level] ?? [];
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
      <div style={{ width: 280, overflowY: "auto", flexShrink: 0 }}>
        <div className="row">
          {LEVELS.map((lv) => <button key={lv} className={lv === level ? "active" : ""} style={{ padding: "3px 8px" }} onClick={() => { setLevel(lv); setIdx(0); }}>{lv}</button>)}
        </div>
        {points.map((x, n) => (
          <button key={x.title} className={n === i ? "active" : ""} style={{ display: "block", width: "100%", textAlign: "left", margin: "3px 0", fontWeight: 500 }} onClick={() => { run.current++; setIdx(n); }}>
            {n + 1}. {x.title}
          </button>
        ))}
      </div>
      <div className="grow" style={{ overflowY: "auto" }}>
        {!p ? <p className="muted">Chưa có bài.</p> : (
          <>
            <div className="row">
              <button disabled={!neighbor(-1)} onClick={() => go(neighbor(-1))}><Icon name="chevL" size={16} /> Bài trước</button>
              <button disabled={!neighbor(1)} onClick={() => go(neighbor(1))}>Bài sau <Icon name="chevR" size={16} /></button>
              <button disabled={i >= points.length - 1} onClick={moveToEnd} title="Đã học bài này — chuyển xuống cuối danh sách">⤵ Chuyển xuống cuối</button>
              <label><input type="checkbox" checked={readEx} onChange={(e) => setReadEx(e.target.checked)} /> Đọc ví dụ</label>
              <label style={{ opacity: readEx ? 1 : 0.5 }}><input type="checkbox" disabled={!readEx} checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> Tự động qua bài mới</label>
            </div>
            <h2 style={{ marginTop: 12 }}>{colorHan(p.title)}</h2>
            {p.pattern && <div style={{ fontFamily: "Consolas, monospace", background: "#eef2ff", color: "#3730a3", padding: "8px 12px", borderRadius: 6, display: "inline-block", margin: "6px 0 10px" }}>{annotatePattern(p.pattern, pp)}</div>}
            <p style={{ lineHeight: 1.6 }}>{colorHan(p.explain)}</p>
            <h3 style={{ color: "#0f766e" }}>Ví dụ</h3>
            {p.examples.length ? p.examples.map(([zh, py, vi], n) => (
              <div key={n} style={{ margin: "10px 0", padding: "10px 12px", background: "#f8fafc", borderLeft: "3px solid #2563eb", borderRadius: 4 }}>
                <div className="hanzi" style={{ fontSize: "1.3rem", color: "#1d4ed8" }}><a style={{ cursor: "pointer", textDecoration: "none" }} onClick={() => speak(cleanZh(zh))}><Icon name="volume" size={16} /></a> {zh}</div>
                <div style={{ color: "#7c3aed" }}>{py}</div>
                <div style={{ color: "#047857", fontWeight: 600 }}>{vi}</div>
              </div>
            )) : <i>Chưa có ví dụ.</i>}
            {!!p.notes?.length && (
              <>
                <h3 style={{ color: "#b45309" }}>Lưu ý chi tiết</h3>
                <div style={{ background: "#fffbeb", borderLeft: "3px solid #f59e0b", borderRadius: 4, padding: "10px 14px" }}>
                  <ul style={{ margin: 0, paddingLeft: 18, color: "#334155", lineHeight: 1.6 }}>{p.notes.map((n, k) => <li key={k} style={{ margin: "6px 0" }}>{colorHan(n)}</li>)}</ul>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
