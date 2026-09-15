// @tradevision/db — esquema Drizzle. Diseño desde cero.
//
// Diseño de referencia (NO copiar — repensar): `../../tradevision/packages/db/src/schema.ts`
// (18 tablas) y `../../tradevision/CLAUDE.md` §8 documentan qué invariantes de negocio
// vivían forzadas EN LA BASE DE DATOS, no solo en el código de esta app:
//   - trigger append-only en la tabla de operaciones verificadas (UPDATE/DELETE lanzan
//     excepción — corregir es un evento compensatorio, nunca un edit).
//   - CHECK que impide marcar una operación manual como verificada.
//   - CHECK de "exactamente un libro" en la tabla de anotaciones.
//   - RLS activado en todas las tablas de `public`, sin grants a anon/authenticated.
// Esas garantías fueron el resultado de discusiones de diseño reales — vale la pena
// releerlas antes de decidir si se replican igual o se resuelven distinto esta vez.
//
// Placeholder intencional: sin tablas todavía.
export {};
