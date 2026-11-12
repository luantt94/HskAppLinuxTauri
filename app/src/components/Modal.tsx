import type { ReactNode } from "react";
import Icon from "./Icon";

export default function Modal({ title, onClose, children, width = 520, footer }: { title: string; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }}>
        <div className="modal-head"><h2>{title}</h2><button className="ghost icon" onClick={onClose} title="Đóng"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
