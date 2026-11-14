// Tab "📋 Danh sách (Nghe)" — duyệt từ + câu ví dụ, nghe từng mục hoặc "Đọc tất cả".
// Port của games/game_list_reader.py (không có chấm điểm; chế độ SRS chỉ lọc theo hạn ôn).
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Check, Menu } from "../components/ui";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { daysLeft, dueOnlyPool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";

const PAGE_SIZE = 20;
const PAUSE_BETWEEN_MS = 1000; // nghỉ 1 giây giữa các mục khi tự đọc

type Active = { idx: number; part: "word" | "sent" } | null;

export default function ListTab() {
  const { items } = useVocab();
  const [filter, setFilter] = usePersistent<"due" | "known">("list.filter", "due");
  const [scale, setScale] = usePersistent("list.scale", 1);
  const [showEx, setShowEx] = usePersistent("list.showExamples", true);
  const [readVi, setReadVi] = usePersistent("list.readVi", true);
  const [pool, setPool] = useState<Word[]>([]);
  const [dues, setDues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<Active>(null);
  const [auto, setAuto] = useState(false);
  const runRef = useRef(0); // đổi số này để huỷ vòng "Đọc tất cả" đang chạy

  const load = useCallback(async () => {
    const d = await api.srsDueDates();
    setDues(d);
    if (filter === "due") {
      setPool(await dueOnlyPool(items));
    } else {
      const known = new Set((await api.progressOverview()).knownZh);
      setPool(items.filter((w) => known.has(w.zh)));
    }
    setPage(0);
  }, [items, filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { runRef.current++; stopAudio(); }, []);

  const pages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const slice = pool.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
      const rows = pool.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
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
  const pager = (
    <div className="pager">
      <button className="icon" disabled={page === 0} onClick={() => goPage(page - 1)} title="Trang trước"><Icon name="chevL" size={16} /></button>
      <span>Trang <b className="stat">{page + 1}</b> / {pages}</span>
      <button className="icon" disabled={page >= pages - 1} onClick={() => goPage(page + 1)} title="Trang sau"><Icon name="chevR" size={16} /></button>
    </div>
  );

  const fs = (rem: number) => `${rem * scale}rem`;

  return (
    <div>
      <div className="toolbar">
        <button className={auto ? "active" : "primary"} onClick={readAll}><Icon name={auto ? "pause" : "play"} size={15} />{auto ? "Dừng" : "Đọc tất cả"}</button>
        <div className="tabs seg">
          <button className={filter === "due" ? "active" : ""} onClick={() => setFilter("due")}>Đến hạn</button>
          <button className={filter === "known" ? "active" : ""} onClick={() => setFilter("known")}>Đã thuộc</button>
        </div>
        <span className="muted">{pool.length} mục</span>
        <span className="grow" />
        {pages > 1 && pager}
        <Menu label="Hiển thị" icon="sliders">
          <div className="menu-row">
            <span className="grow">Cỡ chữ</span>
            <button className="icon" onClick={() => setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(1)))} title="Nhỏ hơn">A−</button>
            <b className="stat" style={{ minWidth: "3rem", textAlign: "center" }}>{Math.round(scale * 100)}%</b>
            <button className="icon" onClick={() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(1)))} title="Lớn hơn">A+</button>
          </div>
          <Check checked={showEx} onChange={setShowEx} label="Hiện câu ví dụ" />
          <Check checked={readVi} onChange={setReadVi} label="Đọc cả nghĩa tiếng Việt" />
        </Menu>
      </div>

      <div className="wordlist">
        {slice.map((w, i) => {
          const left = daysLeft(dues[w.zh]);
          // Nhãn hạn ôn: [chữ, lớp màu]
          const [dueText, dueCls] = left === undefined ? ["chưa học", "new"] : left < 0 ? [`quá hạn ${-left} ngày`, "late"] : left === 0 ? ["hôm nay", "today"] : [`còn ${left} ngày`, "later"];
          const wa = active?.idx === i && active.part === "word";
          const sa = active?.idx === i && active.part === "sent";
          return (
            // Bố cục ngang: [từ + nghĩa] | [câu ví dụ] | [hạn ôn] — bấm vào từ / câu để nghe
            <div id={`row-${i}`} key={w.zh} className={`lcard ${active?.idx === i ? "playing" : ""} ${showEx ? "" : "noex"}`}>
              <div className="lcard-word">
                <button className={`say ${wa ? "on" : ""}`} onClick={() => speak(cleanZh(w.zh))} title="Nghe từ">
                  <span className="hanzi zh" style={{ fontSize: fs(1.5) }}>{w.zh}</span>
                  <span className="py" style={{ fontSize: fs(1) }}>{w.pinyin}</span>
                  <Icon name="volume" size={15} className="ico" />
                </button>
                <div className="vi" style={{ fontSize: fs(1) }}>{w.vi}</div>
              </div>
              {showEx && (w.exCn ? (
                <button className={`say ex ${sa ? "on" : ""}`} onClick={() => speak(cleanZh(w.exCn))} title="Nghe câu ví dụ">
                  <span className="grow">
                    <span className="hanzi ex-zh" style={{ fontSize: fs(1.1) }}>{w.exCn}</span>
                    <span className="ex-py" style={{ fontSize: fs(.92) }}>{w.pySent}</span>
                    <span className="ex-vi" style={{ fontSize: fs(.92) }}>{w.exVi}</span>
                  </span>
                  <Icon name="volume" size={15} className="ico" />
                </button>
              ) : <div className="muted small lcard-noex">Chưa có câu ví dụ</div>)}
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
