# auth/generate_license_dialog.py
"""Công cụ riêng cho người bán (KHÔNG đóng gói vào app, không nằm trong
main.spec): dán nguyên chuỗi khách gửi (hiện trong LicenseDialog lúc khách
mở app chưa kích hoạt — gồm App ID 4 số ghép liền với số máy), tự tách App ID
+ số máy rồi sinh License Key tương ứng để gửi lại cho khách.
Chạy trực tiếp: `python generate_license_dialog.py` (từ trong thư mục
auth/) — dùng cùng thuật toán license_manager.py mà app đang xác thực.

Cần có auth/.license_private_key (tạo 1 lần bằng `python keygen.py`) để ký
số — không có file này thì KHÔNG cấp được key mới."""
import os
import sys
from PySide6.QtWidgets import (
    QApplication, QDialog, QVBoxLayout, QLabel, QLineEdit,
    QPushButton, QMessageBox
)
try:
    # Chạy trực tiếp `python generate_license_dialog.py` từ trong thư mục
    # auth/ (như docstring ở trên hướng dẫn) — license_manager là module
    # cùng cấp, import kiểu này hoạt động bình thường.
    from license_manager import LicenseManager
    from license_crypto import sign_license
except ImportError:
    # Khi đóng gói bằng PyInstaller: vì auth/ có __init__.py (là 1 package),
    # PyInstaller nhận diện file này thuộc package "auth" và gói
    # license_manager vào theo đường dẫn "auth.license_manager" thay vì
    # module rời ở top-level — bare import ở trên không tìm thấy, phải
    # import qua đường dẫn package mới đúng.
    from auth.license_manager import LicenseManager
    from auth.license_crypto import sign_license

def _resolve_private_key_path() -> str:
    """Chạy từ source (`python generate_license_dialog.py`): private key nằm
    cạnh file .py này (auth/.license_private_key), __file__ trỏ đúng chỗ.

    Chạy từ bản đã đóng gói PyInstaller (GenerateLicenseKey.spec): __file__
    trỏ vào BÊN TRONG bundle (Contents/Frameworks trên macOS), không phải vị
    trí thật trên đĩa — nếu dùng __file__ sẽ không bao giờ tìm thấy key.
    Thay vào đó tìm cạnh file .app/.exe đã build, để người bán tự đặt
    .license_private_key cạnh công cụ (không bị cuốn vào trong bundle)."""
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        if sys.platform == "darwin" and ".app/Contents/MacOS" in exe_dir:
            # .../GenerateLicenseKey.app/Contents/MacOS -> thư mục CHỨA .app
            app_bundle = os.path.dirname(os.path.dirname(exe_dir))  # .../GenerateLicenseKey.app
            return os.path.join(os.path.dirname(app_bundle), ".license_private_key")
        return os.path.join(exe_dir, ".license_private_key")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), ".license_private_key")


_PRIVATE_KEY_PATH = _resolve_private_key_path()


class GenerateLicenseDialog(QDialog):
    def __init__(self, parent=None, licenseManager=None):
        super().__init__(parent)
        self.licenseManager = licenseManager or LicenseManager()
        self.setWindowTitle("Generate License Key — HskApp")
        self.setFixedSize(320, 200)

        layout = QVBoxLayout()

        layout.addWidget(QLabel("Chuỗi khách gửi (App ID + số máy):"))
        self.sum_input = QLineEdit()
        self.sum_input.setPlaceholderText("VD: 11011234567")
        layout.addWidget(self.sum_input)

        self.generate_button = QPushButton("Generate")
        self.generate_button.clicked.connect(self.on_generate_clicked)
        layout.addWidget(self.generate_button)

        self.key_label = QLabel("App ID / License Key sẽ hiển thị ở đây")
        self.key_label.setWordWrap(True)
        layout.addWidget(self.key_label)

        self.copy_key_button = QPushButton("📋 Copy key")
        self.copy_key_button.clicked.connect(self._copy_key)
        layout.addWidget(self.copy_key_button)

        self.setLayout(layout)
        self._last_key = ""

    def _copy_key(self):
        QApplication.clipboard().setText(self._last_key)

    def on_generate_clicked(self):
        combined = self.sum_input.text().strip()
        if len(combined) <= 4 or not combined.isdigit():
            QMessageBox.warning(self, "Lỗi",
                                 "Chuỗi phải là số, gồm 4 số App ID + số máy phía sau.")
            return
        try:
            app_id = int(combined[:4])
            machine_sum = int(combined[4:])
            digit_key = self.licenseManager.generate_key(app_id, machine_sum)

            if not os.path.exists(_PRIVATE_KEY_PATH):
                QMessageBox.warning(
                    self, "Thiếu private key",
                    f"Không tìm thấy {_PRIVATE_KEY_PATH}.\n"
                    "Chạy `python keygen.py` một lần để tạo trước khi cấp key mới."
                )
                return

            signature = sign_license(app_id, machine_sum, _PRIVATE_KEY_PATH)
            key = f"{digit_key}.{signature}"
            self._last_key = key
            self.key_label.setText(f"App ID: {app_id}\nLicense Key: {key}")
        except ValueError:
            QMessageBox.warning(self, "Lỗi", "Chuỗi không hợp lệ.")
        except Exception as e:
            QMessageBox.critical(self, "Lỗi", f"Đã xảy ra lỗi: {str(e)}")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    dialog = GenerateLicenseDialog()
    dialog.exec()
