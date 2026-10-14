#!/usr/bin/env bash
# Revisa si tu app de Meta está suscrita a tu cuenta de WhatsApp Business (WABA)
# y, si no lo está, la suscribe. Sin esta suscripción, Meta no envía los mensajes
# al webhook aunque el webhook esté verificado.
#
# Uso: scripts/meta-subscribe.sh <ID de la cuenta de WhatsApp Business> <ID de la app>
#   (el ID de la app está en Configuración de la app → Básica → Identificador de la app)
# El token se pide de forma oculta: no queda en el historial ni en pantalla.
set -euo pipefail

WABA_ID="${1:?Uso: scripts/meta-subscribe.sh <ID de la cuenta de WhatsApp Business> <ID de la app>}"
APP_ID="${2:?Falta el ID de la app (Configuración de la app → Básica → Identificador de la app)}"
VERSION="${WHATSAPP_GRAPH_VERSION:-v26.0}"
URL="https://graph.facebook.com/$VERSION/$WABA_ID/subscribed_apps"

printf "Pega tu WHATSAPP_ACCESS_TOKEN (no se mostrará) y presiona Enter: "
read -rs TOKEN
echo

echo
echo "→ Apps suscritas a la cuenta $WABA_ID:"
CURRENT=$(curl -s "$URL" -H "Authorization: Bearer $TOKEN")
echo "$CURRENT"

if echo "$CURRENT" | grep -q '"error"'; then
  echo
  echo "Meta devolvió un error: revisa que el token esté vigente y que el ID sea el de la cuenta de WhatsApp Business."
  exit 1
fi

# Puede haber otras apps suscritas (incluidas apps internas de Meta): buscamos la nuestra por ID.
if echo "$CURRENT" | grep -q "\"id\":\"$APP_ID\""; then
  echo
  echo "✓ Tu app ($APP_ID) ya está suscrita. Meta debería estar enviando los mensajes al webhook."
  exit 0
fi

echo
printf "Tu app ($APP_ID) NO está suscrita. ¿Suscribirla ahora? (s/n): "
read -r ANSWER
if [ "$ANSWER" != "s" ]; then
  echo "No se hizo ningún cambio."
  exit 0
fi

echo "→ Suscribiendo…"
curl -s -X POST "$URL" -H "Authorization: Bearer $TOKEN"
echo
echo "→ Verificación:"
curl -s "$URL" -H "Authorization: Bearer $TOKEN"
echo
