// Hộp "Bộ từ vựng": chọn nguồn từ (cấp HSK / phần / khoá học / cụm từ / bộ tự tạo) áp dụng cho mọi tab.
// Bố cục ngang: danh mục bên trái, lựa chọn dạng lưới bên phải (chỉ khung bên phải cuộn) — port của ui/vocab_tab.py.
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { LEVEL_LABELS, LEVEL_ORDER, LEVELS, levelParts, loadCollocations, loadCourses, parseWordsJson } from "../lib/data";
import type { Word } from "../lib/types";
import { useVocab, type Source } from "../lib/vocabStore";
import Icon from "./Icon";
import Modal from "./Modal";

const same = (a: Source, b: Source) => JSON.stringify(a) === JSON.stringify(b);
const RANGE = 50; // số ô "phần" mỗi trang — HSK6 có hơn 200 phần nên chia trang thay vì cuộn dài
type Cat = "hsk" | "course" | "colloc" | "custom";
const MAX_HITS = 24; // tối đa số kết quả hiện mỗi nhóm khi tìm
/** Bỏ dấu tiếng Việt / dấu thanh pinyin để tìm không cần gõ dấu ("gia dinh", "baba"). */
const fold = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
const catOf = (s: Source): Cat => (s.kind === "levels" || s.kind === "part" ? "hsk" : s.kind);

