// Tab "📝 Giải đề" — luyện đề HSK từng câu (nghe/đọc/viết). Câu làm ĐÚNG được nhớ (không hiện lại), câu sai quay lại sau.
// Port của games/game_exam.py + games/exam_cards.py. Đề đọc từ thư mục người dùng chọn (.hskpack mã hoá hoặc thư mục thô).
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { api } from "../lib/api";
import { shuffle } from "../lib/data";
import { usePersistent } from "../lib/storage";

type Info = { level: number; name: string; title: string; path: string };
type Answer = { letter: string; kind: string; image: string | null; text: string | null; correct: boolean; pinyin?: string; vi?: string };
type Q = {
  num?: number; image?: string | null; mp3?: string | null; transcript?: string | null; stem?: string | null; type?: string;
  answers?: Answer[]; correct_letter?: string; stem_pinyin?: string; stem_vi?: string; transcript_pinyin?: string; transcript_vi?: string;
};
type Entry = { kind: "single" | "group"; question?: Q; questions?: Q[]; shared_image?: string; shared_text?: string; shared_text_pinyin?: string; shared_text_vi?: string };
type PoolEntry = { id: string; info: Info; entry: Entry };

const SKILLS: [string, string][] = [["listening", "🎧 Nghe"], ["reading", "📖 Đọc"], ["writing", "✍️ Viết"]];
const FRAG_RE = /([A-Z])\s+([^A-Z]+)/g;

/** "A xxx B yyy C zzz 例如：..." -> {A:"xxx",...} — ngân hàng đáp án / mảnh câu cần sắp xếp. */
function parseFragments(text?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  for (const m of text.split("例如")[0].matchAll(FRAG_RE)) { const f = m[2].trim(); if (f) out[m[1]] = f; }
  return out;
}

const mediaCache = new Map<string, string>();
async function mediaUrl(path: string, sub: "audio" | "images", name?: string | null): Promise<string | null> {
  if (!name) return null;
  const key = `${path}|${sub}|${name}`;
  if (mediaCache.has(key)) return mediaCache.get(key)!;
  const b64 = await api.examMedia(path, sub, name);
  if (!b64) return null;
  const url = `data:${sub === "audio" ? "audio/mpeg" : name.endsWith(".png") ? "image/png" : "image/jpeg"};base64,${b64}`;
  mediaCache.set(key, url);
  return url;
}

function Img({ path, name, width }: { path: string; name?: string | null; width: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { mediaUrl(path, "images", name).then(setUrl); }, [path, name]);
  return url ? <img src={url} style={{ width, maxWidth: "100%", display: "block", margin: "4px 0" }} /> : null;
}

type Grade = boolean | null;

