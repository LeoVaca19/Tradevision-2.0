import type { EngineOptions, PlanVsExecuted, TradeSet } from "@tradevision/contracts";
import { applyFilter } from "./filter.js";
import { expectancyR, sortTrades, winRate, type ClosedTrade } from "./metrics.js";

/**
 * "Rendimiento del Plan vs Rendimiento Ejecutado" (PRD Cambio 5).
 *
 * Vista DERIVADA sobre `not_taken_trades` + `verified_trades` para el mismo setup
 * y periodo. No crea un quinto libro (§4.2). Toda la vista es Declarada:
 * `sealed: false` SIEMPRE, nunca entra en ninguna cifra de P&L.
 *
 * En el MVP (sin FR-25) la comparación del lado "No Tomadas" se limita a conteos
 * y cumplimiento de checklist; `hypotheticalWinRate` / `hypotheticalExpectancyR`
 * llegan `null` hasta que se implemente el estimador de resolución.
 */
export function computePlanVsExecuted(
  input: TradeSet,
  opts: EngineOptions,
  scope: { setupId?: string } = {},
): PlanVsExecuted {
  const filter = opts.filter;

  const verified = sortTrades(applyFilter(input.verified, filter, input.annotations))
    .filter((t) => (scope.setupId ? input.annotations[t.id]?.setupId === scope.setupId : true))
    .map<ClosedTrade>((t) => ({
      id: t.id,
      closedAt: t.closedAt,
      pnlCurrency: t.pnlCurrency,
      pnlR: t.pnlR,
    }));

  const executedInPlan = verified.filter(
    (t) => input.annotations[t.id]?.checklistCompliance === "in_plan",
  ).length;

  const notTaken = input.notTaken.filter((t) => {
    if (filter?.periodStart && t.identifiedAt < filter.periodStart) return false;
    if (filter?.periodEnd && t.identifiedAt > filter.periodEnd) return false;
    if (scope.setupId) return input.annotations[t.id]?.setupId === scope.setupId;
    return true;
  });
  const notTakenInPlan = notTaken.filter(
    (t) => input.annotations[t.id]?.checklistCompliance === "in_plan",
  ).length;

  const resolvedNotTaken = notTaken
    .map((t) => t.hypotheticalPnlR)
    .filter((r): r is number => r != null);

  return {
    setupId: scope.setupId ?? null,
    periodStart: filter?.periodStart ?? null,
    periodEnd: filter?.periodEnd ?? null,
    executed: {
      count: verified.length,
      inPlanCount: executedInPlan,
      winRate: winRate(verified),
      expectancyR: expectancyR(verified),
    },
    notTaken: {
      count: notTaken.length,
      inPlanCount: notTakenInPlan,
      hypotheticalWinRate:
        resolvedNotTaken.length > 0
          ? resolvedNotTaken.filter((r) => r > 0).length / resolvedNotTaken.length
          : null,
      hypotheticalExpectancyR:
        resolvedNotTaken.length > 0
          ? resolvedNotTaken.reduce((a, b) => a + b, 0) / resolvedNotTaken.length
          : null,
    },
    sealed: false,
    engineVersion: opts.engineVersion,
  };
}
