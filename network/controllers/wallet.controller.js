const { parseAmount, assertToken, assertAddress } = require("../../core/amounts")
const { logAction } = require("../middlewares/logger")

exports.info = (req, res) => {
  res.json({
    success: true,
    data: {
      address: req.nodeWallet.address,
      publicKey: req.nodeWallet.publicKey
    }
  })
}

exports.balance = (req, res) => {
  try {
    const { address, token } = req.params

    const a = assertAddress(address)
    const t = assertToken((token || "LABORY").toUpperCase())

    res.json({
      success: true,
      data: {
        address: a,
        token: t,
        balance: req.blockchain.getBalance(a, t),
        nonce: req.blockchain.getNonce(a)
      }
    })

  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    })
  }
}

exports.mintTest = (req, res) => {
  try {
    const { address, amount, token } = req.body

    const a = assertAddress(address)
    const n = parseAmount(amount)
    const t = assertToken(token || "LABORY")

    req.blockchain.mint(a, n, t)
    logAction("mint", { address: a, amount: n, token: t })

    res.json({
      success: true,
      balance: req.blockchain.getBalance(a, t)
    })

  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    })
  }
}
