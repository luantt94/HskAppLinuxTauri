# auth/keygen.py
"""Chạy 1 LẦN DUY NHẤT trên máy bạn để tạo cặp khóa Ed25519 cho license:
    python auth/keygen.py

- Private key được lưu vào auth/.license_private_key (đã .gitignore —
  không commit, không đóng gói vào app). Giữ file này an toàn (ví dụ thêm
  vào backup riêng, có mật khẩu) — mất file này thì không cấp được license
  mới nữa (phải tạo lại cặp khóa khác và mọi key cũ sẽ không còn tin cậy
  theo khóa mới).
- Public key được in ra terminal — dán vào PUBLIC_KEY_HEX trong
  auth/license_crypto.py (hằng số này đi theo app, lộ ra ngoài không sao).

Nếu auth/.license_private_key đã tồn tại, script sẽ KHÔNG ghi đè (tránh lỡ
tay tạo khóa mới làm mọi license đã cấp theo khóa cũ thành vô hiệu).
"""
import os

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

_PRIVATE_KEY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".license_private_key")


def main():
    if os.path.exists(_PRIVATE_KEY_PATH):
        print(f"Đã có private key tại {_PRIVATE_KEY_PATH} — không tạo lại.")
        print("Nếu bạn CHẮC CHẮN muốn đổi khóa (mọi license cũ sẽ không còn hợp lệ "
              "theo khóa mới), hãy xóa file đó trước rồi chạy lại script này.")
        return

    private_key = Ed25519PrivateKey.generate()
    raw_private = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    raw_public = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )

    with open(_PRIVATE_KEY_PATH, "wb") as f:
        f.write(raw_private)
    os.chmod(_PRIVATE_KEY_PATH, 0o600)

    print(f"Đã tạo private key: {_PRIVATE_KEY_PATH} (giữ an toàn, đừng commit/chia sẻ)")
    print()
    print("Dán dòng dưới vào auth/license_crypto.py (PUBLIC_KEY_HEX):")
    print(f'PUBLIC_KEY_HEX = "{raw_public.hex()}"')


if __name__ == "__main__":
    main()
