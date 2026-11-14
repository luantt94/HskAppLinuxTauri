// Điều kiện chung cho phím tắt toàn cửa sổ của các tab học (Flashcard, Trắc nghiệm, Điền từ…).

/** true = bỏ qua phím tắt: đang gõ trong ô nhập, đang giữ Ctrl/Alt/⌘, hoặc đang mở hộp thoại / menu / ô chọn
 *  (phím đó thuộc về cửa sổ nổi chứ không phải bài đang học phía sau). */
export function shortcutBlocked(e: KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  return !!document.querySelector(".modal-back, .menu-pop, .sel-pop");
}
