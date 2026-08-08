// core/txFormat.js
// Normalización del formato de transacción v1.
//
// Se aceptan DOS representaciones en la API:
//   1. plana:  { type, from, to, amount, token, nonce, publicKey, timestamp, signature }
//   2. wrapper: { payload: { type, from, to, amount, token, nonce, publicKey, timestamp }, signature }
//
// Internamente el ledger siempre guarda la forma plana.

function normalizeTx(body) {
  if (!body || typeof body !== "object") throw new Error("MISSING_TRANSACTION")

  if (body.payload && typeof body.payload === "object") {
    if (typeof body.signature !== "string" || body.signature.length === 0) {
      throw new Error("MISSING_SIGNATURE")
    }
    return { ...body.payload, signature: body.signature }
  }

  if (!body.type) throw new Error("MISSING_TRANSACTION")

  return body
}

module.exports = { normalizeTx }
