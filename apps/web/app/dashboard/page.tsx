import type { Metric } from "@tradevision/contracts";
import { MetricCard } from "@/components/MetricCard";
import { StatBadge } from "@/components/StatBadge";
import { RadarChart, type RadarAxisPoint } from "@/components/dashboard/RadarChart";
import { currentUser, getDashboardStats, USING_REAL_DB } from "@/lib/data";
import { formatMetricValue, radarAxisLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const PERFORMANCE: Metric[] = ["win_rate", "expectancy", "r_multiple_avg", "profit_factor"];
const RISK: Metric[] = ["max_drawdown", "streaks", "sharpe_ratio", "z_score"];

function pct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}

export default async function DashboardPage() {
  const [user, stats] = await Promise.all([currentUser(), getDashboardStats()]);
  const byMetric = (keys: Metric[]) =>
    keys
      .map((k) => stats.metrics.find((m) => m.metric === k))
      .filter((m): m is (typeof stats.metrics)[number] => m != null);

  const radarPoints: RadarAxisPoint[] = stats.radar.axes.map((a) => ({
    key: a.axis,
    label: radarAxisLabel(a.axis),
    value: a.value.kind === "value" ? a.value.value : null,
  }));

  const composite = stats.radar.composite;

  return (
    <div className="tv-container">
      <div className="tv-page-head">
        <div>
          <h1>Panel</h1>
          <p>Motor v{stats.engineVersion} — cada cifra abre hasta las operaciones que la sustentan.</p>
        </div>
        {!USING_REAL_DB ? (
          <span className="tv-badge" data-state="stale">
            <span aria-hidden>↻</span> Modo demo — datos sintéticos, @{user.handle}
          </span>
        ) : null}
      </div>

      <section>
        <h2 className="tv-section-title">Rendimiento</h2>
        <div className="tv-grid">
          {byMetric(PERFORMANCE).map((m) => (
            <MetricCard key={m.metric} result={m} />
          ))}
        </div>
      </section>

      <section className="tv-section">
        <h2 className="tv-section-title">Riesgo</h2>
        <div className="tv-grid">
          {byMetric(RISK).map((m) => (
            <MetricCard key={m.metric} result={m} />
          ))}
        </div>
      </section>

      <section className="tv-section">
        <h2 className="tv-section-title">Radar Score</h2>
        <div className="tv-card tv-radar-card">
          <div className="tv-radar-chart-col">
            <RadarChart axes={radarPoints} />
          </div>
          <div className="tv-radar-list-col">
            <div className="tv-radar-composite">
              <span className="tv-metric-label">Compuesto</span>
              <div className="tv-metric-value">
                {composite.kind === "value" ? composite.value.toFixed(1) : "—"}
              </div>
              <StatBadge state="declared" />
            </div>
            <ul className="tv-radar-axis-list">
              {stats.radar.axes.map((a) => (
                <li key={a.axis} className="tv-radar-axis-row">
                  <div>
                    <span className="tv-radar-axis-label">{radarAxisLabel(a.axis)}</span>
                    <span className="tv-sample">
                      peso {(a.weight * 100).toFixed(0)}% · n={a.sampleSize}
                    </span>
                  </div>
                  <span className="tv-radar-axis-value">
                    {a.value.kind === "value" ? a.value.value.toFixed(1) : "—"}
                    <StatBadge state={a.value.kind === "insufficient_data" ? "insufficient" : "verified"} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="tv-section">
        <h2 className="tv-section-title">Plan vs Ejecutado</h2>
        <div className="tv-card">
          <div className="tv-cmp">
            <div>
              <div className="tv-cmp-row-head">
                <span className="tv-metric-label">Ejecutado — Win Rate</span>
                <span className="tv-cmp-pct">{pct(stats.planVsExecuted.executed.winRate)}</span>
              </div>
              <div className="tv-cmp-bar">
                <div
                  className="tv-cmp-bar-fill"
                  style={{ width: `${Math.max(0, Math.min(100, (stats.planVsExecuted.executed.winRate ?? 0) * 100))}%` }}
                />
              </div>
              <span className="tv-sample">
                n={stats.planVsExecuted.executed.count} · expectancy{" "}
                {stats.planVsExecuted.executed.expectancyR?.toFixed(2) ?? "—"} R
              </span>
            </div>
            <div>
              <div className="tv-cmp-row-head">
                <span className="tv-metric-label">No tomadas — Win Rate hipotético</span>
                <span className="tv-cmp-pct">{pct(stats.planVsExecuted.notTaken.hypotheticalWinRate)}</span>
              </div>
              <div className="tv-cmp-bar">
                <div
                  className="tv-cmp-bar-fill"
                  data-hypothetical="true"
                  style={{
                    width: `${Math.max(0, Math.min(100, (stats.planVsExecuted.notTaken.hypotheticalWinRate ?? 0) * 100))}%`,
                  }}
                />
              </div>
              <span className="tv-sample">
                n={stats.planVsExecuted.notTaken.count} · fuera del MVP hasta que exista el estimador
                (FR-25) — hoy siempre sin dato
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
