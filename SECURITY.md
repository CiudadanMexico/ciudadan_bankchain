# Bankchain — seguridad

> Postura de seguridad del nodo `ciudadan_bankchain` y qué hay que cuidar a la hora de desplegarlo en producción. Última actualización: 07/08/2026.

---

## 1. Modelo de amenaza

El nodo es **single-node autoritativo** y su uso es interno de la cooperativa, así que las amenazas que de verdad me preocupan son estas: robo del `ADMIN_TOKEN`, exponer la API a internet sin cuidado, transacciones o bloques forjados, manipulación de saldos, inyección SQL, abuso de montos (floats) y DoS.

Una suposición importante: **el operador (quien corre el nodo) es de confianza.** El código no está pensado para defenderse de alguien con acceso físico o root al servidor; eso no se resuelve con código.

## 2. Qué está protegido

| Vector | Control |
|---|---|
| Forjar transferencias | Firma ECDSA secp256k1 verificada en `addTransaction` / `applyExternalBlock` |
| Robar con otra clave | `deriveAddress(publicKey) === from` (`ADDRESS_MISMATCH`) |
| Replay de transacciones | `nonce` por wallet, incrementado en cada `transfer` |
| Manipular montos | `parseAmount`: string/entero, nunca float (`AMOUNT_NOT_INTEGER`) |
| Forjar bloques | Hash en cadena + bloque firmado por el nodo (`verifyBlockSignature`) |
| Inyección SQL | Solo prepared statements (`node:sqlite`) |
| Acceso a mint/mine/payouts/sync | `ADMIN_TOKEN` con comparación **timing-safe**, fail-closed si no está configurado |
| Abuso de endpoints | Rate-limit por IP: `RATE_LIMIT_TX_MAX`, `RATE_LIMIT_ADMIN_MAX`, `RATE_LIMIT_READ_MAX` |
| Payloads gigantes | `express.json({ limit: "100kb" })` |
| Lectura pesada | Paginación opcional en `GET /chain` y `GET /tx/:address` (`?limit=&offset=`) |
| Secretos en git | `.env`, `.env.*`, `nodeWallet.json`, `data/`, `*.log` en `.gitignore` |

## 3. Requisitos de despliegue (producción)

1. **TLS obligatorio:** un reverse proxy (nginx/Caddy) con HTTPS delante del nodo. **Nunca** exponer el puerto 6633 directo a internet.
2. **Red interna / VPN:** el nodo y Strapi/backoffice deben comunicarse dentro de la red corporativa o por VPN.
3. **Permisos:** `chmod 600 .env` y `chmod 600 nodeWallet.json`.
4. **Rotación:** rotar `ADMIN_TOKEN` y `NODE_PRIVATE_KEY` periódicamente y cada vez que haya sospecha de fuga.
5. **Backups:** respaldar `data/ledger.sqlite` (incluidos los WAL) y, como copia portable, el `GET /ledger/export` (admin).
6. **Actualizaciones:** correr `npm audit` de vez en cuando; `npm audit fix` para vulnerabilidades que tengan fix.
7. **Logs:** los logs (los que llevan `[action]`) no deben contener `ADMIN_TOKEN`, firmas ni private keys (conviene verificarlo al desplegar).

## 4. Auditoría de dependencias (07/08/2026)

- `npm audit` → **1 low**: `elliptic` (advisory GHSA-848j, implementación "arriesgada", **sin fix disponible**). Es la librería ECDSA que se usa para las firmas; la mantengo por ser la estándar de Node, y cuando migremos a Node ≥ 23 se puede evaluar `node:crypto` nativo con `secp256k1`.
- Eliminé la dependencia `uuid` (no se usaba; `crypto.randomUUID` de Node hace lo mismo).
- Actualizadas vía `npm audit fix`: `body-parser`, `path-to-regexp`, `qs`, etc.

## 5. Riesgos aceptados / pendientes

| Riesgo | Estado |
|---|---|
| Un solo `ADMIN_TOKEN` = control total | Aceptado (operador de confianza); mitigado con TLS + rotación |
| Endpoints de lectura públicos (`/chain`, `/tx/:address`) | Aceptado por diseño; mitigado con rate-limit + paginación |
| Advisory de `elliptic` sin fix | Aceptado; candidato a migrar a `node:crypto` |
| Auth por usuario (¿quién firma?) | Fuera de alcance: la identidad se resuelve por dirección/Strapi |
| DoS con muchas peticiones | Rate-limit por IP; en despliegue sumar límites a nivel de proxy |

## 6. Buenas prácticas para quien integre (Strapi/microservicios)

- **Nunca** guardar private keys en Strapi ni en la capa admin (regla de arquitectura).
- Firmar transacciones **localmente**; el servidor solo verifica.
- Montos como string/entero en todo el camino.
- Usar el contrato `CONTRATO_API.md` v1; si cambian campos firmados, se hace una nueva versión del contrato.
