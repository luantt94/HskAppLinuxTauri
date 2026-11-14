// Công cụ nổi — port của ui/floating_tools.py: 4 cửa sổ nhỏ kéo thả được đặt trên cửa sổ chính:
// Từ vựng chạy, Ngữ pháp + ví dụ, Tìm theo pinyin & thêm vào bộ, Điền nét còn thiếu. Trỏ chuột vào thì đứng yên.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { allWords, loadGrammar, normalizePinyin, type GrammarPoint } from "../lib/data";
import { loadJson, saveJson, usePersistent } from "../lib/storage";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";
import Icon from "./Icon";
import Modal from "./Modal";

type Pos = { x: number; y: number };

/** Cửa sổ nổi kéo bằng thanh tiêu đề; vị trí được nhớ theo `id`. */
function FloatWindow({ id, title, width, height, slot, onClose, onHover, children }: {
  id: string; title: string; width: number; height?: number; slot: number; onClose: () => void; onHover?: (h: boolean) => void; children: ReactNode;
}) {
  const [pos, setPos] = useState<Pos>(() => loadJson<Pos>(`float.pos.${id}`, { x: Math.max(20, window.innerWidth / 2 - width / 2 + (slot - 2.5) * 90), y: 90 + slot * 55 }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onDown = (e: React.MouseEvent) => { drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.preventDefault(); };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      setPos({ x: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - 80), y: Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 40) });
    };
    const up = () => { if (drag.current) { drag.current = null; setPos((p) => { saveJson(`float.pos.${id}`, p); return p; }); } };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [id]);

  return (
    <div className="float" style={{ left: pos.x, top: pos.y, width, height }} onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}>
      <div className="float-head" onMouseDown={onDown}><span className="grow">{title}</span><button className="ghost icon" style={{ minHeight: "1.6rem", width: "1.6rem" }} onMouseDown={(e) => e.stopPropagation()} onClick={onClose}><Icon name="x" size={15} /></button></div>
      <div className="float-body">{children}</div>
    </div>
  );
}

/** Quay vòng từng phần tử mỗi `ms`; tạm dừng khi bị giữ (chuột đứng trên cửa sổ) hoặc bấm tạm dừng. */
function useCycler<T>(items: T[], ms: number, active: boolean) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);
  useEffect(() => { setIdx(0); }, [items]);
  useEffect(() => {
    if (!active || paused || hold || items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), ms);
    return () => clearInterval(t);
  }, [active, paused, hold, items.length, ms]);
  return { cur: items[idx] as T | undefined, idx, total: items.length, paused, setPaused, setHold, next: () => setIdx((i) => (items.length ? (i + 1) % items.length : 0)), goto: setIdx };
}

const PlayPause = ({ c }: { c: { paused: boolean; setPaused: (b: boolean) => void; next: () => void } }) => (
  <div className="row" style={{ justifyContent: "flex-end", gap: ".3rem" }}>
    <button className="icon" onClick={() => c.setPaused(!c.paused)} title={c.paused ? "Tiếp tục" : "Tạm dừng"}><Icon name={c.paused ? "play" : "pause"} size={15} /></button>
    <button className="icon" onClick={c.next} title="Mục kế tiếp"><Icon name="next" size={15} /></button>
  </div>
);

