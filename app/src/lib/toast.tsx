// Thông báo nhỏ nổi ở giữa-dưới — port của games/srs_feedback.py: báo từ vừa trả lời
// sẽ gặp lại sau bao nhiêu ngày.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { daysLeft } from "./srsPool";
import { useProgress } from "./progress";

type Toast = { text: string; good: boolean; id: number } | null;
type ToastCtx = { report: (zh: string, correct: boolean) => Promise<void>; notify: (text: string, good?: boolean, ms?: number) => void };
const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  const { refresh } = useProgress();
  const timer = useRef<number | undefined>(undefined);

  /** Hiện một thông báo ngắn (vd "Đang học: HSK2"). */
  const notify = useCallback((text: string, good = true, ms = 1800) => {
    setToast({ text, good, id: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  /** Ghi kết quả đúng/sai vào SRS rồi hiện "gặp lại sau N ngày". */
  const report = useCallback(async (zh: string, correct: boolean) => {
    if (!zh) return;
    await api.srsReport(zh, correct);
    const card = await api.srsGetCard(zh);
    refresh();
    if (!card) return;
    const d = daysLeft(card.dueDate) ?? 0;
    const when = d <= 0 ? "ngay hôm nay" : `sau ${d} ngày`;
    notify(`${zh}: ${correct ? "đúng" : "sai"}, gặp lại ${when}`, correct, 1500);
  }, [refresh, notify]);

  return (
    <Ctx.Provider value={{ report, notify }}>
      {children}
      {toast && (
        <div key={toast.id} style={{ position: "fixed", left: "50%", bottom: 36, transform: "translateX(-50%)", zIndex: 60,
          background: "#fff", border: `1px solid ${toast.good ? "#15803d" : "#dc2626"}`, color: toast.good ? "#15803d" : "#dc2626",
          padding: "6px 16px", borderRadius: 99, fontWeight: 600, boxShadow: "0 4px 14px rgba(0,0,0,.15)" }}>
          {toast.text}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useReport() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReport phải nằm trong <ToastProvider>");
  return v.report;
}
