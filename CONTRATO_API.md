# Bankchain — Contrato de API v1

> Documento que **congela** el contrato técnico de `ciudadan_bankchain` (Fase 0 del roadmap).
> Estado: **v1 · congelado** · Última actualización: 07/08/2026
> Alcance: consumidores externos (Strapi, backend provisional, microservicios).

---

## 1. Decisión de arquitectura (Fase 0)

- **Nodo único autoritativo**: single-node, sin red de validadores (decisiones §4 de CONTEXTO_PROYECTO.md).
- **Monolito modular**: una sola aplicación Node/Express modular por dominio (wallet, tx, blockchain, assets, payouts, payments, agencies, tokens). **No** se adoptan microservicios por ahora.
- **Strapi = capa administrativa**: catálogo, configuración, backoffice, reportes. **Nunca** ledger ni private keys.
- La **blockchain es la única fuente de verdad** de balances y transacciones (ledger append-only).
- Los balances se **derivan** de las transacciones (snapshot es solo caché, siempre reconstruible).

## 2. Principios de contrato

1. **Montos**: string de dígitos enteros (o número entero seguro). **Nunca float.** `parseAmount` rechaza floats/negativos/no-numéricos.
2. **Nonce por wallet**: entero, incrementa en cada `transfer`. Anti-replay.
3. **Firma**: se genera **localmente** en el cliente; el servidor verifica. Firma local = la capa del usuario que firma con su private key.
4. **Timestamps**: `timestamp` en ms (epoch). El servidor no confía en el cliente para balances, solo para intención.
5. **Idempotencia**: `origin_id` (earn) y `positionId` (tokens) garantizan dedup on-chain.
6. **Respuestas**: siempre `{ success: boolean, data? }` o `{ success: false, error: "<CÓDIGO>" }`. Códigos de error en mayúsculas y estables (p.ej. `INVALID_SIGNATURE`).
7. **Ledger append-only**: no se editan ni borran transacciones históricas.

## 3. Formato de transacción v1

El endpoint `/tx/send` acepta **dos representaciones equivalentes**:

### 3.1 Forma plana

```json
{
  "type": "transfer",
  "from": "0x...",
  "to": "0x...",
  "amount": "100",
  "token": "LABORY",
  "nonce": 0,
  "publicKey": "<hex secp256k1>",
  "timestamp": 1750000000000,
  "signature": "<DER hex>"
}
```

### 3.2 Forma wrapper `{payload, signature}`

```json
{
  "payload": {
    "type": "transfer",
    "from": "0x...",
    "to": "0x...",
    "amount": "100",
    "token": "LABORY",
    "nonce": 0,
    "publicKey": "<hex secp256k1>",
    "timestamp": 1750000000000
  },
  "signature": "<DER hex>"
}
```

Internamente el ledger siempre normaliza a la forma plana (`core/txFormat.js`).

### 3.3 Campos del hash firmado

`hashTransaction` cubre **exactamente** estos 7 campos (en este orden canónico):

```
type · from · to · amount (string) · token · nonce · publicKey · timestamp
```

- `signature` **no** forma parte del hash.
- Firma: ECDSA `secp256k1`, `sign(hashTransaction(payload))`, serialización DER hex.
- `address = "0x" + sha256(publicKey).slice(-40)`.

### 3.4 Reglas de validación (orden)

1. Tipo: solo `transfer` desde clientes.
2. `from`/`to` direcciones válidas (40 hex + prefijo `0x`).
3. `amount` entero positivo, `token` del catálogo.
4. `verifySignature(tx)` OK.
5. `deriveAddress(publicKey) === from`.
6. `nonce === nonce actual de from`.
7. `balance(from, token) >= amount`.

## 4. Endpoints congelados (v1)

