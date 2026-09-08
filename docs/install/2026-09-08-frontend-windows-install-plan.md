# Instalación del frontend (web-store-pos) en una PC con Windows — sin Docker

**Fecha:** 2026-09-08
**Alcance:** instalar solo el frontend React (`web-store-pos`) en una PC de tienda con Windows, sin Docker, de forma segura, con autenticación offline mediante roster descargado. Incluye además el modo "portátil": compactar todo, enviarlo a otra PC y ejecutarlo sin reinstalar nada.

---

## 1. Resumen de la decisión

| Aspecto | Decisión |
|---|---|
| Servidor web local | **Caddy** (un solo `.exe`, sirve HTTPS automático, corre como servicio de Windows) |
| Artefacto a instalar | Build estático de `pnpm build` (carpeta `build/client/`) |
| Node.js en la PC destino | **No se necesita** (solo en la PC donde se compila) |
| Docker en la PC destino | **No se necesita** |
| Autenticación | Offline con roster: se importa el fichero del roster desde la vista de login (provisión) y a partir de ahí el login funciona sin internet |
| Operaciones online cuando hay internet | Funcionan con el JWT del roster (ya implementado: usage tracker, verificación de versión, auth/me) |
| Base de datos local | Nada que instalar: los datos viven en IndexedDB/localStorage del navegador |
| Actualizaciones | La PWA detecta la nueva versión, muestra el diálogo y hace hard refresh al aceptar |

Por qué Caddy y no nginx/Node en Windows:

- Un solo binario autocontenido, sin dependencias ni instalación: se copia y corre.
- HTTPS con certificados propios gestionados por Caddy (`tls internal`) — necesario porque la PWA y `crypto.subtle` (criptografía del roster/DEK) exigen contexto seguro. `http://localhost` también da contexto seguro, pero solo para ese equipo; si otra PC de la red accede, hay que usar HTTPS o `localhost` + redirección de puerto.
- Se registra como servicio de Windows (arranque automático con la PC, reinicio ante caída) con `sc` o NSSM.
- El repo ya tiene la política CSP del build verificada (`verify-csp.mjs`); servir estáticos + headers es todo lo que Caddy necesita.

Alternativas descartadas:

- **`react-router-serve` (Node en la PC):** exige instalar y mantener un runtime de Node en la PC de tienda; más superficie de ataque y mantenimiento sin beneficio.
- **Abrir `index.html` con doble clic (`file://`):** los service workers y el router no funcionan bajo `file://` — inviable.
- **Electron/Tauri:** da una app "instalada" con aislamiento de proceso, pero es un pipeline de empaquetado nuevo; la PWA ya da offline + "Instalar app" desde el navegador gratis.

---

## 2. Requisitos

**PC donde se compila (una sola vez por versión):**
- Node.js ≥ 20 y pnpm ≥ 9 (las versiones con las que se verifica el repo).
- Acceso al repositorio (`main`).

**PC de destino (tienda):**
- Windows 10/11.
- Un navegador Chromium actualizado (Edge viene con Windows y sirve; recomendado Chrome/Edge).
- Caddy (se copia como archivo, no se instala).
- Puerto local libre (por defecto este plan usa `8443`).
- Opcional para acceso desde otras PCs de la red: firewall con regla de entrada limitada a la subred de la tienda.

**Del backend (una vez por dispositivo):**
- El fichero de roster exportado (la vista de exportación del panel de administración) y la contraseña maestra del roster.

---

## 3. Modo A — Instalación completa en la PC de destino

### 3.1 Compilar el frontend (PC con Node)

```bash
cd frontend-react/apps/web-store-pos
pnpm install
# La URL del backend se hornean en el build (api-client.ts lee import.meta.env.API_URL):
# - Si la PC de tienda llega al backend por internet: la URL pública del backend.
# - Si llega por LAN: la URL/proxy LAN (ver §6 para servir en mismo origen).
API_URL=https://tu-backend.ejemplo.cu pnpm build
```

El script `build` además genera y verifica el service worker y la CSP (`build-sw.mjs`, `verify-sw-precache.mjs`, `verify-csp.mjs`).

### 3.2 Preparar la carpeta a enviar

Compacta y envía (pendrive, red, lo que sea):

```
store-pos-package/
├── caddy.exe              ← binario de Caddy para Windows (amd64)
├── Caddyfile              ← configuración (ver §3.3)
├── install-service.ps1    ← (opcional) script de §3.4
└── site/                  ← contenido íntegro de apps/web-store-pos/build/client/
```

