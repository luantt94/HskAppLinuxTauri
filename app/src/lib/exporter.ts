// Xuất flashcard: vẽ trang PDF / khung video bằng canvas (dùng font hệ thống nên chữ Hán hiển thị đúng),
// rồi gửi sang Rust ghép thành PDF / mp4 / .apkg. Port của games/export_dialog.py.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import type { Word } from "./types";

const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
const TEXT = "#111827", SUB = "#334155", PINYIN = "#64748B", BLUE = "#2563eb";

export type ExportOptions = { pdf: boolean; video: boolean; anki: boolean };
export type Progress = (label: string, current: number, total: number) => void;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, g: c.getContext("2d")! };
}

/** Vẽ chữ xuống dòng tự động trong khung (x,y,w) căn giữa; trả về y sau dòng cuối. */
function drawWrapped(g: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number): number {
  for (const para of text.split("\n")) {
    let line = "";
    for (const ch of para) {
      if (g.measureText(line + ch).width > maxW && line) { g.fillText(line, cx, y); y += lineH; line = ch; }
      else line += ch;
    }
    g.fillText(line, cx, y); y += lineH;
  }
  return y;
}

// ------------------------------------------------------------ PDF
const PAGE_W = 1240, PAGE_H = 1754; // A4 @150dpi
const cover = (g: CanvasRenderingContext2D, total: number, scope: string, title: string) => {
  g.fillStyle = "#fff"; g.fillRect(0, 0, PAGE_W, PAGE_H);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = BLUE; g.font = `bold 58px ${FONT}`; g.fillText(title, PAGE_W / 2, PAGE_H * 0.32);
  g.fillStyle = TEXT; g.font = `28px ${FONT}`;
  g.fillText(`Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}`, PAGE_W / 2, PAGE_H * 0.32 + 120);
  g.fillText(`Phạm vi: ${scope}`, PAGE_W / 2, PAGE_H * 0.32 + 170);
  g.fillText(`Tổng số từ: ${total}`, PAGE_W / 2, PAGE_H * 0.32 + 220);
};

function card(g: CanvasRenderingContext2D, w: Word, x: number, y: number, cw: number, ch: number) {
  g.fillStyle = "#f8fafc"; g.strokeStyle = "#cbd5e1"; g.lineWidth = 2;
  g.beginPath(); g.roundRect(x, y, cw, ch, 20); g.fill(); g.stroke();
  g.textAlign = "center"; g.textBaseline = "middle";
  const cx = x + cw / 2, inner = cw - 40;
  g.fillStyle = TEXT; g.font = `bold 62px ${FONT}`; g.fillText(w.zh, cx, y + ch * 0.2);
  g.fillStyle = PINYIN; g.font = `28px ${FONT}`; g.fillText(w.pinyin || "", cx, y + ch * 0.4);
  g.fillStyle = BLUE; g.font = `bold 32px ${FONT}`; g.textBaseline = "top";
  const after = drawWrapped(g, w.vi || "", cx, y + ch * 0.48, inner, 38);
  if (w.exCn) { g.fillStyle = SUB; g.font = `22px ${FONT}`; drawWrapped(g, w.exCn + (w.exVi ? "\n" + w.exVi : ""), cx, after + 6, inner, 28); }
}

export function renderPdfPages(words: Word[], scope: string, title: string, onProgress?: (i: number, n: number) => void) {
  const pages: { w: number; h: number; b64: string }[] = [];
  const toPage = (c: HTMLCanvasElement) => ({ w: c.width, h: c.height, b64: c.toDataURL("image/jpeg", 0.9).split(",")[1] });
  { const { c, g } = canvas(PAGE_W, PAGE_H); cover(g, words.length, scope, title); pages.push(toPage(c)); }
  const margin = 60, gap = 22, cols = 2, rows = 4, per = cols * rows;
  const cw = (PAGE_W - 2 * margin - (cols - 1) * gap) / cols, chh = (PAGE_H - 2 * margin - (rows - 1) * gap) / rows;
  for (let p = 0; p * per < words.length; p++) {
    const { c, g } = canvas(PAGE_W, PAGE_H);
    g.fillStyle = "#fff"; g.fillRect(0, 0, PAGE_W, PAGE_H);
    words.slice(p * per, (p + 1) * per).forEach((w, k) => {
      const r = Math.floor(k / cols), col = k % cols;
      card(g, w, margin + col * (cw + gap), margin + r * (chh + gap), cw, chh);
    });
    pages.push(toPage(c));
    onProgress?.(Math.min((p + 1) * per, words.length), words.length);
  }
  return pages;
}

