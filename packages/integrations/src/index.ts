// @tradevision/integrations — importadores, sync de bróker, motor de round-trips,
// presign de adjuntos. Diseño de referencia (NO copiar):
// `../../tradevision/packages/integrations` — en particular `round-trips.ts`
// (reconstrucción de operaciones desde fills sueltos, FIFO/LIFO/WAVG) fue una
// lección cara: el emparejador ingenuo original perdía scale-in/scale-out/flips
// en silencio. Vale la pena reconsiderar ese diseño, no reescribirlo a ciegas.
export {};
