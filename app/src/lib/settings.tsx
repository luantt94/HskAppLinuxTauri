// Cài đặt chung (cỡ chữ, âm lượng) — áp dụng cho toàn app.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api } from "./api";
import { loadJson, usePersistent } from "./storage";

type S = { fontPt: number; setFontPt: (n: number) => void; volume: number; setVolume: (n: number) => void };
const Ctx = createContext<S | null>(null);

// Âm lượng module-level để các hàm phát âm (không phải component) đọc được.
let currentVolume = 1;
export const DEFAULT_FONT_PT = 10;
export const getVolume = () => currentVolume;

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fontPt, setFontPt] = usePersistent("ui.fontPt", DEFAULT_FONT_PT);
  const [volume, setVolume] = usePersistent("audio.volume", 1);
  // Lần đầu (chưa có cài đặt mới): nhập âm lượng/cỡ chữ từ bản Python (QSettings) để không bị "reset".
  useEffect(() => {
    if (loadJson<number | null>("audio.volume", null) === null)
      api.settingGet("audio/volume").then((v) => { const n = Number(v); if (v !== null && n >= 0 && n <= 1) setVolume(n); }).catch(() => {});
    if (loadJson<number | null>("ui.fontPt", null) === null)
      api.settingGet("ui/font_pt").then((v) => { const n = Number(v); if (v !== null && n >= 8 && n <= 20) setFontPt(n); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { document.documentElement.style.fontSize = `${fontPt * 1.4545}px`; }, [fontPt]);
  useEffect(() => { currentVolume = volume; }, [volume]);
  return <Ctx.Provider value={{ fontPt, setFontPt, volume, setVolume }}>{children}</Ctx.Provider>;
}

export function useSettings(): S {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings phải nằm trong <SettingsProvider>");
  return v;
}
