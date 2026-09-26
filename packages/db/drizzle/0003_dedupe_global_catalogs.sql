-- Limpieza de duplicados en los catálogos GLOBALES (user_id IS NULL) de
-- confluences y emotional_states.
--
-- Causa: la UNIQUE (user_id, label) no frena duplicados cuando user_id es NULL
-- (en Postgres NULL <> NULL) y el seed de src/setup.ts (`on conflict do nothing`)
-- nunca disparaba, así que cada `db:setup` agregó otra copia entera.
--
-- Por cada etiqueta global queda UNA fila sobreviviente (la de menor id: estos
-- catálogos no tienen created_at). Las filas de unión que apuntaban a una copia
-- se re-apuntan al sobreviviente ANTES de borrar (si no, el ON DELETE CASCADE las
-- borraría); ON CONFLICT DO NOTHING evita violar la PK compuesta si una misma
-- anotación apuntaba a dos copias de la misma etiqueta.
--
-- La unicidad real para user_id NULL llega en la migración siguiente
-- (UNIQUE NULLS NOT DISTINCT); esta debe correr antes porque esa constraint
-- fallaría con los duplicados presentes.

INSERT INTO "annotation_confluences" ("annotation_id", "confluence_id")
SELECT ac."annotation_id", k."keep_id"
FROM "annotation_confluences" ac
JOIN "confluences" c ON c."id" = ac."confluence_id" AND c."user_id" IS NULL
JOIN (
  SELECT DISTINCT ON ("label") "label", "id" AS "keep_id"
  FROM "confluences" WHERE "user_id" IS NULL
  ORDER BY "label", "id"
) k ON k."label" = c."label"
WHERE c."id" <> k."keep_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "confluences" c
USING (
  SELECT DISTINCT ON ("label") "label", "id" AS "keep_id"
  FROM "confluences" WHERE "user_id" IS NULL
  ORDER BY "label", "id"
) k
WHERE c."user_id" IS NULL AND c."label" = k."label" AND c."id" <> k."keep_id";
--> statement-breakpoint
INSERT INTO "annotation_emotional_states" ("annotation_id", "emotional_state_id")
SELECT ae."annotation_id", k."keep_id"
FROM "annotation_emotional_states" ae
JOIN "emotional_states" e ON e."id" = ae."emotional_state_id" AND e."user_id" IS NULL
JOIN (
  SELECT DISTINCT ON ("label") "label", "id" AS "keep_id"
  FROM "emotional_states" WHERE "user_id" IS NULL
  ORDER BY "label", "id"
) k ON k."label" = e."label"
WHERE e."id" <> k."keep_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "emotional_states" e
USING (
  SELECT DISTINCT ON ("label") "label", "id" AS "keep_id"
  FROM "emotional_states" WHERE "user_id" IS NULL
  ORDER BY "label", "id"
) k
WHERE e."user_id" IS NULL AND e."label" = k."label" AND e."id" <> k."keep_id";
