const { logAction } = require("../middlewares/logger")
const { TREASURY_ADDRESS } = require("../../config/economic")

exports.health = (req, res) => {
  const bc = req.blockchain
  res.json({
    success: true,
    data: {
      status: "ok",
      mode: "single-node",
      node: bc.nodeAddress,
      blockIndex: bc.getLatestBlock().index,
      blocks: bc.chain.length,
      mempool: bc.mempool.length,
      treasury: bc.getBalance(TREASURY_ADDRESS),
      uptimeSec: Math.round((Date.now() - bc._startedAt) / 1000)
    }
  })
}

exports.audit = (req, res) => {
  try {
    const audit = req.blockchain.audit()
    res.json({ success: true, data: audit })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}

exports.getHistory = (req, res) => {
  try {
    const txs = req.blockchain.getTransactionHistory(req.params.address)
    res.json({ success: true, data: txs })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}

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
    logAction("mine", { index: block.index, txs: block.transactions.length })

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

exports.exportLedger = (req, res) => {
  try {
    const data = req.blockchain.exportLedger()
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}
