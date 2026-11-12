// Tab "📊 Tiến độ" — port của ui/stats_tab.py.
import { LEVEL_LABELS, LEVEL_ORDER, LEVELS } from "../lib/data";
import Icon, { type IconName } from "../components/Icon";
import { useProgress } from "../lib/progress";

const heatColor = (n: number) => (n <= 0 ? "#e9edf2" : n <= 2 ? "#c6e6c9" : n <= 6 ? "#86d492" : n <= 14 ? "#4bb563" : "#2f8f45");
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const WEEKS = 19;

export default function ProgressTab() {
  const { overview: o, known } = useProgress();
  if (!o) return <p>Đang tải…</p>;

  // Lưới 19 tuần x 7 ngày, cột đầu bắt đầu từ thứ Hai (như bản Python).
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const start = new Date(monday);
  start.setDate(monday.getDate() - 7 * (WEEKS - 1));
  const cells: { key: string; n: number; future: boolean }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      const k = iso(day);
      cells.push({ key: k, n: o.dailyCounts[k] ?? 0, future: day > today });
    }
  }
  const max14 = Math.max(1, ...o.last14.map((x) => x.count));

  return (
    <div>
      <div className="tiles">
        <Tile icon="flame" tone="#ea580c" bg="#fff1e6" v={`${o.streak} ngày`} c={`Chuỗi ngày · kỷ lục ${o.longestStreak}`} />
        <Tile icon="checkCircle" tone="#16a34a" bg="#dcfce7" v={o.distinctToday} c="Đã ôn hôm nay" />
        <Tile icon="book" tone="#2563eb" bg="#e8f0ff" v={known.size} c="Từ đã nắm" />
        <Tile icon="clock" tone="#d97706" bg="#fef3c7" v={o.srs.due} c="Đến hạn ôn" />
        <Tile icon="target" tone="#7c3aed" bg="#f1e9ff" v={o.accuracy30 === null ? "—" : `${Math.round(o.accuracy30)}%`} c="Chính xác 30N" />
      </div>

      <h3>Hoạt động ôn tập · {WEEKS} tuần gần nhất</h3>
      <div className="card" style={{ overflowX: "auto" }}><div className="heat">
        {cells.map((c) => (
          <i key={c.key} title={`${c.key}: ${c.n} lượt ôn`} style={{ background: c.future ? "transparent" : heatColor(c.n) }} />
        ))}
      </div></div>

      <h3>Số lượt ôn 14 ngày gần nhất</h3>
      <div className="card"><div className="bars">
        {o.last14.map((x) => (
          <div className="b" key={x.day} title={x.day}>
            {x.count}
            <div style={{ height: `${(x.count / max14) * 100}%`, background: x.count ? undefined : "#cbd5e1", minHeight: 2 }} />
            {Number(x.day.slice(8))}
          </div>
        ))}
      </div></div>

      <h3>Từ đã nắm theo cấp HSK</h3>
      <div className="card">
      {LEVEL_ORDER.map((lv) => {
        const words = LEVELS[lv] ?? [];
        const got = words.filter((w) => known.has(w.zh)).length;
        const pct = words.length ? (got / words.length) * 100 : 0;
        return (
          <div className="lvl-row" key={lv}>
            <span>{LEVEL_LABELS[lv]}</span>
            <span className="muted">{got} / {words.length}</span>
            <div className="pbar"><div style={{ width: `${pct}%` }} /></div>
          </div>
        );
      })}
      </div>

      <p className="muted small" style={{ marginTop: 14 }}>
        Ôn tập: {o.srs.learned} từ đang nhớ · {o.srs.new} từ mới chưa ôn. Tổng lượt ôn đã ghi: {o.totalReviews}.
        “Từ đã nắm” = đã thuộc theo Ôn tập (chưa quá hạn ôn).
      </p>
    </div>
  );
}

function Tile({ v, c, icon, tone, bg }: { v: string | number; c: string; icon: IconName; tone: string; bg: string }) {
  return (
    <div className="card tile">
      <div className="ico" style={{ background: bg, color: tone }}><Icon name={icon} size={22} /></div>
      <div><div className="v">{v}</div><div className="c">{c}</div></div>
    </div>
  );
}