function Ticker({ words, onClose, slot }: { words: Word[]; onClose: () => void; slot: number }) {
  const c = useCycler(words, 2000, true);
  const [sound, setSound] = usePersistent("float.ticker.sound", false);
  const w = c.cur;
  // Bật tiếng: mỗi khi từ đổi thì đọc từ đó (chữ Hán)
  useEffect(() => { if (sound && w?.zh) speak(cleanZh(w.zh)); }, [sound, w?.zh]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!sound) stopAudio(); }, [sound]);
  useEffect(() => () => stopAudio(), []);
  return (
    <FloatWindow id="ticker" title="Từ vựng chạy" width={340} slot={slot} onClose={onClose} onHover={c.setHold}>
      <div style={{ textAlign: "center", minHeight: "8rem" }}>
        {!w ? <p className="muted">(bộ từ vựng đang trống)</p> : (<>
          <div className="hanzi" style={{ fontSize: "2.8rem", fontWeight: 700, color: "var(--zh)", lineHeight: 1.2 }}>{w.zh}</div>
          <div style={{ fontSize: "1.2rem", color: "var(--py)" }}>{w.pinyin}</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--vi)" }}>{w.vi}</div></>)}
      </div>
      <div className="row" style={{ marginTop: ".5rem", justifyContent: "space-between" }}>
        <span className="muted small">{c.total ? `${c.idx + 1}/${c.total}` : ""}</span>
        <div className="row" style={{ gap: ".3rem" }}>
          <button className={`icon ${sound ? "active" : ""}`} onClick={() => setSound(!sound)} title={sound ? "Tắt phát âm" : "Bật phát âm"}><Icon name={sound ? "volume" : "volumeOff"} size={15} /></button>
          <PlayPause c={c} />
        </div>
      </div>
    </FloatWindow>
  );
}

function GrammarWin({ onClose, slot }: { onClose: () => void; slot: number }) {
  const [level, setLevel] = usePersistent("float.grammar.level", "HSK1");
  const [data, setData] = useState<Record<string, GrammarPoint[]>>({});
  useEffect(() => { loadGrammar().then(setData); }, []);
  const pts = useMemo(() => (level ? data[level] ?? [] : Object.values(data).flat()), [data, level]);
  const c = useCycler(pts, 5000, true);
  const p = c.cur;
  return (
    <FloatWindow id="grammar" title="Ngữ pháp" width={430} slot={slot} onClose={onClose} onHover={c.setHold}>
      <div className="row" style={{ marginBottom: ".5rem" }}>
        <select value={level} onChange={(e) => setLevel(e.target.value)}><option value="">Tất cả</option>{Object.keys(data).map((l) => <option key={l}>{l}</option>)}</select>
        <span className="grow" /><span className="muted small">{c.total ? `${c.idx + 1}/${c.total}` : ""}</span>
      </div>
      {!p ? <p className="muted">(không có ngữ pháp)</p> : (<>
        <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#1e3a8a" }}>{p.title}</div>
        {p.pattern && <div style={{ background: "var(--accent-soft)", padding: ".25rem .6rem", borderRadius: 8, fontWeight: 600, margin: ".4rem 0" }}>{p.pattern}</div>}
        <div className="small" style={{ color: "var(--text-2)" }}>{p.explain}</div>
        {p.examples.slice(0, 2).map(([zh, py, vi], i) => <p key={i} style={{ margin: ".4rem 0" }}><span className="hanzi" style={{ fontSize: "1.1rem", color: "var(--zh)" }}>{zh}</span><br /><span style={{ color: "var(--py)" }}>{py}</span><br /><span style={{ color: "var(--vi)" }}>{vi}</span></p>)}</>)}
      <PlayPause c={c} />
    </FloatWindow>
  );
}

