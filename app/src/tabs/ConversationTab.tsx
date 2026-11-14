// Tab "💬 Hội thoại" — hội thoại theo chủ đề, nghe từng câu/cả đoạn (giọng nam/nữ theo nhân vật),
// "Luyện vai" che lời của 1 nhân vật để tự nói trước. Port của games/game_conversation.py.
import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { usePersistent } from "../lib/storage";
import { OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { Select } from "../components/Select";
import { LevelChip, useFollowVocabLevel } from "../components/LevelChip";

type Turn = { spk: number; zh: string; py: string; vi: string };
type Dialogue = { id: string; title_zh: string; title_vi: string; scene_vi: string; speakers: { name: string; gender: string }[]; turns: Turn[] };
type Topic = { id: number; zh: string; vi: string; icon: string; dialogues: Dialogue[] };

const FILES = import.meta.glob("../data/conversations/*.json");
const VOICE_MALE = "zh-CN-YunxiNeural", VOICE_FEMALE = "zh-CN-XiaoxiaoNeural";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ConversationTab() {
  const [level, setLevel] = usePersistent("conv.level", "hsk1");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [query, setQuery] = useState(""); // lọc danh sách hội thoại
  useFollowVocabLevel("conv", (n) => setLevel(`hsk${n}`));
  useEffect(() => { setQuery(""); }, [level]);
  const [cur, setCur] = useState<Dialogue | null>(null);
  const [showPy, setShowPy] = usePersistent("conv.pinyin", true);
  const [showVi, setShowVi] = usePersistent("conv.vi", true);
  const [role, setRole] = useState(-1);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    run.current++; stopAudio(); setPlaying(false); setActive(-1);
    const load = FILES[`../data/conversations/${level}.json`];
    load?.().then((m) => { const t = (m as { default: { topics: Topic[] } }).default.topics; setTopics(t); setCur(t[0]?.dialogues[0] ?? null); });
  }, [level]);
  useEffect(() => { setRole(-1); setRevealed(new Set()); }, [cur]);
  useEffect(() => () => { run.current++; stopAudio(); }, []);

  const flat = topics.flatMap((t) => t.dialogues);
  const q = query.trim().toLowerCase();
  const shownTopics = topics
    .map((t) => ({ t, list: !q || `${t.zh} ${t.vi}`.toLowerCase().includes(q) ? t.dialogues : t.dialogues.filter((d) => `${d.title_zh} ${d.title_vi}`.toLowerCase().includes(q)) }))
    .filter((x) => x.list.length);
  const idx = cur ? flat.findIndex((d) => d.id === cur.id) : -1;
  const voiceFor = (t: Turn) => (cur?.speakers[t.spk]?.gender === "m" ? VOICE_MALE : VOICE_FEMALE);
  const covered = (t: Turn, i: number) => role >= 0 && t.spk === role && !revealed.has(i);

  async function playAll() {
    if (!cur) return;
    if (playing) { run.current++; stopAudio(); setPlaying(false); setActive(-1); return; }
    const my = ++run.current;
    setPlaying(true);
    for (let i = 0; i < cur.turns.length; i++) {
      if (run.current !== my) return;
      const t = cur.turns[i];
      setActive(i);
      if (covered(t, i)) await sleep(Math.max(4000, t.zh.length * 450)); // chừa thời gian tự nói
      else await speak(cleanZh(t.zh), voiceFor(t));
      setRevealed((r) => new Set(r).add(i));
      await sleep(400);
    }
    if (run.current === my) { setPlaying(false); setActive(-1); }
  }

  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      <TabOptions>
        <OptSection title="Hiển thị">
          <OptSwitch checked={showPy} onChange={setShowPy} label="Pinyin" />
          <OptSwitch checked={showVi} onChange={setShowVi} label="Nghĩa tiếng Việt" />
        </OptSection>
      </TabOptions>
      <aside className="side-list">
        <LevelChip value={Number(level.replace("hsk", ""))} onChange={(n) => setLevel(`hsk${n}`)} unit="hội thoại"
          counts={topics.length ? { [Number(level.replace("hsk", ""))]: topics.reduce((a, t) => a + t.dialogues.length, 0) } : undefined} />
        <div className="side-card">
          <div className="side-search">
            <Icon name="search" size={15} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Tìm trong ${flat.length} hội thoại…`} />
          </div>
          <div className="side-items">
          {/* Lọc theo tên (Hán / Việt) hoặc tên chủ đề; chủ đề không còn bài nào thì ẩn */}
          {shownTopics.map(({ t, list }) => (
            <div key={t.id} className="side-group">
              <div className="side-head">{t.icon} {t.vi}</div>
              {list.map((d) => (
                <button key={d.id} className={cur?.id === d.id ? "active" : ""} onClick={() => { run.current++; stopAudio(); setPlaying(false); setActive(-1); setCur(d); }}>
                  <span className="t"><span className="hanzi">{d.title_zh}</span><small>{d.title_vi}</small></span>
                </button>
              ))}
            </div>
          ))}
          {q && !shownTopics.length && <p className="muted small side-none">Không tìm thấy “{query}”.</p>}
          </div>
        </div>
      </aside>
      <div className="grow" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        {!cur ? <p className="muted">Chọn một hội thoại ở cột bên trái</p> : (
          <>
            {/* Đầu hội thoại: tên + bối cảnh + nhân vật; chuyển bài hai bên */}
            <header className="conv-head">
              <button className="icon round flash-nav" disabled={idx <= 0} onClick={() => setCur(flat[idx - 1])} title="Hội thoại trước"><Icon name="chevL" size={18} /></button>
              <div className="grow conv-title">
                <h2><span className="hanzi">{cur.title_zh}</span> <span className="vi">{cur.title_vi}</span></h2>
                <p className="muted">{cur.scene_vi}</p>
                <div className="conv-cast">
                  {cur.speakers.map((sp, k) => <span key={k} className={`cast c${k % 3}`}><i>{[...sp.name].slice(-1)}</i>{sp.name}</span>)}
                </div>
              </div>
              <button className="icon round flash-nav" disabled={idx >= flat.length - 1} onClick={() => setCur(flat[idx + 1])} title="Hội thoại sau"><Icon name="chevR" size={18} /></button>
            </header>
            <div className="conv-bar">
              <button className={playing ? "active" : "primary"} onClick={playAll}><Icon name={playing ? "pause" : "play"} size={15} />{playing ? "Dừng" : "Nghe cả đoạn"}</button>
              <span className="muted small">{idx + 1} / {flat.length}</span>
              <span className="grow" />
              <span className="muted">Luyện vai</span>
              <Select value={role} onChange={(v) => { setRole(v); setRevealed(new Set()); }}
                options={[{ value: -1, label: "Không", hint: "Chỉ nghe cả đoạn" }, ...cur.speakers.map((s, i) => ({ value: i, label: `Tôi là ${s.name}`, hint: "Câu của vai này bị che để tự nói" }))]} />
            </div>
            {/* Lời thoại dạng tin nhắn: người 1 bên trái, người 2 bên phải */}
            <div className="chat">
              {cur.turns.map((t, i) => {
                const c = t.spk % 3, hide = covered(t, i), right = t.spk % 2 === 1;
                const sp = cur.speakers[t.spk]?.name ?? "";
                return (
                  <div key={i} className={`msg c${c} ${right ? "right" : ""} ${active === i ? "on" : ""} ${hide ? "hide" : ""}`}>
                    <span className="avatar" title={sp}>{[...sp].slice(-1)}</span>
                    <div className="bubble">
                      <div className="who">{sp}{role === t.spk && <span className="me">bạn</span>}</div>
                      {hide ? (
                        <div className="your-turn">Đến lượt bạn nói… <button onClick={() => setRevealed((r) => new Set(r).add(i))}>Hiện câu</button></div>
                      ) : (
                        <>
                          <div className="hanzi zh">{t.zh}</div>
                          {showPy && <div className="py">{t.py}</div>}
                          {showVi && <div className="vi">{t.vi}</div>}
                        </>
                      )}
                    </div>
                    <button className="ghost icon say" onClick={() => { run.current++; setPlaying(false); speak(cleanZh(t.zh), voiceFor(t)); }} title="Nghe câu này"><Icon name="volume" size={16} /></button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
