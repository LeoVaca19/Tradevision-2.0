import Papa from "papaparse";
import { z } from "zod";

/**
 * Importador CSV al Libro Manual (FR-67, fase 1). Todo lo importado queda
 * `verified = false` de forma permanente e irreversible; nunca alimenta una
 * Estadística Verificada ni un Sello.
 *
 * Parser TOLERANTE: acepta variaciones de cabecera (mayúsculas, espacios,
 * sinónimos habituales) y devuelve por separado las filas que no pudo leer para
 * que el usuario las corrija y reintente.
 *
 * `[SUPUESTO PRD]` 1 plantilla CSV documentada en el MVP. Ver
 * `docs/import-template.csv`.
 */

export interface ParsedManualTrade {
  instrument: string;
  side: "long" | "short";
  volume: number;
  entryPrice: number;
  exitPrice: number;
  openedAt: string; // ISO
  closedAt: string; // ISO
  commission: number;
  swap: number;
  pnlCurrency: number;
  pnlR: number | null;
}

export interface FailedRow {
  row: number;
  raw: Record<string, string>;
  error: string;
}

export interface CsvImportResult {
  trades: ParsedManualTrade[];
  failed: FailedRow[];
  rowsTotal: number;
}

/** Sinónimos de cabecera aceptados → clave canónica. */
const HEADER_ALIASES: Record<string, keyof RawRow> = {
  symbol: "instrument",
  instrument: "instrument",
  pair: "instrument",
  ticker: "instrument",
  side: "side",
  direction: "side",
  type: "side",
  volume: "volume",
  lots: "volume",
  size: "volume",
  qty: "volume",
  quantity: "volume",
  entry: "entryPrice",
  "entry price": "entryPrice",
  open_price: "entryPrice",
  "open price": "entryPrice",
  price_open: "entryPrice",
  exit: "exitPrice",
  "exit price": "exitPrice",
  close_price: "exitPrice",
  "close price": "exitPrice",
  price_close: "exitPrice",
  open_time: "openedAt",
  "open time": "openedAt",
  opened_at: "openedAt",
  "open date": "openedAt",
  close_time: "closedAt",
  "close time": "closedAt",
  closed_at: "closedAt",
  "close date": "closedAt",
  commission: "commission",
  commissions: "commission",
  fee: "commission",
  fees: "commission",
  swap: "swap",
  rollover: "swap",
  pnl: "pnlCurrency",
  profit: "pnlCurrency",
  "net p/l": "pnlCurrency",
  "net pnl": "pnlCurrency",
  result: "pnlCurrency",
  r: "pnlR",
  "r multiple": "pnlR",
  rr: "pnlR",
  r_multiple: "pnlR",
};

interface RawRow {
  instrument?: string;
  side?: string;
  volume?: string;
  entryPrice?: string;
  exitPrice?: string;
  openedAt?: string;
  closedAt?: string;
  commission?: string;
  swap?: string;
  pnlCurrency?: string;
  pnlR?: string;
}

function canonicalizeHeader(h: string): keyof RawRow | null {
  const key = h.trim().toLowerCase().replace(/\s+/g, " ");
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/ /g, "_")] ?? null;
}

const num = (v: string | undefined, field: string): number => {
  if (v == null || v.trim() === "") throw new Error(`falta "${field}"`);
  const cleaned = v.replace(/\s/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`"${field}" no es un número: "${v}"`);
  return n;
};

const optNum = (v: string | undefined, field: string): number => {
  if (v == null || v.trim() === "") return 0;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`"${field}" no es un número: "${v}"`);
  return n;
};

const parseSide = (v: string | undefined): "long" | "short" => {
  const s = (v ?? "").trim().toLowerCase();
  if (["long", "buy", "b", "compra", "0"].includes(s)) return "long";
  if (["short", "sell", "s", "venta", "1"].includes(s)) return "short";
  throw new Error(`lado desconocido: "${v}"`);
};

const parseDate = (v: string | undefined, field: string): string => {
  if (v == null || v.trim() === "") throw new Error(`falta "${field}"`);
  let s = v.trim().replace(" ", "T");
  // Fecha-hora "naive" (sin zona) → se interpreta como UTC para que el parseo
  // sea determinista y no dependa de la zona horaria de la máquina.
  if (/T\d{2}:\d{2}/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += "Z";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`fecha inválida en "${field}": "${v}"`);
  return d.toISOString();
};

const rowSchema = z
  .object({
    instrument: z.string().min(1),
    side: z.enum(["long", "short"]),
    volume: z.number().positive(),
    entryPrice: z.number().positive(),
    exitPrice: z.number().positive(),
    openedAt: z.string().datetime(),
    closedAt: z.string().datetime(),
    commission: z.number(),
    swap: z.number(),
    pnlCurrency: z.number(),
    pnlR: z.number().nullable(),
  })
  .refine((r) => r.closedAt >= r.openedAt, { message: "closedAt anterior a openedAt" });

export function parseTradesCsv(csv: string): CsvImportResult {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h,
  });

  const trades: ParsedManualTrade[] = [];
  const failed: FailedRow[] = [];
  const rows = parsed.data;

  rows.forEach((raw, i) => {
    const rowNo = i + 2; // +1 por cabecera, +1 por índice base 1
    try {
      const mapped: RawRow = {};
      for (const [header, val] of Object.entries(raw)) {
        const canon = canonicalizeHeader(header);
        if (canon) mapped[canon] = val;
      }

      const candidate = {
        instrument: (mapped.instrument ?? "").trim(),
        side: parseSide(mapped.side),
        volume: num(mapped.volume, "volume"),
        entryPrice: num(mapped.entryPrice, "entry"),
        exitPrice: num(mapped.exitPrice, "exit"),
        openedAt: parseDate(mapped.openedAt, "open time"),
        closedAt: parseDate(mapped.closedAt, "close time"),
        commission: optNum(mapped.commission, "commission"),
        swap: optNum(mapped.swap, "swap"),
        pnlCurrency: num(mapped.pnlCurrency, "pnl"),
        pnlR:
          mapped.pnlR != null && mapped.pnlR.trim() !== ""
            ? Number(mapped.pnlR.replace(",", "."))
            : null,
      };

      const result = rowSchema.safeParse(candidate);
      if (!result.success) {
        throw new Error(result.error.issues.map((x) => x.message).join("; "));
      }
      trades.push(result.data);
    } catch (err) {
      failed.push({
        row: rowNo,
        raw,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { trades, failed, rowsTotal: rows.length };
}
