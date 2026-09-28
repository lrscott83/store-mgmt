# Migración de identidad y permisos: producción → test

Este directorio contiene el procedimiento completo para trasladar el **grafo de identidad y
permisos** de la base de datos de producción a la de test, de modo que un usuario migrado
pueda **iniciar sesión en test y ver exactamente los mismos permisos que tenía en producción**.

Es una migración, no una transformación. Los datos llegan byte a byte idénticos. No se
re-hashea nada, no se re-codifica nada, no se anonimiza nada y no se "actualiza" nada.

**Todo esto ocurre en un solo sitio: el VPS.** Producción y test son **dos bases de datos del
mismo servidor**, no dos máquinas. No hay un servidor de test, no hay una segunda máquina, y
nada se copia de un equipo a otro: la extracción escribe los CSV en `prod-to-test/data/` en el
VPS, y la carga los lee de ahí, en ese mismo VPS, unos minutos después. Las dos cadenas de
conexión se diferencian en `Database=` (y en las credenciales), no en `Host=`.

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
| `00-preflight-secrets.sh` | En el servidor, contra la configuración | Compara los dos secretos obligatorios y **detiene** el procedimiento si no coinciden **o si no puede compararlos** |
| `01-extract.sql` | En **producción** | Solo lectura. Extrae las filas seleccionadas, un CSV por tabla, en `data/` |
| `02-load.sql` | En **test** | Una sola transacción. Carga en orden derivado. `ON CONFLICT DO NOTHING` |
| `03-verify.sql` | En **test** | Conteos, verificación de huérfanos y verificación de permisos |
| `data/` | — | Destino de los CSV de extracción y del registro de claves insertadas. Git-ignored a propósito |

Todos los scripts se ejecutan con `psql`. Las rutas de los CSV son relativas al directorio de
trabajo actual, así que **todos los comandos `psql` de esta guía se ejecutan desde
`backend/scripts`**.

---

## 3. Paso 0 (obligatorio) — Migrar el esquema de test

**Este paso lo hace usted, antes de todo lo demás, y no lo hace ninguno de estos scripts.**

La base de datos de test debe tener el esquema completo y el catálogo sembrado. Esto se hace
**en el mismo VPS**, contra `smca_test`: "test" aquí es una base de datos de ese servidor, no
otra máquina, así que este paso no requiere acceso a ningún otro equipo. La forma habitual en
este proyecto es dejar que la aplicación aplique las migraciones de EF Core al arrancar:
`MigrationExtensions.ApplyMigrations()` llama a `Database.Migrate()` contra `smca_test`, y
`Program.cs` la invoca como `app.ApplyMigrations()`.

**Esa llamada está dentro de `if (app.Environment.IsDevelopment())`.** Si el VPS o el contenedor
arranca la API con `ASPNETCORE_ENVIRONMENT=Production`, `Staging` o sin esa variable, **no se
aplica ninguna migración al arrancar**. Para un entorno que no sea `Development`, aplique las
migraciones de forma explícita antes de continuar y compruebe que `__EFMigrationsHistory` en
`smca_test` contiene la última migración.

#### La vía que sí depende de usted: arrancar la API una vez en `Development`

Es la más fiable y es el propio camino del repositorio: nada de la CLI de EF, ninguna fábrica de
tiempo de diseño de por medio, y la misma configuración que usa la aplicación.

```bash
# 1. La conexión de test, apuntando a smca_test
export ConnectionStrings__DefaultConnection="Host=<host>;Port=5432;Database=smca_test;Username=<usuario-test>;Password=<clave-test>"

# 2. Un arranque controlado con el entorno en Development
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/SMCA.WebApi/SMCA.WebApi.csproj

# 3. Verificar, con la API ya detenida
psql "$TARGET_DSN" -c 'SELECT count(*) FROM "__EFMigrationsHistory";'
```

Si el número no cambió, no se aplicó nada y hay que Investigarlo antes de seguir.

#### La vía con la CLI de EF, y por qué necesita el `--connection`

Si prefiere la CLI, instálela primero. **Este repositorio no la trae**: no hay un
`dotnet-tools.json`, así que `dotnet ef` no existe en una máquina recién clonada. Además la
herramienta debe ser de la **misma versión mayor** que EF Core, aquí 8.0:

```bash
dotnet tool install --global dotnet-ef --version 8.*
dotnet ef --version        # debe decir 8.x; si dice otra mayor, actualícela
```

El comando tiene que nombrar **los dos** proyectos: `Infrastructure` es el proyecto de EF Core
porque ahí vive `ApplicationDbContext` y su carpeta de migraciones, y `SMCA.WebApi` es el
proyecto de arranque que la herramienta necesita para construir el host.

```bash
cd backend

dotnet ef database update \
  --project            src/Infrastructure/Infrastructure.csproj \
  --startup-project    src/SMCA.WebApi/SMCA.WebApi.csproj \
  --connection         "Host=<host>;Port=5432;Database=smca_test;Username=<usuario-test>;Password=<clave-test>"
```

**No omita `--connection`.** Este repositorio tiene
`Infrastructure/Persistence/ApplicationDbContextDesignFactory.cs`, que implementa
`IDesignTimeDbContextFactory<ApplicationDbContext>` y fija la cadena
`Host=localhost;Database=design_time;Username=postgres;Password=postgres` con código, no con
configuración. La documentación de Microsoft es explícita sobre el orden: una fábrica de tiempo de
diseño tiene **precedencia sobre toda otra forma** de crear el `DbContext`, incluido el proveedor
de servicios de la aplicación. Es decir, la fábrica decide qué base de datos ven las
herramientas, y esa no es la suya. Pase siempre `--connection` y compruébelo:

