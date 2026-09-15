// @tradevision/engine — analítica pura y versionada sobre el Libro Verificado.
//
// Convenciones a preservar (ver `../../tradevision/CLAUDE.md` §6, diseño de
// referencia, no código a copiar): funciones sin I/O ni `Date.now()` (recibir
// `asOf` como parámetro), y un `ENGINE_VERSION` que sube cada vez que cambia
// una fórmula, un orden o un gating — los tests de regresión dependen de eso.
export const ENGINE_VERSION = "0.0.0";

// Placeholder intencional: sin funciones de cómputo todavía.
export {};
