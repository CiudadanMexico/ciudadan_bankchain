exports.getBalance = (req, res) => {
  const { address, token } = req.params

  res.json({
    success: true,
    data: {
      address,
      token,
      balance: req.blockchain.getBalance(address, token)
    }
  })
}
