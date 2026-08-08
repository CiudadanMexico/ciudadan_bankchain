const { verifySignature, deriveAddress } = require("../../core/crypto")
const { parseAmount, assertToken, assertAddress } = require("../../core/amounts")
const { normalizeTx } = require("../../core/txFormat")

function validateTx(req, res, next) {
  let tx
  try {
    tx = normalizeTx(req.body)
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message })
  }

  try {
    if (!tx || typeof tx !== "object") throw new Error("MISSING_TRANSACTION")
    if (tx.type !== "transfer") throw new Error("INVALID_TX_TYPE")

    assertAddress(tx.from)
    assertAddress(tx.to)
    const amount = parseAmount(tx.amount)
    const token = assertToken(tx.token)

    if (!verifySignature(tx)) throw new Error("INVALID_SIGNATURE")

    if (deriveAddress(tx.publicKey) !== tx.from) throw new Error("ADDRESS_MISMATCH")

    if (tx.nonce !== req.blockchain.getNonce(tx.from)) throw new Error("INVALID_NONCE")

    if (req.blockchain.getBalance(tx.from, token) < amount) throw new Error("INSUFFICIENT_BALANCE")

    req.tx = tx
    next()
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    })
  }
}

module.exports = validateTx
