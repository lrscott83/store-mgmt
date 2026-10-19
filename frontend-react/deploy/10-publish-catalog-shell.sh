#!/bin/sh
# public-catalog-static-pages (T5/S9).
#
# Corre en cada arranque del contenedor, ANTES de nginx: la imagen `nginx:alpine` ejecuta
# /docker-entrypoint.d/*.sh desde su entrypoint. Publica en el volumen compartido con la API
# (`catalog_pages` en docker-compose.yml) las dos cosas que la pre-generación necesita, y CONSERVA
# los assets de builds anteriores:
#
#   1. <volumen>/shell/index.html
#      Copia del shell recién construido. La API lo lee como plantilla
#      (CatalogStaticPageOptions.ShellPath) y le inyecta el <head> con título, descripción,
#      canonical y Open Graph. Se sobrescribe siempre: es el shell vigente.
#
#   2. <volumen>/assets-archive/assets/*
#      Assets de builds anteriores, sin sobrescribir ni borrar nada. nginx los consulta SOLO cuando
#      el archivo pedido no existe en el build actual (deploy/nginx.conf → location
#      @old_catalog_assets): una página generada que todavía no se regeneró referencia el hash
#      anterior y sigue cargando en vez de romperse con un 404. Es seguro porque Vite nombra los
#      assets con hash de CONTENIDO: mismo nombre ⇒ mismo byte.
#
# REGLA DE ORO: este script NUNCA puede impedir el arranque de nginx — el POS entero depende de ese
# arranque. De ahí tres decisiones deliberadas: no hay `set -e` ni `set -u` (cada paso informa y
# sigue), no hay ningún `exit` —si el archivo llegara sin permiso de ejecución, el entrypoint de
# nginx lo SOURCEARÍA en su propio shell y un `exit` ahí sí cortaría el arranque— y todo paso que
# puede fallar va dentro de un `if`.

SHARED_DIR="${CATALOG_PAGES_DIR:-/srv/catalog-pages}"
SITE_DIR="/usr/share/nginx/html"
SHELL_PATH="$SHARED_DIR/shell/index.html"
ARCHIVE_ASSETS_DIR="$SHARED_DIR/assets-archive/assets"

if [ ! -d "$SHARED_DIR" ]; then
  echo "catalog-static-pages: $SHARED_DIR no existe (¿volumen sin montar?); no se publica nada." >&2
else
  if [ -f "$SITE_DIR/index.html" ]; then
    if mkdir -p "$SHARED_DIR/shell" && cp -p "$SITE_DIR/index.html" "$SHELL_PATH"; then
      echo "catalog-static-pages: shell publicado en $SHELL_PATH"
    else
      echo "catalog-static-pages: no se pudo publicar el shell en $SHELL_PATH" >&2
    fi
  else
    echo "catalog-static-pages: no hay shell en $SITE_DIR/index.html; no se publica." >&2
  fi

  if [ -d "$SITE_DIR/assets" ]; then
    if mkdir -p "$ARCHIVE_ASSETS_DIR"; then
      find "$SITE_DIR/assets" -type f | while read -r source; do
        relative="${source#"$SITE_DIR"/assets/}"
        archived="$ARCHIVE_ASSETS_DIR/$relative"
        if [ ! -e "$archived" ]; then
          mkdir -p "$(dirname "$archived")" && cp -p "$source" "$archived"
        fi
      done
      echo "catalog-static-pages: assets del build actual asegurados en $ARCHIVE_ASSETS_DIR"
    else
      echo "catalog-static-pages: no se pudo preparar $ARCHIVE_ASSETS_DIR" >&2
    fi
  fi
fi