```bash
# No abre conexión: solo informa qué base de datos usaría la herramienta.
dotnet ef dbcontext info \
  --project         src/Infrastructure/Infrastructure.csproj \
  --startup-project src/SMCA.WebApi/SMCA.WebApi.csproj \
  --connection      "Host=<host>;Port=5432;Database=smca_test;Username=<usuario-test>;Password=<clave-test>"
# La fila debe decir  DatabaseName = smca_test
```

Si ahí apareciera `design_time`, la herramienta migraría una base de datos paralela equivocada
dentro de `localhost`, y usted se quedaría sin cambios en `smca_test` sin darse cuenta. En ese
caso no insista con la CLI: use el arranque en `Development` de arriba, que no depende de nada de
esto. Y en cualquier caso, la comprobación que decide es siempre la misma y la última:
`__EFMigrationsHistory` en `smca_test`.

Ese paso es el que crea las tablas **y** las filas de catálogo (`Role`, `Feature`, `Module`,
`StorePlan`, `Tenant`, y el usuario superadmin). Los scripts de este directorio no crean,
alteran ni borran ningún objeto de la base de datos: solo mueven filas.

> **Las filas de `HasData` las escribe una migración, no el arranque.** Una vez registrada la
> migración como aplicada, volver a arrancar la aplicación **no** vuelve a crear una fila de
> semilla que se haya borrado. Si borra el superadmin, su fila en `UserRole` o el `Tenant` por
> defecto, la única forma de recuperarlos es restaurar el respaldo o insertarlos a mano. Por eso
> el paso 12 no se ejecuta hasta que termina la ventana de reversa.

Si se salta este paso, `02-load.sql` se detiene solo. El mensaje nombra las tablas que faltan, o
dice que el catálogo está vacío, o que falta el superadmin o el Tenant por defecto. No lo dice
todo de una vez: la comprobación se detiene en el primer problema que encuentra, así que puede
tener que resolverlos de uno en uno.

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
| `0` | Las dos claves coinciden y existen en los dos lados. Puede continuar. |
| `1` | Una clave difiere, o falta en alguno de los dos lados. **Detenido.** |
| `2` | **No se pudo hacer la comprobación.** Uso incorrecto (número de argumentos equivocado, o un argumento que empieza por `-`), o no hay ningún lector de JSON que funcione en esa máquina. **Detenido.** |

En los tres casos en que el código no es `0`, la migración no debe empezar.

El código `2` es distinto del `1` a propósito. `1` significa "se encontró una diferencia"; `2`
significa "no se llegó a un veredicto". Una comprobación que no puede hacerse no debe parecer una
comprobación que aprobó. Los dos detienen el procedimiento igual, pero solo uno de los dos
apunta a la causa.

El script **nunca imprime el valor del secreto**. Imprime solamente el nombre de la clave, la
palabra `MATCH`, `MISMATCH` o `NOT FOUND`, y dónde corregirlo.

**Por qué esto es una negativa y no una advertencia.** `User.Password` es un hash Argon2id
*picado* con `Authentication:Pepper`. Si el pepper difiere, cada usuario migrado es rechazado
con `Auth.InvalidCredentials` aunque los datos sean perfectos. Y `User.OfflinePasswordPreHash`
va cifrado con AES-256-GCM a partir de `StoreEncryption:MasterSecret`, usando el `userId` como
AAD: si esa clave difiere, el login sigue devolviendo 200 pero la DEK envuelta vuelve vacía y
el punto de venta cae silenciosamente en la pantalla de desbloqueo. Ninguno de los dos fallos
señala esta tarea. Por eso se comprueba antes y se detiene.

### Requisito: un lector de JSON que funcione

`00-preflight-secrets.sh` necesita `jq` **o** `python3` para leer las especificaciones. Cada uno
se prueba antes de usarse, así que un `python3` que es solo un atajo de instalación y no arranca
de verdad no cuenta como lector.

Si no hay ninguno, el script imprime `UNVERIFIABLE (no JSON reader available)` y **sale con
código `2`**. No recurre a una coincidencia de texto sobre el nombre de la clave, y esto es
deliberado: una coincidencia del nombre de la hoja descarta la ruta en la que ese nombre está y
no puede distinguir un secreto de otro. Puede capturar el valor de una clave **distinta** que
comparta el nombre final, o detenerse en la primera comilla de un valor que contiene una comilla
escapada. En cualquiera de los dos casos imprimiría `MATCH` para dos secretos distintos, y un
`MATCH` en falso es peor que no tener respuesta.

Instale `jq` en esa máquina y vuelva a ejecutar el script.

---

## 5. Paso 2 — Extracción desde producción

**Solo lectura.** `01-extract.sql` no contiene ninguna sentencia que modifique datos ni ninguna
que modifique el esquema. No hay forma de que esta etapa pueda dañar producción.

```bash
cd backend/scripts

umask 077
mkdir -p prod-to-test/data
rm -f prod-to-test/data/*.csv

psql "$SOURCE_DSN" -f prod-to-test/01-extract.sql \
  | tee prod-to-test/extract-baseline.txt
```

Esas dos líneas no son opcionales:

