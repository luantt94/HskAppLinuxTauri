// Hộp thoại "Xuất Flashcard": chọn định dạng (PDF / Video / Anki) và phạm vi từ (tất cả / đã thuộc / chưa thuộc).
import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { runExport } from "../lib/exporter";
import type { Word } from "../lib/types";

export default function ExportDialog({ words, known, onClose }: { words: Word[]; known: Set<string>; onClose: () => void }) {
  const [fmt, setFmt] = useState({ pdf: true, video: false, anki: false });
  const [scope, setScope] = useState({ all: true, known: false, unknown: false });
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ label: "", cur: 0, total: 1 });
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const cancel = useRef(false);

  const pick = (key: "all" | "known" | "unknown", on: boolean) =>
    setScope(key === "all" ? { all: on, known: false, unknown: false } : { ...scope, all: false, [key]: on });

  const selected = scope.all ? words : words.filter((w) => (scope.known && known.has(w.zh)) || (scope.unknown && !known.has(w.zh)));
  const scopeLabel = scope.all ? "Tất cả từ vựng" : [scope.known && "Từ đã thuộc", scope.unknown && "Từ chưa thuộc"].filter(Boolean).join(" + ");

  async function go() {
    if (!(fmt.pdf || fmt.video || fmt.anki)) return setMsg({ t: "Hãy chọn ít nhất 1 định dạng xuất.", ok: false });
    if (!(scope.all || scope.known || scope.unknown)) return setMsg({ t: "Hãy chọn ít nhất 1 phạm vi từ vựng.", ok: false });
    if (!selected.length) return setMsg({ t: "Không có từ nào trong phạm vi đã chọn.", ok: false });
    cancel.current = false; setBusy(true); setMsg(null);
    try {
      const files = await runExport(fmt, selected, scopeLabel, (label, cur, total) => setProg({ label, cur, total }), () => cancel.current);
      setMsg(cancel.current ? { t: "Đã huỷ.", ok: false } : files.length ? { t: `Đã xuất ${selected.length} từ:\n${files.join("\n")}`, ok: true } : { t: "Chưa lưu file nào.", ok: false });
    } catch (e) { setMsg({ t: `Lỗi khi xuất: ${e}`, ok: false }); }
    setBusy(false);
  }

  const stop = () => { cancel.current = true; invoke("export_cancel"); };
  const C = (b: boolean, f: (v: boolean) => void, l: string) => <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={b} disabled={busy} onChange={(e) => f(e.target.checked)} /> {l}</label>;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 70 }}>
      <div className="card" style={{ width: 440 }}>
        <h2>📤 Xuất Flashcard</h2>
        <p className="muted">Chọn định dạng và phạm vi từ vựng cần xuất:</p>
        <h3>Định dạng xuất</h3>
        {C(fmt.pdf, (v) => setFmt({ ...fmt, pdf: v }), "📄 PDF (lưới thẻ in được)")}
        {C(fmt.video, (v) => setFmt({ ...fmt, video: v }), "🎬 Video (có giọng đọc từng từ)")}
        {C(fmt.anki, (v) => setFmt({ ...fmt, anki: v }), "🗂️ Anki (.apkg, có âm thanh)")}
        <h3>Phạm vi từ vựng</h3>
        {C(scope.all, (v) => pick("all", v), `Tất cả từ vựng (${words.length})`)}
        {C(scope.known, (v) => pick("known", v), "Từ đã thuộc")}
        {C(scope.unknown, (v) => pick("unknown", v), "Từ chưa thuộc")}
        {busy && (<><div className="pbar" style={{ margin: "10px 0 4px" }}><div style={{ width: `${(prog.cur / Math.max(1, prog.total)) * 100}%` }} /></div><div className="muted">{prog.label} ({prog.cur}/{prog.total})</div></>)}
        {msg && <p className={msg.ok ? "ok" : "err"} style={{ whiteSpace: "pre-wrap" }}>{msg.t}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          {busy ? <button onClick={stop}>Huỷ xuất</button> : <><button onClick={onClose}>Đóng</button><button className="primary" onClick={go}>Xuất</button></>}
        </div>
      </div>
    </div>
  );
}