function FavoriteWin({ onClose, slot }: { onClose: () => void; slot: number }) {
  const { customSets, reloadSets } = useVocab();
  const [target, setTarget] = usePersistent<string>("float.fav.target", "");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState("Nhập pinyin để tìm từ.");
  const entries = useMemo(() => { const m = new Map<string, { w: Word; py: string }>(); for (const w of allWords()) if (w.zh && !m.has(w.zh)) m.set(w.zh, { w, py: normalizePinyin(w.pinyin) }); return [...m.values()]; }, []);
  useEffect(() => { reloadSets(); }, [reloadSets]);
  const path = customSets.find((s) => s.path === target)?.path ?? customSets.find((s) => s.name === "Yêu thích")?.path ?? customSets[0]?.path ?? "";

  const results = useMemo(() => {
    const key = normalizePinyin(q);
    if (!key) return [];
    return entries.map(({ w, py }) => ({ w, pos: py.indexOf(key), len: py.length, exact: py === key })).filter((r) => r.pos >= 0)
      .sort((a, b) => (a.exact ? 0 : a.pos === 0 ? 1 : 2) - (b.exact ? 0 : b.pos === 0 ? 1 : 2) || a.len - b.len).slice(0, 50).map((r) => r.w);
  }, [q, entries]);
  useEffect(() => { setSel(0); setMsg(q.trim() ? (results.length ? `${results.length} kết quả — Enter hoặc bấm đúp để thêm.` : "Không tìm thấy từ nào.") : "Nhập pinyin để tìm từ."); }, [results, q]);

  const add = useCallback(async () => {
    const w = results[sel];
    if (!w || !path) return;
    const r = await api.setAddWord(path, w);
    setMsg(r === "added" ? `Đã thêm "${w.zh}" vào bộ.` : r === "exists" ? `"${w.zh}" đã có trong bộ.` : "Không ghi được (file bộ bị hỏng?).");
    if (r === "added") reloadSets();
  }, [results, sel, path, reloadSets]);

  return (
    <FloatWindow id="favorite" title="Thêm từ vào bộ" width={380} height={470} slot={slot} onClose={onClose}>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <span className="small" style={{ whiteSpace: "nowrap" }}>Thêm vào bộ</span>
        <select className="grow" value={path} onChange={(e) => setTarget(e.target.value)}>{customSets.map((s) => <option key={s.path} value={s.path}>{s.name}</option>)}</select>
      </div>
      <input type="search" autoFocus style={{ width: "100%", margin: ".5rem 0" }} placeholder="Gõ pinyin để tìm (vd: nihao, ni3hao)…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); else if (e.key === "ArrowDown") setSel((s) => Math.min(results.length - 1, s + 1)); else if (e.key === "ArrowUp") setSel((s) => Math.max(0, s - 1)); }} />
      <div className="scroll-list" style={{ maxHeight: 220 }}>
        {results.map((w, i) => (
          <div key={w.zh} className={`radio ${i === sel ? "on" : ""}`} onClick={() => setSel(i)} onDoubleClick={add}>
            <span className="hanzi" style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--zh)" }}>{w.zh}</span>
            <span style={{ color: "var(--py)" }}>{w.pinyin}</span><span className="grow" style={{ color: "var(--vi)" }}>— {w.vi}</span>
          </div>
        ))}
      </div>
      <button className="primary" style={{ width: "100%", margin: ".6rem 0 .3rem" }} disabled={!results.length || !path} onClick={add}><Icon name="plus" size={16} />Thêm vào bộ đã chọn</button>
      <div className="muted small" style={{ textAlign: "center" }}>{msg}</div>
    </FloatWindow>
  );
}

function StrokeWin({ words, onClose, slot }: { words: Word[]; onClose: () => void; slot: number }) {
  const han = useMemo(() => words.filter((w) => /[一-鿿]/.test(w.zh)), [words]);
  const [i, setI] = useState(0);
  const [again, setAgain] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const w = han[i % Math.max(1, han.length)];
  useEffect(() => {
    if (!ready || !w) return;
    (frame.current?.contentWindow as unknown as Record<string, (...a: unknown[]) => void> | null)?.loadMissingStroke?.(w.zh.trim(), true);
  }, [ready, w?.zh, again]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FloatWindow id="stroke" title="Điền nét còn thiếu" width={400} height={540} slot={slot} onClose={onClose}>
      {!w ? <p className="muted">(bộ từ vựng chưa có chữ Hán)</p> : (<>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: "1.2rem", color: "var(--py)" }}>{w.pinyin}</div><div style={{ fontWeight: 600, color: "var(--vi)" }}>{w.vi}</div></div>
        <iframe ref={frame} src="/hanzi/missing_stroke.html" onLoad={() => setReady(true)} style={{ width: "100%", height: 330, border: "1px solid var(--border)", borderRadius: 10, marginTop: ".4rem" }} />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: ".5rem" }}>
          <button className="icon" title="Vẽ lại từ này" onClick={() => setAgain((n) => n + 1)}><Icon name="rotate" size={15} /></button>
          <button className="icon" title="Từ tiếp theo" onClick={() => setI((n) => n + 1)}><Icon name="next" size={15} /></button>
        </div>
      </>)}
    </FloatWindow>
  );
}

