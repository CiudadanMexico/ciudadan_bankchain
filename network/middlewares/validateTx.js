const { verifySignature, deriveAddress } = require("../../core/crypto")

function validateTx(req, res, next) {
  const tx = req.body

  try {
    if (!tx || typeof tx !== "object") throw new Error("MISSING_TRANSACTION")

    if (!verifySignature(tx)) throw new Error("INVALID_SIGNATURE")

    if (deriveAddress(tx.publicKey) !== tx.from) throw new Error("ADDRESS_MISMATCH")

    if (tx.nonce !== req.blockchain.getNonce(tx.from)) throw new Error("INVALID_NONCE")

    if (req.blockchain.getBalance(tx.from, tx.token) < tx.amount) throw new Error("INSUFFICIENT_BALANCE")

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
