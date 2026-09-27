# Migración de identidad y permisos: producción → test

Este directorio contiene el procedimiento completo para trasladar el **grafo de identidad y
permisos** de la base de datos de producción a la de test, de modo que un usuario migrado
pueda **iniciar sesión en test y ver exactamente los mismos permisos que tenía en producción**.

Es una migración, no una transformación. Los datos llegan byte a byte idénticos. No se
re-hashea nada, no se re-codifica nada, no se anonimiza nada y no se "actualiza" nada.

---

## 1. Antes de empezar: dos advertencias

**Los archivos CSV de este procedimiento contienen hashes de contraseña reales.** Son datos
sensibles. No los envíe por correo, no los suba a un repositorio y bórrelos en cuanto haya
verificado la carga. La carpeta `data/` está en `.gitignore` justamente para que nadie los
suba por error.

**No ejecute nada de este procedimiento sin leer la sección 3.** Si los dos secretos no
coinciden, la migración "funciona" y el usuario no puede entrar. El síntoma no señala esta
tarea, y eso es exactamente lo que hace peligroso hacerlo sin la comprobación previa.

---

## 2. Archivos de este directorio

| Archivo | Dónde se ejecuta | Qué hace |
| --- | --- | --- |
| `00-preflight-secrets.sh` | En el servidor, contra la configuración | Compara los dos secretos obligatorios y **detiene** el procedimiento si no coinciden |
| `01-extract.sql` | En **producción** | Solo lectura. Extrae las filas seleccionadas, un CSV por tabla, en `data/` |
| `02-load.sql` | En **test** | Una sola transacción. Carga en orden derivado. `ON CONFLICT DO NOTHING` |
| `03-verify.sql` | En **test** | Conteos, verificación de huérfanos y verificación de permisos |
| `data/` | — | Destino de los CSV. Git-ignored a propósito |

Todos los scripts se ejecutan con `psql`. Las rutas de los CSV son relativas al directorio de
trabajo actual, así que **todos los comandos `psql` de esta guía se ejecutan desde
`backend/scripts`**.

---

## 3. Paso 0 (obligatorio) — Migrar el esquema de test

**Este paso lo hace usted, antes de todo lo demás, y no lo hace ninguno de estos scripts.**

La base de datos de test debe tener el esquema completo y el catálogo sembrado. La forma
habitual en este proyecto es dejar que la aplicación aplique las migraciones de EF Core al
arrancar, es decir `Database.MigrateAsync()` contra `smca_test`.

Ese paso es el que crea las tablas **y** las filas de catálogo (`Role`, `Feature`, `Module`,
`StorePlan`, `Tenant`, y el usuario superadmin). Los scripts de este directorio no crean,
alteran ni borran ningún objeto de la base de datos: solo mueven filas.

Si se salta este paso, `02-load.sql` se detiene solo con un mensaje explícito, y con razón:
las tablas no existirían.

> Requisito adicional: **producción y test deben tener la misma cadena de migraciones.** El
> catálogo se siembra con identificadores fijos (`Role` 1 a 4, `StorePlan` 1 a 4, y así
> sucesivamente), de modo que si test va por detrás, un `FeatureId` copiado desde producción
> puede no existir en el catálogo de test. La consulta 3c de `03-verify.sql` detecta
> exactamente ese caso.

---

## 4. Paso 1 — Comprobación previa de los secretos (obligatoria)

```bash
cd backend/scripts
./prod-to-test/00-preflight-secrets.sh <especificación-origen> <especificación-destino>
```

Cada argumento dice **dónde vive el valor efectivo**. Dos formas admitidas:

| Forma | Significado |
| --- | --- |
| `file:<ruta>[,<ruta2>]` | Uno o varios archivos JSON de configuración. Si da varios, se fusionan en orden y **gana el último** que tenga la clave. Así se reproduce el valor efectivo de una configuración por capas. |
| `host:<contenedor>` | `docker exec <contenedor> printenv <VARIABLE>`, para el contenedor de la aplicación en ejecución. Esta forma lee el valor que el proceso **realmente** tiene, que es una prueba más fuerte que un archivo en disco. |

Ejemplos:

