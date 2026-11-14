import { useEffect, useState, type ComponentType } from "react";
import { HeaderSlotContext } from "./components/ui";
import FloatingTools from "./components/FloatingTools";
import Icon, { type IconName } from "./components/Icon";
import "./App.css";
import Gate from "./components/Gate";
import Modal from "./components/Modal";
import SettingsPanel from "./components/SettingsPanel";
import TitleBar from "./components/TitleBar";
import VocabPanel from "./components/VocabPanel";
import { ProgressProvider, useProgress } from "./lib/progress";
import { TabOptionsContext } from "./components/TabOptions";
import { SettingsProvider } from "./lib/settings";
import { usePersistent } from "./lib/storage";
import { ToastProvider } from "./lib/toast";
import { VocabProvider, useVocab } from "./lib/vocabStore";
import DictionaryTab from "./tabs/DictionaryTab";
import ChaosTab from "./tabs/ChaosTab";
import ClozeTab from "./tabs/ClozeTab";
import ExamTab from "./tabs/ExamTab";
import FallingTab from "./tabs/FallingTab";
import FlashcardTab from "./tabs/FlashcardTab";
import ListTab from "./tabs/ListTab";
import PronunciationTab from "./tabs/PronunciationTab";
import GrammarTab from "./tabs/GrammarTab";
import GridQuizTab from "./tabs/GridQuizTab";
import ProgressTab from "./tabs/ProgressTab";
import WritingTab from "./tabs/WritingTab";
import TypingTab from "./tabs/TypingTab";
import QuizTab from "./tabs/QuizTab";
import ReadingTab from "./tabs/ReadingTab";
import ConversationTab from "./tabs/ConversationTab";
import SentenceOrderTab from "./tabs/SentenceOrderTab";
import { WordListSlotContext } from "./components/WordList";

type Tab = { id: string; label: string; icon: IconName; subtitle: string; Component: ComponentType; uses?: boolean; wide?: boolean; fill?: boolean };

// Danh sách tab ở thanh trái, nhóm theo mục đích học. Thêm tab mới = thêm một dòng ở đây. `uses` = tab dùng bộ từ vựng đang chọn (hiện nhãn nguồn ở tiêu đề).
const TABS: { group: string; tabs: Tab[] }[] = [
  { group: "Học & ôn từ", tabs: [
    { id: "list", label: "Danh sách nghe", icon: "list", subtitle: "Nghe từ và câu ví dụ, tự đọc liên tục", Component: ListTab, uses: true },
    { id: "flash", label: "Flashcard", icon: "layers", subtitle: "Lật thẻ, đánh dấu đã thuộc, xuất PDF / video / Anki", Component: FlashcardTab, uses: true },
    { id: "chaos", label: "Ôn nhanh", icon: "clock", subtitle: "Xem 4 từ một lúc, tự chấm Khó / Vừa / Dễ để xếp lịch ôn", Component: ChaosTab, uses: true },
  ] },
  { group: "Kiểm tra từ", tabs: [
    { id: "quiz", label: "Trắc nghiệm", icon: "check", subtitle: "Chọn đáp án đúng trong 4 lựa chọn", Component: QuizTab, uses: true },
    { id: "grid", label: "Ghép cặp", icon: "grid", subtitle: "Ghép chữ Hán với pinyin tương ứng", Component: GridQuizTab, uses: true },
    { id: "cloze", label: "Điền từ", icon: "pen", subtitle: "Điền từ còn thiếu vào câu ví dụ", Component: ClozeTab, uses: true },
    { id: "order", label: "Sắp xếp câu", icon: "puzzle", subtitle: "Ghép các từ rời thành câu đúng ngữ pháp", Component: SentenceOrderTab, uses: true },
    { id: "fall", label: "Từ rơi", icon: "down", subtitle: "Chọn đáp án trước khi từ rơi hết màn hình", Component: FallingTab, uses: true, fill: true },
  ] },
  { group: "Kỹ năng", tabs: [
    { id: "write", label: "Luyện viết", icon: "brush", subtitle: "Thứ tự nét, tự viết, điền nét còn thiếu", Component: WritingTab, uses: true },
    { id: "pron", label: "Luyện phát âm", icon: "mic", subtitle: "Nghe mẫu, ghi âm giọng mình và nghe lại", Component: PronunciationTab, uses: true },
    { id: "typing", label: "Gõ tiếng Trung", icon: "keyboard", subtitle: "Gõ pinyin không dấu để ra chữ Hán", Component: TypingTab, uses: true },
  ] },
  { group: "Bài học", tabs: [
    { id: "grammar", label: "Ngữ pháp", icon: "book", subtitle: "Mẫu câu, giải thích và ví dụ theo cấp HSK", Component: GrammarTab, wide: true, fill: true },
    { id: "conv", label: "Hội thoại", icon: "message", subtitle: "Nghe hội thoại theo chủ đề, luyện vai", Component: ConversationTab, wide: true, fill: true },
    { id: "reading", label: "Bài đọc", icon: "bookOpen", subtitle: "Đoạn văn theo cấp, rê chuột vào từ để xem nghĩa", Component: ReadingTab, wide: true },
    { id: "exam", label: "Giải đề", icon: "file", subtitle: "Luyện đề HSK từng câu: nghe, đọc, viết", Component: ExamTab },
  ] },
  { group: "Tra cứu & tiến độ", tabs: [
    { id: "dict", label: "Từ điển", icon: "search", subtitle: "Tra theo chữ Hán, pinyin hoặc nghĩa tiếng Việt", Component: DictionaryTab },
    { id: "progress", label: "Tiến độ", icon: "chart", subtitle: "Chuỗi ngày học, từ đã nắm, hoạt động ôn tập", Component: ProgressTab },
  ] },
];

