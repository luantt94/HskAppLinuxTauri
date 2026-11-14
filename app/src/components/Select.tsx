// Ô chọn (dropdown) tự vẽ — thay <select> gốc vì danh sách xổ xuống của <select> do hệ điều hành vẽ,
// không chỉnh giao diện được. Hỗ trợ: bấm ra ngoài / Esc để đóng, ↑ ↓ Enter để chọn bằng bàn phím.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";

export type SelectOption<T> = { value: T; label: ReactNode; hint?: ReactNode; group?: string };

export function Select<T extends string | number>({ value, options, onChange, disabled, title, className = "" }: {
  value: T; options: SelectOption<T>[]; onChange: (v: T) => void; disabled?: boolean; title?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); // mục đang được tô khi dùng phím mũi tên
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Danh sách tràn ra ngoài cửa sổ → căn theo mép phải ô chọn / mở lên trên
  const [flip, setFlip] = useState({ right: false, up: false });
  const cur = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!open) { setFlip({ right: false, up: false }); return; }
    const pop = popRef.current, box = ref.current;
    if (!pop || !box) return;
    const p = pop.getBoundingClientRect(), b = box.getBoundingClientRect();
    setFlip({
      right: p.right > window.innerWidth - 8 && b.right - p.width >= 8,
      up: p.bottom > window.innerHeight - 8 && b.top - p.height >= 8,
    });
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
      return;
    }
    // đang mở: chặn để phím không lọt ra phím tắt của tab (vd 1-4 chọn đáp án)
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (options[hi]) pick(options[hi].value); }
  }
  const pick = (v: T) => { onChange(v); setOpen(false); };

  let lastGroup: string | undefined;
  return (
    <div ref={ref} className={`sel ${open ? "open" : ""} ${className}`} onKeyDown={onKey}>
      <button type="button" className="sel-btn" disabled={disabled} title={title} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sel-val">{cur?.label ?? "—"}</span><Icon name="chevD" size={15} />
      </button>
      {open && (
        <div ref={popRef} className={`sel-pop ${flip.right ? "to-left" : ""} ${flip.up ? "to-up" : ""}`} role="listbox">
          {options.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={String(o.value)}>
                {head && <div className="sel-group">{head}</div>}
                <button type="button" role="option" aria-selected={o.value === value}
                  className={`sel-opt ${o.value === value ? "on" : ""} ${i === hi ? "hi" : ""}`}
                  onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}>
                  <span className="grow">{o.label}{o.hint && <small>{o.hint}</small>}</span>
                  {o.value === value && <Icon name="check" size={15} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
