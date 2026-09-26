-- Los 3 setups iniciales pasan a ser GLOBALES (user_id NULL), igual que
-- confluences y emotional_states: visibles para todos los usuarios, no sólo
-- para el usuario dev sembrado (setup.ts los creaba con el user_id de `dev:`).
--
-- Se hace con UPDATE (no insert + delete) para conservar los ids: una anotación
-- que apunte a uno de estos setups sigue válida (trade_annotations.setup_id es
-- ON DELETE SET NULL, un borrado la dejaría sin setup).
--
-- Requiere que 0004 ya haya dejado setups.user_id nullable. Si el entorno no
-- tiene esos setups (base nueva: las migraciones corren ANTES del seed), es un
-- no-op y el seed de setup.ts los inserta directamente como globales.
--
-- DISTINCT ON por nombre: si hubiera más de un usuario `dev:` con el mismo
-- setup, sólo uno se convierte (dos globales con el mismo nombre violarían la
-- unicidad); los demás quedan como propios de su usuario.

UPDATE "setups"
SET "user_id" = NULL
WHERE "id" IN (
  SELECT DISTINCT ON (s."name") s."id"
  FROM "setups" s
  WHERE s."user_id" IN (SELECT "id" FROM "users" WHERE "auth_provider_id" LIKE 'dev:%')
    AND (s."name", s."family") IN (
      ('FVG + CHoCH', 'SMC'),
      ('Silver Bullet', 'ICT'),
      ('Ruptura de rango asiático', 'Price Action')
    )
  ORDER BY s."name", s."created_at", s."id"
);
