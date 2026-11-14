// Tab "📰 Bài đọc" — đoạn văn theo cấp HSK, rê chuột vào từ để xem pinyin + nghĩa. Port của games/game_reading.py.
// Tra từ theo thứ tự: từ vựng riêng của đoạn → tên nhân vật → từ điển HSK → pinyin tự sinh (Rust).
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { allWords } from "../lib/data";
import { usePersistent } from "../lib/storage";
import Icon from "../components/Icon";
import { OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { LevelChip, useFollowVocabLevel } from "../components/LevelChip";

type Vocab = { zh: string; pinyin: string; vi: string };
type Passage = { id: number; title_zh?: string; text: string; text_vi?: string; vocab?: Vocab[] };
type LevelData = { story_title?: string; story_intro_vi?: string; passages: Passage[] };

const FILES = import.meta.glob("../data/reading/*.json");
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
  useFollowVocabLevel("reading", (n) => setLevel(`hsk${n}`));
  const [tokens, setTokens] = useState<[string, string][][]>([]);
  const [playing, setPlaying] = useState(false);
  const [activeP, setActiveP] = useState(-1); // đoạn đang đọc (tô sáng)
  const run = useRef(0);
  const lexicon = useMemo(() => {
    const m = new Map<string, [string, string]>();
    for (const w of allWords()) if (w.zh && !m.has(w.zh)) m.set(w.zh, [w.pinyin, w.vi]);
    return m;
  }, []);

  useEffect(() => {
    run.current++; stopAudio(); setPlaying(false); setActiveP(-1);
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
    if (playing) { run.current++; stopAudio(); setPlaying(false); setActiveP(-1); return; }
    const my = ++run.current;
    setPlaying(true);
    const ps = data?.passages ?? [];
    for (let i = 0; i < ps.length; i++) {
      if (run.current !== my) return;
      setActiveP(i);
      document.getElementById(`rp-${i}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      await speak(cleanZh(ps[i].text));
    }
    if (run.current === my) { setPlaying(false); setActiveP(-1); }
  }
  async function readOne(i: number) {
    const my = ++run.current;
    setPlaying(false); setActiveP(i);
    await speak(cleanZh(data?.passages[i]?.text ?? ""));
    if (run.current === my) setActiveP(-1);
  }

  return (
    <div>
      <div className="row sticky-top">
        <LevelChip value={Number(level.replace("hsk", ""))} onChange={(n) => setLevel(`hsk${n}`)} unit="đoạn"
          counts={data ? { [Number(level.replace("hsk", ""))]: data.passages.length } : undefined} />
        <span className="grow" />
        <button className={playing ? "active" : "primary"} onClick={readAll}><Icon name={playing ? "pause" : "play"} size={15} />{playing ? "Dừng đọc" : "Đọc cả bài"}</button>
      </div>
      <TabOptions>
        <OptSection title="Hiển thị dưới mỗi đoạn">
          <OptSwitch checked={showPy} onChange={setShowPy} label="Pinyin" />
          <OptSwitch checked={showVi} onChange={setShowVi} label="Nghĩa tiếng Việt" />
          <OptSwitch checked={showVocab} onChange={setShowVocab} label="Từ vựng" />
        </OptSection>
        <OptSection title="Cách dùng">
          <span className="muted small">Rê chuột vào chữ để xem pinyin và nghĩa. Chữ tô vàng là từ vựng mới của đoạn — bấm thẻ từ vựng để nghe.</span>
        </OptSection>
      </TabOptions>
      {!data ? <p className="muted">Chưa có dữ liệu đoạn văn cho cấp này.</p> : (
        <>
          {/* Đầu truyện: tên, giới thiệu, số đoạn */}
          <header className="story-head">
            <div className="story-ico"><Icon name="bookOpen" size={22} /></div>
            <div className="grow">
              <h2>{data.story_title}</h2>
              {data.story_intro_vi && <p>{data.story_intro_vi}</p>}
            </div>
            <span className="pill">{data.passages.length} đoạn</span>
          </header>
          {data.passages.map((p, i) => {
            const vocab = new Map((p.vocab ?? []).map((v) => [v.zh, [v.pinyin, v.vi] as [string, string]]));
            const toks = tokens[i] ?? [[p.text, ""]];
            const pinyinLine = toks.map(([t, py]) => (hasCjk(t) ? " " + lookup(t, vocab, py.replace(/ /g, ""))[0] : t)).join("").trim();
            return (
              <div key={p.id ?? i} id={`rp-${i}`} className={`read-passage ${activeP === i ? "on" : ""}`}>
                <div className="rp-head">
                  <span className="rp-n">{i + 1}</span>
                  {p.title_zh && <span className="rp-title hanzi">{p.title_zh}</span>}
                  <span className="grow" />
                  <button className="ghost icon" onClick={() => (activeP === i ? (run.current++, stopAudio(), setActiveP(-1), setPlaying(false)) : readOne(i))} title={activeP === i ? "Dừng" : "Nghe đoạn này"}>
                    <Icon name={activeP === i ? "pause" : "volume"} size={17} />
                  </button>
                </div>
                <p className="hanzi rp-text">
                  {toks.map(([t, py], k) => {
                    if (t === "\n") return <br key={k} />;
                    if (!hasCjk(t)) return <Fragment key={k}>{t}</Fragment>;
                    const [pinyin, vi] = lookup(t, vocab, py.replace(/ /g, ""));
                    return <span key={k} className={`rw ${vocab.has(t) ? "key" : ""}`} data-py={pinyin} data-vi={vi || ""}>{t}</span>;
                  })}
                </p>
                {showPy && <p className="rp-py">{pinyinLine}</p>}
                {showVi && p.text_vi && <p className="rp-vi">{p.text_vi}</p>}
                {showVocab && !!p.vocab?.length && (
                  <div className="rp-vocab">
                    {p.vocab.map((v) => (
                      <button key={v.zh} className="vchip" onClick={() => speak(cleanZh(v.zh))} title="Nghe">
                        <b className="hanzi">{v.zh}</b><span className="py">{v.pinyin}</span><span className="vi">{v.vi}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
