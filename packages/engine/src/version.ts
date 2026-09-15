/**
 * Versión semántica del motor de analítica (FR-16, Tech Spec §7).
 *
 * REGLA: cualquier cambio en una fórmula, en el orden de agregación o en el
 * gating de muestra DEBE incrementar esta constante. Los tests de regresión de
 * `test/regression.test.ts` fijan "dataset X + versión V ⇒ salida Y" y fallan si
 * la salida cambia sin bump. Un cambio de versión se comunica al usuario.
 *
 * Historial (heredado del proyecto anterior, `../../tradevision/`):
 *  - 0.1.0  Win Rate, Expectancy, R-múltiplo (payoff), Profit Factor,
 *           Max Drawdown, rachas. Radar Score esqueleto. Plan vs Ejecutado
 *           (conteos + checklist, sin FR-25). Sharpe / Z-Score: no implementados.
 *  - 0.2.0  Radar Score: PURO dato cuantitativo (decisión de Leonardo,
 *           2026-09-12). Se retiran `emotional_discipline` y `efficiency`
 *           (declarados/conductuales — quedan para un score de conducta
 *           aparte, aún sin construir). Entran `avg_win_loss` (payoff ratio)
 *           y `recovery` (recovery factor en R), ambos Verificados con Sello.
 *           `risk_management` pasa de "mixto sin Sello" a "verificado con
 *           Sello" (siempre usó sólo `pnlR` del Libro Verificado — estaba
 *           mal etiquetado). Los 6 ejes son ahora Verificados/con Sello.
 */
export const ENGINE_VERSION = "0.2.0";
