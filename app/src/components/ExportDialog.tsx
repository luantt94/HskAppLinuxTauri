// Hộp thoại "Xuất Flashcard": chọn định dạng (PDF / Video / Anki) và phạm vi từ (tất cả / đã thuộc / chưa thuộc).
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { runExport } from "../lib/exporter";
import type { Word } from "../lib/types";
import Icon from "./Icon";
import Modal from "./Modal";

type Fmt = "pdf" | "video" | "anki";
type Scope = "all" | "known" | "unknown";

const FORMATS: { k: Fmt; icon: Parameters<typeof Icon>[0]["name"]; title: string; desc: string }[] = [
  { k: "pdf", icon: "file", title: "PDF", desc: "Lưới thẻ in được" },
  { k: "video", icon: "play", title: "Video", desc: "Có giọng đọc từng từ" },
  { k: "anki", icon: "layers", title: "Anki", desc: "File .apkg, có âm thanh" },
];
const SCOPES: { k: Scope; label: string }[] = [
  { k: "all", label: "Tất cả" },
  { k: "known", label: "Đã thuộc" },
  { k: "unknown", label: "Chưa thuộc" },
];

export default function ExportDialog({ words, known, onClose }: { words: Word[]; known: Set<string>; onClose: () => void }) {
  const [fmt, setFmt] = useState<Record<Fmt, boolean>>({ pdf: true, video: false, anki: false });
  const [scope, setScope] = useState<Scope>("all");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ label: "", cur: 0, total: 1 });
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const cancel = useRef(false);

  const byScope = (s: Scope) => (s === "all" ? words : words.filter((w) => known.has(w.zh) === (s === "known")));
  const selected = byScope(scope);
  const scopeLabel = { all: "Tất cả từ vựng", known: "Từ đã thuộc", unknown: "Từ chưa thuộc" }[scope];
  const anyFmt = fmt.pdf || fmt.video || fmt.anki;

  // Đang xuất thì không cho đóng (phải bấm "Huỷ xuất" trước).
  const close = () => { if (!busy) onClose(); };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  async function go() {
    if (!anyFmt) return setMsg({ t: "Hãy chọn ít nhất 1 định dạng xuất.", ok: false });
    if (!selected.length) return setMsg({ t: "Không có từ nào trong phạm vi đã chọn.", ok: false });
    cancel.current = false; setBusy(true); setMsg(null);
    try {
      const files = await runExport(fmt, selected, scopeLabel, (label, cur, total) => setProg({ label, cur, total }), () => cancel.current);
      setMsg(cancel.current ? { t: "Đã huỷ.", ok: false } : files.length ? { t: `Đã xuất ${selected.length} từ:\n${files.join("\n")}`, ok: true } : { t: "Chưa lưu file nào.", ok: false });
    } catch (e) { setMsg({ t: `Lỗi khi xuất: ${e}`, ok: false }); }
    setBusy(false);
  }

  const stop = () => { cancel.current = true; invoke("export_cancel"); };

  const footer = (
    <>
      <span className="muted grow">Sẽ xuất <b className="stat" style={{ color: "var(--text)" }}>{selected.length}</b> từ</span>
      {busy ? <button onClick={stop}>Huỷ xuất</button> : (
        <>
          <button onClick={onClose}>Đóng</button>
          <button className="primary" onClick={go} disabled={!anyFmt || !selected.length}><Icon name="download" size={15} />Xuất</button>
        </>
      )}
    </>
  );

  return (
    <Modal title="Xuất flashcard" onClose={close} width={500} footer={footer}>
      <div className="exp">
        <div className="menu-head">Định dạng</div>
        <div className="exp-fmts">
          {FORMATS.map((f) => (
            <label key={f.k} className={`exp-fmt ${fmt[f.k] ? "on" : ""} ${busy ? "off" : ""}`}>
              <input type="checkbox" checked={fmt[f.k]} disabled={busy} onChange={(e) => setFmt({ ...fmt, [f.k]: e.target.checked })} />
              <span className="exp-ico"><Icon name={f.icon} size={18} /></span>
              <b>{f.title}</b>
              <small>{f.desc}</small>
            </label>
          ))}
        </div>

        <div className="menu-head">Phạm vi từ vựng</div>
        <div className="tabs seg exp-scope">
          {SCOPES.map((s) => (
            <button key={s.k} className={scope === s.k ? "active" : ""} disabled={busy} onClick={() => setScope(s.k)}>
              {s.label}<span className="cnt">{byScope(s.k).length}</span>
            </button>
          ))}
        </div>

        {busy && (
          <div className="exp-prog">
            <div className="pbar"><div style={{ width: `${(prog.cur / Math.max(1, prog.total)) * 100}%` }} /></div>
            <div className="muted small">{prog.label} ({prog.cur}/{prog.total})</div>
          </div>
        )}
        {msg && <div className={`exp-msg ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}
      </div>
    </Modal>
  );
}
