# 2. store-create-security.spec.ts:88 — el setup de signedInPage agoto los 120 s y el test pasa en el reintento

**Que prueba el test.**
`store-create-security.spec.ts:88:7` — "StoreUser en /management/stores/create es deslogueado
y redirigido a /login" (dentro del describe `StoreUser`). Un usuario de tienda sin permiso
escribe la direccion de creacion de tienda en el navegador y la app debe desloguearlo y
mandarlo al login.

**Que fallo (en simple).**
Fallo el intento 1 de 3 de la corrida completa del 2026-10-05, y fallo **antes de llegar al
cuerpo del test**: el fixture compartido `signedInPage` (el que abre la sesion del StoreUser)
no termino de prepararse en 120 s. Paso en el reintento. Texto literal del `error-context.md`:

```
Test timeout of 120000ms exceeded while setting up "signedInPage".
```

**Evidencia (unica, de los artifacts de esa corrida).**
Snapshot de la pagina al agotarse el tiempo — la portada publica de la app, todavia cargando:

```yaml
- heading "VendeDTo" [level=1]
- paragraph: Automatiza tu Negocio
- status "Cargando...":
  - status "Cargando"
  - paragraph: Cargando...
- contentinfo:
  - link "Políticas de Privacidad"
  - link "Términos y Condiciones"
- button "Instalar app" [disabled]
```

Es decir: **el login no habia completado**; la pantalla seguia en el arranque publico. Archivo:
`frontend-react/test-results/store-create-security-Stor-0d832-gueado-y-redirigido-a-login-chromium/error-context.md`
(el trace conservado es el del reintento, `...-retry1/trace.zip`).

**Causa raiz: NO CONFIRMADA — y es una reaparicion, no un caso nuevo.**
Este mismo spec ya registro este modo de fallo en dos corridas de la tanda del 2026-09-25
(corridas 1 y 5, "flaky de preparacion"), y en su momento se dio por superado con el rediseno
del spec — la ficha se retiro del indice maestro. Esta corrida demuestra que **no estaba
superado**: el modo de fallo volvio. Lo que la evidencia permite afirmar:

- Es el **armado de la sesion** (identity + login completo + carga del perfil) lo que se pasa
  de 120 s, no una asercion del test ni un flujo de la app que se haya roto.
- El reintento pasa, asi que el flujo es correcto cuando la maquina no esta saturada.
- No se puede confirmar la causa con un solo snapshot: hace falta medir cuanto tarda ese
  fixture en solitario y con carga.

**Clasificacion:** inestable de entorno/carga en el setup (tentativo). No hay evidencia de
defecto de la aplicacion ni de expectativa equivocada del test.

**Propuesta de solucion (no aplicada — tocar un test E2E requiere autorizacion 1 a 1).**
Primero medir, no parchear:

1. Correr el spec en solitario (`pnpm exec playwright test e2e/store-create-security.spec.ts`)
   y anotar el tiempo real del setup. Si pasa holgado, el problema es la carga de la suite.
2. Si se repite, endurecer el fixture: esperar una marca de sesion real (por ejemplo el home
   del rol, como ya hacen otros fixtures) en lugar de depender del timeout global de 120 s.

**Verificacion.** Ninguna: no se toco nada. La corrida completa marco el test como inestable
(paso al reintento).

**Estado final (2026-10-05):** 🟡 inestable documentado — sin diagnostico cerrado, con
antecedente de dos apariciones en la tanda del 2026-09-25.
