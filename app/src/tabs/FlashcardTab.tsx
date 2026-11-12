// Tab "🃏 Flashcard" — thẻ lật chữ Hán ⇄ nghĩa, đánh dấu đã thuộc/chưa thuộc (ghi vào SRS),
// tự đọc, tự chuyển thẻ. Port của games/game_flashcard.py (xuất PDF/video: xem ExportDialog).
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Check, StatusRow } from "../components/ui";
import { api } from "../lib/api";
import { speak, stopAudio } from "../lib/audio";
import { shuffle } from "../lib/data";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { useReport } from "../lib/toast";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";
import ExportDialog from "../components/ExportDialog";

export default function FlashcardTab() {
  const { items } = useVocab();
  const report = useReport();
  const [pool, setPool] = useState<Word[]>([]);
  const [known, setKnown] = useState<Set<string>>(new Set()); // đã thuộc TRONG PHIÊN này
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shuf, setShuf] = usePersistent("flash.shuffle", false);
  const [onlyUnknown, setOnlyUnknown] = usePersistent("flash.onlyUnknown", false);
  const [showAll, setShowAll] = usePersistent("flash.showAll", false);
  const [showEx, setShowEx] = usePersistent("flash.showExample", true);
  const [autoNext, setAutoNext] = usePersistent("flash.autoNext", false);
  const [sound, setSound] = usePersistent("flash.sound", true);
  const [readMeaning, setReadMeaning] = usePersistent("flash.readMeaning", true);
  const [readExample, setReadExample] = usePersistent("flash.readExample", false);
  const [scale, setScale] = usePersistent("flash.scale", 1);
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    resolveEffectivePool(items).then((p) => { setPool(shuf ? shuffle(p) : p); setPos(0); setFlipped(false); setKnown(new Set()); });
  }, [items, shuf]);

  const deck = onlyUnknown ? pool.filter((w) => !known.has(w.zh)) : pool;
  const cur: Word | undefined = deck[Math.min(pos, Math.max(0, deck.length - 1))];

  const go = useCallback((d: number) => {
    if (!deck.length) return;
    setFlipped(false);
    setPos((p) => (p + d + deck.length) % deck.length);
  }, [deck.length]);

  // Tự đọc khi thẻ mới hiện: từ → (nghĩa) → (câu ví dụ) → (tự chuyển thẻ).
  useEffect(() => {
    const my = ++seq.current;
    stopAudio();
    if (!cur || !sound) { if (autoNext && cur) setTimeout(() => seq.current === my && go(1), 1400); return; }
    (async () => {
      const steps: [string, "zh" | "vi"][] = [[cur.zh, "zh"]];
      if (readMeaning && cur.vi) steps.push([cur.vi, "vi"]);
      if (readExample && showEx) { if (cur.exCn) steps.push([cur.exCn, "zh"]); if (cur.exVi) steps.push([cur.exVi, "vi"]); }
      for (const [t, v] of steps) { if (seq.current !== my) return; await speak(t, v); }
      if (autoNext && seq.current === my) { await new Promise((r) => setTimeout(r, 700)); if (seq.current === my) go(1); }
    })();
    return () => { seq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.zh, sound, readMeaning, readExample, showEx, autoNext]);
  useEffect(() => () => { seq.current++; stopAudio(); }, []);

  // Vào tab này có thể focus bàn phím vẫn còn kẹt ở 1 ô input nơi khác (vd ô "Tìm chủ đề"
  // ở panel bên phải) — khi đó phím mũi tên bị bỏ qua (xem onKey bên dưới) vì tưởng người
  // dùng đang gõ chữ. Trả focus về trang khi mở tab để phím mũi tên hoạt động ngay.
  useEffect(() => { (document.activeElement as HTMLElement | null)?.blur?.(); }, []);

  async function mark(ok: boolean) {
    if (!cur) return;
    setKnown((k) => { const n = new Set(k); ok ? n.add(cur.zh) : n.delete(cur.zh); return n; });
    await report(cur.zh, ok);
    if (ok && onlyUnknown) { setFlipped(false); } else go(1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const T = (b: boolean, set: (v: boolean) => void, label: string) => <Check checked={b} onChange={set} label={label} />;

  const front = cur && (
    <>
      <div className="big hanzi" style={{ fontSize: `${4 * scale}rem`, fontWeight: 700, color: "var(--zh)" }}>{cur.zh}</div>
      {!showAll && <div className="muted" style={{ fontSize: ".92rem" }}>Nhấn vào thẻ (hoặc phím Space) để xem nghĩa</div>}
    </>
  );
  const back = cur && (
    <>
      <div style={{ fontSize: `${1.5 * scale}rem`, color: "#7c3aed" }}>{cur.pinyin}</div>
      <div style={{ fontSize: `${2 * scale}rem`, fontWeight: 700, color: "#047857" }}>{cur.vi}</div>
      {showEx && cur.exCn && (
        <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: 8, marginTop: 4 }}>
          <div className="hanzi" style={{ fontSize: `${1.4 * scale}rem`, fontWeight: 600 }}>{cur.exCn}</div>
          <div style={{ color: "#0e7490" }}>{cur.pySent}</div>
          <div className="muted">{cur.exVi}</div>
        </div>
      )}
    </>
  );

  return (
    <div>
      <StatusRow right={<button onClick={() => setExporting(true)}><Icon name="download" size={16} />Xuất</button>}>
        <span className="muted">Thẻ <b>{deck.length ? Math.min(pos, deck.length - 1) + 1 : 0}</b> / {deck.length} · Đã thuộc <b>{known.size}</b></span>
      </StatusRow>
      <div className="toolbar">
        {T(shuf, setShuf, "Trộn")}
        {T(onlyUnknown, setOnlyUnknown, "Chỉ thẻ chưa thuộc")}
        {T(showAll, setShowAll, "Hiện tất cả trên 1 thẻ")}
        {T(showEx, setShowEx, "Hiện ví dụ")}
        {T(sound, setSound, "Tự đọc")}
        {T(readMeaning, setReadMeaning, "Đọc nghĩa")}
        {T(readExample, setReadExample, "Đọc ví dụ")}
        {T(autoNext, setAutoNext, "Tự chuyển thẻ")}
        <span className="sep" />
        <button className="ghost" onClick={() => setScale((s) => Math.max(0.6, +(s - 0.1).toFixed(1)))}>A−</button>
        <button className="ghost" onClick={() => setScale((s) => Math.min(1.8, +(s + 0.1).toFixed(1)))}>A+</button>
      </div>

      {!cur ? (
        <div className="card flash"><span className="muted">Không có thẻ nào.</span></div>
      ) : (
        <div className="card flash" onClick={() => { (document.activeElement as HTMLElement | null)?.blur?.(); if (!showAll) setFlipped((f) => !f); }}
          style={{ background: flipped && !showAll ? "#ffffff" : "linear-gradient(135deg, #eef4ff, #f6f1ff)", color: "#111827", minHeight: 340, border: "1px solid " + (flipped && !showAll ? "var(--border)" : "#d9e4fb") }}>
          {showAll ? <><div className="big hanzi" style={{ fontSize: `${3.2 * scale}rem`, fontWeight: 700, color: "var(--zh)" }}>{cur.zh}</div>{back}</> : flipped ? back : front}
        </div>
      )}

      <div className="nav-row">
        <button onClick={() => go(-1)}><Icon name="chevL" size={16} /> Trước</button>
        <button onClick={() => cur && speak(cur.zh)}><Icon name="volume" size={16} /> Phát âm</button>
        <button style={{ color: "var(--bad)", borderColor: "#f3b4b4" }} onClick={() => mark(false)}><Icon name="x" size={16} />Chưa thuộc</button>
        <button style={{ color: "var(--good)", borderColor: "#a7dfba" }} onClick={() => mark(true)}><Icon name="checkCircle" size={16} />Đã thuộc</button>
        <button onClick={() => go(1)}>Sau <Icon name="chevR" size={16} /></button>
      </div>
      {exporting && <ExportDialog words={pool} known={known} onClose={() => setExporting(false)} />}
    </div>
  );
}

// Dùng ở nơi khác (vd nút "Đã thuộc" từ tab khác) nếu cần ghi trực tiếp không toast.
export const markKnown = (zh: string, ok: boolean) => api.srsReport(zh, ok);
