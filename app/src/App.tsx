import { useState, type ComponentType } from "react";
import { HeaderSlotContext } from "./components/ui";
import FloatingTools from "./components/FloatingTools";
import Icon, { type IconName } from "./components/Icon";
import "./App.css";
import Gate from "./components/Gate";
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

// Danh sách tab ở thanh trái. Thêm tab mới = thêm một dòng ở đây. `uses` = tab dùng bộ từ vựng đang chọn (hiện nhãn nguồn ở tiêu đề).
const TABS: { group: string; tabs: Tab[] }[] = [
  { group: "Luyện từ vựng", tabs: [
    { id: "list", label: "Danh sách nghe", icon: "list", subtitle: "Nghe từ và câu ví dụ, tự đọc liên tục", Component: ListTab, uses: true },
    { id: "flash", label: "Flashcard", icon: "layers", subtitle: "Lật thẻ, đánh dấu đã thuộc, xuất PDF / video / Anki", Component: FlashcardTab, uses: true, width: "narrow" },
    { id: "fall", label: "Từ rơi", icon: "down", subtitle: "Chọn đáp án trước khi từ rơi hết màn hình", Component: FallingTab, uses: true, fill: true },
    { id: "cloze", label: "Điền từ", icon: "pen", subtitle: "Điền từ còn thiếu vào câu ví dụ", Component: ClozeTab, uses: true, width: "narrow" },
    { id: "order", label: "Sắp xếp câu", icon: "puzzle", subtitle: "Ghép các từ rời thành câu đúng ngữ pháp", Component: SentenceOrderTab, uses: true, width: "narrow" },
    { id: "typing", label: "Gõ tiếng Trung", icon: "keyboard", subtitle: "Gõ pinyin không dấu để ra chữ Hán", Component: TypingTab, uses: true, width: "narrow" },
    { id: "pron", label: "Luyện phát âm", icon: "mic", subtitle: "Nghe mẫu, ghi âm giọng mình và nghe lại", Component: PronunciationTab, uses: true, width: "narrow" },
    { id: "write", label: "Luyện viết", icon: "brush", subtitle: "Thứ tự nét, tự viết, điền nét còn thiếu", Component: WritingTab, uses: true },
    { id: "chaos", label: "Hỗn mang", icon: "shuffle", subtitle: "Tự đánh giá nhiều từ cùng lúc để xếp lịch ôn", Component: ChaosTab, uses: true },
    { id: "quiz", label: "Trắc nghiệm", icon: "check", subtitle: "Chọn đáp án đúng trong 4 lựa chọn", Component: QuizTab, uses: true, width: "narrow" },
    { id: "grid", label: "Ghép cặp", icon: "grid", subtitle: "Ghép chữ Hán với pinyin tương ứng", Component: GridQuizTab, uses: true },
  ] },
  { group: "Đọc & nghe", tabs: [
    { id: "exam", label: "Giải đề", icon: "file", subtitle: "Luyện đề HSK từng câu: nghe, đọc, viết", Component: ExamTab },
    { id: "reading", label: "Bài đọc", icon: "bookOpen", subtitle: "Đoạn văn theo cấp, rê chuột vào từ để xem nghĩa", Component: ReadingTab },
    { id: "conv", label: "Hội thoại", icon: "message", subtitle: "Nghe hội thoại theo chủ đề, luyện vai", Component: ConversationTab, width: "wide", fill: true },
    { id: "grammar", label: "Ngữ pháp", icon: "book", subtitle: "Mẫu câu, giải thích và ví dụ theo cấp HSK", Component: GrammarTab, width: "wide", fill: true },
  ] },
  { group: "Tra cứu & tiến độ", tabs: [
    { id: "dict", label: "Từ điển", icon: "search", subtitle: "Tra theo chữ Hán, pinyin hoặc nghĩa tiếng Việt", Component: DictionaryTab },
    { id: "progress", label: "Tiến độ", icon: "chart", subtitle: "Chuỗi ngày học, từ đã nắm, hoạt động ôn tập", Component: ProgressTab },
  ] },
];

function Shell() {
  const all = TABS.flatMap((g) => g.tabs);
  const [active, setActive] = useState(() => (import.meta.env.DEV && all.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : all[0].id));
  const [sideOpen, setSideOpen] = usePersistent("ui.sideOpen", window.innerWidth >= 1500); // cửa sổ hẹp thì mặc định ẩn panel phải để nhường chỗ cho nội dung
  const [navOpen, setNavOpen] = usePersistent("ui.navOpen", true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [sideTab, setSideTab] = useState<"vocab" | "settings">("vocab");
  const { known, refresh } = useProgress();
  const { label, items } = useVocab();
  const tab = all.find((t) => t.id === active) ?? all[0];
  const Active = tab.Component;
  const nKnown = items.filter((w) => known.has(w.zh)).length;

  return (
    <div className="app">
      {navOpen && <nav className="nav">
        <div className="brand"><div className="logo">汉</div><div><b>HskApp</b><small>Học HSK</small></div></div>
        {TABS.map((g) => (
          <div key={g.group}>
            <div className="group">{g.group}</div>
            {g.tabs.map((t) => (
              <button key={t.id} className={t.id === active ? "active" : ""} onClick={() => setActive(t.id)}><Icon name={t.icon} />{t.label}</button>
            ))}
          </div>
        ))}
        <div className="spacer" />
        <button onClick={() => setToolsOpen(true)}><Icon name="tools" />Công cụ nổi</button>
      </nav>}
      <FloatingTools hubOpen={toolsOpen} onHubClose={() => setToolsOpen(false)} />
      <div className="workspace">
        <header className="page-header">
          <button className="ghost icon" onClick={() => setNavOpen(!navOpen)} title={navOpen ? "Ẩn thanh bên trái" : "Hiện thanh bên trái"}><Icon name="menu" /></button>
          <div className="titles"><h1>{tab.label}</h1><p>{tab.subtitle}</p></div>
          <div ref={setHeaderSlot} className="header-slot" />
          {tab.uses && <div className="source-chip" title="Bộ từ vựng đang học — đổi ở panel bên phải">{label}<small>· {nKnown}/{items.length} đã thuộc</small></div>}
          {!navOpen && <button className="ghost icon" onClick={() => setToolsOpen(true)} title="Công cụ nổi"><Icon name="tools" /></button>}
          <button className="ghost icon" onClick={() => setSideOpen((v) => !v)} title="Ẩn/hiện panel Từ vựng & Cài đặt"><Icon name="sliders" /></button>
        </header>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <main className={`main ${tab.fill ? "fill" : ""}`}><HeaderSlotContext.Provider value={headerSlot}><div className={`page ${tab.width ?? ""}`}><Active /></div></HeaderSlotContext.Provider></main>
          {sideOpen && (
            <aside className="side" style={{ borderLeft: "1px solid var(--border)" }}>
              <div className="tabs">
                <button className={sideTab === "vocab" ? "active" : ""} onClick={() => setSideTab("vocab")}>Từ vựng</button>
                <button className={sideTab === "settings" ? "active" : ""} onClick={() => setSideTab("settings")}>Cài đặt</button>
              </div>
              {sideTab === "vocab" ? <VocabPanel known={known} onChanged={refresh} /> : <SettingsPanel onChanged={refresh} />}
            </aside>
          )}
        </div>
      </div>
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
