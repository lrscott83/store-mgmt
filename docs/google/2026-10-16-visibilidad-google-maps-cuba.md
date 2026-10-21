# Plan — Visibilidad en Google (Maps + Search) para cada catálogo público

**Fecha:** 2026-10-16 · **Estado:** PLAN PROPUESTO — decisiones del owner anotadas en §7 (nada implementado)

> **Objetivo:** que cada catálogo público (un negocio = un catálogo, modelo multi-catálogo) sea
> **buscable en Google** y aparezca en **Google Maps**, maximizando visibilidad y SEO. Vitral fue
> solo un ejemplo de modelo multi-catálogo, no un patrón a copiar: el plan aquí va más allá (Vitral
> no tiene datos estructurados ni sitemap).

## 1. Reglas de Google que definen el terreno (fuentes oficiales)

1. **Perfil de Empresa (ficha verificada) está PROHIBIDO para negocios en Cuba.**
   Fuente: https://support.google.com/business/answer/6270107 — Cuba no está en la lista de países y
   Google cita las sanciones OFAC (Crimea, Cuba, Irán, Corea del Norte, Sudán, Siria). Nada que
   hagamos convierte esto en permitido.
2. **Google muestra lugares sin dueño** usando 4 fuentes (https://support.google.com/business/answer/2721884):
   información pública rastreada de la web, datos licenciados de terceros, aportes de usuarios, e
   interacciones de Google. **Por eso hay negocios cubanos en Maps.**
3. **"Añadir un sitio que falta"** (https://support.google.com/maps/answer/6320846) permite a
   cualquier usuario crear un lugar público (nombre, categoría, dirección, teléfono). Queda como
   contribución sin dueño; ediciones posteriores pasan por moderación.

## 2. Evidencia real: negocios cubanos que SÍ están en Google Maps

Capturado en vivo (2026-10-16) desde el endpoint público de embed de Google Maps
(`maps.google.com/maps?q=...&output=embed`). Dos restaurantes de La Habana:

### La Guarida — "Cuban restaurant"

| Campo | Valor en Google Maps |
|---|---|
| Nombre | La Guarida |
| Dirección | 418 Concordia, La Habana |
| Coordenadas | 23.1383523, −82.3684723 |
| Teléfono | (07) 8669047 |
| **Sitio web** | `http://www.laguarida.com/` |
| Categoría | Cuban restaurant |
| Calificación | 4.4 · **1,468 reseñas** |
| Horario | Semana completa por día (12–16 h y 18–23:45 h) |
| Place ID | `ChIJeTZpH8Z5yYgRuRWjFDPCqKM` |

### El Cocinero — "Restaurant"

| Campo | Valor en Google Maps |
|---|---|
| Nombre | El Cocinero |
| Dirección | 4HGR+W2C, Calle 26, La Habana (Plus Code) |
| Coordenadas | 23.1273215, −82.4099842 |
| Teléfono | (07) 8322355 |
| **Sitio web** | `https://elcocinerohabana.com/` |
| Categoría | Restaurant |
| Calificación | 4.3 · **372 reseñas** |
| Horario | 12 PM – 12 AM, toda la semana |
| Place ID | `ChIJ_XycTkF3zYgRihVIw0-53RE` |

**Conclusión de la evidencia:** el lugar completo (web, teléfono, horario, reseñas) es alcanzable
**sin ficha verificada**: ambos negocios tienen un **sitio web propio** (fuente 1 del §1.2) y volumen
de **reseñas/fotos de usuarios** (fuente 3). Ese es el mismo resultado al que apunta este plan para
cada catálogo: página propia consistente + lugar aportado en Maps + reseñas reales.

## 3. Estado actual de NUESTRO catálogo público (brecha vs. objetivo)

Evidencia del código (frontend React, el único que se toca):

- Ruta pública: `catalog/:storeSlug` → `app/catalog/routes/public-catalog.tsx` (`app/routes.ts:36`).
- La página **no exporta `loader` ni `meta`**: no hay título, ni meta description, ni canonical, ni
  Open Graph por catálogo.
- El contenido (catálogo, productos, config) se carga **desde el cliente** vía
  `catalogHttpService` en `useEffect` (líneas 140–199). El HTML servido es un shell casi vacío.
- No hay `robots.txt` ni `sitemap` en el app.
- No hay datos estructurados (JSON-LD) en ninguna página pública.
- **Datos de ubicación física incompletos (esto es "arreglar el punto 2", ver §7):** la entidad
  `Store` (`backend/src/Domain/Entities/Stores/Store.cs`) solo tiene `Name`, `Address` (texto
  libre) y `Description`. **No existen** campos de coordenadas (lat/long), ni teléfono público, ni
  horario público por tienda. Sin esos datos no hay JSON-LD `geo` ni lugar en Maps con horario/telefono.

Brecha resumida: hoy el catálogo público es **invisible para Google por diseño** (shell vacío sin
metadatos), justo lo contrario del objetivo.

## 4. Plan propuesto — pasos para el objetivo

### Fase A — SEO por catálogo (la base, 100 % nuestro código)

> **Prerrequisito transversal ("arreglar el punto 2"):** completar los datos de ubicación física por
> tienda — dirección normalizada, **coordenadas (lat/long)**, teléfono y horario público. Hoy
> `Store.cs` solo guarda `Address` como texto libre (ver §3). Mientras no existan esos campos, las
> Fases B y D no se pueden usar del todo. La captura puede ser manual (owner/superadmin) o pedida al
> dueño de cada catálogo al publicar.

1. Cada `/catalog/<slug>` sirve desde el servidor:
   - `<title>` único = nombre del negocio (ej. "Mercado 25 y 28").
   - `<meta name="description">` = descripción del negocio (o generada de categorías).
   - `<link rel="canonical">` a la URL canónica del catálogo.
   - Open Graph completo: `og:title`, `og:description`, `og:url`, `og:image` (logo/portada del
     catálogo), `og:site_name`, `og:locale=es_ES`, más `twitter:card=summary_large_image`.
   - `lang="es"` correcto.
2. Los datos vienen del backend público que ya existe (`PublicCatalogController`), leídos en un
   `loader` de ruta (server-side), de modo que el HTML ya contiene nombre/descripción/imagen antes
   de cualquier JavaScript.
3. Si una página carga offline/404, servir de todos modos un `<title>` y descripción mínimos (nunca
   shell sin metadatos).

### Fase B — Datos estructurados por catálogo (ventaja sobre Vitral, que no los tiene)

4. Emitir **JSON-LD `schema.org`** en cada página de catálogo:
   - Tipo `Restaurant` o `LocalBusiness` según el negocio, con: `name`, `url` (el catálogo),
     `image`, `telephone`, `address` (calle, ciudad, país CU), `geo` (lat/long), `openingHoursSpecification`
     (el horario por día), `servesCuisine` (opcional), `priceRange` (opcional).
   - Requiere que cada tienda tenga: dirección, teléfono, coordenadas y horario (datos del owner,
     ver §6).
   - Esto alimenta la **fuente 1 de Google** (§1.2) con datos legibles por máquina y habilita
     resultados enriquecidos en Google Search.

### Fase C — Hacer que Google ARRANQUE a indexar el sitio

5. **`robots.txt`** público: permitir todo y apuntar al sitemap
   (`Sitemap: https://<dominio>/sitemap.xml`). Verificar que el catálogo público no esté bloqueado
   por meta `noindex` ni por headers.
6. **`sitemap.xml`** dinámico con TODOS los slugs de catálogos públicos existentes (URL por
   negocio), con `lastmod`. Vitral no lo tiene (su `sitemap.xml` da 404) — este es nuestro salto.
7. **Google Search Console** (requiere cuenta de Google del owner):
   - Verificar la propiedad del dominio/sitio (DNS TXT si se controla el dominio, o tag HTML en el
     sitio). El método exacto depende de si el dominio final es `pos.playground.sceiba.net` u otro
     (ver §7).
   - Enviar el sitemap y usar **Inspección de URL → Solicitar indexación** para cada catálogo (y la
     página raíz). La indexación no es instantánea ni garantizada: puede tomar días/semanas.
   - **Aclaración técnica importante:** el *Indexing API* de Google **no sirve para páginas web
     normales** — solo acepta `JobPosting` y `BroadcastEvent`. El camino correcto es sitemap +
     solicitud de indexación manual. No perder tiempo con el Indexing API.
8. **Indexabilidad del render:** como el framework es React Router v7 con SSR, al mover los datos a
   `loader` (Fase A) el HTML contiene el contenido real; sin eso, Googlebot ve la página vacía y no
   hay nada que indexar. (A diferencia de Vitral, que sirve un shell JS sin contenido en el HTML —
   su indexación depende del renderer de Google.)

### Fase D — Google Maps por negocio (manual, por cada catálogo con local físico)

9. Para cada negocio con local:
   - **Añadir el sitio en Google Maps** ("Añadir un sitio que falta") con nombre, categoría
     (Restaurante/Mercado/…), dirección y teléfono — **exactamente iguales** a los de su página de
     catálogo (regla NAP: Name-Address-Phone consistentes; Google los cruza con la web rastreada).
   - Cuando el lugar exista: **sugerir ediciones** — añadir el sitio web (URL del catálogo) y el
     horario. Pasa por moderación; puede tardar.
   - Pedir a los clientes **reseñas y fotos** en ese lugar (es lo que sube relevancia local, como en
     La Guarida/El Cocinero).
10. Negocios **sin local físico** (solo delivery): no aplica "añadir sitio" (Google exige atender
    presencialmente); su visibilidad queda en Google Search con el catálogo (Fases A–C).

### Fase E — Señales externas (aceleran indexación y relevancia)

11. Compartir cada URL de catálogo en WhatsApp/redes/QR (tráfico = señal para Google).
12. Mismo nombre/dirección/teléfono del catálogo en Facebook/Instagram y cualquier otra plataforma
    (consistencia NAP alimenta las fuentes 1 y 4 de Google).
13. Enlazar los catálogos desde páginas indexadas del propio sitio (la página raíz del POS /
    landing, si existe) — enlaces internos ayudan a descubrir las URLs.

### Fase F — Medición (para saber que el objetivo se cumple)

14. En Search Console: impresiones/clics, consultas por nombre de cada negocio, y cobertura de las
    URLs de catálogo.
15. En Google Maps: verificar que el lugar aparece al buscar el nombre + ciudad, y que muestra web y
    teléfono.
16. Revisión periódica (mensual): qué URLs indexadas, qué lugares viven, qué reseñas llegan.

## 5. Riesgos y límites (para decidir con los ojos abiertos)

- **Sin ficha verificada:** el lugar en Maps no tendrá dueño gestionable (Google Search Console y la
  página del catálogo son las únicas superficies controladas por nosotros).
- **Moderación de Maps:** las sugerencias de edición (web, horario) pueden ser rechazadas o tardar;
  el lugar aportado puede tardar en publicarse.
- **Indexación no instantánea:** Google decide cuándo y si indexa; el sitemap + solicitudes manuales
  son lo máximo controlable.
- **Dominio:** la autoridad/visibilidad depende del dominio final (`pos.playground.sceiba.net` es un
  subdominio de playground). Un dominio propio ayudaría a largo plazo, pero no bloquea arrancar.
- **Datos del negocio:** sin dirección/teléfono/coordenadas/horario por tienda, las Fases B y D no
  pueden cumplirse por completo.

## 6. Todo lo que hay que pedirle al CLIENTE (dueño de cada catálogo) para visibilidad y SEO

Lista única a usar al alta o al publicar cada catálogo. Cada dato tiene su uso (SEO, JSON-LD, Maps).

### Datos del negocio (obligatorios para el objetivo)

| Qué pedir | Para qué se usa |
|---|---|
| **Nombre comercial exacto** (el mismo en el letrero/local) | `<title>`, JSON-LD `name`, nombre del lugar en Maps (regla NAP) |
| **Dirección completa** (calle, #, entre calles, ciudad, provincia) | `address` en JSON-LD y en Maps; debe coincidir con lo que pongan en Maps |
| **Referencia de ubicación** ("esquina de…", "frente a…") | Ayuda al cliente a encontrar; va en la página y en Maps |
| **Coordenadas lat/long** (pinchar el local en Google Maps desde el teléfono) | JSON-LD `geo`, enlace "Cómo llegar", y precisión del lugar en Maps |
| **Teléfono (WhatsApp)** de contacto del negocio | JSON-LD `telephone`, tarjeta de contacto en Maps |
| **Horario real por día** (lunes a domingo, con cierres) | JSON-LD `openingHoursSpecification`, horario en Maps, aviso "Abierto ahora" |
| **Categoría del negocio** (restaurante, mercado, cafetería, barbería…) | Categoría del lugar en Maps y `@type` del JSON-LD (Restaurant/LocalBusiness) |
| **Descripción corta del negocio** (1–3 frases) | `meta description`, JSON-LD `description` |
| **Logo y foto de portada** en buena resolución (mínimo 1200 px) | `og:image`, JSON-LD `image`, tarjeta al compartir por WhatsApp/redes |
| **¿Tiene local físico?** (sí/no) | Define si entra a la Fase D (Maps) o solo a Search |

### Acciones que se le piden al cliente (una vez, manuales)

1. En Google Maps desde su teléfono: **"Añadir un sitio que falta"** con el mismo nombre, dirección,
   categoría y teléfono que nos dio.
2. Cuando el lugar aparezca: **sugerir la edición** del sitio web (la URL de su catálogo) y del
   horario.
3. Pedir a sus clientes reales **reseñas y fotos** en ese lugar de Maps (es lo que más sube la
   relevancia local — evidencia La Guarida/El Cocinero, §2).
4. Compartir el enlace de su catálogo por **WhatsApp, estados, redes y QR** en el local.
5. Usar el **mismo nombre/dirección/teléfono** en su Facebook/Instagram y donde se anuncie (NAP
   consistente alimenta las fuentes de Google).

### Lo que el cliente NO necesita hacer (lo resolvemos nosotros)

- No necesita saber de SEO, schema.org, sitemap ni Search Console: eso es parte técnica del plan
  (Fases A–C).
- No necesita cuenta técnica: solo su cuenta normal de Google (para añadir el sitio y reseñas).

## 7. Preguntas abiertas — respondidas por el owner (2026-10-16)

1. **Dominio público definitivo:** `pos.playground.sceiba.net`. → La verificación en Google Search
   Console se hace sobre ese dominio/subdominio; las URLs canónicas y el sitemap usan ese host.
2. **¿Todos los catálogos tienen local físico?** En teoría **sí, todos deberían tenerlo**. →
   **Hay que ARREGLARLO para que se pueda usar:** hoy el sistema no guarda coordenadas, teléfono ni
   horario público de la tienda (solo `Address` como texto libre, §3). Para que la Fase D (Maps) y
   el JSON-LD `geo` funcionen para todos, hay que completar esos datos por tienda (campos + captura,
   prerrequisito anotado en §4). La Fase D aplica entonces a TODOS los catálogos.
3. **¿La raíz/landing es pública?** Todo el catálogo es público: las páginas `/catalog/<slug>` son
   la superficie pública. Los enlaces internos de la Fase E se apoyarán en esas páginas públicas
   existentes.

## 8. Registro de confianza

- §1 y §2: fuentes primarias capturadas en vivo el 2026-10-16 (ayuda oficial de Google + endpoint
  público de embed de Maps con datos de La Guarida y El Cocinero). **Alta confianza.**
- §3: lectura directa del código actual del repositorio. **Alta confianza.**
- §4: plan; cada paso está anclado a una fuente o a evidencia del código citada arriba.
- No verificado desde esta red: la indexación real de vitral.imerbet.com, ALAMESA y TripAdvisor
  (mencionados en análisis previos como canales opcionales, no incluidos en el objetivo).

## 9. Reseñas del negocio en el catálogo web — investigación (2026-10-19)

> **Disparador:** revisar `https://es.restaurantguru.com/Balcon-del-Habano-Havana` (RestaurantGuru —
> El Balcón de Bruno y Pilar, La Habana) para responder dos preguntas: ¿cómo se pueden listar las
> reseñas de un negocio en Cuba? y ¿ya tenemos esa capacidad en este plan para usarla en el catálogo
> web? **Estado: investigación — nada implementado; decisión del owner pendiente.**

### 9.1 Cómo lo logra un agregador (evidencia capturada en vivo, 2026-10-19)

RestaurantGuru es un **agregador de terceros**: no es el negocio ni Google, y no necesita ficha
verificada. En la página del restaurante se ve el mecanismo:

- **Valoraciones agregadas por fuente:** Google **3.3/5 (82)** y Facebook **4.6/5 (49)**, cada una con
  su subpágina de reseñas por fuente (`/reviews/google`, `/reviews/facebook`).
- **"Reseñas de visitantes":** cita reseñas de usuarios marcadas "**en Google**" (con autor y
  antigüedad), y además ofrece "Agregue su reseña" en su propio sitio. Encabezado con **131 votos** y
  ranking ("N.º 240 de 1541 restaurantes en La Habana").
- Resto del dato rastreado: dirección (Plus Code `4JP5+CW4, Calle 21`), teléfono, horario semanal,
  web (`hostal-habano.com`) e Instagram.

**Por qué es posible en Cuba:** la ficha de empresa verificada está PROHIBIDA (§1.1), pero Google sí
muestra **lugares y reseñas aportados por usuarios** (§1.2 y §2: La Guarida 4.4 · 1.468 reseñas, El
Cocinero 4.3 · 372). El agregador se apoya en ese contenido público de Google/Facebook y lo
republica/enlaza sin ser dueño del lugar.

### 9.2 ¿Ya lo tenemos? Estado real (2026-10-19)

- **En este plan:** las reseñas aparecen **solo como acción del cliente en Maps** — pedir reseñas y
  fotos en el lugar aportado (§4 Fase D punto 9; §6 acción 3). **No hay** nada sobre mostrarlas en el
  catálogo web.
- **En el código:** no existe `aggregateRating`, `ratingValue`, `reviewCount` ni `Review` (grep,
  2026-10-19, backend + frontend). El JSON-LD `LocalBusiness` ya implementado (T8b, fuera de este
  plan) emite nombre/URL/imagen/teléfono/dirección/geo/horario, **sin reseñas**. No hay integración
  con Google Places API ni con agregadores.

**Conclusión:** la capacidad de listar reseñas en el catálogo web **no existe ni estaba planeada**.

### 9.3 Opciones para el catálogo web (con costo y riesgo)

| Opción | Qué implica | Riesgo / costo |
|---|---|---|
| **A. Enlace a las reseñas de Google** | Botón "Ver reseñas en Google" que apunta al lugar de Maps (el owner aporta el enlace en la Fase D) | Casi nulo y ToS-limpio; sin API no hay calificación automática (o se ingresa a mano y se desactualiza) |
| **B. Google Places API** | `rating`, `user_ratings_total` y hasta **5 reseñas** por lugar, con atribución obligatoria | Requiere API key + cuenta de facturación de Google Cloud; **disponibilidad en/para Cuba dudosa** por las sanciones OFAC (la misma razón de §1.1). **Verificar antes de comprometerse** (no verificable desde esta red: Google bloqueó la consulta) |
| **C. Reseñas propias en la plataforma** | Rating + comentario del cliente desde el catálogo, con moderación; habilita JSON-LD `Review`/`AggregateRating` | Sin dependencias ni riesgo legal; exige modelo de datos, endpoints, UI y anti-spam; arranca vacío. Google solo admite snippets de reseñas **reales y visibles** en la página (nunca de autoservicio/auto-promoción) |
| **D. Scraping de agregadores (RestaurantGuru/Tripadvisor)** | — | Sin API pública gratuita; el scraping **viola sus ToS**. Descartado |

### 9.4 Recomendación (propuesta, pendiente del owner)

1. Arrancar con **A** (enlace a Maps): coste casi nulo, sin riesgo legal y encaja con la Fase D ya
   planeada.
2. Si el catálogo necesita prueba social propia, agregar **C** (reseñas propias con moderación) —
   única opción que habilita `Review`/`AggregateRating` sin depender de terceros.
3. **B** solo si se confirma facturación y disponibilidad legal para Cuba.
4. **D** descartado.

**Confianza:** §9.1 y §9.2 alta (página pública capturada en vivo + grep del código el 2026-10-19);
§9.3 opción B media (disponibilidad de Places API para Cuba **no verificada** desde esta red).
