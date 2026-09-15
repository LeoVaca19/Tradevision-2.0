import { describe, expect, it } from "vitest";
import {
  expectancyR,
  maxDrawdown,
  profitFactor,
  rMultipleAvg,
  sortTrades,
  streaks,
  winRate,
  type ClosedTrade,
} from "../src/metrics.js";

const t = (id: string, closedAt: string, pnlCurrency: number, pnlR: number | null): ClosedTrade => ({
  id,
  closedAt,
  pnlCurrency,
  pnlR,
});

describe("winRate", () => {
  it("excluye breakeven del denominador", () => {
    const trades = [
      t("a", "2026-01-01T00:00:00Z", 100, 2),
      t("b", "2026-01-02T00:00:00Z", -50, -1),
      t("c", "2026-01-03T00:00:00Z", 0, 0), // breakeven
      t("d", "2026-01-04T00:00:00Z", 100, 2),
    ];
    expect(winRate(trades)).toBe(2 / 3);
  });

  it("null cuando no hay operaciones decisivas", () => {
    expect(winRate([t("a", "2026-01-01T00:00:00Z", 0, 0)])).toBeNull();
  });
});

describe("expectancyR", () => {
  it("media de pnlR ignorando null", () => {
    const trades = [
      t("a", "2026-01-01T00:00:00Z", 200, 2),
      t("b", "2026-01-02T00:00:00Z", -100, -1),
      t("c", "2026-01-03T00:00:00Z", 50, null),
    ];
    expect(expectancyR(trades)).toBe(0.5);
  });
});

describe("rMultipleAvg (payoff ratio)", () => {
  it("|R medio ganador| / |R medio perdedor|", () => {
    const trades = [
      t("a", "2026-01-01T00:00:00Z", 300, 3),
      t("b", "2026-01-02T00:00:00Z", 100, 1),
      t("c", "2026-01-03T00:00:00Z", -100, -1),
    ];
    expect(rMultipleAvg(trades)).toBe(2); // avgWin 2, avgLoss 1
  });

  it("null si falta un lado", () => {
    expect(rMultipleAvg([t("a", "2026-01-01T00:00:00Z", 100, 1)])).toBeNull();
  });
});

describe("profitFactor", () => {
  it("ganancias brutas / pérdidas brutas", () => {
    const trades = [
      t("a", "2026-01-01T00:00:00Z", 300, 3),
      t("b", "2026-01-02T00:00:00Z", -100, -1),
      t("c", "2026-01-03T00:00:00Z", -50, -0.5),
    ];
    expect(profitFactor(trades)).toBe(2); // 300 / 150
  });

  it("null si no hay pérdidas (ratio indefinido)", () => {
    expect(profitFactor([t("a", "2026-01-01T00:00:00Z", 100, 1)])).toBeNull();
  });
});

describe("maxDrawdown", () => {
  it("mide la caída pico-a-valle en la curva acumulada", () => {
    const trades = [
      t("a", "2026-01-01T00:00:00Z", 100, 1), // cum 1
      t("b", "2026-01-02T00:00:00Z", 100, 1), // cum 2  (pico)
      t("c", "2026-01-03T00:00:00Z", -100, -1), // cum 1
      t("d", "2026-01-04T00:00:00Z", -100, -1), // cum 0  → dd 2
      t("e", "2026-01-05T00:00:00Z", 300, 3), // cum 3
    ];
    const dd = maxDrawdown(trades, "ref");
    expect(dd?.maxDrawdownR).toBe(2);
    expect(dd?.maxDrawdownCurrency).toBe(200);
  });

  it("null para lista vacía", () => {
    expect(maxDrawdown([], "ref")).toBeNull();
  });
});

describe("streaks", () => {
  it("run ganador/perdedor más largo y racha actual", () => {
    const trades = [
      t("a", "2026-01-01T00:00:00Z", 1, 1),
      t("b", "2026-01-02T00:00:00Z", 1, 1),
      t("c", "2026-01-03T00:00:00Z", 1, 1), // win run 3
      t("d", "2026-01-04T00:00:00Z", -1, -1),
      t("e", "2026-01-05T00:00:00Z", -1, -1), // loss run 2, racha actual -2
    ];
    expect(streaks(trades)).toEqual({ longestWin: 3, longestLoss: 2, currentStreak: -2 });
  });

  it("breakeven corta la racha", () => {
    const trades = [
      t("a", "2026-01-01T00:00:00Z", 1, 1),
      t("b", "2026-01-02T00:00:00Z", 0, 0),
      t("c", "2026-01-03T00:00:00Z", 1, 1),
    ];
    expect(streaks(trades)).toEqual({ longestWin: 1, longestLoss: 0, currentStreak: 1 });
  });
});

describe("sortTrades", () => {
  it("ordena por closedAt y desempata por id — estable", () => {
    const trades = [
      { id: "b", closedAt: "2026-01-02T00:00:00Z" },
      { id: "a", closedAt: "2026-01-01T00:00:00Z" },
      { id: "c", closedAt: "2026-01-01T00:00:00Z" },
    ];
    expect(sortTrades(trades).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});