```bash
# dos contenedores en ejecución
./prod-to-test/00-preflight-secrets.sh host:smca_api host:smca_test_api

# dos archivos de configuración
./prod-to-test/00-preflight-secrets.sh file:/srv/prod/appsettings.json \
                                file:/srv/test/appsettings.json

# mezclando: origen desde el contenedor, destino desde el archivo
./prod-to-test/00-preflight-secrets.sh host:smca_api \
                                file:/srv/test/appsettings.json

# configuración por capas, en cada lado
./prod-to-test/00-preflight-secrets.sh \
    file:/srv/prod/appsettings.json,/srv/prod/appsettings.Production.json \
    file:/srv/test/appsettings.json,/srv/test/appsettings.Test.json
```

Los nombres de variable que usa la forma `host:` son los de doble subrayado que espera el
sistema de configuración de .NET: `Authentication__Pepper` y
`StoreEncryption__MasterSecret`. **No se le puede pasar otro nombre**: para una clave dada, el
nombre de la variable ya es fijo y conocido, y permitir escribirlo en el argumento solo
invitaría a comparar dos claves distintas.

Códigos de salida:

| Código | Significado |
| --- | --- |
| `0` | Las dos claves coinciden. Puede continuar. |
| `1` | Una clave difiere, falta en alguno de los dos lados, o no se pudo leer alguna especificación. **Detenido.** |
| `2` | Uso incorrecto: número de argumentos equivocado, o un argumento que empieza por `-`. **Detenido.** |

En los tres casos en que el código no es `0`, la migración no debe empezar.

El script **nunca imprime el valor del secreto**. Imprime solamente el nombre de la clave, la
palabra `MATCH`, `MISMATCH` o `NOT FOUND`, y dónde corregirlo.

**Por qué esto es una negativa y no una advertencia.** `User.Password` es un hash Argon2id
*picado* con `Authentication:Pepper`. Si el pepper difiere, cada usuario migrado es rechazado
con `Auth.InvalidCredentials` aunque los datos sean perfectos. Y `User.OfflinePasswordPreHash`
va cifrado con AES-256-GCM a partir de `StoreEncryption:MasterSecret`, usando el `userId` como
AAD: si esa clave difiere, el login sigue devolviendo 200 pero la DEK envuelta vuelve vacía y
el punto de venta cae silenciosamente en la pantalla de desbloqueo. Ninguno de los dos fallos
señala esta tarea. Por eso se comprueba antes y se detiene.

Si el script no encuentra un lector de JSON que funcione (no hay `jq`, o el `python3` del
sistema es solo un atajo de instalación que no arranca de verdad), avisa por pantalla y recurre
a una coincidencia de texto sobre el nombre de la clave. Tome ese aviso como una razón para
instalar `jq`, no como una comprobación válida.

---

## 5. Paso 2 — Extracción desde producción

**Solo lectura.** `01-extract.sql` no contiene ninguna sentencia que modifique datos ni ninguna
que modifique el esquema. No hay forma de que esta etapa pueda dañar producción.

```bash
cd backend/scripts
mkdir -p prod-to-test/data

psql "$SOURCE_DSN" -f prod-to-test/01-extract.sql \
  | tee prod-to-test/extract-baseline.txt
```

`**SOURCE_DSN**` es la cadena de conexión de **producción**, con su cadena de `psql` completa,
por ejemplo `postgresql://usuario:clave@host:5432/smca`.

Qué produce:

1. Por pantalla: el **conteo base** de las 12 tablas y el resumen de permisos por rol. **Guarde
   esa salida** en `extract-baseline.txt`. Es el lado "antes" de la comparación.
2. En `prod-to-test/data/`: 12 archivos CSV, uno por tabla, con encabezado.

Los dos bloques se ejecutan dentro de una única instantánea `REPEATABLE READ`, de modo que los
conteos y las filas describen el mismo instante aunque producción se esté escribiendo mientras
se ejecuta.

Las listas de columnas son explícitas, nunca `SELECT *`: así una columna agregada más adelante
no puede desplazar datos silenciosamente hacia otra columna.

### Verificación rápida de la extracción

```bash
ls -l prod-to-test/data/            # 12 CSV
head -2 prod-to-test/data/05-store.csv
wc -l prod-to-test/data/*.csv       # las líneas menos 1 son datos (salvo campos con salto de línea)
```

---

## 6. Paso 3 — Carga en test

```bash
cd backend/scripts

# solo identidad y permisos (el comportamiento por defecto)
psql "$TARGET_DSN" -f prod-to-test/02-load.sql
```

Los bloques de datos de negocio son opcionales y están **apagados por defecto**. Cada uno se
activa con su propia bandera, sin tocar el SQL:

```bash
psql "$TARGET_DSN" -v load_product_category=1     -f prod-to-test/02-load.sql
psql "$TARGET_DSN" -v load_product=1               -f prod-to-test/02-load.sql
psql "$TARGET_DSN" -v load_channel_exchange_rate=1 -f prod-to-test/02-load.sql
```

`load_product` exige `load_product_category` (un producto tiene clave foránea obligatoria hacia
su categoría). Pedir uno sin el otro detiene la carga con un mensaje claro.

`**TARGET_DSN**` es la cadena de conexión de **test**.

### Qué garantiza esta carga

- **Una sola transacción.** Un `BEGIN`, un `COMMIT`. Si algo falla, `psql` se detiene y la base
  de datos queda exactamente como estaba: nunca medio poblada.
- **Nunca borra nada.** No hay `DELETE`, ni `TRUNCATE`, ni sobrescritura. El superadmin
  sembrado, su fila en `UserRole` y el `Tenant` por defecto quedan intactos. Las filas
  migradas se **agregan** a lo que test ya tenía.
- **Es idempotente.** Todas las inserciones usan `ON CONFLICT DO NOTHING`, así que volver a
  ejecutarla no duplica nada ni pisa nada.
- **No crea ni altera ningún objeto de la base de datos.** Las tablas de paso que aparecen en
  el script son tablas temporales de sesión, declaradas `ON COMMIT DROP`: existen solo durante
  la transacción y desaparecen al terminar. Son el mecanismo que hace posible combinar
  `COPY` (que no admite `ON CONFLICT`) con una inserción idempotente. No son tablas del
  esquema, no sobreviven a la sesión y no las ve nadie más.

### Por qué `ON CONFLICT DO NOTHING` no lleva destino de conflicto

Además de la clave primaria, el modelo tiene estos índices únicos adicionales:

| Índice | Tabla |
| --- | --- |
| `User.Login` | `User` |
| `UserId` | `Owner`, `ReSeller`, `StoreUser` |
| `OwnerId` | `ReSellerOwner` (su clave primaria es `ReSellerId` + `OwnerId`) |

Nombrar solo la clave primaria como destino dejaría que una colisión en uno de esos índices
abortara la carga. La forma sin destino salta cualquier fila conflictiva, de modo que una
reejecución no hace nada y una fila ya presente nunca se pisa.

Una fila padre saltada no es corrupción silenciosa: si un `User` se salta porque su `Login` ya
pertenece a otro usuario en test, el `Owner` que depende de él se queda sin padre y toda la
transacción revierte con un error de clave foránea. No queda nada a medias. Resuelva la
colisión de `Login` y vuelva a ejecutar la carga.

---

## 7. Corrección del orden de carga

**El borrador original de este procedimiento tenía el orden invertido y no podía funcionar.**
Se documenta aquí para que quede constancia.

El documento de trabajo listaba los pasos "de hoja a raíz" (`UserRole`, después `User`, etc.) y
colocaba `Product` antes de `ProductCategory`. Ambas cosas son imposibles contra este modelo:
PostgreSQL valida la clave foratoria **en la entrada**, así que una tabla hija no puede
cargarse antes de que su tabla padre tenga la fila.

Este modelo declara **34 claves foráneas y las 34 son `DeleteBehavior.Restrict`. No hay ni una
sola cascada en todo el modelo.** El orden que realmente funciona, derivado de esas 34
claves, es:

| # | Tabla | Claves foráneas que la bloquean |
| --- | --- | --- |
| 1 | `User` | — |
| 2 | `Owner` | `User` |
| 3 | `ReSeller` | `User` |
| 4 | `ReSellerOwner` | `ReSeller`, `Owner` |
| 5 | `Store` | `Owner`, `StorePlan` (catálogo) |
| 6 | `StoreModule` | `Store`, `Module` (catálogo) |
| 7 | `StoreRoleFeature` | `Store`, `Role`, `Feature` (catálogo) |
| 8 | `StoreUser` | `Store`, `User` |
| 9 | `UserRole` | `User`, `Role` (catálogo) |
| 10 | `ProductCategory` *(opcional)* | `Store` |
| 11 | `Product` *(opcional)* | `ProductCategory` |
| 12 | `ChannelExchangeRate` *(opcional)* | `Store` |