> **Verificación antes de enviar:** abrir `site/index.html` de la carpeta NO sirve como prueba (`file://` no es el entorno real). La prueba real se hace con Caddy corriendo (§3.5).

### 3.3 Caddyfile

```text
{
    admin off
}

:8443 {
    tls internal
    root * ./site
    encode gzip

    # SPA: cualquier ruta que no sea fichero cae en index.html
    try_files {path} /index.html
    file_server

    header {
        -Server
        X-Content-Type-Options nosniff
        Referrer-Policy no-referrer
        X-Frame-Options DENY
        Permissions-Policy "camera=(self), microphone=()"
    }
}
```

Notas:

- `tls internal`: Caddy genera CA local y certificado; en la primera visita el navegador pide confiar (o se importa el root CA de Caddy una vez, ver §3.6).
- `Permissions-Policy camera=(self)`: el escáner de códigos de barras por cámara necesita que la origen esté permitida; si se usa escáner USB (teclado), esta directiva es indiferente.
- `admin off`: desactiva el endpoint de administración de Caddy — superficie de ataque menor en una PC de tienda.

### 3.4 Registrar el servicio de Windows

Opción recomendada (NSSM, más simple de administrar):

```powershell
nssm install StorePOS "C:\store-pos\caddy.exe" "run --config C:\store-pos\Caddyfile"
nssm set StorePOS AppDirectory C:\store-pos
nssm set StorePOS AppStdout C:\store-pos\logs\caddy-out.log
nssm set StorePOS AppStderr C:\store-pos\logs\caddy-err.log
nssm set StorePOS ObjectName .\StorePOSAccount "contraseña-segura"   # cuenta local sin privilegios de admin
nssm start StorePOS
```

Opción nativa sin NSSM (Windows 10/11 con `sc`):

```powershell
# Crear cuenta local sin privilegios (una vez)
net user StorePOSAccount contraseña-segura /add
net localgroup Users StorePOSAccount /delete   # sacarla de Users no es obligatorio, pero reduce exposición

sc.exe create StorePOS binPath= "C:\store-pos\caddy.exe run --config C:\store-pos\Caddyfile" obj= ".\StorePOSAccount" password= "contraseña-segura" start= auto
sc.exe description StorePOS "Servidor local del POS de la tienda"
sc.exe failure StorePOS reset= 86400 actions= restart/5000/restart/5000/restart/30000
netsh advfirewall firewall add rule name="StorePOS 8443 LAN" dir=in action=allow protocol=TCP localport=8443 remoteip=192.168.1.0/24
```

> La cuenta del servicio necesita permiso de lectura sobre `C:\store-pos\site` y escritura sobre `C:\store-pos\logs`. Primera vez que Caddy corre con `tls internal`, crea `C:\store-pos\caddy\pki` — esa carpeta también debe ser escribible por la cuenta del servicio.

### 3.5 Verificación en la PC de destino

1. Abrir `https://localhost:8443` (o `https://<ip-lan>:8443` desde otra PC) — debe cargar el login.
2. Aceptar/advertencia de certificado o importar la CA (§3.6).
3. En el login, usar la opción de **activación/provisión offline** y seleccionar el fichero de roster + contraseña maestra. Verde si: "Roster importado".
4. Autenticarse con un usuario del roster **sin internet** (desconectar el cable/WiFi para probar): debe entrar a la vista del rol.
5. Reconectar internet y verificar: la verificación de versión funciona, el usage tracker reporta, y `auth/me` responde — todo con el JWT del roster.
6. Cerrar sesión y volver a entrar: persiste (IndexedDB).

### 3.6 Confiar en el certificado (solo la primera vez, por PC)

Opción A (por navegador): navegar a `https://localhost:8443`, avanzar la advertencia y confiar en el certificado.

Opción B (recomendada en la tienda, una vez por PC): exportar el root CA de Caddy desde la PC donde corre:

```powershell
# El root CA vive en C:\store-pos\caddy\pki\authorities\local\root.crt
# Importarlo al almacén de "Entidades de certificación raíz de confianza" del usuario o del equipo:
Import-Certificate -FilePath C:\store-pos\caddy\pki\authorities\local\root.crt -CertStoreLocation Cert:\LocalMachine\Root
```

Con la CA confiable, el candado queda verde y no hay advertencias para el puerto 8443.

---

## 4. Modo B — Paquete portátil: compactar, enviar, descompactar y ejecutar

