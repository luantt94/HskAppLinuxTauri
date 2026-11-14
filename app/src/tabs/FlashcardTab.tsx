// Tab "🃏 Flashcard" — thẻ lật chữ Hán ⇄ nghĩa, đánh dấu đã thuộc/chưa thuộc (ghi vào SRS),
// tự đọc, tự chuyển thẻ. Port của games/game_flashcard.py (xuất PDF/video: xem ExportDialog).
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { OptRow, OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { Done } from "../components/ui";
import { api } from "../lib/api";
import { speak, stopAudio } from "../lib/audio";
import { shuffle } from "../lib/data";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import { useReport } from "../lib/toast";
import type { Word } from "../lib/types";
import { useProgress } from "../lib/progress";
import { useVocab } from "../lib/vocabStore";
import ExportDialog from "../components/ExportDialog";
import { WordList, useWordListOpen } from "../components/WordList";
import { shortcutBlocked } from "../lib/shortcuts";

const KEYS: [string[], string][] = [
  [["Space"], "Lật thẻ"],
  [["←", "→"], "Thẻ trước / sau"],
  [["1"], "Chưa thuộc"],
  [["2"], "Đã thuộc"],
  [["P"], "Phát âm"],
  [["M"], "Tắt / bật tiếng tự đọc"],
];

export default function FlashcardTab() {
  const [wlOpen, setWlOpen] = useWordListOpen(); // cột danh sách từ
  const { items } = useVocab();
  const { known: srsKnown } = useProgress(); // đã thuộc theo SRS (mọi phiên) — khớp số trên nút bộ từ
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

  // Tắt tiếng = tắt tự đọc (cùng công tắc "Đọc chữ Hán" trong menu) và dừng ngay câu đang đọc.
  function toggleMute() {
    if (sound) { seq.current++; stopAudio(); }
    setSound(!sound);
  }

  async function mark(ok: boolean) {
    if (!cur) return;
    setKnown((k) => { const n = new Set(k); ok ? n.add(cur.zh) : n.delete(cur.zh); return n; });
    await report(cur.zh, ok);
    if (ok && onlyUnknown) { setFlipped(false); } else go(1);
  }

  // Phím tắt: Space lật · ←/→ chuyển · 1 chưa thuộc · 2 đã thuộc · P phát âm.
  // Gọi qua ref để luôn dùng hàm mới nhất (mark/cur đổi mỗi lần render).
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e) => {
    if (exporting || shortcutBlocked(e)) return;
    if (e.code === "Space") { e.preventDefault(); if (!showAll) setFlipped((f) => !f); }
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "1") { if (!e.repeat) mark(false); } // giữ phím không chấm liên tục nhiều thẻ
    else if (e.key === "2") { if (!e.repeat) mark(true); }
    else if (e.key === "p" || e.key === "P") { if (cur) speak(cur.zh); }
    else if (e.key === "m" || e.key === "M") toggleMute();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const idx = deck.length ? Math.min(pos, deck.length - 1) : 0;
  const isKnown = !!cur && (known.has(cur.zh) || srsKnown.has(cur.zh));
  const say = (e: React.MouseEvent) => { e.stopPropagation(); if (cur) speak(cur.zh); };

  // Góc trên của thẻ: số thứ tự, huy hiệu "đã thuộc", nút phát âm nhanh.
  const corner = cur && (
    <div className="flash-corner">
      <span className="flash-no">#{idx + 1}</span>
      {/* Trộn/lọc nằm trong bảng Tuỳ chọn — hiện nhãn nhỏ khi đang bật để biết vì sao thứ tự/số thẻ khác thường; bấm để tắt */}
      {shuf && <button className="flash-tag" onClick={(e) => { e.stopPropagation(); setShuf(false); }} title="Đang trộn thứ tự thẻ — bấm để tắt"><Icon name="shuffle" size={12} />Đã trộn<Icon name="x" size={12} /></button>}
      {onlyUnknown && <button className="flash-tag" onClick={(e) => { e.stopPropagation(); setOnlyUnknown(false); }} title="Đang ẩn thẻ đã thuộc — bấm để tắt"><Icon name="target" size={12} />Chỉ thẻ chưa thuộc<Icon name="x" size={12} /></button>}
      <span className="grow" />
      {isKnown && <span className="pill good"><Icon name="check" size={12} />Đã thuộc</span>}
      <button className="icon round ghost" onClick={say} title="Phát âm (P)"><Icon name="volume" size={16} /></button>
    </div>
  );
  const answer = cur && (
    <>
      <div className="flash-py" style={{ fontSize: `${2 * scale}rem` }}>{cur.pinyin}</div>
      <div className="flash-vi" style={{ fontSize: `${2.6 * scale}rem` }}>{cur.vi}</div>
      {showEx && cur.exCn && (
        <div className="flash-ex">
          <div className="hanzi" style={{ fontSize: `${1.6 * scale}rem`, fontWeight: 600 }}>{cur.exCn}</div>
          {cur.pySent && <div className="flash-ex-py">{cur.pySent}</div>}
          {cur.exVi && <div className="muted">{cur.exVi}</div>}
        </div>
      )}
    </>
  );

  const allDone = !cur && onlyUnknown && pool.length > 0;

  return (
    <div className="flash-page">
      {/* Ngay trên thẻ: trái là tiến độ, phải là nút tắt tiếng; các tuỳ chọn khác ở bảng "Tuỳ chọn" (nút trên thanh tiêu đề) */}
      <div className="list-top flash-top">
        <div className="flash-progress">
          {allDone
            ? <span className="muted"><b style={{ color: "var(--good)" }}>Xong</b></span>
            : <span className="muted">Thẻ <b className="stat" style={{ color: "var(--text)" }}>{deck.length ? idx + 1 : 0}</b> / {deck.length}</span>}
          <div className={`flash-bar ${allDone ? "full" : ""}`}><i style={{ width: `${allDone ? 100 : deck.length ? ((idx + 1) / deck.length) * 100 : 0}%` }} /></div>
          <span className="muted" title="Số thẻ bấm “Đã thuộc” trong phiên học này (tổng tiến độ của bộ từ xem ở nút bộ từ trên thanh tiêu đề)">Phiên này thuộc <b className="stat" style={{ color: "var(--good)" }}>{known.size}</b></span>
        </div>
        <button className={`icon ${sound ? "" : "active"}`} onClick={toggleMute} title={sound ? "Tắt tiếng tự đọc (M)" : "Bật tiếng tự đọc (M)"} aria-pressed={!sound}>
          <Icon name={sound ? "volume" : "volumeOff"} size={17} />
        </button>
      </div>

      <WordList open={wlOpen} onClose={() => setWlOpen(false)} index={idx} onPick={(n) => { setPos(n); setFlipped(false); }}
        words={deck.map((w) => ({ zh: w.zh, py: w.pinyin, done: known.has(w.zh) }))} /* không hiện nghĩa: tránh lộ mặt sau thẻ */ />
      <TabOptions>
        <OptSection title="Danh sách">
          <OptSwitch checked={wlOpen} onChange={setWlOpen} label="Hiện danh sách từ" hint="Cột bên trái: các từ đang học, bấm để nhảy tới" />
        </OptSection>
        <OptSection title="Bộ thẻ">
          <OptSwitch checked={shuf} onChange={setShuf} label="Trộn thứ tự thẻ" />
          <OptSwitch checked={onlyUnknown} onChange={setOnlyUnknown} label="Chỉ thẻ chưa thuộc" hint="Ẩn thẻ đã bấm “Đã thuộc” trong phiên này" />
        </OptSection>
        <OptSection title="Thẻ">
          <OptRow label="Cỡ chữ">
            {scale !== 1 && <button className="ghost link-btn" onClick={() => setScale(1)} title="Về 100%">Đặt lại</button>}
            <div className="stepper">
              <button disabled={scale <= 0.6} onClick={() => setScale((s) => Math.max(0.6, +(s - 0.1).toFixed(1)))} title="Nhỏ hơn">A−</button>
              <b className="stat" style={{ minWidth: "3.2rem" }}>{Math.round(scale * 100)}%</b>
              <button disabled={scale >= 1.8} onClick={() => setScale((s) => Math.min(1.8, +(s + 0.1).toFixed(1)))} title="Lớn hơn">A+</button>
            </div>
          </OptRow>
          <OptSwitch checked={showEx} onChange={setShowEx} label="Câu ví dụ" />
          <OptSwitch checked={showAll} onChange={setShowAll} label="Hiện cả hai mặt trên 1 thẻ" />
        </OptSection>
        <OptSection title="Tự đọc khi sang thẻ mới">
          <OptSwitch checked={sound} onChange={setSound} label="Đọc chữ Hán" />
          <OptSwitch checked={readMeaning} onChange={setReadMeaning} label="Đọc cả nghĩa tiếng Việt" disabled={!sound} />
          <OptSwitch checked={readExample} onChange={setReadExample} label="Đọc cả câu ví dụ" disabled={!sound || !showEx} />
          <OptSwitch checked={autoNext} onChange={setAutoNext} label="Tự chuyển sang thẻ kế" />
        </OptSection>
        <OptSection title="Phím tắt">
          {KEYS.map(([k, label]) => <OptRow key={label} label={label}>{k.map((x) => <kbd key={x}>{x}</kbd>)}</OptRow>)}
        </OptSection>
        <OptSection title="Xuất">
          <button className="opt-action" onClick={() => setExporting(true)} disabled={!pool.length}>
            <Icon name="download" size={16} />Xuất file…<small>PDF · video · Anki</small>
          </button>
        </OptSection>
      </TabOptions>

      {allDone ? (
        <Done title="Bạn đã thuộc hết các thẻ!">
          <p className="muted">Phiên này bạn đã đánh dấu thuộc {known.size} thẻ.</p>
          <div className="nav-row">
            <button onClick={() => setOnlyUnknown(false)}>Xem lại tất cả thẻ</button>
            <button className="primary" onClick={() => { setKnown(new Set()); setPos(0); setFlipped(false); }}><Icon name="rotate" size={15} />Học lại từ đầu</button>
          </div>
        </Done>
      ) : !cur ? (
        <div className="flash-face front flash-empty">
          <Icon name="layers" size={28} />
          <b>Chưa có thẻ nào</b>
          <span className="muted small">Chọn một bộ từ vựng ở nút bộ từ trên thanh tiêu đề để bắt đầu.</span>
        </div>
      ) : (
        <div className="flash-stage">
        <button className="icon round flash-nav" onClick={() => go(-1)} title="Thẻ trước (←)"><Icon name="chevL" size={22} /></button>
        {/* key theo từ: sang thẻ mới thì dựng lại ở mặt trước, không lộ nghĩa thẻ kế khi đang lật ngược. */}
        <div key={cur.zh} className={`flash3d ${flipped && !showAll ? "flipped" : ""}`}
          onClick={() => {
            (document.activeElement as HTMLElement | null)?.blur?.();
            if (!showAll) setFlipped((f) => !f);
          }}>
          <div className="flash-inner">
            {showAll ? (
              <div className="flash-face back">
                {corner}
                <div className="big hanzi" style={{ fontSize: `${5 * scale}rem` }}>{cur.zh}</div>
                {answer}
              </div>
            ) : (
              <>
                <div className="flash-face front">
                  {corner}
                  <div className="big hanzi" style={{ fontSize: `calc(${scale} * clamp(5.5rem, 10vw, 9rem))` }}>{cur.zh}</div>
                </div>
                <div className="flash-face back" aria-hidden={!flipped}>
                  {corner}
                  <div className="hanzi flash-zh-sm" style={{ fontSize: `${3 * scale}rem` }}>{cur.zh}</div>
                  {answer}
                </div>
              </>
            )}
          </div>
        </div>
        <button className="icon round flash-nav" onClick={() => go(1)} title="Thẻ sau (→)"><Icon name="chevR" size={22} /></button>
        </div>
      )}

      {cur && (
        <div className="flash-actions">
          <button className="mark bad" onClick={() => mark(false)} title="Chưa thuộc (1)"><Icon name="x" size={17} />Chưa thuộc</button>
          <button className="mark good" onClick={() => mark(true)} title="Đã thuộc (2)"><Icon name="checkCircle" size={17} />Đã thuộc</button>
        </div>
      )}
      {exporting && <ExportDialog words={pool} known={new Set([...srsKnown, ...known])} onClose={() => setExporting(false)} />}
    </div>
  );
}

// Dùng ở nơi khác (vd nút "Đã thuộc" từ tab khác) nếu cần ghi trực tiếp không toast.
export const markKnown = (zh: string, ok: boolean) => api.srsReport(zh, ok);