export default function VocabPanel({ known, onChanged, onClose }: { known: Set<string>; onChanged: () => void; onClose: () => void }) {
  const { items, source, label, setSource, customSets, saveCustomSet, deleteCustomSet } = useVocab();
  /** Chọn bộ — hộp vẫn mở; dòng "Đang học" phía trên cập nhật ngay. */
  const pick = (src: Source) => { setSource(src); setMsg(null); };
  const [cat, setCat] = useState<Cat>(() => catOf(source));
  // cấp đang xem phần nhỏ — mặc định là cấp đang học
  const [partsLevel, setPartsLevelState] = useState(() => (source.kind === "part" ? source.level : source.kind === "levels" ? source.levels[0] : LEVEL_ORDER[0]));
  const [range, setRange] = useState(() => (source.kind === "part" ? Math.floor((source.part - 1) / RANGE) : 0));
  const setPartsLevel = (lv: string) => { setPartsLevelState(lv); setRange(source.kind === "part" && source.level === lv ? Math.floor((source.part - 1) / RANGE) : 0); };
  const [courses, setCourses] = useState<Record<string, Word[]>>({});
  const [query, setQuery] = useState("");
  const [colloc, setColloc] = useState<Record<string, Record<string, Word[]>>>({});
  const [collocLevel, setCollocLevel] = useState(source.kind === "colloc" ? source.level : "hsk1");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [newName, setNewName] = useState("");
  const [newJson, setNewJson] = useState("");

  useEffect(() => { loadCourses().then(setCourses); }, []);
  useEffect(() => { loadCollocations().then(setColloc); }, []);

  const got = (words: { zh: string }[]) => words.filter((w) => known.has(w.zh)).length;
  const frac = (words: { zh: string }[]) => `${got(words)}/${words.length}`; // số từ đã thuộc / tổng số từ
  const pct = (words: { zh: string }[]) => (words.length ? Math.round((got(words) / words.length) * 100) : 0);
  const topics = useMemo(() => Object.keys(courses), [courses]);

  // Tìm chung mọi mục: theo tên bộ, hoặc theo từ bên trong (chữ Hán / pinyin / nghĩa, không cần dấu)
  const results = useMemo(() => {
    const raw = query.trim();
    if (!raw) return null;
    const fq = fold(raw), fqp = fq.replace(/\s+/g, "");
    const byWord = /[\u3400-\u9fff]/.test(raw) || fq.length >= 2; // 1 chữ cái Latin khớp quá nhiều từ
    const hit = (w: Word) => byWord && (w.zh.includes(raw) || fold(w.vi).includes(fq) || fold(w.pinyin).replace(/\s+/g, "").includes(fqp));
    const named = (s: string) => fold(s).includes(fq);
    const out = {
      course: Object.entries(courses).filter(([t, ws]) => named(t) || ws.some(hit)).map(([t, ws]) => ({ src: { kind: "course", topic: t } as Source, text: t, words: ws })),
      colloc: Object.entries(colloc).flatMap(([lv, groups]) => Object.entries(groups).filter(([t, ws]) => named(t) || ws.some(hit))
        .map(([t, ws]) => ({ src: { kind: "colloc", level: lv, topic: t } as Source, text: `${t} · ${lv.toUpperCase()}`, words: ws }))),
      parts: byWord ? LEVEL_ORDER.flatMap((lv) => levelParts(lv).flatMap((p, i) => (p.some(hit) ? [{ src: { kind: "part", level: lv, part: i + 1 } as Source, text: `${LEVEL_LABELS[lv]} · Phần ${i + 1}`, words: p }] : []))) : [],
      custom: customSets.filter((c) => named(c.name)),
    };
    return { ...out, total: out.course.length + out.colloc.length + out.parts.length + out.custom.length };
  }, [query, courses, colloc, customSets]);
  const parts = useMemo(() => levelParts(partsLevel), [partsLevel]);

  /** Ô chọn trong lưới (chủ đề / cụm từ / bộ riêng): tên + số đã thuộc, màu theo tiến độ như ô "phần". */
  const Tile = ({ src, text, words, count }: { src: Source; text: string; words?: Word[]; count?: number }) => {
    const n = words?.length ?? count ?? 0;
    const g = words ? got(words) : 0;
    const first = words?.length ? `\n${words.slice(0, 5).map((w) => w.zh).join(", ")}${n > 5 ? "…" : ""}` : "";
    return (
      <button className={`vp-tile ${same(source, src) ? "on" : ""} ${words && n && g === n ? "done" : ""}`} onClick={() => pick(src)}
        title={`${text} · ${words ? `${g}/${n} đã thuộc` : `${n} từ`}${first}`}>
        <span className="t">{text}</span><span className="x">{words ? `${g}/${n}` : `${n} từ`}</span>
        {g > 0 && g < n && <i style={{ width: `${pct(words!)}%` }} />}
      </button>
    );
  };
  // Chú thích màu — đặt cố định dưới cột danh mục, dùng chung cho mọi mục
  const legend = (
    <div className="vp-legend muted small">
      <b>Màu tiến độ</b>
      <span><i className="sw" /> chưa thuộc</span><span><i className="sw sw-some" /> đang học</span><span><i className="sw sw-done" /> thuộc hết</span><span><i className="sw sw-on" /> đang chọn</span>
    </div>
  );

  async function addToSrs() {
    const n = await api.srsAddWords(items);
    setMsg({ t: `Đã thêm ${n} từ mới vào lịch ôn (${items.length - n} từ đã có sẵn).`, ok: true });
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

  const CATS: [Cat, string, number | null][] = [
    ["hsk", "Cấp HSK", null],
    ["course", "Chủ đề", topics.length],
    ["colloc", "Cụm từ cố định", null],
    ["custom", "Bộ từ của bạn", customSets.length],
  ];

  // Ô tìm kiếm nằm trên thanh tiêu đề hộp — tìm chung mọi danh mục
  const search = (
    <div className="vp-search">
      <Icon name="search" size={16} />
      <input type="search" placeholder="Tìm bộ hoặc từ (chữ Hán, pinyin, nghĩa)…" value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); } }}
        title="Tìm theo tên chủ đề / cụm từ / bộ, hoặc theo từ bên trong (chữ Hán, pinyin, nghĩa — không cần gõ dấu)" />
    </div>
  );

  return (
    <Modal title="Bộ từ vựng" width={1040} onClose={onClose} headerExtra={search}>
    <div className="vp">
      {/* Bộ đang học + thêm vào lịch ôn — một dòng */}
      <div className="vp-now">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="muted small">Đang học</div>
          <div className="row" style={{ gap: ".7rem", flexWrap: "nowrap" }}>
            <b className="vp-name" title={label}>{label}</b>
            <span className="muted small" style={{ whiteSpace: "nowrap" }}>{frac(items)} đã thuộc</span>
            <div className="pbar grow" style={{ maxWidth: "10rem" }}><div style={{ width: `${pct(items)}%` }} /></div>
          </div>
        </div>
        <button onClick={addToSrs} title="Đưa các từ chưa có vào lịch ôn tập (SRS)"><Icon name="plus" size={16} />Thêm vào lịch ôn</button>
      </div>
      {msg && <div className={msg.ok ? "ok small" : "err small"} style={{ margin: "-.3rem 0 .5rem" }}>{msg.t}</div>}

      <div className="vp-body">
        <nav className="vp-cats">
          {CATS.map(([id, text, n]) => (
            <button key={id} className={cat === id && !results ? "active" : ""} onClick={() => { setCat(id); setQuery(""); }}>
              <span className="grow">{text}</span>{n !== null && <span className="pill">{n}</span>}
              {catOf(source) === id && <span className="dot" title="Bộ đang học thuộc mục này" />}
            </button>
          ))}
          {legend}
        </nav>

        <div className="vp-pane">
          {results && (
            <>
              <div className="vp-sub" style={{ marginTop: 0 }}>
                <span>Kết quả cho “{query.trim()}”</span><span className="muted small" style={{ fontWeight: 400 }}>{results.total} bộ · Esc để xoá</span>
              </div>
              {!results.total && <div className="muted small">Không tìm thấy. Thử gõ chữ Hán, pinyin (vd "baba") hoặc nghĩa tiếng Việt.</div>}
              {([["Chủ đề", results.course], ["Cụm từ cố định", results.colloc], ["Phần HSK có từ này", results.parts]] as const).map(([title, list]) => list.length > 0 && (
                <div key={title} className="vp-hits">
                  <h3>{title} <span className="pill">{list.length}</span></h3>
                  <div className="vp-grid">{list.slice(0, MAX_HITS).map((r) => <Tile key={r.text} src={r.src} text={r.text} words={r.words} />)}</div>
                  {list.length > MAX_HITS && <div className="muted small" style={{ marginTop: ".3rem" }}>…và {list.length - MAX_HITS} kết quả nữa — gõ cụ thể hơn để thu hẹp.</div>}
                </div>
              ))}
              {results.custom.length > 0 && (
                <div className="vp-hits">
                  <h3>Bộ từ của bạn <span className="pill">{results.custom.length}</span></h3>
                  <div className="vp-grid">{results.custom.map((c) => <Tile key={c.name} src={{ kind: "custom", name: c.name }} text={c.name} count={c.count} />)}</div>
                </div>
              )}
            </>
          )}
          {!results && cat === "hsk" && (
            <>
              <div className="vp-sub" style={{ marginTop: 0 }}><span>Học cả cấp</span></div>
              <div className="vp-grid lv">
                {LEVEL_ORDER.map((lv) => {
                  const words = LEVELS[lv] ?? [];
                  const on = same(source, { kind: "levels", levels: [lv] });
                  return (
                    <button key={lv} className={`vp-level ${on ? "on" : ""}`} onClick={() => pick({ kind: "levels", levels: [lv] })} title={`${frac(words)} từ đã thuộc`}>
                      <b>{LEVEL_LABELS[lv]}</b>
                      <span className="muted small">{frac(words)}</span>
                      <div className="pbar"><div style={{ width: `${pct(words)}%` }} /></div>
                    </button>
                  );
                })}
              </div>

              <div className="vp-sub">
                <span>Hoặc học từng phần nhỏ</span>
                <span className="muted small" style={{ fontWeight: 400 }}>{parts[0]?.length ?? 0} từ / phần · rê chuột vào ô để xem từ</span>
              </div>
              <div className="row" style={{ gap: ".6rem", marginBottom: ".6rem" }}>
                <div className="tabs seg">
                  {LEVEL_ORDER.map((lv) => <button key={lv} className={partsLevel === lv ? "active" : ""} onClick={() => setPartsLevel(lv)}>{LEVEL_LABELS[lv]}</button>)}
                </div>
                {parts.length > RANGE && (
                  <div className="tabs seg">
                    {Array.from({ length: Math.ceil(parts.length / RANGE) }, (_, r) => (
                      <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>{r * RANGE + 1}–{Math.min(parts.length, (r + 1) * RANGE)}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="vp-parts">
                {parts.slice(range * RANGE, (range + 1) * RANGE).map((p, k) => {
                  const n = range * RANGE + k + 1;
                  const src: Source = { kind: "part", level: partsLevel, part: n };
                  const g = got(p);
                  return (
                    <button key={n} className={`vp-part ${same(source, src) ? "on" : ""} ${p.length && g === p.length ? "done" : ""}`}
                      title={`Phần ${n} · ${g}/${p.length} đã thuộc\n${p.slice(0, 5).map((w) => w.zh).join(", ")}${p.length > 5 ? "…" : ""}`}
                      onClick={() => pick(src)}>
                      {n}
                      {g > 0 && g < p.length && <i style={{ width: `${pct(p)}%` }} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!results && cat === "course" && (
            <>
              <div className="vp-grid">{topics.map((t) => <Tile key={t} src={{ kind: "course", topic: t }} text={t} words={courses[t]} />)}</div>
            </>
          )}

          {!results && cat === "colloc" && (
            <>
              <div className="tabs seg" style={{ marginBottom: ".7rem" }}>
                {Object.keys(colloc).map((l) => <button key={l} className={collocLevel === l ? "active" : ""} onClick={() => setCollocLevel(l)}>{l.toUpperCase()}</button>)}
              </div>
              <div className="vp-grid">{Object.entries(colloc[collocLevel] ?? {}).map(([t, w]) => <Tile key={t} src={{ kind: "colloc", level: collocLevel, topic: t }} text={t} words={w} />)}</div>
            </>
          )}

          {!results && cat === "custom" && (
            <>
              {customSets.length ? (
                <div className="vp-grid">
                  {customSets.map((c) => (
                    <div key={c.name} className="vp-custom">
                      <Tile src={{ kind: "custom", name: c.name }} text={c.name} count={c.count} />
                      <button className="ghost icon danger" onClick={() => window.confirm(`Xoá bộ "${c.name}"? File sẽ bị xoá khỏi máy.`) && deleteCustomSet(c.path)} title="Xoá bộ này"><Icon name="trash" size={15} /></button>
                    </div>
                  ))}
                </div>
              ) : <div className="muted small">Chưa có bộ nào. Tạo bên dưới.</div>}
              <details className="vp-create" open={!customSets.length}>
                <summary><Icon name="plus" size={15} />Tạo bộ mới</summary>
                <input placeholder="Tên bộ" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <textarea rows={3} placeholder='Dán JSON: [{"zh":"你好","vi":"xin chào","pinyin":"nǐ hǎo"}]' value={newJson} onChange={(e) => setNewJson(e.target.value)} />
                <div><button className="primary" onClick={createSet} disabled={!newJson.trim()}><Icon name="plus" size={16} />Tạo bộ</button></div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
    </Modal>
  );
}
