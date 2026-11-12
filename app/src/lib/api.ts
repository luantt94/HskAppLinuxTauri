// Lớp mỏng gọi các lệnh Rust (xem src-tauri/src/commands.rs). Gom hết `invoke` về
// một chỗ để giao diện không phải nhớ tên lệnh/kiểu tham số.
import { invoke } from "@tauri-apps/api/core";
import type { Grade, LicenseStatus, ProgressOverview, SrsCard, Word } from "./types";

// Rust trả snake_case cho LicenseStatus (struct cũ) — chuyển sang camelCase ở đây.
type RawLicense = {
  activated: boolean;
  machine_code: string;
  trial_remaining_seconds: number;
  free_days_left: number;
  price_vnd: number;
};

export const api = {
  licenseStatus: async (): Promise<LicenseStatus> => {
    const r = await invoke<RawLicense>("license_status");
    return {
      activated: r.activated,
      machineCode: r.machine_code,
      trialRemainingSeconds: r.trial_remaining_seconds,
      freeDaysLeft: r.free_days_left,
      priceVnd: r.price_vnd,
    };
  },
  activateLicense: (key: string) => invoke<void>("activate_license", { key }),
  trialAddSeconds: (seconds: number) => invoke<number>("trial_add_seconds", { seconds }),

  progressOverview: () => invoke<ProgressOverview>("progress_overview"),

  examScan: (root?: string) => invoke<[string, { level: number; name: string; title: string; path: string }[]]>("exam_scan", { root }),
  examSetFolder: (path: string) => invoke<boolean>("exam_set_folder", { path }),
  examLoad: (path: string) => invoke<string>("exam_load", { path }),
  examMedia: (path: string, sub: "audio" | "images", name: string) => invoke<string | null>("exam_media", { path, sub, name }),
  examMediaExists: (path: string, sub: "audio" | "images", name: string) => invoke<boolean>("exam_media_exists", { path, sub, name }),
  examProgressGet: () => invoke<string>("exam_progress_get"),
  examProgressSet: (json: string) => invoke<void>("exam_progress_set", { json }),
  setsList: () => invoke<{ name: string; path: string; count: number }[]>("sets_list"),
  setRead: (path: string) => invoke<Word[]>("set_read", { path }),
  setSave: (name: string, words: Word[], path?: string) => invoke<string>("set_save", { name, words, path }),
  setAddWord: (path: string, word: Word) => invoke<"added" | "exists" | "error">("set_add_word", { path, word }),
  setDelete: (path: string) => invoke<void>("set_delete", { path }),
  settingGet: (key: string) => invoke<string | null>("setting_get", { key }),
  settingSet: (key: string, value: string) => invoke<boolean>("setting_set", { key, value }),
  recStart: () => invoke<void>("rec_start"),
  recStatus: () => invoke<{ recording: boolean; level: number; elapsedMs: number; error: string | null }>("rec_status"),
  recStop: () => invoke<{ wavBase64: string; peaks: number[]; durationMs: number }>("rec_stop"),
  segmentWords: (texts: string[]) => invoke<string[][]>("segment_words", { texts }),
  segmentWithPinyin: (text: string) => invoke<[string, string][]>("segment_with_pinyin", { text }),

  srsAddWords: (words: Word[]) => invoke<number>("srs_add_words", { words }),
  srsDueCards: (limit?: number) => invoke<SrsCard[]>("srs_due_cards", { limit }),
  srsGetCard: (zh: string) => invoke<SrsCard | null>("srs_get_card", { zh }),
  srsDueDates: () => invoke<Record<string, string>>("srs_due_dates"),
  srsPreview: (zh: string, grade: Grade) => invoke<number | null>("srs_preview", { zh, grade }),
  srsReview: (zh: string, grade: Grade, forceDays?: number) =>
    invoke<void>("srs_review", { zh, grade, forceDays }),
  srsReport: (zh: string, correct: boolean) => invoke<void>("srs_report", { zh, correct }),
  srsResetWords: (zhList: string[]) => invoke<number>("srs_reset_words", { zhList }),
  srsAdjustDue: (word: Word, deltaDays: number) =>
    invoke<number | null>("srs_adjust_due", { word, deltaDays }),
};
