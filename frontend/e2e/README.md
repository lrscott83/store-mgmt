# E2E Tests con Playwright

## Setup

```bash
# Instalar dependencias (ya incluido en package.json)
npm install

# Instalar browsers de Playwright
npx playwright install chromium
```

## Ejecutar Tests

```bash
# Ejecutar todos los tests
npm run test:e2e

# Ejecutar con interfaz visual
npm run test:e2e:ui

# Ejecutar en modo headed (ver navegador)
npm run test:e2e:headed

# Ejecutar un test específico
npx playwright test e2e/login-redirect.spec.ts
```

## Tests Incluidos

### login-redirect.spec.ts

| Test                                                            | Descripción                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| `should redirect authenticated user from /login to /sales/sale` | Verifica que usuario normal sea redirigido a /sales/sale   |
| `should redirect admin user from /login to /admin/owners`       | Verifica que admin/reseller sea redirigido a /admin/owners |
| `should show login form when user is NOT authenticated`         | Verifica que sin auth se muestre el formulario             |
| `should NOT redirect when token has expired`                    | Verifica que token expirado no haga redirect               |
| `should preserve user session after page refresh`               | Verifica que sesión persista después de refresh            |

## Configuración

El archivo `playwright.config.ts` está configurado para:

- Arrancar automáticamente el servidor Angular (`npm start`)
- Timeout de 120 segundos para el servidor
- Retry en CI/CD
- Reporter HTML

## Keys de localStorage usadas

- **Auth token**: `v4.0.0-authf496fc5a9f17` (version + USERDATA_KEY)
- **Current user**: `currentUser`

## Notas

- Los tests esperan que el servidor backend esté corriendo en `https://localhost:44320`
- Algunos tests pueden fallar si no hay productos disponibles (para verificar `hasAnyAvailableToSaleProduct`)
