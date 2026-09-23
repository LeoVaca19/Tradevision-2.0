import Link from "next/link";
import { notFound } from "next/navigation";
import type { PartialBlock } from "@blocknote/core";
import { AnnotationWorkspace } from "@/components/trade/AnnotationWorkspace";
import { StatBadge } from "@/components/StatBadge";
import { currentUser, getTradeView, listAttachments, listCatalogs } from "@/lib/data";
import { MAX_ATTACHMENTS_PER_TRADE } from "@/lib/demo-store";
import { BOOK_LABEL, toAnnotationProps, toBlockNoteContent, type TradeBook } from "@/lib/trade-view";
import { formatDate, formatDateTime, formatSigned, NOT_TAKEN_REASON_LABEL, signClass, SIDE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const BOOKS: TradeBook[] = ["verified", "manual", "not_taken"];

interface CoreTradeRow {
  instrument: string;
  side: "long" | "short";
  closedAt: string | Date;
  pnlCurrency: number;
  pnlR: number | null;
  verified: boolean;
}

interface NotTakenRow {
  instrument: string;
  side: "long" | "short";
  identifiedAt: string | Date;
  reason: string;
}

export default async function TradeRecordPage({
  params,
}: {
  params: Promise<{ book: string; id: string }>;
}) {
  const { book: rawBook, id } = await params;
  if (!BOOKS.includes(rawBook as TradeBook)) notFound();
  const book = rawBook as TradeBook;

  const [user, view, catalogs, attachments] = await Promise.all([
    currentUser(),
    getTradeView(book, id),
    listCatalogs(),
    listAttachments(book, id),
  ]);
  if (!view) notFound();

  const initialProps = toAnnotationProps(view.annotation as Parameters<typeof toAnnotationProps>[0]);
  const journalInitial = toBlockNoteContent(view.annotation?.journalNote) as PartialBlock[] | undefined;

  return (
    <div className="tv-container">
      <p>
        <Link href="/trades">← Volver al Diario</Link>
      </p>

      {book === "not_taken" ? (
        (() => {
          const trade = view.trade as unknown as NotTakenRow;
          return (
            <header style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <h1 style={{ margin: 0 }}>
                  {trade.instrument} <span style={{ color: "var(--text-muted)" }}>{SIDE_LABEL[trade.side]}</span>
                </h1>
                <StatBadge state="declared" />
              </div>
              <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
                {BOOK_LABEL[book]} · identificada {formatDate(String(trade.identifiedAt))} ·{" "}
                {NOT_TAKEN_REASON_LABEL[trade.reason] ?? trade.reason}
              </p>
            </header>
          );
        })()
      ) : (
        (() => {
          const trade = view.trade as unknown as CoreTradeRow;
          return (
            <header style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <h1 style={{ margin: 0 }}>
                  {trade.instrument} <span style={{ color: "var(--text-muted)" }}>{SIDE_LABEL[trade.side]}</span>
                </h1>
                <StatBadge state={trade.verified ? "verified" : "declared"} />
              </div>
              <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
                {BOOK_LABEL[book]} · cerrada {formatDateTime(String(trade.closedAt))} ·{" "}
                <span className={signClass(trade.pnlCurrency)}>{formatSigned(trade.pnlCurrency)}</span>
                {trade.pnlR != null ? ` · ${trade.pnlR.toFixed(2)} R` : ""}
              </p>
            </header>
          );
        })()
      )}

      <AnnotationWorkspace
        book={book}
        tradeId={id}
        initial={initialProps}
        journalInitial={journalInitial}
        catalogs={catalogs}
        attachments={attachments}
        maxAttachments={MAX_ATTACHMENTS_PER_TRADE}
        showPublicAnnotation={book === "verified" && user.tier === "mentor"}
      />
    </div>
  );
}
