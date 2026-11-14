// Tab "✍️ Luyện viết" — luyện viết chữ Hán bằng HanziWriter (các trang HTML trong public/hanzi/).
// Port của games/game_hanzi_writing.py: 5 trang con dùng chung danh sách từ đang học.
import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { OptSection, OptSwitch, TabOptions } from "../components/TabOptions";
import { cleanZh, speak } from "../lib/audio";
import { resolveEffectivePool } from "../lib/srsPool";
import { usePersistent } from "../lib/storage";
import type { Word } from "../lib/types";
import { useVocab } from "../lib/vocabStore";
import { WordList, useWordListOpen } from "../components/WordList";

type HanziWin = Window & Record<string, (...a: unknown[]) => void> & { pyBridge?: unknown };

/** Khung nhúng một trang HanziWriter. `call` = [tên hàm JS, ...đối số] sẽ được gọi mỗi khi đổi
 *  (và sau khi trang nạp xong). Cầu nối `pyBridge` của bản Python được thay bằng shim rỗng/đo chiều cao. */
/** Chiều cao để phần tử kéo dài từ vị trí hiện tại tới đáy vùng nội dung (trừ `below` px), cập nhật khi đổi cỡ cửa sổ. */
function useFitHeight(ref: React.RefObject<HTMLElement | null>, minHeight: number, below = 0, enabled = true) {
  const [h, setH] = useState(minHeight);
  useEffect(() => {
    if (!enabled) return;
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const main = el.closest(".main") as HTMLElement | null;
      const padBottom = main ? parseFloat(getComputedStyle(main).paddingBottom) : 24;
      const top = el.getBoundingClientRect().top + (main?.scrollTop ?? 0) - (main?.getBoundingClientRect().top ?? 0);
      const avail = (main?.clientHeight ?? window.innerHeight) - top - padBottom - below - 2;
      setH(Math.max(minHeight, Math.floor(avail)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, minHeight, below, enabled]);
  return h;
}

function HanziFrame({ src, call, autoHeight, minHeight = 460, below = 0 }: { src: string; call: unknown[] | null; autoHeight?: boolean; minHeight?: number; below?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(minHeight);

  // Khung không tự cao theo nội dung thì kéo dài tới đáy cửa sổ (màn hình lớn dùng hết chiều cao);
  // `below` = chỗ chừa cho các nút nằm dưới khung.
  const fitH = useFitHeight(ref, minHeight, below, !autoHeight);

  const onLoad = () => {
    const w = ref.current?.contentWindow as HanziWin | null;
    if (!w) return;
    w.pyBridge = {
      notifyDemoFinished() {},
      notifyContentHeight(h: number) { if (autoHeight && h > 0) setHeight(h); },
      notifyWheel() {},
    };
    if (autoHeight) {
      // Khung cao đúng bằng nội dung → tắt thanh cuộn riêng của trang con, rồi báo chiều cao ngay
      // (lần báo đầu tiên của trang con xảy ra trước khi có pyBridge nên bị bỏ lỡ).
      w.document.documentElement.style.overflow = "hidden";
      (w as unknown as { reportContentHeight?: () => void }).reportContentHeight?.();
    }
    setReady(true);
  };

  useEffect(() => {
    if (!ready || !call) return;
    const w = ref.current?.contentWindow as HanziWin | null;
    const [fn, ...args] = call as [string, ...unknown[]];
    try { (w?.[fn] as ((...a: unknown[]) => void) | undefined)?.(...args); } catch (e) { console.error("hanzi call", fn, e); }
  }, [ready, JSON.stringify(call)]); // eslint-disable-line react-hooks/exhaustive-deps

  return <iframe ref={ref} src={src} onLoad={onLoad} style={{ width: "calc(100% - 2px)", height: autoHeight ? height : fitH, minHeight, boxSizing: "content-box", border: "1px solid var(--border)", borderRadius: 10, background: "#fff", display: "block" }} />;
}

const SUBTABS = ["Quy tắc viết", "Luyện viết", "Điền nét", "Luyện nét", "Hướng dẫn"] as const;
const HAN = /[一-鿿]/;

export default function WritingTab() {
  const [wlOpen, setWlOpen] = useWordListOpen(); // cột danh sách từ
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

  if (!cur) return <p className="muted">Chưa có từ vựng nào — hãy chọn bài học ở panel bên phải.</p>;
  return (
    <div>
      {/* Từ đang luyện: chữ + pinyin + nghĩa, chuyển từ bằng 2 mũi tên hai bên */}
      <div className="write-head">
        <button className="icon round flash-nav" onClick={() => go(-1)} title="Từ trước"><Icon name="chevL" size={20} /></button>
        <div className="write-word">
          <span className="hanzi zh">{cur.zh}</span>
          <div>
            <div className="py">{cur.pinyin}<button className="ghost icon" onClick={() => speak(cleanZh(cur.zh))} title="Phát âm"><Icon name="volume" size={16} /></button></div>
            <div className="vi">{cur.vi}</div>
          </div>
        </div>
        <span className="muted write-count">Từ <b className="stat">{pos + 1}</b> / {words.length}</span>
        <button className="icon round flash-nav" onClick={() => go(1)} title="Từ tiếp theo"><Icon name="chevR" size={20} /></button>
      </div>
      <WordList open={wlOpen} onClose={() => setWlOpen(false)} index={pos} onPick={setPos} words={words.map((w) => ({ zh: w.zh, py: w.pinyin, vi: w.vi }))} />
      <TabOptions>
        <OptSection title="Danh sách">
          <OptSwitch checked={wlOpen} onChange={setWlOpen} label="Hiện danh sách từ" hint="Cột bên trái: các từ đang học, bấm để nhảy tới" />
        </OptSection>
        <OptSection title="Luyện viết">
          <OptSwitch checked={outline} onChange={setOutline} label="Hiện chữ mờ làm mẫu" hint="2 ô đầu của mỗi chữ hiện nét mờ để tô theo" />
        </OptSection>
      </TabOptions>
      <div className="tabs" style={{ margin: "0 0 .8rem" }}>
        {SUBTABS.map((t) => <button key={t} className={t === sub ? "active" : ""} onClick={() => setSub(t)}>{t}</button>)}
      </div>

      {sub === "Quy tắc viết" && <HanziFrame src="/hanzi/stroke_order.html" call={["loadWord", cur.zh, restart]} autoHeight minHeight={480} />}
      {sub === "Luyện viết" && (
        <>
          <HanziFrame src="/hanzi/self_practice.html" call={["loadSelfPractice", cur.zh, outline, restart]} minHeight={420} below={56} />
          <div className="nav-row"><button onClick={() => setRestart((n) => n + 1)}><Icon name="rotate" size={15} />Viết lại</button></div>
        </>
      )}
      {sub === "Điền nét" && (
        <>
          <HanziFrame src="/hanzi/missing_stroke.html" call={["loadMissingStroke", cur.zh, false, restart]} minHeight={420} below={56} />
          <div className="nav-row"><button onClick={() => setRestart((n) => n + 1)}><Icon name="rotate" size={15} />Làm lại từ này</button></div>
        </>
      )}
      {sub === "Luyện nét" && <HanziFrame src="/hanzi/basic_strokes.html" call={null} minHeight={420} />}
      {sub === "Hướng dẫn" && <WritingGuide onTry={(ch) => speak(ch)} />}
    </div>
  );
}

// ===== Tab con "Hướng dẫn": nét cơ bản + quy tắc thứ tự nét + lưu ý (trước đây là trang HTML tĩnh trong iframe) =====
const STROKES: [string, string, string, string][] = [
  ["一", "横 héng", "Ngang", "Kéo ngang từ trái sang phải"],
  ["丨", "竖 shù", "Sổ (dọc)", "Kéo thẳng từ trên xuống dưới"],
  ["丿", "撇 piě", "Phẩy", "Xiên từ trên xuống, chếch sang trái"],
  ["丶", "点 diǎn", "Chấm", "Chấm nhỏ, thường xiên xuống"],
  ["㇏", "捺 nà", "Mác", "Xiên từ trên xuống, chếch sang phải"],
  ["㇀", "提 tí", "Hất", "Hất chếch lên từ dưới trái lên trên phải"],
  ["亅", "竖钩 shùgōu", "Sổ móc", "Nét sổ, cuối nét có móc"],
  ["㇕", "横折 héngzhé", "Ngang gấp", "Ngang rồi gấp xuống thành nét sổ"],
];
const RULES: [string, string, string, string][] = [
  ["Ngang trước, sổ sau", "先横后竖", "十干", "Viết nét ngang trước rồi mới đến nét sổ."],
  ["Phẩy trước, mác sau", "先撇后捺", "人八", "Nét phẩy (xiên trái) viết trước nét mác (xiên phải)."],
  ["Trên trước, dưới sau", "从上到下", "三字", "Viết từ phần trên xuống phần dưới."],
  ["Trái trước, phải sau", "从左到右", "明你", "Viết từ phần bên trái sang phần bên phải."],
  ["Ngoài trước, trong sau", "从外到内", "月同", "Viết khung bao ngoài trước khi viết nét bên trong."],
  ["Vào trước, đóng sau", "先里头后封口", "回国", "Viết nét bên trong trước, nét khép kín khung viết sau cùng."],
  ["Giữa trước, hai bên sau", "先中间后两边", "小水", "Chữ đối xứng: viết nét giữa trước rồi đến hai bên."],
  ["Bộ thủ bên trái viết trước", "偏旁先写", "汉你说", "Chữ có bộ thủ (氵, 亻, 讠): viết bộ thủ trước phần còn lại."],
];
const TIPS = [
  "Luôn viết trong khung 田字格 (ô chữ điền) để giữ đúng tỷ lệ và vị trí các nét.",
  "Viết đúng thứ tự nét giúp chữ cân đối hơn và là quy chuẩn khi viết chữ Hán, kể cả khi viết nhanh.",
  "Xem kỹ hoạt hình ở “Quy tắc viết” trước, rồi dùng “Luyện viết” và “Điền nét” để tự viết lại nhiều lần.",
];

function WritingGuide({ onTry }: { onTry: (ch: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const h = useFitHeight(ref, 320);
  return (
    <div ref={ref} className="guide" style={{ height: h }}>
      <section>
        <h3><span className="step">1</span>Tám nét cơ bản</h3>
        <div className="guide-strokes">
          {STROKES.map(([g, han, vi, desc]) => (
            <div key={vi} className="guide-stroke">
              <div className="glyph hanzi">{g}</div>
              <div><b>{vi}</b><div className="han">{han}</div><p>{desc}</p></div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3><span className="step">2</span>Quy tắc thứ tự nét <small>笔顺规则</small></h3>
        <div className="guide-rules">
          {RULES.map(([name, zh, ex, desc], i) => (
            <div key={name} className="guide-rule">
              <span className="n">{i + 1}</span>
              <div className="grow"><b>{name}</b> <span className="han">{zh}</span><p>{desc}</p></div>
              <div className="ex">{[...ex].map((c) => <button key={c} className="hanzi" onClick={() => onTry(c)} title="Nghe phát âm">{c}</button>)}</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3><span className="step">3</span>Lưu ý khi luyện viết</h3>
        <ul className="guide-tips">{TIPS.map((t) => <li key={t}><Icon name="check" size={15} />{t}</li>)}</ul>
      </section>
    </div>
  );
}