function Card({ q, path, bank, usedLetters, hints, onAnswered, locked, reviewed }: {
  q: Q; path: string; bank?: Record<string, string>; usedLetters?: string[];
  hints: { pinyin: boolean; vi: boolean; hover: boolean };
  onAnswered: (grade: Grade) => void; locked: boolean; reviewed: boolean;
}) {
  const answers = q.answers ?? [];
  const cl = (q.correct_letter ?? "").trim();
  const kind = q.type === "writing" ? "self" : answers.length ? "choice" : /^[A-Z]{2,}$/.test(cl) ? "reorder" : cl.length === 1 ? "bank" : "unknown";
  const [picked, setPicked] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [self, setSelf] = useState<boolean | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fragments = kind === "reorder" ? parseFragments(q.stem) : {};
  const letters = kind === "bank" ? (usedLetters?.length ? usedLetters : Object.keys(bank ?? {}).sort().length ? Object.keys(bank ?? {}).sort() : ["A", "B", "C", "D", "E", "F"]) : [];
  const reorderLetters = kind === "reorder" ? (Object.keys(fragments).sort().length ? Object.keys(fragments).sort() : [...cl]) : [];

  const play = async () => {
    const url = await mediaUrl(path, "audio", q.mp3);
    if (!url) return;
    audio.current?.pause();
    audio.current = new Audio(url);
    audio.current.play().catch(() => {});
  };
  useEffect(() => () => audio.current?.pause(), []);

  const optClass = (letter: string, correct: boolean) => {
    if (reviewed) return correct ? "right" : picked === letter ? "wrong" : "";
    return picked === letter ? "active" : "";
  };

  function chooseOne(letter: string, correct: boolean) {
    if (locked || picked) return;
    setPicked(letter);
    onAnswered(correct);
  }
  function fragClick(l: string) {
    if (locked || order.includes(l)) return;
    const next = [...order, l];
    setOrder(next);
    if (next.length >= reorderLetters.length) onAnswered(next.join("") === cl);
  }

  return (
    <div className="card" style={{ background: "#f8fafc", margin: "8px 0" }}>
      {q.mp3 && <button onClick={play}><Icon name="volume" size={16} /> Nghe</button>}
      <Img path={path} name={q.image} width={260} />
      {q.stem && <div className="hanzi" style={{ fontSize: "1.3rem", fontWeight: 600, color: "#1d4ed8", margin: "6px 0" }}>{q.stem}</div>}
      {(hints.pinyin && q.stem_pinyin) || (hints.vi && q.stem_vi) ? (
        <div>{hints.pinyin && <div style={{ color: "#7c3aed" }}>{q.stem_pinyin}</div>}{hints.vi && <div style={{ color: "#047857" }}>{q.stem_vi}</div>}</div>
      ) : null}
      {reviewed && q.transcript && (
        <div><b className="hanzi" style={{ color: "#1d4ed8" }}>🎧 Nội dung nghe: {q.transcript}</b>
          {q.transcript_pinyin && <div style={{ color: "#7c3aed" }}>{q.transcript_pinyin}</div>}
          {q.transcript_vi && <div style={{ color: "#047857" }}>{q.transcript_vi}</div>}</div>
      )}

      {kind === "choice" && answers.map((a) => (
        <button key={a.letter} className={`opt ${optClass(a.letter, a.correct)}`} disabled={locked && !reviewed}
          title={hints.hover && a.pinyin ? a.pinyin : undefined} onClick={() => chooseOne(a.letter, a.correct)}>
          <b>{a.letter}.</b>{" "}
          {a.kind === "image" ? <Img path={path} name={a.image} width={180} /> : <span className="hanzi">{a.text}</span>}
          {reviewed && (a.pinyin || a.vi) && <span className="muted"> · <span style={{ color: "#7c3aed" }}>{a.pinyin}</span> <span style={{ color: "#047857" }}>{a.vi}</span></span>}
        </button>
      ))}
      {kind === "bank" && letters.map((l) => (
        <button key={l} className={`opt ${optClass(l, l === cl)}`} disabled={locked && !reviewed} onClick={() => chooseOne(l, l === cl)}>
          <b>{l}.</b> <span className="hanzi">{bank?.[l] ?? ""}</span>
        </button>
      ))}
      {kind === "reorder" && (
        <>
          {reorderLetters.map((l) => (
            <button key={l} className={`opt ${order.includes(l) ? "active" : ""}`} disabled={order.includes(l) || locked} onClick={() => fragClick(l)}><b>{l}.</b> <span className="hanzi">{fragments[l] ?? ""}</span></button>
          ))}
          <div>Đã chọn: {order.length ? order.join(" → ") : "(chưa chọn)"} {!locked && <button onClick={() => setOrder([])}>Chọn lại</button>}</div>
          {reviewed && <div style={{ color: "#1d4ed8" }}>{order.join("") === cl ? "Đúng" : "Sai"} — Thứ tự đúng: {[...cl].join(" → ")}</div>}
        </>
      )}
      {kind === "self" && (
        <>
          <input style={{ width: "100%" }} placeholder="Gõ câu trả lời của bạn (tự chấm bằng mắt)..." value={typed} onChange={(e) => setTyped(e.target.value)} disabled={locked} />
          {(revealed || reviewed) && <div style={{ fontWeight: 600 }}>{cl ? `Đáp án mẫu: ${cl}` : "(Bộ đề thiếu đáp án mẫu cho câu viết — tự đánh giá)"}</div>}
          <div className="row" style={{ marginTop: 6 }}>
            <button onClick={() => setRevealed(true)}>Xem đáp án</button>
            <button className={self === true ? "active" : ""} disabled={!revealed || locked || self !== null || !cl} onClick={() => { setSelf(true); onAnswered(true); }}>Mình làm đúng</button>
            <button className={self === false ? "active" : ""} disabled={!revealed || locked || self !== null || !cl} onClick={() => { setSelf(false); onAnswered(false); }}>Mình làm sai</button>
          </div>
        </>
      )}
      {kind === "unknown" && <div style={{ color: "#b45309" }}>⚠ Thiếu dữ liệu đáp án cho câu này.</div>}
    </div>
  );
}