### 4.1 Públicos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | estado del nodo: bloque, mempool, tesorería, uptime |
| GET | `/wallet` | identidad del nodo (address, publicKey) |
| GET | `/wallet/:address/:token` | balance de una wallet |
| GET | `/assets` · `/assets/:address` | totales por token · balances de una wallet |
| POST | `/tx/send` | enviar transacción firmada (plana o wrapper) |
| POST | `/tx/verify` | verificar firma/nonce/saldo sin insertar |
| GET | `/chain` · `/mempool` | cadena completa · pendientes |
| GET | `/tx/:address` | historial de una wallet |
| GET | `/payouts` | schedules + saldo de tesorería |
| GET | `/agencies` | agencias registradas |
| GET | `/tokens/contracts` | catálogo de contratos CIT |
| GET | `/tokens/positions?owner=` | posiciones de inversión |

### 4.2 Admin (requieren `x-admin-token`, rate-limit)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/wallet/mint-test` | mint de prueba (on-chain) |
| POST | `/mine` | minar manualmente |
| POST | `/block/apply` | aceptar bloque externo |
| POST | `/payouts/run` · `/payouts/schedule` | distribuir desde tesorería / programar |
| DELETE | `/payouts/:id` | cancelar schedule |
| GET | `/audit` | conciliación replay del ledger vs estado |
| POST | `/agencies` | registrar/actualizar agencia |
| POST | `/agencies/sync` | sync desde Strapi |
| POST | `/payments/subsidized` | pago con subsidio (§4.3) |
| POST | `/payments/earn` | earn_laborys (§4.4) |
| POST | `/tokens/contracts` | registrar contrato CIT |
| POST | `/tokens/invest` | invertir (§4.5) |
| POST | `/tokens/payouts/run` | ejecutar payouts CIT |

### 4.3 Pago con subsidio

```json
{
  "cartera_origen": "0x...",
  "cartera_destino": "0x...",
  "cartera_agencia": "0x...",
  "monto_laborys_usuario": 15,
  "subsidio": 45
}
```

Validación: `nivel_subsidio` de la agencia == `subsidio / monto_laborys_usuario`. Debita usuario + agencia → destino en un solo bloque atómico (2 txs `payment`).

### 4.4 earn_laborys

```json
{
  "tipo": "tarea" | "anuncio",
  "cartera_agencia": "0x...",
  "cartera_destino": "0x...",
  "monto": 100,
  "origin_id": "uuid"
}
```

Idempotente por `origin_id` (tabla `claims`). Duplicado → `ORIGIN_ALREADY_EARNED`.

### 4.5 Tokens de inversión (CIT)

Contrato:

```json
{
  "id": "cit-2x",
  "factorTarget": 2,
  "payoutFrequency": "weekly" | "monthly",
  "fixedRate": 0.10,
  "variableRate": 0.05,
  "commissionRate": 0.1,
  "minAmount": 100,
  "maxAmount": 100000
}
```

Reglas: `factorTarget ∈ {2,3,4,7}`. Rendimiento neto por período =
`principal * (fixedRate + variableRate) * (1 - commissionRate)`, cap en
`principal * (factorTarget - 1)`. Al alcanzar el cap → madura y devuelve el principal
(desde la reserva). Txs on-chain: `tokenlock` (bloqueo), `tokenpayout` (rendimiento desde tesorería), `tokenreturn` (principal).

### 4.6 Error: Strapi sync

`POST /agencies/sync` consume `{STRAPI_URL}/api/agencias` (paginado, Bearer `STRAPI_TOKEN`),
mapea `wallet_address` → `address`, `nivel_subsidio` con fallback configurable.
Sin `STRAPI_URL` → `502 STRAPI_URL_REQUIRED`.

## 5. Compatibilidad y evolución

- Esta versión **acepta** la forma plana y la wrapper; ninguna se depreca en v1.
- Cualquier cambio de campos firmados en `hashTransaction` es **breaking**: requiere nueva versión del contrato y re-firma de clientes.
- `origin_id`, `positionId` y `agencia_id` son identificadores estables (uuid / id Strapi).
- Migración a microservicios o validadores (Fase 5) no debe cambiar estos payloads (el contrato los protege).
