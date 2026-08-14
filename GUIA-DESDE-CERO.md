# GUÍA DESDE CERO — Cómo funciona y cómo echarlo a andar

Esta guía explica el sistema de arriba hacia abajo: primero qué es, luego los conceptos,
después cómo correrlo y por último cómo usarlo como cliente.

---

## 1. Qué es este sistema

Es un **ledger inmutable (blockchain) en un solo nodo** que registra el dinero electrónico
de Ciudadan: saldos, subsidios, pagos y tokens de inversión. No hay minería real ni red p2p:
hay **un nodo autoritativo** que valida, firma, encadena y persiste todo.

- **Token nativo:** `LABORY` (el "peso" del sistema).
- **Token de inversión:** `CIT` (rendimientos).
- **Quién corre el nodo:** tú/el equipo (por ahora local, puerto 6633).
- **Quiénes son clientes:** usuarios finales que NO corren nada; consultan por API y
  firman sus transacciones con su llave privada.

El valor está en la cadena de **bloques encadenados por hash**: nadie puede alterar un
movimiento ya registrado sin romper todos los bloques siguientes.

---

## 2. Quién es quién en el sistema

| Rol | Qué es | Ejemplo |
|---|---|---|
| **Nodo** | La única máquina que mina y firma bloques | `index.js` corriendo en localhost:6633 |
| **Admin** | Tú (operador): tiene `ADMIN_TOKEN` para emitir/registrar | `npm run bootstrap`, mint, agencias |
| **Cliente** | Usuario final con su par de llaves | `npm run client` |
| **Agencia** | Entidad registrada con un `nivel_subsidio` | taxis, negocios del marketplace |
| **Tesorería** | Cuenta del sistema `0x...0001` (paga rendimientos/payouts) | configuración fija |
| **Reserva** | Cuenta del sistema `0x...0002` (guarda el principal de CIT) | configuración fija |

Las llaves y las direcciones funcionan así (`core/crypto.js`):

```
llave privada (secreto)  →  llave pública (hex)  →  dirección: "0x" + sha256(pública).slice(-40)
```

- Firma = demuestras que tienes la llave **sin revelarla** (secp256k1).
- La dirección se deriva de la pública, así que nadie puede inventar una dirección ajena.

---

## 3. Cómo se mueve el dinero (tipos de transacción)

Todo lo que pasa queda como una transacción dentro de un bloque. Los tipos son:

| Tipo | Quién lo dispara | Qué hace |
|---|---|---|
| `mint` | Admin (bootstrap/mint-test) | Crea saldo desde cero (emisión) |
| `transfer` | Cliente (firmada) | Mueve saldo de un usuario a otro |
| `reward` | El nodo (auto-miner) | Emite `BLOCK_REWARD` al minar: 80% nodo, 20% tesorería |
| `payment` | Admin | Pago con subsidio (usuario paga su parte, agencia paga la suya) |
| `earn` | Admin | Agencia paga a usuario por tarea/anuncio (una sola vez por `originId`) |
| `tokenlock` | Admin (en nombre del inversor) | Bloquea LABORY en la Reserva al invertir en CIT |
| `tokenpayout` | Runner automático | Tesorería paga rendimiento periódico |
| `tokenreturn` | Runner automático | Reserva devuelve el principal al madurar |
| `payout` | Admin / programado | Pagos masivos desde la tesorería |

**Ciclo de dinero en un vistazo:**

```
               bootstrap (mint)
                    │
        ┌───────────▼───────────┐
        │   Tesorería (0001)    │
        │   Reserva (0002)      │◄── bloqueo al invertir (tokenlock)
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │     usuarios          │◄── transfer entre ellos
        │     agencias          │◄── payment (subsidio) y earn
        └───────────┬───────────┘
                    │
             tokenpayout/tokenreturn ──► de vuelta a usuarios (rendimiento CIT)
```

### Transferencia firmada (lo más importante para el cliente)

Una transferencia de usuario incluye estos 7 campos **canónicos** (`core/txFormat.js`):

```
{ type, from, to, amount, token, nonce, publicKey, timestamp }
```

El cliente firma el hash de ese payload con su llave privada y lo manda a `POST /tx/send`.
El nodo valida en orden (`network/middlewares/validateTx.js`):

1. Firma válida con la `publicKey` incluida.
2. La dirección `from` se deriva de esa `publicKey` (no se puede suplantar).
3. El `nonce` coincide (anti-replay: una misma transacción no se reenvía dos veces).
4. Hay saldo suficiente.

Solo si todo cuadra pasa al **mempool** (cola) y el auto-miner lo mete a un bloque.

---

## 4. Cómo se encadena y persiste

