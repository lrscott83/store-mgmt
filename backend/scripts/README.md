# Migraciones — Guía rápida

## Flujo completo: migración EF Core → script SQL

### 1. Crear la migración EF Core

```bash
cd backend
dotnet ef migrations add <NombreMigracion> --project src/Infrastructure --startup-project src/SMCA.WebApi
```

Esto genera dos archivos en `src/Infrastructure/Migrations/`:
- `YYYYMMDDHHMMSS_<Nombre>.cs` — la migración (Up/Down)
- `YYYYMMDDHHMMSS_<Nombre>.Designer.cs` — snapshot del modelo

Para migraciones de **datos puros** (UPDATE, INSERT), edita el `.cs` y usa `migrationBuilder.Sql(...)` en `Up()` / `Down()`. El `Up()` se genera vacío.

### 2. Aplicar la migración contra las bases de datos

```bash
# Dev (smca)
dotnet ef database update --project src/Infrastructure --startup-project src/SMCA.WebApi \
  --connection "Host=localhost;Database=smca;Username=postgres;Password=postgres"

# Test (smca_test)
dotnet ef database update --project src/Infrastructure --startup-project src/SMCA.WebApi \
  --connection "Host=localhost;Database=smca_test;Username=postgres;Password=postgres"
```

> **Nota:** El `--connection` apunta a la BD exacta. El startup project carga `appsettings.Development.json` por defecto, pero `--connection` lo sobreescribe.

Verificar aplicacion:
```sql
SELECT "MigrationId" FROM "__EFMigrationsHistory" WHERE "MigrationId" LIKE '%<Nombre>%';
```

### 3. Crear el script SQL equivalente

Crea un archivo en `backend/scripts/` con la convencion:

```
NN-nombre-descriptivo.sql
```

donde `NN` es el siguiente numero secuencial (ver archivos existentes).

El script debe incluir:
1. Header con nombre, migracion EF y fecha
2. `BEGIN;` / `COMMIT;` (transaccion)
3. Los UPDATE / INSERT / DELETE necesarios
4. `INSERT INTO "__EFMigrationsHistory" ... ON CONFLICT ("MigrationId") DO NOTHING;`
5. SELECT de verificacion

Ejemplo basado en `09-update-module-prices.sql`:

```sql
-- =====================================================
-- 10: Descripcion corta
-- Migracion EF: YYYYMMDDHHMMSS_NombreMigracion
-- =====================================================

BEGIN;

-- SQL de la migracion (copiar del .cs, pero en SQL plano)
UPDATE "Tabla" SET "Columna" = valor WHERE condicion;

-- Registrar migracion en el historial de EF Core
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('YYYYMMDDHHMMSS_NombreMigracion', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verificar
SELECT * FROM "Tabla" WHERE condicion;
```

El `ProductVersion` debe coincidir con el que registro `dotnet ef database update` (verificar con `SELECT "ProductVersion" FROM "__EFMigrationsHistory" WHERE "MigrationId" = '...'`).

### 4. Commit

```bash
git add backend/src/Infrastructure/Migrations/<archivos> backend/scripts/<script>.sql
git commit -m "feat: <descripcion>"
git push
```

## Convenciones

- **Numeracion de scripts**: secuencial, sin ceros a la izquierda (01, 02, ... 10, 11)
- **`ON CONFLICT DO NOTHING`**: siempre incluirlo para que el script sea idempotente (puede ejecutarse multiples veces sin error)
- **Transaccion `BEGIN/COMMIT`**: los scripts de datos siempre dentro de una transaccion
- **`WHERE` explicito**: usar filtros para evitar UPDATE masivos no intencionales
- **Verificar despues**: siempre incluir un SELECT al final que muestre el resultado esperado

## E2E Guard

`Program.cs` incluye un guard que valida que la BD conectada es `smca_test` cuando se ejecuta en modo Testing. Esto solo afecta al runtime de la app, no a `dotnet ef` CLI. Si ves `[E2E Guard] ConnectionStrings:Application -> Database=...` al correr `dotnet ef`, es normal — solo es un log.
