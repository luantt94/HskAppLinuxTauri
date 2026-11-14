import { useEffect, useState, type ComponentType } from "react";
import { HeaderSlotContext } from "./components/ui";
import FloatingTools from "./components/FloatingTools";
import Icon, { type IconName } from "./components/Icon";
import "./App.css";
import Gate from "./components/Gate";
import Modal from "./components/Modal";
import SettingsPanel from "./components/SettingsPanel";
import VocabPanel from "./components/VocabPanel";
import { ProgressProvider, useProgress } from "./lib/progress";
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

type Tab = { id: string; label: string; icon: IconName; subtitle: string; Component: ComponentType; uses?: boolean; width?: "narrow" | "wide"; fill?: boolean };

// Danh sách tab ở thanh trái, nhóm theo mục đích học. Thêm tab mới = thêm một dòng ở đây. `uses` = tab dùng bộ từ vựng đang chọn (hiện nhãn nguồn ở tiêu đề).
const TABS: { group: string; tabs: Tab[] }[] = [
  { group: "Học & ôn từ", tabs: [
    { id: "list", label: "Danh sách nghe", icon: "list", subtitle: "Nghe từ và câu ví dụ, tự đọc liên tục", Component: ListTab, uses: true },
    { id: "flash", label: "Flashcard", icon: "layers", subtitle: "Lật thẻ, đánh dấu đã thuộc, xuất PDF / video / Anki", Component: FlashcardTab, uses: true, width: "narrow" },
    { id: "chaos", label: "Ôn nhanh", icon: "clock", subtitle: "Xem 4 từ một lúc, tự chấm Khó / Vừa / Dễ để xếp lịch ôn", Component: ChaosTab, uses: true },
  ] },
  { group: "Kiểm tra từ", tabs: [
    { id: "quiz", label: "Trắc nghiệm", icon: "check", subtitle: "Chọn đáp án đúng trong 4 lựa chọn", Component: QuizTab, uses: true, width: "narrow" },
    { id: "grid", label: "Ghép cặp", icon: "grid", subtitle: "Ghép chữ Hán với pinyin tương ứng", Component: GridQuizTab, uses: true },
    { id: "cloze", label: "Điền từ", icon: "pen", subtitle: "Điền từ còn thiếu vào câu ví dụ", Component: ClozeTab, uses: true, width: "narrow" },
    { id: "order", label: "Sắp xếp câu", icon: "puzzle", subtitle: "Ghép các từ rời thành câu đúng ngữ pháp", Component: SentenceOrderTab, uses: true, width: "narrow" },
    { id: "fall", label: "Từ rơi", icon: "down", subtitle: "Chọn đáp án trước khi từ rơi hết màn hình", Component: FallingTab, uses: true, fill: true },
  ] },
  { group: "Kỹ năng", tabs: [
    { id: "write", label: "Luyện viết", icon: "brush", subtitle: "Thứ tự nét, tự viết, điền nét còn thiếu", Component: WritingTab, uses: true },
    { id: "pron", label: "Luyện phát âm", icon: "mic", subtitle: "Nghe mẫu, ghi âm giọng mình và nghe lại", Component: PronunciationTab, uses: true, width: "narrow" },
    { id: "typing", label: "Gõ tiếng Trung", icon: "keyboard", subtitle: "Gõ pinyin không dấu để ra chữ Hán", Component: TypingTab, uses: true, width: "narrow" },
  ] },
  { group: "Bài học", tabs: [
    { id: "grammar", label: "Ngữ pháp", icon: "book", subtitle: "Mẫu câu, giải thích và ví dụ theo cấp HSK", Component: GrammarTab, width: "wide", fill: true },
    { id: "reading", label: "Bài đọc", icon: "bookOpen", subtitle: "Đoạn văn theo cấp, rê chuột vào từ để xem nghĩa", Component: ReadingTab },
    { id: "conv", label: "Hội thoại", icon: "message", subtitle: "Nghe hội thoại theo chủ đề, luyện vai", Component: ConversationTab, width: "wide", fill: true },
    { id: "exam", label: "Giải đề", icon: "file", subtitle: "Luyện đề HSK từng câu: nghe, đọc, viết", Component: ExamTab },
  ] },
  { group: "Tra cứu & tiến độ", tabs: [
    { id: "dict", label: "Từ điển", icon: "search", subtitle: "Tra theo chữ Hán, pinyin hoặc nghĩa tiếng Việt", Component: DictionaryTab },
    { id: "progress", label: "Tiến độ", icon: "chart", subtitle: "Chuỗi ngày học, từ đã nắm, hoạt động ôn tập", Component: ProgressTab },
  ] },
];

