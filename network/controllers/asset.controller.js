exports.getAssets = (req, res) => {
  const address = req.params.address

  if (!address) {
    const totals = {}
    for (const balances of Object.values(req.blockchain.balances)) {
      for (const [token, amount] of Object.entries(balances)) {
        totals[token] = (totals[token] || 0) + amount
      }
    }
    return res.json({
      success: true,
      data: { totals }
    })
  }

  res.json({
    success: true,
    data: req.blockchain.balances[address] || {}
  })
}