Este modo aprovecha que **todo el sistema es autocontenido**: Caddy + build estático + Caddyfile + service scripts no dependen de la máquina. Se prepara un paquete zip que en otra PC solo se descompacta y se ejecuta.

### 4.1 Estructura del paquete

```
StorePOS-Portable/
├── caddy.exe
├── Caddyfile
├── site/                          ← build/client completo
├── start.ps1                      ← arranca Caddy en primer plano (para probar)
├── install-service.ps1            ← registra el servicio de Windows (NSSM o sc)
├── uninstall-service.ps1          ← elimina el servicio
├── trust-ca.ps1                   ← importa la CA local de Caddy al almacén de Windows
├── README-PORTABLE.txt            ← instrucciones para quien recibe el paquete
└── VERSION.txt                    ← hash del build, fecha, API_URL horneada
```

### 4.2 `start.ps1` (ejecución directa, sin servicio)

```powershell
# Ejecutar el POS en primer plano para pruebas o uso sin servicio.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
& "$dir\caddy.exe" run --config "$dir\Caddyfile"
```

### 4.3 `install-service.ps1`

```powershell
# Requiere ejecución como Administrador.
New-Item -ItemType Directory -Force "$dir\logs" | Out-Null
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$svc = "StorePOS"

# 1. Cuenta de servicio sin privilegios
$acct = "StorePOSAccount"
$pwd  = (ConvertTo-SecureString "cambia-esta-clave-1!" -AsPlainText -Force)
New-LocalUser -Name $acct -Password $pwd -AccountNeverExpires -PasswordNeverExpires | Out-Null

# 2. Servicio apuntando a Caddy con la config local
New-Service -Name $svc `
  -BinaryPathName "$dir\caddy.exe run --config $dir\Caddyfile" `
  -DisplayName "Store POS local server" `
  -StartupType Automatic
sc.exe failure $svc reset= 86400 actions= restart/5000/restart/5000/restart/30000

# 3. Permisos: lectura al sitio, escritura a pki y logs
icacls "$dir\site"   /grant "${acct}:(OI)(CI)RX" /T | Out-Null
icacls "$dir\caddy"  /grant "${acct}:(OI)(CI)M"  /T | Out-Null
icacls "$dir\logs"   /grant "${acct}:(OI)(CI)M"  /T | Out-Null

# 4. Firewall limitado a la subred de la tienda (ajustar la subred)
New-NetFirewallRule -DisplayName "StorePOS 8443 LAN" -Direction Inbound `
  -Protocol TCP -LocalPort 8443 -RemoteAddress 192.168.1.0/24 -Action Allow

# 5. Arrancar
Start-Service $svc
Write-Host "StorePOS instalado. Abre https://localhost:8443"
```

### 4.4 `trust-ca.ps1`

```powershell
# Importa el root CA de Caddy al almacén del equipo (requiere Admin).
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = "$dir\caddy\pki\authorities\local\root.crt"
if (Test-Path $root) {
    Import-Certificate -FilePath $root -CertStoreLocation Cert:\LocalMachine\Root
    Write-Host "CA importada. Sin advertencias de certificado en este equipo."
} else {
    Write-Host "No hay root.crt todavía: abre https://localhost:8443 una vez, luego re-ejecuta este script."
}
```

### 4.5 `uninstall-service.ps1`

```powershell
$svc = "StorePOS"
Stop-Service $svc -ErrorAction SilentlyContinue
sc.exe delete $svc
Remove-LocalUser StorePOSAccount -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "StorePOS 8443 LAN" -ErrorAction SilentlyContinue
Write-Host "StorePOS desinstalado."
```

### 4.6 Flujo completo

1. **En la PC de origen** (donde está el repo):
   - Compilar con la `API_URL` correcta (§3.1).
   - Armar la carpeta `StorePOS-Portable/` (§4.1) con los scripts de §4.2–4.5.
   - Compactar: `Compress-Archive -Path StorePOS-Portable -DestinationPath StorePOS-Portable-2026-09-08.zip`
2. **Enviar** por el medio disponible (pendrive, carpeta de red, correo interno).
3. **En la PC de destino:**
   - Descompactar en `C:\store-pos` (o donde se prefiera; los scripts usan rutas relativas al propio script).
   - Ejecutar `start.ps1` para probar en primer plano, o directamente `install-service.ps1` como Administrador para dejarlo permanente.
   - Ejecutar `trust-ca.ps1` (como Admin) para eliminar advertencias de certificado.
   - Abrir `https://localhost:8443`, provisionar el roster y verificar el flujo offline (§3.5).
