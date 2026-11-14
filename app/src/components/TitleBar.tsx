import { getCurrentWindow } from "@tauri-apps/api/window";

// Thanh tiêu đề tự vẽ (có màu) — chỉ dùng trên Linux, nơi tauri.linux.conf.json tắt khung cửa sổ của hệ thống.
export const customTitleBar = "__TAURI_INTERNALS__" in window && navigator.userAgent.includes("Linux");

export default function TitleBar() {
  if (!customTitleBar) return null;
  const win = getCurrentWindow();
  return (
    <div className="titlebar" data-tauri-drag-region onDoubleClick={() => win.toggleMaximize()}>
      <span className="titlebar-logo" data-tauri-drag-region>汉</span>
      <span className="titlebar-title" data-tauri-drag-region>HskApp</span>
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
