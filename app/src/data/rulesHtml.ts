// Nội dung tĩnh "Hướng dẫn" (nét cơ bản + quy tắc bút thuận) — lấy từ games/hanzi_writing/rules_view.py
export const RULES_HTML = `
<style>
  body { font-family: sans-serif; color: #222222; line-height: 1.5; }
  h2 { color: #2b2b2b; margin-top: 18px; }
  h3 { color: #444444; margin-top: 14px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #dddddd; padding: 6px 10px; text-align: left; font-size: 13px; }
  th { background-color: #f0f0f0; }
  .hanzi-cell { font-size: 20px; text-align: center; }
  ol { padding-left: 20px; }
  li { margin-bottom: 6px; }
</style>

<h2>Các nét cơ bản trong chữ Hán</h2>
<table>
  <tr><th>Nét</th><th>Tên (Hán/Pinyin)</th><th>Tên tiếng Việt</th><th>Mô tả</th></tr>
  <tr><td class="hanzi-cell">一</td><td>横 (héng)</td><td>Ngang</td><td>Nét kéo ngang từ trái sang phải</td></tr>
  <tr><td class="hanzi-cell">丨</td><td>竖 (shù)</td><td>Sổ (dọc)</td><td>Nét kéo thẳng từ trên xuống dưới</td></tr>
  <tr><td class="hanzi-cell">丿</td><td>撇 (piě)</td><td>Phẩy</td><td>Nét xiên từ trên xuống, chếch sang trái</td></tr>
  <tr><td class="hanzi-cell">丶</td><td>点 (diǎn)</td><td>Chấm</td><td>Nét chấm nhỏ, thường xiên xuống</td></tr>
  <tr><td class="hanzi-cell">㇏</td><td>捺 (nà)</td><td>Mác</td><td>Nét xiên từ trên xuống, chếch sang phải</td></tr>
  <tr><td class="hanzi-cell">㇀</td><td>提 (tí)</td><td>Hất</td><td>Nét hất chếch lên từ dưới trái lên trên phải</td></tr>
  <tr><td class="hanzi-cell">亅</td><td>竖钩 (shùgōu)</td><td>Sổ móc</td><td>Nét sổ, cuối nét có móc</td></tr>
  <tr><td class="hanzi-cell">㇕</td><td>横折 (héngzhé)</td><td>Ngang gấp</td><td>Nét ngang rồi gấp xuống thành nét sổ</td></tr>
</table>

<h2>Quy tắc thứ tự viết nét (bút thuận - 笔顺规则)</h2>
<ol>
  <li><b>Ngang trước, sổ sau</b> (先横后竖): ví dụ chữ 十, 干 — viết nét ngang trước rồi mới đến nét sổ.</li>
  <li><b>Phẩy trước, mác sau</b> (先撇后捺): ví dụ chữ 人, 八 — nét phẩy (xiên trái) viết trước nét mác (xiên phải).</li>
  <li><b>Trên trước, dưới sau</b> (从上到下): ví dụ chữ 三, 字 — viết từ phần trên xuống phần dưới.</li>
  <li><b>Trái trước, phải sau</b> (从左到右): ví dụ chữ 明, 你 — viết từ phần bên trái sang phần bên phải.</li>
  <li><b>Ngoài trước, trong sau</b> (从外到内): ví dụ chữ 月, 同 — viết khung/bộ phận bao ngoài trước khi viết nét bên trong.</li>
  <li><b>Vào trước, đóng sau</b> (先里头后封口): ví dụ chữ 回, 国 — viết các nét bên trong (hoặc đáy) trước, nét khép kín khung viết sau cùng.</li>
  <li><b>Giữa trước, hai bên sau</b> (先中间后两边): ví dụ chữ 小, 水 — với chữ đối xứng, viết nét giữa trước rồi mới đến hai bên.</li>
  <li><b>Bộ thủ bên trái viết trước</b>: với chữ ghép có bộ thủ (như 氵, 亻, 讠), phần bộ thủ thường được viết trước phần còn lại.</li>
</ol>

<h2>Một số lưu ý khi luyện viết</h2>
<ul>
  <li>Luôn viết trong khung 田字格 (ô chữ điền) để giữ đúng tỷ lệ và vị trí các nét.</li>
  <li>Viết theo đúng thứ tự nét giúp chữ cân đối hơn và là quy chuẩn khi viết chữ Hán, kể cả khi viết nhanh (chữ thảo/hành).</li>
  <li>Nên quan sát kỹ hoạt hình mẫu ở tab "Quy tắc viết" trước khi tự luyện, sau đó dùng tab "Luyện viết" và "Điền nét" để tự viết lại nhiều lần cách viết của từ.</li>
</ul>
`;
