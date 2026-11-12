// Tab "📖 Từ điển" — tra trong TOÀN BỘ từ vựng mọi cấp, không phụ thuộc bộ đang học.
import { useMemo, useState } from "react";
import { LEVEL_LABELS, LEVEL_ORDER, LEVELS, normalizePinyin as norm } from "../lib/data";
import { speak } from "../lib/audio";
import type { Word } from "../lib/types";

const MAX_RESULTS = 200;

type Entry = { w: Word; labels: string[]; pyNorm: string };

export default function DictionaryTab() {
  const entries = useMemo(() => {
    // Gộp theo chữ Hán: từ trùng ở nhiều cấp chỉ hiện 1 dòng, gom đủ nhãn cấp.
    const m = new Map<string, Entry>();
    for (const lv of LEVEL_ORDER) {
      for (const w of LEVELS[lv] ?? []) {
        const zh = w.zh.trim();
        if (!zh) continue;
        const e = m.get(zh);
        if (e) e.labels.push(LEVEL_LABELS[lv]);
        else m.set(zh, { w, labels: [LEVEL_LABELS[lv]], pyNorm: norm(w.pinyin) });
      }
    }
    return [...m.values()];
  }, []);

  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Word | null>(null);

  const results = useMemo(() => {
    const query = q.trim();
    if (!query) return [];
    const lower = query.toLowerCase();
    const qp = norm(query);
    const out: Entry[] = [];
    for (const e of entries) {
      if (e.w.zh.includes(query) || e.w.vi.toLowerCase().includes(lower) || (qp && e.pyNorm.includes(qp))) {
        out.push(e);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [q, entries]);

  return (
    <div>
      <input type="search" style={{ width: "100%", fontSize: "1.1rem", minHeight: "3rem", padding: ".5rem 1rem" }} autoFocus placeholder="Gõ chữ Hán, pinyin (không dấu cũng được) hoặc nghĩa tiếng Việt..."
        value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} />
      <p className="muted" style={{ margin: ".7rem 0" }}>{q.trim() ?  `${results.length} kết quả${results.length >= MAX_RESULTS ? ` (hiện ${MAX_RESULTS} kết quả đầu, gõ thêm để thu hẹp)` : ""}` : `Tra trong toàn bộ ${entries.length} từ HSK1-6 — không phụ thuộc cấp đang học.`}</p>
      <div className="wordlist">
        {results.map((e) => (
          <div key={e.w.zh} className="wordrow" style={{ cursor: "pointer" }} onClick={() => { speak(e.w.zh); setPicked(e.w); }}>
            <span className="zh hanzi">{e.w.zh}</span>
            <span style={{ minWidth: 110, color: "#7c3aed" }}>{e.w.pinyin}</span>
            <span className="grow">{e.w.vi}</span>
            <span className="pill">{e.labels.join(", ")}</span>
          </div>
        ))}
      </div>
      {picked?.exCn && (
        <div className="card" style={{ marginTop: 12, background: "#eff6ff" }}>
          <div className="hanzi" style={{ fontSize: "1.1rem" }}>📖 {picked.exCn}</div>
          <div className="muted">{picked.exVi}</div>
        </div>
      )}
    </div>
  );
}
