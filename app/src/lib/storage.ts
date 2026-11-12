// Lưu cài đặt giao diện vào localStorage của webview. Bọc try/catch vì có thể bị
// chặn/trống (chế độ riêng tư...) — app vẫn phải chạy được khi không lưu được.
import { useCallback, useState } from "react";

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* bỏ qua */
  }
}

/** Như useState nhưng tự lưu/khôi phục theo `key` (hook = hàm dùng được trong component React). */
export function usePersistent<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => loadJson(key, initial));
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        saveJson(key, next);
        return next;
      });
    },
    [key],
  );
  return [value, set];
}
