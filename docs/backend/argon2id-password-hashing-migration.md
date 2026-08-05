# Migración de hasheo de contraseñas a Argon2id

> **Estado**: PENDIENTE — cambio aparte, no empezado. Decidido el 2026-08-05.
>
> Toda aserción de este documento está anclada a código leído, con `archivo:línea`. Lo que no verifiqué está marcado **⚠️ NO VERIFICADO** en vez de rellenado con algo plausible.

---

## 1. La decisión

**Migrar a Argon2id.** No a "arreglar el valor de bcrypt".

El motivo por el que esta decisión es barata hoy y cara mañana: **la aplicación no está en producción**. No hay contraseñas de usuarios reales guardadas, así que no hay migración, no hay re-hasheo progresivo, no hay camino de compatibilidad que sostener. Se reemplaza el algoritmo y se borra lo viejo.

Ese es el argumento entero. Si algún día hay producción, esta misma decisión pasa a costar un plan de migración con re-hasheo en cada login exitoso.

---

## 2. El defecto que lo destapó

`POST /v1/auth/register` devuelve **500** en Development. Lo encontró la primera corrida de `frontend-react/e2e/register.spec.ts` (REQ-8), no la suite del backend.

```
ArgumentOutOfRangeException: The work factor must be between 4 and 31 (inclusive)
Actual value was 3.
   at BCrypt.Net.BCrypt.GenerateSalt(Int32 workFactor, ...)
   at Application.Services.Authentication.BcryptHashPasswordService.HashPassword(...)
```

**Causa raíz**: el setting `Iterations` tiene **dos significados incompatibles** en el mismo campo.

| Consumidor | Qué significa el número | Rango válido |
|---|---|---|
| `BcryptHashPasswordService.cs:17` | work factor de BCrypt (exponente: 2^n) | **4 a 31** |
| `BcryptHashPasswordService.cs:59` | vueltas de re-hasheo SHA256 en `LegacyHash()` | 3 tiene sentido |

Valores actuales — **la configuración base también está rota**, no solo la de Development:

- `Application/Abstractions/Authentication/AuthenticationSettings.cs:7` → default `3`
- `SMCA.WebApi/appsettings.json:83` → `3`
- `SMCA.WebApi/appsettings.Development.json:77` → `3`

**Por qué ningún test del backend lo vio**: `SMCA.WebApi.E2ETests/appsettings.Tests.json` pisa `Iterations` con **6**. El entorno de pruebas reemplazaba justo el valor defectuoso, así que `AuthRegisterSuccessTests` pasaba en verde mientras la aplicación real no podía registrar a nadie. Es la lección de `CLAUDE.md` repitiéndose.

Al migrar a Argon2id este defecto desaparece por construcción: el campo sobrecargado deja de existir.

---

## 3. Por qué Argon2id y no otro

Recomendación vigente de OWASP para desarrollo nuevo, en orden:

1. **Argon2id** — estándar de oro
2. **scrypt** — si Argon2id no está disponible
3. **bcrypt** — sigue siendo seguro con factor 12+; opción válida solo si ya estás en bcrypt o necesitás soporte amplio
4. **PBKDF2** — solo si exigen cumplimiento FIPS

**La diferencia técnica que importa**: bcrypt y PBKDF2 solo cuestan procesador, y eso una GPU lo paraleliza masivamente. Argon2id además exige **memoria RAM por cada hash**, y la memoria no se paraleliza barato — el atacante tiene que comprar RAM, no solo placas de video.

**Ganancia adicional**: bcrypt **trunca en silencio** todo lo que pase de 72 bytes de contraseña. Argon2 no tiene ese límite. Con frases de contraseña largas, bcrypt descarta el final sin avisar.

---

## 4. Parámetros

Configuración mínima de OWASP y línea base habitual:

| Parámetro | Mínimo OWASP | Línea base recomendada |
|---|---|---|
| Memoria | 19 MiB | **64 MiB** |
| Iteraciones (time cost) | 2 | **3** |
| Paralelismo | 1 | **1-2** |
| Salt | 16 bytes aleatorios por contraseña | igual |
| Salida | 32 bytes | igual |

