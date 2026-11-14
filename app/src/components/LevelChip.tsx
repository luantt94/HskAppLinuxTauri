// Chọn cấp HSK cho các tab bài học (Ngữ pháp, Bài đọc, Hội thoại): nút "HSK n ▾" trên thanh tiêu đề trang,
// cùng chỗ với nút bộ từ của các tab khác.
import { useEffect } from "react";
import { HeaderExtra } from "./ui";
import { Select } from "./Select";
import { loadJson, saveJson } from "../lib/storage";
import { useVocab, type Source } from "../lib/vocabStore";

const LEVEL_NUMS = [1, 2, 3, 4, 5, 6];

/** Cấp HSK (1-6) của bộ từ đang học, hoặc null nếu bộ từ không gắn với một cấp (chủ đề, bộ tự tạo). */
function levelOf(s: Source): number | null {
  const key = s.kind === "levels" ? s.levels[0] : s.kind === "part" || s.kind === "colloc" ? s.level : "";
  const m = /hsk\s*(\d)/i.exec(key ?? "");
  return m ? Number(m[1]) : null;
}

/** Khi cấp của bộ từ đang học ĐỔI thì đưa tab về cùng cấp; cấp người dùng tự chọn trong tab được giữ cho tới lần đổi bộ từ kế. */
export function useFollowVocabLevel(tabKey: string, apply: (n: number) => void) {
  const { source } = useVocab();
  const lv = levelOf(source);
  useEffect(() => {
    if (lv === null) return;
    const seenKey = `${tabKey}.seenVocabLevel`;
    if (loadJson<number | null>(seenKey, null) === lv) return;
    saveJson(seenKey, lv);
    apply(lv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lv, tabKey]);
}

/** Nút chọn cấp trên thanh tiêu đề. `counts[n]` = số bài của cấp n (nếu biết), `unit` = "bài", "đoạn"… */
export function LevelChip({ value, onChange, counts, unit }: { value: number; onChange: (n: number) => void; counts?: Partial<Record<number, number>>; unit: string }) {
  return (
    <HeaderExtra>
      <Select value={value} onChange={onChange} className="level-chip" title="Chọn cấp HSK"
        options={LEVEL_NUMS.map((n) => ({
          value: n,
          label: counts?.[n] !== undefined ? `HSK ${n} · ${counts[n]} ${unit}` : `HSK ${n}`,
        }))} />
    </HeaderExtra>
  );
}
