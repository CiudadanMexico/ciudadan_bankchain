const { verifySignature, deriveAddress } = require("../../core/crypto")
const { parseAmount, assertToken, assertAddress } = require("../../core/amounts")
const { normalizeTx } = require("../../core/txFormat")

exports.send = (req, res) => {
  req.blockchain.addTransaction(req.tx)

  res.json({
    success: true,
    data: "Transaction added to mempool"
  })
}

exports.verify = (req, res) => {
  let tx
  try {
    tx = normalizeTx(req.body)
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message })
  }

  const checks = {
    formatValid: false,
    signatureValid: false,
    addressMatches: false,
    nonceValid: false,
    sufficientBalance: false
  }

  try {
    if (!tx || typeof tx !== "object") throw new Error("MISSING_TRANSACTION")
    if (tx.type !== "transfer") throw new Error("INVALID_TX_TYPE")

    assertAddress(tx.from)
    assertAddress(tx.to)
    const amount = parseAmount(tx.amount)
    const token = assertToken(tx.token)
    checks.formatValid = true

    checks.signatureValid = verifySignature(tx)
    checks.addressMatches = deriveAddress(tx.publicKey) === tx.from
    checks.nonceValid = tx.nonce === req.blockchain.getNonce(tx.from)
    checks.sufficientBalance = req.blockchain.getBalance(tx.from, token) >= amount
  } catch (err) {
    // cualquier campo faltante o monto inválido deja los checks en false
  }

  const valid = Object.values(checks).every(Boolean)

  res.json({
    success: true,
    data: {
      valid,
      checks
    }
  })
}
