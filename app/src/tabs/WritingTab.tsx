// Tab "✍️ Luyện viết" — luyện viết chữ Hán bằng HanziWriter (các trang HTML trong public/hanzi/).
// Port của games/game_hanzi_writing.py: 5 trang con dùng chung danh sách từ đang học.
import { useEffect, useRef, useState } from "react";
import { RULES_HTML } from "../data/rulesHtml";
import Icon from "../components/Icon";
import { cleanZh, speak } from "../lib/audio";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";

type HanziWin = Window & Record<string, (...a: unknown[]) => void> & { pyBridge?: unknown };

/** Khung nhúng một trang HanziWriter. `call` = [tên hàm JS, ...đối số] sẽ được gọi mỗi khi đổi
 *  (và sau khi trang nạp xong). Cầu nối `pyBridge` của bản Python được thay bằng shim rỗng/đo chiều cao. */
function HanziFrame({ src, call, autoHeight, minHeight = 460 }: { src: string; call: unknown[] | null; autoHeight?: boolean; minHeight?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(minHeight);

  const onLoad = () => {
    const w = ref.current?.contentWindow as HanziWin | null;
    if (!w) return;
    w.pyBridge = {
      notifyDemoFinished() {},
      notifyContentHeight(h: number) { if (autoHeight && h > 0) setHeight(h); },
      notifyWheel() {},
    };
    setReady(true);
  };

  useEffect(() => {
    if (!ready || !call) return;
    const w = ref.current?.contentWindow as HanziWin | null;
    const [fn, ...args] = call as [string, ...unknown[]];
    try { (w?.[fn] as ((...a: unknown[]) => void) | undefined)?.(...args); } catch (e) { console.error("hanzi call", fn, e); }
  }, [ready, JSON.stringify(call)]); // eslint-disable-line react-hooks/exhaustive-deps

  return <iframe ref={ref} src={src} onLoad={onLoad} style={{ width: "100%", height: autoHeight ? height : "100%", minHeight, border: "1px solid var(--border)", borderRadius: 10, background: "#fff" }} />;
}

const SUBTABS = ["Quy tắc viết", "Luyện viết", "Điền nét", "Luyện nét", "Hướng dẫn"] as const;
const HAN = /[一-鿿]/;

export default function WritingTab() {
  const { items } = useVocab();
  const [words, setWords] = useState<Word[]>([]);
  const [pos, setPos] = useState(0);
  const [sub, setSub] = useState<(typeof SUBTABS)[number]>("Quy tắc viết");
  const [outline, setOutline] = usePersistent("writing.outline", true);
  const [restart, setRestart] = useState(0); // đổi số để gọi lại hàm "viết lại" của trang con
  const cur = words[pos];

  useEffect(() => {
    resolveEffectivePool(items).then((p) => { setWords(p.filter((w) => HAN.test(w.zh))); setPos(0); });
  }, [items]);

  const go = (d: number) => words.length && setPos((p) => (p + d + words.length) % words.length);
  const nav = (
    <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
      <button onClick={() => go(-1)}><Icon name="chevL" size={16} /> Từ trước</button>
      <button onClick={() => go(1)}>Từ tiếp theo <Icon name="chevR" size={16} /></button>
    </div>
  );

  if (!cur) return <p className="muted">Chưa có từ vựng nào — hãy chọn bài học ở panel bên phải.</p>;
  return (
    <div>
      <div className="row" style={{ justifyContent: "center", gap: 14 }}>
        <span className="hanzi" style={{ fontSize: "2.4rem", fontWeight: 700 }}>{cur.zh}</span>
        <span className="muted" style={{ fontSize: "1.3rem" }}>{cur.pinyin}</span>
        <button onClick={() => speak(cleanZh(cur.zh))}><Icon name="volume" size={16} /> Phát âm</button>
      </div>
      <div style={{ textAlign: "center", fontSize: "1.2rem", fontWeight: 600, color: "#334155" }}>{cur.vi} <span className="muted" style={{ fontSize: ".8rem" }}>({pos + 1}/{words.length})</span></div>
      <div className="tabs" style={{ margin: "10px 0" }}>
        {SUBTABS.map((t) => <button key={t} className={t === sub ? "active" : ""} onClick={() => setSub(t)}>{t}</button>)}
      </div>

      {sub === "Quy tắc viết" && <><HanziFrame src="/hanzi/stroke_order.html" call={["loadWord", cur.zh, restart]} autoHeight minHeight={480} />{nav}</>}
      {sub === "Luyện viết" && (
        <>
          <HanziFrame src="/hanzi/self_practice.html" call={["loadSelfPractice", cur.zh, outline, restart]} minHeight={520} />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => setRestart((n) => n + 1)}>Viết lại</button>
            <label><input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} title="2 ô đầu mỗi chữ hiện chữ mờ làm nét mẫu" /> Hiện chữ mờ</label>
            <span className="grow" />
            {nav}
          </div>
        </>
      )}
      {sub === "Điền nét" && (
        <>
          <HanziFrame src="/hanzi/missing_stroke.html" call={["loadMissingStroke", cur.zh, false, restart]} minHeight={520} />
          <div className="row" style={{ marginTop: 8 }}><button onClick={() => setRestart((n) => n + 1)}>Làm lại từ này</button><span className="grow" />{nav}</div>
        </>
      )}
      {sub === "Luyện nét" && <HanziFrame src="/hanzi/basic_strokes.html" call={null} minHeight={560} />}
      {sub === "Hướng dẫn" && <iframe srcDoc={RULES_HTML} style={{ width: "100%", height: 640, border: "1px solid var(--border)", borderRadius: 10, background: "#fff" }} />}
    </div>
  );
}