Alternativa de OWASP con más memoria y menos tiempo: 46 MiB, 1 iteración, 1 de paralelismo.

**Nota de dimensionamiento**: la memoria se consume *por hash concurrente*. Con 64 MiB y 20 logins simultáneos son 1,2 GiB de pico. Para la escala de este producto no es problema, pero es el número a mirar si alguna vez lo es.

---

## 5. Paquete de NuGet

.NET **no trae Argon2 incorporado**: Microsoft delega criptografía en el sistema operativo y solo OpenSSL implementa Argon2, así que no hay implementación multiplataforma nativa. Hace falta un paquete.

| Paquete | Licencia | Consideración |
|---|---|---|
| `Konscious.Security.Cryptography.Argon2` | MIT | El más usado (8,2M descargas). Devuelve **bytes crudos**: el formato de almacenamiento lo armás vos |
| `Isopoh.Cryptography.Argon2` | MIT | 100% código manejado. Produce directamente el string PHC estándar (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`) |

**Todo es gratis y de código abierto.** Argon2 es un estándar público — ganó la Password Hashing Competition. No hay licencia comercial que pagar.

**Criterio de elección sugerido**: `Isopoh` si querés el string PHC listo, porque el hash ya lleva sus propios parámetros adentro y podés subir el costo en el futuro sin invalidar los hashes existentes. Con `Konscious` hay que guardar salt y parámetros por separado, o codificar el string PHC a mano.

⚠️ **NO VERIFICADO**: la API exacta de ambos paquetes (nombres de propiedades, si `Konscious` expone `KnownSecret` para el pepper). Confirmar contra la documentación del paquete al implementar, no asumir.

---

## 6. Qué hacer con el `Pepper`

`AuthenticationSettings.Pepper` existe hoy y **solo lo usa `LegacyHash()`** (`BcryptHashPasswordService.cs:49`). El camino de BCrypt lo ignora por completo.

Argon2 admite un "secreto conocido" (*known secret* / *associated data*) que cumple exactamente esa función: un valor que no vive en la base, de modo que un volcado de la tabla de usuarios no alcanza para atacar los hashes offline.

**Decisión a tomar al implementar**: usar el pepper como secreto de Argon2 (recomendado, es su lugar natural) o descartarlo. Si se usa, **tiene que salir de la configuración versionada** — hoy está en `appsettings.json:82` en texto plano, y un pepper commiteado no es un pepper.

---

## 7. Archivos a tocar

Todos verificados por lectura:

| Archivo | Qué hacer |
|---|---|
| `Application/Services/Authentication/BcryptHashPasswordService.cs` | Reemplazar por una implementación Argon2id. Renombrar el tipo |
| `Application/Abstractions/Authentication/AuthenticationSettings.cs:7` | Sacar `Iterations`; agregar memoria / iteraciones / paralelismo |
| `Application/DependencyInjection.cs:62` | `services.AddScoped<IHashPasswordService, BcryptHashPasswordService>()` → la nueva implementación |
| `SMCA.WebApi/appsettings.json:81-89` | Bloque `Authentication`: nuevos parámetros |
| `SMCA.WebApi/appsettings.Development.json:75-83` | Ídem |
| `SMCA.WebApi.E2ETests/appsettings.Tests.json` | Hoy pisa `Iterations` con 6. Los tests necesitan parámetros **bajos** para no tardar una eternidad — pero ojo: bajarlos demasiado vuelve a crear el punto ciego que escondió este bug |

**Sitios que hashean** (consumidores de `IHashPasswordService`, ninguno debería necesitar cambios si la interfaz se respeta):

- `Application/Services/Owners/CreateOwnerService.cs`
- `Application/Services/Authentication/AuthenticationService.cs`
- `Application/Features/Management/Users/Commands/CreateStoreUser/CreateStoreUserCommand.cs`
- `Application/Features/Administration/ReSellers/Commands/CreateReSeller/CreateReSellerCommand.cs`
- `Application/Features/UserManagement/Users/Commands/UpdateUserPassword/UpdateUserPasswordCommand.cs`

---

## 8. Qué se borra

Sin producción, esto es peso muerto y no hay razón para conservarlo:

- **`LegacyHash()`** (`BcryptHashPasswordService.cs:47-65`) y su rama en `VerifyPassword` (`:23-24`, el `storedHash.StartsWith('$')`). Existe para verificar hashes SHA256 anteriores a BCrypt. Si no hay datos de producción, no hay hash viejo que verificar.
- **`SMCA.WebApi/Services/HashPasswordService.cs`** — una segunda implementación de `IHashPasswordService` que **no está registrada en ningún lado** dentro de `SMCA.WebApi` (verificado: la única registración es `Application/DependencyInjection.cs:62`). Solo `WebApiTest/Program.cs` registra la suya. Es código muerto que confunde a quien busque dónde se hashea.

⚠️ **Confirmar antes de borrar**: que no exista ninguna base de datos con hashes SHA256 heredados que a alguien le importe (entornos de demo, datos sembrados de un cliente). La premisa "no hay producción" la puso el usuario; verificarla antes de ejecutar el borrado.

---

## 9. Tests afectados

- `Application.Tests/Services/Authentication/AuthenticationServiceTests.cs` y `Application.Tests/Services/Owners/CreateOwnerServiceTests.cs` referencian `IHashPasswordService`.
- `SMCA.WebApi.E2ETests/Auth/AuthRegisterSuccessTests.cs` y el resto del bloque de registro/login pasan por el hasheo real.
- `frontend-react/e2e/register.spec.ts` (REQ-8 y REQ-6) **hoy están en rojo por este defecto** y se ponen en verde cuando esto se arregle — por el arreglo mínimo o por esta migración, lo que llegue primero.

**Regla innegociable del proyecto**: los tests E2E existentes no se modifican, borran, renombran, saltean ni debilitan sin autorización explícita del usuario. Si esta migración parece exigir tocar uno, se para y se pregunta.

---

## 10. Lo que NO hay que hacer

- **No subir `Iterations` de 3 a 12 como "arreglo".** Arregla el registro y cambia en silencio el cálculo de `LegacyHash()`, porque el mismo número también controla las vueltas de SHA256. Si existiera algún hash viejo, dejaría de validar sin ningún error visible.
- **No dejar un solo campo con dos significados.** Es exactamente lo que produjo este defecto.
- **No bajar los parámetros de Argon2 en los tests hasta volverlos irreales.** Bajarlos es legítimo por velocidad; hacerlo hasta el punto de que el entorno de tests no pueda reproducir el fallo de producción es cómo se escondió este bug durante quién sabe cuánto.

---

## 11. Pendiente de decidir

1. **¿Arreglo mínimo primero?** Hasta que esto se implemente, el registro sigue caído en Development y 2 tests de Playwright siguen en rojo. Un arreglo mínimo (separar el work factor de bcrypt en su propio setting) los desbloquea hoy y se tira a la basura cuando llegue Argon2id.
2. **Paquete**: `Isopoh` (string PHC listo) o `Konscious` (más usado, formato a cargo tuyo).
3. **Pepper**: usarlo como secreto de Argon2 o descartarlo; y si se usa, sacarlo de la configuración versionada.

---

## Fuentes

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Argon2 vs Bcrypt vs Scrypt vs PBKDF2 (2026)](https://guptadeepak.com/research/password-hashing-guide-2026/)
- [Argon2id vs bcrypt vs scrypt: 2026 Recommendations](https://quantumsequrity.com/blog/argon2id-vs-bcrypt-vs-scrypt.html)
- [dotnet/runtime — por qué no hay Argon2 nativo](https://github.com/dotnet/runtime/discussions/117822)
- [Konscious.Security.Cryptography.Argon2 (NuGet)](https://www.nuget.org/packages/Konscious.Security.Cryptography.Argon2/)
- [Isopoh.Cryptography.Argon2 (GitHub)](https://github.com/mheyman/Isopoh.Cryptography.Argon2)
