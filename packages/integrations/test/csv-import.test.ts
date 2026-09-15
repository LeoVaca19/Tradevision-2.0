import { describe, expect, it } from "vitest";
import { parseTradesCsv } from "../src/csv-import.js";

describe("parseTradesCsv (FR-67 fase 1)", () => {
  it("parsea la plantilla canónica", () => {
    const csv = [
      "Symbol,Side,Volume,Entry Price,Exit Price,Open Time,Close Time,Commission,Swap,PnL,R",
      "EURUSD,buy,1.0,1.1000,1.1050,2026-01-02 09:00,2026-01-02 11:30,-2.5,0,50,2",
      "GBPUSD,sell,0.5,1.2700,1.2660,2026-01-03 08:00,2026-01-03 09:15,-1.2,-0.3,20,1.5",
    ].join("\n");

    const { trades, failed, rowsTotal } = parseTradesCsv(csv);
    expect(rowsTotal).toBe(2);
    expect(failed).toHaveLength(0);
    expect(trades[0]).toMatchObject({
      instrument: "EURUSD",
      side: "long",
      volume: 1,
      entryPrice: 1.1,
      exitPrice: 1.105,
      pnlCurrency: 50,
      pnlR: 2,
    });
    expect(trades[0]!.openedAt).toBe("2026-01-02T09:00:00.000Z");
  });

  it("tolera cabeceras alternativas y espacios", () => {
    const csv = [
      "  PAIR ,DIRECTION,LOTS,open_price,close_price,open_time,close_time,profit",
      "US30,Long,2,38000,38200,2026-02-01T14:00:00Z,2026-02-01T15:00:00Z,400",
    ].join("\n");
    const { trades, failed } = parseTradesCsv(csv);
    expect(failed).toHaveLength(0);
    expect(trades[0]).toMatchObject({ instrument: "US30", side: "long", volume: 2, pnlR: null });
  });

  it("aísla filas ilegibles y sigue con el resto", () => {
    const csv = [
      "Symbol,Side,Volume,Entry,Exit,Open Time,Close Time,PnL",
      "EURUSD,buy,1,1.1,1.11,2026-01-02 09:00,2026-01-02 11:30,50",
      "EURUSD,banana,1,1.1,1.11,2026-01-02 09:00,2026-01-02 11:30,50",
      "EURUSD,buy,1,1.1,1.11,nofecha,2026-01-02 11:30,50",
    ].join("\n");
    const { trades, failed } = parseTradesCsv(csv);
    expect(trades).toHaveLength(1);
    expect(failed).toHaveLength(2);
    expect(failed[0]!.row).toBe(3);
    expect(failed[0]!.error).toMatch(/lado desconocido/);
    expect(failed[1]!.error).toMatch(/fecha inválida/);
  });
});
