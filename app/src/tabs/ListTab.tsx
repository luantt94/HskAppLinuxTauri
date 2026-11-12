// Tab "📋 Danh sách (Nghe)" — duyệt từ + câu ví dụ, nghe từng mục hoặc "Đọc tất cả".
// Port của games/game_list_reader.py (không có chấm điểm; chế độ SRS chỉ lọc theo hạn ôn).
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { daysLeft, dueOnlyPool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";

const PAGE_SIZE = 20;
const PAUSE_BETWEEN_MS = 1000; // nghỉ 1 giây giữa các mục khi tự đọc
const TONES = ["#eff6ff", "#f0fdf4", "#fffbeb", "#fdf2f8"];

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

  const fs = (px: number) => `${px * scale}px`;

  return (
    <div>
      <div className="toolbar">
        <b>{pool.length} mục</b>
        <span className="sep" />
        <button className={auto ? "active" : "primary"} onClick={readAll}><Icon name={auto ? "pause" : "play"} size={15} />{auto ? "Dừng" : "Đọc tất cả"}</button>
        <span className="sep" />
        <label><input type="radio" checked={filter === "due"} onChange={() => setFilter("due")} /> Từ đến hạn</label>
        <label><input type="radio" checked={filter === "known"} onChange={() => setFilter("known")} /> Từ đã thuộc</label>
        <span className="grow" />
        <button className="ghost" onClick={() => setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(1)))}>A−</button>
        <button className="ghost" onClick={() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(1)))}>A+</button>
        <label><input type="checkbox" checked={readVi} onChange={(e) => setReadVi(e.target.checked)} /> Đọc nghĩa Việt</label>
        <button onClick={() => setShowEx((v) => !v)}>{showEx ? "Ẩn câu" : "Hiện câu"}</button>
      </div>

      <div className="wordlist">
        {slice.map((w, i) => {
          const left = daysLeft(dues[w.zh]);
          const lbl = left === undefined ? ["chưa học", "#64748b"] : left < 0 ? [`Quá hạn ${-left}n`, "#be123c"] : left === 0 ? ["Hôm nay", "#b45309"] : [`còn ${left} ngày`, "#047857"];
          const wa = active?.idx === i && active.part === "word";
          const sa = active?.idx === i && active.part === "sent";
          return (
            <div id={`row-${i}`} key={w.zh} className="card" style={{ background: active?.idx === i ? "#d1fae5" : TONES[i % 4], padding: 10 }}>
              <div className="row">
                <button onClick={() => speak(cleanZh(w.zh))}><Icon name="volume" size={16} /></button>
                <span className="hanzi" style={{ fontSize: fs(20), fontWeight: 700, color: wa ? "#16a34a" : "#1d4ed8" }}>{w.zh}</span>
                <span style={{ fontSize: fs(15), color: "#7c3aed" }}>{w.pinyin}</span>
                <span style={{ fontSize: fs(15), color: "#047857", fontWeight: 600 }} className="grow">— {w.vi}</span>
                <button style={{ padding: "0 8px" }} onClick={() => adjust(w, -1)}>−</button>
                <span style={{ color: lbl[1], fontWeight: 600, fontSize: fs(14), minWidth: 80, textAlign: "center" }}>{lbl[0]}</span>
                <button style={{ padding: "0 8px" }} onClick={() => adjust(w, 1)}>+</button>
              </div>
              {showEx && (
                <div className="row" style={{ marginTop: 6, alignItems: "flex-start" }}>
                  <button disabled={!cleanZh(w.exCn)} onClick={() => speak(cleanZh(w.exCn))}><Icon name="volume" size={16} /></button>
                  <div className="grow">
                    {w.exCn ? (
                      <>
                        <div className="hanzi" style={{ fontSize: fs(17), color: sa ? "#16a34a" : "#0f172a" }}>{w.exCn}</div>
                        <div style={{ fontSize: fs(14), color: "#0e7490" }}>{w.pySent}</div>
                        <div style={{ fontSize: fs(14), color: "#c2410c" }}>{w.exVi}</div>
                      </>
                    ) : <span className="muted">（Chưa có câu ví dụ）</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!pool.length && <p className="muted">Không có từ nào trong danh sách. {filter === "due" ? "Hôm nay không còn từ đến hạn — chọn bộ khác hoặc xem “Từ đã thuộc”." : ""}</p>}

      <div className="row" style={{ justifyContent: "center", margin: "12px 0" }}>
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}><Icon name="chevL" size={16} /> Trang trước</button>
        <span>Trang {page + 1}/{pages}</span>
        <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Trang sau <Icon name="chevR" size={16} /></button>
      </div>
    </div>
  );
}
