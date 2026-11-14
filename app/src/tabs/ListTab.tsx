// Tab "📋 Danh sách (Nghe)" — duyệt từ + câu ví dụ, nghe từng mục hoặc "Đọc tất cả".
// Port của games/game_list_reader.py (không có chấm điểm; chế độ SRS chỉ lọc theo hạn ôn).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { OptRow, OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { daysLeft, dueOnlyPool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";

const PAGE_SIZE = 20; // cỡ trang ban đầu; sau khi đo sẽ tự đổi cho vừa khung nhìn (xem useLayoutEffect bên dưới)
const PAUSE_BETWEEN_MS = 1000; // nghỉ 1 giây giữa các mục khi tự đọc

type Active = { idx: number; part: "word" | "sent" } | null;

// Tô đậm từ đang học trong câu ví dụ (chữ Hán, pinyin, nghĩa Việt).
type Hit = [start: number, end: number] | null;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function safeRe(src: string, flags = "u") { try { return new RegExp(src, flags); } catch { return null; } }
/** Bỏ dấu thanh + chữ thường, kèm bảng vị trí về chuỗi gốc (để tô đúng chỗ trên chữ có dấu). */
function toneless(s: string): [string, number[]] {
  let out = ""; const map: number[] = [];
  for (let i = 0; i < s.length; i++) for (const c of s[i].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()) { out += c; map.push(i); }
  return [out, map];
}
type Finders = { zh: (t: string) => Hit; py: (t: string) => Hit; vi: (t: string) => Hit };
// Bộ tìm (regex + chuẩn hoá) chỉ dựng 1 lần cho mỗi từ — danh sách vẽ lại liên tục khi "Đọc tất cả"
const findersCache = new WeakMap<Word, Finders>();
function wordFinders(w: Word): Finders {
  let f = findersCache.get(w);
  if (!f) { f = buildWordFinders(w); findersCache.set(w, f); }
  return f;
}

function buildWordFinders(w: Word): Finders {
  const find = (re: RegExp | null) => (t: string): Hit => { const m = re?.exec(t); return m ? [m.index, m.index + m[0].length] : null; };
  const han = w.zh.match(/[一-鿿]+/g);
  // Pinyin: so không dấu, cho phép cách/nháy giữa các chữ (bú duì, nǎ'ér) và đuôi -r nhi hoá
  let key = toneless(w.pinyin || "")[0].replace(/[^a-zü]/g, ""), tail = "";
  if (key.length > 2 && key.endsWith("r")) { key = key.slice(0, -1); tail = "(?:['\\s]*e?r)?"; }
  const pyRe = key ? safeRe([...key].map(esc).join("['\\s]*") + tail) : null;
  const vi = (w.vi || "").split(/[,;/]/).map((x) => x.trim()).filter((x) => x.length > 1).sort((a, b) => b.length - a.length);
  return {
    zh: find(han ? safeRe(han.map(esc).join("|")) : null),
    py: (t) => { const [plain, map] = toneless(t); const h = find(pyRe)(plain); return h ? [map[h[0]], map[h[1] - 1] + 1] : null; },
    vi: find(vi.length ? safeRe(`(?<!\\p{L})(?:${vi.map(esc).join("|")})(?!\\p{L})`, "iu") : null), // nguyên từ, không khớp "ba" trong "bác"
  };
}
function mark(text: string, find: (t: string) => Hit) {
  const h = text ? find(text) : null;
  if (!h) return text;
  return <>{text.slice(0, h[0])}<b>{text.slice(h[0], h[1])}</b>{text.slice(h[1])}</>;
}

