import { notFound } from "next/navigation";
import type { Metric } from "@tradevision/contracts";
import { MetricCard } from "@/components/MetricCard";
import { StatBadge } from "@/components/StatBadge";
import { RadarChart, type RadarAxisPoint } from "@/components/dashboard/RadarChart";
import { currentUserOrNull, getDashboardStats } from "@/lib/data";
import { radarAxisLabel } from "@/lib/format";

export const revalidate = 300;

const HEADLINE: Metric[] = ["win_rate", "profit_factor"];
const FULL: Metric[] = ["win_rate", "expectancy", "r_multiple_avg", "profit_factor", "max_drawdown", "streaks"];

/**
 * Perfil Público (FR-34). Sólo responde el handle del usuario en sesión (o el demo); cualquier otro es 404 en vez de inventar un perfil ajeno.
 */
export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const handle = raw.replace(/^@/, "").toLowerCase();

  const user = await currentUserOrNull();
  if (!user || handle !== user.handle) notFound();

  const level = user.publicProfileLevel;

  return (
    <div className="tv-container" style={{ maxWidth: 720 }}>
      <div className="tv-profile-head">
        <div className="tv-profile-avatar" aria-hidden>
          {user.handle.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1>@{user.handle}</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: 4 }}>
            {user.tier === "mentor" ? "Mentor" : "Cuenta gratuita"} · Ventana de Retardo:{" "}
            {user.delayWindowDays} día{user.delayWindowDays === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {level === "none" ? (
        <p className="tv-empty" style={{ marginTop: 32 }}>
          Este perfil no comparte estadísticas públicamente.
        </p>
      ) : (
        <PublicStats level={level} />
      )}
    </div>
  );
}

async function PublicStats({ level }: { level: "summary" | "metrics" | "detail" }) {
  const stats = await getDashboardStats();
  const keys = level === "summary" ? HEADLINE : FULL;
  const metrics = keys
    .map((k) => stats.metrics.find((m) => m.metric === k))
    .filter((m): m is (typeof stats.metrics)[number] => m != null);

  const radarPoints: RadarAxisPoint[] = stats.radar.axes.map((a) => ({
    key: a.axis,
    label: radarAxisLabel(a.axis),
    value: a.value.kind === "value" ? a.value.value : null,
  }));

  return (
    <div className="tv-section">
      <div className="tv-grid">
        {metrics.map((m) => (
          <MetricCard key={m.metric} result={m} />
        ))}
      </div>

      {level === "detail" ? (
        <div className="tv-card tv-section" style={{ marginTop: 24 }}>
          <div className="tv-radar-card">
            <div className="tv-radar-chart-col">
              <RadarChart axes={radarPoints} />
            </div>
            <div className="tv-radar-list-col">
              <span className="tv-metric-label">Radar Score</span>
              <div className="tv-metric-value">
                {stats.radar.composite.kind === "value" ? stats.radar.composite.value.toFixed(1) : "—"}
              </div>
              <StatBadge state="declared" />
              <p className="tv-sample" style={{ marginTop: 12 }}>
                Detalle de operaciones: pendiente de un listado público de Libro Verificado, todavía
                no expuesto por la fachada de datos.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <p className="tv-sample" style={{ marginTop: 16 }}>
        Cifras sujetas a la Ventana de Retardo del autor — nunca reflejan posiciones en curso.
      </p>
    </div>
  );
}