export default function ExamTab() {
  const [root, setRoot] = useState("");
  const [byLevel, setByLevel] = useState<Record<number, Info[]>>({});
  const [pools, setPools] = useState<Record<number, Record<string, PoolEntry[]>>>({});
  const [level, setLevel] = usePersistent<number>("exam.level", 1);
  const [skill, setSkill] = usePersistent<string>("exam.skill", "listening");
  const [showSettings, setShowSettings] = useState(true);
  const [msg, setMsg] = useState("");
  const [hintPy, setHintPy] = usePersistent("exam.pinyin", false);
  const [hintVi, setHintVi] = usePersistent("exam.vi", false);
  const [hover, setHover] = usePersistent("exam.hover", true);
  const progress = useRef<Record<string, string[]>>({});
  const queue = useRef<PoolEntry[]>([]);
  const [cur, setCur] = useState<PoolEntry | null>(null);
  const [round, setRound] = useState(0); // đổi để dựng lại thẻ câu hỏi
  const [grades, setGrades] = useState<Record<number, Grade>>({});
  const [settled, setSettled] = useState(false);
  const [stats, setStats] = useState({ ok: 0, total: 0 });
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const key = `${level}|${skill}|__all__`;
  const pool = pools[level]?.[skill] ?? [];

  const saveProgress = () => api.examProgressSet(JSON.stringify(progress.current)).catch(console.error);

  const reload = useCallback(async (customRoot?: string) => {
    setLoading(true); setMsg("");
    try {
      progress.current = JSON.parse(await api.examProgressGet());
      const [r, list] = await api.examScan(customRoot);
      setRoot(r);
      const g: Record<number, Info[]> = {};
      for (const i of list) (g[i.level] ??= []).push(i);
      setByLevel(g); setPools({});
      if (!list.length) setMsg('Chưa tìm thấy bộ đề nào. Bấm "Chọn thư mục đề" và chọn thư mục chứa file .hskpack hoặc các thư mục đề chưa mã hoá.');
    } catch (e) { setMsg(String(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Dựng bể câu hỏi của 1 cấp (đọc data.json từng bộ đề)
  useEffect(() => {
    if (pools[level] || !byLevel[level]) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const out: Record<string, PoolEntry[]> = {};
      for (const info of byLevel[level]) {
        try {
          const data = JSON.parse(await api.examLoad(info.path)) as { sections?: { type?: string; entries?: Entry[] }[] };
          data.sections?.forEach((sec, si) => {
            if (!sec.type) return;
            sec.entries?.forEach((entry, ei) => (out[sec.type!] ??= []).push({ id: `${info.name}#${si}.${ei}`, info, entry }));
          });
        } catch (e) { console.error("đề lỗi", info.name, e); }
      }
      if (!cancelled) { setPools((p) => ({ ...p, [level]: out })); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [level, byLevel, pools]);

  const freshQueue = useCallback((): PoolEntry[] => {
    const seen = new Set(progress.current[key] ?? []);
    let q = pool.filter((p) => !seen.has(p.id));
    if (!q.length) { delete progress.current[key]; saveProgress(); q = [...pool]; }
    return shuffle(q);
  }, [pool, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const showNext = useCallback((q?: PoolEntry[]) => {
    queue.current = q ?? queue.current;
    if (!queue.current.length) {
      delete progress.current[key]; saveProgress();
      queue.current = freshQueue();
      setStats({ ok: 0, total: 0 });
      setNotice(`🎉 Đã làm đúng hết ${pool.length} câu của phần này — tự động reset để làm lại từ đầu.`);
    }
    setCur(queue.current.shift()!);
    setGrades({}); setSettled(false); setRound((n) => n + 1);
  }, [freshQueue, key, pool.length]);

  function start() {
    if (!pool.length) return;
    setNotice(""); setStats({ ok: 0, total: 0 });
    showNext(freshQueue());
    setShowSettings(false);
  }
  // Mở tab / đổi cấp-kỹ năng: có câu hỏi thì vào làm luôn
  useEffect(() => { if (pool.length) start(); else setCur(null); }, [pool.length, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const questions: Q[] = cur ? (cur.entry.kind === "single" ? [cur.entry.question!] : cur.entry.questions ?? []) : [];

  function onAnswered(i: number, g: Grade) {
    if (!cur || grades[i] !== undefined) return;
    const next = { ...grades, [i]: g };
    setGrades(next);
    if (g !== null) setStats((s) => ({ ok: s.ok + (g ? 1 : 0), total: s.total + 1 }));
    if (Object.keys(next).length >= questions.length) {
      setSettled(true);
      const allOk = questions.every((_, k) => next[k] !== false);
      if (allOk) {
        const arr = (progress.current[key] ??= []);
        if (!arr.includes(cur.id)) { arr.push(cur.id); saveProgress(); }
      } else {
        const at = Math.floor(Math.random() * (queue.current.length - Math.min(2, queue.current.length) + 1)) + Math.min(2, queue.current.length);
        queue.current.splice(at, 0, cur);
      }
    }
  }

  function next() {
    if (!cur) return;
    if (!settled) { // bỏ qua: câu quay lại sau
      const at = Math.floor(Math.random() * (queue.current.length - Math.min(2, queue.current.length) + 1)) + Math.min(2, queue.current.length);
      queue.current.splice(at, 0, cur);
    }
    showNext();
  }

  async function chooseFolder() {
    const dir = await open({ directory: true, defaultPath: root || undefined, title: "Chọn thư mục chứa bộ đề" });
    if (typeof dir === "string") { await api.examSetFolder(dir); await reload(dir); }
  }

  const done = new Set(progress.current[key] ?? []);
  const doneCount = pool.filter((p) => done.has(p.id)).length;
  const levels = Object.keys(byLevel).map(Number).sort();
  const bank = cur?.entry.kind === "group" ? parseFragments(cur.entry.shared_text) : undefined;
  const used = cur?.entry.kind === "group" ? [...new Set(questions.map((q) => (q.correct_letter ?? "").trim()).filter((l) => l.length === 1))].sort() : undefined;
  const nGraded = Object.values(grades).filter((g) => g !== null).length;
  const nOk = Object.values(grades).filter((g) => g === true).length;

  return (
    <div>
      <div className="row">
        <button onClick={() => setShowSettings((v) => !v)}>{showSettings ? "▲ Ẩn cài đặt" : "▼ Hiện cài đặt"}</button>
        <b className="grow">{cur ? `HSK ${level} · ${SKILLS.find(([k]) => k === skill)?.[1]}` : ""}</b>
        <span>Đã đúng {doneCount}/{pool.length} · Lượt này đúng {stats.ok}/{stats.total}</span>
      </div>
      {showSettings && (
        <div className="card" style={{ margin: "10px 0" }}>
          <p className="muted">Mỗi lần chỉ làm 1 câu (hoặc 1 nhóm câu dùng chung đề), thứ tự ngẫu nhiên. Câu làm ĐÚNG được đánh dấu đã làm và không hiện lại; câu sai sẽ quay lại sau. Đúng hết cả phần thì tự reset để làm lại từ đầu.</p>
          <div className="row"><button onClick={chooseFolder}>Chọn thư mục đề</button><span className="muted">{root}</span></div>
          <div className="row" style={{ marginTop: 8 }}>
            <span>Cấp độ:</span>
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>{levels.map((l) => <option key={l} value={l}>HSK {l}</option>)}</select>
            <span>Kỹ năng:</span>
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              {SKILLS.filter(([k]) => pools[level]?.[k]?.length).map(([k, l]) => <option key={k} value={k}>{l} ({pools[level][k].length} câu)</option>)}
            </select>
            <button className="primary" disabled={!pool.length} onClick={start}>Bắt đầu / làm lại vòng</button>
          </div>
          {loading && <p className="muted">Đang nạp đề…</p>}
          {msg && <p className="err">{msg}</p>}
        </div>
      )}
      <div className="toolbar">
        <label><input type="checkbox" checked={hintPy} onChange={(e) => setHintPy(e.target.checked)} /> Hiện pinyin</label>
        <label><input type="checkbox" checked={hintVi} onChange={(e) => setHintVi(e.target.checked)} /> Hiện nghĩa tiếng Việt</label>
        <label><input type="checkbox" checked={hover} onChange={(e) => setHover(e.target.checked)} /> Di chuột vào đáp án hiện pinyin</label>
      </div>
      {notice && <p className="ok">{notice}</p>}
      {cur && (
        <div key={round}>
          {cur.entry.kind === "group" ? (
            <div className="card" style={{ background: "#eef2f7" }}>
              <Img path={cur.info.path} name={cur.entry.shared_image} width={460} />
              {cur.entry.shared_text && <div className="hanzi" style={{ fontSize: "1.25rem", fontWeight: 600, color: "#1d4ed8" }}>{cur.entry.shared_text}</div>}
              {settled && (cur.entry.shared_text_pinyin || cur.entry.shared_text_vi) && (
                <div><div style={{ color: "#7c3aed" }}>{cur.entry.shared_text_pinyin}</div><div style={{ color: "#047857" }}>{cur.entry.shared_text_vi}</div></div>
              )}
              {questions.map((q, i) => <Card key={i} q={q} path={cur.info.path} bank={bank} usedLetters={used} hints={{ pinyin: hintPy, vi: hintVi, hover }} locked={grades[i] !== undefined} reviewed={grades[i] !== undefined} onAnswered={(g) => onAnswered(i, g)} />)}
            </div>
          ) : questions.map((q, i) => <Card key={i} q={q} path={cur.info.path} hints={{ pinyin: hintPy, vi: hintVi, hover }} locked={grades[i] !== undefined} reviewed={grades[i] !== undefined} onAnswered={(g) => onAnswered(i, g)} />)}
          <p style={{ fontWeight: 600 }}>
            {!settled ? (Object.keys(grades).length ? `Còn ${questions.length - Object.keys(grades).length} câu chưa trả lời.` : "")
              : questions.every((_, k) => grades[k] !== false) ? `✅ ${nGraded <= 1 ? "Chính xác" : `Đúng ${nOk}/${nGraded} câu`} — đã đánh dấu là đã làm`
              : `❌ ${nGraded <= 1 ? "Chưa đúng" : `Đúng ${nOk}/${nGraded} câu`} — câu này sẽ quay lại sau`}
          </p>
          <div className="row" style={{ justifyContent: "center" }}><button className="primary" onClick={next} title="Chưa trả lời xong mà bấm sẽ bỏ qua — câu quay lại sau">Câu tiếp <Icon name="chevR" size={16} /></button></div>
        </div>
      )}
    </div>
  );
}
