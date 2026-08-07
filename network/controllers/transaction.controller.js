const { verifySignature, deriveAddress } = require("../../core/crypto")

exports.send = (req, res) => {
  req.blockchain.addTransaction(req.tx)

  res.json({
    success: true,
    data: "Transaction added to mempool"
  })
}

exports.verify = (req, res) => {
  const tx = req.body

  const checks = {
    signatureValid: false,
    addressMatches: false,
    nonceValid: false,
    sufficientBalance: false
  }

  try {
    checks.signatureValid = verifySignature(tx)
    checks.addressMatches = deriveAddress(tx.publicKey) === tx.from
    checks.nonceValid = tx.nonce === req.blockchain.getNonce(tx.from)
    checks.sufficientBalance = req.blockchain.getBalance(tx.from, tx.token) >= tx.amount
  } catch (err) {
    // cualquier campo faltante deja los checks en false
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
