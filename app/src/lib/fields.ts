// Các "trường" của một từ, đánh số như tuple 6 phần của bản Python:
// 0 Hán, 1 nghĩa VN, 2 pinyin, 3 câu Hán, 4 câu VN, 5 pinyin câu.
import type { Word } from "./types";

export const fieldOf = (w: Word, f: number): string =>
  [w.zh, w.vi, w.pinyin, w.exCn, w.exVi, w.pySent][f] ?? "";

export const FIELD_NAMES: Record<number, string> = { 0: "Hán", 1: "VN", 2: "Pinyin", 3: "Hán", 4: "VN", 5: "Pinyin" };

/** Trường còn lại trong bộ ba (không phải câu hỏi q, không phải đáp án a). */
export const thirdField = (q: number, a: number): number => {
  const base = q < 3 ? 0 : 3;
  return [base, base + 1, base + 2].find((f) => f !== q && f !== a)!;
};

/** 12 chế độ = 2 nhóm (Từ / Câu) × 3 cặp trường × 2 chiều. [câu hỏi, đáp án, nhãn] */
export const MODES: [number, number, string][] = (() => {
  const out: [number, number, string][] = [];
  const groups: [string, [number, number][]][] = [
    ["Từ", [[0, 2], [0, 1], [2, 1]]],
    ["Câu", [[3, 5], [3, 4], [5, 4]]],
  ];
  for (const [g, pairs] of groups) {
    for (const [x, y] of pairs) {
      out.push([x, y, `${g}: ${FIELD_NAMES[x]} → ${FIELD_NAMES[y]}`]);
      out.push([y, x, `${g}: ${FIELD_NAMES[y]} → ${FIELD_NAMES[x]}`]);
    }
  }
  return out;
})();

export const FALLBACK_ZH = ["今天", "我们", "中国", "学习", "老师", "学生", "苹果", "北京", "上海", "天气", "电脑", "手机", "喜欢", "工作", "问题", "时间", "东西"];
export const FALLBACK_VI = ["thời tiết", "máy tính", "điện thoại", "yêu thích", "làm việc", "câu hỏi", "thời gian", "đồ vật", "học sinh", "giáo viên", "trường học", "gia đình", "bạn bè", "ăn uống", "mua sắm", "đi lại", "sức khỏe", "thành phố", "nông thôn", "du lịch"];
