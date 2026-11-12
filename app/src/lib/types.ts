// Kiểu dữ liệu dùng chung. `Word` khớp với dữ liệu JSON xuất từ bản Python
// và với struct `Word` bên Rust (srs.rs) — đổi tên trường ở đâu thì phải đổi cả hai nơi.
export type Word = {
  zh: string; // chữ Hán
  vi: string; // nghĩa tiếng Việt
  pinyin: string;
  exCn: string; // câu ví dụ tiếng Trung
  exVi: string; // dịch câu ví dụ
  pySent: string; // pinyin của câu ví dụ
};

export type SrsCard = Word & {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  dueDate: string;
  lastReviewed: string | null;
  createdAt: string;
};

export type LicenseStatus = {
  activated: boolean;
  machineCode: string;
  trialRemainingSeconds: number;
  // Số ngày còn lại trong 7 ngày đầu dùng miễn phí không giới hạn (0 = đã hết).
  freeDaysLeft: number;
  // Giá mỗi mã kích hoạt (đồng).
  priceVnd: number;
};

export type ProgressOverview = {
  streak: number;
  longestStreak: number;
  distinctToday: number;
  accuracy30: number | null;
  totalReviews: number;
  dailyCounts: Record<string, number>;
  last14: { day: string; count: number }[];
  srs: { total: number; due: number; new: number; learned: number };
  knownZh: string[];
};

export type Grade = 0 | 1 | 2 | 3; // Lại, Khó, Tốt, Dễ
export const AGAIN: Grade = 0;
export const HARD: Grade = 1;
export const GOOD: Grade = 2;
export const EASY: Grade = 3;