export default function ListTab() {
  const { items } = useVocab();
  const [filter, setFilter] = usePersistent<"due" | "known">("list.filter", "due");
  const [scale, setScale] = usePersistent("list.scale", 1);
  const [showEx, setShowEx] = usePersistent("list.showExamples", true);
  const [readVi, setReadVi] = usePersistent("list.readVi", true);
  const [cols, setCols] = usePersistent<1 | 2>("list.cols", 2); // mặc định 2 cột (đỡ cuộn); cửa sổ hẹp tự về 1 cột (xem App.css)
  const [pool, setPool] = useState<Word[]>([]);
  const [dues, setDues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<Active>(null);
  const [auto, setAuto] = useState(false);
  const runRef = useRef(0); // đổi số này để huỷ vòng "Đọc tất cả" đang chạy
  const [counts, setCounts] = useState({ due: 0, known: 0 }); // số từ của cả hai bộ lọc, hiện trên nút chuyển
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const pageSizeRef = useRef(PAGE_SIZE);
  const listRef = useRef<HTMLDivElement>(null);
  const [fitTick, setFitTick] = useState(0); // tăng khi khung nội dung đổi cỡ → đo lại

  const load = useCallback(async () => {
    const d = await api.srsDueDates();
    setDues(d);
    const [duePool, overview] = await Promise.all([dueOnlyPool(items), api.progressOverview()]);
    const known = new Set(overview.knownZh);
    const knownList = items.filter((w) => known.has(w.zh));
    setCounts({ due: duePool.length, known: knownList.length });
    setPool(filter === "due" ? duePool : knownList);
    setPage(0);
  }, [items, filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { runRef.current++; stopAudio(); }, []);

  // Tự chọn số từ mỗi trang để cả trang vừa khung nhìn, không phải cuộn:
  // đo dòng cao nhất đang hiện + số cột thực tế (cửa sổ hẹp 2 cột thành 1), chia cho chỗ trống còn lại.
  useEffect(() => {
    const main = listRef.current?.closest(".main");
    if (!main) return;
    const ro = new ResizeObserver(() => setFitTick((t) => t + 1));
    ro.observe(main);
    document.fonts?.ready.then(() => setFitTick((t) => t + 1)); // phông chữ Hán tải xong thì chiều cao dòng đổi → đo lại
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const list = listRef.current, main = list?.closest(".main") as HTMLElement | null;
    if (!list || !main || auto) return; // đang "Đọc tất cả" thì giữ nguyên trang
    const rows = Array.from(list.children) as HTMLElement[];
    if (!rows.length) return;
    const rowH = Math.max(...rows.map((r) => r.offsetHeight));
    const perRow = getComputedStyle(list).gridTemplateColumns.split(" ").length; // "none" (1 cột) → 1
    const top = list.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
    const room = main.clientHeight - top - parseFloat(getComputedStyle(main).paddingBottom) - 2; // 2px viền khung
    const fit = (h: number) => Math.max(1, Math.floor(h / rowH)) * perRow;
    let size = fit(room);
    if (pool.length > size) size = fit(room - 4 * parseFloat(getComputedStyle(document.documentElement).fontSize)); // chừa chỗ thanh chuyển trang dưới
    const old = pageSizeRef.current;
    if (size === old) return;
    pageSizeRef.current = size;
    setPageSize(size);
    setPage((p) => Math.floor((p * old) / size)); // giữ mục đầu trang đang xem
  }, [fitTick, pool, cols, scale, showEx, auto]);

  const pages = Math.max(1, Math.ceil(pool.length / pageSize));
  const slice = pool.slice(page * pageSize, (page + 1) * pageSize);

  async function adjust(w: Word, delta: number) {
    await api.srsAdjustDue(w, delta);
    setDues(await api.srsDueDates());
  }

  async function readAll() {
    if (auto) { runRef.current++; stopAudio(); setActive(null); setAuto(false); return; }
    const myRun = ++runRef.current;
    setAuto(true);
    // Đọc từ + câu ví dụ lần lượt, hết trang thì sang trang kế.
    for (let p = page; p < pages; p++) {
      setPage(p);
      const rows = pool.slice(p * pageSize, (p + 1) * pageSize);
      for (let i = 0; i < rows.length; i++) {
        const w = rows[i];
        // Mỗi bước: [phần được tô sáng, văn bản, giọng]. Ẩn câu thì bỏ cả câu Trung lẫn nghĩa Việt của câu.
        const steps: ["word" | "sent", string, "zh" | "vi"][] = [["word", cleanZh(w.zh), "zh"]];
        if (readVi && w.vi) steps.push(["word", w.vi, "vi"]);
        if (showEx) {
          steps.push(["sent", cleanZh(w.exCn), "zh"]);
          if (readVi && w.exCn && w.exVi) steps.push(["sent", w.exVi, "vi"]);
        }
        for (const [part, text, voice] of steps) {
          if (!text) continue;
          if (runRef.current !== myRun) return;
          setActive({ idx: i, part });
          document.getElementById(`row-${i}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
          await speak(text, voice);
          if (runRef.current !== myRun) return;
          await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS));
        }
      }
    }
    if (runRef.current === myRun) { setActive(null); setAuto(false); }
  }

  // Cỡ chữ theo rem để đi cùng cài đặt "Cỡ chữ" chung của app; `scale` là phóng to riêng của tab này.
  // Đổi trang bằng tay: cuộn khung nội dung về đầu để thấy mục đầu tiên của trang mới
  const goPage = (p: number) => { setPage(Math.max(0, Math.min(pages - 1, p))); document.querySelector(".main")?.scrollTo({ top: 0 }); };

  const fs = (rem: number) => `${rem * scale}rem`;

  return (
    <div>
      {/* Ngay trên danh sách: trái chọn danh sách (kèm số từ); phải tiến độ đọc + nút đọc (hành động chính) + tuỳ chọn hiển thị */}
      <div className="list-top">
        <div className="tabs seg list-filter">
          <button className={filter === "due" ? "active" : ""} onClick={() => setFilter("due")} title="Từ cần ôn hôm nay">Đến hạn<span className="cnt">{counts.due}</span></button>
          <button className={filter === "known" ? "active" : ""} onClick={() => setFilter("known")} title="Từ đã thuộc">Đã thuộc<span className="cnt">{counts.known}</span></button>
        </div>
        <div className="row">
          {auto && active && <span className="muted small">Đang đọc <b className="stat" style={{ color: "var(--good)" }}>{page * pageSize + active.idx + 1}</b> / {pool.length}</span>}
          <button className={auto ? "active" : "primary"} onClick={readAll} disabled={!pool.length}><Icon name={auto ? "pause" : "play"} size={15} />{auto ? "Dừng đọc" : "Đọc tất cả"}</button>
        </div>
      </div>

      <TabOptions>
        <OptSection title="Hiển thị">
          <OptRow label="Cỡ chữ">
            {scale !== 1 && <button className="ghost link-btn" onClick={() => setScale(1)} title="Về 100%">Đặt lại</button>}
            <div className="stepper">
              <button disabled={scale <= 0.7} onClick={() => setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(1)))} title="Nhỏ hơn">A−</button>
              <b className="stat" style={{ minWidth: "3.2rem" }}>{Math.round(scale * 100)}%</b>
              <button disabled={scale >= 2} onClick={() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(1)))} title="Lớn hơn">A+</button>
            </div>
          </OptRow>
          <OptRow label="Bố cục">
            <div className="tabs seg">{([1, 2] as const).map((n) => <button key={n} className={cols === n ? "active" : ""} onClick={() => setCols(n)}>{n} cột</button>)}</div>
          </OptRow>
          <OptSwitch checked={showEx} onChange={setShowEx} label="Câu ví dụ" />
        </OptSection>
        <OptSection title="Khi đọc tất cả">
          <OptSwitch checked={readVi} onChange={setReadVi} label="Đọc cả nghĩa tiếng Việt" />
        </OptSection>
      </TabOptions>

      <div ref={listRef} className={`lrows ${cols === 2 ? "two" : ""}`}>
        {slice.map((w, i) => {
          const left = daysLeft(dues[w.zh]);
          // Nhãn hạn ôn: [chữ, lớp màu]
          const [dueText, dueCls] = left === undefined ? ["Chưa học", "new"] : left < 0 ? [`Quá hạn ${-left} ngày`, "late"] : left === 0 ? ["Hôm nay", "today"] : [`Còn ${left} ngày`, "later"];
          const wa = active?.idx === i && active.part === "word";
          const sa = active?.idx === i && active.part === "sent";
          const re = wordFinders(w);
          return (
            // Một dòng của bảng: [số] [từ + nghĩa] [câu ví dụ] [hạn ôn] — bấm vào từ / câu để nghe
            <div id={`row-${i}`} key={w.zh} className={`lrow ${active?.idx === i ? "playing" : ""} ${showEx ? "" : "noex"}`}>
              <span className="lrow-n">{page * pageSize + i + 1}</span>
              <div className={`lrow-word say ${wa ? "on" : ""}`} role="button" tabIndex={0} title="Nghe từ"
                onClick={() => speak(cleanZh(w.zh))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); speak(cleanZh(w.zh)); } }}>
                <span className="say-head">
                  <span className="hanzi zh" style={{ fontSize: fs(1.5) }}>{w.zh}</span>
                  <span className="py" style={{ fontSize: fs(1) }}>{w.pinyin}</span>
                  <Icon name="volume" size={15} className="ico" />
                </span>
                <div className="vi" style={{ fontSize: fs(1) }}>{w.vi}</div>
              </div>
              {showEx && (w.exCn ? (
                <button className={`say ex ${sa ? "on" : ""}`} onClick={() => speak(cleanZh(w.exCn))} title="Nghe câu ví dụ">
                  <span className="hanzi ex-zh" style={{ fontSize: fs(1.1) }}>{mark(w.exCn, re.zh)}<Icon name="volume" size={15} className="ico" /></span>
                  <span className="ex-py" style={{ fontSize: fs(.9) }}>{mark(w.pySent, re.py)}</span>
                  <span className="ex-vi" style={{ fontSize: fs(.9) }}>{mark(w.exVi, re.vi)}</span>
                </button>
              ) : <div className="muted small lrow-noex">Chưa có câu ví dụ</div>)}
              <div className="due">
                <button className="ghost icon" onClick={() => adjust(w, -1)} title="Ôn sớm hơn 1 ngày">−</button>
                <span className={`due-lbl ${dueCls}`}>{dueText}</span>
                <button className="ghost icon" onClick={() => adjust(w, 1)} title="Lùi lịch ôn 1 ngày">+</button>
              </div>
            </div>
          );
        })}
      </div>
      {!pool.length && <p className="muted">Không có từ nào trong danh sách. {filter === "due" ? "Hôm nay không còn từ đến hạn — chọn bộ khác hoặc xem “Từ đã thuộc”." : ""}</p>}

      {pages > 1 && (
        <div className="row" style={{ justifyContent: "center", margin: "1rem 0 .4rem" }}>
          <button disabled={page === 0} onClick={() => goPage(page - 1)}><Icon name="chevL" size={16} />Trang trước</button>
          <span className="muted">Trang <b className="stat" style={{ color: "var(--text)" }}>{page + 1}</b> / {pages}</span>
          <button className="primary" disabled={page >= pages - 1} onClick={() => goPage(page + 1)}>Trang sau<Icon name="chevR" size={16} /></button>
        </div>
      )}
    </div>
  );
}
