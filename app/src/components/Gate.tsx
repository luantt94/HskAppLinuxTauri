// Cổng license: hiện hộp thoại kích hoạt/dùng thử trước khi vào app, như main.py của bản Python.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { LicenseStatus } from "../lib/types";

const TRIAL_SAVE_EVERY = 10; // ghi tiến độ dùng thử mỗi 10 giây
export const ZALO = "0384645872";

const fmt = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.max(0, Math.floor(t)) % 60).padStart(2, "0")}`;

// Để các màn hình khác (ví dụ tab Cài đặt) đọc được trạng thái license và nhập mã
// kích hoạt sớm, không cần chờ hết 7 ngày miễn phí mới thấy ô nhập mã.
type LicenseCtx = { status: LicenseStatus | null; refresh: () => void };
const LicenseContext = createContext<LicenseCtx>({ status: null, refresh: () => {} });
export const useLicense = () => useContext(LicenseContext);

export default function Gate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [inTrial, setInTrial] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const unsaved = useRef(0);

  const refresh = () => api.licenseStatus().then((s) => { setStatus(s); setRemaining(s.trialRemainingSeconds); });
  useEffect(() => { refresh(); }, []);

  // Đếm ngược dùng thử (mỗi giây); lưu định kỳ để tắt app đột ngột không "quên" thời gian đã dùng.
  useEffect(() => {
    if (!inTrial || status?.activated) return;
    const id = setInterval(() => {
      unsaved.current += 1;
      if (unsaved.current >= TRIAL_SAVE_EVERY) {
        const n = unsaved.current;
        unsaved.current = 0;
        api.trialAddSeconds(n);
      }
      setRemaining((r) => {
        if (r <= 1) {
          if (unsaved.current > 0) { api.trialAddSeconds(unsaved.current); unsaved.current = 0; }
          setInTrial(false); // hết giờ -> quay lại hộp thoại kích hoạt
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [inTrial, status?.activated]);

  const ctx: LicenseCtx = { status, refresh };
  // Chế độ dev (npm run tauri dev): vào thẳng như bản Python chạy từ mã nguồn.
  if (import.meta.env.DEV) return <LicenseContext.Provider value={ctx}>{children}</LicenseContext.Provider>;
  if (!status) return <main className="main">Đang tải…</main>;

  if (status.activated) return <LicenseContext.Provider value={ctx}>{children}</LicenseContext.Provider>;
  // 7 ngày đầu kể từ lần chạy đầu tiên: học không giới hạn, không đếm ngược.
  if (status.freeDaysLeft > 0) {
    return (
      <LicenseContext.Provider value={ctx}>
        {children}
        <div className="trial-bar">🎁 Miễn phí dùng thử: còn {status.freeDaysLeft} ngày học không giới hạn — có thể vào tab Cài đặt để nhập mã kích hoạt sớm</div>
      </LicenseContext.Provider>
    );
  }
  if (inTrial && remaining > 0) {
    return (
      <LicenseContext.Provider value={ctx}>
        {children}
        <div className="trial-bar">Dùng thử: còn {fmt(remaining)} — nhập mã kích hoạt ở tab Cài đặt để dùng không giới hạn</div>
      </LicenseContext.Provider>
    );
  }
  return <Activation status={status} trialLeft={remaining} onActivated={refresh} onTrial={() => setInTrial(true)} />;
}

function Activation({ status, trialLeft, onActivated, onTrial }: {
  status: LicenseStatus; trialLeft: number; onActivated: () => void; onTrial: () => void;
}) {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <div className="card" style={{ width: 460 }}>
        <h2>🔑 Kích hoạt HskApp</h2>
        <ActivationForm status={status} onActivated={onActivated} />
        <hr />
        {trialLeft > 0 ? (
          <button onClick={onTrial}>🕐 Dùng thử miễn phí (còn {fmt(trialLeft)} hôm nay)</button>
        ) : (
          <p className="err">⏳ Bạn đã dùng hết thời gian dùng thử hôm nay. Quay lại vào ngày mai nhé!</p>
        )}
      </div>
    </div>
  );
}

// Ô nhập mã kích hoạt dùng chung cho hộp thoại chặn lúc hết hạn dùng thử và cho
// tab Cài đặt (để kích hoạt sớm trong lúc vẫn còn đang dùng miễn phí).
export function ActivationForm({ status, onActivated }: { status: LicenseStatus; onActivated: () => void }) {
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setMsg("");
    try {
      await api.activateLicense(key);
      setKey("");
      onActivated();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p>Gửi số này cho tôi nhé (Zalo {ZALO}):<br /><b>👉 {status.machineCode}</b></p>
      <button onClick={() => navigator.clipboard.writeText(status.machineCode)}>📋 Copy ID</button>
      <p>Vui lòng nhập mã kích hoạt:</p>
      <div className="row">
        <input className="grow" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && verify()} />
        <button onClick={async () => setKey((await navigator.clipboard.readText()).trim())}>📋 Paste</button>
      </div>
      <p className="err">{msg}</p>
      <button className="primary" disabled={busy || !key.trim()} onClick={verify}>✅ Kiểm tra mã</button>
      <hr />
      <p style={{ fontSize: 13, opacity: 0.85 }}>
        🎁 Dùng thử miễn phí <b>không giới hạn</b> trong <b>7 ngày đầu</b> kể từ lần mở app đầu tiên.<br />
        ⏱️ Sau 7 ngày, nếu chưa kích hoạt thì mỗi ngày được học tối đa <b>30 phút</b>.<br />
        💰 Giá mỗi mã kích hoạt: <b>{status.priceVnd.toLocaleString("vi-VN")}đ</b> (dùng vĩnh viễn trên máy này).
      </p>
    </div>
  );
}
