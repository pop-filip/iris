#!/bin/bash
# new-client.sh — Kreira novi Iris chat widget za klijenta
# Upotreba: ./new-client.sh <CLIENT_ID>
# Primjer:   ./new-client.sh mato-fotografija

set -e

CLIENT_ID="$1"

if [ -z "$CLIENT_ID" ]; then
  echo "Greska: CLIENT_ID nije naveden."
  echo "Upotreba: ./new-client.sh <client-id>"
  echo "Primjer:  ./new-client.sh mato-fotografija"
  exit 1
fi

# Validacija — samo lowercase slova, brojevi i crtice
if ! echo "$CLIENT_ID" | grep -qE '^[a-z0-9-]+$'; then
  echo "Greska: CLIENT_ID smije sadrzavati samo mala slova, brojeve i crtice."
  echo "Primjer: mato-fotografija, autohaus-wien, gk-autoteile"
  exit 1
fi

IRIS_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENT_DIR="/var/www/iris-clients/${CLIENT_ID}"

echo ""
echo "Kreiram novi Iris widget za klijenta: ${CLIENT_ID}"
echo "Destinacija: ${CLIENT_DIR}"
echo ""

# 1. Kreiraj direktorij za klijenta
mkdir -p "${CLIENT_DIR}/data/${CLIENT_ID}"

# Kreiraj prazan SQLite fajl da Docker volume mountuje fajl (ne direktorij)
touch "${CLIENT_DIR}/data/${CLIENT_ID}/iris.db"

# 2. Kopiraj .env.example kao .env
cp "${IRIS_DIR}/.env.example" "${CLIENT_DIR}/.env"

# Predpopuni CLIENT_ID u .env
sed -i "s/^CLIENT_ID=.*/CLIENT_ID=${CLIENT_ID}/" "${CLIENT_DIR}/.env"

# 3. Kopiraj docker-compose.template.yml kao docker-compose.yml i zamijeni placeholder
sed "s/{{CLIENT_ID}}/${CLIENT_ID}/g" "${IRIS_DIR}/docker-compose.template.yml" > "${CLIENT_DIR}/docker-compose.yml"

# 4. Kopiraj knowledge.md ako postoji (klijent ce ga prilagoditi)
if [ -f "${IRIS_DIR}/knowledge.md" ]; then
  cp "${IRIS_DIR}/knowledge.md" "${CLIENT_DIR}/knowledge.md"
  echo "Kopiran knowledge.md (prilagodi sadrzaj za klijenta)."
else
  touch "${CLIENT_DIR}/knowledge.md"
  echo "Kreiran prazan knowledge.md — popuni sa info o klijentu."
fi

echo ""
echo "Uspjesno kreiran setup za: ${CLIENT_ID}"
echo ""
echo "Sljedeci koraci:"
echo "  1. Uredi .env fajl:"
echo "       nano ${CLIENT_DIR}/.env"
echo ""
echo "  2. (Opcionalno) Dodaj business knowledge:"
echo "       nano ${CLIENT_DIR}/knowledge.md"
echo ""
echo "  3. Pokreni container:"
echo "       cd ${CLIENT_DIR} && docker compose up -d"
echo ""
echo "  4. Provjeri da li radi:"
echo "       curl https://${CLIENT_ID}.chat.digitalnature.at/health"
echo ""
