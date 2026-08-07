# Testing — etapas

Índice de las etapas de cobertura E2E del producto. Cada etapa vive en su propia carpeta, con un plan general y un fichero por User Story.

## Regla del proyecto (innegociable)

`CLAUDE.md`: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."*

Agregar tests nuevos está permitido. Tocar los existentes requiere autorización explícita del usuario, siempre. Un test E2E en rojo es información, no un obstáculo.

## Las dos capas de cobertura

Toda etapa declara el estado de las dos, por separado, para cada User Story:

| Capa | Qué prueba | Dónde vive |
|---|---|---|
| **E2E frontend (Playwright)** | Lo que el usuario ve y puede hacer: redirecciones, render, estado visible, mensajes literales, tráfico de red observado | `frontend-react/e2e/` |
| **E2E backend (.NET)** | La verdad del dato: campos persistidos, fechas, relaciones, códigos HTTP, estado de plan computado | `backend/src/SMCA.WebApi.E2ETests/` |

Ninguna de las dos prueba el comportamiento offline puro sobre `localStorage`.

## Invariante de resiliencia de sesión (S1-04)

*Ni la falta de red ni una respuesta de error terminan la sesión; solo la termina un veredicto del servidor o una acción del usuario.* Pineado en `frontend-react/e2e/login.spec.ts` (T1-T11, capability `e2e-session-hydration`). Esto **no** contradice la nota de arriba sobre el comportamiento offline puro: ese invariante es sobre la supervivencia de la **sesión** ante red caída o error, no sobre los dominios que operan contra `localStorage` (productos, ventas, inventario, etc.).

**Termina la sesión automáticamente — lista cerrada:**

| # | Sitio | Disparador | Pineado |
|---|---|---|---|
| 1 | `auth-store.ts:115-118` | Token vencido localmente (`expiresIn <= Date.now()`) | ✅ T6, T8 |
| 2 | `auth-store.ts:183-184` | Veredicto del `/me` de arranque: `SessionRejectedError`, 401 o 404 | ◐ T4 (401 real; 404 es brecha declarada, ver `e2e-stage-1/README.md` H-6) |
| 3 | `auth/routes/loaders.ts:17` | Fallo de autorización por rol | ❌ fuera de alcance (S2-03/S3-03) |

**Termina la sesión el usuario o la UI — lista cerrada:**

| # | Sitio | Disparador | Pineado |
|---|---|---|---|
| 4 | `shared/components/navbar.tsx:46` | Click en "Salir" | ✅ T7 |
| 5 | `shared/components/app-layout.tsx:58` | Timer de inactividad de 1h | ❌ fuera de alcance |
| 6 | `profile/routes/change-password.tsx:28` | Después de cambiar la contraseña | ❌ fuera de alcance (S4-02) |

**Lo que explícitamente NO cierra sesión — la superficie blindada:**

| Caso | Sitio que lo garantiza | Pineado |
|---|---|---|
| Cualquier 401 del interceptor HTTP compartido (diverge de Angular a propósito) | `api-client.ts:84-86` | ✅ T9 |
| Error de red, DNS, timeout de 30s o 5xx durante el `/me` de arranque | `auth-store.ts:187-188` | ✅ T3, T5, T10 |
| `AUTH_MODEL` malformado pero parseable | `auth-store.ts:110-113` | ✅ T11 |

## Etapas

| Etapa | Alcance | Escenarios | Estado | Plan |
|---|---|---|---|---|
| **Etapa 1** | Las operaciones que efectivamente cruzan la frontera hacia la API: sesión y acceso, ciclo de vida de tienda y plan, gestión de usuarios, perfil propio | 12 US + 1 invariante | En curso — 1 US con cobertura Playwright | [e2e-stage-1/](e2e-stage-1/README.md) |

No hay más etapas definidas todavía. Las siguientes se agregan como filas de esta tabla, con su propia carpeta hermana.