4. **Actualizar a una versión nueva** en esa PC: repetir el paso 1 con un build nuevo y reemplazar solo la carpeta `site/`. El service worker de la PWA detecta el cambio y ofrece el diálogo de actualización con hard refresh.

### 4.7 Qué NO se compacta

- `node_modules`, `.react-router`, `build/server` — no se necesitan en destino.
- El roster y las claves del dispositivo: **nunca viajan en el paquete**. Cada PC importa su propio roster y genera sus claves locales (DEK) en el primer arranque; compartir ese estado entre PCs sería un riesgo de seguridad.

---

## 5. Actualizaciones de versión (PWA + hard refresh)

El flujo ya implementado en la app:

1. Se publica un build nuevo en `site/`.
2. El service worker detecta el precache nuevo → la app muestra el diálogo "Nueva versión disponible".
3. Al aceptar: `updateSW(true)` (hard refresh) → el usuario ve todos los cambios visuales.

Para que esto funcione con el modo portátil:

- Reemplazar `site/` por el nuevo build es suficiente; el resto (`caddy.exe`, Caddyfile, servicio) no cambia.
- Si la PC está offline en el momento del reemplazo: en el próximo momento con internet la app verifica la versión (con el JWT del roster) y ofrece actualizar; si el dispositivo no vuelve a tener internet, la copia local del service worker sigue sirviendo la app que ya tiene — sin bloquear el trabajo del día (comportamiento offline-first ya implementado).

---

## 6. Opcional: mismo origen para frontend + backend en la LAN

Si la PC de tienda NO tiene salida a internet y el backend está en otra PC de la LAN, Caddy puede servir la app y hacer de proxy del backend en el mismo origen:

```text
:8443 {
    tls internal
    root * C:\store-pos\site
    encode gzip
    try_files {path} /index.html
    file_server

    # Proxy del backend (ajustar host:puerto)
    reverse_proxy /api/* 192.168.1.50:8000
    # /v1/* si el backend sirve las rutas bajo /v1 — ajustar:
    reverse_proxy /v1/* 192.168.1.50:8000

    header {
        -Server
        X-Content-Type-Options nosniff
    }
}
```

Con este modo, `API_URL` se deja **vacío** en el build (baseURL relativa), y todo sale por el mismo origen HTTPS — sin CORS ni cookies de terceros.

---

## 7. Seguridad — resumen de controles

| Control | Implementación |
|---|---|
| Transporte cifrado en LAN | HTTPS con `tls internal` (Caddy CA) + importar root CA |
| Superficie de ataque | `admin off` en Caddy; sin Node/Docker en la PC; cuenta de servicio sin privilegios |
| Acceso a la red | Regla de firewall limitada a la subred de la tienda |
| CSP | La que ya genera y verifica el build (`csp-policy.mjs` → `verify-csp.mjs`) |
| Credenciales del roster | Nunca viajan en el paquete portátil; cada dispositivo provisiona el suyo |
| Claves locales (DEK) | Generadas en el dispositivo en el primer arranque; no se copian entre PCs |
| Datos de la tienda | En IndexedDB del navegador bajo perfil de usuario de Windows; backup vía export/import de la propia app |
| Actualizaciones | Service worker con prompt + hard refresh; sin acceso de escritura al sitio desde fuera |

Recomendaciones adicionales en la tienda:

- Navegador en modo quiosco/perfil dedicado con la app "instalada" (menú del navegador → Instalar app).
- Restringir la PC al uso del POS (sin cuentas de administrador para el cajero).
- Programar el export/import de datos (§ de la app) como rutina de respaldo.

---

## 8. Pasos rápidos (cheat sheet)

```powershell
# ===== PC con Node (una vez por versión) =====
cd frontend-react/apps/web-store-pos
pnpm install
$env:API_URL = "https://tu-backend.ejemplo.cu"; pnpm build
# copiar build/client → StorePOS-Portable/site

# ===== PC de destino =====
# 1. Descompactar en C:\store-pos
# 2. Probar en primer plano:
powershell -ExecutionPolicy Bypass -File C:\store-pos\start.ps1
# 3. Instalar como servicio (Admin):
powershell -ExecutionPolicy Bypass -File C:\store-pos\install-service.ps1
# 4. Confiar CA (Admin):
powershell -ExecutionPolicy Bypass -File C:\store-pos\trust-ca.ps1
# 5. Abrir https://localhost:8443 → provisionar roster → login offline
```
