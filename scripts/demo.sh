#!/usr/bin/env bash
# Demo en vivo del avance de bankchain (Fases 0-5).
# Requiere: nodo corriendo (npm start), ADMIN_TOKEN en .env.
# Uso: npm run demo   (o: bash scripts/demo.sh)

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a
BASE="${DEMO_BASE:-http://127.0.0.1:6633}"
TOKEN="${ADMIN_TOKEN:-}"
[ -z "$TOKEN" ] && { echo "✖ falta ADMIN_TOKEN en .env"; exit 1; }

AGENCY="0x0000000000000000000000000000000000000003"
USER="0x0000000000000000000000000000000000000004"
DEST="0x0000000000000000000000000000000000000005"
TREASURY="0x0000000000000000000000000000000000000001"
AUTH="x-admin-token: $TOKEN"
CT="Content-Type: application/json"

req() { curl -s -X "$1" "$BASE$2" -H "$CT" -H "$AUTH" ${3:+-d "$3"}; }

echo "=============================================="
echo "  BANKCHAIN   (nodo: $BASE)"
echo "=============================================="

echo; echo "▶ 1. Estado del nodo"; req GET /health; echo

echo; echo "▶ 2. Registrar agencia (nivel_subsidio=3)"
req POST /agencies "{\"address\":\"$AGENCY\",\"agencia_id\":\"demo-01\",\"nivel_subsidio\":3}"; echo

echo; echo "▶ 3. Fondear agencia (100) y usuario (500)"
req POST /wallet/mint-test "{\"address\":\"$AGENCY\",\"amount\":100,\"token\":\"LABORY\"}" > /dev/null
req POST /wallet/mint-test "{\"address\":\"$USER\",\"amount\":500,\"token\":\"LABORY\"}"; echo

echo; echo "▶ 4. Pago con subsidio (usuario 15 + agencia 45 → destino; 45/15 = nivel 3)"
req POST /payments/subsidized "{\"cartera_origen\":\"$USER\",\"cartera_destino\":\"$DEST\",\"cartera_agencia\":\"$AGENCY\",\"monto_laborys_usuario\":15,\"subsidio\":45}"; echo

echo; echo "▶ 5. Conciliación (replay del ledger vs estado)"
req GET /audit; echo

echo; echo "▶ 6. Contrato CIT (factor 2x)"
req POST /tokens/contracts "{\"id\":\"cit-demo-2x\",\"factorTarget\":2,\"payoutFrequency\":\"weekly\",\"fixedRate\":0.10,\"variableRate\":0.05,\"commissionRate\":0.1,\"minAmount\":10,\"maxAmount\":100000}"; echo

echo; echo "▶ 7. Invertir 100 LABORY (se bloquea en la reserva)"
req POST /tokens/invest "{\"owner\":\"$USER\",\"contractId\":\"cit-demo-2x\",\"amount\":100}"; echo

echo; echo "▶ 8. Sync de agencias desde Strapi (fallará 502 si STRAPI_URL no está configurado)"
req POST /agencies/sync; echo

echo; echo "▶ 9. Export del ledger (respaldo completo)"
req GET /ledger/export | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d).data;console.log(JSON.stringify({format:j.format,version:j.version,blocks:j.blocks,latestBlock:j.latestBlock,node:j.node}))})'; echo

echo; echo "✔ Demo completada."