function Shell() {
  const all = TABS.flatMap((g) => g.tabs);
  const [active, setActive] = useState(() => (import.meta.env.DEV && all.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : all[0].id));
  const [navOpen, setNavOpen] = usePersistent("ui.navOpen", true);
  const [collapsed, setCollapsed] = usePersistent<string[]>("ui.navCollapsed", []); // nhóm đang thu gọn ở thanh trái
  const [toolsOpen, setToolsOpen] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
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
      <nav className={`nav ${navOpen ? "" : "mini"}`}>
        <div className="brand">
          <div className="logo">汉</div>
          {navOpen && <div className="grow"><b>HskApp</b><small>Học HSK</small></div>}
          <button className="ghost icon collapse" onClick={() => setNavOpen(!navOpen)} title={navOpen ? "Thu gọn thanh bên (chỉ hiện icon)" : "Mở rộng thanh bên"}><Icon name={navOpen ? "panelClose" : "panelOpen"} size={18} /></button>
        </div>
        {TABS.map((g) => {
          const shut = navOpen && collapsed.includes(g.group); // dải icon luôn hiện đủ tab
          // Nhóm thu gọn vẫn hiện tab đang mở để không "mất" vị trí hiện tại.
          const shown = shut ? g.tabs.filter((t) => t.id === active) : g.tabs;
          return (
            <div key={g.group}>
              {navOpen ? (
                <button className={`group ${shut ? "shut" : ""}`} onClick={() => setCollapsed((c) => (shut ? c.filter((x) => x !== g.group) : [...c, g.group]))} title={shut ? "Mở nhóm" : "Thu gọn nhóm"}>
                  <span>{g.group}</span>{shut && <small>{g.tabs.length}</small>}<Icon name="chevR" size={13} className="chev" />
                </button>
              ) : <hr className="nav-sep" />}
              {shown.map((t) => (
                <button key={t.id} className={t.id === active ? "active" : ""} onClick={() => setActive(t.id)} title={navOpen ? t.subtitle : `${t.label} — ${t.subtitle}`}><Icon name={t.icon} />{navOpen && <span className="lbl">{t.label}</span>}</button>
              ))}
            </div>
          );
        })}
        <div className="spacer" />
        <button onClick={() => setToolsOpen(true)} title="Công cụ nổi"><Icon name="tools" />{navOpen && <span className="lbl">Công cụ nổi</span>}</button>
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
          <button className="ghost icon" onClick={() => setPanel("settings")} title="Cài đặt"><Icon name="gear" /></button>
        </header>
        <main className={`main ${tab.fill ? "fill" : ""}`}><HeaderSlotContext.Provider value={headerSlot}><div className={`page ${tab.width ?? ""}`}><Active /></div></HeaderSlotContext.Provider></main>
      </div>
      {panel === "vocab" && <VocabPanel known={known} onChanged={refresh} onClose={() => setPanel(null)} />}
      {panel === "settings" && <Modal title="Cài đặt" width={540} onClose={() => setPanel(null)}><SettingsPanel onChanged={refresh} /></Modal>}
    </div>
  );
}

export default function App() {
  return (
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
  );
}