**Bloque** (`core/blockchain.js`):

```
{ index, timestamp, transactions[], previousHash, hash, producer, publicKey, signature }
```

- `hash` = sha256(index + timestamp + JSON(transacciones) + previousHash).
- El bloque lo **firma el nodo** con su llave privada.
- Si cambias una transacción, el hash cambia y rompe el encadenamiento (integridad).

**Persistencia** (`core/store.js`): SQLite con WAL.

- Tabla `blocks` guarda cada bloque.
- Tabla `snapshot` guarda balances/nonces comprimidos.
- Al arrancar: si el snapshot corresponde al último bloque, se carga directo; si no,
  se **reproducen todas las transacciones** desde cero (replay).
- `GET /audit` hace un replay completo y compara contra el estado actual (conciliación).

---

## 5. Mapa del proyecto

```
ciudadan_bankchain/
├── index.js                 arranque: wallet + blockchain + API + procesos automáticos
├── .env                     configuración (PORT, ADMIN_TOKEN, NODE_PRIVATE_KEY) — NO se sube
├── nodeWallet.json          identidad pública del nodo (privateKey vive en .env)
├── config/economic.js       BLOCK_REWARD, TREASURY_ADDRESS, RESERVE_ADDRESS, token nativo
├── core/                    lógica pura (sin HTTP)
│   ├── crypto.js            llaves, hash canónico, firmas, derivación de direcciones
│   ├── blockchain.js        el ledger: reglas, minado, auditoría, export
│   ├── store.js             SQLite: bloques, snapshot, agencias, claims, CIT
│   ├── amounts.js           validación de montos y tokens
│   ├── txFormat.js          dos formatos de transacción (plano / wrapper)
│   └── syncStrapi.js        trae agencias desde Strapi
├── network/                 API Express
│   ├── api.js               monta las rutas
│   ├── routes/              wallet, tx, blockchain, assets, payouts, payments, agencies, tokens
│   ├── controllers/         la lógica HTTP de cada recurso
│   ├── middlewares/         requireAdmin, validateTx, rateLimit, logger
│   ├── autoMiner.js         cada ~6 s mina si hay transacciones en mempool
│   ├── payoutScheduler.js   cada 30 s ejecuta pagos programados
│   ├── tokenPayoutRunner.js cada 30 s paga rendimientos de CIT
│   └── strapiSyncRunner.js  sincroniza agencias desde Strapi (si está configurado)
├── scripts/
│   ├── bootstrap.js         siembra 100,000 LABORY + 50,000 CIT al nodo
│   ├── demo.sh              demo guiada de las 5 fases
│   ├── smoke.js             smoke test e2e
│   ├── client.js            mini-cliente para usar el ledger como usuario final
│   └── reset.js             borra el ledger (y opcionalmente la wallet del nodo)
├── test/                    59 tests (node --test)
└── data/ledger.sqlite       la base de datos (gitignored)
```

---

## 6. Cómo echarlo a andar desde cero

```bash
# 1) Dependencias
cd ciudadan_bankchain
npm install

# 2) Configuración (.env) — si no viene incluido:
PORT=6633
NODE_ID=nodo-01
BLOCK_TIME_MS=6000
NODE_PRIVATE_KEY=<llave privada del nodo, se imprime la primera vez>
ADMIN_TOKEN=<token secreto que solo usa el equipo>

# 3) Sembrar saldos iniciales (recomendado)
npm run bootstrap

# 4) Arrancar el nodo
npm start
```

Verifica que esté vivo en otra terminal:

```bash
curl localhost:6633/health
# {"success":true,"data":{"status":"ok","mode":"single-node",...}}
```

---

## 7. Cómo usarlo como cliente (lo que verá un usuario final)

**Endpoints públicos (sin token):**

| Endpoint | Qué devuelve |
|---|---|
| `GET /health` | Estado del nodo (bloque actual, mempool, tesorería) |
| `GET /wallet` | Identidad del nodo |
| `GET /wallet/<dir>/<TOKEN>` | Balance + nonce de una wallet |
| `GET /assets/<dir>` | Saldos de una wallet en todos los tokens |
| `GET /tx/<dir>` | Historial de la wallet |
| `GET /chain` | Cadena completa de bloques |
| `GET /mempool` | Transacciones en cola |
| `GET /agencies` | Agencias registradas |
| `GET /tokens/contracts` | Contratos de inversión disponibles |
| `GET /tokens/positions` | Posiciones CIT |
| `POST /tx/send` | Enviar una transferencia firmada |
| `POST /tx/verify` | Verificar una firma |

**Con el mini-cliente** (`npm run client`), que firma por ti:

