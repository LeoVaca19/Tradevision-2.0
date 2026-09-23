import Link from "next/link";
import { sortTrades } from "@tradevision/engine";
import { formatDate, formatSigned, signClass } from "@/lib/format";
import { imageUrl } from "@/lib/upload-image";
import type { JournalTrade } from "@/lib/journal";

export interface CardTrade extends JournalTrade {
  firstAttachmentKey: string | null;
  hasJournalNote: boolean;
}

/**
 * Galería del Diario — la captura es el elemento principal, cuando existe.
 * Libro Manual: nunca lleva Sello (FR-10), siempre badge "Declarado".
 */
export function TradeCardGrid({ trades }: { trades: readonly CardTrade[] }) {
  if (trades.length === 0) {
    return <p className="tv-empty">No hay operaciones registradas todavía.</p>;
  }
  const ordered = [...sortTrades(trades)].reverse();

  return (
    <div className="tv-trade-grid">
      {ordered.map((t) => (
        <Link key={t.id} href={`/trades/manual/${t.id}`} className="tv-trade-card">
          <div className="tv-trade-thumb">
            {t.firstAttachmentKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl(t.firstAttachmentKey)} alt="" />
            ) : (
              <div className="tv-trade-thumb-empty">{t.instrument}</div>
            )}
            <span className={`tv-trade-pnl ${signClass(t.pnlCurrency)}`}>{formatSigned(t.pnlCurrency)}</span>
          </div>
          <div className="tv-trade-meta">
            <span>
              <span className="tv-trade-instrument">{t.instrument}</span>
              <span className="tv-trade-side">{t.side === "long" ? "Largo" : "Corto"}</span>
            </span>
            <span className="tv-sample">{formatDate(t.closedAt)}</span>
          </div>
          <div className="tv-trade-tags">
            <span className="tv-badge" data-state="declared">
              <span aria-hidden>○</span> Declarado
            </span>
            {t.hasJournalNote ? (
              <span className="tv-tag">
                <span aria-hidden>✎</span> Diario
              </span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