const TOOLS = [
  { id: "ticker", icon: "clock", tint: "#2563eb", label: "Từ vựng chạy", desc: "Tự đổi từ mới mỗi 2 giây, có thể bật phát âm" },
  { id: "grammar", icon: "bookOpen", tint: "#7c3aed", label: "Ngữ pháp + ví dụ", desc: "Mỗi điểm ngữ pháp hiện 5 giây, kèm câu ví dụ" },
  { id: "favorite", icon: "star", tint: "#d97706", label: "Thêm từ vào bộ", desc: "Gõ pinyin để tìm từ rồi thêm vào bộ từ của bạn" },
  { id: "stroke", icon: "brush", tint: "#047857", label: "Điền nét còn thiếu", desc: "Luyện viết: vẽ nét còn thiếu của chữ Hán" },
] as const;

/** Nút mở hộp bật/tắt + các cửa sổ đang mở. Đặt một lần ở Shell. */
export default function FloatingTools({ hubOpen, onHubClose }: { hubOpen: boolean; onHubClose: () => void }) {
  const { items } = useVocab();
  const [open, setOpen] = useState<Set<string>>(() => new Set(import.meta.env.DEV ? (new URLSearchParams(location.search).get("tools") ?? "").split(",").filter(Boolean) : [])); // dev: ?tools=ticker,grammar để chụp ảnh
  const set = (id: string, on: boolean) => setOpen((o) => { const n = new Set(o); on ? n.add(id) : n.delete(id); return n; });
  const slot = (id: string) => TOOLS.findIndex((t) => t.id === id) + 1;
  return (
    <>
      {hubOpen && (
        <Modal title="Công cụ nổi" onClose={onHubClose} width={460}
          footer={<><span className="muted small grow">{open.size ? `Đang mở ${open.size}/${TOOLS.length} cửa sổ` : "Chưa mở cửa sổ nào"}</span>
            <button className="ghost" disabled={!open.size} onClick={() => setOpen(new Set())}>Tắt tất cả</button>
            <button className="primary" onClick={onHubClose}>Xong</button></>}>
          <p className="muted small" style={{ margin: "0 0 .8rem" }}>Cửa sổ nhỏ luôn nổi trên app. Kéo thanh tiêu đề để di chuyển; trỏ chuột vào thì nội dung đứng yên.</p>
          <div className="tool-list">
            {TOOLS.map((t) => {
              const on = open.has(t.id);
              return (
                <label key={t.id} className={`tool-row ${on ? "on" : ""}`}>
                  <span className="tool-ico" style={{ color: t.tint, background: `${t.tint}14` }}><Icon name={t.icon} size={20} /></span>
                  <span className="tool-txt"><b>{t.label}</b><small>{t.desc}</small></span>
                  <span className="switch"><input type="checkbox" role="switch" checked={on} onChange={(e) => set(t.id, e.target.checked)} /><i /></span>
                </label>
              );
            })}
          </div>
        </Modal>
      )}
      {open.has("ticker") && <Ticker words={items} slot={slot("ticker")} onClose={() => set("ticker", false)} />}
      {open.has("grammar") && <GrammarWin slot={slot("grammar")} onClose={() => set("grammar", false)} />}
      {open.has("favorite") && <FavoriteWin slot={slot("favorite")} onClose={() => set("favorite", false)} />}
      {open.has("stroke") && <StrokeWin words={items} slot={slot("stroke")} onClose={() => set("stroke", false)} />}
    </>
  );
}
