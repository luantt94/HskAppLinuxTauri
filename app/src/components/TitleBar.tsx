import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Thanh tiêu đề tự vẽ (có màu) — chỉ dùng trên Linux, nơi tauri.linux.conf.json tắt khung cửa sổ của hệ thống.
export const customTitleBar = "__TAURI_INTERNALS__" in window && navigator.userAgent.includes("Linux");

// Câu động viên ở giữa thanh tiêu đề, đổi mỗi phút.
const QUOTES = [
  "加油! Mỗi ngày 10 từ, một năm 3.650 từ 💪",
  "学而时习之 — Học rồi ôn, ôn rồi nhớ 📚",
  "Hôm nay học thêm một chữ, mai đọc thêm một câu ✨",
  "千里之行，始于足下 — Đường ngàn dặm bắt đầu từ một bước 🚶",
  "Sai thì sửa, quên thì ôn — 没关系! 😄",
  "Ôn flashcard 5 phút còn hơn lướt mạng 30 phút 😉",
  "熟能生巧 — Luyện nhiều thì giỏi 🔥",
  "HSK không khó, chỉ cần mỗi ngày một chút 🌱",
  "Đọc to lên nào! Phát âm chuẩn từ hôm nay 🗣️",
  "你真棒! Bạn đang tiến bộ từng ngày 🌟",
];

const pick = (not?: string) => {
  const pool = QUOTES.filter((q) => q !== not);
  return pool[Math.floor(Math.random() * pool.length)];
};

function Bar() {
  const win = getCurrentWindow();
  const [quote, setQuote] = useState(() => pick());
  useEffect(() => {
    const t = setInterval(() => setQuote((q) => pick(q)), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="titlebar" data-tauri-drag-region>
      <span key={quote} className="titlebar-title">{quote}</span>
      <div className="titlebar-buttons">
        <button title="Thu nhỏ" onClick={() => win.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" strokeWidth="1.4" /></svg>
        </button>
        <button title="Phóng to / Thu về" onClick={() => win.toggleMaximize()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
        </button>
        <button className="close" title="Đóng" onClick={() => win.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" /></svg>
        </button>
      </div>
    </div>
  );
}

export default function TitleBar() {
  return customTitleBar ? <Bar /> : null;
}