- **`umask 077`** tiene que estar en **esa** shell, en su propia línea, antes de llamar a
  `psql`. Los CSV los escribe `psql`, que es otro proceso y hereda el `umask` de la shell. Un
  `SET` dentro del SQL no serviría: este script corre dentro de una transacción `READ ONLY` y ahí
  no se permite un `SET`. Con el `umask` habitual (`022`) los doce archivos quedan como
  `-rw-r--r--`, y llevan hashes Argon2id reales, sobre de AES-256-GCM, nombres, correos y
  teléfonos. Cualquier cuenta local sin privilegios, o cualquier copia de seguridad o `scp` de
  ese directorio, los puede leer mientras existan.
- **`rm -f`** está ahí por una razón concreta. Nada borra los CSV al **comienzo** de una
  extracción, solo al final de todo el procedimiento; sin esta línea, un archivo de una
  ejecución anterior sobrevive a una extracción que nunca lo reescribió, y la carga lee una
  mezcla de dos ejecuciones. Borrándolos primero, "el archivo que está en disco" y "el archivo
  que escribió esta ejecución" son lo mismo. El patrón `*.csv` también borra los
  `NN-<tabla>-inserted.csv` que dejó la carga de una ronda anterior, y esa es la intención
  (§6): el registro de filas insertadas de una ronda vieja no debe sobrevivir a una ronda
  nueva. Note el orden: esta línea corre **al comienzo** de una ronda, nunca en la limpieza
  final; por eso el registro de la carga sobrevive durante toda la ventana de reversa.

`**SOURCE_DSN**` es la cadena de conexión de **producción**, con su cadena de `psql` completa,
por ejemplo `postgresql://usuario:clave@host:5432/smca`.

Qué produce:

1. Por pantalla: el **conteo base** de las 12 tablas, el **inventario de inquilinos** de la
   sección A2, el resumen de permisos por rol, y el número de filas que informa cada `COPY`.
   **Guarde esa salida** en `extract-baseline.txt`. Es el lado "antes" de la comparación, y su
   última parte es la única fuente fiable del número de filas por tabla.
2. En `prod-to-test/data/`: 12 archivos CSV, uno por tabla, con encabezado. La carga escribirá
   en ese mismo directorio otros 12, los `NN-<tabla>-inserted.csv` del registro de filas
   insertadas (§6); la extracción no los produce y no los necesita.

Los bloques se ejecutan dentro de una única instantánea `REPEATABLE READ`, de modo que los
conteos y las filas describen el mismo instante aunque producción se esté escribiendo mientras
se ejecuta.

Las listas de columnas son explícitas, nunca `SELECT *`: así una columna agregada más adelante
no puede desplazar datos silenciosamente hacia otra columna.

**Antes de continuar, lea el inventario de inquilinos de la sección A2.** Si no muestra una sola
fila de datos, o si marca más de un inquilino, **no cargue**. `01-extract.sql` no lleva filtro de
inquilino a propósito, y `02-load.sql` rechazará la carga, pero la decisión de seguirle o no es
suya y debe tomarla a conciencia.

### Verificación de la extracción

```bash
ls -l prod-to-test/data/            # 12 CSV de extracción, todos -rw------- (por el umask 077)
head -2 prod-to-test/data/05-store.csv
grep -c '^COPY ' prod-to-test/extract-baseline.txt   # 12: uno por tabla
```

**El número de filas de cada tabla es el que imprime cada `COPY` al terminar, en
`extract-baseline.txt`.** No use `wc -l` para eso: un campo entrecomillado puede contener un
salto de línea, así que el número de líneas no es el número de filas y sale mayor. Los permisos
del archivo de datos que sí importan son los de `ls`: si aparece `-rw-r--r--`, el `umask` no
surtió efecto y los archivos están legibles para cualquiera.

---

## 6. Paso 3 — Carga en test

```bash
cd backend/scripts

umask 077

# solo identidad y permisos (el comportamiento por defecto)
psql "$TARGET_DSN" -f prod-to-test/02-load.sql
```

