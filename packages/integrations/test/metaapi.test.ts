import { describe, expect, it } from "vitest";
import { normalizeClosedPositions, type MetaApiDeal } from "../src/metaapi.js";

const deal = (over: Partial<MetaApiDeal> & Pick<MetaApiDeal, "id" | "type" | "volume" | "price" | "time">): MetaApiDeal => ({
  symbol: "EURUSD",
  commission: 0,
  swap: 0,
  profit: 0,
  ...over,
});

describe("normalizeClosedPositions (MetaApi → verified_trades, motor de round-trips)", () => {
  it("caso simple: una entrada + una salida", () => {
    const deals: MetaApiDeal[] = [
      deal({ id: "d1", type: "DEAL_TYPE_BUY", volume: 1, price: 1.1, commission: -2, time: "2026-01-02T09:00:00Z" }),
      deal({
        id: "d2",
        type: "DEAL_TYPE_SELL",
        volume: 1,
        price: 1.105,
        commission: -2,
        swap: -1,
        profit: 50,
        time: "2026-01-02T11:30:00Z",
      }),
    ];
    const [trade] = normalizeClosedPositions(deals);
    expect(trade).toMatchObject({
      side: "long",
      entryPrice: 1.1,
      exitPrice: 1.105,
      commission: -4,
      swap: -1,
      pnlCurrency: 50 - 4 - 1, // profit reportado por el bróker, neto de comisión y swap
      pnlR: null,
    });
    expect(trade!.executions).toHaveLength(2);
    expect(trade!.executions.map((e) => e.brokerDealId)).toEqual(["d1", "d2"]);
  });

  it("ya NO descarta fills intermedios en un scale-in (bug que reemplaza este motor)", () => {
    const deals: MetaApiDeal[] = [
      deal({ id: "d1", type: "DEAL_TYPE_BUY", volume: 1, price: 1.1, time: "2026-01-02T09:00:00Z" }),
      deal({ id: "d2", type: "DEAL_TYPE_BUY", volume: 1, price: 1.3, time: "2026-01-02T09:05:00Z" }),
      deal({ id: "d3", type: "DEAL_TYPE_SELL", volume: 2, price: 1.5, profit: 60, time: "2026-01-02T11:00:00Z" }),
    ];
    const [trade] = normalizeClosedPositions(deals);
    expect(trade!.volume).toBe(2);
    expect(trade!.entryPrice).toBeCloseTo(1.2, 10); // promedio de d1/d2 — el emparejador viejo sólo veía d1
    expect(trade!.executions).toHaveLength(3);
  });

  it("flip: produce dos operaciones cerradas/abiertas, no una sola mal calculada", () => {
    const deals: MetaApiDeal[] = [
      deal({ id: "d1", type: "DEAL_TYPE_BUY", volume: 1, price: 1.1, time: "2026-01-02T09:00:00Z" }),
      // vende 3: cierra el long (1) y abre un short (2) — sigue abierto, no genera fila
      deal({ id: "d2", type: "DEAL_TYPE_SELL", volume: 3, price: 1.2, profit: 90, time: "2026-01-02T10:00:00Z" }),
    ];
    const trades = normalizeClosedPositions(deals);
    expect(trades).toHaveLength(1); // sólo la parte cerrada produce verified_trade
    expect(trades[0]).toMatchObject({ side: "long", volume: 1 });
  });

  it("acepta `method` (FIFO/LIFO/WAVG) — sólo cambia el reparto mientras la posición sigue ABIERTA; una operación que cierra del todo consume los mismos lotes en cualquier orden y da igual", () => {
    const deals: MetaApiDeal[] = [
      deal({ id: "d1", type: "DEAL_TYPE_BUY", volume: 1, price: 1.0, time: "2026-01-02T09:00:00Z" }),
      deal({ id: "d2", type: "DEAL_TYPE_BUY", volume: 1, price: 2.0, time: "2026-01-02T09:05:00Z" }),
      deal({ id: "d3", type: "DEAL_TYPE_SELL", volume: 2, price: 3.0, time: "2026-01-02T10:00:00Z" }),
    ];
    const [fifo] = normalizeClosedPositions(deals);
    const [lifo] = normalizeClosedPositions(deals, { method: "lifo" });
    const [wavg] = normalizeClosedPositions(deals, { method: "wavg" });
    for (const trade of [fifo, lifo, wavg]) expect(trade!.entryPrice).toBeCloseTo(1.5, 10);

    // Con una salida PARCIAL (queda 1 lote abierto) sí importa el método —
    // pero eso vive en `avgEntry` del round-trip todavía abierto, que
    // `normalizeClosedPositions` no expone (sólo cierra fila cuando hay
    // `verified_trade`). Cubierto a nivel de motor en round-trips.test.ts.
    const partial = deals.map((d) => (d.id === "d3" ? { ...d, volume: 1 } : d));
    expect(normalizeClosedPositions(partial)).toHaveLength(0);
  });
});
