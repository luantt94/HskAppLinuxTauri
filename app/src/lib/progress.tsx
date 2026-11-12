// Tiến độ học dùng chung: tab Tiến độ và panel Từ vựng (hiện % đã thuộc) đọc cùng một nguồn.
// Các game gọi refresh() sau khi chấm điểm để số liệu cập nhật ngay.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { ProgressOverview } from "./types";

type P = { overview: ProgressOverview | null; known: Set<string>; refresh: () => void };
const Ctx = createContext<P | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<ProgressOverview | null>(null);
  const refresh = useCallback(() => {
    api.progressOverview().then(setOverview).catch((e) => console.error("progress", e));
  }, []);
  useEffect(refresh, [refresh]);
  const known = useMemo(() => new Set(overview?.knownZh ?? []), [overview]);
  return <Ctx.Provider value={{ overview, known, refresh }}>{children}</Ctx.Provider>;
}

export function useProgress(): P {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProgress phải nằm trong <ProgressProvider>");
  return v;
}
