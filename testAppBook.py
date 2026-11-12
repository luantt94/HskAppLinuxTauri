import sys
import json
import os
import asyncio
import edge_tts
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                               QHBoxLayout, QPushButton, QLabel, QSplitter, 
                               QTabWidget, QTableWidget, QTableWidgetItem,
                               QHeaderView, QMessageBox, QGraphicsView, 
                               QGraphicsScene, QGraphicsPixmapItem, QMenu,
                               QDialog, QFormLayout, QDialogButtonBox)
from PySide6.QtGui import QPixmap, QAction
from PySide6.QtCore import Qt, QUrl, QTimer, QPoint
from PySide6.QtMultimedia import QMediaPlayer, QAudioOutput

# --- Cấu hình ---
TEMP_AUDIO_DIR = "temp_audio"
BOOK_DATA_DIR = "book_data" 

if not os.path.exists(TEMP_AUDIO_DIR): os.makedirs(TEMP_AUDIO_DIR)
if not os.path.exists(BOOK_DATA_DIR): os.makedirs(BOOK_DATA_DIR)

# --- Cửa sổ hiển thị chi tiết từ vựng/câu ---
class DetailDialog(QDialog):
    def __init__(self, item_data, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Chi tiết")
        self.setMinimumWidth(300)
        
        layout = QFormLayout(self)
        
        layout.addRow(QLabel(f"<b>{item_data.get('hanzi', item_data.get('text', ''))}</b>"))
        layout.addRow("Pinyin:", QLabel(f"<i>{item_data.get('pinyin', '')}</i>"))
        layout.addRow("Nghĩa:", QLabel(item_data.get('meaning', '')))
        
        usage = item_data.get('usage', '')
        if usage:
            layout.addRow("Cách dùng:", QLabel(usage))

        buttons = QDialogButtonBox(QDialogButtonBox.Ok)
        buttons.accepted.connect(self.accept)
        layout.addRow(buttons)

# --- Vùng hiển thị ảnh và Icon dấu hỏi ---
class ImageViewer(QGraphicsView):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.scene = QGraphicsScene(self)
        self.setScene(self.scene)
        self.pixmap_item = None
        self.setDragMode(QGraphicsView.ScrollHandDrag)
        self.setRenderHint(self.renderHints())
        self.parent_app = parent

    def set_image(self, image_path):
        self.scene.clear()
        pixmap = QPixmap(image_path)
        if not pixmap.isNull():
            self.pixmap_item = QGraphicsPixmapItem(pixmap)
            self.scene.addItem(self.pixmap_item)
            self.setSceneRect(self.pixmap_item.boundingRect())
            self.fitInView(self.pixmap_item, Qt.KeepAspectRatio)
        else:
            self.scene.addText("Không tìm thấy ảnh.")

    def add_question_icon(self, x, y, item_data):
        if not self.pixmap_item: return
        
        # Tạo nút dấu hỏi
        btn = QPushButton("?")
        btn.setFixedSize(22, 22)
        btn.setStyleSheet("""
            QPushButton { 
                background-color: #FFC107; 
                color: black; 
                border: 1px solid #FFA000; 
                border-radius: 11px; 
                font-weight: bold;
                font-size: 12px;
            }
            QPushButton:hover { background-color: #FFD54F; }
        """)
        
        # Gắn sự kiện click để hiện menu
        btn.clicked.connect(lambda: self.show_context_menu(btn, item_data))
        
        proxy = self.scene.addWidget(btn)
        proxy.setPos(x, y)
        proxy.setZValue(10)

    def show_context_menu(self, btn, item_data):
        menu = QMenu(self)
        
        # Hành động 1: Nghe phát âm
        action_play = QAction("🔊 Nghe phát âm", self)
        text_to_speak = item_data.get('hanzi', item_data.get('text', ''))
        action_play.triggered.connect(lambda: self.parent_app.play_audio_from_text(text_to_speak))
        menu.addAction(action_play)
        
        # Hành động 2: Xem chi tiết
        action_info = QAction("📖 Xem chi tiết", self)
        action_info.triggered.connect(lambda: self.show_info(item_data))
        menu.addAction(action_info)
        
        # Hiển thị menu ngay dưới nút bấm
        menu.exec_(btn.mapToGlobal(QPoint(0, btn.height())))

    def show_info(self, item_data):
        dialog = DetailDialog(item_data, self)
        dialog.exec_()

    def resizeEvent(self, event):
        if self.pixmap_item:
            self.fitInView(self.pixmap_item, Qt.KeepAspectRatio)
        super().resizeEvent(event)

# --- Cửa sổ chính ---
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Boya Interactive Book - Tương tác dấu ?")
        self.resize(1200, 800)

        self.current_page = 1
        self.max_pages = 200

        self.media_player = QMediaPlayer()
        self.audio_output = QAudioOutput()
        self.media_player.setAudioOutput(self.audio_output)

        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        main_layout = QVBoxLayout(main_widget)

        # Thanh điều hướng
        nav_layout = QHBoxLayout()
        self.btn_prev = QPushButton("<< Trang trước")
        self.btn_next = QPushButton("Trang sau >>")
        self.lbl_page = QLabel("Trang: 1")
        
        self.btn_prev.clicked.connect(self.prev_page)
        self.btn_next.clicked.connect(self.next_page)

        nav_layout.addWidget(self.btn_prev)
        nav_layout.addWidget(self.lbl_page)
        nav_layout.addWidget(self.btn_next)
        nav_layout.addStretch()
        main_layout.addLayout(nav_layout)

        # Splitter
        splitter = QSplitter(Qt.Horizontal)
        
        # Cột trái: Ảnh
        self.image_viewer = ImageViewer(self)
        splitter.addWidget(self.image_viewer)

        # Cột phải: Tabs
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        
        self.tabs = QTabWidget()
        
        # Tab Từ vựng
        self.table_vocab = QTableWidget()
        self.table_vocab.setColumnCount(4)
        self.table_vocab.setHorizontalHeaderLabels(["Chi tiết", "Chữ Hán", "Pinyin", "Nghĩa"])
        self.table_vocab.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.tabs.addTab(self.table_vocab, "Từ Vựng")

        # Tab Câu
        self.table_sentences = QTableWidget()
        self.table_sentences.setColumnCount(4)
        self.table_sentences.setHorizontalHeaderLabels(["Chi tiết", "Câu", "Pinyin", "Nghĩa"])
        self.table_sentences.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.tabs.addTab(self.table_sentences, "Câu")

        right_layout.addWidget(self.tabs)
        splitter.addWidget(right_widget)
        
        splitter.setSizes([700, 500])
        main_layout.addWidget(splitter)

        self.load_page(self.current_page)

    def prev_page(self):
        if self.current_page > 1:
            self.current_page -= 1
            self.load_page(self.current_page)

    def next_page(self):
        if self.current_page < self.max_pages:
            self.current_page += 1
            self.load_page(self.current_page)

    def load_page(self, page_num):
        self.lbl_page.setText(f"Trang: {page_num}")
        
        # 1. Tải ảnh
        img_path = os.path.join(BOOK_DATA_DIR, f"page_{page_num}.png")
        if not os.path.exists(img_path):
            img_path = os.path.join(BOOK_DATA_DIR, f"page_{page_num}.jpg")
        
        if os.path.exists(img_path):
            self.image_viewer.set_image(img_path)
        else:
            self.image_viewer.scene.clear()
            self.image_viewer.scene.addText(f"Chưa có ảnh cho trang {page_num}.")

        # 2. Tải JSON
        json_path = os.path.join(BOOK_DATA_DIR, f"page_{page_num}.json")
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.populate_data(data)
        else:
            self.table_vocab.setRowCount(0)
            self.table_sentences.setRowCount(0)

    def populate_data(self, data):
        # Đổ dữ liệu Từ vựng
        vocab_list = data.get("vocabulary", [])
        self.table_vocab.setRowCount(len(vocab_list))
        for i, item in enumerate(vocab_list):
            # Nút xem chi tiết trên bảng
            btn = QPushButton("🔍")
            btn.clicked.connect(lambda checked, d=item: DetailDialog(d, self).exec_())
            self.table_vocab.setCellWidget(i, 0, btn)
            
            self.table_vocab.setItem(i, 1, QTableWidgetItem(item.get("hanzi", "")))
            self.table_vocab.setItem(i, 2, QTableWidgetItem(item.get("pinyin", "")))
            self.table_vocab.setItem(i, 3, QTableWidgetItem(item.get("meaning", "")))
            
            if "x" in item and "y" in item:
                self.image_viewer.add_question_icon(item["x"], item["y"], item)

        # Đổ dữ liệu Câu
        sentences_list = data.get("sentences", [])
        self.table_sentences.setRowCount(len(sentences_list))
        for i, item in enumerate(sentences_list):
            btn = QPushButton("🔍")
            btn.clicked.connect(lambda checked, d=item: DetailDialog(d, self).exec_())
            self.table_sentences.setCellWidget(i, 0, btn)
            
            self.table_sentences.setItem(i, 1, QTableWidgetItem(item.get("text", "")))
            self.table_sentences.setItem(i, 2, QTableWidgetItem(item.get("pinyin", "")))
            self.table_sentences.setItem(i, 3, QTableWidgetItem(item.get("meaning", "")))
            
            if "x" in item and "y" in item:
                self.image_viewer.add_question_icon(item["x"], item["y"], item)

    def play_audio_from_text(self, text):
        if not text: return
        filename = f"{TEMP_AUDIO_DIR}/audio_{hash(text)}.mp3"
        if os.path.exists(filename):
            self._play_file(filename)
            return

        async def generate_audio():
            voice = "zh-CN-XiaoxiaoNeural" 
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(filename)

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(generate_audio())
                QTimer.singleShot(1000, lambda: self._play_file(filename))
            else:
                loop.run_until_complete(generate_audio())
                self._play_file(filename)
        except Exception as e:
            print(f"Lỗi: {e}")

    def _play_file(self, filename):
        self.media_player.setSource(QUrl.fromLocalFile(os.path.abspath(filename)))
        self.media_player.play()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())