// ------------------------------------------------------------ Video
const VW = 1280, VH = 720;
const pngOf = (c: HTMLCanvasElement) => c.toDataURL("image/png").split(",")[1];
const bg = (g: CanvasRenderingContext2D) => { g.fillStyle = BLUE; g.fillRect(0, 0, VW, VH); g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; };

export function introFrame(total: number, scope: string): string {
  const { c, g } = canvas(VW, VH); bg(g);
  g.font = `bold 58px ${FONT}`; g.fillText("HskApp — Bộ Flashcard", VW / 2, VH * 0.34);
  g.font = `28px ${FONT}`; g.fillText(`Phạm vi: ${scope}`, VW / 2, VH * 0.5); g.fillText(`Tổng số từ: ${total}`, VW / 2, VH * 0.58);
  return pngOf(c);
}

export function wordFrame(w: Word): string {
  const { c, g } = canvas(VW, VH); bg(g);
  g.font = `bold 120px ${FONT}`; g.fillText(w.zh, VW / 2, VH * 0.24);
  g.font = `40px ${FONT}`; g.fillText(w.pinyin || "", VW / 2, VH * 0.47);
  g.font = `bold 46px ${FONT}`; g.textBaseline = "top"; const y = drawWrapped(g, w.vi || "", VW / 2, VH * 0.54, VW - 120, 56);
  if (w.exCn) { g.font = `30px ${FONT}`; drawWrapped(g, [w.exCn, w.pySent, w.exVi].filter(Boolean).join("\n"), VW / 2, Math.max(y + 8, VH * 0.7), VW - 160, 38); }
  return pngOf(c);
}

// ------------------------------------------------------------ chạy xuất
const stamp = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

/** Xuất PDF danh sách từ (dùng cho "Xuất PDF từ sai" của Từ rơi). Trả về đường dẫn hoặc null nếu huỷ. */
export async function exportWordsPdf(words: Word[], scope: string, title: string): Promise<string | null> {
  const path = await save({ defaultPath: `HskApp_TuSai_${stamp()}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }], title: "Xuất PDF" });
  if (!path) return null;
  await invoke("export_pdf", { path, pages: renderPdfPages(words, scope, title) });
  alert(`Đã lưu ${words.length} từ vào:\n${path}`);
  return path;
}

export async function runExport(opts: ExportOptions, words: Word[], scope: string, onProgress: Progress, cancelled: () => boolean): Promise<string[]> {
  const out: string[] = [];
  const ask = async (name: string, ext: string, label: string) =>
    save({ defaultPath: `HskApp_${name}_${stamp()}.${ext}`, filters: [{ name: label, extensions: [ext] }], title: `Lưu ${label}` });

  if (opts.pdf) {
    const path = await ask("Flashcard", "pdf", "PDF");
    if (path) {
      onProgress("Đang tạo PDF…", 0, words.length);
      const pages = renderPdfPages(words, scope, "HskApp — Bộ Flashcard", (i, n) => onProgress("Đang tạo PDF…", i, n));
      await invoke("export_pdf", { path, pages });
      out.push(path);
    }
  }
  if (opts.video && !cancelled()) {
    const path = await ask("Flashcard", "mp4", "Video MP4");
    if (path) {
      await invoke("export_video_begin");
      try {
        onProgress("Video: mở đầu…", 0, words.length + 1);
        await invoke("export_video_add", { pngB64: introFrame(words.length, scope), speak: null, intro: true });
        for (let i = 0; i < words.length; i++) {
          if (cancelled()) { await invoke("export_video_abort"); return out; }
          await invoke("export_video_add", { pngB64: wordFrame(words[i]), speak: words[i].zh, intro: false });
          onProgress(`Video: ${words[i].zh}`, i + 1, words.length + 1);
        }
        await invoke("export_video_finish", { path });
        out.push(path);
      } catch (e) { await invoke("export_video_abort"); throw e; }
    }
  }
  if (opts.anki && !cancelled()) {
    const path = await ask("Flashcard", "apkg", "Anki (.apkg)");
    if (path) {
      const un = await listen<{ current: number; total: number }>("export-progress", (e) => onProgress("Anki: đang tạo giọng đọc…", e.payload.current, e.payload.total));
      try { await invoke("export_anki", { path, words, scopeLabel: scope }); out.push(path); } finally { un(); }
    }
  }
  return out;
}
