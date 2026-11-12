import subprocess
import sys
import uuid

from PySide6.QtCore import QSettings

try:
    from license_crypto import verify_signature
except ImportError:
    from auth.license_crypto import verify_signature

# QSettings("HskApp", "HskApp") lưu vào Windows Registry (HKCU\Software\HskApp\HskApp)
# trên Windows, và vào ~/Library/Preferences trên macOS / ~/.config trên Linux —
# cùng một API cho cả 3 nền tảng.
ORG_NAME = "HskApp"
APP_NAME = "HskApp"

KEY_MULTIPLIERS = (8, 3, 8, 6, 8, 3, 8, 6)


class LicenseManager:
    def __init__(self):
        self._settings = QSettings(ORG_NAME, APP_NAME)

    def get_failed_attempts(self, app_id) -> int:
        try:
            return int(self._settings.value(f"license/FailedAttempts_{app_id}", 0))
        except Exception:
            return 0

    def increment_failed_attempts(self, app_id) -> int:
        count = self.get_failed_attempts(app_id) + 1
        try:
            self._settings.setValue(f"license/FailedAttempts_{app_id}", count)
        except Exception:
            pass
        return count

    def reset_failed_attempts(self, app_id) -> None:
        try:
            self._settings.setValue(f"license/FailedAttempts_{app_id}", 0)
        except Exception:
            pass

    def save_license(self, app_id: int, key: str, guid_sum: str) -> None:
        self._settings.setValue("license/AppID", int(app_id))
        self._settings.setValue("license/LicenseKey", str(key))
        self._settings.setValue("license/GUIDSum", str(guid_sum))

    def load_license(self):
        """Trả về (app_id, license_key) đã lưu, hoặc None nếu chưa kích hoạt."""
        try:
            app_id = self._settings.value("license/AppID", None)
            license_key = self._settings.value("license/LicenseKey", None)
            if app_id is None or license_key is None:
                return None
            return int(app_id), str(license_key)
        except Exception:
            return None

    def get_machine_guid(self) -> str:
        """Lấy định danh máy ổn định, khác cách lấy tuỳ theo hệ điều hành:
        - Windows: MachineGuid trong Registry.
        - macOS: IOPlatformUUID (qua ioreg).
        - Khác: dựa trên uuid.getnode() (địa chỉ MAC)."""
        try:
            if sys.platform.startswith("win"):
                import winreg
                registry_path = r"SOFTWARE\Microsoft\Cryptography"
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, registry_path)
                value, _ = winreg.QueryValueEx(key, "MachineGuid")
                winreg.CloseKey(key)
                return value
            if sys.platform == "darwin":
                out = subprocess.check_output(
                    ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                    stderr=subprocess.DEVNULL, text=True,
                )
                for line in out.splitlines():
                    if "IOPlatformUUID" in line:
                        return line.split('"')[-2]
                return "UNKNOWN"
            return str(uuid.getnode())
        except Exception:
            return "UNKNOWN"

    def ascii_sum(self, text: str) -> int:
        return sum(ord(char) for char in text)

    def generate_sum(self, app_id) -> str:
        """Chuỗi hiện lên máy để khách gửi đi: App ID (4 số) ghép liền với id máy —
        gộp 2 thông tin vào 1 chuỗi để người bán khỏi phải hỏi khách dùng app nào."""
        machine_sum = self.ascii_sum(self.get_machine_guid())
        return f"{app_id:04d}{machine_sum}"

    def generate_key(self, app_id, machine_sum: int) -> str:
        """Key cùng độ dài chuỗi khách gửi (App ID 4 số + id máy 4 số = 8 số). Mỗi chữ số:
        (số đó × số tương ứng của 83868386) lấy hàng đơn vị, cộng 5, lấy hàng đơn vị —
        dễ tính nhẩm. VD 12345678 -> 3 1 9 ... (1×8=8+5=13→3; 2×3=6+5=11→1; 3×8=24→4+5=9)."""
        combined = f"{int(app_id):04d}{int(machine_sum)}"
        return "".join(
            str((int(d) * KEY_MULTIPLIERS[i % len(KEY_MULTIPLIERS)] % 10 + 5) % 10)
            for i, d in enumerate(combined)
        )

    def verify_key(self, app_id, input_key: str) -> bool:
        """Key có dạng "<digit-key>.<chữ ký Ed25519>" — digit-key là lớp
        lọc nhanh như thuật toán cũ, nhưng điều kiện quyết định thật sự là
        chữ ký: không có private key (chỉ nằm máy người bán) thì không ký
        được, nên không thể tự tạo hay mang key sang máy khác (chữ ký ký
        trên machine_sum của đúng máy đó).

        Key CŨ (không có dấu ".", từ trước khi áp dụng chữ ký) KHÔNG còn
        được chấp nhận — key đó ai cũng tự tính ra được chỉ bằng cách đọc
        code, không khác gì không khoá, nên khách dùng key cũ phải xin cấp
        lại key mới."""
        guid = self.get_machine_guid()
        machine_sum = self.ascii_sum(guid)
        input_key = str(input_key).strip()
        expected_digit_key = self.generate_key(app_id, machine_sum)

        digit_part, sep, signature_part = input_key.partition(".")
        if not sep or digit_part != expected_digit_key:
            return False
        return verify_signature(app_id, machine_sum, signature_part)
