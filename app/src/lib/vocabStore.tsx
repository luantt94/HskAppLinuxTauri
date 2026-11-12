// "Nguồn từ vựng" đang học — dùng CHUNG cho mọi tab (như VocabularyManager của Python).
// Đổi cấp/chủ đề ở panel phải thì mọi tab đọc lại `items` qua useVocab().
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { LEVELS, levelParts, loadCollocations, loadCourses } from "./data";
import { loadJson, saveJson } from "./storage";
import type { Word } from "./types";

export type Source =
  | { kind: "levels"; levels: string[] }
  | { kind: "part"; level: string; part: number } // part: 1-based
  | { kind: "course"; topic: string }
  | { kind: "colloc"; level: string; topic: string }
  | { kind: "custom"; name: string };

/** Bộ từ tự tạo lưu thành file JSON trong ~/Documents/HskApp/BaiHoc (xem src-tauri/src/sets.rs). */
export type CustomSet = { name: string; path: string; count: number };

type VocabCtx = {
  items: Word[];
  source: Source;
  label: string;
  setSource: (s: Source) => void;
  customSets: CustomSet[];
  saveCustomSet: (name: string, items: Word[]) => Promise<string>;
  deleteCustomSet: (path: string) => Promise<void>;
  reloadSets: () => Promise<CustomSet[]>;
};

const Ctx = createContext<VocabCtx | null>(null);
const SRC_KEY = "vocab.source";
const LEGACY_KEY = "vocab.customSets"; // bản đầu lưu bộ tự tạo trong localStorage — chuyển sang file một lần

export function VocabProvider({ children }: { children: ReactNode }) {
  const [source, setSourceState] = useState<Source>(() => loadJson<Source>(SRC_KEY, { kind: "levels", levels: ["hsk1_v3"] }));
  const [customSets, setCustomSets] = useState<CustomSet[]>([]);
  const reloadSets = useCallback(async () => { const l = await api.setsList(); setCustomSets(l); return l; }, []);

  useEffect(() => {
    (async () => {
      const legacy = loadJson<{ name: string; items: Word[] }[]>(LEGACY_KEY, []);
      for (const s of legacy) await api.setSave(s.name, s.items).catch(console.error);
      if (legacy.length) saveJson(LEGACY_KEY, []);
      await reloadSets();
    })().catch((e) => console.error("sets", e));
  }, [reloadSets]);
  const [items, setItems] = useState<Word[]>([]);

  // Tính lại danh sách từ mỗi khi nguồn đổi. Course/colloc nạp bất đồng bộ (async) nên cần useEffect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let words: Word[] = [];
      if (source.kind === "levels") words = source.levels.flatMap((l) => LEVELS[l] ?? []);
      else if (source.kind === "part") words = levelParts(source.level)[source.part - 1] ?? [];
      else if (source.kind === "course") words = (await loadCourses())[source.topic] ?? [];
      else if (source.kind === "colloc") words = (await loadCollocations())[source.level]?.[source.topic] ?? [];
      else {
        const set = customSets.find((c) => c.name === source.name);
        words = set ? await api.setRead(set.path).catch(() => []) : [];
      }
      if (!cancelled) setItems(words);
    })();
    return () => {
      cancelled = true;
    };
  }, [source, customSets]);

  const value = useMemo<VocabCtx>(
    () => ({
      items,
      source,
      label: sourceLabel(source),
      setSource: (s) => {
        setSourceState(s);
        saveJson(SRC_KEY, s);
      },
      customSets,
      saveCustomSet: async (name, items) => {
        const path = await api.setSave(name, items);
        await reloadSets();
        return path;
      },
      deleteCustomSet: async (path) => {
        await api.setDelete(path);
        await reloadSets();
      },
      reloadSets,
    }),
    [items, source, customSets, reloadSets],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVocab(): VocabCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVocab phải nằm trong <VocabProvider>");
  return v;
}

function sourceLabel(s: Source): string {
  switch (s.kind) {
    case "levels":
      return s.levels.map((l) => l.replace("_v3", "").toUpperCase()).join(" + ");
    case "part":
      return `${s.level.replace("_v3", "").toUpperCase()} · Phần ${s.part}`;
    case "course":
      return s.topic;
    case "colloc":
      return `${s.level.toUpperCase()} · ${s.topic}`;
    case "custom":
      return s.name;
  }
}
