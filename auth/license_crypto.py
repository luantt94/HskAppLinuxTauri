# auth/license_crypto.py
"""Lớp bảo vệ bằng chữ ký số Ed25519 — khác hẳn thuật toán biến đổi số ở
license_manager.py (ai đọc được code cũng dò ra được), chữ ký số đảm bảo:
đọc được HẾT code verify() ở đây vẫn KHÔNG tự tạo được license hợp lệ cho
một máy mới, vì không có private key để ký.

- PRIVATE key: chỉ tạo 1 lần bằng keygen.py, lưu ở auth/.license_private_key
  (đã .gitignore) — KHÔNG bao giờ đưa vào app đóng gói cho khách.
- PUBLIC key: hằng số dưới đây, nhúng thẳng vào app. Lộ ra ngoài không sao,
  đó là bản chất của public-key crypto — không ai dùng public key để ký giả
  được.

Payload ký = (app_id, machine_sum) — machine_sum là tổng ASCII của machine
GUID mà khách gửi qua Zalo (xem LicenseManager.generate_sum), không phải
GUID gốc, để không đổi quy trình khách/người bán hiện tại. Nhờ vậy, key cấp
cho máy A ký trên machine_sum của máy A — mang sang máy B (machine_sum khác)
sẽ KHÔNG verify được, dù chữ ký có hợp lệ về mặt toán học.
"""
import base64

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

# Dán public key (hex, 64 ký tự) in ra từ keygen.py vào đây.
PUBLIC_KEY_HEX = "190838a471216426910ec7527dc077ec22c20132608e44002ed647df70dd5070"


def _payload(app_id: int, machine_sum: int) -> bytes:
    return f"{int(app_id):04d}:{int(machine_sum)}".encode("ascii")


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64_decode(text: str) -> bytes:
    padded = text + "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(padded)


def sign_license(app_id: int, machine_sum: int, private_key_path: str) -> str:
    """CHỈ gọi từ công cụ của người bán (generate_license_dialog.py / keygen.py),
    không bao giờ gọi từ app đã đóng gói gửi cho khách."""
    with open(private_key_path, "rb") as f:
        raw = f.read()
    private_key = Ed25519PrivateKey.from_private_bytes(raw)
    signature = private_key.sign(_payload(app_id, machine_sum))
    return _b64_encode(signature)


def verify_signature(app_id: int, machine_sum: int, signature_b64: str) -> bool:
    """App dùng hàm này để verify — chỉ cần public key, không cần private key."""
    if not PUBLIC_KEY_HEX:
        return False
    try:
        signature = _b64_decode(signature_b64)
        public_key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(PUBLIC_KEY_HEX))
        public_key.verify(signature, _payload(app_id, machine_sum))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False
