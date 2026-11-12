// Chỉ dùng khi phát triển giao diện trong trình duyệt thường (VITE_MOCK=1): giả lập các lệnh Tauri để chụp ảnh/xem layout.
// Không được đóng gói vào bản phát hành (chỉ import khi import.meta.env.VITE_MOCK có giá trị).
type Args = Record<string, unknown> | undefined;
const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daily: Record<string, number> = {};
for (let i = 0; i < 100; i++) { const d = new Date(today); d.setDate(d.getDate() - i); if (Math.random() < 0.6) daily[iso(d)] = Math.floor(Math.random() * 30); }
const card = (zh: string) => ({ zh, vi: "nghĩa", pinyin: "pīnyīn", exCn: "", exVi: "", pySent: "", easeFactor: 2.5, intervalDays: 3, repetitions: 1, dueDate: iso(today), lastReviewed: null, createdAt: iso(today) });

const handlers: Record<string, (a: Args) => unknown> = {
  license_status: () => ({ activated: true, machine_code: "11012023", trial_remaining_seconds: 1200 }),
  progress_overview: () => ({
    streak: 3, longestStreak: 5, distinctToday: 12, accuracy30: 86, totalReviews: 3203, dailyCounts: daily,
    last14: Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - 13 + i); return { day: iso(d), count: Math.floor(Math.random() * 40) }; }),
    srs: { total: 3139, due: 2900, new: 2589, learned: 550 }, knownZh: ["爱", "好", "你", "我", "他", "们", "吃", "喝"],
  }),
  srs_add_words: () => 0,
  srs_due_dates: () => ({}),
  srs_get_card: (a) => card(String(a?.zh ?? "")),
  srs_preview: () => 3,
  srs_review: () => null, srs_report: () => null, srs_reset_words: () => 0, srs_adjust_due: () => 1,
  setting_get: () => null, setting_set: () => true,
  tts_speak: () => { throw new Error("mock: không có TTS"); },
  segment_words: (a) => ((a?.texts as string[]) ?? []).map((t) => [...t].filter((c) => /[一-鿿]/.test(c))),
  segment_with_pinyin: (a) => [...String(a?.text ?? "")].map((c) => [c, "pīn"]),
  exam_scan: () => ["/mock/exams", []],
  exam_progress_get: () => "{}",
  js_log: () => null, smoke_enabled: () => false,
  set_read: () => [], set_save: (a) => `/mock/${String(a?.name)}.json`, set_add_word: () => "added", set_delete: () => null,
  sets_list: () => [{ name: "Yêu thích", path: "/mock/Yêu thích.json", count: 3 }, { name: "Từ khó", path: "/mock/Từ khó.json", count: 12 }],
};

(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args: Args) => { const h = handlers[cmd]; if (!h) throw new Error(`mock: chưa có lệnh ${cmd}`); return h(args); },
  transformCallback: () => 0,
  metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
};
export {};
