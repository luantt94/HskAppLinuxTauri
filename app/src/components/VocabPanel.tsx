// Panel phải "Từ vựng": chọn nguồn từ (cấp HSK / phần / khoá học / cụm từ / bộ tự tạo)
// áp dụng cho mọi tab — port của ui/vocab_tab.py.
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { LEVEL_LABELS, LEVEL_ORDER, LEVELS, levelParts, loadCollocations, loadCourses, parseWordsJson } from "../lib/data";
import { useVocab, type Source } from "../lib/vocabStore";
import Icon from "./Icon";

const same = (a: Source, b: Source) => JSON.stringify(a) === JSON.stringify(b);

export default function VocabPanel({ known, onChanged }: { known: Set<string>; onChanged: () => void }) {
  const { items, source, label, setSource, customSets, saveCustomSet, deleteCustomSet } = useVocab();
  const [openLevel, setOpenLevel] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [topicFilter, setTopicFilter] = useState("");
  const [colloc, setColloc] = useState<Record<string, Record<string, unknown>>>({});
  const [collocLevel, setCollocLevel] = useState("hsk1");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [newName, setNewName] = useState("");
  const [newJson, setNewJson] = useState("");

  useEffect(() => { loadCourses().then((c) => setTopics(Object.keys(c))); }, []);
  useEffect(() => { loadCollocations().then(setColloc); }, []);

  const got = (words: { zh: string }[]) => words.filter((w) => known.has(w.zh)).length;
  const frac = (words: { zh: string }[]) => `${got(words)}/${words.length}`; // số từ đã thuộc / tổng số từ
  const cur = items.length ? Math.round((got(items) / items.length) * 100) : 0; // chỉ dùng cho độ dài thanh tiến độ
  const shownTopics = useMemo(() => topics.filter((t) => t.toLowerCase().includes(topicFilter.trim().toLowerCase())), [topics, topicFilter]);

  const Radio = ({ src, text, extra }: { src: Source; text: string; extra?: string }) => {
    const on = same(source, src);
    return (
      <label className={`radio ${on ? "on" : ""}`}>
        <input type="radio" checked={on} onChange={() => setSource(src)} />
        <span className="grow" title={text}>{text}</span>
        {extra && <span className="muted">{extra}</span>}
      </label>
    );
  };

  async function addToSrs() {
    const n = await api.srsAddWords(items);
    setMsg({ t: `Đã thêm ${n} từ mới vào Ôn tập (${items.length - n} từ đã có sẵn).`, ok: true });
    onChanged();
  }

  async function createSet() {
    try {
      const words = parseWordsJson(newJson);
      const name = newName.trim() || `Bộ ${customSets.length + 1}`;
      const path = await saveCustomSet(name, words);
      const saved = path.split(/[\\/]/).pop()!.replace(/\.json$/i, ""); // tên file thực (có thể thêm "(2)" nếu trùng)
      setSource({ kind: "custom", name: saved });
      setMsg({ t: `Đã lưu "${saved}" (${words.length} từ) vào thư mục BaiHoc.`, ok: true });
      setNewJson(""); setNewName("");
    } catch (e) {
      setMsg({ t: String(e instanceof Error ? e.message : e), ok: false });
    }
  }

  return (
    <div>
      <div className="now-learning">
        <div className="muted small">Đang học</div>
        <div className="name">{label}</div>
        <div className="meta">{frac(items)} từ đã thuộc</div>
        <div className="pbar"><div style={{ width: `${cur}%` }} /></div>
        <button style={{ marginTop: ".7rem", width: "100%" }} onClick={addToSrs}><Icon name="plus" size={16} />Thêm vào lịch ôn</button>
        {msg && <div className={msg.ok ? "ok small" : "err small"} style={{ marginTop: ".5rem" }}>{msg.t}</div>}
      </div>

      <h3>Nguồn từ vựng</h3>
      <details className="sec" open>
        <summary>Cấp HSK</summary>
        <div className="body">
          {LEVEL_ORDER.map((lv) => {
            const words = LEVELS[lv] ?? [];
            const parts = levelParts(lv);
            return (
              <div key={lv}>
                <div className="row" style={{ gap: 0, flexWrap: "nowrap" }}>
                  <div className="grow"><Radio src={{ kind: "levels", levels: [lv] }} text={LEVEL_LABELS[lv]} extra={frac(words)} /></div>
                  <button className="ghost icon" style={{ minHeight: "1.8rem", width: "1.8rem" }} title="Chia theo phần nhỏ" onClick={() => setOpenLevel(openLevel === lv ? null : lv)}>
                    <Icon name={openLevel === lv ? "chevL" : "chevR"} size={15} className={openLevel === lv ? "rot" : ""} />
                  </button>
                </div>
                {openLevel === lv && (
                  <div className="scroll-list" style={{ margin: ".2rem 0 .5rem .8rem" }}>
                    {parts.map((p, i) => <Radio key={i} src={{ kind: "part", level: lv, part: i + 1 }} text={`Phần ${i + 1}`} extra={frac(p)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>

      <details className="sec">
        <summary>Khoá học theo chủ đề <span className="pill">{topics.length}</span></summary>
        <div className="body">
          <input type="search" placeholder="Tìm chủ đề…" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} style={{ width: "100%", marginBottom: ".4rem" }} />
          <div className="scroll-list">{shownTopics.map((t) => <Radio key={t} src={{ kind: "course", topic: t }} text={t} />)}{!shownTopics.length && <div className="muted small" style={{ padding: ".5rem" }}>Không có chủ đề phù hợp.</div>}</div>
        </div>
      </details>

      <details className="sec">
        <summary>Cụm từ cố định</summary>
        <div className="body">
          <select value={collocLevel} onChange={(e) => setCollocLevel(e.target.value)} style={{ width: "100%", marginBottom: ".4rem" }}>
            {Object.keys(colloc).map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
          <div className="scroll-list">{Object.keys(colloc[collocLevel] ?? {}).map((t) => <Radio key={t} src={{ kind: "colloc", level: collocLevel, topic: t }} text={t} />)}</div>
        </div>
      </details>

      <details className="sec">
        <summary>Bộ từ của bạn <span className="pill">{customSets.length}</span></summary>
        <div className="body">
          {customSets.map((c) => (
            <div className="row" key={c.name} style={{ gap: 0, flexWrap: "nowrap" }}>
              <div className="grow"><Radio src={{ kind: "custom", name: c.name }} text={c.name} extra={`${c.count} từ`} /></div>
              <button className="ghost icon danger" style={{ minHeight: "1.8rem", width: "1.8rem" }} onClick={() => window.confirm(`Xoá bộ "${c.name}"? File sẽ bị xoá khỏi máy.`) && deleteCustomSet(c.path)} title="Xoá bộ này"><Icon name="trash" size={15} /></button>
            </div>
          ))}
          {!customSets.length && <div className="muted small" style={{ padding: ".3rem .5rem" }}>Chưa có bộ nào. Tạo bên dưới.</div>}
          <div className="stack" style={{ marginTop: ".6rem", gap: ".4rem" }}>
            <input placeholder="Tên bộ" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <textarea rows={4} placeholder='Dán JSON: [{"zh":"你好","vi":"xin chào","pinyin":"nǐ hǎo"}]' value={newJson} onChange={(e) => setNewJson(e.target.value)} />
            <button onClick={createSet} disabled={!newJson.trim()}><Icon name="plus" size={16} />Tạo bộ</button>
          </div>
        </div>
      </details>
    </div>
  );
}
