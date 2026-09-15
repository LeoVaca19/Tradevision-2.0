import Link from "next/link";
import { sortTrades } from "@tradevision/engine";
import { formatDateTime, formatSigned, signClass } from "@/lib/format";
import type { CardTrade } from "./TradeCardGrid";

/**
 * Vista Tabla del Diario — densa, reglas hairline. Misma fuente de datos que
 * la Galería (`TradeCardGrid`); ver `TradeRegistryView` para el toggle.
 */
export function TradeLogTable({ trades }: { trades: readonly CardTrade[] }) {
  if (trades.length === 0) {
    return <p className="tv-empty">No hay operaciones registradas todavía.</p>;
  }
  const ordered = [...sortTrades(trades)].reverse();

  return (
    <div className="tv-table-wrap">
      <table className="tv-table tv-table-rows">
        <thead>
          <tr>
            <th>Instrumento</th>
            <th>Lado</th>
            <th>Cierre</th>
            <th>Diario</th>
            <th>P&amp;L</th>
            <th>R</th>
            <th>Estado</th>
            <th aria-hidden />
          </tr>
        </thead>
        <tbody>
          {ordered.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/trades/manual/${t.id}`} className="tv-row-link">
                  {t.instrument}
                </Link>
              </td>
              <td>{t.side === "long" ? "Largo" : "Corto"}</td>
              <td>{formatDateTime(t.closedAt)}</td>
              <td>{t.hasJournalNote ? "✎" : ""}</td>
              <td className={`tv-num ${signClass(t.pnlCurrency)}`}>{formatSigned(t.pnlCurrency)}</td>
              <td className="tv-num">{t.pnlR == null ? "—" : t.pnlR.toFixed(2)}</td>
              <td>
                <span className="tv-badge" data-state="declared">
                  <span aria-hidden>○</span> Declarado
                </span>
              </td>
              <td className="tv-row-open">Abrir ficha →</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
