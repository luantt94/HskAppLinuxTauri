// Hộp "Cài đặt": cỡ chữ, âm lượng, bản quyền, reset tiến độ — mỗi mục một dòng (nhãn trái, điều khiển phải).
import { useState } from "react";
import { api } from "../lib/api";
import { ActivationForm, useLicense } from "./Gate";
import { DEFAULT_FONT_PT, useSettings } from "../lib/settings";
import { useVocab } from "../lib/vocabStore";
import Icon from "./Icon";
import ResetDialog from "./ResetDialog";

const MIN_PT = 8, MAX_PT = 20;

export default function SettingsPanel({ onChanged }: { onChanged: () => void }) {
  const { fontPt, setFontPt, volume, setVolume } = useSettings();
  const { items, label } = useVocab();
  const { status, refresh: refreshLicense } = useLicense();
  const [msg, setMsg] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const vol = Math.round(volume * 100);

  async function reset() {
    if (!window.confirm(`Xoá HẲN tiến độ ôn tập của ${items.length} từ trong "${label}"? Không hoàn tác được.`)) return;
    const n = await api.srsResetWords(items.map((w) => w.zh));
    setMsg(`Đã xoá tiến độ của ${n} từ.`);
    onChanged();
  }

  return (
    <div className="settings">
      <h3>Giao diện & âm thanh</h3>
      <div className="set-list">
        <div className="set-row">
          <div className="lbl">Cỡ chữ<small>Áp dụng cho toàn bộ ứng dụng</small></div>
          {fontPt !== DEFAULT_FONT_PT && <button className="ghost small" onClick={() => setFontPt(DEFAULT_FONT_PT)}>Mặc định</button>}
          <div className="stepper">
            <button disabled={fontPt <= MIN_PT} onClick={() => setFontPt(Math.max(MIN_PT, fontPt - 1))} title="Nhỏ hơn">A−</button>
            <b className="stat">{fontPt}</b>
            <button disabled={fontPt >= MAX_PT} onClick={() => setFontPt(Math.min(MAX_PT, fontPt + 1))} title="Lớn hơn">A+</button>
          </div>
        </div>
        <div className="set-row">
          <div className="lbl">Âm lượng</div>
          <button className="ghost icon" onClick={() => setVolume(vol ? 0 : 1)} title={vol ? "Tắt tiếng" : "Bật tiếng"}><Icon name={vol ? "volume" : "volumeOff"} /></button>
          <input type="range" min={0} max={100} value={vol} onChange={(e) => setVolume(Number(e.target.value) / 100)} style={{ width: "9rem" }} />
          <b className="stat" style={{ minWidth: "2.8rem", textAlign: "right" }}>{vol}%</b>
        </div>
      </div>

      <h3>Bản quyền</h3>
      <div className="set-list">
        {!status ? (
          <div className="set-row muted small">Đang tải…</div>
        ) : status.activated ? (
          <div className="set-row"><Icon name="checkCircle" className="ok" /><div className="lbl ok">Đã kích hoạt<small>Dùng không giới hạn trên máy này</small></div></div>
        ) : (
          <div className="set-pad"><ActivationForm status={status} onActivated={refreshLicense} /></div>
        )}
      </div>

      <h3>Dữ liệu học</h3>
      <div className="set-list">
        <div className="set-row">
          <div className="lbl">Reset bộ đang chọn<small>Xoá tiến độ ôn của {items.length} từ trong “{label}”</small></div>
          <button className="danger" onClick={reset}><Icon name="trash" size={16} />Reset</button>
        </div>
        <div className="set-row">
          <div className="lbl">Reset theo bộ dữ liệu<small>Chọn nhiều cấp / chủ đề / bộ để xoá cùng lúc</small></div>
          <button onClick={() => setResetOpen(true)}>Chọn bộ…</button>
        </div>
        {msg && <div className="set-row ok small">{msg}</div>}
      </div>
      {resetOpen && <ResetDialog onClose={() => setResetOpen(false)} onDone={onChanged} />}
    </div>
  );
}
