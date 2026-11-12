// Panel phải "Cài đặt": cỡ chữ, âm lượng chung, reset tiến độ theo bộ đang chọn.
import { useState } from "react";
import { api } from "../lib/api";
import { ActivationForm, useLicense } from "./Gate";
import { useSettings } from "../lib/settings";
import { useVocab } from "../lib/vocabStore";
import Icon from "./Icon";
import ResetDialog from "./ResetDialog";

export default function SettingsPanel({ onChanged }: { onChanged: () => void }) {
  const { fontPt, setFontPt, volume, setVolume } = useSettings();
  const { items, label } = useVocab();
  const { status, refresh: refreshLicense } = useLicense();
  const [msg, setMsg] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  async function reset() {
    if (!window.confirm(`Xoá HẲN tiến độ ôn tập của ${items.length} từ trong "${label}"? Không hoàn tác được.`)) return;
    const n = await api.srsResetWords(items.map((w) => w.zh));
    setMsg(`Đã xoá tiến độ của ${n} từ.`);
    onChanged();
  }

  const Slider = ({ title, value, text, min, max, onChange }: { title: string; value: number; text: string; min: number; max: number; onChange: (n: number) => void }) => (
    <div style={{ margin: ".6rem 0" }}>
      <div className="row" style={{ justifyContent: "space-between" }}><span>{title}</span><b className="stat">{text}</b></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%" }} />
    </div>
  );

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Giao diện</h3>
      <div className="card">
        <Slider title="Cỡ chữ" value={fontPt} text={`${fontPt}`} min={8} max={20} onChange={setFontPt} />
        <div className="row" style={{ marginTop: ".3rem" }}>
          <button onClick={() => setFontPt(Math.max(8, fontPt - 1))}>A−</button>
          <button onClick={() => setFontPt(11)}>Mặc định</button>
          <button onClick={() => setFontPt(Math.min(20, fontPt + 1))}>A+</button>
        </div>
      </div>
      <h3>Âm thanh</h3>
      <div className="card"><Slider title="Âm lượng" value={Math.round(volume * 100)} text={`${Math.round(volume * 100)}%`} min={0} max={100} onChange={(n) => setVolume(n / 100)} /></div>
      <h3>Bản quyền</h3>
      <div className="card">
        {!status ? (
          <p className="muted small">Đang tải…</p>
        ) : status.activated ? (
          <p className="ok small">✅ Đã kích hoạt — dùng không giới hạn trên máy này.</p>
        ) : (
          <ActivationForm status={status} onActivated={refreshLicense} />
        )}
      </div>
      <h3>Dữ liệu học</h3>
      <div className="card">
        <p className="muted small" style={{ marginBottom: ".6rem" }}>Chế độ học: Ôn tập (SRS).</p>
        <button className="danger" style={{ width: "100%" }} onClick={reset}><Icon name="trash" size={16} />Reset tiến độ bộ đang chọn</button>
        <button style={{ width: "100%", marginTop: ".5rem" }} onClick={() => setResetOpen(true)}><Icon name="list" size={16} />Reset theo bộ dữ liệu…</button>
        {msg && <p className="ok small" style={{ marginTop: ".5rem" }}>{msg}</p>}
      </div>
      {resetOpen && <ResetDialog onClose={() => setResetOpen(false)} onDone={onChanged} />}
    </div>
  );
}