/** true khi media query khớp (cập nhật khi đổi cỡ cửa sổ). */
function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q), on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

function Shell() {
  const all = TABS.flatMap((g) => g.tabs);
  const [active, setActive] = useState(() => (import.meta.env.DEV && all.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : all[0].id));
  const [navOpen, setNavOpen] = usePersistent("ui.navOpen", true);
  // Cửa sổ hẹp (< 1000px): thanh bên tự thu thành dải icon để nhường chỗ cho nội dung (không đổi cài đặt đã lưu);
  // bấm logo thì mở tạm dạng nổi đè lên nội dung, chọn tab xong tự đóng.
  const narrow = useMediaQuery("(max-width: 1000px)");
  const [peek, setPeek] = useState(false);
  const navShown = narrow ? peek : navOpen;
  const showNav = (v: boolean) => (narrow ? setPeek(v) : setNavOpen(v));
  useEffect(() => { if (!narrow) setPeek(false); }, [narrow]);
  useEffect(() => {
    if (!peek) return;
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".nav")) setPeek(false); };
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, [peek]);
  const [collapsed, setCollapsed] = usePersistent<string[]>("ui.navCollapsed", []); // nhóm đang thu gọn ở thanh trái
  const [toolsOpen, setToolsOpen] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [optBtnSlot, setOptBtnSlot] = useState<HTMLElement | null>(null); // nút "Tuỳ chọn" của tab (cạnh nút Cài đặt)
  const [optPanelSlot, setOptPanelSlot] = useState<HTMLElement | null>(null); // bảng tuỳ chọn (cạnh nội dung)
  const [wordSlot, setWordSlot] = useState<HTMLElement | null>(null); // cột danh sách từ (bên trái nội dung)
  const [panel, setPanel] = useState<"vocab" | "settings" | null>(null); // hộp chọn bộ từ hoặc hộp Cài đặt
  const { known, refresh } = useProgress();
  const { label, items } = useVocab();
  const tab = all.find((t) => t.id === active) ?? all[0];

  const Active = tab.Component;
  const nKnown = items.filter((w) => known.has(w.zh)).length;

  useEffect(() => {
    if (!panel) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [panel]);

  return (
    <div className="app">
      {/* Thanh trái: thu gọn thành dải icon (nút ở cạnh logo), không ẩn hẳn */}
      <nav className={`nav ${navShown ? "" : "mini"} ${narrow && peek ? "overlay" : ""}`}>
        <div className="brand">
          {navShown ? <div className="logo">汉</div>
            : <div className="logo clickable" role="button" tabIndex={0} onClick={() => showNav(true)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && showNav(true)} title="Mở rộng thanh bên">汉</div>}
          {navShown && <div className="grow"><b>HskApp</b><small>Học HSK</small></div>}
          {navShown && <button className="ghost icon collapse" onClick={() => showNav(false)} title="Thu gọn thanh bên (chỉ hiện icon)"><Icon name="panelClose" size={18} /></button>}
        </div>
        {TABS.map((g) => {
          const shut = navShown && collapsed.includes(g.group); // dải icon luôn hiện đủ tab
          // Nhóm thu gọn vẫn hiện tab đang mở để không "mất" vị trí hiện tại.
          const shown = shut ? g.tabs.filter((t) => t.id === active) : g.tabs;
          return (
            <div key={g.group}>
              {navShown ? (
                <button className={`group ${shut ? "shut" : ""}`} onClick={() => setCollapsed((c) => (shut ? c.filter((x) => x !== g.group) : [...c, g.group]))} title={shut ? "Mở nhóm" : "Thu gọn nhóm"}>
                  <span>{g.group}</span>{shut && <small>{g.tabs.length}</small>}<Icon name="chevR" size={13} className="chev" />
                </button>
              ) : <hr className="nav-sep" />}
              {shown.map((t) => (
                <button key={t.id} className={t.id === active ? "active" : ""} onClick={() => { setActive(t.id); setPeek(false); }} title={navShown ? t.subtitle : `${t.label} — ${t.subtitle}`}><Icon name={t.icon} />{navShown && <span className="lbl">{t.label}</span>}</button>
              ))}
            </div>
          );
        })}
        <div className="spacer" />
        <button onClick={() => setToolsOpen(true)} title="Công cụ nổi"><Icon name="tools" />{navShown && <span className="lbl">Công cụ nổi</span>}</button>
        <button className={panel === "settings" ? "active" : ""} onClick={() => setPanel("settings")} title="Cài đặt chung của ứng dụng"><Icon name="gear" />{navShown && <span className="lbl">Cài đặt</span>}</button>
      </nav>
      <FloatingTools hubOpen={toolsOpen} onHubClose={() => setToolsOpen(false)} />
      <div className="workspace">
        <header className="page-header">
          <div className="titles"><h1>{tab.label}</h1><p>{tab.subtitle}</p></div>
          <div ref={setHeaderSlot} className="header-slot" />
          {tab.uses && (
            <button className="source-chip" onClick={() => setPanel("vocab")} title="Đổi bộ từ vựng đang học">
              <Icon name="layers" size={15} />{label}<small>· {nKnown}/{items.length} đã thuộc</small><Icon name="chevD" size={15} />
            </button>
          )}
          <div ref={setOptBtnSlot} className="opt-btn-slot" />
        </header>
        <div className="ws-body">
          <div ref={setWordSlot} className="wl-slot" />
          <main className={`main ${tab.fill ? "fill" : ""} ${tab.wide ? "wide" : ""}`}>
            <HeaderSlotContext.Provider value={headerSlot}>
              <TabOptionsContext.Provider value={{ button: optBtnSlot, panel: optPanelSlot, label: tab.label }}>
                <WordListSlotContext.Provider value={wordSlot}>
                  <div className="page"><Active /></div>
                </WordListSlotContext.Provider>
              </TabOptionsContext.Provider>
            </HeaderSlotContext.Provider>
          </main>
          <div ref={setOptPanelSlot} className="opt-panel-slot" />
        </div>
      </div>
      {panel === "vocab" && <VocabPanel known={known} onChanged={refresh} onClose={() => setPanel(null)} />}
      {panel === "settings" && <Modal title="Cài đặt" width={540} onClose={() => setPanel(null)}><SettingsPanel onChanged={refresh} /></Modal>}
    </div>
  );
}

export default function App() {
  return (
    <div className="window">
      <TitleBar />
      <div className="window-body">
        <Gate>
          <SettingsProvider>
            <ProgressProvider>
              <VocabProvider>
                <ToastProvider>
                  <Shell />
                </ToastProvider>
              </VocabProvider>
            </ProgressProvider>
          </SettingsProvider>
        </Gate>
      </div>
    </div>
  );
}
