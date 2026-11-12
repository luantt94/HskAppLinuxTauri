// Tab "📰 Bài đọc" — đoạn văn theo cấp HSK, rê chuột vào từ để xem pinyin + nghĩa. Port của games/game_reading.py.
// Tra từ theo thứ tự: từ vựng riêng của đoạn → tên nhân vật → từ điển HSK → pinyin tự sinh (Rust).
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { allWords } from "../lib/data";
import { usePersistent } from "../lib/storage";

type Vocab = { zh: string; pinyin: string; vi: string };
type Passage = { id: number; title_zh?: string; text: string; text_vi?: string; vocab?: Vocab[] };
type LevelData = { story_title?: string; story_intro_vi?: string; passages: Passage[] };

const FILES = import.meta.glob("../data/reading/*.json");
const LEVELS: [string, string][] = [["hsk1", "HSK 1"], ["hsk2", "HSK 2"], ["hsk3", "HSK 3"], ["hsk4", "HSK 4"], ["hsk5", "HSK 5"], ["hsk6", "HSK 6"]];
const CHARACTERS: Record<string, [string, string]> = {
  李明: ["Lǐ Míng", "Lý Minh (nhân vật chính của câu chuyện)"], 小红: ["Xiǎohóng", "Tiểu Hồng (bạn thân, người Trung Quốc)"],
  大卫: ["Dàwèi", "David (bạn, người Mỹ)"], 玛丽: ["Mǎlì", "Mary (bạn, người Pháp)"], 王老师: ["Wáng lǎoshī", "cô/thầy giáo họ Vương"],
  陈小雨: ["Chén Xiǎoyǔ", "Trần Tiểu Vũ (đồng nghiệp, sau là vợ Lý Minh)"], 小雨: ["Xiǎoyǔ", "Tiểu Vũ (gọi tắt của Trần Tiểu Vũ)"],
};
const hasCjk = (s: string) => /[一-鿿]/.test(s);

export default function ReadingTab() {
  const [level, setLevel] = usePersistent("reading.level", "hsk1");
  const [showPy, setShowPy] = usePersistent("reading.pinyin", false);
  const [showVi, setShowVi] = usePersistent("reading.vi", true);
  const [showVocab, setShowVocab] = usePersistent("reading.vocab", true);
  const [data, setData] = useState<LevelData | null>(null);
  const [tokens, setTokens] = useState<[string, string][][]>([]);
  const [playing, setPlaying] = useState(false);
  const run = useRef(0);
  const lexicon = useMemo(() => {
    const m = new Map<string, [string, string]>();
    for (const w of allWords()) if (w.zh && !m.has(w.zh)) m.set(w.zh, [w.pinyin, w.vi]);
    return m;
  }, []);

  useEffect(() => {
    run.current++; stopAudio(); setPlaying(false);
    const load = FILES[`../data/reading/${level}.json`];
    if (!load) { setData(null); return; }
    (async () => {
      const d = ((await load()) as { default: LevelData }).default;
      setData(d);
      setTokens(await Promise.all(d.passages.map((p) => api.segmentWithPinyin(p.text))));
    })();
  }, [level]);

  const lookup = (word: string, vocab: Map<string, [string, string]>, auto: string): [string, string] => {
    const hit = vocab.get(word) ?? CHARACTERS[word] ?? lexicon.get(word);
    return hit ? [hit[0] || auto, hit[1]] : [auto, ""]; // pinyin không bao giờ rỗng
  };

  async function readAll() {
    if (playing) { run.current++; stopAudio(); setPlaying(false); return; }
    const my = ++run.current;
    setPlaying(true);
    for (const p of data?.passages ?? []) { if (run.current !== my) return; await speak(cleanZh(p.text)); }
    if (run.current === my) setPlaying(false);
  }

  return (
    <div>
      <div className="row">
        <select value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label><input type="checkbox" checked={showPy} onChange={(e) => setShowPy(e.target.checked)} /> Pinyin</label>
        <label><input type="checkbox" checked={showVi} onChange={(e) => setShowVi(e.target.checked)} /> Nghĩa tiếng Việt</label>
        <label><input type="checkbox" checked={showVocab} onChange={(e) => setShowVocab(e.target.checked)} /> Từ vựng</label>
        <span className="grow" />
        <button onClick={readAll}>{playing ? "Dừng" : "Đọc cả bài"}</button>
      </div>
      {!data ? <p className="muted">Chưa có dữ liệu đoạn văn cho cấp này.</p> : (
        <>
          <div className="card" style={{ margin: "10px 0" }}><b>{data.story_title}</b><div className="muted">{data.story_intro_vi}</div></div>
          {data.passages.map((p, i) => {
            const vocab = new Map((p.vocab ?? []).map((v) => [v.zh, [v.pinyin, v.vi] as [string, string]]));
            const toks = tokens[i] ?? [[p.text, ""]];
            const pinyinLine = toks.map(([t, py]) => (hasCjk(t) ? " " + lookup(t, vocab, py.replace(/ /g, ""))[0] : t)).join("").trim();
            return (
              <div key={p.id ?? i} style={{ margin: "14px 0" }}>
                <p className="hanzi" style={{ fontSize: "1.4rem", lineHeight: 1.7, margin: 0 }}>
                  {toks.map(([t, py], k) => {
                    if (t === "\n") return <br key={k} />;
                    if (!hasCjk(t)) return <Fragment key={k}>{t}</Fragment>;
                    const [pinyin, vi] = lookup(t, vocab, py.replace(/ /g, ""));
                    return <span key={k} title={vi ? `${pinyin}\n${vi}` : pinyin} style={{ borderBottom: "1px dotted #94a3b8", background: vocab.has(t) ? "#fef9c3" : undefined }}>{t}</span>;
                  })}
                </p>
                {showPy && <p style={{ color: "#7c3aed", fontStyle: "italic", margin: "4px 0" }}>{pinyinLine}</p>}
                {showVi && p.text_vi && <p style={{ color: "#047857", margin: "4px 0" }}>{p.text_vi}</p>}
                {showVocab && !!p.vocab?.length && (
                  <p style={{ fontSize: ".9rem" }}>📚 <i>Từ vựng:</i><br />
                    {p.vocab.map((v) => <span key={v.zh}><b style={{ color: "#1d4ed8" }}>{v.zh}</b> <span style={{ color: "#7c3aed" }}>[{v.pinyin}]</span> <span style={{ color: "#047857" }}>— {v.vi}</span><br /></span>)}
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