Contiene las mismas 12 tablas del documento, en la secuencia correcta. Entre las tablas 6, 7 y
8 el orden relativo es libre: las tres dependen de `Store` y ninguna de las otras dos.

---

## 8. Qué se migra y qué no

### Se migra — el grafo de identidad y permisos

| Tabla | Por qué es necesaria |
| --- | --- |
| `User` | La cuenta. Lleva el hash Argon2id de `Password`. |
| `Owner` | Relación 1:1 con `User`. |
| `ReSeller` | Relación 1:1 con `User`. La fila del Gestor. |
| `Store` | La tienda, con su `StorePlanId`. |
| `StoreUser` | Pertenencia de empleado. |
| `UserRole` | Qué rol tiene el usuario. |
| `ReSellerOwner` | Enlace Gestor → Owner. **Sin esto un Gestor migrado ve la lista de owners vacía.** |
| `StoreModule` | Qué módulos compró la tienda, **con la instantánea de precio que se le cobró**. |
| `StoreRoleFeature` | Qué features tiene cada rol dentro de la tienda. **Aquí viven los permisos reales.** |

Las tres últimas no son opcionales. `StoreModule` y `StoreRoleFeature` son lo que produjo
`IStoreRoleFeatureGenerator` en cada tienda al crearla. **No se pueden derivar del catálogo**:
una base de datos reconstruida otorgaría un conjunto distinto, porque
`StoreRoleFeatureGenerator` descarta en silencio cualquier feature id sin entrada en el enum
`StoreRoleFeatures`. Copiar las filas producidas es la única forma de recuperar los permisos
reales. Omitirlas produce un usuario que inicia sesión correctamente y no ve nada, que es
justo el fallo que esta migración existe para evitar.

### Opcional — datos de negocio, cada uno con su bandera

| Tabla | Interruptor | Nota |
| --- | --- | --- |
| `ProductCategory` | `-v load_product_category=1` | Categorías. |
| `Product` | `-v load_product=1` | Catálogo de la tienda. Exige el anterior. |
| `ChannelExchangeRate` | `-v load_channel_exchange_rate=1` | Tasas de cambio por tienda. Necesario si se ejercita el trabajo multimoneda. |

### Explícitamente NO se migra

| Tabla | Por qué |
| --- | --- |
| `Order`, `OrderItem`, `OrderPayment` | Ventas. El mantenimiento ha indicado que las ventas están fuera de línea y en desuso. |
| `StorePayment` | Facturación del distribuidor. Misma familia. |
| `InventoryEntry`, `InventoryEntryCost` | Movimientos de inventario. |
| `RefreshTokens` | **Nunca.** `RefreshTokens.Token` guarda el refresh token **en texto plano** con 35 días de vigencia. Copiarla entrega sesiones de producción vivas. Es estado de sesión, sin ningún valor de migración. |
| `OutboxMessage` | Cola sin ámbito; las filas obsoletas se dispararían. |
| `StoreUsage` | Medidor de uso y cuota. Lleva direcciones IP de cliente en texto plano. Inclúyala solo si alguna tienda migrada no debe quedar bloqueada por un límite de uso de producción, y tenga presente que copia IP reales. |
| `Module`, `Feature`, `Role`, `StorePlan`, `StorePlanModule`, `StorePaymentStatus`, `SystemConfiguration` | Catálogo. No se copia: `Database.MigrateAsync()` lo reconstruye idéntico en test. Copiarlo haría divergir las dos bases y volvería imposible saber qué es catálogo y qué es dato. |
| `Tenant` | Fila sembrada. Test ya tiene el Tenant por defecto. |
| El `User` superadmin sembrado y su `UserRole` | **Debe sobrevivir intacto.** La carga no borra, no trunca y no sobrescribe. |

---

## 9. `User.Id` no se puede renumerar

Este es el punto que más fácilmente se rompe sin darse cuenta, así que va explícito:

**No renumeré los identificadores. No hay ningún paso de "arreglar los ids" en este
procedimiento, y no debe añadirse.**

`User.OfflinePasswordPreHash` va cifrado con AES-256-GCM y usa el **`userId` como AAD**
(*additional authenticated data*). El AAD no se guarda en la fila: es un valor que se
reintroduce al descifrar, y debe coincidir byte a byte con el que se usó al cifrar. Si una
copia reasigna la clave primaria, el descifrado falla exactamente igual que con una clave
maestra equivocada: el login responde 200 y la DEK envuelta vuelve vacía.