```bash
npm run client new carlos            # crea wallet, te imprime address + privateKey
npm run client list                  # tus wallets guardadas
npm run client balances carlos       # saldos por token
npm run client wallet carlos LABORY  # balance + nonce
npm run client tx carlos             # historial
npm run client send carlos maria 25 LABORY   # firma y envía
```

Las wallets del cliente se guardan en `demo/clients.json` (gitignored, NO se suben).

---

## 8. Lo que corre solo en segundo plano

| Proceso | Cada | Qué hace |
|---|---|---|
| `autoMiner` | `BLOCK_TIME_MS` (~6 s) | Mina el mempool, emite `reward`, firma el bloque |
| `payoutScheduler` | 30 s | Ejecuta pagos programados vencidos (daily/weekly/one-shot) |
| `tokenPayoutRunner` | 30 s | Paga rendimientos CIT según `payoutFrequency` |
| `strapiSyncRunner` | según config | Sincroniza agencias desde Strapi (si hay `STRAPI_URL`) |

---

## 9. Operaciones de administración (requieren `x-admin-token`)

| Operación | Endpoint |
|---|---|
| Emitir saldo (pruebas) | `POST /wallet/mint-test` `{address, amount, token}` |
| Minar manual | `POST /mine` |
| Conciliar (replay vs estado) | `GET /audit` |
| Exportar el ledger completo | `GET /ledger/export` |
| Registrar agencia | `POST /agencies` `{address, agencia_id, nivel_subsidio}` |
| Sincronizar agencias de Strapi | `POST /agencies/sync` |
| Pago con subsidio | `POST /payments/subsidized` |
| Pago por earn (tarea/anuncio) | `POST /payments/earn` |
| Crear contrato CIT | `POST /tokens/contracts` |
| Invertir en CIT | `POST /tokens/invest` `{owner, contractId, amount}` |
| Correr rendimientos | `POST /tokens/payouts/run` |
| Pago masivo | `POST /payouts/run` |
| Pago programado | `POST /payouts/schedule` |

```bash
# ejemplo de uso del token admin
curl -s -X POST localhost:6633/wallet/mint-test \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"address":"0x2529...","amount":100,"token":"LABORY"}'
```

---

## 10. El subsidio y el CIT, en detalle

**Pago con subsidio** (`POST /payments/subsidized`): el usuario paga su parte y la agencia
la suya. Ejemplo de la demo: usuario paga 15, agencia paga 45, el destino recibe 60.
La agencia debe estar registrada con `nivel_subsidio = 45/15 = 3`; si el ratio no cuadra,
el pago se rechaza (`SUBSIDY_RATIO_MISMATCH`).

**Inversión CIT** (`POST /tokens/invest`):
1. Registras un contrato: `factorTarget` (2, 3, 4 o 7), `payoutFrequency`
   (`weekly`/`monthly`), `fixedRate`, `variableRate`, `commissionRate`.
2. El inversor entrega LABORY → se bloquea en la **Reserva** (`tokenlock`).
3. Cada periodo, el runner paga rendimiento desde la **Tesorería** (`tokenpayout`):
   `bruto = principal * (fixedRate + variableRate)`, `neto = bruto * (1 - commission)`.
4. Cuando el total pagado llega a `principal * (factorTarget - 1)`, madura y la **Reserva**
   devuelve el principal (`tokenreturn`).

---

## 11. Comandos de referencia rápida

```bash
npm start          # arranca el nodo
npm run bootstrap  # siembra saldos iniciales del nodo
npm run demo       # demo guiada de las 5 fases (requiere nodo arriba)
npm run smoke      # smoke test e2e
npm run client     # mini-cliente (new/list/balances/wallet/tx/send)
npm test           # 59 tests
npm run reset      # borra el ledger (con -- --wallet también la wallet del nodo)
```

**Reset manual desde cero:**

```bash
pkill -f "node index.js"   # detener el nodo
npm run reset              # borra data/ledger.sqlite (y con -- --wallet, nodeWallet.json)
npm run bootstrap          # sembrar de nuevo
npm start                  # arrancar
```

---

## 12. Notas de seguridad (resumen)

- `.env` tiene `ADMIN_TOKEN` y `NODE_PRIVATE_KEY`: **nunca se sube al repo**.
- Las llaves privadas de clientes son solo del cliente; el nodo solo conoce públicas.
- Firma + nonce + saldo: una transacción no se puede falsificar ni reutilizar.
- `x-admin-token` usa comparación en tiempo constante (anti timing-attack).
- Rate limits por tipo de endpoint (tx/admin/lectura).
- `npm audit` actualmente reporta 1 vulnerabilidad low (`elliptic`, sin fix disponible).
