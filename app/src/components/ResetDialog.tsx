// "Reset các bộ dữ liệu": chọn nhiều bộ để xoá HẲN tiến độ Ôn tập (SRS) của các từ trong đó. Port của ui/reset_data_dialog.py.
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { LEVEL_LABELS, LEVEL_ORDER, LEVELS, loadCollocations, loadCourses } from "../lib/data";
import Modal from "./Modal";
import Icon from "./Icon";

type Entry = { id: string; name: string; zh: string[] };
type Section = { title: string; empty?: string; entries: Entry[] };

export default function ResetDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const courses = await loadCourses();
      const colloc = await loadCollocations();
      const sets = await api.setsList();
      const mine: Entry[] = [];
      for (const s of sets) mine.push({ id: `set:${s.path}`, name: s.name, zh: (await api.setRead(s.path).catch(() => [])).map((w) => w.zh) });
      setSections([
        { title: "Cấp HSK", entries: LEVEL_ORDER.map((lv) => ({ id: `lv:${lv}`, name: LEVEL_LABELS[lv], zh: (LEVELS[lv] ?? []).map((w) => w.zh) })) },
        { title: "Chủ đề khoá học", entries: Object.entries(courses).map(([n, w]) => ({ id: `c:${n}`, name: n, zh: w.map((x) => x.zh) })) },
        { title: "Cụm từ theo cấp", entries: Object.entries(colloc).map(([lv, topics]) => ({ id: `cl:${lv}`, name: lv.toUpperCase(), zh: Object.values(topics).flat().map((x) => x.zh) })) },
        { title: "Bộ từ của bạn", empty: "Chưa có bộ nào.", entries: mine },
      ]);
    })();
  }, []);

  const all = sections.flatMap((s) => s.entries);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const count = [...new Set(all.filter((e) => picked.has(e.id)).flatMap((e) => e.zh))].length;

  async function reset() {
    if (!picked.size) return setMsg("Hãy chọn ít nhất 1 bộ.");
    if (!window.confirm(`Xoá HẲN tiến độ ôn tập của ${count} từ trong ${picked.size} bộ đã chọn? Không hoàn tác được.`)) return;
    const zh = [...new Set(all.filter((e) => picked.has(e.id)).flatMap((e) => e.zh))];
    const n = await api.srsResetWords(zh);
    setMsg(`Đã xoá tiến độ của ${n} từ.`);
    setPicked(new Set());
    onDone();
  }

  return (
    <Modal title="Reset các bộ dữ liệu" onClose={onClose} width={540}
      footer={<><span className={msg.startsWith("Đã") ? "ok" : "muted"} style={{ marginRight: "auto" }}>{msg || (picked.size ? `${picked.size} bộ · ${count} từ` : "")}</span>
        <button onClick={onClose}>Đóng</button><button className="danger" onClick={reset}><Icon name="trash" size={16} />Reset đã chọn</button></>}>
      <p className="muted small">Chọn các bộ muốn xoá tiến độ Ôn tập (SRS) — từ sẽ coi như CHƯA từng học. Không ảnh hưởng các bộ không chọn.</p>
      <div className="row" style={{ margin: ".6rem 0" }}>
        <button onClick={() => setPicked(new Set(all.map((e) => e.id)))}>Chọn tất cả</button>
        <button onClick={() => setPicked(new Set())}>Bỏ chọn tất cả</button>
      </div>
      {sections.map((s) => (
        <div key={s.title}>
          <h3>{s.title}</h3>
          {!s.entries.length && <div className="muted small">{s.empty}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".1rem .8rem" }}>
            {s.entries.map((e) => (
              <label key={e.id} className="radio"><input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} /><span className="grow" title={e.name}>{e.name}</span><span className="muted">{e.zh.length}</span></label>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}
