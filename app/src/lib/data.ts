// Dữ liệu học (đã xuất từ Python bằng scripts/export_data.py).
// vocab.json được import thẳng (dùng ở mọi nơi); các file lớn/ít dùng hơn nạp khi cần.
import vocabJson from "../data/vocab.json";
import type { Word } from "./types";

export const LEVEL_ORDER: string[] = vocabJson.order;
export const LEVEL_LABELS: Record<string, string> = vocabJson.labels;
export const LEVELS = vocabJson.levels as Record<string, Word[]>;

// Mỗi cấp chia thành các phần ~12 từ (phần cuối ngắn thì gộp vào phần trước) — như level_parts() của Python.
export const PART_SIZE = 12;
export function levelParts(level: string): Word[][] {
  const words = LEVELS[level] ?? [];
  const parts: Word[][] = [];
  for (let i = 0; i < words.length; i += PART_SIZE) parts.push(words.slice(i, i + PART_SIZE));
  if (parts.length > 1 && parts[parts.length - 1].length < PART_SIZE / 2) {
    const last = parts.pop()!;
    parts[parts.length - 1] = parts[parts.length - 1].concat(last);
  }
  return parts;
}

export const loadCourses = async () => (await import("../data/courses.json")).default as Record<string, Word[]>;
export const loadCollocations = async () =>
  (await import("../data/collocations.json")).default as Record<string, Record<string, Word[]>>;
export type GrammarPoint = { title: string; pattern: string; explain: string; notes?: string[]; examples: [string, string, string][] };
export const loadGrammar = async () =>
  (await import("../data/grammar.json")).default as unknown as Record<string, GrammarPoint[]>;

/** Toàn bộ từ của mọi cấp (cho Từ điển, đếm tiến độ). */
export function allWords(): Word[] {
  return LEVEL_ORDER.flatMap((lv) => LEVELS[lv] ?? []);
}

/** Chuẩn hoá JSON người dùng dán vào về Word[] — như parse_json_items() của Python. */
export function parseWordsJson(text: string): Word[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON không hợp lệ: ${(e as Error).message}`);
  }
  if (!Array.isArray(data)) throw new Error("Dữ liệu gốc phải là một MẢNG các từ, vd: [ {...}, {...} ]");
  const s = (v: unknown) => String(v ?? "").trim();
  const out: Word[] = [];
  for (const e of data) {
    if (Array.isArray(e)) {
      out.push({ zh: s(e[0]), vi: s(e[1]), pinyin: s(e[2]), exCn: s(e[3]), exVi: s(e[4]), pySent: s(e[5]) });
    } else if (e && typeof e === "object") {
      const o = e as Record<string, unknown>;
      out.push({
        zh: s(o.zh ?? o.hanzi ?? o.word),
        vi: s(o.vi ?? o.meaning ?? o.nghia),
        pinyin: s(o.pinyin ?? o.pinyin_word),
        exCn: s(o.example_cn ?? o.exCn),
        exVi: s(o.example_vi ?? o.exVi),
        pySent: s(o.pinyin_sentence ?? o.pySent),
      });
    }
  }
  const valid = out.filter((w) => w.zh);
  if (!valid.length) throw new Error('Không tìm thấy từ hợp lệ nào (mỗi từ cần ít nhất khoá "zh").');
  return valid;
}

/** Bỏ dấu thanh để tìm pinyin không cần gõ dấu. */
export function stripTones(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "u").toLowerCase();
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pinyin KHÔNG dấu thanh, không khoảng trắng/số, chữ thường — như normalize_pinyin() của Python. */
export function normalizePinyin(text: string): string {
  return (text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}]/gu, "");
}

export const loadPatternPinyin = async () =>
  (await import("../data/patternPinyin.json")).default as { words: Record<string, string>; chars: Record<string, string> };
