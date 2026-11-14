// Tuỳ chọn riêng của từng tab: 1 nút cố định trên thanh tiêu đề (cạnh nút Cài đặt) mở bảng bên phải.
// Bảng nằm cạnh nội dung (đẩy nội dung sang trái, không che) để thấy ngay thay đổi khi chỉnh.
// Tab nào có tuỳ chọn thì đặt <TabOptions> trong JSX; tab không có thì không hiện nút.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

/** Shell cung cấp: chỗ đặt nút (trên thanh tiêu đề), chỗ đặt bảng (cạnh nội dung) và tên tab. */
export const TabOptionsContext = createContext<{ button: HTMLElement | null; panel: HTMLElement | null; label: string }>({ button: null, panel: null, label: "" });

export function TabOptions({ children }: { children: ReactNode }) {
  const { button, panel, label } = useContext(TabOptionsContext);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      // Esc trong hộp thoại (vd Xuất file) chỉ đóng hộp thoại đó
      if (e.key === "Escape" && !document.querySelector(".modal-back")) setOpen(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <>
      {button && createPortal(
        <button className={`ghost opt-btn ${open ? "active" : ""}`} onClick={() => setOpen(!open)} title="Tuỳ chọn của mục này" aria-expanded={open}>
          <Icon name="sliders" size={17} /><span className="lbl">Tuỳ chọn</span>
        </button>,
        button,
      )}
      {open && panel && createPortal(
        <div className="opt-panel" role="dialog" aria-label={`Tuỳ chọn · ${label}`}>
          <div className="opt-head">
            <div className="grow"><h2>Tuỳ chọn</h2><small>{label}</small></div>
            <button className="ghost icon" onClick={() => setOpen(false)} title="Đóng (Esc)"><Icon name="x" /></button>
          </div>
          <div className="opt-body">{children}</div>
        </div>,
        panel,
      )}
    </>
  );
}

/** 1 nhóm trong bảng tuỳ chọn: tiêu đề nhỏ + các dòng; các nhóm tự có đường kẻ ngăn cách. */
export function OptSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <section className="opt-sec"><div className="menu-head">{title}</div>{children}</section>;
}

/** Dòng bật/tắt (công tắc). */
export function OptSwitch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`opt-row ${disabled ? "off" : ""}`}>
      <span className="grow">{label}{hint && <small>{hint}</small>}</span>
      <span className="switch"><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><i /></span>
    </label>
  );
}

/** Chọn 1 trong nhiều (dạng danh sách). */
export function OptRadio<T extends string | number>({ value, options, onChange }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="opt-radio">
      {options.map(([v, l]) => (
        <label key={String(v)} className={value === v ? "on" : ""}><input type="radio" checked={value === v} onChange={() => onChange(v)} />{l}</label>
      ))}
    </div>
  );
}

/** Dòng có nhãn bên trái, điều khiển tuỳ ý bên phải (stepper, nút chọn...). */
export function OptRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <div className="opt-row"><span className="grow">{label}</span>{children}</div>;
}
