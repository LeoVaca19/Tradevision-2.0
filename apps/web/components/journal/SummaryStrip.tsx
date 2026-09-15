import type { ReactNode } from "react";
import { formatSigned, signClass } from "@/lib/format";
import type { JournalSummary } from "@/lib/journal";

function Money({ value }: { value: number }) {
  return <span className={signClass(value)}>{formatSigned(value)}</span>;
}

function pct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}

function num(v: number | null, digits = 2): string {
  return v == null ? "—" : v.toFixed(digits);
}

export function SummaryStrip({ summary }: { summary: JournalSummary }) {
  const cells: { label: string; value: ReactNode }[] = [
    { label: "Operaciones", value: summary.count },
    { label: "Neto", value: <Money value={summary.netCurrency} /> },
    { label: "Win Rate", value: pct(summary.winRatePct) },
    { label: "Expectancy (R)", value: num(summary.expectancyR) },
    { label: "Profit Factor", value: num(summary.profitFactor) },
    { label: "Drawdown máx. (R)", value: num(summary.maxDrawdownR) },
    { label: "Mejor racha", value: summary.bestWinStreak ?? "—" },
  ];

  return (
    <div className="tv-summary">
      {cells.map((c) => (
        <div key={c.label} className="tv-card">
          <span className="tv-metric-label">{c.label}</span>
          <div className="tv-metric-value">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
