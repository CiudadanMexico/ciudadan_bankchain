exports.info = (req, res) => {
  res.json({
    success: true,
    data: {
      address: req.nodeWallet.address,
      publicKey: req.nodeWallet.publicKey
    }
  })
}

exports.mintTest = (req, res) => {
  try {
    const { address, amount, token } = req.body

    req.blockchain.mint(address, amount, token || "LABORY")

    res.json({
      success: true,
      balance: req.blockchain.getBalance(address, token || "LABORY")
    })

  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    })
  }
}
