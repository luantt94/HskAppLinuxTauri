// Tab "💬 Hội thoại" — hội thoại theo chủ đề, nghe từng câu/cả đoạn (giọng nam/nữ theo nhân vật),
// "Luyện vai" che lời của 1 nhân vật để tự nói trước. Port của games/game_conversation.py.
import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { cleanZh, speak, stopAudio } from "../lib/audio";
import { usePersistent } from "../lib/storage";

type Turn = { spk: number; zh: string; py: string; vi: string };
type Dialogue = { id: string; title_zh: string; title_vi: string; scene_vi: string; speakers: { name: string; gender: string }[]; turns: Turn[] };
type Topic = { id: number; zh: string; vi: string; icon: string; dialogues: Dialogue[] };

const FILES = import.meta.glob("../data/conversations/*.json");
const LEVELS: [string, string][] = [["hsk1", "HSK 1"], ["hsk2", "HSK 2"], ["hsk3", "HSK 3"], ["hsk4", "HSK 4"], ["hsk5", "HSK 5"], ["hsk6", "HSK 6"]];
const VOICE_MALE = "zh-CN-YunxiNeural", VOICE_FEMALE = "zh-CN-XiaoxiaoNeural";
const BG = ["#eff6ff", "#fdf2f8", "#ecfdf5"], BORDER = ["#bfdbfe", "#fbcfe8", "#a7f3d0"], SPK = ["#2563eb", "#db2777", "#059669"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ConversationTab() {
  const [level, setLevel] = usePersistent("conv.level", "hsk1");
  const [topics, setTopics] = useState<Topic[]>([]);
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
      <div style={{ width: 260, overflowY: "auto", flexShrink: 0 }}>
        <select value={level} onChange={(e) => setLevel(e.target.value)} style={{ width: "100%" }}>{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {topics.map((t) => (
          <div key={t.id}>
            <h3>{t.icon} {t.zh} — {t.vi}</h3>
            {t.dialogues.map((d) => (
              <button key={d.id} className={cur?.id === d.id ? "active" : ""} style={{ display: "block", width: "100%", textAlign: "left", margin: "2px 0", fontWeight: 500 }} onClick={() => { run.current++; stopAudio(); setPlaying(false); setActive(-1); setCur(d); }}>
                {d.title_zh} — {d.title_vi}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="grow" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        {!cur ? <p className="muted">Chọn một hội thoại ở cột bên trái</p> : (
          <>
            <div className="row">
              <button disabled={idx <= 0} onClick={() => setCur(flat[idx - 1])}><Icon name="chevL" size={16} /> Trước</button>
              <div className="grow" style={{ textAlign: "center" }}><b>{cur.title_zh} — {cur.title_vi}</b><div className="muted">📍 {cur.scene_vi}</div></div>
              <button disabled={idx >= flat.length - 1} onClick={() => setCur(flat[idx + 1])}>Sau <Icon name="chevR" size={16} /></button>
            </div>
            <div className="row" style={{ margin: "10px 0" }}>
              <button className="primary" onClick={playAll}>{playing ? "Dừng" : "Nghe cả đoạn"}</button>
              <label><input type="checkbox" checked={showPy} onChange={(e) => setShowPy(e.target.checked)} /> Pinyin</label>
              <label><input type="checkbox" checked={showVi} onChange={(e) => setShowVi(e.target.checked)} /> Nghĩa tiếng Việt</label>
              <span>🎭 Luyện vai:</span>
              <select value={role} onChange={(e) => { setRole(Number(e.target.value)); setRevealed(new Set()); }}>
                <option value={-1}>Không</option>{cur.speakers.map((s, i) => <option key={i} value={i}>Tôi là {s.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
            {cur.turns.map((t, i) => {
              const c = t.spk % 3, hide = covered(t, i);
              return (
                <div key={i} className="card" style={{ margin: "8px 0", background: active === i ? "#fef9c3" : BG[c], borderColor: active === i ? "#eab308" : BORDER[c], marginLeft: t.spk % 2 ? 40 : 0, marginRight: t.spk % 2 ? 0 : 40 }}>
                  <div className="row">
                    <b style={{ color: SPK[c] }}>{cur.speakers[t.spk]?.name}</b>
                    <button onClick={() => { run.current++; setPlaying(false); speak(cleanZh(t.zh), voiceFor(t)); }}><Icon name="volume" size={16} /></button>
                    {hide && <button onClick={() => setRevealed((r) => new Set(r).add(i))}>Hiện đáp án</button>}
                  </div>
                  {hide ? <div className="muted">🎭 Đến lượt bạn nói…</div> : (
                    <>
                      <div className="hanzi" style={{ fontSize: "1.3rem", color: "#1d4ed8" }}>{t.zh}</div>
                      {showPy && <div style={{ color: "#7c3aed" }}>{t.py}</div>}
                      {showVi && <div style={{ color: "#047857" }}>{t.vi}</div>}
                    </>
                  )}
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
