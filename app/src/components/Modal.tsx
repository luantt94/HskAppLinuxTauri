import type { ReactNode } from "react";
import Icon from "./Icon";

/** Hộp thoại. `headerExtra` = nội dung thêm trên thanh tiêu đề (vd ô tìm kiếm), nằm cạnh nút đóng. */
export default function Modal({ title, onClose, children, width = 520, footer, headerExtra }: { title: string; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode; headerExtra?: ReactNode }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }}>
        <div className="modal-head"><h2>{title}</h2>{headerExtra && <div className="modal-head-extra">{headerExtra}</div>}<button className="ghost icon" onClick={onClose} title="Đóng"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