`COPY` conserva los identificadores tal cual. Por eso la carga no lleva ninguna etapa de
reasignación, y por eso los CSV se copian columna a columna y nunca con
`INSERT ... SELECT` sobre columnas renombradas.

---

## 10. Paso 4 — Verificación

```bash
cd backend/scripts
psql "$TARGET_DSN" -f prod-to-test/03-verify.sql | tee prod-to-test/verify-after.txt
```

Solo lectura. Qué mirar, en orden:

| Consulta | Qué comprueba | Valor aceptable |
| --- | --- | --- |
| 1 | Conteo de filas por tabla | Cada tabla debe tener **al menos** lo que tenía en origen. Compare con `extract-baseline.txt`. |
| 2 y 2b | Las filas sembradas | Deben aparecer las 3 y `seeded_rows_present` debe ser `3`. |
| 3, 3b, 3c | Catálogo | `grants_with_unknown_feature` debe ser `0`. Si no lo es, test va por detrás en migraciones. |
| 4 | Huérfanos | `TOTAL ORPHANS` **debe ser 0**. Cualquier otro valor significa datos a medias. |
| 5 | Permisos por rol | Debe coincidir con el bloque equivalente de `extract-baseline.txt`. |
| 6 y 6b | Permisos por tienda | Una tienda con `owner_grants = 0` es el fallo que esta migración evita. La 6b no debe devolver ninguna fila. |
| 7 | Instantánea de precio de módulos | Confirma que los importes cobrados se movieron tal cual. |

La comparación de la consulta 1 es manual y es así a propósito: el lado "antes" vive en el
servidor de producción y el lado "después" en test. El script no puede hacer la comparación por
usted.

### Comprobación funcional final

Inicie sesión en **test** con la contraseña de un usuario migrado. Si el pepper o la clave
maestra no coincidieran, esto falla en este momento y en ningún otro.

---

## 11. Reversa (rollback)

La carga es puramente aditiva: agrega filas y no toca ninguna fila existente. Por eso la
reversa exacta es borrar **solo** lo migrado, y eso significa borrar primero las tablas hoja
por las mismas razones del orden de carga. Todas las 34 claves foráneas son `Restrict`, así que
el borrado va en el orden inverso.

```sql
-- Solo si hace falta. NO forma parte de la migración: es la vuelta atrás.
BEGIN;

DELETE FROM "ChannelExchangeRate";
DELETE FROM "Product";
DELETE FROM "ProductCategory";
DELETE FROM "UserRole";
DELETE FROM "StoreUser";
DELETE FROM "StoreRoleFeature";
DELETE FROM "StoreModule";
DELETE FROM "Store";
DELETE FROM "ReSellerOwner";
DELETE FROM "ReSeller";
DELETE FROM "Owner";
DELETE FROM "User";

COMMIT;
```

**Advertencia importante:** ese `DELETE` es total y no distingue lo migrado de lo que test ya
tenía. **No lo ejecute sobre una base de test que ya tenga datos propios.** Si ese es su caso,
la alternativa segura es restaurar la base de test desde su respaldo previo a la carga, que es
lo que debería hacer en cualquier caso. La forma limpia de revertir una migración de este tipo
es el respaldo, no un `DELETE` escrito a mano.

En cualquier caso: **antes de la carga, guarde un respaldo de `smca_test`**
(`pg_dump`). Ese respaldo es su reversa real.

---

## 12. Limpieza

```bash
cd backend/scripts
shred -u prod-to-test/data/*.csv 2>/dev/null || rm -f prod-to-test/data/*.csv
```

Haga la limpieza **después** de haber verificado. Si la verificación falla y necesita
reintentar, conserve los CSV.

Los archivos `extract-baseline.txt` y `verify-after.txt` se pueden conservar: no contienen
secretos, solo conteos. Aun así, revise `verify-after.txt` antes de compartirlo: la consulta 7
muestra nombres de módulos y precios, y la consulta 2b muestra identificadores.

---

## 13. Nota sobre el alcance

Si algún día quiere migrar **una sola tienda** en lugar de todo el grafo, este procedimiento
tal como está no lo cubre: extrae el grafo completo. Es una variante distinta y requiere
filtrar cada `COPY` de `01-extract.sql` de forma coherente entre tablas, porque una fila hija
sin su padre aborta la transacción. No improvise el filtro sobre un solo archivo: la
transacción lo revertirá todo.
