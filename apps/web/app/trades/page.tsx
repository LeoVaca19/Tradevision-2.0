import Link from "next/link";
import { EquityCurve } from "@/components/journal/EquityCurve";
import { MonthCalendar } from "@/components/journal/MonthCalendar";
import { SummaryStrip } from "@/components/journal/SummaryStrip";
import { TradeRegistryView } from "@/components/journal/TradeRegistryView";
import type { CardTrade } from "@/components/journal/TradeCardGrid";
import { listManualTradesWithAnnotationSummary, listNotTakenTrades, USING_REAL_DB } from "@/lib/data";
import { cumulativeCurve, parseMonth, summarize } from "@/lib/journal";
import { formatDate, NOT_TAKEN_REASON_LABEL, SIDE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

function iso(d: string | Date): string {
  return typeof d === "string" ? d : d.toISOString();
}

function toCardTrade(row: Awaited<ReturnType<typeof listManualTradesWithAnnotationSummary>>[number]): CardTrade {
  return {
    id: row.id,
    instrument: row.instrument,
    side: row.side,
    openedAt: iso(row.openedAt),
    closedAt: iso(row.closedAt),
    pnlCurrency: row.pnlCurrency,
    pnlR: row.pnlR,
    firstAttachmentKey: row.firstAttachmentKey,
    hasJournalNote: row.hasJournalNote,
  };
}

export default async function TradesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const [manualRows, notTaken] = await Promise.all([
    listManualTradesWithAnnotationSummary(),
    listNotTakenTrades(),
  ]);

  const trades = manualRows.map(toCardTrade);
  const latestClose = trades.reduce<string | null>(
    (acc, t) => (acc == null || t.closedAt > acc ? t.closedAt : acc),
    null,
  );
  const { year, month } = parseMonth(sp.m, latestClose ? new Date(latestClose) : new Date());

  const summary = summarize(trades);
  const curve = cumulativeCurve(trades).map((p) => p.cum);

  return (
    <div className="tv-container">
      <div className="tv-page-head">
        <div>
          <h1>Diario</h1>
          <p>Libro Manual — Estadística Declarada, nunca lleva Sello.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {!USING_REAL_DB ? (
            <span className="tv-badge" data-state="stale">
              <span aria-hidden>↻</span> Modo demo
            </span>
          ) : null}
          <Link href="/trades/new" className="tv-btn">
            + Registrar operación
          </Link>
        </div>
      </div>

      <section>
        <h2 className="tv-section-title">Resumen</h2>
        <SummaryStrip summary={summary} />
      </section>

      <section className="tv-section">
        <h2 className="tv-section-title">P&amp;L acumulada</h2>
        <div className="tv-card">
          <EquityCurve points={curve} />
        </div>
      </section>

      <section className="tv-section">
        <h2 className="tv-section-title">Calendario</h2>
        <div className="tv-card">
          <MonthCalendar year={year} month={month} trades={trades} basePath="/trades" />
        </div>
      </section>

      <section className="tv-section">
        <h2 className="tv-section-title">Registro · Libro Manual</h2>
        <TradeRegistryView trades={trades} />
      </section>

      <section className="tv-section">
        <h2 className="tv-section-title">Libro de No Tomadas</h2>
        {notTaken.length === 0 ? (
          <p className="tv-empty">No hay setups identificados y no tomados.</p>
        ) : (
          <ul className="tv-list">
            {notTaken.map((t) => (
              <li key={t.id}>
                <Link href={`/trades/not_taken/${t.id}`}>
                  <span className="tv-list-main">
                    {t.instrument} · {SIDE_LABEL[t.side] ?? t.side}
                  </span>
                  <span className="tv-list-meta">{formatDate(iso(t.identifiedAt))}</span>
                  <span className="tv-badge" data-state="declared">
                    <span aria-hidden>○</span> {NOT_TAKEN_REASON_LABEL[t.reason] ?? t.reason}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
