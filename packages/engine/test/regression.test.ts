import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../src/version.js";
import { compute } from "../src/compute.js";
import { computePlanVsExecuted } from "../src/plan-vs-executed.js";
import { computeRadarScore } from "../src/radar.js";
import { annotate, makeNotTaken, makeTradeSet, makeVerified } from "./fixtures.js";

const OPTS = { engineVersion: ENGINE_VERSION, asOf: "2026-06-01T00:00:00Z" };

describe("compute — regresión (dataset fijo ⇒ salida fija)", () => {
  it("snapshot de las métricas del Libro Verificado", () => {
    const set = makeTradeSet({ verified: makeVerified({ count: 60, seed: 42, winProb: 0.55 }) });
    const results = compute(set, OPTS);
    // Si esto cambia sin bump de ENGINE_VERSION, el test falla (FR-16).
    expect(results).toMatchSnapshot();
  });

  it("es determinista — dos ejecuciones son idénticas", () => {
    const set = makeTradeSet({ verified: makeVerified({ count: 45, seed: 99 }) });
    expect(compute(set, OPTS)).toEqual(compute(set, OPTS));
  });

  it("propaga engineVersion a cada resultado", () => {
    const set = makeTradeSet({ verified: makeVerified({ count: 40 }) });
    for (const r of compute(set, OPTS)) expect(r.engineVersion).toBe(ENGINE_VERSION);
  });
});

describe("compute — invariantes del PRD", () => {
  it("todas las métricas del Libro Verificado llevan Sello", () => {
    const set = makeTradeSet({ verified: makeVerified({ count: 50 }) });
    for (const r of compute(set, OPTS)) {
      expect(r.book).toBe("verified");
      expect(r.sealed).toBe(true);
    }
  });

  it("por debajo de 30 operaciones todo es insufficient_data", () => {
    const set = makeTradeSet({ verified: makeVerified({ count: 29 }) });
    for (const r of compute(set, OPTS)) {
      expect(r.value.kind).toBe("insufficient_data");
    }
  });

  it("a partir de 30 operaciones las métricas base devuelven valor", () => {
    const set = makeTradeSet({ verified: makeVerified({ count: 30, winProb: 0.5, winR: 2, lossR: 1 }) });
    const byMetric = Object.fromEntries(compute(set, OPTS).map((r) => [r.metric, r]));
    expect(byMetric.win_rate!.value.kind).toBe("value");
    expect(byMetric.profit_factor!.value.kind).toBe("value");
    expect(byMetric.max_drawdown!.value.kind).toBe("value");
    // sharpe / z_score siguen reservadas
    expect(byMetric.sharpe_ratio!.value.kind).toBe("insufficient_data");
    expect(byMetric.z_score!.value.kind).toBe("insufficient_data");
  });

  it("el filtro forense recalcula el sample_size y deja su hash", () => {
    const verified = makeVerified({ count: 60 });
    const set = makeTradeSet({ verified });
    const eurOnly = compute(set, { ...OPTS, filter: { instruments: ["EURUSD"] } });
    const wr = eurOnly.find((r) => r.metric === "win_rate")!;
    expect(wr.sampleSize).toBe(30); // mitad de las 60
    expect(wr.filtersHash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("computeRadarScore — invariantes FR-65", () => {
  const set = makeTradeSet({
    verified: makeVerified({ count: 60, winProb: 0.55 }),
    notTaken: makeNotTaken(20),
  });

  it("el compuesto es SIEMPRE Estadística Declarada", () => {
    const radar = computeRadarScore(set, OPTS);
    expect(radar.sealed).toBe(false);
  });

  it("siempre se devuelven los 6 ejes desglosados", () => {
    const radar = computeRadarScore(set, OPTS);
    expect(radar.axes.map((a) => a.axis).sort()).toEqual(
      ["avg_win_loss", "consistency", "profit_factor", "recovery", "risk_management", "win_rate"].sort(),
    );
  });

  it("los 6 ejes son puro dato cuantitativo: todos Verificados, todos con Sello", () => {
    const radar = computeRadarScore(set, OPTS);
    for (const a of radar.axes) {
      expect(a.book).toBe("verified");
      expect(a.sealed).toBe(true);
    }
  });

  it("snapshot del radar para dataset fijo", () => {
    expect(computeRadarScore(set, OPTS)).toMatchSnapshot();
  });
});

describe("computePlanVsExecuted — Cambio 5", () => {
  it("toda la vista es Declarada y sin FR-25 las hipotéticas son null", () => {
    const set = makeTradeSet({
      verified: makeVerified({ count: 40 }),
      notTaken: makeNotTaken(12),
    });
    const view = computePlanVsExecuted(set, OPTS);
    expect(view.sealed).toBe(false);
    expect(view.notTaken.hypotheticalWinRate).toBeNull();
    expect(view.notTaken.hypotheticalExpectancyR).toBeNull();
    expect(view.executed.count).toBe(40);
    expect(view.notTaken.count).toBe(12);
  });

  it("cuenta el cumplimiento de checklist a partir de las anotaciones", () => {
    const verified = makeVerified({ count: 30 });
    const inPlanIds = verified.slice(0, 18).map((t) => t.id);
    const set = makeTradeSet({
      verified,
      annotations: annotate(inPlanIds, { checklistCompliance: "in_plan" }),
    });
    const view = computePlanVsExecuted(set, OPTS);
    expect(view.executed.inPlanCount).toBe(18);
  });
});
