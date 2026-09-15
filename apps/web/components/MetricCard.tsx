import type { StatResult } from "@tradevision/contracts";
import { StatBadge } from "./StatBadge";
import { formatMetricValue, metricLabel } from "@/lib/format";

export function MetricCard({ result }: { result: StatResult }) {
  const insufficient = result.value.kind === "insufficient_data";
  const value = result.value.kind === "value" ? result.value.value : undefined;

  return (
    <div className="tv-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
        <span className="tv-metric-label">{metricLabel(result.metric)}</span>
        <StatBadge state={insufficient ? "insufficient" : result.sealed ? "verified" : "declared"} />
      </div>
      <div className="tv-metric-value">{formatMetricValue(result.value.kind, result.metric, value)}</div>
      <div className="tv-sample">
        {insufficient
          ? `Muestra ${result.sampleSize}/30 — datos insuficientes`
          : `n = ${result.sampleSize} · motor v${result.engineVersion}`}
      </div>
      {result.metric === "max_drawdown" && result.detail && "propFirmReference" in result.detail ? (
        <p className="tv-sample" style={{ marginTop: 8 }}>
          {result.detail.propFirmReference}
        </p>
      ) : null}
    </div>
  );
}
