// Thành phần giao diện dùng chung cho các tab.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

export function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return <label><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

/** Điểm đúng/sai. */
export function Score({ ok, bad }: { ok: number; bad: number }) {
  return (
    <div className="score">
      <span className="s good"><Icon name="checkCircle" size={16} />{ok}</span>
      <span className="s bad"><Icon name="x" size={16} />{bad}</span>
    </div>
  );
}

/** Dòng trạng thái: nhãn bên trái, hành động bên phải. */
export function StatusRow({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return <div className="status-row"><div className="grow">{children}</div>{right}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Done({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card done">
      <div className="done-ico"><Icon name="checkCircle" size={32} /></div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** Nút mở menu thả xuống (tuỳ chọn phụ) — đóng khi bấm ra ngoài hoặc nhấn Esc. */
export function Menu({ label, icon, title, children }: { label?: ReactNode; icon?: Parameters<typeof Icon>[0]["name"]; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", down); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={open ? "active" : ""} onClick={() => setOpen(!open)} title={title}>{icon && <Icon name={icon} size={16} />}{label}<Icon name="chevD" size={15} /></button>
      {open && <div className="menu-pop">{children}</div>}
    </div>
  );
}

/** Chỗ trống ở thanh tiêu đề trang (Shell cung cấp) — tab dùng <HeaderExtra> để đưa thông tin (vd điểm) lên đó. */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

export function HeaderExtra({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlotContext);
  return slot ? createPortal(children, slot) : null;
}
