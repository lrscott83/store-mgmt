# help-manual

Servir el **Manual de usuario** como HTML estático **público** en `/api/manual`, generado desde
`docs/manual/`, con descarga en PDF, enlazado desde la ayuda existente y **sin añadir peso al POS
offline**.

- **Branch:** dev actual
- **Delivery:** ask-on-risk
- **Runner:** `pnpm --filter @store-mgmt/web-store-pos test` · `pnpm --filter @store-mgmt/web-store-pos typecheck` · `pnpm --filter @store-mgmt/web-store-pos lint`

## Specs

- **S1** La página de ayuda `/help/tutorial` **conserva** su contenido y su panel; **arriba del
  panel**, antes de él, se añaden **dos** elementos: un enlace que abre el manual en **otra
  pestaña** y un enlace que **descarga el PDF**.
- **S2** El manual es **público** (sin sesión).
- **S3** Se sirve en `/api/manual` (HTML + imágenes) y `/api/manual/manual-usuario-pos.pdf`, en el
  **mismo origen que la API** (dev: `API_URL` absoluta; prod: `/api` relativo).
- **S4** Por estar bajo `/api/*`, el service worker lo trata como **passthrough** → no se
  precachea ni se cachea en runtime → **cero peso offline**.
- **S5** La **fuente no se mueve**: `docs/manual/manual-usuario-pos.md` + `docs/manual/img/`.
- **S6** El generador `frontend-react/scripts/build-manual.mjs` (+ `manual-template.html`)
  regenera el HTML desde el MD + imágenes (soporta **añadir/quitar** imágenes) y emite el PDF.
  **Un comando.**
- **S7** Las imágenes son **archivos separados** (no base64) con **nombre fijo**. El backend
  responde `ETag`/`Last-Modified` + `Cache-Control: no-cache` → sin cambios = **304** (cacheado),
  cambiado = **200** (actualiza).
- **S8** El PDF es estático de **nombre fijo**; arranca como **PDF de relleno vacío** y luego se
  sustituye.

## Tasks

- **T1** ✅ Generador `frontend-react/scripts/build-manual.mjs` + `manual-template.html` + script
  `generate:manual` (en `frontend-react/package.json`). Dep `marked` (root devDependency).
- **T2** ✅ Salida generada en `backend/src/SMCA.WebApi/help/`: `index.html` (~50 KB, 55 `<img>`),
  `images/` (54 archivos), `manual-usuario-pos.pdf` (~8.1 MB, Playwright).
- **T3** ✅ Backend: mapeo estático `/api/manual` (+ `no-cache`) en `Program.cs`; `None Update`
  con `CopyToPublishDirectory` en el `.csproj`.
- **T4** ✅ Frontend: dos enlaces arriba del panel en `help/routes/tutorial.tsx`, ids i18n en
  `es.ts` (`TUTORIAL.MANUAL_LINK`, `TUTORIAL.MANUAL_PDF`), y test nuevo (3 casos).
- **T5** ✅ Verificación (ver Log L5).

## Log

- **L1 (2026-10-16, verbatim):** «Como generar una ayuda sin que se descargue todo el contenido y
  que eso sea solo usando internet y que no afecte nada del POS del peso que se descarga para que
  funcione offline.»
- **L2:** Decisiones del usuario: (a) la ayuda actual **no se toca** salvo añadir dos enlaces
  arriba del panel; (b) el manual (la «otra ayuda») se sirve desde el backend con un **HTML
  estático generado** desde el MD + imágenes, más un **PDF estático**; (c) la caché de imágenes:
  sin cambios = cacheada, cambiada = actualizada; (d) **todo vive en el repo**; (e) ruta elegida
  **`/api/manual`** (público), para que el SW haga passthrough sin tocar el PWA.
- **L3:** Se eligió servir con **static files del backend (ASP.NET)** sobre nginx por **paridad
  dev/prod** (una sola implementación) y **caché condicional nativa** (`ETag`/304).
- **L4:** Razón de la ubicación `backend/src/SMCA.WebApi/help/`: el contexto de build Docker del
  backend es `backend/src`, así que la carpeta generada debe vivir ahí para publicarse en la imagen.
- **L5 (verificación):** `pnpm generate:manual` → HTML + PDF (Playwright) OK. `typecheck` OK ·
  `lint` OK · tests `app/help` + `i18n` **31/31** · `dotnet build SMCA.WebApi` **0 errores**.
  Runtime (backend en `:5199`): `/api/manual/` → 200 `text/html` `no-cache` + `ETag`;
  `/api/manual/images/04-encabezado.png` → 200 `image/png` `no-cache`; `/api/manual/manual-usuario-pos.pdf`
  → 200 `application/pdf`; revalidación con `If-None-Match` → **304**. (S7 verificado.)
- **L6 (pendiente):** los ficheros generados pesan ~17.5 MB (PDF 8.1 MB + imágenes 9.4 MB). El PDF
  duplica las imágenes embebidas; si pesa demasiado, se puede reducir (p.ej. imágenes comprimidas)
  en otra tarea. No se ha commiteado: la rama actual es `qa` (compartida), no una feature branch.
- **L7 (pendiente/opcional):** no hay test que garantice que `help/index.html` esté sincronizado con
  el `.md` (el patrón legal sí lo tiene). Añadible como guard futuro (hash MD→HTML).
- **L8 (prod + cierre):** `dotnet publish` incluye `help/` (56 archivos → `/app/help`), y el `api`
  de prod reconstruye su imagen desde `backend/src`, así que el manual viaja en la imagen. Build de
  producción del frontend **verde**: `verify-sw-precache` OK (215 entries, 7 familias → el manual NO
  entra al precache) y `verify-csp` OK. El manual cumple la CSP enforcing de prod (estilos inline
  permitidos por `style-src 'unsafe-inline'`; imágenes mismo origen por `img-src 'self'`; sin
  scripts). Enlaces: manual → otra pestaña; PDF → descarga en sitio (`download`).
- **L9 (commits):** `ca79d9ad` feat(help) … + `80479458` fix(help) … → rama **`qa`** pusheada.