El `umask 077` también aquí, y por la misma razón que en la sección 5: la carga escribe
archivos en `prod-to-test/data/`, y los escribe su propio proceso `psql`, que hereda el
`umask` de la shell. Esos archivos son el registro de filas insertadas (§6, "El registro de
filas insertadas") del que depende la reversa de la sección 11. Contiene identificadores de
usuario, de tienda y de datos de negocio de producción, así que merece el mismo tratamiento
que los CSV de extracción. Si ve `-rw-r--r--` en cualquiera de los veinticuatro archivos,
el `umask` no surtió efecto.

Los bloques de datos de negocio son opcionales y están **apagados por defecto**. Cada uno se
activa con su propia bandera, sin tocar el SQL:

```bash
psql "$TARGET_DSN" -v load_product_category=1     -f prod-to-test/02-load.sql
psql "$TARGET_DSN" -v load_product=1               -f prod-to-test/02-load.sql
psql "$TARGET_DSN" -v load_channel_exchange_rate=1 -f prod-to-test/02-load.sql
```

Las banderas se leen **por valor, no por presencia**. Cualquier valor distinto de `0`, `false`,
`off`, `no` o vacío enciende el bloque, así que `-v load_product=0` es **apagado**, no encendido.
No es un detalle teórico: una bandera a la que se le pasa `0` y que enciende el bloque es peor que
no tener bandera.

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
  ejecutarla no duplica nada ni pisa nada. Vea más abajo por qué eso no basta para saber que
  todo llegó, y por qué el script no confía solo en ello.
- **No crea ni altera ningún objeto de la base de datos.** Las tablas de paso que aparecen en
  el script son tablas temporales de sesión, declaradas `ON COMMIT DROP`: existen solo durante
  la transacción y desaparecen al terminar. Son el mecanismo que hace posible combinar
  `COPY` (que no admite `ON CONFLICT`) con una inserción idempotente. No son tablas del
  esquema, no sobreviven a la sesión y no las ve nadie más.

### Las cinco guardas de la carga

Todo esto corre **antes** del `COMMIT`, que es la única ventana en la que se puede deshacer. Las
dos primeras corren además **antes** del `BEGIN`, cuando todavía no hay transacción abierta que
deshacer y ninguna fila se ha escrito.

| Guarda | Qué detiene |
| --- | --- |
| Esquema y catálogo | Tablas inexistentes, catálogo vacío, o falta del superadmin o del `Tenant` por defecto. |
| Columnas | Cualquiera de las doce tablas cuyas columnas no coincidan con la lista de este script. Ver "La comprobación de columnas". |
| Inquilino | Cualquier fila cargada cuyo `TenantId` no sea el `Tenant` por defecto. |
| Tablas de paso no vacías | Cualquiera de las nueve tablas obligatorias con cero filas. |
| Filas que no llegaron | Cualquier fila cargada, de **las doce tablas**, que no esté en test. Se acepta solo con `-v allow_resume=1`. |

Sobre la guarda de inquilino, que es la menos evidente: **`TenantId` no es una clave foránea en
este modelo.** Ningún `HasForeignKey` del snapshot nombra a `Tenant` como tabla principal, así que
PostgreSQL no rechaza nada. Lo que oculta esas filas son los filtros de consulta de EF
(`HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId)`) y el hecho de
que `HttpContextService` lee el `TenantId` de un *claim* del JWT. Una fila de un segundo
inquilino se carga sin quejarse y después queda **invisible**: está en la tabla y ninguna
petición normal la devuelve nunca. Por eso hay un inventario de inquilinos en la sección A2 de
`01-extract.sql`, y por eso la carga se niega a confirmar.

Sobre la guarda de tablas de paso vacías: una tabla de paso vacía es indistinguible de una carga
correcta de cero filas, y la comparación de conteos informaría `0 = 0` y lo daría por bueno. Las
nueve tablas obligatorias no pueden estar vacías legítimamente. Las tres opcionales sí, y por eso
quedan fuera de la guarda: una tienda sin productos produce de verdad un `11-product.csv` vacío.

### Vacío legítimo y fila perdida no se ven igual

Esta distinción es la que hace que la guarda de "filas que no llegaron" no tenga que adivinar.
Si una tabla de negocio opcional llegó vacía desde producción, su CSV tiene solo el
encabezado; la carga crea la tabla de paso, `COPY` no inserta nada, y la comparación de conteos
da `0 filas cargadas` contra `0 filas en destino`. Eso es un resultado correcto y la carga
confirma.

Si en cambio una fila se perdió por el camino, la comparación da `1 cargada` contra `0 en
destino`, o `3` contra `2`, y la carga se detiene. El paso intermedio de esta carga usa
`ON CONFLICT DO NOTHING`, así que una fila que ya existía en test por su clave **no** cuenta
como cargada: es exactamente el caso que la reejecución con `allow_resume=1` acepta a
propósito, y el caso que la primera ejecución nunca debería dejar pasar.

### El registro de filas insertadas

Al final de la carga, ya con todas las guardas superadas pero **antes** del `COMMIT`, el script
escribe un archivo por tabla en `prod-to-test/data/`, llamado
`NN-<tabla>-inserted.csv`. No es un resultado intermedio ni un aviso: es el inventario de **qué
filas insertó esta ejecución**, y es lo que hace posible la reversa de la sección 11 sin borrar
nunca algo que ya estuviera en test.

Cada archivo lleva **solo las columnas de clave**, nunca la fila completa. La idea es que la
reversa pueda borrar filas sin volver a exponer hashes Argon2id, correos y teléfonos a disco por
segunda vez.

Cómo se calcula, y por qué no puede ser de otra manera: antes de cada `INSERT`, el script copia
las claves de la tabla de paso a una tabla temporal de preimagen llamada `pre_<tabla>`. Después
del `INSERT`, la fórmula es

```
insertadas  =  (claves de stg_ presentes ahora en el destino)  menos  (pre_<tabla>)
```

Es decir, el conjunto de filas que esta ejecución insertó es **la diferencia** entre lo que
acaba de quedar en la tabla destino y lo que ya estaba en ella un instante antes del `INSERT`.

Un matiz importante, porque es donde se comete un error fácil: **`load_not_landed` no es ese
conjunto.** `load_not_landed` reúne las filas que la carga no llegó a insertar, porque ya
estaban en destino. Es el conjunto contrario. Confundir los dos —tomar `load_not_landed` por lo
insertado— invierte por completo el sentido de la reversa y borra justo lo que había que
conservar. Por eso el registro se calcula con las preimágenes y no a partir de la tabla de filas
que no llegaron.

Para las tres tablas opcionales que no llegaron a cargarse, el archivo se escribe igualmente
con solo el encabezado y cero filas de datos. Así siempre hay **doce** archivos, la reversa no
necesita banderas para saber cuáles existieron, y un archivo vacío significa "esta ejecución no
insertó nada aquí" y nunca "este archivo no se escribió".

Justo antes del `COMMIT`, la carga imprime además un resumen de las nueve tablas obligatorias
con tres columnas: `table_name`, `already_in_target` (cuántas claves ya estaban en destino antes
del `INSERT` de esta ejecución) e `inserted_by_this_run` (cuántas escribió esta ejecución).
Una reejecución sobre una carga ya completada muestra `0` en `inserted_by_this_run` en las
nueve, que es la respuesta honesta: no se insertó nada nuevo. Lea esa segunda columna antes de
anotar el resultado de la carga; es el número que la reversa de la sección 11 va a borrar.

Una segunda carga sobrescribe los doce archivos. Si vuelve a ejecutar la carga dentro de la
ventana de reversa, el registro describe la segunda ejecución, no la primera, y la reversa
trabajará sobre el conjunto más reciente. Es una limitación deliberada y documentada del
enfoque: para una vuelta completa al punto de partida, el `pg_dump` de la sección 10 es la
referencia, no este registro.

### Reejecución: `allow_resume`

```bash
psql "$TARGET_DSN" -v allow_resume=1 -f prod-to-test/02-load.sql
```

Por defecto la carga **se niega a confirmar** si alguna fila cargada no llegó. Antes de eso
imprime, una por una, las filas que no llegaron: con su login, o el nombre de la tienda, o el
Gestor, no un identificador desnudo, y con el índice que pudo provocar el salto.

`allow_resume=1` es la forma deliberada y documentada de aceptar esa diferencia. **Es la
respuesta correcta en una reejecución real**, donde la diferencia sí es lo esperado: la fila ya
estaba, y saltarla fue lo correcto. **Es la respuesta equivocada la primera vez**, donde esa
misma diferencia es pérdida de datos silenciosa, y después del `COMMIT` nada de este
procedimiento vuelve a detectarla.

### La comprobación de columnas

`02-load.sql` comprueba, **antes de leer una sola fila**, que las listas de columnas que este
archo usa siguen describiendo las tablas del servidor. Para cada una de las doce tablas
compara la lista que el propio script va a pedir con las columnas que la tabla tiene de
verdad, leídas de `pg_attribute`: `attnum > 0` deja fuera las columnas del sistema, `NOT
attisdropped` deja fuera las que un renombrado dejó atrás, y `relname` es la tabla. Si
cualquiera de las dos listas tiene una columna que la otra no tiene, la carga se detiene con
un mensaje que nombra la tabla, la columna, y la posición en la que las dos listas dejan de
coincidir.

Es comprobación pura en SQL, así que **da lo mismo en cualquier versión del servidor**. No hay
que detectar nada, no hay mensaje de requisito y no hay dos niveles de comprobación según la
versión.

#### Por qué reemplaza a `COPY ... HEADER MATCH`

`HEADER MATCH` tenía dos comportamientos según el servidor: en PostgreSQL 15 o posterior
comparaba la línea de encabezado del CSV con la tabla, y en cualquier versión anterior la
carga caía a `HEADER true`, es decir **leía el encabezado y lo descartaba sin comprobarlo**.
Un procedimiento que mueve credenciales reales no puede depender de en qué versión esté el
servidor para saber si está o no protegido.

La comprobación nueva cubre además un caso. `HEADER MATCH` preguntaba si los nombres del
encabezado del CSV correspondían a la tabla; esta pregunta si los nombres escritos **en este
script** siguen correspondiendo a la tabla. Y ese es justamente el punto por donde entraron
las ocho columnas de la fusión de `origin/test`: los dos archivos llevaban la lista vieja, y
el CSV se había escrito a partir de ella. Además falla antes de leer una fila, no a mitad de
un `COPY` con la transacción ya abierta.

#### La comparación es por nombre, no por orden físico

Las dos listas se ordenan por nombre y luego se comparan posición por posición. Comparar
contra el orden físico (`attnum`) se descartó a propósito, por dos razones:

- Las listas de aquí siguen el orden del modelo EF —las columnas clave primero y el resto en
  orden alfabético—, y ese **no** es el orden de `attnum`. `User` se creó como `Id`, `Login`,
  `Password`, `FullName`, `CellPhone`, … y `OfflinePasswordPreHash` la añadió una migración
  posterior. Una comparación estricta por ordinal rechazaría las doce tablas en una base de
  datos perfectamente sana.
- El orden de `attnum` no es un contrato portátil en este repositorio. Hay scripts de DDL
  numerados escritos a mano en `backend/scripts/` que se aplican junto a las migraciones de
  EF. Si el mismo conjunto de `ADD COLUMN` se aplicó en un orden distinto en producción que
  en test, el orden físico es distinto y el esquema es idéntico; una comprobación que
  disparara ahí detendría una migración correcta.

Además, una columna movida de sitio en disco es inofensiva aquí: todos los `\copy` nombran sus
columnas, así que nada depende de su orden.

#### Lo que esta comprobación no ve

El orden de la lista no se compara con nada, y ese orden es el que empareja el campo *n* del
CSV con la columna *n*. Las dos copias de la lista —la del bloque de comprobación y la de
cada `\copy`— están escritas a mano, y esta comprobación no puede ver ni el encabezado del CSV
ni la línea del `\copy`. Un `\copy` que nombre una columna inexistente, o un número incorrecto
de ellas, lo detecta el propio `\copy`. Un `\copy` que reordene las columnas sin reordenar
`01-extract.sql` igual no lo detecta nada: los datos aterrizan en las columnas equivocadas y
las comparaciones de conteo de `03-verify.sql` no lo ven. **Mantenga las dos listas en el
mismo orden.**

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

### Por qué la clave foránea no salva aquí

Una versión anterior de este documento afirmaba que una fila padre saltada no era corrupción
silenciosa: si un `User` se saltaba porque su `Login` ya pertenecía a otro usuario en test, el
`Owner` que depende de él se quedaba sin padre y toda la transacción revertía con un error de
clave foránea. **Eso solo es cierto cuando la fila saltada tiene al menos una fila dependiente
entre las nueve tablas que se cargan.**

Un usuario de producción sin `Owner`, sin `ReSeller`, sin `StoreUser` y sin `UserRole` —una
cuenta registrada pero nunca aprobada— no tiene dependientes. Nada falla, la transacción
confirma, `psql` sale con `0` y la cuenta simplemente no existe en test. Lo mismo ocurre con un
login registrado pero nunca usado: el `Login` del superadmin sembrado es literalmente `admin`,
así que cualquier otra cuenta de producción que lo tenga se pierde exactamente así, en
silencio.

Dos tablas de clave compuesta tienen la misma exposición, y allí es peor, porque lo que
desaparece es un enlace:

- `ReSellerOwner.OwnerId` es **único** (la clave es `ReSellerId` + `OwnerId`), así que un Gestor
  migrado pierde ese Owner si en test ese Owner ya está enlazado a otro Gestor. El Gestor entra
  y ve la lista de owners vacía.
- `StoreUser.UserId` es **único** (la clave es `UserId` + `StoreId`), así que una segunda
  pertenencia a tienda legítima del mismo empleado se puede perder.

Por eso la forma sin destino se queda —es la única forma segura frente a los cinco índices
secundarios— y el salto se vuelve visible y fatal en lugar de dejarlo pasar: la carga imprime las
filas que no llegaron, con su nombre, y **se niega a confirmar** mientras la transacción todavía
se pueda deshacer. Resuelva la colisión y vuelva a ejecutar.

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
| `Module`, `Feature`, `Role`, `StorePlan`, `StorePlanModule`, `StorePaymentStatus`, `SystemConfiguration` | Catálogo. No se copia: `Database.Migrate()` lo reconstruye idéntico en test. Copiarlo haría divergir las dos bases y volvería imposible saber qué es catálogo y qué es dato. |
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
| 8 y 8b | Integridad de inquilino | `TOTAL ROWS WITH AN UNKNOWN TENANT` **debe ser 0**. La 8b es informativa: si tras la carga hay más de un inquilino con filas, el origen no era de un solo inquilino. |
| 9a y 9b | Enlaces Gestor → Owner | La 9a **no debe devolver ninguna fila**: un Gestor sin ningún Owner es exactamente el fallo que un `ReSellerOwner` perdido produce, y la consulta 4 no lo puede ver. En la 9b, `owners = 0` es un fallo. |
| 9c | Owners sin Gestor | Informativa. Un Owner sin ningún Gestor no es incorrecto por sí mismo, pero una tienda cuyo Owner está en esa lista no tiene quién la administre. |

La comparación de la consulta 1 es manual y es así a propósito: el lado "antes" vive en el
servidor de producción y el lado "después" en test. El script no puede hacer la comparación por
usted.

### El registro de filas insertadas, antes de que lo necesite

Compruebe ahora que el registro de la sección 6 existe y es completo. Es el insumo de la
reversa, y si falta un archivo no lo va a notar hasta el día que quiera revertir:

```bash
ls prod-to-test/data/*-inserted.csv | wc -l     # debe dar 12
head -1 prod-to-test/data/01-user-inserted.csv  # debe ser:  Id
head -1 prod-to-test/data/07-store-role-feature-inserted.csv
# debe ser:  StoreId,RoleId,FeatureId
```

`wc -l` **sí** sirve aquí, a diferencia de los CSV de extracción: estos archivos solo tienen
claves y ningún campo puede contener un salto de línea. Un archivo con cero filas de datos
tiene exactamente una línea, la del encabezado, y eso es correcto: significa que esta ejecución
no insertó nada en esa tabla.

Si el conteo da menos de 12, la carga se interrumpió antes de escribir el registro. Investigue
antes de seguir: un `COMMIT` confirmado sin registro es un estado desde el cual la reversa
acotada no se puede reconstruir.

### Comprobación funcional final

Inicie sesión en **test** con la contraseña de un usuario migrado. Si el pepper o la clave
maestra no coincidieran, esto falla en este momento y en ningún otro.

---

## 11. Reversa (rollback)

La carga es puramente aditiva: agrega filas y no toca ninguna fila existente. Por eso la
reversa exacta es borrar **solo** lo migrado, y eso significa borrar primero las tablas hoja por
las mismas razones del orden de carga. Todas las 34 claves foráneas son `Restrict`, así que el
borrado va en el orden inverso.

### El `DELETE` total está prohibido

Un `DELETE FROM "User"` sin condición no distingue lo migrado de lo que test ya tenía. Estas son
las **únicas tres filas** que las migraciones de este repositorio siembran por código
(`HasData`) y que tocan este procedimiento:

| Fila sembrada | Identificador | ¿La toca esta reversa? |
| --- | --- | --- |
| `Tenant` "Default Tenant" | `b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8` | No: `Tenant` no es una de las doce tablas migradas |
| `User` superadmin (`Login = admin`) | `38b96d85-bf75-41ca-bfd7-796e7fe0ebc8` | No, y por diseño, como se explica abajo |
| `UserRole` del superadmin al rol `1` | `38b96d85-…-796e7fe0ebc8` + `RoleId = 1` | No, y por diseño, como se explica abajo |

Una revisión anterior de este README listaba también un `Owner` "Admin Owner" con el mismo `Id`
que el `Tenant` por defecto, y una `Store` "Default Store"
(`0ed24a91-6748-4f04-8902-7981a0ca79e0`). **Esas dos filas ya no existen**, y no por decisión de
este documento: la migración `20240910194934_Create-Store-Module-Price.cs` las borra con
`DeleteData` (líneas 30-33 para `Store`, y 35-38 para `Owner`), y por eso el snapshot actual
`ApplicationDbContextModelSnapshot.cs` no tiene ningún bloque `HasData` en `Owner` ni en
`Store`. Una fila que la migración ya eliminó no la puede destruir un `DELETE`.

Las tres que quedan no son recuperables por un simple reinicio de la aplicación: las escribe una
migración, y volver a arrancar el backend no las vuelve a crear. Por eso la reversa está acotada
y por eso el paso 12 no borra nada hasta que la ventana de reversa termina.

### Reversa acotada a las filas que esta ejecución insertó

La reversa no puede usar los CSV de extracción como fuente de "qué borrar", y esa es la razón de
que exista el registro de la sección 6. Un CSV de extracción es la foto de **producción**, y
mezcla dos clases de filas que este procedimiento nunca debe tratar igual:

- las que en test **no** existían y esta carga creó;
- las que en test **ya** existían, con la misma clave, y la carga dejó intactas a propósito
  (`ON CONFLICT DO NOTHING`).

Borrar por el CSV borraría las dos clases, es decir, borraría filas que test ya tenía antes de
que usted empezara. El registro `NN-<tabla>-inserted.csv` contiene **solo la primera clase**,
porque la carga lo calculó con las preimágenes `pre_<tabla>` de cada tabla. Eso es lo que hace
que esta reversa no pueda tocar una fila preexistente por construcción, y no por cortesía.

Guárdelo como `prod-to-test/04-rollback.sql` **fuera** de este directorio, para que nadie lo
ejecute por accidente junto con la migración.

```sql
\set ON_ERROR_STOP on
\pset pager off

-- Mismo directorio de trabajo que la carga: backend/scripts
BEGIN;

-- Tablas de paso con SOLO las claves que esta ejecución insertó. Nada más:
-- ni contraseñas, ni correos, ni teléfonos. Las columnas y sus tipos son las
-- claves primarias del modelo (ApplicationDbContextModelSnapshot.cs).
CREATE TEMP TABLE rb_user ("Id" uuid PRIMARY KEY) ON COMMIT DROP;
\copy rb_user ("Id") FROM 'prod-to-test/data/01-user-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_owner ("Id" uuid PRIMARY KEY) ON COMMIT DROP;
\copy rb_owner ("Id") FROM 'prod-to-test/data/02-owner-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_reseller ("Id" uuid PRIMARY KEY) ON COMMIT DROP;
\copy rb_reseller ("Id") FROM 'prod-to-test/data/03-reseller-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_reseller_owner ("ReSellerId" uuid, "OwnerId" uuid, PRIMARY KEY ("ReSellerId", "OwnerId")) ON COMMIT DROP;
\copy rb_reseller_owner ("ReSellerId", "OwnerId") FROM 'prod-to-test/data/04-reseller-owner-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_store ("Id" uuid PRIMARY KEY) ON COMMIT DROP;
\copy rb_store ("Id") FROM 'prod-to-test/data/05-store-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_store_module ("StoreId" uuid, "ModuleId" integer, PRIMARY KEY ("StoreId", "ModuleId")) ON COMMIT DROP;
\copy rb_store_module ("StoreId", "ModuleId") FROM 'prod-to-test/data/06-store-module-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_store_role_feature ("StoreId" uuid, "RoleId" integer, "FeatureId" integer, PRIMARY KEY ("StoreId", "RoleId", "FeatureId")) ON COMMIT DROP;
\copy rb_store_role_feature ("StoreId", "RoleId", "FeatureId") FROM 'prod-to-test/data/07-store-role-feature-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_store_user ("UserId" uuid, "StoreId" uuid, PRIMARY KEY ("UserId", "StoreId")) ON COMMIT DROP;
\copy rb_store_user ("UserId", "StoreId") FROM 'prod-to-test/data/08-store-user-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_user_role ("UserId" uuid, "RoleId" integer, PRIMARY KEY ("UserId", "RoleId")) ON COMMIT DROP;
\copy rb_user_role ("UserId", "RoleId") FROM 'prod-to-test/data/09-user-role-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_product_category ("Id" uuid PRIMARY KEY) ON COMMIT DROP;
\copy rb_product_category ("Id") FROM 'prod-to-test/data/10-product-category-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_product ("Id" uuid PRIMARY KEY) ON COMMIT DROP;
\copy rb_product ("Id") FROM 'prod-to-test/data/11-product-inserted.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE rb_channel_exchange_rate ("Id" uuid PRIMARY KEY) ON COMMIT DROP;
\copy rb_channel_exchange_rate ("Id") FROM 'prod-to-test/data/12-channel-exchange-rate-inserted.csv' WITH (FORMAT csv, HEADER true)

-- Orden inverso al de carga: hojas primero, por las 34 claves Restrict.
-- Los tres bloques opcionales se borran igual aunque el archivo esté vacío:
-- un registro sin filas hace que el DELETE no encuentre nada y no hace nada.
DELETE FROM "ChannelExchangeRate"  WHERE "Id" IN (SELECT "Id" FROM rb_channel_exchange_rate);
DELETE FROM "Product"             WHERE "Id" IN (SELECT "Id" FROM rb_product);
DELETE FROM "ProductCategory"     WHERE "Id" IN (SELECT "Id" FROM rb_product_category);
DELETE FROM "UserRole"            WHERE ("UserId", "RoleId") IN (SELECT "UserId", "RoleId" FROM rb_user_role);
DELETE FROM "StoreUser"           WHERE ("UserId", "StoreId") IN (SELECT "UserId", "StoreId" FROM rb_store_user);
DELETE FROM "StoreRoleFeature"    WHERE ("StoreId", "RoleId", "FeatureId") IN (SELECT "StoreId", "RoleId", "FeatureId" FROM rb_store_role_feature);
DELETE FROM "StoreModule"         WHERE ("StoreId", "ModuleId") IN (SELECT "StoreId", "ModuleId" FROM rb_store_module);
DELETE FROM "Store"               WHERE "Id" IN (SELECT "Id" FROM rb_store);
DELETE FROM "ReSellerOwner"       WHERE ("ReSellerId", "OwnerId") IN (SELECT "ReSellerId", "OwnerId" FROM rb_reseller_owner);
DELETE FROM "ReSeller"            WHERE "Id" IN (SELECT "Id" FROM rb_reseller);
DELETE FROM "Owner"               WHERE "Id" IN (SELECT "Id" FROM rb_owner);
DELETE FROM "User"                WHERE "Id" IN (SELECT "Id" FROM rb_user);

-- Las tres filas sembradas tienen que seguir ahí. Si falta alguna, la
-- transacción se revierte sola: es preferible no deshacer la carga que
-- deshacerla dejando el superadmin sin fila.
DO $assert$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "Tenant"  WHERE "Id" = 'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8') THEN
        RAISE EXCEPTION 'ABORT: the Default Tenant seed row is missing. The rollback is not committed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "User"    WHERE "Id" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8') THEN
        RAISE EXCEPTION 'ABORT: the superadmin User seed row is missing. The rollback is not committed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "UserRole" WHERE "UserId" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8' AND "RoleId" = 1) THEN
        RAISE EXCEPTION 'ABORT: the superadmin UserRole seed row is missing. The rollback is not committed.';
    END IF;
END
$assert$;

COMMIT;
```

El `DO` al final es lo que convierte el `COMMIT` en una decisión y no en un reflejo. Antes esta
reversa terminaba con un `SELECT` de conteo y un `COMMIT` incondicional: el `SELECT` imprimía un
número, nadie lo leía, y la transacción se confirmaba igual. Ahora, si falta cualquiera de las
tres filas sembradas, la excepción aborta la transacción y **no se borra nada**, y usted lee el
motivo en pantalla.

Sobre las advertencias de la tabla de arriba, y por qué el registro las resuelve: la fila
sembrada de `User` tiene `Id = 38b96d85-…`. Si producción tiene un usuario con ese `Id`, la
carga lo encuentra en destino, lo salta por `ON CONFLICT DO NOTHING`, y como estaba en destino
*antes* del `INSERT` queda en `pre_user` y por tanto **fuera** del registro. Si producción no
tiene ese `Id`, la fila nunca entra en `stg_user` y tampoco llega al registro. Los dos caminos
terminan en lo mismo: el `DELETE FROM "User" WHERE "Id" IN (SELECT "Id" FROM rb_user)` no lo
toca. Lo mismo vale para la fila de `UserRole` del superadmin al rol `1`, cuya clave compuesta
está en el mismo caso. Ese es el punto entero del registro, y la razón por la que `load_not_landed`
—el conjunto de filas que ya estaban en destino— no sirve aquí: es exactamente el conjunto que
esta reversa debe **conservar**.

Tres advertencias honestas sobre esta reversa:

- **Deshace la carga, no deshace lo que la aplicación haya hecho después.** Si alguien usó test y
  creó ventas, productos o movimientos sobre las filas migradas, el borrado puede dejar filas
  nuevas huérfanas de datos que ya no existen. Preferible a perder las filas sembradas, pero no
  es limpio.
- **El registro se sobrescribe.** Si reejecutó la carga dentro de la ventana de reversa, los
  doce archivos describen la última ejecución, no la primera, y esta reversa borrará el conjunto
  de esa última. Vuelva a leer el resumen de la sección 6 y anote el `inserted_by_this_run` de
  cada tabla antes de decidir.
- **No distingue "insertada por mí" de "borrada y reinsertada por alguien más".** Si alguien
  borró una fila migrada y volvió a crearla, el registro no lo sabe y la borrará igual. Es un
  caso raro y usted lo sabría.

En cualquier caso: **antes de la carga, guarde un respaldo de `smca_test`** (`pg_dump`). Ese
respaldo es su reversa real.

---

## 12. Limpieza

```bash
cd backend/scripts
shred -u prod-to-test/data/*.csv 2>/dev/null || rm -f prod-to-test/data/*.csv
```

Ese `*.csv` se lleva los doce CSV de extracción **y** los doce `NN-<tabla>-inserted.csv` del
registro de la sección 6, y está bien que se los lleve juntos, pero solo al final.

**No haga esto todavía.** Los dos conjuntos son cosas distintas y los dos duran lo mismo:

- Los **`NN-<tabla>-inserted.csv`** son la fuente de la reversa acotada de la sección 11. Sin
  ellos, esa reversa no se puede hacer, y la alternativa es el `pg_dump` de la sección 10.
  Son **claves solamente**: no contienen contraseñas, correos ni teléfonos, solo identificadores.
- Los **doce CSV de extracción** son el registro de lo que producción tenía en el momento de la
  foto. La reversa no los usa. Se conservan porque son la única forma de explicar una diferencia
  que aparezca más adelante, y porque un reintento de la carga los necesita.

Espere a que termine la ventana de reversa: hasta que usted decida que la carga es definitiva y
que no va a repetirla. Si borra el registro y después cambia de opinión, ya no tiene reversa
acotada.

Haga la limpieza **después** de haber verificado. Si la verificación falla y necesita reintentar,
conserve los dos conjuntos.

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
