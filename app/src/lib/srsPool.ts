// Chọn từ để luyện theo lịch ôn SRS — port của resolve_effective_pool()/due_only_pool() (core/srs.py).
import { api } from "./api";
import type { Word } from "./types";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Toàn bộ `items`, sắp theo hạn ôn: quá hạn (lâu nhất trước) → hôm nay → đã thuộc.
 *  Từ chưa có trong SRS được tự thêm làm thẻ mới (đến hạn hôm nay). */
export async function resolveEffectivePool(items: Word[]): Promise<Word[]> {
  const valid = items.filter((w) => w.zh);
  if (!valid.length) return [];
  await api.srsAddWords(valid);
  const dues = await api.srsDueDates();
  // sort ổn định: cùng ngày giữ thứ tự bộ gốc (chuỗi ISO so sánh trực tiếp được)
  return [...valid].sort((a, b) => (dues[a.zh] ?? "").localeCompare(dues[b.zh] ?? ""));
}

/** Như trên nhưng chỉ giữ từ đã đến hạn (quá hạn hoặc hôm nay). */
export async function dueOnlyPool(items: Word[]): Promise<Word[]> {
  const pool = await resolveEffectivePool(items);
  if (!pool.length) return pool;
  const dues = await api.srsDueDates();
  const t = todayIso();
  return pool.filter((w) => (dues[w.zh] ?? "") <= t);
}

/** Số ngày tới hạn (0 = hôm nay, âm = quá hạn); undefined nếu chưa có thẻ. */
export function daysLeft(due: string | undefined): number | undefined {
  if (!due) return undefined;
  const a = new Date(`${due}T00:00:00`);
  const b = new Date(`${todayIso()}T00:00:00`);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** Sắp theo hạn ôn (quá hạn lâu nhất trước); từ chưa có thẻ coi như đến hạn hôm nay — như tiered_order() của Python. */
export async function dueDaysSort<T>(items: T[], key: (x: T) => string): Promise<T[]> {
  const dues = await api.srsDueDates();
  const t = todayIso();
  return [...items].sort((a, b) => (dues[key(a)] || t).localeCompare(dues[key(b)] || t));
}
