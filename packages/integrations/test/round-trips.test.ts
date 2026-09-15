import { describe, expect, it } from "vitest";
import { buildRoundTrips, type Fill } from "../src/round-trips.js";

const fill = (over: Partial<Fill> & Pick<Fill, "id" | "side" | "quantity" | "price" | "executedAt">): Fill => ({
  symbol: "EURUSD",
  commission: 0,
  swap: 0,
  ...over,
});

describe("buildRoundTrips", () => {
  it("una entrada + una salida (caso simple, sin profit reportado)", () => {
    const trips = buildRoundTrips([
      fill({ id: "e1", side: "buy", quantity: 1, price: 1.1, executedAt: "2026-01-01T09:00:00Z", commission: -2 }),
      fill({ id: "x1", side: "sell", quantity: 1, price: 1.105, executedAt: "2026-01-01T10:00:00Z", commission: -2 }),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      status: "closed",
      direction: "long",
      quantity: 1,
      openQuantity: 0,
      avgEntry: 1.1,
      avgExit: 1.105,
      commission: -4,
      swap: 0,
    });
    expect(trips[0]!.grossPnl).toBeCloseTo(0.005, 10);
    expect(trips[0]!.netPnl).toBeCloseTo(0.005 - 4, 10);
  });

  it("usa el profit reportado por el bróker en vez de recalcularlo por precio", () => {
    const trips = buildRoundTrips([
      fill({ id: "e1", side: "buy", quantity: 1, price: 1.1, executedAt: "2026-01-01T09:00:00Z" }),
      fill({
        id: "x1",
        side: "sell",
        quantity: 1,
        price: 1.105,
        executedAt: "2026-01-01T10:00:00Z",
        profit: 50, // distinto del cálculo por precio (0.005) — debe ganar este valor
      }),
    ]);
    expect(trips[0]!.grossPnl).toBe(50);
  });

  it("scale-in: dos entradas promedian el precio de entrada", () => {
    const trips = buildRoundTrips([
      fill({ id: "e1", side: "buy", quantity: 1, price: 1.1, executedAt: "2026-01-01T09:00:00Z" }),
      fill({ id: "e2", side: "buy", quantity: 1, price: 1.2, executedAt: "2026-01-01T09:05:00Z" }),
      fill({ id: "x1", side: "sell", quantity: 2, price: 1.3, executedAt: "2026-01-01T10:00:00Z" }),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.quantity).toBe(2);
    expect(trips[0]!.avgEntry).toBeCloseTo(1.15, 10);
    expect(trips[0]!.fills.filter((f) => f.role === "entry")).toHaveLength(2);
  });

  it("scale-out: dos salidas promedian el precio de salida y cierran del todo", () => {
    const trips = buildRoundTrips([
      fill({ id: "e1", side: "buy", quantity: 2, price: 1.1, executedAt: "2026-01-01T09:00:00Z" }),
      fill({ id: "x1", side: "sell", quantity: 1, price: 1.2, executedAt: "2026-01-01T10:00:00Z" }),
      fill({ id: "x2", side: "sell", quantity: 1, price: 1.3, executedAt: "2026-01-01T11:00:00Z" }),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.status).toBe("closed");
    expect(trips[0]!.avgExit).toBeCloseTo(1.25, 10);
    expect(trips[0]!.fills.filter((f) => f.role === "exit")).toHaveLength(2);
  });

  it("flip: un fill que cruza por flat cierra una operación y abre la contraria", () => {
    const trips = buildRoundTrips([
      fill({ id: "e1", side: "buy", quantity: 1, price: 1.1, executedAt: "2026-01-01T09:00:00Z", commission: -1 }),
      // vende 3: cierra el long (1) y abre un short de 2
      fill({ id: "x1", side: "sell", quantity: 3, price: 1.2, executedAt: "2026-01-01T10:00:00Z", commission: -3 }),
    ]);
    expect(trips).toHaveLength(2);
    const [closedLong, openShort] = trips;
    expect(closedLong).toMatchObject({ direction: "long", status: "closed", quantity: 1, openQuantity: 0 });
    expect(openShort).toMatchObject({ direction: "short", status: "open", quantity: 2, openQuantity: 2 });
    // La comisión del fill (-3) se prorratea 1/3 al cierre, 2/3 a la apertura — sin perder nada.
    expect(closedLong!.commission).toBeCloseTo(-1 - 1, 10); // -1 de e1 + -1 (1/3 de -3)
    expect(openShort!.commission).toBeCloseTo(-2, 10); // 2/3 de -3
    // Ambos ciclos referencian el mismo fill "x1" con la porción correcta.
    expect(closedLong!.fills.find((f) => f.fillId === "x1")).toMatchObject({ quantity: 1 });
    expect(openShort!.fills.find((f) => f.fillId === "x1")).toMatchObject({ quantity: 2 });
  });

  it("FIFO vs LIFO cambian el precio de entrada emparejado, no el P&L total del ciclo", () => {
    const fills: Fill[] = [
      fill({ id: "e1", side: "buy", quantity: 1, price: 1.0, executedAt: "2026-01-01T09:00:00Z" }),
      fill({ id: "e2", side: "buy", quantity: 1, price: 2.0, executedAt: "2026-01-01T09:05:00Z" }),
      // sale sólo 1 — con FIFO empareja e1 (1.0), con LIFO empareja e2 (2.0)
      fill({ id: "x1", side: "sell", quantity: 1, price: 3.0, executedAt: "2026-01-01T10:00:00Z" }),
    ];
    const fifo = buildRoundTrips(fills, { method: "fifo" });
    const lifo = buildRoundTrips(fills, { method: "lifo" });
    expect(fifo[0]!.grossPnl).toBeCloseTo(3 - 1, 10);
    expect(lifo[0]!.grossPnl).toBeCloseTo(3 - 2, 10);
    // El lote que sobra sigue abierto en ambos casos, mismo volumen.
    expect(fifo[0]!.openQuantity).toBe(1);
    expect(lifo[0]!.openQuantity).toBe(1);
  });

  it("wavg pondera el precio de entrada de todos los lotes abiertos", () => {
    const trips = buildRoundTrips(
      [
        fill({ id: "e1", side: "buy", quantity: 1, price: 1.0, executedAt: "2026-01-01T09:00:00Z" }),
        fill({ id: "e2", side: "buy", quantity: 1, price: 3.0, executedAt: "2026-01-01T09:05:00Z" }),
        fill({ id: "x1", side: "sell", quantity: 1, price: 5.0, executedAt: "2026-01-01T10:00:00Z" }),
      ],
      { method: "wavg" },
    );
    // Promedio ponderado de los 2 lotes = 2.0 → gross = 5 - 2 = 3.
    expect(trips[0]!.grossPnl).toBeCloseTo(3, 10);
    expect(trips[0]!.openQuantity).toBeCloseTo(1, 10);
  });

  it("agrupa por símbolo: dos instrumentos no se mezclan", () => {
    const trips = buildRoundTrips([
      fill({ id: "e1", symbol: "EURUSD", side: "buy", quantity: 1, price: 1.1, executedAt: "2026-01-01T09:00:00Z" }),
      fill({ id: "x1", symbol: "EURUSD", side: "sell", quantity: 1, price: 1.2, executedAt: "2026-01-01T10:00:00Z" }),
      fill({ id: "e2", symbol: "GBPUSD", side: "buy", quantity: 1, price: 1.3, executedAt: "2026-01-01T09:00:00Z" }),
    ]);
    expect(trips).toHaveLength(2);
    expect(trips.find((t) => t.symbol === "GBPUSD")).toMatchObject({ status: "open" });
    expect(trips.find((t) => t.symbol === "EURUSD")).toMatchObject({ status: "closed" });
  });

  it("es determinista sin importar el orden de entrada de los fills", () => {
    const fills: Fill[] = [
      fill({ id: "x1", side: "sell", quantity: 1, price: 1.2, executedAt: "2026-01-01T10:00:00Z" }),
      fill({ id: "e1", side: "buy", quantity: 1, price: 1.1, executedAt: "2026-01-01T09:00:00Z" }),
    ];
    const a = buildRoundTrips(fills);
    const b = buildRoundTrips([...fills].reverse());
    expect(a).toEqual(b);
  });
});
