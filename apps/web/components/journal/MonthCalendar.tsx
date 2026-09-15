import Link from "next/link";
import { formatSigned, signClass } from "@/lib/format";
import { monthLabel, monthMatrix, shiftMonth, type JournalTrade } from "@/lib/journal";

const DOW = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export function MonthCalendar({
  year,
  month,
  trades,
  basePath,
}: {
  year: number;
  month: number;
  trades: readonly JournalTrade[];
  /** Ruta base a la que se le anexa `?m=YYYY-MM` para navegar de mes (sin JS). */
  basePath: string;
}) {
  const weeks = monthMatrix(year, month, trades);

  return (
    <div>
      <div className="tv-cal-head">
        <Link href={`${basePath}?m=${shiftMonth(year, month, -1)}`} className="tv-cal-nav" aria-label="Mes anterior">
          ‹
        </Link>
        <span className="tv-cal-title">{monthLabel(year, month)}</span>
        <Link href={`${basePath}?m=${shiftMonth(year, month, 1)}`} className="tv-cal-nav" aria-label="Mes siguiente">
          ›
        </Link>
      </div>
      <div className="tv-cal-grid">
        {DOW.map((d) => (
          <div key={d} className="tv-cal-dow">
            {d}
          </div>
        ))}
        {weeks.flatMap((week, wi) =>
          week.map((day, di) => (
            <div
              key={`${wi}-${di}`}
              className="tv-cal-day"
              data-out={!day.inMonth || undefined}
              data-sign={day.count > 0 ? (day.pnl > 0 ? "pos" : day.pnl < 0 ? "neg" : undefined) : undefined}
            >
              <span className="tv-cal-date">{Number(day.date.slice(8, 10))}</span>
              {day.count > 0 ? (
                <>
                  <span className={`tv-cal-pnl ${signClass(day.pnl)}`}>{formatSigned(day.pnl)}</span>
                  <span className="tv-cal-count">
                    {day.count} op{day.count === 1 ? "" : "s"}
                  </span>
                </>
              ) : null}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
