// Danh sách từ đang học (cột bên trái nội dung) cho các tab đi qua từng từ: Flashcard, Luyện viết,
// Luyện phát âm, Gõ tiếng Trung. Từ đang học được tô sáng và luôn cuộn vào tầm nhìn; bấm 1 từ để nhảy tới.
// Bật/tắt ở bảng Tuỳ chọn của tab (công tắc "Danh sách từ"), nhớ chung cho mọi tab — xem useWordListOpen().
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { usePersistent } from "../lib/storage";

/** Shell cung cấp: chỗ đặt cột danh sách (bên trái vùng nội dung). */
export const WordListSlotContext = createContext<HTMLElement | null>(null);

export type WordRow = { zh: string; py?: string; vi?: string; done?: boolean };

/** Trạng thái hiện/ẩn cột danh sách (chung cho mọi tab). Tab gọi 1 lần rồi truyền cho <WordList> và công tắc trong Tuỳ chọn. */
export const useWordListOpen = () => usePersistent("ui.wordList", false); // mặc định ẩn

export function WordList({ words, index, onPick, open, onClose, unit = "từ" }: {
  words: WordRow[]; index: number; onPick: (i: number) => void; open: boolean; onClose: () => void; unit?: string;
}) {
  const slot = useContext(WordListSlotContext);
  const [query, setQuery] = useState("");
  const activeRef = useRef<HTMLButtonElement>(null);
  const q = query.trim().toLowerCase();

  // Giữ từ đang học trong tầm nhìn khi chuyển từ
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [index, open]);

  const doneCount = words.filter((w) => w.done).length;
  return (
    <>
      {open && slot && createPortal(
        <aside className="wl">
          <div className="wl-head">
            <b>Danh sách {unit}</b>
            <span className="muted small">{doneCount ? `${doneCount} / ` : ""}{words.length}</span>
            <span className="grow" />
            <button className="ghost icon" onClick={onClose} title="Ẩn danh sách (bật lại trong Tuỳ chọn)"><Icon name="x" size={15} /></button>
          </div>
          <div className="side-search wl-search">
            <Icon name="search" size={14} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm chữ Hán, pinyin, nghĩa…" />
          </div>
          <div className="wl-items">
            {words.map((w, i) => {
              if (q && !`${w.zh} ${w.py ?? ""} ${w.vi ?? ""}`.toLowerCase().includes(q)) return null;
              const on = i === index;
              return (
                <button key={i} ref={on ? activeRef : undefined} className={`wl-item ${on ? "on" : ""} ${w.done ? "done" : ""}`} onClick={() => onPick(i)}>
                  <span className="n">{w.done ? <Icon name="check" size={12} /> : i + 1}</span>
                  <span className="grow wl-text">
                    <span className="hanzi zh">{w.zh}</span>
                    {(w.py || w.vi) && <small>{w.py && <span className="py">{w.py}</span>}{w.vi && <span className="vi">{w.vi}</span>}</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>,
        slot,
      )}
    </>
  );
}
