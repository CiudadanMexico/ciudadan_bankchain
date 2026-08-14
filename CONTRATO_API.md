# Bankchain — Contrato de API v1

> Este documento congela el contrato técnico de `ciudadan_bankchain` (fue la Fase 0 del roadmap). A partir de acá, los consumidores externos (Strapi, el backend provisional, cualquier microservicio) saben con qué se van a encontrar.
> **Estado:** v1 · congelado · Última actualización: 07/08/2026

---

## 1. Decisión de arquitectura (Fase 0)

Antes de escribir una sola línea de código resolví cómo iba a convivir esto con lo demás, y quedó así:

- **Nodo único autoritativo.** Un solo nodo, sin red de validadores. No tiene sentido montar consenso para el tamaño de la cooperativa (detalle en CONTEXTO_PROYECTO.md §4).
- **Monolito modular.** Una sola aplicación Node/Express dividida por dominio (wallet, tx, blockchain, assets, payouts, payments, agencies, tokens). Nada de microservicios por ahora.
- **Strapi = capa administrativa.** Catálogo, configuración, backoffice, reportes. **Nunca** ledger, **nunca** private keys.
- **La blockchain es la única fuente de verdad** de balances y transacciones (ledger append-only).
- Los balances se **derivan** de las transacciones; el snapshot es solo caché y siempre se puede reconstruir.

## 2. Principios del contrato

1. **Montos:** string de dígitos enteros (o número entero seguro). **Jamás float.** `parseAmount` rechaza floats, negativos y no-numéricos.
2. **Nonce por wallet:** entero que incrementa en cada `transfer`. Es el anti-replay.
3. **Firma:** se genera **localmente** en el cliente (la capa del usuario que firma con su private key); el servidor solo verifica.
4. **Timestamps:** en ms (epoch). El servidor no confía en el cliente para balances, solo para la intención de la transacción.
5. **Idempotencia:** `origin_id` (earn) y `positionId` (tokens) garantizan que un duplicado no se pague dos veces on-chain.
6. **Respuestas:** siempre `{ success: boolean, data? }` o `{ success: false, error: "<CÓDIGO>" }`. Los códigos de error van en mayúsculas y son estables (p. ej. `INVALID_SIGNATURE`).
7. **Ledger append-only:** no se editan ni borran transacciones históricas.

## 3. Formato de transacción v1

`/tx/send` acepta **dos representaciones equivalentes**; internamente el ledger siempre normaliza a la forma plana (`core/txFormat.js`), así que da igual cuál manden.

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

### 3.3 Campos que se firman

`hashTransaction` cubre **exactamente** estos campos y en este orden canónico:

```
type · from · to · amount (string) · token · nonce · publicKey · timestamp
```

Notas que hay que tener presentes:

- La `signature` **no** forma parte del hash.
- Firma: ECDSA `secp256k1`, `sign(hashTransaction(payload))`, serializada en DER hex.
- `address = "0x" + sha256(publicKey).slice(-40)`.

### 3.4 Orden de validación

1. Tipo: solo `transfer` desde clientes.
2. `from`/`to` direcciones válidas (40 hex + prefijo `0x`).
3. `amount` entero positivo y `token` del catálogo.
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

### 4.2 Admin (requieren `x-admin-token`, con rate-limit)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/wallet/mint-test` | mint de prueba (on-chain) |
| POST | `/mine` | minar manualmente |
| POST | `/block/apply` | aceptar bloque externo |
| POST | `/payouts/run` · `/payouts/schedule` | distribuir desde tesorería / programar |
| DELETE | `/payouts/:id` | cancelar schedule |
| GET | `/audit` | conciliación: replay del ledger vs estado actual |
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

Validación: el `nivel_subsidio` de la agencia debe ser `subsidio / monto_laborys_usuario` (en el ejemplo, 45 / 15 = 3). El nodo debita usuario + agencia y acredita al destino en un solo bloque atómico (2 transacciones `payment`).

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

Idempotente por `origin_id` (tabla `claims`). Si llega un duplicado responde `ORIGIN_ALREADY_EARNED`.

### 4.5 Tokens de inversión (CIT)

El contrato de inversión:

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

Reglas:

- `factorTarget` solo puede ser 2, 3, 4 o 7.
- Rendimiento neto por período = `principal * (fixedRate + variableRate) * (1 - commissionRate)`, con tope en `principal * (factorTarget - 1)`.
- Al alcanzar el tope, el contrato **madura** y se devuelve el principal (sale de la reserva).
- Transacciones on-chain involucradas: `tokenlock` (bloqueo del principal), `tokenpayout` (rendimiento, pagado desde tesorería) y `tokenreturn` (devolución del principal).

### 4.6 Sync de Strapi

`POST /agencies/sync` consume `{STRAPI_URL}/api/agencias` (paginado, con Bearer `STRAPI_TOKEN`), mapea `wallet_address` → `address` y usa `nivel_subsidio` con fallback configurable. Si no hay `STRAPI_URL` configurado responde `502 STRAPI_URL_REQUIRED`.

## 5. Compatibilidad y evolución

- Esta versión **acepta** la forma plana y la wrapper; ninguna se depreca en v1.
- Cualquier cambio en los campos firmados de `hashTransaction` es **breaking**: implica nueva versión del contrato y que los clientes vuelvan a firmar.
- `origin_id`, `positionId` y `agencia_id` son identificadores estables (uuid / id de Strapi).
- Cuando llegue el momento de migrar a microservicios o validadores (Fase 5), estos payloads no deberían cambiar: para eso existe el contrato.
