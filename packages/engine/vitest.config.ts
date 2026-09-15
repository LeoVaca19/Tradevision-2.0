import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // El paquete arranca vacío; sin esto `pnpm test` falla con "no test files found".
    // Quitar en cuanto exista el primer test real.
    passWithNoTests: true,
  },
});
