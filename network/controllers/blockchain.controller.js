exports.getChain = (req, res) => {
  res.json({
    success: true,
    data: req.blockchain.chain
  })
}

exports.getMempool = (req, res) => {
  res.json({
    success: true,
    data: req.blockchain.mempool
  })
}

exports.mine = (req, res) => {
  try {
    const block = req.blockchain.mineBlock()

    res.json({
      success: true,
      data: block
    })
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    })
  }
}

exports.applyExternalBlock = (req, res) => {
  try {
    req.blockchain.applyExternalBlock(req.body)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    })
  }
}
